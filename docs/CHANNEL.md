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

---

## C-16 — Stage 16: the media player, and the three lists of containers

*Priority 2: "Connect it to the existing Library. No duplicate media
system." The player is small. Getting a song as far as the player found
four faults, three of them older than this brief.*

### Tile 05 was not a player

```ts
const scheduled = on.kind === 'programme' || on.kind === 'rotation'
  ? on.source : undefined;
{ n: 5, label: 'Media Player', sub: scheduled ? nameOf(scheduled) : 'Idle',
  ...(onAir && scheduled ? { act: () => onTake(scheduled) } : {}) }
```

It **mirrored the schedule**. `Idle` never meant *nothing is loaded*; it
meant *nothing is scheduled*, on a tile whose name promises something else
— and clicking it rolled in whatever the clock had reached, which is what
the PROGRAM button two feet away already does. There was no way to load
anything at all. That is the brief's *"no obvious path from Library →
Media Player → Programme"*, stated as code.

Now the tile says what the PLAYER is doing, shows what is cued, and opens
the picker. Taking a thing to air is the transport's own red control,
clearly labelled, rather than a side effect of clicking a monitor.

### The library had no durations, and its own header said it did

`broadcastLibrary`'s head has always claimed it supplies *"the one thing a
scheduler needs that a render does not carry: how long it is."*
`BroadcastItem` had no such field. The studio compensated by printing
**megabytes** where a duration belongs, and by defaulting every scheduled
slot to **fifteen minutes** — so a 34-second station ident was booked for
a quarter of an hour, and nobody chose that.

**Measured from the file, not from the document.** Both documents can
compute their exact output length, and both would give the length of the
document *as it is now* rather than of the file on disk, which was
rendered from a plan that may since have changed. A schedule points at a
file.

**Measured once.** `probe()` counts frames by decoding — exact, and far
too slow to run over thirty renders every time a rail is drawn. The
container's own duration is accurate to a few milliseconds and a slot is
milliseconds by design. The answer is written in a sidecar beside the file
with the size and modification time it was measured from, so a replaced
file is measured again and an unchanged one never is. **Both** are checked:
a re-render of the same plan keeps the length and changes the time; a file
restored from a backup keeps the time and can change the length.

### A song could not be put in, served, or found

Three lists of containers, in three files, all saying the same three
things:

| | knew about |
|---|---|
| the upload route's `KINDS` | jpeg, png, webp, mp4, webm, quicktime |
| the serving route | `png`, then `jpg`, then `mp4` |
| `playoutSources.pathFor` | `mp4` for anything not a still |

So the one thing the media player exists to play was the one thing that
could not be put in the library. The browser said it plainly:
**`MEDIA_ELEMENT_ERROR: Format error`**, because the file being served was
an `.mp4` that did not exist.

They are one table now (`libraryMedia.ts`), and the three callers read it.
Adding a container is one line instead of three edits, two of which would
be found later by somebody discovering that a song plays in the picker and
is black on the air. Each file keeps its own extension: an `.mp3` stored
as `.mp4` is a file whose name lies to every reader of it.

**Two faults fell out of writing that table down:**

* **`decks/` was in the library as a schedulable video.** `otherMedia()`
  listed everything in the directory that did not end `.json`, and
  `paths.decks()` puts a *directory* there by design. It appeared as a
  video called `decks` with no duration — invisible while the rail showed
  megabytes, because a directory has a size. The media player's picker put
  it at the top of the list, which is how it was found.
* **Deleting a library item left the PNG behind.** The DELETE removed
  `jpg` and `mp4` and never `png`, so a deck page deleted from the library
  stayed on disk and stayed servable. It now removes every container in
  the table, and the measurement sidecar with them.

### What the brief asked a song to be

| §25 asks for | where it comes from |
|---|---|
| title | `BroadcastItem.title`, read now rather than copied |
| artist / owner | a performance's `master.artist`, a conversation's `source.creator` — the person already in the attribution block, not a new field to fill in twice |
| duration | measured once, beside the file |
| audio / video type | **measured from the streams**, never from the name: an `.mp4` with no video stream is a song, and a channel that put it out as a video would transmit four minutes of black |
| thumbnail / artwork | `Thumb`, which already draws a poster frame from any render — no new field |

### The audio treatment, and the meter that is not decoration

*"ALBUM ART / CHANNEL GRAPHIC, Song Title, Artist, audio waveform."*

An audio item previews through the channel's own graphic, so the monitor
and the transmission are not two different-looking things.

**The waveform is the file's own spectrum**, read through an
`AnalyserNode` on the element that is playing. A drawn squiggle under a
song that is silent because the file is broken is the decorative answer
this brief rejects two sections later; a silent song shows a flat axis
here, which is the truth and is what an operator needs in the second
before they take it. Square-rooted, because hearing is not linear and the
first browser run showed a wall of bass beside a flat dotted line.
Mirrored about its centre, because that is what makes a row of bars read
as a waveform rather than as a bar chart.

### A cued item outranks an armed camera

Preview is *what you are about to cut to*, and the operator has just said
which. The camera stays armed and stays one press from the air; it is
simply not what is being looked at. Taken or ejected, the monitor falls
back to the camera and then to the schedule.

**`taken` is deliberately not previewed.** From the moment it goes to air
the channel's roll-in owns it and Program Output shows it; a preview still
playing the same file would be the same thing on two monitors a second
apart.

### Verified in the browser, against the author's own library

A song was added to the library, cued, previewed, played and taken.

* **47 rows** in the picker, each with its own duration — `0:05`, not
  `84 MB` — and `decks` gone from the list.
* **Search by artist** found it: `Ancient Days · Ron Kenoly · 0:05`.
* **It played**: `paused: false`, `currentTime: 3.592`, no error, the
  transport clock reading `0:03 / 0:05`.
* **The meter moved**, and across the bands rather than in the bass alone.
* **Take live** put `segment: { kind: 'media', assetId: … }` into the
  channel document, tile 05 read *"On programme — Ancient Days"*, and the
  preview fell back to the armed camera.

The temporary song was removed and the channel restored from a copy taken
first.

**One honest note about that run.** The Chromium in this container is the
open-source build, which has no AAC or H.264, so the first song — an
`.m4a` — reported `DEMUXER_ERROR_NO_SUPPORTED_STREAMS` after the serving
was fixed. The same file plays in an ordinary browser. The verification
above used Opus, which the open build does decode, so what is proved is
the player, the treatment, the meter and the take — not that every codec
plays in every browser, which was never this product's claim.

### What is still to build, and it is named here so it is not forgotten

**An audio item goes on air as `form: 'video'`**, because that is what a
`ProgrammeSource` can say today — so the playout engine will render a song
as a black picture with sound on it. The studio already tells audio from
video by measuring the streams; what is missing is the same visual
treatment, composited server-side, in the render path. That is the
remainder of §25 and it belongs with §26's compositor work rather than
bolted to the picker.

---

## C-17 — Stage 17: the compositor, and the field that was read at last

*Priority 3: "Virtual Background — build as a real compositor feature.
Don't add more decorative background buttons." The buttons are gone. What
replaced them is the matte the render path has always used, running on the
canvas the encoder reads.*

### The ten squares wrote a field nothing read

C-14 found it and this stage proved it: pressing a set wrote
`channel.identity.spaceId`, and **nothing drew it** — not `marksFor`, not
the playout engine, not the canvas mixer, which fills `#05070a` and draws
raw video. The panel's own swatch changed and the air did not. That is the
exact failure §26 names — *"just a CSS background behind a preview"* —
arrived at from the other side: not even a preview.

It is read now. The channel's set is the **house set**: everybody in the
picture starts in it, and anybody can be moved out of it.

### The compositor is not new, and that is the point

*"BalanceVid's browser canvas is already the master feed architecture. The
virtual-set result needs to travel through that same composition path."*

It does, and the algorithm travelled the other way. `src/render/matte.ts`
has keyed every Studio Two performance since §4: difference against a
plate, threshold at a multiple of the room's own measured noise, erode to
kill the fireflies, dilate twice to put the outline back and a little
beyond it, feather into that margin, merge. Written there as an ffmpeg
chain; written here as six WebGL passes, **from the same two functions** —
`matteThreshold` and `matteFeather` — so a broadcast and an export of the
same person against the same room cannot key differently.

Six passes and not one because the erode and the dilate each need a
neighbourhood and a separable blur costs two rather than the square of
one. In a single shader that is 27 texture fetches per pixel and one
unreadable function; as passes they are the operations `matteChain` lists,
in the same order, each one nameable.

**WebGL and not CSS**, for the reason the brief gives: a filter on an
element styles what the operator sees, and the operator's screen is not
what is being transmitted. The compositor draws into the canvas
`captureStream` hands the encoder.

### Why not a segmentation model, which §26 names

`environment.ts` argued this before the brief existed, and the argument is
the product's:

> *"There is no segmentation model here guessing where a person ends;
> there is a PLATE… It is exact where it is exact… Its precondition is
> knowable IN ADVANCE… It fails honestly."*

A model is a per-frame guess, and S-6's warning is about exactly what a
per-frame guess does to a moving picture: a flickering edge and a hand
that disappears on the beat. A plate is arithmetic against a still of the
same room, and its failure mode is knowable before anybody goes on air.

So the two keys offered are the two the brief itself ranks — **chroma when
there is a green screen, which it calls the higher-quality path, and the
measured plate otherwise.** When there is neither there is no matte, and
the studio says so in a sentence naming both of the two things to do,
rather than greying a swatch. A disabled control teaches somebody the
feature is broken.

### A plate can be taken of a guest

Studio Two takes one before a performance; a broadcast has to take one
while it is happening. `takePlate` is the same measurement from a
`<video>`: the same sixteen frames, the same reduction to 160×90, and the
same per-pixel standard deviation over time — `noiseFrom`, which both
paths now call, because a studio that promised a clean key and a render
that did not deliver one would be two answers to one question.

**It works on a guest** because their camera is already decoded in this
browser. *"Ask them to step out of shot and press Take plate"* is the whole
procedure: nothing is uploaded, and nothing of their room is stored
anywhere but the page.

Taken from the mixer's own detached `<video>` rather than a second element
on the same stream, which would be a second decode of the same bytes.

### The thumbnails are the sets

`SPACE_SWATCHES` took each look's `top` colour and painted a rectangle of
it, so Recording Studio and Night Studio were two near-identical dark
greys and Beach and Mountain two pale blues. The information that tells
them apart — the light, the band, the vignette — was thrown away to make
the swatch. That is why the brief calls them decorative buttons.

`paintSpace` runs the same five operations the shader runs, at 96×54. A
person choosing Concert Stage sees the purple pool and the stage lip, and
that is what they get on the air. It is not an approximation of the set;
it **is** the set at a smaller size — which is only possible because §4
draws these rather than licensing photographs of them.

Measured in the browser: **8 to 15 distinct tones** per thumbnail where a
flat swatch has one.

### Three shelves, one open, one person at a time

Eleven thumbnails at a readable size is four hundred pixels of a
three-hundred-pixel column. One shelf at a time is the same library in a
hundred, and the shelf is named — *Studio / Performance / Places*, the
brief's own three.

Four people × four controls is a spreadsheet; a person picker at the top
and one set of controls under it is a **channel strip**, which is what a
desk has always used for this shape of problem. Each row in the picker
carries its own answer, so the operator does not have to click through
four people to find the one still sitting in their kitchen — and a row
whose set cannot be drawn says so in amber.

### The fifth time the desk strip clipped

Adding Media and Set made eight desks in a 328-pixel column. The comment
above `Strip` is the history of one clip fixed four times, and every fix
was a way of making the labels smaller. Eight do not fit at any legible
size, so a fifth shrink would produce eight stubs instead of one.

**It wraps.** A segmented control with two rows is still a segmented
control; a row of `CAM… GUE… SCR…` is not a control at all.

### Verified in the browser, against the author's own channel

* **The house set was read.** With nothing chosen in the panel, the person
  row already said **Concert Stage** — from `channel.identity.spaceId`,
  the field that had never reached a pixel.
* **Before a plate:** *"You is going out in their own room until there is
  something to separate them from it."*
* **The plate measured the room** and returned the real verdict —
  *"Usable. Edges may soften where you move fast — more light on you than
  on the wall behind you is the fix."*
* **After:** the warning was replaced by *"Composited into the programme
  feed, not just this preview"*, and the armed preview — which is
  `mixer.stream`, the canvas the encoder reads — showed the camera keyed
  onto the Concert Stage, with its purple pool and its stage lip.
* **The desk strip** read as two rows of four, every label whole.

The channel was restored from a copy taken first.

### What §26 and §27 still owe

* **Per-person controls exist; a second person has not been composited in
  a live run.** The path is the same one — the mixer draws each source
  through the compositor in turn — but what has been seen on screen is one
  person. Naming that is cheaper than implying otherwise.
* **§27's virtual set is still a background.** A `SpaceLook` is a wash, a
  light, a band and grain. Presenter positions exist (`LAYOUTS`) and
  programme graphics exist (`marksFor`); the desk, the screens, the logos
  and a lower-third region the set owns do not. That is the next item and
  it builds on this compositor, which is the order the brief sets.
* **And the server-side half.** This composites the LIVE canvas. A
  rendered export still goes through `compose.ts`, which has always done
  this properly — but an audio item on air (C-16) and a virtual set in a
  recorded programme both need the same treatment in the render path.

---

## C-18 — Stage 18: the set is a scene

*Priority 4: "Virtual Set — build on top of that compositor. A reusable
scene system rather than a collection of images."*

### What a set is, and what it is not

*"Background and Virtual Set should not be the same thing. Background
simply replaces what's behind a person. Virtual Set is a complete
production scene."*

The product had **one control for both**, and it was the background one:
a `SpaceLook` is a wash, a pool of light, a band and grain. That is a
backdrop, precisely as §27 defines it, sitting under a panel labelled
"Background / Virtual Set".

Of §27's eight parts, two already existed and were not rebuilt:
**presenter positions** are `LAYOUTS`, shared by the live mixer and the
ffmpeg renderer so a quad here and a quad in an export are one table; and
**programme graphics** are `marksFor`. What a set adds is the furniture
between them — a desk, a screen, a riser, a band, a place the logo
belongs and a strip the lower third owns — and the fact that all of it is
**described** rather than drawn: every rectangle is a fraction of the
frame, so one set works at 1280×720 on the canvas and at whatever an
export asks for.

*"A reusable scene system rather than a collection of images."* Nothing
here is an image. A set is a space id, an arrangement per head count, and
a short list of rectangles with a purpose each.

### It belongs to the channel; a background belongs to a person

A background is per participant — *"each participant can have an
independent background"* — because it is about their room. A set is the
station's studio, and §13 already says where that lives: *"a station does
not repaint its studio between programmes."* So `identity.setId` sits
beside `identity.spaceId` and outranks it.

**And the panel says so.** With a set on, everybody is cut out of their
own room and placed in the station's, so a per-person backdrop decides
nothing — and a shelf of swatches that changes nothing is the exact fault
this panel was built to replace. The background section is replaced by
one line and a way out. Separation and positioning stay, because they are
about the person rather than the room.

