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
