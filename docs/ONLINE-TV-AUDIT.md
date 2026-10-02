# Online TV — an audit

What it does, what it cannot do, and why the transmission is black.
Measured against the code on `main` at the time of writing, not inferred
from the screens. Where a claim is checked, the check is given so it can
be re-run.

---

## 1. The finding that matters: the channel transmits black, and it is a bug

**The viewer's page is black while the control room shows a healthy
picture, and nothing anywhere reports a fault.** This is not a
deployment problem. It is reproducible from the repository.

### The chain

Every four seconds the playout engine builds one segment:

    whatIsOn(channel)  →  produceSegment  →  ffmpeg -vf [scale, pad, fps,
                                              setsar, ...markFilters]  →  .ts

`markFilters` is the station identity — the channel bug, the lower
third, the NEXT line. It emits ffmpeg's `drawtext` filter:

    drawtext=text='REdemption TV':fontcolor=0xffffff@0.85:fontsize=34
      :x=w-tw-28:y=28:box=1:boxcolor=black@0.55:boxborderw=15

**The bundled ffmpeg has no `drawtext` filter.** `ffmpeg-static` is
built without freetype:

```
$ ./node_modules/ffmpeg-static/ffmpeg -filters | grep -c drawtext
0
```

So the filtergraph is rejected, the whole command fails, and
`produceSegment` catches it:

```ts
}, opts).catch(async () => {
  /* A source that cannot be read is black, not a dead channel. */
  await black(seconds, out, offsetMs, marks, opts);
});
```

Run against the real binary, with the real `markFilters` output:

| segment chain | result |
|---|---|
| scale, pad, fps, setsar | **ffmpeg succeeded** |
| the same plus the identity's `drawtext` | **ffmpeg failed — `No such filter: 'drawtext'`** |

Every segment takes the second path. The channel transmits four seconds
of black, forever, and keeps doing it perfectly.

### Why every symptom matches

* **The player runs** — segments exist and are valid, so the clock
  advances and there is no error. They are simply black.
* **The title is right** — "REdemption TV" comes from the channel
  document through the `now` endpoint, not from the picture. Had the
  engine actually been off air the title would read **"Off air"**.
* **The control room looks fine** — by design. Its monitor is the
  operator's own canvas, never the transmission (§7, so a presenter does
  not talk over themselves). It cannot show this fault.
* **Health is green** — `black()` is the resilience path and it
  *succeeds*. Nothing counts it. A channel that is 100 % black reports
  exactly as healthy as one that is perfect.

### Confirm it in one minute

Clear the channel's identity, or switch the station graphics off, and
watch the output. `marksFor` returns `[]` when there is no identity, no
`drawtext` is emitted, and the picture should appear. If it does, this
is the whole of it.

### Fixed — see CHANNEL C-24

All three are done. What follows is the reasoning as it stood when the
fault was found; the record of the fix is C-24.

### The three fixes, in order of honesty

1. **Ship an ffmpeg with `drawtext`.** A build with freetype, or the
   distribution's own `ffmpeg`. One line of Dockerfile; everything else
   already works. Note this also needs a font file on the image.
2. **Check the filter at startup and refuse to draw what cannot be
   drawn.** `markFilters` should ask the binary once whether `drawtext`
   exists and return `[]` if not — a channel with no bug is a working
   channel; a black one is not.
3. **Count the fallback.** `black()` must record that it fired. A
   silent fallback that masks a total failure is worse than a loud one
   that interrupts: resilience is correct, invisibility is not. This is
   the fix that would have reported the fault on day one, and the one I
   would do whatever else is decided.

---

## 2. What Online TV can do today

