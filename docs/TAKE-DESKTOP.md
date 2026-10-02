# Take Desktop — the brief, what already exists, and the stages

> *"Phone Take = personal participation. Desktop Take = multi-camera
> capture station."*

This is the working map for Take Desktop. It is written to be
**executed one stage at a time without any of it being dropped**, so
nothing here is summarised away: the brief is kept in the author's
own words, every claim about the existing system names the file it
was read from, and every stage states what it adds, what it
upgrades, and what it must not touch.

The order of the parts is the order the work was done in: read the
brief, measure the system, measure the browser, then decide.

---

# PART ONE — The brief, as given

## The distinction

> *"I think this is a very natural second form of Take. The important
> distinction is: Phone Take = personal participation. Desktop Take =
> multi-camera capture station."*
>
> *"It should still be Take, use the same participation/request
> system, and submit into the same BalanceVid destination — but the
> desktop version can take advantage of the much larger hardware
> available on Windows and Linux."*

```
                    TAKE
                     │
          ┌──────────┴──────────┐
          │                     │
     TAKE MOBILE          TAKE DESKTOP
          │                     │
   Phone camera/mic       4+ cameras
   Simple capture        Local recording
   One participant       Multi-camera
          │                     │
          └──────────┬──────────┘
                     ↓
              SUBMIT TO
             BALANCEVID
```

> *"The key is that they are not two different participation
> protocols. They are two clients of the same Take system."*

## What it would do

```
CAMERA 1 ─┐
CAMERA 2 ─┤
CAMERA 3 ─┤──→ TAKE DESKTOP
CAMERA 4 ─┤
MIC 1 ────┤
MIC 2 ────┘
```

> *"Take Desktop discovers the equipment and gives them a
> multiview… Then: RECORD, and all four cameras are recorded
> independently."*

## Record the sources, not the finished picture

> *"This is important: don't record only the finished 4-camera
> picture. I would make the desktop version fundamentally different
> from a simple multicamera webcam recorder."*

```
TAKE SESSION
│
├── Camera 1 — original
├── Camera 2 — original
├── Camera 3 — original
├── Camera 4 — original
├── Audio master
├── Camera audio / source audio
├── timing metadata
└── Take metadata
```

> *"Then the host can decide what to do with it."*

```
Take Desktop → Multi-camera Take → Submit
→ BalanceVid Participation Inbox → Accept
→ Studio Two → TAKES → TIMELINE → MASTER
```

> *"So the desktop app becomes a capture station feeding the existing
> production system, rather than becoming another editor."*

## It should work offline

> *"This is one of the strongest reasons for making it desktop. The
> participant should be able to: connect cameras, prepare, record,
> review, keep the recording locally, connect to BalanceVid,
> submit. The recording does not need to depend on the internet."*
>
> *"You don't want: camera → internet → BalanceVid while recording.
> You want: camera → local disk, and later: local recording →
> BalanceVid."*

## Connection should be broader than login

> *"Take Desktop should have a Connect screen."*

```
CONNECT TO BALANCEVID
[ Scan QR code ]
[ Enter invitation code ]
[ Open invitation link ]
[ Enter BalanceVid address ]
[ Recently connected ]
────────────────────────
Connection  ● BalanceVid Installation — Connected
Destination ● Studio Two — Participation request #...
```

> *"And it should work with: BalanceVid Cloud, BalanceVid
> self-hosted, BalanceVid local installation, invitation/deep link,
> scoped participation request. This preserves your existing
> multi-instance architecture rather than creating a separate Take
> server."*

## Four cameras is the starting point, not the limit

> *"minimum supported: 4 cameras, but internally: Camera 1 … Camera
> N. The UI can initially present four. Later, hardware permitting, a
> workstation could handle more. The application should therefore not
> have a data model that assumes exactly four."*

## Camera connection should be flexible

