# BalanceVid — Product Doctrine

**Status:** Canonical. This document is the constitution of the product.
**Version:** 1.0 · **Adopted:** 2026-09-22

---

## Status of this document

This is the founding map of the product, preserved **in full and unabridged**.
Nothing in Part I has been summarised, compressed, reordered, or removed.

Where the map left a decision open, or where implementing it literally would
produce an amateur result, an **upgrade note** is inserted inline, immediately
after the section it concerns. Upgrade notes never replace the map — they
resolve it.

Formatting only: the original text arrived with duplicated empty code fences
around each diagram. Those have been normalised into single fences. No words
were changed.

### How to read this document

| Marker | Meaning |
|---|---|
| Part 0 | The charter. Outranks everything below it. Binding. |
| Part I, §1–§52 | The map. Canonical. Verbatim. Binding. |
| `⬆ UPGRADE U-nn` | A necessary upgrade to the map, applied inline. Binding. |
| Part II, `D-nn` | Cross-cutting doctrine the map implies but does not house in any one section. Binding. |

### Amendment rule

Part I may only be **extended**, never contradicted. If implementation
experience proves a section of the map wrong, the correction is written as a
new upgrade note under that section, stating what it supersedes and why. The
original text stays. The product must always be able to show its own reasoning
history — the same principle the product sells to its users.

Part 0 was adopted after the map was reviewed. It does not contradict the
map; it states what the map turned out to be about. Where the two appear to
conflict, Part 0 decides and the conflict is recorded as a new upgrade note.

---
---

# PART 0 — THE CHARTER

*Adopted 2026-09-22, after review of the map and its upgrades. The charter sits
above the map. Where anything in this document is unclear, the charter decides.*

---

## The product, in one sentence

> **A conversation editor for recorded media: interrupt a video at any moment,
> respond, resume exactly where it stopped, repeat throughout the source, and
> publish the resulting conversation as video, article, or interactive
> manifest.**

This sentence is binding. It is the test for whether a proposed feature belongs
in the product: if it does not serve this sentence, it is someone else's
product.

## What this product is

Not a tool for making reaction videos.

> **A system for creating, editing, publishing, and preserving structured
> conversations around video.**

---

## INV-00 · The Representation Rule

**The Conversation is the canonical artifact. Every video, article, manifest,
caption track, clip, chapter list, and export is a representation of the
Conversation.**

This is the master invariant. It outranks every other rule in this document,
including the ten non-negotiables in D-01, which it heads.

Its purpose is structural: it is what prevents the product from decaying into a
pile of disconnected features. Without it, the video pipeline and the article
pipeline drift apart, the manifest grows its own data model, captions become a
separate asset with a separate truth, and within two years there are four
products sharing a logo.

**Operationally this means:**

```
No feature may introduce a second source of truth.
No representation may hold data the Conversation does not.
No representation may be editable except through the Conversation.
Every representation must be regenerable, from scratch, at any time.
Deleting every representation must lose nothing.
```

A representation that cannot be thrown away and rebuilt is not a
representation — it is a fork, and it is a defect.

---

## The canonical architecture

```
                 CONVERSATION
                      │
          ┌───────────┴───────────┐
          │                       │
     MEDIA TIMELINE          KNOWLEDGE LAYER
          │                       │
          │              transcript / claims
          │              responses / evidence
          │              citations / chapters
          │                       │
          ▼                       ▼
     VIDEO RENDER             ARTICLE
          │                       │
          ▼                       ▼
       MP4 / WEB              HTML / PDF / etc.
```

The Conversation has two faces. The **media timeline** is what it sounds and
looks like. The **knowledge layer** is what it means. Both are projections of
one document; neither is authored directly.

Do not build the video and the article as separate products. **Build the
Conversation once, then render representations of it.**

The Conversation Manifest (U-01) is a third representation on the same footing,
not a special case. The vertical clip set (U-22), the publication bundle
(U-30), the caption sidecars (U-19), and the chapter list (U-39) are all
representations. This list will grow. The rule does not change.

---

## The five locked principles

These were locked following review. They are not proposals.

### 1. The interruption is the fundamental unit

Not a clip. Not a reaction. An **Interruption**.

Every interruption has:

```
source frame
source timestamp
source sentence
response media
response duration
response type
layout
captions
annotations
evidence
```

That is the fundamental data object. Everything else in the system is
composition, projection, or presentation of it.

### 2. Frame-exact continuity is non-negotiable

```
cut_out_frame == resume_in_frame
```

The product promise is: **when you interrupt the speaker, you return to exactly
where the speaker stopped.** Not approximately. Not "around 14:32." Exactly.

This is an invariant (INV-02), not an aspiration. The burned-in frame-counter
test (D-10) turns a subjective editing requirement into something CI verifies
on every build. A build that cannot prove frame-exactness does not ship.

### 3. Audio is part of the product, not post-production polish

A technically perfect visual edit still feels terrible if the source is loud
and the commentary is quiet, if microphone noise appears without warning, if
room tone changes, if cuts click, if voices jump in volume.

Audio is a first-class render layer:

```
SOURCE AUDIO
      ↓
speaker normalization
      ↓
COMMENTARY AUDIO
      ↓
speaker normalization
      ↓
ducking
      ↓
de-click
      ↓
master
      ↓
−14 LUFS
```

The user should never need to understand any of this. They should simply get:

> *"It sounds like one professionally produced conversation."*

### 4. The one-key interaction defines the MVP

The user is thinking while watching. The interface must not ask them to stop
thinking in order to operate it.

Not: move mouse → find button → click → select mode → start recording.

Instead:

```
SOURCE PLAYING
       ↓
SPACE
       ↓
SOURCE PAUSES
TIMESTAMP CAPTURED
RECORDING STARTS
       ↓
USER SPEAKS
       ↓
SPACE
       ↓
RECORDING STOPS
SOURCE RESUMES
```

**The MVP acceptance test:** *Can someone watch a video without taking their
attention away from it and create an interruption using one key?*

If yes, the core interaction works. If no, nothing else in this document
matters.

### 5. The pre-roll is invisible and non-negotiable

The application continuously maintains:

```
          rolling buffer
<------------------------>
         8 seconds
              ↓
         INTERRUPT
```

So when the user starts speaking —

> *"Wait, wait, wait — this is important..."*

— the recording does not begin eight seconds too late. The system preserves the
preceding buffer and trims it intelligently during editing.

Users will not know this feature exists. They will notice immediately when it
does not.

---

## The roadmap, stated as questions

```
MVP   Can I have the conversation?
V2    Can I preserve and publish the conversation?
V3    Can the system help me understand and develop the conversation?
```

**MVP — the core conversation engine.** Class A source, upload, playback,
frame-indexed interruption, 8-second pre-roll, one-key interaction,
webcam/microphone, crash-safe recording, captions, frame-exact resume, audio
normalization and mastering, conversation timeline, server-side FFmpeg, final
MP4.

**V2 — analysis and distribution.** YouTube Class B, Conversation Manifest,
evidence attachments, article transcript, searchable conversation, richer
transcript interaction, annotations, claim/statement linking, publishing
formats.

**V3 — intelligence and collaboration.** AI claim detection, research
assistance, fact-checking assistance, AI-assisted response drafting,
collaborative conversations, multiple commentators, advanced evidence graph,
deeper publishing ecosystem.

This supersedes the phasing in §49–§51 and in Appendix B, which remain on
record as the reasoning that produced it.

# PART I — THE MAP

## Interactive Video Commentary & Conversation Platform

### Working concept

A video platform that allows a user to watch any supported video, interrupt it at precise moments, respond to specific statements, explain, question, challenge, criticize, teach, or add context, and then continue the original video.

The application records every interruption as a structured timeline event and ultimately combines the original video and the user's interventions into a single polished video that can be exported and published.

The fundamental idea is:

Watch → Interrupt → Respond → Continue → Interrupt → Respond → Continue → Compose → Publish.

This creates a new type of video creation experience: a conversation between the creator and an existing video.

---

## 1. The Problem

Today, someone who wants to make a detailed response to a video generally has to use a conventional video editor.

The workflow is cumbersome:

1. Watch the source video.
2. Remember where something important happened.
3. Stop watching.
4. Open an editor.
5. Find the timestamp.
6. Cut the video.
7. Record commentary.
8. Insert the commentary.
9. Find the next point.
10. Repeat.
11. Synchronize everything.
12. Add captions.
13. Render the final video.

Traditional editors think in terms of:

clips → tracks → cuts → transitions

But the user thinks:

"I want to stop this person here and respond to what they just said."

The proposed application is designed around the second mental model.

---

## 2. The Core Concept

The application treats the source video as a speaker.

The user becomes the responding speaker.

The timeline becomes their conversation.

For example:

```
SOURCE VIDEO
00:00 ─────────────── 04:32
                         │
                         ▼
                    INTERRUPT
                         │
                         ▼
USER RESPONSE
"Let's stop here. There is an important
problem with what he just said."

                         │
                         ▼
SOURCE VIDEO
04:32 ─────────────── 09:18
                         │
                         ▼
                    INTERRUPT
                         │
                         ▼
USER RESPONSE
"This statement needs some context..."

                         │
                         ▼
SOURCE VIDEO
09:18 ─────────────── 14:51
```

The user does not need to manually edit these cuts.

The application understands the conversation structure.

---

## 3. The Product's Central Object: The Conversation

Every project is a Conversation.

For example:

Conversation:
 My Response to "The History of Europe"

Inside the conversation:

```
Source Video
      │
      ├── Segment 1
      │
      ├── Interruption 1
      │
      ├── Segment 2
      │
      ├── Interruption 2
      │
      ├── Segment 3
      │
      ├── Interruption 3
      │
      └── Segment 4
```

The user is therefore not editing a conventional video timeline.

They are building a conversation timeline.

---

## 4. Starting a Project

The user selects:

Create New Conversation

Then chooses:

**Option A — YouTube**

Paste:

```
https://youtube.com/watch?v=XXXXXXXX
```

The application identifies the video and creates the source.

**Option B — Upload Video**

The user uploads:

```
MP4
MOV
WebM
etc.
```

The application processes the file.

**Option C — Other supported sources**

The architecture could later support additional legitimate video sources.

<!-- UPGRADE -->
### ⬆ UPGRADE U-01 · The Two Source Classes

**Necessity.** §4 offers YouTube and upload as if they were interchangeable. They are not, and treating them as equivalent is the single decision most likely to kill this product — either technically (the render fails) or legally (the platform is liable). §46 raises the concern but does not resolve it. This upgrade resolves it.

An embedded YouTube player does not give the application access to frames or audio samples. It cannot be drawn into a canvas, piped to a render worker, or muxed into an MP4. Extracting the stream anyway violates YouTube's Terms of Service and exposes both the user and the platform. Therefore the product cannot produce a single composed MP4 containing embedded third-party footage. Pretending otherwise produces a product that demos and then fails.

**Doctrine.** Every Source belongs to exactly one class, decided at the moment it is added, and the class determines which export modes are available. The class is never hidden from the user.

```
CLASS A — GOVERNED SOURCE
  Origin:   user upload, or a direct file/HLS URL the user has rights to
  Access:   full frame and sample access
  Export:   COMPOSED  — one polished MP4 containing source + responses
            COMPANION — also available
  This is the product's flagship path.

CLASS B — EMBEDDED SOURCE
  Origin:   YouTube, Vimeo, or any provider whose official embed we honour
  Access:   playback only, through the provider's own player
  Export:   COMPANION ONLY
            (a) RESPONSE REEL — a composed MP4 of the user's own material,
                with freeze-frames the user captured, annotations, captions,
                evidence, and the claim being answered shown as typography.
                Contains no provider footage.
            (b) CONVERSATION MANIFEST — a shareable player page that drives
                the provider's official embed and cuts to the user's
                responses at the recorded timestamps. The viewer sees the
                full conversation; the provider serves their own video,
                keeps their analytics, and their monetisation is intact.
```

The Conversation document is **identical** in both classes. Only the render target differs. A Class B conversation upgrades to Class A losslessly the day the user supplies a governed copy of the source — the interventions, timestamps, types, annotations, and evidence all carry over untouched, and the composed render simply becomes available.

**This is a feature, not a limitation.** The Conversation Manifest is a format the incumbent editors cannot produce at all: a living response that stays attached to the original, cannot be accused of stealing it, and keeps working when the source is updated. State it in the UI in those terms.

**Enforcement.** The render planner refuses a COMPOSED plan whose source is Class B. This is a hard invariant asserted in code, not a UI convention — see D-09.
<!-- /UPGRADE -->

---

## 5. Source Processing

Once the source is loaded, the application processes it.

It can generate:

* video metadata
* duration
* audio track
* waveform
* transcript
* sentence segmentation
* timestamps
* speaker segmentation where possible
* chapters
* scene changes
* key frames

The transcript becomes especially important.

For example:

```
00:00
Welcome everyone.

00:04
Today we're going to discuss...

00:11
The first thing we need to understand...

00:19
This happened because...
```

Each sentence has a timestamp.

<!-- UPGRADE -->
### ⬆ UPGRADE U-02 · Ingest Normalisation Is Mandatory

**Necessity.** §5 lists what to *extract* from a source but not what to *guarantee* about it. Real-world uploads carry variable frame rate, rotation metadata, non-standard pixel formats, multi-channel or zero-channel audio, and sparse keyframes. Concatenating such material with ffmpeg produces drifting audio, frozen frames, and green flashes at every cut. This is the most common way a video product ships something that looks broken.

**Doctrine.** No asset — source or response — enters the timeline until it has been normalised to the **house format**:

```
HOUSE FORMAT (mezzanine)
  container   MP4 (faststart)
  video       H.264 High, yuv420p, constant frame rate 30 fps
              closed GOP, keyframe every 1s, rotation baked in
  audio       AAC-LC, 48 kHz, stereo, 192 kbps
  duration    probed and stored explicitly, never inferred
```

Both the original upload and the normalised mezzanine are retained. The original is the user's property and the evidence of authenticity; the mezzanine is what the render engine is permitted to touch. Renders never read originals.

A dense keyframe interval is what makes §9's frame-exact resume cheap. Ingest normalisation is not a cleanup step — it is the precondition for every promise this document makes about precision.
<!-- /UPGRADE -->

<!-- UPGRADE -->
### ⬆ UPGRADE U-03 · The Transcript Is a Three-Level Structure

**Necessity.** §5 says "each sentence has a timestamp," and §11–§12 require selecting *part* of a sentence. Sentence-level timing cannot support that. If the transcript is built sentence-only, §12 becomes unimplementable and has to be retrofitted later at the cost of re-transcribing every source in the system.

**Doctrine.** Transcripts are stored at three levels from day one:

```
word     → text, start, end, confidence, speaker
sentence → word span, start, end, speaker, chapter
paragraph→ sentence span, topic label
```

Word-level timing is what makes §12 (highlight a fragment), §24 (word-synchronised captions), §43 (research search with exact jump points), and §39 (chapters) possible. It costs nothing extra at transcription time — every serious ASR engine emits it — and it is expensive to add afterwards. Capture it now.

Every transcript records `engine`, `model`, `language`, and `confidence`, and is versioned. A re-transcription never destroys the prior version, because interventions are anchored to it (see U-05).
<!-- /UPGRADE -->

---

## 6. The Main Workspace

The central workspace could have four major areas.

```
┌────────────────────────────────────────────────────────────┐
│ PROJECT NAME                         SAVE     EXPORT        │
├───────────────────────┬────────────────────────────────────┤
│                       │                                    │
│ SOURCE TRANSCRIPT     │          VIDEO PLAYER              │
│                       │                                    │
│ 00:00 Welcome...      │                                    │
│ 00:04 Today...        │                                    │
│ 00:11 First...        │                                    │
│ 00:19 This happened.. │                                    │
│                       │                                    │
│                       │                                    │
├───────────────────────┴────────────────────────────────────┤
│                                                            │
│                CONVERSATION TIMELINE                       │
│                                                            │
│ SOURCE ─────────●──────────────●───────────────●────────    │
│                 │              │               │            │
│               Reply 1        Reply 2         Reply 3       │
│                                                            │
├────────────────────────────────────────────────────────────┤
│ ▶ Play   ⏸ Pause   ✋ Interrupt   🎙 Record   ↩ Continue   │
└────────────────────────────────────────────────────────────┘
```

---

## 7. The Interrupt Button

This is the defining feature.

While the source video is playing:

User presses:

INTERRUPT

The application immediately:

1. pauses the source
2. records the exact timestamp
3. creates an interruption event
4. opens the response interface
5. optionally freezes the source frame
6. starts recording the user's response

For example:

```
Source timestamp:

14:32.481
```

The application records:

```
INTERVENTION #7

Source start:
14:32.481

Source resume:
pending

Response:
pending
```

<!-- UPGRADE -->
### ⬆ UPGRADE U-04 · Pre-Roll — The Interrupt Must Never Clip the First Words

**Necessity.** §7 says recording starts when the button is pressed. In reality the user reacts, *then* presses, and `getUserMedia` plus `MediaRecorder` need 200–900 ms to produce the first usable frame. The opening words of the most important sentence in the response are lost. Every user learns to compensate by pausing awkwardly before speaking, and every response acquires a dead second at the front. That single detail is the difference between a tool that feels professional and one that feels like a prototype.

**Doctrine.**

