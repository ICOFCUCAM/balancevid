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

## The eighth decision: the three rooms are photographed

The brief, from the author, on the home page's three studio cards:

> **1. Studio One — Conversation Studio.** Yes — but it should be a
> documentary-style conversation image. It should feel editorial, not like a
> generic corporate stock photo.
>
> **2. Studio Two — Performance Studio.** This one should definitely have an
> image. A real performance image — singer/musician, rehearsal, multiple
> camera angles, studio performance. This is probably the easiest card to
> make visually distinctive.
>
> **3. Online TV.** Yes, but an image that communicates broadcasting, rather
> than another person sitting at a desk. And keep it subtle because Online TV
> already has the green identity.
>
> **4. Distribution.** I would NOT put a photograph here. Distribution is a
> systems concept, not a human activity. That is better represented by the
> platform marks and connection states you already have.
>
> The important part: don't make the three images compete. The photograph
> should occupy roughly the upper 40–45% of the card, but with a restrained
> treatment — possibly a very subtle dark gradient toward the bottom so the
> transition into the white content area feels intentional.
>
> And I would avoid: AI-generated futuristic studios, glowing screens,
> people posing artificially for SaaS advertising, excessive gradients,
> giant icons over photographs, three unrelated photographic styles,
> overly saturated images.
>
> One other change I'd make: the tiny icon in the upper-left of each image
> can probably go.

### What was there, and why it went

The band was not empty before this. It held **a frame from the newest thing
made in that room**, over the room's colour when there was nothing yet, and
the comment beside it argued — correctly — that a photograph of a studio the
person has never been in says nothing.

That argument is right about stock photography and wrong about this card,
and the reason is the row rather than the card. Three cards stand side by
side. A poster frame in one beside a poster frame in another is two
arbitrary crops of two unrelated videos: the author's own "three unrelated
photographic styles", arrived at by accident instead of by choosing badly.
What the row is *for* is telling somebody which of three rooms to walk into,
and it cannot do that with art that changes every time somebody records
something.

So the band carries **the room**, and the person's own work keeps the place
it already had in `RecentWork` below — where a poster frame is legible at
size instead of cropped into a strip.

### The treatment

Each card is built in three layers, and each layer answers one line of the
brief.

| Layer | What it is | Which line it answers |
| --- | --- | --- |
| The photograph | `object-fit: cover`, per-room `object-position` | the three images |
| The room's veil | `--studio-{one,two,tv}-veil`, already defined | "don't make the three images compete" |
| The fade | `--art-fade` at the foot, from 52% down | "the transition… feels intentional" |

The veil is the interesting one, because it already existed. `studios.css`
had defined it a year earlier as *"the veil behind a studio card's
artwork"* — three room colours at one strength — and it turns out to be
exactly the instrument the author's "don't compete" asks for: three
photographs shot in three places under three lights, each pulled a little
towards the colour of the room it stands for. Nothing new had to be
invented; the system had already named it. [D-19]

**The proportion is 41%.** Measured in a browser at 1600px and at phone
width: a 132px band against a 320px card. The brief said 40–45%; the number
is held by nothing but this measurement, because a proportion enforced by a
test would be a test of two font metrics.

**The upper-left badge is gone.** It put the room's glyph in a dark disc
over the corner of every card — a second name for a room whose name is
printed two lines below it, and on a photograph rather than a flat wash it
read as a sticker. The glyph is still on the rail and in every row that
mentions the studio, so the non-colour cue U-19 requires is untouched.
`room-art.test.ts` holds both halves: not over the art, still in the table.

**Distribution has no photograph,** as asked, and needed no change: it was
already platform marks and connection states.

### What ships, and what does not

The three masters arrived as 1671×941 PNGs in `public/` — six megabytes that
every deploy would carry and anybody could fetch to look at a thumbnail.
They now live in `art/`, which is not served, and `scripts/room-art.mjs`
cuts them to 1400px WebP in `public/rooms/`: **253 kB for all three**, wide
enough for the widest card at 3×.

