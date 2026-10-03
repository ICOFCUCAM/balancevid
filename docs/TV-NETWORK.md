# The BalanceVid TV Network — the brief, what already exists, and the stages

> *"The broadcast engine you've been building answers how a channel
> broadcasts. The BalanceVid TV Network needs to answer how the world
> finds and watches that channel."*

Concern **B**. Written to the same method as `docs/TAKE-DESKTOP.md`
(concern A): the brief kept in the author's own words, every claim
about the existing system naming the file it was read from, and
stages that add or upgrade rather than rewrite.

---

# PART ZERO — What this is, and what it is not

**This is a discovery and identity layer over channels that already
transmit.** It is not a second broadcast engine, not a second video
server, and not a new website.

| it IS | it is NOT |
|---|---|
| a public layer of `balancevid.com` | a separate site or domain |
| a registry of channel identity | a store of channel media |
| a directory, a guide and a tuner | a second player |
| metadata beside the stream | a change to how a channel transmits |

## The decision, settled

**It happens before login, on this site.** The author, over a
screenshot of the sign-in page:

> *"most of it would happen here, before login and also as
> documented."*

So this is not a question any stage reopens. `/tv` and the public
gateway are served by the existing installation at the existing
domain, to visitors with no account, and the authenticated
production application stays where it is.

The author's own earlier instruction says the same:

> *"I would not create a completely separate website at this stage. I
> would build the BalanceVid TV Network as a public layer of the
> existing BalanceVid website, before login, while keeping the
> authenticated BalanceVid production application separate."*

And the registry's boundary:

> *"The registry does not need to own the media bytes. That's
> important for your infrastructure/cost concerns."*

## The separate concern this document does not address

The author raised two things in one breath:

> *"Another concern is the BalanceVid TV that is broadcasting online
> now but slow."*

**Slowness is a transmission problem, not a discovery problem**, and
nothing in this document makes a channel faster. It belongs with the
playout engine and the segment pipeline, is measured there, and is
named here only so it is not assumed to be covered.

---

# PART ONE — The brief, as given

## The question

> *"How would people access the channel? online satellite channels
> that are searched, how would the many channels that shall be owned
> by BalanceVid users be differentiated and captured? would it be
> through domains? how? through a BalanceVid Online TV app? how would
> it be tailored to the different users? we know that it shall be
> pushed through social media but my concern is the TV itself."*

> *"this is a separate problem from simply making BalanceVid TV look
> professional. You are asking about the identity and discovery layer
> of the television network: If thousands of BalanceVid users
> eventually operate their own channels, how does a viewer find their
> channel, distinguish it from every other BalanceVid channel, and
> tune into it like a real TV service?"*
>
> *"I think the answer should not be domains alone and not the
> BalanceVid website alone. You need a BalanceVid TV network +
> channel identity system, with several ways to tune in."*

## 1. Think of each channel as a real TV station

> *"A BalanceVid user shouldn't merely have `balancevid.com/t/abc123`.
> They should have a proper channel identity:"*

```
CHANNEL
├── Channel ID
├── Channel name
├── Callsign
├── Channel number
├── Logo
├── Country/region
├── Language
├── Genre
├── Description
├── Live stream
├── EPG
├── Programme schedule
└── Public channel page
```

```
REDEMPTION TV          AFRIN KONG TV
RDTV                   AKTV
Channel 124            Channel 318
Christian · English    Travel · Culture
Africa / Global        Africa
```

> *"The channel number is the key network-level identity, while the
> name/callsign is the human identity."*
>
> *"Existing IPTV/TV ecosystems already use this type of metadata:
> channel IDs, channel numbers, logos, callsigns, and EPG data are
> standard ways to make custom channels discoverable in TV clients."*

## 2. BalanceVid should have its own TV directory

```
LIVE TV
001  BalanceVid News
002  Redemption TV
003  Afrin Kong TV
004  Music House
005  University Channel
```

> *"But don't make it just a giant list. Have: Live Now, Popular, New
> Channels, Music, Education, Faith, News, Culture, Entertainment,
> Local, International, Search, Countries, Languages. This is how
> hundreds or thousands of user-created channels become navigable."*

## 3. The viewer should be able to "tune" to a channel

> *"The BalanceVid TV app shouldn't behave only like Netflix: Click a
> card → watch a video. It should also feel like television."*

```
CH 002  REDEMPTION TV        [ LIVE ]
CH 003  AFRIN KONG TV
CH 004  INTERMISSIONS MUSIC
CH 005  UNIVERSITY TV
```

> *"A remote control could eventually have: CH + / CH − and: Enter
> channel number. That gives BalanceVid TV a genuine linear-TV
> experience."*

## 4. Channel numbers should be allocated by BalanceVid

> *"I would not allow every user to choose any number they want. You
> could have a global namespace:"*

```
000–099   BalanceVid Network
100–199   General
200–299   Music
300–399   Culture
400–499   Education
500–599   Faith
600–699   News
```

> *"But I would be careful about making these permanent categories too
> early. A better architecture is:"*

```
Channel ID: immutable
Channel Number: assigned/display identity
Callsign: human identity
Slug: URL identity
```

> *"That means you can reorganize the lineup without breaking the
> actual channel."*

## 5. Domains are still useful — but for the station

```
tv.balancevid.com/redeemption
tv.balancevid.com/ch/rdtv
```

> *"And eventually an owner could connect: `tv.redemption.example` or
> `tv.mychannel.com`. But I would not make custom domains the primary
> discovery mechanism. Why? Because imagine 10,000 BalanceVid
> channels. A viewer cannot reasonably remember
> `channel-name-247.some-domain.com`. The BalanceVid directory/app is
> the discovery layer. The domain is the station's own public
> identity."*

