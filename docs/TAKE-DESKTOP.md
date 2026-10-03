# Take Desktop — the frozen concept, what already exists, and the stages

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

# THE FREEZE — the concept, settled before implementation

**Frozen 2 October 2026.** Everything below is agreed scope. The
stages in PART FIVE implement this and nothing else; anything not
on this list is out until the freeze is reopened deliberately.

## Take Desktop — Windows + Linux

- Lightweight capture station
- 4-camera minimum architecture, expandable
- Local recording first
- Synchronized camera/audio capture
- Multiview monitoring
- Camera/capture-card/network-source support
- Connect to any authorized BalanceVid installation
- QR/deep-link/invitation-code connection
- Review locally
- Submit through the existing Participation Request system
- No full editing suite
- Studio Two remains the production/editing destination
- Same Take identity and protocol as mobile, but a different
  capture experience

## The core flow

```
CONNECT → CAMERAS → PREPARE → RECORD → REVIEW → SUBMIT
```

## The architectural boundary

```
Take Desktop captures
      ↓
BalanceVid receives / reviews
      ↓
Studio Two produces
      ↓
Online TV broadcasts
```

---

## Every frozen item, and where it is built

Nothing on the list is unaccounted for, and no stage exists that
the list does not ask for.

| frozen | stage | status |
|---|---|---|
| Lightweight capture station | T-1 | shell only; measurement in PART THREE says thin is enough |
| 4-camera minimum, expandable | T-3, T-4 | N throughout, four in the UI; 8 measured |
| Local recording first | T-4 | records with the machine offline |
| Synchronized camera/audio | T-4 | one start, each start recorded, `align.ts` as a check |
| Multiview monitoring | T-3 | read the two that exist first |
| Camera / capture-card sources | T-3 | where the OS presents them as cameras |
| Network sources (NDI/RTSP) | T-6 | last and optional; extends, does not enable |
| Connect to any authorized installation | T-2 | origin-keyed, already modelled |
| QR / deep-link / invitation-code | T-2 | four doors, one model |
| Review locally | T-5 | |
| Submit via Participation Request | T-5 + B-2 | the protocol exists |
| No full editing suite | — | a boundary, enforced in *What must not happen* |
| Studio Two is the destination | B-1, B-3 | it already multiviews angles |
| Same Take identity and protocol | T-2, T-5 | see the definition below |

The flow maps to the stages exactly:

```
CONNECT   CAMERAS   PREPARE   RECORD   REVIEW   SUBMIT
  T-2        T-3      T-3       T-4      T-5     T-5
```

CAMERAS and PREPARE are one stage of work and two steps of the
flow. They are built together because a multiview that cannot tell
you a source is dead is the thing PREPARE exists to prevent.

---

## Three definitions this freeze pins

A freeze is only as good as the words in it. Three of these could be
read two ways, and the wrong reading would be built.

### "Same Take identity" means the link, not a login

`app/take/TakeHome.tsx` states the rule:

> *"NOTHING HERE ASKS WHO YOU ARE. There is no account on this
> surface."*

A Take link is an origin plus a credential, and the credential is
the invitation. Every wrong link — *"Missing, mistyped, expired,
rotated, already attached — all 404"* — answers alike, because
*"A 403 would confirm
that something is there to guess at."*

**So "connect to any authorized BalanceVid installation" is not a
sign-in.** The desktop application authorises exactly as the phone
does: by holding a link somebody sent. Building a desktop account,
a profile or a password would be a second identity model for the
same system, and it is out of scope by this freeze.

### "Expandable" means the model, not the window

> *"The application should therefore not have a data model that
> assumes exactly four."*

Four is what the UI presents. N is what everything beneath it
holds. A stage that hard-codes four anywhere below the grid has
broken the freeze even if it looks right.

### "Lightweight" is measured, not asserted

The brief sets the test — *"it is a capture client, not a broadcast
engine"* — and PART THREE is the evidence that it can be met: eight
concurrent recorders at sub-frame start spread means the shell does
not need a native capture stack for four cameras.

**Lightweight is therefore a thing each stage can be judged
against**, not a word in a preamble: if a stage needs native
capture code to do something the shell already does, it is doing
the wrong thing.

---

## What the freeze does not settle

Stated so it is not mistaken for agreed:

- **The shell technology and repository layout.** Taken at T-1 as a
  decision with reasons, not assumed here.
- **Which capture-card and network-camera hardware is supported.**
  T-3 and T-6 discover what the OS and the shell actually expose;
  no list is promised.
- **Whether T-6 is built at all.** By T-5 the frozen flow is
  complete on hardware people already have. NDI and RTSP extend it.
- **How many cameras a given machine will hold.** The measurement
  in PART THREE is a fake device in a container; the real number is
  recorded per session at T-4, on real hardware.

## Changing the freeze

Any change is a decision with a reason, written into this document
beside the item it changes, with the stage it affects. The point of
freezing is not that nothing may change — it is that a change is
visible and argued rather than discovered half-built.

---

# PART ZERO — What this is, and what it is not

