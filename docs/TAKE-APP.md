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
| T1 | four layers: Studio, Take App, Core, Distribution | HAVE, as four surfaces on one deployment | Studio (the three control rooms), Take App (`/take/<link>`), Core (the domain, the store, the worker) and Distribution (the channel's destinations). What is still missing is a second CLIENT, which is T13a and not a layer |
| T1a | Studio = production/control, Take = capture/participation | HAVE as code | separate routes, separate auth (four guest verbs, each on its own path), separate store, and one object between them. A participant reaches a request and nothing else; a producer reaches a studio and, of a request, only what was sent |
| T2 | "Invite performers" in Studio Two | HAVE | in the takes rail beside Upload and Add footage, because it is the same slot: a take accepted from a phone is an ordinary take in that rail. Name and question both optional — the song says what is wanted |
| T2a | a secure `/take/…` invitation link | HAVE | `req_id.secret`, 32 random bytes, matched by one regex BEFORE any disk read and compared with `timingSafeEqual`. Shown once, in the response that makes it; rotatable, and rotating it stops the old one working for somebody part-way through recording |
| T2b | sendable by anything | **HAVE** | the native share sheet, WhatsApp, Messenger, SMS, mail, a copy button and a QR code — the Room's own set, and literally the Room's own code. The earlier row argued that `InvitePanel` could not be borrowed because it wants a conversation, a source title and a rotate handler, which was true and was the wrong conclusion: the weld was cut instead. `app/ShareLink.tsx` is what is generic about sending a link; the Room keeps what only the Room knows (who arrives as what, until when, the button that withdraws it) and wraps it. One definition, asserted. The QR is `GET /api/requests/<id>/qr` — owner-only, server-drawn, keyed on the REQUEST so one route serves all three holders — and it opens full screen, because "put it on the wall and everyone scans it" is not 220 pixels in a rail |
| T2c | "Open in Take App" / "Continue in browser" | **HAVE** | it waited on T13a and T13a moved. `InstallBar` offers both doors and renders nothing where there is no door — never on a browser that cannot install, never to somebody already running it. Chromium's `beforeinstallprompt` fires only when the page actually qualifies, so catching it is the honest test rather than a claim; Safari fires nothing and has no API, so an iPhone is told to use Share → Add to Home Screen instead of being left out |
| T3 | the performer's capture screen | HAVE | `/take/<link>` on a phone with no account: what is asked, the camera, the count-in, the clock, one button at a time. Verified on a simulated Pixel 7 |
| T3a | the reference track plays while they record | HAVE, reached | `useMasterRecording` with `masterUrl` = `/api/take/<link>/reference`, which serves the NORMALISED master — what they hear and what the alignment measures are the same audio at the same rate, which on a phone matters more because nobody is watching a waveform |
| T3b | review, save, record again, delete | HAVE | the performer's own list: Send and Delete per take, and neither once it is sent |
| T4 | several takes, only the saved ones **submitted** | HAVE, with the tension resolved rather than ignored | the SEGMENTS go up as they close, because a dropped call must not cost a good take (U-06); the SUBMISSION is what crosses, and Delete removes the segments. They pay the bandwidth for a take they discard; they do not lose a good one |
| T5 | submit carries video, audio, timing, device, take info | HAVE | all five: the joined media, the phone's measured offset and elapsed time, the user agent (bounded), and which of the allowed takes it is |
| T5a | "James — 3 submitted takes" in Studio Two | HAVE | `PerformanceTake.performer`, written from the request at the moment of acceptance and shown on the rail row. As the PRODUCER named them, not as the participant typed it |
| T6 | the invitation carries the production reference | **HAVE (domain)** — `Assignment.reference`; a performance request without one is refused, because that is an ordinary phone camera |
| T6a | a common master production clock across devices | HAVE in principle: every position in the product is a sample on the song |
| T7 | Studio One sends a question, receives a response | HAVE | `POST /api/conversations/<id>/requests`, the same request object a performance issues, with a question instead of a song. The recorder runs with no clock; the count-in still counts |
| T8 | Online TV sends an assignment to a viewer | HAVE | `POST /api/channels/<id>/requests`, and the Answers desk in the control room to send it from |
| T9 | responses are NOT stored under the programme until used | **HAVE (domain)** — a submission lives on the request; `accept` hands it back and writes into no production |
| T9a | the participation inbox | HAVE, as two | the performers panel in Studio Two and the Answers desk in Online TV. Not one screen across all three studios, which the brief allows for and which would be a fourth surface nobody is standing in front of |
| T10 | preview / accept / reject / hold / add to programme | HAVE | watch it before deciding (a producer who must accept something to find out what it is has not been given a choice), then Use it / Hold / Pass, and a new link. Deciding about something receives it on the way past, because the alternative is a button called "I have it" in front of the buttons that matter |
| T10a | an accepted response enters the programme queue | HAVE | in Studio Two it becomes an ordinary TAKE, made by the ordinary assembler — joined, normalised, measured, aligned. In Online TV it joins the live MIXER beside the presenter, because a channel broadcasts renders and ingests and a submission is neither |
| T11 | Studio One's chain, end to end | HAVE | ask → link → phone → submission → inbox → preview → accept. Verified end to end in the browser with a simulated Pixel 7 and no account |
| T12 | five kinds of request: question, poll, video, audio, performance | **HAVE (domain)** — `AssignmentKind`, as rows |
| T13 | the same link works everywhere, browser included | HAVE, as the web | one URL, one page, no install, no account — and now the same URL is also the thing that installs, so nothing about the link changed when the app arrived |
| T13a | a packaged Android / iOS app | **HAVE as capability; the store listing is out of reach** | the row justified itself by what a native client ADDS — "background upload and retry" — and that half was never about a store account. It is built: segments go to IndexedDB before the network, are retried with a backoff, survive the tab closing and the phone locking, and finish from a service worker's `sync` event with no page open. The Take App installs to a home screen from a per-link manifest, opens without browser chrome, and loads its shell with no signal. **And it was a fault, not a missing feature**: `chunk` was `await fetch(...)` with no check on the response under a caller that swallows the rejection, so a failed segment was gone — a take with a hole in it, of a plausible length, and nobody told. What is genuinely still out of reach is a SIGNED BINARY IN TWO STORES: accounts, certificates and a release pipeline, none of it a change to this product. **AND THAT ANSWERED A QUESTION NOBODY ASKED.** *"TAKE MOBILE SHOULD BE ANDROID SO SOMEONE WITH ANDROID PHONE CAN DOWNLOAD FROM THE INTERNET EVEN WITHOUT THE PLAYSTORE."* A sideloaded APK needs no store account, no review and no certificate anybody else issues — a keystore the publisher generates, and somewhere to put the file. The somewhere has existed since the download centre did: `downloads.ts`'s pattern already matches `android` and `apk`, so `take-0.1.0-android.apk` in `var/downloads` is already listed and already served. The row conflated *a store listing* with *a packaged app*, and the conflation is why neither got built. What was actually missing is now built: `/.well-known/assetlinks.json`, without which an installed app that opens this site shows a browser address bar across the top of it, for ever, with no error anywhere. See **T13b** |
| T13b | an Android app installed from the internet | **HAVE, except the binary** | The site's half is done and measured: `/.well-known/assetlinks.json` serves the Digital Asset Links document that takes the browser chrome off a Trusted Web Activity, public and unauthenticated because Android fetches it on first launch with no session. The fingerprint is configuration (`ANDROID_CERT_SHA256`), never a constant — a self-hosted customer signs their own APK and their fingerprint is not ours (V-8). Unset, the route 404s rather than serving an empty document that actively authorises nobody; malformed, it says so, naming the symptom, because the failure is otherwise completely silent. Verified against a keystore `keytool` actually generated here: served 200 `application/json` to a request with no cookie. **What is not here is the APK**, and not for want of a store: this container cannot reach `dl.google.com`, so there is no Android SDK and nothing to build it with. JDK 21, Gradle and `keytool` are present; only the SDK is missing. That is an environment, not a design |
| T14 | the same Take App reaches self-hosted or cloud | HAVE, by NOT carrying a destination | the request is answered against the server that served it, and the origin is never written into the record. A self-hosted installation that moves keeps its invitations working, and a forged origin is not somewhere to send a stranger's camera. The link is shown once and never read back out of a listing |
| T15 | three product environments | recorded; no code change required |
| T16 | the Participation Request object and its eight fields | **HAVE (domain)** — `src/domain/participation.ts`; upload destination deliberately NOT stored, see T14 |
| T16a | its nine states, CREATED → ATTACHED TO PROGRAMME | **HAVE (domain)** — `REQUEST_NEXT` as a table, every move refused rather than ignored, every step written down |
| T17 | production and participation are separate | HAVE, as **D-25** in the doctrine, and as code: separate routes, separate auth, separate store, one object between them |

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


## The evaluation pass

*Run 2026-09-30, against the running product. Every state the author's own
data was put into was put back.*

The order above was built in the order above, and this is what the pass
found at the end of it.

1. **T16, T16a — the request and its states.** The nine states are a table
   and every move is refused rather than ignored. The pass found one caller
   wrong rather than the table: an accept straight from `submitted` came
   back "a submitted request cannot become accepted", which is the table
   being right. Deciding about something receives it on the way past now.
2. **T2a, T13 — the link and the browser surface.** One URL, no install, no
   account. Verified on a simulated Pixel 7: a producer issued it from the
   takes rail and a phone opened it.
3. **T3, T3a, T3b, T4, T5 — capture, keep-or-delete, submit.** The song
   plays while they record, from the normalised master. Stopping is not
   sending: the segments go up as they close and the performer decides. The
   pass found the opposite shipped — every recording marked `sent: true`,
   with no Send and no Delete, under two comments saying it did not.
4. **T9, T9a, T10, T10a, T11 — the inbox and the four verbs.** Invite,
   watch, use it, hold, pass, new link. An accepted submission becomes an
   ordinary take through the ordinary assembler. The pass found three faults
   here that no test had: a submission's two ids, the state-machine caller
   above, and a take declared before the acceptance that could fail.
5. **T7, T8, T12 — the other two studios.** The same object with a different
   assignment, and the recorder running with no clock at all.
6. **T13a — the packaged apps.** Not built, and recorded as what it is.

## The second pass: closing T2b

*Run 2026-09-30, after the pass above. Its own "what is still not there"
listed T2b as argued-and-declined, and the argument did not survive being
read back: "the Room's panel wants three things this surface cannot give"
is a reason to cut the weld, not a reason to ship a bare input. It is the
standing rule of this project — measure against what exists and cover the
gap — applied to a row the first pass talked itself out of.*

`app/ShareLink.tsx` now holds what is generic about sending a link. The
Room wraps it and keeps its terms and its reset; the takes rail uses it and
gets a QR code; one definition, asserted so the next surface asks for the
row instead of growing its own.

**Four faults, and every one of them was found in the browser:**

1. **The share message said "a part"** however carefully the producer had
   described it. `invite` empties the `asks` field the instant the link
   comes back, and the message read the field. It passed its tests, because
   a source assertion that a message mentions `asks` cannot tell WHICH
   `asks`. The ask travels with the link now, and rotating carries the one
   on the row.
2. **The QR encoded the wrong origin.** The studio was open on
   `127.0.0.1:3100` and the square encoded `localhost:3100` — which on the
   phone that scans it means the phone. A page composes its links from
   `window.location` and is right whatever the server thinks; a square is
   drawn on the SERVER, and behind a proxy the server's own URL is the
   internal one. `originOf` already existed for the preview cards. **The
   Room's QR had the same fault** and was fixed with it — one of them left
   on `request.url` is the copy the next one gets written from.
3. **The square was cut off.** 220px was written for the Room's panel; the
   takes rail is 290px wide and its scroll viewport showed the top third of
   a code. Sized to the column now, and revealing it scrolls it into view.
4. **Full screen was a fifth of the screen.** `position: fixed` does not
   escape a mask, and `.shell-scroll` carries a `mask-image` for its edge
   fade — which makes it the containing block for everything fixed inside
   it. No z-index reaches that. The overlay leaves the subtree through a
   portal.

Verified: the square decodes byte-for-byte to the link the panel displays;
the Room's panel still has all eleven of its handles after the extraction.

## Where this brief continues

`docs/TAKE-PLATFORM.md` holds the next brief for this surface, verbatim
and with its own ledger: the Take App as a participation and media
application rather than a recorder, and how it behaves when every
customer owns their own BalanceVid installation.

Its measurement is worth knowing before reading this file again: **the
protocol half of that architecture is what this brief already built.**
T14's rule that the origin is never written into the record, and T16's
Participation Request as the one object all three studios issue, are
exactly what a multi-instance client needs — so the closing design rule
of that brief, *"any valid BalanceVid installation can be a Take
destination"*, is not a change to make but a property to keep.

## The third pass: closing T13a, and the fault under it

*Run 2026-09-30. T13a was the last row in either brief that said GAP, and
reading it back it was two claims wearing one label: "a packaged app" (a
store account, certificates, a release pipeline — genuinely out of reach)
and "what a native client adds is background upload and retry" (not out of
reach at all, and the only part a user can tell the difference about).
Shipping the gap rather than the capability was keeping the wrong half.*

### It was a fault, not a missing feature

The chunk upload was:

```ts
chunk: async (id, index, body) => { await fetch(...); }
```

— no check on the response — under a caller that swallows the rejection so
the next segment can carry on. On a laptop in a studio that is nearly
always fine. On a phone on mobile data, which is this surface's entire
premise, **a segment that failed was gone**: the take had a hole in the
middle of it, the duration still looked plausible, and nobody was told.
U-06 exists so a crash costs one segment; it does not say a segment may be
dropped in silence.

### What is built

* **`public/take-app/queue.js`** — segments go to IndexedDB before they go
  to the network, drain serially, retry on a doubling backoff, and
  distinguish three outcomes rather than two: sent, try again, and a
  refusal retrying cannot fix. Written as a plain script because the
  service worker runs the same code, and two copies of a queue is how a
  queue develops two ideas of what is in it. [D-19]
* **`public/take-sw.js`** — drains it from a `sync` event with no page
  open, which is the one thing the web surface genuinely could not do
  before. Caches its own shell and nothing of anybody's production: not the
  master track, not the page, not an API answer. [D-03, D-25]
* **A per-link manifest** — an installed icon opens *that assignment*, not
  a page asking for a link. Standalone, so there is no address bar over the
  Record button; refused for a link that is not open, so an installed icon
  never opens a refusal.
* **`InstallBar`** — T2c's two doors, shown only where there is something
  to install and never to somebody already inside it. Safari has no API for
  this and is the likeliest phone a performer is holding, so it is told to
  use Share → Add to Home Screen.
* **Send waits for the queue.** Sending is a *join* of the `.part` files on
  disk, so sending with a segment still queued produces a submission with a
  hole in it. The race was not new — the old fire-and-forget upload had it
  too, and nothing to wait on.

### Four faults, all found in the browser

1. **Send said nothing for sixty seconds.** Pressing it with two segments
   queued on a phone with no signal left the button reading "Sending…" with
   no way to tell working from stuck. It was working. It says what it is
   waiting for now, before it waits.
2. **"↑ 1  Sent".** A count of segments still on their way, beside a take
   that had arrived complete — the poll stops when nothing is undecided, so
   its last snapshot was left on screen next to the word contradicting it.
   Caught in a screenshot. A stale number is worse than none: that one said
   the take was short.
3. **The icons shadowed the link namespace.** `public/take/icon-192.png` is
   served at a path `/take/<id>.<secret>` also matches — working only
   because static files are checked first. Moved to `/take-app/`.
4. **The worker and the manifest needed a session.** A performer has no
   account; a service worker that redirects to the sign-in page is a
   registration that silently fails, and a manifest behind a session is an
   install prompt that never appears.

### Verified

On a simulated Pixel 7 with no account: recorded against the song, **taken
offline mid-take**, two segments held in the queue (`pending=2`), the row
showing `↑ 3`, Send pressed while offline and refused politely rather than
truncating — then back online, `pending=0 broken=0`, and the joined
submission **835,677 bytes, exactly the sum of all three parts**, 530,432
samples. Without the queue the two offline segments would have been dropped
by the caller's `.catch(() => {})` and the take would have been a third of
its length, with nothing to show it.

The service worker registers at scope `/` with `active=true`; the manifest
is served to a context with no session at all, names the ask and carries no
production id.

### What is still not there

* **A published mobile app.** A signed binary in the App Store and Play
  Store needs accounts, certificates and a release pipeline. That is a
  distribution channel, not a product change, and it is the only part of
  T13a that this repository cannot reach. Everything the row said such a
  client would *add* is built and verified above.

## The fourth pass: the browser that offers nothing

*Run 2026-10-09, after the question "I thought you want to give a better
link to access the take app?" The answer to the question is one line —
`<your installation>/take`, public, no account — and checking that the
link actually works for the person it is for turned up a hole three
screens wide.*

### What was measured

A chat app's browser on Android (`FB_IAB`, a Samsung A13, the phone and
the browser most invitations are actually opened in) was driven through
the built product with `beforeinstallprompt` suppressed, because that
event never fires there:

| Screen | What it offered |
| --- | --- |
| `/take` | no install control at all, and that is CORRECT — `InstallTake` renders nothing where the browser gives it nothing, because a control that cannot act looks like a fault |
| the one door left | the quiet "Get the Take App" line at the foot of the page, which leads to `/downloads` |
| `/downloads` | card 01, "Take App … installs to your home screen from the app itself", linking to `/take` |

Three screens, no instruction, and the person is standing where they
started. Every part of that circle was built correctly and defended by a
test. The hole was between them.

### What it is now

`installWay(userAgent)` in `src/domain/getTheApp.ts` names the two or
three motions that put the page on a home screen, in the words the
phone's own menu uses: get out of the chat browser first, then the menu,
then Add to Home screen; the share sheet on an iPhone; `null` on a
laptop, where there is no home screen to add to. `useInstallOffer` hands
it to a surface only after the browser has stayed silent for
`PATIENCE` (1500 ms), so a browser that WILL prompt is never caught
giving instructions first, and never where the app is already installed.

Four surfaces draw it, each in its own form: the Take App's header and
the television network's show the one line; the invitation page and the
download centre show the steps.

| Browser | `/take` | `/downloads` |
| --- | --- | --- |
| Android, inside a chat app | "Open this page in your browser first" | the same, with three steps |
| Android Firefox | "Menu ⋮ → Add to Home screen" | the same, with three steps |
| iPhone Safari | "Share → Add to Home Screen" | the share sheet, with three steps |
| a laptop | nothing | nothing |