## 6. The BalanceVid TV app becomes very important

> *"Yes — I think BalanceVid should eventually have a dedicated Online
> TV application. Not just the existing web Watch page."*

```
BALANCEVID TV
HOME · LIVE · GUIDE · CHANNELS · SEARCH · FAVORITES
NOW PLAYING  REDEMPTION TV
```

> *"And this application can eventually target: Web, Android, iOS,
> Android TV / Google TV, Apple TV, Fire TV, Samsung/LG smart-TV
> platforms where commercially/technically appropriate."*
>
> *"CTV platforms commonly use a unified discovery interface to surface
> linear channels and other streaming services; current TV ecosystems
> also increasingly support deep-linking between services."*

## 7. The TV Guide becomes the second major discovery mechanism

> *"This is extremely important. You already have the beginning of an
> EPG/schedule system. Don't think only: channel → stream. Think:
> channel + programme + time."*

```
BALANCEVID TV GUIDE
              20:00       20:30       21:00
────────────────────────────────────────────────
002 Redemption TV
              Worship     Live Talk   Music
003 Afrin Kong TV
              Cameroon    Fako       Uganda
004 InterMissions
              Anthem      Live        Gospel
005 University
              Lecture     Discussion
```

> *"That is what makes hundreds of channels feel like a television
> network, rather than hundreds of independent web streams."*
>
> *"EPG data can also be exported to standard TV/IPTV clients alongside
> channel streams; M3U + XMLTV is already widely used for this kind of
> channel/guide integration."*

## 8. And this answers your "captured" question

> *"If you mean: How does BalanceVid know and organize all the channels
> owned by different users? You need a global channel registry. Not
> one giant video server."*

```
                 BALANCEVID NETWORK
                         │
                 CHANNEL REGISTRY
                         │
        ┌────────────────┼────────────────┐
   Channel 002      Channel 003      Channel 004
   Redemption       Afrin Kong       Music House
        │                │                │
     HLS/live         HLS/live         HLS/live
        │                │                │
     EPG              EPG              EPG
```

> *"Each channel remains owned/operated by its BalanceVid
> installation/account. The registry provides the public identity and
> discovery metadata."*

## 9. This is where your Cloud/self-hosted architecture matters

```
Channel
    ├── owner
    ├── installation
    ├── public identity
    ├── discovery status
    ├── stream endpoint
    ├── EPG endpoint
    └── availability
```

> *"A self-hosted customer might actually broadcast from
> `tv.customer-domain.com` while the public BalanceVid directory
> knows: Channel 318, Customer TV, Available."*
>
> *"The registry does not need to own the media bytes. That's important
> for your infrastructure/cost concerns."*

## 10. I would NOT force every channel into the BalanceVid directory

> *"There should be channel visibility states. You already have a
> similar concept in Take: PUBLIC, UNLISTED, PRIVATE, OFFLINE."*

> *"For TV: **Public** — appears in BalanceVid TV. **Unlisted** — works
> through direct link/domain but doesn't appear in the directory.
> **Private** — requires authorization. **Offline** — channel exists but
> isn't currently broadcasting. That gives professional organizations
> control over discovery."*

## 11. Social media is then only one distribution layer

```
                       BALANCEVID CHANNEL
                              │
                       PROGRAMME OUTPUT
                              │
              ┌───────────────┼────────────────┐
        BalanceVid TV       Web/Domain       Social
              │               │                │
          HLS/OTT          Channel page      YouTube
              │                              TikTok
              │                              Facebook
       TV applications                       X
```

> *"So BalanceVid TV itself remains the primary television product.
> Social media is an external distribution mechanism. That's an
> important distinction."*

## 12. The biggest thing I would change from your current system

> *"Right now, your Online TV work is mostly focused on: 'Can we create
> and broadcast a channel?' The next layer should be: 'Can a viewer
> discover, identify, tune to, and navigate thousands of channels?'
> That is a completely different subsystem."*

```
BALANCEVID TV NETWORK
├── Channel Registry
├── Channel Directory
├── EPG / TV Guide
└── TV Applications
```

```
CHANNEL
├── Identity
├── Number
├── Callsign
├── Logo
├── Public URL
├── Live stream
├── EPG
├── Programme metadata
└── Discovery policy
```

## One important clarification

> *"Do not try to make BalanceVid behave like a satellite operator.
> Satellite TV uses a physical broadcast/transponder ecosystem where
> receivers scan frequencies and identify services. BalanceVid is
> fundamentally an internet television network. Your equivalent of
> 'tuning' is channel registry + channel number + EPG + app/web/OTT
> discovery, while the actual media delivery remains internet
> streaming."*
>
> *"That is actually much more flexible because one BalanceVid TV
> application can expose hundreds or thousands of independently
> operated channels without requiring the viewer to know the
> underlying server/domain."*

## Where it lives: a different website, or the existing page?

> *"I would not create a completely separate website at this stage. I
> would build the BalanceVid TV Network as a public layer of the
> existing BalanceVid website, before login, while keeping the
> authenticated BalanceVid production application separate."*

```
                     BALANCEVID
          ┌──────────────┴──────────────┐
     PUBLIC TV                        SIGN IN
          │                             │
   BalanceVid TV                 BalanceVid Studio
   ┌──────┼──────┐              ┌───────┼──────┐
Channels Guide Search         Studio   Library Settings
   │
   └── Watch individual channels
```

### The public BalanceVid homepage

> *"Before login, I would make TV one of the primary destinations, not
> hide it behind the product login."*

