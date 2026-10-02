# Broadcast graphics — the map, measured

This document is the brief, kept whole, with what the system already
does written against each point of it. It is not a summary: the
instruction was *"do not summarise it… a professional and premium
upgrade is rather required"*, and the only way to tell an upgrade
from a rewrite is to be able to read the original beside the
measurement.

The brief's own one-line judgement is the right place to start:

> *"it currently feels more like a video player displaying a camera
> feed than a finished television channel. The biggest problem is not
> the website around the player. The transmitted picture itself is
> missing the visual language of television."*

That is correct about the picture and **wrong about the cause**, and
the difference decides everything that follows.

---

## The finding that reorders the whole list

**The channel bug, the lower third, the LIVE indicator and NEXT are
already built.** They are modelled on the channel, derived by one
function, drawn by one compositor, composited over the programme and
never burnt into a file. The architecture the brief asks for at point
7 is the architecture that is there.

**None of it reaches the wire**, and the reason is one line:

```ts
// src/playout/segment.ts
export function markFilters(marks: Mark[], canDrawText: boolean): string[] {
  if (!canDrawText) return [];
```

`drawtext` needs freetype. The pinned `ffmpeg-static` this product
ships is built without it. C-24 established that a filtergraph naming
a filter that is not there is **rejected whole**, so the station bug
did not quietly fail to appear — it took the picture with it and put
four seconds of black on the wire, every segment, for as long as the
channel had an identity. The fix at the time was to stop emitting the
marks, which traded a black channel for a clean one with no identity.

**The screenshot in the brief is that trade, seen from the sofa.**

So the work is not to build a graphics system. It is to give the one
that exists a way to draw that does not depend on a filter this
product has already been burned by twice — `drawtext` at C-24, the
mpegts demuxer at C-35, the same binary both times.

---

## 1. Permanent channel identity — the "bug"

> *"The actual picture should normally carry a restrained channel
> identity… A small logo/channel mark in a consistent corner gives
> the viewer an immediate sense that this is a channel, not a raw
> camera feed. This should come from your Graphics system, not be
> manually added to every video."*

**Built, and for exactly that reason.** `ChannelIdentity.bug` holds
`{ text?, assetId?, corner, opacity }`, and `identity.ts` opens with
the rule the brief restates:

> *"The station branding should be applied at the broadcast layer,
> not permanently burned into your source videos. That way you can
> change your channel identity later."*

`marksFor` emits `{kind:'bug'}` at 22pt against a 720-line frame,
scaled with the picture; `markFilters` positions it in its corner, or
in the rectangle a virtual set reserves for a logo. Changing the
identity changes every future second without touching a stored file.

**Not transmitted**, for the reason above.

**And a gap that is not about the binary:** `bug.assetId` — a logo
PNG rather than a name — is declared in the model and **read by
nothing**. `marksFor` pushes a bug only `if (identity.bug?.text)`, so
a channel that uploads a logo and clears the text gets no bug at all.
That is the fourth capability in four stages this product declared
and did not reach, after `slideReady` (C-36), `ACTION_SAFE` (C-38)
and `data-keys="own"` (C-39).

## 2. Lower third for the person

> *"If someone is speaking, the channel should be able to show: JAMES
> CHAMA MEYEMBI / HOST. It doesn't need to remain permanently. It can
> appear for 5–8 seconds and then disappear."*

**Built, to that specification literally.**
`ChannelIdentity.lowerThird` is `{ show: 'never' | 'at-start' |
'always', holdMs, presenter? }` and the default is `at-start` with
`holdMs: 8000` — the brief's "5–8 seconds and then disappear",
already the shipped default.

**Not transmitted**, for the reason above.

**Two real gaps in the design:**

* **It is one line, and the brief draws two.** The model composes
  `title · presenter` into a single string. A name and a role are a
  hierarchy — the name large, the role small underneath — and that is
  most of what makes a lower third look like television rather than a
  subtitle.