> *"Local cameras: USB webcams, capture devices, HDMI capture
> interfaces. Network cameras where supported: NDI, RTSP/IP
> cameras."*
>
> *"NDI is particularly interesting here because it can expose
> cameras and other sources over the local network rather than
> requiring everything to be physically connected to the recording
> PC… But I would not make NDI mandatory."*

```
CameraSource
├── LocalCamera
├── CaptureDevice
├── NDISource
└── RTSPSource
```

> *"Then the rest of Take doesn't care where the camera came from."*

## The most important feature: synchronization

> *"This is where Take Desktop becomes genuinely useful. Four cameras
> must share a common recording clock."*

```
00:00:00.000
CAM 1 ─────────────────────────────
CAM 2 ─────────────────────────────
CAM 3 ─────────────────────────────
CAM 4 ─────────────────────────────
AUDIO ─────────────────────────────
```

> *"Every frame/take needs timestamp information… This is much more
> valuable than simply generating four unrelated MP4 files."*

## Don't make Take Desktop into Premiere

> *"Take Desktop should not become: Premiere, DaVinci Resolve, Studio
> Two, a full switcher. Its job is: Connect → Prepare → Record →
> Review → Submit. That's it. Studio Two remains the place for
> serious assembly."*

## The workflow

```
01 CONNECT   choose BalanceVid destination
02 CAMERAS   four-camera multiview
03 PREPARE   cameras, microphones, resolution, frame rate,
             disk space, sync, signal, audio
04 RECORD    big central ● RECORD with elapsed time
05 REVIEW    CAM 1 / CAM 2 / CAM 3 / CAM 4 / ALL — no editing required
06 SUBMIT    select the Participation Request and send the Take
```

## It can become a station

> *"A church, university, music studio, community organization, or
> small production location could install Take Desktop on one
> Windows/Linux machine. Then that machine becomes a permanent
> BalanceVid participation station."*

```
UNIVERSITY TAKE STATION
Camera 1 — Lecturer
Camera 2 — Wide
Camera 3 — Students
Camera 4 — Board
                    [ RECORD ]  [ REVIEW ]  [ SUBMIT ]
```

## And its relationship with Studio Two

> *"Take Desktop captures. Studio Two produces. Online TV
> broadcasts."*

## Lightweight

> *"Don't build a huge Electron-style production suite if you don't
> need it. The philosophy should be: it is a capture client, not a
> broadcast engine."*

| Take Desktop handles | BalanceVid handles |
|---|---|
| device discovery | participation request |
| camera preview | ownership |
| synchronized capture | review/acceptance |
| local storage | storage |
| review | production |
| secure connection | Studio Two |
| upload/submission | Online TV |

## One change from the phone Take

> *"The phone app currently follows the simple: discover →
> participate → record → submit. The desktop version should be:
> connect → configure → monitor → record → review → submit. Same
> participation protocol, different capture capability. And the
> recording remains local until submission."*

---

# PART TWO — What already exists

Measured, not assumed. Every line names where it was read.

## The brief's architecture is already the shipped architecture

> *"They are not two different participation protocols. They are two
> clients of the same Take system."*

**This is already true of the three clients that exist.**
`app/p/[id]/useMasterRecording.ts` defines `RecordingSink`, and
there are three implementations of it today:

| sink | client |
|---|---|
| `app/p/[id]/performanceSink.ts` | the performance studio |
| `app/p/[id]/soundSink.ts` | the sound recorder |
| `app/take/[link]/takeSink.ts` | the Take app on a phone |

One recorder, three clients, differing only by where the bytes go.
`takeSink.ts`'s own opening says why:

> *"everything difficult about recording against a song — the song on
> the audio clock, the offset taken at the instant the first chunk
> closes, the device latency subtracted, the elapsed time measured
> where it is honest — is identical on a producer's laptop and a
> performer's phone, and must not exist twice."*

