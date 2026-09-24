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

**Deferred at the end of Stage 1, and delivered in Stage 2 below.**

- §1 and §5 the surfaces, §6 and §7 invitation and QR, §8 audience → speaker.
- **WebRTC and the SFU** remain Stage 3, as the brief says. Nothing assumes
  peer-to-peer or an SFU, which is what keeps that decision open.
- **§11 the content package** — largely already built: four publication
  formats, per-exchange clips, the article and the manifest all exist. What
  multi-person adds is per-participant highlights, which need live capture
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

## Stage 2 — the room, and the way in

**Done.**

- **§1 the room window** — `/c/[id]/room`, a different window from the
  Studio, reached from a `+ Invite` button in it. Three areas, and the
  middle one exists to make the brief's central distinction visible: the
  people rail says who is here and what their presence is; the stage shows
  only who a viewer would see. Somebody waiting is a named state, not a
  person who has failed to appear.
- **§3 the modes** — all four offered as cards with what each one does, plus
  pin and Resume automatic, which appears only while a pin is holding.
- **§4 presence on screen** — waiting, on stage, invited, each with a word
  beside its colour rather than colour alone (D-04).
- **§6 invitation** — a link, Copy, the native share sheet where the browser
  has one, and WhatsApp, Messenger, SMS and Email as ordinary links to apps
  the person already has. No platform integration, no API key, exactly as the
  brief specifies. Withdrawal is a new token, which ends the session of
  everyone who used the old one.
- **§7 QR** — served from the host's own endpoint as SVG at error-correction
  level Q, never cached. Owner-only and server-rendered because the code
  encodes the credential.
- **§8 audience → speaker** — a guest asks for the floor; the host sees the
  hand and brings them in; being brought in promotes an audience member to
  speaker, because the host deciding they may speak IS the promotion, and
  their hand comes down because it has been answered.
- **The guest tier, now wired.** Stage 1 built the credential and left it
  reachable by nothing. It is now the `/r/[id]` join page, the join endpoint
  that exchanges a link for a scoped session, a presence endpoint a guest may
  use only on themselves, and a middleware allowance for exactly those paths.

**What the end-to-end run proves a guest CANNOT do**, holding a valid
invitation: list the conversations on the instance, read the bundle or the
render plan, delete the conversation, add a response, start an export, close
the room, or decide who is on stage. A guessed invitation cannot even confirm
the room exists — a wrong token answers 404, not 403, because 403 would
confirm it (D-03). Rotating the invitation ends the session of somebody
already inside.

**R-D — Stage 2 notes.**

1. **Presence is polled, not pushed.** Two seconds. Sockets belong with the
   media path in Stage 3, and a socket added now would be a second transport
   to keep in step with the one that replaces it.

2. **Camera and microphone are not requested at the door.** The brief
   mentions granting them on the way in; a guest hears the conversation from
   the moment they arrive and is only recorded once the host brings them in,
   so asking at the door would take a permission most of a lecture audience
   never needs. The prompt belongs at the moment of being staged, which is
   Stage 3's business.

3. **The join page shows nothing before the token is accepted** — not the
   title, not the source, not whether the conversation exists. A page that
   showed a title for a good id and an error for a bad one would be a way to
   test ids.

## Stage 3 — live: each participant records themselves, and real voices switch the stage

**The split this stage is built on.** WebRTC turned out not to be on the
critical path, and saying why is the substance of the stage. The two things
that determine the finished video are WHO WAS ON STAGE and WHAT THEY SAID.
Neither needs media to travel between browsers:

- Each browser records ITSELF, in rolling segments, and uploads them — the
  path the host's own recording has always taken (U-06). Nothing is mixed
  live, which is exactly what §10 asks for.
- Each browser measures ITS OWN microphone and posts two numbers. No audio
  is sent for this.

So a seminar in one physical room, everyone on their own phone, already
works completely. WebRTC is for seeing and hearing each other *live* — a
comfort during the conversation, absent from the video afterwards. That is
why it is last rather than first, and the SFU decision the brief defers stays
deferred without blocking anything.

**Done.**

