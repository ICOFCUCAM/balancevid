/**
 * Take, on somebody else's website.
 *   [TAKE-PLATFORM P6, P13; TAKE-APP T13a; Doctrine D-19, D-21, U-02, U-19]
 *
 * > *"Bring participation to your website. Embed Take on a
 * > community, artist or publisher website. Share the public link
 * > or add the experience directly to your page."*
 *
 * THE BENCHMARK PUTS THIS ON TWO OF ITS SEVEN SCREENS and this
 * product had none of it. What `embed` meant in this codebase
 * until now was the opposite direction — `parseProviderUrl`,
 * somebody else's video played inside a conversation. Nothing
 * anywhere handed a studio a way to put Take on their own page.
 *
 * TWO WAYS, AND THE DEFAULT IS THE ONE THAT ALWAYS WORKS. A link
 * block is markup and nothing else: it survives a content editor,
 * a locked-down CMS, an email newsletter and a browser with
 * scripts off, and the app it opens is the real one on its own
 * origin with its own permissions. A frame puts the app inside
 * the page, which looks better and costs two things that have to
 * be said out loud rather than discovered — see `FRAME_COSTS`.
 *
 * THE ADDRESS IS NEVER INVENTED. Every function here takes the
 * origin it was given, which the page reads from the request
 * through `originFrom`. A constant would be wrong on every
 * installation but one, and this product is many installations.
 * [P13, D-19]
 *
 * NOTHING HERE IS A SCRIPT. A publisher pasting a `<script>` from
 * another origin is giving that origin their page; a product that
 * asks for that when markup would do has not thought about who is
 * pasting. The code is inert HTML, which is also why it can be
 * shown in full on the page rather than hidden behind a token.
 */

import { TAKE_APP_PATH, takeAppAddress } from './getTheApp.js';

export { TAKE_APP_PATH, takeAppAddress };

/** Where a studio goes to fetch the code. */
export const EMBED_PATH = '/take/embed';

export type WayId = 'link' | 'frame';

export interface EmbedWay {
  id: WayId;
  /** What it is, in the words a publisher would use. */
  says: string;
  /** What it does, in one sentence. */
  what: string;
  /** What it cannot do, where that is not obvious. Empty is honest too. */
  costs: string[];
  /** The markup, for this installation's address. */
  code: string;
}

/**
 * WHAT A FRAME COSTS, SAID BEFORE IT IS PASTED.
 *
 * BOTH OF THESE WERE MEASURED RATHER THAN REMEMBERED, and both
 * are the kind of thing that fails quietly on somebody else's
 * site a week after they stopped looking.
 *
 * STORAGE IN A THIRD-PARTY FRAME IS NOT THIS APP'S STORAGE. "My
 * Takes" and the list of connected installations live in
 * `localStorage`, and a browser partitions that per embedding
 * site — so a person who records through a frame on one website
 * and then opens the app properly finds an empty library, with
 * nothing anywhere saying why. The link does not have this
 * problem because there is no frame.
 *
 * AND A CAMERA INSIDE A FRAME IS THE EMBEDDING PAGE'S DECISION.
 * A cross-origin frame gets no camera and no microphone unless
 * the page that holds it passes them, which is what the `allow`
 * attribute in the code below is for. Leave it off and the
 * recorder's permission prompt never appears — the button simply
 * does nothing, on a phone belonging to somebody who will never
 * report it. [U-19]
 */
export const FRAME_COSTS = [
  'Saved links and “My Takes” are kept by the browser per site, so '
  + 'work saved inside your page is not the same list as the app '
  + 'opened on its own.',
  'The camera and microphone only reach a framed app when the '
  + 'allow attribute below is present, and some browsers refuse '
  + 'them in a frame whatever the page says.',
];

/** What the link block costs: nothing worth a sentence. */
export const LINK_COSTS: string[] = [];

/**
 * The link block.
 *
 * ONE ANCHOR AND INLINE STYLE, deliberately. A publisher pastes
 * this into a page whose stylesheet this product has never seen,
 * so a `class` would inherit somebody else's idea of `.button`
 * and a `<style>` block would leak the other way. Inline style on
 * the elements is the only form that looks the same in a CMS, a
 * newsletter and a hand-written page.
 *
 * `rel="noopener"` because the link opens a new tab, and a tab
 * opened without it can reach back into the page that opened it.
 */
export function linkCode(origin: string): string {
  const url = takeAppAddress(origin);
  return `<!-- Take, by BalanceVid -->
<a href="${url}"
   target="_blank" rel="noopener"
   style="display:inline-flex;align-items:center;gap:10px;
          padding:14px 22px;border-radius:8px;text-decoration:none;
          background:#153f77;color:#ffffff;font-weight:600;
          font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
          font-size:15px;line-height:1.2">
  Record your part on your phone
</a>
<p style="margin:10px 0 0;font:13px/1.5 system-ui,-apple-system,sans-serif;
          color:#5d636e">
  Opens the Take App. It installs to a home screen from the page
  itself — no store account, no code. Or type
  <strong>${hostOf(url)}/take</strong> into any phone browser.
</p>`;
}

/**
 * The frame.
 *
 * `allow` IS NOT OPTIONAL AND IS NOT DECORATION. Without it the
 * recorder inside the frame cannot ask for a camera at all. It is
 * written on the same line as the `src` so that a publisher
 * trimming the snippet has to delete it deliberately.
 *
 * `title` because a frame with no title is a page a screen reader
 * announces as "frame". `loading="lazy"` because this is usually
 * below the fold on somebody's homepage and it is an application.
 */
export function frameCode(origin: string): string {
  const url = takeAppAddress(origin);
  return `<!-- Take, by BalanceVid -->
<iframe src="${url}" allow="camera; microphone; fullscreen"
        title="Take — record your part"
        loading="lazy"
        style="width:100%;max-width:480px;height:760px;border:0;
               border-radius:12px;background:#f5f2eb"></iframe>`;
}

/** Both ways, for this installation, in the order they should be offered. */
export function embedWays(origin: string): EmbedWay[] {
  return [
    {
      id: 'link',
      says: 'A link',
      what: 'A button and a line of explanation. It works in any page, '
        + 'any content editor and any newsletter, and it opens the real '
        + 'app on its own address.',
      costs: LINK_COSTS,
      code: linkCode(origin),
    },
    {
      id: 'frame',
      says: 'The app, inside your page',
      what: 'Take runs in your page, at phone width. Visitors are asked '
        + 'for the camera only when they choose to record.',
      costs: FRAME_COSTS,
      code: frameCode(origin),
    },
  ];
}

/**
 * The host, for the line a person reads aloud or types.
 *
 * A URL THAT CANNOT BE PARSED IS STILL PRINTED, stripped of its
 * scheme rather than replaced by an apology: the only way to get
 * here is a host this installation is already being served on, so
 * an exception would be the page breaking over its own address.
 */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
}