| Area | What works | What it cannot do |
|---|---|---|
| **Continuous channel** | 24/7 playout, 4-second HLS segments, a 6-segment (24 s) window, automatic sweeping so the stream is transport and not an archive | No DVR or catch-up — the viewer page says so plainly: *"no beginning to go back to"* |
| **Schedule** | Fixed-time programmes, day-parts, a rotating loop, `whatIsOn` resolving one moment to one source | No recurrence rules, no rights windows |
| **Live studio** | Camera, WebRTC guest room, layouts shared with the renderer, virtual sets, screen share, media player, graphics, audio mixer with per-source meters, viewer answers | One master 16:9 output only |
| **Vision mixing** | Preview/programme, TAKE LIVE, solo one source full-frame, operator-chosen or automatic arrangement, roll a reference in over the live feed | No cross-dissolve; the return feed arrived in C-28 |
| **Resilience** | Emergency source above everything, backup source, automatic failover when the feed faults, black rather than a dead stream | The fallbacks are silent (see §1) |
| **Identity** | Channel bug, lower third, NEXT line, placed by the set's own region rather than a corner | Currently fatal to the picture (§1) |
| **Recording** | Optional save of a live session | Off by default; the live buffer is discarded otherwise |
| **Distribution** | The channel's own HLS | **Nothing else — see §4** |
| **Latency** | ~12 s to the viewer (`LIVE_DELAY_MS`), segment-aligned | Not low-latency; no LL-HLS, no WebRTC egress |

---

## 3. The landing page: where the buttons actually go

Measured from `app/t/ControlRoom.tsx`:

| Control | Destination |
|---|---|
| Open channel | `/t/{id}` |
| Channel row → Open | `/t/{id}` |
| Go live | `/t/{id}#live` |
| Schedule | `/t/{id}#schedules` |
| View schedule → | `/t/{id}#schedules` |
| Manage distribution → | `/t/{id}#distribution` |
| Watch the output → | `/t/{id}/watch` |

**Six of the seven open the same page.** The fragments are honoured —
`#live` selects the camera desk, `#distribution` opens the stream-output
drawer, and all of them scroll their target into view — so the code is
not inert. But on a wide screen the control room shows everything at
once, so `#schedules` scrolls to something already on screen and the
page looks untouched. **The behaviour is real and the feedback is
nil**, which is indistinguishable from a dead button.

Two concrete gaps rather than opinions:

* **`#schedules` does not select the SCHEDULES tab.** The hash handler
  sets the desk tab for `identity` and `live` only. The left panel has
  PLAYLIST / LIBRARY / SCHEDULES tabs and the fragment leaves whichever
  was open. Clicking "Schedule" from the landing page can therefore
  land on PLAYLIST.
* **Nothing acknowledges the jump.** No flash, no focus, no tab change
  the eye can catch.

**Suggested, if wanted:** have `#schedules` select the schedules tab,
`#distribution` keep its drawer open until dismissed, and give every
fragment target a one-second highlight. That is a small change and it
turns six identical-looking buttons into six visibly different ones.

### Fixed — see CHANNEL C-30

All three are done, and a fourth thing turned out to be wrong: two of
the four fragment targets were `display: contents` anchors with no
box, so there was nothing to scroll to and nothing to highlight. Each
fragment now names a real panel. The table of fragments lives in the
domain and the test walks it against both the links and the targets,
so a renamed tab is a failing test rather than a dead link.

---

## 4. Social media: there is nothing to set up yet

This is the honest answer, and the code says it first:

> *"It is not 'send RTMP to TikTok'. … the first implementation
> activates exactly one destination: the channel's own. That is
> deliberate: a connector that cannot be tested is a connector that is
> wrong."*

**No destination except the channel's own HLS is implemented.** There
is a complete model — `Destination`, `DestinationKind`, per-platform
shapes and layouts, `off`/`ready`/`on`/`blocked` states — and no sender
behind any of it. Grepping the worker and the playout engine for a
destination write returns nothing. The cards on the Online TV page
reading "Not connected" are accurate: they are rows, not connections.

### What it would take, cheapest first

1. **Generic RTMP out.** `PLATFORMS.rtmp` is already modelled with
   `needsReview: false` — *"anything that takes a server URL and a
   stream key"*. YouTube, Facebook and X all accept exactly that today,
   and so does Restream if somebody wants to fan out further. One
   ffmpeg process per enabled destination, reading the same segments
   the playout engine already writes. **This unlocks three of the four
   platform cards without anybody's permission**, and it is the single
   highest-value piece of work on this list.
2. **Per-destination shape.** The model already says TikTok is 9:16 and
   that a vertical output is a different composition rather than a
   crop (U-22). That is a second encode per vertical destination.
3. **The reviewed APIs.** TikTok LIVE, and the official YouTube /
   Facebook / X apps, each need an approved application. These are the
   slow ones and they are correctly flagged `needsReview: true`.