```
BALANCEVID
TV       STUDIO       TAKE       PRICING       SIGN IN
────────────────────────────────────────────
BALANCEVID TV
Watch live channels from the BalanceVid network.
[ WATCH LIVE ]       [ TV GUIDE ]       [ CHANNELS ]
────────────────────────────────────────────
LIVE NOW
[ Redemption TV ] [ Afrin Kong TV ] [ Music House ]
```

> *"This means a normal person can arrive at BalanceVid and immediately
> understand: BalanceVid isn't only software for broadcasters. It also
> has a television network."*

### Then `/tv` becomes the actual public TV product

> *"I would make `balancevid.com/tv` the public front door to the
> network. It can contain: Live, Channels, TV Guide, Search,
> Categories, Countries, Languages, Favorites later, individual
> channel pages. This is much better than creating something like
> `balancevidtv.com` immediately. The important architecture is that
> TV is a product surface, not necessarily a separate company/site."*

### Individual channels

> *"Then `balancevid.com/tv/channels/redemption-tv` could be the public
> station page."*

```
REDEMPTION TV                         ● LIVE
┌────────────────────────────────────────────┐
│                 LIVE VIDEO                 │
└────────────────────────────────────────────┘
REDEMPTION TV
Channel 102
NOW   The Ancient of Days
NEXT  Live Conversation
[ TV GUIDE ]  [ ABOUT ]  [ SHARE ]
```

> *"The channel owner can eventually have a custom domain, but
> BalanceVid provides the canonical public channel identity."*

### And this solves the problem of different users

```
Owner                     Viewer
BalanceVid                BalanceVid TV
   ↓                         ↓
Online TV                 Channels
   ↓                         ↓
Redemption TV             Redemption TV
```

> *"Same channel. Two completely different experiences."*

| Owner controls | Viewer sees |
|---|---|
| programming | channel |
| schedule | live programme |
| graphics | guide |
| distribution | programme information |
| channel identity | related channels |
| permissions | watch controls |
| production | |

> *"That separation is important."*

### The routes

> *"I would NOT put all TV functionality on the pre-login homepage. The
> homepage should be the gateway. The actual TV experience should have
> its own public route:"*

```
balancevid.com
      ├── /tv
      │    ├── /channels
      │    ├── /guide
      │    ├── /search
      │    └── /channels/{slug}
      ├── /take
      └── /login
```

> *"Then after authentication: `balancevid.com/app/...` or your existing
> authenticated application routes. That keeps the public website clean
> while avoiding another domain and another product identity."*

### Eventually, the TV app uses the exact same public network

```
                 BALANCEVID TV NETWORK
             ┌────────────┼────────────┐
           Web          Mobile       TV App
             └────────────┼────────────┘
                  CHANNEL REGISTRY
          ┌───────────────┼───────────────┐
       Channel 101     Channel 102     Channel 103
```

> *"The web, mobile app and future TV/CTV apps all consume the same
> channel registry and EPG, rather than each having its own channel
> list. That separation between the media stream and service/channel
> metadata is normal in IPTV architectures: the guide and channel
> identity are data layers that clients use alongside the video
> stream."*

### One thing I would change from our earlier idea

> *"I would not make channel numbers the primary discovery mechanism.
> Keep them, because they make the system feel like television: Channel
> 102 — Redemption TV. But the fundamental identity should be:"*

```
Channel ID       immutable
Slug             URL identity
Name             public name
Callsign         short identity
Channel number   viewer-facing tuning number
Logo             visual identity
EPG ID           programme-guide identity
Owner            BalanceVid account/installation
Stream           current delivery endpoint
```

> *"That prevents the whole system from breaking if you later reorganize
> channel numbers."*

### The recommendation

> *"Do not create a separate BalanceVid TV website yet. Build
> `balancevid.com/tv` as a public, pre-login television network. Then
> keep `balancevid.com` → public BalanceVid/product gateway and
> `balancevid.com/app/...` → authenticated production environment."*

```
                         BALANCEVID.COM
              ┌───────────────┴────────────────┐
         PUBLIC WORLD                      SIGN IN
      ┌───────┼────────┐                 BALANCEVID APP
     TV      TAKE    Product              Production
      │
      ├── Channels
      ├── Live
      ├── Guide
      ├── Search
      └── Channel pages
```

> *"This is the right foundation before you start building the dedicated
> BalanceVid TV app. The website and future apps then become different
> interfaces to the same BalanceVid TV Network + Channel Registry + EPG
> rather than separate TV systems."*

---

# PART TWO — What already exists

Measured, not assumed. Every claim names where it was read.

## A channel is already publicly watchable — the door exists

**The research for this document went wrong here first, and the
correction is the headline.** Reading the public-route list in a
window that was too short, the first conclusion was that a channel
could not be watched without signing in. That is false. `src/auth/policy.ts`
puts four channel paths in `PUBLIC_PATTERNS`:

```
/^\/t\/[A-Za-z0-9_-]+\/watch\/?$/              the watch page
/^\/api\/channels\/[A-Za-z0-9_-]+\/playlist$/   the HLS playlist
/^\/api\/channels\/[A-Za-z0-9_-]+\/stream\/[0-9]{1,15}$/
/^\/api\/channels\/[A-Za-z0-9_-]+\/now$/        what is on
```

and says exactly where the line is:

> *"WHAT IS NOT HERE is everything a broadcaster works with: the
> channel document (the schedule, the ingests, the destinations, every
> reference on disk), the library of things that could be scheduled,
> the list of channels, and the live ingest. A viewer gets the
> transmission, which is a stream of four-second segments and two
> sentences about what is in them."*

**So a stranger can already watch any published channel, at a URL,
with no account.** One channel at a time, if they already know its
id.

> **The gap is not access. The gap is that nothing can be found.**

