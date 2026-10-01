# STUDIO TWO — THE PERFORMANCE STUDIO — the specification, as given

This document is the brief for Studio Two, recorded verbatim as it was given,
so that nothing is lost to a summary. Implementation follows it a stage at a
time; where a stage is done, it is marked in **Appendix S** at the end of this
file, which is the only part of this document Claude writes.

The rule for this file: **the brief is not edited, compressed or reordered.**
If something in it turns out to be infeasible, or to contradict an invariant
the product already holds, that is written in Appendix S as a stated conflict
with a proposed alternative — never by quietly dropping the item.

---

## The brief

**1 to 15. Studio Two should be a separate studio, because what you are
describing is no longer the same job as Studio One.**

I would define the product as having two creative studios:

Studio One — Conversation Studio
Respond to existing video.
Watch → Interrupt → Respond → Continue → Compose → Publish

Studio Two — Performance Studio
Create a performance from multiple video takes against one master track.
Choose music → Record takes → Place environments → Sync → Switch cameras/takes
→ Master → Publish

And I think Studio Two could be a very strong feature.

### 1) Studio Two: Performance Studio

The central idea should be:

One song. One master timeline. Many performances.

You could upload:

* a song
* instrumental
* backing track
* original audio
* music video
* another video to perform against

Then record yourself multiple times.

For example:

Take 1 — Living room
Take 2 — Virtual recording studio
Take 3 — Beach
Take 4 — Concert stage
Take 5 — Outdoor landscape

All five are synchronized to the same song timeline.

Then you can switch between them while the song plays.

### 2) This is the important part

You don't want five separate videos that you manually edit afterward.

You want a multicam performance timeline.

Imagine:

All takes are aligned to the same music clock.

Then your edit track becomes:

The song itself never moves.

You are simply deciding which visual performance occupies each section of the
song.

That is exactly what you are describing.

### 3) The user experience could be extremely simple

Step 1 — Choose the music

Then:

The master track is ready

### 4) Step 2 — Choose your environment

Before recording:

Background
Original
Blur
Virtual Space

* Recording Studio
* Concert Stage
* Modern Room
* University Hall
* Church
* Theatre
* Beach
* Forest
* City
* Mountain
* Night Studio
* Custom Background

You can record in your bedroom while the finished performance makes it look as
though you are in a studio.

And, as with the earlier background feature, I would not permanently bake the
background into the raw recording.

Store:

Then render later.

That means you can change:

Bedroom → Studio

without recording the song again.

### 5) Full Mode and Half Mode

I would make this very explicit.

FULL
You occupy the whole performance stage.
Perfect for a music video or performance.

HALF
You occupy one side and the selected environment/content occupies the other.

Or:

That gives you a natural way to show two takes of yourself simultaneously.

### 6) And this is where Studio Two gets really interesting

You could have multiple synchronized takes visible simultaneously.

For example:

All four performers are actually you, recorded at different times.

They are all synchronized to the same song.

You choose which one is visible at each moment.

### 7) Manual switching should be extremely powerful

While the master song plays, you could have:

You press:

1 → 3 → 2 → 4 → 2 → 1

BalanceVid records those decisions onto the master timeline.

So you are essentially directing the music video live.

Then:

Create Master Video

And BalanceVid renders the result.

### 8) But don't throw away the manual edit

After recording the switching performance, you should get:

Now you can drag the boundaries.

So there are two modes:

Live switching
You play the song and switch takes in real time.

Timeline editing
You adjust the resulting cuts afterward.

This is the best of both worlds.

### 9) Audio needs special treatment

I would make the master music track independent from the camera takes.

For example:

Then you can decide:

Mode A — Music + recorded vocal
Use the music as backing and your microphone as the vocal.

Mode B — Original performance audio
Use the audio captured with the selected video take.

Mode C — Master vocal
Record the vocal separately and use that vocal throughout all camera changes.

Mode C is particularly powerful.

You could sing the song once perfectly, then record five visual performances
afterward. The master vocal stays continuous while the video switches between
environments.

That produces much cleaner music-video results.

### 10) There should also be a "sync" operation

When recording Take 2, Take 3, etc., BalanceVid should know:

This take belongs to this song.

The user should hear the master track through headphones while recording.

The system records:

So every take can be aligned precisely to the same musical timeline.

### 11) And you could do something beautiful with the transitions

Instead of only hard cuts:

* Cut
* Dissolve
* Fade
* Zoom transition
* Swipe
* Match movement
* Beat cut
* Chorus transition

For example, automatically offer:

Cut on beat

The system detects musical beats and lets you snap camera changes to them.

That would be particularly useful for music videos.

### 12) Studio Two should eventually have this interface

### 13) There is an important distinction from Studio One

I would keep the two studios separate.

Studio One
Conversation
The source is something you are responding to.
Its fundamental structure is:
Source → Claim → Response → Evidence → Timeline

Studio Two
Performance
The music is the master clock.
Its fundamental structure is:
Master Track → Takes → Environments → Switching → Master Video

They can share the same underlying media/rendering infrastructure, but don't
force both experiences into one UI.

### 14) And Studio Two can use the same publication system

Once the master video is finished:

16:9
9:16
4:5
1:1

Then:

YouTube
TikTok
Instagram
Facebook
Short clips
Music visualizer
etc.

A 4-minute song could therefore produce:

Full music video
Vertical music video
30-second chorus clip
15-second teaser
Behind-the-scenes version

from the same master project.

### 15) One thing I would add that you may really like: "Performance Scenes"

Instead of thinking only in terms of video takes, let the user create scenes:

Verse 1 — Studio
Chorus — Concert Stage
Verse 2 — Beach
Bridge — Night City
Final Chorus — Four-way performance

The user can assign one or several takes to each scene.

That makes the workflow feel like directing a music video, rather than editing
files.

### The architecture I would tell Claude to preserve

The critical principle is:

Never merge the individual takes into one irreversible video until the final
master render.

That gives you exactly what you described: all performances remain available,
they all share the same musical timeline, you can manually switch between them
while the song plays, and the final master video is generated from those
decisions.

And yes — this deserves to be called Studio Two, rather than trying to cram it
into the Conversation Studio. It gives BalanceVid a second major identity:
Studio One lets you converse with media; Studio Two lets you perform and create
media.

---
---

# APPENDIX S — WHAT THIS BRIEF MEANS IN THIS CODEBASE

Written by Claude. Nothing above this line is Claude's. Everything below is
either a mapping onto machinery the product already has, a judgement offered as
a judgement, or a conflict stated rather than quietly resolved.

Nothing here is built yet. This appendix exists so that when it is built, the
decisions were made deliberately and can be argued with.

---

## S-0 — The sentence the whole brief turns on

> "Never merge the individual takes into one irreversible video until the final
> master render."

This is **INV-00**, arrived at independently.

INV-00 says the Conversation is canonical and everything else is a regenerable
representation. §1–§15 say the Performance is canonical and the master video is
a render of it. They are the same statement about two different documents, and
that is the strongest possible sign that Studio Two belongs in this product
rather than beside it: it wants the architecture this codebase already has.

Everything in this appendix follows from taking that seriously. In particular:

- the switching decisions are **data in the document**, not an edit applied to
  media;
- the environment is **a field of a take**, not pixels burned into it;
- the master video is **a representation**, deletable and rebuildable;
- and a change of mind costs a re-plan, never a re-record.

---

## S-1 — A Performance is a second document, not a Conversation with a flag

§13 is right and it is the most consequential structural sentence in the brief.
The two structures are:

```
Conversation    Source  → Claim → Response → Evidence → Timeline
Performance     Master  → Takes → Scenes   → Switching → Master Video
```

A `Conversation` cannot hold that without lying. Its `interventions` are
anchored to a source frame and *ordered by that anchor* (U-08); a Performance's
takes are not ordered at all — they are **parallel**, all occupying the same
stretch of the same clock. Forcing them into `interventions` would mean an
array whose order is meaningless, which is the shape of a field that will be
misread within a release.

So: a second root document, `Performance`, in `src/domain/performance.ts`,
sharing everything below the document — assets, ingest, the queue, the render
plan, the export profiles, the layouts, the publication system.

**What must be shared, and is already built for it:**

| Studio Two needs | The product already has |
|---|---|
| Crash-safe recording of long takes | U-06 rolling MediaRecorder segments |
| A preview that agrees with the render | U-39 editing proxy, INV-13 |
| Arrangements as data, not branches | U-18 `LAYOUTS` |
| Four output shapes from one composition | `EXPORT_PROFILES`, `reframe` |
| Loudness-correct masters | U-17, INV-11 |
| Clips, hooks, caption looks, share cards | The publication system, as §14 asks |
| Per-participant independent recording | ROOM §10 — already generalised |

**What is genuinely new:** the master clock, take alignment, scenes, live
switching, and the environment matte. That is a small new surface on a large
existing foundation, which is the right ratio and the reason this is worth
doing.

---

## S-2 — The third clock

U-08 gave the product two clocks: `t_source` (where we are in the source) and
`t_output` (where we are in the finished video). Studio Two introduces a third,
and it outranks both:

```
t_master    position in the song, in SAMPLES at the master's sample rate
```

**Samples, not frames, and this is not pedantry.** INV-02 makes cuts
frame-exact because a frame is the unit a viewer perceives in vision. In music
the unit a listener perceives is far finer: one video frame at 30fps is 33ms,
and 33ms of misalignment on a snare is not a subtle artefact — it is the thing
that makes an amateur music video sound amateur. Lip-sync tolerance is about
±20ms before it is felt.

Proposed, to sit beside the existing invariants:

```
INV-14  Every take's alignment to the master is stored in samples, is
        measured rather than assumed, and no stage of the pipeline resamples
        a take without recording that it did.                      [U-08, U-17]
```

The corollary, which the existing doctrine already learned the hard way in
"A cut is exact only if nothing downstream is permitted to resample it": the
master audio passes through the render **unresampled and undynamically
processed**. Speech mastering compresses; music mastered like speech is
ruined. INV-11's −14 LUFS target is right for music too (it is the streaming
standard), but the path to it must be gain, not compression.

---

## S-3 — Alignment must be measured, and it will drift

§10 says "the system records" the offset. It has to be said plainly that a
browser cannot simply be asked what that offset is.

**Three separate errors, all real:**

1. **Start latency.** `MediaRecorder.start()` does not begin capturing at the
   moment it is called. Between the author pressing record and the first
   sample landing there is a device-dependent delay of tens of milliseconds.
2. **Output latency.** The master track the author hears in their headphones
   is behind the master track's own clock by the audio device's output
   latency. They perform to what they hear, so their performance is late by
   exactly that amount — and `AudioContext.outputLatency` reports it, but not
   on every browser and not always honestly.
3. **Clock drift.** Two devices — or one device across two takes — nominally
   at 48 kHz are not at 48 kHz. Over a four-minute song a 20 ppm difference is
   ~5ms; a bad USB interface is far worse. An offset alone cannot fix this,
   because the error grows.

**What is proposed:**

- The master is played through Web Audio at a known `AudioContext` start time,
  and the offset is computed from `getOutputTimestamp()` and the recorder's
  first chunk — measured, not assumed, exactly as the doctrine already
  requires of every duration.
- A **one-time latency calibration** per device, offered once and remembered:
  the product plays a click, the author's microphone hears it, and the round
  trip is measured. It takes four seconds and it is the difference between
  takes that line up and takes that nearly do. *Built in stage ten; S-23
  records the direction the correction goes, which is the part worth having
  written down.*
- Alignment is stored as `offsetSamples` **and** `rateRatio`, so drift is a
  correction rather than a defect. *Built in stage eleven — measured where
  there is something to measure it against, and honestly absent where there
  is not. S-24.*
- And the author can **nudge** it. Every professional tool has a sync nudge
  because every automatic alignment is occasionally wrong, and an author who
  can see the problem and cannot fix it will abandon the product rather than
  the take.

**One thing the brief gets exactly right and must not be softened:** §10's
"through headphones". If the master track leaks from speakers into the take's
microphone, the finished video has the backing track twice, slightly apart —
a phasing artefact that cannot be removed afterwards. The product should
*detect* that (the master's own signal, correlated against the take's audio)
and say so before the author records five takes that way.

---

## S-4 — Scenes are the primitive, and switching is how you write them

§7 describes live switching, §8 describes editing the result, §15 adds scenes.
Read as three features, that is three timelines to keep in step. Read properly,
**§15 is the general case and the other two are ways of authoring it.**

A Performance holds one ordered list of scenes:

```
Scene   { fromSample, layoutId, takeIds[], transition }
```

- A hard cut between single takes is a scene with one take.
- §6's four-way performance is a scene with four takes and a quad layout.
- §5's Half Mode is a scene with two.
- Live switching (§7) **appends scenes** as the author presses keys.
- Timeline editing (§8) **moves `fromSample`** on scenes that already exist.

One artefact, two ways in — which is the same resolution the Room reached when
the stage history turned out to be the interventions. There is no separate
"cut list" and no chance of the two disagreeing.

This also makes §15's language the product's language: the author is assigning
**Chorus → Concert Stage**, not editing a switching log.

---

## S-5 — Full, Half and four-way are rows in a table that already exists

§5 and §6 need no new engine. `LAYOUTS` (U-18) is already data: a layout names
its layers, each layer names its source and its rect, and the renderer never
learns a layout's name. Studio Two adds rows:

```
performance_full     one take, full frame
performance_half     two takes side by side  (or take + environment)
performance_quad     four takes
performance_focus    one large, others inset
```

and they inherit `reframe` for free, which is how §14's four shapes work
without a second set of decisions. A 9:16 four-way is a 2×2 in a tall frame,
and that is a row, not a code path.

**A caution worth recording:** four simultaneous 1080p decodes for live preview
will not hold up on a laptop. The editing proxy (U-39, INV-13) exists precisely
for this and must be used for the switching surface, with the mezzanine used
only at render. A preview that stutters makes an author mistrust their own
timing, and in a music tool timing is the whole product.

---

## S-6 — The environment is a field, and the matte is the hard part

§4's instruction — "I would not permanently bake the background into the raw
recording" — is the Representation Rule (D-16) and is exactly right. The
environment is a field of the take; the composited picture is a render of it;
Bedroom → Studio is a re-plan.

The part the brief does not mention, and which decides whether anyone uses the
feature: **segmentation quality.** A virtual background is only as good as the
matte, and a bad matte on a music video — flickering edges, a missing hand on
a beat — is markedly worse than no background at all.

Proposed:

- The raw recording is always kept, always. The matte is derived.
- The author sees the matte **before** they record the other four takes, not
  after — because if it is poor in their room, the answer is a light or a
  different wall, and they need to know that at take one.
- `Original` and `Blur` are offered first and framed as the reliable choices,
  because they are. A product that quietly leads people to the worst-looking
  option is not being generous.
- The virtual spaces in §4's list are **content** — images or loops — and each
  needs a rights line of its own. They ship with the product, so the product
  owns that problem rather than the author.

```
INV-16  A performer is composited into an environment only where a matte was
        measured from a plate of their own room; the raw recording is never
        altered.                                                 [D-16, U-18]
```

*Built in stage five. S-18 records what the building taught — including that
the plate makes the matte measurable rather than guessed, and that drawing the
spaces rather than shipping photographs dissolves the rights line above.*

---

## S-7 — Audio: the brief's three modes, and the one structural consequence

§9's modes A, B and C map to a single field on the Performance naming where the
finished audio comes from. The consequence worth drawing out is in Mode C:

> "The master vocal stays continuous while the video switches between
> environments."

That is the statement that **the audio timeline and the video timeline are
independent**. Scenes cut the picture; they do not cut the sound. Once that is
true in the model, Mode A and Mode B are special cases of it, and a fourth
becomes free: a *per-scene* audio source, for the author who wants the crowd
sound from the concert-stage take under the chorus.

Two engineering notes:

- **Mode B is the dangerous one.** Switching between takes' own audio means
  the room tone changes at every cut, which is audible and cheap to fix: a
  short crossfade on the audio even where the picture hard-cuts. Picture and
  sound do not have to cut together, and in practice they must not.
- **The master vocal is a take too** — recorded against the same clock, aligned
  the same way, subject to the same INV-14. It is not a special object.

*Built in stage six, including the fourth mode. S-19 records what it taught.*

---

## S-8 — Beats are a suggestion, not a fact

§11's "cut on beat" is genuinely the feature that makes edits look
professional, and it is also an AI-derived field, which the product already has
a rule for:

```
INV-06  Every AI-derived field has an accepted_by.
```

So detected beats are **suggestions** until the author uses one. Snapping is
visible, reversible, and can be switched off; a cut that moved 40ms because the
detector was confident is a cut the author did not make. The same applies to
detected sections (verse, chorus) if those are ever offered for §15's scene
names — a chorus the product found is a suggestion, and the author names it.

Of §11's list, the ones that earn their place first are **Cut**, **Dissolve**,
**Fade** and **Beat cut**. *Match movement* is a research problem wearing the
costume of a transition, and should be named as ambitious rather than shipped
half-working. That is the same judgement the Studio's Explain toolkit already
made when it shipped six tools instead of sixteen.

*Built in stage seven, all four. S-20 records what it taught — including that
Beat cut turned out not to be a transition at all.*

---

## S-9 — The rights question this brief does not ask, and must

This is the most important thing in this appendix.

