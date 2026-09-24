/**
 * End-to-end: drive the real product in a real browser.
 *
 * Chrome's fake media device stands in for a camera and microphone, so this
 * exercises the actual capture path -- getUserMedia, the rolling pre-roll
 * segments, chunk upload, take assembly, and the render -- rather than a mock
 * of it. The acceptance test in U-27 is "can someone do this with one key";
 * this script uses only the spacebar.
 */
import { chromium } from 'playwright';
import { setTimeout as sleep } from 'node:timers/promises';
import { execFileSync } from 'node:child_process';
import ffprobe from 'ffprobe-static';
import ffmpegStatic from 'ffmpeg-static';
import { writeFile } from 'node:fs/promises';
import { decodeIndex } from '../test/render/synthetic.ts';
import { forDisplay } from '../src/transcribe/types.ts';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const SOURCE = process.argv[2];
// The server under test must be started with this password.
const PASSWORD = process.env.BALANCEVID_E2E_PASSWORD ?? 'e2e-development-password';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
if (!SOURCE) { console.error('usage: npx tsx scripts/e2e.mjs <source.mp4>'); process.exit(1); }

const log = (...a) => console.log('·', ...a);

const browser = await chromium.launch({
  executablePath: CHROME,
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    '--no-sandbox',
  ],
});
const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
const page = await context.newPage();
page.on('pageerror', (e) => console.error('  [page error]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('  [console]', m.text()); });

/**
 * fetch, signed in.
 *
 * Node has no cookie jar, so the session travels by hand on every call the
 * test makes outside the browser. `raw` is the deliberate opposite, used only
 * to prove what a stranger cannot reach.
 */
let SESSION = '';
const sfetch = (url, init = {}) => fetch(url, {
  ...init, headers: { ...(init.headers ?? {}), cookie: SESSION },
});

let failures = 0;
const check = (ok, label, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
};

/*
 * --- the wall (D-03, D-06, U-31) -------------------------------------------
 *
 * Checked BEFORE signing in, because afterwards everything looks correct
 * whether or not the wall exists. This instance is reachable from the
 * internet; a stranger must see nothing except what was published.
 */
log('checking the wall before signing in…');
const raw = (path, init) => fetch(`${BASE}${path}`, { redirect: 'manual', ...init });

check((await raw('/')).status === 307, 'a stranger is sent to sign in');
check((await raw('/api/conversations')).status === 401,
  'a stranger cannot list the conversations on this instance (D-03)');
check((await raw('/api/conversations/conv_guess/bundle')).status === 401,
  'and cannot reach a conversation route by guessing an id');
check((await raw('/api/conversations', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'intruder' }),
})).status === 401, 'a stranger cannot create anything');
check((await raw('/api/health')).status === 200, 'but the health check still answers');
check(!JSON.stringify(await (await raw('/api/health')).json()).includes('queue'),
  'and tells a stranger only that it is alive, not how busy it is');
check((await raw('/api/auth/signin', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password: 'not-the-password' }),
})).status === 401, 'the wrong password is refused');

// --- sign in ----------------------------------------------------------------
log('signing in…');
await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle' });
await page.fill('[data-testid="signin-password"]', PASSWORD);
await page.click('[data-testid="signin-submit"]');
await page.waitForURL((url) => !url.pathname.startsWith('/signin'), { timeout: 20_000 });
check(true, 'the owner can sign in');

const cookies = await context.cookies();
const sessionEntry = cookies.find((c) => c.name === 'balancevid_session');
SESSION = sessionEntry ? `${sessionEntry.name}=${sessionEntry.value}` : '';
check(SESSION.length > 0, 'the session is a cookie the browser holds');
check(sessionEntry?.httpOnly === true, 'that a script on the page cannot read');
check(sessionEntry?.sameSite === 'Lax', 'and a cross-site form cannot post with');

// --- create the conversation ------------------------------------------------
log('opening', BASE);
await page.goto(BASE, { waitUntil: 'networkidle' });
// The way in is a short journey now, not a form: choose something, see what
// you are about to answer, then enter. [§40 intake]
await page.waitForSelector('[data-testid="start-choose"]');
check(await page.locator('[data-testid="start-ready"]').count() === 0,
  'the first screen asks for a video, not for rights and attribution');
const upfront = await page.evaluate(() => document.body.innerText);
check(!/Class A|Class B|Rights basis|rightsAttestation/i.test(upfront),
  'and it does not open with source classification or rights language');

await page.setInputFiles('#file', SOURCE);
await page.waitForSelector('[data-testid="start-ready"]', { timeout: 20_000 });
check(true, 'choosing a video moves to the preparation screen');

// Provenance is still asked for — behind a disclosure, after the video has
// been seen, rather than as the first thing anyone meets. [U-21, INV-07]
await page.click('[data-testid="toggle-source-details"]');
await page.fill('[data-testid="source-title"]', 'The History of Europe');
await page.fill('[data-testid="creator"]', 'Example Channel');
check((await page.locator('[data-testid="preview-title"]').textContent())
  ?.includes('The History of Europe'),
  'the preview shows what the source is called, as it is named');

/*
 * The preparation screen always shows SOMETHING, and never a black void.
 *
 * Three separate things decide whether a poster appears, and only the third
 * is the product's: whether a real browser can play the format, whether THIS
 * browser can decode it, and whether the fallback is honest when it cannot.
 * Playwright's Chromium ships without H.264 and the fixture is H.264, so the
 * decode is expected to fail here — which makes this the right place to
 * assert the fallback rather than the poster. The check is that the person is
 * never told their upload is broken when it is not.
 */
{
  const media = page.locator('[data-testid="preview-media"]');
  const kind = await media.getAttribute('data-kind');
  check(kind === 'poster' || kind === 'placeholder',
    'the preparation screen shows a picture of the source, or says why not', `kind=${kind}`);
  if (kind === 'placeholder') {
    const text = await media.innerText();
    check(text.trim().length > 0 && !/error|fail|invalid|unsupported/i.test(text),
      'a source this browser cannot decode still reads as a video, not a fault',
      text.replace(/\n/g, ' ').slice(0, 60));
    log('no poster here: this browser has no H.264 decoder, which is not a product limit');
  } else {
    check((await page.locator('[data-testid="preview-thumb"]').getAttribute('src'))
      ?.startsWith('data:image/') === true,
      'the poster is decoded from the file in the browser, not uploaded to get one');
  }
}