The masters stay in the repository. A derivative whose master is gone cannot
be re-cut at another size, and the script is the only thing that turns one
into the other — the same rule `take-icons.mjs` follows for the Take App's
icons. `room-art.test.ts` holds all of it: each file present, each under
150 kB, each master kept, no master served.

---

## The ninth decision: three rooms, one frame

The brief, from the author, after Studio One got a door and the other two
did not:

> PR #30 completes the Studio One intake side, but it also exposes the next
> structural inconsistency: BalanceVid now has three production rooms, while
> only one has a true room entrance.
>
> The important phrase in the report is: *"Studio Two and Online TV still
> unfold their intake in the hallway."* That means the Home cards are
> currently promising three rooms, but only one actually behaves like a
> room. I would fix that before adding more features.
>
> ```
> ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
> │   STUDIO ONE     │   │   STUDIO TWO     │   │    ONLINE TV     │
> │   Enter Studio   │   │   Enter Studio   │   │   Open Control   │
> └──────────────────┘   └──────────────────┘   └──────────────────┘
> ```
>
> Each card should lead to an actual dedicated environment rather than
> opening a particular task/intake state.
>
> **And the three rooms should have different identities.** They shouldn't
> merely be three copies of the same shell.
>
> - **Studio One** — `SOURCE → RESPONSE`. Conversation, commentary,
>   imported media, camera/screen capture, response production.
> - **Studio Two** — `TAKES → TIMELINE → MASTER`. Performance, multicamera
>   takes, song clock, editing and composition.
> - **Online TV** — `PROGRAMME → PLAYOUT → LIVE`. Schedule, programme
>   assembly, playout, live output, distribution.
>
> The common BalanceVid shell can remain shared, but each room should
> immediately communicate what kind of production is happening there.
>
> The next change should not be another dashboard redesign.
>
> And that is where I would inspect the existing Studio Two and Online TV
> implementations before writing any new code, exactly following the
> pattern that produced today's discoveries. The goal should be to
> determine: **what already exists behind each hallway entrance, and what
> is actually missing to make it a proper room?** That inspection could
> reveal, just as the Take investigation did, that some of the apparent
> gaps are already implemented and only need routing/navigation/UI
> composition rather than new systems.

### The inspection, before any code

It did reveal that, four times.

**Online TV's room front page was already written — on the home page.**
`Hero` and `Distribution` in `Workspace.tsx` are 248 lines that show a
channel's on-air state through `whatIsOn` — the same function the playout
engine reads — with what is playing, the next programme, today's count, the
size of the loop, and every destination with its connection state. None of
it is about the home page. All of it is about a control room.

**Both rooms' lists were already written, in `app/page.tsx`.** The poster
from the first *usable* take, the take count, the master's length, the
scheduled count, the timezone, whether a channel is live. The gathering was
never the missing part.

**The two intakes were already small and already existed.** `StartPerformance`
is 141 lines and `StartChannel` is 80. They needed a room, exactly as
`StartConversation` did.

**And the entitlement rules had the same hole `/c` had.** `^/p/` and `^/t/`
both carry a trailing slash, so neither covered the room itself — invisible
while the rooms did not exist, and live the moment they did.

So the work was routing, navigation and composition, as the author
predicted. The one genuinely new thing is the shared frame.

### One frame, three identities

`src/domain/rooms.ts` is the whole of the difference: a name, three or two
stage words, a sentence, and what the way in is called. `app/Room.tsx` reads
it and is identical for all three.

| | Stages | Way in |
| --- | --- | --- |
| Studio One | `SOURCE → RESPONSE` | Enter Studio |
| Studio Two | `TAKES → TIMELINE → MASTER` | Enter Studio |
| Online TV | `PROGRAMME → PLAYOUT → LIVE` | Open Control |