### One ordering makes it a studio

The scene is drawn **once for the whole frame** — the room is the studio,
not four rooms in four panels — then each person is **cut out** of their
own room into their position in it, and the desk is drawn **over** them.

That last part is the whole difference between a studio and four cutouts
standing on air: the bottom of a presenter disappears behind the desk,
exactly as it would in a room. `inFront` is one predicate and the desk is
the only thing it is true of.

**The compositor had to learn to hand back an alpha.** It merged a person
onto their own background and returned an opaque picture; a set needs the
foreground with a mask so the 2D canvas can composite it onto a scene
already drawn. The GL context is `alpha: true` and **not premultiplied**,
because a premultiplied buffer has the mask already multiplied into the
colour and `drawImage` would multiply it a second time — leaving a dark
halo exactly where the feather is.

### The set lights the people for the room they are standing in

A stage is dark and the light comes from above and behind; a news studio
is flat and bright. A face carried into one from the other has to move,
so `light` is a property of the **set**, added to the person's own
adjustment. Stage is −0.14 and News Desk is +0.18, and a test holds the
signs apart.

### What the tests hold

`virtualSet.ts` has 18 assertions. Every set must name a room
`SPACE_LOOKS` can light and arrangements `LAYOUTS` actually has — a set
carrying its own geometry would be a second answer to "where does the
second person go", and the two would differ in an export. Every rectangle
must be inside the frame. A lower third must clear the desk it shares a
set with, because a name on a desk's front edge is a name nobody can
read. And a set asked for more people than it was drawn for **falls back
rather than refusing**: a third guest arriving mid-programme must not
black the picture out.

**Fourteen mutations tried, twelve caught.** The two that survived removed
guards nothing could observe — a `Math.max(1, count)` clamp and an
exact-match fast path above a filter that already answered both cases.
Both were deleted rather than defended with a new test, which is the
third time this session that a mutation sweep has found decoration rather
than a missing assertion.

### Verified in the browser

Four sets, each with a thumbnail that is the scene — **12 to 22 distinct
tones**, drawn by the same two passes the mixer runs, so News Desk shows
its desk and its screen before anybody picks it. Choosing it replaced the
background shelves with *"News Desk is providing the room, so each person
is composited into it rather than into a background of their own"*, and
the armed preview — `mixer.stream`, the canvas the encoder reads — showed
the keyed camera sitting behind the desk in the Modern Room, with the
screen on the wall beside them.

The channel was restored from a copy taken first.

### Still owed

* **The logo region and the lower-third region are described and not yet
  drawn.** Marks are composited server-side by the playout engine from
  `marksFor`, which places by corner; a set naming a region means nothing
  until `marksFor` reads it. That is a small change in the same place the
  audio treatment (C-16) and the server-side compositor (C-17) are owed,
  and all three are one piece of work in the render path.
* **A screen in a set shows nothing.** What would go in it is the
  programme or the graphics layer, and feeding a monitor its own output
  is a decision rather than a default.

## C-21 — Stage 21: the third kind

*"Why is the media player not working any more, when it was highly
designed?"*

Because `MediaKind` has had three values since C-16 built it — `video`,
`audio`, `image` — and everything downstream handled two.

### Three symptoms, one cause

A still loaded from the library was handed to the same `<video>` element
as a film. The comment above that element was right about the two kinds
it named and had simply never been asked about the third:

> ONE ELEMENT EITHER WAY. A `<video>` plays a song perfectly well and
> shows nothing, which is exactly right.

A `<video>` shows a PNG nothing at all, which is not. So the operator
loaded a slide, and got:

* a **black preview monitor**, because nothing decoded;
* a clock reading **`0:00 / –`**, because a picture has no duration; and
* a **Play button that did nothing** when pressed, because `may()` is
  about the phase and knew nothing about the kind.

Three things wrong on one panel, and one reason for all three.

### What it is now

An `<img>`, returned before the media element rather than beside it —
there is no `HTMLMediaElement` for a photograph, nothing to play, nothing
to time and no spectrum to draw, so a still that shared the path would
have to be special-cased in four places instead of skipped in one.

The clock says **STILL**. `0:00 / –` is a true fact written as a
stopwatch nobody can start; how long a picture holds when it goes out is
`stillMs` on the programme, which is a different question. [§3]

And **play and pause are refused on a picture**, which is the part that
belongs in the domain. Load, Take live and Eject all still mean exactly
what they say: a still is precisely as takeable as a film, and it is the
taking that puts it on the air. A control that does nothing when pressed
is the fault this desk keeps removing.

`may(state, act, kind?)` takes the kind optionally, so a caller that does
not know it gets the behaviour it always had rather than a refusal it
cannot explain.

### And the folder that was offering itself as a video

`var/library/decks/` is a folder of slide images. The library listing
returned it as a 4 KB item called **"decks"** with `form: 'video'` —
schedulable onto a channel, loadable into the player, black on every
monitor it reached.

That fault was found and fixed once, in `broadcastLibrary.ts`. It was
still there in `app/api/library/route.ts`, which is the OTHER listing,
which is why the operator's library still showed it. One question — *is
this a file I can play* — answered in two places, which is the exact
shape `libraryMedia.ts` was extracted to stop. A test now holds both
listings to the same two answers. [D-19]

### Measured

Five mutations on the transport guard, all five caught. Then in a
browser, on the author's own library, reading and not writing:

| | before | after |
|---|---|---|
| preview element | `<video>`, black | `<img>`, painted at 1920×1080 |
| clock | `0:00 / –` | `STILL` |
| Play | enabled, did nothing | disabled, says why |
| library rows | 6, one of them a folder | 5, all of them files |

## C-19 — Stage 19: why a healthy channel is still dark

*"Why is this channel not showing when I am live?"*

`whyDark` was written for that question, cited this section, and this
section did not exist. It had no test. Nothing called it. The operator's
sentence — the one that answers the question actually asked — was sitting
in `health.ts` where only a reader of the source would ever find it.

### The six answers and the two that were missing

`healthSentence` covers the transmitter: the engine stopped, the engine is
stale, the stream went silent, the stream stalled. Every one of them is
about a PROCESS. It has no word for the two states where every process is
healthy and the channel is still black:

* the operator pressed **GO LIVE** and not **TAKE LIVE**, so the camera is
  in preview and `whatIsOn` is off — one press wide; and
* the channel has nothing to play, because nothing is booked and the loop
  is empty.

Both are correct behaviour, and neither is a fault. That is exactly why
they need saying: a fault announces itself, and a correct state that looks
like a fault does not.

### What wiring it up found

**The note would never have appeared.** `healthSentence` returns a
sentence for every state except *running and transmitting*, so on any
channel that is off air it is non-null — and the control room showed it
first. Computed, returned to the browser, and never once displayed.

Worse, the sentence that would have won is the unhelpful one. *"The engine
is running but has not written a segment for this channel yet"* is true of
a channel with an empty loop, sounds like a fault, and tells the operator
nothing they can act on. It has not written one because nothing was ever
asked for.

So the ORDER is now a decision in the domain rather than an accident in a
component. `controlRoomNote` takes both and returns one:

* a stopped or stale engine outranks everything, because while nothing is
  being written it cannot matter which button was pressed;
* once the engine is up, the operator's reason wins;
* otherwise the transmitter's sentence stands.

**And the tone travels with the sentence.** Red for a thing that is broken
teaches an operator to read red; red for a thing that is merely true
teaches them to ignore it. `fault` is `--bad`, `note` is `--text-faint`,
and the component paints what it is given rather than guessing from which
field the text came out of. [D-04]

### Measured

Seven mutations across `whyDark` and `controlRoomNote`, all seven caught.
Then in a browser, on a throwaway channel created and deleted for it —
the author's own channel was read and not touched:

| state | line | colour |
|---|---|---|
| engine beating, armed, empty loop | *"Your camera is up in PREVIEW and nothing is on the wire yet. TAKE LIVE is what puts it out."* | `rgb(134,141,150)` — faint |
| heartbeat allowed to go stale | *"The playout engine stopped responding…"* | `rgb(215,89,74)` — bad |

The same strip, the same channel, twenty seconds apart.

The author's real channel is the case that proves the precedence: it is
`phase: armed` with a rotation of eight, so `whatIsOn` is `rotation`, not
`off`. `dark` is null and the engine fault speaks — which is right, and is
what it showed.

## C-20 — Stage 20: the region the set had drawn all along

*"The logo region and the lower-third region are described and not yet
drawn."* — C-18, still owed.

### What was already there

Every `VirtualSet` has carried two rectangles since the sets were drawn:
`logo`, where the station's mark belongs in that scene, and `lowerThird`,
the strip the lower third owns. They are fractions of the frame, like
every other rectangle in the product, and `virtual-set.test.ts` has been
asserting since they landed that a set with a desk in it keeps its
lower-third strip clear of the desk.

They were read by nothing. `marksFor` placed every mark by CORNER, and
`bottom-left` in News Desk is the front of the desk — so the one caption
the set had carefully made room for was written across the one surface in
the picture guaranteed to be in front of it. The data was right, the test
was right, and the consumer did not exist.

### What was added

`Mark` gained an optional `at: Rect`. `marksFor` fills it from the
channel's set, where the channel has one: the bug takes `logo`, and the
lower third, the cited contributor's name and NEXT all take `lowerThird`.
`markFilters` turns a region into pixels — the only place that knows how
big a frame is — and stacks upward from the region's floor exactly as the
corner stack does, counted separately so a caption in the set's strip is
not in the way of one in the frame's corner.

**The LIVE lamp keeps its corner, set or no set.** It is not part of the
scene's design: it is the one mark that is a statement of fact about the
transmission rather than a decoration, and a viewer checking whether this
is live should find it in the same place on every channel they watch
rather than wherever this room's furniture allowed.

**A channel with no set is unchanged.** `at` is absent, and the corner
decides, exactly as before.

**No extra inset.** Every set's rectangles already carry their own margin
— `x` is 0.04 or wider on all four — and padding a padded rectangle would
move the caption off the strip it was drawn to sit on.

### Measured

Seven mutations tried and seven caught, after the first sweep found one
survivor worth having: the CITED contributor's lower third took the
region through a different branch from the title's, and only the title's
was covered. That is the caption most likely to land on a desk, because
it is the one that goes up unbidden — somebody's answer is playing and
the station names them over their own face. It has its own assertion now.

`markFilters` was exported for the test rather than for a caller. A wrong
drawtext expression does not produce a wrong caption: it fails the
segment, and the encoder's own fallback turns that into four seconds of
black.

### Still owed

* ~~**`whyDark` is written and called by nothing.**~~ Done in C-19 above,
  which is the section it had been citing all along.
* **The audio treatment (C-16) and the server-side compositor (C-17)**
  are still owed in the same render path, as C-18 said.
* **A screen in a set shows nothing.**

## C-22 — Stage 22: the air and the export, measured against each other

Studio Two's record carries this as **S-41**; what it did to the control
room belongs here.

**The live compositor drew the room upside down.** `v.y` is zero at the
bottom of what a viewer sees, and every number a `SpaceLook` states is a
fraction DOWN the frame. Concert Stage's stage lip ran across the
ceiling and its lighting rig sat on the floor, on every channel, since
the shader was written. Modern Room came off the ffmpeg chain at 210 at
the top and 90 at the bottom, and off the shader at 85 and 164.

**Its pool of light was an ellipse.** A distance taken in uv is a
distance in a square, so on a 16:9 frame the lamp came out half again as
wide as it was tall. Measured: the same pool read a half-width of 0.250
across and 0.250 down in fractions of the frame, where a circle on 16:9
reads 0.5625 of its vertical span. It now reads 0.62.

**And the first frame of every plate-keyed broadcast had no matte.**
`upload` asked for its texture before choosing a texture unit, and
creating a texture binds it — so the plate landed on unit 0 as well as
unit 1, and the difference matte differenced the plate against itself.
It corrects itself on the second frame, which is why nobody reported it.

**`paintSet` now resolves placements.** S-40 put `placedFor` in the
domain and said the canvas renderer could call it the moment it took up
grounding. It does. At 16:9 — every control room today — it returns
every piece exactly as authored, so nothing moves until somebody
broadcasts in a shape the sets were not drawn for.

### Where the live path stands

The control room and an export now draw one room: the same floor, the
same horizon, the same lamp, and the same light on the person standing
in it, sets included. What they still draw differently is the vignette
curve and the grain, and neither has been measured against the export
the way the rest was — S-44 records that, and records that *not
measured is not the same as wrong*.

### Still owed, and this adds one

* **A person composited onto a virtual set gets no wrap and no contact
  shadow.** The set is the studio, drawn once for the whole frame, so
  each person comes back from the shader as a cutout with an alpha and
  the 2D canvas composites them. The shader cannot reach the pixels
  behind them to darken or to sample. A participant's own drawn room
  gets both; a set gets neither. ~~**Architectural, not unfinished**~~
  — **done in S-43**, and the architecture argument was half wrong.
  The shadow never needed the pixels behind the person: black at alpha
  `s` composited with source-over leaves `back × (1 − s)`, which is the
  multiply a contact shadow is, so a cutout carries its own shadow in
  its alpha channel. The wrap did need them, and the mixer paints the
  set into the master canvas before anybody is composited into it — so
  the compositor is handed that canvas and samples it exactly as it
  samples a backdrop it drew itself. No second lighting path: the set
  names its room, `groundingFor` answers for it, and the rule that a
  drawn space grounds while an original or a blur does not is
  unchanged.
**The canvas pool faded to transparent BLACK**, which is the oldest trap
in a 2D gradient: a stop carries a colour as well as an alpha, so the
studio's pools darkened as they thinned. They fade to the glow's own
colour at zero alpha now.

**And the lamp is one shared number.** This section first said the
export and the air disagreed about the pool's size and left it as a
decision. The decision was taken — the export's size, three tenths of
the longer side — and taking it showed the export had not been drawing
a rule at all: naming the frame's corner as the far end of a radial
gradient hands `gradients` a coordinate one past the last pixel, and it
returns a radius unrelated to the geometry. Modern Room's lamp drew 84
pixels and City's drew 584, from the same rule. `lampOf` states the
circle; all three renderers now read within one part in 255 of each
other at every distance from it. [S-41]

## C-23 — Stage 23: the monitor shows something

* ~~**A screen in a set shows nothing.**~~ The oldest line on the list
  above, and the code said why: *"It shows nothing yet and says so —
  what would go in it is the programme or the graphics layer, and
  feeding a monitor its own output is a decision, not a default."*

The decision taken is neither of those two. **A shared screen goes on
the monitor.**

### Why that source and not another

The live studio holds three kinds of picture: staged guests, one
screen share, and an answer clip. Every one of them has been treated
as a person since the mixer existed — they go into `LAYOUTS` panels
and compete for them — and exactly one of them never was a person.