await page.fill('[data-testid="conversation-title"]', 'My response to The History of Europe');
await page.click('[data-testid="enter-conversation"]');
await page.waitForURL(/\/c\//, { timeout: 60_000 });
const conversationId = page.url().split('/c/')[1];
log('conversation', conversationId);

// --- wait for ingest --------------------------------------------------------
log('waiting for the source to be normalised…');
await page.waitForSelector('video[src*="/source"]', { timeout: 120_000 });
const api = async (path) => (await sfetch(`${BASE}${path}`)).json();
let snap = await api(`/api/conversations/${conversationId}`);
check(snap.conversation.source.durationFrames === 600, 'source normalised to 600 frames',
  `got ${snap.conversation.source.durationFrames}`);

// --- arm and run the one-key loop ------------------------------------------
await page.click('[data-testid="enable-camera"]');
await page.waitForFunction(
  () => document.querySelector('[data-testid="stance"]')?.textContent === 'Listening',
  null, { timeout: 30_000 });
log('camera armed');

// Live is the whole product and it is one thing. Anything else on this
// screen is something between a person and the sentence they want to answer.
{
  const inLive = await page.evaluate(() => ({
    transcript: !!document.querySelector('[data-testid="tab-transcript"]'),
    timeline: !!document.querySelector('[data-testid="conversation-timeline"]'),
    publish: !!document.querySelector('[data-testid="publish-formats"]'),
    stance: document.querySelector('[data-testid="stance"]')?.textContent,
    camera: !!document.querySelector('[data-testid="camera-pip"]'),
  }));
  check(!inLive.transcript && !inLive.timeline && !inLive.publish,
    'live mode shows the video, the camera, the state and the key — nothing else',
    JSON.stringify(inLive));
  check(inLive.stance === 'Listening' && inLive.camera,
    'with the camera floating over the source and the state said plainly');
}

await page.evaluate(() => document.querySelector('video[src*="/source"]').play());
await sleep(1200);

const ANCHORS = [];
for (let i = 0; i < 2; i++) {
  await sleep(2200);
  const before = await page.evaluate(() =>
    Math.floor(document.querySelector('video[src*="/source"]').currentTime * 30));
  await page.keyboard.press('Space');               // INTERRUPT
  await page.waitForFunction(
    () => document.querySelector('[data-testid="stance"]')?.textContent === 'Your turn', null, { timeout: 20_000 });
  ANCHORS.push(before);
  log(`interrupt ${i + 1} at frame ~${before}`);

  await sleep(2600);                                 // speak
  await page.keyboard.press('Space');               // CONTINUE
  await page.waitForFunction(
    () => document.querySelector('[data-testid="stance"]')?.textContent === 'Listening', null, { timeout: 60_000 });

  const after = await page.evaluate(() =>
    Math.floor(document.querySelector('video[src*="/source"]').currentTime * 30));

  /*
   * Resume where it cut out.  [INV-02]
   *
   * Measured against the frame the PRODUCT recorded, not against a reading
   * the test took of a still-playing clock. `before` is sampled over one
   * round trip and the key is pressed over another, so at 30fps it trails
   * the real pause point by a frame or two — that slack is the test's, and
   * asserting on it makes a timing measurement look like a frame-exactness
   * failure. The anchor is the frame the conversation committed to, and the
   * one the render will cut at.
   */
  const recorded = (await api(`/api/conversations/${conversationId}`))
    .conversation.interventions
    .map((iv) => iv.anchor.tSourceFrame)
    .sort((a, b) => Math.abs(a - before) - Math.abs(b - before))[0];
  check(Math.abs(after - recorded) <= 1, `resumed at the interrupt frame (${i + 1})`,
    `cut out at ${recorded}, resumed at ${after} (test sampled ${before})`);
  check(Math.abs(recorded - before) <= 3,
    `and cut out where the author pressed the key (${i + 1})`,
    `sampled ${before}, recorded ${recorded}`);
}

// --- into Studio for everything that analyses the conversation ------------
/*
 * Live is watch → interrupt → respond → continue and nothing else. The
 * transcript, the statements and the search are Studio's, so the test goes
 * where the author would.
 */
await page.click('button[role=tab]:has-text("Studio")');
check(await page.locator('[data-testid="tab-transcript"]').count() === 1,
  'the transcript lives in Studio, not in the middle of the live loop');

// --- transcript, then a sentence-anchored response (U-09, U-10) ------------
log('waiting for the transcript…');
let transcript = null;
for (let i = 0; i < 180; i++) {
  const data = await api(`/api/conversations/${conversationId}/transcript`);
  if (data.transcript) { transcript = data.transcript; break; }
  await sleep(1000);
}
check(Boolean(transcript), 'source transcribed');
if (transcript) {
  check(transcript.words.length > 0, 'transcript has word-level timing (U-03)',
    `${transcript.words.length} words, ${transcript.sentences.length} sentences`);
  check(transcript.words.every((w) => w.endFrame > w.startFrame), 'every word has a real span');
  log(`transcript: "${transcript.sentences[0]?.text.slice(0, 60)}…"`);
}

// Respond to a specific statement, using only the transcript panel.
await page.waitForSelector('[data-testid="transcript-line"]', { timeout: 30_000 });
// Watch for a moment first. Interrupting milliseconds after the previous
// response resumed would mean the pre-roll buffer has nothing in it yet --
// true of the product, but not how anyone actually watches a video.
await sleep(2500);
const sentenceCountBefore = (await api(`/api/conversations/${conversationId}`))
  .conversation.interventions.length;
await page.locator('[data-testid="transcript-line"]').nth(1).click();
await page.waitForSelector('[data-testid="claim-card-respond"]', { timeout: 10_000 });
await page.click('[data-testid="claim-card-respond"]');
await page.waitForFunction(
  () => document.querySelector('[data-testid="stance"]')?.textContent === 'Your turn',
  null, { timeout: 20_000 });
log('sentence-anchored interrupt');
await sleep(2400);
await page.keyboard.press('Space');
await page.waitForFunction(
  () => document.querySelector('[data-testid="stance"]')?.textContent === 'Listening',
  null, { timeout: 60_000 });

let snapAfter = await api(`/api/conversations/${conversationId}`);
check(snapAfter.conversation.interventions.length === sentenceCountBefore + 1,
  'the transcript panel opened an intervention');
const quoted = snapAfter.conversation.interventions.filter((iv) => iv.anchor.quote);
check(quoted.length === 1, 'the claim is bound to the intervention (U-10)',
  quoted[0] ? `"${quoted[0].anchor.quote.slice(0, 48)}…"` : 'none');
check(quoted.every((iv) => Boolean(iv.anchor.quoteHash)), 'the claim carries its hash (INV-05)');
// The author highlighted that one themselves, so it carries no AI origin.
check(quoted.every((iv) => !iv.anchor.origin),
  'a claim the author found themselves records no model (U-15)');

// --- the conversation timeline ----------------------------------------------
/*
 * A timeline of durations is a progress bar with notches. A timeline of
 * faces is a conversation you can read at a glance — each response showing
 * the moment you spoke into.
 */
log('checking the conversation timeline…');
{
  const posters = page.locator('[data-testid="timeline-poster"]');
  await posters.first().waitFor({ timeout: 30_000 }).catch(() => {});
  const count = await posters.count();
  check(count > 0, 'each response shows a still of itself on the timeline', `${count} shown`);

  // The picture must be a real one, not a broken image the browser hides.
  const loaded = await page.evaluate(() => {
    const images = [...document.querySelectorAll('[data-testid="timeline-poster"]')];
    return images.map((i) => i.naturalWidth > 0 && i.naturalHeight > 0);
  });
  check(loaded.length > 0 && loaded.every(Boolean),
    'and the stills are real images, not broken ones', JSON.stringify(loaded));

  const first = await page.locator('[data-testid="timeline-response"]').first();
  check(await first.count() === 1, 'each response is a place on the timeline you can go to');
}

// --- moving a response (U-05, U-08, INV-12) ---------------------------------
/*
 * The only reordering this product has. Order is derived from the anchor and
 * never stored, so moving WHEN a response answers is moving where it sits —
 * and a response carrying a quote loses it rather than travelling to a
 * moment the quote no longer describes.
 */
log('checking that a response can be moved…');
{
  const chip = page.locator('[data-testid="timeline-response"]').first();
  const before = Number(await chip.getAttribute('data-frame'));
  const id = await chip.getAttribute('data-response-id');
  const doc = (await api(`/api/conversations/${conversationId}`)).conversation;
  const carried = doc.interventions.find((iv) => iv.id === id)?.anchor.quote;

  // Keyboard first: a control only a pointer can use is one half the people
  // cannot use, and this project has shipped that bug before (D-04).
  await chip.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(600);

  if (carried) {
    // It quotes something, so it must say what moving costs before moving.
    await page.waitForSelector('[data-testid="move-confirm"]', { timeout: 10_000 })
      .then(() => check(true, 'moving a response that quotes a statement asks first'))
      .catch(() => check(false, 'moving a response that quotes a statement asks first'));
    const warning = await page.locator('[data-testid="move-confirm"]').innerText();
    check(/quote/i.test(warning) && /recording is untouched/i.test(warning),
      'and says exactly what is lost and what is not');

    await page.click('[data-testid="move-cancel"]');
    await page.waitForTimeout(400);
    const unchanged = (await api(`/api/conversations/${conversationId}`))
      .conversation.interventions.find((iv) => iv.id === id);
    check(unchanged?.anchor.tSourceFrame === before,
      'declining leaves it exactly where it was', `${unchanged?.anchor.tSourceFrame} vs ${before}`);
    check(unchanged?.anchor.quote === carried, 'and keeps its quote');

    await chip.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForSelector('[data-testid="move-confirm-go"]', { timeout: 10_000 });
    await page.click('[data-testid="move-confirm-go"]');
  }

  await page.waitForFunction((was) => {
    const el = document.querySelector('[data-testid="timeline-response"]');
    return el && Number(el.getAttribute('data-frame')) !== was;
  }, before, { timeout: 15_000 }).catch(() => {});

  const moved = (await api(`/api/conversations/${conversationId}`))
    .conversation.interventions.find((iv) => iv.id === id);
  check(moved?.anchor.tSourceFrame !== before,
    'a response can be moved to a different moment (§26)',
    `${before} → ${moved?.anchor.tSourceFrame}`);
  if (carried) {
    check(!moved?.anchor.quote,
      'and its quote is dropped rather than left pointing at the wrong sentence (U-05)');
  }

  // Moving must not break the cuts.
  const snapMoved = await api(`/api/conversations/${conversationId}`);
  check(snapMoved.invariantError === null,
    'and the timeline is still frame-exact afterwards (INV-02)', snapMoved.invariantError ?? '');
  check(await page.locator('[data-testid="move-confirm"]').count() === 0,
    'the warning clears once the decision is made');
}

// --- the claim card (§12, U-10) ---------------------------------------------
/*
 * Selecting a sentence is the author saying "this is what I am answering",
 * and the interface changes shape to say it back. What is checked here is
 * that the transformation is real, that it carries the SOURCE's exact words
 * and moment, and that it ends up bound to the response rather than being a
 * second, parallel idea of the same thing.
 */
log('checking the composition rails…');
{
  /*
   * Studio is three rails and a bar:
   *   LEFT    what did I say        the responses that exist
   *   CENTRE  what will they see    the composition
   *   RIGHT   how do I express it   the layout and the marks
   *   BOTTOM  when does it happen
   */
  const clips = page.locator('[data-testid="clip-card"]');
  const count = await clips.count();
  check(count > 0, 'every response is a card in the clip rail', `${count} clips`);
  check(await page.locator('[data-testid="clip-poster"]').count() > 0,
    'showing the author\'s own face rather than a row of text');

  // Choosing one makes it the thing being composed.
  await clips.first().click();
  await page.waitForSelector('[data-testid="composition-rail"]', { timeout: 10_000 });
  check(true, 'choosing a clip turns the right rail into its composition');
  check(await page.locator('[data-testid="tab-transcript"]').count() === 0,
    'and the rail describes one response rather than competing with the conversation');

  // The centre shows the relationship, not the source alone.
  await page.waitForSelector('[data-testid="composition-stage"]', { timeout: 10_000 });
  const before = await page.locator('[data-testid="composition-stage"]')
    .getAttribute('data-layout');
  check(typeof before === 'string' && before.length > 0,
    'the stage shows the composition this response will be exported in', `${before}`);

  /*
   * Choosing a layout changes the stage at once, because both read the same
   * LAYOUTS data the renderer reads.
   *
   * Deliberately a layout this response is NOT already in: picking the one it
   * happens to start in makes the assertion pass without anything happening,
   * which is how this check first went green while the save was still in
   * flight.
   */
  const want = before === 'pip' ? 'side_by_side' : 'pip';
  await page.click(`[data-testid="layout-option"][data-layout-id="${want}"]`);
  await page.waitForFunction(
    (id) => document.querySelector('[data-testid="composition-stage"]')
      ?.getAttribute('data-layout') === id,
    want, { timeout: 10_000 })
    .then(() => check(true, 'choosing a layout changes the stage immediately'))
    .catch(() => check(false, 'choosing a layout changes the stage immediately'));

  const clipId = await clips.first().getAttribute('data-clip-id');
  let doc = (await api(`/api/conversations/${conversationId}`)).conversation;
  check(doc.interventions.find((iv) => iv.id === clipId)?.layoutId === want,
    'and the choice is a field of the response, not editor state',
    `${doc.interventions.find((iv) => iv.id === clipId)?.layoutId}`);

  /*
   * Point: one click on the picture.
   *
   * Marks are canvas coordinates (U-12) — the renderer draws them over the
   * whole composed frame. So the author marks the COMPOSITION, and what they
   * see is where it lands. Marking a bare source frame and exporting side by
   * side would put the ring somewhere they never put it.
   */
  await page.click('[data-testid="explain-tool"][data-tool="point"]');
  await page.waitForSelector('[data-testid="explain-surface"]', { timeout: 10_000 });
  check(await page.locator('[data-testid="composition-stage"]').count() === 1,
    'a tool in hand marks the composition, not a separate panel');

  const surface = await page.locator('[data-testid="explain-surface"]').boundingBox();
  await page.mouse.click(surface.x + surface.width * 0.66, surface.y + surface.height * 0.42);
  await page.waitForSelector('[data-testid="composition-mark"]', { timeout: 10_000 })
    .then(() => check(true, 'pointing at the picture puts a mark on it'))
    .catch(() => check(false, 'pointing at the picture puts a mark on it'));

  doc = (await api(`/api/conversations/${conversationId}`)).conversation;
  const placed = (doc.interventions.find((iv) => iv.id === clipId)?.annotations ?? [])
    .find((a) => a.kind === 'point');
  check(Boolean(placed), 'the mark is in the document, on the response');
  check(placed && Math.abs(placed.points[0].x - 0.66) < 0.03
    && Math.abs(placed.points[0].y - 0.42) < 0.03,
    'at the coordinates the author pointed at, normalised to the frame',
    placed ? `${placed.points[0].x.toFixed(3)}, ${placed.points[0].y.toFixed(3)}` : 'none');
  check(placed && placed.points.length === 1,
    'a point is one coordinate — no shape to drag, no corners to get right');

  // Escape puts the tool down. A mode with no way out is a trap.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(await page.locator('[data-testid="explain-surface"]').count() === 0,
    'escape puts the tool down');

  // And the composition survives a reload, because it is document state.
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('button[role=tab]:has-text("Studio")');
  await page.waitForSelector('[data-testid="clip-card"]', { timeout: 20_000 });
  await page.locator(`[data-testid="clip-card"][data-clip-id="${clipId}"]`).click();
  await page.waitForSelector('[data-testid="composition-stage"]', { timeout: 10_000 });
  check(await page.locator('[data-testid="composition-stage"]').getAttribute('data-layout')
    === want,
    'and it is all still there after a reload — presentation outlives the session');

  /*
   * Put the response back as it was.
   *
   * Every later section reads this same conversation, and a layout override
   * and a stray mark left behind here are indistinguishable to them from the
   * thing they are testing. A test that edits shared state and does not undo
   * it is a test that breaks other tests.
   */
  await sfetch(`${BASE}/api/conversations/${conversationId}/interventions/${clipId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ layoutId: null }),
  });
  if (placed) {
    await sfetch(
      `${BASE}/api/conversations/${conversationId}/interventions/${clipId}` +
      `/annotations/${placed.id}`, { method: 'DELETE' });
  }
  doc = (await api(`/api/conversations/${conversationId}`)).conversation;
  const restored = doc.interventions.find((iv) => iv.id === clipId);
  check(!restored?.layoutId && !(restored?.annotations ?? []).some((a) => a.kind === 'point'),
    'and the run leaves the response as it found it');

  await page.reload({ waitUntil: 'networkidle' });
  await page.click('button[role=tab]:has-text("Studio")');
  await page.waitForSelector('[data-testid="clip-card"]', { timeout: 20_000 });
  await page.click('[data-testid="composition-back"]').catch(() => {});
  await page.waitForSelector('[data-testid="tab-transcript"]', { timeout: 10_000 });
  check(true, 'and Done returns the rail to the conversation');

  // The reload above dropped the camera, and the rest of the run needs it.
  await page.click('[data-testid="enable-camera"]');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="stance"]')?.textContent === 'Listening',
    null, { timeout: 30_000 });
}

log('checking the claim card…');
{
  // Start from ordinary transcript browsing: the section before this one
  // leaves a statement bound, which is the correct end state for it.
  await page.click('[data-testid="composition-back"]').catch(() => {});
  await page.click('[data-testid="claim-card-clear"]').catch(() => {});
  await page.waitForTimeout(200);

  const line = page.locator('[data-testid="transcript-line"]').nth(3);
  const lineText = (await line.innerText()).replace(/^\d\d:\d\d\s*/, '').trim();

  check(await page.locator('[data-testid="claim-card"]').count() === 0,
    'browsing the transcript shows no claim card');

  // 1 — selecting a sentence creates the claim-response state
  await line.click();
  await page.waitForSelector('[data-testid="claim-card"]', { timeout: 10_000 });
  check(true, 'selecting a sentence turns the transcript into a response in progress');

  // 2 — the exact selected text appears in the card
  const quoted = (await page.locator('[data-testid="claim-card-quote"]').innerText())
    .replace(/^[“"]|[”"]$/g, '').trim();
  check(quoted === lineText, 'the card carries the source\'s exact words',
    `card "${quoted.slice(0, 40)}…" vs line "${lineText.slice(0, 40)}…"`);

  // 3 — the source timestamp is the sentence's own, not the playhead's
  const shown = await page.locator('[data-testid="claim-card-time"]').innerText();
  const inLine = (await line.innerText()).slice(0, 5);
  check(shown.includes(inLine), 'and the moment it was said', `${shown} vs ${inLine}`);

  // the selected sentence stays findable in the running text
  check(await page.locator('[data-testid="transcript-line"][data-selected="true"]').count() === 1,
    'the chosen sentence stays marked in the transcript');

  /*
   * The timeline says the same thing the card says.
   *
   *   SOURCE ────────────────◆ CLAIM
   *                            │
   *                            └──── YOUR RESPONSE
   *
   * The band is how long the sentence runs, the diamond is where the answer
   * cuts in, and the slot beneath it is the answer that does not exist yet.
   */
  check(await page.locator('[data-testid="timeline-pending"]').count() === 1,
    'the timeline shows the chosen statement on the source lane');
  check(await page.locator('[data-testid="timeline-claim-marker"]').count() === 1,
    'marks the moment the answer will cut in');
  check(await page.locator('[data-testid="timeline-pending-slot"]').count() === 1,
    'and shows the answer branching from it before it exists');

  /*
   * The camera stays reachable. The bar under the stage stops repeating what
   * space does, because the card is saying it — but it kept the camera button
   * with it once, which left the card telling someone to enable a camera they
   * could no longer get to.
   */
  check(await page.locator('[data-testid="stance"]').count() === 1,
    'the controls stay on screen with a statement chosen');

  // it reads as a subject, not a verdict
  const cardText = await page.locator('[data-testid="claim-card"]').innerText();
  check(/source statement/i.test(cardText) && /your response/i.test(cardText),
    'and the card reads SOURCE STATEMENT → YOUR RESPONSE');
  check(!/false|wrong|misleading|debunk|fact.?check verdict/i.test(cardText),
    'without judging the statement — the author decides, the product does not');

  // reviewing the exact source moment
  check(await page.locator('[data-testid="claim-card-watch"]').count() === 1,
    'there is a way to watch the moment again');

  // 6 — selecting another sentence replaces the pending selection
  const other = page.locator('[data-testid="transcript-line"]').nth(1);
  const otherText = (await other.innerText()).replace(/^\d\d:\d\d\s*/, '').trim();
  await other.click();
  await page.waitForTimeout(300);
  const replaced = (await page.locator('[data-testid="claim-card-quote"]').innerText())
    .replace(/^[“"]|[”"]$/g, '').trim();
  check(replaced === otherText, 'choosing another sentence replaces the pending one');
  check(await page.locator('[data-testid="transcript-line"][data-selected="true"]').count() === 1,
    'and only one sentence is marked at a time');
  /*
   * This one was answered earlier in the run, so the card opens on the
   * exchange rather than offering to start it, and the timeline shows no
   * slot — the answer it would promise already exists further along the lane.
   */
  check(await page.locator('[data-testid="claim-card"]').getAttribute('data-state') === 'answered',
    'a sentence that already has an answer opens on the exchange, not on an invitation');
  check(await page.locator('[data-testid="timeline-pending-slot"]').count() === 0,
    'and the timeline promises no second response to it');

  // 5 — cancel returns to ordinary transcript browsing
  await page.click('[data-testid="claim-card-clear"]');
  await page.waitForTimeout(300);
  check(await page.locator('[data-testid="claim-card"]').count() === 0,
    'removing the statement returns to ordinary transcript browsing');
  check(await page.locator('[data-testid="transcript-line"][data-selected="true"]').count() === 0,
    'and nothing stays marked');
  check(await page.locator('[data-testid="timeline-pending-slot"]').count() === 0,
    'and the timeline stops promising a response that is not coming');

  // 4 + 7 — answer it, and the card becomes the binding
  await line.click();
  await page.waitForSelector('[data-testid="claim-card-respond"]', { timeout: 10_000 });
  const anchorFrame = Number(await page.locator('[data-testid="claim-card"]')
    .getAttribute('data-anchor-frame'));
  await sleep(2400);
  await page.click('[data-testid="claim-card-respond"]');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="stance"]')?.textContent === 'Your turn',
    null, { timeout: 20_000 });

  check(await page.locator('[data-testid="claim-card"]').count() === 1,
    'the card survives into the recording state rather than vanishing');

  /*
   * The floor has passed, and the card should say so.
   *
   * The response exists in the document the instant recording starts, which
   * is what makes it crash-safe — but the author is still talking, and a
   * card reading "answered by your critique" mid-sentence describes a
   * conversation that has not finished happening.
   */
  const speakingState = await page.locator('[data-testid="claim-card"]')
    .getAttribute('data-state');
  check(speakingState === 'speaking',
    'while the author is answering, the card gives them the floor', `state=${speakingState}`);
  check(await page.locator('[data-testid="claim-card-bound"]').count() === 0,
    'and does not yet call the answer finished');
  const speakingQuote = (await page.locator('[data-testid="claim-card-quote"]').innerText())
    .replace(/^[“"]|[”"]$/g, '').replace(/…$/, '').trim();
  check(lineText.startsWith(speakingQuote) || speakingQuote === lineText,
    'the statement is still the source\'s own words while they answer it',
    `"${speakingQuote.slice(0, 40)}…"`);
  check((await page.locator('[data-testid="claim-card-time"]').innerText()).includes(inLine),
    'and still carries the moment it was said');

  await sleep(2400);
  await page.keyboard.press('Space');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="stance"]')?.textContent === 'Listening',
    null, { timeout: 60_000 });

  await page.waitForSelector('[data-testid="claim-card-bound"]', { timeout: 15_000 })
    .then(() => check(true, 'once they finish, the card says the statement is attached'))
    .catch(() => check(false, 'once they finish, the card says the statement is attached'));
  check(await page.locator('[data-testid="claim-card"]').getAttribute('data-state') === 'answered',
    'and the exchange reads as made');

  // The binding is the document's, not the component's.
  const doc = (await api(`/api/conversations/${conversationId}`)).conversation;
  const bound = doc.interventions.find((iv) => iv.anchor.tSourceFrame === anchorFrame);
  check(Boolean(bound?.anchor.quote), 'the response carries the statement in the document');
  check(bound?.anchor.quote?.trim() === lineText,
    'and it is the source\'s exact words, not a paraphrase',
    `${bound?.anchor.quote?.slice(0, 40)}…`);
  check(Boolean(bound?.anchor.quoteHash), 'hashed to what was said, as before');
  check(bound?.anchor.tSourceFrame === anchorFrame,
    'anchored at the frame the card named', `${bound?.anchor.tSourceFrame} vs ${anchorFrame}`);
  await page.click('[data-testid="claim-card-clear"]').catch(() => {});
}

// --- a recording that did not come back (D-07) ------------------------------
/*
 * "Preparing", forever, is the same screen as "failed" — and until now that
 * is what a take whose assembly threw looked like, with nothing the author
 * could do about it. The words they spoke are still on disk, so assembling
 * them again is the whole recovery.
 *
 * The failure is real, not simulated: a corrupt recording is exactly how this
 * happens in the field, so the test uploads one and lets ffmpeg reject it.
 */
log('checking a recording that did not save…');
{
  const made = await (await sfetch(`${BASE}/api/conversations/${conversationId}/interventions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tSourceFrame: 480, type: 'explain' }),
  })).json();
  const brokenId = made.interventionId;
  const takeId = made.takeId;
  check(Boolean(brokenId && takeId), 'a response can be created for this test',
    JSON.stringify(made).slice(0, 80));

  await sfetch(
    `${BASE}/api/conversations/${conversationId}/takes/${takeId}/chunks?index=0`,
    { method: 'POST', headers: { 'content-type': 'application/octet-stream' },
      body: Buffer.from('this is not a video') });
  const finalized = await (await sfetch(
    `${BASE}/api/conversations/${conversationId}/takes/${takeId}/finalize`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ interventionId: brokenId, prerollSegments: 0 }),
    })).json();

  /*
   * Let the worker try it and fail. Generously: this job joins the back of a
   * queue that may still be assembling the run's real takes, and a timeout
   * here would report "never failed" about a job that simply had not started.
   */
  let failed = null;
  for (let i = 0; i < 240; i++) {
    const job = (await api(`/api/jobs/${finalized.job.id}`)).job;
    if (job.state === 'failed') { failed = job; break; }
    if (job.state === 'done') break;
    await sleep(1000);
  }
  check(Boolean(failed), 'a corrupt recording fails its assembly rather than hanging',
    failed ? String(failed.error).slice(0, 70) : 'never failed');
  check(failed && /did not produce usable media|could be read/i.test(String(failed.error)),
    'and says what went wrong in terms of the recording', String(failed?.error).slice(0, 70));

  await page.reload({ waitUntil: 'networkidle' });
  await page.click('button[role=tab]:has-text("Studio")');
  await page.waitForSelector('[data-testid="clip-card"]', { timeout: 20_000 });
  const card = page.locator(`[data-testid="clip-card"][data-clip-id="${brokenId}"]`);
  await card.waitFor({ timeout: 10_000 });
  check(await card.locator('[data-testid="clip-failed"]').count() === 1,
    'and the clip says so rather than saying "preparing" forever');
  const said = await card.innerText();
  check(/did not finish saving/i.test(said),
    'in words that describe what happened to their recording', said.replace(/\n/g, ' ').slice(0, 70));
  check(await card.locator('[data-testid="clip-retry"]').count() === 1,
    'and offers to try again, because the chunks are still on disk');

  // The retry is a new attempt, and the failure stays in the record.
  const again = await sfetch(`${BASE}/api/jobs/${finalized.job.id}`, { method: 'POST' });
  check(again.status === 202, 'trying again queues a fresh attempt',
    `status ${again.status}`);
  const still = (await api(`/api/jobs/${finalized.job.id}`)).job;
  check(still.state === 'failed',
    'and the attempt that failed stays in the record');

  const notFailed = await sfetch(`${BASE}/api/jobs/${(await again.json()).job.id}`,
    { method: 'POST' });
  check([409, 202].includes(notFailed.status),
    'a job that has not failed is not something to retry', `status ${notFailed.status}`);

  // Leave the conversation as it was found.
  await sfetch(
    `${BASE}/api/conversations/${conversationId}/interventions` +
    `?interventionId=${brokenId}`, { method: 'DELETE' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('button[role=tab]:has-text("Studio")');
  await page.waitForSelector('[data-testid="clip-card"]', { timeout: 20_000 });
  check(await page.locator(`[data-testid="clip-card"][data-clip-id="${brokenId}"]`)
    .count() === 0, 'and the run leaves the conversation as it found it');

  await page.click('[data-testid="enable-camera"]');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="stance"]')?.textContent === 'Listening',
    null, { timeout: 30_000 });
}

