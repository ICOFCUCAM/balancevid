# Go Viral — the brief, what already exists, and the stages

> *"The important thing is to build these capabilities into the
> existing take/timeline model, not create a second editing
> system."*

Concern **C**. Written to the same method as `docs/TAKE-DESKTOP.md`
(concern A) and `docs/TV-NETWORK.md` (concern B): the brief kept in
the author's own words, every claim about the existing system
naming the file it was read from, and stages that add or upgrade
rather than rewrite.

The author's standing instruction decides how this document is
written and how it must be read:

> *"always check if the feature already exist and only need
> upgrade"*
>
> *"all what i give is not to rewrite but to measure with what we
> already have in the system and cover the gaps"*
>
> *"Don't create separate systems for these features."*
>
> *"Document this map as you shall execute it strictly while adding
> or making any relevant upgrade. do not summerise it. a
> professional and premium upgrade is rather required than to
> summerise the build."*

So nothing below is summarised away. The brief's twenty sections
are reproduced whole, each one followed by four things only a
reading of this repository can supply: **what already exists**,
**what is a real gap**, **what must not be touched**, and **why**,
in doctrine terms.

---

# PART ZERO — What this is, and what it is not

**Go Viral is a campaign layer over participation that already
works.** It is not a second participation protocol, not a second
Take client, not a second media pipeline, not a second editor, and
not a second place where a take becomes part of a production.

| it IS | it is NOT |
|---|---|
| a CALL named as an object, with a window and rules | a second kind of invitation |
| a public page for that call | a separate website |
| human judging, recorded with reasons | a machine ranking people |
| a consent record per entry | a checkbox |
| one more client relationship for the Take App | a second Take server |
| BalanceVid operating a public network | a customer owning one |

The three studios issue participation requests today. A campaign is
what a hundred of those requests belong to, said once instead of a
hundred times. Everything a participant does — opening a link,
recording, keeping takes locally, uploading, resuming, submitting —
happens through the surfaces that already exist, unchanged.

## The two separations that are not negotiable

The author named both, and both are architectural rather than
cosmetic. They are stated here, at the front, because every stage
in PART FOUR is checked against them and a stage that breaks either
is wrong however well it works.

### Separation one — a customer never acquires the network

**A self-hosted BalanceVid customer must never gain ownership or
control over the public BalanceVid competition infrastructure.
Their channel remains theirs; the BalanceVid Public Competition
Network remains operated by BalanceVid.**

What enforces that in this codebase today, concretely, is one
function:

```ts
// src/store/paths.ts:64
export function owned(account: string = OWNER_ACCOUNT_ID): string {
  return join(VAR_ROOT, 'accounts', safe(account));
}
```

Every document an account holds is reached through it —
`conversations`, `performances`, `channels`, `library`, `requests`,
and the channel `lineup.json` — and its own header says why that
matters:

> *"On a filesystem store the data layer IS the path, so isolation
> means the account is a DIRECTORY somebody else's id cannot name —
> not a field every query has to remember to filter on. A missed
> filter leaks; a missed path join cannot reach outside the tree,
> because `safe()` refuses anything with a separator in it."*

**What that means for Go Viral is precise and it is not
reassuring.** `owned()` separates one account from another. It does
not separate *the installation's own work* from *a network the
installation takes part in*, because today there is no such
network and no such distinction. A campaign written under
`owned()` is a campaign the installation's single owner can read,
edit, delete and renumber. If the public competition network's
records were ever written there, a self-hosted customer would hold
them.

So the enforcement that exists is the right shape and is pointed
at the wrong thing, and three additions make it point at this:

1. **The public network is a different installation, not a
   different directory.** A self-hosted customer reaches it exactly
   as a Take client reaches any installation — as an origin in
   `shared/src/connections.ts` — and holds nothing of it on their
   own disk but a `Connection { origin, name, addedAt }`. This is
   not a new mechanism. It is the mechanism, and `connections.ts`
   already carries the rule that makes it safe: *"a link is an
   origin plus a credential, and the origin is never written into
   any record."*
2. **Network-owned records live outside every account tree**, on
   the installation BalanceVid operates. The precedent is already
   in `paths.ts`: `var/queue/`, `var/senders/`, `var/overlays/` and
   `var/models/` are instance-level and deliberately not under
   `owned()`, because they belong to the running system rather than
   to the person using it. A campaign ENTERED into the public
   network is a record of that kind, on that installation.
3. **A campaign a customer runs on their own installation is
   theirs, entirely, and works with the network unreachable.** That
   is the test, and V-8 is judged on it.

