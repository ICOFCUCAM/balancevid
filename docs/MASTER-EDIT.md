# The Master Video is an edit, not an output

**Status: brief, recorded verbatim in substance. Not yet fully built — the gap
analysis at the foot of this file says what exists today and what does not.**

The governing sentence, from the brief:

> Learn from CyberLink's professional editing capabilities without turning
> BalanceVid into a copy of PowerDirector.

---

## §1  The Master Video needs a continuity model

The render-time message

> 00:01.248 of the song has nothing on screen. A video cannot have a hole in
> it, so cover the rest before rendering.

was not only badly worded. It points at an architectural requirement: **the
Master Video represents a continuous visual programme from 00:00 to the exact
end of the master song.** BalanceVid should not merely *discover* that at
render time — it should **prevent an invalid master from reaching render**.

```
MASTER SONG
00:00 ─────────────────────────────────────────────── 04:17

MASTER VIDEO
████████████████████████████████████████████████████
```

Valid:

```
00:00 ─ Take 1 ───┬── Take 2 ───┬── Take 3 ───────── 04:17
                  │              │
                transition     transition
```

Invalid:

```
00:00 ─ Take 1 ──── GAP ─────── Take 2 ───────────── 04:17
                   ↑
                 1.248 sec
```

The editor shows, on the edit rather than at the render button:

```
MASTER VIDEO · INCOMPLETE
Gap detected · 00:01.248–00:01.931
```

and offers:

- Extend previous take
- Use next take
- Insert another take
- Freeze previous frame
- Cover with selected take
- Add transition
- Remove gap

Only when the timeline is continuous does **Create Master** become a clean
render operation.

---

## §2  Every Master Video segment must be editable

The Master Video is a sequence of selected take blocks, and **those blocks must
behave like real editable clips.** Clicking `Take 2 · 00:34–01:02` opens an
inspector:

```
MASTER CLIP

Take 2
00:34.000 – 01:02.000

SOURCE
Take 2 · Studio

Replace source          Choose another take

Trim
In       00:34.000
Out      01:02.000

Composition
Full · Half · Grid · PiP

Transition
None · Cut · Fade · Dissolve · Wipe · Custom

Audio
Use master song · Use take audio · Mute

[Apply]
```

That is what makes the Master Video a genuine editor.

---

## §3  A transition belongs BETWEEN takes

Not conceptually this:

```
Take 1 [transition]
Take 2 [transition]
```

But this:

```
TAKE 1 ───────────╲
                   ╲ DISSOLVE
                    ╲──────── TAKE 2
```

Clicking the transition point opens:

```
TRANSITION

Take 1 → Take 2

Type        Dissolve
Duration    0.500 sec
Alignment   Center

Preview

[Apply]
```

CyberLink has extensive transition controls, including adjustable
duration/easing and a dedicated transition designer. **BalanceVid does not need
hundreds of transitions. It needs excellent transitions that work
intelligently with synchronized performances.**

---

## §4  Replace Take is the defining feature

Given:

```
00:00–00:34 Take 1
00:34–01:02 Take 2
01:02–01:27 Take 3
```

Click the middle section → **Replace**:

```
REPLACE MASTER SEGMENT

Current:  Take 2 · Studio

Available synchronized takes:
  Take 1 · Living Room
  Take 2 · Studio
  Take 3 · Beach
  Take 4 · Stage
```

Choose Take 4 and the segment becomes `00:34–01:02 · Take 4` **without
changing the master song clock.** That is one of the defining features of
Studio Two.

---

## Measured against what is built

Recorded so the brief is checked rather than remembered. `HAVE` means it
works today; `DOMAIN` means the operation exists and nothing on screen reaches
it; `GAP` means it does not exist.

