# The Take App as a platform — the brief, verbatim, and the ledger

*Given 2026-09-30, in two parts: what the Take App should become, and how it
behaves when every customer owns their own BalanceVid.*

This file follows the convention of `docs/TIMELINE-BRIEF.md` and
`docs/TAKE-APP.md`. **The brief is reproduced whole and unsummarised.** A
ledger follows with a row for everything in it, measured against what the
product already has, because the standing rule of this work is *check
whether the feature already exists and only needs an upgrade* — and on this
brief that rule pays unusually well. A section marked **UPGRADE** is the
present author's addition, not the brief's, and is marked so nobody later
mistakes one for the other.

---

# PART ONE — The brief, as given

I actually think Take App should not feel like a recording utility with a
library attached. If the user opens it and sees only "My Takes," it will
feel narrow and disposable.

It can become a participant/media app in its own right, while keeping its
primary purpose: watch, listen, participate, record and submit.

I would structure Take App around 4 experiences

## 1. Music

Not simply a file library.

It could be a music discovery and participation area:

If a particular song is enabled for participation, the user sees:

Take this song

and immediately enters the recording experience.

That connects beautifully to Studio Two.

## 2. Video

This could be much broader than music.

A video could have an associated participation action:

Watch the video

then:

Respond

which launches the Take App recorder.

So Studio One doesn't need to send someone a completely alien workflow. The
user can discover the content naturally inside Take.

## 3. Online TV

This is where I think Take could become particularly interesting.

A viewer watches the programme directly in Take.

If the programme allows participation:

Join the conversation

or:

Send your response

The app switches into the appropriate capture experience.

## 4. My Takes

Then the user's own material has a proper home.

So My Takes becomes one section of the application, not the entire
application.

## The really interesting part: the home screen

I wouldn't make Take open directly into a library.

I'd make it feel like a media + participation home:

That feels like an actual consumer application, rather than a remote-control
application for BalanceVid.

## And it creates an important connection to your larger system

The relationship becomes:

**BalanceVid Studio — Creates**

* songs
* performances
* questions
* programmes
* participation requests
* Online TV programmes

**Take — Consumes + participates**

* listens
* watches
* watches live
* performs
* records
* responds
* submits

**BalanceVid Studio — Receives**

* takes
* responses
* performances
* audience contributions

and turns them into:

masters → programmes → Online TV → distribution.

So the system becomes a two-way media platform, rather than simply a
production tool.

## There is another advantage

A producer could publish a song from Studio Two as:

Available for Takes

Then it automatically becomes discoverable in Take.

Likewise, a Studio One programme could publish:

Accepting video responses

and it appears in Take under Participate.

An Online TV programme could say:

Audience participation open

and Take shows the programme.

You therefore don't need to manually create a separate mobile experience for
every production.

The production system itself determines what the Take user can do.

I would therefore change the concept from:

**Take = recording app**

to:

**Take = BalanceVid's audience, participant and remote-capture app.**

That is much more substantial — and it gives people a reason to open the app
even when nobody has sent them an invitation.

---

# PART TWO — how would "take" function when different users own individual systems locally or by cloud?

Yes. This is where the architecture needs to become multi-instance, because
"Take" cannot assume that there is one central BalanceVid system.

The key idea is:

**Take is one application, but every invitation belongs to a particular
BalanceVid instance.**

That instance can be a customer's local/self-hosted installation or their
BalanceVid Cloud account.

## 5. Think of each BalanceVid as its own production station

For example:

while another customer has:

And a third could have:

Take doesn't belong to Customer A, B or C.

It is the common BalanceVid mobile application.

## 6. The invitation itself tells Take where to go

This is the critical mechanism.

Suppose Customer A creates a Studio Two production:

The Ancient of Days

BalanceVid generates:

Join this production

and a link such as:

`https://take.balancevid.com/r/7F82K...`

The Take app opens that link.

The invitation contains a secure reference to:

Take then knows:

"This recording belongs to Customer A's BalanceVid installation."

It does not upload the recording to some giant universal Take library.

## 7. Cloud BalanceVid is straightforward

For a cloud customer:

The participant doesn't need to know anything about the customer's
infrastructure.

## 8. Self-hosted BalanceVid is slightly different

This is the interesting part.

Suppose someone buys BalanceVid and installs it on their own server.

They might have:

or:

Their BalanceVid creates a Take invitation.