Studio One's entire rights posture (D-08, U-35, U-21, INV-07) rests on
**transformative commentary**: you respond to a source, your response is
substantial, the source is used in proportion, and it is attributed. That
posture is coherent and defensible.

**Studio Two is not commentary.** Performing over a commercial recording and
publishing the result is a different legal object entirely — it engages
mechanical, synchronisation and master-use rights, and "I added a video" is not
a transformative-use argument. A product that hands people a beautiful way to
make music videos over songs they do not own, and a publish button, has built
them a problem and called it a feature.

The product already has exactly the right mechanism for this, and it is not a
warning dialogue. **U-01's two source classes.** Class A is governed: it can be
composed and exported. Class B is embedded: it can be worked with, but
`INV-01` forbids a composed export of it.

Proposed, by direct analogy:

```
A master track is classified when it is added:

  OWN         the author's own recording or composition
  LICENSED    the author holds a sync licence, or it is a licensed library
              track the product supplies
  OPEN        public domain, or a licence that permits this (CC-BY and kin)
  THIRD_PARTY a commercial recording the author does not have rights to

OWN, LICENSED and OPEN export normally.
THIRD_PARTY performs, rehearses, previews and exports privately — and
cannot be published from this product.
```

That is INV-01's shape, applied to music, and it is worth stating as an
invariant of its own:

```
INV-15  No published export contains a master track the author has not
        declared they may publish.                          [U-01, D-08, U-35]
```

Three further points:

- **The attribution block (U-21, INV-07) must name the music.** Song, writer,
  performer, and the licence where there is one. This is not a compliance
  gesture — for OPEN tracks it is the licence condition, and for OWN tracks it
  is the author crediting themselves, which they want.
- **The product should supply a licensed library.** The single best way to keep
  authors out of trouble is to give them good music they are allowed to use.
  This is a business decision, not an engineering one, but the architecture
  should assume it exists from the start rather than have it retrofitted.
- **This is not legal advice**, and D-08's standing caveat applies: counsel
  reviews the classification and the wording before launch, per jurisdiction.

Recording this here rather than discovering it after launch is the whole
purpose of writing doctrine before code.

---

## S-10 — Five things the brief does not ask for, which it needs

Offered as judgements, not as decisions already taken.

1. **Partial takes.** The brief assumes five full performances of a song. Four
   minutes each is twenty minutes of singing to change one chorus. A take
   should carry an in and out point on the master clock and be allowed to
   cover part of the song. This is the difference between a feature people
   demo and a feature people use.

2. **A musical count-in.** U-04's pre-roll is temporal; a performer needs two
   bars. The count-in is part of the master, not of the take, and the take's
   first sample is at the downbeat.

3. **Lyrics are authored, not transcribed.** §14 inherits the caption system,
   and captions of singing produced by ASR are unreliable in a way that shows.
   Lyrics should be imported or typed, timed against the master, and marked as
   authored — which the transcript model already distinguishes. An unreliable
   lyric burned into a music video is worse than none.

4. **Nothing destructive, as everywhere else.** D-13 already holds: a re-record
   appends a take, a scene change is a field, and no author loses a
   performance because they tried something.

5. **The name.** "Studio One" and "Studio Two" are good internal shorthand and
   poor product names — a number implies a sequence, or a tier you have not
   paid for. On screen they should be **Conversation** and **Performance**,
   which is what §13 calls them anyway. The identifiers in code can stay
   `conversation` and `performance`.

---

## S-11 — §12 is blank in the brief

§12 reads "Studio Two should eventually have this interface" and the interface
did not come through. It is recorded here as **an open item, not an omission**,
so that it is asked about rather than invented.

What the rest of the brief implies, offered only as a starting point for that
conversation: a transport bar carrying the master track along the bottom with
the scenes drawn on it; the takes as a rail of numbered tiles; the performance
stage in the middle showing the current scene; and the number keys live, so
that pressing 1–4 during playback is the act of directing described in §7.

---

## S-12 — Proposed stages

The Room was built in four stages, each one shippable and verified, and the
same discipline applies here. Proposed order, shortest path to the thing being
real:

1. **The document and the clock.** `Performance`, takes, scenes, `t_master`,
   INV-14, and the classification of S-9. No interface. Tests prove that a
   scene list renders to a plan and that alignment survives a round trip.
2. **One take, aligned.** Choose music, record one take against it through
   headphones, measure the offset, prove sync by render. The least glamorous
   stage and the one everything else rests on.
3. **Many takes, switched.** The rail, live switching, scenes written by
   keypress, and the timeline editing of §8 over the same scenes.
4. **Environments.** Matte, virtual spaces, the honest preview of S-6.
5. **Audio modes and beats.** §9's modes, per-scene audio, beat detection as
   suggestion.
6. **Publication.** Mostly free — §14 is the existing system, given a
   Performance instead of a Conversation.

Stage 1 is where the expensive mistakes are avoided, so it is deliberately the
one with no visible result.

---

## S-13 — Stage 1, built

**The document, the clock, the scenes and the rights class.** No interface, no
renderer, nothing on screen. 47 tests.

| Built | Where |
|---|---|
| `t_master`, in samples | `src/domain/time.ts` |
| The Performance, takes, scenes, environments | `src/domain/performance.ts` |
| Switching, dragging, trimming, classifying | `src/domain/performanceEdit.ts` |
| INV-14, INV-15, and what makes a Performance renderable | `src/domain/invariants.ts` |

**One boundary moved, and the reason.** Stage 1 was written as "tests prove
that a scene list renders to a plan". It delivers the TIMELINE instead — the
projection a plan is built from — and stops there. A performance shot is a
third kind of shot beside `source` and `response`, carrying several takes and a
layout, and that is a decision about the compositor rather than about the
document. Studio One keeps `projectTimeline` and `planFromTimeline` apart for
exactly this reason: the projection is arithmetic over the document and can be
tested with no renderer anywhere near it. The plan belongs to the stage that
renders.

**What the stage taught.**

1. **Asking whether a take covers a MOMENT is not asking whether it covers a
   SCENE.** The first projection checked each take against the first sample of
   the span it was in. A take that starts a scene and runs out halfway through
   passed as though it had covered the whole thing — the rest would have
   rendered black with nothing having complained. It was found by a test that
   expected a complaint and got silence, which is the only reliable way to
   find this class of defect: **assert on the refusal, not only on the
   acceptance.** The check is `coversSpan` now, end to end.

2. **The order of two true diagnostics is a product decision.** A scene naming
   one take that does not reach it satisfies both "this scene shows nobody"
   and "a take you named does not reach all of this". Both are accurate; only
   the second is useful, because the author DID name a take and needs to know
   which one and what to do. The specific check runs first and the general one
   is now only reachable by a document something else edited. **An error
   message that is true and unhelpful is a bug with a passing test.**

3. **A nudge is not a correction to a measurement, it is a separate fact.**
   Storing the author's sync adjustment in the same field as the measured
   offset means a re-measure silently discards a human's fix. Kept apart, a
   re-measure is safe, and the difference between the two is the feedback that
   says how good the automatic alignment actually is.

4. **The rights class had to be a field before anything else existed.** It is
   the one thing that cannot be added later without invalidating work people
   have already done — a library of performances made against unclassified
   music is a library nobody can publish and nobody can fix in bulk. Stage 1
   is the right place for it precisely because there is nothing to migrate
   yet.

**Deliberately not built yet, and named so it is not mistaken for done:** the
plan and the renderer (Stage 2), latency calibration and the leakage warning
(Stage 2, and they are the difference between takes that line up and takes
that nearly do), the environment matte (Stage 4), beat detection (Stage 5),
and §12's interface, which is still an open item.

---

## S-14 — Stage 2, part one: knowing where a take actually is

**The measurement, the decoder, and the store.** Still nothing on screen. 22
tests, every one of them against signals the test built itself, so the right
answer is known to the sample before the measurement runs.

| Built | Where |
|---|---|
| Alignment and leakage, as arithmetic | `src/domain/align.ts` |
| Device latency, from a recorded click | `src/domain/align.ts` |
| Decoding to samples, normalised at the door | `src/render/audio.ts` |
| The Performance store | `src/store/performances.ts` |

**The honest precondition, which the brief does not state.** Cross correlation
finds a take on the song by asking whether the two signals agree, and it works
because both heard the same room — which is how every multicam alignment tool
works. §10 tells the performer to wear headphones. **With headphones the master
is not in the microphone and there is nothing to correlate.** That is not a
defect in the method; it is the method's precondition, and the module says so
rather than returning confident answers about noise. One measurement, read two
ways: agreement means the offset is precise AND the author must be warned,
because the master is coming out of speakers and the finished video will carry
the backing track twice.

**What this part taught.**

1. **Two thresholds were one threshold.** The first version had a level above
   which the offset could be trusted and a higher one above which the author
   was warned. Measuring showed the band between them is exactly where the
   wrong answers live — a different song entirely scores 0.26 with the offset
   55 milliseconds out, nearly three times the tolerance a listener notices,
   and a performer singing in time scores 0.21 because they ARE in time, which
   is the whole idea. The offset can be trusted exactly when the master is
   audible, and the author must be warned exactly when the master is audible.
   Those are one fact. **A threshold chosen from a number you hoped for is a
   guess; the fixtures that matter are the ones that nearly pass.**

2. **A search window with a hidden side.** The master was sliced starting a
   search-width before the hint, and the search then ran plus-or-minus that
   width from there — which put the entire window earlier than the hint. A
   take that started later than the browser reported could not be found at
   all, and the measurement settled confidently on the nearest earlier beat, a
   full second out. It was found by testing the error in both directions, and
   by nothing else. **An asymmetric bug survives a symmetric test suite.**

3. **Parsing prose for a number, removed rather than fixed.** Duration was
   read by running a second ffmpeg pass and scraping its human-readable
   summary — a string whose units had changed between releases (`kB` to
   `KiB`) and whose sample format was not the one being assumed. Decoding to
   the analysis file already counts the samples exactly, so the function was
   deleted and the decode returns the duration. **When a fix is a better
   regex, look for the reason the string is being read at all.**

4. **The wrong sample rate belongs in the fixture.** The media tests build
   their song at 44.1 kHz on purpose. A take at 48 kHz against a master at
   44.1 drifts seven percent — seventeen seconds over a four-minute song — and
   a test that used the house rate throughout would never discover whether
   normalisation happens.

---

## S-15 — Stage 2, part two: a song, and a take recorded against it

**The studio opens.** Choose the music, and record against it — as many times
as you like, each take landing on the same clock. §1 and §3, end to end, in a
browser.

| Built | Where |
|---|---|
| Its own door, and the rights question at it | `app/StartPerformance.tsx` |
| The studio | `app/p/[id]/` |
| Playing the master and recording to it | `app/p/[id]/useMasterRecording.ts` |
| Ingesting a song; placing a take on it | `src/worker/index.ts` |
| The routes | `app/api/performances/` |

**Where the offset comes from.** The master is played through Web Audio,
scheduled at a moment chosen in advance — `AudioBufferSourceNode.start(when)`
rather than "start now" — because that is the only way to know afterwards
where it began. Asking later gives the page's idea of now, which is not the
audio clock. The offset is read from that clock when the recorder starts, and
the worker then checks it against the song itself.

**What this part taught.**

1. **A denylist answering a question about somebody else's rights.**
   `mayPublish` read `class !== 'third_party'` — so every value that was not
   that one could be published, including one nobody defined. A request
   carrying `class: "neon"` was written straight into the document and passed
   INV-15. It is an allowlist now, and `classifyMaster` validates at runtime as
   well as in the types, because the types describe what was hoped for and the
   body is whatever arrived. **When the safe answer is "no", the code must have
   to say "yes" explicitly.**

2. **AAC is a licensing question, not a format choice.** The normalised master
   was AAC in MP4, and a Chromium without proprietary codecs cannot decode it
   at all — the song simply never loaded. This codebase already met the same
   wall with H.264 and answered it the same way. The master is Opus in WebM
   now: royalty-free, decodable everywhere that matters, and natively 48 kHz,
   so the container and the house clock agree for free. It also removed a real
   hazard — AAC's encoder priming meant the decoded analysis copy and the
   browser's decoded buffer could disagree by around a thousand samples, which
   is the whole sync tolerance.

3. **The browser bundle, again.** A client component imported the vocabulary it
   needed from `performance.ts`, which imported `newId`, which reaches
   `node:crypto`, which fails the build. The same lesson the render planner's
   geometry taught. `newPerformance` moved to the edit module and the document
   module is browser-safe by rule now, with the reason written at the top of
   it so the next person does not re-import it.

4. **Echo cancellation is wrong here, and it is right in the other studio.**
   The Conversation Room turns it on: that is speech, and the room's own sound
   is noise. A performance take turns it off, because the room's sound is the
   performance and cancellation would duck the singing every time the backing
   track moved. The same API, the opposite answer, decided by what the audio
   is FOR.

**Measured, not claimed:** a twenty-second song at 44.1 kHz arrives as exactly
960,000 samples at the house rate; a take recorded on fake devices with
headphones scores 0.13 correlation against the master and is therefore
correctly reported as *not* audible, leaving the browser's own measurement
standing — which is the honest outcome S-14 described.

**Still to come:** the latency calibration the author runs (the studio passes
zero for it today, and says so in a comment rather than pretending the number
is a measurement), the leakage warning's own end-to-end test, and stage 3's
switching.

---

## S-16 — Stage 3: many takes, switched

**Directing the music video.** §7's number keys, §8's draggable boundaries,
§5's Full and Half, §6's four-way, and §15's named sections — all of them
writing the same object.

| Built | Where |
|---|---|
| The arrangements, as rows | `src/domain/presentation.ts` |
| Several takes playing as one | `app/p/[id]/usePerformancePlayer.ts` |
| The stage, the rail, the timeline | `app/p/[id]/SwitchingStage.tsx` |
| Take media, with range requests | `…/takes/[takeId]/media/route.ts` |

**§5 and §6 needed no engine, as S-5 predicted.** `performance_full`,
`performance_half`, `performance_quad` and `performance_focus` are four rows in
the table layouts already live in. The only extension the model needed was a
`take` layer that names a SLOT rather than a fixed source — because a
Conversation has one source and one responder, and a Performance has as many
takes as somebody cared to record. The scene says who; the layout says where.

**What this stage taught.**

1. **The song is the clock, and no video may be the reference.** Four `<video>`
   elements have four opinions about what a second is. So the master plays
   through Web Audio — whose `currentTime` is the hardware's own clock — and
   every take is STEERED to agree with it rather than set. A take inside 12ms
   is left alone; one outside that is walked back by bending its playback rate
   a few percent, which is invisible; only an error too large to walk off is
   corrected by seeking, because seeking stalls. Setting `currentTime` every
   tick, which is the obvious implementation, is a permanent stutter. **In a
   timing tool, a preview that judders makes the author mistrust their own
   timing, which is the one thing they must be able to trust.**

2. **A hook cannot ask its caller for something only the hook knows.** The
   player took the list of visible takes as an argument, and the caller worked
   it out from the playhead — which comes out of the player. The first version
   quietly passed the scene at position zero, so it would have decoded the
   opening scene's takes for the whole song and paused everything else. The
   player resolves it from its own clock now. **When a parameter can only be
   computed from the return value, it is not a parameter.**

3. **An arrangement's capacity is a question the table can answer.**
   `takeSlots(layout)` counts the take layers, and `setScene` refuses a scene
   whose takes do not fill its panels. It caught one of this appendix's own
   earlier tests, which had put two takes into a one-panel arrangement. Three
   performances in a two-panel scene is not a preference to interpret — it is a
   panel that does not exist, and the alternative is a silently dropped
   performance the author finds after exporting.

4. **Range requests are not an optimisation here.** Switching means seeking:
   the author drags to the chorus and several videos must arrive there
   together. Without `Range` a browser will not seek until the whole file has
   arrived, which for a four-minute take means the feature simply does not
   work.

**Still not built:** the master render (§14 and the export), which is the one
thing everything else now waits on; the environment matte (§4); the audio modes
(§9); transitions and beat detection (§11); and the device calibration from
S-3. §12's interface is still an open item — what is above was designed
against the rest of the brief, not from §12.

---

## S-17 — Stage 4: the master render

**"Never merge the individual takes into one irreversible video until the final
master render."** This is that render — §14's export, and the first point at
which a Performance becomes a file.

| Built | Where |
|---|---|
| A Performance as a render plan | `src/domain/performancePlan.ts` |
| A third kind of shot | `src/domain/plan.ts` (`PerformanceShot`) |
| Picture-only shots, one audio pass | `src/render/compose.ts` |
| The job | `src/worker/index.ts` (`render_performance`) |
| Asking for it, and getting it back | `app/api/performances/[id]/renders/…` |
| The button, and what is missing | `app/p/[id]/MasterRender.tsx` |

**The stages were reordered to put this before §4's environments, and the
reason is worth recording:** nothing above it can be seen. An environment matte,
an audio mode and a transition are all claims about what the finished video
looks like, and until there is a finished video they are claims nobody can
check. §14 is also the only stage that turns the whole of Studio Two into
something an author can take away.

**What this stage taught.**

1. **The compositor did not need to learn about performances.** It needed one
   more kind of shot. `buildPerformancePlan` produces the same `RenderPlan` the
   Conversation produces, so the export profiles, §14's four shapes, the shot
   cache (U-16), the loudness discipline and the concatenation all came across
   unchanged, and there is no second renderer to drift from the first. **A
   second document does not imply a second engine; it implies one more case in
   the engine's vocabulary.**

