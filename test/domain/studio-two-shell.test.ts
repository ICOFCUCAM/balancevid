/**
 * The production room, held to the brief it was built from.
 *   [STUDIO-TWO §1, §3, §4, §12, §13; Doctrine D-19, D-21, D-24]
 *
 *     TAKES → TIMELINE → MASTER
 *
 * > *"the underlying architecture is good, but visually it still
 * > feels like a developer-built editing utility"*
 * > *"none of our features should be abandoned. the engine and
 * > features must be maintained or improved."*
 *
 * Two halves, and this file is the second one. The first is that
 * the room looks like the brief; the second is that everything
 * this studio could do before, it still does — which is the half
 * a screenshot cannot show, because a dropped panel leaves no
 * mark on a page that never had it.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import postcss from 'postcss';

const ROOT = join(import.meta.dirname, '..', '..');
const SHEET = join(ROOT, 'app', 'p', '[id]', 'studio-two.css');
const BRIEF = join(ROOT, 'preview(7).html');

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
   * EVERY RULE THE BRIEF WROTE IS STILL HERE WITH ITS VALUES,
   * matched on declarations because the selector is the one
   * thing scoping was allowed to change.
   *
   * ONE RULE IS KNOWINGLY OVERRIDDEN and it is named here
   * rather than excused: `.workspace`. The brief's room is two
   * rows, because it draws three takes and nothing else. This
   * one has the same three columns and timeline and then two
   * more rows the brief has no equivalent for — the clip
   * inspector and the scene notes — and the transport moves
   * into the centre column, which is the brief's own
   * arrangement. The declarations are still present; a later
   * rule wins.
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
    expect(brief.length).toBeGreaterThanOrEqual(120);
  });
});

describe('the scope', () => {
  it('puts every selector inside the studio', () => {
    const loose = sheet.flatMap((r) => r.sel.split(','))
      .filter((s) => !s.trim().startsWith('.s2'));
    expect(loose, `a rule that reaches the rest of the product: ${loose.join(', ')}`)
      .toEqual([]);
  });

  it('stays out of the stylesheet that loads everywhere', () => {
    expect(readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8'))
      .not.toContain('studio-two.css');
    expect(code(join(ROOT, 'app', 'p', '[id]', 'PerformanceStudio.tsx')))
      .toContain("import './studio-two.css'");
  });

  /*
   * THE RESET NAMES CONTROLS, NOT ELEMENTS. Studio One's first
   * attempt said `.s1 button`, which is (0,1,1) against
   * `.ctl`'s (0,1,0), and flattened the console's own lit
   * controls inside every component rendered in the frame.
   * Nothing in a screenshot showed it. This room renders more
   * of those components than Studio One does.
   */
  it('never resets a bare element the components rely on', () => {
    const banned = [/^\.s2 button$/, /^\.s2 a$/, /^\.s2 h[123]$/,
      /^\.s2 input$/, /^\.s2 select$/];
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
    expect(offenders, 'this flattens the console controls inside the studio: '
      + offenders.join(' | ')).toEqual([]);
  });
});

describe('all of Studio Two is in the room', () => {
  const studio = code(join(ROOT, 'app', 'p', '[id]', 'PerformanceStudio.tsx'));
  const stage = code(join(ROOT, 'app', 'p', '[id]', 'SwitchingStage.tsx'));
  const both = `${studio}\n${stage}`;

  /*
   * > *"none of our features should be abandoned"*
   *
   * The brief draws a takes rail, a stage, five control groups
   * and a timeline. This studio had sixteen surfaces before it
   * — the master check, the render queue, the clip inspector,
   * the reframe box, the sound modes, the room plate, delivery,
   * publish — and the brief is a frame for them, not a
   * replacement. A re-skin that quietly dropped the master
   * check would be a re-skin that removed a feature.
   */
  /*
   * READ ACROSS THE WHOLE STUDIO, not one file. The first
   * version of this asserted that `SwitchingStage` rendered
   * `MasterCheck`, and it does not — `Delivery` does, which
   * `PerformanceStudio` renders. The test was wrong about where
   * and right about what: a surface is not abandoned because it
   * moved, and it IS abandoned if nothing renders it anywhere.
   * So the claim is the one that matters.
   */
  const everywhere = readdirSync(join(ROOT, 'app', 'p', '[id]'))
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => code(join(ROOT, 'app', 'p', '[id]', f)))
    .join('\n');

  it.each([
    'StudioBar', 'SwitchingStage', 'PerformersPanel', 'UploadTake',
    'Delivery', 'RoomPlate',
  ])('the shell still renders %s', (name) => {
    expect(studio).toMatch(new RegExp(`<${name}[\\s/>]`));
  });

  it.each([
    'ClipInspector', 'MasterCheck', 'MasterRender', 'PublishPanel',
    'SoundModes', 'ReframeBox', 'Stages',
  ])('the studio still renders %s somewhere', (name) => {
    expect(everywhere).toMatch(new RegExp(`<${name}[\\s/>]`));
  });

  /*
   * AND THE ROOM'S FIVE REGIONS ARE ALL PLACED. Named grid
   * areas are how the transport moved under the stage without
   * moving 1,800 lines of JSX; if an area is ever renamed in
   * one place and not the other, the region silently lands in
   * an implicit track outside the frame.
   */
  it('places every region the grid names', () => {
    const named = ['takes', 'stage', 'panel', 'timeline', 'transport',
      'inspector', 'notes'];
    const css = readFileSync(SHEET, 'utf8');
    const areas = css.slice(css.indexOf('grid-template-areas'));
    for (const area of named) {
      expect(areas.slice(0, 500), `the grid has no "${area}" area`)
        .toContain(area);
      /*
       * AND THE OCCUPANT MAY LIVE IN ITS OWN FILE.
       * `ClipInspector` claims `gridArea: 'inspector'` from
       * inside itself, which is why the first version of this
       * reported the area as empty while it was on screen.
       */
      expect(everywhere, `nothing is placed in "${area}"`)
        .toContain(`gridArea: '${area}'`);
    }
  });

  /* The room is one bar and one workspace, and it says so. */
  it('is framed as the brief draws it', () => {
    expect(studio).toContain('className="s2"');
    expect(studio).toContain('className="app"');
    expect(studio).toContain('className="topbar"');
    expect(stage).toContain('className="workspace"');
  });

  /*
   * AND THE PROJECT IS NAMED ONCE. `StudioBar` printed the
   * title, the artist and the length in its trailing slot and
   * the brief's project block prints the same three things a
   * few pixels away — two readouts of one fact are two places
   * it can disagree. [D-19]
   */
  it('names the project once', () => {
    expect(both.match(/data-testid="master-summary"/g)?.length ?? 0).toBe(1);
    expect(studio).not.toContain('trailing={(');
  });
});
