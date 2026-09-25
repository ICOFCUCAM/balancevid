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

## §6 — Going live

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

## §7 — Live ingest

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

## §8 — Recordings somebody asked for

The second and last thing that makes media. A recording names **who asked**,
because a channel that quietly kept everything would break the duplication
rule from the other end and nobody would be able to say who decided that.

## §9 — The playout engine

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

## §10 — What is published

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
