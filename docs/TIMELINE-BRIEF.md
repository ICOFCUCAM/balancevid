# The timeline brief, as given

This document holds the author's brief **verbatim**, in the order it arrived,
and a ledger of what has been built against each item.

**WHY VERBATIM.** A summary of a brief is a second brief, and the difference
between the two is exactly the part somebody stops building. The instruction
was: *"Document this map as you shall execute it strictly while adding or
making any relevant upgrade. do not summerise it. a professional and premium
upgrade is rather required than to summerise the build. at the end of the
entire process you shall evaluate eact item at a time to make sure all of
what you noted is professionally implemented."*

So the author's words are reproduced below without shortening, including the
diagrams. Everything of mine is in the **ledger** at the end, and in the
`state` column of each item — never inside the quoted text.

**THE STANDING RULE OVER ALL OF IT** is the author's own, recorded as D-19
and repeated on this brief: *"always check if the feature already exist and
only need upgrade"*. On this brief that rule paid for itself on the first
item — most of what was asked for was already in the document, the planner,
the mixer and the player, and what was missing was the way in.

Each item carries a stable id (**B1**…**B15**) because the author's numbering
restarts across messages. The ids never change; the numbers are theirs.

---

## B1 — "1. Every take should be playable independently"

> The important thing is to build these capabilities into the existing
> take/timeline model, not create a second editing system.
>
> **1. Every take should be playable independently**
>
> Currently the take list is primarily:
> Take 1
> Take 2
> Take 3
>
> I would make each take a real media object.
> When the user clicks or right-clicks a take:
>
> ```
> ┌──────────────────────────┐
> │ Take 2                   │
> │ Original · 04:04         │
> │                          │
> │ ▶ Play take              │
> │ Select for master        │
> │ Place at playhead        │
> │ Trim take                │
> │ Crop / reframe            │
> │ Adjust timing             │
> │ Replace                  │
> │ Rename                   │
> │ Delete                   │
> └──────────────────────────┘
> ```

**state: HAVE, except *Replace*.** One list — `app/p/[id]/takeMenu.ts` — is
the only definition of what can be done to a take in the product.

*Replace* is the one row not built, and the record has argued since §4 that
replacing a take's media is uploading another take: a take IS a recording,
and swapping the file under it would silently invalidate its alignment, its
colour reading, its sound reading and its plate. Replacing **which take a
scene uses** is built and is in the clip inspector and the stage menu.

## B2 — "Right-clicking directly on the video"

> **Right-clicking directly on the video**
> Yes — I particularly like this.
> If Take 2 is visible in the central preview, the user can right-click the
> actual Take 2 video:
> Select Take 2
> That gives them a second, much more natural selection mechanism.
> They shouldn't always have to move their mouse to the left rail.

**state: HAVE.** The same menu is raised from three places: the row in the
rail, the take's own picture in the multiview, and its block on the timeline.
Left-clicking a picture still cuts to that take, through the same call the
number keys use.

## B3 — "2. The red playhead should absolutely be draggable"

> **2. The red playhead should absolutely be draggable**
> This is probably one of the most important improvements you mentioned.
> The current red playback line should become a proper playhead.
>
> ```
> 00:00                         02:00                         04:04
>  │                             │                             │
>  ──────────────────────────────┼─────────────────────────────
>                                │
>                                ▼
>                          RED PLAYHEAD
> ```
>
> The user should be able to:
>
> *  click anywhere on the timeline
> *  drag the playhead
> *  jump to an exact moment
> *  scrub while holding the mouse
> *  zoom the timeline
> *  move it to the absolute beginning
>
> And yes — this helps solve the "late start" problem.
> If a take begins at:
>
> ```
> Master:  00:00 ──────────────────────────────
> Take 1:       ────────────────
>               ↑
>            starts late
> ```
>
> the editor should make the misalignment obvious.
> The user can drag the take itself back:
>
> ```
> Master:  ───────────────────────────────────
> Take 1:  ────────────────
>          ↑
>       aligned
> ```
>
> Or use:
> Align start to playhead
> or:
> Align to song start
> That is much better than the system allowing a silent/empty beginning to
> become a mysterious fault later.

**state: HAVE, except *zoom the timeline* and *jump to an exact moment*.**
Click anywhere, drag, scrub while holding, and one key to the absolute
beginning are built; the take's own block drags; both alignments are in the
menu.

