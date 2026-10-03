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

### T-1 · The shell, and where it lives — **ADD** · *built, see PART SIX*

The decision the rest of the track needs and nothing else does:
the packaging (shell technology, repository layout, build, signing,
release), and the shared domain library it depends on.

It ships as an application that installs, opens a window, and says
it is not connected to anything. That is a complete, honest first
release.

**Judged on:** it installs on Windows and on Linux; it imports
`align.ts` and `time.ts` from the shared library without a copy;
it contains no BalanceVid web-tier code.

### T-2 · Connect — **ADD** (desktop) / **UPGRADE** (model) · *built, see PART SEVEN*

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

### T-3 · Cameras, multiview and PREPARE — **ADD** · *built, see PART EIGHT*

Device discovery, the N-up grid, per-source signal, per-microphone
level, and the PREPARE checks: resolution, frame rate, free disk and
sustained write rate **on this machine**, and whether anything is
arriving from each source.

Refuses to arm with a reason rather than failing mid-record.

Read `guestGrid.ts` and `SwitchingStage.tsx` first. Two multiviews
exist and a third should not be invented.

**Judged on:** four cameras previewing at once, and a refusal with a
sentence when a disk cannot sustain four streams.

### T-4 · Record, with one start and every start recorded — **ADD** · *built, see PART NINE*

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


---

# PART SIX — T-1, as built

> *"It ships as an application that installs, opens a window, and
> says it is not connected to anything. That is a complete, honest
> first release."*

```
 ┌──────────────────────────────────────────┐
 │                  Take                    │
 │   Multi-camera capture, recorded on      │
 │            this machine.                 │
 │                                          │
 │  CONNECT  CAMERAS PREPARE RECORD REVIEW  │
 │  ───────                          SUBMIT │
 │                                          │
 │  This build records nothing yet.         │
 │  Connecting to a BalanceVid installation │
 │  is the next thing it learns.            │
 │                                          │
 │             48000 Hz · 30 fps            │
 └──────────────────────────────────────────┘
```

**Five of six steps grey, and that is the point.** The flow is
frozen, so drawing it with one step named says exactly where the
application is. A window saying *coming soon* says nothing a
person can plan around. `BUILT_TO` in `src/shell.ts` is the one
constant, and the stage that builds a step moves it; a release
that lights a step it has not built lies to the person who
installed it.

## Why Electron, and what it costs

This application's whole job is **four cameras starting
together**, and `useMasterRecording` already does that against
Chromium's `MediaRecorder` in four clients. Electron ships **one
Chromium on every platform it builds for**.

A webview shell — Tauri and everything like it — uses the
operating system's own engine: WebKitGTK on Linux, WebView2 on
Windows. That is a different `MediaRecorder`, different codec
support and different device enumeration per platform. The single
claim a capture makes is that its angles agree about when they
started, and **a capture station whose measurement depends on
which operating system it is on is not one.** [T-4]

The cost is stated rather than hidden: a Chromium per install,
which is a large download for a program that will spend its life
writing video files. T-4 is the stage that cashes it.

## The shared library

`shared/src/` holds `time.ts` and `align.ts`. They were ready for
this: `time.ts` imports nothing at all and `align.ts` imports
`time.ts`, which is the whole dependency graph.

`src/domain/time.ts` and `src/domain/align.ts` are **one line
each** — a door onto the files that moved. A door rather than a
sweep because **a hundred and twenty-one files** import
`src/domain/time.js`; rewriting them all would be a hundred and
twenty-one chances to fumble an import in a commit whose subject
is a directory move, and it would put the desktop application's
layout into every file in the product.

**Not an npm workspace**, deliberately: a root workspace would
make the web application's `npm install` — and its CI — pull three
hundred megabytes of Chromium for a build that does not use it.
**Not published to a registry** either; that is the right answer
the day `desktop/` becomes its own repository and the wrong one
while a single `git mv` keeps them in step.

**And the rule is now checked rather than listed.** *"`align.ts`
and `time.ts` are depended on, not pasted"* was in *what must not
happen*, and a rule in a list is a rule nobody checks.
`test/domain/shared-library.test.ts` asserts the library imports
nothing outside itself, assumes neither host, declares
`HOUSE_SAMPLE_RATE` and `HOUSE_FPS` in exactly one place across
`shared/`, `src/` and `app/`, and that the doors are exactly one
line of code each. **That last one is the one that matters:** the
risk of a door is that somebody fills it back in.

