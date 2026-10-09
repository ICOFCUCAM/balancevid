/**
 * What an anonymous visitor may see.  [Doctrine U-31, §40, D-03]
 *
 * The doctrine is explicit: "A published conversation is a Class A source.
 * Anyone can open it and respond to it." So this is not a wall around the
 * whole application — publishing would mean nothing behind one. It is a wall
 * around everything the author has NOT published.
 *
 *   PUBLIC   a published conversation: its watch page, its manifest, its
 *            article, and exactly the media those need
 *   PRIVATE  everything else, which is every draft, every take, every
 *            unpublished render, and every list that would reveal they exist
 *
 * The "and respond to it" half of U-31 is narrowed here, and the narrowing is
 * deliberate rather than an oversight: responding creates a conversation and
 * uploads a recording, and this instance has no accounts to attribute either
 * to. Anonymous writes to a public instance is the thing being fixed. When
 * accounts exist, "anyone" means "any signed-in person" and the clause is
 * satisfied properly. Recorded in Appendix B as a scope change.
 */

import type { StudioId } from '../domain/account.js';

// (the shapes below are structural: both documents carry a `publication`)

/**
 * Paths that MAY be public, subject to the per-conversation check below.
 *
 * A prefix allowlist and nothing clever: a rule nobody can read is a rule
 * nobody can audit. Anything not matched here needs a session, so a route
 * added tomorrow is private by default rather than accidentally open.
 */
/**
 * Where an anonymous request for `/` is rewritten.
 *   [TV-NETWORK N-1; Doctrine D-19]
 *
 * ONE SPELLING, BECAUSE TWO WOULD BE A PRIVATE MARKETING SITE.
 * `middleware.ts` rewrites to this path and the line below
 * makes it reachable; written out twice, the day one of them
 * changed the gateway would answer 302-to-sign-in to the whole
 * internet and nothing in the product would look wrong.
 *
 * IT LIVES HERE RATHER THAN BESIDE `STATION_PATH`, which is the
 * other rewrite target, only because `hosting.ts` imports this
 * file for `isAssetPath` and the reverse would be a cycle.
 */
export const GATEWAY_PATH = '/gateway';

const PUBLIC_EXACT = new Set([
  '/api/health',      // the deployment's health check, which has no session
  /*
   * THE DOCUMENT THAT TAKES THE BROWSER BAR OFF THE ANDROID APP.
   *   [androidApp.ts, TAKE-APP T13a]
   *
   * Android fetches it with no session, before anybody has signed
   * in — on first launch of an app installed from a file. Behind
   * the sign-in wall it is never read, and the only symptom is an
   * app that keeps its address bar for ever with nothing
   * anywhere saying why.
   *
   * There is nothing here to protect: a package name and the
   * fingerprint of a public certificate, both of which are inside
   * the APK that anybody can download.
   */
  '/.well-known/assetlinks.json',
  /*
   * WHICH BUILD IS LIVE, which a person asks from a phone that is not
   * signed in, and a deploy probe asks with no session at all. A
   * stranger gets the commit and nothing else; the route itself keeps
   * the operational detail for the owner. [D-13, §version]
   */
  '/api/version',
  '/api/published',   // the list of things whose author asked for an audience
  /*
   * WHAT THIS INSTALLATION HAS TO DOWNLOAD, and whether it is open.
   *   [TAKE-PLATFORM P6; D-21, D-03]
   *
   * Nobody downloading the Take App or Take Desktop has an account
   * — that is the whole premise of both — so a download centre
   * behind the sign-in gate is a download centre for one person.
   *
   * THE LISTING IS NOT THE FILES. This answers which platforms a
   * release exists for and how big each is, which is what somebody
   * needs to decide whether to ask for the code at all. The BYTES
   * are behind the code, at `/api/downloads/<file>`, which is
   * public in the same sense and refuses without a pass.
   */
  '/api/downloads',
  /*
   * AND THE PAGE THAT SHOWS IT. `/downloads` is reached from the
   * gateway's own band, which a stranger is reading — so a
   * download centre behind the sign-in gate is a download centre
   * nobody downloading anything can see. It renders the LIST and
   * the state of the gate; the bytes are a separate route and
   * refuse without the code. [P6, D-25]
   */
  '/downloads',
  /*
   * What this installation offers to take part in.
   *   [TAKE-PLATFORM U5, P24; D-03, U-31]
   *
   * Public for the reason `/api/published` is: it answers only with what
   * an author PUBLISHED and then chose to have LISTED, which is two of
   * their own decisions rather than one of ours. A draft is not in it, a
   * withdrawn thing is not in it, and an unlisted thing is not in it —
   * so the existence of unfinished work stays private.
   *
   * AND IT IS THE DOOR THE TAKE APP COMES THROUGH. A person browsing for
   * a song to sing on has no account here by construction; an endpoint
   * behind a session would be a discovery surface only the owner could
   * discover anything on.
   */
  '/api/participate',
  /*
   * What this installation is running a call for.
   *   [GO-VIRAL V-4, §10]
   *
   * Public for the reason `/api/participate` is, and narrower:
   * it answers only with calls whose organiser set `listed` and
   * which have not finished. An unlisted call is not in it, and
   * a call nobody opened is not in it — so the existence of a
   * competition somebody is still drafting stays private. [D-03]
   */
  '/api/go',
  '/signin',
  '/api/auth/signin',
  '/api/auth/signout',
  /*
   * THE FRONT DOOR, AND THE PAGE BEHIND IT.
   *   [TV-NETWORK N-1; D-21, D-24]
   *
   * > *"keep `balancevid.com` → public BalanceVid/product
   * > gateway"*
   *
   * `/` WAS A REDIRECT TO A PASSWORD PROMPT. A stranger who
   * typed the installation's address was asked to sign in
   * before being told what they would be signing in to — and
   * the three public surfaces this product already has (`/tv`,
   * `/take`, `/go`) were unreachable from it. The root is the
   * one address everybody tries first; it answered nobody.
   *
   * READ ONLY, which `mayBePublic` enforces a few lines down:
   * a POST to `/` is still refused, so nothing about this opens
   * a write to a stranger.
   */
  '/',
  GATEWAY_PATH,
]);