**Take Software for desktop is a separate application that a person
installs on a Windows or Linux desktop or laptop.** It is the second
form of Take: the phone app is one client, this is another. It is
not a page, a tab, a mode or a route inside BalanceVid.

Stated plainly because the rest of this document discusses the
BalanceVid codebase constantly, and a reader three stages in could
reasonably conclude the work belongs there. It does not.

| it IS | it is NOT |
|---|---|
| installed software on a desktop or laptop | a page in the BalanceVid web app |
| a Take client, like the phone app | a second Take **server** |
| a capture station | an editor |
| a thing that submits to BalanceVid | Studio Two |

**Studio Two appears throughout this document in exactly one role:
the destination.** Take Software for desktop submits into a
BalanceVid installation; that installation's Studio Two is where the
material is produced afterwards. The brief's own words:

> *"Take Desktop captures. Studio Two produces. Online TV
> broadcasts."*

The freeze names the link between the first two that the sentence
leaves implicit:

```
Take Desktop captures → BalanceVid receives / reviews
→ Studio Two produces → Online TV broadcasts
```

**"Receives / reviews" is a stage of its own** — the participation
inbox, where somebody accepts a submission before it becomes
material. It is why B-3 exists: four angles must arrive as one
capture to be reviewed as one decision.

Nothing in any stage below puts capture into Studio Two, and nothing
puts production into Take.

## Then why is most of this document about the BalanceVid codebase?

Because a separate application is not an unrelated one, and the
brief is emphatic about it:

> *"The key is that they are not two different participation
> protocols. They are two clients of the same Take system."*

So the desktop application has to speak the protocol that exists,
and the way it does that without copying anything is the point of
PART TWO.

## How a separate application shares code without duplicating it

This product already made the decision that makes it possible, for
a different reason. Every module in `src/domain/` states the same
rule at the top of its file:

> *"Nothing here touches the filesystem, the network or a clock."*

That rule was written for testability. Its second consequence is
that **the domain layer is a library a second application can
depend on**: the alignment arithmetic (`align.ts`), the clock
(`time.ts`), the participation vocabulary, the connection rules —
all of it is pure, and none of it assumes a browser, a server, or
this repository's web tier.

So the division is:

```
  Take Software for desktop            BalanceVid
  ───────────────────────────          ──────────────────────
  its own application                  the installation
  its own window and install           the participation request
  device discovery                     the inbox
  multi-camera capture                 Studio Two
  local disk                           Online TV
          │                                   ▲
          └──── the Take protocol ────────────┘
                 the shared domain library
```

**Two applications, one protocol, one copy of the arithmetic.**

## Where its code lives

Not in `app/`. `app/` is the BalanceVid web tier and everything in
it is served by the installation. The desktop application is its
own project with its own build, its own release and its own
version, depending on the shared domain library.

Whether that is a directory in this repository or a repository of
its own is a packaging decision, not an architectural one, and it
is taken at Stage T-1 rather than assumed here.

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

**What this measurement decides, and what it does not.** It does
NOT say "ship it in the browser instead" — the deliverable is
installed software, per PART ZERO, and a measurement does not get
to redefine that. What it decides is **what goes inside the
installed application**: the capture engine can be web technology
in a desktop shell rather than native capture code, which is
exactly how the brief's own requirement is met —

> *"Don't build a huge Electron-style production suite if you don't
> need it… it is a capture client, not a broadcast engine."*

Eight recorders at sub-frame spread is the evidence that a thin
shell is enough for four cameras. The native work is then only
what the shell cannot reach — NDI, RTSP, hidden capture cards,
guaranteed disk — which is a short list rather than a whole
capture stack.

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

**Two tracks, because there are two pieces of software.**

**Track T** is Take Software for desktop: the installed
application. **Track B** is what the BalanceVid installation must
learn in order to receive what it sends. They are separate
codebases with separate releases, and the order below is the order
that keeps each one shippable on its own.

**T depends on B only at T-5.** Everything before that is the
desktop application recording to its own disk, which is the brief's
whole point: *"The recording does not need to depend on the
internet."*

**UPGRADE** changes something that exists in BalanceVid.
**ADD** creates something new. Nothing rewrites.

---

## Track T — the installed application

### T-1 · The shell, and where it lives — **ADD**

The decision the rest of the track needs and nothing else does:
the packaging (shell technology, repository layout, build, signing,
release), and the shared domain library it depends on.

It ships as an application that installs, opens a window, and says
it is not connected to anything. That is a complete, honest first
release.

**Judged on:** it installs on Windows and on Linux; it imports
`align.ts` and `time.ts` from the shared library without a copy;
it contains no BalanceVid web-tier code.

### T-2 · Connect — **ADD** (desktop) / **UPGRADE** (model)

The brief's CONNECT screen: QR, typed invitation code, pasted link,
typed address, recently connected.

The model is already written and is not rewritten —
`app/take/connections.ts` holds origin-keyed installations and the
rule against a registry. The desktop application implements the
same rules against its own storage, from the same shared
definition.