The window prints `48000 Hz · 30 fps` for the same reason. If the
door were filled in with a copy the window would still read
48000 and only a test would know — so the number is on screen,
and the test asserts it is nowhere in the file that prints it.

## The boundary T-1 is judged on

> *"No BalanceVid web-tier code in the desktop application."*

They are two programs: a Next server with a filesystem full of
somebody's media, and a capture station on a laptop in a room.
The way that stops being true is one import that looked
convenient, so the test names the allowed shapes and refuses
`/src/domain/` and `/app/` outright — including from the
stylesheet, because a capture station that `@import`ed
`tokens.css` is one that breaks when somebody renames a token in
a Next application.

**The renderer is a web page and is treated as one.** Node off,
context isolation on, sandbox on, no navigation, no window-open,
and a CSP with `connect-src 'none'`. T-4 will want the disk and
will open **one named function** for it; this is the assertion
that notices if something opens it earlier and wider.

**No socket anywhere.** Everything through T-4 records to this
machine's own disk, which is the brief's own premise, and the
first line of code that opens one belongs to T-2.

## Measured, not claimed

```
desktop/ typecheck          clean
esbuild                     main.js, renderer.js, index.html, shell.css
electron . (xvfb)           window opens; title "Take"
  steps                     CONNECT CAMERAS PREPARE RECORD REVIEW SUBMIT
  named next                CONNECT
  house rates               48000 Hz · 30 fps   (read from shared/)
  require / process         undefined / undefined
electron-builder --linux    Take-0.1.0.AppImage       117 MB
                            …_0.1.0_amd64.deb          81 MB
app.asar contents           /out, /package.json — and nothing else
the AppImage, run           opens, draws, reads the same rates
```

The packaged artefact was run under a virtual display and
inspected over the debugging protocol, not assumed from the fact
that it built.

## What T-1 does not deliver, and cannot

**Windows is configured and not verified here.** The cross-build
reaches `rcedit` — which electron-builder runs to put the icon and
version into the `.exe` — and stops, because that needs **wine**
and there is none in this container (`command -v wine`: absent).
It is not a configuration fault; the same file produces the
installer on a machine with wine, or on Windows. **The first of
T-1's three judged-on criteria is therefore half measured**, and
that is said here rather than left to be discovered.

**Nothing is signed.** A certificate from a certificate authority
— Authenticode on Windows, a Developer ID on macOS — is a
purchase and an identity, not a build setting. Until there is
one, Windows SmartScreen will warn about this installer **and
that warning will be accurate.**

**macOS is deliberately absent** from `electron-builder.yml`:
building for it needs a Mac and shipping for it needs
notarisation, which needs the Developer ID above. Half a target
is a target that fails and teaches everybody to ignore a red
build.

**There is no release workflow**, for two reasons and the second
decided it: a release needs the signing identity that does not
exist, and this repository's CI does not grow jobs that fight the
deployment. `publish: null` says the same to the tool — no
auto-update server, because an application that phones home for a
new version is an application that phones home, and the premise
here is that recording does not depend on the internet.

**No framework in the renderer**, and that is a T-1 decision
rather than a permanent one. The shell draws six words and a
sentence. T-3 draws a live multiview of N cameras and is the
stage that will have an opinion — it reads `guestGrid.ts` and
`SwitchingStage.tsx` first, per PART FIVE, and whatever it
concludes it will conclude with a reason.

## The lesson this stage added

**A source-text test that reads comments is a test of the prose.**

Three assertions in `shared-library.test.ts` failed on their own
explanations before they passed:

- `\bwindow\b` caught `align.ts`'s own `const window` — the
  **correlation search window**, the domain's word for the span it
  looks across, which has nothing to do with a browser. A test
  that cannot tell a variable from a global would have cost that
  file its clearest name.
- `48000` and `/app/` caught the comments in the desktop shell
  that **explain why neither should be there.**

Prose that must not name the thing it is about is prose nobody
can write. Comments are stripped first now, and the patterns name
a reference rather than a word — which is what every other
source-text test in this repository already did, and what this
one should have done from the start.


---

# PART SEVEN — T-2, as built

> *"it connects to a cloud installation, a self-hosted one and a
> local one with no code that distinguishes them, and shows the
> participation request it was invited to."*