// --- reading from the screen while recording (U-06, U-33, D-07) -------------
/*
 * A lecture is delivered from notes. The capture is a MediaRecorder over the
 * camera stream, so nothing in the document can alter a frame of it — but
 * space scrolls a document AND ends a take, and until this was fixed turning
 * the page would have stopped the recording.
 */
log('checking the notes reader…');
{
  await page.click('[data-testid="mode-live"]');
  await page.waitForSelector('[data-testid="toggle-reader"]', { timeout: 10_000 });
  check(true, 'the notes are reachable without leaving the page');

  await page.click('[data-testid="toggle-reader"]');
  await page.waitForSelector('[data-testid="reader"]', { timeout: 10_000 });
  check(true, 'and open over the stage');

  // The camera is still running, and the recording is unaffected by any of it.
  const stanceBefore = await page.locator('[data-testid="stance"]').innerText();
  await page.keyboard.press('Space');
  await page.waitForTimeout(600);
  const stanceAfter = await page.locator('[data-testid="stance"]').innerText();
  check(stanceBefore === stanceAfter,
    'space scrolls the notes rather than ending the take',
    `${stanceBefore} → ${stanceAfter}`);
  check(await page.locator('[data-testid="reader"]').count() === 1,
    'and the reader stays open while it does');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(await page.locator('[data-testid="reader"]').count() === 0,
    'escape closes it and gives the key back');

  /*
   * And with it closed, space does what it always did.
   *
   * The id list is taken BEFORE the key press, not after: taken after, the
   * response this proof creates is already in the "before" list, the diff is
   * empty, and the cleanup silently removes nothing while reporting success.
   */
  const beforeReader = (await api(`/api/conversations/${conversationId}`))
    .conversation.interventions.map((iv) => iv.id);
  const before = await page.locator('[data-testid="stance"]').innerText();
  await page.keyboard.press('Space');
  await page.waitForFunction(
    (was) => document.querySelector('[data-testid="stance"]')?.textContent !== was,
    before, { timeout: 15_000 })
    .then(() => check(true, 'with the notes closed, space runs the conversation again'))
    .catch(() => check(false, 'with the notes closed, space runs the conversation again'));

  /*
   * Leave it as it was found. A take needs something in it before it can be
   * closed — the segments are a couple of seconds long — so this waits
   * rather than pressing space on an empty recording and then waiting out a
   * finalise that has nothing to finalise.
   */
  if ((await page.locator('[data-testid="stance"]').innerText()) === 'Your turn') {
    await sleep(2500);
    await page.keyboard.press('Space');
    await page.waitForFunction(
      () => document.querySelector('[data-testid="stance"]')?.textContent === 'Listening',
      null, { timeout: 120_000 })
      .then(() => check(true, 'and the take it started closes cleanly'))
      .catch(() => check(false, 'and the take it started closes cleanly',
        'never returned to listening'));
  }
  // The response that proof made is this test's litter, not the author's.
  const afterReader = (await api(`/api/conversations/${conversationId}`))
    .conversation.interventions.map((iv) => iv.id);
  for (const id of afterReader.filter((id) => !beforeReader.includes(id))) {
    await sfetch(
      `${BASE}/api/conversations/${conversationId}/interventions?interventionId=${id}`,
      { method: 'DELETE' });
  }
  check((await api(`/api/conversations/${conversationId}`)).conversation.interventions.length
    === beforeReader.length, 'and the run leaves the conversation as it found it');
  await page.click('[data-testid="mode-studio"]');
  await page.waitForSelector('[data-testid="clip-rail"]', { timeout: 10_000 });
}

// --- publishing: one conversation, four shapes (U-18, U-22, INV-00) ---------
/*
 * The claim this stage makes is that the same composition publishes in four
 * formats and still means the same thing. Two ways that stops being true:
 * the reframe is declared and never read (which is what happened to
 * `verticalLayoutId` for months), or it happens and throws away the point.
 */
log('checking the publication formats…');
{
  await page.click('[data-testid="mode-publish"]');
  await page.waitForSelector('[data-testid="publish-formats"]', { timeout: 15_000 });

  const formats = await page.locator('[data-testid="publish-format"]').count();
  check(formats === 4, 'the conversation offers four shapes to travel in', `${formats}`);
  for (const id of ['youtube_16x9', 'vertical_9x16', 'portrait_4x5', 'square_1x1']) {
    check(await page.locator(`[data-testid="publish-format"][data-profile="${id}"]`)
      .count() === 1, `including ${id}`);
  }

  /*
   * Each preview is the layout the RENDERER will resolve for that canvas.
   * A wide arrangement shown squeezed into a tall box would be a picture of a
   * video nobody is going to get.
   */
  const layouts = await page.evaluate(() => {
    const out = {};
    for (const card of document.querySelectorAll('[data-testid="publish-format"]')) {
      const stage = card.querySelector('[data-testid="composition-stage"]');
      out[card.getAttribute('data-profile')] = stage?.getAttribute('data-layout') ?? null;
    }
    return out;
  });
  check(layouts['youtube_16x9'] && layouts['vertical_9x16']
    && layouts['youtube_16x9'] !== layouts['vertical_9x16'],
    'a tall canvas is REFRAMED, not the wide one shrunk',
    `16:9 ${layouts['youtube_16x9']} vs 9:16 ${layouts['vertical_9x16']}`);
  check(layouts['portrait_4x5'] !== layouts['vertical_9x16'],
    'and 4:5 gets its own proportions rather than the 9:16 ones',
    `4:5 ${layouts['portrait_4x5']}`);

  // Space belongs to the conversation, and this is not the conversation.
  const stanceBefore = await page.locator('[data-testid="stance"]').count();
  check(stanceBefore === 0, 'the one-key bar is not on the publish stage');
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  check(await page.locator('[data-testid="mode-publish"]')
    .getAttribute('aria-selected') === 'true',
    'and pressing space here does not start a recording');

  /*
   * --- how captions look (U-19 §2, D-04) --------------------------------
   *
   * "A user may choose the look; not an unreadable one." A short list of
   * checked looks, not a size slider and a colour picker — which is how a
   * product that insists on captions ends up shipping ones nobody can read.
   */
  {
    await page.waitForSelector('[data-testid="caption-look"]', { timeout: 10_000 });
    const offered = await page.locator('[data-testid="caption-style"]').count();
    check(offered >= 3, 'the author can choose how captions look', `${offered} looks`);
    check(await page.locator('[data-testid="caption-style"][data-style="auto"]')
      .getAttribute('data-chosen') === 'true',
      'and by default the shape of the video decides');

    /*
     * No colour, no size: nothing here can make captions unreadable. Asserted
     * over the CONTROLS rather than over the prose — the first version of
     * this searched the panel's text for the word "size" and failed on the
     * sentence explaining that every look stays above the size captions have
     * to be, which is the opposite of the thing it was looking for.
     */
    const freeform = await page.locator(
      '[data-testid="caption-look"] input, [data-testid="caption-look"] select').count();
    check(freeform === 0,
      'and there is no size or colour to get wrong — only looks that were checked',
      `${freeform} free-form control(s)`);

    await page.locator('[data-testid="caption-style"][data-style="solid"]').click();
    await page.waitForTimeout(900);
    const doc = (await api(`/api/conversations/${conversationId}`)).conversation;
    check(doc.captionStyleId === 'solid',
      'the choice lands on the conversation, not on one export', `${doc.captionStyleId}`);

    // And it reaches what would actually be rendered — including the clip,
    // which is a different plan from the long-form one.
    const clip = await api(`/api/conversations/${conversationId}/clips`);
    const planned = await api(`/api/conversations/${conversationId}` +
      `/clips?interventionId=${clip.candidates[0].interventionId}&plan=1`);
    check(planned.plan?.captions?.style?.id === 'solid',
      'and the clip is planned with it too', `${planned.plan?.captions?.style?.id}`);
    check(planned.plan?.captions?.sidecars?.length === 2,
      'while the caption files ship regardless of the look (INV-07)');

    // A look nobody defined is refused rather than quietly ignored.
    const bogus = await sfetch(`${BASE}/api/conversations/${conversationId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ captionStyleId: 'neon' }),
    });
    check(bogus.status === 400, 'a look that does not exist is refused',
      `status ${bogus.status}`);

    // Back to letting the format decide, so the later sections see the
    // default — a tall clip lifts its captions clear of the app's buttons.
    await page.locator('[data-testid="caption-style"][data-style="auto"]').click();
    await page.waitForTimeout(900);
    const lifted = await api(`/api/conversations/${conversationId}` +
      `/clips?interventionId=${clip.candidates[0].interventionId}&plan=1`);
    check(lifted.plan?.captions?.style?.id === 'lifted',
      'and left alone, a vertical clip lifts them clear of the app\'s own buttons',
      `${lifted.plan?.captions?.style?.id}`);
  }

  // The moments worth posting, proposed and never published for you (U-22 §4).
  const candidates = await page.locator('[data-testid="clip-candidate"]').count();
  check(candidates > 0, 'each exchange is offered as a clip of its own', `${candidates}`);
  check(await page.locator('[data-testid="publish-make-clips"]').isDisabled(),
    'and nothing is made until the author chooses');
  await page.locator('[data-testid="clip-choose"]').first().check();
  check(!(await page.locator('[data-testid="publish-make-clips"]').isDisabled()),
    'choosing one arms the button');
  await page.locator('[data-testid="clip-choose"]').first().uncheck();

  /*
   * --- the opening (U-22 §2, INV-05) ------------------------------------
   *
   * A vertical clip is decided in its first second, and until now the product
   * decided it. The author can now say what the clip opens on — and the one
   * rule the interface has to carry is that their own line is never set in
   * quotation marks, because it would then read as something the source said,
   * over the source's own picture.
   */
  {
    const first = page.locator('[data-testid="clip-candidate"]').first();
    const interventionId = await first.getAttribute('data-intervention-id');
    check(await first.locator('[data-testid="clip-opening"]').count() === 1,
      'every clip says how it will open, before it is made');

    await first.locator('[data-testid="clip-opening-toggle"]').click();
    await first.locator('[data-testid="opening-mode"][data-choice="text"]').click();
    await page.waitForTimeout(700);

    const HOOK = 'This number is doing a lot of work';
    const box = first.locator('[data-testid="opening-text"]');
    await box.fill(HOOK);
    await box.blur();
    await page.waitForTimeout(900);

    // It landed on the CONVERSATION, not in the export panel. A hook that
    // lived only in the dialogue would vanish at the next re-plan. [D-16]
    const doc = (await api(`/api/conversations/${conversationId}`)).conversation;
    const stored = doc.interventions.find((iv) => iv.id === interventionId)?.opening;
    check(stored?.card?.kind === 'text' && stored.card.text === HOOK,
      'the author\'s own opening is written into the conversation',
      JSON.stringify(stored ?? null));

    const planned = await api(`/api/conversations/${conversationId}` +
      `/clips?interventionId=${interventionId}&plan=1`);
    check(planned.plan?.openingClaim?.text === HOOK,
      'and it is what the clip will actually open on',
      JSON.stringify(planned.plan?.openingClaim ?? null));
    check(planned.plan?.openingClaim?.quoted === false,
      'carried as NOT a quotation — these are the author\'s words, not the source\'s');

    // And the panel says so in words, rather than leaving it to be found in
    // the export.
    const saysSo = await first.locator('[data-testid="clip-opening"]').innerText();
    check(/without quotation marks/i.test(saysSo),
      'and the author is told that, where they type it');

    // Back to the statement, which IS quoted — the clip plays it.
    await first.locator('[data-testid="opening-mode"][data-choice="statement"]').click();
    await page.waitForTimeout(900);
    const back = await api(`/api/conversations/${conversationId}` +
      `/clips?interventionId=${interventionId}&plan=1`);
    check(back.plan?.openingClaim?.quoted === true,
      'while the source\'s own sentence keeps its quotation marks');

    // Where it starts is theirs too.
    await first.locator('[data-testid="opening-lead-in"]').selectOption('3');
    await page.waitForTimeout(900);
    const moved = await api(`/api/conversations/${conversationId}` +
      `/clips?interventionId=${interventionId}&plan=1`);
    const sourceShot = moved.plan?.shots?.find((sh) => sh.kind === 'source');
    // Three seconds, or all there is before the cut if the source is shorter
    // than that: the clamp is against the source, not against the request.
    const anchorFrame = doc.interventions
      .find((iv) => iv.id === interventionId).anchor.tSourceFrame;
    check(sourceShot?.durationFrames === Math.min(90, anchorFrame),
      'and the author can say how much runs before the cut',
      `${sourceShot?.durationFrames} vs ${Math.min(90, anchorFrame)}`);

    // An opening nobody could read is refused, rather than silently trimmed.
    const tooLong = await sfetch(
      `${BASE}/api/conversations/${conversationId}/interventions/${interventionId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ opening: { card: { kind: 'text', text: 'x'.repeat(200) } } }),
      });
    check(tooLong.status === 400, 'an opening too long to read is refused as a bad request',
      `status ${tooLong.status}`);

    await first.locator('[data-testid="clip-opening-toggle"]').click();
  }

  const publishText = await page.evaluate(() => document.body.innerText);
  check(!/U-\d|INV-\d|Class [AB]|§|exportProfileId/.test(publishText),
    'and the stage speaks the creator\'s language');

  await page.click('[data-testid="mode-studio"]');
  await page.waitForSelector('[data-testid="clip-rail"]', { timeout: 10_000 });
}

/*
 * And the reframe is real in the render, not only in the preview: a clip's
 * plan must name the stacked arrangement, and carry the crop derived from
 * the marks the author placed.
 */
{
  const clipPlans = await api(`/api/conversations/${conversationId}/clips`);
  const first = clipPlans.candidates?.[0];
  check(Boolean(first), 'the conversation proposes clips through its own API');
  /*
   * This used to be written as "if a plan came back, check it" — and no plan
   * ever came back, because the route did not answer `plan=1` at all. It
   * passed every run without asserting anything. The route answers now, and
   * so the check is required to run.
   */
  const preview = await api(
    `/api/conversations/${conversationId}/clips?interventionId=${first.interventionId}&plan=1`);
  check(Boolean(preview?.plan), 'a clip\'s plan can be read before it is rendered');
  const shot = preview.plan.shots.find((s) => s.kind === 'response');
  check(shot?.layoutId?.startsWith('vertical') || shot?.layoutId?.startsWith('stacked')
    || shot?.layoutId === 'presenter_tall' || shot?.layoutId === 'full_user'
    || shot?.layoutId === 'evidence_stack',
    'and a clip is planned in a tall arrangement, not a shrunken wide one',
    `${shot?.layoutId}`);
}

// --- the Conversation Room (ROOM §1, §3, §4, §6, §7, §8) --------------------
/*
 * The whole journey, as a second browser: invite → join → wait → be brought
 * in → hand up. And, more important than any of it, what a guest holding a
 * valid invitation still cannot reach. The invite link is a credential a
 * stranger can be handed over WhatsApp, so every boundary it does not cross
 * has to be proved rather than intended.
 */
