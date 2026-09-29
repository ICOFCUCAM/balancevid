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
  rectangle that is a picture — both monitors, the stage, the camera PiP,
  and the two pages a viewer sees. 10px on a video is the shape of a card
  in a feed, on the one surface where that association is worst.
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
app/Confirm.tsx            asking before something irreversible
app/Notice.tsx             saying something went wrong, out loud
```

---

## The ratchet

120 raw hex colours remain in components. The token system arrived after the
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
- **The remaining 120.** They are not wrong, they are just not yet named.