**Take Desktop is the fourth implementation of `RecordingSink`, not a
second protocol.** That is the single most important fact in this
document, and it was designed for three clients ago.

## Connect — the model exists; the screen does not

`app/take/connections.ts` already holds a device-local list of
BalanceVid installations keyed by **origin**:

```ts
export interface Connection { origin: string; name: string; addedAt: string }
const KEY = 'balancevid.take.instances';
```

Its doctrine answers most of the brief's Connect screen before it was
asked:

> *"WHICH IS ALSO WHY THERE IS NO REGISTRY. A directory of every
> BalanceVid would be the universal library §12 rejects wearing a
> different hat: a person adds an installation by having been to it,
> and the home is the union of what those choose to list."*
>
> *"AN ORIGIN IS THE WHOLE OF AN IDENTITY HERE… a link is an origin
> plus a credential, and the origin is never written into any
> record."*

So **Cloud, self-hosted and local installations already work
identically** — they are three origins — and *"invitation/deep link"*
is the shipped mechanism rather than an addition. What the brief adds
is a **screen**: QR, typed code, typed address, recently connected.
Four doors onto one existing model.

## Offline — already built, and more thoroughly than the brief asks

> *"The recording does not need to depend on the internet."*

It already does not. `app/take/[link]/queue.ts` is the typed door onto
`public/take-app/queue.js`, a plain script shared with a **service
worker** — `public/take-sw.js`, registered at `queue.ts:109` — so
that uploads drain from a `sync` event with no page open:

> *"a worker with its own idea of what is outstanding is a worker that
> deletes a segment the page is still waiting on."*

And it degrades rather than refuses:

> *"A phone in private browsing has no IndexedDB; an old browser has
> no service worker… None of that is a reason a performer cannot
> record — it is a reason their upload is less durable, which is a
> difference in quality, not in whether the product works."*

**Keep-locally-then-submit is also already there.** `takeSink.ts`
takes a `keep(submissionId, spec)` callback:

> *"Take 3 doesn't have to reach the server at all if they delete it
> locally."*

## Chunked, resumable, crash-evident upload

`app/api/take/[link]/submissions/[submissionId]/route.ts` writes each
chunk as `000000.part`, `000001.part` … and joins them on finalize.
`RecordingSink.begin` declares the recording **before any media
exists**:

> *"A browser that crashes mid-song has still left evidence that
> somebody was recording, and chunks arriving for a recording nobody
> declared would have nowhere to go."*

## It already installs as an app, per invitation

`app/api/take/[link]/manifest/route.ts` serves a **per-link** PWA
manifest:

> *"A single manifest at `/take/` would install an icon that opens a
> page saying 'paste your link' — which is worse than a bookmark.
> What a performer wants on their home screen is THIS assignment."*

## Synchronisation — the hard part is already written

This is the finding that most changes the plan.

`src/domain/align.ts` is sub-frame alignment by cross-correlation,
built to place a take against a master song — **and its own comment
names the multicam case**:

> *"Cross correlation finds the lag at which two signals best agree,
> which is how every multicam alignment tool works — and it works
> because all the cameras heard the same room."*

It was written with a precondition it has to be honest about: if the
performer wore headphones, the master is not in the take and there is
nothing to correlate. **For four cameras in one room that precondition
is always satisfied** — they all heard the same room, which is the
exact case the comment describes. The function that had to apologise
for its precondition on the phone is the function that needs no
apology on the desk.

Also present: `src/domain/time.ts` (`Samples`, `HOUSE_SAMPLE_RATE`),
and `measureRoundTrip` / `measureAlignment` beside it.

## Studio Two already multiviews synchronised takes on one clock

**This is the second finding that changes the plan, and it was
missed on the first pass of this document.** The brief draws its
destination as:

```
Camera 1 ────────┐
Camera 2 ────────┤
Camera 3 ────────┼──→ MASTER TIMELINE
Camera 4 ────────┤
Audio ───────────┘
```