1. **The capture device is warmed on project open, not on interrupt.** The camera and microphone stream is acquired and held live (preview muted) the moment the workspace loads, with explicit user consent and a permanently visible recording-state indicator.
2. **A rolling pre-roll buffer is always running.** `MediaRecorder` runs continuously in a discard loop retaining the last **8 seconds**. Pressing INTERRUPT promotes that buffer into the take. The user can therefore press the button *after* they have started reacting and still keep what they said.
3. **The response's usable start is a trim point, not a hard edge.** The take is stored with its pre-roll intact; `mediaIn` marks where it currently begins. Trimming is non-destructive and reversible — the user can always recover speech from before the press.
4. **INTERRUPT is bound to a hardware-speed path.** The keyboard binding (Space, plus a configurable global shortcut) pauses the source and stamps the timestamp synchronously, before any React render, any network call, or any UI transition. Nothing may sit between the keypress and the timestamp.

The product's claim is "stop the video at the exact moment." Pre-roll is what makes that claim true rather than aspirational.
<!-- /UPGRADE -->

<!-- UPGRADE -->
### ⬆ UPGRADE U-05 · Anchors — Interventions Survive Re-Transcription and Re-Encoding

**Necessity.** §7 stores an intervention at `14:32.481`. §11–§12 additionally bind it to a sentence. But transcripts get re-run with better models, and sources get replaced with higher-quality copies (this is exactly the Class B → Class A upgrade in U-01). A bare timestamp or a bare `sentence_id` breaks: the sentence IDs change, and the user's careful work detaches from what it was answering. Losing that binding destroys the product's core value, which is not the video but the *link between claim and reply*.

**Doctrine.** Every intervention carries a **composite anchor**, and every field in it is independently sufficient for recovery:

```
anchor {
  t_source        14:32.481      exact media time, authoritative for render
  frame           26049          frame index at house fps, authoritative for cuts
  sentence_id     s_0417         current binding, may be re-mapped
  word_span       [3112, 3126]   word-level, survives sentence re-segmentation
  quote           "the policy was clearly successful"
  quote_hash      sha256(...)    fuzzy re-locate after re-transcription
  transcript_ver  3              which transcript this anchor was made against
}
```

On re-transcription the system re-locates each anchor by quote match within a time window, records a confidence, and **never silently moves an intervention**. Anchors that cannot be re-located with high confidence are surfaced to the user for confirmation. The rule is absolute: the system may lose a *binding*, but it may never fabricate one.
<!-- /UPGRADE -->

---

## 8. Recording the Response

The user can choose how to respond.

**Camera response**

The user appears on camera.

```
┌─────────────────────────┐
│                         │
│       YOUR CAMERA       │
│                         │
│                         │
└─────────────────────────┘
```

**Voice response**

Only the user's voice is recorded.

**Picture-in-picture**

The original video remains visible while the user appears in a smaller window.

**Side-by-side**

```
┌─────────────────┬─────────────────┐
│                 │                 │
│ ORIGINAL        │ YOUR RESPONSE   │
│                 │                 │
└─────────────────┴─────────────────┘
```

**Full-screen response**

The source disappears temporarily and the user's response fills the screen.

**Screen response**

The user can display:

* browser
* document
* PDF
* image
* chart
* presentation
* website

while explaining.

<!-- UPGRADE -->
### ⬆ UPGRADE U-06 · Takes, and Never Losing One

**Necessity.** §8 and §17 assume a response is a single recording that can be re-recorded. But people fumble the first attempt at a difficult argument, and a re-record under §17 destroys the previous try. Worse: if `MediaRecorder` output is only uploaded when recording stops, a tab crash, a browser update, or a closed laptop lid at minute nine of a ten-minute explanation loses all of it. A creative tool that can lose work is not a professional tool.

**Doctrine.**

1. **An intervention holds many takes; one is selected.** Re-recording appends a take and switches the selection. Takes are never deleted implicitly. The user can audition and switch back at any time.
2. **Recording streams to durable storage while it records.** `MediaRecorder` emits timesliced chunks; each chunk is persisted immediately — to IndexedDB locally and to object storage as a resumable multipart upload. A crash costs at most one timeslice.
3. **Every take is recoverable after a crash.** On reopening a project, orphaned chunk sets are detected, reassembled, and offered back to the user as recovered takes.
4. **The local copy is authoritative until the remote copy is verified.** Local chunks are only released after the server confirms the assembled asset's checksum.

§34 already says recordings are stored as independent media assets. This upgrade makes that survivable.
<!-- /UPGRADE -->

---

## 9. The User Says "Continue"

After finishing the response, the user presses:

CONTINUE SOURCE

The application:

1. stops the user's recording
2. stores the response
3. closes the interruption
4. returns to the exact source timestamp
5. resumes playback

So:

```
SOURCE
12:00 ───────── 15:43
                   ↓
                PAUSE
                   ↓
USER
15 seconds
                   ↓
              CONTINUE
                   ↓
SOURCE
15:43 ───────── 20:17
```

This is extremely important:

The original video does not restart.

It continues from precisely where it was interrupted.

<!-- UPGRADE -->
### ⬆ UPGRADE U-07 · Frame-Exact Resume

**Necessity.** §9's promise — resume from precisely where it was interrupted — is the product's contract with the user. Browser `video.currentTime` is not frame-accurate, and ffmpeg's `-ss` on a stream copy snaps to the nearest keyframe, which can be seconds away. Implemented naively, the rendered cut lands somewhere other than where the user pressed the button, and the resumed segment either repeats a phrase or swallows one. Users notice this immediately and they do not forgive it.

**Doctrine.**

1. The authoritative cut unit is the **frame index at house fps**, not seconds. `frame = round(t_source × fps)`; the timestamp is derived from the frame for display, never the reverse.
2. Because ingest guarantees a keyframe every second (U-02), a cut is at worst 30 frames from a keyframe. Segments are cut with **accurate seek and re-encode at the boundary**, stream-copying the interior. Precision where it matters, speed everywhere else.
3. **Cut-out and resume-in are the same frame index.** The outgoing segment ends at frame N−1; the incoming segment begins at frame N. Not one frame of the source is duplicated or dropped. This is asserted by an automated test on every build (see D-10).
4. Audio is cut on the same boundary with a **2 ms equal-power crossfade** to prevent the click that a hard sample cut produces mid-waveform.

The user's mental model is "I stopped him mid-sentence and he picks up mid-sentence." The render must honour that literally.
<!-- /UPGRADE -->

---

## 10. Multiple Interruptions

The process can repeat indefinitely.

For example:

```
SOURCE
00:00 → 03:18

RESPONSE 1
03:18 → 03:57

SOURCE
03:18 → 08:41

RESPONSE 2
08:41 → 10:12

SOURCE
08:41 → 13:22

RESPONSE 3
13:22 → 14:04

SOURCE
13:22 → 19:51
```

The application automatically maintains the relationship between all these segments.

<!-- UPGRADE -->
### ⬆ UPGRADE U-08 · Two Clocks, Never Confused

**Necessity.** The example in §10 is the clearest statement of the product's central structure and also the clearest illustration of its central hazard: `SOURCE 03:18 → 08:41` follows a response that occupied `03:18 → 03:57`. The same number means two different things depending on which clock is meant. Every bug in a product of this shape comes from mixing them up.

**Doctrine.** Two clocks are named, always distinguished in code, in the schema, and in the UI:

```
SOURCE TIME    t_source   position within the original video
OUTPUT TIME    t_output   position within the final rendered video
```

The timeline is the ordered mapping between them. It is derived, never hand-maintained:

```
t_output = Σ(durations of everything before this item)
```

Naming rule, enforced in review: any variable, column, or field holding a time
carries its clock in its name (`t_source`, `t_output`, `source_in`,
`output_start`). A bare `time`, `start`, or `timestamp` is a defect.

**Derived state is never stored as truth.** `timeline_segments` is a
materialised projection of the Conversation document, rebuilt from it and
discardable. The document holds intention; everything else is computed. This
is §33 applied structurally.
<!-- /UPGRADE -->

---

## 11. Sentence-Based Interruption

This could be one of the strongest features.

Instead of waiting for the exact moment, the user can click a sentence.

For example:

```
SOURCE TRANSCRIPT

12:41  The government introduced the policy in 2019.

12:48  This resulted in significant economic growth.

12:55  Therefore, the policy was clearly successful.
```

The user clicks:

"Therefore, the policy was clearly successful."

The application jumps to that sentence.

Then:

[Interrupt here]

The user responds.

This creates an intervention attached to a specific statement.

<!-- UPGRADE -->
### ⬆ UPGRADE U-09 · Interrupt After the Sentence, Not On It

**Necessity.** §11 jumps to the sentence and interrupts there. But a user who wants to answer "Therefore, the policy was clearly successful" wants the audience to *hear that sentence first*, then hear the rebuttal. Cutting at the sentence's start removes the claim from the final video and the response answers something the viewer never heard.

**Doctrine.** A sentence-anchored intervention defaults to cutting at the sentence's **end** boundary, and the UI says so plainly: *"They finish the sentence, then you reply."* The word-level transcript (U-03) supplies an exact end. The user may override to cut mid-sentence, which is offered as "cut them off" — a deliberate rhetorical choice, correctly framed as such.

For Class B sources the same rule sets the manifest's cut point.
<!-- /UPGRADE -->

---

## 12. Highlighting a Statement

The user could select part of a sentence:

"the policy was clearly successful"

Then the application creates:

```
SOURCE CLAIM

"The policy was clearly successful."

YOUR RESPONSE

"I don't think that conclusion follows from
the evidence presented..."
```

This creates a very powerful relationship:

Source statement → response

<!-- UPGRADE -->
### ⬆ UPGRADE U-10 · The Claim–Response Pair Is the Product's Signature Object

**Necessity.** §12 identifies the relationship but treats it as a UI affordance. It is more than that. The claim→response pair is the smallest unit of value this product creates, and it is the unit that travels: as an on-screen quote card in the render (§24), as a chapter title (§39), as a search result (§43), as the anchor for evidence (§44), as the node in the conversation map (§21), and — critically — as a self-contained shareable clip.

**Doctrine.**

1. The pair is a **first-class, addressable, quotable object** with a stable ID and its own permalink.
2. Every pair can be exported alone as a short vertical clip: *the claim, then the reply.* This is the product's native distribution unit and its growth mechanism. One conversation yields a dozen shareable artefacts, each linking back to the full exchange.
3. The quoted claim is rendered as **typography derived from the verified transcript**, never as paraphrase, and always carries its source attribution and timestamp. For Class B sources this is what makes the Response Reel substantive without containing provider footage.
4. A claim quote in the final render is never editable free text. It is bound to `quote_hash` (U-05). The user may shorten a quote using ellipsis at token boundaries; they may not alter its words. **A product whose purpose is holding people to what they said cannot let its users misquote them.** This is an integrity invariant, not a preference.
<!-- /UPGRADE -->

---

## 13. Types of Interruption

Every intervention could have a type.

**Explain**
"Let me explain what he means here."

**Critique**
"There is a problem with this argument."

**Correct**
"That information is inaccurate."

**Context**
"There is additional historical context..."

**Question**
"But what about this?"

**Agree**
"I actually agree with this point."

**Expand**
"There is another important issue..."

**Fact Check**
"Let's verify this claim."

**Counterargument**
"Here is the opposing argument."

**Personal Experience**
"I experienced this differently."

**Teaching**
"Let me explain this concept."

The type becomes metadata on the intervention.

<!-- UPGRADE -->
### ⬆ UPGRADE U-11 · Type Drives Presentation

**Necessity.** §13 ends with "the type becomes metadata," which risks the types being decorative. Metadata that changes nothing is abandoned by users within a week.

**Doctrine.** The type is **load-bearing**. Each type carries a presentation profile that the render engine consumes:

| Type | Accent | Default layout | Lower-third | Default transition |
|---|---|---|---|---|
| Explain | neutral | full-screen user | "EXPLANATION" | soft cut |
| Critique | warm | side-by-side | "CRITIQUE" | hard cut |
| Correct | high-contrast | freeze-frame + user PiP | "CORRECTION" | hard cut |
| Context | cool | PiP over frozen source | "CONTEXT" | soft cut |
| Question | cool | full-screen user | "QUESTION" | soft cut |
| Agree | affirmative | PiP | "AGREED" | soft cut |
| Expand | neutral | full-screen user | "FURTHER" | soft cut |
| Fact Check | alert | freeze-frame + evidence panel | "FACT CHECK" | hard cut |
| Counterargument | warm | side-by-side | "COUNTERARGUMENT" | hard cut |
| Personal Experience | warm-soft | full-screen user | "MY EXPERIENCE" | soft cut |
| Teaching | cool | screen share + user PiP | "TEACHING" | soft cut |

Because type drives layout, a user who never opens the layout panel still gets a video that looks deliberately art-directed. **This is the mechanism by which the product produces a polished result from a user who only pressed INTERRUPT and spoke.** That mechanism is the difference between this product and a screen recorder.

Every default remains overridable per intervention (§17) and per project (§23). Types are a closed vocabulary — user-defined types are a v3 concern, because an open vocabulary cannot drive a design system.
<!-- /UPGRADE -->

---

## 14. Annotation Mode

Sometimes speaking isn't enough.

The user pauses the video and selects:

Annotate

Then they can:

* draw circles
* underline
* highlight
* point
* add arrows
* add text
* blur something
* zoom into a region

Example:

```
       ┌───────────────────────┐
       │      SOURCE VIDEO     │
       │                       │
       │      ┌─────────┐      │
       │      │ CLAIM   │ ←────┤
       │      └─────────┘      │
       │                       │
       └───────────────────────┘

"Look at this statement."
```

The annotation becomes part of the interruption.

<!-- UPGRADE -->
### ⬆ UPGRADE U-12 · Annotations Are Vector, Timed, and Resolution-Independent

**Necessity.** §14 describes drawing on the video. If annotations are captured as rasterised pixels from the editing canvas, they are locked to the editor's display size: they blur at 1080p, break entirely at 4K, and cannot be reflowed for the vertical export §29 promises. They also cannot be edited afterwards, contradicting §17.

**Doctrine.**

1. Annotations are stored as **vector primitives in normalised coordinates** (0–1 relative to the source frame), with a type, style, and z-order. They render crisply at any output resolution and reflow correctly under §29 reframing.
2. Every annotation has its **own timing relative to the intervention** — `appear`, `dwell`, `dismiss` — so a circle can be drawn *as the user says the word*, rather than being present for the whole take. This one detail is the visible difference between a broadcast explainer and a webcam recording.
3. Drawing is recorded with **stroke timing**, so a hand-drawn circle can animate on at the speed it was drawn. Free, and it reads as production value.
4. `zoom` and `blur` are annotations too: `zoom` is an animated crop on the source layer; `blur` is a tracked mask. Blur is also a **privacy tool** and must be usable on faces, addresses, and documents.
5. Annotations remain editable objects forever. They are never baked into a media asset — only into a render (§30).
<!-- /UPGRADE -->

---

## 15. Freeze Frame

The user can say:

"Stop right here."

The application captures the exact frame.

Then the user can talk over the frozen frame.

This is useful for:

* charts
* documents
* screenshots
* presentations
* diagrams
* maps
* facial expressions
* visual evidence

<!-- UPGRADE -->
### ⬆ UPGRADE U-13 · The Freeze Frame Is the Bridge Between Class A and Class B

**Necessity.** §15 presents freeze frame as a convenience. Under U-01 it is structural: a captured still is how a Class B conversation shows what is being discussed without redistributing the provider's video. It is also the only visual the Response Reel has to work with.

**Doctrine.**

1. A freeze frame is captured at the exact frame index of the anchor (U-05, U-07) and stored as a still asset with its provenance: source ID, frame, timestamp, capture time.
2. Freeze frames are **annotatable** (U-12) and **zoomable** — the Ken Burns move over a frozen chart while the user explains it is the single highest-value visual in an analysis video, and the product should produce it automatically when a freeze frame is held longer than a few seconds.
3. For Class B sources, a freeze frame is subject to the fair-use/quotation posture recorded in D-08: brief, transformative, attributed, and always accompanied by the user's commentary. The system stamps attribution onto the frame in the Response Reel automatically and does not allow it to be removed.
<!-- /UPGRADE -->

---

## 16. Transcript Synchronization

The transcript should stay synchronized with playback.

As the source speaks:

```
00:31
We need to understand the historical context...
```

The current sentence is highlighted.

When the user presses Interrupt, the transcript freezes at that location.

The application knows:

```
Source:
00:31.84

Sentence:
"We need to understand the historical context."

Intervention:
#4
```

This creates a searchable intellectual record of the conversation.

<!-- UPGRADE -->
### ⬆ UPGRADE U-14 · The Intellectual Record Is a Product, Not a Byproduct

**Necessity.** §16's closing line — "a searchable intellectual record of the conversation" — is, on reflection, one of the most valuable sentences in this entire map, and the map does not act on it. Everything else here produces a video. This produces a *document*: a structured, timestamped, quotable record of claims and responses.

**Doctrine.** Every conversation renders in **two formats**, always, from the same document:

```
THE VIDEO       the composed MP4 (§22)
THE TRANSCRIPT  a structured, citable, linkable article:
                every source claim, every response, in order,
                each with its timestamp, its type, its evidence,
                and a deep link into the video at that moment
```

The article version is SEO-indexable, screen-reader accessible, quotable in text, readable in two minutes where the video takes forty, and it is what makes the work *citable* by journalists, academics, and teachers. It costs almost nothing to generate because the document already contains every field it needs.

This is the feature that changes the product's category from "reaction video tool" to "instrument of public reasoning." Treat it as a headline feature, not an export option.
<!-- /UPGRADE -->


<!-- UPGRADE -->
### ⬆ UPGRADE U-40 · The Article Quotes; It Does Not Reproduce

**Necessity.** Discovered while building U-14. "A structured, timestamped,
quotable record of claims and responses" has an obvious naive implementation:
print the source transcript and interleave the responses. That implementation
is wrong twice over.

