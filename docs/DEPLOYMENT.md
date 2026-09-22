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
| `ROLE` | `all` | `web`, `worker`, or `all` |
| `PORT` | `3000` | |
| `BALANCEVID_VAR` | `/data` | The volume. Everything a user made. |
| `BALANCEVID_MODELS` | `/models` | Baked into the image, not the volume: models are versioned with the code, conversations are not. |
| `BALANCEVID_PYTHON` | `/opt/venv/bin/python` | The offline transcriber. |
| `BALANCEVID_CHROMIUM` | *(unset)* | Only needed if Playwright's own resolution fails. |

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

## What is not addressed here

The README's "not built yet" list applies to deployment too, and two entries
matter before this is exposed to people who are not you:

- **No authentication, no tenancy, no quotas.** Anyone who can reach the
  instance can read and modify every conversation on it. Put it behind your
  own access control, or keep it private.
- **No object storage.** One machine holds everything, so the volume is the
  single point of failure. Back it up.

## Splitting the tiers

When one machine stops being enough, the same image splits without a code
change: run one service with `ROLE=web` and another with `ROLE=worker`. They
must share `/data`, which on most hosts means a shared filesystem — and that
is the point at which replacing the store with object storage (S3, R2, Blob)
and the file queue with a hosted one stops being optional.

The interfaces for that already exist: `src/store/paths.ts` centralises where
things live, `src/store/queue.ts` is the only queue, and `src/store/repository.ts`
is the only writer of documents. Four API routes still reach for `node:fs`
directly and would need to go through the store first.