2. **A Performance's shots carry no audio at all, and that is the design.** A
   Conversation's shots each carry their own sound because the sound IS the
   cut — the source speaks, then the author does. A Performance cuts picture
   over sound that never stops. Slicing the song at the video cuts and
   re-joining it would put a click at every one of them, so the picture is
   concatenated first and the master is laid over the whole thing in one pass
   (`-map 0:v:0 -map 1:a:0`). Declick is zero and ducking is zero for the same
   reason: there is no seam to hide and nothing is under anything. **Two
   timelines that are independent should be rendered independently; the point
   where they meet should be one place, not one per cut.**

3. **The master the render plays is the master alignment measured.** Not the
   author's upload — the normalised copy. If the renderer muxed the original
   and alignment had measured the normalised decode, every take would be out by
   whatever the two decoders disagreed about, which is a small number that
   nobody would think to look for.

4. **The planner asks the invariant rather than keeping its own copy of the
   rules.** The first version of `buildPerformancePlan` re-implemented "no
   scenes" and "no gaps" and produced worse messages than INV-03 already had:
   it would say a scene had zero performances when the truth was that the take
   the author named runs out halfway through it. **Two copies of one rule are
   two rules, and the copy in the newer file is always the one with the worse
   error message.**

5. **The rights gate lives where the artefact is described, not where the
   button is drawn.** `buildPerformancePlan` refuses to describe a publishable
   export of a master the author has not claimed (INV-15) and takes
   `allowUnpublishable` explicitly, so a private copy is something asked for in
   words. A check in the interface is one refactor away from not being in the
   path.

6. **The fixture song was twenty seconds and every take was seven.** The
   browser run had therefore never once been in a state that could render, and
   nobody had noticed, because every check it made was about refusals and
   documents. Shortening the song to five seconds made the fixture coherent and
   the render checkable end to end. **A test fixture that cannot reach the
   state under test passes for the wrong reason.**

7. **Every take was losing its last four seconds, and only §14 could see it.**
   Making the fixture coherent (6) meant a take had to cover the song — and it
   never did. The recorder uploaded each segment from `onstop` and read the
   take out of a ref to address it, but `stop` clears that ref before stopping
   the recorder, so the final segment was always uploaded by a branch that had
   already returned. Seven seconds of singing arrived as 3.9. The same defect
   was in the Room's capture hook, where it had been eating the end of every
   answer. Both now upload unconditionally, reserve the segment's number when
   it opens, and finalise only after the last upload lands. It is recorded in
   the main doctrine's Appendix C as well, because it is a U-06 lesson and not
   a Studio Two one. **Nothing above the capture layer can tell you that the
   capture layer is dropping the end — you need something that has to consume
   all of it.**

8. **`ffprobe`, not the log.** The finished video is asserted on through
   structured output — one video stream at the requested 1080×1920, exactly one
   audio stream, and a duration within a frame of the song. An earlier
   duration check in this codebase read ffmpeg's prose and believed a units
   suffix; the structured answer is the only one worth asserting on (U-02).