Legally, it turns every conversation into a full textual copy of someone else's
video — the opposite of the proportionate, transformative use the product's
whole architecture is arranged to produce (U-35 §3). A response that is 95%
someone else's words is as weak in text as it is on screen.

Editorially, it buries the argument. A reader who wanted the source's
transcript would read the source's transcript.

**Doctrine.** The article prints **the author's own words in full** and quotes
**only the statement being answered** — the bound claim (U-10), or, where the
author bound none, the single sentence at the anchor.

```
IN FULL      every response, transcribed from the author's own take,
             trimmed to what they chose to keep
QUOTED       the claim being answered, verbatim, with its timestamp
NEVER        the source's transcript as a body of text
```

This is the same proportionality the composed video already embodies, applied
to the written representation. **The article is a document of an argument, not
a copy of a video with remarks attached.**

The stated source-to-response ratio (U-35) appears in the article's header for
the same reason it appears in the editor: it is a signal the author should see.
<!-- /UPGRADE -->

---

## 17. Editing an Intervention

After recording, the user should be able to edit each intervention independently.

For example:

```
INTERVENTION #4

Source timestamp: 00:31.84

Type: Critique

Duration: 01:43

[Edit]

[Trim]

[Re-record]

[Replace]

[Delete]

[Add Caption]

[Change Layout]
```

The user doesn't have to recreate the entire project.

---

## 18. The Conversation Timeline

The timeline should visually distinguish:

**Source**

```
████████████████████████
```

**User**

```
          ▒▒▒▒▒▒▒
```

**Annotation**

```
                  ▲
```

**Text explanation**

```
                         T
```

For example:

```
SOURCE  ███████████████       ███████████████████       ███████
                         │
RESPONSE                 ▒▒▒▒▒▒▒
                                           │
RESPONSE                                   ▒▒▒▒▒▒▒▒
```

The user can drag boundaries if they want to modify timing.

---

## 19. Conversation Logic

Internally, every project could be represented approximately as:

```
Conversation
│
├── Source
│
├── Segment 001
│
├── Intervention 001
│   ├── sourceTimestamp
│   ├── sourceSentence
│   ├── type
│   ├── media
│   ├── duration
│   └── layout
│
├── Segment 002
│
├── Intervention 002
│
├── Segment 003
│
└── ...
```

This makes the system fundamentally different from a flat video editor.

---

## 20. AI Layer

AI should be useful, but not become the product itself.

The core product should work without AI.

AI can enhance it.

**Automatic transcription**

Convert source speech into timestamped text.

**Sentence detection**

Identify natural interruption points.

**Topic detection**

```
00:00 Introduction
03:14 Historical background
08:22 Main argument
14:31 Evidence
21:04 Conclusion
```

**Claim extraction**

AI could identify statements that may deserve attention:

```
Potential claim:

"The policy reduced unemployment by 30%."

[Jump to claim]
```

**Fact-check assistance**

The user can ask:

"Help me examine this claim."

AI provides research/context, which the user can then decide whether to include.

**Response assistance**

The user could say:

"Help me formulate a response to this."

AI can help structure the response.

But the user remains the creator.

<!-- UPGRADE -->
### ⬆ UPGRADE U-15 · The AI Boundary, Stated as an Enforceable Rule

**Necessity.** §20's "the user remains the creator" is the right principle but it is a sentiment, and sentiments erode under product pressure. Within a year someone will propose generating the response audio in the user's cloned voice, and there will be a good growth argument for it. The boundary has to be written down now, while it costs nothing to hold.

**Doctrine.**

```
AI MAY          read, transcribe, segment, index, search, summarise,
                surface claims, retrieve sources, check facts against
                references, suggest structure, draft text the user then
                speaks or edits, generate captions, propose chapters,
                propose layouts.

AI MAY NOT      speak in the user's voice.
                generate a response the user did not say.
                alter a source quote.
                alter what the user recorded themselves saying.
                assert a fact-check verdict as the product's own.
```

Every AI output is **labelled, attributed to its model, and requires an explicit human accept** before it enters the document. Every AI-derived field records `model`, `version`, `prompt_hash`, and `accepted_by`. Nothing AI-generated reaches a render without a human acceptance recorded in the audit log.

Fact-checking returns **evidence with sources**, never a verdict. The product's authority rests entirely on the user's willingness to stand behind what they said. An AI that puts words in their mouth destroys the only asset the platform has. This boundary is also the product's marketing: *every word in the response is a human's.*
<!-- /UPGRADE -->

---

## 21. AI Should Understand the Conversation

Eventually, the AI could understand:

```
SOURCE CLAIM
       ↓
USER RESPONSE
       ↓
SOURCE RESPONSE
       ↓
USER RESPONSE
```

It could therefore create a conversation map.

For example:

```
Topic: Climate policy

SOURCE
Claim A
   ↓
USER
Challenges Claim A
   ↓
SOURCE
Introduces Claim B
   ↓
USER
Provides counterexample
```

This becomes almost like an intellectual debate editor.

---

## 22. Final Video Composition

When the user clicks:

Generate Final Video

the application converts the conversation structure into a render plan.

Example:

```
01 SOURCE
00:00 → 04:21

02 USER
04:21 → 05:18

03 SOURCE
04:21 → 08:32

04 USER
08:32 → 10:03

05 SOURCE
08:32 → 12:47
```

The rendering engine then produces:

```
FINAL.mp4
```

<!-- UPGRADE -->
### ⬆ UPGRADE U-16 · The Render Plan Is an Explicit, Versioned, Deterministic Artefact

**Necessity.** §22 says the structure is converted into a render plan, then produces an MP4. If that conversion lives inside the render worker as imperative code, three things become impossible: reproducing a past render, caching unchanged work, and testing the renderer at all. A forty-minute conversation re-rendered after a one-word caption fix would re-encode from scratch — which, in practice, means users stop iterating, and §30's promise of unlimited revisions is empty.

**Doctrine.**

1. **The render plan is data, not code** — a versioned JSON artefact, persisted with every render, listing each shot with its inputs, in/out points, layout, overlays, transitions, and audio treatment.
2. **Rendering is a pure function:** `render(plan, assets) → bytes`. Same plan and same assets must produce a **byte-identical** file. No timestamps, no random IDs, no encoder nondeterminism in the container.
3. **Every shot is content-addressed.** `shot_hash = sha256(inputs ‖ params)`. Shots are rendered individually to the house format and cached by hash. Re-render touches only changed shots and re-concatenates the rest by stream copy.

```
Conversation Document
        ↓   plan(document, layout_profile, export_profile)
Render Plan  (versioned, persisted, diffable)
        ↓   per-shot, content-addressed, cached
Shot Cache
        ↓   concat + master audio + captions
FINAL.mp4
```

The practical result: fixing a caption at minute 38 of a 40-minute video re-renders one shot and takes seconds. **That speed is what makes users iterate, and iteration is what makes the output polished.** This is a product feature disguised as an implementation detail.

4. Every render stores its `plan_hash`, `engine_version`, and asset checksums, so any published video can be reproduced exactly — which matters enormously the first time someone disputes what a published response contained.
<!-- /UPGRADE -->

<!-- UPGRADE -->
### ⬆ UPGRADE U-17 · Audio Is Half the Video and the Map Does Not Mention It

**Necessity.** §22–§25 describe picture in detail and never once address sound. In a product that alternates between a stranger's recorded audio and a webcam microphone, this is the gap most likely to make professional output impossible. The source is mastered broadcast audio; the user is a laptop mic in a room. Cutting between them untreated produces a video where the audience reaches for the volume control at every transition. Viewers will not articulate why the video feels amateur — they will simply leave.

**Doctrine.** Every render runs a mandatory audio chain:

```
1  De-click at every cut          2 ms equal-power crossfade (U-07)
2  Response conditioning          high-pass 80 Hz, de-esser, gentle
                                  broadband noise reduction, light
                                  compression (3:1, soft knee)
3  Per-speaker loudness match     source and user normalised to the
                                  same integrated loudness before any
                                  ducking decision
4  Master loudness (EBU R128)     -14 LUFS / -1 dBTP  YouTube, 16:9
                                  -14 LUFS / -1 dBTP  square
                                  -14 LUFS / -1 dBTP  vertical
                                  true-peak limited, never clipped
5  Ducking                        where layouts overlap source and
                                  response, source audio ducks -18 dB
                                  under the response with 120 ms
                                  attack / 400 ms release
6  Silence policy                 200 ms of clean air before and after
                                  every response; never a hard butt
                                  against speech
```

Loudness matching across speakers is the single highest-leverage quality decision in this entire document. It is invisible when right and fatal when wrong.
<!-- /UPGRADE -->

---

## 23. Multiple Video Layouts

The user should be able to choose a presentation style.

**Full-screen switching**

```
SOURCE FULL SCREEN
        ↓
USER FULL SCREEN
        ↓
SOURCE FULL SCREEN
```

**Picture-in-picture**

```
┌─────────────────────────────┐
│                             │
│        ORIGINAL             │
│                             │
│                 ┌─────────┐ │
│                 │  YOU    │ │
│                 └─────────┘ │
└─────────────────────────────┘
```

**Side-by-side**

```
┌──────────────────┬──────────────────┐
│                  │                  │
│     ORIGINAL     │       YOU        │
│                  │                  │
└──────────────────┴──────────────────┘
```

**Speaker switching**

Camera automatically fills the screen when you speak.

Original video fills the screen when the source speaks.

This could produce a very polished result.

<!-- UPGRADE -->
### ⬆ UPGRADE U-18 · Layouts Are a Compositor, Not a Set of Presets

**Necessity.** §23 lists four layouts. §29 needs them rearranged for vertical. §13 (U-11) needs them selected per type. §44 needs an evidence panel. Hard-coding four ffmpeg filter graphs means every new layout is new engineering and every aspect ratio doubles the work — the combinatorial trap that stalls video products.

**Doctrine.** A layout is a **declarative scene graph** evaluated by a compositor:

```
scene {
  canvas   1920×1080 | 1080×1080 | 1080×1920
  layers   [ { source: source|user|screen|still|evidence|text,
               rect: normalised, fit: cover|contain,
               radius, shadow, border, opacity,
               enter/exit: animated, z } ]
  overlays [ lower_third, captions, quote_card, progress, watermark ]
}
```

Named layouts (`full_source`, `full_user`, `pip`, `side_by_side`, `freeze_pip`, `screen_pip`, `evidence_split`, `vertical_stack`) are **data**: scene definitions in a layout library, not branches in code. Adding a layout is authoring a file.

`speaker_switching` is a scene *selector* driven by voice activity detection over both audio tracks, with hysteresis (minimum 1.2 s dwell) so the frame does not flicker on interjections. Applied crudely, automatic speaker switching looks worse than a static layout; the hysteresis is what makes it feel edited by a person.

Every layout declares its own behaviour under each aspect ratio, which is how §29 is satisfied without a second rendering path.
<!-- /UPGRADE -->

---

## 24. Captions

The final video could automatically contain:

**Source captions**

```
SOURCE SPEAKER:
"We need to understand..."
```

**User captions**

```
YOU:
"Let's examine that claim."
```

The application could visually distinguish the two speakers.

<!-- UPGRADE -->
### ⬆ UPGRADE U-19 · Captions Are Accessibility First, Style Second

**Necessity.** §24 treats captions as a stylistic feature. They are a legal and ethical obligation, they are how the majority of social video is consumed, and they are how this product's content becomes indexable. Implemented as burned-in decoration only, the product ships inaccessible video.

**Doctrine.**

1. Every render emits **both** burned-in captions (styled, speaker-distinguished, optional) **and** a sidecar `.srt` and `.vtt` (always, non-optional) carrying speaker labels.
2. Caption styling is subject to a **legibility floor** that the user cannot style past: minimum size relative to canvas height, minimum 4.5:1 contrast against a scrim, safe-area margins respected for every platform. A user may choose the look; they may not choose an unreadable one.
3. Captions are **word-timed** (U-03), enabling per-word emphasis on the active word — the single most effective retention device in short-form video, and free given word-level timing.
4. Source captions carry the source speaker's label and are bound to `quote_hash` (U-10). Response captions are generated by transcribing the user's own take.
5. Captions are never auto-published unreviewed for claims. A misheard word in a quoted claim is a misquote, and U-10's integrity rule applies.
<!-- /UPGRADE -->

---

## 25. Speaker Identity

Instead of simply showing captions, the application could use:

```
SOURCE
████████████████

YOU
▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒
```

Or:

```
SOURCE SPEAKER
"That is what happened."

YOU
"I disagree, because..."
```

This reinforces the conversational nature of the product.

<!-- UPGRADE -->
### ⬆ UPGRADE U-20 · One Visual Language, Applied Everywhere

**Necessity.** §18, §24, and §25 each independently propose distinguishing source from user. If these are designed separately, the product ends up with three unrelated conventions and looks incoherent.

**Doctrine.** A **single speaker-identity system** is defined once and applied in every surface: the editor timeline, the transcript panel, burned-in captions, lower-thirds, the conversation map (§21), the article transcript (U-14), and the shareable claim card (U-10).

```
SOURCE  cool neutral    solid fill     square avatar   attribution + timestamp
YOU     warm accent     hatched fill   round avatar    your name + type badge
```

The convention is carried by **shape and position as well as colour**, so it survives greyscale and colour-blindness. In a product about disagreement, "who is speaking" must never be ambiguous for one second of the output.
<!-- /UPGRADE -->

---

## 26. Project Editing After Recording

The user should be able to return days later.

Their project remains:

Draft — My Response to [Video]

They can:

* continue recording
* delete interruptions
* reorder certain commentary
* re-record
* trim
* add evidence
* add captions
* change layout
* change intro/outro
* render again

---

## 27. Intro and Outro

The final video can optionally have:

**Intro**

```
MY RESPONSE TO

"The History of Europe"

By Chama Meyembi
```

Then the conversation begins.

**Outro**

```
Thank you for watching.

Subscribe for more analysis.
```

These could be templates.

<!-- UPGRADE -->
### ⬆ UPGRADE U-21 · Attribution Is Generated, and Is Not a Template Choice

**Necessity.** §27 makes intro and outro optional templates. But §46 requires source attribution, and an attribution that the user can forget to add is an attribution the platform cannot rely on.

**Doctrine.** Every export automatically carries a **generated attribution block** — source title, original creator, canonical URL, and the date accessed — composed from the source record, not typed by the user. Its placement is stylable; its presence is not optional. It also appears in the exported description text and in the article transcript (U-14).

This costs the user nothing, protects them and the platform, and signals seriousness. Creators who respond to others' work are constantly accused of theft; a product that attributes automatically and visibly is defending its users.
<!-- /UPGRADE -->

---

## 28. Export

The user chooses:

**YouTube**
16:9

**TikTok / Shorts / Reels**
9:16

**Square**
1:1

**Standard video**
16:9

The application can automatically adapt the composition.

---

## 29. Vertical Reframing

For a vertical video, the application could intelligently arrange:

```
┌─────────────────┐
│                 │
│ ORIGINAL VIDEO  │
│                 │
├─────────────────┤
│                 │
│ YOUR CAMERA     │
│                 │
├─────────────────┤
│   CAPTIONS      │
└─────────────────┘
```

This means one conversation project can produce several formats.

<!-- UPGRADE -->
### ⬆ UPGRADE U-22 · Vertical Is a Different Edit, Not a Different Crop

**Necessity.** §29 shows a stacked arrangement, which is correct, but the deeper issue is length. A forty-minute conversation has no vertical form. Reframing it produces a forty-minute vertical video nobody watches. The map's own §28 lists Shorts and Reels as export targets without addressing that those formats demand a fundamentally different edit.

**Doctrine.**

1. Vertical export operates on the **claim–response pair** (U-10) as its unit, not on the whole conversation. The default vertical output is a **set of clips**, one per pair, each self-contained: the claim, then the reply, with captions burned in.
2. Each clip opens on the **quote card** — the claim as typography — which works with sound off, where these formats are actually consumed.
3. Layout reflow is declarative (U-18): each named layout defines its vertical behaviour. Faces are kept in frame using face-aware safe regions, with the crop animated only on cuts, never drifting during a shot.
4. The user selects which pairs to publish. The product proposes the strongest candidates but never auto-publishes.

One conversation therefore yields: one long-form video, one article, and a dozen clips. **The composition step is the distribution engine.** That is the product's growth loop, and it belongs in the doctrine, not in a growth plan written later.
<!-- /UPGRADE -->

---

## 30. Source and Commentary Separation

This is technically very important.

The application should never permanently merge everything immediately.

Instead:

```
SOURCE ASSET
+
COMMENTARY ASSETS
+
TIMELINE
+
LAYOUT
+
CAPTIONS
+
ANNOTATIONS
```

remain separate.

Then:

```
TIMELINE
       ↓
RENDER ENGINE
       ↓
FINAL VIDEO
```

This allows unlimited revisions without repeatedly processing the original source.

---

## 31. Suggested Technical Architecture

For a modern implementation, I would think about the system roughly like this:

```
                 ┌─────────────────────┐
                 │      WEB APP        │
                 │ Next.js / React     │
                 └──────────┬──────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
          Video Player             Timeline
                │                       │
                └───────────┬───────────┘
                            │
                     Application API
                            │
        ┌───────────────────┼────────────────────┐
        │                   │                    │
   Transcript          Project DB           Media Storage
        │                   │                    │
     AI/STT             PostgreSQL          Object Storage
        │
        ▼
   Sentence timing
```

And the rendering system:

