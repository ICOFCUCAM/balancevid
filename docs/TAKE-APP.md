# Production and participation are separate — the Take App architecture

This document holds the author's architecture brief **verbatim**, in the
order it arrived, and a ledger of what has been built against each item.

**WHY VERBATIM.** The instruction on the previous brief applies here too:
*"Document this map as you shall execute it strictly while adding or making
any relevant upgrade. do not summerise it."* A summary of an architecture is
a second architecture, and the difference between them is the part that
quietly does not get built.

Everything of mine is in the `state` notes and the **ledger** at the end,
never inside the quoted text. Each item has a stable id (**T1**…**T17**).

Its companion is `TIMELINE-BRIEF.md`, whose **B14** is the first statement of
this idea; **B14 is superseded by this document** and its rows are folded
into the ledger here.

---

## T0 — the change of frame

> This changes the architecture in an important way: BalanceVid should not be
> designed as only a web application. It should be designed as a
> cross-platform production system with specialized capture clients.
> And I think the Take App should be a first-class component, not merely a
> mobile version of Studio Two.

## T1 — "1. The overall BalanceVid architecture"

> **1. The overall BalanceVid architecture**
> I would now think of the product as four layers:
>
> ```
>                          BALANCEVID
>                               │
>               ┌───────────────┴───────────────┐
>               │                               │
>         BALANCEVID STUDIO                TAKE APP
>        Desktop / Web / Local          Android + iOS
>               │                               │
>               │                         Camera / Mic
>               │                               │
>               └──────────────┬────────────────┘
>                              │
>                       BALANCEVID CORE
>                              │
>             ┌────────────────┼────────────────┐
>             │                │                │
>         Studio One       Studio Two       Online TV
>         Conversations    Performance       Broadcast
>             │                │                │
>             └────────────────┼────────────────┘
>                              │
>                        Distribution
>                   Web · YouTube · TikTok
>                    Facebook · X · etc.
> ```
>
> The important distinction is:
> Studio = production/control.
>  Take App = capture/participation.
> The phone does not need to become a miniature Studio Two.

**state: the frame everything below is built in.** The three studios and
distribution exist and are already separable — `docs/MASTER-EDIT.md` §11
records that separation as architecture. What does not exist is the second
top-level client.

## T2 — "2. Take App — your music-performance idea"

> **2. Take App — your music-performance idea**
> I think your idea here is very strong.
> The workflow could be:
> Studio Two
> The producer creates a performance:
> The Ancient of Days
> Then:
> Invite performers
> BalanceVid generates a secure invitation:
> `balancevid.com/take/8H7K...`
> The link can be sent through:
>
> *  WhatsApp
> *  SMS
> *  email
> *  Messenger
> *  QR code
> *  any normal messaging system
>
> The performer opens the link on their phone.
> If the Take App is installed:
> Open in Take App
> If it isn't:
> Continue in browser
> That last part is important. You don't want participation to fail simply
> because somebody hasn't installed the application.

**state: GAP, on foundations that exist.** A Room already generates one
secure, revocable link with a stated role (`Room.terms.as`) that can be sent
by any means. There is no `/take/…` link, no performance invitation, and no
app-or-browser handoff.

## T3 — "3. The Take App should be extremely simple"

> **3. The Take App should be extremely simple**
> The performer should see something like:
>
> ```
> ────────────────────────────
>
>           BALANCEVID
>
>        THE ANCIENT OF DAYS
>
>           Take 1
>
>      ┌───────────────────┐
>      │                   │
>      │    CAMERA VIEW    │
>      │                   │
>      │                   │
>      └───────────────────┘
>
>         🎵 00:42 / 04:04
>
>         [ Start Recording ]
>
> ────────────────────────────
> ```
>
> Then recording begins.
> The music/reference track plays through the phone.
> The person performs.
> At the end:
>
> ```
> Take 1
>
> ✓ Recording complete
>
> [ ▶ Review ]
>
> [ Save Take ]
>
> [ Record Again ]
> ```
>
> If they don't like it:
> Delete
> If they like it:
> Save
> Then:
> Submit Takes

