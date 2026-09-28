# Deploying BalanceVid

The application is a **web tier and a worker sharing a filesystem**. That shape
comes from the doctrine, not from convenience: U-23 says the web tier never
invokes ffmpeg and never blocks on a render, so composition happens in a
separate long-running process that claims jobs from a durable queue.

Everything below follows from that.

## Why not Vercel (or any serverless host)

The Next.js tier would deploy there happily. The rest of the application
cannot, and the reasons are structural rather than configuration:

| What the application needs | What serverless gives |
|---|---|
| A process that polls a queue and runs ffmpeg for minutes to tens of minutes per export | Functions with a duration cap, no long-running processes |
| A persistent filesystem: sources, mezzanines, proxies, takes, renders, transcripts, evidence captures, thumbnails | Ephemeral, read-only outside a small temp directory |
| A queue claimed by atomic rename on shared storage (`src/store/queue.ts`) | No filesystem shared between invocations |
| ~320 MB of local speech models and a Python transcriber | Not deployable in a function bundle |
| Chromium, to archive a cited page when it is attached (U-33) | Not available |

Running the web tier on a serverless host is possible, but only *after* the
storage layer is replaced with object storage and the queue with a hosted one,
and the worker is hosted somewhere that can run ffmpeg regardless. That is real
work — see **Splitting the tiers** at the end.

Until then, deploy the whole thing to one container host.

## One container, one volume

```bash
docker build -t balancevid .
docker volume create balancevid-data
docker run -d --name balancevid \
  -p 3000:3000 \
  -v balancevid-data:/data \
  balancevid
```

Then `curl localhost:3000/api/health`.

The image runs the web tier and the worker as separate processes. They are
separate processes in every deployment — U-23's rule holds whether the worker
is beside the web tier or on another machine.

### Build arguments

| Argument | Default | Effect when `0` |
|---|---|---|
| `WITH_MODELS` | `1` | No speech models (~320 MB smaller). Sources are never transcribed, so no captions, claim cards, article transcript or suggested claims. The core loop still works. |
| `WITH_BROWSER` | `1` | No Chromium. Attaching a web page as evidence records an archive error instead of a capture; uploaded images and PDFs are unaffected. |

Both degrade the product honestly rather than failing silently — a missing
transcript is a degraded conversation, not a broken one.

### Environment

| Variable | Default in the image | What it is |
|---|---|---|
| `ROLE` | `all` | `web`, `worker`, `playout`, or `all` |
| `PORT` | `3000` | |
| `BALANCEVID_VAR` | `/data` | The volume. Everything a user made. |
| `BALANCEVID_MODELS` | `/models` | Baked into the image, not the volume: models are versioned with the code, conversations are not. |
| `BALANCEVID_PYTHON` | `/opt/venv/bin/python` | The offline transcriber. |
| `BALANCEVID_CHROMIUM` | *(unset)* | Only needed if Playwright's own resolution fails. |
| `BALANCEVID_PASSWORD_HASH` | *(unset)* | **Required.** The owner's password, hashed by `npm run passwd`. With nothing set the instance serves nothing. |
| `BALANCEVID_PASSWORD` | *(unset)* | Plaintext alternative, hashed at boot. For a first run; prefer the hash. |
| `BALANCEVID_SESSION_HOURS` | `336` | How long a session lasts. |
| `STREAM_QUALITY` | `standard` | What Online TV transmits: `low`, `standard` (720p), `high` (1080p) or `maximum` (1080p60). One answer for the whole deployment, read once at start — see below. |

### Broadcast quality

Two different questions, deliberately answered in two different places.

**What a channel transmits** is `STREAM_QUALITY`, above. It is set for the
deployment rather than per channel because every segment on the wire must
carry identical codec parameters — a stream whose resolution changed at a
programme boundary is a stream every player stalls on — and because the
playout engine encodes in real time, so it is the machine's ffmpeg budget
being spent and the viewers' bandwidth. It is read once when the engine
starts; changing it means restarting the engine.

**What a broadcaster sends up** is chosen in the control room, on the Camera
tab, and stored in that browser. It is a statement about the camera in the
room and the building's uplink, so the same channel broadcast from a studio
and from a hotel gets two different answers. One preset moves the camera
request, the mixing canvas and the encoder ceiling together; raising any one
of them alone does nothing, because the encoder records the canvas and never
sees the camera.

Sending up more than the channel transmits is not waste. The ingest file is
what gets promoted into the archive when a live session is kept (INV-17), so
recording at 1080p while transmitting at 720p is the ordinary practice of
keeping the good copy.

## Fly.io

`fly.toml` is in the repository.

```bash
fly launch --no-deploy --copy-config
fly volumes create balancevid_data --size 50
fly deploy
```

Two settings there are load-bearing:

**`auto_stop_machines = false`.** Scale-to-zero is Fly's default and it is
wrong here. The worker is a queue poller, not a request handler; a machine
stopped for having no HTTP traffic stops rendering too, and an export queued
just before it idles out sits untouched until someone loads a page.