```
Timeline JSON
      ↓
Render Planner
      ↓
FFmpeg / GPU rendering
      ↓
MP4
      ↓
Object Storage
      ↓
Download / Publish
```

<!-- UPGRADE -->
### ⬆ UPGRADE U-23 · The Render Tier Is Isolated, Queued, and Interruptible

**Necessity.** §31's diagram puts rendering downstream of the API without saying where it runs. If renders execute in the web tier, one forty-minute export saturates the server and the application becomes unusable for everyone. This is how video products die on their first popular day.

**Doctrine.**

```
web tier        stateless, never runs ffmpeg, never blocks on a render
job queue       durable, at-least-once, idempotent by plan_hash
render workers  isolated processes, horizontally scaled, CPU or GPU,
                strict CPU/memory/time budgets, hard-killed on overrun
object storage  single source of truth for all bytes; workers stream,
                never hold whole files in memory
```

Every render job is **resumable and observable**: per-shot progress, a live log, cancellable mid-flight, and re-entrant after worker loss (the shot cache from U-16 makes a resumed job cheap). Users watch progress; a render that reports a real percentage and a real remaining time feels professional, and one that shows a spinner for eleven minutes feels broken.

Renders are **cost-metered per minute of output** and attributed to the account. A product that cannot measure its unit economics cannot price itself.
<!-- /UPGRADE -->


<!-- UPGRADE -->
### ⬆ UPGRADE U-39 · The Editing Proxy, and Preview/Render Frame Parity

**Necessity.** Discovered in implementation, recorded here per the amendment
rule. §31 and D-14 call for "client-side preview, server-side final" without
saying what the editor actually plays. If it plays the mezzanine, three things
go wrong: the editor ships a 1080p H.264 stream for every scrub; seeking is
slow enough to discourage the browsing that finding a moment requires; and
whether it plays at all depends on the browser's codec licensing, which the
product does not control.

The deeper issue is subtler and matters more. The user chooses their interrupt
frame by looking at the player. The renderer cuts the mezzanine. **If those two
disagree about which frame is frame N, frame-exactness is true of the file and
false of the experience** — and the experience is the promise.

**Doctrine.**

1. Ingest produces a third artefact beside the original and the mezzanine: an
   **editing proxy** — small, widely decodable (VP8/Opus), and cheap to seek.
   The editor plays the proxy; the renderer never touches it.
2. **The proxy and the mezzanine must agree on frame count and frame rate.**
   This is asserted at ingest (INV-13) and the ingest fails rather than
   producing a project whose editor and renderer disagree.
3. The proxy is a representation (INV-00): regenerable, discardable, holding
   nothing the Conversation does not.

The frame a user sees when they press the key is the contract. Everything
downstream is bookkeeping in service of it.
<!-- /UPGRADE -->

---

## 32. Data Model

A simplified database model could be:

```
users
projects
sources
source_transcripts
transcript_segments
interventions
intervention_media
timeline_segments
annotations
captions
renders
```

An intervention might contain:

```
id
project_id
source_timestamp
source_sentence_id
type
media_id
duration
layout
position
created_at
```

The key relationship is:

```
source_sentence
       ↓
intervention
       ↓
response_media
```

<!-- UPGRADE -->
### ⬆ UPGRADE U-24 · The Model, Completed

**Necessity.** §32's model is sound and incomplete. It has no place for takes (U-06), anchors (U-05), evidence (§44), render plans (U-16), export profiles (§28), rights attestations (§46), or the audit trail (U-15). Adding these later means migrating live user work — and in this product, user work is irreplaceable recorded speech.

**Doctrine.** The canonical model extends §32 as follows. Names are binding.

```
users
accounts                     billing, quota, retention policy
projects                     = Conversation; holds document_version
sources                      class A|B, provider, rights_attestation_id
rights_attestations          who asserted what, when, from what IP
source_assets                original + mezzanine + stills, checksums
source_transcripts           versioned; engine, model, language
transcript_words             word-level timing          [U-03]
transcript_sentences         sentence spans             [U-03]
transcript_paragraphs        topic/chapter grouping     [U-03]
interventions                type, anchor, selected_take_id, order
intervention_anchors         composite anchor           [U-05]
takes                        many per intervention      [U-06]
take_chunks                  streamed recording chunks  [U-06]
intervention_media           normalised mezzanine per take
annotations                  vector, timed, normalised  [U-12]
evidence                     attachments + provenance   [§44]
claims                       claim–response pairs       [U-10]
captions                     word-timed, per speaker    [U-19]
layout_profiles              scene graphs               [U-18]
export_profiles              aspect, platform, loudness [§28, U-17]
render_plans                 versioned plan artefacts   [U-16]
render_shots                 content-addressed cache    [U-16]
renders                      status, cost, output asset
publications                 destination, URL, published_at
ai_operations                model, prompt_hash, accepted_by [U-15]
audit_log                    append-only, user-visible
timeline_segments            MATERIALISED VIEW, derived  [U-08]
```

**`timeline_segments` is explicitly demoted to derived state.** §32 lists it alongside the others, which invites treating it as truth. It is a cache of the Conversation document and must be rebuildable from scratch at any moment.
<!-- /UPGRADE -->

---

## 33. The Most Important Technical Concept

The application should store the user's intention, not merely the final video.

For example:

```
{
  "source": {
    "start": 0,
    "end": 243
  },
  "intervention": {
    "type": "critique",
    "sourceTimestamp": 243,
    "media": "response-001.webm"
  },
  "resumeSource": 243
}
```

Then the final video is simply a rendered interpretation of the conversation.

That is what makes the product flexible.

<!-- UPGRADE -->
### ⬆ UPGRADE U-25 · The Conversation Document — Versioned, Append-Only, Portable

**Necessity.** §33 is the correct and most important idea in this map, and it needs three properties it does not yet state, or it will not survive contact with real use.

**Doctrine.**

1. **Versioned schema.** The document carries `schema_version`. Migrations are forward-only, tested against archived real documents, and never destructive. A project recorded in year one must open in year five.
2. **Append-only history.** Edits are recorded as operations against the document, not overwrites. This gives undo across sessions, a visible revision history, crash recovery, and — when collaboration arrives (§40) — a conflict-resolution substrate that does not require re-architecting. Retrofitting history onto a mutable document is a rewrite; building it in now is a day's work.
3. **Portable and exportable.** The user can export the complete document plus assets as an open archive. No lock-in. In a product built on the premise that discourse should be open and accountable, holding users' recorded arguments hostage would contradict the product's own thesis.

```
conversation.json    the document (schema_version, source, interventions,
                     anchors, annotations, evidence, layouts, captions)
assets/              originals, mezzanines, stills, evidence
transcript/          versioned transcripts with word timing
renders/             past render plans and their outputs
audit.log            append-only history
```

**The document is the product. The video is an export of it.** Every architectural decision defers to this sentence.
<!-- /UPGRADE -->

---

## 34. Browser Recording

The browser can capture:

* microphone
* webcam
* screen
* system audio where supported

The recordings can initially be stored as independent media assets.

For example:

```
response-001.webm
response-002.webm
response-003.webm
```

Then the rendering system handles final composition.

<!-- UPGRADE -->
### ⬆ UPGRADE U-26 · Capture Quality Is Decided at Capture Time and Cannot Be Fixed Later

**Necessity.** §34 lists what the browser can capture but sets no standard. Defaults vary wildly by browser and device; a user can unknowingly record an entire project at 480p with automatic gain distortion, and no amount of rendering recovers it. Every one of those projects is a lost user.

**Doctrine.**

1. **Explicit capture constraints**, never browser defaults: 1080p30 preferred with graceful fallback, and audio captured with `echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false` — the conferencing defaults destroy voice quality for recording and are the reason most webcam commentary sounds thin.
2. **A pre-flight check before the first recording**, every session: camera resolution and frame rate, microphone level with a live meter, headroom warning, background noise floor measurement, disk and network headroom, and a three-second test recording played back. Thirty seconds spent here prevents the most common catastrophic outcome in the product.
3. **Live monitoring during recording**: level meter with clip indicator, dropped-frame counter, upload-backlog indicator. Silent failure is never acceptable during an irreplaceable take.
4. **Device changes mid-project are detected** and the user is warned before recording continues with different hardware.
5. `PREFERRED` codecs are negotiated at capture; the exact `mimeType` used is recorded on the take, because ingest normalisation (U-02) needs to know what it is reading.
<!-- /UPGRADE -->

---

## 35. The "Conversation Mode"

I would make this the signature feature.

Instead of traditional controls:

```
Play
Pause
Cut
Trim
Split
```

the primary controls are:

```
▶ CONTINUE

✋ INTERRUPT

🎙 RESPOND

↩ RESUME
```

The interface communicates the product concept immediately.

<!-- UPGRADE -->
### ⬆ UPGRADE U-27 · One Key. The Whole Product.

**Necessity.** §35 is right that the control vocabulary carries the concept, but four on-screen buttons still require the user to look away from the video and aim a mouse — during the exact seconds when they are formulating a thought. The interaction has to disappear.

**Doctrine.**

**The spacebar is the product.**

```
video playing   →  SPACE  →  pause, stamp, start recording (with pre-roll)
recording       →  SPACE  →  stop recording, resume source from the same frame
```

One key, pressed twice, produces a complete intervention. The user never leaves the video, never aims at a control, never breaks their train of thought. Everything else in §35's vocabulary remains available on screen for discoverability and for touch, but the expert path is a single key — and the product should teach it within the first minute.

This is the interaction the entire document is arguing for, reduced to its irreducible form. **If a first-time user can produce a three-intervention conversation without reading anything, the product works. If they cannot, nothing else in this document matters.** That is the acceptance test for the whole application.
<!-- /UPGRADE -->

---

## 36. Two Modes

The product could have two major modes.

**Live Conversation Mode**

You are watching the video in real time.

You interrupt whenever you want.

```
PLAY
   ↓
INTERRUPT
   ↓
RESPOND
   ↓
CONTINUE
```

This is the simplest experience.

**Studio Mode**

Afterwards, you can refine everything.

```
SOURCE
├── Intervention 1
├── Intervention 2
├── Intervention 3
├── Intervention 4
└── Intervention 5
```

You can edit each one.

<!-- UPGRADE -->
### ⬆ UPGRADE U-28 · Live Mode Is the Front Door and Must Never Require Studio Mode

**Necessity.** §36 presents the two modes as equal halves. They are not. Live Mode is the product's entire thesis; Studio Mode is a professional affordance. If a user must enter Studio Mode to get a publishable video, the thesis has failed and the product is a video editor with an unusual capture step.

**Doctrine.** A user must be able to go from pasted link to published video **without ever opening Studio Mode.** Live Mode ends with a render button, and the result is good enough to publish — because type-driven layout (U-11), automatic audio mastering (U-17), automatic captions (U-19), and automatic attribution (U-21) have already done the work of an editor.

Studio Mode is for the user who wants more. It is never the price of admission.
<!-- /UPGRADE -->

---

## 37. "Capture This Moment"

Another useful button:

CAPTURE

Instead of immediately recording, it bookmarks the moment.

For example:

```
12:42 — Capture
17:21 — Capture
21:04 — Capture
31:18 — Capture
```

Later you can return and record your responses.

This means the user can simply watch first and mark things they want to discuss.

---

## 38. "Build My Response"

The user could capture several moments:

```
01 — 03:22
02 — 08:41
03 — 14:52
04 — 21:17
05 — 33:08
```

Then enter:

Start Commentary Session

The application walks them through:

"Respond to point 1."

Record.

"Respond to point 2."

Record.

And so forth.

<!-- UPGRADE -->
### ⬆ UPGRADE U-29 · The Commentary Session Is a Teleprompter Studio

**Necessity.** §38 describes walking the user through their captured points. Implemented literally — a prompt, then a record button — it is merely a list. The user still has to remember what was said at 14:52 and what they intended to say about it.

**Doctrine.** During a commentary session each point presents, on one screen:

```
the frozen frame at the anchor
the transcript around it, with the claim highlighted
the note the user wrote when capturing
their evidence for this point, if attached
a countdown, then recording, with the claim still visible
```

The user is reading their own thinking while looking at the camera. This is a teleprompter built from the document, and it converts the hardest part of making an analysis video — remembering, in front of a camera, exactly what you meant — into something that requires no memory at all.

Captures also accept a note at capture time. A moment marked without a reason is a moment lost; one line of text preserves the entire thought.
<!-- /UPGRADE -->

---

## 39. Conversation Chapters

Long videos could automatically become chapters:

```
00:00 Introduction

05:22 Claim #1
     └── Your response

11:41 Claim #2
     └── Your response

18:03 Evidence
     └── Your response

27:19 Conclusion
     └── Your response
```

The final YouTube video could potentially use these chapters as well.

<!-- UPGRADE -->
### ⬆ UPGRADE U-30 · Publish-Ready Metadata Is Part of the Render

**Necessity.** §39 notes chapters "could potentially" be used on YouTube. The document already contains everything a publication needs; making the user retype it is needless friction at the most fatiguing moment of the process — the end.

**Doctrine.** Every export produces a **publication bundle** alongside the video, with chapter markers in output time (U-08), a description containing the generated attribution block (U-21), suggested titles drawn from the claims, the caption sidecars (U-19), a thumbnail candidate set (freeze frames plus quote cards), the article transcript (U-14), and the vertical clip set (U-22).

The user finishes the render and has everything required to publish, already written.
<!-- /UPGRADE -->

---

## 40. Collaboration

Later, the concept could become collaborative.

For example:

```
Original Video
      ↓
Person A responds
      ↓
Person B responds
      ↓
Person A responds again
```

Or:

```
Source
  ↓
Expert 1
  ↓
Expert 2
  ↓
Expert 3
```

The platform becomes a structured multi-person video conversation.

<!-- UPGRADE -->
### ⬆ UPGRADE U-31 · Every Published Conversation Is Itself a Source

**Necessity.** §40 defers collaboration to later, which is right for scope. But one decision must be made now, because it is nearly free today and architecturally expensive later.

**Doctrine.** A published conversation is a **Class A source** (U-01). Anyone can open it and respond to it.

That single property turns the product from a tool into a network. Response chains form without any collaboration feature being built: A responds to a video, B responds to A, A responds to B. §40's multi-person conversation emerges from the existing primitives.

Two rules are set now. **Consent:** the publisher chooses at publish time whether their conversation is respondable. **Lineage:** every conversation records its ancestry, so any exchange can be traced to its origin and displayed as a thread. Neither is buildable cheaply after the fact.
<!-- /UPGRADE -->

---

## 41. Educational Use

This could be particularly powerful for education.

A lecturer could upload a lecture.

A student could interrupt:

"I don't understand this step."

Or:

"Can you explain this concept?"

A teacher could create:

```
LECTURE
↓
PAUSE
↓
EXPLANATION
↓
LECTURE
↓
QUESTION
↓
ANSWER
```

It could also be used for:

* university lectures
* tutorials
* historical analysis
* journalism
* documentaries
* debates
* interviews
* religious teaching
* technical presentations
* film analysis
* language learning

<!-- UPGRADE -->
### ⬆ UPGRADE U-32 · Education Is the Beachhead Market

**Necessity.** §41 lists education among many uses. Strategically it is not one of many — it is the one where the source-rights problem (U-01, §46) disappears entirely, because the institution owns the lecture. Class A is the default there, the flagship composed export works without qualification, and the users have budget, recurring need, and an existing distribution channel.

**Doctrine.** Education is the **first market**. It is where the product is proven, and its requirements — asynchronous question-and-answer over recorded lectures, student privacy, LMS-compatible export, accessible captions as a legal requirement, institutional retention policies — are accepted as first-class requirements rather than enterprise afterthoughts.

The commentary product and the education product are the same product. Only the framing differs.
<!-- /UPGRADE -->

---

## 42. Debate Mode

A future version could explicitly support debate.

```
Speaker A
    ↓
Speaker B
    ↓
Speaker A
    ↓
Speaker B
```

Instead of editing manually, the application understands the exchange.

---

## 43. Research Mode

The transcript could become searchable.

User searches:

"Show me every time the speaker mentions Norway."

The application finds:

```
04:21
18:37
31:02
42:17
```

The user can jump directly to each occurrence and create an intervention.

---

## 44. Evidence Mode

A particularly interesting future feature:

When the user interrupts, they can attach evidence.

```
SOURCE CLAIM
      ↓
USER RESPONSE
      ↓
ATTACH EVIDENCE

[PDF]
[Website]
[Image]
[Chart]
[Document]
```

The final video can display:

```
SOURCE CLAIM

        ↓

YOUR RESPONSE

        ↓

EVIDENCE
```

This would make the platform useful for serious analysis rather than only entertainment.

<!-- UPGRADE -->
### ⬆ UPGRADE U-33 · Evidence Must Be Archived, Cited, and Shown Precisely

**Necessity.** §44 defers evidence to "future," but it is the feature that distinguishes this product from reaction content, and two of its properties are worthless if added late. A linked web page changes or disappears — cited evidence that 404s a year later actively damages the user's credibility, which is the opposite of what the feature is for. And evidence shown as a full-page screenshot proves nothing; the viewer cannot find the relevant line.

**Doctrine.**

1. **Evidence is archived at attach time.** A snapshot is captured and stored with URL, retrieval timestamp, content hash, and title. The citation remains verifiable after the source changes.
2. **Evidence carries a precise locator** — page and highlighted region for a PDF, text quote and scroll anchor for a page, cell range for a spreadsheet. The render shows the document, then **animates a zoom to the cited region** while the user speaks. That motion is what makes an evidence citation persuasive on video rather than decorative.
3. **Evidence is a timed layer** within the intervention (U-12), appearing when referenced, not for the whole take.
4. **Every piece of evidence appears in the publication bundle** (U-30) and the article transcript (U-14) as a formal citation with its retrieval date.