Studio Two already does exactly that — not with four tracks inside
one take, but with **four takes on one clock**:

> *"ALL TAKES is the multiview: every take at once, numbered, on one
> clock, and clicking a monitor is pressing its number — the same
> function the key and the transport button call. It opens on the
> multiview whenever there is more than one take."*
> — `docs/STUDIO-TWO.md`

In code at `app/p/[id]/SwitchingStage.tsx:457`:

```ts
const allTakes = !soloed && (multiview ?? usableIds.length > 1);
```

And it is what Studio Two's own brief asked for at §7:

> *"you could have multiple synchronized takes visible
> simultaneously… you choose which one is visible at each moment."*

**So the destination is not merely available, it is the thing Studio
Two was built around.** Four cameras submitted as four takes of one
performance land in the multiview, numbered, switchable, already.
That is the whole right-hand side of the brief's diagram, shipped.

## Summary of Part Two

| The brief asks for | Status |
|---|---|
| same participation protocol | **exists** — `RecordingSink`, two clients already |
| connect to any installation | **exists** — `connections.ts`, origin-keyed, no registry |
| cloud / self-hosted / local | **exists** — three origins, one mechanism |
| invitation / deep link | **exists** — the link is the request |
| record offline, submit later | **exists** — IndexedDB queue + service-worker sync |
| keep locally, decide later | **exists** — `keep()` in `takeSink` |
| resumable upload | **exists** — `.part` chunks |
| installs as an app | **exists** — per-link manifest |
| frame-accurate alignment | **exists** — `align.ts`, and it names multicam |
| multiview of N angles on one clock | **exists** — Studio Two's ALL TAKES |
| switching between angles | **exists** — clicking a monitor presses its number |

---

# PART THREE — Measured in the browser

The staging decision rests on one question the brief does not ask:
**can a browser record four cameras at once, and how far apart do
they start?** Measured rather than assumed, in this container's
Chromium.

| streams | resolution | open | start spread | all producing | each |
|---|---|---|---|---|---|
| 1 | 640×480@20 | 99 ms | 0 ms | 1 / 1 | 228 KB |
| 2 | 640×480@20 | 12 ms | 0.4 ms | 2 / 2 | 228 KB |
| 4 | 640×480@20 | 16 ms | 0.5 ms | 4 / 4 | 228 KB |
| 6 | 640×480@20 | 20 ms | 0.4 ms | 6 / 6 | 228 KB |
| 8 | 640×480@20 | 30 ms | 0.9 ms | 8 / 8 | 228 KB |

Four seconds each, `video/webm;codecs=vp8,opus`, Chromium 1194
headless, one fake device fanned out.

**Eight concurrent `MediaRecorder`s all produced data, and the widest
start spread across two runs was under a millisecond.** At 30 fps one
frame is 33 ms, so eight recorders start inside **a thirtieth of a
frame**.

**The first run of this measurement was wrong and is worth
recording.** It reported `undefinedxundefined@undefined` for every
stream, because the settings were read in the `return` — *after*
`track.stop()` had already run. A stopped track reports nothing. The
numbers it gave for bytes and spread were real; the resolution it
gave was an artefact of reading a dead track, and had it not been
obviously broken it would have gone into this document as a fact.

> **A measurement taken after the thing being measured has stopped is
> not a measurement.**

**What this does and does not prove.** It is one fake device fanned
out, at 640×480@20, headless, with no display compositing — so it
measures the ENCODER path and the start spread, not USB bandwidth,
not device enumeration, not 1080p load, not four physically distinct
cameras. The claim it supports is narrow and it is the one that
matters:

> **The browser is not the reason Take cannot record four cameras.**

And the brief's stated hardest problem is softer than feared: the
sub-frame start spread means synchronisation at the API level is
nearly free, before `align.ts` is asked anything.

---

# PART FOUR — The gaps that are real

