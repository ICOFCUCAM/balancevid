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
for (let i = 0; i < 2; i++) {
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
await page.waitForSelector('button:has-text("respond ↵")', { timeout: 30_000 });
// Watch for a moment first. Interrupting milliseconds after the previous
// response resumed would mean the pre-roll buffer has nothing in it yet --
// true of the product, but not how anyone actually watches a video.
await sleep(2500);
const sentenceCountBefore = (await api(`/api/conversations/${conversationId}`))
  .conversation.interventions.length;
await page.locator('button:has-text("respond ↵")').nth(1).click();
await page.waitForFunction(
  () => document.body.innerText.includes('press space to continue'), null, { timeout: 20_000 });
log('sentence-anchored interrupt');
await sleep(2400);
await page.keyboard.press('Space');
await page.waitForFunction(
  () => document.body.innerText.includes('Press space to interrupt'), null, { timeout: 60_000 });

let snapAfter = await api(`/api/conversations/${conversationId}`);
check(snapAfter.conversation.interventions.length === sentenceCountBefore + 1,
  'the transcript panel opened an intervention');
const quoted = snapAfter.conversation.interventions.filter((iv) => iv.anchor.quote);
check(quoted.length === 1, 'the claim is bound to the intervention (U-10)',
  quoted[0] ? `"${quoted[0].anchor.quote.slice(0, 48)}…"` : 'none');
check(quoted.every((iv) => Boolean(iv.anchor.quoteHash)), 'the claim carries its hash (INV-05)');

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

// --- Studio Mode (§17, §36) -------------------------------------------------
log('studio mode…');
page.on('dialog', (dialog) => dialog.accept());
await page.click('button[role=tab]:has-text("Studio")');
await page.waitForSelector('text=Conversation timeline', { timeout: 20_000 });
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
  () => document.body.innerText.includes('press space to continue'), null, { timeout: 20_000 });
await sleep(2400);
await page.keyboard.press('Space');
await page.waitForFunction(
  () => document.body.innerText.includes('Press space to interrupt'), null, { timeout: 60_000 });
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

const capture = await fetch(
  `${BASE}/api/conversations/${conversationId}/evidence/${evidence.id}/capture`);
check(capture.ok && capture.headers.get('content-type') === 'image/png',
  'the archived capture is served back');

// Point at the part that matters, from the keyboard-reachable fields.
await page.locator('button:has-text("Locate")').first().click();
await page.waitForSelector('input[aria-label="Evidence appears"]', { timeout: 10_000 });
const locateResponse = await fetch(
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
const circle = await (await fetch(annBase, {
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

await fetch(annBase, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    kind: 'blur', points: [{ x: 0.7, y: 0.06 }, { x: 0.96, y: 0.3 }], style: {},
  }),
});

const timed = await fetch(`${annBase}/${circle.annotation.id}`, {
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
  await fetch(
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
const clipStart = await fetch(`${BASE}/api/conversations/${conversationId}/clips`, {
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
  const head = await fetch(clipUrl, { headers: { range: 'bytes=0-1023' } });
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

// --- the article (U-14) -----------------------------------------------------
log('checking the article…');
const articleResponse = await fetch(`${BASE}/c/${conversationId}/article`);
check(articleResponse.ok, 'the conversation renders as an article');
const articleHtml = await articleResponse.text();
check(articleHtml.startsWith('<!doctype html>'), 'the article is a standalone document');
check(articleHtml.includes('Example Channel'), 'the article carries the generated attribution (U-21)');
if (quoted[0]) {
  check(articleHtml.includes(quoted[0].anchor.quote),
    'the article quotes the claim being answered (U-10)');
}
check(!articleHtml.includes('<script'), 'the article loads nothing');

const list = await api(`/api/conversations/${conversationId}/representations`);
const ids = list.representations.filter((r) => r.available).map((r) => r.id);
check(ids.includes('article.md') && ids.includes('captions.srt'),
  'the registry lists what this conversation can produce (D-16)', ids.join(', '));
check(list.representations.every((r) => r.inputs.length > 0),
  'every representation declares its inputs (D-16)');

const markdown = await (await fetch(
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
const embedded = await (await fetch(`${BASE}/api/conversations`, {
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

const refusedComposed = await fetch(`${BASE}/api/conversations/${embeddedId}/renders`, {
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
const reelStart = await fetch(`${BASE}/api/conversations/${conversationId}/renders`, {
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
  const reelFile = await fetch(
    `${BASE}/api/conversations/${conversationId}/renders/${reelPlanHash}/file`,
    { headers: { range: 'bytes=0-1023' } });
  check(reelFile.status === 206, 'the reel is served');
  check(reelJob.result.responses > 0, 'the reel holds the author\'s responses',
    `${reelJob.result.responses} responses`);
}

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