The invitation could still be a normal HTTPS link:

When the participant taps it:

### If Take is installed

The phone opens Take directly.

Apple supports Universal Links for this kind of arrangement: one HTTPS URL
can open the native app when installed, while falling back to the website
when it isn't.

Android has the equivalent App Links, which can associate the customer's
verified website with the mobile application.

So the experience can be:

## 8. But there is an important complication

A locally installed BalanceVid might be sitting on:

or:

That cannot simply be used by somebody else's phone over the Internet.

So self-hosted BalanceVid needs two possible modes.

### Local-only mode

Useful when everyone is physically in the same place/network.

### Public/remote mode

If participants are somewhere else:

The customer therefore needs a reachable endpoint, normally through their
own domain/reverse proxy or an appropriate remote-access configuration.

This distinction should be built into the product rather than hidden.

## 9. Don't make Take dependent on the customer's UI

This is another architectural decision I would make now.

Take should communicate with a defined BalanceVid API, not scrape or imitate
the customer's Studio interface.

For example:

The customer's BalanceVid instance implements those endpoints.

Therefore:

That is what allows one Take App to work with thousands of independent
BalanceVid systems.

## 10. What about Take's Music / Video / Online TV sections?

This is where your previous idea becomes even better.

Take can have a Home experience with content from the BalanceVid instances
that the user has relationships with.

For example:

But there's a crucial distinction:

**Global/public content**

Can be discovered by anyone.

**Private/customer content**

Only appears when the user has an invitation, follows that channel, has
access, etc.

## 11. A user could therefore connect to multiple BalanceVid systems

This is potentially very powerful.

Imagine you are a musician.

Your Take app might have:

Each is a separate production environment.

You might receive:

Yet you have one Take App.

## 12. And Take doesn't need to store everything centrally

This is important for your self-hosted business model.

Suppose Customer A owns their own BalanceVid server.

Their participants' videos can go:

Not:

That would undermine the self-hosted model.

The customer owns the production data.

## 13. Cloud customers can work differently

For BalanceVid Cloud:

Cloudflare Stream can provide the live-media layer for cloud customers: a
BalanceVid cloud instance can create a unique Live Input, receive the live
feed, and deliver playback; it can also simulcast the feed to external
destinations.

Again, the Take user doesn't need to know Cloudflare exists.

## 14. I would actually make the invitation the central object

Instead of thinking:

"Take uploads a video."

Think:

**A BalanceVid production creates a Participation Request.**

For example:

Take receives this request.

Then it knows exactly what it is supposed to do.

## 15. The same mechanism works for everything

Studio Two

Studio One

Online TV

Future

So the Take App doesn't need to understand every BalanceVid product
separately.

It understands Participation Requests.

## 16. This solves the local/cloud problem elegantly

The architecture becomes:

And one person can participate in both without installing two different
apps.

That's the architecture I would build toward.

## One important design rule

I would not build the Take App as a BalanceVid Cloud-only application now
and later try to retrofit self-hosting.

The Take protocol should be designed from the beginning so that:

**Any valid BalanceVid installation can be a Take destination.**

Then BalanceVid Cloud is simply one implementation of a BalanceVid instance,
and self-hosted BalanceVid is another.

That would make the software you've been building much more valuable as a
product, because you're no longer building one hosted service—you are
building a production platform with a common participation client and a
deployable core.

---

## A note on the text above

The brief arrived with some of its lists elided — several paragraphs read
"For example:" or "They might have:" with the examples missing, the section
numbering restarts at 5 and has two sections numbered 8, and the second
part's opening question is cut mid-word. **It is reproduced exactly as
given rather than tidied**, because the ledger below must be checkable
against what was actually said. Where a missing list is needed to make a
row testable, the row says so and the filled-in version is marked
**UPGRADE**.

---

# PART THREE — What already exists

This is the part that changes how the brief should be read.

**The protocol half of this architecture is already built, and was built
this way on purpose.** Not most of it by accident — the load-bearing
decisions the brief asks for in §6, §9, §12, §14, §15 and the closing
design rule are already the shipped design, and `docs/TAKE-APP.md` argues
for each of them in the same terms.

### The invitation is already the central object (§14, §15)