A slide cut into a quad beside three faces is a slide nobody can read.
A studio has a monitor on the wall for precisely this, and the source
already exists, already arrives distinguishable, and needs no new
concept to reach the glass. The programme would have been a feedback
loop and the graphics layer belongs over the picture rather than in
it; a rolled-in library item is the better editorial answer and a
larger piece of work, because the rolled-in segment is a playout
concept today rather than a picture the studio canvas holds.

### What it took, and what it found

**`glassOf`, because the bezel was computed twice and differently.**
The canvas inset by twelve thousandths of the monitor's WIDTH and the
chain by four hundredths of its SMALLER SIDE — six pixels against
twelve on News Desk's monitor at 1280×720. The same screen, drawn with
twice the bezel in an export as on the air. It cost nothing while the
glass was dark and empty; the moment a picture goes in it, it is the
rectangle that picture has to land in.

The chain's rule is the one kept, on its merits: a fraction of the
smaller side gives a monitor the same bezel whichever way round it is,
where a fraction of the width gives a wide one a thick frame. **All
twenty-four screen renders across six frame shapes come out of the
chain byte-identical**, so the export did not move; the control room
moved to match it, which is the direction every one of these
disagreements has gone since S-41.

**`screensIn`, which goes through `placedFor`** — so a monitor that
moved for a narrow frame takes its picture with it, and one there is
no longer room for does not come back as an empty rectangle to draw
into. Measured across the four sets: Talk Show's two are the ones that
do not survive 9:16, where a performer taking four fifths of the width
leaves neither of them its `atLeast`. Lecture's is the biggest and
survives every shape, which is the opposite of what I guessed and the
reason the fixture says so.

**`MixerSource.kind`**, because `'screen'` was already a magic string
in the studio and reading it a second time is how a magic string
becomes load-bearing.

### The rules it follows

**Every monitor the set has**, because a studio with two screens on
the wall shows the same thing on both, and because "which one" is a
question nobody needs to answer for it to work.

**Behind the people.** A screen is furniture drawn in the `behind`
pass, so the picture goes down between the room and the performers and
somebody stepping across the monitor occludes it, exactly as they
occlude the wall.

**Contain, not cover** — the opposite of the choice made for a face
and for the opposite reason. A face cropped at the ears is still that
person; a shared slide cropped at the margins has lost the sentence
somebody is reading out.

**Solo suppresses the monitor.** When the operator solos the share it
takes the whole picture and the set's monitors go dark for as long as
the solo is held.

Stated that way round because the first wording — *"solo outranks the
furniture"* — was read, on first contact, as a rule about spatial
priority: the monitor keeping its picture while something else won the
frame. It is not a spatial rule. It is an operator STATE, and while it
is held there is one source in the picture and the furniture has
nothing in it. The two readings differ in what the audience sees, so
the sentence is worth getting right.

**And a set with no monitor changes nothing.** Stage has none, and a
broadcast with no set at all has none either; the share keeps the
panel it has always had, because the alternative is a picture with
nowhere to go.

### The record

Nine assertions, nine mutations, all nine caught — after a guard was
deleted rather than defended, which is the eighth of those. A filter
dropping a monitor whose bezel had eaten its own glass survived its
mutation, and checking why showed it guarded nothing twice over:
`glassOf` already clamps a pane to zero rather than negative, and
drawing into a rectangle of no width is a no-op in both renderers. It
would take a broadcast canvas ten pixels wide to produce one.

One fixture was wrong before it was right, and the comment says which:
Lecture's monitor looked like the one that would not fit a tall frame
and is in fact the one that always does.

## C-24 — Stage 24: the channel was transmitting black, and nothing said so

Every segment this product ever put on the wire for a channel with an
identity was black.

### The fault

`produceSegment` ends its filter chain with `markFilters` — the station
bug, the lower third, the NEXT line — which emits ffmpeg's `drawtext`.
The pinned `ffmpeg-static` is built without freetype and **has no
`drawtext`**:

    $ ffmpeg -filters | grep -c drawtext
    0

A filtergraph naming a filter that is not there does not degrade.
**ffmpeg rejects the GRAPH.** So the bug did not quietly fail to
appear; it took the whole segment with it, `encodePiece`'s fallback
wrote four seconds of black, and the channel did that forever.

Run against the shipped binary with the real `markFilters` output:

| chain | result |
|---|---|
| scale, pad, fps, setsar | renders |
| the same plus the identity | **`No such filter: 'drawtext'`** |

### Why nobody could see it

Four things hid it, and each was individually correct.

* **The fallback succeeds.** *"A source that cannot be read is black,
  not a dead channel"* is the right call. Nothing counted it, so a
  channel rendering black four seconds at a time read as
  `transmitting`.
* **`streamState` asks whether segments are ARRIVING**, which they
  were. There was no signal anywhere for what was in them.
* **The control room's monitor is the operator's own canvas**, never
  the transmission (§7, so a presenter does not talk over themselves).
  It cannot show this.
* **The viewer's page looked plausible** — a running clock, a LIVE
  badge, and the channel's own name, because the title comes from the
  document and not the picture. Had the engine truly been off air it
  would have read *"Off air"*.

A resilience path with no telemetry is a fault that cannot be found.

### The fix, in three parts

**Ask the binary.** `availableFilters` reads `ffmpeg -filters` once per
process and `canDrawText` answers from it. Asked, not assumed — and a
binary that will not answer is taken at its word as having nothing,
because the caller then draws no text, and a picture without a bug
beats no picture.

**Emit nothing rather than something fatal.** `markFilters` takes the
answer as a REQUIRED argument and returns `[]` when text cannot be
drawn. The plate goes with the text: a box is drawable without
freetype, and a black rectangle where a name should be looks
deliberate.

**Count the fallback.** Both catch sites now record what ffmpeg
actually said, through `reasonFrom`, which prefers the line NAMING the
refusal over the tail — *"No such filter: 'drawtext'"* is an operator's
whole answer and *"Conversion failed!"* is not — and strips the graph
address so one fault does not read as two. `controlRoomNote` says it
**above everything, including a stopped engine**: a stopped engine
announces itself because the channel is off, while a running engine
writing black looks perfect from every angle an operator has.

### Getting the bug back

`BALANCEVID_FFMPEG` points at a binary of the deployment's choosing,
and `WITH_TEXT=1` puts a capable `ffmpeg` and a font on the image.
**Default off, because the size of that addition has not been measured
on this base image and shipping an unmeasured number is the habit this
record exists to prevent.** Turn it on, check `ffmpeg -filters | grep
drawtext` in the built image, and leave it on.

The entrypoint points at `/usr/bin/ffmpeg` only **if the file is
really there**, and that is a bug before it is a decision: a Dockerfile
cannot branch on a build argument inside an `ENV`, and the obvious
`${WITH_TEXT:+/usr/bin/ffmpeg}` expands whenever `WITH_TEXT` is set to
anything — `"0"` included. Written that way it would have pointed every
render at a binary the image does not have, turning a channel with no
bug into a channel with no renders at all. Looking for the file is
correct in both directions and keeps nobody in step with anybody.

### The record

Eleven assertions, eight mutations, all eight caught — after two
survived.

A default of `true` on `markFilters`' new argument survived because
nothing exercised it, and *a default of `true` is precisely the
assumption that cost the product its picture*. The argument is required
now and the one other caller states what it found out. And nothing
exercised the probe's own failure path, so a test asks a binary that
does not exist and checks the answer is "nothing" rather than
"everything".

And the suite caught a third thing, which was mine. The failure record
was first written into the channel's `stream/` directory, beside the
segments; a test that asserts that directory holds **only** `N.ts`
failed within the hour. It was right: the sweeper deletes by age from
there and the playlist route lists it, so a health record among the
segments is one the sweeper will eventually delete and the playlist may
eventually serve. It sits beside `playout.json` now, for
`playout.json`'s own stated reason — liveness does not live with the
material.

Nothing here mocks ffmpeg. The binary the product ships is the one
asked.

---

## C-25 — Stage 25: the panel sent four of the fields the route accepted

*"Keep the exact vertical card shape and upgrade the hierarchy,
controls, states, and editing experience."*

### What was actually broken

Not the look. The route behind the slide writer has accepted
`footnote`, `pictureAssetId` and `ink` since the day it was written,
and the panel sent **none of them**. Four layouts shared the same two
boxes, so:

* **Picture** had nowhere to put a picture, and every picture slide the
  panel could produce said *"no picture"*;
* **Quote** had nowhere to put the person who said it, so every
  quotation was anonymous;
* an authored slide was white on black on a channel that is not white,
  because `ink` was never passed.

Three dead features, all of them already implemented, all of them
unreachable from the only control that reaches them. That is D-19 read
backwards: the feature existed and only the door was missing.

### The fields follow the layout

`FIELDS` is one table from layout to which boxes exist and what to call
them. Absent means **not drawn**, rather than drawn and ignored —
Quote has no heading box because the renderer puts a quotation in the
body, and a heading box there would be a box that silently moves its
contents.

The picture comes from **the Library**, which already holds every
image in the product: the chooser is a view of the list the studio
already polls, passed down rather than fetched again. *"Since Online
TV already has a Library, the slide system should reuse it rather than
creating another media store."* A picture slide **names** an asset, so
the same photograph can be on two slides without a second copy.

`Fit` and `Fill`, and **no crop handle**. The two honest things to do
with somebody else's photograph; a crop rectangle is a picture editor,
and this panel is used between two cues.

### The bug the derived slide fixed, which was mine

The fields outlive the mode that showed them. Type a heading, switch to
Quote, and the heading is still in a box that is no longer drawn.
Three things read that state — the "a slide needs something" guard, the
request body, and the word under the fields — and the first version let
them disagree in both visible directions: a picture chosen and then
abandoned left the panel saying **Draft** over four empty boxes, and a
heading typed under Text would have arrived as **the words of a
quotation**, because the renderer falls back to the heading when a
quote has no body.

One derived object, read by all three. Nothing else was a fix.

### What the renderer took, and what it refused

Two additions: a **numbered list**, because that is structure of the
kind a bullet already is, and the numbers are the author's — a list
continuing from six is a thing a presenter does; and **fill**, because
the alternative to fitting is a real editorial choice.

Refused: bold, italics, alignment, line spacing. `slide.ts` argues
against them in its own words — *"a slide editor with thirty controls
is a slide editor somebody uses to make an ugly slide"* — and the
request to add them arrived with its own answer attached: *"The slide
tool should remain fast enough that an operator can create a slide in
seconds."*

And **point 6 needed no work**: a slide is already a real programme
graphic object. `Slide` is a library image and `sourceForSlide` already
yields a `ProgrammeSource`, so Create → Deck → Preview → Take → Output
was wired before this stage began. Finding that out is what D-19 is
for.

### The record

Twenty assertions on the renderer, nine mutations, all nine caught:
the start number hard-coded to one; `every` relaxed to `some`; the
bracket form dropped; bleed always on; bleed never on; cover turned to
contain; contain turned to cover; the ordered list losing the bulleted
one's spacing; and the fill class moved to the root where it would
have covered every text slide.

The suite caught three things that were mine, all of them repo rules
this stage broke: the raw-colour budget (76 against a ceiling of 74 —
`SlidesPanel.tsx` now has **none**, down from three before this work);
a `data-chosen` state stored for tests and never announced, now
`role="tablist"` with `aria-selected`; and a picture rounded like a
card instead of like a screen. Those three rules are the design system
holding, and the stage is better for having been refused.

139 files, 2,616 tests.

---

## C-26 — Stage 26: the slide was a text box, and it is a graphic now

*"The editor is a control surface. The slide itself is a broadcast
graphic."*

*"Not 'a slide with text.' A broadcast graphic that happens to be
created through a slide editor."*

### The finding, which is about the output and not the panel

C-25 fixed the panel and the panel was the wrong half. What came out
the other end was still centred text on black — four layouts that were
the same object three times over, with the channel's colour applied to
every word on the slide. It was correct and it looked like an
application.

### What was already there, checked first [D-19]

| | Source of truth before this stage | What C-26 did |
|---|---|---|
| Slide definition | `SlideSpec`, sent to the worker and **never stored** | stored on the slide |
| Deck | `domain/deck.ts`, `store/decks.ts` | unchanged |
| Reorder, remove | `PATCH /api/decks/[id]/slides` — **implemented, and the panel called neither** | the rundown calls both |
| Programme state | `channel.live.segment` via `slideOnAir` | unchanged, now labelled |
| Image selection | the Library | unchanged |
| Renderer | `slideHtml()` → Chromium → library PNG | split, not duplicated |
| Playout | slide → library image → `roll-in` | **nothing to do** |

Two of the nine things asked for needed no code. Finding that out
first is what D-19 is for, and it is also why this stage is mostly a
renderer and not an architecture.

### One renderer, and the preview is not a drawing of it

    slide definition  (domain/graphic.ts)
             │
        slideHtml()                 ← ONE layout calculation
         ╱        ╲
     preview    programme
     (iframe)   (Chromium → PNG → the wire)

`slideHtml` was already pure. The only thing stopping the control room
from using it was that `slide.ts` imports `node:fs` to open a browser
— so the file is in two now, and the panel's PREVIEW is **an iframe
containing the exact document the worker rasterises**, at 1920 × 1080,
scaled. "The preview matches the programme" is therefore not a
property anybody maintains; it is one document seen twice. The test
that enforces it is one line: the function the renderer exports **is**
the function the design system exports.

**And the font is named.** `system-ui` is the operator's font in the
browser and the render image's font on the wire, and those are not the
same machine. A deterministic renderer starts with a deterministic
face: Liberation Sans, which is on the image and metric-compatible
with Arial.

### The model is domain, the drawing is not

`src/render` imports `src/domain` in this codebase and never the
reverse, and the deck now stores what a slide SAYS so it can be
corrected and copied. So `SlideSpec`, the backgrounds, the safe areas
and the quality checks are in `domain/graphic.ts`, and only the
stylesheet is in `render/slideDesign.ts`. The spec holds the library
asset's **name** and never a path, so a stored definition still means
the same thing on another machine.

### Four compositions

| | Before | Now |
|---|---|---|
| **Title** | centred text | eyebrow, 104px headline, accent rule, subtitle, left, vertically centred |
| **Text** | centred text | eyebrow, 62px heading, rule, bullets or numbered points, top-aligned |
| **Picture** | a contained image with a caption under it | **two compositions**: Fit splits the frame, Fill bleeds the photograph with the words over it |
| **Quote** | centred italics | quote mark, 70px italic, rule, attribution |

The test that matters is not that each one is pretty — it is that the
set of shapes the four emit has **four members**.

**Fit and Fill became compositions rather than two values of
`object-fit`**, which is the honest reading of what an operator means
by each: Fit is *the picture arrives whole*, Fill is *the picture is
the frame*.

### Five backgrounds, one wash, and the accent stops colouring words

Black stays the default, because a control room is dark and a slide
that matches the programme's own black cuts cleanly. White, Light,
Studio and Image are the four other things television puts on screen.
Every preset carries a flat base colour even where a wash is drawn on
top, because contrast has to be measurable and a check that quietly
skips a case is worse than no check.