| brief | state | where |
| --- | --- | --- |
| §1 gaps found before render | HAVE | `renderProblems()` in `performance.ts`, asked by the console, the timeline and the invariant |
| §1 gap drawn on the timeline | HAVE | hatched band on the MASTER VIDEO lane, `timeline-hole` |
| §1 render refused while incomplete | HAVE | `Create master video` disabled; `assertPerformanceRenderable` refuses |
| §1 `MASTER VIDEO · INCOMPLETE` on the lane | GAP | the lane has no state of its own |
| §1 Use next take (start the next scene earlier) | HAVE | `coverGap()`, offered as **Extend scene** |
| §1 Extend previous take | GAP | needs a scene END, which the model does not have — a scene runs until the next one starts |
| §1 Insert another take / Cover with selected take | DOMAIN | `setScene(at, …)` does it; only the monitor's menu reaches it, not the gap |
| §1 Freeze previous frame | GAP | no still-from-take source in the renderer |
| §1 Remove gap | GAP | means moving every later scene earlier; no such operation |
| §2 click a block to inspect it | GAP | `timeline-scene` has no click |
| §2 replace source | HAVE | monitor menu, `Replace with …` — and it does not move the boundary |
| §2 trim in/out per segment | GAP | `trimTake` trims a TAKE for the whole performance; a scene has no in/out of its own |
| §2 composition per segment | DOMAIN | `setScene` takes a `layoutId`; the composition rail sets the NEXT scene, not the selected one |
| §2 audio per segment | DOMAIN | `setSceneAudio`, behind the Audio settings disclosure |
| §3 transition stored between takes | HAVE | `scene.transition` is how a scene ARRIVES — the join, stored on the later side |
| §3 click the join | GAP | no transition handle on the timeline |
| §3 adjustable duration | GAP | `TRANSITIONS` fixes frames per style |
| §3 alignment | GAP | always centred: half from each side, by `INV-03` (the song does not get longer) |
| §4 replace without moving the clock | HAVE | monitor menu; `patch` not `write`, so beat-snapping cannot drag the boundary |
| §4 replace from the timeline block | GAP | same missing click as §2 |

**What this says.** Most of §4 and much of §1 are built. The shape of the gap
is consistent: **the operations exist in the domain and the timeline is
inert.** The genuinely new domain work is three things — a scene's own
in/out, a transition's own duration, and a transition's alignment — and one
of those (alignment) has to answer to INV-03 before it can exist at all.

---

## §5  Two editing levels

There are two, and keeping them apart is what keeps Studio Two elegant.

```
TAKES
│
├── Take 1 ──────────────── complete performance
├── Take 2 ──────────────── complete performance
├── Take 3 ──────────────── complete performance
└── Take 4 ──────────────── complete performance
             ↓
        MASTER VIDEO
             ↓
       final performance
```

**A source take** is the whole recording. Clicking one should allow: trim
start/end, replace take, rename, change environment, adjust background,
colour correction, stabilize, audio cleanup, crop/reframe, effects.

**A master segment** should primarily edit *which portion of which take is
used* — and nothing about the recording itself.

| brief | state | where |
| --- | --- | --- |
| trim start/end | HAVE | `trimTake(take, useFromSample, useToSample)` |
| rename | HAVE | `renameTake` |
| change environment | HAVE | `setEnvironment`, `SPACES` |
| adjust background | HAVE | `usePlate`, the matte in `render/matte.ts` |
| colour correction | PARTIAL | `setEffect` with four named looks; no controls of your own |
| effects | PARTIAL | same four looks |
| crop / reframe | PARTIAL | `focus.ts` reframes a conversation; a take has no crop |
| replace take | GAP | a source take is a recording; replacing it is uploading another |
| stabilize | GAP | no `vidstab`/`deshake` anywhere in `src/` |
| audio cleanup | GAP | no `afftdn`/`anlmdn`/`arnndn`/`speechnorm` anywhere in `src/` |

---

## §6  CyberLink's professional feature map, measured

> Automation creates the first edit; the human remains able to refine it.

That principle is the one worth taking wholesale. The features, checked
against `src/` rather than remembered:

| capability | state | where, or why not |
| --- | --- | --- |
| frame-accurate editing | HAVE | INV-02; the whole clock is samples and frames |
| markers | HAVE | `domain/marks.ts` |
| snapping | HAVE | `snapToBeat`, off until the author accepts the grid |
| multi-camera editing | HAVE | this *is* Studio Two — synchronized takes on one song clock |
| transitions | PARTIAL | cut, dissolve, fade; fixed duration, centred |
| captions | HAVE | `render/subtitles.ts`, ASS |
| vertical 9:16 | HAVE | `EXPORT_PROFILES`, and layouts per aspect family |
| masks | PARTIAL | a *difference* matte against a plate; no drawable mask |
| text-based editing | PARTIAL | Studio One has the transcript and quote anchoring; no cut-by-transcript |
| keyframes | GAP | every effect is constant across a shot |
| ripple editing | GAP | moving a boundary moves one boundary |
| colour matching | GAP | no shot-to-shot match |
| LUT / colour tools | GAP | no `lut3d`; four named looks and `eq` |
| chroma key | GAP | no `chromakey`; the matte is difference-based by design (INV-16) |
| motion tracking | GAP | — |
| stabilization | GAP | — |
| audio denoise | GAP | — |
| speech enhancement | GAP | — |
| hardware acceleration | GAP | no `nvenc`/`qsv`/`vaapi`/`videotoolbox` in the ffmpeg layer |
| auto-reframe, object removal, edit-by-chat | GAP | AI surface, none of it present |