- **§2 real voice activity** — `src/domain/voice.ts`, a pure function over a
  spectrum, with 16 tests driven by synthetic rooms: mains hum, an extractor
  fan, white noise, a keyboard click, a vowel. Two signals, and both are
  required: WHERE the energy sits (the 300–3400 Hz speech band, which hum is
  below and hiss is above) and WHETHER IT MOVES (spectral flux, which
  separates a talkative room from a merely noisy one — a fan is the same
  spectrum second after second). The geometric mean of the two punishes a low
  score in either, so a fan in band and a broadband slam both fail. A voice
  scores over three times a fan of the same loudness. The noise floor tracks
  the room, rising slowly and falling quickly, so a burst does not become the
  new normal and a quiet room hears a soft voice again.
- **§2, §9 the server decides** — `/room/voice` takes a reading, runs the
  policy built in Stage 1, and writes only when the stage actually moves.
  Every browser running its own policy would reach its own conclusion, and
  the composition would differ between the people watching it; there is one
  stage because there is one decision. The live hysteresis is in memory
  deliberately — it is the state of a moment and means nothing an hour later;
  what outlives the room is the turns people took, which are interventions.
- **§10 independent recording** — a guest who has been staged records
  themselves. Their turn is an intervention attributed BY THE SERVER from
  their signed session; there is no field in the request to claim one.

**R-E — what this stage cost, and one hole it opened.**

1. **A path-only allowance is not a rule.** Letting a staged guest POST to
   `/interventions` was written as a path, and that path also answers DELETE
   — so for one build, a guest could have deleted the author's responses. The
   allowance is `{ method, path }` now, and the DELETE handler checks the
   owner for itself rather than trusting middleware. Both layers, which is
   the discipline this codebase already claimed to keep. **A rule that names a
   route without naming what may be done to it is not a rule about
   anything.**

2. **A refusal moved layers, and the answer improved.** A stranger POSTing to
   a published conversation used to get 401 from middleware and now gets 404
   from the route. That is not a weakening: 404 is what they get for a
   conversation that does not exist, so a real one and an imaginary one now
   answer identically, where 401 said "this is real, you are not allowed"
   (D-03). The end-to-end run asserts the two answers match.

3. **Routes that gained authorisation broke tests that had none.** Handlers
   called directly in unit tests were relying on "it reached the handler" and
   "it is the owner" being the same statement. They are not, now that a guest
   can record. Those tests present an owner session, which is what a browser
   does.

## Stage 4 — seeing and hearing each other, live

The last thing in the brief, and the one the finished video does not depend
on. §12's instruction — "use a proper WebRTC SFU rather than trying to make
every participant's browser send media directly to every other participant"
— is honoured in both halves: this is a mesh, capped at the size a mesh is
actually good for, and above the cap it says so on screen rather than
degrading quietly. `MESH_LIMIT = 4`, because a mesh is n−1 uploads per person
and four people is three uploads each, which a laptop and a home connection
manage. **The cap is not a placeholder for the SFU. It is the honest edge of
this transport, and the SFU replaces the transport rather than raising a
number.**

**Done.**

- **The mailbox** — `/room/signal`, one queue per recipient, in memory, with
  a 30-second life. Each message names ONE recipient and is readable only by
  them: connection details contain local network addresses, and handing every
  guest a map of every other guest's LAN is a gift to nobody. The sender is
  the signed session, never the request, so no guest can pose as another's
  peer. Nothing is written to the conversation — signalling is the first two
  seconds of a call and means nothing afterwards.
- **The seam** — peers exchange opaque payloads and the room never learns how
  media travels. An SFU is a peer everybody connects to instead of to each
  other: the same offer, the same answer, the same candidates. Swapping it in
  changes who the peers are, not how they are introduced.
- **STUN, and TURN stated rather than assumed** — enough for two people on
  ordinary connections; not enough behind symmetric NAT, where a relay is
  required and has a bandwidth bill. `NEXT_PUBLIC_BALANCEVID_ICE` configures
  it. Written down because a connection that silently never establishes is
  the worst way to learn this.
- **Live tiles** — the stage shows people rather than their names, with the
  reason in words when it cannot: *connecting*, *their camera is off*, *could
  not reach them*.
