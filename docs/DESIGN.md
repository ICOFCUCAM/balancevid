# The look of it

This is the companion to `DOCTRINE.md` for the part of the product a person
looks at. It is short on purpose: a design document nobody finishes reading
is a design document nobody follows, and the tokens themselves are in
`app/styles/` with the reasoning beside each one.

Four tests enforce what follows — `test/domain/contrast.test.ts`,
`test/domain/design-system.test.ts`, `test/domain/console.test.ts` and
`test/domain/confirm.test.ts`. Where
this document and those tests disagree, the tests are right, because they
are the ones that run.

One thing they enforce that is not a decision so much as a trap: **you cannot
put an alpha on a token by gluing two characters to the end of it.**
`` `${colour}22` `` is the obvious way to get a translucent version of a
colour you were handed, and it works right up until the caller passes
`var(--state-ok)` — at which point the value is not a colour, the browser
drops the declaration, and the border or the glow is simply not drawn. Two of
these were live and invisible: every notice in the product had been
borderless since the day it was written. Use
`color-mix(in srgb, X 20%, transparent)`.

---

## What the product is trying to look like

A broadcast desk, operated by somebody under time pressure, often in a dark
room, sometimes on a laptop, occasionally in front of an audience.

That single sentence decides most of the rest:

- **Dark, and never pure black outside the picture.** A monitor shows true
  black; furniture that also shows true black gives the eye no edge between
  the programme and the room around it.
- **Dense without being cramped.** Six tiles, four lanes and a transport on
  one screen is the job. A roomy layout would mean scrolling to see whether
  you are on air.
- **Nothing on the broadcast path moves.** The monitor, the multi-view and
  the on-air lamp change state in the frame it happened. Motion is for
  furniture. The one exception is the live lamp's pulse, which carries no
  information about *when* and is what a tally light has looked like for
  seventy years.
- **No information carried by colour alone** (U-20, U-19). Every state
  carries a shape or a word as well.

---

## The five decisions

### 1. Depth, before labels

A control room is read by depth first: the eye finds the thing nearest the
front before it reads a single word. Five surfaces, each a fixed step
lighter than the one behind it — `sunk`, `base`, `raised`, `float`, `lift` —
and borders that lighten with them, because a hairline at one tone across
all five flattens the stack it is drawn on.

**On a dark ground the light edge does the work, not the shadow.** A black
shadow on a nearly-black surface is invisible, and more opacity produces a
smudge rather than height. One pixel of white at four per cent along the top
lifts a panel further than forty pixels of blur.

A well is elevation pointing the other way. The programme sits *below* the
surface of the desk; so do timeline tracks, meters and every input.

### 2. One scale for each dimension

Type is a minor third from 10px to 27px. Spacing is a 4px grid. Radius nests
concentrically. Before this there were eleven ad-hoc font sizes and fifteen
gap values, several one pixel apart.

The eye cannot measure an absolute size and is excellent at detecting an
inconsistent ratio, which is why a scale looks deliberate at every step and a
sediment never does.

**Tabular figures wherever a number changes.** A timecode in a proportional
face re-flows every tenth of a second, and on a clock somebody is watching to
make a cut, that shimmer is the difference between reading a number and
re-finding it.

### 3. Contrast is measured, not judged

Light text on dark *reads* as higher contrast than it *measures*. Two tones
in the first draft of this system scored 2.3:1 and 3.7:1 while looking
perfectly fine.

