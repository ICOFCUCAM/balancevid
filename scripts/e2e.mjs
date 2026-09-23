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
    publish: !!document.querySelector('[data-testid="toggle-export"]'),
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
  check(Math.abs(after - before) <= 1, `resumed at the interrupt frame (${i + 1})`,
    `paused ${before}, resumed ${after}`);
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
await page.click('[data-testid="toggle-export"]');
await page.click('[data-testid="start-export"]');
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

// The panel the author actually uses.
await page.reload();
await page.click('button[role=tab]:has-text("Studio")');
await page.click('[data-testid="toggle-export"]');
await page.waitForSelector('[data-testid="bundle-panel"]', { timeout: 20000 })
  .then(() => check(true, 'the studio shows the publication bundle'))
  .catch(() => check(false, 'the studio shows the publication bundle', 'panel never appeared'));
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
check((await raw(`/api/conversations/${conversationId}/interventions`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ tSourceFrame: 1, type: 'critique' }),
})).status === 401, 'a stranger still cannot change what was published');

// Withdrawing closes it again.
await sfetch(`${BASE}/api/conversations/${conversationId}/publish`, { method: 'DELETE' });
check((await raw(`/c/${conversationId}/watch`)).status === 404,
  'withdrawing puts it out of a stranger\'s reach again');

const childManifest = await api(
  `/api/conversations/${childId}/representations?id=manifest.json`);
check(childManifest.attribution?.includes('Responding to'),
  'the attribution credits what is being answered (U-21, U-31)');
check(childManifest.attribution?.includes('Original source'),
  'and the original source at the root of the chain');

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