---

## §7  Studio One's professional focus

Conversation production: video import, YouTube/Vimeo source, pause and
interruption points, response recording, multi-person conversation, screen
sharing, camera switching, audio cleanup, captions, transcript editing, lower
thirds, annotations, zoom/reframe, background replacement, picture-in-picture,
side-by-side, source highlighting, chapter markers, export.

The CyberLink idea that fits it: **text-based editing.** If the transcript
says *"This claim is incorrect because…"*, the author edits the conversation
around the transcript. Studio One already holds the transcript and anchors
quotes by hash (U-05, INV-05); what it does not do is let a cut be made from
the words.

---

## §8  Studio Two's professional focus

Synchronized takes, frame-accurate selection, beat snapping, song sections,
source-take replacement, master-clip editing, transitions, crossfades, colour
matching, background/environment, masks, chroma key, reframing, stabilization,
audio cleanup, vocal alignment, multi-camera performance, 9:16 / 16:9 / square
output, performance versioning.

**The differentiator is not the feature list.** It is the synchronized
master-song architecture: every take occupies the same clock, so choosing
between them is switching rather than sequencing. Nothing in PowerDirector's
model does that, and no borrowed feature should be allowed to weaken it.

---

## §9  Studio Three is not an editor

Online TV must **not** become a PowerDirector-style editor. It is *broadcast
automation + live production + channel management*:

```
LIBRARY → PLAYLIST → SCHEDULE → PROGRAMME → LIVE STUDIO
        → PROGRAM OUTPUT → DISTRIBUTION
```

The only CyberLink-shaped features that belong here are the ones that **prepare
a broadcast asset**: trim, crop, reframe, colour correction, audio cleanup,
captions, graphics, lower thirds, title design, transitions, 9:16 derivatives,
content inspection, thumbnails, asset preparation.

The existing architecture already reflects that chain; the rule to keep is that
nothing from §6 gets added here for its own sake.

---

## §10  The guest invitation is a different product concept

Studio One's invitation is **join this conversation**. Online TV's is **join
this live broadcast**. The realtime infrastructure may be shared; the concept
must not be. And:

> If the invitation was already implemented but is not visible, I would not
> rebuild it. First inspect why the existing Online TV Guests surface isn't
> rendering the invitation controls.

**That is what was done.** The panel was at `GuestsTab.tsx:261`, behind three
gates, and gate two required a Studio One conversation to exist — with no
conversations the only text on screen was *"Start one in Studio One and its
room becomes available here"*. A Channel is now a `RoomHost`: it opens a room
of its own, through the same `roomEdit`, the same `callerFor`, the same
`InvitePanel`. Nothing about the room was rebuilt.

What §10 asks for beyond that, measured:

| brief | state | where |
| --- | --- | --- |
| a broadcast invites without Studio One | HAVE | `Channel.room`, `roomHostKind`, `/api/channels/[id]/room/*` |
| the invitation lives in Live Studio → Guests | HAVE | `GuestsTab` |
| guest list: connected / waiting | HAVE | `presenceOf`, `inRoom` |
| admit / invite to stage | HAVE | `setStaged` |
| guest **roles** | PARTIAL | `ParticipantRole` is `host / speaker / audience / editor` — not Guest / Co-host / Contributor, and the join route always mints `audience` |
| per-guest **camera / mic / screen** permission | GAP | `Capability` is about the DOCUMENT — `respond`, `edit.own`, `edit.conversation`, `invite`, `publish`. There is no device permission in the model |
| invitation **expiry** | GAP | `Room.inviteToken` is revoked by rotation, never by a clock |
| role chosen **at invitation time** | GAP | one link, one role for everyone who follows it |

The three gaps are one shape: **an invitation is currently a door, not a
door with terms on it.** A token says "you may come in"; it does not say as
what, with which devices, or until when.

---

## §11  Studios are separable, and that is architecture

A customer buying **Studio One only** must not automatically receive Studio
Two guest functionality, Online TV guest functionality, or a broadcast channel.
**Studio Two only** gets takes, master editing and performance production —
not a 24/7 station. **Online TV** gets the channel, scheduling, live studio,
broadcast guests, distribution and programme output.

```
ACCOUNT
│
├── Studio One   └── Conversation participants
├── Studio Two   └── Performance participants / takes
└── Online TV    └── Broadcast guests
```

