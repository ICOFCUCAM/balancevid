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

Prof Class records those decisions onto the master timeline.

So you are essentially directing the music video live.

Then:

Create Master Video

And Prof Class renders the result.

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

When recording Take 2, Take 3, etc., Prof Class should know:

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
into the Conversation Studio. It gives Prof Class a second major identity:
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

---

*Appendix S ends. The brief above it is unedited.*