**`kill_timeout = "300s"`.** A render runs for minutes. The default gives it
seconds. An interrupted job is re-claimable and the shot cache (U-16) makes the
re-run resume rather than restart, so nothing is lost either way — but
finishing the pass is cheaper than repeating it.

## Railway, Render, or any Docker host

The same image, with three requirements:

1. **A persistent volume mounted at `/data`.** Without one the application
   appears to work and loses every recording on the next deploy.
2. **No scale-to-zero**, for the reason above.
3. **A generous stop timeout**, for the reason above.

Point the health check at `/api/health`. It reports whether storage is
writable and how deep the queue is — a pending count that only grows is the
symptom of a worker that has died behind a web tier that looks fine.

## Sizing

Rendering is the workload and it is CPU-bound. Two dedicated cores and 4 GB is
a reasonable starting point; one shared core will work and will feel slow.

Storage is the cost that surprises people. Each Class A source is kept as an
original, a normalised mezzanine and an editing proxy; each take as a
mezzanine and a proxy; each export and each cached shot as its own file. Budget
several GB per hour-long conversation, and note that **render-cost metering
(D-11) is not built** — nothing currently meters or caps what a user can
consume.

### The image, and the host disk it lands on

The volume is not the only thing that needs room. Most hosts keep one image
per deployment so a release can be rolled back, and this image is not small:

| Part | Approx. | Why |
|---|---|---|
| Chromium and its system libraries | 0.6–1 GB | archiving a cited page (U-33) |
| `node_modules` (production only) | ~1 GB | ffmpeg, pdf.js, playwright, tsx |
| Python, sherpa-onnx, numpy | ~0.4 GB | offline transcription |
| node, the app, `.next` | ~0.5 GB | |

**Layers are shared between deployments when they do not change**, so a
code-only deploy should add a few hundred megabytes rather than another copy
of all of it. That only holds if nothing near the end of the Dockerfile
rewrites files from earlier layers — `chown -R` over `/app` is the classic
way to lose it, and the comment on the last `RUN` in the runtime stage
explains what it cost when it was there. A dependency change is genuinely
expensive: it reinstalls the packages and re-downloads the browser.

Budget for production, plus however many rollback images the host keeps, plus
one build in flight. `WITH_BROWSER=0` removes the largest single part if the
disk is tight and web-page evidence is not wanted.

## Before it is reachable from the internet

**Set `BALANCEVID_PASSWORD_HASH`.** Without it the instance is locked and
serves nothing but its health check and a page explaining what to set. That is
deliberate — an auth system whose misconfiguration state is "everyone gets in"
is not one — but it does mean a deploy without the variable is a deploy that
answers nothing.

```bash
npm run passwd        # prints the line to set
```

Published conversations stay readable without signing in, which is what
publishing is for. Everything else — drafts, takes, unpublished renders, and
the list that would reveal they exist — needs the session.

Still not addressed:

- **One owner, not tenancy.** D-06 wants tenant isolation at the data layer.
  This is a door on the building. Two people sharing an instance share
  everything on it.
- **No object storage.** One machine holds everything, so the volume is the
  single point of failure. Back it up.
- **No quotas or render-cost metering** (D-11). Nothing caps what a signed-in
  user can consume.

### The three processes

| Role | What it does | Needed for |
|---|---|---|
| `web` | serves the application | everything |
| `worker` | ffmpeg, transcription, rendering, rasterising decks | recording, exporting, slides |
| `playout` | the broadcast encoder: writes the channel's segments | **Online TV transmitting at all** |

`ROLE=all` runs all three, and that is the default.

**Without `playout`, Online TV does not transmit.** The control room is
correct, the schedule resolves and the playlist names its segments — and
nothing writes them, so every segment answers 404 and a viewer's player
never starts. The channel's own health lamp says so (CHANNEL §18), which is
the only reason it is visible at all.

It is cheap where it is idle: a pass over an instance with no channels makes
no segments and sleeps. Where a channel *is* scheduled, it costs the
encoding that channel asked for by being scheduled.

## Splitting the tiers

When one machine stops being enough, the same image splits without a code
change: run one service with `ROLE=web`, another with `ROLE=worker` and a
third with `ROLE=playout`. They must share `/data`, which on most hosts means
a shared filesystem — and that is the point at which replacing the store with
object storage (S3, R2, Blob) and the file queue with a hosted one stops
being optional.

Only one machine may run `playout` for a given channel: the engine assumes it
is the sole writer of that channel's stream directory. It holds no state of
its own, so moving it is a restart rather than a migration.

The interfaces for that already exist: `src/store/paths.ts` centralises where
things live, `src/store/queue.ts` is the only queue, and `src/store/repository.ts`
is the only writer of documents. Four API routes still reach for `node:fs`
directly and would need to go through the store first.