**The channel's colour is the accent, not the ink.** Applying it to
every word is what made an authored slide look wrong; it now colours
the eyebrow and the rule — the furniture — and the text takes the
background's own ink. And **the channel is named exactly once**, in
the eyebrow where the composition has one and in the foot where it
does not. A name in two corners of the same graphic is a station that
does not trust the viewer to have seen it.

### Two faults that only rendering found

Both were invisible in the code and obvious in the picture.

1. **Fit cropped the picture.** The split's box used `object-fit:
   cover`, so a 16:9 photograph in a portrait column lost both its
   sides — which is precisely the fault that Fit is the answer to. And
   the bed was held at full height, drawing a tall grey panel round a
   landscape photograph: a letterbox with a border.
2. **A title over a photograph was illegible.** The scrim rose from
   the foot, which is right for a caption anchored to the bottom and
   wrong for a headline in the middle of the frame. There are two
   scrims now, chosen by where the composition puts its content and
   never by a setting.

Reasoning had not found either. *"That is why i need screen shots as
you build to avoid these."*

### The checks, and the line between a warning and a refusal

`slideProblems` returns empty, no-picture, no-words, long-heading,
long-body, many-points and contrast. **Content outside the safe area
is not among them, because it cannot happen**: the content box IS the
title-safe box and it clips. What is detected is the text being too
long to fit inside it, which is the same fault one step earlier.

The contrast check is the one that cannot be made by looking: a
channel whose colour is a deep blue produces an eyebrow nobody can
read on the Studio field, and in a bright control room it looks fine.

**And only two of the seven stop a slide.** A picture slide with no
picture transmits the words "no picture", so nothing takes it. A
heading four characters over its limit is a judgement, and an operator
three minutes into a live programme is better placed to make it than
this file is. A control room that refuses to put anything on air until
it is perfect is a control room somebody works around. [D-04]

### The rundown, and correcting a slide

`Written here (2)` was a count, and a count is not a rundown. Each row
is now a thumbnail, its number and its first line — the three things a
paper running order has had for sixty years — and clicking one takes
it, which is the `roll-in` that already existed.

Correcting a slide is **drawing a new one in its place**, because a
slide on air is a PNG and a PNG is not editable. The position is the
part worth testing, and the swap happens in the worker **after the
render succeeded**, so a draw that throws leaves the slide that may be
on air exactly where it was. If the old slide went while the new one
was drawing, the new one is appended rather than discarded: a render
that succeeded is work somebody did, and throwing it away for a race
they could not see would be the deck punishing them for it.

Correct and Copy appear **only where a definition exists**. A page of
somebody's PowerPoint was never composed here, and offering to edit it
would be a button that cannot keep its promise.

### What was asked for and deliberately not built

* **Crop and Position.** Position is here as Top / Centre / Bottom, which
  is the question a 16:9 crop actually asks. A crop rectangle is a
  picture editor, and this panel is used between two cues.
* **Transitions.** Named as "later, but don't start there" in the
  request itself, and that is the right order.
* **Animation, free positioning, a graphics dashboard.** Excluded by
  the request and by §21.
* **Video backgrounds.** S-34, still untouched.

### Corrected at C-36: the checks ran on one slide and stopped

`slideProblems` above judges the slide being TYPED. It has never
judged a slide already in the deck, and `slideReady` — written here
as *"the line between DRAFT and READY"* — was never called by
anything but its own test. **C-36** checks the whole deck, against
the channel as it is now rather than as it was when each slide was
drawn, and deletes the two predicates nothing asked.

### The record

38 assertions on the design system, 24 mutations, all 24 caught —
including the two that would have reverted the faults the screenshots
found, and the two that would have made every check a refusal or none
of them one. Four more on `replaceSlide` with three mutations, all
three caught.

One repo rule caught me again: a background swatch stands for the
slide's own canvas, so it is rounded like a screen and not like a
control. The console says which object a thing is in one token, and it
was right.

---

## C-27 — Stage 27: the tally was lying, and its own comment said so

*"I would preserve the exact Multi-View shape and 2×3 grid… The
professional upgrade is therefore mostly visual hierarchy + tally +
audio state + meaningful empty states, not adding more controls."*

The geometry did not move. `repeat(3, minmax(0, 1fr))` by
`repeat(2, …)`, six numbered sources, the same header, the same box.
Everything below happens inside it.

### The finding: roll a film in, and two tiles were wrong at once

`whatIsOn` answers `kind: 'live'` with **the rolled-in source** while a
reference plays over the room — `channel.ts` says so in its own words:
*"A segment rolled into the live show is what goes out while it is
up"*. The grid read the **kind** and not the **source**, so:

* **CAMERA 1 wore the program tally** while a film covered it — a red
  bar on a picture nobody could see;
* **the film's own tile stayed dark** — the thing actually on the wire,
  reported as not on air;
* **every guest quarter wore a red tally under the music video**.

That last one is the part worth pausing on. The condition sat under
this comment, which has been in the file since the guests tile was
written:

> *"a rolled-in file is going out over the top of them, and a quarter
> wearing a red tally under a music video would be the tally lying"*

The rule was right from the first day. The line underneath it
(`transmitting: on.kind === 'live'`) never implemented it. A correct
comment above an incorrect line is the hardest kind of bug to see,
because reading the file tells you it is already handled.

### One question, asked of the source

`src/domain/multiView.ts` is pure and tested, like `identity.ts` and
`guestGrid.ts`, because "is the room on air while a film is rolled in"
is a question about two values and answering it inside a component is
answering it where nobody can test it.

    busFor({ on, mine, cued, keyed })  →  'program' | 'preview' | 'key' | null

A tile is on PROGRAM when **it is what is going out**, compared against
`whatIsOn` — the same function the playout engine uses, so the tally
cannot disagree with the transmitter. [D-22] All six tiles ask it; the
grid used to ask three different questions and got two of them wrong.

### Three buses, three colours

| | | |
|---|---|---|
| **PROGRAM** | red, 3px | this is what the audience can see |
| **PREVIEW** | blue, 2px | this is cued to go next |
| **KEY** | amber, 2px | this is drawn over whoever is on program |

The grid had two of these and used **blue for both the second and the
third**. A gallery wall where blue means two things is one an operator
cannot read: "next" and "over the top" are different claims. The keyer
takes the house's third state colour, and the bar's thickness ranks
them — program is thickest because it is the only one already out of
the building.

A keyer is still deliberately not PROGRAM. The identity layer never has
the air to itself, and giving it the program tally put two red bars in
a grid whose entire job is to say which single thing is on.

### The header is the grid's own proof — and the first version of it was wrong

`N in mix` is a fact about the audio mixer and said nothing about the
tally beside it. It sat above three tiles wearing the program bar and
agreed with none of them.

`PROGRAM` counts tiles on the program bus, deduplicated by source
because CAMERA 1 and GUESTS are two monitors of one room. **It can only
ever read 0 or 1**, which is the point: it would read 2 the moment the
tally started lying again, in the place an operator is already looking.

And by itself it swapped one misreading for another. Rolling a Library
item in over a live show puts a picture on the wire that **none of the
six tiles stands for** — the count correctly reads 0, which anybody
glancing at a transmitting channel would read as *nothing is on air*.
`ON AIR` is the other half. Together they say the thing that is
actually true: something is going out, and it is not one of these six.
Found by rolling one in and reading the header.

### Standby, instead of six dead black panels

*"Give `Studio One`, `Media Player` and `Graphics` purposeful standby
states instead of dead black panels."*

A black rectangle is the one thing a rack must never be: a source with
nothing in it and a source that has failed look identical, and the only
way to tell them apart was to click. Every empty tile now says what it
is waiting for, in **three or four words** — a tile is about a hundred
pixels wide, and the first version wrote sentences that ran under the
name plate. The sentence is on the tooltip, where there is room.

The sub-line says **what the input is**; the standby says **why it is
empty**. Both saying "nothing finished" was one fact twice in a
hundred-pixel box — also found by looking at it.

And absent is not dressed as a fault. Studio One with nothing finished
in it is a tile correctly reporting that there is nothing there; it is
drawn in the dim ink that means *absent*, not the red that means
*broken*. [D-04]

### Six words, and one of them is new

`LIVE / PREVIEW / KEY / NO SIGNAL / READY / —`. **NO SIGNAL outranks
READY**, because a tile offering a cut to a dead input is the tally
lying in its quietest form. It applies only where the question applies:
a tile standing for a file on disk has no signal to lose, which is why
`signal` is `undefined` rather than `true` on four of the six.

### Audio, where it is really measured

Four segments, no numbers: the question an operator asks of a
multi-view is *is that microphone alive*, not *how many dB*.

**Only on tiles 01 and 02.** The host's own level has been measured by
`useFeedLevels` since it was written and tile 01 never asked for it —
the same finding C-14 made about the guests. [D-19]

**And not on 03, 04 or 05, which the request asked for.** Those tiles
stand for files whose audio is in the playout engine, and the web tier
cannot hear it — the same wall `health.ts` describes between the two
processes. [§11, D-20] A bar fed from the master mix would be the
room's level with a film's name on it, and a meter reading zero for an
unmeasurable source is worse than no meter, because it says *silence*.
Not measured is not the same as silent.

### Studio Two, named

Its sub-line was `'Music Video'` — a placeholder standing where the
thing's own title belongs. A rack whose third input is labelled with a
genre is a rack an operator cannot call a cut from.

### The record

Fourteen assertions, eight mutations, all eight caught — the first of
them being the original bug put back (`return on.kind === 'live'`),
which fails one test by name.

One mutation survived and the **fixture** was at fault, not the code:
counting every lit tile instead of every program tile passed, because
no fixture had a preview bus and a program bus on the grid at the same
time. *"A fixture must contain a value for which the mutated behaviour
produces a different observable result."* The grid now has one of
everything on it.

One mutation was discarded rather than counted: reading `on.source`
without checking the kind is not a mutation, because `off` has no
`source` and the change does not compile.

Verified against the author's real channel in a browser, through the
whole sequence — off air, armed, room on program, a reference rolled in
over it, and back to the room — reading `data-bus` and `data-says` off
all six tiles at every step. The channel document was backed up before
and restored to the byte after.

---

## C-28 — Stage 28: something that looks at the output

*"A confidence monitor — the transmission, 12 s late, in a corner of
the control room, clearly labelled as the delayed one. The player
already exists on the watch page; this is reusing it."*
— `ONLINE-TV-AUDIT.md` §5, the second of the three it ranked above the
rest. The first was C-24.

### Why the audit put this second

C-24 was a channel transmitting four seconds of black, forever, while
every instrument in the building read healthy. The audit said why, and
the sentence is the specification for this stage:

> *"The control room looks fine — by design. Its monitor is the
> operator's own canvas, never the transmission (§7, so a presenter
> does not talk over themselves). It cannot show this fault."*

`playoutHealth` now catches the cause that was found — an ffmpeg
without `drawtext`. It catches that cause and not the class. **Nothing
in this product was looking at the output**, and every instrument that
said "healthy" was asking a component whether it thought it was
working.

### §7 survives, because this is a different object

§7 forbids a presenter watching themselves twelve seconds late. It
cannot be read to forbid the station ever looking at its own output,
because the alternative is a channel transmitting black for as long as
it takes somebody to open the viewer page in another tab.

So: a sixth of the size, **permanently silent** — not muted by default
but with no volume control and no way to reach one, because the desk's
microphones are open in the same room and audio from a monitor playing
the mix those microphones feed is a feedback loop at twelve seconds'
delay — labelled with its own delay, and **off until asked for**.

It is the same `ChannelPlayer` the viewer page uses, in a `compact`
mode that drops the transport and the prose. [D-19] It writes nothing
and encodes nothing: it reads the published playlist, which is exactly
what makes it the only instrument in the product that tests the chain
**end to end**.

### Measured, not watched

An operator glancing at a small muted picture in the corner of a busy
desk will not notice that it has been black for a minute. That is
precisely the attention the fault survived the first time, so the
picture is sampled once a second onto a 32×18 grid, and the judgement
is a sentence in the status bar where an operator already reads.

`confidenceSays` keeps `controlRoomNote`'s order exactly — a render
failure first, then the engine, then the stream, then the picture —
because the two sit on one desk and must not describe one condition
two different ways. Its last case is why any of this exists: engine
running, segments arriving, nothing complaining, **and the picture is
black**.

### Three things only running it could find

1. **Off air is black on purpose.** `segment.ts` says so in its own
   words: *"Black and silence, generated — which is also the honest
   picture: the channel has nothing to show and says so by showing
   nothing."* The first version alarmed on it, which would have fired
   on every gap between two programmes — the exact mistake `whyDark`
   exists to avoid. `expectsPicture(on)` is now a required argument,
   not a defaulted one, because the default that looks obvious is
   `true` and `true` is the bug.
2. **The chip sat on top of the ON AIR plate.** Every corner of the
   program monitor is spoken for — NOW PLAYING bottom left, the
   station lockup bottom right, the clock top right, ON AIR top left
   — so the one place a second picture fits without hiding one of the
   first picture's own captions is directly beneath that plate. The
   screenshot showed it; reading the file would not have.
3. **The floor was written in the wrong colour space.** Its own
   comment claimed 0.04 had to clear MPEG's limited-range black at
   16/255. That is a number in YUV; by the time a decoded frame
   reaches a canvas it has been expanded, and broadcast black arrives
   at RGB 0–4. The threshold would have sat *above* everything it was
   meant to catch — **a black-picture alarm that could not fire on a
   black picture**. A test that measured it said so.

Where the floor actually sits:

|  |  |
|---|---|
| 0.000 | pure black |
| 0.016 | decoded black with the noise an encoder leaves |
| 0.034 | the product's own darkest background, `#07090c`, bare |
| **0.04** | **the floor** |
| 0.094 | a dark grey picture |
| 0.112 | that same background with a headline on it |

A bare slide below the line is correct and not a miss: a frame with
nothing on it **is** a black picture. The same slide with a line of
type on it is comfortably above, which is the case that matters.

### Patience, because a channel is allowed to go to black

Twelve seconds — the same patience `STREAM_STALE_MS` uses. A dissolve
through black, the gap at the end of a programme and the moment an
operator takes a source down are all black and all correct, and an
alarm that fired on them is an alarm nobody reads. [D-04]

The run is measured **from the oldest unbroken dark sample to now**,
not counted in samples: a background tab is throttled to whatever the
browser feels like, and counting frames would make the alarm fire late
on a slow machine and early on a fast one for the same picture.
Measuring to `now` also means a sampler that stopped keeps the clock
running — and the counterpart matters more: when the sampler stops on
a **lit** picture the clock stays at zero, because an alarm raised out
of an absence of evidence is an alarm about a tab that went to the
background.

### The record

Twenty-six assertions, twenty mutations, nineteen caught.

The one survivor was a length guard on an empty pixel buffer, which
the `pixels === 0` line below it already covers. **Deleted rather than
defended** — the ninth time in this project.