**Judged on:** it connects to a cloud installation, a self-hosted
one and a local one with no code that distinguishes them, and shows
the participation request it was invited to.

### T-3 · Cameras, multiview and PREPARE — **ADD**

Device discovery, the N-up grid, per-source signal, per-microphone
level, and the PREPARE checks: resolution, frame rate, free disk and
sustained write rate **on this machine**, and whether anything is
arriving from each source.

Refuses to arm with a reason rather than failing mid-record.

Read `guestGrid.ts` and `SwitchingStage.tsx` first. Two multiviews
exist and a third should not be invented.

**Judged on:** four cameras previewing at once, and a refusal with a
sentence when a disk cannot sustain four streams.

### T-4 · Record, with one start and every start recorded — **ADD**

All recorders start from one call, to local disk. Each source's
measured start is written into the session.

The sub-millisecond spread of PART THREE becomes **a recorded
number per session on real hardware**, not an assumption carried
from a fake device in a container.

Where the sources share audible room sound — the case `align.ts`
describes and never gets on a phone — correlation is offered as a
*check* on the measured start, stored beside it, never silently
replacing it.

**Judged on:** four files on disk, each with a measured start, with
the machine offline for the whole recording.

### T-5 · Review and Submit — **ADD**

Review each angle and all of them; no editing, per the brief.
Submit sends the set under one capture, resumable per source, over
the existing Take protocol.

**This is the first stage that needs the network, and the first
that needs Track B.**

**Judged on:** a four-camera capture recorded offline, then
submitted when a connection returns, arriving in the inbox as one
capture with four angles.

### T-6 · Sources beyond the shell — **ADD**

```
CameraSource
├── LocalCamera      (T-3)
├── CaptureDevice    (T-3, where the OS presents it as a camera)
├── NDISource        (here)
└── RTSPSource       (here)
```

The abstraction is introduced at T-3 with its two reachable
implementations, so that by the time NDI and RTSP arrive the rest
of the application does not change. The brief's own rule:

> *"Then the rest of Take doesn't care where the camera came from."*

**Last, and optional.** By T-5 the application already does what the
brief asks on hardware people have. NDI and RTSP extend it; they do
not enable it.

---

## Track B — what BalanceVid must learn

Small, and independent of the desktop application's existence.

### B-1 · Takes know which capture they came from — **UPGRADE**

A take gains the capture it was recorded in and its measured start.
Takes sharing a capture are **angles**; takes not sharing one are
**attempts**, exactly as today.

`Take.assetId` is untouched. No migration. Every existing take is an
attempt with no capture, which is what it is.

Studio Two's ALL TAKES multiview already shows them
(`SwitchingStage.tsx:457`); it learns only to say which are angles
of one capture.

**Judged on:** four hand-written takes sharing a capture read as
angles in the multiview, and every existing performance is
unchanged.

### B-2 · A submission may carry several sources — **UPGRADE**

`RecordingSink` gains a track dimension — `track: 0` meaning what
no track meant — and
`app/api/take/[link]/submissions/[submissionId]/route.ts`,
the IndexedDB queue and `public/take-sw.js` carry it through.

**Must not touch:** the offset and latency arithmetic in
`useMasterRecording`. It is correct, it is shared by four clients,
and it is the whole reason `RecordingSink` exists.

**Judged on:** the phone app is byte-identical in behaviour, and a
two-track submission joins correctly on the server.

### B-3 · The inbox shows a capture, not N arrivals — **UPGRADE**

One arrival with four angles, rather than four arrivals somebody has
to recognise as related.

---

## The order, end to end

```
B-1 ─┐
B-2 ─┼──────────────────┐
B-3 ─┘                  │
                        ▼
T-1 → T-2 → T-3 → T-4 → T-5 → T-6
                        ▲
            everything left of here
            works with no network
```

Track B can be done at any time before T-5 and is useful on its own:
B-1 alone lets a producer who records four angles by hand today mark
them as angles.

---

## What must not happen

- **No second participation protocol.** Four clients today, five
  with the desktop application, one system.
- **No second Take server.** The desktop application submits to an
  installation; it never becomes one.
- **No editor in Take.** Connect → Prepare → Record → Review →
  Submit. Studio Two produces.
- **No capture in Studio Two.** Studio Two is the destination and
  nothing in Track B puts a camera in it.
- **No second recorder.** `useMasterRecording`'s offset and latency
  arithmetic is the one copy for every client, and the reason
  `RecordingSink` exists.
- **No copied domain code.** `align.ts` and `time.ts` are depended
  on, not pasted. Two copies of alignment arithmetic is two answers.
- **No third multiview** written without reading the two that exist.
- **No registry of installations.** `connections.ts` says why.
- **No data model that assumes four.** N throughout, four in the UI.
- **No change to `Take.assetId`.** A one-camera take stays exactly
  what it is today.
- **No new render path.** Studio Two already switches between takes
  on one clock; angles are takes.
- **No BalanceVid web-tier code in the desktop application**, and no
  desktop code in `app/`.
