# STUDIO ONE — SOURCE → RESPONSE

*The Conversation Studio's source model, as the author set it out, and what
was already in the building when it arrived.*

This file holds the brief **verbatim**. It is not a summary and must not be
turned into one: the author asked for that twice in the message it came in,
and every other brief in this map — `TIMELINE-BRIEF.md`, `TAKE-APP.md`,
`TAKE-PLATFORM.md` — is kept the same way, because a brief paraphrased is a
brief quietly renegotiated by whoever paraphrased it.

Part One is the brief. Part Two is the measurement — what the product
already did, line by line, before a character of this was written. Part
Three is the ledger. Part Four is what was built, and the decisions taken
while building it.

---

## PART ONE — THE BRIEF, AS GIVEN

Thereafter, looking at the convesation studio, extract and document the below and immidiately use to upgrade the conversation studio. Looking at this screen, I think you have identified a real product limitation, not merely a UI problem.

The current Conversation Studio essentially says:

Give me a YouTube link or upload a video.

That makes the product feel like a tool specifically designed around YouTube reaction videos, when the concept you have described is much broader:

Bring something you want to watch, analyze, interrupt, question, explain, criticize, or respond to.

That distinction should drive the design.

1. The current home card is too narrow

Right now you have:

Paste a video link
Upload a video

with YouTube/Vimeo mentioned.

I would change that to a proper Source model.

Start a Conversation
What would you like to respond to?

```
┌────────────────────┐  ┌────────────────────┐
│                    │  │                    │
│   Upload media     │  │   Paste a link     │
│                    │  │                    │
│ Video or audio     │  │ YouTube, Vimeo,    │
│ from your computer │  │ direct video URL   │
│                    │  │                    │
└────────────────────┘  └────────────────────┘

┌────────────────────┐  ┌────────────────────┐
│                    │  │                    │
│   Record now       │  │   Screen capture   │
│                    │  │                    │
│ Camera + mic       │  │ Record something   │
│ Start immediately  │  │ on your screen     │
│                    │  │                    │
└────────────────────┘  └────────────────────┘
```

That immediately makes BalanceVid feel like a conversation/response studio, rather than a YouTube reaction generator.

2. I would support at least these source types
A. Upload
Upload video
Upload audio

Formats can include the normal professional media formats you already intend to support.

B. URL

Not just YouTube.

Potentially:

YouTube
Vimeo
direct MP4/MOV URL
supported video hosting URLs
public media URLs

The system should tell the user whether the URL can be played directly, imported, or embedded.

C. Record

This is a major missing possibility.

Record now

Camera + microphone.

The user could say:

"I want to respond to something live."

They start the source and their commentary simultaneously.

D. Screen capture

This is particularly valuable.

Imagine:

Screen capture

The user opens a website, presentation, news article, software demonstration, social-media post, etc.

BalanceVid records the screen and their response.

Then they can pause and comment.

That greatly expands the product beyond YouTube.

3. I would also consider "Live source"

Eventually:

Live source

could allow a live incoming source to become the thing being discussed.

For example:

Live source
```
──────────────
Camera
Browser
RTMP
SRT
Network source
```

Then the user can have:

SOURCE → PAUSE/INTERRUPT → RESPONSE

This starts making Conversation Studio useful for:

live commentary
teaching
interviews
presentations
news analysis
demonstrations
conferences
broadcasts

rather than only reaction videos.

4. The fundamental concept should be SOURCE → RESPONSE

This is more important than the individual upload buttons.

I would build the product around:

SOURCE
```
   ↓
WATCH
   ↓
PAUSE / INTERRUPT
   ↓
RESPOND
   ↓
CONTINUE
   ↓
RESPOND AGAIN
   ↓
FINISHED VIDEO
```

That is the actual invention in your Conversation Studio.

The source could come from many places.

5. The UI should therefore change

Your current home page has the Conversation Studio expanded directly inside the dashboard.

I don't think that is ideal.

The dashboard should simply say:

Conversation Studio

Watch, interrupt and respond to video, audio and live sources.

Open Studio →

Then inside Studio One:

```
┌────────────────────────────────────────────────────────────┐
│ CONVERSATION STUDIO                                        │
│                                                            │
│ Start a new conversation                                   │
│                                                            │
│ What are you responding to?                                │
│                                                            │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐ │
│ │ Upload     │ │ Link       │ │ Record     │ │ Screen   │ │
│ │ media      │ │ source     │ │ now        │ │ capture  │ │
│ └────────────┘ └────────────┘ └────────────┘ └──────────┘ │
│                                                            │
│ ────────────────────────────────────────────────────────── │
│                                                            │
│ Recent conversations                                       │
│                                                            │
│ The Ancient...     YouTube       04:12       Yesterday    │
│ Lecture...         Upload        18:40       Monday       │
│ Website review     Screen        09:21       Sunday       │
└────────────────────────────────────────────────────────────┘
```