And one test failure was a finding rather than a bug: `meanLuma` on
RGB 16 returned 0.063 against a floor of 0.04, which is how the colour
space error above was caught. The comment was wrong and the number was
right, and only the measurement could tell which.

### What is not verified here, and why

**The sampling path has not been run against a moving picture.** This
container's Chromium is built without H.264, so the stream does not
decode in it — the viewer's own watch page is equally blank here, which
is how that was established rather than guessed. What the browser does
is `drawImage` into a canvas and hand back bytes; every piece of
arithmetic that could be wrong was moved out of the component into
`meanLuma` and tested, and the monitor was driven in a real browser far
enough to confirm it mounts, opens, takes the player, and ranks a
stopped engine above a black picture exactly as the tests say.

Not verified is not the same as not working, and it is not the same as
working either. It is stated here so the first person to open it on a
machine with codecs knows what to check.

---

## C-29 — Stage 29: the door that needed nobody's permission

*"`PLATFORMS.rtmp` is already modelled with `needsReview: false` —
'anything that takes a server URL and a stream key'. YouTube,
Facebook and X all accept exactly that today… **This unlocks three of
the four platform cards without anybody's permission, and it is the
single highest-value piece of work on this list.**"*
— `ONLINE-TV-AUDIT.md` §4.1, the third and last of the three the
audit ranked above the rest. C-24 was the first, C-28 the second.

### It is not a second output path

The instruction this product has been given repeatedly is *"do not
add a second Media Player → Output path"*. The sender reads **the HLS
the playout engine has already written** — the same bytes a viewer
gets — and copies them to a socket. It renders nothing, decides
nothing about what is on air, and if it dies the channel does not
notice. That is D-21's *"one master broadcast output, and
destinations receive that output"* taken literally rather than
paraphrased.

**`-c copy`, not a re-encode.** The house format is already
H.264/AAC in MPEG-TS at the shape a 16:9 platform wants, so the
sender is a remux and the box it shares with the encoder notices
nothing.

**And `-re` is deliberately absent.** It paces input at its native
rate, which is right for pushing a file and wrong for a live playlist
already arriving in real time. Pacing a live source twice is how a
sender drifts further behind every hour until the ingest drops it.

### The shape line, held rather than fudged

A 9:16 destination is **refused, with the reason**, not cropped. D-21
and U-22 both forbid the crop by name — *"Don't merely crop the
television channel"*, *"vertical is a different edit"* — and a
vertical output that silently arrived as a cropped 16:9 would be the
product doing the forbidden thing while appearing to do the asked-for
one. A different shape needs a different composition, which is a
second encode and the audit's own item (2). Not built, and said so.

### Where a stream key lives, which is not in the document

D-21: *"No credentials in the document… A conversation directory is a
portable archive (U-25), and a stream key in one is a stream key in
somebody's backup."*

So the document holds a `settingsRef` and `var/keys/<ref>.json` holds
the credential — **outside the account tree**, which is what a backup
walks and an export copies. Directory 0700, file 0600, and the mode
is on the create rather than a `chmod` afterwards: a file that is
world-readable for the microseconds between `writeFile` and a
following `chmod` is a file that was world-readable.

**There is no route that returns a key.** The control room is told
that one exists and what server it points at; the key itself leaves
the process only as an argument to ffmpeg. A product that can show
you your own stream key can show it to whoever is standing behind
you, and there is nothing you can do with it on screen that you
cannot do by pasting a new one. The field is `type="password"`, is
cleared the instant it is sent, and is never populated from the
server.

**And the credential goes when the destination does.** A key whose
destination was deleted is a live credential in a file nothing
references, and nothing will ever remove it because nothing remembers
it is there.

### Two things tested as security properties rather than behaviour

1. **The allowlist.** ffmpeg writes its output wherever it is told:
   `file:///` plus a path is a sender that overwrites whatever it is
   pointed at, with the engine's own privileges, from a string
   somebody typed into a form. Exactly two schemes are accepted, at
   the door, and the test enumerates the dangerous ones by name.
   [D-06]
2. **The redaction.** A stream key lets anybody broadcast as the
   account that owns it, and the two places credentials escape are
   logs and error messages — an ingest that rejects a URL routinely
   echoes it back. There is one function for printing a target, one
   for sanitising ffmpeg's own words, and the test asserts that **no
   four-character substring of the key** appears in either. The
   placeholder is fixed-width, so the log does not leak how long the
   key was either; showing the last four is the card-number
   convention, where the rest is already known, and a stream key is
   uniformly secret.

### A push must never be able to stop the television channel

Every failure in the supervisor is caught. The worst an unreachable
platform may do is leave **its own** destination blocked with a
reason. The reconciliation runs after the segments, because a sender
started before there is anything to read spends its first seconds
failing on an empty playlist and earns a backoff it did not deserve.

It is a **reconciliation and not a set of commands**, which is the
only shape that survives the engine being restarted mid-broadcast:
the desired state is the channel document plus the keys on disk, and
each pass closes the gap. Nothing remembers what an operator pressed.

The backoff doubles to a minute and stops, because the two things
that kill a sender want opposite treatment — a network blip wants an
immediate retry, an ingest refusing a key wants to be left alone
before it bans the address — and one curve covers both. A sender that
has stayed up fifteen seconds has its count reset.

### The playlist the sender reads

`livePlaylist` is the same function the viewer's route calls,
rendering **absolute file paths instead of URLs**. One generator, two
renderings, so a sender and a viewer cannot be watching different
windows of the same channel.

It is written to `var/senders/<id>/playlist.m3u8` and **not** into
`stream/`, which holds only `N.ts` and is swept by age: a playlist
among the segments is one the sweeper will eventually delete and the
playlist route may eventually serve. That is the mistake C-24 made
once already, with the failure record, and the suite caught it within
the hour.

### The control room tells both facts

D-21: *"`enabled` is the operator's switch and the connector's state
is a separate answer."* The row used to read `kind === 'own'` and say
NOT CONNECTED for everything else — true when it was written, false
now. It reads the engine's own record, and shows the connector's
sentence on hover, because BLOCKED without a reason is the lamp that
loses an evening.

### The record

Thirty-seven assertions across the sender and the key store, twenty-
four mutations, all twenty-four caught — the two redaction mutations
among them, which were the ones worth running.

Two mutations survived at first and **both were real**: the create
modes on the key file and its directory were unobservable because a
`chmod` afterwards covered them. Rather than defend them, the
redundant `chmod` on the file was deleted — which makes the create
mode observable — and the directory's `chmod` was kept and given the
test that justifies it: a `keys` directory that already exists with
loose permissions is tightened, which `mkdir`'s own mode cannot do.
Belt-and-braces that survives every mutation is belt-and-braces.

Verified end to end against the author's real channel, through the
API rather than the UI, because the claim being checked is about what
the API returns:

| | |
|---|---|
| occurrences of the key in the channel GET | **0** |
| occurrences in `channel.json` on disk | **0** |
| JSON files anywhere under `var/accounts` containing it | **0** |
| where it is | `var/keys/`, dir 0700, file 0600 |
| after removing the destination | `var/keys/` empty |

And in the browser: the row reading READY with a key set, the form
masking the key, and the row afterwards showing the server address
and never the key. The channel document was backed up before and
restored to the byte.

### What this does not do

* **No vertical destination.** A second encode, deliberately not
  built; the refusal says so.
* **No reviewed-platform connectors.** TikTok LIVE, and the official
  YouTube, Facebook and X apps, still need an approved application.
  What changed is that three of them do not need it to receive a
  stream: their own RTMP ingest URL in a plain RTMP destination works
  today.
* **Not run against a live ingest.** Pushing to a real platform from
  this container would be broadcasting to somebody's account, which
  is not a thing to do to find out whether a flag is right. The
  sender has been exercised to the point where it spawns; the first
  push to a real ingest is the first thing to watch.

### Corrected at C-35: it spawns, and on this build it dies

The line above — *"exercised to the point where it spawns"* — was
the exact boundary of what had been tested, and the fault was on the
other side of it. **The pinned `ffmpeg-static` segfaults reading
MPEG-TS**, so on the binary this product ships the sender spawns,
dies by signal before it has read a packet, and is restarted by the
backoff for ever. Every word of this stage's design holds; none of
it reached an ingest.

C-35 is the correction. Nothing in the supervisor changed except
that it now asks the binary first and refuses with a sentence. The
stage record below says the rest.

---

## C-30 — Stage 30: the links were real and said nothing

*"image 4 most of bottons leads to one direction. try to check that."*

The audit checked it and found the author was right about the symptom
and wrong about the cause — which is the useful kind of wrong:

> *"**Six of the seven open the same page.** The fragments are
> honoured… so the code is not inert. But on a wide screen the control
> room shows everything at once, so `#schedules` scrolls to something
> already on screen and the page looks untouched. **The behaviour is
> real and the feedback is nil**, which is indistinguishable from a
> dead button."*

### Three faults, and the third was not in the audit

1. **`#schedules` selected no tab.** The handler had two branches,
   `identity` and `live`, and everything else fell through to a
   scroll. Clicking "Schedule" from the landing page landed on
   whichever rail tab was open, which on a fresh page is PLAYLIST.
2. **Nothing acknowledged the jump.** D-22: the control room is a
   place and every panel is already on screen, so `scrollIntoView` is
   a no-op and a link looks dead however correctly it worked.
3. **Two of the four targets were not elements.** `#schedules` and
   `#live` were `display: contents` anchors with no box — nothing to
   scroll to, and nothing a highlight could have been drawn on even
   if one had existed. The audit did not find this; writing the
   highlight did.

### One table, in the domain, walked against the source

The links are written in `ControlRoom.tsx` and the targets in
`ChannelStudio.tsx`, and **nothing connected them**: a renamed tab
was a dead link nobody would notice until somebody pressed it. The
table is `src/domain/fragments.ts` and the test reads both files:

* every fragment the landing page links to is one the table honours;
* every jump names a rail tab and a desk that exist;
* every jump names a panel that is in the control room;
* and no jump names a `display: contents` anchor.

`RailTab` and `DeskTab` moved there too. They were declared in the
component and the table would have had to name them as strings,
which is two definitions of one thing.

### The acknowledgement is colour, which is why it survives reduced motion

A 2px accent ring on the panel the link named, fading over 1.1s. The
global reduced-motion rule collapses every animation to 1ms — which
here would mean the one piece of feedback this gives vanishing before
anybody saw it, reducing motion into no answer at all. So the ring
**holds** instead for somebody who asked for less motion, which is
what `motion.css` already argues: *"distance and scale go, colour
stays."*

### The bug the browser found, under the comment forbidding it

The first version marked the new panel and cancelled the previous
one's fade, so after two jumps a panel stayed ringed **for the rest
of the session**. The comment immediately above that code says a
highlight that stayed "would be a panel that looks selected for the
rest of the session, which is a worse lie than no feedback at all."

That is the second time in three stages that a correct comment sat
directly above the code contradicting it — C-27 was the other. Both
were found by running the thing twice; neither was visible in a
single pass, and neither was visible by reading.

### The record

Ten assertions, ten mutations, all ten caught — the first being the
original bug put back, which fails two tests by name.

Verified in a browser across every fragment: the tab each one
selects, the panel each one marks, that the computed style really is
the accent ring (`bv-arrived`, `inset 0 0 0 2px`), and that the mark
is gone two seconds later in every case. On a cold load the ring
appears about 300ms after the page commits.

`ONLINE-TV-AUDIT.md` §3 and §5 are updated: all three of the items
that section ranked above the rest are now in.

---

## C-31 — Stage 31: two things the author saw, measured at last

The audit listed both under *"Two inconsistencies worth verifying"*
and refused to diagnose either:

> *"Each needs one reading of `/api/channels/{id}` while the state is
> live to settle. Neither should be guessed at from a screenshot,
> including by me."*

They are one fault wearing two coats: **a surface showing the answer
to one question beside the answer to another, with nothing saying
they were different questions.** That is the shape `controlRoomNote`
exists to prevent one level down, and the remedy is the same — decide
it in one place, where it can be tested.

### "ON AIR" above "Nothing currently on air"

`transmitting` asks THE TRANSMITTER whether segments are arriving.
`showing` asks THE SCHEDULE what is on. An off-air channel with the
engine running satisfies the first and not the second, because
`segment.ts` keeps writing — *"A channel with a hole in its schedule
must still put four seconds on the wire, or every player treats the
gap as the end of the stream and stops. Black and silence,
generated."*

Both halves were true and the card was a lie. **Reproduced by
construction**, not inferred: a channel with an empty rotation and no
programmes, with segments a second old, produces exactly
`badge: "ON AIR"` and `now: "Nothing currently on air"`.

`airState` gives **four states where there were three**, and the
missing one is the interesting one:

| | transmitting | nothing arriving |
|---|---|---|
| **something on** | `on` — ON AIR | `due` — DUE, NOT TRANSMITTING |
| **nothing on** | `blank` — **ON AIR · BLANK** | `off` — OFF AIR |

A channel putting black out is not off the air; it is on the air with
nothing on it. An operator who cannot tell those apart from across a
room cannot tell a quiet afternoon from a dead encoder.

**A word, not a fourth lamp colour.** Three colours and four states
is the trade: BLANK takes the amber lamp, because the thing to look
at is the empty schedule, and a word is read faster than a fourth
colour is learnt. [D-04]

### A full timeline against "0 scheduled · no loop"

Only a programme and a turn of the loop know when they END. Off air,
a live feed and the emergency cut-away run until somebody changes
them — so the walk had to advance by *something*, and it advanced by
five minutes and pushed a block each time.

An empty channel therefore drew **a day of five-minute items, every
one of them nothing**, beside a footer correctly reporting that
nothing was scheduled.

**A step is not a structure.** The five minutes is how often the
walker asks, and asking twelve times an hour is not twelve things an
hour. Stretches with no end of their own are joined back together, so
a quiet afternoon is one quiet afternoon.

**And two turns of the same loop are never joined**, which is the line
that makes this a fix rather than a smoothing: a programme and a
rotation entry each carry an `untilMs`, so where they end is a fact
about the schedule and not about the walker. Joining those would hide
the loop point, which is the one thing an operator looks at a rotation
lane to find.

The walk moved out of a `useMemo` and into `src/domain/airtime.ts`,
where the five-minute step could be seen for what it was. *"What will
this channel show this afternoon"* is a question about a document and
a clock.

### Measured, before and after, on the same data

| | before | after |
|---|---|---|
| empty channel, engine writing | `ON AIR` beside "Nothing currently on air" | `ON AIR · BLANK` / lamp `ON AIR, NOTHING SCHEDULED` |
| empty channel, six-hour window | ~72 five-minute blocks | **1 stretch** |
| the author's real channel | `ON AIR`, 26 stretches | **unchanged** |

The last row is the one that matters most: the fix changes the two
broken cases and nothing else.

### The record

Seventeen assertions, fourteen mutations, thirteen caught.

**Two survivors, and only one was a redundant guard.** The kind check
in `joinable` looked redundant beside the source-key check — until
the case that needs it was written down: the emergency cut-away and
the backup can be the same file, and joining them would draw one
stretch over the moment an operator pressed EMERGENCY, which is the
moment a timeline exists to show. The guard stays and now has its
test.

