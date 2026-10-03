/**
 * The winning entry re-enters the system it came from.
 *   [GO-VIRAL V-6, §1; Doctrine D-19, D-25]
 *
 * > **Judged on:** *"A winner's take is scheduled on a channel
 * > through the ordinary route with no campaign-specific code in
 * > the playout path; and a clip pasted into a messaging app shows
 * > the campaign and links back to it."*
 *
 * THE FIRST CLAUSE IS A CLAIM ABOUT WHAT IS *NOT* THERE, which is
 * the kind that rots quietly. A take that came through a call is
 * an ordinary take carrying one more fact, and the moment the
 * renderer, the library or the playout loop learns to ask about
 * that fact, a competition has grown a second pipeline. So the
 * test derives the question from the directories rather than
 * naming files somebody has to remember to add.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { type Campaign, callCredit } from '../../src/domain/campaign.js';
import { callsIn } from '../../src/domain/performance.js';
import type { Performance, PerformanceTake } from '../../src/domain/performance.js';
import { buildPerformanceCard } from '../../src/publish/performanceCard.js';
import { shareCardAss } from '../../src/render/thumbnails.js';

const ROOT = join(import.meta.dirname, '..', '..');

const take = (id: string, fromCall?: string): PerformanceTake => ({
  id,
  assetId: `asset_${id}`,
  label: id,
  environment: { kind: 'original' },
  durationSamples: 48000 * 30,
  offsetSamples: 0,
  alignment: { kind: 'unplaced' },
  createdAt: '2026-06-01T09:00:00.000Z',
  ...(fromCall ? { fromCall } : {}),
} as unknown as PerformanceTake);

const performance = (takes: PerformanceTake[]): Performance => ({
  schemaVersion: 1,
  id: 'perf_one' as never,
  title: 'The Long Way Round',
  master: {
    assetId: 'asset_song' as never,
    title: 'The Long Way Round',
    artist: 'The Band',
    class: 'own',
    durationSamples: 48000 * 180,
  },
  takes,
  scenes: [],
  plates: [],
  audio: { mode: 'music_and_mic' },
  layoutProfileId: 'default',
  createdAt: '2026-06-01T09:00:00.000Z',
  updatedAt: '2026-06-01T09:00:00.000Z',
} as unknown as Performance);

const aCall = (over: Partial<Campaign> = {}): Campaign => ({
  id: 'camp_one' as never,
  title: 'Sing the second verse',
  track: { kind: 'performance', id: 'perf_one' },
  rules: { asks: 'Sing it outdoors' },
  window: {
    respondable: true, access: 'anyone',
    opensAt: '2026-06-01T09:00:00.000Z', closesAt: '2026-10-04T12:00:00.000Z',
  },
  slug: 'second-verse',
  state: 'results',
  createdAt: '2026-06-01T09:00:00.000Z',
  history: [],
  ...over,
} as Campaign);

describe('where a take came from', () => {
  it('is nothing for every performance this product has made', () => {
    expect(callsIn(performance([take('one'), take('two')]))).toEqual([]);
  });

  it('is the call a take came in through', () => {
    expect(callsIn(performance([take('one', 'camp_a')]))).toEqual(['camp_a']);
  });

  /*
   * ONE ROW PER CALL, IN THE ORDER THE TAKES WERE ADDED. A
   * producer running two calls and using three takes from one of
   * them has answered two calls, not four.
   */
  it('names each call once, in arrival order', () => {
    expect(callsIn(performance([
      take('one', 'camp_b'), take('two', 'camp_a'),
      take('three', 'camp_b'), take('four'),
    ]))).toEqual(['camp_b', 'camp_a']);
  });
});

