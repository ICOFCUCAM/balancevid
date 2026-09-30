# Studio Three — the Channel

*The brief, as given. Amend by extension only.*

> **Online TV must never duplicate media merely because it is scheduled for
> broadcast. A scheduled programme references an existing media asset. Only
> live ingest and explicitly requested recordings create new media assets. The
> playout engine continuously reads scheduled assets and produces the
> broadcast stream.**

---

## §1 — What a channel is

A third root document beside the Conversation and the Performance, and the one
that owns nothing.

Studio One answers media. Studio Two makes media. Studio Three **schedules**
media that the first two finished. It has no takes, no master clock, no
render, and no upload: its entire content is a list of references and the
times they go out.

They share everything below the document — assets, the queue, layouts, export
profiles, the publication system — exactly as the first two already do.

## §2 — The clock is the wall

Every other clock in this product is relative to a piece of media: a source's
timecode, an output's frames, a song's samples. A channel's clock is the time
of day, and it is the only clock here that keeps running when nobody is
looking at it.

Consequences that are not optional:

- A programme's time is stored **as an instant, with a zone offset**. A time
  written without one is read in whatever zone the server happens to be in,
  and the failure is silent: the picture is right, the clock is right, and the
  programme goes out an hour early.
- A channel carries **the zone it is read in**. Breakfast is breakfast where
  the channel is, not where the server is.
- The order of the schedule is **derived from the clock**, never stored.
- **Two programmes cannot overlap.** Unlike a gap — which the filler answers —
  an overlap has no answer: the engine would have to pick, and a machine
  picking which programme goes out is not a schedule. It is refused at the
  door.

## §3 — A programme is a reference

A scheduled programme names:

- which studio made the thing (`conversation` or `performance`),
- which document,
- which render of it, by plan hash.

Or it names a live ingest. Or it names **other media** — the third branch of
the brief's library diagram: an ident, a caption card, a photograph, an
announcement slide. Real channels are half made of these, and a schedule that
could not hold one would send somebody back to a video editor to make a
ten-second title. It lives in `var/library/`, beside the two studios' work
rather than inside whichever channel used it first, because the second channel
that wants the same ident must reference it too.

That is the whole of it. There is no field for a path, a copy, or a staged
file, and there is no operation that creates one. Scheduling one film into
thirty slots makes thirty programmes and no files at all.

**Unscheduling deletes nothing.** The channel never made the file, so the
channel never removes it: dropping a breakfast repeat must not delete the
performance its author spent a week on.

**A reference is checked against disk once, at the door**, where somebody is
looking at a screen — not in the domain, which does not read files, and not in
the playout engine, which is too late because by then it is nine o'clock.

## §4 — The rotation, which is why the channel is always online

> *When the schedule reaches the end: it continues from the beginning. So your
> channel is always online.*

    00:00  Music Video — Everlasting Love
    04:17  History Discussion
    28:42  Music Video — Performance 2
    33:10  Documentary Response
    ...

**Those are not times of day.** They are where each item falls in a sequence
that plays back to back and then starts again — so a rotation entry carries a
DURATION and no start at all. Its start is the sum of what comes before it,
derived on every read. Moving an entry to the top moves everything after it,
and nobody edits a clock.

**The wrap is a modulus**, `(now − anchor) % turn`, and expressing it that way
is what makes the channel correct after a restart: there is no cursor to lose,
so a process that comes back up computes the same answer the old one would
have. A cursor would be a second clock, and a second clock is a thing that
stops.

**A rotation cannot have a gap**, because there is nothing between the end of
one entry and the start of the next. That is the brief's promise, and it is
stated in code as the function that would have to return something for it to
be untrue: `deadAir` returns nothing at all for a channel with a rotation.

**Three layers, in this order:**

| | beats | because |
|---|---|---|
| **live** | everything | the one thing a red button is for is interrupting what was going out |
| **programme** | the rotation | the nine o'clock news is at nine |
| **rotation** | — | it is always there |

One function decides it — `whatIsOn` — because "what is on air" asked in three
places is three places that can disagree, and the one that matters is the
playout engine, which is the only one nobody is watching.

## §5 — Filler, and the holes it covers

Dead air is the one thing a channel must never broadcast by accident, and a
schedule with a hole in it looks exactly like a schedule without one until the
moment it goes out. So:

- The holes in any window are **derived and shown** before they happen.
- A channel may name **filler**: a reference like any other, played and looped
  through whatever is not scheduled.
- Filler cannot be a live feed. A fallback that can itself fall over is not a
  fallback.
- A programme that is shorter than its slot **runs out**, and the engine says
  so rather than papering over it. Unless it is set to loop, which is what a
  ten-minute film in a thirty-minute slot is for.

## §6 — Two modes, and the step between them

    PROGRAM                    LIVE
    Scheduled                  PROGRAM → TAKE LIVE → YOU → GUEST
       ↓                               → VIDEO → YOU → END LIVE
    Content                            → PROGRAM RESUMES
       ↓
    Repeat

**PROGRAM is the ordinary condition of a channel**: the loop is running, a
fixed slot pre-empts it when one is due, and nobody touches anything.

**LIVE is somebody taking control**, and it is reached in two steps, not one.

| | | |
|---|---|---|
| **GO LIVE** | arms | the camera comes up, the encoder starts, the operator sees their own preview — and the wire is still showing the schedule |
| **TAKE LIVE** | cuts | this is the frame the channel changes |
| **END LIVE** | returns | PROGRAM resumes, where the clock says |

*"That transition needs to be extremely reliable."* Which is exactly why there
are three states and not two. A single button that opened a camera AND put it
to air would broadcast the first second of every live show as a black frame
while a device negotiated. This is the preset/program discipline every vision
mixer has had for sixty years, and it is here for the same reason it is there.

**The rest of the control bar:**

- **NEXT** cuts to the next item in the loop now. It moves the rotation's
  anchor rather than editing anything, so the loop is intact behind it. It
  jumps every viewer, which is what pressing Next in a control room does.
- **EMERGENCY** beats everything, **including the red button**. That is the
  one ordering decision worth arguing about, and it is not close: the moment
  you need this button is the moment the thing on air must stop being on air,
  and more often than not the thing on air is somebody live. It does not end
  the live session — it is a cut away, and clearing it is a cut back.

## §7 — Going live

> *You press GO LIVE. The scheduled programming stops or pauses. You appear in
> the live studio... Then End Live, and the scheduled channel automatically
> resumes.*

**It pre-empts; it does not edit.** The schedule goes on being the schedule and
`whatIsOn` simply stops consulting it while the red light is on. A broadcast
that rewrote its listings to go live would be a broadcast whose listings were
wrong afterwards.

**"You can bring people into the room" is the room that already exists.** The
Conversation Room — invitation by link, participants in the room and on the
stage, automatic speaker switching with hysteresis (ROOM, D-17) — is named by
the live session rather than rebuilt. A second room would be a second place
invitations, staging and speaker detection could disagree.

**Rolling something in is a reference like every other reference.** A Studio
One conversation, a Studio Two performance, an ident, a caption card: while it
is up it is what goes out and the feed is underneath it. Taking it down
returns to the room with nothing re-cued, because nothing was ever cued — the
feed never stopped, the channel just stopped looking at it.

**It resumes where the clock says, not where it paused.** An hour of live
television means the rotation has moved an hour on, exactly as it does on any
broadcast channel, where the nine o'clock film starts at nine whether or not
the news overran. Resuming where it paused would make the channel drift
further from its own listings after every live show — and the listing is what
viewers were told.

**And the feed becomes an ordinary asset.** What went out live can be
scheduled afterwards like anything else: a repeat of last night's live show is
a reference, not a copy.

## §8 — Live media is temporary unless you say otherwise

    Camera → Microphone → Live ingest → Broadcast encoder → Online TV

> *If you choose "Save this live session", it becomes an archived recording.
> If you don't, the temporary live buffers are discarded after the broadcast.*

| | |
|---|---|
| Scheduled content | stored once |
| Live broadcast | temporarily processed |
| Live recording | saved only if you choose |

**A live ingest writes to a BUFFER, not an asset.** The buffer lives under
`live/`, never `assets/`; INV-17 does not count it, because it is not an asset
until somebody says so. This was wrong in the first version — an ingest minted
an asset id the moment the red button was pressed, which made every live
broadcast a permanent file whether or not anybody wanted one. A channel that
keeps every second it ever transmitted is the duplication rule broken from the
other end, arriving by a different door.

**Save is a decision, not an action.** It can be pressed before the cut,
halfway through, or in the last minute, and what happens because of it happens
when the broadcast ends — so pressing it at 20:40 keeps the whole show, not
the twenty minutes that are left. It can be un-pressed.

**Promotion is a rename, not a copy.** The bytes do not move and are not
re-encoded; the file crosses from `live/` into `assets/` and acquires an asset
id. The alternative is an hour of video being copied at the exact moment
somebody has just finished presenting and wants to see whether it worked.

**And the ingest stays in the document either way**, because it happened — but
without an asset there is nothing to schedule against it, which is correct:
there is nothing left to play.

## §9 — Live ingest

The first of exactly two things that make media here, because it is the one
kind of programme that did not exist until it was broadcast.

An ingest is a **first-class entry on the channel**, not a property of a
programme: it outlives the programme, because a feed that ran for three hours
and was scheduled into two of them is one asset and two slots. Once closed it
is an ordinary asset and can be scheduled like anything else — a repeat of
last night's live show is a reference, not a copy.

**One at a time.** Two open ingests are two things claiming to be "the live
feed", and a programme pointing at one of them cannot say which. A second
camera is a second channel, or it is a mix made upstream.

**Its length is measured, not subtracted.** A feed that dropped for ninety
seconds was open for an hour and is fifty-eight and a half minutes long.

## §10 — Recordings somebody asked for

The second and last thing that makes media. A recording names **who asked**,
because a channel that quietly kept everything would break the duplication
rule from the other end and nobody would be able to say who decided that.

## §11 — The playout engine

> *The playout engine continuously reads scheduled assets and produces the
> broadcast stream.*

**Reads.** The engine is a pure function from a schedule and a stretch of time
to a list of READS — which reference, from where in it, for how long, landing
where. It never names an output, because the moment a playout engine can name
a file, somebody will make it write one.

A broadcast is the hardest thing in this codebase to test, because it is a
thing that happens at a time and you cannot wait until Tuesday to find out
whether Tuesday works. Separating *what should be going out at instant T* from
*put it on the wire* makes the first a table of inputs and expected outputs.
Every scheduling fault worth having lives in the first.

**The stream** is HLS: four-second MPEG-TS segments, indexed against the epoch
so every viewer computes the same boundaries, and a rolling window of six in
the playlist. Segments are produced two ahead of the playhead and swept behind
it. They live in `stream/`, never in `assets/`.