`src/domain/participation.ts` defines `ParticipationRequest`: a `holder`
(which kind of document is asking, and which one), an `Assignment` (`kind`,
what is asked in the producer's own words, and optionally what to watch or
perform against), `AllowedActions`, and a nine-state machine written as a
table. `AssignmentKind` is already
`'performance' | 'response' | 'question' | 'audio' | 'poll'` — the brief's
"same mechanism works for everything", as rows rather than as branches.

Studio Two, Studio One and Online TV already issue *the same object*. That
is precisely why the host's Answers desk can read one list.

### Take already speaks an API, not a UI (§9)

`/take/<link>` fetches `/api/take/<link>` for what is asked,
`/api/take/<link>/reference` for the song, and posts segments and the
submission to `/api/take/<link>/submissions/…`. It reads no studio HTML and
knows nothing about the producer's interface. The Take App and the studio
share exactly one thing: a request id and a secret.

### The instance is already the destination, and the origin is never stored (§6, §12, §16, and the design rule)

`docs/TAKE-APP.md` T14 states it directly and the code holds to it: *the
request is answered against the server that served it, and the origin is
never written into the record.* A submission is written into that
instance's own store, under that request — `var/accounts/<account>/requests/<id>/`
— and nothing central exists to write it to.

So the brief's closing design rule, *"any valid BalanceVid installation can
be a Take destination"*, is not a change to make. **It is already true, and
T14 gives the reason: a self-hosted installation that moves keeps its
invitations working, and a forged origin is not somewhere to send a
stranger's camera.**

### And the app installs from the instance that issued the link (T13a)

The per-link manifest added in #25 means an installed icon is scoped to
*that assignment on that instance*. A performer with requests from two
BalanceVid installations gets two icons, each opening its own — which is
the brief's §11 arrived at from the other direction.

### What the discovery half has

| the brief wants | what exists |
|---|---|
| "Accepting video responses" | `isRespondable(conversation)` — a published conversation with `respondable` set, and `/api/published` already returns the flag |
| a public list to discover from | `GET /api/published` — **conversations only** |
| a public place to watch | `/c/<id>/watch`, `/p/<id>/watch`, `/t/<id>/watch`, all reachable without a session |
| a live programme to watch | the channel's HLS playlist and segment routes, public |
| "Available for Takes" on a song | nothing. `Performance.publication` exists; no respondable equivalent |
| "Audience participation open" | nothing on `Channel` |
| Take's home, Music, Video, Online TV sections | nothing. `/take/<link>` is one page for one assignment |
| My Takes as a section | the per-link list only. Nothing spans requests or instances |
| an instance the user has a relationship with | nothing. A link is the only relationship there is |

**So the gap is the consumer application, not the protocol.** That is a
much better position to be in than the reverse, and it is worth stating
plainly before any of it is built: the expensive, hard-to-change decisions
are already the ones the brief asks for.

---

# PART FOUR — UPGRADE: where the concept needs sharpening

*This part is the present author's, not the brief's.*

### U1 · "Discoverable in Take" needs a second flag, not a reused one

The brief says a producer publishes a song as *Available for Takes* and it
"automatically becomes discoverable". Published and respondable are already
two different bits for a conversation, and the distinction matters more
here: **a producer may want a song open for takes by people who hold a link
and NOT listed publicly to strangers.** Those are different decisions and
one flag cannot carry both.

So: `publication.respondable` answers *may somebody respond*, and a
separate `listed` answers *may somebody who was not invited find it*. A
performance open for takes but unlisted is the common case — a band, not
the public — and collapsing them would make the safe case impossible.

### U2 · Discovery must be per instance, and the instance must be added deliberately

§10 distinguishes global/public from private/customer content, and §11 has
one musician connected to three production environments. Those two together
imply something the brief does not say outright: **Take's home is not one
feed. It is a feed per instance the person has added, plus nothing else.**

There is no global BalanceVid index and there should not be one — it would
be exactly the central library §12 rejects, wearing a different hat. A
person adds an instance by following a link to it, and the home screen is
the union of what those instances choose to list.

### U3 · The invitation already carries the instance; a *relationship* is the new object

§6's mechanism works today. What does not exist is the thing §10 and §11
need: a remembered list of instances, each with whatever standing the
person has there. That is a new client-side object —

```
Connection { origin, name, addedAt, requests[], follows[] }
```

— and it lives **on the device**, not on any server, because a list of
which production companies a musician works with is exactly the kind of
thing that must not accumulate centrally. Same argument as §12, applied to
the participant rather than to the footage.