```
 ┌──────────────────────────────────────────┐
 │                  Take                    │
 │     Connect to the studio that invited    │
 │                   you.                   │
 │   RECENTLY CONNECTED                     │
 │   ┌────────────────────────┐ ┌────────┐  │
 │   │ Owner                  │ │ Forget │  │
 │   │ http://127.0.0.1:3100  │ └────────┘  │
 │   └────────────────────────┘             │
 │   ┌────────────────────┐ ┌───────────┐   │
 │   │ …/take/abc.secret  │ │  Connect  │   │
 │   └────────────────────┘ └───────────┘   │
 │        An invitation at …:3100           │
 │                  Owner                   │
 │          Invited to one piece of work.   │
 │        ┌──────────────────────┐          │
 │        │  Open the invitation │          │
 │        └──────────────────────┘          │
 │  CONNECT  CAMERAS PREPARE RECORD …       │
 └──────────────────────────────────────────┘
```

## One box, not four tabs

The brief's CONNECT screen lists *QR, typed invitation code,
pasted link, typed address, recently connected*. **Three of those
are the same typing**, and the brief's own mechanism says why: *"a
link is an origin plus a credential."* So the box takes whatever
somebody has and `readTyped` says what it is. Asking a person to
choose a tab first and then telling them they chose wrong is the
shape of a form that does not know what it wants.

**A link is recognised before an origin**, because every link is
also an origin and answering "origin" would throw the credential
away — the person connected to the right studio and shown none of
the work they were invited to.

**A path that is not a link is not an error.** Somebody pastes
`https://studio.example/t/chan_abc/watch` because that is what was
in their browser, and what they mean is *this studio*. The origin
is the useful half; the rest is dropped rather than refused.

**And the recently connected are above the box**, because on the
second day that is the whole screen.

## The model is shared; the storage is not

The half with the scars on it moved to `shared/src/connections.ts`:
what an origin is, what a stored list may contain, what an
installation is allowed to say about itself. `app/take/connections.ts`
keeps `localStorage` and a `fetch` from a page; the desktop
application keeps a file beside its own settings.

`asOrigin` above all. It carries two bugs found the hard way —
`ftp://studio.example` becoming a reachable host called `ftp`, and
`localhost:3101` refused as though a port were a scheme — and a
second parser would make both again. **There is now a test that
fails if that scheme regex appears anywhere outside the shared
library.**

`readConnectionList` is new rather than moved, and it is the
file-on-disk lesson arriving on this side of the product: the
browser's reader checked only that a row had an origin. Every
origin now goes back through `asOrigin` on the way *out* of
storage — which was measured, not assumed: a `javascript:alert(1)`
row written into the stored file by hand is still on disk and has
never been drawn.

`instanceFrom` separates the judgement from the transport, which
is what lets both sides share it. The browser asks with `fetch`
from a page; the desktop application asks from its main process,
because its window has no network at all. What they share is the
rule — **the origin kept is the one the device actually reached,
never the one in the answer.**

## The window still has no network

`connect-src 'none'` stays. The main process does the asking, over
one named channel, **and only to an origin `asOrigin` approved** —
nothing a person types reaches `fetch` as typed. A capture station
that could be made to fetch from anywhere is a capture station in
a room with cameras in it.

The bridge is the door T-1 said this stage would open: **four
named questions**, not `ipcRenderer.invoke`, which would expose
every channel the main process will ever have — including the ones
T-4 adds for writing video to disk.

```
connections()      what is remembered
remember(list)     remember this, and say what was kept
ask(typed)         what does the installation at `typed` offer
openExternal(url)  show this link in the person's own browser
```

`openExternal` goes through `asOrigin` too. `shell.openExternal`
hands a string to the operating system, which will happily open
`file:///` or a registered application's own scheme.

**The preload is CommonJS**, and that is not a style choice: a
sandboxed renderer's preload is loaded outside the module system,
where an ESM one silently fails to run and the window comes up
with no bridge and no error worth reading.

**The invitation opens in the person's own browser.** The Take App
at `/take/<link>` is a working recorder with its own service
worker and upload queue, and opening it inside this window would
be this application pretending to be that one. Recording here is
T-3 and T-4; until then the honest thing is to hand the invitation
to the client that already works.

## The scheme a bare host gets