Much cleaner.

6. And don't make every source type equally complicated

When the user clicks Upload, show:

Drop video or audio here
or choose a file

When they click Link:

Paste a source URL

When they click Record:

Camera / Microphone
Start recording

When they click Screen:

Screen / Window / Tab
Start capture

The initial screen stays simple.

7. There is another important opportunity: audio

Your current wording says:

"Bring a video into the conversation."

I would change that.

Because your system already has sophisticated audio handling in Studio Two.

Conversation Studio could support:

Video · Audio · Screen · Live

For example, someone could upload a podcast episode and say:

"I want to respond to this statement at 12:42."

BalanceVid could pause at the relevant point, record their response, then continue.

That's a very natural extension of the existing concept.

8. I would not turn it into an enormous media-import system

This is important.

I would not immediately add 20 sources just because we can.

The core first version could be:

```
Source	Value
Upload video	Essential
YouTube URL	Essential
Other supported video URL	Essential
Upload audio	Very useful
Camera + mic	Very useful
Screen capture	Very useful
Live source	Later
```

That is already a dramatically broader product.

9. Your dashboard card should become much smaller

The current screenshot has almost half of the screen consumed by the Conversation Studio card.

I would change the home page to something like:

YOUR PRODUCTION

```
┌────────────────────────┐
│ CONVERSATION STUDIO    │
│                        │
│ Watch · Interrupt      │
│ Respond                │
│                        │
│ Open Studio →          │
└────────────────────────┘

┌────────────────────────┐
│ PERFORMANCE STUDIO     │
│                        │
│ One song · Many takes  │
│                        │
│ Open Studio →          │
└────────────────────────┘

┌────────────────────────┐
│ ONLINE TV              │
│                        │
│ Programme · Broadcast  │
│                        │
│ Open Online TV →       │
└────────────────────────┘
```

Then the source selection belongs inside Studio One, not on the global home page.

That would also make your Home screen much cleaner, which connects directly with the redesign we were discussing earlier.

And I think the name "Conversation Studio" is actually strong

Because it doesn't lock the product into:

Reaction Studio

or

YouTube Reaction

It can become a broader system:

Source → Conversation → Response → Publication

That could cover a person responding to:

a YouTube video
a lecture
a podcast
a documentary
a presentation
a website
a screen demonstration
a recorded interview
their own uploaded footage
eventually a live source. Do not summerise. Use your professionalism

---

## PART TWO — WHAT WAS ALREADY THERE

The standing method in this project is the author's: *"always check if the
feature already exists and only needs upgrade"*, and *"all what i give is
not to rewrite but to measure with what we already have in the system and
cover the gaps"*. So before anything was designed, every line of the brief
was measured against the running product.

It changed what the work was. Four separate times.

### The source model already accepts audio, and nobody knew

The brief's §7 — *"someone could upload a podcast episode and say: I want
to respond to this statement at 12:42"* — reads like a feature. It is one
line of HTML.

`src/render/ingest.ts` has handled audio-only material since the day it was
written:

```ts
// A missing stream is synthesised rather than rejected: a voice-only
// response is a first-class way to respond (§8), and it still has to concat.
if (!source.hasVideo) {
  args.push('-f', 'lavfi', '-i', `color=c=black:s=${HOUSE.silentVideoSize}...`);
}
```

An MP3 dropped into `/api/conversations` would be normalised to the house
format with a synthesised black picture, measured, proxied, transcribed and
placed on the timeline — every one of those already written, already tested.
The only thing refusing a podcast was `accept="video/*"` on the file input
and the sentence above it.

That is the fourth time in two months that measuring first has turned a
feature into a line. It is worth stating plainly: **the gap was in the
interface's vocabulary, not the system's capability.**

### Screen capture exists, in another studio

`app/t/[id]/useScreenShare.ts` is a complete, documented `getDisplayMedia`
hook: it asks, it handles the browser's own "stop sharing" bar, it treats a
dismissed picker as a decision rather than an error, and it holds no
opinion whatsoever about Online TV. It was written for the channel's mixer
and it is general.

The author's own rule from the Take brief applies directly: *"don't create
separate systems for these features"*. So it moves up to `app/` and both
studios import it. The alternative — a second `getDisplayMedia` hook in
Studio One — is how two surfaces come to disagree about what happens when
somebody presses Chrome's stop button.

### There is no Studio One page at all

This is the real finding, and it is larger than the brief states.

`find app -name page.tsx` returns thirteen routes. There is `/c/[id]` — a
conversation — and `/c/[id]/room`, `/c/[id]/watch`. There is **no `/c`**.
Studio Two has no landing page either, nor Online TV.