### U4 · Local-only and public/remote should be a stated mode with a visible consequence

§8 is right that the distinction must be "built into the product rather
than hidden", and the honest form is not a setting buried in a config file:
it is a fact the studio states when it makes a link. An installation
reachable only on a LAN should say, at the moment of creating an
invitation, *"this link works on this network only"* — because the failure
it prevents is a producer sending a link across the country and a performer
receiving a page that will not load, with nothing to explain why.

`originOf()` already resolves what a browser actually reached; the mode is
a deployment fact to declare beside it, and the QR route is where it bites
first — a square on a wall is precisely the local-only case.

### U5 · The four sections are three queries and a list

Music, Video and Online TV are not three subsystems. They are the same
query — *what may I take part in* — filtered by the assignment kind that
already exists (`performance`, `response`/`question`, and a channel's
programme). Building them as three features would be the same mistake the
timeline brief warned against: *"Don't create separate systems for these
features."*

So: one `GET /api/participate` per instance, returning what that instance
has chosen to list, with a kind on each row. Take groups by kind. My Takes
is the only genuinely different section, because it is the only one about
the person rather than about the instance.

### U6 · A packaged app is now the blocker it was not before

Universal Links and App Links (§8) need a signed binary and a
domain-association file served by *each customer's* domain. #25 built
everything a native wrapper would add — background upload, retry,
installable, offline shell — and deliberately stopped short of the store
listing. §8 is the first requirement in either brief that genuinely cannot
be met without it, and the ledger says so rather than pretending a PWA
covers it.

---

# PART FIVE — The author's correction: availability is three concepts, not two

*Given 2026-09-30, in reply to the two-flag proposal in **U1**. Reproduced
as given. The correction is accepted and **U1 is superseded by it**; U1 is
left above so the ledger can be read against what was actually proposed and
what replaced it.*

I would actually push back slightly further than your two-flag proposal.

I agree that:

respondable ≠ listed

They absolutely should not be one boolean.

But I don't think those two flags alone fully express the access model.

I'd make the concepts:

**TAKE AVAILABILITY**

Respondable
    Can someone submit a Take for this item?

Listed
    Should this item appear in discovery/browse surfaces?

Access
    Who is allowed to submit a Take?

Then you can express the important cases cleanly:

| Respondable | Listed | Access | Meaning |
| --- | --- | --- | --- |
| No | Yes | — | People can discover the song, but cannot Take it |
| Yes | Yes | Anyone | Public Take opportunity |
| Yes | No | Invitation | Band-only/private Take opportunity |
| Yes | No | Link holders | Unlisted Take opportunity |
| Yes | Yes | Members | Discoverable, but restricted |
| No | No | — | Completely unavailable |

So your band example becomes:

```
Song
├── Respondable: YES
├── Listed: NO
└── Access: INVITED PARTICIPANTS
```

That is much better than trying to make listed=false somehow imply private
access.

I would therefore keep your two flags, but add an explicit access policy
rather than allowing those flags to carry authorization semantics.

## More importantly: don't create another system

Given what you have now told me about TAKE-PLATFORM.md, I would not
introduce another Take object, another invitation model, another assignment
mechanism, or another multi-instance registry.

Your ledger already establishes:

```
Studio One ──┐
Studio Two ──┼──> Participation Request ──> Take
Online TV ───┘
```

That's the foundation.

The consumer app should simply become another client of that existing
system:

```
                         BalanceVid
                              │
             ┌────────────────┼────────────────┐
             │                │                │
         Studio One       Studio Two       Online TV
             │                │                │
             └────────────────┼────────────────┘
                              │
                  Participation Request
                              │
                              ▼
                       ┌─────────────┐
                       │  TAKE APP   │
                       └─────────────┘
                              │
                   ┌──────────┼──────────┐
                   │          │          │
                 Music      Video       TV
                   │          │          │
                   └──────────┼──────────┘
                              │
                         My Takes
                              │
                              ▼
                    Existing Take API
                              │
                              ▼
                    Existing BalanceVid
```

That means the next architectural work should be overwhelmingly
consumer-side:

1. Take App identity/session.
2. Invitation/deep-link opening.
3. Request presentation.
4. Camera/microphone selection.
5. Recording.
6. Multiple takes.
7. Local take management.
8. Upload/resume.
9. Submit.
10. Status feedback.
11. Music/video/TV discovery.
12. My Takes.
13. Private/unlisted/listed availability handling.