**state: GAP as a surface; its hardest part is built.** "The music plays
through the phone and the person performs" is `useMasterRecording`, which
already schedules the song on the audio clock, takes the offset from that
clock at the instant the first chunk closes, subtracts the device's measured
latency and has the worker check the answer against the master. That is the
part of this screen that is difficult.

## T4 — "4. Multiple takes become extremely natural"

> **4. Multiple takes become extremely natural**
> The person could produce:
>
> ```
> THE ANCIENT OF DAYS
>
> Take 1    ✓ Saved
> Take 2    ✓ Saved
> Take 3    ✕ Deleted
> Take 4    ✓ Saved
>
> [ Add another take ]
>
>               [ Submit ]
> ```
>
> The important thing is that Take 3 doesn't have to reach the server at all
> if they delete it locally.
> That saves bandwidth and storage.
> Only the selected/saved takes are uploaded.

**state: GAP, and it is a real difference from how Studio Two records.** The
studio's recorder uploads in four-second segments *while* recording — which
is deliberate there, because a browser tab that dies mid-take must not lose
the performance. A guest deleting a take before it is uploaded needs the
opposite: hold it locally, upload on submit. Both are correct for their own
case, and the difference has to be a decision rather than an accident.

## T5 — "5. The server receives actual production assets"

> **5. The server receives actual production assets**
> When they submit:
>
> ```
> TAKE APP
>     │
>     ├── video
>     ├── audio
>     ├── timing metadata
>     ├── device metadata
>     └── take information
>              │
>              ▼
>       BALANCEVID CORE
>              │
>              ▼
>         STUDIO TWO
>              │
>              ▼
>        MASTER TIMELINE
> ```
>
> Studio Two can then show:
> James — 3 submitted takes
> and the producer can incorporate them into the master.

**state: PARTIAL.** Video, audio and timing metadata are exactly what a take
already carries — `alignment` with its method, `latencySamples`, the
rate-ratio check, the colour and sound readings. Device metadata is not kept.
"James — 3 submitted takes" needs takes to know who made them, which they do
not.

## T6 — "6. Synchronization is extremely important"

> **6. Synchronization is extremely important**
> This is where I would make Take App more sophisticated than an ordinary
> phone camera.
> The invitation should contain the production reference.
> For example:
>
> ```
> Production:
> The Ancient of Days
>
> Reference:
> Master song v3
>
> Duration:
> 04:04.503
>
> Tempo:
> 114 BPM
>
> Reference offset:
> 0 ms
> ```
>
> The phone knows exactly what the performer is supposed to perform against.
> The resulting video can therefore carry a common master production clock.
> That fits perfectly with the timeline architecture we discussed earlier.

**state: PARTIAL, and this is the item the product is best placed to do
well.** Every one of those five fields exists in the document today: the
performance's title, the master asset, `durationSamples` measured by decoding
rather than read from a header, `BeatGrid.bpm` with its acceptance, and the
offset the alignment carries. What does not exist is an invitation that
*carries* them to a phone.

## T7 — "7. And the Take App should not only be for Studio Two"

> **7. And the Take App should not only be for Studio Two**
> This is where your idea becomes much bigger.
> The same Take App can become the participation client for BalanceVid as a
> whole.
> For example, Studio One creates:
> Question for viewers
> The host asks:
> "What is your view on this statement?"
> BalanceVid generates a participation invitation.
> The person receives:
> BalanceVid — Response Request
> They open Take App.
>
> ```
> QUESTION
>
> "Do you agree with this statement?"
>
> [ Watch source ]
>
> [ Record response ]
>
> ────────────────────
>
> Your response
>
> [ Camera ]
> [ Microphone ]
>
> [ Record ]
> ```
>
> They answer.
> Then:
> Submit response