The minimum step under the walk did not. It was there against a
malformed turn whose end is not after its start, and it survived
every mutation — including a document carrying a zero-length rotation
entry — because `whatIsOn` never answers with an end at or before the
instant it was asked about. **Deleted rather than defended**, the
tenth in this project, with the invariant it was guarding kept as the
test that every stretch has width. An untested guard against a case
the layer below forbids is a guard nobody can check.

---

## C-32 — Stage 32: a record of what actually went out

The audit's last open row: *"As-run | None | A log of what actually
transmitted, which broadcasters need."*

### It is not the audit log, and that is the whole point

This product already keeps `audit.log` per channel, append-only, and
it records **what somebody did to the document** — created a channel,
added a turn to the rotation. That is a record of *intentions*.

An as-run records **what came out of the transmitter**, which is a
record of *outcomes*, and the two disagree exactly when it matters: a
programme that was scheduled and never played is in one and not the
other. That gap is the whole reason broadcasters keep an as-run.

**Nor is it the schedule walked.** `airtime` (C-31) answers *what
will this channel show*, from the document. This answers *what did
it show*, from the segments the engine actually wrote. A channel
whose encoder failed for ten minutes has an untouched schedule and a
very different as-run — and a log derived from the document would
report the ten minutes as perfect. That is C-24's fault, recorded.

### `produceSegment` is the only thing that knows

It already computes what is on and whether ffmpeg managed it, so it
returns an `Aired` rather than being asked again afterwards. The
`fellBack` flag is threaded out of the three paths that put black on
the wire, and the distinction C-28 drew is kept:

* **a source that could not be rendered** counts as black in the log;
* **a channel with nothing scheduled** does not — it is black by
  design, and counting it would fill the black column with every gap
  between two programmes.

And the quiet one counts too: *ffmpeg exiting successfully having
written no packets* is the commonest way a channel goes black, and an
as-run that recorded only the loud failures would miss the ones that
matter most.

### Coalesced before it is written

Four seconds at a time goes in; stretches come out. The engine holds
the open stretch in memory and appends only its finished shape — a
half-hour programme is one line, not 450.

**A gap starts a new entry even when the thing is the same.** The
engine can be stopped and restarted, and joining across the hole
would be the log claiming continuous transmission across exactly the
outage it exists to record. The open stretches are written down on
the way out, because an as-run missing the programme that was on when
the engine stopped is missing the thing somebody is most likely to
ask about.

### The one thing here that is an archive

D-18 is careful that segments are transport and not an archive —
written, served for half a minute, swept. The as-run is the opposite
by design: it is what survives them, and nothing deletes it. One file
per **UTC** day, because a log whose days turn in the channel's local
zone has a day with twenty-five hours in it once a year.

### What gets handed over

CSV, because an as-run is evidence — for a regulator, a rights
holder, an advertiser — and the people who ask for one ask for a file
they can open, not an endpoint they can query. JSON from the same
route for anybody building on it.

    start,end,seconds,title,source,id,black_seconds

**Owner's only.** An as-run names every asset a channel played and
when: a schedule, an inventory and a set of viewing figures'
denominators in one. None of it is a viewer's business. [§17]

### Measured on a real engine run

The engine was started against the author's own channel and left to
run:

| | |
|---|---|
| segments produced | 153 |
| rows written | **1** |
| the row | `08:26:24 → 08:36:36`, 612s, black 0 |
| JSON | `day`, `days`, `ran` |
| CSV | `content-type: text/csv`, named `as-run-<channel>-<day>.csv` |
| without a cookie | **401** |
| `?day=../../etc` | **400** |

`playout: off air` printed on the way out, which is the shutdown path
writing the open stretch — the row above ends at the moment the
engine stopped.

### The record

Eighteen assertions, thirteen mutations, all thirteen caught.

Two had to be re-run through a file because the shell ate their
escaping — the CSV quoting and the header — and those two are worth
the second attempt: a title with a comma in it is a title and not two
columns, and a file whose first line is data is a file somebody will
read one row short.

---

## C-33 — Stage 33: every programme at the same loudness

The audit: *"Audio | Per-source meters and a master | Per-source EQ,
compression, ducking, loudness to −23 LUFS."* Of those four, loudness
is the one that is a **requirement** rather than a refinement — EBU
R128 and ATSC A/85 are law for broadcasters — and the complaint they
exist to answer is the one every viewer has.

### This channel is the case the standard was written for

It cuts between a Studio Two music video, mastered loud the way music
is, and a Studio One conversation recorded on whatever microphone
somebody had. **Measured on the author's own library:**

| | measured | gain | after |
|---|---|---|---|
| `asset_fe37…` | −17.7 LUFS | −5.3 dB | −23.0 |
| `asset_84fa…` | −28.1 LUFS | **+5.1 dB** | −23.0 |
| `asset_8f79…` | −16.0 LUFS, peak **+0.8 dBTP** | −7.0 dB | −23.0 |

**A 12.1 LU spread**, and one file already over full scale before
anything downstream touches it. That is the viewer reaching for the
remote at every join, and it was not a hypothesis — it is what the
files say.

### A static gain per item, not `loudnorm` on the way out

`loudnorm` is the obvious thing and the wrong one. This engine emits
**four seconds at a time**, and single-pass loudnorm over four
seconds normalises each segment to its own contents — a quiet passage
pushed up, the next segment's loud passage pushed down, and the
programme audibly breathing at every segment boundary. A dynamic
normaliser does the same more smoothly and is still a compressor
nobody asked for on somebody's master.

What a playout system actually does is measure the whole item once,
store one number, and apply it as a constant offset for as long as
that item plays. The dynamics of the mix survive untouched; only its
level moves.

### Three judgements, and the one that decides the others

**The peak wins.** A quiet item that is also peaky cannot be both
brought to −23 and kept under −1 dBTP; the constraints disagree and
the ceiling is the one that must hold, because being two decibels
quiet is a thing a viewer does not notice and clipping is a thing
they do. So the gain is reduced and the item plays slightly under
target. The alternative — hold the loudness, limit the peaks — is
dynamics processing on somebody's master, which is exactly what
measuring beforehand exists to avoid.

**Twelve decibels of lift and no more.** The gain applies to
everything in the file, so lifting a −41 LUFS recording eighteen
decibels lifts its room tone and hiss by eighteen too. Past about
twelve the noise is louder than the programme was. A very quiet item
stays quiet, deliberately, rather than the channel pretending it
fixed something. There is no cap on turning something **down**:
reducing a signal cannot introduce anything that was not already in
it.

**Silence is left alone.** `ebur128` reports −70 or lower for a gate
that never opened, and a gain computed against that is forty-seven
decibels of hiss.

### Measured off the critical path, which is the whole of the design

Integrated loudness is a property of a WHOLE item — that is what
makes it the right thing to normalise against, and it is also what
makes measuring it cost a full decode. A forty-minute film takes a
minute to scan and a segment has four seconds to be ready: measuring
inline would take the channel off the air to improve its audio, which
is a trade nobody would choose.

So the engine asks, carries on at the item's own level, and applies
the gain from the pass after the answer lands. The first minutes of
the first play of a new item are as they are today; everything after
is at the house loudness. Queued one at a time, because six assets in
a rotation would be six concurrent decodes on the box that also has
to keep the channel on the air.