Evidence belongs in **v2, not v3.** It is a low-cost feature with a disproportionate effect on the product's identity, and it is the reason a journalist or an academic would choose this over an editor.
<!-- /UPGRADE -->

---

## 45. AI Research Assistant

The user could select a statement and ask:

Analyze this claim.

The AI could return:

```
Claim:
"The policy began in 2019."

Context:
...

Supporting evidence:
...

Contradicting evidence:
...

Sources:
...

Possible response:
...
```

The user decides what to say.

The AI is therefore an assistant to the commentator, not the commentator.

<!-- UPGRADE -->
### ⬆ UPGRADE U-34 · Research Output Enters the Document as Evidence, Never as Assertion

**Necessity.** §45's shape is right, but "Supporting evidence: ..." produced by a language model without retrieval is a fabrication risk aimed precisely at the product's most sensitive surface. A single hallucinated citation in a published fact-check destroys the credibility of the platform, not merely the user.

**Doctrine.**

1. Research is **retrieval-grounded**. Every claim in an AI research result carries a real, fetched, archivable source (U-33). Any assertion without a retrievable source is **not returned at all** — not returned with a caveat, not returned greyed out. Not returned.
2. **"Contradicting evidence" is mandatory and shown with equal weight.** A research tool that returns only support is a confirmation-bias engine, and in this product that is a moral failure as well as a product one.
3. Accepting a research result creates an **evidence record**, not narration text. The user still says the words (U-15).
4. Confidence and source quality are shown plainly. The user is told what the tool does not know.

**The product's long-term defensibility is its reputation for accuracy.** Every decision in the research layer is subordinate to protecting it.
<!-- /UPGRADE -->

---

## 46. Important Rights and Platform Considerations

Because the product can incorporate third-party videos, the system should be designed carefully around:

* copyright
* licensing
* platform terms
* permitted uses
* user responsibility
* source attribution

For YouTube specifically, the product architecture should distinguish between playing an authorized/embedded source and creating a downloadable copy of source content.

For uploaded videos, the user should confirm they have the necessary rights or permission.

This needs to be designed into the product rather than treated as an afterthought.

<!-- UPGRADE -->
### ⬆ UPGRADE U-35 · Rights, Made Structural

**Necessity.** §46 correctly identifies this as design-time work. U-01 resolved the architecture. This upgrade states the operational rules, because a policy that lives only in a terms-of-service document is not "designed into the product."

**Doctrine.**

1. **Class enforcement is code** (U-01). The render planner cannot emit a composed plan for a Class B source. This is an assertion, not a UI rule.
2. **Rights attestation is a record, not a checkbox.** Adding a Class A source requires selecting a basis — *I own it · Licensed · Public domain · Permission granted · Institutional material · Fair use / fair dealing, transformative commentary* — stored with user, timestamp, and IP, and shown on the project.
3. **Commentary posture is the default and is supported by design.** Transformative commentary is strongest when source use is proportionate, interleaved with substantial original contribution, and attributed. The product's core loop produces exactly this shape. The **source-to-response ratio is surfaced to the user** while they work, because it is both a legal signal and an editorial one — a response that is 95% someone else's video is a weak response regardless of the law.
4. **Attribution is automatic and non-removable** (U-21).
5. **A working takedown and counter-notice path exists before launch**, with the ability to unpublish immediately while preserving the user's document — the user's own recorded speech is never destroyed by a dispute over the source.
6. **Nothing in the product downloads from a platform that forbids it.** No exceptions, no user-supplied workarounds, no third-party extraction integrations. This rule is not subject to growth arguments.

Framed correctly, this is not a constraint. It is the reason institutions, broadcasters, and publishers can adopt the product — and they are the customers who pay.
<!-- /UPGRADE -->

---

## 47. The Product's Identity

I would not position this simply as:

"AI video editor"

That is too generic.

The stronger concept is:

"Talk back to any video."

Or:

"Stop the video. Say what you think. Continue the conversation."

Or:

"Turn videos into conversations."

The fundamental product category could become:

**Interactive Video Commentary**

rather than another conventional video editor.

---

## 48. The Core User Journey

The entire product can ultimately be reduced to:

```
CREATE PROJECT
      ↓
ADD VIDEO
      ↓
TRANSCRIBE
      ↓
WATCH
      ↓
INTERRUPT
      ↓
RESPOND
      ↓
CONTINUE
      ↓
INTERRUPT
      ↓
RESPOND
      ↓
CONTINUE
      ↓
...
      ↓
EDIT
      ↓
STYLE
      ↓
GENERATE
      ↓
FINAL VIDEO
      ↓
PUBLISH
```

---

## 49. MVP

I would not build everything above initially.

The first version should prove the central interaction.

MVP should contain:

1. Upload video
2. Video player
3. Play/pause
4. Interrupt button
5. Webcam + microphone recording
6. Continue button
7. Automatic interruption timeline
8. Basic editing of interruptions
9. Transcript
10. Timestamped sentences
11. Final video rendering
12. MP4 export

That's enough to prove the product.

<!-- UPGRADE -->
### ⬆ UPGRADE U-36 · Four Additions the MVP Cannot Ship Without

**Necessity.** §49's list is correct and, taken alone, produces something that proves the *interaction* but not the *product* — the export would sound amateur and could lose work. Four items are not polish; without them the MVP cannot be shown to anyone.

**Doctrine.** The MVP is §49's twelve items plus:

```
13  Pre-roll capture              [U-04]  without it, every response
                                          clips its own first words
14  Crash-safe chunked recording  [U-06]  without it, the demo can
                                          destroy a user's only take
15  Loudness-matched audio master [U-17]  without it, the export
                                          sounds amateur and the
                                          product is not believable
16  Automatic captions            [U-19]  without them, the export is
                                          inaccessible and unpublishable
                                          on the platforms that matter
```

And the MVP is governed by **one acceptance test**, from U-27:

> A first-time user, given a video file, produces a published three-intervention conversation using only the spacebar, without reading instructions, and the result sounds and looks deliberately made.

Everything else in §49 serves that sentence.

**MVP source scope: Class A only.** YouTube (Class B, §50) arrives with the Conversation Manifest, which is its own significant piece of work and must not be rushed into the first release as a broken composed export.
<!-- /UPGRADE -->

---

## 50. Version 2

Then add:

* YouTube integration
* sentence selection
* captions
* picture-in-picture
* side-by-side
* freeze frame
* annotations
* screen recording
* vertical video
* automatic reframing
* project templates
* intro/outro

<!-- UPGRADE -->
### ⬆ UPGRADE U-37 · Two Moves from v3 to v2

**Necessity.** Two items scheduled late are cheap now and define the product's identity. Shipping v2 without them means competing on features against established editors, which is a losing position.

**Doctrine.** Promoted into **v2**:

- **Evidence attachments** (U-33) — the feature that makes the product an instrument of analysis rather than reaction. Low cost, disproportionate identity value.
- **The article transcript** (U-14) — nearly free from the document, and it is what makes this work citable, searchable, and accessible.

Captions move from v2 to **MVP** (U-36). Vertical clip export (U-22) stays in v2 and is the distribution engine.
<!-- /UPGRADE -->

---

## 51. Version 3

Then:

* AI claim detection
* AI research
* AI response assistance
* fact-check workflow
* evidence attachments
* automatic chapters
* advanced layouts
* collaboration
* multi-speaker conversations
* publishing integrations

---

## 52. The Big Idea

The deepest idea behind the application is not:

"Make reaction videos."

It is:

"Give people a way to have a conversation with recorded media."

Traditional video:

```
Speaker ─────────────────────────→ Audience
```

Your product:

```
Speaker ───────→ Viewer
                  │
                  ↓
                Reply
                  │
                  ↓
Speaker ───────→ Viewer
                  │
                  ↓
                Reply
                  │
                  ↓
               Conversation
```

And the final product preserves that conversation.

That is what makes the concept interesting: the interruption itself becomes a first-class media object.

<!-- UPGRADE -->
### ⬆ UPGRADE U-38 · The Consequence of the Big Idea

**Necessity.** §52's closing line — *the interruption itself becomes a first-class media object* — is the thesis. One consequence follows from it that the map does not draw, and it is the one that determines whether this becomes a leading application or a good tool.

**Doctrine.** If the interruption is a first-class object, then it is **addressable, quotable, citable, respondable, and portable** — independently of the video it came from.

```
addressable   it has a permanent URL
quotable      it renders as a clip, a card, and a paragraph
citable       it carries its claim, its source, its timestamp,
              its evidence, and its author
respondable   it can itself be interrupted            [U-31]
portable      it leaves in an open archive            [U-25]
```

A video editor produces files. This produces **a public, structured, navigable record of people reasoning with each other** — where every assertion is attached to who made it, when, in what context, with what evidence, and what was said back.

That record is the thing that has never existed before. The video is how it travels. The document is what it is.

**Every decision in this doctrine defers to that.**
<!-- /UPGRADE -->


---
---

# PART II — CROSS-CUTTING DOCTRINE

The map organises the product by feature. Some commitments cut across every
feature and therefore have no single home in Part I. They are binding on the
same terms.

---

## D-01 · The Non-Negotiables

Everything else in this document is reasoning. These are the conclusions. If a
proposed change violates one of these, the change is wrong — not the rule.

```
0   The Conversation is the canonical artifact; everything else
    is a representation of it.                                    [INV-00]
1   The document is the product. The video is an export of it.      [U-25]
2   The user's recorded speech is irreplaceable and is never lost.  [U-06]
3   A source quote is never altered, by a user or by a model.       [U-10]
4   AI never speaks as the user.                                    [U-15]
5   The resume frame equals the interrupt frame. Exactly.           [U-07]
6   Nothing is downloaded from a platform that forbids it.          [U-35]
7   Attribution is automatic and cannot be removed.                 [U-21]
8   Captions ship with every render.                                [U-19]
9   Every export is loudness-mastered.                              [U-17]
10  A first-time user can do this with one key.                     [U-27]
```

---

## D-02 · Ubiquitous Language

One word per concept, in code, in the database, in the UI, and in
conversation. Synonyms are a defect.

| Term | Means | Never called |
|---|---|---|
| **Conversation** | the project; the document | project file, timeline, session |
| **Source** | the video being responded to | original, input, video |
| **Intervention** | one stop-and-respond unit | clip, insert, comment, reaction |
| **Take** | one recording attempt at an intervention | clip, recording, media |
| **Anchor** | the composite binding to a source moment | timestamp, marker |
| **Claim** | a quoted source statement being answered | quote, text |
| **Pair** | a claim and its response | exchange |
| **Segment** | a run of source between interventions | cut, chunk |
| **Shot** | one rendered unit in a render plan | clip, scene |
| **Render plan** | the data describing an export | timeline, EDL, config |
| **t_source / t_output** | the two clocks, always named | time, start, timestamp |

`interrupt`, `respond`, `continue` are the verbs of the product. The UI uses
them, the API uses them, and so does the team.

---

## D-03 · Privacy, Consent, and Ownership

The product handles people's faces, voices, homes, and unpublished opinions.
That is more sensitive than most software ever touches.

- **The camera light is the truth.** A permanently visible, unambiguous
  recording indicator whenever a device is live — including the warm pre-roll
  buffer (U-04). Pre-roll is explained plainly at consent time, not buried.
  Discarded pre-roll is discarded in memory and never persisted.
- **Unpublished is private by default.** Drafts are never used for training,
  never surfaced to other users, never indexed.
- **Recording content is not training data.** Not without separate, specific,
  revocable, opt-in consent. Never as a condition of using the product.
- **Delete means delete.** Deleting a conversation removes assets from object
  storage and from backups within a stated window, and the window is stated.
- **Export is a right** (U-25). Unconditional, including on a free tier and
  after cancellation.
- **Minors and classrooms** (U-32): institutional controls, guardian consent
  where required, and retention policies set by the institution, not by us.
- **Blur is a privacy tool** (U-12), reachable in one action, usable on faces,
  documents, addresses, and screens.

---

## D-04 · Accessibility

Not a compliance exercise. A product about making speech accountable that
excludes deaf and blind users has refuted itself.

- **WCAG 2.2 AA** across the application, verified, not assumed.
- **Every interaction reachable by keyboard.** The core loop already is
  (U-27); the rest must be too.
- **Captions always ship** (U-19), with a legibility floor the user cannot
  style past.
- **The transcript panel is a first-class navigation surface**, correctly
  announced by screen readers with timestamps and speaker labels.
- **The article transcript (U-14) is the accessible form of every
  conversation** — full parity of content, not a summary.
- **No information carried by colour alone** (U-20).
- **Respect `prefers-reduced-motion`** in the UI and offer a reduced-motion
  render profile (no Ken Burns, no animated annotations).

---

## D-05 · Performance Budgets

Numbers, so they can be tested rather than debated.

```
INTERRUPT keypress → source paused            < 50 ms
INTERRUPT keypress → recording armed          < 150 ms (pre-roll covers rest)
CONTINUE  keypress → source resumed           < 120 ms
Timeline scrub → frame shown                  < 100 ms
Project open → playable                       < 2.5 s
Transcript search → results                   < 200 ms
Preview render of one intervention            < 3 s
Final render                                  < 0.5× output duration (CPU)
Re-render after a caption edit                < 10 s for a 40-min output [U-16]
Recording chunk → durable                     < 5 s behind live          [U-06]
```

The interrupt path is the product. It is budgeted the way a game budgets a
frame: nothing is allowed onto it.

---

## D-06 · Security

- **Media URLs are signed and short-lived.** Object storage is never public.
- **Uploads are untrusted input.** Probed, validated, transcoded in a sandbox
  with no network egress and hard resource limits. ffmpeg parsing hostile
  media is a known attack surface and is treated as one.
- **Render workers are isolated**, run unprivileged, and cannot reach
  application secrets or the database.
- **Server-side URL fetching is SSRF-guarded** — evidence archiving (U-33) and
  direct-URL sources fetch through an allowlisted egress proxy with private
  address ranges blocked.
- **Tenant isolation is enforced at the data layer**, not in application code
  alone. One user reaching another's unpublished recordings is the worst
  incident this product can have.
- **The audit log is append-only** and visible to the account owner.

---

## D-07 · Reliability of User Work

Ranked by how unrecoverable the loss is. Engineering effort follows this order.

```
1  An in-progress take        irreplaceable — the moment is gone     [U-06]
2  The Conversation document  irreplaceable — hours of reasoning     [U-25]
3  Evidence archives          re-fetchable only while the source lives
4  Transcripts                regenerable at cost
5  Renders                    fully regenerable from the plan        [U-16]
```

Backup, replication, and recovery-time objectives are set in that order. A
render can be lost without apology. A take cannot be lost at all.

---

## D-08 · Rights and Fair-Dealing Posture

The operational posture behind U-35. This is engineering guidance for keeping
the product's use of source material defensible; it is not legal advice, and
counsel reviews it before launch and per jurisdiction.

- **Transformative commentary is the posture.** The product's loop
  structurally produces it: source material is interleaved with substantial
  original analysis, used in proportion, and attributed.
- **Proportionality is measured and surfaced.** The source-to-response ratio is
  shown to the user as they work (U-35). It is an editorial signal as much as
  a legal one.
- **Freeze frames from Class B sources** (U-13) are brief, always accompanied
  by commentary, always attributed, and never a substitute for watching the
  original.
- **The Conversation Manifest is the preferred Class B form** (U-01): it sends
  viewers to the provider's own player, preserving the original creator's
  views, analytics, and revenue. The product's answer to rights concerns is
  not minimal compliance — it is an architecture that makes responding
  *beneficial* to the person being responded to.
- **Jurisdiction differs.** Fair use (US), fair dealing (UK/CA/AU), and
  quotation exceptions (EU) are not the same. The product does not assume one.

---

## D-09 · Invariants Asserted in Code

Rules that exist only in documentation are rules that will be broken. Each of
these is an assertion that fails loudly — in CI, at write time, or at plan
time — not a convention.

```
INV-00  No representation holds data the Conversation does not, and
        every representation is regenerable from it.       [Part 0, D-16]
INV-01  A COMPOSED render plan requires a Class A source.            [U-01]
INV-02  cut_out_frame == resume_in_frame for every intervention.     [U-07]
INV-03  Σ(shot durations) == render duration, to the frame.          [U-08]
INV-04  Every asset entering a plan is in house format.              [U-02]
INV-05  A quote's text hashes to its quote_hash.                     [U-10]
INV-06  Every AI-derived field has an accepted_by.                   [U-15]
INV-07  Every export carries captions and an attribution block. [U-19, U-21]
INV-08  Every published render has a reproducible plan_hash.         [U-16]
INV-09  timeline_segments is rebuildable from the document.          [U-08]
INV-10  No take chunk is released locally before remote checksum.    [U-06]
INV-11  Master loudness within ±0.5 LU of the export profile target. [U-17]
INV-12  No intervention is silently re-anchored.                     [U-05]
INV-13  The editing proxy and the mezzanine agree on frame count
        and frame rate.                                              [U-39]
INV-14  A Performance take's alignment to the master is in samples,
        measured, and never silently resampled.          [U-08, STUDIO-TWO]
INV-15  No published export contains a master track the author has
        not declared they may publish.                   [U-01, STUDIO-TWO]
INV-16  No performer is composited into an environment without a
        matte measured from a plate of their own room.   [D-16, STUDIO-TWO]
```

INV-14, INV-15 and INV-16 belong to Studio Two and are specified in
[`STUDIO-TWO.md`](STUDIO-TWO.md). They are listed here because this is the
list, and an invariant kept somewhere else is one a reviewer does not check.

