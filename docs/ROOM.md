# THE CONVERSATION ROOM — the specification, as given

This document is the brief for the Conversation Room, recorded verbatim as it
was given, so that nothing is lost to a summary. Implementation follows it a
stage at a time; where a stage is done, it is marked in **Appendix R** at the
end of this file, which is the only part of this document Claude writes.

The rule for this file: **the brief is not edited, compressed or reordered.**
If something in it turns out to be infeasible, or to contradict an invariant
the product already holds, that is written in Appendix R as a stated conflict
with a proposed alternative — never by quietly dropping the item.

---

## The brief

What you're describing is essentially a Conversation Room: people can enter the
room, remain available, and the host decides who is currently part of the
visible conversation.

The key distinction is:

Being in the room ≠ being on the main stage.

That is a very powerful model.

### The experience

Imagine you are watching a source video with Prof Class.

You click:

+ Invite

You get:

Invite people to this conversation
Share this link:
[ Copy invitation link ]
[ WhatsApp ] [ Email ] [ Copy link ]

You can simply send the link through WhatsApp.

They click it and enter the Conversation Room.

They don't necessarily need a Prof Class account initially.

### 1) The room could look like this

Sarah can be online, connected, seeing/hearing everything, but not appear in
the main composition.

Then you say:

"Sarah, what do you think?"

Click Sarah.

Now she becomes part of the stage.

### 2) Automatic speaker switching

Yes — this is also possible.

The system can detect who is speaking using voice activity / active-speaker
detection.

For example:

Prof Class automatically changes the active speaker:

Then:

Then:

depending on who is speaking.

Selecting who to speak should not simply use "loudest microphone."

It should use:

* voice activity detection
* audio energy
* speech confidence
* noise suppression
* minimum speaking duration
* hysteresis / switching delay
* current speaker priority

Otherwise a cough, keyboard click or background noise could cause the screen to
jump around. Build that

### 3) And you should absolutely have MANUAL mode

This is important.

The host could choose:

Speaker mode

Automatic
Prof Class switches to the active speaker.

Manual
Host controls who appears on stage.

Host
Host stays on stage unless manually changed.

Conversation
Automatic switching between participants.

And while automatic mode is running, you could still manually take control:

Pin Sarah

Now Sarah stays visible.

Then:

Resume automatic

That is much better than forcing the user to choose between automatic and
manual permanently.

### 4) There could be three participant states

This is where I think the interface becomes really elegant.

🟢 In room
Connected and participating.

🔵 On stage
Currently visible in the composition.

⚪ Waiting
Connected but not currently part of the visual composition.

For example:

Sarah and David can hear the conversation and prepare their response without
appearing on the finished video.

### 5) Then your Studio idea becomes much more powerful

Remember the three areas we discussed?

Left: people/clips
Center: stage
Right: composition

Now it can become:

Now participants and responses are both first-class objects.

### 6) WhatsApp is actually very useful here

You don't necessarily need to build a WhatsApp integration.

The easiest first implementation is:

Generate invitation URL → Share URL through WhatsApp.

For example:

James invited you to a Prof Class conversation
The History of Europe — Discussion
Join the room →

On a phone, the link opens the browser.

They grant:

* microphone
* camera, if they want to appear on video

and enter the room.

So the invitation mechanism can be:

WhatsApp | Messenger | SMS | Email | Copy link | QR code

without Prof Class needing to own or control those messaging platforms.

### 7) QR code would be excellent too

Imagine you're physically together in a classroom or meeting.

You display:

Join this conversation

QR code.

Everyone scans it.

They appear in the room.

That would be particularly useful for:

* university classes
* seminars
* conferences
* debates
* panel discussions
* church/religious teaching
* workshops

### 8) There is an even more interesting mode

Audience → Speaker

Suppose you're presenting a lecture.

Twenty people are in the room.

They are all connected.

But only you are on stage.

Then someone raises their hand:

Sarah wants to speak

You click Bring Sarah in.

The source pauses.

Sarah appears.

She speaks.

Automatic switching can then take over between you and Sarah.

When finished:

Return to source

The video continues.

That is much closer to a live interactive lecture/conversation system than a
video editor.

### 9) I would architect it like this

The composition engine should not care whether the speaker was selected
manually or automatically.

It receives:

`activeParticipant = Sarah`

and renders Sarah according to the selected layout.

That keeps the architecture clean.

### 10) One important thing: don't record the final video live

I would preserve the architecture you've already established.

Record each participant's media independently.

Then maintain the conversation timeline:

The final video is rendered from that record.

That means after the discussion you can say:

Change automatic switching to manual

without having to record the conversation again.

Or:

Make Sarah full screen during her answer.

Or:

Make this section vertical for TikTok.

Or:

Create a three-person version.

The raw participant recordings remain intact.

### 11) This also connects beautifully to your social-media idea

Imagine a 30-minute three-person discussion.

Prof Class could produce:

Full conversation
16:9

Social version
9:16

Highlight 1
You + Sarah

Highlight 2
Michael's response

Highlight 3
The debate

Quote card
The claim + three responses

Conversation Record
Every participant, claim, response and timestamp.

One conversation becomes a whole content package.

### 12) I would tell Claude to prepare for this now

Not necessarily build the full feature immediately, but make the data model
multi-participant now.

Give Claude this architectural instruction:

Prepare the Conversation model for multi-person rooms.

A Conversation must not assume a single participant. Model:

`Conversation → Participants → Interventions`

