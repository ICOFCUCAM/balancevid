/**
 * The furniture, drawn rather than typed.  [Doctrine D-04]
 *
 * The building used single characters from the Unicode miscellaneous
 * blocks — ▣ ♪ ◉ ☰ ⌫ ⌦ — because they cost nothing and needed no files.
 * They are also whatever font happens to be installed: ◉ is a different
 * weight on every platform, several render as emoji on macOS, and none of
 * them line up with each other on a baseline. A rail of eight of them is
 * eight different optical sizes pretending to be a set.
 *
 * These are one set: same 24-unit grid, same 1.6 stroke, same round caps,
 * drawn to sit on the same optical centre. They inherit `currentColor`, so
 * a rail row that is dim and a rail row that is chosen are the same icon
 * at two tones rather than two icons.
 *
 * WHY NOT AN ICON LIBRARY. Twelve glyphs is not a dependency: the whole
 * set below is smaller than the import statement's share of the bundle,
 * it has no versioning story to get wrong, and nothing here will ever be
 * deprecated by somebody else's redesign. [D-14]
 */

export type IconName =
  | 'home' | 'conversation' | 'music' | 'broadcast' | 'library'
  | 'channels' | 'distribution' | 'settings' | 'search' | 'bell'
  | 'disk' | 'clock' | 'calendar' | 'play' | 'plus' | 'chevron'
  | 'arrow' | 'upload' | 'link' | 'live' | 'pencil' | 'sun' | 'moon'
  | 'sound' | 'muted' | 'expand' | 'faders' | 'list' | 'mic'
  | 'stop' | 'next' | 'start' | 'loop' | 'warning' | 'graphics' | 'pause'
  | 'passed';