**Every segment is encoded identically**, whatever it came from. A stream
whose codec parameters change at a programme boundary is a stream every player
stalls on, and "it only breaks at nine o'clock" is the worst kind of fault to
be handed.

**Off air is something, not nothing.** A channel with a hole must still put
four seconds on the wire, or every player treats the gap as the end of the
stream and stops. Black and silence — which is also the honest picture.

**And the engine is a process, not a job.** See D-18.

## §12 — What is published

A channel publishes its **stream**, not its schedule and not its media. The
programmes it references belong to the documents that made them, and their own
publication rules still apply: INV-15's rights gate is a fact about a
performance, and scheduling it on a channel does not launder it.

---

# Appendix C — what implementation taught

*(Added as stages land, as Appendix S does for Studio Two.)*

## C-1 — Stage 1: the document, the engine, and the wire

**The rule is a type, and then it is a number.** D-18 is enforced first by
there being no field on a `Programme` that could hold media, and second by
`referencedAssets()` — which returns the DISTINCT references a schedule makes,
so "thirty broadcasts of one film" can be asserted to be one. A claim about
disk needs something that can be counted; that function is what makes the
architecture testable rather than merely intended.

**INV-17 is asserted against disk, not against the document.** Checking the
document would prove only that TypeScript works. What can actually go wrong is
a *writer*: some future job that "prepares" a programme by putting a file where
the channel can reach it. So the invariant is handed the contents of the
channel's own asset directory and insists that every file there belongs to a
live ingest or to a recording somebody asked for.

**The second half of INV-17 is the fault that actually happens.** A programme
whose render was deleted is not a copy — it is a slot that will go out black,
at whatever hour it was scheduled for, with nobody watching. So a missing
reference is reported on every read of the channel and drawn in red on the
listing. It is the one fault a schedule cannot show by looking right.

**One place a reference becomes a path.** `playoutSources.pathFor` is the only
crossing between the world of references and the world of files, and it
resolves into the studio that made the render. The channel's own directory is
never consulted, so a schedule cannot even accidentally be served from a copy
it owns.

**The engine had to be pure before it could be right.** Looping — ten minutes
of film filling a thirty-minute slot — is modular arithmetic over the slot,
and joining that loop halfway through has to land halfway through a pass. That
is an off-by-one you find in a unit test in a second or in a broadcast in a
month.

**Segments are aligned to the epoch, not to the schedule.** Aligned to the
first programme, the boundaries would move whenever somebody edited tomorrow's
listings — a live stream that stutters when the schedule is touched. Against
the epoch, every viewer of every channel computes the same boundaries and a
reconnecting player lands on a segment that already exists.

**The sweeper is load-bearing.** It is what makes the segments transport
rather than an archive. Without it the stream directory becomes the entire
broadcast re-encoded forever, which is D-18 broken by a housekeeping omission
rather than by a design decision — the worst way to break a rule, because
nothing in the code says that is what happened.

**`-map 0:a:0?` looks like it handles a silent source and does not.** It
produces a piece with no audio track, which concatenates into a stream whose
audio appears and disappears at programme boundaries. Where the audio comes
from is decided from a measurement instead — probed once per file and cached,
because a channel asks about the same film every four seconds for an hour.

**And the probe had to be the cheap one.** `render/probe.ts` counts frames,
because everything downstream of it must be frame-exact (INV-02). A playout
engine needs to know how long a film is so a loop comes round in the right
place, and counting seventy thousand frames to learn that would put a minute
of work in front of a segment that has four seconds to be ready.

**The monitor is not the transmission, and says so.** Playing the real stream
needs an HLS player library in every browser but Safari. Rather than pretend,
the studio shows the referenced media seeked to where the schedule says the
channel is — which is what a playout monitor has always been, a desk's
confidence check — and prints the transmission's URL beside it.

**The bar became shared on the day there were three studios.** Two copies of a
navigation bar is a place for the tabs to go out of date; three would have
guaranteed it, and the first symptom would be one studio knowing about another
that the others do not.

## C-2 — Stage 2: the loop, the red button, and the third branch

**Measured against the brief, three gaps and no rewrites.** The storage rule,
the reference model, INV-17, the engine and the wire were already what the
brief describes and are untouched. What was missing was the part the brief
liked most.

**The schedule I built was a grid; the brief describes a rotation.** Fixed
wall-clock slots with gaps and filler is how broadcast scheduling is usually
modelled, and it is the wrong default for "so your channel is always online" —
a grid's natural state is a hole. The rotation is now the base layer and the
grid is an overlay on top of it: `live` beats `programme` beats `rotation`.
That is how real playout works, it makes dead air structurally impossible, and
it made `filler` almost redundant on the day it arrived.

**The offsets are derived, and that is the feature.** `00:00 / 04:17 / 28:42`
is a column somebody would otherwise have to keep in agreement by hand. Moving
an entry to the top moves everything after it and nobody edits a number.

**The modulus is what survives a restart.** A cursor that ticks is a second
clock, and a second clock stops when a process does. `(now − anchor) % turn`
means a playout engine that comes back up computes the same answer the one
that died would have — which is also why the anchor is set once, when the
first entry goes in, and never moved: moving it would jump every viewer to a
different programme.

**And `%` keeps the sign of the dividend.** An instant before the rotation was
created landed on a negative offset and index −1. A channel is a loop with no
beginning as far as a viewer is concerned, so the modulus is made positive and
the rotation is treated as having always been running.

**Going live is pre-emption, not an edit**, and that distinction is the whole
design. The first sketch cleared the schedule; the second paused it. Both are
wrong for the same reason: the listing is what viewers were told, and a live
show must not change it. `whatIsOn` stops consulting it, and afterwards the
rotation is where the clock says — an hour of live television means the loop
has moved an hour on, exactly as it does on any channel where the nine o'clock
film starts at nine whether or not the news overran.

**"Bring people into the room" was already built.** The Conversation Room has
invitations, staging, speaker detection and a WebRTC mesh. A live session
names one. Building a second room would have meant a second place invitations
and staging could disagree, and the failure would have surfaced live.

**A still needed its own branch in the encoder.** A caption card has no clock,
so seeking a JPEG four seconds in produces nothing at all — which on air is
black where a station ident should be. `-loop 1` holds the frame for the slot
with silence underneath. The probe cache needed the same exception, or an
image cached as "unmeasurable" and went out as black.

---

## C-3 — Stage 3: the buffer, and the control room

**The live model was wrong and the brief caught it.** `openIngest` minted an
`assetId` the instant the red button went down, which made every live
broadcast a permanent file. Nobody had asked for that; it was a default. It is
now a `bufferId` under `live/`, and an `assetId` appears only when somebody
chooses to keep it — at which point the buffer is *renamed* into `assets/`,
which costs nothing and is the whole difference between a buffer and an
archive.

**INV-17 got stricter without changing its sentence.** Its allowed set used to
be "every ingest's asset"; it is now "every ingest that was SAVED". A channel
still holding the buffer of a session nobody kept now fails the invariant,
which is the brief's rule enforced rather than described.

**Two steps to air, not one.** ARM and TAKE are separate because *"that
transition needs to be extremely reliable"*, and one button that opens a
camera and cuts it to air broadcasts the first second of every live show as a
black frame while a device negotiates. Sixty years of vision mixers agree.

**EMERGENCY beats live**, and that is the ordering decision in this stage
worth writing down. Every other pre-emption in this document is about what was
planned; this one is about what has gone wrong, and a button that could not
interrupt a live broadcast would be a button that did not work when it was
needed.

**NEXT moves the anchor.** The loop's position is `(now − anchor) % turn`, so
pulling the anchor back by whatever is left of the current entry puts the next
one at this instant and leaves the loop intact. No entry is edited, nothing is
reordered, and the channel is still the channel afterwards.

**The document is written before the bytes are touched.** If the process dies
between them, the document says what should have happened and a sweep can
finish it. The other way round, the bytes would be gone and the document would
still be promising a recording.

---

## §13 — The channel's identity

> *The station branding should be applied at the broadcast layer, not
> permanently burned into your source videos. That way you can change your
> channel identity later.*

That sentence is the design, and it is the Representation Rule again (D-16). A
bug in the corner is a property of the CHANNEL, not of the film: burning it in
would make that render un-broadcastable anywhere else and would mean
re-rendering a library to change a logo.

So the identity is a small table on the channel — station bug, LIVE
indicator, lower thirds with NOW and NEXT, a presenter's name, an ink colour
— the segment encoder draws it over whatever it is putting on the wire, and
changing it changes every future second without touching a stored file.

**The LIVE lamp is drawn only when the channel is actually live.** It is the
one piece of station branding that would be a lie rather than a decoration,
and it is the piece every viewer checks.

**What to draw and how to draw it are separate.** `identity.ts` returns marks
— text, corner, opacity, size — and knows nothing about ffmpeg; the encoder
turns marks into filters and decides nothing. That is what lets the whole
identity be unit-tested without producing a frame.

**Black still wears the marks.** A viewer who joins during a gap should see
whose channel they have joined.

---

## §9 — When the feed fails

    LIVE FAILURE → BACKUP VIDEO → MUSIC LOOP → NEXT SCHEDULED PROGRAM

> *The viewer should never see your FFmpeg error or a dead screen.*

**The failover is automatic, and it switches nothing.** The playout engine
watches the live buffer; when it stops growing for ten seconds the session is
MARKED faulted, and `whatIsOn` stops consulting it. The channel then resolves
what it would have resolved anyway — the backup, then the loop, then the next
scheduled programme. There is no state machine, no timer and nothing to reset,
because the chain is only the ordinary resolution happening again.

**It watches the file, not the network.** The encoder is in somebody's browser
on the other side of the world and cannot be asked; what can be observed is
whether bytes are landing. A connection that is up and delivering nothing is a
failure with a green light on it.

**Ten seconds, inside the twelve-second delay.** The failover happens before
the last of the good buffer has gone out, so the cut to backup lands on a
picture rather than after one has frozen.

**It marks, it does not end.** A presenter whose wifi dropped for twenty
seconds has not finished their programme, so the moment bytes resume the fault
clears and they are back on air. The backup holds for a minute: long enough to
come back to your own broadcast, short enough that one nobody is coming back
to becomes an ordinary channel again.

**TAKE PROGRAM** is the operator's version of the same thing — an immediate,
deliberate return to the schedule.

---

## C-4 — Stage 4: the pipe, the station, and the marks

**The gap was the pipe and it is closed.** A live session was modelled,
scheduled, pre-empted, delayed, swept and invariant-checked with nothing
arriving. `POST /api/channels/:id/live` is what arrives.

**It appends; it does not assemble.** The other two studios collect numbered
chunks and join them when the take is finished. A broadcast is never
finished, so the chunks are not collected: each is appended to one growing
file the playout engine is reading four seconds behind. That works because of
what MediaRecorder writes — a header chunk and then continuation clusters, so
appending in order produces a stream a decoder can follow.

