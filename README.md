# BalanceVid

> A conversation editor for recorded media: interrupt a video at any moment,
> respond, resume exactly where it stopped, repeat throughout the source, and
> publish the resulting conversation as video, article, or interactive manifest.

Not a tool for making reaction videos. **A system for creating, editing,
publishing and preserving structured conversations around video.**

---

## Start here

**[`docs/DOCTRINE.md`](docs/DOCTRINE.md)** is the constitution of this product.
Read it before writing code. Every technical decision in this repository defers
to it, and each module cites the clause it implements.

It contains the charter (Part 0), the founding map in full — 52 sections,
unabridged (Part I) — 39 inline upgrades resolving what the map left open, 16
sections of cross-cutting doctrine (Part II), and an appendix recording what
building it taught the document.

### The master invariant

> **INV-00 — The Conversation is the canonical artifact. Every video, article,
> manifest, caption track, and export is a representation of it.**

```
                 CONVERSATION
                      │
          ┌───────────┴───────────┐
     MEDIA TIMELINE          KNOWLEDGE LAYER
          ▼                       ▼
     VIDEO RENDER             ARTICLE
```

Build the Conversation once, then render representations of it.

---

## The interaction

**The spacebar is the product.**

```
video playing   →  SPACE  →  pause, stamp the frame, start recording
recording       →  SPACE  →  stop, resume the source from the same frame
```

An 8-second buffer runs continuously, so pressing late never clips the first
words of a response. The user never leaves the video.

---

## Running it

Requires Node 22+. ffmpeg ships with the dependencies — nothing to install.

```bash
npm install
npm run build
npm start          # web tier        → http://localhost:3000
npm run worker     # render worker   (separate process — see U-23)
```

The web tier never invokes ffmpeg. Source normalisation, take assembly and
rendering are all queued to the worker, so one long export cannot make the
application unusable for everyone else.

```bash
npm test           # 32 tests, including a real render through real ffmpeg
npm run typecheck
```

### End-to-end, in a real browser

```bash
npx tsx scripts/make-fixture.ts /tmp/bv          # a source whose frames carry their index
node scripts/e2e.mjs /tmp/bv/source.mp4          # drives the product with only the spacebar
```

Chrome's fake media device stands in for a camera, so this exercises the actual
capture path — getUserMedia, rolling pre-roll segments, chunked upload, take
assembly, render — not a mock of it.

---

## What works today

| | |
|---|---|
| Class A sources | upload, rights attestation recorded, normalised to the house format |
| Ingest | CFR 30, closed GOP, keyframe every second, AAC 48k stereo, rotation baked in |
| Editing proxy | VP8/Opus, frame-parity with the mezzanine asserted at ingest (INV-13) |
| One-key loop | spacebar interrupt → record → spacebar continue → frame-exact resume |
| Pre-roll | 8s rolling buffer, kept and measured, default trim reversible |
| Crash safety | takes stream to disk as self-contained segments while recording |
| Timeline | two clocks, derived not stored, invariants asserted on every read |
| Render plan | versioned, content-addressed per shot, deterministic |
| Compositor | type-driven layouts, freeze-frame, lower-thirds, attribution |
| Audio | per-speaker loudness match, de-click, two-pass EBU R128 master |
| Export | 1920×1080 H.264/AAC MP4, byte-range seekable, caption sidecars |
| Worker | durable queue, real progress, resumable via the shot cache |

### Verified, not asserted

`test/render/frame-exact.test.ts` renders a real MP4 from a source whose every
frame is a solid colour encoding its own index, decodes the output, and checks
that **all 600 source frames appear exactly once and in order** around three
interruptions — and that at every anchor the last frame before the response is
the anchor minus one and the first frame after it is the anchor itself.

Cut out and resume on the same frame. Measured, every build.

---

## What is not built yet

Stated plainly, because a status table that overstates is worse than none.

- **No transcription.** No ASR is wired, so there are no caption cues. The
  caption pipeline exists and ships `.srt`/`.vtt` sidecars with every export
  (INV-07), but they are currently empty. Lower-thirds and the attribution
  block do render. Everything the map builds on the transcript — sentence
  selection (§11), claim highlighting (§12), transcript sync (§16), research
  (§43) — waits on this.
- **Class B / YouTube.** Out of MVP scope by U-36. `INV-01` already refuses a
  composed plan for a Class B source; the Conversation Manifest is not built.
- **Studio Mode.** The document supports takes, trims and overrides, and the
  delete endpoint exists; the editing UI does not.
- **Annotations, freeze-frame capture, evidence.** v2.
- **Vertical clips, the article transcript, publication bundle.** v2.
- **Pre-flight capture check** (U-26 §2) and device-change detection.
- **A/V sync golden test** (D-10) — frame-exactness, loudness and cache are
  covered; the clap-and-flash drift test is not.
- **Speaker-switching layout** (U-18) — the scene graph supports it; the voice
  activity detection is not written.
- **Not production infrastructure.** Single machine, filesystem storage, no
  authentication, no tenancy, no quotas. The storage layer is a filesystem
  adapter behind one module so object storage can replace it.

---

## Layout

```
docs/DOCTRINE.md    the constitution
src/domain/         the Conversation and its projections — pure, no I/O
src/render/         ffmpeg: ingest, compositor, subtitles — worker only
src/store/          document, chunks, queue — split so the web tier
                    cannot import anything that reaches ffmpeg
src/worker/         the only process permitted to run ffmpeg
app/                Next.js web tier: API routes and the Studio
test/               domain invariants + a real render, decoded and checked
scripts/            fixture generation and the browser end-to-end run
```
