/**
 * The workstation, held to the brief it was built from.
 *   [Doctrine §36, §40, D-19, D-21, D-24, U-27]
 *
 * `Studio1.html` is a standalone document: 163 CSS rules and a
 * script that mimics a studio. What shipped is the real studio
 * wearing that document's frame — so two things can go wrong
 * quietly, and both have before.
 *
 *   THE TRANSCRIPTION DRIFTS. A value gets "tidied", and the
 *   difference between the brief and the product is a number
 *   nobody can find without the original file open beside them.
 *   So the declarations are compared against the brief, by a
 *   parser, on every run.
 *
 *   THE SCOPE LEAKS. This sheet declares `--line`, `--text`,
 *   `--muted` and `--surface`, every one of which the console's
 *   ramp also declares, and `.panel` is eight rules deep in
 *   `surfaces.css`. One unprefixed selector restyles the whole
 *   product for as long as a conversation is open.
 *
 * AND ONE THING THAT ALREADY WENT WRONG. The first reset said
 * `.s1 button`, which is (0,1,1) and beats `.ctl` at (0,1,0) —
 * so the console's own lit controls, inside thirty components
 * rendered in this frame, came out as bare text. Nothing in a
 * screenshot of the shell showed it; `console.test.ts` found it
 * from the other end. The reset names the brief's controls now,
 * and the test below is what keeps it from widening again.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import postcss from 'postcss';

const ROOT = join(import.meta.dirname, '..', '..');
const SHEET = join(ROOT, 'app', 'c', '[id]', 'studio-one.css');
const BRIEF = join(ROOT, 'Studio1.html');

/** Code only: a value in a comment is documentation. */
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
  /*
   * THE BRIEF IS IN THE REPOSITORY, and while it is, this test
   * reads it. If it is ever removed the comparison cannot be
   * made, and a test that silently stops comparing is worse
   * than one that says so.
   */
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
   * EVERY RULE THE BRIEF WROTE IS STILL HERE, WITH ITS VALUES.
   * Matched on the declarations rather than the selector,
   * because the selector is the one thing scoping was allowed
   * to change.
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
    expect(brief.length).toBeGreaterThanOrEqual(160);
  });
});

describe('the scope', () => {
  it('puts every selector inside the studio', () => {
    const loose = sheet.flatMap((r) => r.sel.split(','))
      .filter((s) => !s.trim().startsWith('.s1'));
    expect(loose, `a rule that reaches the rest of the product: ${loose.join(', ')}`)
      .toEqual([]);
  });

  /*
   * AND IT IS NOT IN `app/styles/`, whose contract — enforced by
   * `design-system.test.ts` — is that `globals.css` loads every
   * file in it on every page. A sheet redeclaring `--text` must
   * not be one of them.
   */
  it('stays out of the stylesheet that loads everywhere', () => {
    expect(readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8'))
      .not.toContain('studio-one.css');
    expect(code(join(ROOT, 'app', 'c', '[id]', 'Studio.tsx')))
      .toContain("import './studio-one.css'");
  });
});

describe('the reset', () => {
  /*
   * IT NAMES CONTROLS, NOT ELEMENTS. `.s1 button` beat `.ctl`
   * and flattened the console's lit controls inside every
   * component rendered in this frame. The rule that replaced it
   * may only ever list classes the brief itself draws.
   */
  it('never resets a bare element the components rely on', () => {
    const banned = [/^\.s1 button$/, /^\.s1 a$/, /^\.s1 h[123]$/,
      /^\.s1 input$/, /^\.s1 select$/];
    const offenders: string[] = [];
    for (const rule of sheet) {
      for (const sel of rule.sel.split(',')) {
        const s = sel.trim();
        if (!banned.some((b) => b.test(s))) continue;
        /* `font: inherit` and `color: inherit` are the brief's
           own three-line reset and reset nothing the console
           set deliberately. */
        const harmless = /^(font:inherit|color:inherit)(;(font:inherit|color:inherit))*$/;
        if (harmless.test(rule.decls)) continue;
        offenders.push(`${s} {${rule.decls.slice(0, 60)}}`);
      }
    }
    expect(offenders, 'this flattens the console controls inside the studio: '
      + offenders.join(' | ')).toEqual([]);
  });
});

describe('all of Studio One is in the frame', () => {
  const studio = code(join(ROOT, 'app', 'c', '[id]', 'Studio.tsx'));

  /*
   * THE POINT OF THE EXERCISE, STATED AS A LIST. The brief draws
   * a source rail, a viewer, a control rail and a timeline.
   * This studio had thirty surfaces before it, and the brief is
   * a frame for them rather than a replacement — so every one
   * of them is still rendered, and a re-skin that quietly
   * dropped the claims panel or the evidence reader would be a
   * re-skin that removed features.
   *
   * > *"none of our features should be abandoned"*
   */
  it.each([
    'Stage', 'CompositionStage', 'ExplainSurface', 'CompositionRail',
    'SourceTransport', 'Timeline', 'ClipRail', 'PeopleRail', 'SidePanel',
    'SearchPanel', 'ClaimsPanel', 'ClaimCard', 'AudioPanel', 'Reader',
    'StudioMode', 'PublishStage', 'StageStatus', 'Brand', 'SignOut',
  ])('still renders %s', (name) => {
    expect(studio).toMatch(new RegExp(`<${name}[\\s/>]`));
  });

  /* The three modes, and the key that is the product. [U-04] */
  it('keeps the three modes and the one key', () => {
    for (const id of ['mode-live', 'mode-studio', 'mode-publish']) {
      expect(studio).toContain(id);
    }
    expect(studio).toContain('SPACE');
  });

  /*
   * AND THE BRIEF'S UNDO AND REDO ARE ABSENT ON PURPOSE. There
   * is no undo stack in this studio — a take is a file the
   * moment it stops — and two arrows that do nothing on a
   * recording desk are worse than two that are not there. The
   * day one is built, this line is what has to be deleted
   * deliberately. [D-21]
   */
  it('draws no control the studio cannot answer', () => {
    expect(studio).not.toMatch(/aria-label="(Undo|Redo)"/);
  });
});