**state: GAP, over a model that already fits.** Studio One's whole subject is
a source and responses to it; "watch source, then record a response" is what
the Conversation Room does. What is missing is doing it from a request rather
than from a seat in the room.

## T8 — "8. Online TV can use exactly the same mechanism"

> **8. Online TV can use exactly the same mechanism**
> This is where I think your architecture becomes particularly interesting.
> Suppose your Online TV programme is:
> The Evening Conversation
> The producer wants audience participation.
> They send:
> Participate in this programme
> A viewer receives the link.
> They don't need access to the whole BalanceVid studio.
> They only receive the specific assignment.
>
> ```
> ONLINE TV
> Evening Conversation
>
> QUESTION FROM THE HOST
>
> "What do you think?"
>
> [ Watch ]
>
> [ Record your response ]
>
> [ Submit ]
> ```
>
> Their contribution goes into a response queue.

**state: GAP.** `Channel.room` already invites people to a broadcast without
Studio One, which is the same instinct — but it admits them to a live room,
not to an assignment they answer in their own time.

## T9 — "9. I agree with your point about NOT storing it under the programme"

> **9. I agree with your point about NOT storing it under the programme**
> This is important.
> I would not immediately store it as:
> Evening Conversation → Episode 4 → James's response
> because the producer may not actually use it.
> Instead:
>
> ```
> PARTICIPATION INBOX
>
> Responses
> ───────────────
>
> 12 awaiting review
>
> James
> Video response
> 02:14
>
> Sarah
> Audio response
> 00:47
>
> David
> Video response
> 01:32
>
> Anonymous
> Video response
> 00:58
> ```
>
> Then the host decides:
> Use this response
> Only at that point does it become associated with the programme.

**state: GAP, and it is the load-bearing decision of the whole design.** It
is the same principle as INV-06 — *a detection is a suggestion until
accepted* — applied to people: a submission is a submission until the host
uses it. Writing a response into a programme on arrival would make the
programme a record of what was sent rather than of what was chosen.

## T10 — "10. The queue becomes a powerful production system"

> **10. The queue becomes a powerful production system**
> Imagine Online TV is live.
> The host sees:
> Audience Responses
>
> ```
> NEW
> ──────────────
>
> ● James
>   Video · 02:14
>
> ● Sarah
>   Audio · 00:47
>
> ● David
>   Video · 01:32
> ```
>
> The host can:
> Preview
> Accept
> Reject
> Hold
> Add to programme
> Then an accepted response enters the programme's production queue.
>
> ```
> PROGRAMME QUEUE
>
> 01  Host introduction
> 02  Interview
> 03  Audience response — James
> 04  Host response
> 05  Audience response — Sarah
> 06  Music
> ```
>
> That is much more powerful than simply uploading videos.

**state: PARTIAL.** Online TV already has a programme with an ordered
playout, and a live channel that plays it; what is missing is the inbox
beside it and the four verbs.

## T11 — "11. Studio One can work exactly the same way"

> **11. Studio One can work exactly the same way**
> For Conversation Studio:
>
> ```
> SOURCE
>   ↓
> QUESTION / COMMENT
>   ↓
> INVITATION
>   ↓
> TAKE APP
>   ↓
> PARTICIPANT RESPONSE
>   ↓
> RESPONSE INBOX
>   ↓
> HOST SELECTS
>   ↓
> CONVERSATION TIMELINE
> ```
>
> So you could have people responding remotely without giving them access to
> Studio One.

**state: GAP.** Every stage of that chain exists except the middle three.

## T12 — "12. Online TV gets the same architecture"

> **12. Online TV gets the same architecture**
>
> ```
> ONLINE TV PROGRAMME
>         │
>         ├── Question
>         ├── Poll
>         ├── Video request
>         ├── Audio request
>         └── Performance request
>                     │
>                     ▼
>                TAKE APP
>                     │
>                     ▼
>              PARTICIPATION
>                 INBOX
>                     │
>              Host selects
>                     │
>                     ▼
>              LIVE PROGRAMME
> ```
>
> This is an important architectural distinction:
> The audience doesn't enter your studio.
> They enter a controlled participation endpoint.