The rail's "Studio One" link goes to `newest('conversation')?.href ?? '#conversations'`
— the newest conversation, or an anchor on the home page. Which means the
answer to "where is Studio One?" has always been "the last thing you made
in it, or a scroll position".

So §5's *"Then inside Studio One:"* is not a rearrangement. There is no
inside. It has to be built, and that is why this work is larger than moving
four buttons.

### A direct video URL is refused, and refusing it is a doctrine, not a bug

`src/domain/providers.ts` recognises YouTube and Vimeo and returns `null`
for everything else, with this written above it:

> "Nothing in the product downloads from a platform that forbids it. No
> exceptions, no user-supplied workarounds, no third-party extraction
> integrations. This rule is not subject to growth arguments." (U-35 §6)
>
> There is deliberately no function here that returns a media URL. There is
> nowhere for one to be added without it being obvious in review.

The brief asks for *"direct MP4/MOV URL"* as **Essential**. Both are true at
once, and the resolution is in the difference between a file and a platform:
fetching `https://example.org/lecture.mp4` is fetching a file its publisher
served. Fetching a media URL belonging to YouTube's player is extraction,
whatever the URL looks like.

So the direct-URL path is built, and it is built to refuse platforms
explicitly rather than by accident — see PART FOUR.

### And the rest, measured

| The brief asks for | What was there |
| --- | --- |
| Upload video | **Shipped.** `POST /api/conversations` multipart → `ingest_source`. |
| YouTube / Vimeo URL | **Shipped.** Class B, the provider's own embed, nothing downloaded. |
| Upload audio | **In the engine, not in the interface.** `accept="video/*"`. |
| Direct video URL | **Absent, and deliberately so.** U-35 §6. Needs a path that cannot become extraction. |
| Camera + mic | **Recorders exist**, both bound to their studio's sync arithmetic. Nothing records *a source*. |
| Screen capture | **Shipped in Online TV.** `useScreenShare`, general, in the wrong folder. |
| Live source | Marked *Later* by the author. Not built. |
| `SOURCE → WATCH → PAUSE → RESPOND → CONTINUE` | **This is the product.** It is what `/c/[id]` has always done. |
| The four source cards | Two of them, in the dashboard. |
| Recent conversations, inside the studio | Nowhere. The list is on the home page, mixed with performances and channels. |
| A smaller dashboard card | The card holds the whole `StartConversation` form in an expander. |
| The name "Conversation Studio" | Unchanged, as asked. |

---

## PART THREE — THE LEDGER

Every line of the brief, with a state. `SHIPPED` means it was already true
before this work. `BUILT` means this work made it true. `LATER` means the
author placed it there.

| # | § | The line | State |
| --- | --- | --- | --- |
| S1-01 | §1 | The current card says “give me a YouTube link or upload a video” and is too narrow | BUILT |
| S1-02 | §1 | Four source cards: Upload media, Paste a link, Record now, Screen capture | BUILT |
| S1-03 | §1 | “Start a Conversation / What would you like to respond to?” | BUILT |
| S1-04 | §2A | Upload video | SHIPPED |
| S1-05 | §2A | Upload audio | BUILT (one attribute; the engine was ready) |
| S1-06 | §2B | YouTube URL | SHIPPED |
| S1-07 | §2B | Vimeo URL | SHIPPED |
| S1-08 | §2B | Direct MP4/MOV URL | BUILT |
| S1-09 | §2B | “The system should tell the user whether the URL can be played directly, imported, or embedded” | BUILT |
| S1-10 | §2C | Record now — camera + microphone | BUILT |
| S1-11 | §2D | Screen capture — a website, a deck, a demonstration | BUILT (the hook was shipped; it moved) |
| S1-12 | §3 | Live source: Camera / Browser / RTMP / SRT / Network | LATER — the author's own word |
| S1-13 | §4 | SOURCE → WATCH → PAUSE/INTERRUPT → RESPOND → CONTINUE → RESPOND AGAIN → FINISHED VIDEO | SHIPPED — this is `/c/[id]` |
| S1-14 | §5 | The dashboard stops holding the source picker | BUILT |
| S1-15 | §5 | Studio One exists as a place you can go | BUILT — `/c`, which did not exist |
| S1-16 | §5 | Recent conversations, inside the studio, with source and duration | BUILT |
| S1-17 | §6 | Each source type asks one simple thing when chosen | BUILT |
| S1-18 | §7 | “Video · Audio · Screen · Live” rather than “Bring a video” | BUILT |
| S1-19 | §7 | Pause a podcast at 12:42 and respond | SHIPPED — once audio can be uploaded |
| S1-20 | §8 | Do not add twenty sources because we can | HELD — six built, one deferred, nothing else |
| S1-21 | §9 | The dashboard card becomes much smaller | BUILT |
| S1-22 | §9 | The name “Conversation Studio” stays | HELD |