Everything below is genuinely absent. Nothing else is. Two entries
in the first draft of this document were wrong and are corrected
here, because a plan built on a gap that does not exist builds the
wrong thing.

### G1 · One camera

`app/useCamera.ts` holds a single `cameraId` and a single
`microphoneId`. Everything downstream of it is singular. **This is
the real centre of the work.**

### G2 · Nothing says four takes are four angles — *corrected*

The first draft said the gap was `Take.assetId` being singular
(`src/domain/document.ts:130`) and staged a model change to give a
take N tracks. **That was wrong, and reading Studio Two is what
corrected it.**

Studio Two already holds N synchronised takes on one clock and
multiviews them (`SwitchingStage.tsx:457`). Four cameras do not need
to become one take with four tracks; they can be **four takes of one
performance**, which is the shipped model and needs no migration,
no new render path and no change to the multiview.

What is actually missing is one fact: **nothing distinguishes four
angles of one capture from four attempts at the same part.** Both are
"several takes". A director needs to know which, because switching
between angles is the point and switching between attempts is a
different act.

So the gap is a small one — a capture identity shared by takes
recorded together, and each take's measured start — not a new shape
for `Take`.

### G3 · One stream per submission

`RecordingSink.chunk(id, index, body)` has no track dimension, and
`app/api/take/[link]/submissions/[submissionId]/route.ts` keys parts
by index alone. Four simultaneous recordings need either four
submissions that know they belong together, or one submission with a
track dimension.

### G4 · No source abstraction beyond `getUserMedia`

Verified absent: no `CameraSource`, no `NDI`, no `RTSP` anywhere in
`src/` or `app/`. Capture cards work only where the OS already
presents them as a camera.

### G5 · No desktop runtime

No Electron, no Tauri, nothing of the kind in `package.json`. Take
is a PWA that installs from the instance that issued the link.

### G6 · No disk check **on the recording device** — *corrected*

The first draft said nothing measures disk space. **That is wrong.**
`src/store/space.ts` measures free, used and total bytes by
`statfs`, and the home page shows it — *"Of the disk, not of a plan.
There is no quota to be a fraction of."*

But that is the **server's** disk, measured server-side. A
participant recording four streams to their own machine needs their
OWN free space and sustained write rate, and nothing measures that.
The existing module is the right vocabulary to match, not a thing to
reuse across the wire.

### G7 · No multiview in Take

Take has exactly one `<video>` (`app/take/[link]/TakeApp.tsx`).
Multiviews exist twice elsewhere — Online TV's (`guestGrid.ts`) and
Studio Two's ALL TAKES (`SwitchingStage.tsx`) — and both should be
read before a third is written.

### G8 · Sync is measured after the fact, against a master

`align.ts` aligns a take to a song by correlation. Four cameras with
no song still need a shared **start** and a per-take record of when
each actually began. Part Three says that start is nearly free; what
is missing is recording it rather than assuming it.

---

# PART FIVE — The stages

Ordered so each ships something usable on its own, nothing is built
before what it depends on, and **the native work is last, because the
measurement says it does not block the rest.**

**UPGRADE** changes something that exists. **ADD** creates something
new. Nothing here rewrites.

---

## Stage D-1 · Takes know which capture they came from — **UPGRADE**

The smallest possible model change, and the one everything else
writes into.

- A take gains the capture it was recorded in and its measured start.
- Takes sharing a capture are **angles**; takes not sharing one are
  **attempts**, exactly as today.
- `Take.assetId` is untouched. No migration. Every existing take is
  an attempt with no capture, which is what it is.
- Studio Two's ALL TAKES multiview already shows them; it learns only
  to say which are angles of one capture.

Done when: four hand-written takes sharing a capture appear as angles
in the multiview, and every existing performance is unchanged.

## Stage D-2 · The recorder takes a set of sources — **UPGRADE**

- `useCamera` → N cameras and N microphones, with N = 1 the existing
  behaviour exactly.