Until (1) exists, the answer to *"how do we set the social media"* is:
**you cannot, and the UI is telling the truth when it says so.**

---

## 5. Where this sits against professional online-TV software

Not everything below is worth fixing. It is the honest distance.

| | BalanceVid today | What a vMix / Wirecast / Restream operator expects |
|---|---|---|
| **Multistreaming** | ~~One output, its own HLS~~ **RTMP to any 16:9 ingest (C-29)** | Simultaneous RTMP to many platforms, per-destination bitrate |
| **Confidence monitor** | ~~Operator's own canvas only~~ **The transmission, sampled, in the corner (C-28)** | A return feed of what is actually going out — the fault in §1 would have been seen in seconds |
| **Fault reporting** | ~~Silent fallback to black~~ **Render failures counted (C-24), black picture alarmed (C-28)** | Alarms on encoder failure, dropped frames, bitrate floor |
| **Latency** | ~12 s | 2–8 s typical, sub-second with WebRTC egress |
| **Transitions** | ~~Cut only~~ **A dip to black at joins inside a segment (C-34)** | Dissolve, wipe, stinger |
| **Audio** | Per-source meters, a master, and ~~no~~ **every item measured and played at −23 LUFS (C-33)** | Per-source EQ, compression, ducking |
| **Graphics** | Bug, lower third, NEXT | Full template engine, data-bound tickers, crawls |
| **Recording** | Optional, one file | Always-on ISO recording per source |
| **As-run** | ~~None~~ **A log of what transmitted, as JSON or CSV (C-32)** | A log of what actually transmitted, which broadcasters need |
| **Redundancy** | Single playout process | Hot spare, automatic takeover |

### The three I would weigh above the rest

1. **Count and surface the black fallback** (§1.3). Smallest change,
   largest reduction in the risk of broadcasting nothing.
   **Done — CHANNEL C-24.**
2. **A confidence monitor** — the transmission, 12 s late, in a corner
   of the control room, clearly labelled as the delayed one. The player
   already exists on the watch page; this is reusing it.
   **Done — CHANNEL C-28.**
3. **Generic RTMP out** (§4.1). Turns a one-channel product into a
   multistreaming one with no platform negotiation.
   **Done — CHANNEL C-29.**

All three are in. What each one actually cost, against what this
section guessed, is in its own record; the two worth knowing are that
the confidence monitor found its own threshold written in the wrong
colour space, and that RTMP out turned out to be mostly a question
about where a credential lives rather than about ffmpeg.

---

## 6. Two inconsistencies worth verifying

Observed on the deployed instance; the cause is not established here,
and both are reported rather than diagnosed.

* **"ON AIR" and "Nothing currently on air" in the same card.** The
  badge is the channel's state; NOW is `whatIsOn`. With a live session
  up they should agree.
* **A full schedule timeline with "0 scheduled · 1 file" and "no
  loop".** The 24/7 timeline drew repeating five-minute programme
  blocks while the footer and the landing page both said the loop was
  empty.

Each needs one reading of `/api/channels/{id}` while the state is live
to settle. Neither should be guessed at from a screenshot, including by
me.

### Settled — see CHANNEL C-31

Measured rather than guessed, and they turned out to be **one fault
wearing two coats**: a surface showing the answer to one question
beside the answer to another, with nothing saying they were different
questions.

* **ON AIR beside "Nothing currently on air".** `transmitting` asks
  the TRANSMITTER; `showing` asks the SCHEDULE. An off-air channel
  with the engine running satisfies the first and not the second,
  because `segment.ts` keeps writing black so players do not treat
  the gap as the end of the stream. Both halves were true. Reproduced
  by construction, not inferred.
* **A full timeline against "0 scheduled · no loop".** Only a
  programme and a turn of the loop know when they end, so the walker
  advanced by five minutes for everything else and pushed a block
  each time. An empty channel drew a day of five-minute items, every
  one of them nothing. **A step is not a structure.**

Measured before and after on the same data: an empty channel with the
engine running read `ON AIR` and drew ~72 blocks across six hours; it
now reads `ON AIR · BLANK` and draws **one**. The author's real
channel is unchanged at 26 stretches.