**There is no retry and no reordering, deliberately.** A chunk that arrives
late has missed the broadcast, and inserting it would corrupt a file being
read right now. Live is the one place in this product where "later" means
"never", so a failure counts itself and the studio says the feed is
struggling.

**A live feed cannot be read ahead of itself.** The engine produces segments
two ahead of the playhead, which is fine for a film and impossible for a
camera that has not recorded the next eight seconds. So live content is read
from twelve seconds ago — the run-ahead, the chunk interval, and room for a
browser that hiccups. That is the glass-to-glass delay every HLS channel has,
declared here rather than discovered as a stutter.

**A segment with nothing in it is worse than black**, and it took the pipe to
find that out. ffmpeg can exit successfully having written no packets, and
the commonest cause is reading a live buffer past its end — which happens
whenever the camera falls behind, and it will happen. A player handed a
zero-byte segment stalls and often gives up on the stream; one handed four
seconds of black carries on and recovers. The length is now checked before
the segment reaches the wire.

**Blocks are what make it a station.** A station does not decide at eleven
minutes past nine what to play; it decides that the morning is music. A block
is a named stretch of the day with its own loop, and the overnight one carries
past midnight, which is how a schedule printed in a newspaper has always read.
Its time of day is resolved through `Intl` in the channel's own zone, because
arithmetic on the instant is wrong twice a year and the bug is unreproducible
in summer.

**A booked live slot references an intention, not media.** It costs no asset,
and when nobody turns up it falls through to whatever would have been on — a
listing cannot make somebody turn up, and a channel that went to black at
nineteen hundred because its presenter was late would be punishing the viewer
for it.

**Three ffmpeg filters segfault on this platform's static build** — the concat
demuxer over MPEG-TS, `signalstats`, a one-pixel scale, and rawvideo output.
The test that asks "is there a picture on the wire" ended up comparing the
live segment against a slate encoded by the same encoder in the same second,
which needs none of them and answers the actual question.

---

## C-5 — Stage 5: what was already there

Measured against the architecture brief before anything was written, which is
D-19 applied to the message that produced D-19.