**state: GAP.** The five kinds of request are the shape of the model this
needs: one object, five assignments.

## T13 — "13. This also works on computers"

> **13. This also works on computers**
> Take App doesn't necessarily have to mean phone-only forever.
> The same participation link could work on:
>
> *  Android
> *  iPhone/iPad
> *  Windows
> *  macOS
> *  Linux
> *  browser
>
> But the native Android/iOS app gives you much better access to:
>
> *  camera
> *  microphone
> *  local recording
> *  background upload
> *  upload retry
> *  device storage
> *  permissions
> *  notifications
>
> So I would make:
> BalanceVid Studio
> Web + desktop/local
> and:
> BalanceVid Take
> Android + iOS, with browser fallback.

**state: PARTIAL.** The browser fallback is the thing to build first and is
the thing that makes the rest optional rather than blocking — which is the
author's own point in T2: participation must not fail because an app is not
installed.

## T14 — "14. The local/self-hosted version fits this perfectly"

> **14. The local/self-hosted version fits this perfectly**
> This also connects to your earlier idea of selling BalanceVid as software.
> Someone could run:
> BalanceVid Self-Hosted
> on their own Windows/Linux/macOS environment or server.
> Their Take App could connect to their BalanceVid installation.
> For example:
>
> ```
> Their BalanceVid
>       │
>       │ secure invitation
>       ▼
> Take App
>       │
>       │ encrypted upload
>       ▼
> Their BalanceVid server
>       │
>       ├── Studio One
>       ├── Studio Two
>       └── Online TV
> ```
>
> Another customer could use:
> BalanceVid Cloud
> and the exact same Take App connects to BalanceVid Cloud.
> That is a very good architectural separation.

**state: the separation already holds.** The product runs from a single
directory of files with no cloud service in the middle, which is what makes
self-hosting real rather than aspirational. The invitation carrying its own
destination is what lets one app reach either.

## T15 — "15. I would therefore define three product environments"

> **15. I would therefore define three product environments**
> BALANCEVID SELF-HOSTED
> Customer runs the system themselves.
>
> ```
> Their computer/server
>         ↓
> BalanceVid
>         ↓
> Their media/storage
>         ↓
> Their social accounts
> ```
>
> Capacity depends on their hardware.
> BALANCEVID CLOUD
> You run the infrastructure.
>
> ```
> BalanceVid Cloud
>        ↓
> Media infrastructure
>        ↓
> Online TV
>        ↓
> Social distribution
> ```
>
> Cloudflare can sit here as part of the media/distribution infrastructure.
> TAKE APP
> Common mobile participation layer.
>
> ```
>              TAKE APP
>            /           \
>  Self-hosted BalanceVid  BalanceVid Cloud
> ```
>
> The user doesn't need to know which infrastructure is underneath.

**state: recorded.** Nothing in the code has to change for this to be true;
what must not happen is a participation link that only resolves against one
host.

## T16 — "16. There is one thing I would add: invitation identity"

> **16. There is one thing I would add: invitation identity**
> Every Take request should have its own secure identity.
> Not merely:
> `take/123`
> but something conceptually like:
>
> ```
> Participation Request
> ─────────────────────
>
> Request ID
> Production
> Assignment
> Participant
> Allowed actions
> Expiration
> Upload destination
> Status
> ```
>
> And the request can have states:
>
> ```
> CREATED
>    ↓
> SENT
>    ↓
> OPENED
>    ↓
> RECORDING
>    ↓
> SUBMITTED
>    ↓
> RECEIVED
>    ↓
> REVIEWED
>    ↓
> ACCEPTED / REJECTED
>    ↓
> ATTACHED TO PROGRAMME
> ```
>
> This is what makes your system reliable at scale.