**"Open Control" is not a synonym.** A studio is somewhere you go to make
something; a control room is already running whether or not anybody is
standing in it. That is why the third room's list is not a list of recent
work but a list of what each channel is doing *right now*, and why it
distinguishes all five answers `whatIsOn` can give — a scheduled programme,
the loop, a live feed, an emergency cut-away, the backup. A control room
that flattened those to "ON AIR" would be hiding the two that mean
something has gone wrong.

**The arrows are drawn, not typed,** for the reason `StudioCard` already
gave about its own: `→` is a different length, weight and baseline in every
font.

### What stopped being written four times

The room's name was in four places: `account.ts` (as the thing that is
sold), the `STUDIOS` table in `Workspace.tsx` (as the card), a string
literal in the rail, and — briefly — `rooms.ts`. `rooms.ts` now *derives*
the eyebrow from the entitlement's own label, so the name a customer buys
and the name on the door cannot drift, and the rail reads the room like
everything else. `rooms.test.ts` asserts it.

`SAID` is a `Record<StudioId, …>` rather than a list, so a fourth studio
added to the account model **does not compile** until somebody has said what
kind of production happens in it. That is a better guard than a test: it
fails when the studio is invented, not the first time somebody opens a page.

### The hallway now holds nothing

`Workspace` took a `starters` prop with three forms in it and unfolded them
inside the cards. That is what made the cards promise rooms they were not:
pressing one filled in a form where you stood. The prop is gone, the
expander state is gone, and every quick action navigates — two of the five
used to open a form on the page instead, which is the same fault in a
smaller control.

The hero stays. Being told you are on air is not something to have to
navigate to, and *"the next change should not be another dashboard
redesign."*

### Three faults the browser found

1. **Broken-image glyphs down the whole performance list.** `RoomList` had
   written its own `<img>`, reintroducing the exact fault `Still` was
   written to prevent — two hundred lines from the fix. `Still` is
   `app/Still.tsx` now and both use it.
2. **A column of empty wells in the control room.** A channel has no poster
   and never will; it is a schedule, not a thing with a first frame. Where
   nothing in a list has a picture the column goes.
3. **A sentence about a question that was not on screen.** "4 answers, and
   the honest one is the useful one" is about the rights question, and it
   printed whether or not that question was showing — easy to miss folded
   inside a dashboard card, and the first thing in Studio Two.

And the design system caught a fourth before the browser did: the poster
well carried `--radius-sm`, a card's corner on a monitor. `console.test.ts`
has held that distinction since the console was built.

### A rule the type-checker does not enforce

A JSX comment cannot be the first child of a `&&`:

```jsx
{ready && (
  {/* why */}      // not valid JSX: this is an object literal
  <p />
)}
```

This broke the build three times in two days, and every time it cost a full
production build to find — `tsc --noEmit` accepts it and only swc rejects
it, so the fast check passes and the slow one fails thirty-five seconds
later. `design-system.test.ts` now refuses the shape in a millisecond, and
tests its own pattern, because a regex that matches nothing passes an
"assert no offenders" test for ever.

---

## The tenth decision: the building works on a phone, the studios do not

*"No phone layout"* was in this file for a year, under **What is
deliberately not done**, with a reason that is still correct: a control
room narrowed proportionally is six unusable panels, and a broadcast desk
is operated at a desk.

That reason is about the **studios**. It was applied to the whole product,
and the part of the product it was never true of is the part everybody
meets first — the way in, the three doors, and what you have already made.
None of that is a desk surface. The Take App has been a phone surface since
it shipped, and the three room pages were written as one column with a max
width and needed nothing.

So the line moves to where the argument actually falls: **the building is
responsive, the studios are not.** `layout.test.ts` holds that boundary by
name, so widening it is a decision somebody has to take rather than a file
somebody edits.

### What was actually wrong