- **Nothing is kept** — the mailbox sweeps itself on the way through. The
  per-recipient cap bounded one queue; nothing bounded the number of ROOMS,
  and a process that had served a thousand seminars would have held a
  thousand maps of handshakes that ended months ago.

**R-F — what this stage taught.**

1. **The transport is where the product's central claim becomes true or
   false.** "Being in the room is not being on the main stage" had until now
   been a statement about layout. It is now a statement about bytes: the
   staged send, everyone receives, and two people who are both only listening
   never connect at all, because there would be nothing on the wire. An
   audience member's camera is not withheld from the composition — it is
   never transmitted. The end-to-end run asserts exactly this by counting the
   tracks on the senders of a real peer connection after the host steps off
   stage, and it must reach zero. **A privacy claim that only the interface
   makes is a claim about a rectangle.**

2. **`replaceTrack`, not a change of direction — and the reason is the
   product's, not the protocol's.** Turning a media line around to
   `recvonly` is a renegotiation, and a camera goes on transmitting for the
   whole round trip while the far end thinks about it. `replaceTrack(null)`
   takes the track off the sender in the same tick. When someone is taken off
   stage, the difference between those two is the number of frames of them
   that left the building after they were told they had stopped.

3. **Perfect negotiation resolves a collision; it is better not to have
   one.** Both ends offering at once is resolved by the polite one rolling
   its offer back — and rollback is not free. The media lines it had just
   claimed come loose, the other end's offer makes its own, and a connection
   that should describe two streams describes four. It was measured, not
   theorised: the first working build negotiated four media lines, half of
   them inert, and runs of the same test either showed a picture or did not.
   Both browsers know both participant ids, so both can work out which of
   them speaks first without another round trip — the same comparison
   perfect negotiation uses to decide who yields, put to work one step
   earlier. The answering side turns the offered lines round *before* it
   answers, inside the same negotiation, so the whole connection is one
   offer and one answer and is never renegotiated again. **A rule agreed in
   advance is worth more than a recovery afterwards.**

4. **The host was nobody in their own room.** A guest's session names them; an
   owner's says they own the conversation, which is a different fact — so
   `roomView` returned no `meId` for the host, and the room's view of them
   silently had a hole in it where their identity should be. Nothing appeared
   broken: the rail listed them, the stage held them. But nothing addressed
   to them BY NAME could find them, so the host's own recording never started
   and their peer connections had nobody to be. Stage 3 shipped with this and
   Stage 4 made it visible, because a camera that goes nowhere is easier to
   see than a recording that is merely absent. The mapping is one function,
   `meIn`, used by every route that needs it. **The brief said it first — "the
   host is its first participant, not a special case beside the list" — and
   the bug was the code not believing it.**

5. **A track arriving is not a picture arriving.** The lines exist from the
   moment the connection does, whether or not anybody has turned a camera on,
   so publishing a remote stream on `ontrack` puts a live-looking black
   rectangle on the stage for every participant who has not. `unmute` is the
   event that means media has actually started, and `mute` is what a camera
   going off, or somebody stepping off stage, looks like from the other end.

6. **Refusing an offer from somebody you were not expecting looks like the
   safer choice, and is not.** The first version of this checked incoming
   offers against the list of peers this browser had decided to connect to,
   which reads as obviously correct and is a deadlock. The two ends learn
   about each other at different moments: somebody joining knows the whole
   room at once, while everyone else finds out on their next poll up to two
   seconds later, so a newcomer's offer can arrive before the other end has
   any reason to expect it. A refusal there is permanent, because the offer is
   not made twice — and since the id that decides who speaks first is random,
   it would have been half of all arrivals, at random, silently never
   connecting. What actually needed bounding was the resource rather than the
   guest list, so the cap does that and nothing turns on being recognised.
   **A rule that is only correct when both sides already agree is not a rule,
   it is an assumption.**

7. **A test that does not name who it is waiting for is not waiting for
   anything.** The first version of the end-to-end check waited for any stage
   tile reading `connected` — and your own tile is always connected, because
   it is your own camera. It passed before a single packet crossed. It now
   names the other participant. **A green check that cannot fail is worse
   than no check, because it is also a claim.**

**The brief is complete.** §1–§12, with the SFU deferred as §12 itself
defers it and the seam left where it slots in.