const PUBLIC_PATTERNS: RegExp[] = [
  /*
   * THE DOOR A PRODUCER SENDS TO EVERYBODY.
   *   [app/participate/[kind]/[id], TAKE-PLATFORM P1, P39]
   *
   * One link for a song, opened by people with no account, each
   * claiming their own three goes. `POST /api/participate/…` is
   * already guest-writable for exactly this; the page that
   * presses it has to be reachable by the same stranger or the
   * button is behind a sign-in they will never have.
   *
   * IT LEAKS NOTHING BY EXISTING. The page renders no title until
   * `claimable` has confirmed the author published it, and a
   * closed song and a song that never existed are one answer —
   * the id came off a URL somebody could have guessed. [D-03]
   */
  /^\/participate\/[a-z]{1,16}\/[A-Za-z0-9_-]{1,64}$/,
  /*
   * The room.  [Doctrine ROOM §6, §12]
   *
   * These are not "public" in the sense the rest of this list means — they
   * are reachable WITHOUT THE OWNER'S SESSION, which is a different claim.
   * Each one then does its own check: the join page renders nothing until a
   * token is presented, and every room API verifies a guest session against
   * that room's own invite token before it answers.
   *
   * Two checks in different layers, as everywhere else here. Middleware
   * decides which routes are allowed to decide; the route decides.
   */
  /^\/r\/[A-Za-z0-9_-]+\/?$/,
  /*
   * The Take App's page and its own API.  [Doctrine D-25; TAKE-APP T2a]
   *
   * The same claim the room's paths make, and no more: reachable WITHOUT
   * THE OWNER'S SESSION, because the whole point is a link sent over
   * WhatsApp to somebody with no account. The route then checks the link
   * itself — `requestForLink` compares the secret in constant time and
   * answers `null` for a link that is wrong, expired or rotated.
   *
   * Two checks in different layers, as everywhere else here: middleware
   * decides which routes are allowed to decide, and the route decides.
   *
   * THE LINK IS IN THE PATH, which is a real cost worth stating: it will
   * appear in the server's access log and in the browser's history, the
   * way a room's `/r/<token>` already does. It is bounded the same way —
   * the request expires, the secret is rotatable, and what it opens is
   * one assignment rather than an account.
   */
  /^\/take\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/?$/,
  /*
   * The Take App opened without an invitation.  [TAKE-PLATFORM P1, P6]
   *
   * `/take/<link>` is one assignment for one person; `/take` is the
   * other door — somebody who was sent nothing, arriving to see what
   * this installation offers. It renders nothing itself and fetches
   * `/api/participate`, which is public for the same reason and shows
   * only what an author published and chose to list.
   *
   * ANCHORED WITH NO SEGMENT AFTER IT, so this opens the home and
   * nothing else: the pattern above is the only way to reach an
   * assignment, and it still requires a link shaped like a credential.
   */
  /^\/take\/?$/,
  /*
   * The Library.  [TAKE-APP T16, P1, P6]
   *
   * PUBLIC FOR THE SAME REASON `/take` IS, AND IT CARRIES
   * NOTHING. There is no sign-in on the Take App by
   * construction, so a page that required one would be a page
   * nobody this product is for could open. What makes it safe
   * is that the server has nothing to hand over: the list of
   * links is in that browser's own storage, and the page reads
   * each of them through `/api/take/<link>` — the route above,
   * where the link IS the credential and always was. A person
   * with no links sees two empty shelves and a sentence.
   * [D-03, D-25]
   *
   * ANCHORED EXACTLY, so this opens the Library and nothing
   * else. `library` has no dot in it and so cannot be mistaken
   * for the `<id>.<secret>` pattern above — but the pattern
   * above is matched first either way, and anchoring both is
   * what keeps that an accident rather than a dependency.
   */
  /^\/take\/library\/?$/,
  /*
   * SPENDING A PAIRING CODE.  [TAKE-DESKTOP T-2, D-25]
   *
   * PUBLIC FOR THE SAME REASON `/api/take/<link>` IS: the
   * thing presenting it has no account and never will. A
   * capture station in a hall is not signed in to anything —
   * the protocol is that a credential is who you are, and a
   * pairing code is a short credential with fifteen minutes to
   * live and one use. What comes back is the link, which is
   * the long one.
   *
   * A POST, BECAUSE SPENDING CHANGES IT. The record is deleted
   * before the link is returned, so this is not a read and
   * must not be a GET that lands in a log or a history.
   */
  /^\/api\/pair$/,
  /^\/api\/take\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
  /* The song they were asked to perform against, and nothing else about
     the performance it belongs to. [T6] */
  /^\/api\/take\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/reference$/,
  /*
   * What a phone needs to INSTALL the Take App.  [TAKE-APP T2c, T13a]
   *
   * The manifest is composed per link, so it is reachable on the same
   * terms as the page it describes and refused by the same check: a
   * link that is wrong, expired or rotated gets nothing. It names the
   * assignment and the icons and no part of the production. [D-03]
   *
   * A MANIFEST IS FETCHED BY THE BROWSER, NOT BY THE PAGE, which is
   * the practical half of why it must be here: the install prompt
   * never appears if it needs a session the performer does not have.
   */
  /^\/api\/take\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/manifest$/,
  // The picture a link preview fetches, with none of the sender's cookies.
  // The route serves it only for a published conversation. [U-31, D-03]
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/card$/,
  // And a card per exchange, which is the same thing one scale down: made to
  // be posted, so made to be fetched by whatever it was posted into. The
  // route still checks that the conversation IS published.
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/cards\/[0-9]+$/,
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/room$/,
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/room\/presence$/,
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/room\/signal$/,
  /*
   * AND THE SAME THREE FOR A CHANNEL'S OWN ROOM.  [CHANNEL §6]
   *
   * A broadcast takes its guests from a room, and a channel can now open
   * one instead of borrowing a conversation's — so a guest arriving at a
   * broadcast is a guest arriving at a room, and reaches it by exactly the
   * rules above. The handlers behind these paths ARE the ones above,
   * re-exported; what differs is only which document holds the record.
   *
   * WRITTEN OUT RATHER THAN MERGED INTO ONE PATTERN. A regex that matched
   * `conversations|channels` in one alternation would be shorter and would
   * also quietly admit any third collection somebody adds later. This list
   * is the security boundary, and a boundary should have to be widened on
   * purpose.
   */
  /^\/api\/channels\/[A-Za-z0-9_-]+\/room$/,
  /^\/api\/channels\/[A-Za-z0-9_-]+\/room\/presence$/,
  /^\/api\/channels\/[A-Za-z0-9_-]+\/room\/signal$/,
  // A published conversation's own pages. The route still checks that it IS
  // published — this only decides which routes are allowed to make that call.
  /^\/c\/[A-Za-z0-9_-]+\/watch\/?$/,
  /^\/c\/[A-Za-z0-9_-]+\/article\/?$/,
  /^\/c\/[A-Za-z0-9_-]+\/explore\/?$/,
  /*
   * Presenting a published conversation is an ordinary thing to do with one:
   * a lecturer, a seminar, a newsroom. The route still checks that it IS
   * published, and the page is `noindex` — it is a lectern, not a link.
   */
  /^\/c\/[A-Za-z0-9_-]+\/present\/?$/,
  // Exactly the media the companion player needs, and nothing else.
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/representations$/,
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/source$/,
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/takes\/[A-Za-z0-9_-]+\/media$/,
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/renders\/[A-Za-z0-9_-]+\/file$/,
  /*
   * A published performance.  [STUDIO-TWO §14, U-31]
   *
   * The same shape as the conversation's: the page, the picture a link
   * preview fetches, and exactly the media that page plays. Each route still
   * checks that the performance IS published — this only decides which
   * routes are allowed to make that call.
   *
   * What is NOT here is the raw material: the song, the takes' own media and
   * the document. A published performance is a finished video and its clips,
   * and handing out the master track somebody performed over would be
   * publishing the record rather than the performance. [INV-15]
   */
  /^\/p\/[A-Za-z0-9_-]+\/watch\/?$/,
  /^\/api\/performances\/[A-Za-z0-9_-]+\/card$/,
  /^\/api\/performances\/[A-Za-z0-9_-]+\/renders\/[A-Za-z0-9_-]+\/file$/,
  /^\/api\/performances\/[A-Za-z0-9_-]+\/clips\/[A-Za-z0-9_-]+\/file$/,
  /*
   * A published channel.  [CHANNEL §17, U-31]
   *
   * Four paths, and they are the whole of what watching a channel needs: the
   * page, the playlist, the segments it names, and what is on. Each route
   * still checks that the channel IS published — this only decides which
   * routes are allowed to make that call.
   *
   * WHAT IS NOT HERE is everything a broadcaster works with: the channel
   * document (the schedule, the ingests, the destinations, every reference
   * on disk), the library of things that could be scheduled, the list of
   * channels, and the live ingest. A viewer gets the transmission, which is
   * a stream of four-second segments and two sentences about what is in
   * them — the same line the other two studios draw between the published
   * artefact and the material it was made from.
   *
   * THE SEGMENT INDEX IS DIGITS, not a name. The route validates it again,
   * but a path pattern that accepted a word would be a pattern somebody
   * could walk out of, and this one is the outer wall.
   */
  /^\/t\/[A-Za-z0-9_-]+\/watch\/?$/,
  /^\/api\/channels\/[A-Za-z0-9_-]+\/playlist$/,
  /^\/api\/channels\/[A-Za-z0-9_-]+\/stream\/[0-9]{1,15}$/,
  /*
   * THE MASTER AND THE ALTERNATE AUDIO.  [CHANNEL §7, N-10]
   *
   * Public for the reason the playlist and the segments are: a
   * channel is watched by strangers, and audio that needed a
   * session would be a language only the broadcaster can hear.
   * The routes themselves still refuse an unpublished channel,
   * which is where that decision belongs.
   */
  /^\/api\/channels\/[A-Za-z0-9_-]+\/master\.m3u8$/,
  /^\/api\/channels\/[A-Za-z0-9_-]+\/audio\/[A-Za-z0-9-]{2,20}\/playlist$/,
  /^\/api\/channels\/[A-Za-z0-9_-]+\/audio\/[A-Za-z0-9-]{2,20}\/stream\/[0-9]{1,15}$/,
  /^\/api\/channels\/[A-Za-z0-9_-]+\/now$/,

  /*
   * THE COMPETITION LAYER.  [GO-VIRAL V-4, §10]
   *
   * A DESTINATION ON THIS GATEWAY, NOT A SECOND SITE, which is
   * the argument `/tv` made first: the public layer is this file
   * and `middleware.ts` default-closed, and a second deployment
   * with its own auth would be a second place to get the default
   * wrong.
   *
   * THEY ADD NO ACCESS BEYOND WHAT THE ORGANISER AND THE
   * ENTRANTS ALREADY GAVE, which is the same sentence the
   * television directory below carries. `/api/go` answers only
   * with calls whose organiser set `listed`; `/api/go/<handle>`
   * answers to whoever holds the address, which is what unlisted
   * has meant since the station directory; and the entry media
   * is served only for an entry whose maker ticked *my video may
   * be shown on a public page for this call* and has not taken
   * it back. [V-3]
   *
   * WRITTEN OUT ONE PATH AT A TIME rather than merged into
   * `/api/go/.*`, for the reason the room's three are: a pattern
   * with a wildcard tail quietly admits whatever is added under
   * it later, and this list is the security boundary.
   *
   * THE HANDLE IS A SLUG OR AN ID, so the character class is the
   * union of both — lower-case letters, digits, hyphens, and the
   * underscore a `camp_` id carries. `bySlugOrId` then decides,
   * and a call that is not there answers 404.
   */
  /^\/go\/?$/,
  /^\/go\/[A-Za-z0-9_-]+\/?$/,
  /^\/api\/go\/[A-Za-z0-9_-]+$/,
  /^\/api\/go\/[A-Za-z0-9_-]+\/entries\/[A-Za-z0-9_-]+\/media$/,

  /*
   * AND THE TELEVISION NETWORK ITSELF.  [TV-NETWORK N-4]
   *
   * A channel has been watchable by a stranger since the line
   * above was drawn, and unfindable for exactly as long: the four
   * patterns above all need an id somebody already has. These are
   * the surfaces that answer *which channels exist* and *what is
   * on them*, which is the whole of the author's question —
   * *"how would people access the channel?"*
   *
   * THEY ADD NO ACCESS, ONLY DISCOVERY. Everything they can reach
   * was already reachable: `directory()` returns only channels
   * whose owner set `publication.listed`, and the station route
   * answers 404 for anything private or offline. A viewer who
   * follows one of these links lands on the watch page that has
   * been public all along.
   *
   * `/tv` IS A PREFIX AND THAT IS DELIBERATE. The directory, the
   * guide, the search and the station pages are one product
   * surface, and listing them one at a time is how the fifth page
   * ships behind a password by accident. Nothing authenticated
   * lives under `/tv` and nothing ever should.
   */
  /^\/tv(\/.*)?$/,
  /^\/api\/tv\/channels$/,
  /^\/api\/tv\/channels\/[a-z0-9-]+$/,
  /*
   * THE LOGO, WHICH THE PAGES ABOVE HAVE BEEN DRAWING FROM A
   * ROUTE NO VIEWER COULD READ. Every card, every search result
   * and every station page rendered `/api/library/<assetId>`,
   * which is owner-only and answered 401 to the one audience
   * `/tv` exists for. A separate route rather than an opening in
   * that one: the question is *"may a stranger see this
   * station?"*, and the asset id is read out of the document, not
   * taken from the caller. [N-7]
   */
  /^\/api\/tv\/channels\/[a-z0-9-]+\/logo$/,
  /*
   * AND THE BANNER, ON THE SAME TERMS AND FOR THE SAME REASON.
   * The photograph behind a station's name is the same kind of
   * thing as its mark: read out of the document by slug, never
   * taken from the caller, and shown to exactly the people the
   * station page is for. [N-4]
   */
  /^\/api\/tv\/channels\/[a-z0-9-]+\/banner$/,
  /*
   * WHAT A TELEVISION READS. An M3U is the lineup and an XMLTV
   * file is the guide, and the brief names both as *"already
   * widely used for this kind of thing"*. Neither carries
   * anything the pages above do not already show a stranger: the
   * M3U names the playlist route that has been public since the
   * line *"a viewer gets the transmission"* was written, and the
   * guide is the grid at `/tv/guide` in a format a set-top box
   * can parse. [N-7]
   */
  /^\/api\/tv\/playlist\.m3u$/,
  /^\/api\/tv\/guide\.xml$/,
  /*
   * ONE RELEASE, TO SOMEBODY HOLDING THE CODE.  [P6]
   *
   * Public in the sense this list means: reachable without a
   * SESSION. It is not open — the route refuses every request
   * without an activation pass, and refuses identically for a name
   * that exists and one that does not, so the gate cannot be used
   * to enumerate the releases.
   *
   * The alphabet is the release-name alphabet and nothing else: a
   * path that could carry a slash or a dot-dot has no business in
   * a list whose job is to let requests past the gate.
   */
  /^\/api\/downloads\/[A-Za-z0-9_.+-]+$/,
];