The underlying BalanceVid installations remain the authorities.

And the rule you highlighted should remain exactly as it is:

**Any valid BalanceVid installation can be a Take destination.**

Not a new feature. Not something the consumer app owns. It's a property of
the existing platform.

So I would treat the current work as:

**Platform: substantially established.**
**Protocol: established.**
**Multi-instance model: established.**
**Three-studio integration: established.**
**Consumer experience: the major missing surface.**

## How this lands in the code

**`access` is a policy, and the two flags stop carrying authorization.**
That is the whole of the correction and it is right: `listed: false` was
being asked to mean *private*, which it does not — an unlisted song with
`access: 'anyone'` is open to anybody who has the URL, and an unlisted song
with `access: 'invited'` is open to four people. Those are different, and a
boolean cannot say which.

**It extends two existing types and introduces no third.** `Publication`
already carries `respondable` and is shared by conversations and
performances; `ChannelPublication` is separate because a channel publishes a
schedule rather than a render. Both gain `listed` and `access` beside the
bit that is already there. Nothing is moved, so no document migrates.

**Access is meaningless when nothing may be submitted**, which the table
says with its two em-dashes, and the model should enforce rather than
merely allow: rows 1 and 6 differ only in `listed`, and a stored `access`
on a non-respondable item is a value that will later be read as though it
meant something.

**The defaults preserve U-31 exactly.** An already-published respondable
conversation is `listed: true, access: 'anyone'` — which is what it is
today and what `/api/published` already returns. The fields are optional so
nothing on disk changes, and the defaults are stated rather than implied.

**Of the thirteen consumer-side items, six are built** — 2, 4, 5, 6, 7 and
8 — three by #25 and #26 in the last two days. The ledger rows below say
which.

---

# The ledger

`HAVE` means it works today. `PARTIAL` means part of it does. `GAP` means
it does not, with the reason. Nothing here has been built yet from this
brief; the `HAVE` rows are things the product already had when the brief
arrived, which is the point of measuring first.