`src/store/entitlement.ts` shows the second half of the mechanism —
`requireStudio` refuses, at the store, a studio the account does not
hold, having rejected the navigation bar (*"a dimmed tab is a
courtesy"*), `isOwner` (*"a check that a synthetic URL can silently
disable is worse than no check"*) and the middleware (*"middleware
has no business reading storage"*). **Operating the network is not
a studio and must not become an entitlement**, because an
entitlement is a thing an account can be granted, and the one
sentence this separation turns on is that it cannot.

### Separation two — three ids that must never be confused

**`track_id`, `campaign_id` and `take_id` must never be confused.**
Mapped onto what this repository calls each of them today:

| the brief | this repository | id shape | who owns it |
|---|---|---|---|
| `track_id` | the `Performance` holding a `MasterTrack` (`src/domain/performance.ts:207`) | `perf_…` | the producer whose studio made it |
| `campaign_id` | **does not exist** | `camp_…` at V-2 | the installation running the call |
| `take_id` | `PerformanceTake.id` (`performance.ts:811`) *after acceptance* | `take_…` | the performance it was attached to |
| — and before acceptance | `Submission.id` (`participation.ts:243`) | `sub_…` | nobody; it is a log entry |

**The fourth row is the one that gets lost, and losing it is losing
D-25.** A take and a submission are not the same object at
different times; they are two objects, and the moment between them
is the whole architecture:

> *"NOT A TAKE, AND NOT A RESPONSE, until somebody accepts it. That
> is the load-bearing decision of the whole design…"*
> — `src/domain/participation.ts:236`

A campaign that called a submission a `take_id` would have made
every entry part of a production at the instant it arrived.
Throughout this document, **an ENTRY is a submission that names a
campaign**, and it becomes a take at exactly one moment, through
`accept()` in `src/domain/participationEdit.ts`, exactly as every
other submission does.

And a fifth id is already in the system and is not any of these:
`capturedIn.id`, the CAPTURE, added at B-1 — *"a take gains the
capture it was recorded in"*. Four cameras of one entry share a
capture. A capture is not a campaign and a campaign is not a
capture; `takesMade` in `participation.ts` already depends on the
difference.

```
perf_…   a song                      one producer's document
camp_…   a call to sing on it        one installation's object
sub_…    what somebody sent          a log entry, not a production
take_…   what was accepted           part of a performance
cap_…    which cameras saw one go    B-1, already shipped
```

## A note on the text in PART ONE

The brief is reproduced from the author's own statement of it, in
its own order and with its own diagrams, and the sections are
numbered as the author numbered them. Where a sentence is quoted it
is quoted because it is the clearest statement of the thing and
paraphrasing would soften it — the same practice `docs/TAKE-APP.md`
and `docs/TAKE-PLATFORM.md` follow. **Nothing in PART ONE is a
measurement**; measurements are the four blocks that follow each
section, and every one of them names the file it was read from.

---

# PART ONE — The brief, as given, and measured against the system

## 1. The viral loop is the product, not a feature of it

> *"The loop is the thing. A track is opened. A campaign is
> announced. Somebody takes it. They share what they made, because
> it is theirs. Their audience arrives to watch it, and some of
> them take it too. The results go out and the whole thing starts
> again. If any one of those arrows is broken the loop is a
> funnel, and a funnel empties."*

```
            ┌───────────────────────────────────────────┐
            │                                           │
            ▼                                           │
     A TRACK IS OPENED                                   │
            │                                           │
            ▼                                           │
     A CAMPAIGN IS ANNOUNCED                             │
            │                                           │
            ▼                                           │
     SOMEBODY TAKES IT ──────► THEY SHARE WHAT THEY MADE │
            │                            │              │
            ▼                            ▼              │
     THE ENTRY IS JUDGED        THEIR AUDIENCE ARRIVES   │
            │                            │              │
            ▼                            │              │
     RESULTS GO OUT ────────────────────►┴──────────────┘
```

> *"And notice what the loop is made of. Every arrow in it is
> something the system already does once. Go Viral is not new
> machinery. It is the existing machinery wired into a circle."*

**WHAT ALREADY EXISTS.** Five of the seven arrows are shipped.

*A track is opened* is `TakeAvailability` in
`src/domain/availability.ts`: `respondable`, `listed`, `access` and
`claims`, written onto the `Publication` a performance already
carries (`src/domain/document.ts:444`).

*Somebody takes it* is
`app/api/participate/[kind]/[id]/route.ts` — the "Take this song"
endpoint, which mints an ordinary `ParticipationRequest` marked
`claimed: true`:

> *"IT MINTS THE SAME OBJECT A PRODUCER MINTS, and that is the
> whole design. No self-service request type, no second invitation
> model, no parallel assignment."*

*They share what they made* has the machinery and not the act:
`src/domain/clips.ts` produces vertical clips per claim–response
pair (*"the composition step is the distribution engine"*),
`src/domain/reel.ts` produces a response reel, and
`paths.shareCard` and `paths.claimCards` already draw the picture a
pasted link shows.

*Their audience arrives* is the public layer TV-NETWORK built:
`/tv`, `/p/<id>/watch`, `/c/<id>/watch`, the station pages, and
`src/auth/policy.ts`'s `PUBLIC_EXACT` / `PUBLIC_PATTERNS`, which is
where a public surface is declared.

*The entry is judged* exists only as the producer's accept/reject
in `participationEdit.ts` — which is a decision about whether to
USE something, not a score.

**THE GAP.** Two arrows. **Nothing names the call**, so "a campaign
is announced" has no object, no window, no rules and no page; and
**nothing closes the loop back to the participant**, so "results go
out" has no recipient — a participant is a NAME and not an account,
by construction, and there is nowhere to send anything.

**MUST NOT TOUCH.** `/api/participate` and
`/api/participate/[kind]/[id]`. They are the loop's entry arrow and
they work. A campaign adds a reason for them to be reached; it does
not change what they do.

**WHY.** D-19: *"Grep for the noun before writing the verb."* The
nouns in this loop — publication, availability, request,
submission, clip, share card, public page — are all in the
repository under the names the brief uses. The two that are not are
exactly the two stages this document starts with.

## 2. Track, Campaign, Take — three objects, three ids

> *"Keep the tree in your head and the ids straight, because
> everything that goes wrong in a system like this goes wrong at
> one of these joins."*

```
TRACK
└── CAMPAIGN
    ├── rules
    ├── window
    ├── prize
    └── ENTRIES
        ├── ENTRY
        │   ├── consent record
        │   ├── media asset
        │   │   ├── original
        │   │   ├── mezzanine
        │   │   ├── proxy
        │   │   └── poster
        │   └── judgements
        └── ENTRY …
```

> *"A track can have more than one campaign over its life. A
> campaign belongs to exactly one track. A take belongs to exactly
> one campaign and to exactly one participant. Nothing about that
> is clever and all of it has to be enforced."*

**WHAT ALREADY EXISTS.** Two of the three nodes and all of the
leaves.

TRACK is `MasterTrack` on a `Performance` — title, artist, writer,
`class`, `licence`, `durationSamples` measured by decoding, the
song's own clock and its sections. `PerformanceId` is `perf_…`.

TAKE is `PerformanceTake` — id, `assetId`, label, environment,
accent colour, alignment, trim. Before acceptance it is
`Submission` — id `sub_…`, `assetId`, `kind`, `durationSamples`,
`offsetSamples`, `device`, `capturedIn`, `at`, `acceptedAt`.

MEDIA ASSET and its variants are the naming convention in
`src/store/paths.ts`: `performanceAsset`, `takeMezzanine`,
`takeProxy`, `takePoster`, `takeAnalysis`,
`performanceTakeStrip`, plus the measured sidecar in
`src/store/mediaFacts.ts`. **A `MediaAsset` with `MediaVariant`
rows is what this already is**, expressed as paths derived from one
`assetId` rather than as a table. See section 8.

CAMPAIGN does not exist. Nothing in `src/domain/` carries the word.

**THE GAP.** The middle node, and only the middle node. A campaign
is **genuinely a second object** and the reason is given in full in
section 4; it is not a state added to `ParticipationRequest` and it
is not a flag on `Publication`.

**MUST NOT TOUCH.** `PerformanceTake`, `Submission`, `AssetId` and
the path functions that derive variants from an asset id. A
campaign references ids; it does not reshape anything they belong
to.

**WHY.** D-19 rule 3 — *"Ask what already crosses this
boundary."* The join between a track and the people answering it
already crosses `ParticipationRequest.holder`, which carries
`{ kind: 'performance' | 'conversation' | 'channel', id }`. A
campaign hangs off that join; it does not replace it.

## 3. The campaign is the unit of virality

> *"A song that is merely open for responses is not a campaign. A
> campaign has: a name somebody can say out loud, a start and an
> end, rules a participant can read before they record, a reason to
> enter, and a moment when it is over and there is a result. An
> open door is not an event. People turn up to events."*

> *"And a campaign must be announceable in one object. If the rules
> live in a paragraph the producer typed into forty invitations,
> then there are forty rulebooks and they already disagree."*

**WHAT ALREADY EXISTS.** `Assignment.asks` carries the producer's
words — *"What the producer is asking, in their own words. Shown as
given."* — per request. `AllowedActions` carries what may be sent
and how many. `TakeAvailability.claims` carries a ceiling, with
`CLAIMS_BY_DEFAULT = 100` because *"ticking 'anyone' says who may
take part rather than agreeing to an unbounded number of them"*.

So the rules exist, and the brief's warning is exactly right about
where they live: in `newRequest`, `asks` is built per request. The
claim route writes `Sing along to "${performance.master.title}"`
once per stranger who presses the button. **Forty invitations is
forty copies of the same sentence.**

**THE GAP.** A named call, with a window and one copy of the rules,
that a request POINTS AT rather than embeds. The announcement is
the object; `asks` becomes a rendering of it rather than a
duplicate of it.

**MUST NOT TOUCH.** `Assignment.asks` itself. A request issued
before campaigns exist carries its own words and must keep
carrying them; a request that names a campaign reads the
campaign's. One field, two sources, no migration.

**WHY.** D-19 rule 5: *"When something genuinely is new, say why in
the file."* And INV-00's representation rule, applied downward: the
document is the canonical artefact, so the rules of a competition
belong in one document rather than being reconstructed from forty.

## 4. The campaign lifecycle

> *"A campaign moves through states and they are not the same
> states a single person's invitation moves through. Write them
> down:"*

```
DRAFT
  └─► SUBMITTED
        └─► REVIEW
              └─► APPROVED
                    └─► SCHEDULED
                          └─► LIVE
                                └─► CLOSING
                                      └─► JUDGING
                                            └─► RESULTS
                                                  └─► COMPLETED
```

> *"DRAFT is the organiser writing it. SUBMITTED is them handing it
> over. REVIEW and APPROVED are BalanceVid deciding whether it goes
> on the public network. SCHEDULED is approved and not yet open.
> LIVE is open. CLOSING is the last stretch, where the countdown is
> the point. JUDGING is closed to entries and open to judges.
> RESULTS is decided and announced. COMPLETED is over and
> archived."*

### Is this the `ParticipationRequest` machine extended, or a second object?

**It is a second object, and here is the argument, because the
question deserves one rather than an assertion.**

`src/domain/participation.ts:117` holds the existing machine:

```
created → sent → opened → recording → submitted
       → received → reviewed → accepted → rejected → attached
```

with `REQUEST_NEXT` as a table and `mayMove` as the only predicate
that reads it. Three of those names collide with three of the
campaign's — `submitted`, `reviewed`, `accepted`/`approved` — and
**every one of the collisions means something different.**

| word | on a request | on a campaign |
|---|---|---|
| submitted | a participant sent a recording | an organiser handed the call to BalanceVid |
| reviewed | a producer looked at a recording and held it | BalanceVid is deciding whether the call may run |
| accepted / approved | this recording will be used | this call may exist |

**Four facts decide it.**

*The actors are different.* The request's machine is a producer and
one participant. The campaign's is an organiser, BalanceVid, a
clock, and a panel of judges. `advance()` takes `by?: string` for
the audit line; a machine whose transitions are driven by four
different kinds of actor needs more than an optional name.

*The lifetimes are different, and nested.* A campaign contains N
requests and outlives all of them. `attached` is the request
machine's one terminal state — *"what a production has used cannot
be un-asked"* — and a campaign reaches COMPLETED only after every
request under it has reached one of ITS ends. A single machine
cannot be both the container and the thing contained.

*The clock is different.* A request has `expiresAt` and `isOpen()`,
per link, per person. SCHEDULED → LIVE → CLOSING is one clock for
everybody, and the countdown is a shared fact — which is the point
of the CLOSING state and the reason it is not just "LIVE with less
time left" on somebody's screen.

*And merging them produces sentences nobody means.* A campaign that
can be `recording` is nonsense. A request that can be `JUDGING` is
nonsense. `REQUEST_NEXT` is a total map over `RequestState`; adding
ten states to it makes ninety entries of which eighty are
unreachable, and an unreachable row in a table whose whole virtue
is readability is a table that has stopped being read.

**So: a second object, and NOT a second protocol.** The distinction
is the one TAKE-DESKTOP drew about clients — *"They are not two
different participation protocols. They are two clients of the
same Take system."* A campaign is a second NOUN in the same system.
Nothing about how a participant takes part changes.

### And four of the ten states are deliberately deferred

**DRAFT → SUBMITTED → REVIEW → APPROVED only means something when
there are two parties**, and on one installation there is one:
`OWNER_ACCOUNT_ID = 'acct_owner'` (`src/domain/account.ts`), one
account, one password, one owner. An owner submitting a campaign to
themselves for review and approving it is ceremony with the same
person on both sides of it — and a state machine whose guard
nobody enforces is a machine that teaches people to click through.

Those four states are **the public network's**, and they arrive
with it at V-8. V-2 builds SCHEDULED, LIVE, CLOSING, JUDGING,
RESULTS and COMPLETED, which is the whole of what one installation
can honestly operate, and leaves room at the front of the list
rather than inventing an authority.

```
V-2 builds:                      V-8 adds in front:

                                 DRAFT
                                   └─► SUBMITTED
                                         └─► REVIEW
                                               └─► APPROVED
SCHEDULED  ◄───────────────────────────────────────┘
  └─► LIVE
        └─► CLOSING
              └─► JUDGING
                    └─► RESULTS
                          └─► COMPLETED
```

**MUST NOT TOUCH.** `REQUEST_STATES`, `REQUEST_NEXT`, `mayMove`,
`advance`, and every function in `participationEdit.ts`. Not one
new state, not one new edge. A campaign observes requests; it does
not drive them.

**WHY.** D-25: *"Production and participation are separate… a
participant never holds a studio object."* A campaign is an
organiser's object. The participant still holds only a request, and
`viewFor()` — *"EVERYTHING ELSE IS WITHHELD, and this function is
the only place that decides it"* — stays the one gate on what they
are told.

## 5. The track, and who owns it

> *"The track belongs to whoever made it, always. A campaign is
> permission to be sung on for a while, not a transfer. When the
> campaign is over the track is exactly what it was."*

> *"And the rights question is real. If the track is a cover, or
> the backing is licensed, then a thousand people singing on it is
> a thousand copies of somebody else's property. The system has to
> know what class of thing it is holding before it opens the
> door."*

**WHAT ALREADY EXISTS.** All of it, and more carefully than the
brief asks.

`MasterClass` (`src/domain/performance.ts:134`) classifies the
song; `mayPublish(master)` decides whether it may leave the
building; `needsLicenceNote` asks for the permission; `licence`
records it; `PerformanceTake.rights` and `rightsNote` ask the same
question of footage, for the reason the file states — *"a product
that refuses to publish somebody else's SONG while publishing
somebody else's PICTURE is not being careful, it is being
inconsistent"*. `unpublishableFootage` and
`everythingMayBePublished` answer it over the whole performance,
and INV-15 asserts it.

Ownership is `owned()` and nothing in a campaign moves a byte out
of the producer's tree.

**THE GAP.** One predicate that does not exist: **a campaign must
not go LIVE on a track that may not be published.** Every piece of
the answer is in the repository; nothing asks the question at the
moment a door is opened to a thousand strangers.

**MUST NOT TOUCH.** `MasterClass`, `mayPublish`, INV-15. They are
the answer. The campaign calls them; it does not re-decide them.

**WHY.** D-08, and INV-15 asserted in code (D-09). The rights
posture is structural in this product (U-35) precisely so that a
new surface cannot route around it.

## 6. The take, and the participant

> *"The participant needs no account. That is not a convenience, it
> is the design. Somebody hears about a campaign, opens a link,
> sings, and sends it. If the first thing they meet is a sign-up
> form, the loop in section 1 has a wall across it."*

> *"But the system still has to be able to say whose entry this is,
> show them their own takes, and tell them what happened. Identity
> without accounts is the hard part of this whole brief."*

**WHAT ALREADY EXISTS.** The refusal, stated on the surface itself:

> *"NOTHING HERE ASKS WHO YOU ARE. There is no account on this
> surface."* — `app/take/TakeHome.tsx`

And the mechanism that replaces an account:
`ParticipationRequest.token`, one per participant, 256 bits from
`randomBytes(32)` in `src/store/requests.ts`, compared with
`timingSafeEqual`, revocable by `rotate()`, with every failure
answering alike because *"a participant who is told 'that request
exists but your secret is wrong' has been told there is something
there to guess at."* `participant` is a NAME — *"A NAME, NOT AN
ACCOUNT"* — and `viewFor` decides what a link holder may see.

"Show them their own takes" is already device-local: the Take App's
queue lives in IndexedDB behind `app/take/[link]/queue.ts`, with
`public/take-sw.js` draining it from a `sync` event.

**THE GAP.** "Tell them what happened." There is no address, by
design, and there must not be one.

**MUST NOT TOUCH.** `token`, `linkFor`, `requestForLink`,
`viewFor`, and the absence of a sign-in on `/take`. The one-token-
per-participant rule in particular: *"revoking one person's link
must not revoke anybody else's — and a submission has to be
attributable to the link it came through."*

**WHY.** D-25's second consequence, in the author's own words:
*"participation must not fail because somebody has not installed
something"*, and the matching rule that it must not fail because
somebody has not registered either. V-7 closes this without an
address — see section 19.

## 7. Consent is a record, not a checkbox

> *"If a campaign is going to put somebody's face on a public
> results page, in a clip, possibly on television, then the thing
> that permits that is not a tick box they passed on the way to the
> camera. It is a record: what they were told, in what words, on
> what date, and what they agreed to. And they must be able to take
> it back."*

> *"I would rather have no campaign than a campaign that cannot say
> what each person agreed to."*

**WHAT ALREADY EXISTS.** Consent exists in this product and it is
the WRONG PERSON'S consent, which is worth being exact about.

`src/domain/publish.ts` holds `ConsentError` and
`assertRespondable`, and `app/api/conversations/[id]/publish/route.ts`
says *"Consent is recorded here and nowhere else. It is asked at
publish time."* That is the AUTHOR consenting to be answered —
U-31's door. `app/c/[id]/BundlePanel.tsx` asks a second consent
question of the author about their own bundle.

**Nothing anywhere records a PARTICIPANT's consent.** A grep for
`consent` over `src/`, `app/` and `shared/` returns eleven hits and
every one of them is the publisher's.

What is already right is the shape to copy: publication consent is
recorded in the document with a timestamp, and
`src/domain/publish.ts:55` already states the rule a release needs
— *"existed and was consented to; withdrawing now cannot unmake
that"*.

**THE GAP.** `ConsentRecord`, written at submission time, carrying
the terms text's identity (a hash, so the words cannot be edited
underneath a signature), when it was given, which request gave it,
and what it permits: entry, public display, clip, broadcast. And a
withdrawal that stops future use without rewriting history.