Every tone is checked against the **lightest** surface it can appear on,
because that is the only one that matters — the reader does not know which
surface they are looking at. Text reaches 4.5:1. Non-text (a row's ordinal, a
lane's legend) may sit at 3:1 and is documented as non-text.

**And the bar follows what is drawn on the colour, not what the colour is.**
A lamp is a non-text element at 3:1. The moment the same colour becomes a
filled chip with ON AIR written across it, it is measured against the ink it
carries and the bar is 4.5:1 — which the live red does not clear, so the lamp
keeps the bright red and the chip takes the deep one. Two of these were
failing when the rule was written, both chosen against the dark ground by
somebody who never thought about the white on top.

### 4. A control says what it is about to do

- It acknowledges the press **within the frame**, on `:active`, before any
  request returns.
- Its states are distinguishable **without colour** — hover, focus, active,
  disabled and selected each change something structural.
- It does not move the layout when it changes; emphasis comes from an inset
  shadow, never a thicker border.
- A field is **recessed** and a button is **raised**. Oldest convention
  there is, and it works without being taught.
- Focus is visible, always, via `:focus-visible`, with two rings so it
  survives every surface including live video.
- **Chosen is one rule, and it is announced.** The fill on a selected
  control is almost invisible on purpose (1.09:1); the lit border and the
  two-pixel marker on the leading edge are the signal, because those are
  what survive greyscale. A control that stores its state only in a
  `data-` attribute is a control whose state nobody can hear — eighteen of
  them did.

### 5. Asking before the irreversible

No `window.confirm`, `window.prompt` or `alert` anywhere — a test walks
`app/` and names the file if one returns. They are unstyleable, they arrive
in the OS's typography far from the control that raised them, and on a dark
desk they are a white box at the moment somebody is deciding whether to cut
the air.

The product's own dialog (`app/Confirm.tsx`) exists because three things make
a confirmation safe, and native dialogs do none of them:

1. **The verb is on the button.** Never "OK".
2. **Focus lands on Cancel** for a destructive action — a reflexive Return
   must not end a broadcast.
3. **The sentence says what is lost**, not just what is being asked.

---

## The building is lit; the rooms are not

This document argued the product has no light theme. That argument is
about the **studios** — a broadcast desk is operated in a dark room,
often beside a live monitor, and a white panel there ruins both the
picture and your night vision. It was never about the lobby.

The building — home, the library, settings — is where somebody arrives,
reads, chooses and leaves, in daylight, on a laptop, with no picture on
screen to be judged. It is lit. The rail stays dark, so navigation still
sits behind the work, and stepping into a studio is stepping into a dark
room on purpose rather than by accident.

Both grounds are measured. `building.css` states every light tone's
ratio against `#ffffff`; `contrast.test.ts` holds the dark ramp.

---

## The sixth decision: a console is not a page of cards

Added after an art-direction pass on the three studios, and the only one
of these decisions that came from looking at the product from across the
room rather than from reading its code.

**What was wrong:** eight independently bordered rounded rectangles,
evenly spaced, each the same tone and radius as the last. Playlist,
Program Output, Preview, Multi-view, Live Studio, the schedule — all
drawn as peers, all floating, none touching.

That is the visual grammar of a dashboard, and it is wrong here for a
reason that is not taste: **a dashboard is a set of independent widgets
you read; a control room is one instrument you operate.** The grammar was
telling the truth about a different product.

The rules in `console.css` are therefore subtractive:

- **A seam, not a gutter.** Adjacent modules share one hairline. Two
  borders and a gap is three lines where one is meant.
- **A radius you do not notice.** 4px, and only the chassis rounds
  visibly. A 10px radius repeated eight times is the strongest "web app"
  signal an interface can emit.
- **No drop shadow on a module.** Shadow means "above the page". Depth is
  one pixel of light along the top edge — what a physical bevel does.
- **Three levels, barely apart.** Chassis, face, control: 1.05:1 and
  1.07:1, deliberately near the threshold of perception.
- **Most controls are the quietest.** Two controls in the product are
  allowed to be loud. Forty are not.
- **An outline is the wrong way to say "this one".** An outline in a grid
  of outlines must be found by comparing; a lit edge is found without.
  Program wears a red tally, preview and selection a blue one.
- **No glass, no glow.** Both are banned by test. A blurred sample of the
  picture behind a status readout means the readout changes appearance
  with the programme — and the programme is the thing being judged.
- **A screen has square corners.** `--radius-screen`, 2px, on every
  rectangle that is a picture — both monitors, the multi-view tiles, the
  filmstrip cells, the poster wells, the stage, the camera PiP, and the
  three pages a viewer sees. 10px on a video is the shape of a card in a
  feed, on the one surface where that association is worst. It holds for
  a picture whose frame clips it, too: nine were square themselves and
  rounded by the frame around them.
- **One plate, everywhere something sits on a picture.** `rgba(0,0,0,0.72)`
  with a hairline of light. Seven private near-blacks were found between
  0.6 and 0.82, each arrived at by eye on one tile, none distinguishable
  from the others — which is most of what "assembled from parts" looks
  like. Identity rides a lamp or a leading edge; a saturated plate makes
  the label the loudest thing on the frame it is labelling.
- **A bank of positions is one piece of metal.** Mutually exclusive
  choices share edges, not gutters. A gap says these things were placed; a
  seam says they were machined.
- **Every control state leaves a slot for the focus ring.** `--ring` is
  empty until `:focus-visible` fills it. The ring is drawn under a
  zero-specificity `:where()` so a component can retint it, which also
  means any component setting `box-shadow` silently deletes it — as every
  `.ctl` state was doing.

**What is deliberately not in this decision:** the lit building keeps its
rounding, and there is a test asserting it does. The argument is about
what a console is made of, not about radii being bad. A rule pushed past
its reason is how a style guide becomes cargo cult.

---

## The seventh decision: a signal spent is a signal lost

Red in this product means one thing: **this is going out, or it is being
recorded.** The tally, the LIVE lamp, the playhead, ON AIR, TAKE LIVE,
EMERGENCY, and the record buttons in Studio Two.

It is the only signal here that a person must be able to trust without
reading, and four controls were spending it on things that transmit
nothing and record nothing: ENABLE CAMERA, TURN ON CAMERA AND MICROPHONE,
I'D LIKE TO SPEAK — and GO LIVE, whose own tooltip says *"Nothing reaches
the wire until you press TAKE LIVE."* It wore the transmission colour two
feet from the button that transmits while its copy explained that it does
not.

Those are the loudest control on their surface and they should look it, so
there is a fourth weight — `.ctl.is-key` — and the four are now:

| weight | what it means | how it looks |
| --- | --- | --- |
| `.ctl` | the forty ordinary ones | quiet face, seam border |
| `.ctl.is-on` | this one is engaged | lit face, accent edge |
| `.ctl.is-key` | the action this surface exists for | lit face, accent edge, bold uppercase legend |
| `.ctl.is-critical` | on air, or recording | saturated fill |

**`is-key` differs from `is-critical` by material, not by hue**, which is
the part that matters. #c8382c and #3f8ee8 are 1.54:1 apart in luminance —
to anybody who does not separate red from blue they are the same tone, so
hue alone would be no distinction at all. One is a fill; the other is a
dark face with a lit edge. Two kinds of object before two colours. [U-19]

The same argument fixed three other places in the same pass where red
asserted something untrue: the multi-view tally claiming three sources on
air when one was, the playhead flag reading ON AIR over a dead schedule,
and Graphics counted as a source when it is an overlay. A colour that
sometimes lies is not a signal, it is decoration that happens to be red.

---

## The eighth decision: a stranger is not an operator

The first fifty-odd commits went into the surfaces somebody **operates**.
The pages somebody is **sent** — three watch pages and the guest invite —
turned out to have been built at three different times and to agree on
nothing: one centred with a real transport, one flush left against a 960px
video in a 1440px window, one with the brand mark and two without.

- **The product's own transport, not the browser's.** Two viewer pages
  still shipped `<video controls>`. On a desk that is merely unpolished;
  on a published page its three-dot menu offers **Download** — an offer to
  take somebody's work, made by the page that publishes it.
- **Two transports, two clocks, on purpose.** Studio One's is a frame
  address because an editor cuts on frames [INV-02, U-08]. A viewer
  watches, so theirs is seconds; printing `00:00:12:14` at somebody
  watching a song is precision theatre. Everything they genuinely share is
  in `console.css`. A third is the signal to merge rather than to add.
- **The mark is on every page a stranger can land on.** Most of all the
  guest invite, which had no identity anywhere: a link from a colleague,
  and a box asking for your name. That is the shape of a phishing page and
  the one place a stranger has no prior context. A trust decision, not a
  cosmetic one.
- **A page may have one call to action.** Playing is ordinary, frequent
  and reversible and takes a control; "Respond to this" is the premise of
  the product [U-04] and stays loud.

**And the label follows the fact.** A viewer arriving at an off-air channel
read `This channel is not transmitting right now` immediately above
`NOW PLAYING / Station Ident / 06:25 left`. Both true of different things —
`title` is what the schedule says, `transmitting` is whether a segment is
arriving — which is exactly why printing them together is a lie. It is the
seventh decision again, one layer out: a surface may not assert what the
state underneath does not support.

---

## The ninth decision: a studio sold on its own works on its own

The three studios are separable products. A capability one of them promises
must therefore be reachable from inside it, and Online TV's guests were not.

The brief says a broadcaster "can bring people into the room", and everything
needed for that existed: the invite panel, the join route, the guest session,
the staging model, the speaker detection. What did not exist was a door. A
channel's `roomId` named **a conversation's** room, by a decision recorded in
`channel.ts`:

> a channel going live names the conversation whose room it is coming out of
> rather than growing a second room of its own — a second room would be a
> second place invitations, staging and speaker detection could disagree.

The reasoning is right. The conclusion was one word too wide. What must not be
duplicated is the room's **machinery**; which document holds the record is a
different question, and answering it "a conversation, always" meant an account
with only Online TV met this, and nothing else:

> No conversations yet. Start one in Studio One and its room becomes available
> here.

That is an instruction to buy a second studio, written in the shape of a next
step.

So `RoomHost` — `{ id, participants?, room? }` — is what the room's functions
take, and a Channel is one. Nothing in `roomEdit`, `callerFor` or `roomView`
ever wanted more than those fields; a Conversation satisfies it by being one.
There is still exactly one invite panel, one join route, one staging model.
"A channel does not grow a room of its own" became "a channel does not grow a
room **implementation** of its own", which was always the part that mattered.

Three consequences worth writing down:

- **One discriminator, read in three layers.** The store opens a file by it,
  the routes live at `/api/conversations/…` or `/api/channels/…` because of
  it, and the browser builds those paths from it. `roomHostKind` is the single
  place that reads the `conv_`/`chan_` prefix `newId` has always minted. Three
  copies would be three chances to send a guest to a path the policy never
  admitted them to, and the one that drifted would be whichever nobody tested.
- **The route table is also the security policy.** `policy.ts` decides what a
  caller without the owner's session may reach by matching paths, so
  `/api/conversations/chan_…/room` would have been a rule nobody could audit.
  The channel's six room routes are one-line re-exports of the conversation
  ones — the same handlers, at an honest path — and the six policy entries are
  written out rather than merged into a `conversations|channels` alternation,
  because a boundary should have to be widened on purpose.
- **A type-level claim needs a type-level test.** "A Channel is a RoomHost"
  survived deleting `room?: Room` from `Channel`: `openRoom` writes the
  property regardless and vitest strips types rather than checking them. Every
  runtime assertion went green. What caught it was one annotation —
  `const channel: RoomHost = live();` — and `tsc --noEmit`.

---

## The tenth decision: the whole studio is one piece of equipment

Studio Two's editor is built from `.module` — a take rail, a multiview, a
composition rail, a timeline — and reads as software. Everything below it was
built from `<section>` and `<h2>`, and read as a web page bolted to the
bottom of one:

```
SOUND        [ card ] [ card ] [ card ]
▸ One section at a time
MAKE THE VIDEO   [16:9] [9:16] [1:1] [4:5]
00:01.248 of the song has nothing on screen…
SHARE IT     The middle of it · Make a vertical clip
             01:47.875 · ready · Download
             [ Make the link preview ]  [ card image ]
             [ Publish it ]
make the master video first — there is nothing to publish yet
▸ Set up
```

Seven headings, no structure, and nothing saying which of them belonged to
the same act. They belong to three, and always did:

| act | what it is |
| --- | --- |
| **Master** | make the one file everything else comes from |
| **Deliver** | versions of it, and clips cut out of it |
| **Publish** | a page to send people |

The controls inside are the same controls. `SoundModes`, the four export
profiles, the render jobs, the clip candidates, the link-preview card and the
publication were all already written and are all still the same code. What
changed is which of them stand together, what each is called, and what the
thing they stand in is made of. **No capability was added to fix a layout
problem.** [D-19]

Four things fell out of it that are worth keeping:

- **Sound is a property of the master, not a stage of the work.** It sat
  between the timeline and the render button as though choosing where the
  sound comes from were its own act. It is a setting on the file being made,
  so it lives in the module that makes one — one line with a bank of three
  positions, not a heading over three cards.
- **A delivery list is a table of states.** Four identical buttons, one of
  them selected somewhere else on the page, could not answer the question an
  author actually has: which of these exist? Each shape is now a row saying
  what it is, whether it exists, and what can be done about that. The master
  is not in the list, because the master is not a version of itself.
- **A thing not yet done is a state, not a failure.** `make the master video
  first — there is nothing to publish yet` was drawn in `--bad`, the colour
  this product uses for something having gone wrong. Nothing has: a
  performance that has not been mastered is the ordinary condition of every
  performance for most of its life. It is a lamp that is not lit.
- **Three columns, not three stacked panels.** Three acts in order read left
  to right on a desk, the same reason the stage strip is a row. Stacked, each
  is as wide as the page and as short as its contents — which is how a 300px
  card ended up with a 300px column of empty dark beside it. `align-items:
  start`, because a module stretched to match its tallest neighbour is air
  inside a border, which is the thing being fixed.
- **The master is watchable where it is made.** The one file this studio
  exists to produce, and the only way to see it was to download it. Same
  `<video>`, same transport, same square-cornered bed as every other picture.
- **Where it goes names somewhere for everyone.** A studio sold on its own has
  no channel, so a destinations list holding only channels said nothing to
  most of the people reading it. Each platform row says the shape it wants,
  whether that cut exists, and hands over the file. **There is no Connect
  button**: nothing in this product uploads anywhere, every one of those
  platforms needs an app review first (`PLATFORMS` records which and why), and
  a control promising a connection nobody built is the only thing worse than
  the row's absence. What the product can do — make the cut each place wants
  — is what each row offers.
- **One verb for one act, and it is not "make".** `Make it`, `Make it again`,
  `Make an audio file`, `Make the cut`, `not made` — five controls in the room
  where a video is finished, all built on the verb a child uses for a
  sandcastle, in a product whose own domain layer has said `render` and
  `export` since it was written. The screen was less precise than the code
  driving it, which is the wrong way round and is most of what reads as a
  prototype. `Create` / `Not created` / `Ready` runs through the master, the
  versions, the clips, the card and the page, **and through the prose**: a
  button saying CREATE MASTER VIDEO over a sentence saying "make one above"
  is teaching two words for one thing. One verb is worth more than the best
  verb — Render here, Export there and Make somewhere else would be three
  vocabularies for one act. Plain speech stays wherever the product explains
  a **choice** rather than naming an operation: "The song, and whoever is on
  screen" is a decision described in the words of making it, and is not what
  this rule is about.
- **Perform → Compose → Master → Deliver is a readout, not a wizard.**
  Nothing gates anything; every stage stays reachable at every moment (U-04).
  `stagesOf` lives in the domain because "is this performance composed" is a
  fact about a performance, and it is derived on every render so it cannot
  say something the document does not. It also goes **backwards**: cut a hole
  into a mastered performance and the readout says Compose again. "The
  furthest stage reached" is the tempting reading and describes the past.

And composing is not "there are scenes" but "there are scenes a renderer
would accept" — the same `renderProblems` the console and the invariant ask,
rather than a third opinion about the same thing.

---

## What the tests kept getting wrong

Worth its own section, because it keeps happening the same way. A rule gets
written against the instances in front of it rather than against the thing it
is describing, and then walks straight past the next instance:

| rule | was scoped to | is now |
| --- | --- | --- |
| no card rounding | five desk files | every studio file |
| one plate on a picture | a list of known near-blacks | any near-black used as a background |
| no bold-literal titles | `<strong className="grow">` | any `<strong>` that **is** its line |
| no hand-written sizes | the three studio routes | the whole application |
| a screen has square corners | radii ≥ 8, written as digits, in three route folders | any radius above `--radius-screen`, token or digit, anywhere in `app/` |
| why a render is refused | decided twice — properly in the invariant, worse in the console | `renderProblems`, asked by both |
| red is for on air and for recording | `is-critical` anywhere near a testid | `.ctl` and `is-critical` in one class expression |
| one transport for viewers | the exact list of files that used it | the count of files that DEFINE one |
| one verb, and it is not "make" | `>Text<` only, then labels under 60 chars | every string, to 200, so the prose is checked too |

Each widening found more: nine corners, five near-blacks, five titles,
fourteen sizes — and, the fifth time, twenty-two rounded pictures on six
surfaces where a passing test had said there were none.

**Write the rule against the property, not against the examples.** When a
widened rule fires on something correct, that is information about the rule:
widening the title ban flagged `Press <strong>GO LIVE</strong> — that arms
the feed`, which is emphasis inside a sentence and exactly what the tag is
for, and the discriminator turned out to be neither the class nor the tag but
whether the `<strong>` **is** the line or sits in one. Widening the picture
ban flagged a blurred poster at `inset: -40` behind a setup card, which has
no corners anybody can see; the tell is the blur, because a picture being
judged is never blurred.

Three more ways to be wrong, all found in the fifth round:

- **A rule that reads colours by their digits dies when the colours get
  names.** The discriminator for "is this a picture" was `#000|#08090b`. The
  commit that named those `--screen-bed` made the test blinder while looking
  like housekeeping. A rule and the code it polices should not be coupled
  through a literal.
- **`\{[^{}]*\}` is not a block.** Any style object containing a conditional
  spread or a `${…}` has a brace inside it, so a character class stops early
  and the element is skipped — precisely the elaborate elements, which are
  the ones somebody fiddled with. Match braces by counting depth.
- **A style object closes before its children.** A well whose picture arrives
  from `<Still>` or `<Thumb>` has no `objectFit` and no `aspectRatio` of its
  own; the signal is outside the block. The first attempt at that signal was
  written inside the pattern where it could never fire, and read correctly to
  a human. Only the mutation found it.

Which is the standing rule underneath all of this: **an assertion nobody has
seen fail is not known to work.** Every new assertion in this batch was run
against a deliberately broken tree before being trusted.

**And the browser sees what the source cannot.** Nine of the twenty-two
pictures were at `borderRadius: 0` themselves, rounded by a parent that clips
them — a fact no single file contains. Measuring the running product also
supplies the discriminator that reading cannot: a frame's corner rounds its
picture only when the frame clips with no padding between, so a `.panel` at
10px with 10px of padding rounds nothing and is correctly left alone.

**A loud failure is not a remembered one.** `performance.ts` opens by saying
that importing `newId` drags `node:crypto` into the client bundle and that
"this codebase has learned that once already". It has now learned it twice,
because a broken build gets fixed and forgotten rather than written down.
`console.test.ts` names the server-only modules now.

---

## Where things live

```
app/styles/tokens.css      the neutral ramp and the five surfaces
app/styles/type.css        the type scale
app/styles/space.css       spacing, radius, border widths
app/styles/focus.css       :focus-visible, the skip link
app/styles/motion.css      durations, curves, reduced-motion
app/styles/controls.css    buttons and fields
app/styles/elevation.css   the four levels and the well
app/styles/status.css      on air / armed / off, and the accent
app/styles/studios.css     which of the three rooms a thing belongs to
app/styles/surfaces.css    scrollbars, selection, empty slots, breakpoints
app/styles/console.css     the material the three studios are made of
app/styles/building.css    the lit ground the lobby is made of
app/styles/platforms.css   the five distribution destinations
app/Icon.tsx               one set of glyphs, on one grid
app/Brand.tsx              the mark, in one place rather than four
app/VideoTransport.tsx     a viewer's transport — seconds, not frames
app/Confirm.tsx            asking before something irreversible
app/Notice.tsx             saying something went wrong, out loud
```

Two tokens in `console.css` carry the eighth decision:
`--radius-screen` (2px, on anything that is a picture) and
`--screen-bed` (true black, what a picture sits on — seven different
blacks were doing that job, and a video letterboxing inside its own
frame showed the seam between them). `--screen-bed` is also what the
renderer pads with: `compose.ts` uses `color=black`, so a composition
preview on any other value is a preview of a different file.

---

## The ratchet

76 raw hex colours remain in components. The token system arrived after the
product did, and surfaces are converted as each is worked on.

It read 244 until the regex was corrected: `&#9654;` is a play triangle, and
a pattern looking for `#` followed by hex digits finds `9654` inside it very
happily. Thirty of the counted colours were glyphs. A budget inflated by a
tenth is a budget with a tenth of a free pass in it.

Most of what came out after that was one idea written many times: a sixth
blue for "this one is chosen", in fifteen borders and eight fills, beside a
selection wash written thirteen times at four strengths. A design system is
mostly this — not new values, but finding that a hundred lines were all
trying to say the same thing.

Four tests hold the sixth and seventh decisions: `console.test.ts` for the
material (the module, the legend, the plate, the radii, the bank, the ring
slot, and what red is allowed to mean), `contrast.test.ts` for every tone
including the ones that sit on a wash over a face, `design-system.test.ts`
for the glass and glow bans and this budget, and `menus.test.ts` for the
one context menu.

`design-system.test.ts` holds that number as a budget. **Lower it when you
convert a surface; never raise it.** If it fails on a new feature the fix is
a token, not a bigger number.

A ratchet is an uncomfortable kind of test and the honest one here: it says
where we are, which direction we are going, and that you may not go backwards
without noticing.

---

## What is deliberately not done

- **No phone layout.** There is a floor for laptops and `pointer: coarse`
  gets larger targets, but a broadcast desk is operated at a desk. Pretending
  otherwise would mean six unusable panels.
- **No light theme** in the application. The published article and
  interactive player have one, and declare the speaker identities darkened
  for white; the studios do not.
- **The remaining 76.** They are not wrong, they are just not yet named.