*Zoom* and *type an exact moment* are open, and are B3a and B3b in the
ledger.

## B4 — "3. Takes need independent timing"

> **3. Takes need independent timing**
> This is another excellent production feature.
> Every take should have its own timeline position.
> For example:
>
> ```
> MASTER SONG
> 00:00 ───────────────────────────────────────── 04:04
>
> TAKE 1
> 00:00 ───────────────────────────────────────── 04:04
>
> TAKE 2
>       00:03 ─────────────────────────────────── 04:07
>
> TAKE 3
> 00:01 ───────────────────────────────────────── 04:05
> ```
>
> The user can push a take forward or backward.
> So:
> Move Take 3 +250 ms
> or:
> Move Take 3 −120 ms
> And ideally the user can simply drag the take horizontally on the timeline.
> That gives you a proper timing model.

**state: HAVE.** `alignment.nudgeSamples` had been written, planned, mixed,
played and invariant-checked for months with **no way in**. Now: drag the
block, two alignments, frame and second steps, and an exact figure in
milliseconds — because 250 ms is seven and a half frames and no stepper can
express it.

## B5 — "4. You should distinguish three operations"

> **4. You should distinguish three operations**
> This will make the editor much easier to understand.
> **Move**
> Changes when the take plays.
>
> ```
> ←──── Take 3 ────→
> ```
>
> **Trim**
> Changes which part of the take exists in the master.
>
> ```
> [████████████████████]
>     ↑            ↑
>    trim         trim
> ```
>
> **Crop / Reframe**
> Changes what portion of the image is visible.
>
> ```
> Original frame
> ┌───────────────────┐
> │                   │
> │       PERSON      │
> │                   │
> └───────────────────┘
>
> Crop
>      ┌─────────┐
>      │ PERSON  │
>      └─────────┘
> ```
>
> Those should not be mixed together.

**state: HAVE.** All three exist and the menu prints them under their own
headings — `Menu.tsx` gained a `section` for it, because a flat list of
seventeen verbs invites somebody to trim when they meant to move.

## B6 — "5. The song itself should become editable"

> **5. The song itself should become editable**
> Yes.
> The master song shouldn't be treated as an immutable background track.
> You could have:
> AUDIO / SONG
>
> ```
> The Ancient of Days
> ──────────────────────────────────────────────
> ██████████████████████████████████████████████
> ```
>
> with actions:
> Trim
> Split
> Fade in
> Fade out
> Volume
> Mute
> Replace section
> Add audio
> Record
> Effects
> Remove section
> This makes Studio Two much more capable.

**state: GAP, and it is a model change before it is a control.** `MasterTrack`
is an asset, a title, a class, a measured duration and the lyrics. INV-03 ties
the length of every export to that duration, so every row above changes an
invariant's input. Broken out as B6a…B6k in the ledger so no row of it is
lost.

## B7 — "6. Recording directly into the timeline is particularly powerful"

> **6. Recording directly into the timeline is particularly powerful**
> Imagine the user is editing a performance and realizes:
> "I need an extra vocal section here."
> They should be able to position the playhead and choose:
> Record
> Then:
>
> ```
> MASTER SONG
> ────────────────────────────────────────────
>
> CAMERA TAKE
> ────────────────────────────────────────────
>
> VOCAL RECORDING
>                     ┌───────────────┐
>                     │   NEW TAKE    │
>                     └───────────────┘
> ```
>
> The new recording becomes another media/take object.
> It shouldn't be a completely separate workflow.

**state: PARTIAL.** A recording already becomes an ordinary take object,
measured against the song and placed by the same alignment every other take
uses — that half is built and is the half that matters. What is missing is
starting it **at the playhead**: `useMasterRecording` schedules the song from
its beginning every time.

## B8 — "7. Effects and sounds should also be timeline objects"

> **7. Effects and sounds should also be timeline objects**
> Eventually:
>
> ```
> VIDEO
> ────────────────────────────────────────────
> Take 1        Take 1       Take 2
>
> AUDIO
> ────────────────────────────────────────────
> Song ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
>
> VOCAL
> ────────────────────────────────────────────
>              Recording ━━━━━━━
>
> SFX
> ────────────────────────────────────────────
>                        ✦ impact
>
> AMBIENCE
> ────────────────────────────────────────────
> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
> ```
>
> Then the user can position things precisely.
> For example:
>
> *  applause
> *  transition sound
> *  intro
> *  outro
> *  voice-over
> *  background ambience
> *  musical layer
> *  effects

