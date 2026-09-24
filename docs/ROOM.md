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

**R-C — the three open questions, resolved.**

All three are closed. Each was resolved by changing the design rather than by
adding to it, and each resolution removed something.

1. **There is no fourth state. The brief's three are DERIVED.**

   The first attempt stored `state` on each participant and had to invent
   `left` for someone who had gone — not invited, not waiting, not staged,
   and not deletable either, because their takes are in the conversation and
   the finished video is made from them. A fourth value in a three-value
   vocabulary meant the vocabulary was describing two things at once.

   It was. Presence is a fact about TIME (`invitedAt`, `joinedAt`, `leftAt`)
   and staging is a decision about the COMPOSITION, which belongs to the room
   — `stagedParticipantIds` — because who is on stage is one fact about the
   picture, not a flag each person carries that two records can disagree
   about. `presenceOf()` returns the brief's three and nothing else; having
   gone returns `undefined`, because it is the absence of a presence rather
   than a kind of one. Same discipline the conversation already keeps for
   order (U-08) and every representation (INV-00): store what happened,
   derive what follows.

2. **Identity: a capability link, exchanged for a scoped session.**

   The brief's requirement — joining over a forwarded WhatsApp link, with no
   account — is a capability URL, which is a sound model if what it grants is
   small, scoped and revocable. There are now two credentials, and they are
   different kinds of thing:

   - **The owner's session** is signed from the password hash and reaches
     everything, as before.
   - **A guest's session** (`src/auth/guest.ts`) names ONE conversation and
     ONE participant, both inside the signature rather than beside it, and is
     signed from *that room's invite token*. Rotating the token therefore
     ends every guest session in that room — including people already inside,
     which is what "withdraw the invitation" has to mean — and ends nothing
     anywhere else. It expires at 12 hours.

   `Access` gains `participant`, and what that tier may do is an allowlist of
   ACTS in one readable place (`guestMay`): be present, raise a hand, record
   themselves, watch the source. It may not edit the conversation, move
   anchors, attach evidence, publish, export, or learn that another
   conversation exists. The asymmetry is the product's position, not a
   limitation: a guest contributes to a conversation rather than co-owning
   it, and widening that will be an explicit role rather than a looser
   default.

   Twenty-one tests attack it: a cookie rewritten to name another
   conversation, another participant, a later expiry; a session from one room
   presented to another; a rotated token; malformed input. Each must fail
   closed, and does.

   This stops short of accounts, and deliberately: accounts are a product
   decision about who owns what across conversations, and nothing here
   forecloses it.

3. **`speakerMode` on the document — and the stage history needs no field
   at all.**

   Placement was already right: §10 requires changing automatic to manual
   after the discussion, and a setting living in a browser session would be
   gone by then. Tested, along with the §9 boundary — the plan carries no
   mode, no pin and no invite token.

   The substantive half was whether §10 is fully satisfied, which needs the
   record of WHO HELD THE STAGE WHEN to be editable afterwards. The instinct
   was a `stageHistory` on the room. It is not needed, and adding it would
   have been a fourth field declared and never read — a mistake this codebase
   has now shipped three times (the provider's oEmbed URL, `verticalLayoutId`,
   `LayerSource: 'screen'`).

   **The stage history already exists: it is the interventions.** A live room
   does not produce a log of switches alongside the turns — each switch IS
   someone taking a turn, and a turn is an intervention, anchored on the
   source clock (U-08) and naming its participant. So "change automatic
   switching to manual" is editing the conversation, which is the one thing
   this product has always been able to do. Proved: reassign a turn to
   another speaker, and the plan's speakers change, the plan hash changes so
   the shot cache cannot serve the old cut (U-16), and every take id, asset
   and duration is byte-identical.

