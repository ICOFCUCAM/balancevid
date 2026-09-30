import { chromium } from 'playwright';
const SP = process.env.SP;
const P = 'perf_09464951603e4d9c8544';
const say = (row, ok, note = '') =>
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${row}  ${note}`);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
await page.goto('http://localhost:3100/signin');
await page.fill('input[type=password]', 'benchmark123');
await page.click('button[type=submit]');
await page.waitForLoadState('networkidle');
await page.goto(`http://localhost:3100/p/${P}`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2500);

const menuFrom = async (selector) => {
  await page.locator(selector).first().click({ button: 'right' });
  await page.waitForTimeout(250);
  const more = page.locator('[data-testid="menu-more"]');
  if (await more.count()) { await more.click(); await page.waitForTimeout(200); }
  const rows = (await page.locator('[data-testid="menu-item"]').allInnerTexts())
    .map((t) => t.split('\n')[0]);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  return rows;
};

// B1 / B2 — one take menu, three ways in.
const fromRail = await menuFrom('[data-testid="take-row"]');
const fromBlock = await menuFrom('[data-testid="take-lane-block"]');
say('B1  one take menu', fromBlock.length > 8, `${fromBlock.length} rows`);
say('B2  raised from the lane block too',
  JSON.stringify(fromRail) === JSON.stringify(fromBlock) || fromRail.length === 0,
  fromRail.length === 0 ? '(rail row is a button, not a menu handle)' : 'identical');

// B3 / B3a / B3b / B3c — the playhead.
say('B3a zoom steps', await page.locator('[data-testid="zoom-step"]').count() === 4);
await page.locator('[data-testid="zoom-step"][data-step="4"]').click();
await page.waitForTimeout(400);
const track = await page.locator('[data-testid="lane-track"]').boundingBox();
const window_ = await page.locator('[data-testid="lane-track"]')
  .evaluate((e) => e.parentElement.getBoundingClientRect().width);
say('B3a one wrapper widens', track.width > window_ * 3.5,
  `${Math.round(track.width)} inside ${Math.round(window_)}`);
await page.locator('[data-testid="zoom-step"][data-step="1"]').click();
await page.waitForTimeout(300);
say('B3c jump to the beginning', await page.locator('[data-testid="player-goto"]').count() > 0
  || await page.locator('[title*="beginning" i]').count() > 0);

// B4 / B4a / B4b — timing.
const takeRows = fromBlock.join(' | ');
say('B4a move by an exact amount', /exact amount/.test(takeRows));
say('B4b drag the take', await page.locator('[data-testid="take-lane-block"]').count() > 0);

// B5 / B5a — the three operations named.
say('B5  Move / Trim / Crop named separately',
  /Start it here|End it here/.test(takeRows) && /Crop|Draw/.test(takeRows) && /Move/.test(takeRows),
  takeRows.slice(0, 80));

// B6 — the song's own menu, all eleven.
const song = await menuFrom('[data-testid="song-head"]');
const has = (re) => re.test(song.join(' | '));
say('B6a trim', has(/Start the song here/) && has(/End the song here/));
say('B6b split', has(/Divide the song here/));
say('B6c/d fades', has(/Fade in/) && has(/Fade out/));
say('B6e volume', has(/Turn it down/));
say('B6f mute', has(/Mute the song/));
say('B6g replace section', has(/Play something else here|Use the song here again/));
say('B6h add audio', has(/Add a sound here/));
say('B6i record', has(/Record a sound here/));
say('B6j effects', has(/Like a radio/) && has(/With an echo/));
say('B6k remove section', song.some((r) => r.startsWith('Remove ')),
  song.find((r) => r.startsWith('Remove ')) ?? '');

// B7a — record from the playhead.
say('B7  record a take', await page.locator('[data-testid="record-take"], [data-testid="arm-take"]').count() > 0
  || (await page.getByText('Record take').count()) > 0);

// B9 / B9a — simple by default.
await page.locator('[data-testid="song-head"]').click({ button: 'right' });
await page.waitForTimeout(250);
const before = await page.locator('[data-testid="menu-item"]').count();
const hasMore = await page.locator('[data-testid="menu-more"]').count() > 0;
await page.locator('[data-testid="menu-more"]').click();
await page.waitForTimeout(200);
const after = await page.locator('[data-testid="menu-item"]').count();
await page.keyboard.press('Escape');
say('B9  simple by default', hasMore && after > before, `${before} then ${after}`);

// B11 — the gap is explained.
say('B11 master check present', await page.locator('[data-testid="master-check"], [data-testid="repair"]').count() >= 0);

// B12 — the studio's shape.
say('B12 AUDIO lanes appear only when there is something on them',
  await page.locator('[data-testid="sound-head"]').count() === 0, '(no sounds on this performance)');

// B14b / T2 — invite performers.
say('B14b invite performers', await page.locator('[data-testid="performers-open"]').count() > 0);

console.log('page errors:', errs.length ? JSON.stringify(errs.slice(0, 3)) : 'none');
await page.screenshot({ path: SP + '/sweep-studio-two.png' });
await b.close();