describe('the line a clip carries back', () => {
  /*
   * THE NAME, THE END DATE AND THE ADDRESS, which is the brief's
   * own list and the whole of the loop's last arrow.
   */
  it('names the call, when it closed, and where it is', () => {
    expect(callCredit(aCall(), '/go/second-verse'))
      .toBe('An entry in “Sing the second verse”'
        + ' · closed 4 October 2026 · /go/second-verse');
  });

  /*
   * THE DATE AND NOT THE STATE, because a card is read months
   * later: *closed 4 October 2026* stays true and *judging* does
   * not. Tested by a fixture whose state disagrees with it.
   */
  it('says when it closed and not where it has got to', () => {
    const line = callCredit(aCall({ state: 'judging' }), '/go/second-verse');
    expect(line).toContain('closed 4 October 2026');
    expect(line).not.toContain('judging');
  });

  /*
   * AND THE DATE IS THE DEADLINE'S OWN, NOT THE MACHINE'S.
   *
   * FOUND BY MUTATION: with `timeZone: 'UTC'` deleted every test
   * still passed, because this container runs in UTC and so does
   * every machine a test has run on. A call closing at 23:30 UTC
   * is the fixture where a zone would show — an installation an
   * hour east would print the next day, on a picture people
   * keep. The formatter is gone; the date is sliced out of the
   * instant's own ISO text, which is UTC by definition.
   */
  it('prints the deadline\'s own day, late in the evening', () => {
    const late = aCall();
    late.window = { ...late.window, closesAt: '2026-10-04T23:30:00.000Z' };
    expect(callCredit(late, '/go/x')).toContain('closed 4 October 2026');

    const early = aCall();
    early.window = { ...early.window, closesAt: '2026-01-01T00:15:00.000Z' };
    expect(callCredit(early, '/go/x')).toContain('closed 1 January 2026');
  });

  /*
   * AND IT PRINTS THE SAME DAY ON A MACHINE THAT IS NOT IN UTC,
   * WHICH IS THE ONLY WAY THIS IS TESTED AT ALL.
   *
   * Every machine this suite has run on is in UTC, so a version
   * that read the process's own zone passed everything — the
   * mutation survived twice before this test existed. Kiritimati
   * is UTC+14: a deadline at 23:30 UTC is already the next
   * afternoon there, and a card printed for an installation in
   * that zone would give a date the call did not close on.
   *
   * `TZ` IS RESTORED IN A `finally`, because a test that leaves
   * the process in another zone is a test that breaks the next
   * file in a way nobody traces back here.
   */
  it('prints it the same wherever the machine thinks it is', () => {
    const was = process.env['TZ'];
    try {
      const late = aCall();
      late.window = { ...late.window, closesAt: '2026-10-04T23:30:00.000Z' };
      for (const zone of ['Pacific/Kiritimati', 'Pacific/Niue', 'UTC']) {
        process.env['TZ'] = zone;
        expect(callCredit(late, '/go/x'), zone)
          .toContain('closed 4 October 2026');
      }
    } finally {
      if (was === undefined) delete process.env['TZ'];
      else process.env['TZ'] = was;
    }
  });

  it('leaves the date out where there is no deadline', () => {
    const open = aCall();
    open.window = { ...open.window, closesAt: undefined };
    expect(callCredit(open, '/go/second-verse'))
      .toBe('An entry in “Sing the second verse” · /go/second-verse');
  });

  /*
   * AND THE ADDRESS IS WHATEVER THE CALLER COULD HONESTLY GIVE.
   * A whole URL from a route that has a request; a path from a
   * worker that has none. A module that invented an origin would
   * print the wrong hostname on every card this installation
   * ever posts.
   */
  it('takes the address it is handed', () => {
    expect(callCredit(aCall(), 'https://studio.example/go/second-verse'))
      .toContain('https://studio.example/go/second-verse');
  });
});

describe('the card a clip is previewed as', () => {
  const card = (call?: string) => buildPerformanceCard({
    performance: performance([take('one', 'camp_one')]),
    attribution: 'Recorded by The Band',
    ...(call ? { call } : {}),
  });

  /*
   * NO EVENT, THOUGH THE STYLE IS ALWAYS DECLARED. A style with
   * nothing set in it draws nothing, and the assertion is about
   * what is drawn — which is the `Dialogue` line, not the
   * stylesheet above it.
   */
  it('carries no call line for a performance that answered none', () => {
    expect(card()).not.toHaveProperty('call');
    expect(shareCardAss(card())).not.toMatch(/Dialogue: [^\n]*,Call,/);
  });

  it('carries it where there is one, and draws it', () => {
    const line = callCredit(aCall(), '/go/second-verse');
    expect(card(line).call).toBe(line);
    const drawn = shareCardAss(card(line));
    expect(drawn).toContain('Sing the second verse');
    expect(drawn).toContain('/go/second-verse');
    /* Its own style, at the top, under the eyebrow. */
    expect(drawn).toMatch(/Style: Call,/);
    expect(drawn).toMatch(/Dialogue: [^\n]*,Call,/);
  });

  /*
   * AND THE WORDS SAY IT WHERE THERE IS NO PICTURE.
   *
   * FOUND IN A BROWSER RUN: the line was drawn on the card and
   * left out of `description`, which is the field a chat app
   * quotes when it shows text and no image — and this file's own
   * comment already said description carries *"the same facts in
   * the same order as the picture."*
   */
  it('says it in the words as well as in the picture', () => {
    const line = callCredit(aCall(), '/go/second-verse');
    expect(card(line).description).toContain('Sing the second verse');
    expect(card(line).description).toContain('/go/second-verse');
    expect(card().description).not.toContain('An entry in');
  });

  /*
   * AND THE ATTRIBUTION IS STILL THERE, which `thumbnails.ts`
   * calls *"the one line that is never dropped however long the
   * other two run."* The call line went at the TOP for exactly
   * this reason, and a test that only checked the new line
   * would not notice it had pushed the old one off.
   */
  it('does not displace the attribution', () => {
    const drawn = shareCardAss(card(callCredit(aCall(), '/go/second-verse')));
    expect(drawn).toContain('Recorded by The Band');
    expect(drawn).toMatch(/Dialogue: [^\n]*,Foot,/);
    expect(drawn).toMatch(/Dialogue: [^\n]*,Hero,/);
    expect(drawn).toMatch(/Dialogue: [^\n]*,Eyebrow,/);
  });
});