Not "it looked cramped". A measurement at 412px found that the home page
**did not scroll horizontally** and the account menu, the runtime pill and
half the recent-work table were outside the viewport anyway: the building
is `height: 100dvh; overflow: hidden` around a two-column grid. Content
that is small is a compromise. Content you cannot reach is missing.

The three rooms measured clean at the same width — no overflow, no
horizontal scroll — which is what kept this change small.

### The cause, four times over

The breakpoints existed. They could not reach the layout, because the
layout was **inline**:

| What | Was | Now |
| --- | --- | --- |
| The building's two columns | `gridTemplateColumns` inline | `.building` |
| The hero's two columns | `gridTemplateColumns` inline | `.hero-grid` |
| The rail's direction | `flexDirection: 'column'` inline | `.building-rail` |
| A destination's second line | `display: 'block'` inline | `.rail-under` |
| A room row's columns | a **variable**, inline | `.room-row` |

Each time the rule was written, the build passed, and nothing happened.
That is the worst shape a bug can take, because it reads as though the rule
is wrong rather than unreachable — and the third one was not even visibly
wrong: with `flex-direction: column` still winning, the nav's box was 121px
tall with eight links laid out down to 421px, so every link below the first
sat **outside its own nav and behind the page**. A hit test found
`building-body` at the centre of "Studio Two". Present, measurable, and not
clickable.

`--rail-width` was the same illness in the other direction: set under a
breakpoint since the breakpoints were written, **read by nothing**, while
the width that shipped was a literal two files away. And the rule it was
set by said 240px against a rail that was 236px — so had anything read it,
it would have made the rail *wider* below 1280, the opposite of the comment
above it. Wiring a dead token means choosing what it was always trying to
do; it is 216px now.

**The rule this leaves:** an inline grid must be one that needs no help.
`repeat(auto-fit, minmax(…))` reflows by itself and is fine inline. A fixed
column pair is not, and belongs in `surfaces.css`. `layout.test.ts` enforces
it across the building — and matches a variable as well as a literal,
because the first version of that rule sweeping only string literals
declared the building clean while leaving the one grid that was still
broken.

### What a phone gets

| At | What changes |
| --- | --- |
| ≤1280px | the rail narrows to 216px — the rule that was always there, now wired |
| ≤1000px | the destinations and quick actions stop being *beside* the work and go under it |
| ≤760px | one column; the page scrolls instead of a box inside it; the rail's links become a strip that scrolls sideways |

At ≤760 the rail keeps every destination rather than hiding behind a
drawer — a drawer is a component, a state and a focus trap, and a row of
the same links scrolled sideways is none of those. The storage meter, the
second line of each destination, the runtime pill and three of the six
recent-work columns go, because each is either ambient or one tap away on
the thing itself. Turning the *nav* into the strip was the first attempt
and it put the wordmark, the links and the storage meter side by side; the
links are the strip, and the wordmark sits above them.

Measured at 1500, 1200, 980, 800, 760, 600, 412 and 360: no horizontal
scroll and nothing outside the viewport at any of them, and the desk is
byte-for-byte what it was — rail 236px, hero 232+654, body 888+306, six
table columns, the pill and the meter both showing.

### One thing the stacking broke, and it was not a width

`edit-identity` is `position: absolute; bottom: 12` on the hero — which is
the same thing as "on the artwork" only while the hero is one row 148px
tall. Stacked, it landed on top of **Open Online TV**: a link over a
button, both clickable, neither obviously the one you meant. It is inside
the artwork now, in both layouts, with the decorative layers keeping their
`aria-hidden` and the link not inheriting it.

---

## The eleventh decision: a link that goes nowhere is worse than no link

*Found by the author, who pressed something in the new front doors and
asked why the page was not found.*

The three room entrances introduced six fragment links, and **five of them
pointed at an element that did not exist**:

| link | where | landed on |
|---|---|---|
| `GO LIVE` | the Online TV front door | `#live` — nothing |
| `SCHEDULE`, `View schedule →` | the Online TV front door | `#schedules` — nothing |
| `Manage distribution →` | the Online TV front door | `#distribution` — nothing |
| `Channels` | the building rail | `#channels` — nothing |
| `Distribution` | the building rail | `#distribution` — nothing |
| `Edit identity` | the home page hero | `#identity` — nothing |

Only `#library` had a target.

**Nothing caught it because nothing was broken.** Every route returned
200, every test passed, the build was clean, and the product was quietly
teaching people that five of its buttons do not work. A browser does not
complain about a fragment it cannot find; it loads the page and ignores
it. A crawl of every route confirmed the pages themselves are all fine —
the only 404s in the whole product are the missing take posters, which is
a data gap the acceptance audit had already named.

**A scroll target was not enough.** This is a console: every panel is
already on screen, so scrolling to one is a no-op and the link would still
look dead. What each fragment NAMES is a thing to do, so that is what it
does — `#live` brings the camera desk up, `#identity` the graphics desk,
`#distribution` opens the stream-output drawer, `#schedules` puts the
schedule in view.

**Two things the browser then corrected.**

* One `setTimeout` after paint was not enough. `#distribution` is a
  disclosure that is not in the tree until the channel has loaded, so the
  effect found nothing and the drawer stayed shut — the same silent
  nothing the missing ids produced. It looks for two seconds and then
  gives up.
* A mount-only effect is wrong. Going from `#identity` to `#live` on a
  page that is already open changes no document, so React never remounts
  — and the graphics desk stayed up while the address bar said `#live`.
  `hashchange` is a navigation and is honoured; every render is not.

**And it is a rule now.** `test/domain/links.test.ts` collects every
fragment this product navigates to — in all three shapes the codebase
writes them — and every `id` it offers, and fails when one has no target.
Removing a single `id` was checked to make it fail.

---

## The twelfth decision: an installation says which build it is

*"Could it be telling us that features written might not even be
deployed?"*

It could, and the product could not answer. `package.json` has said
`0.1.0` through every release, no page said what it was built from, and
the only way to tell one build from another was to request a file that
exists in the newer one and watch for a 404.

`/api/version` answers it in one request, and Settings shows it in a row
beside the version that never changes.

**Read from the process, never baked in.** A constant compiled into the
bundle is the commit the *image* was built from, and a container can be
restarted, rolled back or promoted without that changing — which is the
same class of mistake as a stale build, told confidently. The deploy
platform sets `DEPLOYPRO_GIT_SHA` and three companions in the container;
they are read on each request, behind `force-dynamic`.

**It degrades to honesty.** An installation started by hand has none of
them set and says **Unknown**, not a version it made up. A version
somebody cannot trust is worse than none, because it is precisely the
thing they would check before concluding a deploy had not happened.

**Public, like the health check, and for the same shape of reason.** A
stranger gets the commit and nothing else. A hash is opaque — it reveals
no code — and it is the one fact the route exists to give, so requiring a
session would defeat it from a phone or a deploy probe. Which deployment,
which environment and where it thinks it is are operational detail, and
`health/route.ts` already records why detail is owner-only.

**No deploy automation was added, deliberately.** This repository's CI
builds and tests and nothing else, and that is correct here: the deploy
platform watches the repository through its own GitHub App. A workflow
that also deployed would put a second copy in the air and fight it.

---

## What is deliberately not done

- **No phone layout — for the STUDIOS.** A broadcast desk is operated at a
  desk, and a control room narrowed proportionally is six unusable panels.
  That still holds and nothing about the deep studios has changed.
  **The building is a different question**, and it was answered on the wrong
  side of this line for a year — see "the tenth decision" above.
- **No light theme** in the application. The published article and
  interactive player have one, and declare the speaker identities darkened
  for white; the studios do not.
- **The remaining 76.** They are not wrong, they are just not yet named.