---

## D-10 · Testing Doctrine

Video software fails in ways unit tests do not see. A green suite over a
broken render is worse than no suite.

- **Golden renders.** A fixture set of conversations renders on every build and
  is compared against stored references by perceptual frame hash at fixed
  sample points plus audio fingerprint. Any drift fails the build and shows
  the diff. This is the only way U-16's determinism promise stays true.
- **Frame-exactness tests** (INV-02). A synthetic source with a burned-in frame
  counter is interrupted at known frames; the render is decoded and the
  counter read. No duplicated frame, no dropped frame. This test is the
  product's core promise expressed as code.
- **Loudness tests** (INV-11). Every golden render is measured for integrated
  loudness and true peak against its profile.
- **A/V sync tests.** A clap-and-flash fixture verifies drift stays under one
  frame across a forty-minute render — the failure mode that slowly ruins long
  exports and that nobody notices until a user does.
- **Capture simulation.** Recorded `MediaRecorder` chunk streams are replayed
  as fixtures, including truncated and out-of-order ones, so crash recovery
  (U-06) is tested rather than hoped for.
- **Hostile media corpus.** Malformed, rotated, VFR, zero-audio, huge, and
  adversarial files run through ingest on every build (D-06, U-02).
- **The acceptance test is a person.** U-27's test — a first-time user, one
  key, no instructions — is run with real people before every release. It
  cannot be automated and it outranks the suite.

---

## D-11 · Observability, Cost, and Quotas

- **Render cost is measured per minute of output** and attributed to an
  account (U-23). A video product that cannot state its unit economics cannot
  price itself and will discover this too late.
- **Every render job is observable**: queue depth, per-shot progress, cache hit
  rate, failure class. Cache hit rate is the health metric of U-16 and
  therefore of the product's iteration speed.
- **Capture telemetry is aggregate and anonymous** — dropped frames, upload
  backlog, recovery events. Never content, never faces, never audio (D-03).
- **Quotas are transparent.** Storage, render minutes, and retention are shown
  before they are hit, never enforced by silent failure during a recording.

---

## D-12 · Internationalisation

The map's examples are English. The product is not.

- **Transcription, captions, and search are multilingual** from the schema
  outward; `language` is recorded per transcript and per take (U-03).
- **Right-to-left layouts** are supported in the UI and in the compositor —
  U-18's scene graph carries writing direction, so lower-thirds and quote
  cards mirror correctly rather than breaking.
- **Caption typography** accounts for scripts with different line heights and
  for CJK line breaking. The legibility floor (U-19) is defined per script.
- **Translated captions** are a v2 feature; the word-level schema (U-03)
  already accommodates them.

---

## D-13 · Design Principles

- **The video is the interface.** Chrome recedes during playback and recording.
  Nothing competes with the frame while the user is thinking.
- **One key, then everything else** (U-27). Depth is available; it is never
  required (U-28).
- **The document is always visible.** The user can see what the system recorded
  about their intention — anchors, types, quotes — because the product's claim
  is accountability and it applies to the product itself.
- **Never a spinner without a number.** Long operations report real progress
  and real remaining time (U-23).
- **Speaker identity is one system** (U-20), everywhere, carried by shape and
  position as well as colour.
- **Destructive actions are reversible.** Re-record keeps takes (U-06), delete
  is undoable, history is append-only (U-25).

---

## D-14 · Technology Decisions

Recorded so they are decisions rather than accidents. Each is revisable; none
is revisable silently.

```
Web application      Next.js (App Router) + React + TypeScript
                     — matches §31; strict TS, no implicit any

Data                 PostgreSQL
                     — matches §31; the document stored as validated
                       JSONB with a versioned schema (U-25), relational
                       tables for everything queried (U-24)

Object storage       S3-compatible, private, signed URLs (D-06)

Job queue            durable, idempotent by plan_hash (U-16, U-23)

Render engine        FFmpeg in isolated workers (D-06), never in the
                     web tier; GPU encode optional and must produce
                     output equivalent to CPU within golden tolerance

Capture              MediaRecorder + getUserMedia/getDisplayMedia,
                     timesliced and streamed (U-06, U-26)

Transcription        pluggable ASR behind one interface; word-level
                     output mandatory (U-03); no engine lock-in

Preview              client-side low-res preview; server-side final
                     — both consume the same render plan (U-16), so
                       they cannot drift apart
```

**The render plan is the contract between preview and final.** Two renderers
are acceptable only because they read one plan. If they ever diverge in
interpretation, that is a defect of the highest severity — the user's preview
is a promise about the export.

---

## D-15 · Definition of Done

A feature is done when all of the following are true. Not most.

```
□ It honours the non-negotiables (D-01)
□ It uses the ubiquitous language (D-02)
□ Its invariants are asserted in code (D-09)
□ It is keyboard reachable and screen-reader correct (D-04)
□ It meets its performance budget (D-05)
□ It cannot lose user work (D-07)
□ If it touches a render: golden tests updated and passing (D-10)
□ If it touches a source: rights class enforced (U-01, U-35)
□ If it touches AI: labelled, attributed, human-accepted (U-15)
□ If it touches an export: captions + attribution present (INV-07)
□ It degrades legibly when it fails — never silently
```

---
---

# APPENDIX A — INDEX OF UPGRADES

| ID | Applies to | Upgrade |
|---|---|---|
| U-01 | §4 | The Two Source Classes — Governed vs Embedded |
| U-02 | §5 | Ingest normalisation to house format is mandatory |
| U-03 | §5 | Transcript is word / sentence / paragraph |
| U-04 | §7 | Pre-roll — the interrupt never clips the first words |
| U-05 | §7 | Composite anchors survive re-transcription |
| U-06 | §8 | Takes, chunked streaming, and never losing one |
| U-07 | §9 | Frame-exact resume |
| U-08 | §10 | Two clocks, never confused |
| U-09 | §11 | Interrupt after the sentence, not on it |
| U-10 | §12 | The claim–response pair as signature object |
| U-11 | §13 | Type drives presentation |
| U-12 | §14 | Annotations are vector, timed, resolution-independent |
| U-13 | §15 | The freeze frame bridges Class A and Class B |
| U-14 | §16 | The intellectual record is a product |
| U-15 | §20 | The AI boundary as an enforceable rule |
| U-16 | §22 | The render plan is explicit, versioned, deterministic |
| U-17 | §22 | Audio mastering — the map's largest omission |
| U-18 | §23 | Layouts are a compositor, not presets |
| U-19 | §24 | Captions are accessibility first |
| U-20 | §25 | One visual language for speaker identity |
| U-21 | §27 | Attribution is generated, not optional |
| U-22 | §29 | Vertical is a different edit, not a crop |
| U-23 | §31 | The render tier is isolated and queued |
| U-24 | §32 | The data model, completed |
| U-25 | §33 | The document — versioned, append-only, portable |
| U-26 | §34 | Capture quality is decided at capture time |
| U-27 | §35 | One key. The whole product. |
| U-28 | §36 | Live Mode never requires Studio Mode |
| U-29 | §38 | The commentary session is a teleprompter studio |
| U-30 | §39 | Publish-ready metadata is part of the render |
| U-31 | §40 | Every published conversation is itself a source |
| U-32 | §41 | Education is the beachhead market |
| U-33 | §44 | Evidence must be archived, cited, shown precisely |
| U-34 | §45 | Research enters as evidence, never as assertion |
| U-35 | §46 | Rights, made structural |
| U-36 | §49 | Four additions the MVP cannot ship without |
| U-37 | §50 | Evidence and article transcript promoted to v2 |
| U-38 | §52 | The consequence of the big idea |
| U-39 | §31 | The editing proxy, and preview/render frame parity |
| U-40 | §16 | The article quotes; it does not reproduce |

---

# APPENDIX B — WHAT CHANGED IN THE PLAN

Scope moves the upgrades make to §49–§51. The map's phasing is otherwise kept.

**Into MVP** (from v2)
- Captions — inaccessible exports are unpublishable *(U-19, U-36)*
- Pre-roll capture, crash-safe recording, loudness mastering — not polish;
  without them the MVP cannot be shown *(U-04, U-06, U-17)*

**Into v2** (from v3)
- Evidence attachments — the product's identity, cheaply bought *(U-33, U-37)*
- The article transcript — nearly free from the document *(U-14, U-37)*

**Narrowed, until accounts exist** *(U-31 §40)*

U-31 says a published conversation is a Class A source and **"anyone can open
it and respond to it."** On a deployed instance the first half holds exactly:
a published conversation, its article, its manifest and its media are readable
by anyone, with no sign-in.

The second half does not, yet. Responding creates a conversation and uploads a
recording, and this build has one owner and no accounts to attribute either
to — so an anonymous response is an anonymous write to a public instance,
which is the thing authentication exists to stop. Responding therefore
requires the owner's session.

This is a narrowing of the clause, not a reinterpretation of it. When accounts
exist, "anyone" means "any signed-in person", the write is attributable, and
U-31 is satisfied as written. Until then the gap is stated here rather than
quietly left in the code.

**Out of MVP** (to v2)
- YouTube / Class B sources — arrive with the Conversation Manifest, which is
  substantial work and must not ship as a broken composed export *(U-01, U-36)*

**New, with no prior home**
- The share card — what a published link says about itself *(U-31, §52)*
- The opening of a clip, chosen by the author *(U-22 §2)*
- Caption looks, as a checked list rather than a styling panel *(U-19 §2)*
- The Conversation Manifest — the Class B export format *(U-01)*
- Vertical clip sets per claim–response pair — the distribution engine *(U-22)*
- The publication bundle *(U-30)*
- Published conversations as sources — the network, for free *(U-31)*
- The source intake journey — choose, prepare, enter *(§40)*
- The conversation as audio — one representation derived from another, with
  what listening costs it said in a number *(D-16, U-22)*

---

---

# APPENDIX C — WHAT IMPLEMENTATION TAUGHT THE DOCTRINE

Recorded because the amendment rule requires it, and because a doctrine that
never learns anything from being built is decoration.

**U-39 — the editing proxy.** The doctrine described a preview path without
saying what the editor plays. Building it exposed the real requirement, which
is not performance but *agreement*: the player and the renderer must share a
definition of frame N. Now INV-13.

**The frame the master pass invents.** Constant-frame-rate conversion emits an
extra frame wherever a concat boundary leaves a ragged timestamp — and AAC
frames quantise to 1024 samples, so boundaries are always slightly ragged.
Pinning the frame count instead truncates the last real frame. Neither is
acceptable under INV-02. The fix is to regenerate each timestamp from its own
frame index and pass frames through one-for-one. **A cut is exact only if
nothing downstream is permitted to resample it.**

**Concatenating captured segments.** A rolling pre-roll buffer cannot be a ring
of bytes: MediaRecorder writes its header into the first blob only. Nor can the
segments be joined with ffmpeg's concat *demuxer*, which trusts container
timestamps that browser-captured WebM does not carry — it silently keeps the
first segment and drops the rest, losing everything the user said after their
first few seconds. Only the concat *filter*, which decodes and rejoins frames,
is safe for captured media. **Anything that "silently keeps the first part" is
a data-loss bug wearing the costume of a formatting bug.**

**The segment that closes after the take is over.** Both recorders in this
product uploaded a segment from the MediaRecorder's `onstop`, and both read the
current take out of a ref to find out where to send it — and both cleared that
ref *before* stopping the recorder, because stopping is how a take ends. So the
final segment of every take, up to four seconds of somebody talking or singing,
was recorded, closed, and thrown away. Nothing failed: the take assembled
cleanly from the segments that survived, with a duration that looked plausible,
and the only test watching asked whether a seven-second take was longer than
three seconds. The upload now happens unconditionally, the segment's number is
reserved when it OPENS rather than when it closes, and the take is finalised
only once that last upload has landed rather than after a guessed wait.
**U-06 says a take is never lost; the way a take is actually lost is one
segment at a time, at the end, in a branch that looked like a guard.**

**A mark follows the picture, or it points at something else.** Annotations
were mapped into the panel the source occupies, which is most of the work and
looks right until the export crops. A vertical render crops the source to the
region the author's own marks describe (U-22 §3) — and the marks were not
cropped with it, so the circle ended up around whatever the crop happened to
leave in that part of the frame. A blur is a privacy tool, so the same gap
uncovered the thing it was hiding. The transform now runs through the focus
crop and the fit, in the plan, once: **a coordinate is only meaningful with the
space it was measured in, and "normalised" names a number without naming the
space.**

**Publishing publishes one artefact, not a directory.** Both studios' render
routes asked "is this published?" and then served any file the caller could
name a hash for — every draft render, every shape exported and thought better
of, and in the Performance Studio the private copies made under the rights
exemption. Neither route was wrong about authentication; both were wrong about
scope, in the same place, a month apart. The fix is one line in each: a
non-owner gets the render the publication NAMES. **An access check answers "may
you be here"; it does not answer "may you have that", and a route that asks
only the first question is open by the width of whatever else is on disk.**

**A representation derives; it does not compose a second time.** [D-16, INV-00]
The audio export is one pass over a finished render: its sound, re-mastered to
where spoken word is mastered, with chapters written into the file. The
tempting design was an audio pipeline that assembled the takes itself — it
would have been simpler to write, and it would have been a second composition
of one conversation. Two compositions eventually disagree about where a cut is,
inaudibly, until somebody notices half a sentence missing. **The shortest path
from the Conversation to a representation is not always through the
Conversation: when one representation is already a faithful projection, the
next one derives from it.**

**And a representation that loses something says so, with a number.** A
response that circles a road on a map does not survive being heard: the words
are all there and the subject is not. The product could have said "audio may
not suit every conversation", which is a caution nobody reads. It counts
instead — how many of THIS author's responses mark the frame or show a
document — and says "3 of your 7 responses point at something on screen". The
count comes from the document, so it is a measurement. **A warning about
content in general is decoration; the same warning about the thing in front of
you is information.**

**A rule belongs to the medium that has it.** The publication bundle emits NO
chapters when the list would be under three entries or would not begin at zero,
because YouTube silently ignores such a list and something ignored is worse
than nothing. The audio export read its chapters from the bundle, inherited
that veto, and produced an MP3 with no chapters in it — for a conversation that
had two perfectly good ones, which is exactly the length a listener most wants
to skip around. The chapter list and the platform's opinion of it are now two
functions: `mergedChapters` is the conversation's own answer, and the
description box is the only caller that has to satisfy anybody. **D-16 says
representations derive from one source of truth; it does not say they inherit
each other's constraints, and a shared helper is where the two get confused.**
Found by the browser run, not by a unit test, because every unit test agreed
with the bundle.

**Believed formats are not formats.** ID3 chapters were going to be written on
the strength of knowing that ffmpeg supports `-f ffmetadata`. What that
actually requires is the metadata file as a second input, `-map_metadata 1`,
and `-write_id3v2 1`; without the last of these the chapters are computed,
passed, and silently dropped. It was checked with ffmpeg and ffprobe before a
line of it was written, and there is a render test that probes the chapters
back out of the MP3. The same lesson as `xfade`, in a different corner: **a
container feature is not supported until you have opened the file and found
it there.**

**Measuring, not assuming.** Every duration in this system that came from a
container header was wrong at least once. Pre-roll length, take length, source
length: all are now measured by decoding. U-02 said this about sources; it is
true of everything the browser produces.

**Two passes for loudness.** Single-pass `loudnorm` lands about a decibel off
and can overshoot true peak. It passed a ±1.0 LU test and failed the doctrine's
own ±0.5. The tolerance in the document was right and the convenient test was
wrong. **When an implementation cannot meet the doctrine, fix the
implementation, not the doctrine.**

**A golden test must test the property, not an accident of the output.** The
frame-exactness test told source frames from response frames by sampling a
pixel — which worked only because responses happened to be rendered
full-screen. The moment the compositor filled the empty canvas behind a
side-by-side layout with a blurred copy of the frozen source frame (a plainly
correct improvement: flat black bars read as a mistake), every output frame
started decoding as a source frame and the test failed. The test was right to
fail and wrong in how it looked: it now pins the layout it depends on and says
why, and the composite path has its own test. **When a correct change breaks a
test, the test was asserting something it was never supposed to be asserting.**

**A response must go on answering the thing it answered.** When a published
conversation becomes the source of a reply, the published render is COPIED into
the reply rather than referenced. Referencing looks cheaper and is wrong: the
author of the original can edit it, re-render it, withdraw it or delete it, and
a reply whose source moves under it is answering something nobody ever said.
The same reasoning makes lineage a stored chain rather than a lookup, and it is
why withdrawing a conversation leaves existing replies intact — they answered a
version that existed and was consented to, and breaking other people's work
would be the greater harm.

**Timing inside a response belongs to the response, not to the recording.**
Annotation and evidence windows were stored as positions in the take's media
clock. A take is one *attempt* at a response; the response is what the author
means. So trimming the head, or switching to a re-record with a different
amount of pre-roll, silently moved every mark and every citation somewhere
else — or out of the video entirely. The marks stayed in the document and
simply stopped appearing, which is the worst way for work to go missing (D-07):
nothing errors, nothing is reported, and the author finds out by watching the
export. Windows are now offsets into what the author kept, so they survive both.

**A mark can only be drawn where the thing it marks is.** Annotations are
statements about the source frame. When the layout showed no source frame — an
evidence panel filling the picture, a full-screen response — the renderer fell
back to the whole canvas and drew the mark on whatever happened to be there. A
circle meant for a chart landed on a document the author never marked. Where
there is no frame, there is no mark.