**state: GAP.** The document has `takes` and one song; there is no object for
a sound that is neither. A new model, and the same one B6 needs.

## B9 — "8. But don't turn Studio Two into Premiere Pro"

> **8. But don't turn Studio Two into Premiere Pro**
> This is important.
> I would not try to recreate a giant professional editing application.
> BalanceVid's strength should remain:
> Make a finished performance from multiple takes quickly.
> So the interface should have a simple mode with advanced controls appearing
> when needed.
> For example:
> Normal user
>
> ```
> Take 1
> Take 2
> Take 3
>
> Drag to position
> Trim
> Select
> Create master
> ```
>
> Advanced user
> Right-click:
> Advanced timing
>  Frame adjustment
>  Audio alignment
>  Crop/reframe
>  Effects
>  Keyframes
> That gives beginners simplicity without preventing professional production.

**state: PARTIAL, and it is feedback on what was just built.** The take menu
is grouped, and the three verbs a beginner needs are the first three; but it
is nineteen rows deep with everything visible at once, which is the shape
this item warns against. Open as B9a in the ledger.

## B10 — "9. I would change the timeline architecture"

> **9. I would change the timeline architecture**
> Your existing timeline is already close to this.
> Instead of thinking:
> Master Song + Take 1 + Take 2 + Take 3 + Master Video
> I would formalize it as:
>
> ```
>                     MASTER CLOCK
>                          │
>                          ▼
> 00:00 ───────────────────────────────────────── 04:04
>         │
>         │ PLAYHEAD
>         ▼
>
> VIDEO
> Take 1  █████████████████████
> Take 2        █████████████████████
> Take 3  █████████████████████████
>
> AUDIO
> Song    ███████████████████████████████████████
> Voice           ██████████
> SFX                          ██
>
> MASTER
>         [Take1][Take2][Take3][Take2][Take1]
> ```
>
> The master clock is the anchor.
> Every object has:
>
> *  start time
> *  end time
> *  source
> *  track
> *  offset
> *  trim
> *  volume
> *  visual properties
>
> That is the foundation that will let all these features work correctly.

**state: PARTIAL.** The master clock IS already the anchor — every position in
this product is a sample on the song, which is why takes are parallel and the
monitor can preview a join at all. Of the eight properties, a take today has
start (offset + nudge), end (duration), source (asset), trim, and visual
properties (environment, effect, match, stabilize, reframe). It has **no
track** and **no volume of its own**; a scene has audio, the take does not.
B10a and B10b.

## B11 — "10. This also fixes the fault you showed earlier"

> **10. This also fixes the fault you showed earlier**
> You previously had the situation where the system said there was nothing on
> screen at the beginning.
> Instead of treating that as simply a rendering error, Studio Two should
> detect:
> There is a 1.248 second gap at the beginning of the master video.
> Then show:
>
> ```
> Timeline warning
>
> 00:00 ── 01.248 ─────────────────────────────
>
> ⚠ Master has no video during this section.
>
> [ Align first take to 00:00 ]
> [ Trim empty section ]
> [ Keep gap ]
> ```
>
> That is much more professional.
> The system tells the editor exactly what is wrong and gives them a direct
> correction.

**state: PARTIAL.** The detection, the hatched band on the lane, the sentence
and a set of offered remedies are all built (`renderProblems`, `repairsFor`).
Of the three buttons: *Align first take to 00:00* is now possible for the
first time — the nudge it needs only became reachable this week — and is not
yet offered as a repair. B11a.

## B12 — "11. The resulting Studio Two becomes something like this"