**`asOrigin` now reads loopback as plain HTTP.** `localhost:3101`
became `https://localhost:3101`, which cannot reach a local studio
— and *"a local one"* is a third of what T-2 is judged on.

`originFrom` in `src/web/share.ts` has read loopback as plain HTTP
since the share cards were written — *"the proxy wins; localhost
is plain HTTP"* — and two places in one product disagreeing about
whether a laptop speaks TLS is two answers. The browser loses
nothing it had: a page served over https cannot fetch
`http://localhost` whatever this returns.

**And writing that rule found the weaker copy of it.** `originFrom`
used `startsWith('localhost')`, so `localhost.evil.example` —
somebody else's domain — was assumed plain HTTP. Not reachable
there, because that host comes from the proxy rather than from a
person typing; but a weaker copy of a rule stated twice is still
two answers, and in the new use the downgrade would be a plaintext
connection handed over by naming a subdomain. Both now match the
whole label.

## What T-2 does not build

**The QR, and it is not forgotten.** Reading one needs a camera,
and cameras are T-3 — the stage that reads `guestGrid.ts` and
`SwitchingStage.tsx` before deciding anything about device
discovery. A second camera path built in T-2 would be the *"no
third multiview"* mistake one stage early. The screen says in one
line what it needs rather than drawing a button that cannot act,
because a control that cannot act looks like a fault. [U-19]

**No listing of what a studio offers**, beyond the count and the
one invitation named. Drawing the whole listing here would be the
Take App's home screen built a second time in a window that has a
different job. [D-19]

## Measured, not claimed

Against a running installation, in the packaged shell:

```
bridge                 connections, remember, ask, openExternal
require / process      undefined / undefined
"127.0.0.1:3100"       reached; name "Owner"; one thing open;
                       remembered to ~/.config/Take/connections.json
".../take/abc.def"     "Invited to one piece of work here",
                       with the button that opens it
"javascript:alert(1)"  refused, with a sentence
"ftp://studio.example" refused, with a sentence
"127.0.0.1:3999"       could not reach it (one message for
                       refused, timed out and not-a-BalanceVid)
a `javascript:` row    written into the stored file by hand,
                       and never drawn after a reload
```

## The record

Twenty-five mutations on the shared model, all killed — and one
found a clause that had never been tested in either home.
`|| url.password` survived, and measuring showed why it must not
be deleted:

```
new URL('https://:pw@studio.example')
  username = ''   password = 'pw'
```

A URL may carry a password and no username at all, which is
exactly the shape of `https://:token@studio.example`. Reachable,
needed, and now with the fixture that says so — along with
`https://studio.example@evil.example`, whose host is the one after
the at-sign and not the one a person reads first.

**177 test files, 3355 tests**, green. `tsc --noEmit` clean on the
installation and on `desktop/`.


---

# PART EIGHT — T-3, as built

> *"Four cameras previewing at once, and a refusal with a
> sentence when a disk cannot sustain four streams."*

```
 ┌──────────────────────────────────────────┐
 │   CAMERAS ON THIS MACHINE                │
 │   [ Front ]  [ Wide ]  [ Desk · capture ]│
 │   ┌───────────────┬───────────────┐      │
 │   │ 1 Front       │ 2 Wide        │▌     │
 │   │ 1920×1080·30  │ NO PICTURE    │      │
 │   └───────────────┴───────────────┘      │
 │   BEFORE RECORDING                       │
 │   ✓ 3 sources.                           │
 │   ✕ 1 of 3 sources is open but           │
 │     delivering nothing. A capture card    │
 │     with no cable in it looks like this. │
 │   ✓ 12 GB free — about 2.7 hours …       │
 │          [ Not ready ]                   │
 └──────────────────────────────────────────┘
```

## The two multiviews, read

**`guestGrid.ts` is the right shape** — a pure reading that, given
what the tracks are doing, says what each tile shows. Its words
are taken whole: `Eye`, `Mic`, `Health`, and the rule that the
label over a picture is ONE word and the WORST one, in the order
an operator triages.

**And a test asserts the two type unions are identical**, so this
is the same vocabulary rather than one that resembles it. If one
grid ever starts saying `black` where the other says `dark`, the
product has two vocabularies for one question and the second
person to read them has to learn both.

**`SwitchingStage.tsx`** is where the numbered monitor with a
label badge comes from, and the rule that a tile is a thing you
press.