* **There is no role field.** `presenter` is a name. "HOST" has
  nowhere to live.

## 3. Programme identification

> *"The viewer needs to know what they are watching, not just which
> channel… REDEMPTION TV / THE ANCIENT OF DAYS / LIVE FROM THE STUDIO
> … The information should change according to the programme/source."*

**Partly built.** The lower third already carries `titleOf(on)`,
which changes with the programme, and `marksFor` takes the title as a
function so the caption follows the schedule without anybody typing
one.

**The gap is the third line.** The brief's form is channel /
programme / *what kind of thing this is* — "LIVE FROM THE STUDIO",
"STUDIO ONE · CONVERSATION". The source's kind is known to
`whatIsOn` and is nowhere in any mark.

## 4. LIVE needs to exist inside the broadcast picture

> *"You currently have a red LIVE button in the web player controls.
> That's not the same thing… Then someone watching through another
> player, HLS client, TV app, etc. still knows it is live."*

**Built, and guarded.** `liveLamp` is drawn only when
`on.kind === 'live'`, and `identity.ts` already says why in the words
the brief is reaching for:

> *"a channel whose LIVE light is part of its logo is a channel lying
> to its viewers."*

**Not transmitted**, for the reason above. The red LIVE in the player
chrome is a different thing drawn by a different layer, which is
exactly the brief's complaint.

## 5. Programme graphics

> *"During Studio One … During Studio Two … During a picture/slide:
> The slide itself becomes the programme graphic."*

**The slide half is built and is the right shape.** A slide is a
library image on the wire, so it is already the programme graphic
with nothing special done for it — which is what C-26 meant by
refusing to build a second renderer.

**The gap is that the marks do not vary by source.** Studio One and
Studio Two get the same caption shape; only the title differs. That
is the same gap as point 3 and is fixed by the same field.

## 6. NEXT / programme information

> *"NOW / The Ancient of Days / NEXT / Live Conversation / 16:30. But
> don't permanently cover the picture with this."*

**Built, with the restraint already written in.** `marksFor` emits
`{kind:'next', text: 'NEXT …'}` only alongside a lower third that is
itself showing, and the comment says why:

> *"NEXT rides with the title rather than appearing on its own,
> because the moment a viewer wants to know what is next is the
> moment they are being told what this is."*

**Not transmitted**, for the reason above. The start time ("16:30")
is not in the mark and is known to the schedule.

## 7. Lower thirds need a real graphics system

> *"You shouldn't build Slide graphics / Lower thirds / Channel bug /
> NEXT graphic / Programme title as five unrelated features. They
> should belong to: GRAPHICS → BUG, LOWER THIRD, SLIDES → COMPOSITOR
> → PROGRAMME OUT."*

**That is the architecture, and it predates the brief.** The diagram
in the brief and the one in the code are the same diagram:

```
          ChannelIdentity              (what the channel looks like)
                 │
             marksFor()                 one function, decides
                 │
     ┌───────────┼───────────┐
    BUG     LOWER THIRD    NEXT  ·  LAMP        Mark[] — plain descriptions
     └───────────┼───────────┘
            markFilters()               one compositor, draws
                 │
        the segment filter chain        scale, pad, fps, setsar, fade, marks
                 │
            PROGRAMME OUT
```

Slides join at the source rather than at the compositor, because a
slide is a picture the schedule can hold, and `identity.ts` already
states the separation the brief is after:

> *"The one that knows how to draw must not also be the one that
> decides what."*

**The gap is not the architecture. It is that the compositor has one
drawing tool and the shipped binary does not have it.**

## 8. The camera image itself

> *"quite soft, heavily compressed, poorly framed, subject very close
> to the bottom edge, large empty wall area, door dominates the left
> side, lighting relatively flat… even if you add a perfect lower
> third, it will still look like a home webcam feed."*

**Agreed, and out of this phase.** This is a production problem, not
a graphics one, and the product already has the pieces aimed at it:
virtual sets, the space table, eyeline, framing and reframing, the
recording-quality checks. Naming it here so it is not lost, and
saying plainly that no amount of compositing fixes a flat room.