> **11. The resulting Studio Two becomes something like this**
>
> ```
> ┌──────────────────────────────────────────────────────────────┐
> │ BALANCEVID                                                   │
> │ Studio Two                         The Ancient of Days       │
> ├──────────────┬───────────────────────────────┬──────────────┤
> │ TAKES        │                               │ COMPOSITION  │
> │              │       PROGRAM / PREVIEW       │              │
> │ Take 1       │                               │ Layouts      │
> │ Take 2       │                               │ Background   │
> │ Take 3       │                               │ Effects      │
> │              │                               │              │
> ├──────────────┴───────────────────────────────┴──────────────┤
> │                                                              │
> │ MASTER CLOCK                                                 │
> │ 00:00 ────────●─────────────────────────────── 04:04         │
> │               ▲ PLAYHEAD                                    │
> │                                                              │
> │ VIDEO                                                        │
> │ Take 1  █████████████████████████                           │
> │ Take 2      █████████████████████                           │
> │ Take 3  ███████████████████████████                         │
> │                                                              │
> │ AUDIO                                                        │
> │ Song    █████████████████████████████████████               │
> │ Voice          ███████████                                  │
> │ SFX                         ██                               │
> │                                                              │
> ├──────────────────────────────────────────────────────────────┤
> │ MASTER                                                       │
> │                                                              │
> │ [ Preview ] [ Create Master ] [ Versions ] [ Publish ]       │
> └──────────────────────────────────────────────────────────────┘
> ```
>
> That is the direction I would take.

**state: PARTIAL.** The three columns, the master clock, the take lanes, the
master row and the delivery row are the studio as it stands. The AUDIO group
— Song, Voice, SFX as their own lanes — waits on B8.

## B13 — "The key architectural rule"

> **The key architectural rule**
> Don't create separate systems for these features.
> Extend the existing Studio Two timeline so that:
> Take → timeline object → editable → playable → selectable → movable →
> trimmable → composable → master

**state: the rule this whole brief is executed under.** It is D-19 said for
the timeline, and it is why `takeMenu.ts` is one list with three callers
rather than three menus, why the crop writes the take's own `reframe` rather
than a new "crop object", and why watching one take on its own is a third
view of the existing stage and not a second player.

## B14 — the platforms, and the Take App

> This balancevid solfware should therefore be compartible with android and
> ios, linux, windows and more as we know, which mean there would be a moble
> software for it. not withstanding i think take should also be structure to
> have an android and ios version for apple and samsungs phones. the
> architecture is that it would be use by phones to capture videos of a
> particular music that shall be forwarded through a link to that phone(studio
> 2 the case) the user open the link and opens the "Take App" where they will
> gain access to record the video using their phones and save. as the music
> plays they shall record. the number of takes shall be recorded and the user
> will save them if they are ok or delete if they are fine. after they will
> now submit. it will now enter the system where it could be produced as
> master. With studio one, and Online TV videos or audio or other questions
> for a particular program could be forwarded to their phones through specil
> links or means. these individuals could open using the TAKE APP, answer then
> and send. i would not save under that program title, waiting for live tv or
> conversational studio program where the host can cite their participation
> and play their veiw that is already on the queue

**state: PARTIAL, and more of it exists than it looks.** Measured, not
assumed:

| in the ask | what is already built |
| --- | --- |
| runs on Android, iOS, Linux, Windows | it is a web application and already does; every studio, the room and the player run in a mobile browser. What does not exist is a packaged app in either store |
| a link sent to a phone | `Room`, its invitation terms and `Room.terms.as` — one link, a stated role, revocable |
| open the link and record | the Conversation Room records from a phone today; Studio Two's recorder is a browser recorder using the same `MediaRecorder` path |
| record while the music plays | `useMasterRecording` — the song through Web Audio, the offset taken from the audio clock, the device latency subtracted, the answer checked by the worker |
| several takes, kept or deleted, then submitted | takes are kept and deleted today; there is no **submit** step, because there is no guest-take flow yet |
| it enters the system and can be produced as a master | that is exactly what a take is |
| Studio One / Online TV send questions to phones | the Room is the same object for both; `Channel.room` already invites without Studio One |
| answers wait in a queue for the host to cite and play | `setStaged`, `presenceOf`, `inRoom` are the admit/stage machinery; a **queue of recorded answers** against a programme is not built |

**SUPERSEDED BY `docs/TAKE-APP.md`.** The author restated this item as a
seventeen-part architecture brief — production and participation as separate
halves of the product, communicating through Participation Requests — and
that document holds it verbatim with its own ledger (T1…T17). B14's rows
below are kept for the record and are executed from there.

The honest summary of what was measured here: the transport,
the recording, the sync and the invitation exist; **the guest's side of them
does not** — a phone can join a room, and cannot yet be handed a song, record
takes against it and submit them to somebody else's performance.

---

# The ledger

`HAVE` means it works today. `PARTIAL` means part of it does. `GAP` means it
does not exist. Every row is evaluated one at a time at the end of the
process, against the running product and not against this document.

