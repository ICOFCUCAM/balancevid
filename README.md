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
npm test           # 308 tests, including real renders through real ffmpeg
npm run typecheck
```

### Signing in

One owner, one password. Generate a hash and set it in the environment:

```bash
npm run passwd                    # prompts, hidden; prints the hash
```

```
BALANCEVID_PASSWORD_HASH='scrypt$16384$8$1$…'
```

**With nothing set, the instance serves nothing** — not even published
conversations, because an instance with no owner has not published anything on
purpose. Failing closed means the worst case is an outage.

What stays public is exactly what was published: a published conversation's
watch page, its article, its manifest and the media those need. Its render
plan, timeline and publication bundle do not — a publication grants access to
the artefact, not to the workshop. Withdrawing it closes the door again.

Changing the password re-derives the session key and signs every session out,
which is what to do if a session cookie leaks.

### Deploying it

```bash
docker build -t balancevid .
docker run -p 3000:3000 -v balancevid-data:/data balancevid
```

One image, two processes: the web tier and the worker, sharing a volume.
`fly.toml` is in the repository; `docs/DEPLOYMENT.md` covers the rest —
including why this cannot run on Vercel or any serverless host, which is
structural rather than a matter of configuration.

### End-to-end, in a real browser

```bash
npx tsx scripts/make-fixture.ts /tmp/bv          # a source whose frames carry their index
npx tsx scripts/e2e.mjs /tmp/bv/source.mp4       # 493 checks, driven with the spacebar
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
| Embedded sources | YouTube and Vimeo links, played through their own embed |
| Publishing | with consent: the author decides if it may be answered (U-31) |
| Response chains | a published conversation is itself a source; lineage kept |
| Conversation Manifest | the companion player: drives the source, cuts to you |
| Response reel | the Class B export — your material, no provider footage |
| Vertical clips | one per claim-and-response pair, ranked and proposed (U-22) |
| Annotations | vector, timed, drawn at render resolution; blur as a privacy tool |
| Evidence | archived on attach, located, timed, zoomed to in the render |
| Article | every conversation also renders as a citable document (U-14) |
| Publication bundle | description, chapters, titles and thumbnails, written from the document (U-30) |
| Suggested claims | the source's checkable statements, found locally, ranked, with reasons (§20) |
| The AI boundary | nothing suggested enters the document without a recorded human acceptance (U-15) |
| Authentication | one owner; published conversations stay readable by anyone (D-06, U-31) |
| Search | every mention, with a frame to jump to and answer from (§43, §16) |
| Two modes | Live is the loop and nothing else; Studio is where it is taken apart |
| The claim card | choosing a sentence becomes SOURCE STATEMENT → YOUR RESPONSE |
| Conversation timeline | each response shows a still of itself, hung from the moment it answers |
| Moving a response | drag it along the timeline; a quoted statement is dropped, not mis-cited |
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
                                                      captions.vtt · manifest.json
                                                      timeline.json · render-plan.json
                                                      bundle.json · description.txt
                                                      chapters.txt
GET /c/<id>/article                                   the article, as a page
GET /c/<id>/watch                                     the companion player
GET /api/conversations/<id>/bundle                    everything needed to publish
GET /api/conversations/<id>/bundle?thumbnail=…        one rendered candidate
```

### Nothing to retype at the end

The export queues its own thumbnail candidates and the bundle is written from
the document: the chapters are the author's own cuts on the output clock, the
suggested titles are claims they bound, the description carries the generated
attribution block (INV-07). Nothing is invented — a thumbnail may only promise
what the video contains, so a frame candidate is an unretouched frame of the
video, grabbed on **exactly** the frame the author stopped at, and a quote card
sets a sentence that was actually said.

Chapters shorter than ten seconds are merged rather than emitted: platforms
silently ignore a list that breaks their rules, and a list that is ignored is
worse than none. Where no acceptable list can be made, the bundle says so in
words instead of handing over something that will not work.

### The knowledge layer

```
source transcript -> suggested claim -> the author accepts, edits or rejects
  -> the bound response -> its evidence -> the Conversation Document