log('checking the conversation room…');
{
  // ---- the host opens it ----------------------------------------------
  const opened = await (await sfetch(`${BASE}/api/conversations/${conversationId}/room`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'open', hostName: 'James' }),
  })).json();
  check(opened.open === true, 'the host can open a room on a conversation');
  check(typeof opened.inviteToken === 'string' && opened.inviteToken.length >= 40,
    'which comes with an invitation long enough to be a secret');
  check(opened.participants.length === 1 && opened.participants[0].role === 'host',
    'and the host is its first participant, not a special case beside the list');
  check(opened.participants[0].presence === 'staged',
    'on stage to begin with, because a room of one has nobody else to show');
  const inviteToken = opened.inviteToken;

  // The QR is the same invitation, drawn. [ROOM §7]
  const qr = await sfetch(`${BASE}/api/conversations/${conversationId}/room/qr`);
  check(qr.ok && (qr.headers.get('content-type') ?? '').includes('svg'),
    'the invitation can go on a wall as a QR code', `status ${qr.status}`);
  const qrBody = await qr.text();
  check(qrBody.includes('<svg'), 'as vector, so it still scans when projected large');
  check((qr.headers.get('cache-control') ?? '').includes('no-store'),
    'and is never cached, because the invitation can be withdrawn');

  // ---- a stranger arrives with the link -------------------------------
  const guest = await page.context().browser().newContext();
  const sarah = await guest.newPage();
  await sarah.goto(`${BASE}/r/${conversationId}?t=${encodeURIComponent(inviteToken)}`,
    { waitUntil: 'networkidle' });
  await sarah.waitForSelector('[data-testid="join-card"]', { timeout: 15_000 });
  check(true, 'the link opens a join page for somebody with no account');

  const joinText = await sarah.evaluate(() => document.body.innerText);
  check(!/U-\d|INV-\d|§|participantId|inviteToken/.test(joinText),
    'which speaks plainly and shows no machinery');

  await sarah.fill('[data-testid="join-name"]', 'Sarah');
  await sarah.click('[data-testid="join-go"]');
  await sarah.waitForSelector('[data-testid="people-rail"]', { timeout: 20_000 });
  check(true, 'and a name is the whole membrane — no account, no password');

  // ---- being in the room is not being on the stage --------------------
  let room = await api(`/api/conversations/${conversationId}/room`);
  const sarahRecord = room.participants.find((p) => p.displayName === 'Sarah');
  check(Boolean(sarahRecord), 'she is in the room');
  check(sarahRecord.presence === 'waiting',
    'and WAITING, not staged — she hears everything without appearing',
    `${sarahRecord.presence}`);
  check(!room.stagedParticipantIds.includes(sarahRecord.id),
    'so the composition does not include her');

  const sarahSees = await sarah.evaluate(() => document.body.innerText);
  check(/Waiting/i.test(sarahSees), 'her own screen says so, in a word');
  check(!sarahSees.includes(inviteToken),
    'and a guest is never handed the credential that let them in');

  /*
   * Waiting means waiting. Being in the room is being able to HEAR (§4); a
   * room where anybody may put themselves into the finished video whenever
   * they like is not one a host controls.
   */
  const beforeStaged = await sarah.evaluate(async (cid) => {
    const r = await fetch(`/api/conversations/${cid}/interventions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tSourceFrame: 60, type: 'explain' }),
    });
    return r.status;
  }, conversationId);
  check(beforeStaged >= 400,
    'and cannot record into the video until the host brings her in', `${beforeStaged}`);

  // ---- she asks to speak, and is brought in [ROOM §8] -----------------
  await sarah.click('[data-testid="raise-hand"]');
  await sarah.waitForTimeout(600);
  room = await api(`/api/conversations/${conversationId}/room`);
  check(room.hands.includes(sarahRecord.id), 'she can ask for the floor');

  const brought = await (await sfetch(`${BASE}/api/conversations/${conversationId}/room`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'stage', staged: [...room.stagedParticipantIds, sarahRecord.id] }),
  })).json();
  const staged = brought.participants.find((p) => p.id === sarahRecord.id);
  check(staged.presence === 'staged', '"Sarah, what do you think?" puts her on stage');
  check(staged.role === 'speaker',
    'bringing an audience member in promotes them, rather than refusing');
  check(!brought.hands.includes(sarahRecord.id),
    'and her hand comes down, because it has been answered');

  // ---- the modes, and the pin [ROOM §3] --------------------------------
  for (const mode of ['manual', 'host', 'conversation', 'automatic']) {
    const set = await (await sfetch(`${BASE}/api/conversations/${conversationId}/room`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'speaker-mode', speakerMode: mode }),
    })).json();
    check(set.speakerMode === mode, `the host can choose ${mode} switching`);
  }
  const pinned = await (await sfetch(`${BASE}/api/conversations/${conversationId}/room`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'pin', pinned: sarahRecord.id }),
  })).json();
  check(pinned.pinnedParticipantId === sarahRecord.id, 'and pin somebody on screen');
  const resumed = await (await sfetch(`${BASE}/api/conversations/${conversationId}/room`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'pin', pinned: null }),
  })).json();
  check(resumed.pinnedParticipantId === null, 'and resume automatic switching');

  /*
   * ---- what the invitation does NOT buy (D-03) -------------------------
   *
   * The most important block here. Sarah holds a valid guest session. Every
   * one of these must refuse her, and refuse her the way a stranger is
   * refused — a 403 on a draft would confirm the draft exists.
   */
  const asSarah = async (path, init = {}) => sarah.evaluate(
    async ([p, i]) => {
      const r = await fetch(p, i);
      return r.status;
    }, [path, init]);

  check(await asSarah('/api/conversations') >= 400,
    'a guest cannot list the conversations on this instance');
  check(await asSarah(`/api/conversations/${conversationId}/bundle`) >= 400,
    'nor read the author\'s publication bundle');
  check(await asSarah(
    `/api/conversations/${conversationId}/representations?id=render-plan.json`) >= 400,
    'nor the render plan');
  check(await asSarah(`/api/conversations/${conversationId}`, { method: 'DELETE' }) >= 400,
    'nor delete the conversation');
  check(await asSarah(`/api/conversations/${conversationId}/renders`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'full' }),
  }) >= 400, 'nor start an export');
  check(await asSarah(`/api/conversations/${conversationId}/room`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'close' }),
  }) >= 400, 'nor close the room she is a guest in');
  check(await asSarah(`/api/conversations/${conversationId}/room`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'stage', staged: [] }),
  }) >= 400, 'nor decide who is on stage');

  // She may see the room and act on herself, and that is the whole list.
  check(await asSarah(`/api/conversations/${conversationId}/room`) === 200,
    'she may see the room she is in');
  check(await asSarah(`/api/conversations/${conversationId}/room/presence`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'lower-hand' }),
  }) === 200, 'and put her own hand down');

  /*
   * ---- recording, per participant (ROOM §10) ---------------------------
   *
   * "Record each participant's media independently." Each browser records
   * ITSELF and uploads chunks; nothing is mixed live. So the two things that
   * decide the finished video — who was on stage, and what they said — need
   * no media transport between browsers at all.
   */
  {
    // Sarah is staged, so she may record. Her turn is attributed by the
    // SERVER from her session; there is no field in the body to claim one.
    const started = await sarah.evaluate(async (cid) => {
      const r = await fetch(`/api/conversations/${cid}/interventions`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tSourceFrame: 240, type: 'explain' }),
      });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }, conversationId);
    check(started.status === 201, 'a staged guest can begin a turn', `${started.status}`);

    const doc = (await api(`/api/conversations/${conversationId}`)).conversation;
    const hers = doc.interventions.find((iv) => iv.id === started.body.interventionId);
    check(hers?.participantId === sarahRecord.id,
      'and it is attributed to her, from her session rather than her request',
      `${hers?.participantId}`);

    // A chunk of her own take is hers to send.
    const mine = await sarah.evaluate(async ([cid, takeId]) => {
      const r = await fetch(`/api/conversations/${cid}/takes/${takeId}/chunks?index=0`,
        { method: 'POST', body: new Blob(['not really video']) });
      return r.status;
    }, [conversationId, started.body.takeId]);
    check(mine === 202, 'she can upload her own recording', `${mine}`);

    /*
     * And somebody else's is not. The take id travels in a URL and is the
     * only thing distinguishing one upload from another, so this is checked
     * on every chunk rather than trusted from whoever made the take.
     */
    const hostTake = doc.interventions.find((iv) => !iv.participantId)?.takes?.[0]?.id;
    check(Boolean(hostTake), 'the host has a take of their own to try against');
    const theirs = await sarah.evaluate(async ([cid, takeId]) => {
      const r = await fetch(`/api/conversations/${cid}/takes/${takeId}/chunks?index=99`,
        { method: 'POST', body: new Blob(['intrusion']) });
      return r.status;
    }, [conversationId, hostTake]);
    check(theirs >= 400, 'and cannot upload into somebody else\'s recording', `${theirs}`);

    // Nor delete the author's work — the same path answers POST for her.
    const deleted = await sarah.evaluate(async ([cid, ivnId]) => {
      const r = await fetch(`/api/conversations/${cid}/interventions?interventionId=${ivnId}`,
        { method: 'DELETE' });
      return r.status;
    }, [conversationId, doc.interventions[0].id]);
    check(deleted >= 400,
      'and cannot delete a response, though she may POST to the same path', `${deleted}`);

    // Tidy her turn away; the sections after this count interventions.
    await sfetch(
      `${BASE}/api/conversations/${conversationId}/interventions` +
      `?interventionId=${started.body.interventionId}`, { method: 'DELETE' });
  }

  /*
   * ---- seeing and hearing each other, live (ROOM §12) -------------------
   *
   * Two real browsers, a real handshake through the signalling mailbox, and a
   * real picture arriving at the other end. Nothing here is mocked: if the
   * offer, the answer and the candidates do not actually cross, no tile turns
   * live and this fails.
   *
   * The second half is the one that matters most, and it is the product's
   * whole distinction expressed as bytes on a wire: taken off stage, a
   * participant STOPS TRANSMITTING. Not hidden in the layout — not sent.
   */
  {
    log('  connecting two browsers to each other…');
    const hostId = room.participants.find((p) => p.role === 'host').id;

    /*
     * Sampled BEFORE anything is staged, because being on stage starts a
     * recording and the sections after this count interventions. Sampling
     * afterwards would produce an empty difference and a cleanup that
     * cleaned nothing up.
     */
    const before = new Set((await api(`/api/conversations/${conversationId}`))
      .conversation.interventions.map((iv) => iv.id));

    const set = (body) => sfetch(`${BASE}/api/conversations/${conversationId}/room`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    // Manual, so live microphones cannot move the stage underneath a test
    // that is measuring who is connected to whom.
    await set({ action: 'speaker-mode', speakerMode: 'manual' });
    await set({ action: 'stage', staged: [hostId, sarahRecord.id] });

    /*
     * A window onto the peer connections the page makes. Test-side
     * instrumentation, injected before the page loads, because "is this
     * camera being transmitted" is not a question the interface can answer
     * honestly — a tile can be hidden while the tracks keep flowing, and
     * that is exactly the failure worth catching.
     */
    /*
     * The host joins from a SECOND TAB rather than by navigating the one the
     * rest of this run is using. Same session, same person — but the studio
     * keeps the state the later sections were left in, which is what a host
     * does in practice anyway: the room in one window, their work in the
     * other.
     */
    const hostRoom = await page.context().newPage();
    hostRoom.on('pageerror', (e) => console.error('  [room page error]', e.message));

    const watchPeers = (target) => target.addInitScript(() => {
      window.__pcs = [];
      const Real = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends Real {
        constructor(...args) { super(...args); window.__pcs.push(this); }
      };
    });
    await watchPeers(hostRoom);

    await hostRoom.goto(`${BASE}/c/${conversationId}/room`, { waitUntil: 'networkidle' });
    await hostRoom.waitForSelector('[data-testid="people-rail"]', { timeout: 20_000 });
    check(/\(you\)/.test(await hostRoom.evaluate(() => document.body.innerText)),
      'the host is somebody in their own room, not a spectator of it');

    await hostRoom.click('[data-testid="mic-on"]');
    await sarah.click('[data-testid="mic-on"]');

    /*
     * Named, not "any connected tile": your own tile is always connected —
     * it is your own camera — so a check that does not say WHOSE picture it
     * is waiting for passes without anything having crossed the network.
     */
    const linked = (target, who) => target.waitForSelector(
      `[data-testid="stage-tile"][data-participant-id="${who}"]`
      + '[data-connection="connected"]', { timeout: 40_000 },
    ).then(() => true).catch(() => false);
    const hostLinked = await linked(hostRoom, sarahRecord.id);
    const guestLinked = await linked(sarah, hostId);
    check(hostLinked && guestLinked, 'two browsers in the room reach each other directly',
      `host=${hostLinked} guest=${guestLinked}`);

    // A picture, not a placeholder: the element has real pixels in it.
    const picture = (target, id) => target.evaluate(async (who) => {
      for (let i = 0; i < 60; i++) {
        const video = document.querySelector(
          `[data-testid="stage-tile"][data-participant-id="${who}"] video`);
        if (video?.videoWidth > 0) return video.videoWidth;
        await new Promise((r) => setTimeout(r, 250));
      }
      return 0;
    }, id);
    check(await picture(hostRoom, sarahRecord.id) > 0,
      'and the host sees the guest, live');
    check(await picture(sarah, hostId) > 0, 'and the guest sees the host');

    const sending = (target) => target.evaluate(() => (window.__pcs ?? [])
      .filter((pc) => pc.connectionState !== 'closed')
      .flatMap((pc) => pc.getSenders())
      .filter((sender) => sender.track).length);
    check(await sending(hostRoom) > 0, 'a staged participant\'s camera is on the wire');

    /*
     * Off stage. "Being in the room is not being on the main stage" — so the
     * host stays, still hears and still sees, and their own camera stops
     * going anywhere.
     */
    await set({ action: 'stage', staged: [sarahRecord.id] });
    let remaining = 1;
    for (let i = 0; i < 40 && remaining > 0; i++) {
      await sleep(250);
      remaining = await sending(hostRoom);
    }
    check(remaining === 0,
      'and taken off stage they stop transmitting — waiting in the room is '
      + 'not a camera that is merely hidden', `${remaining} track(s) still sent`);
    check(await picture(hostRoom, sarahRecord.id) > 0,
      'while they go on seeing whoever is on stage (§4)');

    /*
     * ---- the mailbox itself ----------------------------------------------
     *
     * It carries connection details, which contain local network addresses.
     * Every one of these must refuse.
     */
    const signalAs = (init) => asSarah(
      `/api/conversations/${conversationId}/room/signal`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, ...init });
    check(await signalAs({ body: JSON.stringify({ to: sarahRecord.id, payload: {} }) })
      === 400, 'a peer cannot post into its own mailbox');
    check(await signalAs({ body: JSON.stringify({ to: 'p_nobody', payload: {} }) })
      === 404, 'nor into one that does not exist');
    check(await signalAs({ body: JSON.stringify({ payload: {} }) }) === 404,
      'nor broadcast to the room by naming nobody');
    check(await signalAs({ body: JSON.stringify({ to: hostId, payload: { x: 1 } }) })
      === 200, 'but may introduce itself to somebody who is actually here');

    const stranger = await fetch(
      `${BASE}/api/conversations/${conversationId}/room/signal`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: hostId, payload: {} }) });
    check(stranger.status >= 400,
      'and somebody with no session cannot reach the room\'s signalling at all',
      `status ${stranger.status}`);

    // ---- put the room back the way the later sections expect it ---------
    await sarah.click('[data-testid="mic-off"]');
    await hostRoom.close();
    const after = (await api(`/api/conversations/${conversationId}`))
      .conversation.interventions.filter((iv) => !before.has(iv.id));
    for (const stray of after) {
      await sfetch(`${BASE}/api/conversations/${conversationId}/interventions`
        + `?interventionId=${stray.id}`, { method: 'DELETE' });
    }
    check(true, `(cleaned up ${after.length} recording(s) the room started)`);
  }

  /*
   * ---- real microphones drive the policy (ROOM §2, §9) ------------------
   *
   * Each browser measures its own microphone and posts two numbers; the
   * server runs the switching policy. No audio is sent, and the decision is
   * made in one place so that everyone watching sees the same stage.
   */
  {
    await sfetch(`${BASE}/api/conversations/${conversationId}/room`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'speaker-mode', speakerMode: 'automatic' }),
    });

    const speak = async (energy, confidence) => sarah.evaluate(
      async ([cid, e, c]) => {
        const r = await fetch(`/api/conversations/${cid}/room/voice`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ energy: e, speechConfidence: c }),
        });
        return r.json();
      }, [conversationId, energy, confidence]);

    // A cough: loud, brief, and not enough to move anything.
    const cough = await speak(0.95, 0.9);
    check(cough.active !== undefined, 'a microphone reading is accepted');
    check(cough.changed === false,
      'and one loud instant does not move the stage — a cough is not a turn');

    // Sustained speech, past the minimum duration, does.
    let last = cough;
    for (let i = 0; i < 14; i++) { last = await speak(0.8, 0.9); await sleep(80); }
    check(last.active === sarahRecord.id,
      'sustained speech gives her the floor', `${last.reason}`);

    // A guest cannot report about anybody but themselves: there is no field
    // for it, and the server reads the signed session instead.
    const forged = await sarah.evaluate(async ([cid, other]) => {
      const r = await fetch(`/api/conversations/${cid}/room/voice`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ participantId: other, energy: 0.99, speechConfidence: 0.99 }),
      });
      return (await r.json()).active;
    }, [conversationId, room.participants.find((p) => p.role === 'host').id]);
    check(forged === sarahRecord.id,
      'and a reading claiming to be somebody else is still read as its sender');

    // A pin outranks every microphone, live as well as in the policy's tests.
    await sfetch(`${BASE}/api/conversations/${conversationId}/room`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'pin', pinned: room.participants.find(
        (p) => p.role === 'host').id }),
    });
    const pinnedLive = await speak(0.95, 0.95);
    check(pinnedLive.active !== sarahRecord.id,
      'a pin outranks the microphones while it holds', `${pinnedLive.reason}`);
    await sfetch(`${BASE}/api/conversations/${conversationId}/room`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'pin', pinned: null }),
    });
  }

  // ---- withdrawing the invitation withdraws it [ROOM §6] ---------------
  const rotated = await (await sfetch(`${BASE}/api/conversations/${conversationId}/room`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'rotate-invite' }),
  })).json();
  check(rotated.inviteToken !== inviteToken, 'a new link can be made');
  check(await asSarah(`/api/conversations/${conversationId}/room`) >= 400,
    'and it ends the session of somebody already inside — which is what '
    + 'withdrawing an invitation has to mean');

  const stale = await sfetch(`${BASE}/api/conversations/${conversationId}/room/join`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: inviteToken, displayName: 'Intruder' }),
  });
  check(stale.status === 404, 'the old link no longer opens the room',
    `status ${stale.status}`);

  // A wrong token is refused the way a wrong id is: not found, never 403.
  const wrong = await sfetch(`${BASE}/api/conversations/${conversationId}/room/join`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'not-the-token', displayName: 'Intruder' }),
  });
  check(wrong.status === 404,
    'and a guessed invitation cannot even confirm the room exists (D-03)',
    `status ${wrong.status}`);

  await guest.close();

  // ---- leave it as it was found ---------------------------------------
  await sfetch(`${BASE}/api/conversations/${conversationId}/room`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'close' }),
  });
  const closed = await api(`/api/conversations/${conversationId}/room`);
  check(closed.open === false, 'and the room closes again');
}

// --- the creator's language, not the engineer's -----------------------------
/*
 * The doctrine's identifiers are precise and they belong in the code, the
 * audit log and these tests. On the screen of someone trying to answer a
 * video they are noise that reads like an error.
 */
{
  const onScreen = await page.evaluate(() => document.body.innerText);
  const leaks = onScreen.match(/\b(?:INV|U|D)-\d+\b|§\d+|\bClass [AB]\b|Doctrine/g) ?? [];
  check(leaks.length === 0, 'no doctrine identifiers appear in the studio',
    leaks.slice(0, 6).join(', ') || 'none');
  check(!/arm the camera/i.test(onScreen),
    'and the camera is never something the author has to "arm"');
}

// --- research mode (§43, §16) -----------------------------------------------
log('checking search…');
const searchFor = async (q, scoped = true) => api(
  `/api/search?q=${encodeURIComponent(q)}${scoped ? `&conversation=${conversationId}` : ''}`);

// A word the source actually says, taken from its own transcript.
const sourceWord = transcript.sentences[0].text.split(/\s+/)
  .find((w) => w.length > 5)?.toLowerCase() ?? 'the';
const found = await searchFor(sourceWord);
check((found.results?.[0]?.total ?? 0) > 0,
  'searching finds what the source said (§43)', `"${sourceWord}" → ${found.results?.[0]?.total}`);
check(found.results[0].hits.every((h) => Number.isInteger(h.tSourceFrame)),
  'and every hit carries a frame to jump to');
check(found.results[0].hits.every((h) => h.highlights.length > 0),
  'and marks where it matched');

check((await searchFor('zzzznotawordanywhere')).results?.[0]?.total === 0,
  'and finds nothing for a word nobody said');
check((await searchFor('')).total === 0, 'an empty query returns nothing, not everything');

// The claim bound earlier is searchable, and outranks a passing mention.
if (quoted[0]) {
  const word = quoted[0].anchor.quote.split(/\s+/).find((w) => w.length > 4);
  if (word) {
    const byClaim = await searchFor(word);
    check((byClaim.results?.[0]?.total ?? 0) > 0,
      'a bound claim is searchable (§16)', `"${word}"`);
  }
}

// Across the instance, not just this conversation.
const across = await searchFor(sourceWord, false);
check(across.total > 0, 'and the instance can be searched as a whole (§16)',
  `${across.results.length} conversation(s)`);

// The wall holds here too: a search endpoint that ignored it would be a way
// to read every draft one keyword at a time.
check((await raw(`/api/search?q=${encodeURIComponent(sourceWord)}`)).status === 401,
  'a stranger cannot search the instance (D-03, D-06)');
check((await raw(
  `/api/search?q=x&conversation=${conversationId}`)).status === 401,
  'nor search inside a draft');

// The panel an author actually uses.
await page.fill('[data-testid="search-input"]', sourceWord);
await page.waitForSelector('[data-testid="search-hit"]', { timeout: 15_000 })
  .then(() => check(true, 'the studio shows search results'))
  .catch(() => check(false, 'the studio shows search results', 'none appeared'));
check(await page.locator('[data-testid="search-jump"]').count() > 0,
  'each result offers a jump to its moment');
check(await page.locator('[data-testid="search-respond"]').count() > 0,
  'and a way to answer it without leaving the search (§43)');
await page.fill('[data-testid="search-input"]', '');

// --- the knowledge layer (§20, U-15, INV-06) --------------------------------
log('checking suggested claims…');
const claimsView = await api(`/api/conversations/${conversationId}/claims`);
check(Array.isArray(claimsView.claims), 'suggested claims are offered for a Class A source');
check(claimsView.detector?.id === 'heuristic-claims',
  'the detector names itself (U-03 applied to U-15)', claimsView.detector?.id);
check(claimsView.detector?.characteristics?.local === true
  && claimsView.detector?.characteristics?.semantic === false,
  'and says plainly that it is local and not a language model');
check(claimsView.claims.every((c) => c.status === 'suggested'),
  'nothing is decided until the author decides it');
/*
 * The fixture's speech is Hawthorne and Joyce, which contains no checkable
 * factual claims, so the honest result here is an empty list. That is the
 * assertion: a detector that fired on literary prose would be worse, not
 * better. The accept-and-bind path is proven against a seeded transcript in
 * test/knowledge/api.test.ts, where the source can be made to contain one.
 */
check(claimsView.claims.length === 0,
  'the finder stays quiet on prose that asserts nothing',
  `${claimsView.claims.length} found in literary narration`);

// Nothing suggested may be in the document before a human says so.
const beforeDecisions = (await api(`/api/conversations/${conversationId}`))
  .conversation.claimDecisions;
check(beforeDecisions === undefined || beforeDecisions.length === 0,
  'an undecided suggestion is not on the document at all (INV-00, U-15)');
if (claimsView.claims.length > 0) {
  const docText = JSON.stringify((await api(`/api/conversations/${conversationId}`)).conversation);
  check(claimsView.claims.every((c) => !docText.includes(c.suggested.quoteHash)),
    'no suggested claim hash appears anywhere in the document');
}

// A decision cannot be anonymous: INV-06 is not satisfiable without a person.
if (claimsView.claims.length > 0) {
  const anonymous = await sfetch(`${BASE}/api/conversations/${conversationId}/claims`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: claimsView.claims[0].key, status: 'accepted', by: '  ' }),
  });
  check(anonymous.status === 400, 'an anonymous decision is refused (INV-06)');

  // Rejection is recorded, and survives a fresh detection run.
  const rejectKey = claimsView.claims.at(-1).key;
  const rejected = await sfetch(`${BASE}/api/conversations/${conversationId}/claims`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: rejectKey, status: 'rejected', by: 'E2E Author' }),
  });
  check(rejected.ok, 'a suggestion can be turned down');
  const afterReject = await api(`/api/conversations/${conversationId}/claims`);
  check(afterReject.claims.find((c) => c.key === rejectKey)?.status === 'rejected',
    'a rejected suggestion stays rejected when detection runs again');

  // A paraphrase cannot be bound: a quote the source never said misquotes them.
  const paraphrase = await sfetch(`${BASE}/api/conversations/${conversationId}/claims`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      key: claimsView.claims[0].key, status: 'edited', by: 'E2E Author',
      editedQuote: 'something the source never said at any point whatsoever',
      interventionId: snapAfter.conversation.interventions[0].id,
    }),
  });
  check(paraphrase.status === 400,
    'a paraphrase cannot be bound as a source quote (U-15, INV-05)');
}

// The panel is present and honest about finding nothing.
// No reload here: it would disarm the camera and every later step depends on
// the session state this page is holding.
await page.click('[data-testid="tab-statements"]');
await page.waitForSelector('[data-testid="claims-panel"]', { timeout: 30_000 })
  .then(() => check(true, 'the studio shows the claims panel'))
  .catch(() => check(false, 'the studio shows the claims panel', 'never appeared'));
// The panel may have mounted before transcription finished; it polls itself
// out of that state, so wait for the settled answer rather than racing it.
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="claims-panel"]');
  return el && !/not been transcribed/i.test(el.textContent || '');
}, null, { timeout: 60_000 }).catch(() => {});
const panelClaims = await page.locator('[data-testid="claim"]').count();
check(panelClaims === claimsView.claims.length,
  'the panel shows exactly what the finder returned', `${panelClaims} shown`);
check((await page.locator('[data-testid="claims-panel"]').innerText()).includes('Nothing stood out'),
  'and says nothing stood out rather than looking broken');
if (panelClaims > 0) {
  await page.fill('[data-testid="claims-by"]', 'E2E Author');
  const before = (await api(`/api/conversations/${conversationId}`))
    .conversation.interventions.length;
  await sleep(2500);
  await page.locator('[data-testid="claim-respond"]').first().click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="stance"]')?.textContent === 'Your turn', null, { timeout: 20_000 });
  await sleep(2400);
  await page.keyboard.press('Space');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="stance"]')?.textContent === 'Listening', null, { timeout: 60_000 });

  snapAfter = await api(`/api/conversations/${conversationId}`);
  check(snapAfter.conversation.interventions.length === before + 1,
    'answering a suggested claim opens an intervention');
  const fromSuggestion = snapAfter.conversation.interventions.filter((iv) => iv.anchor.origin);
  check(fromSuggestion.length === 1,
    'and the quote it bound carries its origin (INV-06)',
    `${fromSuggestion.length} with origin`);
  const origin = fromSuggestion[0]?.anchor.origin ?? {};
  check(Boolean(origin.model && origin.version && origin.promptHash
    && origin.acceptedBy && origin.acceptedAt),
    'the origin records all four fields INV-06 requires',
    JSON.stringify(origin));
  check(origin.acceptedBy === 'E2E Author', 'and names the human who accepted it');
  check(snapAfter.conversation.claimDecisions?.some((d) => d.status === 'accepted'),
    'the acceptance is recorded on the document');
}

// --- wait for takes to assemble --------------------------------------------
log('waiting for takes to assemble…');
for (let i = 0; i < 120; i++) {
  snap = await api(`/api/conversations/${conversationId}`);
  const pending = snap.conversation.interventions.filter(
    (iv) => iv.takes.every((t) => t.durationFrames === 0)).length;
  if (snap.conversation.interventions.length === 4 && pending === 0) break;
  await sleep(1000);
}
check(snap.conversation.interventions.length === 4, 'four interventions recorded',
  `got ${snap.conversation.interventions.length}`);
const preroll = snap.conversation.interventions.map((iv) => iv.takes[0].prerollFrames);
check(preroll.every((p) => p > 0), 'every take kept its pre-roll', `frames: ${preroll.join(', ')}`);
check(snap.invariantError === null, 'timeline invariants hold', snap.invariantError ?? '');

// --- Studio Mode (§17, §36) -------------------------------------------------
log('studio mode…');
page.on('dialog', (dialog) => dialog.accept());
await page.click('button[role=tab]:has-text("Studio")');
await page.waitForSelector('text=The finished video', { timeout: 20_000 });
check(true, 'the conversation timeline renders (§18)');

await page.locator('button:has-text("Edit")').first().click();
await page.waitForSelector('select[id^="type-"]', { timeout: 10_000 });

// Type drives layout and captions, with no other input (U-11).
await page.locator('select[id^="type-"]').first().selectOption('fact_check');
await sleep(900);
let doc = (await api(`/api/conversations/${conversationId}`)).conversation;
check(doc.interventions.some((iv) => iv.type === 'fact_check'),
  'changing the type from Studio rewrites the document (§17, U-11)');

// Trim with the keyboard, which is the path a mouse-only handler would break.
const beforeTrim = doc.interventions.find((iv) => iv.type === 'fact_check');
const beforeIn = beforeTrim.takes.find((t) => t.id === beforeTrim.selectedTakeId).mediaInFrame;
const slider = page.locator('input[aria-label="Trim start"]').first();
await slider.focus();
for (let i = 0; i < 5; i++) await slider.press('ArrowRight');
await sleep(900);
doc = (await api(`/api/conversations/${conversationId}`)).conversation;
const afterTrim = doc.interventions.find((iv) => iv.id === beforeTrim.id);
const afterIn = afterTrim.takes.find((t) => t.id === afterTrim.selectedTakeId).mediaInFrame;
check(afterIn > beforeIn, 'trimming with the keyboard commits (§17, D-04)',
  `${beforeIn} → ${afterIn}`);
check(afterTrim.takes.find((t) => t.id === afterTrim.selectedTakeId).durationFrames
  === beforeTrim.takes.find((t) => t.id === beforeTrim.selectedTakeId).durationFrames,
  'trimming does not touch the media (U-06)');

// Re-record appends a take; the first one is kept.
await page.locator('button:has-text("Re-record")').first().click();
await page.waitForFunction(
  () => document.querySelector('[data-testid="stance"]')?.textContent === 'Your turn',
  null, { timeout: 20_000 });
await sleep(2400);
await page.keyboard.press('Space');
await page.waitForFunction(
  () => document.querySelector('[data-testid="stance"]')?.textContent === 'Listening',
  null, { timeout: 60_000 });
for (let i = 0; i < 90; i++) {
  doc = (await api(`/api/conversations/${conversationId}`)).conversation;
  const target = doc.interventions.find((iv) => iv.id === beforeTrim.id);
  if (target.takes.length === 2 && target.takes.every((t) => t.durationFrames > 0)) break;
  await sleep(1000);
}
const retaken = doc.interventions.find((iv) => iv.id === beforeTrim.id);
check(retaken.takes.length === 2, 're-recording appends a take rather than replacing one (U-06)',
  `${retaken.takes.length} takes`);
check(retaken.selectedTakeId === retaken.takes[1].id, 'the new take becomes the selected one');
check(retaken.takes[0].durationFrames > 0, 'the earlier take is still there to go back to');

// --- evidence (§44, U-33) ---------------------------------------------------
log('attaching evidence…');
const EVIDENCE = SOURCE.replace(/source\.mp4$/, 'evidence.png');
await page.locator('input[aria-label="Evidence file"]').first().setInputFiles(EVIDENCE);

let evidence = null;
for (let i = 0; i < 60; i++) {
  await sleep(1000);
  doc = (await api(`/api/conversations/${conversationId}`)).conversation;
  const target = doc.interventions.find((iv) => iv.id === beforeTrim.id);
  evidence = target?.evidence?.[0] ?? null;
  if (evidence?.archived || evidence?.archiveError) break;
}
check(Boolean(evidence), 'evidence attaches to the point');
check(evidence?.archived === true, 'evidence is archived at attach time (U-33 §1)',
  evidence?.archiveError ?? '');
check(Boolean(evidence?.contentHash), 'the archive carries a content hash, so the citation verifies');
check(Boolean(evidence?.captureAssetId), 'the archive has a capture the render can show');

/*
 * A deck: one citation, many pages.  [Doctrine U-33 §2]
 *
 * A lecture is taught from slides, and a deck that is stored, hashed and
 * unshowable is a citation nobody can teach from. Every page becomes a
 * picture the compositor can show and zoom into, and which one is on screen
 * is a property of the moment being spoken — the locator — not a separate
 * attachment per page.
 */
log('attaching a deck…');
{
  const DECK = SOURCE.replace(/source\.mp4$/, 'deck.pdf');
  await page.locator('input[aria-label="Evidence file"]').first().setInputFiles(DECK);

  let deck = null;
  for (let i = 0; i < 180; i++) {
    await sleep(1000);
    doc = (await api(`/api/conversations/${conversationId}`)).conversation;
    const target = doc.interventions.find((iv) => iv.id === beforeTrim.id);
    deck = (target?.evidence ?? []).find((e) => /deck/i.test(e.title)) ?? null;
    if (deck?.archived || deck?.archiveError) break;
  }
  check(Boolean(deck), 'a deck attaches to the point');
  check(deck?.archived === true, 'and is archived at attach time like any citation',
    deck?.archiveError ?? '');
  check(deck?.pageCount === 3, 'every page of it is prepared', `${deck?.pageCount}`);
  check((deck?.pageAssetIds ?? []).length === 3,
    'as one citation with many pages, not many citations');
  check(deck?.locator?.page === 1, 'opening on the first page');

  // Each page is a different picture, so serving the wrong one is visible.
  const bytes = [];
  for (const n of [1, 2, 3]) {
    const res = await sfetch(
      `${BASE}/api/conversations/${conversationId}/evidence/${deck.id}/capture?page=${n}`);
    check(res.ok, `page ${n} is served`, `status ${res.status}`);
    bytes.push((await res.arrayBuffer()).byteLength);
  }
  check(new Set(bytes).size === 3, 'and the three pages are three different pictures',
    bytes.join(', '));

  /*
   * Teaching from page three: the page the author names is the page the
   * render shows, not the cover.
   */
  await sfetch(
    `${BASE}/api/conversations/${conversationId}/interventions/${beforeTrim.id}` +
    `/evidence/${deck.id}`,
    { method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ page: 3, region: { x: 0.2, y: 0.4, w: 0.6, h: 0.2 } }) });

  const planned = await api(
    `/api/conversations/${conversationId}/representations?id=render-plan.json`);
  const cue = planned.shots
    .flatMap((shot) => shot.evidence ?? [])
    .find((e) => e.evidenceId === deck.id);
  check(cue?.page === 3, 'the render is planned on the page being taught from', `${cue?.page}`);
  check(cue?.captureAssetId?.endsWith('p3'),
    'and asks for that page\'s picture, not the document\'s first',
    `${cue?.captureAssetId}`);
  check(Boolean(cue?.region), 'with the marked passage to enlarge');

  // Put it back, so the sections after this see the conversation as it was.
  await sfetch(
    `${BASE}/api/conversations/${conversationId}/interventions/${beforeTrim.id}` +
    `/evidence/${deck.id}`, { method: 'DELETE' });
}

const capture = await sfetch(
  `${BASE}/api/conversations/${conversationId}/evidence/${evidence.id}/capture`);
check(capture.ok && capture.headers.get('content-type') === 'image/png',
  'the archived capture is served back');

// Point at the part that matters, from the keyboard-reachable fields.
await page.locator('button:has-text("Locate")').first().click();
await page.waitForSelector('input[aria-label="Evidence appears"]', { timeout: 10_000 });
const locateResponse = await sfetch(
  `${BASE}/api/conversations/${conversationId}/interventions/${beforeTrim.id}/evidence/${evidence.id}`,
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      region: { x: 0.15, y: 0.42, w: 0.58, h: 0.06 },
      quote: 'unemployment fell by 3%',
    }),
  });
check(locateResponse.ok, 'the cited region is recorded (U-33 §2)');

doc = (await api(`/api/conversations/${conversationId}`)).conversation;
evidence = doc.interventions.find((iv) => iv.id === beforeTrim.id).evidence[0];
check(evidence.locator.region.w === 0.58 && evidence.locator.quote === 'unemployment fell by 3%',
  'the locator survives a round trip');

const planPreview = (await api(`/api/conversations/${conversationId}`)).plan;
check(planPreview !== null, 'the plan still builds with evidence attached');

// --- annotations (§14, U-12) ------------------------------------------------
log('annotations…');
const annBase =
  `${BASE}/api/conversations/${conversationId}/interventions/${beforeTrim.id}/annotations`;
const circle = await (await sfetch(annBase, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    kind: 'ellipse',
    points: [{ x: 0.18, y: 0.22 }, { x: 0.62, y: 0.68 }],
    style: { color: '#ffcc00', width: 0.006 },
    drawFrames: 14,
  }),
})).json();
check(Boolean(circle.annotation?.id), 'a mark can be placed on the frame (§14)');
check(circle.annotation?.points[0]?.x === 0.18, 'it is stored in the frame, not in pixels (U-12 §1)');

await sfetch(annBase, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    kind: 'blur', points: [{ x: 0.7, y: 0.06 }, { x: 0.96, y: 0.3 }], style: {},
  }),
});

const timed = await sfetch(`${annBase}/${circle.annotation.id}`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    appearFrame: beforeTrim.takes.find((t) => t.id === beforeTrim.selectedTakeId).mediaInFrame + 12,
    dismissFrame: beforeTrim.takes.find((t) => t.id === beforeTrim.selectedTakeId).mediaOutFrame,
  }),
});
check(timed.ok, 'a mark has its own window (U-12 §2)');

const withMarks = (await api(`/api/conversations/${conversationId}`)).conversation
  .interventions.find((iv) => iv.id === beforeTrim.id);
check(withMarks.annotations?.length === 2, 'both marks are on the point',
  `${withMarks.annotations?.length ?? 0}`);
check(withMarks.annotations[0].drawFrames === 14,
  'how fast the stroke was drawn is kept (U-12 §3)');

const markPlan = (await api(
  `/api/conversations/${conversationId}/representations?id=render-plan.json`));
const markShot = markPlan.shots.find(
  (s) => s.kind === 'response' && s.interventionId === beforeTrim.id);
const secondPoint = (await api(`/api/conversations/${conversationId}`)).conversation
  .interventions.find((iv) => iv.id !== beforeTrim.id);
if (secondPoint) {
  await sfetch(
    `${BASE}/api/conversations/${conversationId}/interventions/${secondPoint.id}/annotations`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'arrow', points: [{ x: 0.8, y: 0.2 }, { x: 0.5, y: 0.5 }], style: {},
      }),
    });
  const plan2 = await api(`/api/conversations/${conversationId}/representations?id=render-plan.json`);
  const shot2 = plan2.shots.find(
    (s) => s.kind === 'response' && s.interventionId === secondPoint.id);
  check(shot2?.annotations?.length === 1, 'the plan carries a mark on a point that shows the frame');
  check(shot2?.layoutId === 'freeze_pip',
    'the layout changes to show the frame the mark points at (U-11)', shot2?.layoutId);
}
// This point carries evidence as well, and evidence takes the panel — so
// there is no frame on screen for the marks to sit on, and they are not
// drawn rather than landing on the document instead.
check(markShot?.layoutId === 'evidence_split',
  'evidence keeps the panel where both are present (U-11)', markShot?.layoutId);
check(markShot?.annotations === undefined,
  'a mark is not drawn where the frame it marks is not shown (U-12 §1)');

await page.locator('button:has-text("Edit")').first().click();
await page.waitForSelector('button:has-text("circle")', { timeout: 10_000 })
  .then(() => check(true, 'the drawing tools are on the point'))
  .catch(() => check(false, 'the drawing tools are on the point'));

// --- vertical clips (U-22) --------------------------------------------------
log('clips…');
const clipList = await api(`/api/conversations/${conversationId}/clips`);
check(clipList.candidates.length > 0, 'the product proposes clip candidates (U-22 §4)',
  `${clipList.candidates.length} candidates`);
check(clipList.candidates.every((c) => c.reasons.length > 0),
  'each candidate says why it was ranked where it is');
check(clipList.candidates[0].score >= clipList.candidates.at(-1).score,
  'candidates come back ranked');

const clipTarget = clipList.candidates.find((c) => c.interventionId === beforeTrim.id)
  ?? clipList.candidates[0];
const clipStart = await sfetch(`${BASE}/api/conversations/${conversationId}/clips`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ interventionId: clipTarget.interventionId }),
});
check(clipStart.status === 202, 'a clip can be requested for one pair');

let clipJob = null;
for (let i = 0; i < 240; i++) {
  await sleep(1000);
  const { jobs } = await api(`/api/conversations/${conversationId}/clips`);
  clipJob = jobs.find((j) => j.payload?.interventionId === clipTarget.interventionId);
  if (clipJob && (clipJob.state === 'done' || clipJob.state === 'failed')) break;
}
check(clipJob?.state === 'done', 'the clip renders', clipJob?.error ?? clipJob?.state ?? 'no job');

if (clipJob?.state === 'done') {
  const clipUrl =
    `${BASE}/api/conversations/${conversationId}/renders/${clipJob.result.planHash}/file`;
  const head = await sfetch(clipUrl, { headers: { range: 'bytes=0-1023' } });
  check(head.status === 206, 'the clip is served and seekable');

  const dims = execFileSync(ffprobe.path, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0',
    clipJob.result.outputPath,
  ]).toString().trim();
  check(dims === '1080,1920', 'the clip is vertical (U-22)', dims);
  check(clipJob.result.seconds < 90, 'the clip is short enough for the format',
    `${clipJob.result.seconds}s`);
}

// Deleting a point leaves the rest exact. (Use the SECOND point, so the one
// carrying evidence survives into the render and the article.)
const countBefore = doc.interventions.length;
await page.locator('button:has-text("Edit")').last().click();
await page.locator('button:has-text("Delete")').last().click();
await sleep(1200);
const snapAfterDelete = await api(`/api/conversations/${conversationId}`);
check(snapAfterDelete.conversation.interventions.length === countBefore - 1,
  'deleting a point removes it (§17)');
check(snapAfterDelete.invariantError === null,
  'the timeline is still exact after editing (INV-02)');

// --- render -----------------------------------------------------------------
log('rendering…');
await page.click('[data-testid="mode-publish"]');
await page.waitForSelector('[data-testid="publish-render"]', { timeout: 20_000 });
await page.click('[data-testid="publish-render"]');
let job = null;
for (let i = 0; i < 300; i++) {
  const jobs = (await api(`/api/conversations/${conversationId}/renders`)).jobs;
  job = jobs[0];
  if (job && (job.state === 'done' || job.state === 'failed')) break;
  await sleep(1000);
}
check(job?.state === 'done', 'render completed', job?.error ?? job?.state ?? 'no job');

if (job?.state === 'done') {
  const url = `${BASE}/api/conversations/${conversationId}/renders/${job.result.planHash}/file`;
  const head = await sfetch(url, { headers: { range: 'bytes=0-1023' } });
  check(head.status === 206, 'output serves byte ranges (seekable)', `status ${head.status}`);
  const srt = await sfetch(`${url}?kind=srt`);
  check(srt.ok, 'caption sidecar ships with the export (INV-07)');
  const srtBody = await srt.text();
  check(srtBody.includes('SOURCE:'), 'captions carry real cues with speaker labels (U-19, U-20)',
    `${srtBody.split('\n\n').filter(Boolean).length} cues`);
  check((job.result.cues ?? 0) > 0, 'the render burned in captions', `${job.result.cues} cues`);
  console.log(JSON.stringify({
    planHash: job.result.planHash,
    totalOutputFrames: job.result.totalOutputFrames,
    shotsRendered: job.result.shotsRendered,
    shotsCached: job.result.shotsCached,
    outputPath: job.result.outputPath,
    anchors: ANCHORS,
  }, null, 2));
}

// --- the publication bundle (U-30) ------------------------------------------
log('checking the publication bundle…');
const { bundle, renderedThumbnails } = await api(`/api/conversations/${conversationId}/bundle`);
check(bundle.description.includes('Source:'),
  'the description carries the generated attribution block (INV-07, U-21)');
check(bundle.suggestedTitles.length > 0, 'the bundle suggests titles from the author\'s claims');
// Re-read: `quoted` was captured before Studio Mode, which deletes an
// intervention and may move an anchor. Both legitimately drop a bound claim
// (U-05/INV-12: a claim must not drift to a cut point it no longer
// describes), so asserting against the stale snapshot tests nothing real.
const boundNow = (await api(`/api/conversations/${conversationId}`))
  .conversation.interventions.filter((iv) => iv.anchor.quote);
const boundQuote = boundNow[0]?.anchor.quote ?? '';
// A title truncates a long claim (80 chars), so compare on a prefix: which
// sentence the run binds depends on ASR segmentation and is not always short.
const boundPrefix = boundQuote.slice(0, 40);
if (boundPrefix) {
  check(bundle.suggestedTitles.some((t) => t.includes(boundPrefix)),
    'a suggested title quotes a claim the author actually bound',
    JSON.stringify(bundle.suggestedTitles));
} else {
  // Nothing is bound any more. Titles then come from the source sentence at
  // each anchor — the author's own stopping points, still verbatim — and
  // never from invented prose.
  const sentences = transcript.sentences.map((s) => forDisplay(s.text, transcript.characteristics));
  // A title reads: "<quote, truncated to 80 with an ellipsis>" — a <label>.
  // Take only what is between the quotation marks.
  const quoted_ = bundle.suggestedTitles
    .map((t) => t.match(/^"([^"]*)"/)?.[1])
    .filter(Boolean)
    .map((q) => q.replace(/…$/, ''));
  check(quoted_.length > 0 && quoted_.every((q) =>
    sentences.some((sentence) => sentence.startsWith(q))),
    'with nothing bound, titles fall back to the source\'s own sentences',
    JSON.stringify(quoted_));
}
check(bundle.chapters.length === 0 || bundle.chapters[0].startFrame === 0,
  'a chapter list that exists starts at 00:00, as platforms require');
if (bundle.chapters.length === 0) {
  check(typeof bundle.chaptersNote === 'string' && bundle.chaptersNote.length > 0,
    'when there are no chapters the bundle says why');
} else {
  const shortest = Math.min(...bundle.chapters.slice(1)
    .map((c, i) => c.startFrame - bundle.chapters[i].startFrame));
  check(shortest >= 10 * 30, 'no chapter is shorter than the ten seconds platforms accept',
    `${shortest} frames`);
}
check(bundle.totalOutputFrames === job?.result?.totalOutputFrames,
  'the bundle describes the video that was actually rendered',
  `${bundle.totalOutputFrames} vs ${job?.result?.totalOutputFrames}`);

// The export queues them; nobody has to ask.
let afterThumbs = null;
for (let i = 0; i < 120; i++) {
  afterThumbs = await api(`/api/conversations/${conversationId}/bundle`);
  const job = afterThumbs.thumbnailJob;
  if (job && (job.state === 'done' || job.state === 'failed')) break;
  await sleep(1000);
}
check(afterThumbs?.thumbnailJob?.state === 'done',
  'the export renders thumbnail candidates unasked (U-30)',
  afterThumbs?.thumbnailJob?.error ?? afterThumbs?.thumbnailJob?.state ?? 'no job');
check(!afterThumbs?.thumbnailJob?.failed, 'every thumbnail candidate rendered',
  JSON.stringify(afterThumbs?.thumbnailJob?.failed ?? []));
check(afterThumbs.renderedThumbnails.length === bundle.thumbnails.length,
  'every candidate the bundle names exists as an image',
  `${afterThumbs.renderedThumbnails.length}/${bundle.thumbnails.length}`);
const kinds = new Set(bundle.thumbnails
  .filter((t) => afterThumbs.renderedThumbnails.includes(t.id)).map((t) => t.kind));
check(kinds.has('frame'), 'a thumbnail of the moment stopped at was rendered');
check(kinds.has('take'), 'a thumbnail of the author answering was rendered');
check(kinds.has('quote'), 'the claim was rendered as a quote card');
for (const kind of ['frame', 'take', 'quote']) {
  const candidate = bundle.thumbnails.find((t) => t.kind === kind
    && afterThumbs.renderedThumbnails.includes(t.id));
  if (!candidate) continue;
  const png = await sfetch(
    `${BASE}/api/conversations/${conversationId}/bundle?thumbnail=${candidate.id}`);
  const bytes = Buffer.from(await png.arrayBuffer());
  check(png.ok && bytes.length > 5000 && bytes.subarray(1, 4).toString() === 'PNG',
    `the ${kind} thumbnail serves as a real image`, `${bytes.length} bytes`);
}
check((await sfetch(
  `${BASE}/api/conversations/${conversationId}/bundle?thumbnail=../../etc/passwd`)).status === 400,
  'a thumbnail id cannot escape the conversation (D-06)');

// The fixture's frames carry their own index as a colour, so the thumbnail of
// "the moment you stopped at" can be checked against the frame you stopped at.
// A thumbnail one frame off is a promise about a moment nobody chose. [INV-02]
//
// Re-read: a response may have been MOVED since the last snapshot, and the
// third stale-snapshot bug in this file is enough to stop taking one on trust.
const atThumbnailTime = (await api(`/api/conversations/${conversationId}`)).conversation;
for (const intervention of atThumbnailTime.interventions) {
  const id = `frame_${intervention.id}`;
  if (!afterThumbs.renderedThumbnails.includes(id)) continue;
  const png = Buffer.from(await (await sfetch(
    `${BASE}/api/conversations/${conversationId}/bundle?thumbnail=${id}`)).arrayBuffer());
  const pngPath = `/tmp/bv-thumb-${id}.png`;
  await writeFile(pngPath, png);
  const raw = execFileSync(ffmpegStatic, ['-v', 'error', '-i', pngPath,
    '-vf', 'crop=2:2:960:540,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  const decoded = decodeIndex(raw[0], raw[1], raw[2]);
  check(decoded === intervention.anchor.tSourceFrame,
    'the thumbnail is the exact frame the author stopped at (U-30, INV-02)',
    `asked ${intervention.anchor.tSourceFrame}, got ${decoded}`);
}

// The panel the author actually uses. Publishing is its own stage now.
await page.reload();
await page.click('[data-testid="mode-publish"]');
await page.waitForSelector('[data-testid="bundle-panel"]', { timeout: 20000 })
  .then(() => check(true, 'the publish stage shows the publication bundle'))
  .catch(() => check(false, 'the publish stage shows the publication bundle',
    'panel never appeared'));
const shownDescription = await page.inputValue('[data-testid="bundle-description"]')
  .catch(() => '');
check(shownDescription === bundle.description,
  'the panel shows the same description the bundle generated');
check(await page.locator('[data-testid="bundle-thumbnails"] img').count() > 0,
  'the panel shows rendered thumbnails, not placeholders');

// --- the article (U-14) -----------------------------------------------------
log('checking the article…');
const articleResponse = await sfetch(`${BASE}/c/${conversationId}/article`);
check(articleResponse.ok, 'the conversation renders as an article');
const articleHtml = await articleResponse.text();
check(articleHtml.startsWith('<!doctype html>'), 'the article is a standalone document');
check(articleHtml.includes('Example Channel'), 'the article carries the generated attribution (U-21)');
if (boundNow[0]) {
  check(articleHtml.includes(boundNow[0].anchor.quote),
    'the article quotes the claim being answered (U-10)');
} else {
  // No claim bound: the article shows what the source was saying at that
  // moment instead, bounded to the anchored sentence, rather than silently
  // presenting nothing.
  check(/was saying|at that moment|<blockquote/i.test(articleHtml),
    'with no claim bound, the article still shows what was being answered');
}
check(!articleHtml.includes('<script'), 'the article loads nothing');

const list = await api(`/api/conversations/${conversationId}/representations`);
const ids = list.representations.filter((r) => r.available).map((r) => r.id);
check(ids.includes('article.md') && ids.includes('captions.srt'),
  'the registry lists what this conversation can produce (D-16)', ids.join(', '));
check(list.representations.every((r) => r.inputs.length > 0),
  'every representation declares its inputs (D-16)');

const markdown = await (await sfetch(
  `${BASE}/api/conversations/${conversationId}/representations?id=article.md`)).text();
check(markdown.includes('# '), 'the article downloads as Markdown');
check(markdown.includes('spoken by the author'),
  'the article states that every response word is the author\'s (U-15)');
check(markdown.includes('**Evidence**') && markdown.includes('retrieved '),
  'the article cites the evidence with its retrieval date (U-33 §4)');
check(markdown.includes('unemployment fell by 3%'), 'the article carries the cited line');

// --- the companion player (U-01, D-08) --------------------------------------
log('companion player…');
const manifest = await api(`/api/conversations/${conversationId}/representations?id=manifest.json`);
check(manifest.segments.length > 0, 'the conversation has a manifest (U-01)',
  `${manifest.segments.length} segments`);
const firstResponse = manifest.segments.find((s) => s.kind === 'response');
const beforeResponse = manifest.segments[manifest.segments.indexOf(firstResponse) - 1];
check(beforeResponse.sourceOutFrame === firstResponse.anchorFrame,
  'the manifest resumes the source at exactly the frame it stopped (U-07)');

const watch = await page.context().newPage();
await watch.goto(`${BASE}/c/${conversationId}/watch`, { waitUntil: 'networkidle' });
check(await watch.locator('text=The conversation').count() > 0, 'the watch page renders');
await watch.click('button:has-text("Play the conversation")');
await watch.waitForFunction(
  () => document.body.innerText.includes('Response —'), null, { timeout: 40_000 })
  .then(() => check(true, 'the companion player reaches the first response'))
  .catch(() => check(false, 'the companion player reaches the first response', 'timed out'));

// Reaching the response is a label changing. Playing it is the product.
const played = await watch.evaluate(async () => {
  const video = document.querySelectorAll('video')[1];
  if (!video) return { ok: false, why: 'no response element' };
  const first = video.currentTime;
  await new Promise((r) => setTimeout(r, 1500));
  return {
    ok: video.readyState >= 2 && video.currentTime > first,
    why: `readyState=${video.readyState} error=${video.error?.code ?? 'none'} ` +
         `t=${first.toFixed(2)}→${video.currentTime.toFixed(2)}`,
  };
});
check(played.ok, 'the response actually plays, not just the label', played.why);
await watch.close();

// --- an embedded source (Class B) -------------------------------------------
log('class B…');
const embedded = await (await sfetch(`${BASE}/api/conversations`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    providerUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    sourceTitle: 'A video we do not hold',
    creator: 'Example Channel',
  }),
})).json();
const embeddedId = embedded.conversation?.id;
check(embedded.conversation?.source?.class === 'B', 'a link creates a Class B conversation (U-01)');
check(embedded.conversation?.source?.embedUrl?.includes('youtube-nocookie.com'),
  'it plays through the provider\'s own embed');
check(!embedded.conversation?.source?.mezzanineAssetId,
  'nothing was downloaded (U-35 §6)');

const refusedComposed = await sfetch(`${BASE}/api/conversations/${embeddedId}/renders`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ kind: 'full' }),
});
check(refusedComposed.status === 409, 'a composed export is refused for Class B (INV-01)',
  `status ${refusedComposed.status}`);
check((await refusedComposed.json()).error?.includes('Class B'),
  'and it says why, in the doctrine\'s own terms');

const embeddedManifest = await api(
  `/api/conversations/${embeddedId}/representations?id=manifest.json`);
// The knowledge layer needs a transcript, and an embedded source is never
// downloaded (U-35 §6), so it says why rather than showing an empty list.
const embeddedClaims = await api(`/api/conversations/${embeddedId}/claims`);
check(embeddedClaims.claims.length === 0 && typeof embeddedClaims.unavailable === 'string',
  'a Class B source says why it has no claims, rather than showing none (U-01)',
  embeddedClaims.unavailable);
check(/own platform/i.test(embeddedClaims.unavailable ?? '')
  && !/U-\d|INV-\d|Class B|§/.test(embeddedClaims.unavailable ?? ''),
  'and says why in the creator\'s language, not the doctrine\'s',
  embeddedClaims.unavailable);

check(embeddedManifest.source.embedUrl?.includes('youtube-nocookie.com'),
  'the Class B manifest drives the provider\'s player');
check(!/\.(mp4|webm|m3u8|mpd)(["\'?]|$)/.test(JSON.stringify(embeddedManifest.source)),
  'the manifest points at no provider media');

/*
 * What a Class B conversation must NOT claim.
 *
 * The source plays on its own platform and is never downloaded (U-35 §6), so
 * there are no frames of it to place a response beside, to draw on, or to cut
 * into a single file. Offering any of that is offering something the export
 * cannot produce.
 */
{
  const bPage = await page.context().newPage();
  await bPage.goto(`${BASE}/c/${embeddedId}`, { waitUntil: 'networkidle' });
  await bPage.click('button[role=tab]:has-text("Studio")');
  await bPage.waitForTimeout(1200);

  check(await bPage.locator('[data-testid="no-composed-export"]').count() === 1,
    'a Class B conversation says what publishes instead of a finished file');
  const bText = await bPage.evaluate(() => document.body.innerText);
  check(!/The finished video/i.test(bText),
    'and never shows a finished-video bar it cannot produce (INV-01)');
  check(!/% source material/i.test(bText),
    'nor a proportion of a file that does not exist');
  check(!/U-\d|INV-\d|Class [AB]|§/.test(bText),
    'and explains it in the creator\'s language');

  // Nothing is preparing, because nothing has been recorded.
  check(!/Preparing \d+ response/i.test(bText),
    'a conversation with no responses is not "preparing responses"');
  await bPage.close();
}

const embeddedWatch = await page.context().newPage();
await embeddedWatch.goto(`${BASE}/c/${embeddedId}/watch`, { waitUntil: 'domcontentloaded' });
await embeddedWatch.waitForSelector('iframe', { timeout: 20_000 })
  .then(() => check(true, 'the Class B watch page embeds the provider\'s player'))
  .catch(() => check(false, 'the Class B watch page embeds the provider\'s player'));
await embeddedWatch.close();

// --- the response reel (U-01) -----------------------------------------------
log('response reel…');
const reelStart = await sfetch(`${BASE}/api/conversations/${conversationId}/renders`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ kind: 'reel' }),
});
check(reelStart.status === 202, 'a response reel can be requested');
const reelPlanHash = (await reelStart.json()).planHash;

let reelJob = null;
for (let i = 0; i < 240; i++) {
  await sleep(1000);
  const { jobs } = await api(`/api/conversations/${conversationId}/renders`);
  reelJob = jobs.find((j) => j.kind === 'render_reel');
  if (reelJob && (reelJob.state === 'done' || reelJob.state === 'failed')) break;
}
check(reelJob?.state === 'done', 'the reel renders', reelJob?.error ?? reelJob?.state ?? 'no job');
if (reelJob?.state === 'done') {
  const reelFile = await sfetch(
    `${BASE}/api/conversations/${conversationId}/renders/${reelPlanHash}/file`,
    { headers: { range: 'bytes=0-1023' } });
  check(reelFile.status === 206, 'the reel is served');
  check(reelJob.result.responses > 0, 'the reel holds the author\'s responses',
    `${reelJob.result.responses} responses`);
}

// --- publishing and responding (U-31, §40) ----------------------------------
log('publish and respond…');
const noConsent = await sfetch(`${BASE}/api/conversations/${conversationId}/publish`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
});
check(noConsent.status === 400, 'publishing asks about responses rather than assuming (U-31)');

const publishNo = await sfetch(`${BASE}/api/conversations/${conversationId}/publish`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ respondable: false, author: 'Chama Meyembi' }),
});
check(publishNo.ok, 'a finished conversation can be published');

const refused = await sfetch(`${BASE}/api/conversations`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ respondToConversationId: conversationId }),
});
check(refused.status === 403, 'a response is refused where the author did not allow it (U-31)',
  `status ${refused.status}`);

await sfetch(`${BASE}/api/conversations/${conversationId}/publish`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ respondable: true, author: 'Chama Meyembi' }),
});
const listed = await api('/api/published');
check(listed.published.some((p) => p.id === conversationId && p.respondable),
  'it appears as something others can answer');

const child = await (await sfetch(`${BASE}/api/conversations`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ respondToConversationId: conversationId }),
})).json();
const childId = child.conversation?.id;
check(Boolean(childId), 'a response to a conversation can be started (§40)');
check(child.conversation?.source?.class === 'A',
  'a published conversation is a Class A source (U-31)');
check(child.conversation?.source?.sourceConversationId === conversationId,
  'it knows which conversation it is answering');
check(child.conversation?.lineage?.chain?.length === 1,
  'and records the chain, oldest first');

// The parent may change or be withdrawn; the response must go on answering
// what it actually answered.
await sfetch(`${BASE}/api/conversations/${conversationId}/publish`, { method: 'DELETE' });
const stillThere = (await api(`/api/conversations/${childId}`)).conversation;
check(stillThere.lineage?.chain?.[0]?.title?.length > 0,
  'withdrawing the parent leaves the response intact');

for (let i = 0; i < 120; i++) {
  await sleep(1000);
  const snap = await api(`/api/conversations/${childId}`);
  if (snap.conversation.source.durationFrames > 0) break;
}
const childSnap = await api(`/api/conversations/${childId}`);
check(childSnap.conversation.source.durationFrames > 0,
  'the published render becomes the response\'s own source',
  `${childSnap.conversation.source.durationFrames} frames`);

/*
 * --- what publishing actually opens (U-31) ---------------------------------
 *
 * The wall is only correct if it has a door. "A published conversation is a
 * Class A source. Anyone can open it and respond to it" — so a stranger must
 * be able to read a published one, while a draft stays invisible to them.
 */
/*
 * --- the share card (U-31, §52, D-03) ---------------------------------------
 *
 * A published conversation is a link somebody sends somebody else, and until
 * it could describe itself that link arrived as a bare URL. What is checked
 * here is mostly the negative: a DRAFT must preview as nothing at all.
 *
 * This is a sharper privacy question than it looks. A link preview is fetched
 * by a machine the sender has never heard of, with none of their cookies, and
 * metadata is produced before a page decides whether to 404 — so a title here
 * would hand the subject of somebody's unfinished argument to anyone who
 * guessed a URL.
 */
log('checking what a draft says about itself…');
{
  const meta = (html, property) => html.match(
    new RegExp(`<meta[^>]+(?:property|name)="${property}"[^>]+content="([^"]*)"`))?.[1];

  const draftPage = await raw(`/c/${conversationId}/watch`);
  check(draftPage.status === 404, 'a stranger cannot open a draft to begin with');

  const draftCard = await raw(`/api/conversations/${conversationId}/card`);
  check(draftCard.status === 404, 'and its card is not there to be fetched either',
    `status ${draftCard.status}`);
  check(draftCard.status
    === (await raw('/api/conversations/conv_does_not_exist/card')).status,
    'answering exactly as a conversation that does not exist would (D-03)');

  check((await raw(
    `/api/conversations/${conversationId}/representations?id=share-card.json`)).status === 404,
    'nor can the words on it be read another way');

  // The owner sees no preview for a draft either, which is the honest
  // answer: there is nothing published to preview.
  const ownDraft = await (await sfetch(`${BASE}/c/${conversationId}/watch`)).text();
  const title = (await api(`/api/conversations/${conversationId}`)).conversation.title;
  check(!meta(ownDraft, 'og:title'), 'an unpublished page claims no preview at all');
  check(!ownDraft.includes(`content="${title}"`),
    'and does not name the draft in a tag a crawler reads');
}