### Verified against real ffmpeg, on real content

    source                 -17.6 LUFS   peak -1.3
    apply volume=-5.3dB    (the engine's own gain)
    result                 -22.9 LUFS   peak -6.4

Within 0.1 LU of target, and the peak well clear of the ceiling. The
engine's own log, running against the author's channel:

    playout: master.mp4 is -18.5 LUFS, playing at -4.5 dB
    playout: master.mp4 is -17.7 LUFS, playing at -5.3 dB
    playout: master.mp4 is -18.2 LUFS, playing at -4.8 dB

### The record

Nineteen assertions, thirteen mutations, all thirteen caught.

One survived at first and it was a real gap in the test rather than
the code: the ceiling's own value. Every assertion compared the
arithmetic against `CEILING_DBTP`, so moving the constant was
invisible — and −1 dBTP is a **standards claim**, not an
implementation detail. It is asserted as a number now, for the reason
R128 gives it: a lossy codec reconstructs overshoots the original
never had.

### What is still not done

The other three in the audit's row — per-source EQ, compression and
ducking — are not here and are not planned. They are a mixing desk's
job and this is a transmission chain; a product that quietly
compressed somebody's master would be doing the thing this stage
spent its whole design avoiding.

**Not measured in this container:** what a produced segment itself
reads. ffmpeg segfaults probing MPEG-TS here — the same quirk C-28
hit — so the chain was verified one step earlier, by applying the
engine's own gain through real ffmpeg to the real source and
measuring the result. The first thing to check on a machine that can
probe a `.ts` is a transmitted segment.

---

## C-34 — Stage 34: the join between two programmes

The audit: *"Transitions | Cut only | Dissolve, wipe, stinger."* A
channel that hard-cuts from a music video to a conversation sounds
like a mistake at every join — and **the click is worse than the
jump**, because an ear notices a discontinuity an eye forgives.

### A dip to black, and the reason is material rather than taste

A cross-dissolve needs the two items to OVERLAP: the outgoing one
has to keep playing while the incoming one starts. At a programme
boundary the outgoing item has usually just **ended**, so there is
nothing after it to dissolve from, and reading past the end of a
file produces the frozen frame or the black a dissolve was supposed
to avoid.

A dip needs nothing extra from either side: the last 400ms of what
was playing fades down, the first 400ms of what follows fades up,
both inside material that already exists. It is also what a
broadcaster does between two unrelated programmes. A true dissolve
belongs where the two things genuinely overlap, which is the vision
mixer and not the playout engine.

### The rules matter more than the effect

Three joins stay hard cuts, and each is a case where four hundred
milliseconds is worth less than what it costs.

* **Never into or out of the emergency source.** Somebody pressed a
  button marked EMERGENCY, and answering with a slow dip is the
  product deciding its own polish is worth more than the reason
  they pressed it. [§9]
* **Never into or out of a live feed.** Cutting to live is what a
  cut is FOR — a gallery cuts to a camera, it does not mix to one
  from the schedule — and fading a live feed means choosing to lose
  half a second of something that is happening while it happens.
  [§6]
* **Never into itself.** `playoutWindow` divides a segment wherever
  the answer changes *and* wherever one has to be read in parts, and
  only the first is a transition. Dipping at the second would put a
  hole in the middle of a programme. This is the rule a careless
  implementation gets wrong, and the other two are special cases of
  it.

### Before the marks, not after

The bug and the lower third are composited onto the outgoing frame
by the same filter chain (§13, D-16), and a fade applied after them
takes the station's own identity down with the picture. The dip goes
first: a viewer sees the picture go and **the bug stay**, because the
bug is the channel and the channel did not go anywhere.

### The limit, said plainly

**A join that falls exactly on a segment boundary is still a cut.**
The engine produces each segment independently, so the piece before
this one is in a file written four seconds ago and is not available
to fade against. Joins are dipped where they fall *inside* a
segment, which is most of them. Papering over that would mean
holding segments back to look at their neighbours, which is latency
spent on a transition.

### Measured

ffmpeg accepted the full chain — scale, pad, fps, setsar, fade,
marks, with `volume` and `afade` on the audio — and the fade is
really there:

| t | mean luma |
|---|---|
| 0.00 s | 0.0000 |
| 0.10 s | 0.0118 |
| 0.20 s | 0.0609 |
| **0.40 s** | **0.1775** |

A clean ramp reaching full picture at exactly the 400ms specified.
The out-fade could not be distinguished in the same clip because the
source content there is itself near-black; it is the same filter with
the same arithmetic, and the unit tests cover where it starts.

### The record, and a correction to the method

Eighteen assertions, sixteen mutations, fourteen caught. One was not
a behaviour mutation — it rewrote a typed read as a cast — and is
discarded, as C-27's was.

**And one survivor was a wrong verdict of mine, which is the part
worth keeping.** A guard in `sameThing` survived every mutation, so
by the rule this project has used for eleven stages it was deleted as
unobservable. `tsc` failed a minute later: the guard was **narrowing
the type**, not deciding the answer, and *a mutant is never
typechecked* — so mutation testing is blind to exactly that kind of
line.

The fix is better than the guard was. Naming the thing that is
sometimes absent — `sourceOf(on)`, which is `undefined` when the
channel is off — removes both the guard and the question: two
channels that are off have no source and compare equal, one that is
off and one that is not compare unequal. The method stays, with a
caveat it did not have before: **a guard that only narrows a type
cannot be judged by mutation alone.**

---

## C-35 — Stage 35: the sender that could never have worked

C-29 shipped an RTMP sender, tested it to the point where it spawns,
and wrote that sentence down as the limit of what had been checked.
C-33 and C-28 carried their own version of the same caveat. Going
back to collect those three caveats is what found this.

**The pinned `ffmpeg-static` segfaults reading MPEG-TS.** Not a
refusal, not an error message — exit 139, on every transport stream
it is given, including one it has just written itself.

| asked of `ffmpeg-static` | result |
|---|---|
| write `.ts` (the engine's own operation) | exit 0 |
| read that `.ts`, `-c copy` | **exit 139** |
| read it, video only | **exit 139** |
| read it, audio only | **exit 139** |
| read it, decode one frame | **exit 139** |
| read it, `-c copy -f flv` (the sender's operation) | **exit 139** |
| the same content written as `.mp4`, read back | exit 0 |
| `ffprobe-static` reading the same `.ts` | exit 0 |

The last two lines are what make it the binary and not the files.

### Two of the three things that touch a segment are fine

The playout engine only **writes** transport streams. The viewer's
browser **demuxes them itself**, in hls.js. Neither goes near the
demuxer that is broken, which is why Online TV has been transmitting
correctly throughout and nothing in the control room suggested
otherwise.

The RTMP sender **reads** them, with `-c copy`, which is precisely
the operation that crashes. So on the shipped binary a destination
with a correct server, a correct key and the right shape spawns a
process that dies before it reads a packet, is restarted two seconds
later, then four, then eight, up to once a minute, for the length of
a broadcast — and the control room shows `BLOCKED — Stopped (null)`.

This is C-24's fault in a second place, two stages after C-24 was
written: *"a connector that cannot be tested is a connector that is
wrong"*.

### And the codebase already knew

`segment.ts`, in the comment explaining why segments are joined by
appending bytes rather than with ffmpeg's concat demuxer:

> *"The concat demuxer would also work in principle and was tried
> first; on this platform's static ffmpeg it segfaults on `-c copy`
> over MPEG-TS, which is a good reminder that reaching for a tool to
> do what a `cat` does is a dependency taken for nothing."*

The defect was found, understood, worked around, and written
down — and then the RTMP sender was written on top of it, doing
exactly `-c copy` over MPEG-TS, by somebody who had read that module
and did not connect the two. **A fact recorded in one module's
comment is not a fact the next module knows.** That is what
`canReadSegments` is for: the knowledge is now a function the code
can ask, in the place that has to act on it, rather than a paragraph
somebody has to have read.

It also settles the blast radius. The only two things in this
product that hand a transport stream to ffmpeg are the piece join in
`segment.ts`, which stopped doing it, and the sender, which is this
stage. Everything else that assembles media reads WebM chunks from a
browser (`ingest.ts`) or a file in its own container.

### Asked by doing it, because nothing else reveals it

`canDrawText` works by reading `-filters`, because a missing filter
is a missing **name**. That method cannot find this one. The binary
lists `mpegts` among its formats, writes it perfectly, and crashes
reading it — every question it can be asked about itself returns the
wrong answer. The only question that does not is *"here is one, read
it"*.

So `canReadSegments` writes a tenth of a second of generated colour
as mpegts into a temporary directory and reads it back with `-c
copy`. Two spawns, once per process, cached for the life of the
engine, nothing of the operator's involved and nothing left behind.
A crash and a refusal are the same answer: no.

### Asked last, and that order carries two decisions

The supervisor asks after `refusalFor`, never before.

* **A destination with no key is told it has no key.** That is the
  sentence its operator can act on; the machine's problem is not yet
  in their way. A 9:16 destination keeps *"a different composition,
  not a crop"*, because fixing the binary would not change it.
* **And the probe is never spawned for a destination that could not
  start anyway.** Everything already configured and still refused
  here is refused for a reason no amount of configuring will move.

### The reason is printed, not hovered

`BLOCKED` was already in the control room, and `sender.says` was
already written — into a `title` attribute. A tooltip is where a
detail goes when the lamp already says enough, and BLOCKED says
nothing: it covers wanting a key, wanting an approved app, wanting a
different composition, and sitting on a build that cannot read what
the channel writes. One of those an operator fixes in the box
directly below; one of them nobody fixes without being told.

So the sentence is on the screen whenever the state is the bad one —
in a wash with a red edge rather than five lines of warning colour,
because the alarm is already carried by the lamp and the word, and
the sentence has to be **read**.

It says three things, in this order:

1. what is wrong — this build of ffmpeg cannot read the transport
   stream the channel writes;
2. **that the channel itself is unaffected**, because that is the
   first thing anybody wonders when a destination turns red;
3. the remedy — `WITH_TEXT=1`, or `BALANCEVID_FFMPEG` pointed at an
   ffmpeg whose mpegts demuxer works.

### The remedy already existed, under the wrong name

`WITH_TEXT=1` installs the distribution's ffmpeg, and `serve.sh`
points `BALANCEVID_FFMPEG` at it if the file is really there. That
build has both freetype and a working mpegts demuxer, so the one
argument fixes both faults. The argument is **not renamed** — a
build argument is somebody's deployment — but the Dockerfile and the
entrypoint now say what the second thing is, and the `else` branch
prints both consequences rather than one.

### Measured

Against the author's real channel, with a real key on disk, running
the real supervisor:

```
"dest_c35demo": { "state": "blocked",
  "says": "This build of ffmpeg cannot read the transport stream the
           channel writes, so it cannot push it anywhere. …" }
```

Nothing spawned. `sendingNow()` empty. Then in the browser: the
destination row reading `16:9 BLOCKED` with the sentence printed
under it, legible at the size the panel is actually used at. The
channel document was backed up before and restored to the byte, and
the staged key removed.

The probe's own test is the one worth keeping: it runs the sender's
real operation on this machine and asserts the probe **agrees with
it**. On a broken build both fail, on a good one both succeed, and a
probe that disagreed with reality would be this same class of bug
one layer up.

### The record

Twenty-one assertions across two new test files, nine mutations, all
nine caught — and one assertion rewritten because it did not
discriminate: the cache test compared two binaries whose real
answers on this container are both `false`, so removing the cache
changed nothing observable. Seeding `true` from a command that
always exits 0 and `false` from one that does not exist makes both
branches testable on every machine, including this one, where the
real answer is only ever the second.

### What this does not do

* **It does not make the sender work here.** It cannot: the binary
  is the fault. What changed is that the product says so, with the
  remedy, instead of retrying into a crash for ever.
* **It does not check anything else about the binary.** `drawtext`
  and segment reading are the two capabilities this product has been
  burned by; a general capability survey would be guessing at the
  third.
* **It is still not run against a live ingest**, for C-29's reason.
  On an image built with `WITH_TEXT=1` the probe passes and the
  sender starts; the first push to a real platform remains the first
  thing to watch.

---

## C-36 — Stage 36: the deck nobody checked

C-26 built the slide quality checks and the panel has run them on
every keystroke since. It has never once run them on a slide that
was already in the deck.

Press Add and the judgement stops. The deck holds nine slides and the
product has no opinion about any of them — not about the heading that
was four characters over its limit when it was typed, and not about
the two faults that only appeared later.

**And `slideReady` was never called by anything.** Written at C-26,
with the comment *"the line between DRAFT and READY"*, and its only
caller in the whole repository was its own test. So was
`slideTransmittable`. Two predicates with a test each and no caller
are a capability this product claimed and did not have.

### Two faults a slide cannot see from inside itself

Both need the deck's surroundings, which is why they are in `deck.ts`
and not in `graphic.ts`.

**The channel changed colour underneath it.** A slide is drawn once,
into a PNG, with the accent the channel had at that moment. Change
`identity.ink` and every slide composed before the change keeps the
old one — so a deck composed either side of a rebrand transmits two
different stations, in order, and nothing anywhere said so. The PNGs
are not wrong; they are *stale*, which is a different word and needs
a different sentence.

**Its picture was deleted from the library.** `bookingsFor` walks a
channel's programmes, rotation, blocks, filler, backup and emergency
cut — and no deck slide's `spec.picture`. So a photograph used by a
slide can be deleted with nothing refusing it. The slide still
transmits, because the rendered PNG is its own asset. But its
definition now names a picture that is gone: **Correct** reopens a
slide that cannot be redrawn, and **Copy** fails at the route with
*"that picture is not in the library"* — the first anybody hears of
it being the press that fails.

### Four standings, and the fourth is the one worth arguing about

`ready`, `draft`, `broken` — and `as-is`, for a slide this product
holds no definition for. There are two ways to be one:

* a page of somebody's PowerPoint, which was never composed here;
* a slide this product **did** compose, before C-26 made the
  definition travel with the picture.

**The author's own decks are five of those**, which is how the second
case was found: both decks on the real instance predate C-26 entirely.
Both ways have the same consequence and deserve the same word —
nothing to check, nothing to correct, nothing to copy. Calling either
"draft" would be inventing a judgement with no basis, and the panel
already refuses Correct and Copy there for exactly that reason.

### Neither new fault stops a slide

Both are said and neither is blocking, and that line is where this
stage could most easily have gone wrong. A slide in last month's
colour and a slide whose source photograph was deleted **both
transmit correctly**. Marking either broken would be the product
calling a correct graphic broken — the same lie D-21 is about,
pointed the other way. The sentence for the lost picture says both
halves in order: *"It still transmits, but it cannot be corrected or
copied until a picture is chosen again."*

### A mark only where there is something to mark

`ready` and `as-is` rows get nothing at all. A tick beside every clean
row is forty ticks an operator reads past, and the deck badge is
absent rather than reading `0 to check` — a count that is always there
is a count nobody reads. A deck of forty uploaded PowerPoint pages
reads *"40 slides"*, not *"40 to check"*.

### Measured, on the real instance and on a staged one

The author's two real decks read completely quiet: five slides, no
marks, no badge — correct, because not one of them carries a
definition.

A staged deck exercising all four standings read `3 to check`, with
amber marks on exactly the three rows that have something wrong and
none on the clean one or on the page with no definition. Opening a
row printed its faults in the same words the writer uses while a slide
is being typed — one vocabulary for one judgement. Both decks on disk
were left exactly as they were found.

### The record

Twenty-one assertions, twelve mutations, all twelve caught. Two of
them were wrong patches of mine before they were mutants: inserting
`blocking: true` ahead of the real key produced an object literal
where the later key wins, which is a mutant that changes nothing and
therefore proves nothing. The surviving one that *was* real —
`off-identity` made blocking — had no assertion holding it, and now
does: a slide in last month's colour reads `draft`, never `broken`.

`slideReady` and `slideTransmittable` are deleted. The line they drew
is real and is drawn now where something reads it.

### What this does not do

* **It does not stop the picture being deleted.** Teaching
  `bookingsFor` about deck slides would refuse a deletion the author
  may well want — the slide still transmits either way. Saying so
  afterwards is the honest half; refusing beforehand is a separate
  decision about whose library it is.
* **It does not offer to redraw the drifted slides.** The remedy is
  Correct, which already exists and already works. A "restyle this
  deck" button would re-render every slide in it, which is a batch
  job and a different stage.
* **It does not check uploaded pages.** It cannot. There is no
  definition to check, and guessing from the pixels would be a
  judgement about somebody else's work made by reading a picture.

---

## C-37 — Stage 37: the one desk that never asked

`Confirm` exists in this product and nine surfaces use it. Its own
docstring is an argument rather than a description: *"a confirmation
is the last thing between a person and an action they cannot take
back, so the only interesting question about it is whether it makes
them think."*

The slides panel reached it from nowhere. It is the panel used
**between two cues**, and its Remove button deleted a picture out of
the library on one press — no dialog, no trash, no way back.

### Three presses that destroyed something silently

* **Remove a slide.** `PATCH {action:'remove'}` takes it out of the
  deck and the route deletes its PNG and its label file. Gone.
* **Remove a slide that is on air.** `bookingsFor` refuses a slide
  held by the schedule, the filler, the backup or the emergency cut
  — and knows nothing about `channel.live.segment`, which is what is
  on the wire *right now*. Deleting that file does not fail politely:
  the next segment cannot read it, the encode falls back, and the
  channel goes to black until somebody takes something else.
* **Correct.** Not a destructive button, and it destroys something:
  it fills every field from the stored definition, so a half-written
  slide in the boxes went with no press that said so.

### And a deck could be made and never unmade

`DELETE /api/decks/[deckId]` has existed since the deck store was
written and **no surface ever reached it** — the same shape of gap as
the two predicates C-36 deleted, with the opposite remedy: this one
is worth reaching. Every upload and every mistaken one stayed for
ever. It is reached now, behind the dialog, because it is the one
deletion in this product that really does take media with it: a
deck's slides are its own pages and belong nowhere else.

### The sentences are in the domain, and tested

A confirmation is only worth having if it says what is lost. *"Are
you sure?"* is the version that gets clicked through, so the
sentences are `losingSlide`, `losingDeck` and `losingWriting` —
functions with assertions on them rather than strings in JSX.

**The on-air case is a different decision, not a louder version of
the same one**, so it is a different sentence and a different verb:

> **Slide 2, "The new gallery" is on air now.** Removing it deletes
> its picture, so the channel falls back to black until you take
> something else. There is no way to bring it back.
> `[ Cancel ]  [ Remove it anyway ]`

against the ordinary one:

> Remove slide 2, "The new gallery"? Its picture is deleted from the
> library with it, and there is no way to bring it back.
> `[ Cancel ]  [ Remove the slide ]`

`slideSays` is one function now, used by the rundown row and by the
confirmation, so the person checking which slide they are about to
destroy is not comparing two labels.

### Measured

All three dialogs raised in the real control room, on a real deck.
Then the deck deletion run end to end: **Cancel changed nothing** —
three rows, three decks — and Confirm removed the deck, all three of
its slide PNGs and all three label files. The author's two real decks
were untouched, and `channel.json` and the deck directory both
compare identical to their backups.

The staged deck for the first three dialogs borrowed the author's
real library images, which would have been deleted by confirming the
throw-away. It was replaced with one made of throwaway copies before
anything was confirmed. That is the hazard this stage is about,
met while testing the fix for it.

### The record

Thirteen assertions, eleven mutations, all eleven caught.

**And a fourteenth guard deleted as unobservable.** `at >= 0 ?
deck.slides[at] : undefined` survived every mutation, because
`slides[-1]` in JavaScript is `undefined` rather than the last
element — the guard was a habit from a language with negative
indices. C-34's caveat was checked and does not apply:
`noUncheckedIndexedAccess` is on, so the indexed read is already
`Slide | undefined` and the guard narrowed nothing either. The test
that proves the absent slide still gets a sentence that reads is what
makes deleting it safe.

### What this does not do

* **It is not undo.** The request asked for undo and this is
  confirmation, which is what the rest of this product does and what
  `Confirm` was built for. Real undo for a removed slide means not
  deleting the PNG, which means a trash — and an orphan in the
  library breaks the invariant that counts a deck's images against
  what is on disk. That is a decision about storage, not a dialog,
  and it is said here rather than quietly substituted.
* **It does not confirm Cancel.** The button is labelled Cancel and
  the person pressed it on purpose. A control room that asks twice
  about the thing somebody asked for is a control room somebody works
  around. [D-04]
* **No deck rename and no deck duplicate.** Neither destroys
  anything, so neither belongs in this stage.

---

## C-38 — Stage 38: the safe area nobody could see

`ACTION_SAFE` was declared at C-26 and **consumed by nothing**. The
only references in the repository were its own declaration, the
re-export beside it, and one test asserting it was smaller than
`TITLE_SAFE`. A constant nothing reads is a rule the product states
and does not keep.

### And the rule it states was not kept

`graphic.ts` said of the two boxes:

> *"Content is positioned against title safe and `overflow:hidden`,
> so a slide cannot put a word outside it. That is the whole of the
> 'content outside the safe area' check: it is prevented rather than
> detected."*

True of everything the clip contained, and false of the one row
beside it. **`.foot` is positioned absolutely, outside the clipped
box**, and carries the credit and the station's own name — both text.
It sat at 56% of the title-safe margin.

Measured in Chromium at 1920×1080, lowest row carrying ink:

| | ink from the bottom | title safe |
|---|---|---|
| before | **64 px** | 108 px |
| after | **112 px** | 108 px |

Inside action safe, so it survived an overscanning set — and 44 px
outside the box this product's own constants say text never leaves.

**Prevention by clipping only prevents what is inside the thing that
clips.** There are two mechanisms now and a test for the second: the
one row outside the clip is asserted to sit on the line, and any
*other* absolutely positioned element fails that test. That is the
point of it — the next row added outside the box has to say where it
sits rather than inheriting a guarantee it is not covered by.

### The guides, drawn by the editor and never by the renderer

This is the whole safety property of the stage. The guides are a
sibling of the preview iframe in the control room's own document, so
there is no path by which they reach `slideHtml` and therefore none
by which they reach the wire. Drawn inside the renderer instead they
would be rasterised into the PNG and transmitted — two white
rectangles across somebody's broadcast — and **nothing would notice**,
because the preview would look exactly as intended.

So the test is on the renderer, where the mistake would be made,
across all six compositions, and not on the overlay.

**As percentages, so they survive the scale.** The stage is the frame
at whatever width the panel happens to be; 5% of it is action safe at
any size, and a pixel inset computed from 1920 is wrong the moment the
column moves.

**Off until asked for.** A preview permanently crossed with two
rectangles is a preview that no longer shows what goes out.

### What they are actually for

The words on a slide are already clipped to title safe and cannot
leave it, which is what C-26 said and what made a guide look
redundant. The guide is not for the words. **It is for the picture.**
A full-bleed photograph runs to the frame edge by design, and the
Top / Centre / Bottom control decides which part of it survives — a
choice nobody can make well without seeing where the lines fall on
the face.

Two unlabelled rectangles are a puzzle rather than a guide, so the
legend is said once underneath: *"Dashed: action safe — nothing
meaningful outside it. Solid: title safe — where text goes."*

### Measured

Both lines drawn over a real picture slide in the real control room,
the toggle pressed on and off, the overlay gone when off. And the
before/after band rendered at full size with the two lines marked by
the measurement rather than by the renderer: the credit moved from
below the title-safe line to above it.

### The record

Seven assertions, eight mutations, all eight caught — plus one
re-run, because the first version of the mutant that bakes the guides
into the render referenced a constant the module does not import, so
it failed to compile and was killed by the wrong tests. Rewritten as
a literal percentage it compiles, and the assertion that was supposed
to catch it does.

**And a test that would have measured the wrong thing.** `.foot` is
also the tail of `.scrim.foot`, the gradient under a picture caption,
so a loose selector match read that rule instead and found no
`bottom` at all — passing for the wrong reason either way. The
selector is anchored now.

### What this does not do

* **No guides on the on-air view.** That panel shows the library PNG
  of what is actually transmitting; measuring boxes belong where the
  decision is made, not over the record of it.
* **It does not check that the subject of a photograph is inside the
  box.** That needs to know what the subject is, which is a
  judgement about a picture and not a geometry.
* **It does not redraw slides already made.** Every existing slide
  keeps the foot where it was drawn. Correct redraws one; nothing
  redraws them in bulk, for C-36's reason.

---

## C-39 — Stage 39: the keys a gallery runs on

Online TV is the surface of this product that most resembles a
vision mixer, and it had **no keyboard at all**. Advancing a slide
meant finding a 30-pixel button with a mouse. The person who most
needs to advance a slide is standing up in front of a room with a
clicker in their hand — and **a clicker is a keyboard**: every one
sold sends Page Down and Page Up, which is the whole of what the
hardware is. Nothing in this product listened for either.

### One judgement, written three times

Deciding whether a keystroke belongs to the page or to whatever has
focus is the same question everywhere, and it was answered
separately in two studios:

| | where | opt-out honoured |
|---|---|---|
| performance studio | twice in one function | **no** |
| conversation studio | once | yes |
| Online TV | — | — |

So the same markup kept its keys on one surface and lost them on
another, and nothing anywhere said which was right. A rule with two
implementations is a rule with one bug in it that cannot be seen
from either side.

### And the opt-out was set by nothing

`data-keys="own"` had **a reader and no writer** in the whole
product. No element had ever used it, which is why the disagreement
had never been felt. That is the third capability in three stages
this product declared and did not reach — after `slideReady` (C-36)
and `ACTION_SAFE` (C-38). The pattern is worth naming: *a mechanism
with no caller is not a mechanism, and the place it was supposed to
protect is unprotected in a way no test will show.*

It has two writers now, and both were already broken without it.

### The dialog was never protected from the page

`<dialog>` traps focus, so the focused element while a confirmation
is open is a **button** — not an input, not contenteditable. Every
page-key handler in this product therefore fired straight through
it. In the performance studio, pressing a number with a
confirmation open cut to that take. In Online TV an arrow would
have advanced a slide behind the question asking whether to delete
one.

One attribute on `Confirm`, read by the shared judgement, closes it
on every surface at once.

### The keys, and the one that is deliberately missing

`→` / `Page Down` forward, `←` / `Page Up` back, `.` to blank —
the key every presentation tool has used for thirty years, and
reversible by the key beside it, which is why it is safe to give it
a key at all. The irreversible things on this desk go through a
dialog (C-37) and none of them is here.

**Space is deliberately absent.** It scrolls a page, and it starts a
recording in the conversation studio. A key meaning three things on
three surfaces of one product is a key an operator cannot trust —
and the clickers that send Space send Page Down too.

**The listener is not attached at all** unless the channel is live
and a deck is chosen. A key that silently does nothing is worse than
no key, because the operator cannot tell it from a key that did
something they did not see.

**And it is re-attached every render, deliberately.** The handler
has to read the slide that is on air *now*; a dependency list that
missed one of the things it closes over would advance from where the
deck was a moment ago, which is a wrong slide on the wire. One
window listener added and removed per render costs nothing
measurable and cannot go stale.

The keys are named in the `title` of the buttons that do the same
thing, which is the only place anybody looks for them.

### Measured, against the real server

Every press a real round trip through `onShow` and back:

| | key | before → after |
|---|---|---|
| arrow forward | `→` | 1/3 → 2/3 |
| a clicker forward | `Page Down` | 2/3 → 3/3 |
| arrow back | `←` | 3/3 → 2/3 |
| a clicker back | `Page Up` | 2/3 → 1/3 |
| held with a modifier | `Cmd-→` | 1/3 → 1/3 |
| while typing a caption | `→` | 1/3 → 1/3 |
| on the layout row | `→` | 1/3 → 1/3, **layout moved** |
| with a confirmation open | `→` | 1/3 → 1/3 |
| blank | `.` | 1/3 → — /3 |

The seventh row is the opt-out working for the first time in this
product's life: the arrow changed the layout and did not touch the
transmission.

The deck was made of throwaway copies so nothing of the author's was
at risk, and `channel.json` and the deck directory both compare
identical to their backups.

### The record

Fourteen assertions, twelve mutations, all twelve caught.

### What this does not do

* **No number keys.** The performance studio cuts to a take with
  1–9 because its takes are a fixed small set. A deck is forty
  slides, and a two-digit key is a mode.
* **No shortcut for Add.** Committing a slide is the one thing in
  the writer that changes the deck, and it is a press somebody
  should make on purpose.
* **It does not take Space.** Said above, and worth saying twice:
  the temptation is real and the cost is a key that means something
  different in the next studio.

---

## C-40 — Stage 40: the compositor that can draw

The brief said the transmitted picture is *"missing the visual
language of television"* and asked for a graphics system: a channel
bug, a lower third, programme identification, a LIVE mark, NEXT, and
**one compositor feeding programme out**.

`docs/GRAPHICS.md` is the brief kept whole with the measurement
written against each point of it. The measurement reorders the list:

**All of it is already built.** The bug, the lower third, the LIVE
lamp and NEXT are modelled on the channel, derived by one function
(`marksFor`), drawn by one compositor (`markFilters`), composited
over the programme and never burnt into a file. The architecture the
brief draws and the architecture in the code are the same drawing.

**None of it reaches the wire**, because of one line:

```ts
if (!canDrawText) return [];
```

`drawtext` needs freetype and the pinned `ffmpeg-static` is built
without it. C-24 found that a filtergraph naming an absent filter is
rejected WHOLE — the bug did not fail to appear, it took the picture
with it — and traded a black channel for a clean one with no
identity. **The screenshot in the brief is that trade, seen from the
sofa.**

### Drawn by the renderer this product already has

C-26 built a deterministic HTML renderer for slides: pinned face,
fixed sizes, one layout calculation shared by the preview and the
transmission. **A transparent screenshot of a page is a broadcast
overlay**, and `movie` and `overlay` are in every ffmpeg ever built —
including the one that cannot draw a character. Asked by doing it
before a line was written, which is C-35's lesson:

| | |
|---|---|
| `movie` | present |
| `overlay` | present |
| `drawtext` | **absent** |

It is not a second graphics system, which the brief is explicit
about. The same `Mark[]` from the same `marksFor` arrives; only what
draws them changed. The one that knows how to draw still is not the
one that decides what.

### And it does what `drawtext` never could

**A lower third is a name and a role, not a sentence.** The brief
draws two lines — the name large, what they are small underneath —
and that hierarchy is most of what separates a television graphic
from a subtitle. The model composed `title · presenter` into one
string, so the renderer splits on the separator the identity already
uses, once, on the first one: three lines in the corner of a
broadcast is the "don't overdo the writing" the brief warns about,
in its own hierarchy.

A plate with a corner radius, two weights, letter-spacing on a
station mark, and a drawn dot beside LIVE rather than a bullet
character that is a different shape in every font.

### Inside title safe, which the identity never was

`markFilters` used a flat 28px inset — 2.6% of a 1080-line frame,
well outside the line C-38 measured a slide's credit against. A
slide is watched on a laptop; a channel is watched on a set that may
overscan the outer 5%. Every mark is inset to title safe now, by the
same constant.

### Two faults found on the way

* **A still carried no marks at all.** The `-loop 1` branch — a
  slide, a caption card, a station ident — drew none of them, on the
  one kind of picture where there is nothing else to tell a viewer
  whose channel this is. Not a decision: the branch was written
  before the identity existed and never caught up.
* **`bug.assetId` is read by nothing.** A channel that uploads a logo
  and clears the text gets no bug at all. The fourth capability in
  four stages this product declared and did not reach, after
  `slideReady`, `ACTION_SAFE` and `data-keys="own"`. Named in
  `GRAPHICS.md` and left for its own stage, because an image bug is
  a different change from a text one.

### Drawn once, never waited for

The engine makes a segment every four seconds. The marks change when
the programme changes, when somebody is cited, or when the lower
third's eight seconds run out — so the overlay is keyed on **what
the marks say** and the same PNG serves a hundred segments.

The first segment that wants a new overlay asks for it and goes out
without it; the next one has it. That is the loudness queue's bargain
(C-33) for the same reason: a channel that paused for a browser to
start would stutter every time its caption changed. Four seconds of a
correct picture with last moment's caption beats four seconds of
nothing.

### Measured

The real mark set — bug, lamp, two-line lower third, NEXT —
rendered at 1280×720 and composited onto a picture by the shipped
binary: `exit 0`, 26 KB of overlay, every mark inside title safe,
LIVE with its dot top-left, the station top-right, the programme and
the presenter bottom-left with NEXT stacked above.

### The record

Twenty assertions, fourteen mutations, all fourteen caught. Two
needed their anchor corrected first: the separator in the source is
the character itself, not an escape, so the patch matched nothing and
proved nothing until it did.

### What this does not do

* **It does not change `marksFor`.** Not one decision about what the
  channel says moved. This stage is entirely about what draws it.
* **It does not remove `drawtext`.** A build that has freetype still
  uses it when no overlay has been drawn yet, which is the first few
  seconds after a caption changes and any build with no browser.
* **The rest of the brief is still to come**: the role field, the
  source kind on the caption, the image bug, NEXT with its time, and
  the Watch page. Each is named in `GRAPHICS.md` with what it needs.

---

## C-41 — Stage 41: the engine knew and threw it away

A report arrived from another machine: the live path uses `-ss` to
seek into a growing browser recording, the engine assumes a keyframe
every second, a browser may produce one only at the start, and so
each segment takes longer than the last until the channel falls
behind. It came with measurements — 1.1 s at ten seconds in, 7.2 s
at five minutes — taken in a different container against a
synthetic file.

### Measured here, on a recording this product actually makes

Chromium, VP8/Opus, the product's own MIME list, its own two-second
timeslice, 190 seconds of capture, then the engine's own cut command
at increasing offsets:

| keyframes | | the engine's cut | at |
|---|---|---|---|
| count | 38 in 190 s | 1.04 s | 10 s |
| spacing | **5.05 s** (min 5.04, max 5.10) | 0.80 s | 40 s |
| | | 0.78 s | 80 s |
| | | 0.73 s | 120 s |
| | | 0.71 s | 160 s |

**Flat.** Slightly faster at the end, as a warm page cache would
predict. On this browser the reported fault does not reproduce, and
the reason is the first column: Chromium writes a keyframe every five
seconds, not only at the start, so a fast seek decodes at most five
seconds before the cut and the cost is bounded rather than growing.

Two things remain true from the report:

* **The engine's own comment is wrong about live.** It justifies
  `-ss` with *"the house format puts one second apart"* — a claim
  about what this product encodes, not about what a browser records.
  Five seconds, not one.
* **Firefox is unmeasured.** Only Chromium is installed here, the
  author uses Firefox, and a browser that really did key only at the
  start would behave exactly as reported. Nothing here rules that
  out.

### So the stage is not the fix. It is the instrument.

Building a continuous re-keying pass — a second encode per live
session, on a two-core box — on the strength of an unreproduced
hypothesis would be the opposite of this product's method. What the
measurement actually exposed is worse than the bug it was looking
for:

**`index.ts` has computed `const spent = Date.now() - started` at
the end of every pass since the loop was written, and used it only
to decide how long to sleep.** The number that says whether this is
a television station or a slideshow was measured four times a second,
for the life of every broadcast, and thrown away.

That is why the question had to be answered with a stopwatch in a
different container against a file nobody broadcasts. The right
answer to *"is it falling behind"* is not a better guess. It is for
the thing that knows to say so.

### Spent over produced, and one is the edge of the cliff

Below one the engine has spare time and the channel runs for ever.
Above one every pass starts further behind the clock than the last
and the gap grows without limit — **there is no equilibrium above
one**, which is why this is a ratio rather than a duration.

Measured against what the pass **produced**, not against the segment
length: a pass that made three segments had twelve seconds of
television to make and twelve seconds of grace to make it in.

**The worst recent pass, not the average.** Nineteen passes at 0.3 s
and one at 5 s has already dropped a segment, and a mean of 0.5 would
call that healthy. Each time it runs out of time the picture arrives
late and nothing catches it up. The average is the honest number for
*how hard is this box working*; the maximum is the honest number for
*did we make it*.

**And the warning is at two thirds, not at one.** A channel running
at 95% of real time has no room for a longer programme, a second
channel, or the minute the operating system spends elsewhere — and
the first anybody would know is a stall.

### Where it speaks

Below a render putting black on the wire and above everything else,
and the placement is the argument: a channel falling behind is still
transmitting, still green, still producing segments. It is the third
fault in this product that nothing else can reveal, after the silent
black render (C-24) and the picture nobody could see (C-28).

The sentence names the consequence rather than the measurement,
because "slow" is not a thing anybody acts on and *"the picture will
start arriving late and players will stall"* is.

### The record

Seventeen assertions, eleven mutations, all eleven caught.

### What this does not do

* **It does not change the seek.** Nothing is known to be wrong with
  it on a browser that keys every five seconds, and the instrument
  now exists to find out on the server where it matters: a channel
  that reads `behind` while live, and recovers when the broadcast is
  restarted, is the report's hypothesis confirmed — and then the
  re-keying pass is justified by data instead of by argument.
* **It does not ask the browser for keyframes.** `MediaRecorder` has
  no portable control for it, the one Chrome offers is non-standard,
  and Chromium already keys often enough. A hint that Firefox ignores
  would be a fix that looks applied and is not.