/* ------------------------------------------------------------------ *
 *  THE FIRST JUDGING CLAUSE, WHICH IS ABOUT WHAT IS NOT THERE.
 * ------------------------------------------------------------------ */

describe('the playout path', () => {
  /** Every file the transmission chain is made of, derived. */
  const chain = () => {
    const out: string[] = [];
    const walk = (where: string[]) => {
      for (const entry of readdirSync(join(ROOT, ...where), { withFileTypes: true })) {
        if (entry.isDirectory()) walk([...where, entry.name]);
        else if (entry.name.endsWith('.ts')) out.push(join(...where, entry.name));
      }
    };
    walk(['src', 'playout']);
    walk(['src', 'render']);
    out.push(join('src', 'store', 'broadcastLibrary.ts'));
    for (const one of ['channel.ts', 'channelEdit.ts', 'onAir.ts', 'asRun.ts',
      'schedule.ts', 'channelListing.ts']) {
      try {
        readFileSync(join(ROOT, 'src', 'domain', one), 'utf8');
        out.push(join('src', 'domain', one));
      } catch { /* not a module this product has. */ }
    }
    return out;
  };

  /*
   * > *"A winner's take is scheduled on a channel through the
   * > ordinary route with no campaign-specific code in the
   * > playout path."*
   *
   * DERIVED FROM THE DIRECTORIES, so a file added to the
   * transmission chain tomorrow is covered without anybody
   * remembering to list it — which is the failure the
   * import-graph guard was rewritten over. [V-3]
   *
   * IMPORTS AND NOUNS, NOT THE WORD. A paragraph explaining why
   * the playout path knows nothing about campaigns would be a
   * violation of a test that searched for the string, which is
   * how the `takeRanking` guard failed on its own first draft.
   * [T-1]
   */
  it('knows nothing about calls', () => {
    const files = chain();
    expect(files.length, 'the walk found the chain').toBeGreaterThan(15);
    expect(files).toContain(join('src', 'playout', 'segment.ts'));

    const offenders = files.filter((one) => {
      const body = readFileSync(join(ROOT, one), 'utf8');
      return /from '[^']*(campaign|campaignEdit|judging)\.js'/.test(body)
        || /\bfromCall\b|\bcallsIn\b|\bcallCredit\b/.test(body);
    });
    expect(offenders,
      'a winning entry travels the ordinary accept path and becomes an '
      + 'ordinary take; the transmission chain must not learn to ask '
      + 'which ones won').toEqual([]);
  });

  /*
   * AND THE LIBRARY LISTS IT AS WHAT IT IS. `BroadcastItem` is a
   * render with a title, a length and a kind; a winning
   * performance is a render with a title, a length and a kind.
   * The moment it grows a field for this, scheduling a winner
   * stops being the ordinary route.
   */
  it('lists a winner as an ordinary render', () => {
    const body = readFileSync(
      join(ROOT, 'src', 'store', 'broadcastLibrary.ts'), 'utf8');
    const shape = body.slice(body.indexOf('export interface BroadcastItem'));
    expect(shape.slice(0, shape.indexOf('\n}')))
      .not.toMatch(/call|campaign|winner|place|score/i);
  });
});