```

Every arrow but the first is a human decision, and the first produces nothing
anyone can publish. `U-15` says AI may surface claims and may not put words in
the author's mouth; `src/domain/suggestions.ts` is that sentence as code.

The enforcement is structural rather than procedural. Suggestions are derived
from the transcript and **never stored** — only the author's decisions are
document state (INV-00). So an unaccepted suggestion cannot reach the article,
the bundle, the manifest or a render, not because every writer remembers to
filter it, but because it was never in the document to filter. What *is* stored
carries the four fields `INV-06` requires: the model, its version, the prompt
hash, and the human who accepted it.

The forbidden list is expressed in the types. The suggestion payload union has
no variant for recorded speech, none for narration, none for a verdict — U-15's
"may not" is not a check that can be forgotten but a shape that cannot be
written. Binding a claim verifies it is still verbatim in the transcript, so an
author may *narrow* a quote and may not paraphrase one: a sentence the source
never said misquotes a real person, whoever typed it.

The first detector is local and deterministic — no model, no network, no cloud
dependency for the thing an author does first. It finds the shapes a checkable
statement takes (a figure, an absolute, a cause, an appeal to a source) and
says which one it found, so the author judges the suggestion instead of
trusting it. It is registered behind `ClaimDetector`, the same way transcribers
are, so a language model can replace it without the acceptance machinery
changing. It does not understand the video, it cannot tell you whether a claim
is true, and it says both in the panel.

```
GET  /api/conversations/<id>/claims      suggestions + the author's decisions
POST /api/conversations/<id>/claims      accept · edit · reject  (records who)
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
- **Retrieval-grounded research** (§43, §45, U-34) is not built. The boundary it
  must enter through is: a research result becomes an `evidence` suggestion
  carrying a fetched source, and U-34's rule that an ungrounded assertion is
  *not returned at all* is already enforced in `groundedOnly`. Claim detection
  (§20) is built and local.
- **Vimeo authoring.** A Vimeo link creates a Class B conversation and the
  manifest drives its embed, but the Studio's one-key loop is wired to
  YouTube's player API only; Vimeo's needs its own adapter.
- **Publishing is local.** A conversation can be published *within this
  instance* — which is what makes it answerable — but nothing is pushed to any
  external platform. Exports download; the manifest and the watch page are
  same-origin.
- **Paged documents as evidence.** PDFs are stored, hashed and cited, but this
  build has no rasteriser, so they carry no visual capture and the render has
  nothing to show for them. Images and web pages do.
- **Dragging timeline boundaries** (§18) — the output band is read-only.
  Responses can be moved along the source timeline; the finished-video band
  cannot be edited directly.
- **Face-aware vertical framing** (U-22 §3) — clips reflow by layout, but the
  crop is not face-tracked.
- **Marks alongside evidence.** A point can carry both, but no layout shows a
  frame and a document at once, so where both exist the evidence takes the
  panel and the marks are not drawn. The Studio says so rather than dropping
  them silently.
- **Pre-flight capture check** (U-26 §2) and device-change detection.
- **A/V sync golden test** (D-10) — frame-exactness, loudness and cache are
  covered; the clap-and-flash drift test is not.
- **Speaker-switching layout** (U-18) — the scene graph supports it; the voice
  activity detection is not written.
- **One owner, not tenancy.** There is a password, not accounts. D-06 wants
  tenant isolation enforced at the data layer; this is a door on the building,
  which is the difference between a private instance and a public one and not
  the same thing as separating two users' recordings.
- **Responding requires signing in.** U-31 says anyone can open a published
  conversation *and respond to it*. The first half holds. The second waits for
  accounts, because an anonymous response is an anonymous write — recorded in
  Appendix B.
- **Not production infrastructure.** Single machine, filesystem storage, no
  quotas, no render-cost metering (D-11). It containerises and deploys to any
  Docker host with a volume (`docs/DEPLOYMENT.md`), and that is as far as it
  goes.
- **Storage is not yet swappable.** `src/store/` is where everything lives,
  but four API routes still reach for `node:fs` directly, so replacing the
  filesystem with object storage means routing those through the store
  first — a prerequisite for running the web tier and the worker on
  separate machines.

---

## Layout

```
docs/DOCTRINE.md    the constitution
docs/ROOM.md        the Conversation Room brief, and what building it taught
docs/STUDIO-TWO.md  the Performance Studio brief, and what building it taught
src/domain/         the Conversation and its projections — pure, no I/O
src/render/         ffmpeg: ingest, compositor, subtitles — worker only
src/store/          document, chunks, queue — split so the web tier
                    cannot import anything that reaches ffmpeg
src/worker/         the only process permitted to run ffmpeg
src/knowledge/      claim detection, behind a swappable detector interface
src/search/         research mode: find a moment, jump to it, answer it
src/auth/           one owner; the wall around what is not published
src/publish/        the publication bundle
app/                Next.js web tier: API routes and the Studio
test/               domain invariants + a real render, decoded and checked
scripts/            fixture generation and the browser end-to-end run
```