That is the author's question exactly — *"how would people access the
channel?"* — and it narrows the work considerably: no new player, no
new streaming path, no change to transmission. A directory over a
door that already opens.

## NOW and NEXT are already served publicly, per channel

`app/api/channels/[id]/now/route.ts` is public and returns what is on
and what follows:

> *"A viewer's page needs two sentences — what this is, and what is
> next."*

**That is one row of an EPG, already built and already reachable
without an account.** The guide in the brief is that row, for every
channel, across time.

## Two of the four visibility states are already modelled

The brief asks for PUBLIC / UNLISTED / PRIVATE / OFFLINE.
`ChannelPublication` in `src/domain/channel.ts` already carries:

```ts
publishedAt: string;
unpublishedAt?: string;   // set rather than deleted
respondable?: boolean;
listed?: boolean;
access?: TakeAccess;
```

with `listed` documented as exactly the brief's distinction:

> *"Whether the programme appears in a browse surface, and who may
> send a response to it."*

And `src/domain/availability.ts` has already had the argument the
brief is about to have, and resolved it:

> *"`listed: false` was being asked to mean PRIVATE"*

`TakeAccess` is `'anyone' | 'members' | 'link' | 'invited'`, ordered
widest-first. So **listed and access are two axes, not one**, which
is precisely why UNLISTED and PRIVATE can be different states. The
brief's §10 is mostly a naming exercise over a model that exists:

| brief | existing model |
|---|---|
| Public | published, `listed !== false` |
| Unlisted | published, `listed: false` |
| Private | `access` narrower than `anyone` |
| Offline | `unpublishedAt` set, or not transmitting |

**Nothing reads `listed` to build a browse surface.** It is written by
three publish panels and consumed by no directory, because there is
no directory.

## There is already a public "things with an audience" endpoint

`/api/published` is in `PUBLIC_EXACT`:

> *"the list of things whose author asked for an audience"*

It lists **conversations only**. Not performances, not channels. The
directory endpoint the brief needs exists in embryo and television is
not in it.

## The schedule the guide needs is already computed

`airtime(channel, from, to)` walks the schedule and the loop and
answers what is on across a window — the function the Online TV
timeline is drawn from. A guide grid is that walk, for many channels,
rendered as rows. It is pure and takes no I/O.

## Cloud and self-hosted are already one mechanism

The brief's §9 wants the registry to represent both. `app/take/connections.ts`
already solved the same problem for Take:

> *"AN ORIGIN IS THE WHOLE OF AN IDENTITY HERE… a link is an origin
> plus a credential, and the origin is never written into any
> record."*

A registry entry pointing at an origin is the same shape, and the
rule that goes with it is already written down:

> *"WHICH IS ALSO WHY THERE IS NO REGISTRY. A directory of every
> BalanceVid would be the universal library §12 rejects wearing a
> different hat."*

**That rule is about installations, not channels, and the difference
must be stated before a registry is built.** Take refuses to index
every BalanceVid a person belongs to, because which production
companies somebody works with is private. A channel that has asked to
be listed has made the opposite request. The registry indexes
**channels that opted in**, never installations, and PART THREE keeps
that as a constraint rather than an afterthought.

## And the front door says the product is something else

The only thing a stranger ever sees today is `/signin`, because
`middleware.ts` denies `/` to anyone without a session. That page
says two things, and both are now out of date with the policy
behind it.

**The tagline describes one studio of four.**

> *"A conversation editor for recorded media."*
> — `app/signin/SignIn.tsx:82`

The same sentence is the site's `<meta description>`
(`app/layout.tsx:6`), which is what a search engine indexes and what
a social card shows when a channel is shared. **BalanceVid's
outermost discovery surface does not mention television.**

**And the sentence about what is public names only conversations.**

> *"Published conversations are readable without signing in.
> Everything else — drafts, recordings, anything not published — is
> not."*
> — `app/signin/SignIn.tsx:117`

That was true once. `PUBLIC_PATTERNS` now also admits
`/p/<id>/watch` and `/t/<id>/watch` — published performances and
**published channels** — so the page understates its own product to
the only people who read it.

This is the concern in miniature. A visitor who arrives at
BalanceVid is told it is a conversation editor and that
conversations can be read; a television network is running behind
the same door and nothing says so.

## Summary

| the brief asks for | status |
|---|---|
| a public way to watch a channel | **exists** — `/t/<id>/watch`, no account |
| a public stream and playlist | **exists** |
| NOW / NEXT per channel, publicly | **exists** — `/now` |
| Public vs Unlisted | **exists** — `publication.listed` |
| Private | **exists** — `publication.access` |
| Offline | **exists** — `unpublishedAt` |
| a schedule to build a guide from | **exists** — `airtime` |
| a public "has an audience" listing | **exists, without TV** — `/api/published` |
| channel number, callsign, slug, logo, genre, language, country | **absent** |
| a registry | **absent** |
| a directory | **absent** |
| a guide | **absent** |
| `/tv` | **absent** |
| M3U / XMLTV export | **built — N-7** |

---

# PART THREE — The gaps that are real

### N1 · A channel has no public identity beyond its id and its name

`Channel` carries `id`, `name`, `timezone`, the schedule, the
identity (bug, lamp, lower third) and `publication`. It has **no**
slug, callsign, number, logo-as-channel-art, genre, language,
country or description.

The brief's own warning decides the shape:

> *"Channel ID: immutable. Channel Number: assigned/display identity.
> Callsign: human identity. Slug: URL identity."*

Four identities, three of which may change, and one that may not.

### N2 · Nothing lists channels to a stranger

`/api/published` lists conversations. There is no endpoint that
answers *"what channels are on"*, and `publication.listed` — written
for exactly that question — has no reader.

### N3 · No channel number, and no allocator