| id | item | state | where |
| --- | --- | --- | --- |
| B1 | a take is a media object with its own menu | HAVE | `takeMenu.ts`, one list, three callers |
| B1a | *Replace* (swap a take's media) | GAP, argued | §4: a take IS a recording; replacing which take a SCENE uses is built |
| B2 | right-click the take's picture | HAVE | `monitor-pick`, `take-lane-block`, the rail row |
| B3 | draggable playhead, scrub, click anywhere | HAVE | the ruler is a scrub strip; the pointer is captured. **All six of its bullets now done** |
| B3a | zoom the timeline | HAVE | Fit / 2× / 4× / 8×. One wrapper widens, `pct()` untouched, so every lane zooms without being told; the view follows the playhead only when it leaves the window |
| B3b | jump to an exact moment by typing it | HAVE | the transport clock is the way in; `parseMasterPosition` reads 2:41, 2:41.500, 161, 161,5 — and refuses a word rather than jumping to zero |
| B3c | move it to the absolute beginning | HAVE | a transport key that cannot miss |
| B4 | independent timing per take | HAVE | `nudgeSamples`, reachable at last |
| B4a | move by an exact ±ms | HAVE | 250 ms is 7½ frames; the steppers cannot say it |
| B4b | drag the take horizontally | HAVE | one write, on release |
| B5 | Move / Trim / Crop distinguished | HAVE | `MenuItem.section` |
| B5a | crop / reframe | HAVE | `setReframe`, drawn on the take's own picture |
| B6 | the song becomes editable | GAP | §15.1 — a model change first |
| B6a | song: trim | GAP | |
| B6b | song: split | GAP | |
| B6c | song: fade in | GAP | |
| B6d | song: fade out | GAP | |
| B6e | song: volume | GAP | |
| B6f | song: mute | GAP | |
| B6g | song: replace section | GAP | |
| B6h | song: add audio | GAP | |
| B6i | song: record | GAP | |
| B6j | song: effects | GAP | |
| B6k | song: remove section | GAP | |
| B7 | recording is an ordinary take | HAVE | the whole pipeline, and now from anywhere in the song |
| B7a | record from the playhead | HAVE | `start(label, environment, fromSamples)` — the song begins there AND the take is placed from there, which is the arithmetic that makes it worth having. A second button, shown only when the playhead is somewhere |
| B8 | sound layers as timeline objects | GAP | no object for a sound that is neither song nor take |
| B9 | simple by default, advanced when needed | HAVE | ten rows at first, eighteen after one press; `MenuItem.advanced`, split by OPERATION rather than row by row |
| B9a | advanced rows behind one press | HAVE | `visible()` in `Menu.tsx` — a function, so the rule is tested by calling it; every raise starts simple again |
| B10 | the master clock is the anchor | HAVE | every position is a sample on the song |
| B10a | every object has a track | GAP | waits on B8 |
| B10b | every object has a volume | PARTIAL | a scene has audio; a take has none of its own |
| B11 | the gap is detected and explained | HAVE | `renderProblems`, the hatched band, the sentence |
| B11a | *Align first take to 00:00* as a repair | HAVE | offered only for a hole at the very start, on the take that begins earliest, and it writes the nudge |
| B11b | *Trim empty section* | PARTIAL | `coverGap` extends the next scene; trimming the song is B6a |
| B11c | *Keep gap* | HAVE | nothing forces a repair; the warning is advisory |
| B12 | the studio's shape | PARTIAL | the AUDIO group waits on B8 |
| B13 | one system, extended | the rule | — |
| B14 | runs on every platform | HAVE, as the web | no store app |
| B14a | a packaged mobile app | GAP | |
| B14b | a link that hands a phone a song to record against | GAP | the Room hands out a conversation, not a song |
| B14c | keep / delete / **submit** takes as a guest | GAP | no guest-take flow |
| B14d | questions sent to phones for Studio One / Online TV | PARTIAL | the Room and `Channel.room` invite; recorded answers are not a thing yet |
| B14e | a queue of answers the host cites and plays live | GAP | `setStaged` stages PEOPLE, not recorded answers |

## How this document is used

1. Nothing is built for this brief without a row here.
2. A row moves to `HAVE` only when it is verified **in the browser against
   real data**, not when its tests pass.
3. At the end, every row is evaluated one at a time, in order, against the
   running product — and this document records the result of that pass rather
   than the intention behind it.
