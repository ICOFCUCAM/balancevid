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
  takes that line up and takes that nearly do.
- Alignment is stored as `offsetSamples` **and** `rateRatio`, so drift is a
  correction rather than a defect.
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

*Appendix S ends. The brief above it is unedited.*