**What could not be shared, and why.** `guestGrid` reads an
`RTCPeerConnectionState` and asks the Room's thresholds about
speech. **There is no peer here and no Room.** A camera is plugged
in or it is not, and its failure is `getUserMedia` refusing.
Forcing one function to serve both would mean a `link` that is
always undefined and a speaking threshold borrowed from a
conversation that is not happening.

**And the grid is N, not four.** What carries from `guestGrid`'s
fixed count is the *reason* for it — *"a grid that changed shape
when a guest dropped would be a grid that moves under the
operator's hand at the worst possible moment"* — so the grid is
sized by the sources the operator chose, and a camera that stops
delivering keeps its tile and says so.

## One screen, two steps

CAMERAS and PREPARE are drawn together. They are separate
questions, and the answer to the second changes every time
somebody changes the first; a PREPARE on its own page is a page
the operator walks to, reads a refusal on, walks back from, and
walks to again.

## The refusal

**A sentence and a number, always.** *"Not enough disk"* is a
message somebody stares at; *"four streams need about 6.0 MB/s,
which is 9.0 MB/s with headroom, and this disk sustained
6.7 MB/s"* is a message somebody acts on — they unplug a camera,
they drop to 720p, or they record to the other drive.

**Advice, except where it is arithmetic.** A camera that gave
640×480 when asked for 1080p will record perfectly well and is a
warning; a disk that cannot keep up is not a matter of opinion.
`blocking` says which is which.

### Three faults found by running the numbers, not by a test

**The bitrate constant was 0.12 bits per pixel-frame** — 7.5 Mbps
for 1080p30, which is a static lectern and not a room with people
moving in it. Four streams came out at 3.6 MB/s, and the
consequence was worse than an inaccurate figure: **almost no disk
could fail the write check, so the refusal this stage is judged
on would never have fired.** `0.2` puts 1080p30 at 12.6 Mbps. An
estimate that is high refuses a recording that would have worked,
which costs an argument; one that is low passes a recording that
fails at minute forty, which costs the recording.

**The write refusal quoted a number it had not compared** — *"need
about 6.0 MB/s … sustained 6.7 MB/s"* and then refused, because
the comparison was against 6.0 × the margin. A refusal whose own
numbers say it should have passed is worse than no numbers.

**Three gigabytes free armed happily, reporting two minutes.** A
check that announces two minutes and calls it ready is not
protecting anybody. Nobody sets up four cameras for ten.

## The disk, measured by writing to it

There is no way to ask an operating system how fast a filesystem
is. Sixty-four megabytes in four-megabyte chunks — **a recorder
produces chunks, not a stream** — with `datasync` at the end, or
the number is the page cache's and not the disk's. That is PART
THREE's lesson in a different costume: *a measurement of the
wrong thing looks wonderful.*

`src/store/space.ts` already calls `statfs` and is **not reused**:
it is bound to `VAR_ROOT`, walks a directory to total what the
work occupies, and caches for a minute. None of that is this
question, and the one line they share is the system call. What is
taken from it is the rule it states — *"the only honest figures
are what the work occupies and what the disk has left"* — one
level sharper, because a recording also needs the disk to keep
**up**.

## The source abstraction

```
CameraSource
├── LocalCamera      (here)
├── CaptureDevice    (here, where the OS presents one as a camera)
├── NDISource        (T-6)
└── RTSPSource       (T-6)
```

**A capture card IS a camera to the operating system**, so
`CaptureDevice` is not a different opener — Blackmagic, Elgato
and an HDMI dongle all present as a video input. The distinction
is kept because an operator reads it, and because T-6's sources
genuinely are different. Telling them apart is a guess off the
label, and it is labelled as one: guessing wrong costs a word in
a badge.

**Audio is asked for and not required**, and the two have to be
separate requests for that to be true: one call for both fails
entirely when a camera has no microphone, which is most capture
cards. **What is asked for is `ideal`, not `exact`** — demanding
1080p would turn a usable 720p camera into a refusal, and the
format warning exists to carry that instead.

## Four faults found by looking at the screen

- **One camera took the full width** — 585 pixels tall at 16:9 —
  and pushed the checks below the fold, on the one screen whose
  whole argument is that you see both at once. N-4 learned this
  on the station player: *"a station page where you must scroll to
  learn what is on has buried its own answer."*
