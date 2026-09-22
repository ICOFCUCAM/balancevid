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
./scripts/fetch-models.sh   # local speech recognition, ~320 MB, once
npm run build
npm start                   # web tier      → http://localhost:3000
npm run worker              # worker        (separate process — see U-23)
```

Transcription runs locally. A product whose users record unpublished opinions
should not have to ship every take to a third party to get a transcript (D-03),
and the engine sits behind one interface (D-14) so a cloud service can replace
it without anything upstream changing. Skip the model fetch and everything
still works — sources simply arrive without a transcript.

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
| Transcription | local, word-level timing, VAD-segmented; source and takes |
| Transcript panel | follows playback, click to seek, respond to a sentence |
| Claims | selecting a statement binds it to the intervention, hash-checked |
| Captions | both speakers, labelled, burned in and as `.srt` / `.vtt` |
| Studio Mode | trim, audition takes, re-record, move a point, retype, delete |
| Article | every conversation also renders as a citable document (U-14) |
| Representations | one registry, regenerated on demand, never stored (D-16) |
| Worker | durable queue, real progress, resumable via the shot cache |

### Representations

`INV-00` says the Conversation is canonical and everything else is a rendering
of it. `src/representations/registry.ts` makes that testable: each
representation declares a pure generator, the parts of the Conversation it
reads, and rebuilds from scratch. CI regenerates every one and compares them
byte for byte — a representation that cannot survive deletion is a fork.

```
GET /api/conversations/<id>/representations           what this can produce
GET /api/conversations/<id>/representations?id=…      article.md · article.json
                                                      article.html · captions.srt
                                                      captions.vtt · timeline.json
                                                      render-plan.json
GET /c/<id>/article                                   the article, as a page
```

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

- **Transcription is English-only and unpunctuated.** The local zipformer
  emits upper-case words with no punctuation, so sentence boundaries are
  inferred from silence rather than read off the text, and captions are
  presented in sentence case. The engine is recorded on every transcript
  (`characteristics`) so nothing downstream pretends to a precision it does not
  have. Other languages mean registering another engine.
- **No speaker diarisation.** §5 wants speaker segmentation where possible;
  the source is currently treated as one speaker.
- **Research and claim detection** (§20, §43, §45) are not built. The transcript
  they need now exists.
- **Class B / YouTube.** Out of MVP scope by U-36. `INV-01` already refuses a
  composed plan for a Class B source; the Conversation Manifest is not built.
- **Annotations, freeze-frame capture, evidence.** v2.
- **Reordering commentary** (§26) beyond moving an anchor, and dragging
  timeline boundaries (§18) — the band is read-only.
- **Vertical clips and the publication bundle.** v2.
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
