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

const BASE = process.env.BASE ?? 'http://localhost:3000';
const SOURCE = process.argv[2];
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
if (!SOURCE) { console.error('usage: node scripts/e2e.mjs <source.mp4>'); process.exit(1); }

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

let failures = 0;
const check = (ok, label, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
};

// --- create the conversation ------------------------------------------------
log('opening', BASE);
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.setInputFiles('#file', SOURCE);
await page.fill('#sourceTitle', 'The History of Europe');
await page.fill('#creator', 'Example Channel');
await page.fill('#url', 'https://example.org/video');
await page.click('button[type=submit]');
await page.waitForURL(/\/c\//, { timeout: 60_000 });
const conversationId = page.url().split('/c/')[1];
log('conversation', conversationId);

// --- wait for ingest --------------------------------------------------------
log('waiting for the source to be normalised…');
await page.waitForSelector('video[src*="/source"]', { timeout: 120_000 });
const api = async (path) => (await fetch(`${BASE}${path}`)).json();
let snap = await api(`/api/conversations/${conversationId}`);
check(snap.conversation.source.durationFrames === 600, 'source normalised to 600 frames',
  `got ${snap.conversation.source.durationFrames}`);

// --- arm and run the one-key loop ------------------------------------------
await page.click('button:has-text("Arm camera")');
await page.waitForFunction(
  () => document.body.innerText.includes('Press space to interrupt'), null, { timeout: 30_000 });
log('camera armed');

await page.evaluate(() => document.querySelector('video[src*="/source"]').play());
await sleep(1200);

const ANCHORS = [];
for (let i = 0; i < 3; i++) {
  await sleep(2200);
  const before = await page.evaluate(() =>
    Math.floor(document.querySelector('video[src*="/source"]').currentTime * 30));
  await page.keyboard.press('Space');               // INTERRUPT
  await page.waitForFunction(
    () => document.body.innerText.includes('press space to continue'), null, { timeout: 20_000 });
  ANCHORS.push(before);
  log(`interrupt ${i + 1} at frame ~${before}`);

  await sleep(2600);                                 // speak
  await page.keyboard.press('Space');               // CONTINUE
  await page.waitForFunction(
    () => document.body.innerText.includes('Press space to interrupt'), null, { timeout: 60_000 });

  const after = await page.evaluate(() =>
    Math.floor(document.querySelector('video[src*="/source"]').currentTime * 30));
  check(Math.abs(after - before) <= 1, `resumed at the interrupt frame (${i + 1})`,
    `paused ${before}, resumed ${after}`);
}

// --- wait for takes to assemble --------------------------------------------
log('waiting for takes to assemble…');
for (let i = 0; i < 120; i++) {
  snap = await api(`/api/conversations/${conversationId}`);
  const pending = snap.conversation.interventions.filter(
    (iv) => iv.takes.every((t) => t.durationFrames === 0)).length;
  if (snap.conversation.interventions.length === 3 && pending === 0) break;
  await sleep(1000);
}
check(snap.conversation.interventions.length === 3, 'three interventions recorded',
  `got ${snap.conversation.interventions.length}`);
const preroll = snap.conversation.interventions.map((iv) => iv.takes[0].prerollFrames);
check(preroll.every((p) => p > 0), 'every take kept its pre-roll', `frames: ${preroll.join(', ')}`);
check(snap.invariantError === null, 'timeline invariants hold', snap.invariantError ?? '');

// --- render -----------------------------------------------------------------
log('rendering…');
await page.click('button:has-text("Generate final video")');
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
  const head = await fetch(url, { headers: { range: 'bytes=0-1023' } });
  check(head.status === 206, 'output serves byte ranges (seekable)', `status ${head.status}`);
  const srt = await fetch(`${url}?kind=srt`);
  check(srt.ok, 'caption sidecar ships with the export (INV-07)');
  console.log(JSON.stringify({
    planHash: job.result.planHash,
    totalOutputFrames: job.result.totalOutputFrames,
    shotsRendered: job.result.shotsRendered,
    shotsCached: job.result.shotsCached,
    outputPath: job.result.outputPath,
    anchors: ANCHORS,
  }, null, 2));
}

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