/** Next's own assets, and the favicon. Never application data. */
const ASSET_PATTERNS: RegExp[] = [
  /^\/_next\//,
  /^\/favicon\.ico$/,
  /^\/static\//,
  /*
   * The Take App's own static files.  [TAKE-APP T13a]
   *
   * A service worker, an upload queue and four icons. They are code
   * and pictures, identical for every visitor, and they contain no
   * application data of any kind — which is the test this list
   * applies, not who is asking.
   *
   * THEY MUST BE REACHABLE WITHOUT A SESSION or the surface they
   * exist for does not work: the whole premise is a link sent to
   * somebody with no account, and a service worker that 302s to the
   * sign-in page is a registration that silently fails.
   *
   * THE WORKER IS AT THE ROOT AND NOT UNDER `/take-app/`, because a
   * worker's scope cannot rise above its own path and it has to
   * cover `/take/<link>`. The rest is under a namespace of its own
   * so an icon is never mistaken for a link: `/take/icon-192.png`
   * has exactly the shape of `/take/<id>.<secret>`.
   */
  /^\/take-sw\.js$/,
  /^\/take-app\/[A-Za-z0-9_.-]+$/,
  /*
   * And the television network's, for the same reasons.  [N-9]
   *
   * `/tv` IS ALREADY PUBLIC, so unlike the Take App's these are
   * not opening a surface — they are the surface becoming an
   * application. A manifest, an offline page, four icons and a
   * worker, identical for every visitor and carrying nothing
   * about this installation's channels.
   *
   * THE WORKER IS AT THE ROOT for the reason that one is: a
   * worker's scope cannot rise above its own path, and this one
   * claims `/tv/`.
   */
  /^\/tv-sw\.js$/,
  /^\/tv-app\/[A-Za-z0-9_.-]+$/,
  /*
   * THE PRODUCT'S OWN ARTWORK.  [N-4]
   *
   * `public/rooms/*.webp` are three photographs shipped in the
   * image: how the studio introduces each room, and now the
   * ground the television network's front page is built on.
   *
   * FOUND IN A SCREENSHOT, AS A BLACK BAND WITH A BROKEN-IMAGE
   * GLYPH IN THE CORNER. They had never been reached without a
   * session before, because the only pages drawing them were
   * behind one — so a stranger arriving at `/tv` was redirected
   * to sign in FOR A PHOTOGRAPH, and got a hero with no picture
   * in it.
   *
   * THEY CARRY NOTHING. These are files in the repository,
   * identical on every installation, the same bytes for the owner
   * and for somebody who has never heard of this product. There
   * is nothing here to protect and a login wall in front of
   * decoration is a login wall that only breaks pages.
   *
   * AND IT IS AN ASSET RULE, NOT A PUBLIC-ROUTE ONE. It belongs in
   * this list and not in `PUBLIC_PATTERNS`, because a photograph
   * decides nothing: `mayBePublic` governs routes that are allowed
   * to answer, and a static file has no answer to give. The first
   * version of this rule went into the other list and a test
   * caught it.
   */
  /^\/rooms\/[A-Za-z0-9_.-]+\.(webp|png|jpg|jpeg|avif|svg)$/,
  /*
   * AND THE GATEWAY'S NINE.  [N-1]
   *
   * The same argument as the three above it, with the stakes
   * raised: every one of these is a full-bleed background on
   * the page a stranger lands on, so a session wall in front of
   * them is not a broken thumbnail — it is a product gateway
   * made of black rectangles. `public/images/balancevid-*.jpg`
   * are files in the repository and carry nothing.
   */
  /^\/images\/[A-Za-z0-9_.-]+\.(webp|png|jpg|jpeg|avif|svg)$/,
];