A number is network-level identity and the brief is explicit that
BalanceVid assigns it, not the owner. Allocation, collision and
reorganisation are the work; the number itself is a field.

### N4 · The guide exists for one channel, not for many

`airtime` answers a window for a channel. A guide is that across
every listed channel, on one clock, with timezones reconciled —
every channel carries its own `timezone` and a grid cannot show
twelve of them.

### N5 · No `/tv`, and no public homepage at all

`middleware.ts` denies `/` to anyone not signed in, so **the front
door of BalanceVid is a password box.** The gateway the brief draws
does not exist, and everything that IS public — `/c/<id>/watch`,
`/p/<id>/watch`, `/t/<id>/watch`, `/take/<link>` — is reachable only
by someone who was sent the link.

**Three surfaces describe the product to strangers and all three are
behind or about the wrong thing:**

| surface | says | should say |
|---|---|---|
| `/` | nothing — denied | the gateway |
| `/signin` tagline | *"A conversation editor for recorded media"* | four studios, one of them a TV network |
| `<meta description>` | the same sentence | what a shared channel link is worth |
| `/signin` public note | *"Published **conversations** are readable"* | performances and channels too |

The last one is not a wording preference. It is a false statement
about the policy in `src/auth/policy.ts`, on the page whose job is
to explain that policy.

### N6 · No registry, and the word needs care

See PART TWO: Take deliberately refuses to index installations. A
channel registry is a different object with the opposite consent —
channels that asked to be listed — and must not become an index of
installations by accident.

### N7 · No export to TV clients — **closed by N-7**

M3U and XMLTV are named in the brief as the way standard IPTV
clients consume a lineup. Neither existed. Both are built: see
PART SEVEN.

### N8 · A third "what is on" function, in the route the network
would be built on

There are now three answers to *what is on*, for three audiences:

| function | where | `off` reads |
|---|---|---|
| `onAirTitle` | `src/domain/onAir.ts` | the channel's name |
| `titleOf` | `app/api/channels/[id]/now/route.ts` | `'Off air'` |
| `titleOf` | `app/t/[id]/ChannelStudio.tsx` | `'Off air'` |

**They differ on purpose** — the wire says the channel's name under
a bug, the viewer and the operator say "Off air". But the viewer's
copy is private to a route, and the directory, the guide, the
channel page and every future app all need exactly it. A fourth
copy is how they drift.

---

# PART FOUR — The stages

**UPGRADE** changes something that exists. **ADD** creates something
new. Nothing rewrites, and nothing touches transmission.

## N-1 · A channel has a public identity — **UPGRADE**

Slug, callsign, logo, description, language, country, genre, added
to `Channel` beside `publication`. The id stays immutable and
nothing is renamed.

**Number is deliberately not in this stage.** A number is a network
decision and belongs with the registry that allocates it; adding the
field before the allocator invites owners to pick their own, which
the brief forbids.

**Judged on:** an existing channel with none of these fields behaves
exactly as today.

## N-2 · The viewer's "what is on" moves where it can be read — **UPGRADE**

The `titleOf` inside `/now` joins `onAirTitle` in the domain, named
for its audience, with the difference between them stated rather
than discovered. One move, no behaviour change, done before four
surfaces need it rather than after.

## N-3 · Channels appear in the public listing — **UPGRADE**

`/api/published` learns about channels, filtered by
`publication.listed` and `isPublished`. The first reader `listed`
has ever had.

**This is the smallest stage that makes the answer possible**: a
stranger can now ask BalanceVid what channels are on. It is an API,
so nobody experiences it yet — N-4 is where a person does.

## N-4 · `/tv` — the public front door — **ADD**

```
/tv
  /tv/channels
  /tv/channels/{slug}
  /tv/guide
  /tv/search
```

Public, pre-login, served by the existing installation. The channel
page is the brief's station page; the player is the one that already
works at `/t/<id>/watch`, reused rather than rebuilt.

**This is the stage a person experiences**, and it is where the
front door changes. `/` is currently denied to strangers, so this
stage opens a public root: the gateway, with TV as a destination on
it, and `/signin` becoming a door off the gateway rather than the
gateway itself.

Three corrections travel with it, because they are the same work and
leaving them makes the new door lie as the old one did:

- the tagline stops describing one studio of four,
- the `<meta description>` with it, since that is what a shared
  channel link shows,
- and the sentence about what is readable without signing in starts
  naming performances and channels, which have been readable for a
  long time.

**Nothing about the authenticated application moves.** The
production environment keeps its routes; this adds a public layer in
front of them.

## N-5 · The guide — **ADD**

`airtime` across every listed channel, on one clock, timezones
reconciled to the viewer's. Rows are channels, columns are time.

## N-6 · The registry — **ADD**

Channel identity, discovery status, stream endpoint, EPG endpoint,
availability, and the installation it belongs to — **never the media
bytes**, per the brief.

Only channels that opted in. Never an index of installations: see
N6 in PART THREE.

This is where **channel numbers are allocated**, because allocation
is a registry function and a channel number means nothing outside
one.

## N-7 · Export to TV clients — **ADD** · *built, see PART SEVEN*

M3U for the lineup, XMLTV for the guide, from the registry and the
guide that already exist by now. Small, once N-5 and N-6 are built.

It was small, and it was not only small: building it was what
found that every logo on the public network had been a 401 since
N-4 drew it.

## N-8 · Custom domains — **ADD**

The station's own public identity, per the brief, and explicitly
**not** the discovery mechanism.

## N-9 · The TV applications — **ADD**

Web first, since N-4 is already the web client. Mobile and CTV
consume the same registry and guide, which is the point of building
them as data rather than as pages.

---

## The order