**state: GAP, and it is the object the rest of this brief is made of.** The
Room's terms are its nearest relative — a link that states what it admits
people as, and can be revoked. A Participation Request is that idea with an
assignment, an expiry, a destination and a life of its own.

## T17 — "17. The biggest architectural principle"

> **17. The biggest architectural principle**
> I would now explicitly add this to BalanceVid's architecture:
> Production and participation are separate.
> The professional producer controls:
> Studio One / Studio Two / Online TV
> The participant controls:
> Take App
> And the two communicate through Production Requests.
> That means you can eventually have hundreds or thousands of participants
> without giving them access to your actual studio.
> The complete picture becomes
>
> ```
>                     BALANCEVID
>                          │
>        ┌─────────────────┼──────────────────┐
>        │                 │                  │
>   STUDIO ONE        STUDIO TWO         ONLINE TV
>  Conversation       Performance         Broadcast
>        │                 │                  │
>        └─────────────────┼──────────────────┘
>                          │
>                  PARTICIPATION
>                     REQUESTS
>                          │
>                  ┌───────┴───────┐
>                  │               │
>               ANDROID           iOS
>                  │               │
>                  └───────┬───────┘
>                          │
>                      TAKE APP
>                          │
>               ┌──────────┼──────────┐
>               │          │          │
>            Video       Audio      Response
>            Take        Take        Take
>               │          │          │
>               └──────────┼──────────┘
>                          │
>                   UPLOAD / SUBMIT
>                          │
>                          ▼
>                   RESPONSE INBOX
>                          │
>                     HOST REVIEWS
>                          │
>              ┌───────────┴───────────┐
>              │                       │
>           ACCEPT                    REJECT
>              │
>              ▼
>        PRODUCTION QUEUE
>              │
>              ▼
>       MASTER / LIVE PROGRAMME
>              │
>              ▼
>       BALANCEVID TV + SOCIAL
> ```
>
> That is a much larger and more coherent product than simply making Studio
> Two responsive on a phone.
> And importantly, it gives the Take App a very clear purpose: the phone
> becomes a remote production camera and participation terminal for
> BalanceVid.

**state: this is the principle the rest is executed under**, and it is a
doctrine-level statement rather than a feature: *the audience does not enter
the studio; they enter a controlled participation endpoint.*

---

# What is already built, measured

Written down before anything new is, because the standing rule on every
brief here is the author's own: *"always check if the feature already exist
and only need upgrade"*. [D-19]

| the brief needs | what exists today | where |
| --- | --- | --- |
| a secure link to one person, with a role | `Room`, `Room.terms.as`, revocable, one link | `src/domain/roomEdit.ts`, ROOM §1–§12 |
| recording against a song on a phone | `useMasterRecording`: the song on the audio clock, offset taken at the first chunk, device latency subtracted, verified by the worker | `app/p/[id]/useMasterRecording.ts`, `src/domain/calibration.ts` |
| segmented upload that survives a dead tab | four-second segments, each uploaded under its index; the last one is uploaded whatever else is true | `useMasterRecording.ts` |
| a submitted recording becoming a production asset | that is what a take is, with its alignment, colour and sound readings | `src/domain/performance.ts` |
| the production reference (title, song, duration, tempo, offset) | all five are in the document; duration is measured by decoding, never read from a header | `MasterTrack`, `BeatGrid` |
| inviting to a broadcast without a studio seat | `Channel.room`, `roomHostKind` | CHANNEL §1, §5 |
| admitting and staging people | `presenceOf`, `inRoom`, `setStaged` | `src/domain/participants.ts` |
| an ordered programme that plays out | the channel's programme and playout | `src/domain/playout.ts` |
| self-hosting | the whole product is files in a directory; no cloud service in the middle | `var/accounts/…` |
| "a suggestion until accepted" as a principle | INV-06, and the beat grid that will not be cut on until a human accepts it | `src/domain/beats.ts` |

**What does not exist at all:** the Participation Request object, any
`/take/…` endpoint, a guest capture surface, local-until-submit recording,
the response inbox, the four review verbs, and any packaged app.