**An assertion about the interface is not an assertion about the behaviour.**
The companion player's test waited for the words "Response —" to appear and
called that passing. They appeared. The response did not play: the browser
could not decode it, the element sat at `readyState 0`, and the state machine
advanced past a video nobody could see. The check was measuring the label. A
test that watches the UI must assert the thing the UI is claiming — here, that
the element has media and its clock is moving.

**A published artefact cannot assume the viewer's codecs.** That failure was
real, not an artefact of the test environment: whether a browser can decode
H.264 is a licensing question, and the Conversation Manifest is something other
people open. Response media is now offered as both the mezzanine and a widely
decodable proxy, and the player takes what it can actually play — the same
reasoning as U-39, applied to the exported experience rather than the editor.

**Build the special case for the ordinary case too, or you cannot test it.**
The Conversation Manifest exists for Class B, where the provider's player is
the only way the source can be shown. Built that way it would have been
untestable here, since this environment cannot reach a provider at all. Giving
a Class A conversation a manifest as well -- driving our own player instead of
a provider's -- made the companion experience buildable, testable and, as it
turns out, genuinely useful: a governed conversation now has a shareable player
alongside its composed video. **A path that exists only for the case you cannot
exercise is a path that does not work.**

**A layout that reflows must reflow its typography too.** Captions were sized
from the canvas height, which is correct on a 16:9 export and doubles the type
on a 9:16 one — on a canvas half as wide. The subtitle renderer also had word
wrapping switched off, so instead of breaking, a caption simply ran off the
side of the picture. Both were invisible until a vertical clip was actually
looked at. Type is sized from the **narrower** dimension, because legibility is
about how much of the frame's width a line occupies. **U-18 says layouts are
data; the type is part of the layout.**

**An unconsumed filter output fails the whole graph.** ffmpeg does not warn
that a `split` output nobody reads is unused — it refuses the entire
filtergraph with "Error binding filtergraph inputs/outputs", pointing at
nothing in particular. The blurred backdrop split the frozen frame in two and
one half went unread whenever the layout did not ask for a blur. **Build the
graph from what is consumed, not from what might be.**

**A stub is not a failure.** Stopping a recorder milliseconds after it starts
yields a WebM header with no frames, which happens whenever a user interrupts
right on a segment boundary. The worker treated that 40-byte fragment as a
corrupt take and failed the whole recording. One unreadable stub must never
cost a take: it is worth nothing, and the take is worth everything (D-07).

**A control that only commits on mouse-up is broken for half its users.** The
trim sliders saved on `mouseup`, so a slider adjusted with the arrow keys —
the only way a keyboard user can adjust it — silently never saved. It looked
like it worked, because the value moved on screen. D-04 says every interaction
must be keyboard reachable; reachable is not the same as **usable**, and the
difference hides in exactly this kind of handler. Commit on pointer-up, key-up
and blur.

**Finish before you finalise.** The take was finalised while its last segment
was still uploading, silently discarding the end of every response — the most
recently spoken words, and the ones the user cared about most. Found only by
driving the real browser. **An end-to-end test is not a slower unit test; it is
the only thing that sees the races.**

**There is no sequence to rearrange.** "Let the author reorder responses" is
the obvious editing feature and this product cannot have it, because order is
derived from the anchor and never stored (U-08). A stored order would let a
response sit somewhere other than the moment it answers, which is precisely
the thing the product exists to make impossible. So reordering IS moving when
a response answers, and the timeline says so by making the response itself the
handle: drag it along the source and it moves in the conversation, because
those are one act.

Moving is destructive in one specific way, and the interface says so before
it happens rather than after: a response carrying a quoted statement loses
the quote, because a quote that travels to a moment it no longer describes
misquotes a real person (U-05). The recording is untouched, and the warning
says that too — most of the fear in a destructive confirmation is not knowing
what survives.

A consequence that only appeared once it was built: a move invalidates the
publication thumbnail of "the moment you stopped at", which is stored under a
name that does not change. A stale file would be served as a current one, so
the move removes it and the next export regenerates the set. **Derived things
must be invalidated by the thing they derive from, and a filename that does
not change when its contents should is a trap.**

**The frame is the shape of the picture.** Capping the player's height while
its box stayed full width made a frame wider than the video, so the player
filled the difference with black — bars inside a border, which looks like a
bug because it is one. The fix is to take the ratio FROM the media: read the
source's own dimensions when it loads, and let the frame be that shape. A 4:3
source gets a 4:3 frame, a vertical one gets a vertical frame, and nothing is
ever letterboxed inside its own container. **A container that imposes a shape
on its contents will eventually be given contents of another shape.**

**A workspace is not a document.** The studio was laid out the way a page is:
content from the top, running as far down as it happened to run, the rest of
the window empty below it. That is correct for an article and wrong for an
editor, where the window IS the instrument. The shape the product wanted is a
bar, a stage that takes every pixel the bars do not, and the controls along
the bottom edge — the page itself never scrolling, and the parts with more
than fits scrolling inside themselves. Two habits caused the original: sizing
the picture in `vh` (a guess about the window, wrong on every window that is
not the one it was guessed for) and letting the height of the content decide
the height of the screen. **In an application the window decides; in a
document the content decides. Knowing which one is being built is the whole
question.**

**Sizing by height and sizing by width are different decisions.** The same
stage appears in Live, where it owns the window, and in Studio, where it
shares a column with a timeline and a set of panels. Filling the height is
right in the first and produces gutters either side in the second; filling
the width is right in the second and would push the timeline off the screen
in the first. Dead space moved is not dead space removed, so the stage takes
which way round it is being sized as an argument rather than guessing from
its own dimensions.

**The way in sets the tone for everything after.** Creating a conversation
was a form: title, creator, source URL and rights basis, all asked before the
person had seen anything. It was a database record being filled in, and it
told everyone what kind of product this was before the product had said a
word. The same fields, asked in the same session, read completely differently
once they come after a picture of the video — so the intake became a journey
(choose, prepare, enter) with provenance under a disclosure on the second
step. Nothing was removed: the creator, the link and the rights basis still
reach the attribution block on every export (U-21, INV-07). **What a product
asks first is a statement about what it is for.**

**We had the title all along and never asked for it.** Class B conversations
were called "YouTube video Jt_snoCkMas" because `oembedUrl` was computed in
the provider module and then never fetched. An identifier is not a title, and
the preparation screen cannot show someone what they are about to answer
without one. Reading the provider's own oEmbed endpoint — through the SSRF
guard (D-06), and treating a provider that does not answer as a conversation
that still works — was a few lines. **A field that is derived but never read
is a feature that was designed and not finished.**

**An unmounted file input releases the file it is holding.** The preparation
screen draws its own poster by decoding one frame of the chosen file in a
canvas, which needs nothing to leave the machine. It showed black instead,
because moving to the second step unmounted the hidden `<input type="file">`
that held the `File`, and the object URL made from that `File` stopped
resolving. The picker now lives outside the steps. Worth recording because
the symptom — a black rectangle — looks like a decoding problem and is
a lifetime problem. (The same screen shows black in the end-to-end run for an
unrelated and legitimate reason: the test browser ships without H.264, and
the fixture is H.264. A real browser decodes it.)

**The floor is a state, and the interface should show it changing.** The claim
card began as one shape with a bound/unbound variant. What it actually has is
a sequence — the source has the floor, then the author does, then the exchange
exists — and the card now says which. The ordering matters more than it looks:
the response exists in the document the instant recording starts, because that
is what makes it crash-safe (U-06), so a card driven by "is there a response
yet" flips to *answered by your critique* while the author is still
mid-sentence. **Who has the floor decides what the card says, not what the
document already contains.**

**The timeline should say what the card says.** A statement chosen but not yet
answered is a relationship with one end missing, and drawing only the chosen
end leaves the author to infer the other. The source lane now carries the
sentence as a band and the cut-in as a diamond, and the response lane carries
a dashed slot where the answer will hang — so pressing space fills a space
that was already visible.

**Hiding a bar hides what was in it.** With a statement chosen, the control bar
stopped repeating what space does, because the card was saying it. It was hidden
wholesale, which took the camera button with it — leaving the card telling
someone to enable a camera they could no longer reach. **Hide the duplicated
sentence, never the container it happens to sit in.**

**A missing picture must not look like a broken file.** The preparation screen
decodes one frame of the chosen video in a canvas. It can fail for reasons that
say nothing about the file — a provider that did not answer, or a browser
without a decoder for that codec — and a black rectangle in the place reserved
for the video reads as *your upload is broken*. There are three separate
questions here and only the third is the product's: can a real browser play
this, can THIS browser decode it, and is the fallback honest when it cannot.
The end-to-end run asserts the third, because the test browser ships without
H.264 and so always exercises it.

**Three rails, and each answers one question.** The Studio was a stage with an
accordion of panels underneath it, and the black space either side of the
video was doing nothing. What it wanted was a shape: LEFT what did I say,
CENTRE what will they see, RIGHT how do I express it, BOTTOM when does it
happen. Nothing in the engine changed to make that possible — the layout was
already `intervention.layoutId`, the marks were already
`intervention.annotations`, and the render was already regenerated from them
(INV-00). **Most of what looked like a missing feature was a missing place to
put the feature.**

**A composition is not a second data model.** The rails describe one
intervention and write to its own fields; there is no editor document, no
project file, no parallel notion of a clip. That is what makes every choice on
the right rail changeable long after the recording, and it is the same
property INV-00 gives the article and the manifest: presentation is a
representation of the Conversation, and the Conversation is the thing.

**Marks belong on the composition, not on the source frame.** Annotations are
canvas coordinates (U-12) — the renderer draws them over the whole composed
frame. So a circle placed on a full-bleed source still and then exported side
by side appears somewhere the author never put it, because the source has
moved into half the frame and the mark has not. The marking surface therefore
shows the composition, and the author marks that. Found by building the
preview, not by reading the renderer: the geometry only becomes obvious when
the two are on screen together. **Whenever an editor and a renderer both
decide where something is, they must be reading the same numbers.**

**A layout diagram should be drawn from the layout.** The six composition
choices render their own layers' rectangles rather than six hand-drawn
thumbnails, so a layout whose geometry changes gets a picture that changes
with it, and a layout added to the data appears here correctly without anyone
remembering to draw it (U-18).

**Point is the only mark defined by one coordinate.** Every other drawing
derives its extent from two, which is why adding it needed its own case in
three places — the required-points table, the ASS path, and the draw-on wipe,
which measures the points and therefore had nothing to measure. It is drawn as
a ring rather than a dot on purpose: a filled dot covers exactly the pixels
being discussed, which is the one place on the frame a mark must not be.

**An explicit choice is stored explicitly.** Clicking a layout that happens to
match the type's default first stored nothing, on the reasoning that the
default already produced it. But then changing the type later silently moved a
composition the author had already decided. **A default is what happens when
nobody chose; it is not a place to record that somebody did.**

**A test that edits shared state and does not undo it breaks other tests.**
The new rail checks set a layout override and left a mark on an intervention
three later sections read, and all three failed describing symptoms that had
nothing to do with them. The same run also had a check go green without
anything happening, because it asserted a layout the response was already in.
**Assert a change, and put the state back.**

**Announce nothing until everything it promises exists.** A take's duration
going above zero is what tells every surface its still exists, and the worker
was writing the duration first and the still a moment later. Every poll landing
in that window got a 404 — and a client that drops a broken image never asks
again, so the still was missing for the rest of the session although the file
arrived a second afterwards. It looked like flakiness and was an ordering bug.
The poster is written before the duration now, and the timeline retries a
still rather than giving up on it forever. **A record that says a file exists
must be written after the file.**

**"Preparing", forever, is the same screen as "failed".** A take whose
assembly threw looked exactly like one still in the queue: the word preparing,
no reason, nothing to do. The job record had the state and the error all
along — the interface simply never read it. It now distinguishes waiting,
preparing and failed, says what happened to the recording, and offers to try
again, which works because the chunks the author spoke are still on disk
(U-06). **Work a person did is not allowed to disappear into a spinner (D-07).**

**Say what cannot be done, where the doing would be.** An embedded source is
played by its owner and never downloaded (U-35 §6), so there are no frames of
it to place a response beside, to mark, or to cut into one file. The Studio
offered all three anyway: a composition rail whose layouts changed nothing
visible, and a "finished video" bar reading *100% source material* over a
runtime taken from someone else's player — describing a file INV-01 forbids
ever producing. Both now say what publishes instead. **A control that cannot
work is worse than an absent one, because the person will spend their time
deciding it is broken rather than learning what the product does.**

**A flag answered the wrong question.** "Preparing responses…" showed on a
conversation with no responses, because a source whose duration was not yet
known counted as work in progress. The video getting ready and the author's
recordings being assembled are two different things, and one boolean was
standing for both. Counting the second, and polling on either, separated them.

**The second dead field.** Every layout carried a `verticalLayoutId`, and
nothing anywhere read it. A 9:16 clip was therefore rendered with the 16:9
arrangement — `side_by_side` on a tall canvas is two postage stamps in a band
of blur — while the export profile said 1080×1920 and every test agreed it
was vertical, because every test checked the dimensions. This is the same
shape of hole as the provider's oEmbed URL being computed and never fetched.
**Twice now, the missing feature was a field that was designed, stored and
never consulted; the test that catches it asserts the consequence, not the
setting.**

**A format is a shape, not a name.** The four publication formats sort into
four families — landscape, square, portrait, tall — because what a layout
needs to know is how wide the canvas is, not which platform it is for. 4:5
and 1:1 want the same arrangement as each other far more often than 4:5 and
9:16 do, and binding layouts to named profiles would mean editing every layout
to add a format.

**The meaning has to survive the reframe, not just the pixels.** Stacking the
panels is the easy half. The hard half is that a wide frame contained in a
narrow panel is a strip in which the thing being discussed is a few pixels
across — technically the same picture, and useless. The author has already
said where to look: they pointed at it, circled it, drew an arrow to it. A
reframed panel crops to the union of those marks, which means no new field to
fill in and no second place for the answer to live. Blur marks are excluded,
because a blur says *do not look here* and cropping towards the one thing
being hidden is precisely backwards.

**The preview and the renderer must crop with the same arithmetic.** Sharing
the function was not optional but it was not free either: the planner pulls in
hashing and export profiles, none of which can cross into a browser bundle,
and importing it into the editor broke the build on `node:crypto`. The shared
geometry moved to a module with no such dependencies. **When two sides must
agree on a number, the thing to share is the number's definition, and it has
to be portable enough to be shared.**

**Publish is a stage, not a drawer.** Export was a panel at the bottom of the
Studio column, which said that publishing is an afterthought of editing. It is
the third act: Live is where the conversation happens, Studio is where it is
composed, Publish is where it becomes the forms in which it travels — four
video shapes, a clip per exchange, an article, captions, a manifest. All of
them are representations of the same Conversation (INV-00), which is why they
belong in one place and why none of them is a separate edit.

**A key belongs to the mode that owns it.** Space starts and stops recording,
and it also scrolls a page. On a stage full of formats and clips it must do
the second, so the handler asks which stage is showing — through a ref,
because it is registered once and would otherwise read the mode it was
registered with.

**A citation you cannot show is not a citation you can teach from.** Evidence
was archived, hashed and stored for every format, and rendered for exactly
five: PNG, JPEG, WebP, GIF, AVIF. A PDF came back *"stored and hashed; this
build cannot render a page of this format"* — verifiable, and invisible. The
locator had carried `page?: number`, commented "1-based, for paged documents",
since it was written. Rasterising the pages is what made the number mean
something.

**A deck is one citation with many pages.** It was retrieved once, hashed once
and cited once; splitting it into forty attachments would give a lecture forty
citations of the same document and no way to say which page. Which page is on
screen is a property of the moment being spoken — which is precisely what the
locator is for. The page falls back to a real one rather than to nothing: a
citation pointing past the pages prepared is still a citation, and a blank
panel tells the viewer nothing about why it is blank.

**Use the engine already in the image.** Rasterising a PDF is normally poppler
or ghostscript, and neither is installed. Chromium is — it archives web
evidence — and pdf.js draws a page onto an ordinary canvas. Running it in the
browser we already ship costs no new binary and gives no second answer to
"what does this page look like". PowerPoint goes through LibreOffice to PDF
and then the same path, so a deck and a PDF arrive at the compositor
identically; LibreOffice is optional, the code asks whether it is present, and
a build without it says *export it as a PDF* rather than accepting slides and
producing nothing.

**Teaching from a page has two moments.** Here is the document, this is the
part I mean — and then the part itself, large enough to read, while the
speaker talks over it from the corner. The second is not a new feature: it is
the same region zoom in a layout where the evidence panel takes the screen
(U-18). What looked like "add a callout renderer" was two rectangles.

**A temporary filename must not lose what the file is.** Uploads were saved as
`<assetId>.upload`, and the archiver decides how to make pages by looking at
what it has — so a PDF came back saying its format could not be rendered, by a
build that renders it perfectly. The extension is kept now, sanitised, and the
first bytes are sniffed as well, because a mis-named PDF is still a PDF.

**The key that runs the conversation cannot also turn the page.** Space ends a
take, and space scrolls a document. A teacher reading their notes would have
stopped their recording by turning the page. The reader takes the key in the
capture phase while it is open, and the conversation's own handler stands down
for it — and for anything contenteditable, which the INPUT/TEXTAREA test alone
missed. The capture itself was never at risk: recording is a MediaRecorder
over the camera stream and nothing in the document reaches it. **The danger
was never the pixels; it was the keyboard.**