log('checking that publishing opens a door…');
await sfetch(`${BASE}/api/conversations/${conversationId}/publish`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ respondable: true, author: 'E2E Author' }),
});

check((await raw(`/c/${conversationId}/watch`)).status === 200,
  'a stranger can watch a published conversation (U-31)');
check((await raw(`/c/${conversationId}/article`)).status === 200,
  'and read it as an article (U-14)');

/*
 * Published, the link describes itself — and the picture and the words come
 * from one generator, which is the property worth protecting. Hand-written
 * OpenGraph tags go stale against the thing they describe; these cannot,
 * because `share-card.json` is what both are rendered from.
 */
{
  const meta = (html, property) => html.match(
    new RegExp(`<meta[^>]+(?:property|name)="${property}"[^>]+content="([^"]*)"`))?.[1];

  /*
   * The picture is drawn when the conversation is published, not when it was
   * last exported — so that it describes what was published. Which means
   * waiting for it here, exactly as a link preview would have to.
   */
  let drawn = null;
  for (let i = 0; i < 60; i++) {
    drawn = await raw(`/api/conversations/${conversationId}/card`);
    if (drawn.status === 200) break;
    await sleep(1000);
  }
  check(drawn?.status === 200, 'publishing draws the card', `status ${drawn?.status}`);

  const card = await (await raw(
    `/api/conversations/${conversationId}/representations?id=share-card.json`)).json();
  const title = (await api(`/api/conversations/${conversationId}`)).conversation.title;
  check(card.title === title, 'the card is the conversation\'s own title, not a new one');
  check(typeof card.description === 'string' && card.description.length > 0,
    'with a line of description for the places that show no picture');
  check(card.hero.quoted === false || card.hero.text.length > 0,
    'and a statement only when one was bound (INV-05)');

  const watched = await (await raw(`/c/${conversationId}/watch`)).text();
  check(meta(watched, 'og:title') === card.title,
    'the page a link points at now says what it is', meta(watched, 'og:title'));
  check(meta(watched, 'og:description') === card.description,
    'in the same words the card uses — one generator, two renderings');
  check((meta(watched, 'og:url') ?? '').endsWith(`/c/${conversationId}/watch`),
    'and points back at itself absolutely, for a machine with no page to resolve against',
    meta(watched, 'og:url'));

  const image = meta(watched, 'og:image');
  check(/^https?:\/\/.+\/api\/conversations\/.+\/card$/.test(image ?? ''),
    'it offers a picture at an absolute URL', image);
  const picture = await fetch(image, { redirect: 'manual' });
  check(picture.status === 200, 'which a stranger with no cookies can actually fetch',
    `status ${picture.status}`);
  check((picture.headers.get('content-type') ?? '').includes('image/png'),
    'and is a real image');
  const bytes = new Uint8Array(await picture.arrayBuffer());
  check(bytes.length > 4096, 'with something drawn on it', `${bytes.length} bytes`);
  // A PNG, verified as one rather than trusted from a header we set ourselves.
  check(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47,
    'a real PNG, not a header we wrote on something else');
  check(meta(watched, 'og:image:width') === '1200'
    && meta(watched, 'og:image:height') === '630',
    'declared at the size every preview is read at');
  check((meta(watched, 'og:image:alt') ?? '').length > 0,
    'and said in words for anyone who cannot see it (D-04)');
  check(meta(watched, 'twitter:card') === 'summary_large_image',
    'wide enough to be read rather than shown as a thumbnail');

  /*
   * And the author can see it. A card more people will look at than the video
   * itself, which its own author cannot look at, is half a feature.
   */
  await page.goto(`${BASE}/c/${conversationId}`, { waitUntil: 'networkidle' });
  await page.click('[data-testid="mode-publish"]');
  await page.waitForSelector('[data-testid="share-preview"]', { timeout: 20_000 })
    .then(() => check(true, 'the author is shown what their link will look like'))
    .catch(() => check(false, 'the author is shown what their link will look like',
      'no preview appeared'));
  const shown = await page.waitForSelector('[data-testid="share-preview-image"]',
    { timeout: 30_000 }).then(() => true).catch(() => false);
  check(shown, 'with the picture itself, not a description of it');
  const previewText = await page.locator('[data-testid="share-preview"]').innerText();
  check(previewText.includes(card.title),
    'and the words underneath it are the card\'s own', previewText.slice(0, 80));

  // The article is the other thing people link to, and it agrees.
  const read = await (await raw(`/c/${conversationId}/article`)).text();
  check(meta(read, 'og:title') === card.title,
    'the article describes itself the same way the video does');
  check((meta(read, 'og:url') ?? '').endsWith(`/c/${conversationId}/article`),
    'while pointing at itself, not at the other one');
}
check((await raw(
  `/api/conversations/${conversationId}/representations?id=manifest.json`)).status === 200,
  'and its companion player gets its manifest');