## 9. The Watch page

> *"The page surrounding the video is functional but not yet a
> finished TV destination… REDEMPTION TV · LIVE / PROGRAMME / THE
> ANCIENT OF DAYS / Studio Two · Performance / NOW / NEXT."*

**Partly built.** The page has the channel name, a LIVE lamp and a
NOW PLAYING block. It does not have the programme title, the source
line, or NEXT.

Worth noting what it currently prints under NOW PLAYING: **the
channel's name**, where the brief wants the programme's. That is the
same missing fact as points 3 and 5, showing up on a third surface.

## 10. Don't overdo the writing

> *"professional television does not mean putting text everywhere…
> no permanent ticker, giant logo, permanent lower third, multiple
> banners, five badges, scrolling news, excessive animations. The
> professional approach is controlled information hierarchy."*

**This is already the rule and it is the one to keep while doing all
of the above.** The product's own constraints say the same thing in
its own words: the bug is "restrained"; the channel is named **once**
per slide and "a name in two corners of the same graphic is a station
that does not trust the viewer to have seen it"; NEXT may not appear
on its own; the lower third defaults to eight seconds and not
"always".

The brief's hierarchy, against where each level lives:

| | | where |
|---|---|---|
| Permanent | channel bug | `identity.bug` |
| Temporary | speaker identification | `identity.lowerThird`, `holdMs` |
| Programme-dependent | title / segment | `titleOf(on)` — **source kind missing** |
| Event-dependent | LIVE, a viewer's answer | `liveLamp`, `citing` |
| Optional | NEXT | `{kind:'next'}` — **time missing** |

Four of the five are built. The two gaps are named above.

---

## The brief's own order, corrected by the measurement

| Area | The brief's reading | Measured |
|---|---|---|
| Video playback | Working | Working |
| Channel identity | Basic | **Built; dark on the shipped binary** |
| Broadcast graphics | Missing/underdeveloped | **Built; dark** |
| Lower thirds | Missing | **Built; dark. One line where two are wanted** |
| Programme identification | Too weak | Built; **the source kind is missing** |
| Channel bug | Missing from transmission | **Built; dark. An image bug is unreachable** |
| LIVE graphic | Only in player UI | **Built; dark** |
| NEXT information | Architecture exists | Built; dark. **The time is missing** |
| Camera quality | Needs production improvement | Agreed; a different phase |
| Watch page | Functional but basic | Agreed; prints the channel where the programme belongs |
| Graphics architecture | Now worth building properly | **Already built properly. It cannot draw.** |

---

## What this phase does, in order

> *"GRAPHICS SYSTEM → CHANNEL BUG → LOWER THIRD → PROGRAMME ID →
> SLIDES → NEXT with one compositor feeding the actual programme
> output."*

The order is right. The first item is the only one that is a
building job, and it is not the one the brief expected:

1. **A compositor that can draw.** Render the marks to a transparent
   PNG with the deterministic HTML renderer this product already has
   — the one C-26 built for slides, pinned font and all — and
   composite it with `overlay`, which the shipped binary **does**
   have. One overlay per segment, cached on what the marks say. This
   is not a second graphics system: it is the same `Mark[]` the same
   `marksFor` already produces, drawn by the same renderer the slides
   already use. It makes points 1, 2, 4 and 6 appear on every build,
   including the one in the brief's screenshot.
2. **The lower third as two lines**, with a role beside the name.
3. **The source kind**, so a caption can say STUDIO ONE ·
   CONVERSATION, which closes points 3 and 5 and the Watch page's
   NOW PLAYING at the same time.
4. **An image bug**, reaching `bug.assetId` at last.
5. **NEXT with its time.**
6. **The Watch page**, printing what is on rather than whose channel
   it is.

Each lands as its own stage in `CHANNEL.md`, measured against the
author's own channel, with the picture to show for it.
