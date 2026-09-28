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
#   WITH_BROWSER=0  skip Chromium (no web-page evidence archiving, and no
#                   pages from a PDF — pdf.js renders them in that browser)
#   WITH_OFFICE=1   add LibreOffice, so PowerPoint and Word attachments can be
#                   taught from. Off by default: it is a few hundred megabytes
#                   and a PDF export needs none of it. Without it a deck is
#                   still stored, hashed and cited — it just says to export it
#                   as a PDF to put its pages on screen

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
ARG WITH_OFFICE=0

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

# ---- what does NOT depend on the lockfile goes first ------------------
#
# A Docker layer is invalidated by the layer above it, so ORDER IS COST. Put
# `COPY package.json` early and every heavy install below it rebuilds when a
# single dependency changes — which is how adding one 1 MB library turned a
# deploy into a thirty-two minute cold build that re-downloaded a browser and
# recompiled a speech engine it had not touched.
#
# So the rule here: a step is placed by WHAT INVALIDATES IT, not by where it
# reads well. Everything that cannot possibly care about package-lock.json
# sits above the copy of it.

# The offline speech engine. Nothing to do with node_modules, and several
# hundred megabytes of wheels, so it is cached until python itself changes.
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --quiet sherpa-onnx numpy

# LibreOffice, for turning a deck or a document into pages (U-33 §2).
# Optional, and the code asks whether it is here rather than assuming: a build
# without it tells the author to export a PDF instead of accepting slides and
# quietly producing nothing.
RUN if [ "$WITH_OFFICE" = "1" ]; then \
      apt-get update && apt-get install -y --no-install-recommends \
        libreoffice-impress libreoffice-writer \
      && rm -rf /var/lib/apt/lists/*; \
    else \
      echo "office converter skipped: attach PowerPoint as PDF to show its pages"; \
    fi

# ---- and what does depend on it goes after ----------------------------

# Runtime dependencies only. tsx is one of them: the worker runs the
# TypeScript sources directly.
#
# OWNERSHIP IS SET AS THE FILES ARE WRITTEN, here and in every COPY below.
# See the note on the last RUN in this stage: changing it afterwards is what
# used to cost 1.4 GB a deploy.
COPY --chown=node:node package.json package-lock.json* ./
RUN npm ci --omit=dev \
    # ffprobe-static ships macOS and Windows binaries too — 230 MB this image
    # will never execute.
    && rm -rf node_modules/ffprobe-static/bin/darwin \
              node_modules/ffprobe-static/bin/win32 \
    && npm cache clean --force \
    # In THIS layer, not a later one. These files were created by the line
    # above, so chowning them here rewrites metadata on a diff that is being
    # assembled anyway; a `chown` in a separate RUN would copy every one of
    # them into a new layer instead.
    && chown -R node:node node_modules

# Chromium, for archiving a cited page at the moment it is attached (U-33).
# The INSTALLED playwright, not a pinned copy of it. package.json allows a
# range, so a hard-pinned `npx playwright@x.y.z` here would eventually fetch a
# browser build the installed library does not look for — and evidence
# archiving would fail at runtime with the browser sitting right there.
#
# THIS ONE CANNOT BE HOISTED, and the paragraph above is why: it runs the
# playwright that `npm ci` just installed, so it is downstream of the
# lockfile by necessity rather than by accident. A dependency change still
# re-downloads the browser. Fixing that would mean pinning a version here and
# accepting the drift this comment exists to prevent, which is the wrong
# trade — a slow build costs minutes, a browser the library will not look for
# costs a feature that fails silently in production.
RUN if [ "$WITH_BROWSER" = "1" ]; then \
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0 ./node_modules/.bin/playwright install --with-deps chromium \
      && rm -rf /var/lib/apt/lists/*; \
    else \
      echo "browser skipped: web-page evidence will record an archive error"; \
    fi


# Empty unless WITH_MODELS=1. Otherwise serve.sh fetches them onto the volume
# on first boot, where they are stored once rather than once per deployment.
# Read-only at runtime and outside /app, so it stays root's.
COPY --from=models /models /models

# `.next` is the one thing under /app the server writes to — Next keeps its
# cache there — so it is node's, like the rest of the application tree.
COPY --chown=node:node --from=build /app/.next ./.next
COPY --chown=node:node --from=build /app/public ./public
COPY --chown=node:node --from=build /app/next.config.mjs ./next.config.mjs
# The worker runs from source, so the TypeScript comes with it.
COPY --chown=node:node --from=build /app/src ./src
COPY --chown=node:node --from=build /app/app ./app
COPY --chown=node:node --from=build /app/scripts ./scripts
COPY --chown=node:node --from=build /app/tsconfig.json ./tsconfig.json

# The volume. Everything a user made lives here and nothing else does.
#
# ONE DIRECTORY, NOT A TREE, and this line used to be the single most
# expensive thing in the image. It read:
#
#     RUN mkdir -p /data && chown -R node:node /data /app
#
# A layer stores whatever the filesystem diff contains, and changing a file's
# owner counts as changing the file. Recursing over /app therefore copied
# node_modules, .next and the sources — about 1.4 GB — into a brand new layer
# on top of the ones that already held them. The build log showed it plainly:
# `[runtime 17/17] ... 21.4s` for a command that creates one directory.
#
# Worse, being last meant it was rebuilt by every deploy, so a one-line code
# change still wrote 1.4 GB of duplicated files to the host. That is how a
# disk fills up without anybody deploying anything large.
#
# Now ownership is set by the COPY that writes each file, and this does the
# only thing left: the two directories themselves, non-recursively. `/app`
# is included because WORKDIR made it root's before anything was copied in,
# and one directory entry is not 1.4 GB.
RUN mkdir -p /data && chown node:node /data /app
VOLUME ["/data"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["./scripts/serve.sh"]