**Read in the tab, not beside it.** A take survives a crash because a new
recording segment starts every few seconds (U-06), and that rotation is a
timer, which browsers throttle in a background tab. Alt-tabbing to a PDF
threatens the thing that protects the recording. Reading inside the page does
not — which is the argument for the panel existing at all.

**A stated limit is not an error.** A document stored and hashed but not
rasterised IS a valid citation, and writing that sentence into `archiveError`
marked a working attachment as broken. It has its own field now. **A field
named for failure will be read as failure, whatever you put in it.**

**A cleanup that samples after the act cleans up nothing.** The reader test
recorded a response to prove space still worked, then took the list of
responses to compare against — after creating it. The new one was in the
"before" list, the difference was empty, the cleanup removed nothing and
reported success, and a count three hundred lines later failed instead. The
same run had a frame-exactness check fail at two frames: it sampled a playing
clock over one round trip and pressed the key over another, then blamed the
product for the slack. It asserts against the frame the conversation recorded
now. **A test that measures its own latency will eventually report it as a
defect.**

**A claim card must not look like a verdict.** Selecting a sentence is the
author saying "this is what I am answering", and the interface should change
shape to say it back — the statement lifted out of the running text, given its
own moment and its own card, with the answer beneath it. That much is obvious
once seen.

What is not obvious is how easily that card becomes something else. A border
that reads as a warning, a word like "flagged", a score, a confidence bar —
any of them turns "you chose to answer this" into "the product has judged
this", and the product has no business judging it. The whole asset here is
that every word of the response is a human's and every statement answered was
one a human picked. So the card carries the source's own words, when they were
said, and a way to answer them, and nothing that grades them. **The product
establishes the subject of a response; it never establishes a verdict.**

The card is also not a second claim. It shows the text, the frame and the hash
the document already stores against the response — the same binding the render
burns on screen, the article quotes and the captions carry. A card with its own
copy of the claim would be two answers to "what is being answered", and the
one on screen would be the one nobody could trust.

**The doctrine is not the product.** Every identifier in this document — the
INV numbers, the U numbers, the section marks, "Class A" and "Class B" — was
leaking onto the creator's screen, because the code that enforces a rule is
also the code that reports it failing. "INV-01: cannot build a COMPOSED plan
for a Class B source" tells an engineer exactly what happened; it tells a
creator that they have done something wrong, which is false, and gives them
nothing to do about it. The same fact in product language is: this video stays
on YouTube, so your responses publish alongside it.

Both survive, written separately for different readers. The rule keeps its
code for the log, the audit trail and the tests; the person gets a sentence.
A test now asserts that no identifier from this document appears anywhere in
the studio, because the leak happened by accident and would happen again.

**Four panels of equal weight is an admin dashboard.** The first studio put
the transcript, the video, the camera and the export machinery side by side,
and the result read as "I am managing a video-processing project" rather than
"I am having a conversation with this video". Every element was defensible on
its own; the arrangement was not.

What fixed it was deciding what the screen is FOR at each moment. Live is
watch → interrupt → respond → continue, so Live is the video, a floating
camera, one line of state and one key — and everything else was removed from
it. Studio is where the same conversation is taken apart, so the transcript,
the statements, the evidence and the publishing live there. **A mode that
shows everything is not a mode.**

Two smaller things fell out of that. An empty black rectangle held open for a
camera nobody has enabled makes an application look broken before it has done
anything, so the camera appears only when it is live. And "arm the camera" was
never a thing the author should have to think about: the rolling pre-roll does
need the camera running first (U-04), so the consent moment stays — but the
ongoing state is "Listening", not "armed", because that is what it is.

**A search result you cannot answer is a worse transcript.** §43 describes
search as finding every mention and jumping to it, and the jump is what makes
it more than a text box — but the version worth building goes one step
further. Every result carries the frame it was said at, so the button next to
it can be *Respond here*: searching and interrupting become one motion instead
of two. The same reasoning ranks a claim the author bound above a passing
mention in the source's narration. They already decided that one mattered, and
a result list that ignores their own decisions is asking them to make them
twice.

Two details that only showed up in use. Bare terms must match on word
boundaries, or searching "art" lights up "start", "particular" and "heart",
and a list where most rows are noise is one nobody reads to the bottom of.
And diacritics fold, so "cafe" finds "café" — which is slightly wrong for
Swedish, where å and a are different letters, and still right overall: a
search box that misses the thing visible on screen is the one nobody opens
twice. Exact matches rank above folded ones so the distinction survives where
it matters (D-12).

**A default-open gate is not a gate.** The first sketch of authentication was
a list of routes to protect. That is the shape which fails silently: every
route added afterwards is public until someone remembers, and nobody
remembers. Inverting it — everything needs a session, a short allowlist names
what may be reached without one — turns the same forgetfulness into a locked
door instead of an open one. The test that matters is not "is /api/conversations
protected" but **"is a route nobody has thought about protected"**, and only
one of the two designs can pass it.

The same reasoning decides what an unconfigured instance does. With no password
set, this one serves nothing at all — not even published conversations, since
an instance with no owner has not published anything on purpose. An auth system
whose misconfiguration state is "everyone gets in" is not an auth system, and
the worst case of failing closed is an outage, which is recoverable.

**Authentication had to leave the door open.** U-31 says a published
conversation is a Class A source that anyone can open, so a wall around the
whole application would have made publishing meaningless. The wall goes around
everything the author has NOT published — and around the working material of
the things they have. A reader of a published conversation gets its manifest,
its article and its captions; they do not get the render plan, the timeline or
the publication bundle, because those describe how the thing was made rather
than what was published. **What a publication grants is access to the artefact,
never to the workshop.**

**The boundary had to be a type, not a check.** U-15 says AI may not generate
a response the user did not say, may not alter a source quote, may not assert a
verdict. Written as validation, each of those is a rule someone can forget to
call. Written as the suggestion payload union — which has no variant for
recorded speech, none for narration, none for a verdict — they are things that
cannot be expressed. A contributor who wants to generate the response audio in
the author's cloned voice has to delete something visibly load-bearing to do
it, which is exactly the cost U-15 wanted the boundary to have.

The same move settled where suggestions live. They are derived from the
transcript, so INV-00 says they are a representation and must not be stored —
and once only the author's DECISIONS are document state, "an unaccepted
suggestion cannot reach the article, the bundle, the manifest or a render"
stops being a filter every writer must remember and becomes a fact about the
shape of the document. **The strongest enforcement of a rule is an architecture
in which breaking it has nothing to attach to.**

**Recording a rejection is not optional.** The first design stored acceptances
only. That makes "the author considered this and said no" and "the author has
not seen this yet" the same state, so every dismissed suggestion returns on the
next detection run and is dismissed again, forever. A suggestion engine that
cannot be told no is one nobody opens twice. It also forced the decision key to
be derived from content rather than from a run, which turned out to be the
right identity anyway: a re-transcription that changes the WORDS correctly
produces a new suggestion, and one that only changes timings does not.

**A detector that fires on everything has told you nothing.** The end-to-end
fixture's speech is literary narration, and the claim finder returns nothing
for it — correctly, because Hawthorne asserts no checkable facts. The
temptation to loosen the rules until the browser test found something was
real, and taking it would have made the product worse in exactly the way that
matters: an author who cannot trust the list stops reading it. The test now
asserts the silence, and the accept-and-bind path is proved against a source
that does assert something. **Tune the test to the product, never the product
to the test.**

**`-ss` does not land on a frame; it lands after one.** The thumbnail grab
seeked to the middle of frame N — the obvious reading of "grab frame N" — and
ffmpeg dutifully returned frame N+1, because a seek yields the first frame at
or *after* its target. Every test passed: each one asserted that a PNG existed
and was large enough to be an image. The bug was visible only by decoding the
pixel and reading back the index the fixture had encoded into it.

Two things follow. First, **INV-02 is not only about cuts.** A thumbnail is a
promise about which moment the author chose, and one frame off is a promise
about a moment nobody chose — smaller in consequence than a mis-timed resume,
identical in kind. Every frame this product selects on the user's behalf is
governed by frame-exactness, not only the ones that end up in the timeline.

Second, **"the file exists" is not an assertion.** It is the shape a test takes
when nobody has decided what the output should contain. Four of the defects in
this appendix were caught by looking at rendered output rather than by the
tests that covered the same code. Where a fixture can carry its own ground
truth — an index encoded as a colour, a counter burned into the picture — the
test reads it back, or it is not testing the thing it claims to test.

**A link that cannot describe itself is a distribution engine with a hole in
it.** §52 says the composition step is the growth loop, and the doctrine
listed every artefact the loop produces — the long video, the article, the
clips, the manifest, the bundle. It did not list the one artefact more people
see than all of those together: the preview a link becomes when somebody sends
it to somebody else. Until it existed, a published conversation pasted into a
message arrived as a bare URL with no title, no subject and no picture.

Three things follow, and the first is the one that nearly went wrong.

**The card is the easiest place in this product to lie.** It is read by people
who have not watched anything, so nothing on it is checkable by its reader —
which is the exact situation the product exists to argue against. So it quotes
a statement ONLY where the author bound one, because a bound quote hashes to
what the source said (INV-05). An inferred sentence is good enough to open a
clip on, because the clip then plays it and the viewer hears whether it was
fair; it is not good enough to set in quotation marks on a still picture that
plays nothing. **Quotation marks are a promise, and a promise is only as good
as the thing that can check it.**

**A preview is two renderings, so it needs one generator.** Hand-written
OpenGraph tags drift from the image beside them within a release — that is the
ordinary fate of every such tag ever written. So the card is registered as a
representation (`share-card.json`, D-16) and both the picture and the page's
metadata are rendered from it. This is the same discipline as the rest of the
registry, applied to the one artefact where nobody would have thought to
apply it.

**The card is drawn when the link starts existing, not when the video was
last exported.** The obvious place was beside the thumbnails, where a decoder
is already open. It is the wrong place, and only asking what the card is FOR
shows why: nobody can fetch a draft's card, so one drawn at export time serves
no one; and a conversation can change between its last export and being
published, which would leave the picture carrying an old statement while the
page's metadata carried the new one — the exact drift the single generator
exists to prevent. It is typography on a colour field and needs no decoder, so
it is cheap enough to redraw on every publish rather than reason about when it
went stale.

**Metadata runs before a page decides to 404.** A draft's preview is fetched
by whatever the link was pasted into, with none of the sender's cookies, and
`generateMetadata` had already produced a title by the time the page turned
the stranger away. So the question the card asks is whether the CONVERSATION
is published, never who is asking — and a draft has no preview for anybody,
its author included, because there is nothing published to preview (D-03).

**The most consequential editorial choice in the distribution engine was the
one the author could not make.** U-22 says a vertical clip opens on the
statement so that it reads with the sound off, and the implementation obeyed
it exactly: the product chose the words and the moment, and the author took
what they were given. But these formats are decided in their first second, so
the opening is not a detail of a clip — it is most of what a clip is. It is
now the author's: what it opens on, what it says, and how much source runs
before the cut.

Two things follow, and the first is the rule the feature is built around.

**QUOTATION MARKS ARE RESERVED FOR WHAT WAS SAID.** A statement card shows the
source's own sentence and the clip plays it a moment later — the viewer hears
whether the quotation was fair, and that is what earns the marks. A hook is the
AUTHOR speaking, over the source's own picture, and it is never quoted: in
quotation marks it would be a sentence attributed to somebody who never said
it, on top of their footage. So the flag travels from the document through the
plan to the subtitle script rather than being decided where the text is drawn,
and the panel where the author types a hook tells them, in words, that it will
not be quoted. This is the same rule the share card arrived at from the other
direction, and it is worth stating once as a general one: **the product may
quote only what it can also play.**

**An opening typed into an export dialogue is a forbidden shape.** D-16 already
named "a clip has a title that exists nowhere else", and a hook is exactly
that shape if it lives in the panel: it would survive until the next re-plan
and then quietly vanish. So it is a field of the Conversation. The clamps are
NOT: a lead-in longer than the source before the anchor is cut back when the
clip is planned, not when the choice is made, because the anchor can still
move and storing the clamped number would freeze a decision against a source
that has since changed.

**And a check that was guarded into never running.** The clip-plan assertion
read "if a plan came back, check its layout" — and no plan ever came back,
because the route did not answer that query at all. It passed every run for
weeks while asserting nothing. This is the second time this appendix has
recorded the same shape (see "the file exists" above), so it is worth naming as
a rule rather than an anecdote: **a check written to tolerate its subject being
absent will eventually be the only thing standing between you and a feature
that is entirely absent.** If a precondition is required, assert it; if it is
genuinely optional, the test is measuring something else.

**A caption style is a choice among legible looks, not a styling surface.**
U-19 §2 says "a user may choose the look; not an unreadable one", and that
sentence sat as a comment in the caption renderer for as long as there was no
choice to make. Building the choice is what made it a rule. The obvious
implementation — a size, a colour, a position — is the wrong one: captions are
the accessible form of what was said (INV-07, D-04), so a product that insists
on them and then hands over a colour picker has shipped a way to produce
captions nobody can read. What is offered instead is a short list of named
looks, each checked against a floor, and the floor is asserted over the TABLE
rather than over the entries that exist today, so a look added later cannot
quietly drop under it. There is deliberately no colour field at all: white on
a dark scrim is the one combination that holds over arbitrary footage, and the
alternatives are all worse.

**One of the three looks is about somebody else's product, and it earns its
place.** The bottom fifth of a vertical frame is where the app showing it puts
its own caption, handle and buttons. Captions placed there are covered — which
is a legibility problem, not a fashion, and it is why a tall export raises them
by default while a wide one does not. This is the line §52 draws in practice:
the platforms do not get to shape the product, but where their pixels land is
a fact about the world, and a product that ignores facts about the world is
not being principled.

**The renderer stopped choosing.** The caption size and position used to be
constants in the subtitle builder. They are resolved into the RenderPlan now,
like layouts (U-18), so the plan is a complete description of the export and
there is no second opinion at the point of drawing. The floor is still applied
in the renderer as well, and that duplication is deliberate: it is the one
property captions must have, and asserting it twice costs nothing next to
shipping an export nobody can read.

**A test that passed by comparing the wrong two numbers.** The check that a
lifted caption sits higher up the frame read the ASS style field at index 20 —
which is the horizontal margin, not the vertical one — and passed, because the
lifted look also has larger type and the horizontal margin is derived from the
size. It was counting commas. The fields are named now and looked up by name.
**Two wrong things agreeing is the most convincing kind of green.**

---

## Briefs held outside this document

Two specifications are recorded verbatim in files of their own, because they
arrived as briefs and editing a brief into doctrine loses the thing that makes
it worth having. Each carries its own appendix, which is where implementation
writes back.

- **[`ROOM.md`](ROOM.md)** — the Conversation Room. §1–§12, built, with
  Appendix R recording what each of the four stages cost.
- **[`STUDIO-TWO.md`](STUDIO-TWO.md)** — the Performance Studio. §1–§15, with
  **stages one to seven built**: the document and the music clock, alignment,
  scenes and live switching, the master render, §4's environments, §9's audio
  modes, §11's transitions and beat detection, §14's export — clips, the link
  preview, and the page a published performance is watched on — and §10's
  device calibration and drift measurement.
  Appendix S maps the brief onto this codebase and records the invariants it
  needed, which are now asserted in code:

```
INV-14  Every take's alignment to the master is stored in samples, is
        measured rather than assumed, and no stage resamples a take
        without recording that it did.                       [U-08, U-17]
INV-15  No published export contains a master track the author has not
        declared they may publish.                    [U-01, D-08, U-35]
INV-16  A performer is composited into an environment only where a
        matte was measured from a plate of their own room; the raw
        recording is never altered.                          [D-16, U-18]
```

A Performance is a second root document beside the Conversation, not a
Conversation with a flag: its takes are parallel rather than ordered, and its
master clock is the music. Everything below the document — assets, the queue,
layouts, export profiles, the publication system — is shared.

---

*End of doctrine. Amend by extension only (see "Amendment rule").*

---

## D-16 · The Representation Rule, Applied

`INV-00` (Part 0) is the master invariant. This section is how it is enforced
in day-to-day engineering, because a principle with no enforcement procedure is
a slogan.

**Every representation declares itself.** A representation is any artefact
generated from the Conversation: the composed MP4, the Conversation Manifest,
the article transcript, caption sidecars, vertical clips, the publication
bundle, chapter lists, thumbnails, the timeline projection, search indices.

Each one registers three things:

```
generator   pure function: (conversation, profile) → representation
inputs      exactly which fields of the Conversation it reads
rebuild     a command that regenerates it from scratch
```

**The rebuild test runs in CI.** For every fixture conversation, every
registered representation is deleted and regenerated, and the result must match
byte-for-byte or within its declared tolerance (U-16, D-10). A representation
that cannot survive deletion is a fork and fails the build.

**Reviewer's question.** Any change that adds a field asks: *does this belong to
the Conversation, or to a representation?* If the answer is "the representation,
because the Conversation does not have a place for it" — the Conversation gains
the place. That is the whole discipline.

**The forbidden shapes**, named so they are recognisable in review:

```
✗  the article stores an edited paragraph the video does not have
✗  the manifest stores its own cut points
✗  captions are corrected in the caption file, not the transcript
✗  a clip has a title that exists nowhere else
✗  a render is patched rather than re-planned
✗  the timeline projection is written to directly
```

Each of these is the same mistake: **editing the shadow instead of the object.**

**The knowledge layer is not an exception.** Transcripts, claims, evidence,
citations, and chapters live *in* the Conversation, not in the article. The
article is a rendering of them, exactly as the MP4 is a rendering of the media
timeline. The two faces of the Conversation in Part 0's diagram are projections,
not stores.