```
N-1 ─► N-3 ─► N-4 ─► N-5 ─► N-6 ─► N-7
 │              ▲             │
N-2 ────────────┘             └─► N-8, N-9
```

**N-4 is where the question that was asked is answered** — a person
arrives at BalanceVid and finds channels. N-1 to N-3 are what make
that possible; everything after makes it good.

And N-2 is deliberately early and tiny: it costs nothing now and
prevents a fourth copy of *what is on* once the directory, the
guide, the channel page and the apps all need it.

---

## What must not happen

- **No second broadcast engine.** The registry holds metadata; the
  installation transmits. The brief: *"The registry does not need to
  own the media bytes."*
- **No second player.** `/t/<id>/watch` already works, publicly.
- **No separate website or domain**, per the brief. `/tv` is a
  surface of `balancevid.com`.
- **No index of installations.** Only channels, and only those that
  asked.
- **No owner-chosen channel numbers.** Allocation is BalanceVid's.
- **No number before the allocator.** N-1 deliberately omits it.
- **No fourth "what is on" function.** N-2 exists to prevent it.
- **No channel in the directory that did not ask**, and
  `publication.listed` is already the field that says so.
- **Nothing about transmission speed.** That is a real concern and a
  different one; see PART ZERO.
- **No front door that understates the product.** If a stage adds a
  public surface, the sentences describing BalanceVid to strangers
  are part of that stage, not a follow-up.
- **No authenticated route moves.** The production application is
  untouched; this is a layer in front of it.

---

# PART FIVE — A or B: which to build first

> *"you could only upgrade and later choose of whether to start with
> A (take for Desktop) or this B."*

A recommendation, with the reasoning, so it can be overruled on the
reasoning rather than on the conclusion.

## What each one is worth

**A — Take Software for desktop** gives existing users a better way
to *make* material. It is new installed software: a shell, a
release, a signing story, device discovery, and a native stage after
that. By its own freeze, nothing ships until T-5, because an
application that connects but cannot record is not a capture
station.

**B — the TV Network** gives *everyone else* a way to find what is
already being made. Its first useful step is three fields and an
endpoint.

## The asymmetry that decides it

**B's work is mostly already done and unreachable; A's is mostly not
yet built.**

| | A | B |
|---|---|---|
| new runtime to build, sign, release | yes | no |
| first stage a person can use | T-5 | N-4 |
| works against the current deployment | no | yes |
| depends on the other | no | no |
| capability already present but unreachable | some | most |

PART TWO measured the second row. A channel is **already** publicly
watchable with no account; NOW and NEXT are **already** served to
strangers; `publication.listed` **already** records whether a
channel wants to be found. The registry and the directory are the
missing readers of fields that exist.

## And one of B's stages is worth more than its size

The front door says *"A conversation editor for recorded media"*,
and so does the `<meta description>` that every shared link and
every search result shows. **Every channel anybody shares today is
advertised with a sentence about a conversation editor.** That is a
discovery problem that costs nothing to fix and is currently
undoing the distribution the author already has.

## The recommendation

**Start with B, and stop after N-4.**

N-1 through N-4 is a public front door, a channel listing and a
station page — the thing the author asked for — on hardware that
already runs, with no new runtime. Then reassess: the guide (N-5)
and the registry (N-6) are large, and by N-4 there will be real
channels to design them against rather than imagined ones.

**Then A**, as its freeze describes, Track B first (B-1 to B-3 are
small and useful alone) and Track T after.

## Why not A first

Nothing about A is wrong and its freeze is sound. It is that A's
value arrives all at once at T-5 and B's arrives at N-3, and that
B makes what A will eventually produce *findable*. Capture before
discovery means more material nobody can find.

## What would change this recommendation

Stated so the decision stays honest:

- **A paying customer needs multi-camera capture now.** Then A, and
  this reasoning does not apply.
- **The channels are not ready to be found.** If the transmission
  concern — *"broadcasting online now but slow"* — makes the
  viewing experience poor, then advertising it widely is premature,
  and the speed work comes before either.
- **Nobody is sharing channel links yet.** The front-door argument
  weakens if no link is being shared to be mis-described.

---

# PART SIX — The record: N-1 to N-5, built

Stages N-1 through N-5 are implemented. N-6 (the registry and
channel numbers) and beyond are not, by the recommendation in PART
FIVE: *"Start with B, and stop after N-4."* N-5, the guide, came
with it because the arithmetic was small once `airtime` was
already there.

## What a stranger can now do

Verified against a running server with **no session cookie at
all**:

```
/tv                 200      /                    307 → sign in
/tv/channels        200      /t/<id>              307 → sign in
/tv/guide           200
/tv/search          200
/api/tv/channels    200
```

The directory answers:

```json
{"channels":[{"slug":"balancevid-tv","name":"BalanceVid TV",
  "says":"General · English · GB","callsign":"BVTV",
  "genre":"general","language":"en","country":"GB"}]}
```

and the station page says `BVTV`, `ON AIR`, `NOW Late Night Loop
— Studio Two · Performance — until 11:07 PM`, `NEXT Morning
Music`. The guide drew one row and twelve slots across three
hours, in the viewer's own clock.

## The findings, in order

**Every stage found something the tests caught rather than a
reader.**

| | what survived or failed | what it meant |
|---|---|---|
| N-1 | `slugFor('!!!')` → `channel` | the suggester produced what its own validator refused |
| N-1 | the fix's own fallback | unreachable once the prefix was `station-`; **deleted** |
| N-3 | two guards about an empty slug | every fixture had a good address or none; a document on disk is not a type |
| N-4 | `if (true)` for the loop-vs-programme choice | no fixture had a schedule, so the comparison was never exercised |
| N-4 | the caption replaced by the raw title | no fixture had an untitled item, so C-42's rule was never tested |
| N-5 | three clipping clauses | `airtime` already guarantees it; **deleted** |
| N-4 | a partial callsign match | noise for every realistic query; **deleted** |