- `RecordingSink` gains a track dimension, `track: 0` meaning what
  no track meant.
- The upload route, the IndexedDB queue and `take-sw.js` carry the
  track through.

**Must not touch:** the offset and latency arithmetic in
`useMasterRecording`. It is correct, it is shared by every client,
and it is the whole reason `RecordingSink` exists.

## Stage D-3 · One start, and every start recorded — **UPGRADE**

- All recorders start from one call; each track's measured start is
  written into its take.
- The sub-millisecond spread of Part Three becomes a **recorded
  number per session on real hardware**, not an assumption carried
  from a fake device.
- Where the tracks share audible room sound — the case `align.ts`
  describes and the one it never gets on a phone — correlation is
  offered as a *check* on the measured start, stored beside it, never
  silently replacing it.

## Stage D-4 · Multiview and PREPARE — **ADD**

- An N-up grid in Take with per-source signal and per-microphone
  level: the brief's CAMERAS step.
- PREPARE: resolution, frame rate, free disk and sustained write rate
  **on the recording device**, and a per-source "is anything
  arriving" check.
- Refuses to arm with a reason, rather than failing mid-record.

Read `guestGrid.ts` and `SwitchingStage.tsx` first. Two grids exist.

## Stage D-5 · REVIEW and SUBMIT a multi-angle capture — **UPGRADE**

- Review each angle and all of them. No editing, per the brief.
- Submit sends the set under one capture, resuming per track.
- The participation inbox shows one arrival with N angles, not N
  arrivals.

**At the end of D-5 the brief is delivered in the browser**: four
cameras, local-first, synchronised, submitted, and already switchable
in Studio Two's multiview — on Windows, Linux, macOS and anything
else with a current browser, with no runtime to build, sign or ship.

## Stage D-6 · The Connect screen — **UPGRADE**

- QR, typed invitation code, pasted link, typed address, recently
  connected: four doors onto `connections.ts`, which already holds
  the model and the rule against a registry.
- The destination line the brief draws: installation, then
  participation request.

After D-5 deliberately. It widens reach for something that already
works, and nothing depends on it.

## Stage D-7 · A source abstraction — **ADD**

```
CameraSource
├── LocalCamera      (exists, as getUserMedia)
├── CaptureDevice    (exists where the OS presents it as a camera)
├── NDISource        (needs a runtime)
└── RTSPSource       (needs a runtime)
```

Introduced as a type with its two reachable implementations, so the
rest of Take stops caring where a camera came from **before** any
native code exists. The brief's own rule: *"Then the rest of Take
doesn't care where the camera came from."*

## Stage D-8 · The desktop runtime — **ADD**

Only now, and only for what a browser genuinely cannot reach:

- NDI and RTSP discovery and ingest.
- Capture cards the OS does not present as cameras.
- Guaranteed disk headroom and sustained write.
- More streams, at higher resolutions, than a tab will hold.

**It hosts the same Take application** and implements `CameraSource`
from D-7 and `RecordingSink` from D-2. It is a host for Take, not a
second Take — the brief's *"a capture client, not a broadcast
engine"*.

By the time D-8 begins everything above already works without it, so
the runtime has to justify only those four lines. That is the test of
whether it should be built at all.

---

## What must not happen

- **No second participation protocol.** Four clients, one system.
- **No editor in Take.** Connect → Prepare → Record → Review →
  Submit. Studio Two produces.
- **No second recorder.** `useMasterRecording`'s offset and latency
  arithmetic is the one copy for all four clients, and the reason
  `RecordingSink` exists.
- **No third multiview** written without reading the two that exist.
- **No registry of installations.** `connections.ts` says why.
- **No data model that assumes four.** N throughout, four in the UI.
- **No change to `Take.assetId`.** A one-camera take stays exactly
  what it is today.
- **No new render path.** Studio Two already switches between takes
  on one clock; angles are takes.