- **Pressing PREPARE showed CONNECT.** The strip marks every step
  below `BUILT_TO` as pressable and PREPARE fell through to the
  else.
- **The checks were sentences 1040 pixels wide.**
- And the fake camera's green pac-man is what proved the preview
  path end to end.

## Measured in the real shell

```
four concurrent 1080p streams   opened in 12 ms, all four live
the disk here                   12 GB free, 171–610 MB/s sustained
one camera chosen               1920×1080 · 20 fps read off the
                                live track; all five checks pass
nothing chosen                  exactly one check objects; the
                                button reads "Not ready", disabled
pressing PREPARE                shows the camera screen, both
                                names lit
```

Not headless: this is the Electron shell that ships, under a
virtual display, inspected over the debugging protocol.

## What this container cannot show

**Chromium exposes ONE fake device**, so four physically distinct
cameras is unverifiable here — the same limit PART THREE
recorded, which is why that measurement says *"one fake device
fanned out"*. Four concurrent streams were opened and all four
reported live at 1920×1080; four different pieces of hardware is
somebody's room, not this container.

**And the disk sustains 400+ MB/s**, so the disk refusal cannot be
driven through the UI. It cannot be stubbed either:
`contextBridge` objects are immutable from the renderer, so
reassigning `window.take.machine` silently does nothing — which
is the isolation working, and worth knowing before T-4 tries to
test a recording the same way.

That refusal is proven by **forty-one killed mutations on a pure
function**, including the exact case the stage is judged on, and
not by a screenshot. Said here rather than left to be discovered.

## The record

Forty-one mutations across `sourceGrid.ts` and `prepare.ts`, all
killed. **Three clauses deleted after measuring:**

- `if (!present) return 'NO SOURCE'` — the empty slot returns its
  own reading and never reaches that function. **The
  twenty-fourth.**
- `if (health === 'unstable') return 'UNSTABLE'` — unreachable
  here, because `unstable` arises only from a source with no
  picture and the clause above catches every eye that is not
  live. `guestGrid` *can* reach its own, because a peer's link can
  falter while the picture keeps arriving. **The twenty-fifth.**
- `Math.max(0, slots)` — `Array.from({ length: -3 })` is `[]` in
  JavaScript, not a throw. **The twenty-sixth.**

**And one survivor was neither a dead guard nor a missing
fixture.** With no cameras chosen the DISK check failed, blocking,
saying *"Nothing to record yet"* — a refusal that is not one, two
lines below the real one. `write` already got this right; the two
disagreed, and the mutation could not be killed because another
blocking check was failing anyway. A survivor can also mean two
checks that do not agree with each other.

**179 test files, 3394 tests**, green.


---

# PART NINE — T-4, as built

> *"Four files on disk, each with a measured start, with the
> machine offline for the whole recording."*

```
~/.config/Take/captures/cap_20261003T095216_sl0q/
  01-camera1.webm   553,766 bytes   offset  0 samples
  02-camera2.webm   553,766 bytes   offset 19 samples
  03-camera3.webm   553,766 bytes   offset 24 samples
  04-camera4.webm   553,766 bytes   offset 29 samples
  capture.json      spreadMs 0.6 · startedTogether true
```

**PART THREE's sub-frame prediction is now a recorded number.**

## The one call

A tight loop and nothing else. The recorders are **constructed
first** — building a `MediaRecorder` allocates an encoder — and
the loop that starts them does one thing, because awaiting
anything between two of them would put a task boundary, and
whatever the browser decided to do in it, between two cameras
that are supposed to be one capture.

## This is not a second `useMasterRecording`

> *"No second recorder. `useMasterRecording`'s offset and latency
> arithmetic is the one copy for every client."*

That hook answers **where was the song when the recorder
opened**, corrected by the device latency the author calibrated
— and it already says what it does with no song:
`masterUrl ? placeTakeOnSong(…) : 0`.

**There is no song here.** A capture station records a room, not
a performance against a backing track, so the question is not
*where in the master* but *how far apart from each other*. That
arithmetic is `shared/src/capture.ts`, shared because the
installation reads these offsets to place angles on one clock
(B-1) and two definitions of *how far into the capture did this
angle begin* is two placements of the same footage. The master
arithmetic stays exactly where it is, used by the clients that
have a master.

## Two instants per source