---

# The ledger

`HAVE` means it works today. `PARTIAL` means part of it does. `GAP` means it
does not exist. A row moves to `HAVE` only when it is verified in a browser
against real data. Every row is evaluated one at a time at the end.

| id | item | state |
| --- | --- | --- |
| T1 | four layers: Studio, Take App, Core, Distribution | PARTIAL — three of four; no second client |
| T1a | Studio = production/control, Take = capture/participation | GAP as code; the principle is T17 |
| T2 | "Invite performers" in Studio Two | GAP |
| T2a | a secure `/take/…` invitation link | GAP |
| T2b | sendable by WhatsApp, SMS, email, Messenger, QR, anything | GAP (a URL is; the QR and the share sheet are not) |
| T2c | "Open in Take App" / "Continue in browser" | GAP |
| T3 | the performer's capture screen | GAP |
| T3a | the reference track plays while they record | HAVE, in Studio Two's recorder — to be reached from the guest surface |
| T3b | review, save, record again, delete | PARTIAL — takes are kept and deleted in the studio, not by a guest |
| T4 | several takes, only the saved ones uploaded | GAP — and it is the opposite of the studio's deliberate segment-upload |
| T5 | submit carries video, audio, timing, device, take info | PARTIAL — video, audio and timing yes; device metadata no |
| T5a | "James — 3 submitted takes" in Studio Two | GAP — a take does not know who made it |
| T6 | the invitation carries the production reference | **HAVE (domain)** — `Assignment.reference`; a performance request without one is refused, because that is an ordinary phone camera |
| T6a | a common master production clock across devices | HAVE in principle: every position in the product is a sample on the song |
| T7 | Studio One sends a question, receives a response | GAP |
| T8 | Online TV sends an assignment to a viewer | GAP |
| T9 | responses are NOT stored under the programme until used | **HAVE (domain)** — a submission lives on the request; `accept` hands it back and writes into no production |
| T9a | the participation inbox | GAP |
| T10 | preview / accept / reject / hold / add to programme | GAP |
| T10a | an accepted response enters the programme queue | PARTIAL — the queue exists; nothing puts a response in it |
| T11 | Studio One's chain, end to end | GAP (three middle stages) |
| T12 | five kinds of request: question, poll, video, audio, performance | **HAVE (domain)** — `AssignmentKind`, as rows |
| T13 | the same link works everywhere, browser included | GAP |
| T13a | a packaged Android / iOS app | GAP |
| T14 | the same Take App reaches self-hosted or cloud | GAP — needs the invitation to carry its destination |
| T15 | three product environments | recorded; no code change required |
| T16 | the Participation Request object and its eight fields | **HAVE (domain)** — `src/domain/participation.ts`; upload destination deliberately NOT stored, see T14 |
| T16a | its nine states, CREATED → ATTACHED TO PROGRAMME | **HAVE (domain)** — `REQUEST_NEXT` as a table, every move refused rather than ignored, every step written down |
| T17 | production and participation are separate | the principle; to be written into the doctrine |

## The order this will be built in, and why

1. **T16 — the Participation Request.** Everything else in this brief is a
   view of it. Built first, in the domain, with its states as data.
   **Done in the domain** — 35 tests, 12 mutations, all of which bite. Not
   yet reachable from any screen, which is step 2.
2. **T2a, T13 — the link and the browser surface.** Because the author's own
   argument is that participation must not fail for want of an installed
   app, the browser client is the client; the packaged apps are a later
   delivery of the same surface.
3. **T3, T4, T5 — capture, keep-or-delete, submit.** Reusing
   `useMasterRecording` rather than writing a second recorder.
4. **T9, T9a, T10 — the inbox and the four verbs**, in Studio Two first
   because a performance take is the simplest thing to accept.
5. **T7, T8, T11, T12 — the other two studios**, which are the same object
   with a different assignment.
6. **T13a — the packaged apps**, last, because they are a delivery of a
   surface that must already work.