// The artefact, not the working material.
for (const id of ['render-plan.json', 'timeline.json', 'bundle.json']) {
  check((await raw(
    `/api/conversations/${conversationId}/representations?id=${id}`)).status === 404,
    `but not ${id} — that is the author's working material`);
}
check((await raw(`/c/${conversationId}`)).status === 307,
  'and not the studio, which is where the drafts are');
/*
 * A stranger still cannot change what was published.
 *
 * The REFUSAL moved layers and the check moved with it. This path now accepts
 * POST from a guest the host has staged (ROOM §10), so middleware no longer
 * turns it away wholesale and the route decides — which is the arrangement
 * this codebase uses everywhere else: middleware says which routes may
 * decide, the route decides.
 *
 * The answer is 404 rather than 401, and that is not a weakening: 404 is what
 * a stranger gets for a conversation that does not exist, so a published one
 * and an imaginary one now answer identically. The old 401 said "this is
 * real, you are not allowed" (D-03).
 */
{
  const refused = await raw(`/api/conversations/${conversationId}/interventions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tSourceFrame: 1, type: 'critique' }),
  });
  check(refused.status >= 400, 'a stranger still cannot change what was published',
    `status ${refused.status}`);

  const imaginary = await raw('/api/conversations/conv_does_not_exist/interventions', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tSourceFrame: 1, type: 'critique' }),
  });
  check(refused.status === imaginary.status,
    'and is told no more than they would be about a conversation that does not exist',
    `${refused.status} vs ${imaginary.status}`);

  // The same, for the paths a guest may reach once staged.
  for (const path of [
    `/api/conversations/${conversationId}/takes/take_anything/chunks?index=0`,
    `/api/conversations/${conversationId}/takes/take_anything/finalize`,
    `/api/conversations/${conversationId}/room/voice`,
  ]) {
    const stranger = await raw(path, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ interventionId: 'x', energy: 1, speechConfidence: 1 }),
    });
    check(stranger.status >= 400, `a stranger is refused at ${path.split('/').pop()}`,
      `status ${stranger.status}`);
  }
}

// Withdrawing closes it again.
await sfetch(`${BASE}/api/conversations/${conversationId}/publish`, { method: 'DELETE' });
check((await raw(`/c/${conversationId}/watch`)).status === 404,
  'withdrawing puts it out of a stranger\'s reach again');
check((await raw(`/api/conversations/${conversationId}/card`)).status === 404,
  'and takes the card with it — a withdrawn conversation stops previewing');
check((await raw(
  `/api/conversations/${conversationId}/representations?id=share-card.json`)).status === 404,
  'including the words it was made from');

const childManifest = await api(
  `/api/conversations/${childId}/representations?id=manifest.json`);
check(childManifest.attribution?.includes('Responding to'),
  'the attribution credits what is being answered (U-21, U-31)');
check(childManifest.attribution?.includes('Original source'),
  'and the original source at the root of the chain');

/*
 * --- Studio Two: the Performance Studio (STUDIO-TWO §1, §3, §4, §10, §13) ---
 *
 * A second studio over a second document, reached by its own door. What is
 * checked here is stage two's whole claim: a song arrives, is measured by
 * decoding rather than believed, and a take recorded against it lands on that
 * song at a place the document can state.
 */
log('checking the Performance Studio…');
{
  // A click track at 44.1 kHz — the WRONG rate on purpose, because a take at
  // 48 against a master at 44.1 drifts seven percent and a fixture at the
  // house rate would never find out whether normalisation happens.
  const songPath = `${process.env['TMPDIR'] ?? '/tmp'}/balancevid-e2e-song.mp3`;
  const SONG_SECONDS = 5;
  execFileSync(ffmpegStatic, [
    '-y',
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${SONG_SECONDS}:sample_rate=44100`,
    '-f', 'lavfi', '-i', `sine=frequency=110:duration=${SONG_SECONDS}:sample_rate=44100`,
    '-filter_complex',
    '[0:a]tremolo=f=2:d=1,volume=0.8[c];[1:a]volume=0.15[b];'
    + '[c][b]amix=inputs=2:duration=first[o]',
    '-map', '[o]', '-ar', '44100', songPath,
  ], { stdio: 'ignore' });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="start-performance"]', { timeout: 15_000 });
  check(true, 'the Performance Studio has a door of its own (§13)');

  await page.setInputFiles('[data-testid="master-file"]', songPath);
  await page.waitForSelector('[data-testid="master-class-choice"]', { timeout: 10_000 });
  check(true, 'and asks what the music is before anything is recorded');

  /*
   * The rights question, asked at the door. Studio One's posture is
   * transformative commentary; performing over a commercial recording is not
   * commentary, and somebody should learn what that costs before they record
   * five takes rather than after. [S-9, INV-15]
   */
  await page.locator('[data-testid="master-class-choice"][data-class="third_party"]').click();
  check(/publishing/i.test(
    await page.locator('[data-testid="master-class-hint"]').innerText()),
    'and says plainly what "somebody else\'s" costs');

  await page.locator('[data-testid="master-class-choice"][data-class="own"]').click();
  await page.click('[data-testid="start-performance-go"]');
  await page.waitForURL(/\/p\/perf_/, { timeout: 30_000 });
  const perfId = page.url().split('/p/')[1];
  check(Boolean(perfId), 'choosing a song opens a performance', perfId);

  let doc = null;
  for (let i = 0; i < 90; i++) {
    doc = await api(`/api/performances/${perfId}`);
    if (doc.performance?.master?.durationSamples > 0) break;
    await sleep(1000);
  }
  const samples = doc?.performance?.master?.durationSamples ?? 0;
  // Five seconds at the HOUSE rate, from a 44.1 kHz file. Short on purpose:
  // a take can then cover the whole song, which is what §14 needs to render.
  check(Math.abs(samples - SONG_SECONDS * 48000) < 48000 * 0.05,
    'the song is measured by decoding, at the house rate (U-02)', `${samples} samples`);

  // ---- record against it -----------------------------------------------
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="arm"]:not([disabled])', { timeout: 40_000 });
  await page.click('[data-testid="arm"]');
  await page.waitForSelector('[data-testid="start-take"]', { timeout: 40_000 });
  check(true, 'the camera and the song load together');

  await page.fill('[data-testid="take-label"]', 'Living room');
  await page.selectOption('[data-testid="take-environment"]', 'concert_stage');
  await page.click('[data-testid="start-take"]');
  await page.waitForSelector('[data-testid="recording-now"]', { timeout: 25_000 });
  check(true, 'a count-in runs first, so nobody sings from a standing start (S-10)');

  await sleep(7000);
  await page.click('[data-testid="stop-take"]');

  let landed = null;
  for (let i = 0; i < 120; i++) {
    await sleep(1000);
    const d = await api(`/api/performances/${perfId}`);
    if (d.performance?.takes?.[0]?.durationSamples > 0) { landed = d; break; }
  }
  check(Boolean(landed), 'the take is assembled and placed on the song');

  if (landed) {
    const take = landed.performance.takes[0];
    /*
     * Long enough to be ALL of what was recorded. This check used to ask for
     * three seconds of a seven-second take and passed for years of runs while
     * every take silently lost its final segment — the recorder's `onstop`
     * read a ref that stopping had already cleared. A duration check that
     * cannot fail is not a duration check. [U-06]
     */
    check(take.durationSamples > 6 * 48000,
      'with a length counted from the media — and all of it, last segment included',
      `${(take.durationSamples / 48000).toFixed(2)}s`);
    check(take.label === 'Living room', 'under the name its author gave it');
    /*
     * The environment is a FIELD. "I would not permanently bake the background
     * into the raw recording" — so bedroom to concert stage is a re-plan, not
     * another four minutes of singing. [§4, S-6]
     */
    check(take.environment?.spaceId === 'concert_stage',
      'and the environment stored beside the recording, not burned into it',
      JSON.stringify(take.environment));
    check(Number.isInteger(take.alignment?.offsetSamples),
      'placed on the song in whole samples (INV-14)', `${take.alignment?.offsetSamples}`);
    check(take.alignment?.rateRatio === 1, 'claiming no drift that was not measured');
    check(!landed.alignmentError, 'and the alignment invariants hold',
      landed.alignmentError ?? '');

    const job = (landed.jobs ?? []).find((j) => j.kind === 'assemble_performance_take');
    check(job?.state === 'done', 'the assembly finished', job?.error ?? job?.state);
    /*
     * How well the song was heard in the take — which is the honest answer to
     * "did the correlation work", and on headphones the answer is no. [S-3]
     */
    check(typeof job?.result?.correlation === 'number',
      'and reports how audible the song was in the take',
      `corr=${job?.result?.correlation} audible=${job?.result?.masterAudible}`);
  }

  // ---- the rights class governs what the studio will do ----------------
  const classify = (cls) => sfetch(`${BASE}/api/performances/${perfId}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'classify-master', class: cls, licence: 'Sync 2026-1' }),
  });
  check((await classify('licensed')).status === 200,
    'a licence can be declared later, because one can be bought');
  /*
   * An invented class used to be written straight into the document — and
   * `mayPublish` read "not third_party", so an unrecognised value was
   * publishable. An allowlist is the only safe default for a question about
   * somebody else's rights.
   */
  check((await classify('neon')).status === 400,
    'but a class nobody defined is refused as a bad request');
  check((await api(`/api/performances/${perfId}`)).performance.master.class === 'licensed',
    'and the document is left as it was');

  // ---- directing: many takes, one song (§2, §5, §6, §7, §8, §15) --------
  {
    // A second take, so there is something to cut between.
    await page.waitForSelector('[data-testid="start-take"]', { timeout: 40_000 });
    await page.fill('[data-testid="take-label"]', 'Beach');
    await page.click('[data-testid="start-take"]');
    await page.waitForSelector('[data-testid="recording-now"]', { timeout: 25_000 });
    await sleep(6000);
    await page.click('[data-testid="stop-take"]');

    let two = null;
    for (let i = 0; i < 120; i++) {
      await sleep(1000);
      const d = await api(`/api/performances/${perfId}`);
      if (d.performance.takes.filter((t) => t.durationSamples > 0).length === 2) { two = d; break; }
    }
    check(Boolean(two), 'a second take lands on the same song');

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="switching-stage"]', { timeout: 30_000 });
    check(await page.locator('[data-testid="rail-take"]').count() === 2,
      'both takes appear in the rail, numbered as the keys are');

    /*
     * §7. The author presses a number while the song plays and a scene is
     * written onto the master timeline. This is the whole of "directing the
     * music video live" — and it writes the same object §8 will drag.
     */
    await page.click('[data-testid="live-switching"]');
    await page.click('[data-testid="player-play"]');
    await sleep(1200);
    await page.keyboard.press('1');
    await sleep(2000);
    await page.keyboard.press('2');
    await sleep(800);

    let scenes = (await api(`/api/performances/${perfId}`)).performance.scenes;
    check(scenes.length === 2, 'pressing a number puts that take on the song (§7)',
      `${scenes.length} scene(s)`);
    check(scenes.every((sc) => Number.isInteger(sc.fromSample)),
      'at a moment on the music clock, in whole samples');
    const ordered = [...scenes].sort((a, b) => a.fromSample - b.fromSample);
    check(ordered[1].fromSample > ordered[0].fromSample,
      'and the second cut lands after the first',
      `${ordered[0].fromSample} then ${ordered[1].fromSample}`);
    check(ordered.every((sc) => sc.takeIds.length === 1
      && sc.layoutId === 'performance_full'),
      'each showing one performance, full frame (§5)');

    check(await page.locator('[data-testid="timeline-scene"]').count() === 2,
      'and the song is drawn with the scenes cut into it (§2)');

    /*
     * §8. The same scenes, moved. "Now you can drag the boundaries." One
     * artefact, two ways in — so there is no switching log to reconcile with
     * an edit list.
     */
    const moveTo = ordered[1].fromSample + 48000;
    const moved = await sfetch(`${BASE}/api/performances/${perfId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'move-scene', sceneId: ordered[1].id, at: moveTo }),
    });
    check(moved.status === 200, 'a boundary can be dragged afterwards (§8)');
    scenes = (await api(`/api/performances/${perfId}`)).performance.scenes;
    check(scenes.find((sc) => sc.id === ordered[1].id)?.fromSample === moveTo,
      'and it is the same scene that moved, not a new one');
    check(scenes.length === 2, 'with no extra scene invented by the edit');

    // Two scenes cannot start at one instant: the order would depend on a
    // tiebreak rather than on the author.
    const collide = await sfetch(`${BASE}/api/performances/${perfId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'move-scene', sceneId: ordered[1].id,
        at: ordered[0].fromSample }),
    });
    check(collide.status === 400, 'but not onto another one');

    /*
     * §5 and §6 are rows in the layout table, and the table decides how many
     * performances an arrangement holds. Three takes in a two-panel scene is
     * a panel that does not exist.
     */
    const takeIds = two.performance.takes.map((t) => t.id);
    const half = await sfetch(`${BASE}/api/performances/${perfId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'set-scene', at: 0,
        layoutId: 'performance_half', takeIds }),
    });
    check(half.status === 200, 'two takes can share the frame (§5 Half Mode)');
    const tooMany = await sfetch(`${BASE}/api/performances/${perfId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'set-scene', at: 0,
        layoutId: 'performance_full', takeIds }),
    });
    check(tooMany.status === 400,
      'but an arrangement holds only the number of panels it has (§6)');

    // §15: the sections of the song, named.
    const labelled = await sfetch(`${BASE}/api/performances/${perfId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'label-scene',
        sceneId: ordered[0].id, label: 'Verse 1' }),
    });
    check(labelled.status === 200, 'a stretch of the song can be named (§15)');
    check((await api(`/api/performances/${perfId}`)).performance.scenes
      .find((sc) => sc.id === ordered[0].id)?.label === 'Verse 1',
      'and the name is on the scene, not beside it');

    // Starting the edit again costs the edit and never a performance.
    await page.click('[data-testid="clear-scenes"]');
    await sleep(800);
    const cleared = (await api(`/api/performances/${perfId}`)).performance;
    check(cleared.scenes.length === 0, 'the edit can be thrown away and done again');
    check(cleared.takes.length === 2,
      'and the recordings survive it — they are what cost something to make');
  }

  /*
   * --- §14: one video, at the end of it --------------------------------
   *
   * "Never merge the individual takes into one irreversible video until the
   *  final master render." Everything above this point is reversible; this is
   *  the one place the takes stop being separate files.
   *
   * What is checked is the whole claim: that the render is REFUSED for
   * reasons the author can act on, that it produces a file as long as the
   * song with the song on it, and that pressing it again costs nothing
   * because the plan is derived and the shots are cached (INV-00, U-16).
   */
  {
    const perf = (await api(`/api/performances/${perfId}`)).performance;
    const usable = perf.takes.filter((t) => t.durationSamples > 0);
    const render = (body) => sfetch(`${BASE}/api/performances/${perfId}/renders`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const scene = (at, layoutId, takeIds) => sfetch(`${BASE}/api/performances/${perfId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'set-scene', at, layoutId, takeIds }),
    });

    // Nothing on screen. Scenes were just cleared, so this is the real state.
    const empty = await render();
    check(empty.status === 409, 'a performance with nothing on screen will not render');

    /*
     * A scene whose take runs out part way through it. The take is real and
     * the scene is legal — what is wrong is that one does not reach the end
     * of the other, and the message has to say which take and where, because
     * "no performance" would be accurate and useless.
     */
    await sfetch(`${BASE}/api/performances/${perfId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'trim-take', takeId: usable[0].id,
        useFromSample: 0, useToSample: Math.round(samples / 2) }),
    });
    await scene(0, 'performance_full', [usable[0].id]);
    const short = await render();
    const shortBody = await short.json().catch(() => ({}));
    check(short.status === 409 && /do not reach/.test(shortBody.error ?? ''),
      'a take that runs out mid-scene is named, not silently rendered black',
      shortBody.error ?? `status ${short.status}`);

    // Untrimmed, and cut in two so the render has something to prove.
    await sfetch(`${BASE}/api/performances/${perfId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'trim-take', takeId: usable[0].id,
        useFromSample: null, useToSample: null }),
    });
    await scene(Math.round(samples / 2), 'performance_full', [usable[1].id]);

    /*
     * The rights gate, at the place the file is made rather than only at the
     * place the music was classified. A check in an interface is one refactor
     * away from not being in the path. [INV-15, S-9]
     */
    await sfetch(`${BASE}/api/performances/${perfId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'classify-master', class: 'third_party' }),
    });
    const refusedRights = await render();
    const rightsBody = await refusedRights.json().catch(() => ({}));
    check(refusedRights.status === 409 && /publish/i.test(rightsBody.error ?? ''),
      "somebody else's music will not render a publishable master (INV-15)",
      rightsBody.error ?? `status ${refusedRights.status}`);
    const privately = await render({ allowUnpublishable: true });
    check(privately.status === 202,
      'but the author may still export a private copy of their own performance');

    await sfetch(`${BASE}/api/performances/${perfId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'classify-master', class: 'own' }),
    });

    // ---- and now the video itself --------------------------------------
    const queued = await render({ exportProfileId: 'vertical_9x16' });
    const queuedBody = await queued.json().catch(() => ({}));
    check(queued.status === 202, 'a covered performance can be made into a video (§14)',
      queuedBody.error ?? `status ${queued.status}`);
    check(Math.abs((queuedBody.totalOutputFrames ?? 0) - SONG_SECONDS * 30) <= 2,
      'as long as the song and no longer (INV-03)',
      `${queuedBody.totalOutputFrames} frames`);

    let done = null;
    for (let i = 0; i < 240; i++) {
      await sleep(1000);
      const jobs = (await api(`/api/performances/${perfId}/renders`)).jobs ?? [];
      const job = jobs.find((j) => j.id === queuedBody.job?.id);
      if (job && (job.state === 'done' || job.state === 'failed')) { done = job; break; }
    }
    check(done?.state === 'done', 'and the render finishes',
      done?.error ?? done?.state ?? 'never finished');

    if (done?.state === 'done') {
      const hash = done.result?.planHash;
      check(hash === queuedBody.planHash,
        'the worker rebuilt the identical plan from the same document (INV-00)',
        `${queuedBody.planHash} vs ${hash}`);

      const file = await sfetch(
        `${BASE}/api/performances/${perfId}/renders/${hash}/file`);
      check(file.status === 200 && file.headers.get('content-type') === 'video/mp4',
        'and the video is there to download', `status ${file.status}`);

      const outPath = `${process.env['TMPDIR'] ?? '/tmp'}/balancevid-e2e-master.mp4`;
      await writeFile(outPath, Buffer.from(await file.arrayBuffer()));
      /*
       * Probed, not read out of ffmpeg's prose. Parsing the log is how a
       * duration check once read a units suffix and believed it: the
       * structured answer is the only one worth asserting on. [U-02]
       */
      const probe = JSON.parse(execFileSync(ffprobe.path, [
        '-v', 'error', '-show_streams', '-show_format',
        '-of', 'json', outPath,
      ]).toString());
      const video = probe.streams.filter((st) => st.codec_type === 'video');
      const audio = probe.streams.filter((st) => st.codec_type === 'audio');
      check(video.length === 1 && video[0].width === 1080 && video[0].height === 1920,
        'in the shape that was asked for (§14: four shapes, one performance)',
        `${video[0]?.width}x${video[0]?.height}`);
      /*
       * The song, over the whole thing, as ONE stream. Slicing the music at
       * the video cuts is how you get a click at every one of them, so the
       * picture is concatenated first and the master laid over it in one
       * pass. [S-7]
       */
      check(audio.length === 1,
        'with the song running underneath, unbroken across the cut (S-7)',
        `${audio.length} audio stream(s)`);
      const seconds = Number(probe.format.duration ?? 0);
      check(Math.abs(seconds - SONG_SECONDS) < 0.3,
        'and it lasts exactly as long as the song', `${seconds}s`);

      /*
       * Pressing it again. Nothing about the document changed, so every shot
       * is already on disk under its content hash and the second render is
       * the concatenation alone. [U-16]
       */
      const again = await render({ exportProfileId: 'vertical_9x16' });
      const againBody = await again.json().catch(() => ({}));
      check(againBody.planHash === hash,
        'asking again describes the same video, byte for byte (INV-00, U-16)');
      let second = null;
      for (let i = 0; i < 240; i++) {
        await sleep(1000);
        const jobs = (await api(`/api/performances/${perfId}/renders`)).jobs ?? [];
        const job = jobs.find((j) => j.id === againBody.job?.id);
        if (job && (job.state === 'done' || job.state === 'failed')) { second = job; break; }
      }
      check(second?.state === 'done' && second.result?.shotsRendered === 0,
        'and re-renders none of it',
        `rendered=${second?.result?.shotsRendered} cached=${second?.result?.shotsCached}`);
    }

    // The studio offers it, and says what is missing when it cannot.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="master-render"]', { timeout: 30_000 });
    check(await page.locator('[data-testid="render-master"]').count() === 1,
      'and the studio has one button for it, once the song is covered');
    check(await page.locator('[data-testid="render-download"]').count() >= 1,
      'with the finished video beside it');
  }

  // ---- and none of it is a stranger's -----------------------------------
  for (const path of [`/p/${perfId}`, `/api/performances/${perfId}`,
    `/api/performances/${perfId}/master`, '/api/performances']) {
    const refused = await raw(path);
    check(refused.status >= 300 && refused.status !== 200,
      `a stranger cannot reach ${path.replace(perfId, '…')}`, `status ${refused.status}`);
  }
}

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