`MediaRecorder.start()` does not begin capturing at the moment it
is called — the first line of that hook's own list of errors in
play. So the **call** is when it was asked and the **first
chunk** closing is when capture demonstrably existed. Both are
written down; the offsets are computed from the second.

### The clock, measured rather than assumed

The audio clock is the right clock for anything relating to
audio playback, and `useMasterRecording` is right to use it. It
is the wrong clock for this:

```
4000 reads in a tight loop
  AudioContext.currentTime     1 distinct value
  performance.now()           17 distinct values
```

A clock that cannot tell two events in the same task apart
cannot measure a sub-millisecond spread.

## Segments, appended

Four seconds, the same as every other recording in this product,
and each one appended to its angle's file as it arrives — so the
file on disk is always as long as the recording is. A crash at
minute forty leaves forty minutes.

**Appended rather than numbered-then-joined**, which is where
this differs from the browser's sink, and the reason is the
destination. The Take App numbers its chunks because they travel
over a network that drops them and arrive out of order; a local
disk does neither. What a join would buy here is a second copy
of every file at the end of a recording, on the disk whose free
space PREPARE just finished worrying about.

## The correlation check

> *"correlation is offered as a check on the measured start,
> stored beside it, never silently replacing it."*

`measureAlignment` is reused, not rewritten: same onset envelope,
same centred search, same hard-won fix about searching **either
side** of the hint rather than before it.

**And its gate is `align.ts`'s own question, which was the
fault.** A lower threshold was written here first — and
`measureAlignment` returns `offsetSamples: masterAudible ? fine :
hintSamples`, so **below `MASTER_AUDIBLE_THRESHOLD` it hands the
HINT STRAIGHT BACK.** A check gated beneath it would have
recorded, between 0.3 and 0.6, an agreement between the clock and
an echo of itself: a tick beside every angle, meaning nothing.

A check is not a correction, and `align.ts` says why in its own
words: a blind search *"is both slow and a good way to land
confidently on the second chorus."* The measured start came from
the machine that did the recording; the correlation came from a
search over a few seconds of room noise read on a frame timer.
Where they disagree, that is worth telling somebody. It is not
worth silently preferring the search.

**And a fixture that modelled the wrong thing.** The
disagreement case padded the probe with silence — which models a
camera that started EARLY, and `align.ts` clamps that to zero
because *"where the take's first sample sits on the master
clock"* cannot be negative. A camera that starts late records
the room **from** 120 ms in. The test failed for the right reason
on the wrong signal.

## Measured, not claimed

```
four angles from one call
  spread                  0.6 ms
  offsets                 0, 19, 24, 29 samples at 48 kHz
  startedTogether         true
  files                   4 x 553,766 bytes + capture.json
  each angle carries      calledAtMs and firstChunkAtMs — what
                          the offset was derived from
network during a take     none, watched at the window
```

**Offline is structural, not observed.** The renderer's policy is
`connect-src 'none'` and the only `fetch` in the application is
in the main process behind `take:ask`. Nothing the window could
do during a recording would reach a network; the request count
confirms what the policy already guarantees.

## A container limit found by hitting it

**Four concurrent recorders at 1280×720 stay in `recording` and
deliver nothing here.** At 640×480 all four deliver; one at 720p
is fine; two at 720p are fine.

```
1 x 1280x720   546 KB
2 x 1280x720   337 KB, 334 KB
4 x 1280x720   nothing at all
4 x  640x480   421 KB each
4 x  320x240   271 KB each
```

That is this machine's CPU and not the code — PART THREE
measured eight recorders at 640×480 and the boundary is
consistent with it. The four-angle capture above was taken at
640×480 for that reason, and the spread it measured is the
number that mattered.

## The record

Twenty-four mutations on `capture.ts` and eight on `check.ts`,
all killed. **Two clauses deleted**: an empty reference and an
empty probe both correlate at zero and are already refused by
`masterAudible`. **The twenty-seventh and twenty-eighth.**

**And one guard kept that mutation cannot kill.**
`rooms.length < 2` changes nothing observable, because
`rooms.slice(1)` is already empty — but it is what makes
`rooms[0]!` *true* rather than an assertion about an array that
might be empty. `registry.ts` kept its `usableNumber` filter for
the same reason: *"it is what makes the return type true."* A
guard that only narrows a type cannot be judged by mutation
alone.

**181 test files, 3420 tests**, green.