export function isAssetPath(pathname: string): boolean {
  return ASSET_PATTERNS.some((pattern) => pattern.test(pathname));
}

/**
 * Whether this path is allowed to be reached without a session AT ALL.
 *
 * True does not mean "serve it". For a conversation route it means "this route
 * is permitted to decide", and the route then requires the conversation to be
 * published. Two checks, in different places, both of which must say yes.
 */
/**
 * Routes a caller without the owner's session may POST to.
 *
 * Deliberately tiny, and deliberately separate from the readable list: every
 * other write on this instance is the owner's. Joining is the exception the
 * brief requires — an invitation is a link a stranger follows — and once
 * inside, a guest may change their own presence and nothing else.
 */
const GUEST_WRITABLE: { method: string; path: RegExp }[] = [
  /*
   * What the holder of a Take link may write.  [D-25; TAKE-APP T3, T4, T5]
   *
   * FOUR VERBS, EACH ON ITS OWN PATH, for the reason the room's are
   * written this way: a path-only allowance once answered DELETE as well,
   * and that was a real hole. A participant may say they have started
   * recording, begin a submission, send its bytes, and throw away a
   * recording they have not sent. They may not accept, and they may not
   * touch anything a producer owns.
   *
   * THE DELETE IS ONE PATH AND ONE THING. It reaches the segments of a
   * recording that is not yet a submission, and the route refuses one
   * that has been sent: what a performer may undo is their own decision
   * not yet acted on, never a producer's. [D-25; TAKE-APP T4]
   */
  /*
   * AND SPENDING A PAIRING CODE, which is a write that mints
   * nothing: it exchanges a short credential for the long one
   * it stood in for, and destroys the short one doing it. A
   * capture station has no session and is never going to —
   * this is the one door it knocks on before it holds a link
   * at all. [T-2, pairing.ts]
   */
  { method: 'POST', path: /^\/api\/pair$/ },
  { method: 'POST', path: /^\/api\/take\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/ },
  { method: 'POST', path: /^\/api\/take\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/submissions$/ },
  { method: 'PUT', path: /^\/api\/take\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/submissions\/[A-Za-z0-9_-]+$/ },
  { method: 'POST', path: /^\/api\/take\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/submissions\/[A-Za-z0-9_-]+$/ },
  { method: 'DELETE', path: /^\/api\/take\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/submissions\/[A-Za-z0-9_-]+$/ },
  /*
   * AND SAYING WHAT THEY AGREE TO, AND TAKING IT BACK.
   *   [GO-VIRAL V-3; D-03]
   *
   * TWO VERBS AND ONE PATH, listed the same way the four above are
   * and for the same reason: a path-only allowance once answered
   * DELETE as well, and that was a real hole. Here DELETE is wanted
   * — it is the withdrawal — so it is named, which is not the same
   * thing as being inherited.
   *
   * THE PARTICIPANT'S OWN CONSENT IS THE PARTICIPANT'S TO WRITE.
   * Nobody else can: the route refuses anything whose hash the call
   * has not published, it refuses a rewrite once a recording has
   * been sent, and the link is the credential. What this allowance
   * reaches is one record on one request, which is the record OF
   * the person holding the link. D-03's word is *revocable*, and a
   * consent the person could give and not take back would be a
   * release collected at a door.
   */
  { method: 'POST', path: /^\/api\/take\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/consent$/ },
  { method: 'DELETE', path: /^\/api\/take\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/consent$/ },
  /*
   * TAKING PART IN SOMETHING THE AUTHOR OPENED TO ANYONE.
   *   [TAKE-PLATFORM P2, P3, P4, PART FIVE; D-25, U-31]
   *
   * The only write on this instance a stranger may make that CREATES
   * something, and the reason it is allowed is U-31's own: "anyone can
   * open it and respond to it". The narrowing recorded at the head of
   * this file — that responding needs an account, because there are no
   * accounts to attribute it to — is exactly what a Participation
   * Request solves: it attributes the recording to a request the
   * producer accepts or rejects, and nothing reaches the production
   * until they do. [D-25]
   *
   * THE ROUTE'S OWN CHECK IS THE REAL ONE, as everywhere here: this
   * says the route may decide, and the route refuses anything whose
   * author did not set `access: anyone` AND leave it listed. Two of
   * the author's own decisions, both required.
   *
   * WHAT IT COSTS, stated rather than hidden: a press writes a request
   * directory, so an item opened to anyone can be claimed repeatedly
   * by a script. The client asks once per device because it keeps what
   * it is given, which covers the accidental case and not the
   * deliberate one. A per-item ceiling is the honest fix, it is a
   * producer-facing setting, and it does not exist yet.
   */
  { method: 'POST', path: /^\/api\/participate\/[a-z]{1,16}\/[A-Za-z0-9_-]{1,64}$/ },
  /*
   * AND THE SAME ACT FROM THE CALL'S OWN PAGE.  [GO-VIRAL V-4, §3]
   *
   * THE SECOND DOOR AND NOT A SECOND PERMISSION. It mints the
   * same object, through the same `claim`, bounded by the same
   * ceiling and the same four conditions of the author's —
   * `src/web/claim.ts` is one function so that the two cannot
   * drift. What differs is that this one KNOWS which call is
   * being answered, which is the thing the door above cannot
   * know when a track has two.
   *
   * ITS OWN PATH, ANCHORED, with no verb but POST: the page, the
   * call and the entry media beside it are GETs declared
   * separately, and a path-only allowance on this one would
   * answer DELETE as well — the hole this file already
   * remembers.
   */
  { method: 'POST', path: /^\/api\/go\/[A-Za-z0-9_-]{1,64}\/enter$/ },
  { method: 'POST', path: /^\/api\/conversations\/[A-Za-z0-9_-]+\/room\/join$/ },
  { method: 'POST', path: /^\/api\/conversations\/[A-Za-z0-9_-]+\/room\/presence$/ },
  // A reading about the sender's own microphone. [ROOM §2]
  { method: 'POST', path: /^\/api\/conversations\/[A-Za-z0-9_-]+\/room\/voice$/ },
  // Introducing two browsers to each other. [ROOM §12]
  { method: 'POST', path: /^\/api\/conversations\/[A-Za-z0-9_-]+\/room\/signal$/ },
  /*
   * The same four for a channel's own room, and the same method rule: each
   * of these paths is named with the ONE verb a guest may use on it. The
   * hole that taught this product to write it that way was a path-only
   * allowance on interventions, which also answered DELETE. [ROOM §6]
   */
  { method: 'POST', path: /^\/api\/channels\/[A-Za-z0-9_-]+\/room\/join$/ },
  { method: 'POST', path: /^\/api\/channels\/[A-Za-z0-9_-]+\/room\/presence$/ },
  { method: 'POST', path: /^\/api\/channels\/[A-Za-z0-9_-]+\/room\/voice$/ },
  { method: 'POST', path: /^\/api\/channels\/[A-Za-z0-9_-]+\/room\/signal$/ },
  /*
   * Recording, for a guest the host has put on stage. The route checks that
   * for itself — this only says the request is allowed to reach a route that
   * can decide. [ROOM §10]
   *
   * THE METHOD IS PART OF THE RULE, and learning that cost a real hole: the
   * interventions path also answers DELETE, and a path-only allowance handed
   * guests the ability to delete the author's responses. A rule that names a
   * route without naming what may be done to it is not a rule about
   * anything.
   */
  /*
   * TYPING THE ACTIVATION CODE.  [P6]
   *
   * A POST from somebody with no account, which is everybody this
   * surface is for. It writes nothing on this installation — it
   * reads one environment variable and hands back a cookie — and
   * it is the only way to send the code without putting it in a
   * URL.
   */
  { method: 'POST', path: /^\/api\/downloads\/unlock$/ },
  { method: 'POST', path: /^\/api\/conversations\/[A-Za-z0-9_-]+\/interventions$/ },
  { method: 'POST', path: /^\/api\/conversations\/[A-Za-z0-9_-]+\/takes\/[A-Za-z0-9_-]+\/chunks$/ },
  { method: 'POST', path: /^\/api\/conversations\/[A-Za-z0-9_-]+\/takes\/[A-Za-z0-9_-]+\/finalize$/ },
];