**A SNIFF, DELIBERATELY, AND IT DOES NOT CONTRADICT THE RULE BESIDE IT.**
`GetTheApp` is forbidden from guessing a phone, and still is: that rule
is about offering a FILE the installation may not have, where being
wrong is a dead link. This guesses a phone to name a MENU, where being
wrong costs a sentence that does not match. The honest answer where it
cannot tell is `null`.

### Two things this pass changed about how it is tested

**The iPhone found a second hole, which the first fix had made.** `way`
was withheld wherever `teach` (iOS Safari) was true, on the assumption
that every surface carried its own iOS sentence. Two do. The download
centre — the page that exists to end the circle — does not, so an iPhone
arriving there was shown nothing while an Android was given three steps.
Found by driving an iPhone through the built pages, not by reading the
hook.

**Source-text tests could not see any of it.** Nine mutations were run
against the first version, and two survived with the feature switched
off at its call site: `{false && <HowToKeepIt />}` leaves every string
in the file. `vitest.config.ts` now sets `esbuild: { jsx: 'automatic' }`,
and `test/domain/install-by-hand.test.ts` RENDERS each of the four
surfaces with `renderToStaticMarkup` and reads what came out. Of the
twenty-two mutations run in all, the last round killed every one;
three earlier survivors were resolved by DELETING a guard that no
mutation could reach — each one re-asking a question the hook had
already answered — rather than by writing a test around it.