**MUST NOT TOUCH.** The author-side consent in `publish.ts`. Two
different people consent to two different things and collapsing
them would make a producer's publish decision look like a
performer's release.

**WHY.** D-03, directly: *"The product handles people's faces,
voices, homes, and unpublished opinions. That is more sensitive
than most software ever touches."* And *"Recording content is not
training data. Not without separate, specific, revocable, opt-in
consent."* A competition entry is the same class of act: specific,
revocable, opt-in, and never a condition dressed as a default.

## 8. Media assets and their variants

> *"One upload becomes several files. The original, the normalised
> copy everything is cut from, a small one for scrubbing, a still
> for the grid, and whatever a platform needs. Treat that as a
> MediaAsset with MediaVariants rather than as a pile of filenames,
> or you will have four modules guessing at suffixes."*

**WHAT ALREADY EXISTS — and this is the clearest case in the whole
brief of a thing that is built.**

One `assetId` already yields its whole variant set, by pure
functions in `src/store/paths.ts`:

```
assetId ──┬── performanceAsset(id, assetId, ext)   the original
          ├── takeMezzanine(id, assetId)           normalised .mp4
          ├── takeProxy(id, assetId)               .webm, for playback
          ├── takePoster(id, assetId)              .jpg, the still
          ├── takeAnalysis(id, assetId)            .f32, raw samples
          ├── performanceTakeStrip(id, takeId)     the timeline strip
          └── performancePlate(id, assetId)        the empty-room matte
```

with `src/store/mediaFacts.ts` as the measured sidecar — duration,
whether there is video — *"written beside the file it is about,
with the size and modification time it was measured from"*, and its
own reason for not being a table:

> *"A sidecar rather than a central index, for the reason D-18
> gives about everything else here: an index is a second place the
> truth lives."*

**THE GAP. None.** This is the brief describing, accurately, a
subsystem that shipped.

**MUST NOT TOUCH.** Everything above, and especially the derivation
rule: a variant's path is a function of the asset id, which is why
there is nothing to keep in sync. A `MediaAsset` record listing
variants would be a second answer to a question one function
already answers, and the first time a worker wrote a file without
updating the record the two would disagree.

**WHY.** D-19's stated failure mode, verbatim: *"TWO PLACES THAT
ANSWER THE SAME QUESTION, which is how a product starts disagreeing
with itself — and the disagreement always surfaces in front of a
user, never in a test."* This is recorded in **Not built**, below.

## 9. The media processing pipeline

> *"Nothing heavy happens in the request. An upload lands, a job is
> queued, a worker does the work, the result is written down, and
> the interface finds out. One thousand entries is one thousand
> jobs in one queue, not one thousand web requests holding a
> connection open while ffmpeg runs."*

```
UPLOAD ──► QUEUE ──► WORKER ──► VARIANTS ──► THE DOCUMENT KNOWS
```

**WHAT ALREADY EXISTS — all of it, and this is the second case of a
subsystem the brief describes and the product shipped.**

`src/store/queue.ts` is a durable queue of jobs as files, claimed
by atomic rename:

> *"'The web tier is stateless, never runs ffmpeg, never blocks on
> a render.' One forty-minute export must not make the application
> unusable for everyone else — that is how video products die on
> their first popular day."*

