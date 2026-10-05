/**
 * The control room, held to the brief it was built from.
 *   [CHANNEL §2, §12, §13; TV-NETWORK; Doctrine D-19, D-21, D-24]
 *
 *     RUNDOWN → PROGRAM → TRANSMISSION
 *
 * The third of three integrations, and the one where the brief
 * and the product were already the same shape: a bar, a rail, a
 * gallery, a live studio and a master control strip. So the
 * risk here is not that the frame is wrong — it is that
 * something inside it was quietly lost while the frame went on,
 * which is the half a screenshot cannot show.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import postcss from 'postcss';

const ROOT = join(import.meta.dirname, '..', '..');
const SHEET = join(ROOT, 'app', 't', '[id]', 'studio-three.css');
const BRIEF = join(ROOT, 'Studio3.html');

function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

interface Rule { at: string; sel: string; decls: string }

function rules(css: string): Rule[] {
  const out: Rule[] = [];
  postcss.parse(css).walkRules((rule) => {
    const at: string[] = [];
    for (let p: any = rule.parent; p && p.type === 'atrule'; p = p.parent) {
      at.unshift(`@${p.name} ${p.params}`);
    }
    const decls: string[] = [];
    rule.walkDecls((d) => {
      decls.push(
        `${d.prop}:${d.value.replace(/\s+/g, ' ').trim()}${d.important ? '!important' : ''}`);
    });
    out.push({
      at: at.join(' | '),
      sel: rule.selectors.map((s) => s.trim()).sort().join(','),
      decls: decls.join(';'),
    });
  });
  return out;
}

const sheet = rules(readFileSync(SHEET, 'utf8'));

describe('the transcription', () => {
  const brief = existsSync(BRIEF)
    ? (() => {
      const src = readFileSync(BRIEF, 'utf8');
      return rules(src.slice(src.indexOf('<style>') + 7, src.indexOf('</style>')));
    })()
    : null;

  it('has the brief to compare against', () => {
    expect(brief, `${BRIEF} is gone — the comparison below proves nothing`)
      .not.toBeNull();
  });

  /*
   * ONE RULE IS KNOWINGLY OVERRIDDEN and it is named rather
   * than excused: `.center`. The brief's centre is three rows —
   * a head, the program-and-preview output, then the multiview.
   * This gallery's centre is two: the programme above and the
   * day below, which is the split a gallery has, with the
   * multiview inside the top row beside the preview. Cutting it
   * into the brief's three rows would move the 24/7 schedule
   * out of the centre entirely, and the schedule is half of
   * what this room is for. The declarations are all still here;
   * a later rule wins.
   */
  it('keeps every declaration the brief wrote', () => {
    if (!brief) return;
    const mine = new Set(sheet.map((r) => `${r.at}\u0000${r.decls}`));
    const missing = brief
      .filter((r) => !mine.has(`${r.at}\u0000${r.decls}`))
      .map((r) => `${r.sel} {${r.decls.slice(0, 70)}}`);
    expect(missing, `altered or dropped: ${missing.join(' | ')}`).toEqual([]);
  });

  it('transcribed all of them', () => {
    if (!brief) return;
    expect(brief.length).toBeGreaterThanOrEqual(125);
  });
});