**Three deletions, and the second is the one worth keeping.**
`rowFor` clamped every stretch to the window and dropped the empty
ones. All three clauses survived everything, because `airtime`
starts at `fromMs`, stops at `toMs` and takes `Math.min(toMs, …)`
for every end — and `airtime` had already deleted a guard of its
own for exactly this reason:

> *"an untested guard against a case the layer below forbids is a
> guard nobody can check."*

The words applied unchanged one layer up.

## And two faults found by looking

**The console tests failed on the new pages**, against rules
written for the control room: a logo tile rounded like a card when
it is a picture, and a player bed typed as `#000` rather than
named. The second matters — `compose.ts` pads with `color=black`,
so a player on a hand-picked near-black shows a different frame
from the file it is playing.

**And the station page buried its own answer.** At full width the
player is 720 pixels tall and pushed NOW and NEXT below the fold.

## What is still true from PART THREE

The claim that opened this document holds, and the build confirms
it: **nothing about transmission changed.** No new player, no new
streaming path, no change to how a channel broadcasts. The player
on the station page is `ChannelPlayer`, which has served
`/t/<id>/watch` since before any of this.

## N-6 · channel numbers, built

The allocator exists, so the field no longer has to be absent.

> *"I would not allow every user to choose any number they want."*

**The assignment lives where the owner does not reach** — one small
file beside the channels, keyed by the id that never changes, not
a field on a document its owner edits. A rule about who may write
can only be held by writing somewhere else.

**The brief's ranges are deliberately not built**, on the brief's
own advice: *"I would be careful about making these permanent
categories too early."* A channel changing genre would change
number, which is the one thing a number must not do. One pool from
100 — the `000–099` reservation is kept, because that is the
network reserving room for itself rather than a category — and a
lineup that later wants ranges can impose them precisely **because**
the number is an assignment and not an identity.

**Lowest free, and the trade is stated rather than hidden.** A
number released by a deleted channel is handed out again, so a
viewer who memorised CH 104 may find a different station. Never
reusing makes a five-channel installation read 100, 103, 107, 112 —
holes on every page with no explanation. The gaps are visible
always; the collision needs somebody who memorised a number for a
channel since deleted.

**Verified end to end:** no numbers file existed, the first request
to `/api/tv/channels` created it and allocated `100`, and three
further requests returned `100` with the file untouched.

**The directory stays alphabetical and the guide moved to number
order**, which is the distinction a channel number is for: a
directory is browsed by somebody reading names, a lineup is tuned.

`tuneFrom` is built and tested — CH+ / CH− wrapping both ends, and
landing on the nearest channel in the direction asked when the one
you were on has gone. **No remote draws it yet**; that is a page,
not a judgement, and it waits for a lineup with more than one
channel in it to be worth drawing.

### Two faults found, as usual, by the tests and by looking

**`numberFor` passed its own channel id to `takenNumbers`**, which
looked careful and was unreachable: a channel holding a usable
number has already returned, and one holding anything else is
dropped by the filter. Deleted. The filter itself stays and is
asserted on its contract instead — this reads a record off disk,
and a `Set<number>` that can contain `'rubbish'` is a lie told in
the type system's own words.

**And the station page drew no number while its own API answered
100.** The route and the page each resolve the channel; only one
was taught about the lineup. Found by reading the endpoint and then
looking at the page.

---

# PART SEVEN · N-7, as built

> *"EPG data can also be exported to standard TV/IPTV clients
> alongside channel streams; M3U + XMLTV is already widely used
> for this kind of thing."*

**Two documents, and neither is a new capability.** The M3U is the
directory and the XMLTV is the guide, written for a reader that is
not a browser. Everything they name was already public:

| what | where it already was |
|---|---|
| the lineup | `directory()` and the registry — N-3, N-6 |
| the guide | `airtime` and `viewerTitle` — N-5, N-2 |
| the stream | `/api/channels/<id>/playlist` — CHANNEL §7 |

`/api/tv/playlist.m3u` and `/api/tv/guide.xml`, both public, both
uncached. `url-tvg` on the M3U header, so **one address pasted into
a set-top box brings both**.

**No second broadcast engine**, which is the first line of *what
must not happen* above. The M3U points a television at the same HLS
playlist the watch page's player asks for — the same four-second
segments, the same function of the clock. A television and a browser
watch the identical channel, which is the only arrangement in which
they can agree about what is on.

### The identity a client keys on

**The immutable channel id.** This is the brief's own instruction
rather than a convenience:

> *"Channel ID: immutable. Channel Number: assigned/display
> identity… That prevents the whole system from breaking if you
> later reorganize channel numbers."*

Not the number, which N-6 hands out lowest-free and therefore
reuses. Not the slug, which the owner edits. A client that recorded
tonight's film against `tvg-id` must still find the channel
tomorrow, and the id is the one name that never moves.

### What the exports decide, and why

**An unnumbered channel is carried, at the end, with no
`tvg-chno`.** `lineupOf` would drop it; `channelListing.ts` had
already written the reason not to, for exactly this case — *"a row
that vanished for want of a number would make an unreadable file
into a blank television network."* On the web that is cosmetic.
Here it is a channel missing from somebody's television.

**A channel with no slug is still carried.** The web directory
drops one because a row there is a link and there is nowhere to
link to; a television needs no address, only the stream, which is
keyed by id. The only thing a missing slug costs is the logo.

