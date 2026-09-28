/**
 * The system, kept.  [Doctrine D-04, D-19]
 *
 * A design system that is not enforced is a design system that was
 * applied once. Nothing in a compiler objects to `fontSize: 12.5` or
 * `background: '#1e2125'`, both of which are in this codebase's history,
 * and both of which are how a product drifts back into a sediment of
 * one-off values — slowly, in small correct-looking increments, by people
 * who never saw the file that says what the values should be.
 *
 * SO THIS IS A RATCHET RATHER THAN A RULE. There are still 322 raw hex
 * colours in the components: the token system landed in this pass and the
 * surfaces are being converted as each is worked on, so a test demanding
 * zero would fail today and be deleted tomorrow, which is worse than no
 * test. What it demands instead is that the number does not GROW.
 *
 * (322 and not the 297 I first wrote here. The shell command I counted
 * with matched six-digit hex and three-digit hex and nothing between, so
 * it missed every `#rrggbbaa`. The test's own regex is the number that
 * matters, and writing the budget from a different tool's count is how a
 * ratchet starts life already loose.)
 *
 * A ratchet is an uncomfortable kind of test and it is the honest one
 * here. It says: this is where we are, this is the direction, and you may
 * not go backwards without noticing. When a surface is converted the
 * budget is lowered, and lowering it is the only edit to this file that
 * should ever be made.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');

function components(dir = join(ROOT, 'app')): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...components(full));
    else if (/\.tsx$/.test(entry.name)) found.push(full);
  }
  return found;
}

/** Code only: a hex in a comment is documentation, not a value. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

describe('raw colour in components', () => {
  /*
   * THE BUDGET. Lower it when a surface is converted; never raise it.
   * If this fails on a new feature, the fix is a token, not a bigger
   * number — and the tokens are in `app/styles/`.
   */
  const BUDGET = 322;

  it(`is at or below ${BUDGET} occurrences, and falling`, () => {
    const counts = components()
      .map((file) => ({
        file: file.slice(file.indexOf('app/')),
        n: (code(file).match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length,
      }))
      .filter((row) => row.n > 0)
      .sort((a, b) => b.n - a.n);
    const total = counts.reduce((sum, row) => sum + row.n, 0);
    expect(total, `worst offenders: ${counts.slice(0, 3)
      .map((row) => `${row.file} (${row.n})`).join(', ')}`)
      .toBeLessThanOrEqual(BUDGET);
  });

  /*
   * THE FILES THAT ARE DONE STAY DONE, which is the half of a ratchet
   * that actually changes behaviour. A global budget lets a converted
   * surface regress while another improves and the total holds; naming
   * the finished ones stops that.
   */
  it.each([
    'app/Confirm.tsx',
    'app/Notice.tsx',
  ])('%s uses tokens only', (name) => {
    const found = code(join(ROOT, name)).match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(found, `raw colour in ${name}: ${found.join(', ')}`).toEqual([]);
  });
});

describe('the scales are the only sizes', () => {
  /*
   * FRACTIONAL PIXELS ARE THE TELL. `fontSize: 12.5` was in this
   * codebase, and a half-pixel type size renders differently on every
   * platform — the difference landing precisely on the small sizes this
   * interface is mostly made of. Nobody chooses 12.5 from a scale; they
   * choose it because 12 looked small and 13 looked big.
   */
  it('has no fractional font sizes anywhere', () => {
    const offenders: string[] = [];
    for (const file of components()) {
      const hits = code(file).match(/fontSize:\s*'?\d+\.\d+/g);
      if (hits) offenders.push(`${file.slice(file.indexOf('app/'))}: ${hits.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  /*
   * A type size above the scale's top is a heading that escaped the
   * system. The scale runs to 27px; anything larger is somebody sizing
   * by eye against one particular screen.
   */
  it('has no font size larger than the scale goes', () => {
    const offenders: string[] = [];
    for (const file of components()) {
      for (const [, size] of code(file).matchAll(/fontSize:\s*(\d{2,})[,\s}]/g)) {
        if (Number(size) > 27) {
          offenders.push(`${file.slice(file.indexOf('app/'))}: ${size}px`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the stylesheet itself', () => {
  const styles = join(ROOT, 'app', 'styles');
  const all = readdirSync(styles).filter((f) => f.endsWith('.css'));

  it('is loaded in full by the one entry point', () => {
    const globals = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');
    for (const file of all) {
      expect(globals, `${file} is never imported`).toContain(`./styles/${file}`);
    }
  });

  /*
   * THE REDUCED-MOTION RULE MUST EXIST SOMEWHERE. It was moved out of
   * globals.css during this pass, and a rule that is deleted rather than
   * moved would take a D-04 obligation with it, silently. [D-04]
   */
  it('still honours a request for less motion', () => {
    const css = all.map((f) => readFileSync(join(styles, f), 'utf8')).join('\n');
    expect(css).toContain('prefers-reduced-motion');
  });
});