**Still not built:** the audio modes (§9), which
are declared on scenes and stored but do not yet change the mix; transitions
and beat detection (§11); publication of a performance as clips or a share card
(§14's second half); and the device calibration from S-3, which still passes
zero. §12's interface remains an open item.

---

## S-18 — Stage 5: the environment, and the matte it needs

**"You can record in your bedroom while the finished performance makes it look
as though you are in a studio."** §4, built — and S-6's warning was the design
brief: a virtual background is only as good as the matte, and a bad matte on a
music video is worse than no background at all.

| Built | Where |
|---|---|
| The plate, the spaces, the thresholds | `src/domain/environment.ts` |
| Measuring a room by decoding it | `src/render/plate.ts` |
| The key, as a filter graph | `src/render/matte.ts` |
| INV-16 | `src/domain/invariants.ts` |
| The plate, and the key running live | `app/p/[id]/RoomPlate.tsx` |

**The matte is a difference, not a guess.** There is no segmentation model
here estimating where a person ends. There is a PLATE — three seconds of the
room with nobody in it — and everything that differs from it by more than the
room's own measured noise is the performer. The author steps out of shot once;
in exchange the matte has no per-frame estimate in it at all, which is the
flicker S-6 warned about, structurally absent rather than tuned away.

**What this stage taught.**

1. **A measurement makes the threshold, and then nobody has to choose one.**
   The plate is decoded to small grey frames and the per-pixel standard
   deviation over time is counted in JavaScript — the room's own noise. The key
   fires at three times that. A clean camera on a tripod gets a tight key and a
   noisy one in a dim room gets a forgiving one, and no number was typed by
   anybody. The same measurement answers "will this work in my room" before the
   author records five takes, which is exactly what S-6 asked for.

2. **The difference has to be taken in RGB.** A difference on luma cannot see a
   blue shirt against a grey wall of the same brightness, and a matte that
   loses a shirt is worse than none. Differencing in planar RGB and reducing to
   grey afterwards measures colour distance, which is what "different from the
   wall" actually means. `maskedmerge` then needs all three streams in planar
   RGB too: in YUV its mask's neutral chroma blends the colour of every pixel
   halfway to the backdrop, which looks like a washed-out grade rather than
   like a bug.

3. **A filter-graph label can be consumed exactly once.** The take is needed
   twice — to measure the difference and to be composited — and feeding `[fg]`
   to two filters makes ffmpeg look for a *file* called `fg` and report
   "Invalid stream specifier". The split is inside `matteChain` rather than at
   the call site, because using it correctly should not require knowing that.

4. **Drawing the spaces dissolved the rights problem S-6 raised.** The eleven
   spaces are recipes — two colours, a light pool, a vignette, some grain,
   sometimes one straight edge — evaluated at the panel's own size. Nothing is
   licensed, nothing is credited, and nothing was somebody's photograph first.
   The honest consequence is stated in the studio rather than discovered in the
   export: "Beach" is a stylised backdrop in the colours of a beach, not a
   photograph of one. An author who wants a real place behind them supplies it,
   and its rights are theirs — which is U-01's shape again.

5. **INV-16 is enforced at the door as well as at the render, and the door's
   message is the remedy.** "That background needs a matte, and this take has
   no plate to make one from — record three seconds of the empty room, then set
   it again." The invariant also checks only the takes that are ON SCREEN: a
   take sitting unused in the rail with an environment it can no longer support
   is not a reason to refuse somebody's export.

6. **Dropping the plate takes the environment with it.** `usePlate(…, null)`
   puts the take back in its own room and resets `environment` to `original`,
   because a take left saying "Concert Stage" with nothing to matte against is
   a document describing a video it cannot produce — and that is a thing found
   at render time, by the author, at the end.

7. **The preview uses the export's technique, not a better one.** The studio's
   live key fetches the same plate the renderer will, at the same threshold,
   and does the same difference in a canvas. It would have been easy to preview
   with something smoother. A preview that flatters the export is worse than no
   preview, because the whole reason S-6 wanted one was to let somebody find
   out now that their room will not do it.

**Still not built:** transitions and beat detection (§11); publication of a
performance as clips or a share card (§14's second half); and the device
calibration from S-3, which still passes a stated zero. §12's interface
remains an open item. `custom` backgrounds are modelled and rendered, but the
studio has no upload for one yet.

---

## S-19 — Stage 6: where the sound comes from

**"The master vocal stays continuous while the video switches between
environments."** §9's three modes, and the fourth S-7 said would come free.

| Built | Where |
|---|---|
| The sound timeline | `src/domain/performanceAudio.ts` |
| The mix, as one pass | `src/render/mix.ts` |
| Whether a take recorded anything | `src/worker/index.ts` |
| Choosing, and choosing per section | `app/p/[id]/SoundModes.tsx` |

**S-7 read that sentence as a structural claim and it was right.** The audio
timeline and the video timeline are independent. Once that is true in the
model, Mode A and Mode B are cases of one question — which sources are audible
over this stretch of the song — and a per-scene override is not a feature but
the absence of one.

**What this stage taught.**

1. **Contiguity is the feature, not an optimisation.** The planner emits
   PIECES: one run of one source, with touching runs merged. In Mode C the
   vocal is therefore a single piece from the first cut to the last, trimmed
   once and laid down once. A planner emitting one piece per scene would
   produce the same sound on paper and a seam at every picture cut in fact —
   and the picture cut is exactly where a seam is most audible, because that is
   where the ear is already being asked to accept a change.

2. **`amix` normalises by default, which is a fader nobody touched.** Left
   alone it divides by the number of inputs, so the song drops when a vocal
   enters and rises when it stops. `normalize=0`, and `dropout_transition=0`
   for the same reason at the other end. Levels stay where they were recorded
   and the whole mix is mastered once (U-17, INV-11) — the order a mastering
   engineer works in.

3. **The two-pass master must measure the MIX.** It was measuring the
   concatenated picture, which for a Performance has no audio at all, so
   loudnorm fell back to a single blind pass. The mix is now written out as
   FLAC, measured, and mastered — one lossless file between the two, and the
   only encode is the final one.

4. **"Did this take record anything" is a measurement.** A muted microphone
   produces a take that looks perfect and sounds like nothing, and Mode A
   would mix that silence in as though it were a vocal. The peak is taken from
   the analysis decode the alignment already does, and `hasAudio` is written on
   the take. The studio then says which takes were silent, in their labels,
   rather than leaving somebody to wonder why the chorus is thin.

5. **A fixture without an audio stream is not a take.** Every mezzanine has
   audio — ingest synthesises silence when a camera arrives without any — so
   two earlier test fixtures that were video-only were testing files the
   product cannot produce. One now carries silence, as a real one would; the
   other says `hasAudio: false` in its document, which is the honest
   description of it and exercises the silent-take path through a real render.

6. **The test measures frequency, because every mode produces a file that
   plays.** The song is a 220 Hz tone, one microphone is 880 Hz and the other
   1320 Hz, and a Goertzel over a window of the finished audio says which
   sources are audible at that moment. "The render succeeded" is precisely the
   assertion that would have passed while Mode C quietly switched vocals at
   every cut.

7. **Changing the sound re-mixes and re-renders nothing.** The audio timeline
   is part of the plan, so a change of mode changes the plan hash and leaves
   every shot hash alone (U-16). Deciding between Mode A and Mode C is
   therefore about a minute of mixing rather than a re-render of the video,
   which is what makes it a decision somebody will actually try both ways.

**Still not built:** transitions and beat detection (§11); publication of a
performance as clips or a share card (§14's second half); the device
calibration from S-3; and an upload for `custom` backgrounds, which are
modelled and rendered but have no door in the studio. §12's interface remains
an open item. Nothing here ducks the music under a vocal: the mix is honest
about levels and the master is one pass over the result, and a per-source gain
is the obvious next thing if anybody needs it.

---

## S-20 — Stage 7: transitions, and the beat

**§11, both halves.** Cut, Dissolve and Fade through black; the pulse of the
song found by the product and accepted by the author; and cutting on the beat,
which turned out not to be a transition at all.

| Built | Where |
|---|---|
| The four that earn their place | `src/domain/transitions.ts` |
| The overlap, paid for | `src/domain/performancePlan.ts` |
| The mix, frame by frame | `src/render/compose.ts` |
| The pulse | `src/domain/beats.ts` |
| Snapping, visibly | `app/p/[id]/SwitchingStage.tsx` |

**Beat cut is a cut.** §11 lists it beside Dissolve and Fade as though it were
a fifth way for one shot to become another, and it is not: what makes a beat
cut is WHERE it is, not how it looks. Modelling it as a transition style would
have made a cut on a beat a different object from a cut, with its own row in
a table and its own branch in the renderer, for no difference in the output. It
lives in the beat grid and in snapping instead.

**What this stage taught.**

1. **A transition is a length of time, and the song does not get longer.** A
   dissolve is paid for out of the two sections it joins — half from the end of
   one, half from the start of the next — so the finished video is exactly as
   long as the music whether the author dresses their cuts or not (INV-03). The
   plan checks its own tiling before anybody renders it, because a transition
   moves two shots' boundaries for every one it adds and being one frame out is
   a thing you otherwise discover forty minutes later.

2. **Shortening a shot changes its hash, and the first version forgot.** A
   shot's hash is the address of its bytes on disk (U-16). Paying for an
   overlap makes a shot twelve frames shorter, which is not the same bytes —
   and hashing before the adjustment would have served the cached file of the
   old length, producing a video longer than its own song **on the second
   render only**. There is now a test whose entire job is that sentence.

3. **`xfade` decides for itself how many frames a crossfade is.** Asked for
   exactly ten frames at thirty a second it produced seven, and the render came
   out three frames short of the song it is supposed to be exactly as long as.
   The mix is a per-pixel expression over the frame INDEX instead: frame zero is
   entirely the outgoing picture, the last frame is entirely the incoming one,
   and there are exactly as many in between as were paid for. **A filter
   specified in seconds cannot make a promise counted in frames.**

4. **And it must be mixed in RGB.** In YUV "nothing" is not zero — black is
   Y=16 with the colour planes at their midpoint — so fading to black by
   multiplying towards zero produces a green flash. The same lesson §4's matte
   learned about `maskedmerge`, arriving from the other direction.

5. **The transition renders as two ordinary shots and one blend.** No third
   compositing path: a dissolve between two Half Mode scenes with different
   environments works because nothing in the transition code knows what a Half
   Mode scene or an environment is.

6. **A tempo detector is wrong in one specific way, and the interface has to
   allow for it.** Autocorrelation is exactly as happy with half a tempo as with
   the tempo, because every other beat lines up just as well. A prior centred
   where people tap — two beats a second — settles most of it, and the rest is
   two buttons: halve and double, one press each rather than a re-detect. That
   is not a workaround; asked to tap along to something at 176, most people tap
   88, and the honest answer is the one they would tap.

7. **The one-millisecond envelope bin was reporting half the tempo.** At 140
   BPM the beats fall at 428.6ms, so successive onsets land on alternating
   sides of a bin boundary and a correlation compares a spike against its
   neighbour. Smoothing the envelope by a couple of milliseconds first fixed
   it — and a real onset is ten to thirty milliseconds wide anyway, so the
   sharp single-bin edge was an artefact of the measurement rather than a
   property of music. **Found by testing three tempos instead of one.**

8. **The confidence threshold was measured, not chosen.** A click track scores
   0.89 to 0.97 and white noise — onsets everywhere, a period nowhere — tops
   out at 0.56, so the line sits at 0.65. It changes what the studio SAYS and
   never what it does: the tempo is shown either way and the author is the one
   who accepts it.

9. **INV-06, at the one place a detected beat can change the document.**
   Turning snapping on IS the acceptance, and it is recorded with who made it;
   until then the grid is drawn faintly on the timeline and moves nothing.
   Every snap says so while it happens and leaves a boundary that can be
   dragged like any other. S-8 asked for exactly this, and building it cost
   nothing over building the version that just snaps.

**Still not built:** publication of a performance as clips or a share card
(§14's second half); the device calibration from S-3; an upload for `custom`
backgrounds, which are modelled and rendered but have no door in the studio;
and §12's interface, still an open item. Of §11's list, Zoom, Swipe, Match
movement and Chorus transition remain unbuilt on purpose — S-8's judgement,
unchanged by having built the other four.

---

## S-21 — Stage 8: the short one, and the link preview

**§14's second half.** The vertical clip, and the picture a link arrives with.

| Built | Where |
|---|---|
| A window on the song | `src/domain/performance.ts` (`projectPerformance`) |
| What is worth clipping | `src/domain/performanceClips.ts` |
| The link preview | `src/publish/performanceCard.ts` |
| Rendering both | `src/worker/index.ts` |
| Choosing, with the reasons | `app/p/[id]/PublishPanel.tsx` |

**A clip is the master render with a window on it.** Not a clip pipeline: a
span passed to the same plan builder. The same scenes, the same matte, the same
audio modes, the same transitions, the same shot cache, the same INV-15. The
alternative — a second renderer for short videos — is two things that
eventually disagree about what the chorus looks like, and the one people see is
the short one.

**What this stage taught.**

1. **The window asks "is a scene in force here", not "does a scene start
   here".** The first version of the windowed projection reported a gap
   whenever a clip opened in the middle of a scene — which is the normal case,
   since a clip is cut out of the middle of a performance. It would have
   refused to render the chorus of anything with a long section in it.

2. **Two clocks in one piece of sound.** A clip's audio lands at the CLIP's
   zero and is read from the SONG's position, so every piece carries both:
   `fromSample` is where it goes, `mediaFromSample` is where it comes from.
   Confusing them is a chorus clip playing the first verse, which plays
   perfectly and is completely wrong.

3. **A clip fades at both ends and the song does not.** The master render must
   not fade in, because a song beginning on a downbeat somebody wrote is not
   something to ease into. A clip is cut out of the middle, so the opposite is
   true: without the fade it starts with a bang and stops mid-word. Same code,
   opposite answer, decided by whether there is a window.

4. **The floor on a clip's length is a floor, not a rule about the rule.** Eight
   seconds — or the whole song, when the song is shorter than that. A product
   that refused to clip a six-second piece because clips are at least eight
   would be enforcing its own arithmetic against the author's music.

5. **The candidates are the author's sections, and the one the product chose
   says so.** §15's named scenes are candidates because naming a section is a
   statement about the song by the person who performed it. The product also
   offers a stretch of its own, and labels it "we chose these boundaries, not
   you" — the same honesty S-8 required of detected beats. U-22's rule holds
   either way: it proposes, and never publishes.

6. **The card quotes nobody, and says so by not using quotation marks.** A
   conversation's share card is built around a bound statement and earns its
   quotes by hashing what the source actually said (INV-05). A performance
   quotes nobody — there is no transcript and no claim — so the hero is the
   author's own title for their own video, unquoted. Same `ShareCard` shape,
   same renderer, different facts, because the facts are different.

7. **INV-15 reaches the picture too.** A card is a thing made to be posted, so
   a performance over music the author has not claimed does not get one at
   all. The private export exists for them; a preview image to post with does
   not.

**Still not built:** a public page for a performance — clips and the card
exist, and nothing yet serves a performance to somebody who was sent a link.
The device calibration from S-3 still passes a stated zero. `custom`
backgrounds are modelled and rendered but have no upload in the studio. §12's
interface remains an open item. Of §11's list, Zoom, Swipe, Match movement and
Chorus transition remain unbuilt on purpose.

---

## S-22 — Stage 9: the page the link points at

**The card described a page that did not exist.** This is that page: a
published performance, and the rules a link has to obey.

| Built | Where |
|---|---|
| What may be published | `src/domain/performanceEdit.ts` |
| What a link says about itself | `src/web/performanceShare.ts` |
| Publishing and withdrawing | `app/api/performances/[id]/publish/route.ts` |
| What a stranger may reach | `src/auth/policy.ts` |
| The page | `app/p/[id]/watch/` |

**What this stage taught.**

1. **A performance is not respondable, and the field is not a question.**
   U-31's "anyone can open it and respond to it" is about a conversation,
   where responding IS the product. There is no mechanism to answer a
   performance with, so `respondable` is false and the studio does not ask —
   an option that promised a feature which does not exist is worse than no
   option.

2. **A private copy stays private, and the exemption is remembered.** Publishing
   takes the most recent finished master that was NOT exported under
   `allowUnpublishable`. Without that, an author who exported a rehearsal over
   somebody else's record, sorted the rights out afterwards and pressed publish
   would put out a video nobody pressed publish on. INV-15 is about the FILE
   as much as about the document. The first version also took the wrong job
   entirely, because `listJobs` returns newest first and the code read the last
   element — a bug the browser run caught by publishing the private copy.

3. **The public surface is the finished video and nothing else.** The page, the
   link preview, the master render and the clips. Not the song, not the takes'
   own media, not the document. Handing out the master track somebody
   performed over would be publishing the record rather than the performance,
   which is the distinction the whole rights posture rests on.

4. **An unpublished performance says nothing about itself.** `generateMetadata`
   runs before the page decides to 404 and with none of the sender's cookies,
   so a title there would hand the author's unfinished work to anyone who
   guessed a URL. It returns the generic title, exactly as the conversation's
   does, and for the same reason (D-03).

5. **The credit is on the page, not behind a disclosure.** INV-07 requires every
   export to carry its attribution; a page carrying it in a collapsed section
   is carrying it the way a contract carries small print. It is a line under
   the video, generated from the record.

6. **A browser check that watches a control is watching a round trip.** The
   environment check waited for a `<select>` to show the new value and failed
   at fifteen seconds on a machine that was also rendering video — while the
   document had the change. It waits on the document now. **When the truth and
   the display are two different things, assert on the truth.**

**Still not built:** the device calibration from S-3, which still passes a
stated zero; an upload for `custom` backgrounds, which are modelled and
rendered but have no door in the studio; and §12's interface, still an open
item. Of §11's list, Zoom, Swipe, Match movement and Chorus transition remain
unbuilt on purpose. A published performance is not listed anywhere public
either — `/api/published` lists conversations, and whether the two belong in
one list is a question about the product rather than about this stage.

---

## S-23 — Stage 10: what the device adds

**S-3's third promise, and the last number in this studio that was a stated
zero.** The product plays three clicks, the microphone hears them, and the
round trip is measured — once per device, remembered by that browser.

| Built | Where |
|---|---|
| The arithmetic, and the direction | `src/domain/calibration.ts` |
| Playing and listening | `app/p/[id]/useCalibration.ts` |
| Using it | `app/p/[id]/useMasterRecording.ts` |

**The sign is the whole lesson.** The performer hears the song late by the
output latency, so the sound they make is late by that much; the capture path
delays it again before it lands in the file. Sound at a media position
therefore belongs EARLIER in the song than the clock alone would say, and the
round trip is **subtracted**. The code that was waiting for this number added
it. That would not have failed anything — it would have doubled the error, so
a calibrated device would be twice as wrong as an uncalibrated one, and the
symptom would have been "everything is slightly out", which is the symptom of
everything. The derivation is written out in the module rather than left to be
re-derived at three in the morning, and there is a test whose only job is the
direction.

**What else it taught.**

1. **A round trip measures all three of S-3's errors at once.** Output latency,
   capture latency, and the recorder's own start delay — the gap between
   `MediaRecorder.start()` returning and the first sample landing. Measuring
   the loop through the same recorder includes that gap, and including it is
   right: the same gap displaces a take by the same amount.

2. **The microphone is opened with everything turned off.** Echo cancellation
   exists to remove a sound the speakers just made from what the microphone
   hears — which is precisely the sound being measured. Automatic gain would
   rescale the click and noise suppression would treat it as noise. The
   browser's defaults are correct for a call and wrong for a measurement.

3. **One clear reading is a coincidence.** Three clicks, the median, and the
   whole thing refused if they disagree by more than twelve milliseconds or
   land outside what a device can be. The browser run proves the refusal
   rather than the success: Chrome's fake microphone plays a beep of its own,
   the readings disagree, and the studio says so and keeps the clock. **A
   calibration that cannot fail honestly is worse than none, because the
   number it invents moves every take.**

4. **It lives in the browser, not in the document.** A latency is a fact about
   a device, and the same performance opened on a laptop and a phone has two
   answers. The measurement is stored per browser — but it is written onto each
   take as `latencySamples` as that take is recorded, because a number that
   moved somebody's performance by forty milliseconds and left no trace is one
   nobody can check afterwards.

5. **One label was meaning two things.** `AlignmentMethod` carried
   `'calibrated'`, the worker wrote it when it had HEARD the song inside a take
   and the browser was about to write it when it had SUBTRACTED a measured
   latency. Two different claims about how a take came to sit where it sits,
   under one word. There are four now — `measured`, `calibrated`, `heard`,
   `manual` — and the studio says which in the take's own row. Documents
   written before this carry `calibrated` where they mean `heard`; that is dev
   data and not worth a migration, but it is worth writing down.

**Still not built:** an upload for `custom` backgrounds, which are modelled and
rendered but have no door in the studio; §12's interface, still an open item;
and S-3's third error, clock DRIFT — `rateRatio` is in the model and is
measured for nothing, because correcting it needs a long take with the song
audible at both ends. Of §11's list, Zoom, Swipe, Match movement and Chorus
transition remain unbuilt on purpose.

---

## S-24 — Stage 11: two clocks, and the one that drifts

**S-3's third error, and the last of the three.** `rateRatio` has been in the
model since stage one and INV-14 has been checking it since stage two. Nothing
measured it until now — and a field that is always exactly 1.0 is a field that
is lying quietly.

| Built | Where |
|---|---|
| The measurement, and the direction | `src/domain/drift.ts` |
| Taking it, at both ends | `src/worker/index.ts` |
| Honouring it, in picture and sound | `src/render/compose.ts`, `mix.ts` |

**What this stage taught.**

1. **Drift is only measurable where there is something to measure it against.**
   Two sightings of the same take on the song, far apart, give the ratio to a
   few parts per million — and each sighting needs the song to be AUDIBLE in
   the recording, which happens only when it leaked from the speakers. On
   headphones, which is what §10 asks for, there is no signal and no
   measurement. The product says so and leaves the ratio at one. **A
   measurement that cannot be taken is not a measurement to estimate.**

2. **The direction is the whole risk.** `rateRatio` is take samples per master
   sample, so a take whose clock ran fast produces more of its own samples for
   the same stretch of song, covers LESS song, and is played FAST to put it
   back. The first version of both the formula and the renderer had this
   inverted — and an inverted drift correction does not fail, it doubles the
   error. The domain test therefore puts the measured ratio back through the
   model's own `masterToTake` and checks it lands where the take was found,
   which is the check that distinguishes the two "numbers near one".

3. **A correction applied at the in-point is not a correction of drift.** It is
   a correction of the moment before the drift starts. The ratio is applied
   across the whole shot — `setpts` on the picture, `atempo` on the sound —
   and the input is read for longer than the shot lasts, because it is about
   to be played faster.

4. **The model was already right about coverage, and the test fixture was
   wrong.** A take at a ratio of two covers half as much song as its own
   length, so an eight-second take cannot fill an eight-second song and INV-03
   refused to render it. The fixture grew; the rule stayed.

5. **There is a coarse check that works on headphones, and it answers a
   different question.** Comparing how long the recorder ran (by the audio
   clock) against how many samples came out is far too noisy to see twenty
   parts per million — the stop instant alone is worse than that. It is
   exactly right for a device that recorded at 44.1 kHz while claiming 48,
   which is not drift at all but an eight percent error that ruins every take
   it makes. It is reported as a warning the author can act on ("try a
   different input device"), and never as a ratio.

**Still not built:** an upload for `custom` backgrounds, which are modelled and
rendered but have no door in the studio; and §12's interface, still an open
item. Of §11's list, Zoom, Swipe, Match movement and Chorus transition remain
unbuilt on purpose. With this, every numbered section of the brief that
describes behaviour is built, and the three errors S-3 named are all either
measured or honestly refused.

---

## S-25 — What the review found

Eleven stages were built quickly, one after another, each with its own tests
and its own browser run, and none of them reviewed as a whole. This is the
pass that looked at all of it at once. It found five things, and the two worst
were in code that every test agreed with.

**1. Publishing published everything on disk.** [INV-15, D-03]
The render route checked that the performance was published and then served
whatever hash it was asked for — including a private copy exported under the
rights exemption over music the author had not claimed. The same hole was in
the Conversation's copy of the route, written a month earlier, where it served
every draft render. Both now serve the render the publication NAMES, and the
clips route refuses one made as a private copy. Recorded in the main
doctrine's Appendix C as well, because it is a lesson about publishing rather
than about performances.

**2. The browser's measurement never reached the document.**
[§10, S-3] A take's offset was written when the recording was DECLARED — before
the count-in, as zero — and the worker only ever overwrote it when it could
hear the song inside the take. On headphones, which is the path §10 asks for,
everything the browser measured at capture was discarded, including stage
ten's whole device calibration. It went unnoticed for nine stages because
recording always begins at the top of the song, so the placeholder was nearly
right. The worker keeps the measurement now, and the browser run asserts that
what was measured is what was stored.

**3. And it could not have been kept, because it was clamped at zero.**
`placeTakeOnSong` subtracted the device latency and then clamped — and since
`into` is about zero, every correction landed just below the clamp and was
thrown away. A take recorded from the top on a device with a forty-millisecond
delay genuinely begins forty milliseconds BEFORE the music: its first frames
were captured while the performer was still waiting to hear the first beat.
Offsets may be negative now, `formatMasterPosition` says so instead of
throwing, and the studio says "starts just before the song".

**4. Which broke rendering, in a way that was right and useless.** With real
offsets reaching the document, a take that began nine milliseconds after the
song no longer "covered" a scene starting at zero, and the product refused to
render a whole performance for being a third of a frame short — with a message
telling the author to extend a take that was already long enough. Coverage is
asked in FRAMES now, which is the unit the export is made of. Flooring gives
the two ends different behaviour and both are correct: a take beginning inside
the first frame begins at frame zero; a take running out inside the last frame
is a frame short, and a frame short is a black frame.

**5. The coarse rate check was measuring the wrong instant.** It compared the
media's length against the recorder's running time, and took that running time
when the take was FINALISED — which waits for the last segment to upload. Every
take from a working machine came out one or two percent short, which the check
reported as a device recording at the wrong sample rate. It is taken at `stop()`
now, and the check is not applied at all to a take shorter than twenty seconds,
because a measurement whose error is larger than its threshold is not evidence.
**A false alarm about somebody's hardware is the most expensive wrong thing a
product can say.**

**What the pass did not find** is worth recording too: no path traversal (`safe`
covers every identifier that reaches the filesystem), no ASS injection (titles
and attributions are escaped), no route where a guest may write, and no
measurement stored as a fact that was not measured.

**Still open, and now the largest thing in the product:** annotations do not
follow the source when a layout is reframed. They are drawn in canvas
coordinates, which is correct on a 16:9 master where the source fills the frame
and wrong on every vertical, square and portrait export, where the source
occupies a panel and may be cropped to the author's focus region. A blur is a
privacy tool, so this is not only cosmetic. The fix is to draw the marks onto
the source stream before it is cropped and fitted, rather than onto the canvas
afterwards — one place, and then they follow the picture everywhere for free.

## S-26 — The performance, to listen to

Built across both studios at once, so most of it is recorded in the main
doctrine's Appendix C. Two things are specific to this one.

**A performance's chapters are its NAMED scenes and nothing else.** [§15] Every
cut is a scene here — that is what a scene is in this studio — so a chapter at
every scene boundary is a chapter at every camera change, which is a list
nobody opens twice. The Conversation Studio has the opposite property: its
chapter list is the moments the author interrupted, and those are exactly the
moments a listener wants. The same function, `audioChapters`, serves both; what
differs is what each studio calls a chapter, and that belongs to the studio.

**What listening costs is a different number here.** A conversation loses its
subject when a response points at the screen. A performance loses the
performance: the take IS the picture. So the Performance Studio does not offer
an audio export as a representation of the work — it offers the master, which
is what the song already was, with the sections named. The audio controls sit
under the master render rather than beside the publication formats, because
that is a different claim: not "the same thing, to listen to" but "the sound
this was made from, mastered for listening".

**And the audio is the author's, even when the video is public.** The
Conversation Studio serves a published conversation's MP3 to anyone who has the
link, because two people talking is not a record. Here the same file is the
closest thing the system can produce to a music file — a performance over
somebody else's track, in the format people keep music in — so a stranger gets
the video and the owner gets the MP3. Nobody asked for this clause; it follows
from the one already in the public-route list, which keeps the master track off
it for exactly the same reason. [INV-15, U-01]

**Still not built:** the device calibration from S-3, which still passes a
stated zero; an upload for `custom` backgrounds; §12's interface. Zoom, Swipe,
Match movement and Chorus remain unbuilt on purpose (S-8).

## S-27 — The thing you are performing against

**§3 lists what a master may be: "a song, instrumental, backing track,
original audio, music video, another video to perform against."** Five of
those six are sound. The sixth was being thrown away.

`normaliseMaster` ingested with `-vn`. Upload a music video and the product
kept its sound and discarded its picture — which meant §5's Half Mode had only
one of its two forms. "TAKE 1 | TAKE 2" worked, because that needs only slots.
"YOU | BACKGROUND / OTHER VIDEO" could not exist at all, because there was no
other video left to put there.

**TWO FILES, NOT ONE.** The sound is the CLOCK: every take is aligned against
it, and it is decoded, measured and analysed as samples. The picture is a
layer that some layouts use. Muxing them would carry video frames through
every decode the alignment pipeline does and never read them, and would make
"this master has no picture" a property of a stream inside a file rather than
of whether a file exists. The picture is kept silent for the same reason a
take's audio is kept separate: a second copy of the song is a second thing
that can drift.

**A cover-art JPEG inside an MP3 is a video stream.** ffprobe says so, and it
is not a picture to perform against — a Half Mode showing an album cover for
four minutes would be a feature arriving by accident. One frame is not a
video, and the check counts packets rather than trusting the stream's
existence.

**The rights govern the picture at least as strictly as the sound.** Putting a
commercial music video on screen is a reproduction of the audiovisual work,
which is a distinct right from the mechanical and synchronisation rights over
the song. It would be incoherent for a product that refuses to publish the
sound to publish the picture that came with it, so `mayShowMasterPicture` is
`mayPublish` plus "there is a picture" — and a `third_party` master's picture
never reaches a frame, not even in a private copy.

**Refused, never substituted.** A layout that asks for the master's picture
and cannot have it renders that panel as the backdrop shows it. Quietly
putting a second take there would be the product choosing an arrangement the
author did not.

**And the master is contained, never cropped**, in both the wide and the tall
form — asserted over the whole layout table rather than on the two rows that
exist today. A take is a person and cropping their edges is fine; the master
is somebody else's composed frame, and cropping it shows them something they
did not make.

**Everything else in §2 and §5–§8 was already built** and was measured rather
than assumed: the quad, Full and Half, live switching on the number keys
(capture-phase, so nothing on the page can swallow a switch mid-song), scenes
as the one primitive that live switching appends to and timeline editing
moves, the three audio modes, alignment against the song, and cutting on the
beat.

## S-28 — The studio, laid out against a benchmark

**A mockup is a measurement, so it was measured.** Three attempts at "match
the benchmark" failed by eye and the fourth succeeded with Playwright bounding
boxes, which named the actual fault in one line: the takes rail sat in an
*outer* grid while the stage and the composition panel sat in an *inner* one,
so the three were never three columns of one row and the timeline **could
not** span the width. Named grid areas fixed it —
`"takes stage panel" / "timeline timeline timeline" / "notes notes notes" /
"transport transport transport"` — and the rail is handed *into* the directing
surface to be placed, because a rail built elsewhere still has to live in this
grid.

**Five slots, filled or not.** The brief names five takes: living room,
studio, beach, stage, landscape. An empty studio used to answer with a
sentence saying there was nothing in it, which tells an author what they
already know. Five numbered slots tell them what the work *is*, and the
numbers are the keys they will press in the transport — so the rail and the
keyboard agree before there is anything to press. More than five and the
column grows; fewer and it still shows five, because the shape of a
performance does not depend on how much of it exists yet.

**A row, not a form.** Each take used to carry its own environment and
treatment pickers, which made a card a hundred and forty pixels tall — five
takes and the rail was a scrolling page. They were also the *second* place to
change the same two fields, and the composition panel is the first. The row
now says what a row is for (who, where, how long) and choosing it points the
panel at that take. Which take that is moved up to the studio, because the
rail is what points at it and two copies of "which take" is two answers to one
question.

**Recording was inside a fold called Set up**, which said a take is something
you arrange once. It is the thing you do five times. It now sits under the
slots beside Upload, because those are the same decision — this take comes
from this camera, or from a file — and stacked they read as a step and an
afterthought.

**The stage was five posters, and you cannot direct with posters.** §7 says
you play the song and switch takes in real time; a still frame of a chorus
tells you nothing about whether it is the chorus you want. `player.attach`
had existed since the player was written and nothing had ever called it. Each
visible panel now registers a `<video>` on mount and unregisters on unmount,
so what is on screen is exactly what is being kept in time with the song and
an off-screen take is not quietly decoding. The poster stays behind it: a take
still assembling has no media, and a black rectangle where a performance
should be reads as a fault. All of them are muted — which audio the finished
video carries is a decision §9 makes at render, and a monitor that mixed the
takes' microphones in would answer that question with the speakers instead of
with the document.

**The volume slider is monitoring, not mixing.** It is a gain node between
the master source and the destination, ramped rather than set so a drag does
not click on every pixel. It is never written to the document and changes
nothing about the render: turning the song down to hear yourself think must
not turn it down in the finished video.

**The transport is three groups, and the middle one is centred in the bar.**
Matching the studio's own column widths would not have centred it — the rail
is 330 and the panel 360, and a centre computed from unequal sides is not one
— so the bar is `1fr auto 1fr` and the keys land under the stage. Half and
double time moved *onto* the snap control, where the number they correct is
printed; they had been the only thing below the transport, which on a laptop
is the first thing off the bottom. Everything else that is said rather than
shown moved above the bar for the same reason.

**Create master takes you to the render rather than starting one.** A master
carries a shape, a rights posture and a list of past renders, and the panel
that holds those is the one place that knows them. A second button that
started a render would be a second place the rights gate could be got wrong.

**Two tabs the benchmark draws are not there.** There is no library page, and
Studio One is a particular conversation rather than a place. A tab that goes
nowhere is a menu that lies, which is the rule that already keeps unmeasured
spaces out of the environment picker (INV-16). What the bar has is where you
came from, where you are, and the one thing at the end of this studio it can
actually reach.

**What this container cannot show.** The take mezzanine is H.264 and the
Chromium here has no H.264 decoder — the stage videos report
`DEMUXER_ERROR_NO_SUPPORTED_STREAMS` while the route answers 206 with
`video/mp4`. The wiring is verified by measurement rather than by picture;
the pictures appear in any ordinary browser.

## S-29 — Footage, and five things the studio could not show

**"Sometimes we would upload videos of the waves in the sea, birds moving and
animals running to add with the music. How do we integrate those ones then?"**

FOOTAGE IS A TAKE, AND THAT IS THE WHOLE DESIGN. A performance is somebody
singing the song; footage is the sea. They share nothing except the thing that
matters: they occupy the same slots in the same layouts, take the same number
keys, sit in the same timeline lanes and are cut into the same scenes. A
second entity would mean a second branch at every one of those places, which
is exactly what U-18 forbids — a slot that had to ask what kind of thing was
filling it would be a code branch wearing a layout's clothes. So the
differences live in fields, and each is enforced where it matters.

**It loops, and that is what makes it usable.** Ten seconds of waves against a
thirty-second chorus is the normal case, not the exception: stock scenery is
short and songs are not. `coverage` takes the song's length and returns all of
it for looping footage, because its own duration says nothing about where it
can go — asking "how long is the clip" to decide "which part of the song may
show it" is asking the wrong file. The renderer gets `-stream_loop -1` before
the input, bounded by the `-t` that follows.

**And the plan gives it an IN point of zero.** Asking where a scene at 1:30
sits inside a ten-second clip gives a frame long past the end of the file.
Scenery is not on the song's clock; it starts when you cut to it. Zero also
makes two scenes on the same footage identical rather than mysteriously
different.

**INV-03 did not know any of this, and said so.** The first plan built over
looping footage was refused: *"take_waves do not reach all of it"*. The
coverage check is the invariant, so the invariant had to learn the song's
length. Found by a test that expected a plan and got a violation — which is
the right way round.

**It is never heard, in any mode.** A clip of the sea has surf on it, a clip
of birds has birds, and a clip of a stadium has a crowd cheering a different
song. Mode B says "the audio captured with the selected video take" and means
the performer's microphone; taking it to mean the seagulls would put them over
the chorus the first time anybody cut to a beach, with no control saying it
had happened. Refused in `audible()` rather than at the picker, because the
picker is not the only way a scene gets a take — a keypress writes one. And
footage can never be the master vocal: mode C is one performance of the song
carried across every picture change, and footage is not a performance.

**It answers the rights question the master answers.** A clip came from
somewhere. A product that refuses to publish somebody else's SONG while
publishing somebody else's PICTURE is not being careful, it is being
inconsistent. `everythingMayBePublished` is `mayPublish` plus every piece of
footage, written as "every one of them permits it" rather than "none forbids
it", so an unrecognised class refuses. The gate is in `buildPerformancePlan`,
where an exportable artefact is described — a check in an interface is one
refactor away from not being in the path.

**And it is matted against nothing.** A plate measures the room a PERFORMER
stands in so they can be cut out of it. There is nobody to cut out of the sea,
and handing footage the room's plate would let somebody composite a beach onto
a beach, keyed against a measurement of their living room (INV-16).

---

**THE STAGE NOW SHOWS THE TAKES, WHICH IS WHAT IT IS FOR.** It had two faults
at once. It drew posters rather than video, and it drew only the scene at the
playhead — so a five-take performance showed one still frame. §7 describes
directing: *"you could have multiple synchronized takes visible
simultaneously... you choose which one is visible at each moment."* There are
now two views. PROGRAM is what the viewer would see. ALL TAKES is the
multiview: every take at once, numbered, on one clock, and clicking a monitor
is pressing its number — the same function the key and the transport button
call. It opens on the multiview whenever there is more than one take, because
a single panel showing a scene you already made is not the view you need to
make the next one. The monitor grid is squarest-first and deliberately NOT one
of the layouts: a layout describes an export, and this describes a desk.
Reusing `performance_quad` would mean a fifth take either vanished or silently
changed the arrangement the author had chosen.

**THE CHROMIUM GAP WAS THE PRODUCT'S, NOT THE CONTAINER'S.** The take
mezzanine is H.264 in MP4, which Chromium built without proprietary codecs
refuses outright. That was reported as an environment quirk and it was not:
Studio One has made a VP9/WebM proxy for every response since U-39, and
Studio Two was serving the mezzanine to five video elements. The worker now
makes the same proxy for every take and `?kind=proxy` serves it, falling back
to the mezzanine when there is none — with the content type set from what is
actually being sent, never from what was asked for. Proved by making proxies
for two existing takes and watching the multiview come up in pictures.

**AND STUDIO ONE IS A PLACE.** It was called "a conversation rather than a
place" in a list of honest gaps, and that was wrong — `/c/[id]` is the
Conversation Studio, with the room people are invited into. The bar now reads
Library / Studio One / Studio Two / Publish, Studio One pointing at the most
recent conversation and saying so when there is none. The library gained a
Performances list at the same time, which was a real gap: start a performance,
lose the tab, lose the performance.

**Three pickers, one shape.** Composition, Background and Effects were
rectangles of whatever height their labels needed, which said three groups
were three different things. They are squares now, and the arrangements carry
short names on the tile with the layout's real label on its title — "One
large, two small" set across five columns wraps to three lines of six-point
type. Effects gained MONOCHROME, the one treatment that is a decision about
the whole picture rather than a correction to it: a black-and-white verse
against colour choruses is an edit, and cutting between the two is something a
performance does.

**A picker may not decide how tall the studio is.** Square tiles are taller
than the rectangles they replaced, and the panel grew past the stage, pushed
the timeline down and put the transport off the bottom of the screen. Both
side columns now stretch to the row — whose height is the stage's, since the
stage is the thing with a fixed 16:9 — and hold their contents in an
absolutely positioned scroller. Arming the camera adds a preview and two
fields to the left column and the timeline does not move.

**What was taken out.** Two paragraphs of reassurance and one instruction. The
headphones warning is the one sentence that decides whether a take is usable,
so it moved onto the Record button's title, where it is read once before the
first take instead of occupying a column that has a screen to fit into. The
rail's compaction had also quietly dropped renaming and deleting a take; both
are back, in the panel, where the chosen take is already being edited — and
not on every row, because a delete button on every row of a list is the one
you press by accident.

## S-30 — The studio, rebuilt against the picture

The benchmark arrived as an image rather than a description, which makes it a
measurement. What follows is what it measured.

**THE BAR AT THE TOP OF THE SCREEN IS THE APPLICATION'S, NOT THE ROOM'S.** It
had been carrying the performance's title as a heading and three buttons on
the right, which is a room labelling itself. It now reads brand, then the five
places, then who you are. CONVERSATIONS and LIBRARY are the same page and two
places in it — the library lists both kinds of work and the tabs land on the
two lists. STUDIO ONE points at the most recent conversation.

**THE TAKES COLUMN LOST EVERYTHING THAT WAS NOT A TAKE.** Five numbered empty
slots, three buttons and a paragraph, none of which is a take and all of which
was in the way of the four that were. It is now a heading with the count, one
button that adds a take, and the takes — with the two less common ways in
(a film of a performance, footage that is not a performance) on one small row
underneath. Removing is on the take, in a `⋯` menu beside it, with renaming:
a `<details>` rather than a floating menu, because that needs no
outside-click handling, no focus trap and no portal, and only one may be open
at a time. Not two buttons on every row — a delete button on every row of a
list is the one you press by accident.

**THE EMPTY SLOTS WERE MY IDEA AND THEY WERE WRONG.** They were meant to state
the shape of the work before the work existed. What they actually did was fill
a column with four rows of nothing next to four rows of something. The
benchmark shows four takes and a count of four, and the count is the honest
version of the same thing.

**EIGHT ARRANGEMENTS, FOUR ACROSS AND TWO DOWN.** There were five, which is a
row of four and a lone tile. Three were added, each of which is a thing a
performance actually does and none of which the picker could express: THREE
ACROSS, for a trio, which is a different statement from one large and two
small; SIX WAYS, the quad's argument one row further; and LEAD AND COLUMN, a
lead with the rest of the band beside them, distinct from `performance_focus`
because nothing overlaps. `performance_half_stacked` is deliberately NOT among
them — it is what Half *becomes* in a tall frame (U-22), not a separate thing
to choose, and offering both would put a decision in front of the author that
the reframe already makes correctly.

**They are drawn rather than named.** A composition tile shows its
arrangement, built from the layout's own rects — so a layout whose panels move
takes its diagram with it, and a diagram can never disagree with what it
renders. "One large, two small" is a sentence you have to parse; a picture of
one large and two small is not.

**And the tests check what the mockup cannot.** The five tiling layouts sum to
exactly one frame and no two of their panels overlap; every reframe target
exists and holds at least as many takes as the arrangement it replaces; no
rect lands outside the frame; slots are numbered from zero with nothing
missing. A seam of backdrop where two panels should meet is invisible in a
picture and obvious in an export.

**Four columns and two rows for the environments, five columns and one row for
the effects**, as the benchmark draws them — and the tiles are a fixed height
per group rather than a forced square. The three groups are different heights
on purpose: a composition tile carries a diagram, an environment tile carries
a picture of the place, an effect tile carries a glyph. Forcing one aspect on
all three made the effects as tall as the environments and pushed the
transport off the bottom of the screen.

**THE TRANSPORT LOST ITS MODE.** There was a button that armed the number
keys, and a mode is a thing you have to remember you are in. The keys are
always live now, which is how every vision mixer that has ever existed
behaves. What the mode was really protecting was typing — a "3" meant for a
take's name must not cut to take three — and that is a question about where
the keystroke went, not about a mode, so it is answered by asking.

**And the two controls that were not transport went to what they are about.**
Half and double time sit on the MASTER SONG lane, because a tempo is a fact
about the song. Starting the edit again sits on the MASTER VIDEO lane, because
it is the one control here that destroys something and it should be where that
something is. What is left is the benchmark's bar: play, where the song is,
how loud it is in the room, the numbered takes, snap, transitions, and the
render.

**A PARAGRAPH OVER A CONTROL IS A LECTURE BEFORE A QUESTION.** Sound had one
explaining that the picture cuts and the sound does not, above three buttons
whose own second lines say the same thing in the words of the choice being
made. Make the video and Share it had the same. All three are gone; what they
said is on the heading that replaced them, for whoever wonders. A studio is a
room you work in, not a page you read.

---

*Appendix S ends. The brief above it is unedited.*

## S-31 — Standing in the room, rather than in front of it

*"What do we do to build now a professional CyberLink-type background and
the environments of best grade?"*

### What was measured first

The matte was never the problem. A take is differenced against a still of
the same room with nobody in it, thresholded at a multiple of that room's
own measured noise, eroded to kill the fireflies, dilated twice to put the
outline back, and feathered. The ffmpeg chain and the six GLSL passes run
the same numbers on purpose. There is spill suppression, and a lighting
adjustment that lets somebody lit for a bedroom sit in a concert stage.

The edge it cuts is clean. **A clean edge is exactly what makes a
composite read as a sticker, because nothing in a real room has one.**

Two things were missing, and both are about light rather than about
geometry:

* a person in a room is **lit by that room**. Some of the wall's colour
  lands on the edge of their shoulder and their hair — that is what a
  camera records, and a cut-out has none of it, so their outline stays
  the colour of the room they were actually standing in; and
* a person in a room **stands on something**. With no shadow they float,
  and the eye reads floating as fake long before it can say why.

A search for `wrap`, `shadow` or `contact` across the matte, the
compositor and the composition domain returned nothing at all.

### Neither of them is a new control

A "light wrap" slider is a thing the operator has to understand, get
wrong, and be blamed for — and §4's whole argument is that the studio
decides the hard parts from what it has already measured.

The room already declares where its light is and how strong it is
(`glow`), and how bright its walls are (`top`, `bottom`). `groundingFor`
derives everything from that:

| | derived from | because |
|---|---|---|
| **wrap** | the light pool's strength and the walls' brightness | a dark stage with one hard spotlight throws less colour than a white room with a window |
| **shadow** | the light pool's strength | a strong light makes a definite shadow, a soft one barely any |
| **direction** | `glow.x` | the shadow falls AWAY from the light; a shadow that ignored the glow would contradict the very backdrop it is drawn on |
| **length** | `glow.y` | a light high in the room puts the shadow under their feet, a low one stretches it out behind them |

So choosing Concert Stage gets a concert stage's wrap and a concert
stage's shadow, and a space added tomorrow is grounded correctly by
existing. Derived rather than stored, so it is deterministic and the shot
cache still means what it says. [U-16, D-19]

Both are clamped. Wrap past about a third eats the performer's own edge;
a shadow past about half is a second person on the floor. This is a
correction, not an effect.

**A blur gets neither, and that is not an omission.** Their own room is
already lighting them, already casting their real shadow, and already the
right colour on their shoulder — it is the one case that was never wrong.
Adding a second shadow to a real one is how a correction becomes an
effect.

**A supplied picture gets the house default**, because it declares no
light of its own. The *colour* of its wrap still comes from the picture,
since the wrap is a blurred copy of whatever is behind them — a beach
wraps sand and a cathedral wraps stone without anybody measuring it. Only
the strength is a guess.

### The one that was silent

Shifting a picture in a filter graph takes a pad and a crop, and the
offset can be negative — Beach lights from the right, so its shadow falls
left, and `dx` is `-51`. `pad` cannot express a negative offset. The
first version padded to the frame's own size at a negative offset, which
does not fail: **the shadow simply does not move**, which looks exactly
like no shadow at all. The canvas now grows by the absolute distance on
both axes and the crop chooses which side of the growth to keep.

It was caught because the test asserts on pixels rather than on the
filter string.

### Measured

Six mutations on the derivation, all six caught. Then the picture itself,
through real ffmpeg, on the fixture whose room is one flat colour and
whose performer is a rectangle of another:

| | sampled | reads |
|---|---|---|
| wrap | just inside the left edge vs the middle of the performer | the sky lands on the edge and not on the middle |
| shadow | under the feet at y=850 vs the same height to the side | **438** against **602** — a quarter of the light gone |
| direction | the left flank vs the far left, same height | darker on the flank, *against* the wash's own gradient toward the light |

Setting either strength to zero fails its own test, so both tests measure
the picture and not the graph.

### And two things the determinism test found

Adding a test that renders one unchanged plan twice and compares the
pixels — the contract `backdropChain` had been claiming in its own
comment, *"deterministic, so the shot cache means what it says"* — showed
it was not true, for two separate reasons.

**`noise` takes a fresh seed every run.** Every drawn space carries film
grain, deliberately: a perfectly clean backdrop behind a camera's own
noise is itself a reason a composite looks pasted. Unseeded, it made two
renders of one plan different pictures. U-16 caches a shot by its plan;
a backdrop that will not render the same twice makes that cache a liar.
The seed is now the space's own id, so each room keeps its own grain and
keeps it for ever.

**`gradients` defaults to `speed=0.01`, and had been slowly rotating.**
Every wash and every light pool in every drawn space has been turning
gently throughout every song since they were built. Nobody asked for it;
it is the filter's default and no value was passed. A drawn room is a
room, and its walls do not rotate. Motion in a backdrop is a decision
somebody should make on purpose, and nobody made this one. Both
gradients are now `speed=0` and seeded, as is the spotlight effect's
lamp in `compose.ts`, which had the same two defaults for the same
reason.

Neither was visible from a filter string. Both were visible the moment
a test compared two renders.

### Still owed

* **The live compositor has the matte and not the grounding.** The six
  shader passes still cut the same clean edge they always did. Online TV
  is a different surface from a rendered master and this is an addition
  rather than a disagreement about numbers, but the two are meant to move
  together and for now they do not.
* ~~**Images as backgrounds.**~~ Done in S-32 below. **Video backdrops
  are still not supported**: `-loop 1` is the single-image flag, and a
  moving backdrop needs `-stream_loop`, its own fps handling, and a
  decision about what happens when the clip is shorter than the take.
* ~~**Depth in the drawn spaces.**~~ Done in S-33 below, except for the
  eyeline: the horizon follows the room's declared depth rather than
  where the performer's eyes are, because the backdrop is drawn before
  anybody knows where they will stand.


## S-32 — The promise made in three places and kept in none of the fourth

*"What about images and videos as backgrounds?"*

### Images were already built

`environment.ts` has told the operator for as long as it has existed:

> The supplied spaces are drawn rather than photographed — stage lighting
> in the colours of the place, not a picture of it. **For a real place
> behind you, use your own image.**

And that image was there to be used. `Environment` carries
`kind: 'custom'` with an `assetId`. `setEnvironment` refuses one without
a picture — *"a custom background needs a picture"*. `compose.ts` loads
the asset, cover-fits it, and runs it through the same difference matte
as every drawn space, with the grounding of S-31 on top of it.

**Studio Two's shelf offered Original, Blur and the drawn spaces, and
never offered a picture.** A sentence, a field, a validation and a
renderer, with no way in — which by this building's own rule is a
capability that does not exist. It is the third time this exact shape has
turned up: `nudgeLyric` (MASTER-EDIT L7), `whyDark` (CHANNEL C-19), and
now this.

### The door

A **Your picture** tile beside Blur, disabled without a plate like every
other replacement, and a shelf of the library's images underneath it when
pressed. The tile's swatch is the chosen picture itself, because a tile
here is a sample of the result and a grey square would be a sample of
nothing.

The library is fetched on the first press rather than with the studio: an
author who never wants a custom backdrop should not pay a request for the
library on the way to the timeline. Only `form: 'image'` rows are offered,
because a song in a backdrop picker is a row that cannot be chosen.

**And it opens under the shelf rather than in a dialog.** Choosing a
backdrop is something an author does while looking at the performer it
goes behind, and a modal over the stage hides the one picture the choice
is about.

### What the browser showed

The labels. An uploaded picture is named by whoever uploaded it — *"Written
here — Live from the control room"* — and at a quarter of this panel's
width that is three wrapped lines under a 56px swatch, clipped by the
bottom of the rail. The fifth time a label has overflowed a tile in this
studio. The label is cut at eighteen characters and the full name stays on
hover, and the grid takes a `maxHeight` because a library grows and the
panel does not.

Verified end to end on a performance whose takes carry a plate, backed up
first and restored after: the tile is present and enabled, the shelf
offers the five images in the library, choosing one writes
`{"kind":"custom","assetId":"asset_c7db…"}` into the take, and the tile's
swatch becomes that picture.

### Videos are not this

`still()` loads a backdrop with `-loop 1`, which is the single-image flag.
A moving backdrop needs `-stream_loop`, its own fps handling, and a
decision nobody has made about what happens when the clip is shorter than
the take — hold the last frame, loop it, or refuse it. That is render
work, not a tile, and it is owed rather than done.


## S-33 — A wash is not a room

*"...and the environments of best grade."*

Three things were missing, and the third was the one that mattered.

### Nothing was in focus, and nothing was out of it

Every drawn space has been rendered pin sharp from edge to edge, which
is the one thing no photograph of a room has ever looked like. A camera
focused on a performer does not also focus on the wall behind them, and
the further back that wall is the less it does.

So `depth` — how far the back of the room is, 0..1 — is now on every
space, and `defocusFor` turns it into a blur. **Stored rather than
derived**, unlike the grounding of S-31, and the difference is worth
stating: everything `groundingFor` needs is implied by the light and the
walls, and this is not. A cathedral and a vocal booth can be the same
colour and the same brightness and be forty metres apart. Nothing
already on the record knows that, so the record has to say it — and it
is required rather than optional, so a space added tomorrow has to
answer the question rather than silently being a cupboard.

Small, though: a cathedral blurred to a smear is a different error from
a cathedral blurred not at all, and the second at least keeps the place
recognisable. It is expressed against the frame's smaller side, so the
same room is the same room at any output size. [D-06]

### Six of the eleven spaces had no floor

Four declared a `band` reaching the bottom of the frame — which is a
floor, drawn as a flat stripe of one colour. One declared a thin sea
line. **The other six were a wash, a light pool, a vignette and some
grain.** A cathedral rendered as a brown gradient is not a cathedral,
and no amount of grain makes a gradient into a place.

The record already told the two kinds of band apart without having been
asked to: Beach's runs from 0.62 for six hundredths of the frame, which
is a horizon; Concert Stage's runs from 0.86 to the very bottom, which
is the ground. `bandIsFloor` reads that difference, a declared floor
keeps its own colour and becomes a gradient rather than a stripe, and a
declared line stays a line.

For the six with nothing, the floor is derived. **Where the line goes is
geometry, not taste**: stand close to a wall and the join is low in the
frame — a lot of wall, little ground — and at the back of a nave it
rises. So it follows `depth`, the one thing the record now knows about
how far away the back of the room is.

### And the floor was invisible until it was lit correctly

The first derivation darkened the wall's own colour at both ends of the
floor. That is wrong in exactly the rooms that needed it most:
**darkening a near-black concert hall by half gives another near-black**,
and the floor was measurable in a pixel and invisible to an eye. The
screenshot said so immediately; no test would have.

A floor is lit from ABOVE. Where it meets the wall it picks up the
room's own light, and it falls away towards the camera — and that join
is what reads as a join rather than as a slightly different black. The
far edge now mixes towards the light's own colour, not towards white, so
a purple stage gets a purple floor and a candle-lit nave a warm one.

### Measured

Nine more assertions on the derivation, and two on the picture through
real ffmpeg:

| | sampled | claim |
|---|---|---|
| floor | the fall from y=700→860 against y=900→1060, at the horizontal centre | the floor falls away more than twice as fast as the wall, which a vignette cannot explain |
| defocus | y=650, 669 and 690 across Beach's hard sea line | the step is a ramp: the middle sample sits strictly between the sky and the sea |

Removing the defocus fails the second; flattening the floor gradient
fails the first.

### Still owed

* **A horizon matched to the performer's eyeline.** The line follows the
  room's depth, not where their eyes are, because the backdrop is drawn
  before anybody knows where they will stand.
* **The dark spaces stay dark.** Concert Stage and City declare near-black
  floors of their own, and those are honoured rather than brightened.
  Their ground is correct and barely visible, which is what a dark hall
  looks like.
* **The live compositor still has the matte and none of this.**

## S-34 — The Background & Virtual Set System, as given

Recorded verbatim, because this is a map to execute against rather than a
note to act on once. The measurement against what exists follows it.

---

> **BalanceVid Background & Virtual Set System**
>
> **1. Current direction: build spatial depth first**
>
> I would take depth in the drawn spaces next, not video backdrops yet.
>
> The progression should be:
>
> Flat background → Spatial environment → Live/video environment
>
> The current renderer should therefore concentrate on making the existing
> drawn environments feel like real spaces.
>
> Spatial cues
>
>     ```
>                         BACK WALL
>                  ┌─────────────────────┐
>                  │                     │
>                  │                     │
>                  │     performer       │
>                  │         ●           │
>                  │                     │
>     ─────────────┴─────────────────────┴────────
>                      HORIZON / FLOOR
>                       ╲             ╱
>                        ╲           ╱
>                         ╲_________╱
>                             FLOOR
>     ```
>
> The scene should support:
>
> Horizon matched to performer eyeline
> Floor/wall transition
> Perspective convergence
> Foreground / midground / background separation
> Depth-of-field treatment
> Subtle spatial lighting
> Performer remains the visual subject
> Set supports the performer rather than competing with them
>
> This should not be manually painted into every background.
>
> Reusable scene metadata
>
>     ```
>     Scene
>     ├── background
>     ├── horizon
>     ├── floor plane
>     ├── performer zone
>     ├── perspective
>     ├── depth
>     ├── lighting
>     └── foreground elements
>     ```
>
> That turns the existing backgrounds into a reusable Virtual Set system,
> rather than a collection of individually decorated pictures.
>
> **2. Video backgrounds remain a separate capability**
>
> Do not let the current renderer silently decide how video backgrounds
> behave.
>
> The video-backdrop question remains an explicit product decision,
> currently deferred to S-32.
>
> When S-32 is taken up, the duration rules should be contextual:
>
>     ```
>     Studio Two → maximum 08:00
>     Online TV  → maximum 01:00:00
>     Take       → no video backgrounds
>     ```
>
> If video backgrounds are eventually implemented, the intended
> short-video behavior can be defined explicitly:
>
> Shorter than the production: loop by default
> Slightly shorter: optionally hold the last frame if configured
> Invalid asset: reject it
> Valid but shorter: never silently refuse it
> Longer than the production: trim to the required duration
>
> Those rules should remain outside the current renderer until S-32.
>
> **3. One underlying video-background asset model**
>
> Do not create separate technical systems for Studio Two and Online TV.
>
> Use one underlying model:
>
>     ```
>     VideoBackground
>     ├── file
>     ├── duration
>     ├── resolution
>     ├── fps
>     ├── thumbnail
>     ├── owner
>     ├── createdAt
>     └── allowedContexts
>     ```
>
> The production context determines what is permitted.
>
>     ```
>                         BALANCEVID
>                      VIDEO BACKGROUNDS
>                              │
>                   ┌──────────┴──────────┐
>                   │                     │
>              STUDIO TWO              ONLINE TV
>              Performance             Channel/Playout
>                   │                     │
>                ≤ 08:00               ≤ 01:00:00
>     ```
>
> **4. Online TV has two different video uses**
>
> This distinction is important.
>
> A video that is allowed to run for one hour does not necessarily mean it
> is being used as a composited background.
>
> **A. Video Background**
>
> The video exists behind a presenter or guest.
>
>     ```
>     Presenter
>         +
>     Moving environment
>         ↓
>     Compositor
>         ↓
>     Programme
>     ```
>
> **B. Full-Screen Video**
>
> The video itself becomes the visual source.
>
>     ```
>     1-hour video
>          ↓
>     Programme
>          ↓
>     Playout
>          ↓
>     Online TV
>     ```
>
> Therefore Online TV should distinguish:
>
> Virtual Background
> Behind a person.
>
> Full-Screen Video
> The video itself is the programme/source.
>
> This will prevent the Online TV media system from being artificially
> constrained by the virtual-background system.
>
> **5. Take is different**
>
> Take participants do not upload backgrounds.
>
> They do not own or manage production backgrounds.
>
> The destination BalanceVid installation provides the available choices.
>
>     ```
>     Take App
>         │
>         │ participation session
>         ↓
>     Destination BalanceVid
>         │
>         └── Approved backgrounds
>               ├── Recording Studio
>               ├── University Hall
>               ├── Concert Stage
>               ├── Modern Room
>               ├── Theatre
>               └── etc.
>     ```
>
> The participant simply chooses from what the destination makes
> available.
>
> Take should therefore not have:
>
> Upload Background
> My Backgrounds
> My Background Library
> Video Backgrounds
>
> The participant contributes themselves, not production assets.
>
> **6. Final background policy**
>
> | Environment | Image / system backgrounds | Virtual Set | Video Background |
> |---|---|---|---|
> | Take | Destination system only | Destination system | No |
> | Studio Two | BalanceVid system | BalanceVid system | No |
> | Online TV | System + production assets | System | Up to 1 hour |
>
> The key architectural principle is:
>
> The destination owns the production environment; Take is the
> participation client.
>
> So if a channel sends someone a Take invitation, that channel's
> BalanceVid installation determines which backgrounds that participant
> can see.
>
> For example:
>
>     ```
>     TAKE INVITATION
>            ↓
>     Destination Channel
>            ↓
>     Available backgrounds
>            ↓
>     ┌─────────────────────┐
>     │ Recording Studio    │
>     │ University Hall     │
>     │ Concert Stage       │
>     │ Modern Room         │
>     │ Theatre             │
>     └─────────────────────┘
>            ↓
>     Participant records
>            ↓
>     Take submitted
>            ↓
>     Destination receives it
>     ```
>
> This keeps Take lightweight, keeps Studio Two focused on performance,
> and gives Online TV the full broadcast-production capability without
> mixing the three responsibilities.
>
> With the current test state already passing, I would make the next
> implementation step the spatial depth/scene-metadata work only. Keep
> video backgrounds explicitly marked S-32 / deferred, rather than
> allowing them to creep into the renderer prematurely.

---

### A note on the numbering

The brief defers video backdrops to **S-32**, and S-32 in this appendix is
*"The promise made in three places"* — the section whose closing part,
**"Videos are not this"**, is where that deferral was written down. The
number is kept as the brief uses it: **S-32 is where the video-backdrop
decision lives**, and nothing below moves it.

### Measured: there are already two scene systems, and between them seven of the eight fields

The brief asks for reusable scene metadata rather than *"a collection of
individually decorated pictures"*. The useful finding is that this
product has **two** environment systems that grew up on opposite sides of
it, and together they almost are the model the brief draws.

`SPACE_LOOKS` is Studio Two's: eleven drawn rooms, rendered server-side
by ffmpeg, carrying a wash, a light pool, a vignette, grain, an optional
band, and — since S-33 — a depth and a floor.

`VIRTUAL_SETS` is Online TV's: four sets, drawn in a browser canvas,
carrying a `spaceId` that points INTO `SPACE_LOOKS`, plus furniture,
a logo region, a lower-third strip, a per-head-count layout, and a
lighting adjustment. Its own header already says the thing the brief
says: *"A reusable scene system rather than a collection of images."*
And it already draws furniture in two passes so that **the bottom of a
presenter disappears behind a desk, exactly as it would in a room** —
which is foreground separation, built, working, and only in the control
room.

| Scene (as the brief draws it) | where it lives today | state |
|---|---|---|
| background | `SpaceLook` wash, glow, vignette, grain | **HAVE** |
| horizon | `band`, and `floorOf().y` for the six rooms that declared none | **HAVE** — S-33 |
| floor plane | `floorOf()`, a receding gradient lit at the join | **HAVE** — S-33 |
| performer zone | `VirtualSet.positions`, a layout id per head count | **HAVE**, control room only |
| perspective | — | **GAP** |
| depth | `SpaceLook.depth`, driving the defocus | **HAVE** — S-33 |
| lighting | `SpaceLook.glow`, `VirtualSet.light` | **HAVE** |
| foreground elements | `VirtualSet.furniture` + `inFront()`, two-pass | **HAVE**, control room only |

So the gap is not eight things. It is **one missing field** and **one
split**: three of the eight exist only on the Online TV side, and
Studio Two's drawn spaces cannot reach them.

### The spatial cues, measured one by one

| asked for | state |
|---|---|
| Horizon matched to performer eyeline | **GAP.** The horizon follows the room's depth. Nothing measures where the performer's eyes are — a grep for `eyeline` finds only audio headroom. The layout box IS known where the backdrop is built (`compose.ts` has `box.w`/`box.h`), so the panel is knowable; what is not known is where in their own frame the person's head sits. That is a measurement of the take, once, in the shape `measurePlate` already uses — not a per-frame estimate, which S-6 rules out |
| Floor/wall transition | **HAVE** — S-33 |
| Perspective convergence | **GAP**, and the one genuinely new field |
| Foreground / midground / background separation | **PART.** The control room's sets do it with furniture in two passes; the drawn spaces have no foreground at all |
| Depth-of-field treatment | **PART.** S-33 defocuses the whole backdrop by the room's depth. There is one plane, not three |
| Subtle spatial lighting | **HAVE** — the light pool, the vignette, and S-31's wrap and shadow |
| Performer remains the visual subject | **HAVE, and load-bearing.** The defocus is deliberately small and the wrap and shadow are clamped, both for this reason |
| Set supports the performer rather than competing | **HAVE** as a stated rule; S-31 and S-33 both cite it |

### What is NOT being built here

Per §2 of the brief, and said plainly so it cannot drift: **no part of the
video-background capability is in this work.** No duration rule, no
`VideoBackground` record, no `allowedContexts`, no loop-or-hold decision.
`still()` still loads a backdrop with `-loop 1`, which is the
single-image flag, and the renderer is not being taught to do anything
else. The rules in §2 and the model in §3 are written down here and
implemented nowhere.

### What §4, §5 and §6 measure to

* **§4, Online TV's two uses.** The distinction is already real in the
  code and was never named: a backdrop goes through
  `Environment`/`compose.ts` behind a person, and a full-screen video
  goes through `ProgrammeSource` and the playout engine as the programme
  itself. They are separate paths already. What is missing is the NAME —
  nothing in the product says "virtual background" and "full-screen
  video" are different things, so nothing stops a one-hour limit written
  for one being applied to the other.
* **§5, Take.** Measured: the Take app offers **no background choice at
  all**. It has no upload, no library, no video — which is what the brief
  says it must not have — and it also has no list of the destination's
  approved backgrounds, which the brief says it should. Half right by
  having been left alone.
* **§6, the policy table.** Nothing in the code expresses it. There is no
  notion of a production context deciding what an environment may be.

### S-34a — Perspective, the one field that existed nowhere

Of the eight fields the brief draws, seven were already somewhere.
`perspective` was the exception, and it is now on the scene.

**Drawn in light, not in lines.** Ruled floorboards converging on a point
would be a drawing of perspective — confidently wrong the moment a take
was shot from anywhere but dead centre. It is the same objection
`spaceArt` already makes about photographing a desk: *"a perspective that
will not match the camera"*. A gradient makes no claim about where the
walls are, and is therefore right at any camera angle.

A real floor is brightest where it runs away to and falls off towards the
near corners, which are closest to the lens and furthest from the room's
own light. **That falloff is the convergence.**

* The vanishing point sits on the horizon the floor already defines, and
  horizontally wherever the space says. `vanishX` is **optional**, unlike
  `depth`, and for the opposite reason: almost every room is seen square
  on, so a required field would be ten spaces all writing `0.5`.
* How hard it converges comes from `depth`. A long nave runs away from
  you and the floor narrows fast; a vocal booth's floor is four tiles.
* It is screened onto the floor strip before that strip is laid down —
  both are the same size there, which `blend` requires, and it keeps the
  light on the floor rather than over the wall above it.
* A space with no floor gets no perspective. Beach's band is a sea
  horizon, not the ground.

#### The test that was backwards

The first version expected the centre-to-edge contrast to GROW towards
the camera, reasoning that a converging plane is narrower near the lens.
It is — but what is drawn here is the light ON that plane, and light
pools where the floor meets the wall and falls away towards the near
corners. Measured: **52 at the horizon against 9 near the camera.** The
picture was right and the expectation was backwards; the expectation was
changed, and the reason is written into the test so the next person does
not re-derive it.

Setting `converge` to zero fails it.

### Still owed after S-34a

* **Horizon matched to performer eyeline.** The horizon follows the
  room's depth. Where a person's eyes sit in their own frame is a
  measurement of the take — once, stored, in the shape `measurePlate`
  already uses — and not a per-frame estimate, which S-6 rules out.
* **The split.** `performer zone` and `foreground elements` exist only
  on the control room's `VIRTUAL_SETS`; Studio Two's drawn spaces cannot
  reach them. One `Scene` over both is the brief's actual ask and is not
  done.
* **Three planes, not one.** The defocus treats the backdrop as a single
  plane at one distance.
* **Video backgrounds.** Untouched, by instruction. §2's duration rules,
  §3's `VideoBackground` record and §4's two Online TV uses are written
  down in S-34 and implemented nowhere.
* **§5 and §6.** Take offers no background at all — neither the uploads
  it must not have nor the destination's approved list it should. No
  production context decides what an environment may be.

## S-35 — One scene, told once

*"The correct next step is not to build another Scene system. It is to
finish the one that already exists by unifying the missing pieces
between SPACE_LOOKS and VIRTUAL_SETS."*

### What was joined

`src/domain/scene.ts` is the shared scene **truth**. It imports
`environment.ts` and `virtualSet.ts`, and neither imports it — which is
the whole reason it is its own file, because `virtualSet.ts` already
reads `environment.ts` for the room behind a set and putting the join in
either would be a cycle.

| Scene | came from |
|---|---|
| background, horizon, floor plane, perspective, depth, lighting | `SpaceLook` |
| performer zone, foreground elements | `VirtualSet` |

**Nothing renders here.** The server chain still draws a space with
ffmpeg filters and the canvas still draws a set with 2D passes, because
those are two different jobs on two different machines and merging them
would be a rewrite in exchange for nothing. Shared truth, not shared
rendering — kept as the brief put it, and `compose.ts` still owns its
own filter graph exactly as before.

### Two things the join had to decide

**The horizon is both kinds of band.** `floorOf` answers null for a band
that is a horizon LINE rather than the ground — Beach's sea line —
because there is no floor plane to draw there. There is still a horizon,
and the eyeline depends on it, so `horizonOf` asks the question the
other way round: the band first, the derived floor second.

**The eyeline is the horizon, and that is not a coincidence.** The
horizon in any photograph sits at the height of the lens, so a person of
roughly the camera operator's height has their eyes ON it. It is the
oldest rule in staging a shot, it needs no new data, and it is the
reference the eyeline measurement will compare a real take against. The
performer zone carries it now, so that work has somewhere to land.

`standsAt` is deliberately NOT the horizon: at the horizon a person is
pressed against the back wall. Halfway down the visible floor is where
somebody stands in a room.

### What Studio Two gained

`compose.ts` resolves the scene once and reads the room from it, instead
of looking the room up twice for itself — once for the backdrop and once
for the grounding — and agreeing by habit. One description, read by the
server renderer and available to the canvas one.

`sceneFor` answers null for a room nobody drew, where `lookFor` threw, so
the render path keeps its old failure explicitly: a plan naming a space
that does not exist is a broken plan, and failing is better than a grey
rectangle. An unknown SET is no set rather than an error, because
`setIdentity` already refuses to store one and refusing twice would take
a channel off the air over a word nobody can see.

### Measured

Eighteen assertions and seven mutations, all seven caught — after the
first sweep included one that was a no-op (`if (x && undefined)`) and
proved nothing, which is worth recording: a mutation that cannot change
behaviour is not evidence of a test, it is evidence of a careless
mutation.

The sharpest assertions are the ones that check the join changed
nothing: a set still answers the room's questions about the room, and a
plain room still has no opinion about head counts.

### Still owed, in the locked order

1. ~~**Studio Two cannot yet NAME a set.**~~ Done in S-36 below.
2. **The eyeline measurement.** Where a person's eyes sit in their own
   frame, measured once from the take in the shape `measurePlate`
   already uses, and compared against the scene's eyeline. Not a
   per-frame estimate, which S-6 rules out.
3. **Three planes, not one.** The defocus still treats the backdrop as a
   single plane.

And **S-34 stays where it is**: no `VideoBackground` model, no duration
policy, no `allowedContexts`, no loop-or-hold rule, no renderer change.


## S-36 — The door, and then the drawing

The scene carried the performer zone and the furniture from the moment
the two systems were joined. Studio Two had nowhere to **ask** for them:
its environment was `{kind: 'space', spaceId}` with no field for a set.
So S-35 wrote no renderer code for furniture nothing could request. This
opens the door and then draws through it, in that order.

### The document

`Environment.setId`, valid only alongside `kind: 'space'` — a set stands
in a room, so it cannot stand in their own room, in a blur, or in a
photograph. `setEnvironment` refuses both mistakes at the door: a set on
the wrong kind, and a set nobody drew. A stored set nobody draws is the
same fault as a stored space nobody drew, and INV-16 already refuses the
second.

It reaches the renderer the way everything else does — carried into the
plan rather than looked up — and it **joins the shot's content address
for free**, because `hashShot` canonicalises the whole shot. Adding a set
to a take re-renders that take and nothing else. [U-16 §3]

### The drawing

`pieceBoxes` turns the same rectangles the canvas draws into the filter
language of the other side. Not a copy of `spaceArt`: the pieces are
shared, only their translation differs, which is exactly what sharing
the scene was for.

**And the ordering is the point.** Risers, screens and bands go down
*with* the backdrop, so the matte composites the performer over them as
it does over the wall. The desk does not — it is drawn *after* the
merge, because the whole difference between a desk and a wall is that
the bottom of a presenter disappears behind it.

### Measured

News Desk's desk is `{ y: 0.72, h: 0.28 }` — y=777 to the bottom of a
1080 frame. The fixture's performer is a rectangle at y=240..840, so the
two overlap between 777 and 840, and that overlap is where the test
lives. At y=540 the performer is still the red rectangle; at y=900 the
red is gone and blue outweighs it, which no amount of performer could
do. Emptying the foreground fails it.

### A guard against nothing, deleted rather than defended

`pieceBoxes` first converted every `#1a222c` to `0x1a222c`, on the belief
that a `#` in a filter graph starts a comment and would silently swallow
the rest of the chain — a missing desk rather than a wrong colour.

**A mutation that removed the conversion survived.** Rather than call
that a gap in the test, the belief was checked directly: ffmpeg drew
`color=#1a222c` as (25, 32, 44), which is the colour. `#` is a comment
in a filter SCRIPT FILE, not in an inline graph. The conversion guarded
nothing, so it is gone — the seventh unobservable guard this product has
deleted rather than written a test around.

## S-37 — The eyeline, and the room moving to meet it

*"Eyeline belongs to the relationship between the performer and the
scene, not simply to the background image."*

Which is why it is the last of the four and not the first: there was
nowhere to put it until the scene existed and could state its own
horizon.

### The match

**The horizon in any photograph sits at the height of the lens.** So a
person whose eyes are on the drawn horizon is standing in that room, and
one whose eyes float above it is standing in front of a picture of it.

Of the two things that could move, **the drawn room is the one nobody
recorded** — so the room moves. `sceneOf` takes an optional measured
eyeline and puts its horizon there, and the floor and the perspective go
with it. A room whose eyeline was matched and whose floor stayed where
the depth put it would have two horizons — the one the eyes sit on and
the one the ground meets — which is worse than either alone, because the
eye believes the ground.

### The measurement

Split the way `measurePlate` is: the thinking in `src/domain/eyeline.ts`,
where a silhouette is a line of code, and the pixels in
`src/render/eyeline.ts`, which is four lines of filter and no decisions.

A row profile is how much of each row differs from the empty room. The
crown is the first row with a person in it; the chin is where the
silhouette steps wider; and the eyes are halfway between — the oldest
proportion in drawing a face, and true enough of everybody that it beats
trying to find an eye, which at probe resolution is a few pixels of
nothing in particular.

**One frame, a second in.** Past a slate, still cheap, and S-6 rules out
anything per-frame: a singer sways, and a backdrop whose horizon followed
them would be a room moving against a person standing still.

**Measured when a plate is attached**, which is the first moment both
halves exist — and as a job, because the web tier never runs ffmpeg
(U-23) and attaching a plate must not wait on a decode. Nothing is
blocked on it: until it lands the scene keeps the horizon its depth gives
it.

**Failing is not a fault.** A take shorter than the probe, a plate that
will not read, a performer out of frame — all mean no eyeline, and no
eyeline means the room keeps its own horizon.

### Two things the mutations found

**A collar is not a pair of shoulders.** The chin was found as the first
row a good deal wider than the head so far, with a comment claiming that
beat comparing against the row above because *"hair and a collar both
make a single row jump"*. A mutation swapping the two rules survived —
and checking why showed the comment was false of **both**: against a
head of ten with one row of nineteen in it, each rule called that row the
shoulders and missed the real ones eight rows down. Shoulders are wide
and **stay** wide, so the step now has to hold for three rows. The
sentence is true now rather than merely written down.

**A fixture that tested nothing.** The speckle test put a stray value of
`Math.floor(100 * 0.015) - 1` in a row — which is zero. A mutation
removing the floor entirely changed nothing and survived. The fixture now
uses one pixel in a hundred, which is above zero and below the floor,
which is what the test was always supposed to say.

### And one comment corrected rather than defended

The filter thresholds before it shrinks, and the comment said it had to,
or *"a dark shirt against a dark wall would vanish before it was
compared"*. A mutation swapping the order survived — because an area
average of a **uniform** difference is that same difference, so for solid
shapes, which is what a person mostly is, the order cannot matter. It
would matter for detail finer than the shrink, and nothing tests that, so
the comment no longer claims it. The order is kept because it is the
matte's own.

### The sequence is complete

| | |
|---|---|
| S-33 | depth, floor, defocus |
| S-34a | perspective |
| S-35 | the scene, told once |
| S-36 | Studio Two names a set and draws its furniture |
| S-37 | the eyeline, and the room moving to meet it |

**S-34 is untouched throughout**: no `VideoBackground` model, no duration
policy, no `allowedContexts`, no loop-or-hold rule, no renderer change.

## S-38 — Two boundaries, measured before merging

No feature was added here. Two questions were asked and answered, which
is what the branch needed rather than more of it.

### A. Can the live compositor consume the shared scene, or would it need a second model?

**It can consume it. Giving it grounding is a second TRANSLATION, not a
second model.**

What the live path receives today: `LiveCompositor.draw` takes
`(video, plate, composition, panel, now, {cutout})`. `Composition` is
backdrop, key and frame — the matte's inputs. It does not carry depth,
floor, perspective, wrap or shadow, because those did not exist when it
was written.

What draws the room there is **`paintSpace` in `spaceArt.ts`**, on a 2D
canvas, and it is already the direct analogue of `backdropChain`: wash,
then light pool, then band, then vignette and grain, in that order, with
a comment pointing at the filter chain's own `blend=screen` to say so.
Two translations of one description, already cross-referencing each
other.

And the live path **already draws furniture in two passes** —
`useBroadcastMixer` calls `paintSet(…, 'behind')` before the people and
`paintSet(…, 'front')` after them. The ordering S-36 added to the server
has been in the control room all along.

So the work, when it is taken up, is:

| | where | analogue that already exists |
|---|---|---|
| floor, perspective | `paintSpace` | canvas gradients ↔ `gradients` + `blend=screen` |
| defocus | `paintSpace` | canvas `filter: blur()` ↔ `gblur` |
| wrap, shadow | `MERGE_FS` | it already carries `uLight` and `uSpill`; these are the same kind of uniform |
| the scene itself | `paintSpace(look)` → `paintSpace(scene)` | the join S-35 already made |

**Nothing here needs a live-only grounding model.** `scene.ts` is a
domain module and the browser can import it, which was the point of
putting the join in its own file.

### B. Do the sets hold their shape when Studio Two is not 16:9?

Rendered — News Desk, through the real server chain, with a performer
whose geometry is written into the fixture — at **16:9, 4:3, 1:1 and
9:16**.

| | person across the frame | person's span | screen sits at |
|---|---|---|---|
| 16:9 | 25% | 0.38–0.62 | 0.56–0.96 |
| 4:3 | 33% | 0.33–0.67 | 0.56–0.96 |
| 1:1 | 44% | 0.28–0.72 | 0.56–0.96 |
| 9:16 | **79%** | **0.11–0.89** | 0.56–0.96 |

**What holds at every shape**, and can be closed: the desk occludes the
performer (crown 0.113, lowest visible 0.719, desk top 0.720, at all
four); the floor, the band, the horizon and the defocus all render; the
performer is never clipped by an edge; nothing becomes disproportionate,
because a piece is a fraction of the frame and scales with it.

**What does not hold**, and is a finding: the **screen is set dressing
placed for a frame the presenter occupies a quarter of.** As the frame
narrows the presenter grows across it — 25% to 79% — and by 1:1 the
screen is behind their shoulder, by 9:16 it is a sliver. Nothing is
broken, clipped or misdrawn. The set element the viewer is meant to see
is simply behind the person.

**A first pass at this measured only the vertical and found all four
shapes identical.** That was an artefact of the test: height was held at
1080 and the source is 16:9, so the vertical scale factor was 3 in every
case and nothing could have differed. The test was measuring its own
setup. The horizontal is where the shapes actually differ.

### Classification

| | |
|---|---|
| desk occlusion, floor, band, horizon, defocus, clipping, proportion | **works across shapes — closed** |
| wall dressing behind the presenter at narrow shapes | **shared scene model insufficient — extend S-35** |
| anything video | **S-34, untouched** |

### What extending S-35 would mean

Not four separately tuned layouts, which is the answer the scene exists
to avoid. The gap is precise:

`PerformerZone` says where the ground is (`standsAt`), where the eyes
are (`eyeline`) and which arrangement holds N people (`positions`). It
does **not** say how WIDE the performer occupies the frame — and a
`Piece` is an absolute rect, authored against one aspect, with no way to
say *"on the wall beside the presenter"* rather than *"at x 0.56"*.

Those two together are the whole finding. A piece that could be placed
relative to the performer zone, and a performer zone that knows its own
width at the current aspect, would let one set hold its composition at
any shape — which is what the brief asked the scene to be for.

## S-39 — The boundary, and what the next piece is

PR #43 ends here. Recorded so the next piece starts from a decision
rather than from a reconstruction.

### Closed

| | |
|---|---|
| depth, floor, defocus | S-33 |
| perspective | S-34a |
| the scene, told once | S-35 |
| Studio Two names a set and draws its furniture | S-36 |
| the eyeline, and the room moving to meet it | S-37 |
| desk occlusion, floor, band, horizon, defocus, clipping and proportion across 16:9, 4:3, 1:1 and 9:16 | S-38 |
| whether the live compositor needs its own scene model | S-38 — **it does not** |

### Held

**S-34, the video capability.** No `VideoBackground` record, no duration
policy, no `allowedContexts`, no loop-or-hold rule, no renderer change.
Untouched through six sections, which was the point of naming it.

**The live compositor's grounding.** The finding is that this is *a
second translation, not a second model* — `paintSpace` is already the
canvas analogue of `backdropChain`, and `useBroadcastMixer` already
draws furniture in two passes. When it is taken up it consumes
`scene.ts`; it does not get a parallel scene.

### The next piece: relational placement and performer occupancy

Not a responsive-layout failure. Everything structural held at all four
shapes. The problem is **semantic**: the screen is authored as an
absolute wall rectangle while the performer grows from a quarter of the
frame to four-fifths of it.

Two concepts are missing, and both belong to the scene rather than to
any renderer.

**1. `PerformerZone` needs occupancy.** It establishes the ground, the
eyes, and the arrangement for N people. It does not establish *how much
of the composition the performer may occupy* — and that must be a
scene-level concept rather than four aspect-ratio-specific hacks.

**2. `Piece` needs relational placement.** Today a piece says where it
is:

    x = 0.56
    y = ...
    width = ...
    height = ...

It does not say what it is relative to. The wall screen wants something
closer to:

    Piece
    └── placement
         ├── relation: beside-performer
         ├── side: right
         ├── clearance
         ├── preferred zone
         └── scale behaviour

The renderer then resolves the actual rectangle from the current
composition. That is fundamentally different from:

    if 9:16 then move screen left
    if 1:1 then shrink screen
    if 4:3 then ...

which is the four-tuned-layout answer the scene exists to avoid.

### The shape it leaves

                        SCENE
                          │
              ┌───────────┴───────────┐
              │                       │
        PerformerZone               Pieces
              │                       │
       ground / eyes             relational placement
       N-person arrangement      beside / above / etc.
       occupancy                  clearance / scale
              │                       │
              └───────────┬───────────┘
                          ↓
                  Composition shape
                          ↓
                 resolved geometry
                          ↓
                  Studio / Live

**The scene describes spatial relationships; the renderer resolves them
for the actual frame.**

### One note on how this was found

The corrected horizontal measurement is the evidence for the whole
abstraction, and the first attempt would have hidden it: measuring only
the vertical held the very dimension that changes the composition
constant, and reported all four shapes identical. A test that varies
everything except the thing under test reports success and means
nothing.

## S-40 — Where an element belongs, not where it was drawn

*"Describe where an element belongs in the scene, not where it happened
to be drawn in one frame."*

The extension S-39 named, and the two concepts it named, built.

### Occupancy

`PerformerZone` said where the ground is, where the eyes are, and which
arrangement holds N people. It said nothing about **how much room a
person needs** — which is the one thing every other element in the scene
has to work around.

`occupies` is not an estimate. S-38 rendered News Desk at four shapes
and read the performer's span off the pixels: **25% at 16:9**. That is
the number.

`occupiesAt` turns it into what the current frame gets. A take is
cover-fitted into its panel, so a frame narrower than the one it was
shot in crops the sides away and magnifies what is left: the same person
fills more of a narrower frame. A wider frame changes nothing, because
cover crops the top and bottom there instead.

**The arithmetic was written to explain the measurement, not the
measurement taken to confirm the arithmetic:**

| | measured (S-38) | derived |
|---|---|---|
| 16:9 | 25% | 0.250 |
| 4:3 | 33% | 0.333 |
| 1:1 | 44% | 0.444 |
| 9:16 | 79% | 0.789 |

### Relational placement

A `rect` says where something is. It does not say what it is relative
to. `Placement` does — `relation`, `side`, `clearance`, `scale`,
`atLeast` — and `placedFor` resolves it against the frame in front of
it.

**The answer is not four layouts.** *"If 9:16 move it left, if 1:1
shrink it"* is a table that grows a row per shape anybody ships in, each
tuned by hand and each able to be wrong on its own.

### The regression the first version caused

The first resolver pushed every placed piece **fully clear** of the
performer — and moved News Desk's screen from `x 0.56` to `0.65` at
16:9, correcting the one frame the sets were actually drawn for.

That screen sits sixty-five thousandths **behind** the presenter's
shoulder on purpose: a set element tucked slightly behind somebody reads
as a room, and one held at arm's length reads as a diagram. The
relationship was already right; what changes is only how far the
performer's edge has travelled since.

So **the gap it was drawn with is the relationship, and it is kept**:

| | performer | screen | |
|---|---|---|---|
| 16:9 | 0.38–0.63 | 0.56–0.96, w 0.40 | **exactly as authored** |
| 4:3 | 0.33–0.67 | 0.60–1.00, w 0.40 | pushed, full width |
| 1:1 | 0.28–0.72 | 0.66–1.00, w 0.34 | shrunk into what is left |
| 9:16 | 0.11–0.89 | 0.83–1.00, w 0.17 | a strip beside them, not behind |

A piece with no `placement` comes back untouched — a band across the
floor is a fact about the frame, and only an element whose meaning is
*"beside the presenter"* has anything to resolve. A piece there is no
longer room for is **dropped**: squeezed to a stripe it is not a smaller
version of itself, it is a mark nobody can read.

### Measured

Fourteen assertions, seven mutations, all seven caught — after the
second weak fixture of this kind was found the same way.

**The fixture that proved nothing, again.** *"A piece with no
relationship comes back as authored"* was asserted on News Desk's band,
which is authored at `x: 0` — so a mutation moving every unplaced piece
to zero changed it not at all and survived. The claim is now checked
across every set at three shapes, and asserts that at least one of the
pieces it checked was somewhere a move would have shown. Stage's riser
sits at 0.1, and that is the piece the claim needed.

Twice now a fixture has passed while testing nothing, and both times the
mutation found it rather than the test suite. That is the argument for
the sweep, not for the assertion count.

### Where this leaves the live path

`placedFor` is in the domain, so the canvas renderer can call it the
moment it takes up grounding. It is not called there yet, and that is
not a gap for the control room: Online TV is 16:9, where the resolver
returns every piece exactly as authored.

## S-41 — The live path becomes a consumer of the scene

*"The live compositor simply needs to become a consumer of the shared
semantics when grounding is taken up."*

S-35 built one scene description and S-38 drew the line under it: *"the
objective is shared scene truth, not shared rendering implementation."*
Studio Two's ffmpeg chain has read that description since. The two live
surfaces — the WebGL compositor that puts a participant in a drawn room,
and the 2D canvas that draws the station's own set sixty times a second
into the stream the encoder is taking — read the raw `SpaceLook` and
drew five of the eight things a scene is.

### What the measurement found

Three renderers, one room, rendered side by side at 1280×720 and read
back off the pixels. Four findings, and only the first one was the
feature:

**One. The eyeline was measured and never drawn.** `sceneOf` moves the
room's horizon to where a performer's eyes actually are — the whole of
S-37, because a person whose eyes sit on the drawn horizon is standing
in that room and one whose eyes float above it is standing in front of a
picture of it. `backdropChain` then called `floorOf(look)` for itself
and drew the floor back where the room's own depth had put it. Concert
Stage with an eyeline of 0.40 measured rendered its horizon at 0.86, in
every frame ever exported. The measurement was taken, stored, planned
with, and thrown away one call from the pixels.

**Two. The live shader drew the room upside down.** `v.y` is zero at the
bottom of what a viewer sees; every number a room states is a fraction
DOWN the frame. Concert Stage's stage lip was across the ceiling and its
lighting rig was on the floor. Modern Room came off the chain at 210 at
the top and 90 at the bottom, and off the shader at 85 and 164. It
survived because a wash flipped is still a wash and a centred vignette
is symmetrical: the only parts of a drawn room that say which way is up
are the band and the glow.

**Three. The pool of light was an ellipse.** A distance taken in uv is a
distance in a square, so on a 16:9 frame the light pool came out half
again as wide as it was tall — a window-shaped lamp in every room, where
the thumbnail beside it and the export behind it both draw a circle.

**Four. The first frame of every plate-keyed broadcast had no matte.**
`upload` asked for its texture before choosing a texture unit, and
creating a texture binds it — so uploading the take to unit 0 and the
plate to unit 1 left the plate bound to unit 0 as well, on the one frame
where both were new. The difference matte differenced the plate against
itself and came back empty. It corrects itself from the second frame,
which is why nobody reported it and everybody saw it.

Numbers one and four are faults in shipped behaviour. Two and three are
faults nobody could name while there was nothing to compare against;
putting the three renderers side by side is what made them sayable.

### `groundPlan`, and why the arithmetic moved

`floorOf` and `perspectiveOf` answer in fractions of the frame, which is
right: a set works at 1280×720 and at whatever an export asks for.
Turning those fractions into the strip of pixels a renderer fills was
written once, inside the ffmpeg chain, and the canvas and the shader
were both about to write it again. Three copies of one piece of
arithmetic is three chances to disagree about where the floor is, and
the one thing a floor must do is be in the same place in every picture
of the same room.

`groundPlan(scene, width, height)` is the shared answer: the top of the
strip, how deep it is, its two colours, and the point the light runs
away to with the corner it has fallen off by. Rounded once, there, so
the two renderers cannot land a pixel apart on the same horizon. It
reads the SCENE, which is finding one above.

This is still not shared rendering. The chain fills the strip with
`gradients`, the canvas with `createLinearGradient` and the shader with
a `mix`, because those are three different machines. What none of them
does any more is work out where the strip goes.

### What the live path gained

The room: the floor, the perspective and the defocus, in both live
renderers.

The defocus is translated rather than copied, and the comment says so.
The chain blurs the whole backdrop before the vignette and the grain. On
an analytic picture that blur lands nowhere except on the two drawn
edges — a wash has no detail to lose — so the shader softens those edges
with a `smoothstep` the width of the blur, and the canvas draws the room
on a slate and blits it back through a real `filter: blur()`, grown by
three sigma on every side so the blur's own faded border falls outside
the frame.

The performer: the light wrap and the contact shadow, which the export
has had since S-6 and the air had neither of. Present exactly where
`matteChain` has them — a drawn space, never an original or a blur,
whose own room is already lighting them correctly. The softening is a
weighted two-ring sample rather than a separable gaussian, which is two
framebuffers and two draws saved per person per frame, and is honest for
the two things it is used on: a contact shadow is a presence rather than
a shape, and a light wrap is the room's colour averaged over most of a
shoulder. Neither has detail a better blur would preserve.

And `paintSet` calls `placedFor`, which S-40 left in the domain waiting
for exactly this.

### What the live path still has not got

A person composited onto a VIRTUAL SET comes back from the shader as a
cutout with an alpha, because the set is the studio and is drawn once
for the whole frame rather than four times in four panels. The 2D canvas
owns that composite, and the shader cannot reach the pixels behind them
to darken or to sample. Wrap and shadow therefore apply to a
participant's own drawn room and not to a set. That is a gap, it is
named here, and it is not covered by pretending otherwise.

The light pool is the one thing left that the export and the air draw at
different sizes, and saying where that stood took a second measurement
because the first was wrong.

**What was claimed, and was not true.** This record said *"the two live
surfaces now agree with each other"* on the strength of a probe that was
not measuring the pool. The probe room declared a depth and no band, so
`floorOf` gave it a derived floor at 0.80 — and the vertical run down
from the lamp stopped at the floor's edge rather than at the pool's.
A room with a band the colour of its own wash, high and thin, has no
floor plane and nothing else in the frame, and that is the probe the
question needed.

**And it found a second canvas bug.** `paintSpace` faded its pool to
`rgba(0,0,0,0)`, which is the obvious way to write "and then nothing"
and is the oldest trap in a 2D gradient: a stop carries a COLOUR as
well as an alpha, so the pool darkened towards black as it thinned.
Faded to the glow's own colour at zero alpha it thins and does nothing
else. On the clean probe the canvas and the shader now read within one
part in 255 of each other at every distance from the lamp, where before
they were half as far apart as either was from the chain.

**What remains, measured.** A white lamp at strength 0.9, centred, on a
flat 40-grey wash with the vignette off, read along the row through it:

| pixels from the lamp | export | canvas | shader |
|---|---|---|---|
| 0 | 232 | 233 | 233 |
| 160 | 142 | 194 | 194 |
| 320 | 50 | 155 | 155 |
| 400 | 39 | 135 | 135 |
| 630 | 39 | 80 | 79 |

The export's lamp is spent by about 390 pixels. The live one is still at
a third of its peak at the edge of the frame, and reaches nothing at
about 794 — 0.62 of the longer side, which is what both live surfaces
ask for. The chain hands `gradients` two points 734 pixels apart and
gets an effective radius of roughly half that; what ffmpeg does with
those two points is its own business, and the number that matters is the
390 it draws.

So the export's lamp is about half the size of the air's.

### The lamp, decided and shared

Asked which size the shared scene should state, the answer was **the
export's, about three tenths of the longer side**. Taking it turned the
last open number into a fifth finding, and it is the one that most
deserved looking at.

**The export's pool was never "a pool to the corner".** The chain named
the frame's corner as the far end of its radial gradient —
`x1=width:y1=height` — and that is one past the last pixel in both
axes. Handed a coordinate off the end, `gradients` returns a radius
with no relation to the geometry. The same rule, measured:

| lamp at | distance to the corner | what it drew |
|---|---|---|
| 640, 360 | 734 | 393 |
| 640, 216 | 815 | 364 |
| 358, 216 (Modern Room) | 1051 | **84** |
| 832, 396 (City) | 553 | **584** |

A rule under which the furthest lamp gets the smallest pool is not a
rule. Given a second point that is a real pixel inside the frame the
gradient reaches zero at exactly that distance — 199 for 200, 382 for
384, 498 for 500 — so the three renderers can be told the same thing.

`lampOf(scene, width, height)` is that thing, and it is shaped like
`groundPlan` for the same reason: a circle stated as its centre and a
point on its edge, because one renderer draws it from two points and
two draw it from a radius.

**Along the longer axis, away from the nearer edge**, which is not a
preference but the only choice that always works: a lamp anywhere on
that axis has at least half of it less a pixel on one side, and half
beats three tenths for any frame wider than three pixels. So there is
never a case to clamp and never a reach that quietly came out smaller
than it was asked for.

**And a test caught what I had not thought of.** A room is free to
declare its glow at the very edge, `Math.round(1 × 720)` is 720, and
720 is one past the last row — the same off-the-end coordinate, moved
from the edge of the circle to its centre. The lamp is clamped to a
real pixel now because a fixture put one at each of the nine corners
and midpoints of three differently shaped frames and asked.

All three renderers, measured on the clean probe after the change:

| pixels from the lamp | export | canvas | shader |
|---|---|---|---|
| 0 | 232 | 232 | 233 |
| 160 | 152 | 152 | 152 |
| 320 | 71 | 72 | 71 |
| 400 | 39 | 39 | 39 |

One room, three renderers, one lamp.

**And it broke a test, correctly.** *"Lets the room light the edge of
the person standing in it"* probed the performer's LEFT edge. Beach
lights from `glow.x` 0.72 — to the RIGHT of a performer who spans 720
to 1200 of a 1920 frame — so the light lands on their right, and the
assertion passed only because the old pool had no real radius and
washed the whole frame. Given a lamp with a size, the far edge fell to
a lift of nine against a threshold of ten.

The claim was right and the pixel was on the wrong side of the person.
It now reads the near edge, and says the thing the old one could not:
the near edge is lit more than the far one — 51, 44 and 33 in the
middle — which is what "the ROOM lights them" means rather than "their
outline glows".

### The record

Seventeen assertions on `groundPlan`, `lampOf` and the chain they feed.
Seventeen mutations, sixteen caught; the one survivor — reading
`perspectiveOf(scene.background)` instead of `scene.perspective` —
cannot be caught, because of the three fields a perspective has the
scene moves only the horizon and the plan reads the other two. That is
written into the code beside the line rather than defended with a test
that proves nothing.

One fixture had to be sharpened again. *"A floor at the very bottom
edge"* was written at `y: 0.999`, which rounds to 719 of 720 and leaves
a strip one pixel deep — so the guard against a strip of nothing and its
absence agreed, and the mutation survived. At `y: 1` the strip rounds to
zero, and the guard is worth having because the renderers disagree about
it: ffmpeg is asked for a gradient of `1280x0` and the export fails
outright, while the shader skips a floor of no depth and draws on.

All eleven rooms render byte-identical through the chain with no eyeline
measured, which is the proof that moving the arithmetic moved nothing
else.

**S-34's video capability remains untouched.** No `VideoBackground`, no
duration policy, no `allowedContexts`, no loop-or-hold rule, no renderer
change.