> The underlying room/participant technology can be shared. But permissions,
> invitations, terminology and UX are studio-specific.

| brief | state | where |
| --- | --- | --- |
| each studio works without the others | HAVE | Online TV no longer needs Studio One for guests (`Channel.room`), and each studio's store refuses when the account does not hold it |
| shared room technology, separate concepts | HAVE | one `RoomHost`, one `roomEdit`, one `InvitePanel`; the wording differs per studio |
| an account model | PARTIAL | `Account` exists — id, sessions, studios, `OWNER_ACCOUNT_ID`. Still single-tenant; there is a plan but no billing |
| **entitlements per studio** | HAVE | `Account.studios`, `ownsStudio`, and `requireStudio` at every door into the three stores — the data layer, per D-06 |
| navigation reflects what is owned | HAVE | the bar drops the tab, the rail drops the row, the building drops the section |

This was the one item on the list that is **not** a feature. It is a field on
`Account` and a rule every surface consults, and it got harder to add the
longer the product assumed all three — so it was done before the billing
rather than after.

**Where the rule lives, and the two places it does not.** A dimmed tab is a
courtesy: the URL is still typeable. `isOwner` was tried first, because
ninety-odd routes already call it and it already loads the account — and it
does not work, because the studio has to come from the request's path and
server components pass their cookie as `new Request('http://local/')`, a
request with no path. Those calls read as protected and were nothing. The
middleware sees every real path and its own opening paragraph rules it out:
it "has no business reading storage", and a plan lives in the account
document. So the gate is in the store, which is where D-06 puts isolation
and where `tenancy.test.ts` already says this product's data layer is.

---

## §12  The assignment, and the priority order

> Study CyberLink PowerDirector's professional editing capabilities as a
> benchmark, but do not copy its interface or turn BalanceVid into a generic
> video editor. Identify the capabilities that materially improve BalanceVid
> Studio One, Studio Two and Online TV, then integrate them into the existing
> architecture. Reuse existing components and data models wherever possible.
> **Do not create parallel editing systems.**

### P0 — Editing integrity

no timeline holes · no negative or invalid durations · no overlaps where
prohibited · no master shorter than the master song · no master longer than
the master song · no orphaned transitions · no transition crossing an invalid
boundary · no render of an incomplete master · exact frame/time validation ·
pre-render validation

| check | state |
| --- | --- |
| no timeline holes | HAVE — `renderProblems`, drawn on the lane, refused at render |
| master exactly as long as the song | HAVE — INV-03, and the spans must tile the output clock |
| exact frame/time validation | HAVE — INV-02, samples and frames throughout |
| pre-render validation | HAVE — `assertPerformanceRenderable`, one shared answer |
| no overlaps | HAVE by construction — a scene runs until the next begins |
| no orphaned transition | HAVE — a transition is a field on the scene that arrives |
| no transition crossing an invalid boundary | HAVE — `joinProblems` is the one answer MASTER CHECK, the planner and the duration edit all ask |
| no negative or invalid durations | HAVE — `assertSamples`, `RangeError` on non-integers |

### P1 — Studio Two editing

| item | state |
| --- | --- |
| click a Master Video segment | HAVE — selects it and opens the inspector |
| edit it | HAVE — source, composition, transition, audio |
| replace a take | HAVE — and the song clock does not move |
| add / remove a transition | HAVE — from the clip or from the join |
| preserve the song clock | HAVE — `set-scene` at the scene's own sample, never the snapping path |
| preserve synchronized takes | HAVE — takes are parallel; switching never re-times them |
| trim | HAVE — In and Out step the boundary, guarded: a scene still has no out-point, because its out IS the next clip's in, and the panel says so |
| adjust transition duration | HAVE — a stepper bounded by what the join can pay, and a `Default` to put it back |
| choose which shot pays | HAVE — *Ends on the cut* / *Centred* / *Begins on the cut* |
| preview | PARTIAL — the programme monitor shows the scene at the playhead; no scrub of the join |
| **undo / redo** | HAVE — every edit to a performance records a version; ⌘Z / ⌘⇧Z and a control bank step through 50 of them |

### P2 — Professional finishing

keyframes · masks · crop/reframe · colour adjustment · colour match · LUT ·
stabilization · chroma key · audio denoise · de-reverb · speech enhancement ·
captions — **all GAP except captions (HAVE) and colour adjustment (PARTIAL:
four named looks).** See §6 for where each was checked.

### P3 — Intelligent editing