**"The browser is the control panel; the server is the broadcaster" was
already true**, and not by luck — it is U-23 ("the web tier never runs
ffmpeg") plus the decision in C-1 to make playout a process rather than a
queued job. Close the laptop and the channel continues, because nothing the
channel needs is in the page. Going live makes the browser an INPUT, which is
why the live buffer is a file on the server rather than a stream the page owns.

**The five seams were already open.** `paths.ts` is one module for storage,
the playout engine holds no state, segments are static files under a plain
URL, and live ingest is one route that shares nothing with the rest of the web
tier. None of the separation is built; nothing has been welded shut. They are
written down in D-20 so the next person does not have to rediscover them.

**The one real gap was automatic failover.** EMERGENCY existed and was manual,
which is a button for a person who is watching — and the case that matters is
the one where nobody is. That is now `faultLive`, driven by the playout engine
watching a file stop growing.

**And the failover resolves rather than switches**, which is why it is four
lines in `whatIsOn` and not a state machine. A faulted feed is simply not
consulted; everything after that is the channel doing what it always does.
The brief's chain — backup, loop, next programme — needed no sequencing code
at all, because it was already the order of resolution.

---

## §14 — Guests on the broadcast stage

    YOU  →  YOU + SARAH  →  SARAH  →  SOURCE VIDEO  →  TRIPTYCH

The Conversation Room has the people: invitation by link, participants in the
room and on the stage, manual and automatic speaker switching with hysteresis,
and a mesh that hands back a stream per person (ROOM §4, §6, D-17). The
encoder takes one stream. The mixer is what makes one out of several, and it
is all it is: it connects to nobody, decides who is on stage for nobody, and
invents no geometry.

**It draws from `LAYOUTS`.** A quad on the broadcast stage and a quad in an
export are one table, so a broadcast and a recording of it cannot drift apart.
The arrangement is chosen by headcount and overridable, which is what a vision
mixer is.

**A canvas, not a server mix.** Mixing on the server would mean every camera
travelling to it, being decoded, composited and re-encoded — an SFU and a
rendering farm, for a room of three. The browser already has every stream
decoded; drawing them into a canvas costs one composite per frame and produces
exactly the single feed the encoder wants. D-14 says an SFU comes later, and
this is why it can.

**Every microphone is mixed, not just the one on screen.** A guest speaking
over a picture of somebody else is still speaking, and a broadcast that muted
them until the vision cut would clip the first word of every answer. Who is
SEEN is the Room's decision; who is HEARD is everybody.

## §15 — Distribution

See D-21. One programme, many audiences; each destination its own shape and
its own composition; every platform a connector; and the first implementation
activates only this channel's own output.

---

## C-6 — Stage 6: the mixer, and the outputs

**Checked first, and most of it existed.** The Room had the people, the
staging and the switching; `LAYOUTS` had the geometry; `useRoomMesh` had the
streams. What did not exist anywhere was a browser-side compositor — grep for
`captureStream` found two unrelated uses and no mixer. So one new hook, and
two existing systems joined rather than re-implemented.

**The mixer draws, and nothing else.** Every temptation to make it clever was
somebody else's job: who is on stage is the Room's, which arrangement is the
layout table's, who is connected is the mesh's. What is left is a draw loop
and an audio graph, which is the whole of it.

**The draw loop must not restart when somebody joins.** A restarted
`captureStream` is a new track, and a new track mid-broadcast is a gap in the
recording — so the sources live in a ref and the loop reads them, rather than
the loop being rebuilt when they change.

**The encoder had to stop owning the camera.** It opened `getUserMedia`
itself, which was right when it was the only thing that needed a picture and
wrong the moment a mixer also did — two red lights for one broadcast. It now
takes a stream when it is given one, and only stops tracks it opened.

**Distribution is declared and mostly unimplemented, on purpose.** Every
destination is a row with a shape and a layout; only the channel's own can
send. A platform behind an app review reads NOT CONNECTED rather than ON,
because "on" with nothing arriving is the screen that loses a broadcast.

**And the vertical output is a layout, not a crop.** `broadcast_vertical` sits
in the same table as `performance_quad`, which means it reframes, renders and
is chosen by exactly the code that already handles every other arrangement.
Adding it cost eight lines and no new concept, which is the point of having
had a layout table for the last two studios.

---

## §16 — The control room

> *"Study this benchmark live studio closely. The containers, shapes and
> sections."*

The studio is a **place**, not a page. It has a fixed geography, and the
geography is the argument:

```
┌──────────┬───────────────────────────────┬──────────────┐
│ PLAYLIST │  PROGRAM OUTPUT   │ PREVIEW   │  LIVE STUDIO │
│ LIBRARY  │                   ├───────────┤  Camera      │
│ SCHEDULES│                   │ MULTI-VIEW│  Guests      │
│          ├───────────────────────────────┤  Screens     │
│          │  24/7 SCHEDULE — timeline     │  Graphics    │
└──────────┴───────────────────────────────┴──────────────┘
 ● 00:15:32 ▮▮▯  ■ ▶ ▶|  TAKE LIVE  ⚠ EMERGENCY  ▮▮▯  OUTPUT
```

Read left to right it is **what there is → what is going out → who is on it**,
with the irreversible buttons along the bottom where a hand rests and nothing
else can be hit by accident. The page itself never scrolls; each column
scrolls inside itself, because a control room where the transport slides off
the bottom is a control room you cannot cut with.

**PROGRAM and PREVIEW are two pictures of two different moments.** Program is
what `whatIsOn` says right now. Preview is what you are about to cut to —
which, while a session is armed, is the live feed. That is the whole of the
ARM → TAKE discipline expressed as geometry, and it is why the studio has two
monitors rather than one large one.

**The multi-view is a control surface, not decoration.** A tile does the
thing that tile IS: a source rolls in over the live feed, a camera takes the
roll-in back down — the only thing "cut to camera" can honestly mean here,
because who is SEEN in the mix is the Room's decision (ROOM §4) and not a
gallery button's — and Graphics opens the identity controls. A tile that
cannot be used is dimmed rather than hidden and says why in its title: an
operator watching six sources needs to see the one they cannot cut to as
much as the ones they can.

**And it is an answer.** Six numbered tiles: the
operator's camera, the Room's staged guest, each other studio's most recent
render, whatever the schedule has on, and the identity layer. A tile's blue
border means CONTRIBUTING — it is computed from `whatIsOn` and the mixer's
source list, never from a click, because a tile that lit up when you selected
it would be a tile lying about the transmission.

**The timeline is walked, not laid out.** At each instant the lane asks the
same `whatIsOn` the playout engine asks, and the answer's own end is where the
next question goes. A lane drawn from the programme list alone would be a lane
that lies about every gap the loop fills — and the gaps are most of a
channel's day. Four lanes, because four things leave the building: the
programme, the frames, the marks and the sound.

**A toggle is named for what it does.** The benchmark's `Auto-play` was
copied here and was a lie in one word: it plays nothing, it pins the
timeline window. Nothing on this page can stop the channel, and a control
room whose most prominent toggle looks like a transport control is one
somebody reaches for in a hurry. It says **Follow clock**.

**Every region is a picture of something that already existed.** [D-19] The
playlist is the rotation; the library is `/api/channels/library`; the
schedules are `programmes` and `blocks`; the virtual sets are `SPACES` and
`SPACE_LOOKS`, Studio Two's own table; the meters are `measureVoice`, the
Room's own measurement, with twenty lines of `AnalyserNode` plumbing its own
header said it deliberately did not contain. The genuinely new things are
three: the tab strips, the multi-view, and the extra timeline lanes.

**The tab strip is one component.** Three places use it — the rail, the
schedule views, the live desk — and a strip copied is a strip that gets a
different underline in one corner of the room and looks like a different
product. The same reason `StudioBar` is one component.

**The bar's tab is "Online TV", not "Studio Three".** The other two are named
for being studios, because that is what somebody working in them is doing.
This one is named for what a viewer sees, because a channel is the only one of
the three that exists while nobody is in it.

**The output count includes the channel.** The playout engine writes this
channel's HLS whether or not anybody declared a destination row, so
`Stream Output` counts that one plus whatever else is switched on. A control
room reading "0 outputs" while transmitting would be lying about the
transmission.

---

## C-7 — Stage 7: the benchmark, and the clock that would not hydrate

**Checked first; almost nothing was missing.** Mapping the benchmark's twelve
regions onto the code found eleven already built and tested — the twelfth was
a level meter, and `measureVoice` was waiting for it. The work was
arrangement, not construction, which is what D-19 is for.

**A control room is one long argument about what time it is.** The clock, the
elapsed counter, the playhead and which programme is on all come out of one
number. Server-rendered at T and hydrated at T+1s, that number differs and
React throws away the markup it was handed (#418). The fix is to pass the
server's instant down as a prop, so the browser's FIRST render is the
server's render exactly and the second one, a tick later, is its own. A page
whose whole content is time-dependent cannot be hydrated any other way.

**`.row` wraps, and a head is one line.** The shared row class sets
`flex-wrap: wrap`, which is right for a form and wrong for a title bar: a
wrapped head pushes into the panel below it, and a wrapped transport puts
EMERGENCY on a second line. Every strip, head and transport group says
`nowrap` and truncates instead.

**A poster in a three-pixel cell is a fetch nobody can see.** The filmstrip
lane draws a frame only for segments long enough to show one. The rest are the
striped ground, which is what a filmstrip looks like at that zoom anyway.

**The graphics lane tells the truth about eight seconds.** With lower thirds
set to `at-start` the marks are eight-second ticks at each join, not a bar
across the day — so the lane is drawn as ticks on a dashed ground, and the
gutter says `8s at each join`. The benchmark's single wide purple block is
what `always` looks like, and the lane draws that too.

## §17 — Who may watch

> *"A published conversation is a Class A source. Anyone can open it."* [U-31]

A channel gets the same clause and it needs a different shape, because the
thing being published is not a file.

**Publishing moves no bytes.** The playout engine was already writing
segments; publishing decides who may fetch them. A channel that copied itself
on being published would be D-18 broken at the last possible moment — after
the schedule, the loop and the live buffer had all been careful about it.

**A channel publishes as a channel, not as a render.** Every other document
carries a `Publication` with a `planHash`, and it carries one because somebody
following a link must watch a finished video rather than a document that may
change under them. A channel breaks that on purpose: it has no render and
never will — it is a clock, and changing under the viewer is the point of one.
So it gets `ChannelPublication`, shaped so `accessTo` reads it without knowing
which kind of document it came from. Loosening `planHash` to optional instead
would have let a conversation be published with no render behind it and
nothing would have caught it.

**There has to be something to watch.** A performance cannot be published
without a render; the channel's equivalent is that it must be able to fill
airtime — a loop, a fixed slot, a day-part, filler or a safe playlist. A live
session does not count: it ends, and what the viewer gets afterwards is the
thing being checked.

**Taking it off the air does not stop the transmission.** The engine keeps
writing, because stopping the clock would mean the schedule resumed somewhere
other than where the time says when it came back (§4). What stops is
strangers being able to fetch it. And the record is set rather than deleted,
so an audit can tell a channel that went dark from one that was never on.

**Four public paths, and no more:**

| Public | Private |
| --- | --- |
| `/t/{id}/watch` | `/t/{id}` — the control room |
| `/api/channels/{id}/playlist` | `/api/channels/{id}` — the document |
| `/api/channels/{id}/stream/{n}` | `/api/channels/library` |
| `/api/channels/{id}/now` | `/api/channels/{id}/live` — the ingest |

The segment index is digits in the pattern as well as in the route: a path
rule that accepted a word would be a rule somebody could walk out of, and
that one is the outer wall.

**What is on is two sentences, not the document.** Serving the channel to a
viewer would hand out the ingest ids, the destinations, the recordings and
every reference in the schedule — the broadcaster's working material in
exactly the sense a performance's takes are. `/now` returns a title, an
instant and what is next. A slot with no title reads as the channel's name
rather than as the document id behind it.

**A failover is not announced.** An emergency or a backup reads as the
channel's name to a viewer. They are being shown a caption card because
something went wrong behind it, and captioning it "BACKUP" would be telling
them about a problem they can do nothing about. [§9]

**The viewer chases the live edge.** A player that buffers politely drifts
further behind on every stall until it is a minute late to its own channel,
so one that falls more than twelve seconds behind the last segment is pushed
back to it. The one thing a live player must do that an on-demand one must
not.

---

## C-8 — Stage 8: the last link

**The gap was a dead reference, not a missing feature.** `Channel.publication`
was declared on the type and enforced by the playlist and segment routes —
and no edit in the codebase could ever set it. Every channel was permanently
unpublished, so both routes 404'd for everyone but the owner. The comment in
the playlist route saying "a published channel is public" had been true of
nothing since it was written.

**And the gate had never heard of channels.** `mayBePublic` is a default-closed
allowlist, which is the right design and is why this was safe rather than
leaky: the channel paths simply were not on it, so the route-level check was
unreachable anyway. Two layers both said no, for two different reasons, and
fixing one would not have been enough.

**Nothing in the product could read an `.m3u8`.** A grep for `hls|Hls|m3u8`
across `app/` returned nothing. Safari plays HLS natively; nothing else does,
so `<video src="…m3u8">` is a black rectangle for most viewers. `hls.js` is
loaded only where the browser has no native support — on an iPhone it never
arrives.

**`networkidle` never fires on a channel.** The first attempt to screenshot
the viewer timed out waiting for the network to go quiet. It never does: a
live stream fetches a segment every four seconds for ever. That is the test
harness learning what a channel is.

**A 30-minute slot over a 5-second render is black for 29:55**, and that is
correct. The first end-to-end run produced byte-identical segments, which
looked like a bug and was the seed data: a programme longer than its media
and not marked `loop` goes black when the media ends. Marking it `loop` gave
five distinct segments out of eight — a five-second film round a four-second
window. The behaviour was right; the schedule was wrong, and the channel said
so in the only way it can.

## §18 — Is anything actually transmitting

A resolving schedule is not a transmitting channel. The playout engine is a
separate process by design (§11, D-20), so the web tier cannot know whether
the encoder is alive except by looking at what it left behind — and a control
room whose lamps were all green while nothing went out is worse than one with
no lamps, because it answers the question wrongly rather than declining to
answer it.

**Two questions, not one.**

| | engine | stream |
| --- | --- | --- |
| on the air | running | transmitting |
| the process died | stale / stopped | — |
| this channel died | running | stalled / silent |

**Both answers come from the filesystem**, which is the only thing the two
processes share. The engine writes one heartbeat file, overwritten each pass;
the segments carry their own mtimes. Nothing is asked of the engine, and
nothing is written into the channel document — a health flag in a document is
a fact about the past pretending to be a fact about now, and it would still
read "healthy" after the process died, which is the exact failure this
catches.

**The heartbeat is written at the END of a pass**, not the start. At the start
it would say "alive" and then spend thirty seconds wedged on a broken encode.
A pass that *threw* still beats: the process is alive and recovering, and
reporting it dead would send somebody to restart a thing that did not need
restarting. What a failing pass produces is no segments, and the per-channel
check is what notices that.

**The engine keeps two segments ahead of the playhead**, so a healthy
channel's newest file is in the future. A staleness check that did not allow
for that would report every working channel as dead.

**A stranger is not owed a diagnosis.** The operator is told which command to
run; a viewer is told "This channel is not transmitting right now" and nothing
about a server they cannot reach. And a viewer whose picture is arriving is
told nothing at all, even when the heartbeat is late — what reaches them is
the only thing they can judge, and a warning over a working picture trains
people to ignore warnings.

---

## C-9 — Stage 9: the lamp that was answering the wrong question

**The control room's `Server: Online` reported that the schedule resolved.**
That is a real check and it is not the question a green lamp implies. A
channel whose engine had never been started showed a full listing, a moving
playhead, a correct now-and-next, and an operator with no reason to doubt any
of it — while a viewer got a player that spun for ever.

**The fix was not a new mechanism.** The engine already ran a loop; the
segments already had mtimes. What was missing was the twenty lines that write
one file and the pure function that reads two numbers — which is why the whole
of it is unit-tested without a process, a channel or a frame.

## §19 — Inviting people onto the broadcast

> *"They don't necessarily need a BalanceVid account initially."* [ROOM §6]

A channel does not grow a room. It **names** one — an existing
conversation's — and the Room keeps everything that follows: the invitation,
the joining, the staging, the speaker switching. The whole of the coupling is
one field on the live session.

**The capability existed and the door did not.** `goLive` has always taken a
`roomId`, so a broadcast could come out of a room — but the only way to name
one was a `window.prompt` wanting a raw `conv_…` identifier typed from
memory, and the invitation itself lived in Studio One. Getting a guest on the
air meant leaving the control room, finding the conversation, opening its
room, copying the link, coming back, and remembering an id. A feature nobody
can reach is a feature that does not exist.

**GO LIVE no longer asks.** It arms the feed; the Guests tab is where a room
is chosen and people are invited. One question per place, and the place is
the one named after the thing.

**Armed is the right moment to invite.** A broadcast that is armed is not on
air — the schedule is still going out — so inviting people, waiting for them
to arrive and staging them all happen before a viewer sees anything. The
ARM → TAKE discipline (§6) doing a second job.

**The room can change while on air.** "We should get Sarah on" at 20:40 is an
ordinary thing to say, and a field that could only be set at GO LIVE would
make it a reason to end the broadcast. Detaching leaves the room running with
its guests in it; it simply stops being the one this channel is looking at.

**The panel is the Room's own.** `InvitePanel` is imported, not
reimplemented — link, copy, native share, WhatsApp, SMS, email, QR, and
rotate. It gained exactly one prop, a heading, because "this conversation" is
right in Studio One and wrong in a gallery. A second invite panel would be a
second place the join URL can be composed wrongly, and the URL carries the
credential.

---

## C-10 — Stage 10: the door that was missing

**Checked first; the answer was "almost all of it exists".** [D-19] The Room
had invitation by link, tokens, QR, rotation and a share panel; the channel
had a `roomId` field and a mesh that read the Room's staging. What was
missing was a `select` and one edit — `attachRoom` — and the import of a
component that had been sitting in `app/c/[id]/room/` since the Room was
built.

**The whole feature is one new domain function.** Everything else is
arrangement. That is what a check-before-building rule buys: the second time
a capability is needed, it is a prop and a picker rather than a subsystem.

## §20 — Slides

> *"A PowerPoint system users can build or upload, where the presentation
> changes with clicks as it changes live."*

**A deck is an order over library images.** Nothing else. A slide is an
ordinary library image — the kind the playout engine has been able to
broadcast since it was written (`-loop 1 -framerate`, `segment.ts`), the kind
the monitor already draws and the kind the schedule can already hold — and
advancing a slide is `roll-in` of the next one, which is the action the
Screens tab has had from the beginning.

So the only thing a deck adds to this product is the order. Finding that out
is what D-19 is for, and it is the difference between a feature and a
subsystem.

```
deck.pptx → LibreOffice → PDF → pdf.js → page PNGs → library media
                                                          │
                                              roll-in → over the live feed
```

**Every step already existed for evidence** (U-33 §2). A `.pptx` and a `.pdf`
reach the same place by the same path and look the same when they get there.
The pages land in the library rather than a deck folder, because a page in a
private folder would be a fourth kind of media and a page in the library is
the kind that has worked since the channel was written.

**PNG, not JPEG.** Slides are type. A JPEG of a bullet list is a bullet list
with a halo round every letter, at the size somebody reads it off a wall. So
`pathFor` asks for a PNG before a JPEG — synchronously, because it is called
inside the loop that keeps the stream ahead of the playhead and making it
async to save one `stat` would turn every caller in that loop into an await.

**There is no cursor.** Which slide is showing is `channel.live.segment` —
the thing actually on air — so the number between the two arrows is the
transmission's own answer rather than a counter that could disagree with it.
Press NEXT twice quickly and the second press works from what went out.
[D-22]

**And it does not wrap.** Running out of slides is information. A deck that
looped would put the title card back up in front of an audience waiting for
the presenter to finish, and the operator pressing NEXT would have no way to
tell that from a deck with one more slide.

**The web tier does not rasterise.** Turning a deck into pages spawns
LibreOffice and a browser; one of those in a request handler is one upload
making the application unusable for everybody else. The file is written down
and a job is enqueued, exactly as an uploaded source is (U-23).

**A build without a converter says so.** `WITH_OFFICE=0` is the default, and
then a PDF still works while a `.pptx` is refused with the sentence that
tells the author to export one. A deck accepted and silently turned into
nothing is the failure this avoids.

**Decks live beside the library, not inside a channel.** Deleting a channel
takes its schedule and nothing else (D-18); a deck that lived in one would
vanish with it, which is the wrong lifetime for a talk somebody gave. Two
channels can show the same deck without a second copy.

**Deleting a deck does delete media**, unlike deleting a channel — its
slides exist only as its pages and there is nowhere else they belong. Which
makes the question to the channels matter more, not less, and it is asked
per page: a deck of forty is forty references, and any one of them could be
the safe playlist.

---

## C-11 — Stage 11: the feature that was already built

**Three checks decided the whole design.** Could the playout engine put a
still on the wire — yes, `segment.ts:232`. Could something already put an
arbitrary reference over the live feed — yes, `roll-in`. Did a document-to-
pages pipeline exist — yes, and it had been sitting unused behind a build
flag since the evidence work.

After that the feature is a type with an array in it, a job handler that
moves files into the library, and a panel with two arrows. The temptation
worth naming is the one not taken: a slide player, with its own transport,
its own state and its own idea of what is on screen. It would have been a
second answer to "what is the viewer seeing".

**It was verified against the real thing.** A `.pptx` built with Impress,
uploaded through the route, rasterised by the worker into three library
PNGs, served as `image/png`, resolved by `pathFor` to a file that exists,
and stepped 1 → 2 → 3 in a browser with NEXT disabling itself at the end.

## §21 — Slides written here

Uploading a document and writing a slide produce **the same thing**: a
library PNG at the house size, appended to a deck. Nothing downstream can
tell them apart — the playout engine broadcasts it, the monitor draws it,
the schedule holds it, and the two arrows step it, by the same code.
Authoring adds a way to MAKE a slide, not a second kind of slide.

**Four layouts, three fields.** Title, text, picture, quote. A slide editor
with thirty controls is a slide editor somebody uses to make an ugly slide;
these four are each hard to make look bad, and "diverse" is served by their
being different from each other rather than by each being adjustable.

**Chromium, not ffmpeg's subtitle renderer.** The share cards in
`thumbnails.ts` are drawn with ASS, which is right for them: one block of
text at a known size. A slide is a layout — a heading, a body that wraps,
bullets, a picture beside them — and expressing that in ASS would be writing
a layout engine in subtitle syntax. Chromium is already required to turn a
PDF into pages, so a deck feature that uses it adds no dependency the deck
feature did not already have; `WITH_BROWSER=0` loses both together and says
so.

**It fetches nothing.** The page is handed its content and its pictures as
bytes, and every request it might make is aborted — the rule the PDF
rasteriser follows, for the same reason. Typed text is untrusted input: a
renderer that can be made to fetch a URL is a renderer that can be made to
leak, and one that can be made to run script is worse. Headings and bodies
are escaped, and an ink that is not a colour is refused rather than
interpolated into a stylesheet. [D-06]

**A picture is a library asset, not an upload to the slide.** A slide names
one, which is the same reference a caption card is — so a photograph can be
on two slides without a second copy of it. [§3, D-18]

**Adding a slide never renumbers what is in front of it.** A presenter
looking at "4 / 9" during a talk must not have that mean a different page
because somebody appended one. New slides go at the end unless a position is
given.

---

## §22 — A live web page, and anything else on screen

> *"The internet should be able to open and connect live for others to see."*

**The presenter's own browser, shared into the mix.** Not a headless browser
in the playout engine: that would be a second browser nobody can see, driven
by a control surface nobody has built, signed into nothing — so the pages
worth showing, the ones behind a login, are exactly the ones it could not
open. Sharing the browser the presenter is already using is what every
broadcaster does, and it is thirty lines, because the mixer already composes
an arbitrary number of arbitrary streams and a display capture is just
another `MediaStream`.

It is not only the web: a deck open in another application, a spreadsheet, a
map, a terminal — anything on the screen.

**It is a source, not a roll-in.** A rolled-in reference REPLACES the live
feed with a file (§5). A shared screen is part of the picture, with the
presenter still in frame beside it — which is the whole point of showing
somebody a web page while you talk about it. So it joins the mixer's list
and the layout table arranges it, exactly as another guest would be.

**The browser owns the picker.** There is no list of tabs in this product
and there cannot be: which window is shared is a decision the browser takes
from the person, outside the page. That is a security property, not a
limitation.

**And the browser's own Stop is the real control.** Chrome puts a bar at the
bottom of the screen and people use it, so the track's `ended` event takes
the source out of the mix. A studio that only noticed when its own button
was pressed would keep a dead black rectangle in the picture.

**Dismissing the picker is not an error.** It is somebody deciding not to
share, and a red message for it teaches people to distrust red messages.

---

## C-12 — Stage 12: two features, one already built and one thirty lines

**Authoring turned out to be a renderer and nothing else.** The deck, the
ordering, the broadcast path, the arrows and the library all existed from
§20; what was missing was a way to produce a PNG from typed words. So the
feature is one file that writes HTML, one worker case that screenshots it,
and a form with three fields.

**The live web page was a decision, not a build.** The expensive
implementation — a browser inside the playout engine — was rejected before
any of it was written, on the grounds that it could not open the pages
anybody would want to show. The cheap one reuses the canvas mixer that was
built for guests, and is better: the presenter is signed in, knows how to
navigate, and stays in frame.

**Both were verified against the real thing.** A slide written through the
API and drawn by the worker into a 1920×1080 library PNG; then written again
through the studio's own form, appended to a deck, and stepped on air as
`1 / 2`.

## §23 — Which camera

The product could always reach **any camera the operating system exposes**.
That is not a short list:

| | how it becomes a camera |
|---|---|
| the laptop's own webcam | it already is one |
| a USB webcam | it already is one |
| **a phone** | Continuity Camera, Camo, EpocCam, Android's USB webcam mode |
| **a professional camera** | a UVC capture card (Cam Link, Blackmagic), or USB-UVC out |

A browser sees all of them through `getUserMedia`, and this product needs no
driver, no plug-in and no integration for any of it.

**What it could not do was choose one.** Six call sites, not one `deviceId`
between them — so the browser picked its default, and on a machine with a
webcam, a capture card and a phone plugged in that is whichever the
operating system nominated. The gap was never the hardware; it was the
absence of a picker.

**`exact`, not `ideal`, on the device.** A broadcaster who chose the capture
card and silently got the laptop's webcam instead would be on air with the
wrong picture and nothing on screen to say so. Failing is the honest
outcome, and the message names what it could not open. The SIZE stays
`ideal`, because that is a preference: a camera that only does 1024×576
should be used at 1024×576 rather than refused.

**Labels are blank until permission is granted.** `enumerateDevices` will
return four cameras called `""` before anybody has allowed access, so a menu
built at page load is a menu of empty strings. The list is re-read when a
stream opens, and until then the picker says why the names are missing
rather than showing "Camera 1, Camera 2" as though that were a fault.

**And it watches for changes.** `devicechange` fires when something is
plugged in or pulled out, so a camera connected mid-show appears without a
reload, and a capture card that fell out leaves.

**A phone needs none of this.** It can also just join the room: a guest link
opened on a phone is a camera on the broadcast, with no cable and no
driver (§19). That is often the better answer, and it was already built.

---

## C-13 — Stage 13: the camera that was never chosen

**"Why are the cameras not working?"** Two answers, and only one was a bug.

The message in the screenshots — *the camera could not be opened* — was
headless Chromium in a container with no camera. Correct behaviour, wrong
impression.

The real gap was underneath it and would not have shown up on a laptop with
one webcam: `grep -rn "deviceId" app/ src/` returned nothing. Every
`getUserMedia` in the product took the default and there was no way to pick
anything else — which means every claim about supporting professional
cameras was true of the browser and false of the product.

**One shared hook, because there are six call sites.** `useDevices` is at
the application root rather than inside Online TV: Studio One's room, Studio
Two's recorder and the calibration step all have the same gap, and a second
enumeration would be a second answer to "which cameras are there". Online TV
uses it now; the others adopt it by passing a `deviceId`.

**Proved with a real device.** Chromium's fake camera and three fake
microphones, enumerated in the picker, opened on arming, drawn in the host
preview, in Multi-view tile 1 and in Preview, with the encoder pushing at
62 kB/s. The first time in this session the whole live chain has run with a
camera in it.

---

## §23a — The recorder, and 2160p

*Added 2026-09-30, after a question: which camera should the app default to,
and should 4K be included?*

Measuring first turned up something neither question expected. §23 gave
Online TV a camera picker and `quality.ts` gave it a preset ladder, and
**the path that records the performance had neither.** `useMasterRecording`
asked for

```ts
video: { width: { ideal: 1280 }, height: { ideal: 720 } }
```

with no `deviceId` and no frame rate — written into the hook, reached by
default rather than by choice. The render is resolution-agnostic: it takes
the source's own dimensions rather than compositing onto a fixed canvas, so
that one line was the ceiling on the master too. The author's own
performance probes at **1280×720, all three takes.** Every master this
product has made is 720p, and nobody decided that.

### Which camera to default to

**The browser's own default on first use; the person's last choice
thereafter, remembered per browser** — the mechanism `useQuality` already
used, in `useCamera`.

Not "the best camera the machine has". A capture card with nothing plugged
into it enumerates like any other camera, gives a black picture, and often
sorts first. Guessing is how somebody goes on air on the wrong one.

Two details carry the weight:

* **`deviceId: { exact: … }` throws when the device is gone.** That is
  deliberate in §23 — a chosen camera must never be silently substituted —
  and it means remembering without forgetting turns *"I used the capture
  card yesterday"* into *"the studio will not open today"*. A stored id
  that is no longer in the device list is dropped, and **the person is
  told**, because falling back silently is how a whole session gets
  recorded on the laptop webcam.
* **The list is empty before permission is granted.** Forgetting on an
  empty list would be the same bug as never remembering. Empty is *not
  yet*, not *gone*.

### Whether to include 2160p

**Yes for recording. No for live**, and the two paths are not alike:

| | Online TV (live) | Studio Two takes / Take App |
|---|---|---|
| path | canvas mixer **in JavaScript** → encoder → **real-time** re-encode | `getUserMedia` → `MediaRecorder`, **no mixer** |
| 2160p costs | ~4× the compositing of 1080p30, 20 Mbps up | a hardware encode; the worker renders later |
| verdict | **not offered** | **offered** |

`maximum` already warns that a machine which cannot keep up *"silently
drops frames, which looks like a bad connection."* At 2160p through the JS
canvas that is not a risk but the expected outcome — a setting that appears
to work and makes the picture **worse**, which the head of `quality.ts`
says a quality control must never be.

On the recording path the argument runs the other way, and this product
already makes it: `aboveTransmission` and INV-17 — the ingest file is the
archive, so you keep the good copy. The strongest reason is a control that
already ships: **crop-reframe.** Cropping a 720p take to a close-up is
visibly soft; cropping a 2160p one is free. Vertical compositions and
multi-camera editing want the same headroom.

`liveCapable()` is a predicate rather than a second table, because a second
table is a second place a bitrate can be edited with only one of them
taking effect. [D-19]

### Two presets, because they are two questions

`live` asks *what can this machine composite and send right now* — the CPU
and the uplink, at this moment. `recording` asks *how good a source to
keep* — the camera, and what the footage will later be asked to do. A
studio on a poor line records at 2160p and broadcasts at 720p, and both are
right at once. Separate keys; **the live key is unchanged**, so no stored
broadcast setting moves.

The recording default is **1080p, not 720p**, and that is a stated change
rather than a silent one. The constraint is `ideal`, so a camera that only
does 720p still gives 720p rather than refusing: this raises what is
*asked for*, never what is required.

### What the browser found

* **The preset sentence was about the wrong thing.** `needs` is written for
  the live menu and talks about the uplink — *"about 770 kB/s up"* — and it
  was showing under the record button, where nothing is uploaded and the
  cost is disk. `records` says megabytes a minute instead. Same fault as a
  menu that says "7 more" when there are eighteen.

### Verified

A take recorded through the studio after the change probes at **1920×1080**;
the three recorded before it are 1280×720. The camera track reports
`1920x1080` live, the preset persists to `balancevid.recording-quality`, and
the ladder offers five steps with 2160p present in the recorder and absent
from Online TV. The test take was removed and the author's performance left
with its two.

**Still 1080p on purpose:** the master and the live output. 2160p is an
optional high-quality source, not a delivery format.

---

# Appendix D — the control room as a production system

*The brief of 30 September 2026, verbatim, and what the running product
turned out to already have. Recorded here rather than summarised because
it is the map the build follows, in the order it sets.*

The complaint it answers, in the author's own words:

> *"I think Multi Media View camera 2, being guest should have four cameras
> in that small box, guest 1, 2, 3, 4. the boxt must not be enlarge to
> deform the design but must rather devide into 4 halves of four guest
> cameras. The media player seams not connected. how does it play and how
> is songs loaded to play? Also the background/virtual set are not working
> what do we do to make them professional grade"*

And the frame the answer sets before any of the five parts:

> *"Yes. Looking at this actual Online TV control room, I would not enlarge
> the Multi-View area. Your instinct is correct: the available space is
> valuable and the layout already has a strong broadcast-console
> structure.*
>
> *There are three separate issues here, and they should be solved as three
> real production systems rather than by adding more UI."*

---

## §24 — Camera 2 should become a 4-guest multiview

> *"I agree with your proposal.*
>
> *Currently:*
>
> *`02 Camera 2 — Guest`*
>
> *should become:*
>
> *`02 GUESTS — 4`*
>
> *and the existing small tile should remain exactly the same size.*
>
> *Inside that tile:*
>
> ```
> ┌─────────────────────┐
> │ GUEST 1 │ GUEST 2   │
> │─────────┼───────────│
> │ GUEST 3 │ GUEST 4   │
> └─────────────────────┘
> ```
>
> *Each quarter is an independent source.*
>
> *It should behave like a real multiview. Each guest tile should show:*
>
> * *Guest 1 / Guest 2 / Guest 3 / Guest 4*
> * *video*
> * *microphone state*
> * *connection state*
> * *small audio meter*
> * *speaking indicator*
> * *`LIVE`/selected tally when applicable*
> * *`NO VIDEO` when camera is unavailable*
>
> *And clicking a guest should select that guest as the programme source,
> without enlarging the multiview container.*
>
> *This is consistent with professional multiview practice: multiple
> sources are monitored in a fixed layout with labels, tally/status and
> audio information rather than consuming a huge part of the operator
> interface.*
>
> *So I would make the source matrix:*
>
> ```
> 01  Camera 1
> 02  GUESTS
>     ┌────┬────┐
>     │ G1 │ G2 │
>     ├────┼────┤
>     │ G3 │ G4 │
>     └────┴────┘
>
> 03  Studio Two
> 04  Studio One
> 05  Media Player
> 06  Graphics
> ```
>
> *That is much more powerful without changing the overall geometry."*

---

## §25 — The Media Player is currently an architectural gap

> *"You are right to question it.*
>
> *The screen says:*
>
> *`05 Media Player — Idle`*
>
> *but there is no obvious path from Library → Media Player → Programme.
> That is not professional.*
>
> ***I would NOT create a separate music-loading system. BalanceVid already
> has Library.***
>
> *The correct architecture should be:*
>
> ```
>                     LIBRARY
>                        │
>               ┌────────┴────────┐
>               │                 │
>             VIDEO             AUDIO
>               │                 │
>               └────────┬────────┘
>                        │
>                   MEDIA PLAYER
>                        │
>               ┌────────┴────────┐
>               │                 │
>            PREVIEW           PROGRAMME
> ```
>
> *So when the operator clicks Media Player, it should open a compact media
> browser/picker. For example:*
>
> ```
> MEDIA PLAYER
>
> Search Library...
>
> [ Worship Session       04:12 ]
> [ Interview             12:44 ]
> [ Song — Ancient Days   04:04 ]
> [ Intro                  00:18 ]
> [ Announcement           01:32 ]
>
>                          [Load]
> ```
>
> *Then:*
>
> *Load → Preview → Play → Take Live*
>
> *The actual media remains in the existing Library. **Do not duplicate
> files into Online TV.** That is particularly important for BalanceVid
> because the same media should be usable by Studio One, Studio Two, Online
> TV and the Library.*
>
> *Professional production systems commonly treat media players as actual
> switcher sources, with media loaded into a managed media pool and then
> exposed as sources to the production system.*
>
> ***For songs.** A song should simply be a Library media item with:*
>
> * *title*
> * *artist/owner*
> * *duration*
> * *audio/video type*
> * *thumbnail/artwork if available*
>
> *The Media Player does not care whether it is a song, interview, video
> package or announcement.*
>
> *If it is audio-only, Online TV can render it through the channel's
> visual treatment:*
>
> ```
>        ALBUM ART / CHANNEL GRAPHIC
>
>        Song Title
>        Artist
>
>        ━━━━━━━━━━━━━━━
>        audio waveform
> ```
>
> *The audio then becomes part of the programme output. That is much
> cleaner than inventing a special "Songs" subsystem."*

---

## §26 — Background / Virtual Set needs to become a real production feature

> *"This is the weakest part of the current screen.*
>
> *Right now you have:*
>
> *BACKGROUND / VIRTUAL SET — Recording Studio / Concert Stage / Modern
> Room / University Hall / Church / Theatre / Beach / Forest / City /
> Mountain*
>
> *Those look like decorative buttons, not a production-grade virtual-set
> system. I would not simply add more backgrounds. We need to build the
> underlying system properly.*
>
> ***The correct model.** Each camera/person source gets a composition
> layer:*
>
> ```
> CAMERA / GUEST
>        │
>        ▼
> PERSON SEGMENTATION
>        │
>        ▼
>        ├── foreground: person
>        │
>        └── background: selected environment
>                          │
>                          ▼
>                     COMPOSITOR
>                          │
>                   Studio composition
>                          │
>                          ▼
>                      PROGRAMME
> ```
>
> *The key is that **the virtual background must actually become part of
> the master composition, not just a CSS background behind a preview.**
> That matters because BalanceVid's browser canvas is already the master
> feed architecture. The virtual-set result needs to travel through that
> same composition path.*
>
> *Modern production systems likewise treat compositing as part of the
> production pipeline rather than merely decorating the operator UI.*
>
> ***A. Background library.** Instead of 10 tiny buttons:*
>
> ```
> BACKGROUND / SET
>
> Studio
> ┌────────┐ ┌────────┐ ┌────────┐
> │ Studio │ │ News   │ │ Modern │
> └────────┘ └────────┘ └────────┘
>
> Performance
> ┌────────┐ ┌────────┐ ┌────────┐
> │ Stage  │ │ Concert│ │ Theatre│
> └────────┘ └────────┘ └────────┘
>
> Places
> ┌────────┐ ┌────────┐ ┌────────┐
> │ City   │ │ Beach  │ │ Forest │
> └────────┘ └────────┘ └────────┘
> ```
>
> *Use proper visual thumbnails.*
>
> ***B. Per-person assignment.** For four guests:*
>
> ```
> GUEST 1   [ Studio A ▼ ]
> GUEST 2   [ Studio A ▼ ]
> GUEST 3   [ Concert ▼ ]
> GUEST 4   [ None ▼ ]
> ```
>
> *So each participant can have an independent background.*
>
> ***C. Foreground quality.** We need:*
>
> * *person segmentation*
> * *edge refinement*
> * *hair/shoulder preservation*
> * *temporal stability*
> * *sensible handling of hands*
> * *no obvious halo*
> * *no background bleeding through the person*
>
> *If a person has a green screen, chroma key can be offered as the
> higher-quality path. If they don't, segmentation should be used.*
>
> ***D. Set positioning.** This is where it becomes genuinely professional.
> Each person should have:*
>
> * *position*
> * *scale*
> * *crop*
> * *horizontal flip*
> * *background*
> * *background blur*
> * *lighting adjustment where supported*
>
> *Then a host can sit naturally inside the virtual environment instead of
> appearing as a floating cutout."*

---

## §27 — Background and Virtual Set are not the same thing

> *"And I would add one important distinction.*
>
> ***Background** simply replaces what's behind a person.*
>
> ***Virtual Set** is a complete production scene:*
>
> ```
> ┌────────────────────────────────────────────┐
> │                                            │
> │       BALANCEVID TV                        │
> │                                            │
> │             HOST                           │
> │                                            │
> │   Guest 1             Guest 2              │
> │                                            │
> │       lower third / programme graphics     │
> │                                            │
> └────────────────────────────────────────────┘
> ```
>
> *The virtual set can contain:*
>
> * *background*
> * *presenter positions*
> * *desk/table*
> * *screens*
> * *logos*
> * *lower-third region*
> * *lighting*
> * *programme graphics*
>
> *That is much closer to the BBC-style principle of maintaining a coherent
> virtual architectural environment rather than merely swapping a
> photograph behind a presenter."*

---

## §28 — The source architecture, and the compositor

> *"So the Online TV source architecture should become:*
>
> ```
> CAMERA 1 ───────────────┐
>                         │
> GUEST 1 ─┐              │
> GUEST 2 ─┤              │
> GUEST 3 ─┤→ GUEST GRID ─┤
> GUEST 4 ─┘              │
>                         │
> STUDIO ONE ─────────────┤
> STUDIO TWO ─────────────┤
>                         ├──→ COMPOSITOR → PROGRAMME
> MEDIA PLAYER ───────────┤
>                         │
> GRAPHICS ───────────────┘
> ```
>
> *And the compositor applies:*
>
> ```
> SOURCE
>   ↓
> LAYOUT
>   ↓
> VIRTUAL SET / BACKGROUND
>   ↓
> GRAPHICS
>   ↓
> AUDIO MIX
>   ↓
> PROGRAMME
>   ↓
> PLAYOUT
>   ↓
> DISTRIBUTION
> ```
>
> *This fits the existing BalanceVid architecture very well because the
> broadcaster remains the server-side production system and the browser
> remains the control surface."*

---

## §29 — Multiview polish, and the priority order

> *"One more thing I would change in this screen. Your current Multi-View
> Sources is actually one of the strongest areas of the interface
> conceptually. I would make it more like a professional multiview rather
> than making it larger.*
>
> *The final six-source arrangement could be:*
>
> ```
> ┌──────────┐ ┌──────────┐ ┌──────────┐
> │ 01       │ │ 02       │ │ 03       │
> │ CAMERA 1 │ │ GUESTS   │ │ STUDIO 2 │
> │          │ │ 1 2      │ │          │
> │          │ │ 3 4      │ │          │
> └──────────┘ └──────────┘ └──────────┘
>
> ┌──────────┐ ┌──────────┐ ┌──────────┐
> │ 04       │ │ 05       │ │ 06       │
> │ STUDIO 1 │ │ MEDIA    │ │ GRAPHICS │
> │          │ │ PLAYER   │ │          │
> └──────────┘ └──────────┘ └──────────┘
> ```
>
> ***Fixed dimensions. No expansion. No deformation.***
>
> *Then the operator gets more capability inside the existing room, rather
> than the interface becoming increasingly crowded.*
>
> ***My priority order.***
>
> *1. **Guest Grid — build now.** Four guest sources inside the existing
>    Camera 2 tile.*
> *2. **Media Player integration — build now.** Connect it to the existing
>    Library. No duplicate media system.*
> *3. **Virtual Background — build as a real compositor feature.** Don't
>    add more decorative background buttons.*
> *4. **Virtual Set — build on top of that compositor.** A reusable scene
>    system rather than a collection of images.*
> *5. **Multiview polish.** Tally, labels, mic/video state, audio meters
>    and source health.*
>
> *That would turn what you currently have from a convincing control-room
> mockup into an actual production system."*

---

## C-14 — Stage 14: what the control room already had

*Measured in the running product before a line was written, which is the
method D-19 asks for and which has changed what the work was every time it
has been applied. It changed it again here: two of the five items are
mostly wiring, one is a **dead field**, and one thing the brief asks for
turned out to exist twice — once well, and once in a path the broadcast
never reaches.*

### The guest grid is a drawing problem, not a plumbing one

`useBroadcastGuests` already produces **one `MixerSource` per staged
participant, in the Room's own staging order** — id, stream, display name
and accent — and `useRoomMesh` already keeps a live
`RTCPeerConnectionState` per peer. The four guests the brief wants are
therefore already connected, already ordered and already mixed; the
picture is already going out. What tile 02 does with all of that is:

```ts
const guest = guests.find((person) => person.stream !== camera) ?? null;
```

**One guest. The first one that is not the operator.** Guests two, three
and four are in the mix, audible on the air, drawn into the composited
canvas by `useBroadcastMixer` — and invisible in the multi-view. The tile
is not missing data. It is discarding it.

Two things it wants are measured elsewhere and not carried this far:

* **`mesh.states`** is a `Record<string, RTCPeerConnectionState>` on the
  mesh, and `useBroadcastGuests` drops it when it builds `MixerSource`.
  Connection state per guest is a field to forward, not a mechanism to
  build.
* **`useFeedLevels`** already returns `{ energy, speech }` per stream id,
  twenty times a second, from the Room's own `measureVoice` — the same
  measurement its speaker switching uses, which is why the meters and the
  switching cannot disagree. It is wired to the host and the master bus.
  Nothing asks it about a guest.

What genuinely does not exist: **microphone state** (nobody reads a
guest's audio track's `enabled`/`muted`), **`NO VIDEO`** (a guest with no
video track is drawn by the mixer as a flat accent rectangle and by the
tile as nothing at all), and **per-guest selection** — tile 02's click is
`onBackToRoom`, which takes a roll-in down for the whole room at once.

### The media player is not a player

Tile 05 does not have a player behind it. It **mirrors the schedule**:

```ts
const scheduled = on.kind === 'programme' || on.kind === 'rotation'
  ? on.source : undefined;
// …
{ n: 5, label: 'Media Player', sub: scheduled ? nameOf(scheduled) : 'Idle',
  ...(onAir && scheduled ? { act: () => onTake(scheduled) } : {}) }
```

So "Idle" does not mean *nothing is loaded*; it means **nothing is
scheduled**, and there is no way to load anything. The operator's only
route to a file is the left rail's Library tab. That is the gap the brief
names, stated exactly: *"there is no obvious path from Library → Media
Player → Programme."*

**What is already right is the part the brief cares most about.**
`broadcastLibrary()` lists **references and never copies** — every render
from both studios plus the third branch in `var/library/` — and D-18
already forbids duplication. *"Do not duplicate files into Online TV"* is
not a change; it is the existing invariant, and the media player must be
built inside it.

**What is missing from the item is the song.** `BroadcastItem` carries
`title`, `document`, `documentId`, `planHash`, `bytes`, `madeAt`. It has
no **artist**, no **artwork**, no **audio** form — `ProgrammeSource`'s
media branch is `form: 'image' | 'video'` — and, though its own header
says it supplies *"the one thing a scheduler needs that a render does not
carry: how long it is"*, **it carries no duration.** The header describes
a field that was never added. The studio compensates by showing megabytes
where a duration belongs, which is why the rail reads `Studio Two · 84 MB`
and the brief's mock-up reads `Song — Ancient Days   04:04`.

There is a **Preview bus** and it is real, but it holds two things only:
the armed camera, and the title of what is next. *Load → Preview → Play →
Take Live* has one of its four steps.

### The virtual set is a field nothing reads

This is the finding that makes the author's *"the background/virtual set
are not working"* literally true rather than a matter of taste.

Pressing a set writes `channel.identity.spaceId`. That field is declared,
validated, persisted, and normalised on save (`channelEdit.ts` deletes it
when blank). **Nothing draws it.** `marksFor` — the function that decides
what is laid over each second of broadcast — knows about bugs, lamps,
lower thirds and the next-programme card, and does not mention a space.
The playout engine does not mention one. `useBroadcastMixer`, which is the
master feed, paints `#05070a` and then draws each person's raw video:

```ts
paper.fillStyle = '#05070a';
paper.fillRect(0, 0, width, height);
```

The ten buttons are a **preference with no consumer**. Selecting one
changes the swatch in the panel and nothing on the air — which is the
exact failure mode §26 warns against, *"just a CSS background behind a
preview"*, arrived at from the other direction: not even a preview.

**The compositor the brief asks for exists, and it is good.** It is in the
render path, not the live one. `src/render/matte.ts` and `compose.ts`
already do, for a Studio Two performance:

| §26 asks for | Studio Two's render path has |
|---|---|
| person segmentation | a **plate difference matte** — `matteChain` against three seconds of the empty room |
| temporal stability | structurally: no per-frame guessing, which is why a plate was chosen over a model (`environment.ts` head, S-6) |
| edge refinement, no halo | `matteFeather`, 2–5px, **tied to the plate's measured quality** |
| no background bleed | `matteThreshold` at three times the room's own **measured** noise |
| the environment itself | `backdropChain` drawing a `SpaceLook`, `blurBackdropChain` for blur |
| told in advance whether it will work | `plateVerdict` and `MATTE_USABLE_QUALITY`, stated before the author records |

So the answer to *"what do we do to make them professional grade"* is not
to invent a compositor. It is to **bring the one that exists into the live
canvas**, where it faces one problem the offline path does not: a matte
must be produced at 30 fps in JavaScript rather than by ffmpeg with the
whole file in hand. That is the real engineering in item 3, and it is
where the brief's *"if a person has a green screen, chroma key can be
offered as the higher-quality path"* earns its place — a chroma key is
cheap per frame, and a plate difference is nearly as cheap, while a
segmentation model is not.

The offline path also answers §26's *"per-person assignment"* in
principle: an `Environment` is a field of a **take**, not of a
performance, so two people composited into two different rooms is already
the shape the data takes. The channel's single `identity.spaceId` is the
narrower model, and it is narrower than the product it sits in.

### The virtual set has no scene in it

A `SpaceLook` is a wash, a light pool, a vignette, some grain and
optionally one band. That is a **backdrop**, precisely as §27 defines it,
and the studio's own panel calls it "Background / Virtual Set" — one
control for two things the brief says are not the same thing.

Of §27's eight parts of a scene, the product has **presenter positions**
(`LAYOUTS`, shared by the live mixer and the ffmpeg renderer, so a quad
here and a quad in an export are one table) and **programme graphics**
(`marksFor`). It has a **lower third** but placed by corner rather than in
a region the set owns. It has no desk, no screens, no logos as scene
furniture, and no lighting that belongs to the set rather than to the
drawn backdrop.

### The multi-view is closer than the rest

The grid is already `repeat(3, minmax(0, 1fr))` by `repeat(2, …)` with
`minHeight: 0` — **fixed, and it does not expand.** It already has
zero-padded source numbers on plates, tally as a hard inset bar (red for
program, blue for keyed), a name plate with a three-stop scrim, and a
one-word availability read — `LIVE / ON / READY / —`. The brief's *"fixed
dimensions, no expansion, no deformation"* is a constraint the existing
grid meets and the guest grid must not break.

What it has not got: **mic and video state**, **audio meters on a tile**,
and **source health** distinct from availability — `READY` says a tile can
be cut to, not that its picture is arriving.

### The ledger

*Verdicts: **Have** — shipped and working. **Wired wrong** — the mechanism
exists and the control room does not reach it. **Offline only** — built,
tested, and on the render path rather than the live one. **Gap** — not
built.*

| # | What the brief asks | What is there | Verdict |
|---|---|---|---|
| **G1** | Tile 02 divided into four quarters | one `<video>`, the first non-host guest | **Gap** |
| **G2** | Four independent guest sources | `useBroadcastGuests` → one `MixerSource` each, in the Room's staging order | **Have** |
| **G3** | Tile reads `02 GUESTS — 4` | reads `Camera 2 — Guest` | **Gap** |
| **G4** | Video per quarter | streams present; only the first drawn | **Wired wrong** |
| **G5** | Microphone state | nothing reads a guest's audio track state | **Gap** |
| **G6** | Connection state | `mesh.states` per peer, dropped at `MixerSource` | **Wired wrong** |
| **G7** | Small audio meter | `useFeedLevels.energy`, host and master only | **Wired wrong** |
| **G8** | Speaking indicator | `useFeedLevels.speech`, from `measureVoice` | **Wired wrong** |
| **G9** | LIVE / selected tally per guest | tally exists per tile, not per quarter | **Wired wrong** |
| **G10** | `NO VIDEO` when unavailable | nothing; the mixer paints a flat accent | **Gap** |
| **G11** | Click a guest → programme source | tile 02's click is `onBackToRoom`, for the whole room | **Gap** |
| **G12** | No enlargement of the container | grid is fixed 3×2 with `minmax(0, 1fr)` | **Have** |
| **M1** | Library → Media Player → Programme | tile 05 mirrors the schedule; no player | **Gap** |
| **M2** | Compact picker with search | the left rail's Library tab has both, and the tile does not open it | **Wired wrong** |
| **M3** | Load → Preview → Play → Take Live | Preview holds the armed camera and the next title | **Gap** |
| **M4** | No duplicate media system | `broadcastLibrary()` lists references; D-18 forbids copies | **Have** |
| **M5** | Item: title | `BroadcastItem.title`, read now rather than copied | **Have** |
| **M6** | Item: artist / owner | nothing | **Gap** |
| **M7** | Item: duration | **absent, though the file's own header claims it** | **Gap** |
| **M8** | Item: audio / video type | `form: 'image' \| 'video'`; no audio | **Gap** |
| **M9** | Item: artwork | `Thumb` renders video and image; no artwork field | **Gap** |
| **M10** | Audio-only through the channel's visual treatment | nothing | **Gap** |
| **B1** | Person segmentation | plate-difference matte, `matteChain` | **Offline only** |
| **B2** | Background is part of the master composition | `identity.spaceId` is written and **read by nothing** | **Gap** |
| **B3** | Real thumbnails, grouped Studio / Performance / Places | ten flat colour swatches, ungrouped | **Gap** |
| **B4** | Per-person assignment | one `spaceId` for the whole channel | **Gap** |
| **B5** | Edge refinement, hair, temporal stability, no halo, no bleed | `matteFeather`, `matteThreshold`, both measured | **Offline only** |
| **B6** | Chroma key as the higher-quality path | nothing | **Gap** |
| **B7** | Position, scale, crop, flip, background blur, lighting | crop-reframe and `blurBackdropChain` exist; none live, none per-person | **Offline only** |
| **B8** | Told honestly when separation will not hold | `plateVerdict`, `MATTE_USABLE_QUALITY` | **Offline only** |
| **V1** | A set is a scene, not an image | a `SpaceLook` is wash + glow + vignette + grain + band | **Gap** |
| **V2** | Presenter positions | `LAYOUTS`, shared by mixer and renderer | **Have** |
| **V3** | Desk / table, screens, logos | nothing | **Gap** |
| **V4** | Lower-third region owned by the set | `marksFor` places by corner | **Wired wrong** |
| **V5** | Lighting | `SpaceLook.glow`, on the backdrop only | **Offline only** |
| **V6** | Programme graphics | `marksFor` — bug, lamp, lower third, next | **Have** |
| **V7** | Background and Virtual Set are distinct | one panel titled "Background / Virtual Set" | **Gap** |
| **X1** | Fixed 3×2, no expansion, no deformation | already so | **Have** |
| **X2** | Tally | inset bar, red program / blue keyed | **Have** |
| **X3** | Labels | name plate, zero-padded number plate | **Have** |
| **X4** | Mic / video state | nothing | **Gap** |
| **X5** | Audio meters on tiles | `useFeedLevels` exists; no tile reads it | **Wired wrong** |
| **X6** | Source health | `LIVE / ON / READY / —` says availability, not health | **Wired wrong** |

**Twenty-two gaps, ten wired wrong, seven offline, ten already there.**
The shape of the work that follows is set by that count: item 1 is mostly
forwarding fields that are already measured, item 2 is a player plus four
fields on a library item, and item 3 is the only one that is genuinely new
engineering — a matte at 30 fps in the browser canvas, feeding the same
composition path the encoder already reads.

---

## C-15 — Stage 15: the guest grid, and the field nobody sent

*Priority 1 of the §29 order: "Four guest sources inside the existing Camera
2 tile." Built, and the browser found something underneath it that no
amount of drawing would have fixed.*

### No guest had ever reached the broadcast

The grid was drawn, the geometry held, three guests were staged in a real
room — and all four quarters stayed empty. The cause was one word:

```ts
const data = await response.json() as {
  participants?: RoomParticipant[];
  stagedParticipantIds?: string[];
  hostId?: string;            // ← never sent
};
setMeId(data.hostId);
```

`roomView` returns `meId`, a `me` flag on the caller's own row, and each
participant's `role`. **It has never returned `hostId`.** So `meId` was
always `undefined`; `useRoomMesh` returns early on `!meId`; and no peer
connection was ever opened for a broadcast. Guests joined, were listed,
were staged, were counted in "N in mix" — and their pictures never left
their own browsers.

That is the author's *"camera 2, being guest"* showing nothing, and it is
not a drawing fault. **The old tile hid it perfectly**: it showed
`guests.find((person) => person.stream !== camera)`, and with the list
always empty it simply drew the "Guest" placeholder that a room with nobody
in it would also draw. One tile, two indistinguishable failures — which is
the argument for `NO GUEST`, `NO VIDEO`, `CONNECTING` and `LOST` being four
different words.

The fix reads what the room actually sends, in the Room's own order of
authority: `meId`, then the row flagged `me`, then — for the OWNER, who is
not a participant and has neither — the participant `openRoom` created with
`role: 'host'`. The broadcaster **is** the host of the room they opened;
that is the identity the signalling is keyed on.

### What was already measured, and thrown away

Three of the eight things §24 asks each quarter to show were being computed
one file away and dropped before the multi-view saw them:

| | measured by | was |
|---|---|---|
| connection state | `useRoomMesh.states`, per peer | dropped when `MixerSource` was built |
| audio meter | `useFeedLevels.energy` | wired to host and master only |
| speaking | `useFeedLevels.speech`, via `measureVoice` | same |

The speaking indicator uses `DEFAULT_POLICY`'s own thresholds — energy
above the microphone's measured floor, and speech confidence — so the dot
on the monitor and the Room's automatic speaker switching cannot disagree
about who has the floor. Without the dwell and hysteresis `decideStage`
applies: those stop the PICTURE flicking between people, and a meter that
waited 600ms to admit somebody had spoken would be a meter that lied for
600ms.

**What was not measured anywhere is whether a track is delivering
anything.** `useTrackStates` subscribes to `mute`, `unmute` and `ended` per
track rather than polling, so a quarter goes dark within a frame of the
picture doing so. The browser will not say WHY — `muted` covers both "they
turned their camera off" and "the connection has starved" — so the quarter
says `NO VIDEO`, which is what the operator can see, rather than guessing.

### A grid of buttons cannot live inside a button

Tile 02 is a `<div role="group">` and the other five are `<button>`s. Not a
technicality: a nested button is invalid, unreachable by keyboard in the
order anybody expects, and announced as one control. Everything else about
the tile — the box, the number plate, the name plate, the tally, the
`minmax(0, 1fr)` cell — is identical, because the requirement is that the
rack does not move.

**The labels are at the top, and every other tile's are at the bottom.**
That is not an inconsistency; it is why the rack survives. The tile's own
name plate is a scrim across its bottom edge, and the bottom two quarters
live under it. A quarter labelling itself down there would be a label
inside a label.

**The browser removed a word.** `NO GUEST` centred in a quarter lands on
top of the `G2` mark — 48×40 device pixels is what a quarter is on the
author's screen. An empty well already says so with hatching and a dimmed
mark, and the title says it in words, so the centred word is kept for the
four states an operator has to act on, and sits along the bottom edge where
it clears both the mark and the microphone glyph.

### Clicking a guest is a vision mixer's action

*"clicking a guest should select that guest as the programme source."*
That is a **solo** on the canvas mixer: one source, full frame, released by
clicking again. It does not unstage anybody, does not reach the
conversation, and is never written to the channel — which guest is in shot
at 19:42 is not a property of the station.

**It does not touch the audio.** Every staged microphone stays in the mix
while one person has the picture, because a guest answering over a close-up
of somebody else is still answering. That is ROOM §4's rule and the mixer's
own, and cutting the sound with the vision would clip the first word of
every reply.

A solo on somebody who has left is released rather than remembered: holding
it would black the programme out the moment a guest's browser closed.

### A guard that could not be observed

`readGuests` had `feeds.slice(0, GUEST_SLOTS)` above an
`Array.from({ length: GUEST_SLOTS })`. A mutation sweep removed the slice
and every one of the 29 assertions still passed — because index 4 is never
asked for. It was decoration in the one place decoration is worst: it read
as though the cap were enforced twice. The cap is the length; `guestCount`
is what tells the operator about a fifth guest.

Ten other mutations were caught: `disconnected` reading as lost rather than
unstable, speaking ignoring the microphone, the noise floor, or the speech
confidence, the tally ignoring transmission or the solo, `live` surviving a
dead picture, `NO VIDEO` printed over `LOST`, and the meter unclamped or
metering a muted microphone.

### Verified in the browser, against the author's own channel

Three guests joined a real room from three separate browser contexts, were
staged, and turned their cameras on.

* **Before their cameras:** three quarters read `health: live`,
  `mic: open`, `eye: dark`, `NO VIDEO` — the state reported correctly
  rather than as an empty box.
* **After:** two quarters carried live pictures, `says` empty, with the
  microphone glyph and the meter beside them.
* **On air:** both occupied quarters went to `live: true`; the empty two
  did not.
* **Soloed on guest 2:** slot 2 alone read `live` and `soloed`; slot 1
  dropped off air, with every microphone still in the mix.
* **And the box:** tile 02 measured **99×83**, tile 03 measured **99×83** —
  the same, before and after, with four cameras inside one of them.

The author's channel and the conversation behind it were restored from
copies taken before the run: the same armed session, the same five
participants, the same one staged.
