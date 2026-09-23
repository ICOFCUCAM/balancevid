#
# BalanceVid, as one image.  [Doctrine U-23, D-14]
#
# The image can run as the web tier, as the worker, or as both. They are
# separate PROCESSES in every case — U-23's rule is that the web tier never
# invokes ffmpeg, and that holds whether the worker is beside it or on another
# machine. Running both in one container is the small deployment; splitting
# them is a ROLE change and no code change.
#
#   docker build -t balancevid .
#   docker run -p 3000:3000 -v balancevid-data:/data balancevid
#
# Build arguments:
#   WITH_MODELS=1   bake the speech models into the image instead of fetching
#                   them onto the volume on first boot. Off by default: the
#                   models are identical in every deployment and a host that
#                   keeps images for rollback would store them once per deploy
#   WITH_BROWSER=0  skip Chromium (no web-page evidence archiving)

ARG NODE=node:22-bookworm-slim

# ---------------------------------------------------------------- dependencies
FROM ${NODE} AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ----------------------------------------------------------------------- build
FROM ${NODE} AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------------------------------------------------------------------- models
# Their own layer: 320 MB that change when the engine changes and never when
# the code does. Fetched by the same script a developer runs, so the URLs have
# one home (D-14).
FROM debian:bookworm-slim AS models
ARG WITH_MODELS=0
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates bzip2 \
    && rm -rf /var/lib/apt/lists/*
COPY scripts/fetch-models.sh /tmp/fetch-models.sh
ENV BALANCEVID_MODELS=/models BALANCEVID_SKIP_PYTHON=1
RUN mkdir -p /models && if [ "$WITH_MODELS" = "1" ]; then \
      bash /tmp/fetch-models.sh; \
    else \
      echo "models skipped at build time"; \
    fi

# --------------------------------------------------------------------- runtime
FROM ${NODE} AS runtime
ARG WITH_BROWSER=1

# python3 for the offline transcriber; tini so signals reach both processes and
# ffmpeg children are not orphaned on a redeploy.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    BALANCEVID_VAR=/data \
    BALANCEVID_MODELS=/data/models \
    BALANCEVID_PYTHON=/opt/venv/bin/python \
    PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Runtime dependencies only. tsx is one of them: the worker runs the
# TypeScript sources directly.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev \
    # ffprobe-static ships macOS and Windows binaries too — 230 MB this image
    # will never execute.
    && rm -rf node_modules/ffprobe-static/bin/darwin \
              node_modules/ffprobe-static/bin/win32 \
    && npm cache clean --force

# The offline speech engine.
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --quiet sherpa-onnx numpy

# Chromium, for archiving a cited page at the moment it is attached (U-33).
# The INSTALLED playwright, not a pinned copy of it. package.json allows a
# range, so a hard-pinned `npx playwright@x.y.z` here would eventually fetch a
# browser build the installed library does not look for — and evidence
# archiving would fail at runtime with the browser sitting right there.
RUN if [ "$WITH_BROWSER" = "1" ]; then \
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0 ./node_modules/.bin/playwright install --with-deps chromium \
      && rm -rf /var/lib/apt/lists/*; \
    else \
      echo "browser skipped: web-page evidence will record an archive error"; \
    fi

# Empty unless WITH_MODELS=1. Otherwise serve.sh fetches them onto the volume
# on first boot, where they are stored once rather than once per deployment.
COPY --from=models /models /models
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.mjs ./next.config.mjs
# The worker runs from source, so the TypeScript comes with it.
COPY --from=build /app/src ./src
COPY --from=build /app/app ./app
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/tsconfig.json ./tsconfig.json

# The volume. Everything a user made lives here and nothing else does.
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["./scripts/serve.sh"]