| item | state |
| --- | --- |
| automatic gap detection | HAVE |
| beat-aware cuts | HAVE — `snapToBeat`, off until the author accepts the grid |
| automatic continuity repair suggestions | PARTIAL — one remedy (extend the next scene), and it refuses when it would not help |
| best-take suggestions | PARTIAL — `suggestions.ts` and `performanceClips.ts` rank clip candidates |
| automatic captions | PARTIAL — transcription exists in Studio One; not wired to Studio Two |
| auto-reframe · automatic audio cleanup · transcript editing · AI first cut | GAP |

### P4 — Studio-specific distribution

> Don't flatten these into one generic "Export Video" system.

Already true and worth keeping true: Studio One publishes a conversation,
Studio Two publishes a performance with its attribution (INV-07), Online TV
transmits. Three publish routes, three watch pages, one render engine
underneath.

---

## §13  MASTER CHECK

Before rendering, ten named checks and a state:

```
MASTER CHECK                                    PASSED
✓ Song duration matches       00:05.000 projected against 00:05.000 of song
✓ Video covers entire duration  every moment of the song has a take on it
✓ No timeline gaps          the picture track begins at 00:00.000 and never stops
✓ No overlapping master segments            2 segment(s), edge to edge
✓ All source takes available                       2 take(s) in use
✓ Transitions valid        1 join(s), every mix covered on both sides
✓ Audio present                             the song, under the picture
✓ Frame rate consistent   every segment at least one frame, cuts quantised
✓ Resolution valid                                      1920×1080
✓ Output aspect ratio valid      1.7778 — every arrangement reframes for it
```

and when something is wrong:

```
MASTER CHECK                                   BLOCKED   3 issues
⚠ Video covers entire duration      1 stretch(es) with nothing to show
    00:00.000 – 00:00.625   No visual source              [Repair]
      Use the next take         start the scene that follows it earlier
      Choose a take…  [Put it on]   2 take(s) have picture across all of it
      Extend the previous take      nothing comes before this stretch
      Freeze the previous frame     not something the renderer can make yet
```

**A list of ticks is a promise, and the one way to break it is to tick
something nobody checked.** So every line carries what it *compared*, and
each is computed from the document in front of it. Two were checked as
something true rather than as asked, and say so in the code: a take carries
no frame rate or pixel size (it is conformed on ingest), so "frame rate
consistent" asks what the document can answer, and "resolution" is about the
output, which is the only resolution this render has.

**The first version of the frame check cried wolf**, which for a checklist is
the worst failure available. It asked whether every cut lands exactly on a
frame boundary — and a cut is placed from the playhead, so at the house rate
that is one sample in 1600. It would have failed on nearly every performance
for something the renderer handles by rounding. What it asks now is whether
any segment is shorter than a single frame, which is a real defect nothing
prevents.

**And it closed a hole the code already knew about.** `transitions.ts` has
said since it was written that a mix "has a precondition the planner has to
check: both takes must have picture across the whole overlap, including the
part that lies outside their own scenes" — and nothing checked it.

| brief | state |
| --- | --- |
| ten named checks | HAVE — `masterCheck()` |
| ready / issue state | HAVE |
| the issue's place on the clock | HAVE |
| Repair → Use next take | HAVE — `coverGap` |
| Repair → Choose a take | HAVE — `coverWith`, offering only takes that reach |
| Repair → Use previous take | GAP, and said: a scene already runs up to the stretch; its TAKE is what falls short |
| Repair → Freeze previous frame | GAP, and said: the renderer has no still-from-take source |
| Repair → Add transition | not offered — a transition between two shots does not put a shot where there is none |

---

## §14  The larger vision

> CyberLink → professional general-purpose editing
> BalanceVid → professional production system with intelligent editing
> inside three specialized studios

```
                    BALANCEVID
       ┌─────────────────┼──────────────────┐
   STUDIO ONE        STUDIO TWO         ONLINE TV
 Conversation       Performance          Broadcast
       ↓                 ↓                  ↓
   Respond/Edit      Takes/Master        Programme
       ↓                 ↓                  ↓
   Conversation       Master Video       Playout
       └─────────────────┼──────────────────┘
                         ↓
                  DISTRIBUTION
          Web / YouTube / TikTok / Facebook / X / BalanceVid
```

And the engineering order, which this work follows:

> Make the Studio Two continuity/repair + clickable Master Video editing the
> immediate engineering priority. The CyberLink capability integration should
> come after the underlying editing model is robust, because otherwise you
> risk putting professional controls on top of a timeline that can still
> produce a 1.248-second hole.