`JobKind` has twenty-three members. The ones an entry travels
through already exist: `assemble_performance_take` (the exact job
the brief's section describes), `ingest_master`, `ingest_sound`,
`measure_eyeline`, `render_performance`,
`render_performance_clip`, `render_performance_card`. The worker
dispatches them in one switch at `src/worker/index.ts:95`, and
`src/store/takes.ts` is worker-only *"because this module can reach
ffmpeg, so nothing in the web tier may import it (U-23)"*.

Jobs carry `progress`, *"so the UI never shows a spinner without a
number (D-13)"*.

**THE GAP.** One honest operational fact and no new machinery:
**the queue is FIFO with no notion of a campaign**, so a thousand
entries arriving in an hour sit in front of the owner's own
forty-minute render. That is a scheduling question, not a pipeline
question, and it is **deliberately not solved by a second queue**.
If it becomes real, it is a claim order inside `claim()`, in one
function, measured first.

**MUST NOT TOUCH.** `JobKind`, `Job.conversationId` (named as a
debt already — *"It is named here as a debt so it is not mistaken
for a design"*), `enqueue`/`claim`/`finish`, and the rule that the
web tier never runs ffmpeg.

**WHY.** U-23 (*"the render tier is isolated, queued, and
interruptible"*) and D-19. A campaign that queued its own jobs its
own way would be the second render tier the doctrine spent a clause
preventing.

## 10. Discovery — where a campaign is found

> *"A campaign nobody can find is a private request with extra
> steps. There has to be a page, the page has to be public, and it
> has to be the same public layer as everything else BalanceVid
> shows strangers. Not a second website."*

**WHAT ALREADY EXISTS.** The public layer, built by TV-NETWORK
N-4, and the rule about not making another one:

> *"No separate website or domain, per the brief. `/tv` is a
> surface of `balancevid.com`."*

`middleware.ts` is the gate, default-closed —
*"a route added tomorrow is private unless someone deliberately
makes it public"* — and `src/auth/policy.ts` is where a public
surface is declared: `PUBLIC_EXACT` holds `/api/published` and
`/api/participate`, `PUBLIC_PATTERNS` holds `/take/<link>` and the
rest, and `GUEST_WRITABLE` holds the four verbs a link holder may
use, *"each on its own path, for the reason the room's are written
this way: a path-only allowance once answered DELETE as well, and
that was a real hole."*

And `/api/participate` is already the discovery query — one query,
grouped by kind, *"not three sections"*.

**THE GAP.** A campaign surface on that layer: a page per campaign,
a list of what is on, and the campaign rows joining
`/api/participate`'s answer rather than being a second feed.

**MUST NOT TOUCH.** `middleware.ts`'s default-closed shape,
`GUEST_WRITABLE`'s per-path verbs, and the three conditions
`/api/participate` applies — published, not withdrawn, listed —
*"three conditions, all of them the author's own decision, none of
them a default that leaks a draft."*

**WHY.** D-03 (*"Unpublished is private by default"*) and the
precedent TV-NETWORK set: a public surface is a layer of this
installation, never a separate property.

## 11. Judging

> *"Somebody has to decide, and the decision has to be defensible.
> Who judged, what they scored, against which criteria, and why.
> Publish the criteria before the campaign opens, not after it
> closes."*

> *"And do not let a machine do it. A computer can tell you a take
> is in sync and well lit. It cannot tell you whether somebody sang
> well, and a product that pretends otherwise has lied to a person
> about their own performance."*

**WHAT ALREADY EXISTS — and the second half of the brief is already
this product's position, written down and enforced.**

`src/domain/takeRanking.ts` ranks takes and refuses to do what
judging needs:

> *"MEASURED FACTS ONLY, NEVER TASTE. This will not tell an author
> which performance is better — nothing here can hear a vocal, and
> a product that scored takes on 'energy' would be inventing an
> opinion and dressing it as a measurement."*

and

> *"AND EVERY SCORE CARRIES ITS REASONS, which is not decoration. A
> ranked list with no reasons is an oracle, and U-15's whole
> position is that the machine proposes and the author decides."*

The producer's existing decision — `hold`, `accept`, `reject` in
`participationEdit.ts`, each writing a history line with `by` — is
the audit shape to match.

**THE GAP.** A `Judgement`: one judge, one entry, one score per
published criterion, and a reason. Plus criteria published with the
campaign before it opens, which is a field on the campaign and a
rule about when it may change.

**MUST NOT TOUCH.** `takeRanking.ts`, in either direction. It must
not be repurposed to score humans, and judging must not reach into
it for a starting number — a panel handed a machine's score has
been anchored by a measurement that cannot hear.

**WHY.** U-15, the AI boundary as an enforceable rule, and D-03's
posture toward people's recorded selves. A score with no reason is
the oracle `takeRanking` already refuses to be.

## 12. Public voting

> *"Audience voting is the most viral thing you can add and the
> easiest thing in the world to ruin. One person with a script is
> ten thousand votes. If you cannot bound it, do not ship it."*

**WHAT ALREADY EXISTS.** The product has met this problem once and
answered it, in the claim ceiling:

> *"AND IT IS BOUNDED. Each press writes a request, so an item
> opened to `anyone` without a ceiling is an item opened to a
> script. The client's own memory covers the accidental repeat and
> not the deliberate one, so the bound is here — a NUMBER the
> producer can give."*

And `src/domain/favorites.ts` is per device, stated as per device.

**THE GAP.** There is no voter. There is one account
(`OWNER_ACCOUNT_ID`), no registration, and deliberately no identity
on the Take surface. A vote from an anonymous browser is a number a
script can write, and the honest bound — a ceiling — bounds the
total rather than the voter, which is not what a vote means.

**This is recorded as deliberately not built**, with the reason, in
the closing section. What V-4 ships instead is a view count and a
share, which are facts rather than ballots.

**MUST NOT TOUCH.** The absence of accounts on `/take`. Adding
registration to make voting countable would trade the loop's first
arrow for a leaderboard.

**WHY.** D-06, and the product's own standard for numbers it shows:
a figure a stranger can manufacture is a figure the product should
not print beside somebody's name.

## 13. Moderation

> *"Open the door to strangers and you will get something you did
> not want. Have a queue, have a human, and have a way to take
> something down fast. Do not have a machine deciding whether
> somebody's face is allowed."*

**WHAT ALREADY EXISTS.** The queue, and the rule that nothing is
public until a person says so.

Every submission lands in
`var/accounts/<account>/requests/<id>/assets/` and is **nothing**
until accepted: *"A document that records what ARRIVED rather than
what was CHOSEN is not an edit, it is a log."* `reject` is already
non-terminal — *"a producer who changes their mind about somebody's
performance should not have to ask them to send it again"* — and
`rotate` withdraws a link from somebody who has already used it.

Taking something down fast exists as `unpublishedAt` on
`Publication`, read by `isPubliclyVisible` and by every public
route.

**THE GAP.** Two small ones. An entry is visible on a campaign page
before a producer has looked at it, or it is not — and nothing
today decides that, because nothing has a campaign page. And
`reject` records no reason, which a competition needs.

**MUST NOT TOUCH.** The acceptance boundary. An entry must not
become part of anything by appearing on a page.

**WHY.** D-25 and INV-06 applied to people. And U-15: a classifier
may one day SORT the queue; it may never empty it. Recorded in
**Not built**.

## 14. Social distribution

> *"The clip is what travels, not the campaign page. Somebody posts
> the thing they made, and the link under it comes back to you. So
> the clip has to be good, and it has to carry the campaign with
> it."*

> *"I would not have BalanceVid holding people's TikTok passwords
> to post on their behalf. Make the clip, hand it over, let them
> post it."*

**WHAT ALREADY EXISTS.** All of the making, and the architectural
decision about the posting, already taken for the same reason.

`src/domain/clips.ts` builds vertical clips through the same
planner and the same compositor — *"There is no second renderer to
drift from the first."* `src/domain/reel.ts` builds the reel.
`paths.shareCard` and `paths.claimCards` draw what a pasted link
shows, and `render_performance_card` is already a job kind.

And `src/domain/distribution.ts` already holds the connector
architecture and already refuses to activate anybody else's:

> *"The architecture is here from the beginning and the first
> implementation activates exactly one destination: the channel's
> own. That is deliberate: a connector that cannot be tested is a
> connector that is wrong, and the only one that can be tested
> today is ours."*

with D-21's rule beneath it: *"No credentials in the document… a
stream key in one is a stream key in somebody's backup."*

**THE GAP.** The clip does not carry the campaign — no campaign
name, no end date, no address back. That is typography and a URL in
an existing card renderer, not a distribution system.

**MUST NOT TOUCH.** `distribution.ts`'s one active destination, and
D-21's credentials rule.

**WHY.** D-21, and the author's own sentence above. Recorded in
**Not built**.

## 15. Federation — many installations, one Take

> *"There will be BalanceVid Cloud, there will be self-hosted
> installations, and there will be the public competition network.
> A participant should not have to care which one a campaign is on.
> The Take App already knows how to talk to any of them."*

```
                         TAKE
                           │
      ┌────────────────────┼─────────────────────┐
      │                    │                     │
BALANCEVID CLOUD   SELF-HOSTED BALANCEVID   BALANCEVID PUBLIC
  (an origin)          (an origin)        COMPETITION NETWORK
      │                    │                 (an origin)
      │                    │                     │
 its campaigns        its campaigns         its campaigns
      │                    │                     │
      └────────────────────┴─────────────────────┘
                           │
                 one participation protocol
                  one client, N origins
```

> *"And no central index of installations. A person's home screen
> is the ones they have been to."*

**WHAT ALREADY EXISTS — the whole of it, and the refusal with
it.**

`shared/src/connections.ts` is the shared definition, with the
storage deliberately left to each client — *"A browser keeps this
list in `localStorage`; a desktop application keeps it in a file
beside its own settings"* — and the rule stated at the top:

> *"AND THERE IS STILL NO REGISTRY. 'A directory of every
> BalanceVid would be the universal library §12 rejects wearing a
> different hat.' Nothing here asks anything about any installation
> but the one it was handed."*

`asOrigin` is the one parser, carrying two bugs found the hard way
so that nobody writes a second one. `Connection { origin, name,
addedAt }` and `Instance { name, origin }` are what the brief calls
a `BalanceVidInstallation` — **held by the device, not by a
server**, which is the difference that matters.

TV-NETWORK's N-6 built allocation *within* one installation and
recorded the rest as not built:

> *"The brief's registry spans installations — cloud and
> self-hosted — and that is a central service, which is a far
> larger commitment than a numbers file and sits against
> `connections.ts`'s standing rule about not indexing
> installations."*

**THE GAP.** None in the model. The public competition network is
**one more origin**, and the only thing that is missing is the
installation itself — which is V-8, and is an operational
commitment rather than a schema.

**MUST NOT TOUCH.** `asOrigin`, the absence of a registry, and the
rule that an origin is never written into a record.

**WHY.** D-19, and `connections.ts`'s own argument. A federated
index is recorded in **Not built** for the second time in this
repository, which is the honest outcome: the same conclusion
reached twice from two briefs is a conclusion.

## 16. The self-hosted customer's boundary

> *"A customer who installs BalanceVid gets a production system and
> a channel. They do not get the competition network. Their channel
> is theirs — we do not take it, we do not list it without asking,
> we do not switch it off. And the network is ours — they can enter
> it, they cannot run it."*

> *"Both halves of that sentence have to be true in the code, not
> in a contract."*

**WHAT ALREADY EXISTS.** The customer's half, enforced at the data
layer.

`owned()` puts every document under
`var/accounts/<account>/`. `safe()` refuses any identifier with a
separator, so *"a missed path join cannot reach outside the tree"*.
`requireStudio` refuses, in the store, a studio the account does
not hold. `publication.listed` is the only thing that puts a
channel in a public directory, and TV-NETWORK's own rule is *"No
channel in the directory that did not ask"*. A custom domain
(N-8) is the station's own front door and *"explicitly not the
discovery mechanism"*.

**THE GAP.** The network's half. Nothing today distinguishes
*records this installation owns* from *records this installation is
a participant in*, because the second kind does not exist yet.

The answer is **not a new flag and not a new permission**. It is
that network-owned records live on the network's own installation,
and a customer holds only a `Connection` to it. Three consequences,
each testable:

- A customer's campaign is written under their `owned()` tree and
  works with the network unreachable.
- Entering a network campaign is the Take protocol, outbound: the
  customer's participant opens a link served by the network's
  origin, and the submission is written there, by the rule
  `docs/TAKE-APP.md` T14 already states — *"the request is answered
  against the server that served it."*
- No route on a customer's installation ever writes a network
  record, because there is no such path function in their
  `paths.ts`, which is the same kind of enforcement `owned()`
  already is.

**MUST NOT TOUCH.** `owned()`, `safe()`, `requireStudio`, and
`publication.listed` as the only door into a public listing.

**WHY.** D-06: *"Tenant isolation is enforced at the data layer,
not in application code alone. One user reaching another's
unpublished recordings is the worst incident this product can
have."* The network is a tenant like any other, and the strongest
isolation available to it is being a different installation.

## 17. Prizes, payment and entitlement

> *"There will be prizes. I do not want the system holding money.
> Record who won. Paying them is a thing people do, not a thing
> this should be in the middle of."*

**WHAT ALREADY EXISTS.** Nothing about money, deliberately, and the
account record says so:

> *"WHAT IS DELIBERATELY ABSENT. No password, no billing, no
> quota, no retention policy — U-24 lists those as what an account
> eventually carries, not what it is."*

What exists is entitlement — `STUDIOS`, `ownsStudio`,
`requireStudio` — which is who may use which studio, and is not
billing.

**THE GAP.** A `prize` on the campaign, as the organiser's own
words, and a result that names a winner. That is all, and it is one
field and one record.

**MUST NOT TOUCH.** `src/store/entitlement.ts` and `account.ts`.
A prize is not an entitlement and a winner is not a customer.

**WHY.** D-21's rule about credentials in documents generalises to
payment instruments exactly. Recorded in **Not built**.

## 18. Territory, rights and where a thing may be seen

> *"Some of this will have territory attached. A track licensed for
> one country, a campaign that cannot run somewhere. I know that
> exists. I do not know that we can enforce it."*

**WHAT ALREADY EXISTS.** `Station.country` and `Station.language`
(`src/domain/station.ts`) are descriptive — they put a channel on
the right shelf in the directory. `MasterClass`, `licence` and
INV-15 are the rights posture and they gate PUBLICATION, not
geography.

**THE GAP.** Enforcement, and it is not a gap this product should
close. Geographic enforcement happens at the edge that serves
bytes; a flag in a document that the CDN does not read is a promise
the product cannot keep.

**MUST NOT TOUCH.** INV-15 and `mayPublish`, which are the rights
rules that this system genuinely does enforce.

**WHY.** D-08's posture, and a rule this repository applies
elsewhere: `distribution.ts` refuses to ship a connector it cannot
test. A territory rule nothing enforces is the same error.
Recorded in **Not built**.

## 19. Telling the participant what happened

> *"The loop does not close until the person who entered finds out.
> And I do not want to collect email addresses to do it."*

**WHAT ALREADY EXISTS — and this is the finding that makes the
stage possible.**

The Take App is an installed PWA with a service worker:
`public/take-sw.js`, registered from `app/take/[link]/queue.ts:111`,
already draining uploads from a `sync` event *"with no page open"*.
`app/take/[link]/InstallBar.tsx` is the install offer, and N-9
extracted `useInstallOffer` rather than copying it. The per-link
manifest (`app/api/take/[link]/manifest/route.ts`) means an
installed icon is scoped to the installation that issued the link.

**The device already has a durable relationship with the
installation, and the installation knows nothing about the person.**
That is exactly the property a result notification needs.

**THE GAP.** The device is never told. The request's state changes
— `accepted`, `rejected`, a campaign reaching RESULTS — and the
phone that sent it has no way to learn so except by the person
opening the link again.

**MUST NOT TOUCH.** The absence of an address on
`ParticipationRequest`. `participant` is a name and must stay one.

**WHY.** D-03 and D-25. A notification that required an email
address would convert a link into an account, which is the exact
thing the Take surface refuses.

## 20. What "viral" means as a number

> *"Measure the loop, not the vanity. Entries, finishers, shares,
> arrivals from a share, and how many of those entered. Five
> numbers. If entries go up and arrivals-who-entered goes down, the
> loop is leaking and the big number is lying to you."*

**WHAT ALREADY EXISTS.** The facts, scattered, and no counter.

A request's `history` is a full state log with timestamps —
*"an inbox that can say a request was opened and never recorded is
telling a producer something they can act on."* `submissions` is
the entry count. `claimed` distinguishes a stranger from an
invitee, which is already the arrival signal. `src/store/asRun.ts`
records what a channel actually transmitted.

**THE GAP.** Nothing counts across requests. And nothing should
start watching viewers to do it: `src/domain/favorites.ts` is per
device and says so, and that is this product's posture.

**MUST NOT TOUCH.** The audit shape of `history`, and the rule that
the installation does not profile the people who visit it.

**WHY.** D-03 and D-11 (observability, cost and quotas) — counting
the system's own events is operations; counting people is
something else. V-4 reports the four numbers derivable from records
the installation already writes about itself, and no third-party
analytics is added anywhere.

---

# PART TWO — The gaps that are real

Everything below is genuinely absent. Nothing else is. **Four
entries in the first draft of this document were wrong and are
corrected here**, because a plan built on a gap that does not exist
builds the wrong thing — which is the lesson `docs/TAKE-DESKTOP.md`
records at G2 and G6 and the reason PART FOUR of this document
exists at all.

### G1 · Nothing names the call

There is no object between a track and the people answering it. A
hundred strangers pressing *Take this song* produce a hundred
`ParticipationRequest`s and no record that they were answering the
same call. The inbox can list them; nothing can say what they were
all in.

`src/domain/campaign.ts` does not exist. A grep for `campaign` over
`src/`, `app/` and `shared/` returns nothing.

**This is the real centre of the work.**

### G2 · A call has no clock

`TakeAvailability` has `respondable`, `listed`, `access` and
`claims`. It has no `opensAt` and no `closesAt`.
`ParticipationRequest.expiresAt` is per link and per person —
*"A link that admits somebody forever is not an invitation"* — and
is the wrong clock: forty invitations with forty expiries is forty
deadlines, and a campaign has one.

So today a song opened to `anyone` is open until somebody unticks
it or the hundredth stranger arrives. **There is no closing
time**, which means there is no CLOSING, no countdown and no moment
to judge.

### G3 · No participant consent record

Every occurrence of `consent` in `src/`, `app/` and `shared/` is
the publisher's (`src/domain/publish.ts`,
`app/api/conversations/[id]/publish/route.ts`,
`app/c/[id]/BundlePanel.tsx`). **Nothing records what a performer
was told or what they agreed to**, and the Take surface asks them
nothing before the camera opens.

### G4 · Nothing judges — and the thing that ranks must not be asked to

There is no judge, no score, no criterion and no panel. The
producer's `hold` / `accept` / `reject` is a decision about USE.

**And the first draft of this document proposed building judging on
`src/domain/takeRanking.ts`, which was wrong.** That module is
explicit about what it will not do — *"MEASURED FACTS ONLY, NEVER
TASTE… a product that scored takes on 'energy' would be inventing
an opinion and dressing it as a measurement"* — and a competition
is taste by definition. Reading its header is what corrected the
plan. See PART FOUR.

### G5 · The loop never reaches the participant

A request's state changes and the device that sent it is never
told. There is no address on the record and there must not be one
(section 6). What there IS is a service worker
(`public/take-sw.js`) already registered from
`app/take/[link]/queue.ts:111` and already waking without a page
open — so the gap is a message, not a mailing list.

### G6 · No campaign surface on the public layer

`/tv` exists with channels, guide, search, favorites and station
pages. `/api/participate` exists and is public. **Nothing shows a
campaign**, because nothing is a campaign.

### G7 · A campaign could open a door on a track that may not be published — *verified absent*

`mayPublish`, `needsLicenceNote` and INV-15 all exist and all gate
publication. **Nothing calls them at the moment participation is
opened.** A `licensed` master with no licence note can be made
`respondable: true, access: 'anyone'` today, and a thousand people
can sing on it.

> **Half of this was wrong, and V-1 found out by building it.**
> `mayPublish` IS enforced, at `publishPerformance`. What was
> enforced nowhere is the LICENCE NOTE: `assertPublishable`
> carries it, has nine assertions over it, and is called by
> nothing but its own test. The hole was real and it was not
> where this entry put it. See PART FIVE, *G7 was right about
> the hole and wrong about where it was*.

Small, real, and cheapest to close before there is a campaign
object to close it in.

### G8 · `reject` records no reason

`reject(request, now, by)` writes a history line with a state, a
time and a name. For a producer declining a take that is enough.
For a competition declining an entry it is not: *"a producer who
changes their mind should not have to ask them to send it
again"* is the right posture, and a decline with no reason is one
nobody can review or reverse on grounds.

### G9 · No media asset model — *corrected*

The first draft listed this as a gap and proposed a `MediaAsset`
record with `MediaVariant` rows. **That was wrong.** One `assetId`
already yields its entire variant set through pure functions in
`src/store/paths.ts`, with `src/store/mediaFacts.ts` as the
measured sidecar, and `mediaFacts`'s own header gives the argument
against the record: *"A sidecar rather than a central index…an
index is a second place the truth lives."*

Adding the record would create the disagreement D-19 names.

### G10 · No pipeline for a thousand entries — *corrected*

The first draft said the ingest path would not survive a campaign.
**That was wrong.** `src/store/queue.ts` is a durable file queue
claimed by atomic rename, with twenty-three job kinds, progress
reporting, and a worker that is the only thing in the product
allowed to reach ffmpeg (U-23).

What survives of the concern is narrower and is stated honestly:
**the queue is FIFO and knows nothing about campaigns**, so a
burst of entries sits in front of the owner's own render. That is
a claim-order question inside one function, to be measured before
it is solved, and explicitly not a second queue.

### G11 · No installation record — *corrected*

The first draft proposed a `BalanceVidInstallation` record.
**That was wrong twice over.** `shared/src/connections.ts` already
models exactly this — `Connection { origin, name, addedAt }` and
`Instance { name, origin }`, with the one origin parser and its two
hard-won bugs — and holds it **on the device**, not on a server.
And `docs/TV-NETWORK.md` has already recorded the central version
as deliberately not built, for a reason that has not changed.

---

# PART THREE — The stages

**UPGRADE** changes something that exists. **ADD** creates
something new. Nothing rewrites, and nothing touches the
participation protocol.

Eight stages. The author implements one at a time, so each is
independently shippable and independently demonstrable, and the
order puts the useful-on-its-own work first: **V-1 is worth
shipping on a system with no campaigns in it at all**, and the
public network — the largest commitment in the brief and the one
that cannot be undone quietly — is last.

## V-1 · A call opens and shuts on a clock — **UPGRADE**  ·  *built, PART FIVE*

**What exists today.** `TakeAvailability` in
`src/domain/availability.ts` carries `respondable`, `listed`,
`access` and `claims`, with `CLAIMS_BY_DEFAULT = 100` as the only
bound on an open door. `isListed`, `accessOf`, `maySubmit`,
`mayClaim` and `availabilityState` are the five pure predicates
every surface already asks. `ParticipationRequest.expiresAt` and
`isOpen()` are the per-person clock and stay exactly as they are.

**What this stage adds.** `opensAt` and `closesAt` on
`TakeAvailability`, both optional, both read by the existing
predicates. A sixth state for `availabilityState`: `scheduled`
before `opensAt`, `closed` after `closesAt`.
`/api/participate` says when a row opens and when it shuts;
`/api/participate/[kind]/[id]` refuses outside the window with the
404 it already gives for every other refusal, *"because a counter a
stranger can read is a counter a stranger can watch."*

It also closes **G7**: opening participation on a master that
`mayPublish` refuses is refused, with the reason, at the moment the
door is opened rather than at the moment a render is attempted.

**Must not touch.** `expiresAt`, `isOpen` and the request machine.
`listed`, `respondable` and `access` keep their exact present
meanings — the correction `docs/TAKE-PLATFORM.md` PART FIVE
records (*"discovery and authorization must stop carrying each
other's meaning"*) is not reopened by adding a clock.

**Judged on.** An item with neither field behaves byte-identically
to today; an item with a window stops accepting at the minute it
says, and says so before it does. And a `licensed` master with no
licence note cannot be opened to anyone.

## V-2 · The campaign is an object, and it is not a second request — **ADD**  ·  *built, PART SIX*

**What exists today.** `ParticipationRequest` with its ten states,
`REQUEST_NEXT` as a readable table, and `claimed` distinguishing a
stranger from an invitee. `src/store/requests.ts` is the fourth
store beside the three studios, *"for the reason D-25 gives: a
request is not part of a production."* `paths.requests()` sits
under `owned()`.

**What this stage adds.** `src/domain/campaign.ts`: a `Campaign`
with `camp_…` ids, a `track` reference using the existing
`RequestHolder` shape, a window, the organiser's rules in their own
words, the published criteria, an optional prize as text, and six
states — SCHEDULED, LIVE, CLOSING, JUDGING, RESULTS, COMPLETED —
written as a table in the same form `REQUEST_NEXT` is, with its own
`mayMove`. `src/domain/campaignEdit.ts` holds the rules, the way
`participationEdit.ts` does, and touches no production document.
`src/store/campaigns.ts` and `paths.campaigns()` under `owned()`.

`ParticipationRequest` gains **one optional field**: `campaign?:
CampaignId`. Absent is what every existing request is.
`Assignment.asks` is unchanged and is still what a request with no
campaign shows.

The four pre-LIVE states are deliberately absent. See section 4.

**Must not touch.** `REQUEST_STATES`, `REQUEST_NEXT`, `mayMove`,
`advance`, `submit`, `accept`, `reject`, `attach`, `rotate`,
`viewFor`, `takesLeft`, `takesMade`. Not one new state and not one
new edge. A campaign reads requests; it never advances one.

**Judged on.** A hundred claimed requests under one campaign are
listed as one call in the inbox; every request made before this
stage reads and behaves exactly as it did; and a campaign cannot be
moved to JUDGING while its window is open.

## V-3 · Taking part is consented to, and the consent is a record — **ADD**

**What exists today.** The publisher's consent in
`src/domain/publish.ts`, with the rule that matters already stated:
*"existed and was consented to; withdrawing now cannot unmake
that."* Nothing on the participant's side.

**What this stage adds.** `ConsentRecord`: which request, when, the
`sha256` of the exact terms text shown (so the words cannot be
edited underneath a signature — the same reasoning `quoteHash` in
`src/domain/ids.ts` already applies to quotations), and what was
permitted — entry, public display, clip, broadcast — as separate
permissions rather than one bit. A withdrawal timestamp that stops
future use and unmakes nothing already done.

Written at submission time, on the record, in the request's own
directory. Shown on the Take surface **before the camera opens**,
in plain words, with nothing pre-ticked.

A campaign may require consent; an ordinary producer-issued request
may not, and is unchanged.

**Must not touch.** `publish.ts`'s author-side consent. Two people
consenting to two different things must not become one field.

**Judged on.** An entry with no consent record cannot be accepted
into a campaign; an ordinary submission with no consent record
behaves exactly as today; a withdrawal removes the entry from every
public surface and leaves the audit intact; and the terms hash of a
given entry still verifies after the terms text is changed for new
entrants.

## V-4 · The campaign has a public page, on the gateway that already exists — **ADD**

**What exists today.** The public layer: `middleware.ts`
default-closed, `src/auth/policy.ts` as the single place a surface
is declared public, `/tv` with its channels, guide, search and
station pages, `/api/participate` as the public discovery query,
and `/p/<id>/watch` as a player that already works for strangers.

**What this stage adds.** `/go` and `/go/<slug>` — a destination on
the existing public gateway, **not a second site**, by the same
argument TV-NETWORK made about `/tv`. The campaign page carries the
rules, the window with a live countdown in CLOSING, the criteria,
the entries wall, and the player that already exists. Campaign rows
join `/api/participate`'s answer rather than becoming a second
feed.

It also ships the four numbers of section 20 — entries, finishers,
shares, and arrivals that entered — derived from records the
installation already writes about itself, and **no viewer
tracking**.

**Must not touch.** `middleware.ts`'s default-closed shape, the
three conditions `/api/participate` applies, `GUEST_WRITABLE`'s
per-path verbs, and the `/tv` routes, which are a different
product on the same layer.

**Judged on.** A stranger with no account reaches a campaign, reads
the rules, watches entries and enters, on a phone; and a campaign
that is `listed: false` is reachable by its link and absent from
every index.

## V-5 · Judging is people, and every score carries its reason — **ADD**

**What exists today.** `takeRanking.ts`, which ranks on measured
facts and refuses taste. The producer's `hold` / `accept` /
`reject`, each writing a history line with `by`.

**What this stage adds.** `Judgement`: one judge, one entry, a
score per published criterion, and a reason in words. A panel named
on the campaign. Criteria frozen when the campaign reaches LIVE —
*"Publish the criteria before the campaign opens, not after it
closes"* — so a criterion added during JUDGING is refused rather
than quietly applied to entries recorded against different rules.
A result derived from the judgements and reproducible from them.

And **G8**: `reject` learns an optional reason, which the inbox
already has a place to show.

**Must not touch.** `takeRanking.ts`, in either direction. It must
not score people, and judging must not seed itself from it: a panel
handed a machine's number has been anchored by a measurement that
cannot hear.

**Judged on.** The result recomputes exactly from the stored
judgements; no score exists without a reason; and a criterion
cannot be added after LIVE.

## V-6 · Results, and the winning entry re-enters the system it came from — **UPGRADE**

**What exists today.** `accept()` in `participationEdit.ts`, which
*"returns what was accepted and lets the studio that owns the
document decide"*; the attachment path into a performance;
`src/store/broadcastLibrary.ts` and the channel schedule;
`clips.ts`, `reel.ts` and `render_performance_card`.

**What this stage adds.** RESULTS and COMPLETED, a results page on
`/go/<slug>`, and the winning entry travelling the **existing**
accept path into the performance or the channel schedule — a take,
a library item, a programme, by the routes that already carry one.
The clip carries the campaign: name, end date, and the address
back, as typography in the card renderer that already draws one.

**Must not touch.** `accept()` and the acceptance boundary. Winning
does not attach anything; a producer still does, deliberately, as
D-25 requires.

**Judged on.** A winner's take is scheduled on a channel through
the ordinary route with no campaign-specific code in the playout
path; and a clip pasted into a messaging app shows the campaign and
links back to it.

## V-7 · The loop closes on the participant's own device — **UPGRADE**

**What exists today.** `public/take-sw.js`, registered from
`app/take/[link]/queue.ts:111`, already waking without a page open
to drain uploads; the per-link manifest at
`app/api/take/[link]/manifest/route.ts`;
`app/take/[link]/InstallBar.tsx` and the extracted
`useInstallOffer`. And no address anywhere on
`ParticipationRequest`, which is the point.

**What this stage adds.** The device learns that its entry was
accepted, declined, or that the campaign has results — through the
worker it already has, keyed by the link it already holds, with
**no address stored anywhere and no identity asked for**. A device
that never installed anything sees it next time the link is
opened, which is what happens today and remains correct.

**Must not touch.** The absence of an account on `/take`. The
`participant` field stays a name. No email, no phone number, no
third-party push identity written into a request.

**Judged on.** A phone that entered a campaign and was closed is
told the result without the installation ever holding anything that
identifies its owner; and a device that declined notifications
loses nothing but the notification.

## V-8 · The BalanceVid Public Competition Network — **ADD**

**What exists today.** Everything a participant needs, and nothing
of the operator. `shared/src/connections.ts` already models another
installation at an origin and already refuses a registry.
`docs/TAKE-APP.md` T14 already fixes that a request is answered
against the server that served it. `owned()` already isolates by
path. `/tv`, `/api/tv/playlist.m3u` and `/api/tv/guide.xml` already
let a stranger consume a lineup.

**What this stage adds.** An installation BalanceVid operates, on
which the network's campaigns live, and the four states that only
mean something when there are two parties: DRAFT, SUBMITTED, REVIEW
and APPROVED, in front of SCHEDULED. A customer reaches it as a
`Connection` and nothing more.

**The separation this stage exists to hold, stated as three
testable claims:**

1. A customer's own campaigns are written under their `owned()`
   tree and run with the network unreachable.
2. A customer's installation has **no path function** that names a
   network record, which is the same kind of enforcement `owned()`
   already is — *"a missed path join cannot reach outside the
   tree."*
3. Entering a network campaign is the ordinary Take protocol,
   outbound, against the network's origin.

**Must not touch.** `owned()`, `safe()`, `asOrigin`, the absence of
a registry, and `requireStudio`. **Operating the network must not
become an entitlement**, because an entitlement is something an
account can be granted and this is the one capability that cannot
be.

**Judged on.** A self-hosted installation with the network's origin
unreachable loses nothing of its own; and no route or path function
on a customer's installation can write a network record, asserted
by a test over `paths.ts` in the way `tenancy.test.ts` already
asserts isolation.

---

## The order

```
V-1 ─► V-2 ─► V-3 ─► V-4 ─► V-5 ─► V-6 ─► V-7
                      │
                      └───────────────────────► V-8
```

**V-4 is where the question that was asked is answered** — a
stranger finds a campaign, reads it, and enters. V-1 to V-3 are
what make that honest: a clock, an object, and a consent. V-5 and
V-6 make it an event with an outcome. V-7 closes the loop back to
the person who started it.

**V-1 is deliberately first and deliberately tiny.** It is worth
shipping on a system with no campaigns in it at all — a song open
for a week is a thing a producer wants today — and it closes G7,
the one gap that is already live.

**V-8 depends on V-4 and nothing after it.** Once a campaign has a
public page, operating one centrally is an operational commitment
rather than a schema change, which is why it is last and why its
four extra states were kept out of V-2 rather than built and left
unused.

---

## What must not happen

- **No second participation protocol.** Four Take clients today,
  five with the desktop application, one system. A campaign is a noun in it, not a parallel to it.
- **No second request machine.** `REQUEST_STATES` and
  `REQUEST_NEXT` gain nothing. A campaign observes requests; it
  never advances one.
- **No second editing system**, which is the author's own
  sentence: *"build these capabilities into the existing
  take/timeline model."* Nothing in any stage puts an editor
  anywhere near a participant.
- **No second media pipeline.** One queue, one worker, one set of
  job kinds. U-23.
- **No `MediaAsset` table.** One `assetId`, variants derived by
  pure functions, facts in a sidecar. G9.
- **No second asset registry, no second index, no second answer**
  to any question `paths.ts` already answers.
- **No machine judging people.** `takeRanking.ts` is measured facts
  and stays that way. U-15.
- **No machine rejecting people.** A classifier may sort a queue;
  only a person empties it.
- **No account on the Take surface.** *"NOTHING HERE ASKS WHO YOU
  ARE."* No email, no phone, no sign-up between a person and a
  camera.
- **No consent as a boolean.** A record, with the words it was
  given against, or the campaign does not run. D-03.
- **No participation opened on a track that may not be
  published.** INV-15 is called at the door, not at the render.
- **No separate website.** `/go` is a surface of this installation,
  exactly as `/tv` is.
- **No index of installations**, for the second time in this
  repository. `connections.ts` says why and TV-NETWORK has already
  recorded the conclusion.
- **No network record on a customer's disk**, and no path function
  that could write one.
- **No entitlement that confers the network.** The network is an
  installation, not a studio.
- **No money in the document**, and no platform credentials in one.
  D-21.
- **No viewer tracking.** The loop is measured from what the
  installation writes about itself.
- **No change to `owned()`, `safe()`, `asOrigin` or
  `requireStudio`.** They are the separations.

---

## Every section of the brief, and where it is answered

Nothing in the brief is unaccounted for, and no stage exists that
the brief does not ask for.

| § | the brief asks for | answered by | state |
|---|---|---|---|
| 1 | the viral loop | V-1 … V-7 | five of seven arrows shipped |
| 2 | track / campaign / take, and the ids | PART ZERO, V-2 | two of three objects shipped |
| 3 | the campaign as the unit | V-2 | the rules exist, per request |
| 4 | the ten-state lifecycle | V-2 (six), V-8 (four) | argued in §4 |
| 5 | the track, and rights | V-1 | `MasterClass`, INV-15 shipped |
| 6 | the participant with no account | — | shipped; must not change |
| 7 | consent as a record | V-3 | the author's consent exists, not theirs |
| 8 | MediaAsset / MediaVariant | — | shipped as derived paths; **not built** as a record |
| 9 | the media pipeline | — | shipped; queue order measured if it bites |
| 10 | discovery | V-4 | the public layer is shipped |
| 11 | judging | V-5 | ranking exists and must not be used for it |
| 12 | public voting | — | **not built**, with the reason |
| 13 | moderation | V-5 (reasons), — (automation) | the queue is shipped; automation **not built** |
| 14 | social distribution | V-6 | clips shipped; credentials **not built** |
| 15 | federation | V-8 | the model is shipped; the registry **not built** |
| 16 | the customer's boundary | V-8 | `owned()` is half of it |
| 17 | prizes and payment | V-2 (text) | payment handling **not built** |
| 18 | territory and rights | — | rights shipped; territory **not built** |
| 19 | telling the participant | V-7 | the service worker is shipped |
| 20 | what viral means as a number | V-4 | the facts are shipped, uncounted |

---

# PART FOUR — Corrections this document makes to its own first draft

Written down rather than quietly fixed, because the first draft of
a plan is where the duplication D-19 warns about gets decided, and
a corrected draft with no record of the correction teaches nobody.
`docs/TAKE-DESKTOP.md` does this at G2 and G6;
`docs/TAKE-PLATFORM.md` does it at PART FIVE, where the author
corrected the document and the superseded proposal was left in
place so the ledger stayed checkable. The same practice here.

**Six corrections, and every one of them came from reading a file
rather than from thinking harder.**

### C1 · The campaign was going to be ten more states on `ParticipationRequest`

The first draft extended `REQUEST_STATES` with the brief's ten and
added the edges to `REQUEST_NEXT`. It looked like the smallest
change and it was the largest one.

Reading `src/domain/participation.ts:140` corrected it.
`REQUEST_NEXT` is a **total map over `RequestState`** whose whole
virtue is that the lifecycle is readable in one screen — *"WRITTEN
DOWN AS A TABLE, so the rule is readable rather than spread across
the routes that enforce it."* Twenty states is ninety edges of
which eighty are unreachable, and three of the ten names collide
with existing ones meaning something else (§4's table).

**A campaign is a second object and not a second protocol**, and
the full argument is in section 4 because a decision this size
should be arguable rather than asserted.

### C2 · `MediaAsset` / `MediaVariant` was listed as a gap

It is not one. `src/store/paths.ts` derives every variant from one
`assetId` by pure function, and `src/store/mediaFacts.ts` holds the
measured facts beside the file *"with the size and modification
time it was measured from"*, giving its own reason for not being a
table: *"an index is a second place the truth lives."*

Building the record would have created exactly the failure D-19
names. Recorded at G9 and in **Not built**.

### C3 · The media pipeline was listed as a gap

`src/store/queue.ts` and `src/worker/index.ts` are the pipeline the
brief's section 9 describes, including
`assemble_performance_take`, the exact job an entry travels
through. The web tier has never been allowed to run ffmpeg (U-23).

What survives is one honest operational residue — FIFO ordering
under a burst — stated at G10 as a thing to measure rather than a
thing to build around.

### C4 · Judging was going to be built on `takeRanking.ts`

The first draft proposed a campaign leaderboard seeded from the
existing ranking, on the grounds that a ranking already existed and
D-19 says to reuse.

**Reading the module's header is what corrected it.** It refuses
taste on purpose — *"nothing here can hear a vocal"* — and D-19's
rule is *"read the module that owns the concept"*, which is not the
same as reusing the module whose name matches. The concept
`takeRanking` owns is *which take covers this stretch of song
best, by measurement*. A competition is a different concept with
the same noun in it.

So V-5 adds `Judgement` and leaves the ranking alone, and the
prohibition is explicit in **What must not happen** so a third
draft does not rediscover it.

### C5 · A `BalanceVidInstallation` record was going to be added

`shared/src/connections.ts` already models it, holds it on the
device, carries the one origin parser with its two hard-won bugs,
and states the rule against a registry. And
`docs/TV-NETWORK.md`'s **Not built** has already refused the
central version, for reasons that have not changed.

**The same conclusion reached twice from two different briefs is a
conclusion**, and this document records it rather than reopening
it.

### C6 · "Nothing bounds a public call" was wrong

The first draft listed an unbounded public door as a gap.
`src/domain/availability.ts` already has `claims`,
`claimsAllowed`, `mayClaim` and `CLAIMS_BY_DEFAULT = 100`, with the
argument written out: *"ticking 'anyone' says who may take part
rather than agreeing to an unbounded number of them."*

What is actually missing is a clock, not a ceiling. That is G2 and
it is V-1.

---

# Not built

What follows is what this document deliberately leaves out, each
with the reason rather than as a list of absences — the practice
`docs/TV-NETWORK.md` ends with, and part of the house style
because a plan that only lists what it will do cannot be argued
with.

- **Payment handling, and prize disbursement.** The account record
  already states that billing is *"what an account eventually
  carries, not what it is"*, and D-21's rule about credentials in
  documents — *"a stream key in one is a stream key in somebody's
  backup"* — applies to payment instruments without modification. A
  campaign records who won, in the organiser's own words. Paying
  them is an act between two people, and a system that sat in the
  middle of it would acquire regulatory obligations that have
  nothing to do with recorded speech. V-2's `prize` is text.

- **Posting credentials for third-party social platforms.**
  `src/domain/distribution.ts` already took this decision for the
  broadcast layer and already gave the reason: *"a connector that
  cannot be tested is a connector that is wrong, and the only one
  that can be tested today is ours."* The author's own sentence in
  section 14 is the same: *"I would not have BalanceVid holding
  people's TikTok passwords to post on their behalf."* The product
  makes the clip (V-6) and hands it over. Holding a thousand
  participants' platform passwords would also make a single
  installation's `var/` the most valuable thing in the system to
  steal, which is the opposite of what D-06 is for.

- **Automated moderation that rejects.** The queue, the human and
  the fast takedown are all built or staged. What is refused is a
  classifier with the authority to decline somebody's face. U-15's
  position is that the machine proposes and the person decides, and
  INV-06's — *"a detection is a suggestion until accepted"* — is
  the same rule one layer down. A classifier that SORTS a
  moderation queue is a legitimate later addition and is a
  different thing from one that empties it.

- **Public voting at scale.** There is no voter. One account exists
  (`OWNER_ACCOUNT_ID`), the Take surface deliberately asks nobody
  who they are, and `favorites.ts` is per device and says so. A
  vote from an anonymous browser is a number a script can write,
  and the bound this product already uses — a ceiling on claims —
  bounds the total rather than the voter, which is not what a vote
  means. Making votes countable would mean registration, and
  registration is a wall across the first arrow of section 1's
  loop. V-4 ships counts of things the installation actually did:
  entries, finishers, shares, arrivals that entered. Those are
  facts. Ballots would not be.

- **Territory and rights enforcement.** `MasterClass`, `licence`,
  `mayPublish`, `needsLicenceNote` and INV-15 are real and are
  called at the door by V-1. Geographic enforcement is not built,
  because it happens at the edge that serves the bytes and a flag
  in a document that no CDN reads is a promise the product cannot
  keep. `distribution.ts` refuses to ship a connector it cannot
  test; a territory rule nothing enforces is the same error wearing
  a legal hat. `Station.country` and `Station.language` stay what
  they are: descriptive, for the directory's shelves.

- **A federated registry of installations.** Refused for the second
  time in this repository, and the reason has not changed since
  `shared/src/connections.ts` wrote it down: *"A directory of every
  BalanceVid would be the universal library §12 rejects wearing a
  different hat: a person adds an installation by having been to
  it."* V-8 builds an installation BalanceVid operates. It does not
  build an index of everybody else's. See `docs/TV-NETWORK.md`,
  **Not built**.

- **A `MediaAsset` record with `MediaVariant` rows.** One `assetId`
  already yields its whole variant set through pure functions in
  `src/store/paths.ts`, and `src/store/mediaFacts.ts` keeps the
  measured facts in a sidecar for the stated reason that *"an index
  is a second place the truth lives."* Adding the record would
  produce the failure D-19 exists to prevent: two places that
  answer the same question, disagreeing in front of a user and
  never in a test. See C2.

- **A campaign-aware job queue.** G10 keeps the concern and refuses
  the second queue. If a burst of entries starves the owner's own
  render, the fix is a claim order inside `claim()` in
  `src/store/queue.ts`, one function, measured on a real burst
  first. A queue per campaign is how one durable queue becomes two
  with different failure modes.

---

# The method, and where this continues

Every claim in PART ONE and PART TWO was read out of the files
named beside it, in the state of the repository at the branch this
document was written on. Where a reading corrected the plan, the
correction is in PART FOUR with the file that caused it, so a later
draft does not rediscover the same wrong idea and build it.

The three concern documents now stand together and their
boundaries are the ones to keep:

```
A  docs/TAKE-DESKTOP.md   how material is CAPTURED       T-1 … T-6, B-1 … B-3
B  docs/TV-NETWORK.md     how a channel is FOUND         N-1 … N-9
C  docs/GO-VIRAL.md       how a call is RUN              V-1 … V-8
```

They share one participation protocol, one recorder, one queue, one
compositor and one public layer, and none of them is allowed to
grow a second of any of those. That is the sentence the author gave
and the one every stage above is checked against:

> *"The important thing is to build these capabilities into the
> existing take/timeline model, not create a second editing
> system."*

---

# PART FIVE — V-1, as built

> *"An item with neither field behaves byte-identically to today;
> an item with a window stops accepting at the minute it says, and
> says so before it does. And a `licensed` master with no licence
> note cannot be opened to anyone."*

## What was missing was a clock, not a ceiling

`claims` bounds how many strangers may come through a door.
Nothing bounded **until when**. A song opened to `anyone` stayed
open until somebody unticked it or the hundredth arrived — so
there was no closing time, which means no moment at which a call
can be judged, no countdown to show, and nothing that can
honestly be labelled *ending soon*.

```
opensAt?   absent means open since always
closesAt?  absent means never closes
```

**Not `expiresAt`, and the difference is who it is about.**
`ParticipationRequest.expiresAt` is one person's link running out
— forty invitations are forty deadlines. This is the CALL's own
clock, and a call has one. Both exist, neither replaces the
other, and the request machine is untouched. [D-19]

## `now` is a parameter, not a reading

```
maySubmit(availability, holds, now)
mayClaim(availability, claimed, now)
availabilityState(availability, now)
describeAvailability(availability, now)
isOpenAt(availability, now)
```

Required rather than defaulted, and the compiler then listed
every call site — eight of them across three routes, two publish
panels and the field editor. **A permission check with an
optional clock is a permission check somebody forgets to wind**,
and the type checker is the only reviewer that reads every caller.

It is also what lets a test say *before it opens* and *after it
shuts* without waiting, which is why the sixteen assertions on
the window run in milliseconds.

**One instant per answer, not one per row.** `/api/participate`
reads the clock once: a listing that read it per row could let a
call close between two rows of one response, which is a listing
that disagrees with itself.

## Two new states, and they come first

```
unavailable   browse-only   scheduled   closed
open          restricted    unlisted    private
```

*Who may take part* is a different question from *may anybody
yet*, and the second is answered first: an item open to `anyone`
next Tuesday is not `open`, it is `scheduled`, and a surface that
drew it as open would invite people to press a button that
refuses them.

**Still listed either way.** Discovery is not the clock — a call
nobody can find before it opens is a call nobody enters when it
does, and *ending soon* is a thing to show rather than a thing to
hide. `isListed` is untouched, which is PART FIVE of
`docs/TAKE-PLATFORM.md` left exactly where it was.

## Forgiven at the read, refused at the write

An unreadable date on disk leaves the door **open**, which is
`isOpen`'s own decision about `expiresAt` and is taken here for
the reason it gives: *"a corrupt expiry that locked somebody out
mid-recording is a worse failure than a link that outlives its
terms"* — and there is a revocation that always works, unticking
it or unpublishing. A date nobody can read is not a deadline
anybody set; it is a damaged record, and the answer to a damaged
record is not to lock the room.

**What is refused instead is writing one.** `whenProblem` is what
a producer meets, at the moment they type it, where the thing
that is wrong is still in front of them:

```
that is not a date to close at
it cannot close before it opens
```

Two minds about one question would be a fault; this is one parse
reaching two conclusions about two different situations.
`availabilityFrom` keeps a window only when `whenProblem` is
silent, so a route that forgot to ask cannot store a window the
door will not read.

**Stored as the instant, not as what was typed.**
`2026-06-01T10:00:00+02:00` becomes `2026-06-01T08:00:00.000Z`,
so two producers in two time zones write the same record and the
predicates compare like with like.

## A repair the addition uncovered

`Publication` wrote out `respondable`, `listed` and `access` by
hand — and **`claims` was not written out at all.** It has been
stored on published performances since P41 and read back by
`claimsAllowed`, working only because a spread skips the
excess-property check and a structural type does not mind a field
it never heard of.

A field on disk that no type admits to is a field the next
refactor drops in silence. So `Publication extends
TakeAvailability` now, and `ChannelPublication` carries the same
four, from the module that holds the rules that read them. A
fifth cannot be added to one half of the product. [D-19]

## G7 was right about the hole and wrong about where it was

The document said *"nothing calls them at the moment participation
is opened."* Reading the code: **`mayPublish` is enforced** at
`publishPerformance`, and has been.

What is not enforced anywhere is the other half. `assertPublishable`
in `invariants.ts` carries INV-15's licence rule, has nine
assertions over it in `performance.test.ts`, and **a search for
its callers turns up that test file and nothing else.**

> A rule with a test suite and no caller is worse than one with
> neither: it reads as live.

So a `licensed` master with no word about what permits it could be
published, made `respondable: true, access: 'anyone'`, and sung on
by a thousand people.

**The fix is to call the rule that exists**, not to write it
again. `licenceMissing` is one predicate; the invariant keeps its
own wording and `publishPerformance` gets wording for a person
about to press a button. And it is refused **at the publish**,
because `availability` is written two statements later — one
refusal covers the publication and the participation, where a
separate check at the moment somebody claims would be the same
rule in a second place, after a person had already decided to
sing.

## Measured on the running product

```
THE PUBLIC LISTING
  perf_v1_open   state=open       openToAnyone=True   opens 11:24  closes 15:24
  perf_v1_shut   state=scheduled  openToAnyone=False  opens 16:24  closes 22:24

A STRANGER PRESSING "TAKE THIS SONG"
  perf_v1_open   201   request minted
  perf_v1_shut   404   that is not open for anybody to take part in

THE SAME CALL, ONE MINUTE AFTER IT SHUT
  listing        state=closed  openToAnyone=False  — still listed, with its dates
  claim          404   that is not open for anybody to take part in

A WINDOW THAT WILL NOT PARSE, AT THE WRITE
  closesAt "the end of June"        400  that is not a date to close at
  closes before it opens            400  it cannot close before it opens
```

**The scheduled call is still in the listing, with both its
dates.** That is the half that makes the rest of Go Viral
possible: *LIVE NOW*, *ENDING SOON* and *OPENS TUESDAY* are
subtractions, and `state` cannot be subtracted from.

**And the door says nothing.** A call that opens on Tuesday and a
call that shut last night answer with the same 404 as everything
else — a door that said *not yet* in a different voice from *not
here* is a door that tells a stranger which drafts exist. The
clock is enforced inside `maySubmit`, so there is no second
refusal to word differently, and a test asserts the route never
reads the clock itself.

## The record, and a mistake in how it was taken

**Twenty-five mutations across `availability.ts`,
`performance.ts`, `performanceEdit.ts` and the two participate
routes, all killed. One clause deleted, the thirty-second.**

### A mutation run with no baseline proves nothing

The first run of this stage's mutations reported **24 for 24**,
and the number was worthless. Four assertions in
`participate.test.ts` were failing before a single mutation was
applied — they read the source of a panel and a route for call
shapes this stage had changed — so the suite was already red, and
**every mutant was recorded as killed by a failure it had not
caused.**

A mutation is killed when the suite goes from green to red. A
suite that starts red cannot say anything about any of them, and
a clean sweep is exactly what that looks like. *The run that
reports no survivors is the run to distrust.*

**With a green baseline, three survived**, and all three were
real:

1. **`at === null` on the caller's clock.** Every fixture passed
   a real instant, so shutting every windowed door when `now` is
   unreadable looked the same as opening them. A caller with a
   broken clock must not close the whole installation.
2. **`at < opens` against `at <= opens`.** Every fixture was
   comfortably either side of the opening time, so the two were
   the same function. The closing boundary had been tested and
   its mirror had not.
3. **`typeof said !== 'string'`.** Less obvious than it reads:
   `Date.parse(2026)` coerces to `"2026"` and answers with the
   first instant of the **year** 2026. A client sending
   `opensAt: 2026` would have opened a call in January of that
   year and nothing would have looked wrong.

Two fixtures and one more, and the fourth survivor was the
genuine kind: `!said.trim()` beside the type check could not
change an answer, because `Date.parse('')` and `Date.parse('   ')`
are both `NaN`. **Deleted — the thirty-second.**

**The baseline is now the first thing the runner does**, and it
refuses to report anything if the suite is not green.

## And one thing found by reading rather than by measuring

G7 said a rule was uncalled; it was half right, and the half it
had wrong was the half that mattered — the uncalled rule was not
the one the document named. A ledger entry that is nearly true is
worth correcting in place, because the next stage reads it as
given.

---

# PART SIX — V-2, as built

> *"A campaign moves through states and they are not the same
> states a single person's invitation moves through."*
>
> **Judged on:** *"A hundred claimed requests under one campaign
> are listed as one call in the inbox; every request made before
> this stage reads and behaves exactly as it did; and a campaign
> cannot be moved to JUDGING while its window is open."*

## A second noun, not a second protocol

```
src/domain/campaign.ts       the model and the table
src/domain/campaignEdit.ts   the rules
src/store/campaigns.ts       the fifth store, under owned()
app/api/campaigns[/id]       open one, list them, move one along
```

`ParticipationRequest` gained **one optional field** — `campaign?:
CampaignId` — and absent is what every request on disk already is.
`REQUEST_STATES`, `REQUEST_NEXT`, `mayMove`, `advance`, `submit`,
`accept`, `reject`, `attach`, `rotate`, `viewFor`, `takesLeft` and
`takesMade` are untouched. A campaign reads requests; it never
advances one.

## Six states, and the four in front of them left out

```
scheduled ─► live ⇄ closing ─► judging ─► results ─► completed
```

**`closing` returns to `live`** and nothing else does. The only
thing that makes a call closing is how much of its window is left,
so an organiser who extends the deadline has a live call again —
not a call stuck in its last stretch. Entries never reopen once
judging has seen the field: that is the one thing a competition
cannot allow.

**DRAFT → SUBMITTED → REVIEW → APPROVED are deliberately absent.**
They only mean something with two parties, and on one installation
there is one account, one password and one owner. An owner
submitting a campaign to themselves and approving it is ceremony
with the same person on both sides, and a guard nobody enforces
teaches people to click through. They arrive with the network at
V-8, and the list has room at the front rather than an invented
authority.

## Two answers, and they disagree on purpose

```
state        where somebody moved this call to
clockSays    where its window says it should be
```

They differ whenever nobody has pressed the button yet — and a
surface showing only the first says LIVE about a call that shut an
hour ago, while one showing only the second cannot tell JUDGING
from RESULTS, because the clock has nothing to say about either.
Both are in the listing. The clock answers only the three states
it knows about and is silent after entries close.

**The window is V-1's own `TakeAvailability`**, read by V-1's own
`isOpenAt`, so a call and the item it is about cannot come to
different conclusions about whether it is open. What a campaign
adds is a NAME for the period, which is what `state` is. [D-19]

**And the last stretch is the organiser's number.** *"CLOSING is
the last stretch, where the countdown is the point"* — a different
length for a weekend challenge and a three-month album campaign.
A constant here would be this product deciding for both; absent
means a day.

## Judging cannot start while entries are arriving

The one rule a competition cannot bend, and V-2's own criterion. A
panel that starts while entries are still coming is judging a
different field from the one that entered — so `mayJudge` asks the
window as well as the state, and `moveDeadline` refuses once
judging has begun, because extending a call then would let
somebody enter knowing what they are competing against.

## The inbox shows a call, not a hundred strangers

A producer who opened a song to the public has **one** thing to
think about and a hundred things to look at. Before this, the
inbox drew a hundred rows that looked exactly like a hundred
people they had invited by name — which is the same failure B-3
found one layer down, where four angles of one capture arrived as
four strangers.

`entriesIn` groups them, with a call standing where its FIRST
answer stood so the list does not reshuffle when the ninety-ninth
arrives. A request answering no call is a group of one, which is
every request this product has ever issued.

## Which call a request belongs to, and when there is no answer

The call is stamped at the moment the request is made, because
that is the only moment it is known: a request that learned later
which campaign it belonged to would be a campaign that could
gather entries it never opened for.

**With two calls open on one track, nothing is stamped.** A song
may have several — *"France Launch Challenge, Global Take
Challenge, TikTok Performance Challenge"* — and the discovery
door names a SONG, not a call. Guessing which one somebody meant
would put their entry in a competition they never read the rules
of. They get a request belonging to no call, which is what every
request was before this stage, and V-4's campaign page is the door
that names one.

## Measured on the running product

```
GET  /api/campaigns   without a session          401

POST /api/campaigns   opens one                  state=scheduled
POST .../judge        before it is even live     409  "still taking entries"
POST .../begin                                   state=live   clock=live

three strangers press "Take this song"           201, 201, 201
                                                 all three stamped with the call

the organiser's list      state=live clock=live entries=3  "Open for takes."
POST .../judge            while entries arrive   409  "still taking entries"

POST .../deadline  → a minute ago
                          state=live clock=over
                          "The deadline has passed. Nothing more can be entered."
POST .../judge                                   state=judging
```

```
the inbox

  Anybody with the link                 created
  Sing along to "balancevid-e2e-song"
  [Hold] [Pass] [New link]

  An open call                        3 entries
  Sing along to "balancevid-e2e-song"
  0 of 3 have sent something
```

## A 201 that reads like a leak and is not

A fourth stranger pressed the button **after** the deadline, and
got 201. Reading why is what turned an implicit behaviour into a
stated one.

**Two clocks, two meanings.** The song's window is the producer
saying *anybody may send me a take of this*; the call's is a
competition on that song with its own deadline. When the
competition shuts, somebody may still sing — they are simply not
in it, and the entry carries no call. The call's own count did not
move. A producer who wants both to shut together sets both, which
is exactly what V-1 gave them.

## The record

**Thirty-five mutations across `campaign.ts`, `campaignEdit.ts`
and the claim route — all killed, against a baseline checked
first.** No clause deleted.

**Two survived the first pass and both were real:**

1. **`mayJudge` answered for the clock and not the state.**
   `beginJudging` was covered either way, because the state table
   catches it afterwards — but `mayJudge` is the predicate a
   SURFACE asks, and a button offered on a scheduled call whose
   window has passed is a button that refuses the person who
   presses it.
2. **Nothing tested that the claim route stamps anything.** The
   route was covered by reading its source for call shapes, which
   a version that stamped the wrong call would satisfy. It is
   driven now: a temporary store, a published song, a live call,
   three presses, and an assertion on what landed on disk.

**And one thing the build caught that no test could.** A Next.js
route file may export only its handlers; `export const MOVES` —
a list of states for a surface to offer, which nothing offered —
made `app/api/campaigns/route.ts` *"not match the required types
of a Next.js Route."* Deleted rather than moved: a list nobody
reads is the thing this project removes, and the framework
happened to say so first.