/* Each is the inner geometry; the frame and the stroke are set below. */
const PATHS: Record<IconName, React.ReactNode> = {
  home: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z" />,
  conversation: (
    <>
      <path d="M4 6a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-5 4z" />
      <path d="M19 9h1a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1" opacity="0.5" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V6l11-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </>
  ),
  broadcast: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M8 21h8" opacity="0.5" />
      <path d="m10.5 10.5 4 2.2-4 2.2z" />
    </>
  ),
  /*
   * A LIST OF THINGS, as against `library`, which is a collection laid
   * out. The application bar offers both — Conversations and Library
   * are two anchors into two lists — and giving Conversations the
   * speech bubble that Studio One already wears would have put the
   * same mark on two different destinations one tab apart. Rows with a
   * leading rule read as a list at 14px, where a stack of bubbles
   * reads as a smudge.
   */
  list: (
    <>
      <path d="M4 6.5h16M4 12h16M4 17.5h11" />
      <path d="M4 6.5v11" opacity="0.45" />
    </>
  ),
  library: (
    <>
      <rect x="3" y="4" width="7" height="16" rx="1.5" />
      <rect x="13" y="4" width="8" height="7" rx="1.5" />
      <rect x="13" y="13" width="8" height="7" rx="1.5" />
    </>
  ),
  channels: (
    <>
      <circle cx="12" cy="12" r="2.2" />
      <path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6" />
      <path d="M5.5 5.5a9.2 9.2 0 0 0 0 13M18.5 5.5a9.2 9.2 0 0 1 0 13"
            opacity="0.5" />
    </>
  ),
  distribution: (
    <>
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="18" cy="6.5" r="2.4" />
      <circle cx="18" cy="17.5" r="2.4" />
      <path d="m8.2 10.9 7.6-3.3M8.2 13.1l7.6 3.3" />
    </>
  ),
  /*
   * SETTINGS WAS A SUN.  [U-19]
   *
   * A circle with six radial ticks is a simplified gear at 40px and a
   * small sunburst at 14 — which is a problem in a set that also
   * contains `sun`, because `sun` is a circle with eight radial
   * ticks. Rendered side by side they are the same drawing at two
   * densities, and the lit building puts them on the SAME SCREEN: the
   * rail's Settings row, and the ground toggle that switches the lobby
   * between light and dark.
   *
   * Two horizontal tracks with knobs instead. Unmistakably a control
   * panel, and the horizontal counterpart to `faders`, which is the
   * vertical one — orientation carries the difference between "the
   * settings" and "the mixer", which is a distinction this product
   * actually needs to draw.
   */
  settings: (
    <>
      <path d="M4 7.5h16M4 16.5h16" />
      <circle cx="15" cy="7.5" r="2.6" />
      <circle cx="9" cy="16.5" r="2.6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10" />
      <path d="M10 19a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  disk: (
    <>
      <ellipse cx="12" cy="6.5" rx="7.5" ry="3" />
      <path d="M4.5 6.5v11c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-11" />
      <path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" opacity="0.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.6V12l3 1.8" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.8" y="5.4" width="16.4" height="14.6" rx="2" />
      <path d="M3.8 10h16.4M8.4 3.6v3.4M15.6 3.6v3.4" />
    </>
  ),
  play: <path d="M8.5 5.6 18.5 12l-10 6.4z" />,
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  /*
   * THE TRANSPORT, which is the row a person's hand rests on. It was
   * &#9632; &#9654; &#9654;&#9612; — the Unicode geometric shapes,
   * whose optical sizes do not match each other: the black square is
   * drawn to a different cap height from the black triangle in every
   * font, so a stop and a play side by side are two different weights
   * of mark. On the one bar in the product that is pressed most.
   */
  /*
   * SIZED AGAINST `play`, NOT AGAINST THE GRID. A square that occupies
   * the same 11 units as the triangle's bounding box READS smaller,
   * because a triangle is half the ink of its box and the eye
   * compares ink. Rendered side by side at 13, 15 and 40, 12.8 units
   * is the square that weighs what the triangle weighs.
   */
  stop: <rect x="5.6" y="5.6" width="12.8" height="12.8" rx="1.2" />,
  /*
   * Two bars on the same optical footprint as `stop` and `play`, so
   * a transport row does not change weight when it is pressed. It
   * was ❚❚ (U+275A twice) in Studio Two and two `borderLeft`/
   * `borderRight` declarations on an empty span in Studio One —
   * two spellings of the same eleven pixels.
   */
  pause: (
    <>
      <rect x="6.4" y="5.6" width="3.8" height="12.8" rx="1" />
      <rect x="13.8" y="5.6" width="3.8" height="12.8" rx="1" />
    </>
  ),
  next: (
    <>
      <path d="M6 5.6 15 12l-9 6.4z" />
      <rect x="16.4" y="5.6" width="2.4" height="12.8" rx="0.8" />
    </>
  ),
  /*
   * `next` MIRRORED, deliberately, because they are one pair: the bar
   * is the end you are going to and the triangle points at it. Drawn
   * rather than rotated in CSS so it keeps the same stroke weight.
   */
  start: (
    <>
      <rect x="5.2" y="5.6" width="2.4" height="12.8" rx="0.8" />
      <path d="M18 5.6 9 12l9 6.4z" />
    </>
  ),
  /*
   * ROUND FOR EVER, which is what a rotation entry does. ↻ renders as
   * a different weight on every platform and as an emoji on some.
   *
   * ONE arrow rather than two: the two-arrow version is the obvious
   * drawing and at 13px it is a grey knot. The single sweep with a
   * head reads as "round again" at every size in the product.
   */
  loop: (
    <>
      <path d="M19 12a7 7 0 1 1-2.6-5.4" />
      <path d="M16.6 2.4v4.6h-4.6" />
    </>
  ),
  /*
   * THE ONE THAT MUST NOT BE MISTAKEN. The emergency control read
   * "⚠ Emergency", and ⚠ is one of the characters that renders as a
   * full-colour emoji on macOS — a yellow-and-black road sign on the
   * most consequential button on the desk. [U-19]
   */
  warning: (
    <>
      <path d="M12 3.8 21.4 20H2.6z" />
      <path d="M12 10v4.4M12 17.2v.1" />
    </>
  ),
  /*
   * A CHECK THAT PASSED. It was ✓, which is a font's opinion — thin and
   * high in one family, a heavy ballot mark in another, and on some
   * Android builds a green emoji. Drawn, it is the same tick at every
   * size beside the same triangle. [U-19, D-04]
   */
  passed: <path d="M4.5 12.6 9.4 17.5 19.5 7" />,
  /*
   * A KEYER'S SOURCE: a frame with a plate laid into one corner,
   * which is what a bug or a lower third is. It was ◰.
   */
  graphics: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="1.5" />
      <path d="M6.5 15.2h8" strokeWidth={2.6} />
    </>
  ),
  chevron: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  arrow: <path d="M5 12h13m-5.5-5.5L18 12l-5.5 5.5" />,
  upload: (
    <>
      <path d="M12 16V4.8m-4.4 4.4L12 4.8l4.4 4.4" />
      <path d="M4.5 15.5v2.8a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.8" />
    </>
  ),
  link: (
    <>
      <path d="M10.2 13.8a3.6 3.6 0 0 0 5.2 0l2.8-2.8a3.7 3.7 0 0 0-5.2-5.2l-1.3 1.3" />
      <path d="M13.8 10.2a3.6 3.6 0 0 0-5.2 0l-2.8 2.8a3.7 3.7 0 0 0 5.2 5.2l1.3-1.3" />
    </>
  ),
  live: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M6.8 6.8a7.4 7.4 0 0 0 0 10.4M17.2 6.8a7.4 7.4 0 0 1 0 10.4" />
    </>
  ),
  /*
   * A MIXER IS FADERS. The control room's mixer toggle was ☰ — the
   * Unicode trigram for heaven, which is three horizontal lines, which
   * is a hamburger menu, which is what every reader takes it for. It
   * opens a bank of channel strips. Three vertical travels with caps
   * at different heights is the symbol for that, and it also says at a
   * glance that the thing is a mixer rather than a list.
   */
  faders: (
    <>
      <path d="M7 4v5.2M7 14.8V20M12 4v9.2M12 18.8V20M17 4v2.2M17 11.8V20" />
      <path d="M5.2 9.2h3.6v5.6H5.2zM10.2 13.2h3.6v5.6h-3.6zM15.2 6.2h3.6v5.6h-3.6z" />
    </>
  ),
  /*
   * A MICROPHONE, not 🎙. The re-record button carried the emoji, which
   * on macOS and Windows renders in FULL COLOUR — a studio-grey and
   * gold pictogram on a dark desk whose whole palette is four
   * neutrals and one accent. It is the only saturated object on the
   * surface and it is on a secondary button. [brief §2]
   *
   * `sound` is a speaker, which is the other end of the signal chain;
   * this is the end you talk into.
   */
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.8 11.4a6.2 6.2 0 0 0 12.4 0" />
      <path d="M12 17.6V21M8.6 21h6.8" />
    </>
  ),
  sound: (
    <>
      <path d="M4 9.5h3.2L12 5.4v13.2L7.2 14.5H4z" />
      <path d="M15.8 9.4a3.6 3.6 0 0 1 0 5.2M18.4 6.8a7.3 7.3 0 0 1 0 10.4" />
    </>
  ),
  muted: (
    <>
      <path d="M4 9.5h3.2L12 5.4v13.2L7.2 14.5H4z" />
      <path d="m16.2 9.8 4.4 4.4M20.6 9.8l-4.4 4.4" />
    </>
  ),
  expand: (
    <>
      <path d="M9.2 4.4H4.4v4.8M14.8 4.4h4.8v4.8" />
      <path d="M9.2 19.6H4.4v-4.8M14.8 19.6h4.8v-4.8" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.6v2.2M12 19.2v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
    </>
  ),
  moon: <path d="M20 13.4A8.2 8.2 0 0 1 10.6 4a8.4 8.4 0 1 0 9.4 9.4" />,
  pencil: (
    <>
      <path d="M4.8 19.2h3.4L19 8.4a2.4 2.4 0 0 0-3.4-3.4L4.8 15.8z" />
      <path d="M14.4 6.2 17.8 9.6" opacity="0.5" />
    </>
  ),
};

/** `filled` is for the few that read as a shape rather than as a line. */
const FILLED: IconName[] = ['play', 'home', 'stop', 'next', 'start', 'pause'];

export default function Icon({
  name, size = 16, strokeWidth, turn,
}: {
  name: IconName; size?: number; strokeWidth?: number;
  /*
   * A CHEVRON POINTS FOUR WAYS AND IS ONE DRAWING. Four icons for
   * four directions is four things to keep in agreement; a quarter
   * turn is the same stroke, the same weight and the same optical
   * centre, rotated. It is on the element rather than in the path so
   * the geometry stays readable in the table above.
   */
  turn?: 90 | 180 | 270;
}) {
  const solid = FILLED.includes(name);
  return (
    <svg
      aria-hidden="true" focusable="false"
      width={size} height={size} viewBox="0 0 24 24"
      fill={solid ? 'currentColor' : 'none'}
      stroke={solid ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth ?? 1.6}
      strokeLinecap="round" strokeLinejoin="round"
      /* `block` or the line-height of the parent adds a phantom descender. */
      style={{
        display: 'block',
        flex: '0 0 auto',
        ...(turn ? { transform: `rotate(${turn}deg)` } : {}),
      }}
    >
      {PATHS[name]}
    </svg>
  );
}