| id | item | state | notes |
| --- | --- | --- | --- |
| P1 | Take is not a recording utility with a library attached | **HAVE, as the shape** | `/take` is the home: Music, Video, Online TV and My Takes. `/take/<link>` remains one assignment for one person — the two doors the brief describes. A first visit shows no "My Takes" at all, because an empty one at the top of the first screen is exactly the narrow, disposable impression the brief is trying to avoid |
| P2 | Music — songs enabled for participation, "Take this song" | **HAVE** | published open → a `music` row on the home → *Take this song* → a request is minted and the recorder opens on it. Verified end to end on a phone with no account |
| P3 | Video — watch, then "Respond", launching the recorder | **HAVE** | `isRespondable` and `/api/published` already answer *may somebody respond to this conversation*, and `/c/<id>/watch` is public. The Take-side surface is the `video` section, and *Respond* mints the request |
| P4 | Online TV — watch the programme, "Join the conversation" | **HAVE as the surface; the channel control is not built** | the channel's watch page, HLS playlist and segment routes are already public, and the Answers desk already receives responses. The `programme` section shows it with *Watch* and, where the channel is open to anyone, *Send something in*. `ChannelPublication` carries the three fields and the listing and claim both read them; what is missing is the control in Online TV that SETS them, which is P10 |
| P5 | My Takes as one section, not the whole app | **HAVE** | one section among four, held in `localStorage` on the device and nowhere else — a list of which productions somebody takes part in is exactly what must not accumulate centrally, which is §12's argument about the footage applied to the participant. The server is never asked who this person is |
| P6 | a media + participation home screen | **HAVE** | `GET /api/participate` is U5's one endpoint: every listed thing this installation offers, with a `kind` per row, newest first. Three of the home's four sections are that one list grouped by kind — one fetch, asserted, because three would be the mistake the timeline brief named |
| P7 | Studio creates / Take consumes / Studio receives | **HAVE, as the shape of the system** | the three studios create requests; the Take App consumes and submits; acceptance turns a submission into production material. This row is the architecture, and it is the shipped one |
| P8 | "Available for Takes" published from Studio Two | **HAVE** | `src/domain/availability.ts` holds the three concepts the author's correction specifies (PART FIVE): `respondable`, `listed` and an explicit `access` policy of four, widest first. The brief's six rows are tested row for row as the specification they are, and all ten mutations of the logic are killed. `Publication` and `ChannelPublication` each gained the two new fields beside the `respondable` they already had — no third object, nothing moved, nothing on disk migrated. The control is in the Deliver stage above the publish button, from one `AvailabilityFields` used by Studio One too, and `GET /api/participate` reads it. **`publishPerformance` wrote `respondable: false` as a constant** — so "Available for Takes" was never a setting a producer could reach, and the panel said so in a sentence that was true about a decision nobody had made |
| P9 | "Accepting video responses" from Studio One | **HAVE** | the flag existed and was one checkbox answering three questions, two of them silently. The same control now sets all three, and `/api/participate` returns the conversation as a `video` row with what it will accept |
| P10 | "Audience participation open" on an Online TV programme | PARTIAL — the field exists now | `ChannelPublication` carries the same three, named identically and read by the same module, because a second vocabulary for one decision is how two surfaces come to disagree about who is allowed in. A channel's publication is its own type only because it publishes a schedule rather than a render. The control and the listing are still to build |
| P11 | the production system determines what a Take user can do | **HAVE (domain)** | `Assignment` and `AllowedActions` already say what may be sent, and the recorder already reads them — an audio request does not open a camera |
| P12 | Take = audience, participant and remote-capture app | **HAVE** | it opens on what there is to take part in rather than on a library, and gives somebody a reason to open it with no invitation — which was the brief's own test of the idea |
| P13 | multi-instance: Take assumes no central system | **HAVE, and load-bearing** | T14: the request is answered against the server that served it and the origin is never written into the record |
| P14 | each BalanceVid is its own production station | **HAVE** | a deployment holds its own accounts, documents, assets and requests; nothing is shared between installations |
| P15 | the invitation tells Take where to go | **HAVE** | the link is an origin plus `req_id.secret`; opening it *is* selecting the instance |
| P16 | a recording is not uploaded to a universal Take library | **HAVE** | submissions are written to `…/requests/<id>/` inside the issuing instance's own store. There is nothing central to write to |
| P17 | cloud BalanceVid is straightforward for the participant | **HAVE, by the same mechanism** | a cloud instance is an origin like any other; nothing in the client knows which it is |
| P18 | self-hosted BalanceVid works the same way | **HAVE** | likewise, and deliberately: this is the closing design rule, satisfied by construction rather than retrofitted |
| P19 | Universal Links / App Links open the app from a customer's domain | GAP, and now genuinely blocked on a packaged app | needs a signed binary AND an association file served by each customer's domain. #25 built what a native client *adds*; this is the first requirement that needs the listing itself. See **U6** |
| P20 | local-only vs public/remote mode, stated rather than hidden | GAP | see **U4**: the honest form is the studio saying "this link works on this network only" at the moment it makes one, because the failure is a link sent across the country that will not load |
| P21 | Take speaks a defined API, never the customer's UI | **HAVE** | the Take App calls four JSON routes under `/api/take/<link>` and reads no studio markup |
| P22 | one Take App works with many independent installations | **HAVE per link; GAP as an experience** | any link from any origin already works. What does not exist is a remembered list of instances — see **U3** |
| P23 | home content from instances the user has a relationship with | GAP | needs U3's `Connection` object, held on the device |
| P24 | global/public vs private/customer content | PARTIAL | the per-item half is built: `availabilityState` names the six cases and `maySubmit` answers who may take part, so an instance can now say what it lists and to whom. The per-INSTANCE half is still **U2** — discovery must be per added instance, because a global index would be the central library P16 rejects wearing a different hat |
| P25 | a user connected to several production environments at once | GAP as a list; **HAVE per invitation** | and #25's per-link manifest already gives one home-screen icon per assignment, which is this from the other direction |
| P26 | the customer owns the production data | **HAVE** | P16, and it is the self-hosted business model's load-bearing property |
| P27 | Cloudflare Stream as the cloud live-media layer | out of scope here | a deployment choice for a hosted offering, not a change to this product. `docs/DEPLOYMENT.md` is where it would be recorded |
| P28 | the invitation is the central object | **HAVE** | `ParticipationRequest`, its nine states as a table, and one object across all three studios |
| P29 | the same mechanism for Studio Two, Studio One, Online TV and future products | **HAVE (domain)** | `AssignmentKind` as five rows. A fourth product adds a row, not a client |
| P30 | not cloud-only with self-hosting retrofitted later | **HAVE, by construction** | the origin is never stored, so there was never a central assumption to remove |
| P31 | availability is three concepts, not two | **HAVE (domain)** | the author's correction, and it was right: `listed: false` was being asked to mean *private*, which it does not. An unlisted item open to `anyone` and one open to `invited` are different situations and a boolean cannot say which. Discovery and authorization no longer carry each other's meaning |
| P32 | access is meaningless where nothing may be submitted | **HAVE (domain)** | the two em-dashes in the author's table, enforced rather than allowed: `accessOf` returns null for a non-respondable item, so a stray stored policy cannot later be read as though it meant something |
| P33 | an invitation satisfies every policy | **HAVE (domain)** | narrowing a song from public to invited must not refuse the people already invited — the sort of thing that otherwise shows up on the evening of the session |
| P34 | the defaults change nothing already published | **HAVE (domain)** | absent `listed` is true and absent `access` is `anyone`, which is exactly what U-31 says a published conversation is and what `/api/published` already returns. Every field optional, so no document on disk becomes invalid by sitting still |
| P36 | one listing, not three sections | **HAVE** | `GET /api/participate` answers for music, video and programmes from one route, because they are one question filtered by kind. Three endpoints would be the mistake the timeline brief named |
| P37 | a listing shows only what its author chose to show | **HAVE** | published, not withdrawn, and listed — three conditions, all the author's own decision. Verified: an unlisted song published as invited-only does not appear at all, and the existence of a draft stays private |
| P38 | an unknown access word is the narrowest, not the widest | **HAVE** | the opposite of how `qualityFor` resolves a word it does not know, and deliberately: a stale preset falls back to a picture nobody minded, and a stale access word falling back to `anyone` would publish somebody's song to the world because a field was misspelled |
| P39 | taking part without an invitation | **HAVE**, and it is the only creating write a stranger may make here | `POST /api/participate/<kind>/<id>` mints the SAME `ParticipationRequest` a producer mints — no self-service type, no second invitation model — so everything downstream works without knowing which it was. Gated on two of the author's own decisions, both required: `listed`, and `access: anyone`. Verified against all four policies: unlisted+invited, listed+link, listed+not-respondable all refuse 404; listed+anyone returns 201 |
| P40 | one refusal, whatever the reason | **HAVE** | a route answering "no such performance" and "that is closed" differently is a way to enumerate somebody's drafts, so every path answers alike — including the catch. [D-03] |
| P41 | a per-item ceiling on self-service claims | **GAP, and stated rather than implied** | a press writes a request directory, so an item opened to anyone can be claimed repeatedly by a script. The client asks once per device because it keeps what it is given, which covers the accidental case and not the deliberate one. The honest fix is a producer-facing ceiling, and it does not exist yet |
| P35 | the consumer app is another client, not another system | **the governing rule**, and the ledger's own shape is the argument | no new Take object, no second invitation model, no parallel assignment mechanism, no multi-instance registry. Thirteen consumer-side items in PART FIVE; **six are already built** — deep-link opening, camera and microphone selection, recording, multiple takes, local take management, and upload/resume — by #25 and #26 |

---

## The order this should be built in, and why

1. **P8 / P10 — the two flags, with U1's split.** Everything downstream is a
   query over them, and a listing built before the flags exist would have to
   invent what it is filtering on. Two bits, not one: *respondable* and
   *listed*.
2. **U5's one endpoint.** `GET /api/participate` per instance, returning what
   that instance chose to list, with a kind per row. Three of Take's four
   sections are this one query grouped — building them separately is the
   mistake the timeline brief already named.
3. **U3's `Connection`, on the device.** The remembered list of instances.
   This is what turns "a link I was sent" into "somewhere I take part", and
   it must not accumulate on any server.
4. **P5 / P6 — My Takes, then the home screen.** My Takes spans the
   connections from step 3; the home screen is the sections from step 2
   beside it.
5. **U4 — the local-only declaration.** Small, and it prevents the
   failure that is hardest to diagnose from the participant's end.
6. **P19 — the packaged app.** Last, because it is the only row that needs
   something outside this repository, and because everything above makes the
   web surface worth wrapping.

**Nothing here requires changing how a submission reaches a producer.** That
is the measure of how well the participation model was chosen: a brief that
reshapes the entire client asks for no change to the object the client and
the studio share.