export function mayBePublic(pathname: string, method: string): boolean {
  const write = pathname.replace(/\/+$/, '') || '/';
  // A published artefact is readable. It is never writable by a stranger.
  if (method !== 'GET' && method !== 'HEAD') {
    if (GUEST_WRITABLE.some((rule) => rule.method === method && rule.path.test(write))) {
      return true;
    }
    return pathname === '/api/auth/signin' || pathname === '/api/auth/signout';
  }
  const path = pathname.replace(/\/+$/, '') || '/';
  if (PUBLIC_EXACT.has(path)) return true;
  return PUBLIC_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Published, and not withdrawn.  [U-31]
 *
 * Distinct from `isRespondable`: an author may publish something and still
 * refuse responses to it, and that is a published conversation anyone may
 * watch. Withdrawing it removes it from view again.
 */
export function isPubliclyVisible(
  document: { publication?: { unpublishedAt?: string } | undefined },
): boolean {
  const publication = document.publication;
  return Boolean(publication && !publication.unpublishedAt);
}

/**
 * Which representations a stranger may generate for a published conversation.
 *
 * The render plan and the timeline describe how the thing was made, which is
 * the author's working material rather than the published artefact. The
 * bundle is the author's unpublished admin. What a viewer needs is the
 * companion player's manifest, the article, and the captions.
 */
const PUBLIC_REPRESENTATIONS = new Set([
  'manifest.json', 'article.json', 'article.md', 'article.html',
  'captions.srt', 'captions.vtt',
  // What a link to this conversation says about itself. Public by
  // definition: it exists to be read by whatever the link was pasted into.
  'share-card.json',
  // A card per exchange, and the page that plays them. Both exist to be read
  // by somebody who was sent a link.
  'claim-cards.json', 'interactive.html',
]);

export function isPublicRepresentation(id: string | null): boolean {
  return id !== null && PUBLIC_REPRESENTATIONS.has(id);
}

/**
 * What a guest in the room may do.  [Doctrine ROOM §4, §6, §12, D-03]
 *
 * An allowlist of ACTS, not of paths, because the question "may Sarah do
 * this?" should have one answer written in one place that a person can read
 * and audit. A guest was let in by a link somebody forwarded; the reasonable
 * assumption is that they are who they say and nothing more.
 *
 * What they may do is bounded by two ideas:
 *
 *   THEIR OWN VOICE      they can be present, raise a hand, and record
 *                        themselves. Their takes are theirs.
 *   NOT THE AUTHOR'S WORK they cannot edit the conversation, move anyone's
 *                        anchors, attach evidence, publish, export, or learn
 *                        that any other conversation exists.
 *
 * The asymmetry is deliberate and it is the product's position, not a
 * limitation: the conversation belongs to whoever opened it, and a guest
 * contributes to it rather than co-owning it. When that should change it
 * will be an explicit role, not a widened default.
 */
export type RoomAct =
  | 'room.read'          // see who is here and what is on screen
  | 'room.presence'      // say I am here, or that I have left
  | 'room.raise-hand'    // ask for the floor [ROOM §8]
  | 'take.own.create'    // record myself
  | 'take.own.upload'    // send my own chunks
  | 'source.watch';      // see the video everyone is discussing

const GUEST_MAY: ReadonlySet<RoomAct> = new Set<RoomAct>([
  'room.read', 'room.presence', 'room.raise-hand',
  'take.own.create', 'take.own.upload', 'source.watch',
]);

export function guestMay(act: RoomAct): boolean {
  return GUEST_MAY.has(act);
}

/**
 * Acts a guest must never reach, named so the test can assert on them.
 *
 * Kept as a list rather than "everything not in GUEST_MAY" because the point
 * of writing them down is that somebody adding a route tomorrow sees the
 * shape of what is being protected.
 */
export const OWNER_ONLY = [
  'conversation.edit', 'conversation.delete', 'intervention.move',
  'evidence.attach', 'annotation.draw', 'layout.set', 'publish',
  'render', 'clips.make', 'bundle.read', 'conversations.list',
  'room.open', 'room.close', 'room.stage', 'room.remove-participant',
] as const;

/* ------------------------------------------------------------------------ *
 *  Which studio a request is for.  [MASTER-EDIT §11, D-06, D-19]
 * ------------------------------------------------------------------------ */

/**
 * The studio a path belongs to, or null for the parts of the building that
 * belong to none of them.
 *
 * A PREFIX TABLE AND NOTHING CLEVER, for the same reason the public
 * allowlist above is one: a rule nobody can read is a rule nobody can audit.
 * The difference from that list is the default. Public access is deny-by-
 * default because a route added tomorrow must not be accidentally open;
 * studio ownership is null-by-default because a route added tomorrow must
 * not be accidentally UNREACHABLE — an entitlement bug that hides the sign-in
 * page or the health check is an outage, and one that leaves a new route
 * open to an owner who has every studio is nothing at all.
 *
 * So the two defaults point in opposite directions on purpose, and each one
 * points at the failure that costs less.
 */
const STUDIO_PATHS: [RegExp, StudioId][] = [
  /*
   * Studio One: the studio itself, a conversation, and everything hung
   * off one.
   *
   * `/^\/c\//` WAS THE WHOLE RULE AND IT DID NOT COVER `/c`, because
   * `/c` had never existed. The page's own `listConversations` would
   * have refused an account without the studio — `requireStudio` is in
   * the store, where it belongs — but "a check in an interface is one
   * refactor away from not being in the path", and so is a check that
   * lives only in one function the route happens to call.
   * [STUDIO-ONE §5, MASTER-EDIT §11]
   */
  [/^\/c(\/|$)/, 'studio-one'],
  [/^\/api\/conversations(\/|$)/, 'studio-one'],
  /*
   * Studio Two: the studio itself, and a performance.
   *
   * THE SAME TRAILING SLASH `/c` HAD. `^/p/` did not cover `/p`, and
   * `/p` did not exist to notice — so the moment the room was built the
   * rule would have let an account without the studio reach it, and
   * only `requireStudio` inside `listPerformances` would have stopped
   * them. That is a check in one function the route happens to call,
   * which is not the wall. [MASTER-EDIT §11]
   */
  [/^\/p(\/|$)/, 'studio-two'],
  [/^\/api\/performances(\/|$)/, 'studio-two'],
  /* Online TV: the control room, and a channel. As above. */
  [/^\/t(\/|$)/, 'online-tv'],
  [/^\/api\/channels(\/|$)/, 'online-tv'],
];

export function studioForPath(pathname: string): StudioId | null {
  for (const [pattern, studio] of STUDIO_PATHS) {
    if (pattern.test(pathname)) return studio;
  }
  return null;
}

/**
 * THE ROOM IS NOT A STUDIO, and that is the one exception worth writing out.
 *
 * `/r/<token>` is a guest arriving at an invitation. It is reachable without
 * the owner's session at all (see the public patterns above), it is answered
 * by `callerFor` against that room's own invite token, and the guest has no
 * account and therefore no plan. Running it through this table would ask
 * "does the guest own Studio One?" of somebody who owns nothing — and the
 * answer would be no, so every guest link in the product would stop working.
 *
 * It is absent from the table rather than special-cased in the check,
 * because a rule with an exception inside it is a rule two people read two
 * ways.
 */