describe('the scope', () => {
  it('puts every selector inside the room', () => {
    const loose = sheet.flatMap((r) => r.sel.split(','))
      .filter((s) => !s.trim().startsWith('.s3'));
    expect(loose, `a rule that reaches the rest of the product: ${loose.join(', ')}`)
      .toEqual([]);
  });

  it('stays out of the stylesheet that loads everywhere', () => {
    expect(readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8'))
      .not.toContain('studio-three.css');
    expect(code(join(ROOT, 'app', 't', '[id]', 'ChannelStudio.tsx')))
      .toContain("import './studio-three.css'");
  });

  /*
   * AND THE RESET NAMES CONTROLS, NOT ELEMENTS — which matters
   * more in this room than in either of the others. The whole
   * control room is built from `.ctl`, and `console.test.ts`
   * holds every file in `app/t` to that. A `.s3 button` reset
   * is (0,1,1) against `.ctl`'s (0,1,0) and would flatten the
   * lot; Studio One's first attempt did exactly that and no
   * screenshot showed it.
   */
  it('never resets a bare element the control room relies on', () => {
    const banned = [/^\.s3 button$/, /^\.s3 a$/, /^\.s3 h[123]$/,
      /^\.s3 input$/, /^\.s3 select$/];
    const offenders: string[] = [];
    for (const rule of sheet) {
      for (const sel of rule.sel.split(',')) {
        const s = sel.trim();
        if (!banned.some((b) => b.test(s))) continue;
        const harmless = /^(font:inherit|color:inherit)(;(font:inherit|color:inherit))*$/;
        if (harmless.test(rule.decls)) continue;
        offenders.push(`${s} {${rule.decls.slice(0, 60)}}`);
      }
    }
    expect(offenders, 'this flattens the console controls inside the room: '
      + offenders.join(' | ')).toEqual([]);
  });
});

describe('all of Online TV is in the room', () => {
  const studio = code(join(ROOT, 'app', 't', '[id]', 'ChannelStudio.tsx'));
  const everywhere = readdirSync(join(ROOT, 'app', 't', '[id]'))
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => code(join(ROOT, 'app', 't', '[id]', f)))
    .join('\n');

  /*
   * > *"intergrate the entire studio 3 under this"*
   *
   * The frame went on around these, not instead of them.
   */
  /*
   * NAMED AS THEY ARE RENDERED, not as their files are called.
   * `MediaPlayer.tsx` is imported as `MediaPlayerPanel`, and
   * the first version of this asserted the filename — so it
   * reported the media player missing while it was on screen.
   * A test that is wrong about the name is a test that will be
   * silenced by renaming it rather than by fixing anything.
   */
  it.each([
    'StudioBar', 'MediaPlayerPanel', 'SlidesPanel', 'BackgroundPanel',
    'GuestsTab', 'AnswersTab', 'GuestGrid', 'ConfidenceMonitor',
  ])('still renders %s', (name) => {
    expect(everywhere).toMatch(new RegExp(`<${name}[\\s/>]`));
  });

  /* The five regions the brief names, and the room's own five. */
  it('is framed as the brief draws it', () => {
    for (const cls of ['s3', 'app', 'topbar', 'main', 'left', 'center',
      'right', 'bottom']) {
      expect(studio, `no className="${cls}"`).toContain(`className="${cls}"`);
    }
  });

  /*
   * THE RAIL, THE GALLERY, THE LIVE STUDIO AND THE TRANSPORT
   * are each identified, and each is what the frame was built
   * around. A region that lost its test id lost the thing that
   * proves it is still placed.
   */
  it.each([
    'channel-rail', 'program-output', 'preview-next', 'multi-view',
    'schedule-deck', 'live-studio', 'channel-transport',
  ])('still places %s', (id) => {
    expect(studio).toContain(`testid="${id}"`);
  });

  /*
   * AND THE ROOM HAS ONE CLOCK. `StudioBar` printed the channel
   * name, the time and the zone in its trailing slot; the brief
   * draws the same three things as a channel block and a clock.
   * A control room is the last place to have two clocks, and
   * two readouts of one fact are two places it can disagree.
   * [D-19]
   */
  it('has one clock and one channel name', () => {
    expect(studio).toContain('data-testid="channel-clock"');
    expect(studio).not.toContain('trailing={(');
  });

  /*
   * THE CHANNEL'S SHORT IDENTITY IS NOT INVENTED. The brief
   * prints `#BAL-01`; this network's equivalent is the
   * station's callsign, which `station.ts` makes optional
   * because a channel is identified by its slug. Absent rather
   * than fabricated. [D-21]
   */
  it('shows a callsign only where there is one', () => {
    expect(studio).toContain('channel.station?.callsign &&');
  });
});