**Only what the directory shows.** `inDirectory` is the test, so an
unlisted channel is absent from both documents exactly as it is
absent from `/tv`. Verified: made unlisted, the channel left the
M3U and the XMLTV and kept answering on its own address, logo and
all.

**Twelve hours, and the ceiling is `airtime`'s rather than a
preference.** The walk stops after 240 stretches per channel, so a
channel of two-minute clips runs the walker out before a longer
window ends. A guide that claimed twenty-four hours and delivered
eight for the busiest channels would be a document that lies about
its own extent. Twelve is what a channel changing every three
minutes can fill exactly, and a client refreshes.

**No `<desc>`.** The station has a description and the programme
does not. Printing the channel's blurb under every item would be a
guide where each row says the same paragraph twelve times.

**No configuration.** No export settings page, no per-channel
opt-in beyond the `listed` flag that already decides the directory,
no span a caller can ask for.

### The escaping is the part that earns its tests

One channel with an ampersand in its name makes an XMLTV file
unparseable, **and that takes every other channel's guide down with
it**. The ampersand is escaped first or the escapes escape each
other — `&amp;amp;`, the classic ordering bug — and control
characters are removed outright, because XML 1.0 forbids them and
an M3U is line-oriented, where a newline inside a name is a line a
parser reads as a URL.

The callsign and the genre are both constrained by the editor and
can never carry an ampersand through `setStation`. They are escaped
anyway, and the fixture sets them the way a file would, because
**a channel document is JSON on disk** — N-3's lesson — and a
hand-edited file can say anything.

### The fault N-7 found before it wrote a line

**Every logo on the public network was a broken picture.**

The directory, the search results and the station page all drew
`<img src="/api/library/<assetId>">`. That route is the
broadcaster's own monitor — *"Owner-only, like everything else that
is not published"* — so the one audience `/tv` exists for got 401
and an empty box, on every row of every page. N-1 added the logo,
N-4 drew it, and nothing in between asked whether a stranger could
fetch it.

Measured rather than reasoned about:

```
/tv                      200
/api/tv/channels         200
/api/library/<assetId>   401
```

`/api/tv/channels/<slug>/logo` is the station's own door. **The
authority is the channel, not the asset**: `bySlug` first — the
same gate the station page uses, so private and offline answer 404
— and only then the asset id, read out of the document and never
taken from the caller. Opening the library instead would have
opened everything a broadcaster ever uploaded in order to show one
picture.

### And the exports are on the front page

The finding this whole stage keeps making is that the capability
was built and nothing pointed at it. Two public URLs nobody knows
exist would be that again, so `/tv` carries **Watch on your
television**: the playlist, the guide, and one line saying the
playlist brings the guide with it.

Absolute, because a television has no page to resolve a relative
path against. A server component has no `Request`, so the
forwarded-header rule was lifted out of `originOf` into
`originFrom(headers)` rather than written a second time — and that
rule turned out to have **no behavioural test at all**, only a grep
over the routes that call it. Tolerable while its output went into
a preview card; it is an address a viewer pastes into a set-top box
now, and a wrong origin there is a television that tunes to
nothing.

### The record

Thirty-nine mutations across `tvExport.ts` and `genreSays`, all
killed; seven more on the origin rule, all killed. Two needed
fixtures rather than code, and both are worth writing down:

- **`getUTCHours` for `getHours` survives on a box that runs in
  UTC.** The mutant and the code agree there. A server does not
  have to: an installation in Lagos would have stamped every
  programme an hour late and written `+0000` underneath it, which
  is worse than no offset at all because it looks right. The
  fixture sets `TZ` and asserts the zone took effect first.
- **An icon for a station with no address** needed a document
  holding an empty slug, which is N-3's lesson again.

**And `padStart(4, '0')` on the year was deleted.** `padStart`
cannot truncate, so it did nothing for any year the clock can
produce; the only fixture that reaches it is a document claiming a
programme in the year 500, which is one malformed line rather than
the unparseable file the escaping exists to prevent. **The
twenty-second.**

`genreSays` was exported from `station.ts` rather than copied.
`stationSays` already turned `faith` into `Faith` privately, and a
group folder on somebody's television needs the same word; a second
copy is how one of them comes to say `faith`.

**Verified against a running server with no session cookie:**

```
/api/tv/playlist.m3u                  200
/api/tv/guide.xml                     200   parses; 12.0 hours
                                            across 50 slots, every
                                            programme's channel declared
/api/tv/channels/<slug>/logo          200   image/png, public max-age=300
/api/library/<assetId>                401   still shut
/api/channels/<id>/playlist           200   the URL the M3U names,
                                            answering
```

And in the browser: the card's logo draws at 1600×900 where it was
a broken image before.

## Not built

- **The federated registry.** What N-6 built is allocation within
  one installation. The brief's registry spans installations —
  cloud and self-hosted — and that is a central service, which is
  a far larger commitment than a numbers file and sits against
  `connections.ts`'s standing rule about not indexing
  installations. It needs its own decision, not an extension of
  this one.
- **N-8 · custom domains.** The station's own public identity, and
  explicitly not the discovery mechanism. Unblocked by N-7 in one
  respect: `originFrom` is now the single place that decides where
  this installation answers, which is where a custom domain would
  be read.
- **N-9 · the mobile and CTV applications.** `/tv` is the web
  client, and the API they would consume is built. N-7 makes a
  third option real that was not on the list: **a viewer with any
  existing IPTV player needs no BalanceVid application at all.**
- **A remote control.** `tuneFrom` is built and tested — CH+ / CH−
  wrapping both ends — and no page draws it.
- **A single channel's own M3U.** The station page could offer one
  address for one channel, the way the network offers one for all
  of them. Not built because nothing asked, and a second export
  surface should answer a request rather than anticipate one.