Participants may be connected to the room without being visible on the main
stage.

Introduce the concepts:

* In Room — participant is connected.
* On Stage — participant is currently included in the main composition.
* Waiting — participant is connected but not currently staged.
* Invited — invitation has been issued but participant has not joined.

Support invitation by shareable room URL. The first implementation does not
require a WhatsApp API integration; the invitation URL must be easily shareable
through WhatsApp, SMS, email, Messenger and other channels.

The room should eventually support synchronous WebRTC participation, with an
SFU/media architecture suitable for multiple participants.

The host can control stage selection using:

1. Automatic active-speaker switching.
2. Manual speaker selection.
3. Pin participant.
4. Resume automatic switching.

Automatic switching must use voice activity/active-speaker detection with
switching hysteresis rather than simply selecting the instantaneous loudest
microphone.

The active participant is an input to the existing Composition Engine. Do not
create a separate rendering system for multi-person conversations.

Preserve independent participant recordings and the canonical Conversation
timeline so stage selection, layout and automatic/manual switching can be
changed after recording without re-recording.

Do not implement the entire multi-person room yet unless required by the
current milestone. Establish the data-model and composition boundaries now so
the feature does not require a later architectural rewrite.

One technology decision I'd make later: use a proper WebRTC SFU rather than
trying to make every participant's browser send media directly to every other
participant. That will matter once you have several people in a room.

And I would make "Invite" → "Join room" → "Bring to stage" → "Automatic/Manual
switching" one of Prof Class's core interaction patterns. It turns the product
from a one-person response tool into a genuine video conversation room while
preserving everything you've already built.

---

# APPENDIX R — STAGES, AND WHAT EACH ONE LEFT

Written by the implementation, never by the brief. Every item above is
accounted for here: done, deliberately deferred with the stage that will take
it, or a stated conflict with a proposed alternative.

## Stage 1 — the model and the boundary

The brief's own instruction (§12): *"Do not implement the entire multi-person
room yet... Establish the data-model and composition boundaries now so the
feature does not require a later architectural rewrite."* This stage does
exactly that, plus the one piece of §2 the brief marks **"Build that"** — the
switching policy — because it is a pure function, it is the part most easily
got wrong once media is flowing, and it can be tested exhaustively before a
single packet moves.

**Done.**

- **§4 participant states** — `invited` / `waiting` / `staged`, in
  `src/domain/participants.ts`. Presence and staging are separate fields,
  because being in the room is not being on the stage. A fourth state,
  `left`, is recorded in Appendix R-C below as an addition, not a change.
- **§2 automatic switching** — `src/domain/stage.ts`. All seven signals the
  brief lists: voice activity, energy, speech confidence, a measured noise
  floor per microphone, minimum speaking duration, hysteresis with a dwell
  time, and incumbent priority. A pure function over readings and a clock, so
  a cough, a slammed door, a kitchen extractor fan and two people talking at
  once are all tested as sequences rather than as single frames. 24 tests.
- **§3 manual, host, conversation, pin, resume** — the four modes and both
  manual controls, in the same module and under the same tests.
- **§9 the composition boundary** — `ResponseShot` carries `participantId`
  and, where a room holds more than one speaker, `speakerName` and their
  accent. A test asserts the plan leaks no speaker mode, no pin, no
  microphone reading: the renderer is told who, never how.
- **§10 independent recordings** — `Intervention.participantId`. Takes already
  belonged to interventions, so a participant's media was already separate;
  naming the owner is what makes it addressable afterwards.
- **§12 the model** — `Conversation → Participants → Interventions`, with
  `participants` and `room` optional so a solo conversation is unchanged and
  there is no second kind of conversation.

**Deferred, with the stage that takes it.**

- **§1, §5 the room and studio surfaces** — Stage 2. The model is in place;
  the windows are not.
- **§6, §7 invitation links and QR** — Stage 2. `Room.inviteToken` exists and
  is the credential; nothing issues or redeems it yet.
- **§8 audience → speaker** — Stage 2 for the interface. The mechanism is
  done: `raisedHands()` orders the queue and "bring Sarah in" is
  `selectSpeaker`, which the tests assert is the same act as any other
  selection rather than a second path.
- **WebRTC and the SFU** — Stage 3, as the brief says. Nothing here assumes
  peer-to-peer or an SFU, which is what keeps that decision open.
- **§11 the content package** — largely already built: four publication
  formats, per-exchange clips, the article and the manifest all exist. What
  multi-person adds is per-participant highlights, which need Stage 2's data
  before they can be cut.

**R-C — additions and stated conflicts.**

1. **A fourth participant state, `left`.** The brief names three. A
   participant who leaves cannot simply stop existing: their takes are in the
   conversation and the finished video is made from them (§10). The
   alternative was a `connected` boolean that lies about people who are gone.
   Recorded here rather than folded silently into the three.

2. **No accounts yet.** The brief says participants "don't necessarily need a
   Prof Class account initially", which this build can honour — but the
   product currently has ONE password and no identity at all, so a guest and
   the owner are indistinguishable to the server. Stage 2 cannot issue a
   working invitation without deciding this. Proposed: the invite token
   identifies the ROOM, and a joiner claims a participant record with a
   display name; that is enough for presence and attribution, and stops short
   of accounts.

3. **`speakerMode` is stored on the conversation, not held in a browser.**
   §10 requires that automatic switching can be changed to manual after the
   discussion without re-recording. A setting that lived only in the live
   session could not be changed afterwards, so it is a field of the document.

