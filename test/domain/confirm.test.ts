/**
 * The last thing between a person and something irreversible.
 * [Doctrine D-04, CHANNEL §9, U-19]
 *
 * WHAT IS WORTH TESTING ABOUT A DIALOG, and it is not that it renders. A
 * confirmation has three properties that make it safe, and all three are
 * the kind that get quietly lost in a refactor by somebody tidying up:
 *
 *   THE VERB IS ON THE BUTTON, never "OK" — a button saying OK cannot be
 *     distinguished from the one beside it by somebody moving fast.
 *   THE SENTENCE SAYS WHAT IS LOST, so the decision can be made from the
 *     dialog rather than from memory of what was clicked.
 *   A DESTRUCTIVE ONE IS MARKED destructive, which is what moves focus
 *     off it and colours its button.
 *
 * These are asserted against the REAL call sites by reading the source,
 * rather than against a fixture, because a rule that only holds in a test
 * file is a rule about the test file. The component's behaviour — focus,
 * Escape, the backdrop — is verified in a browser, where those things
 * actually exist; this is about the asks themselves.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const STUDIO = readFileSync(
  join(ROOT, 'app', 't', '[id]', 'ChannelStudio.tsx'), 'utf8');
const CONFIRM = readFileSync(join(ROOT, 'app', 'Confirm.tsx'), 'utf8');

/** Every `verb:` handed to a confirmation, wherever it is raised. */
function verbs(source: string): string[] {
  return [...source.matchAll(/\bverb:\s*'([^']+)'/g)].map(([, v]) => v!);
}

describe('the control room asks before the irreversible', () => {
  /*
   * THE REGRESSION THIS EXISTS FOR is somebody replacing a considered
   * question with the native call it took eleven commits to remove. It is
   * one line to write and nothing else would notice.
   */
  it('raises no native dialog', () => {
    const code = STUDIO
      /* The file explains what it replaced; a comment is not a call. */
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/window\.(confirm|prompt|alert)\s*\(/);
  });

  it('asks at least once, so the check above cannot pass by having nothing', () => {
    expect(verbs(STUDIO).length).toBeGreaterThanOrEqual(6);
  });

  /*
   * "OK" IS NOT A VERB AND NEITHER IS "YES". A button has to say what it
   * does, because it is the last thing read before the thing happens —
   * and often the ONLY thing read, by somebody who already knows what
   * they meant to do and is confirming it by reflex.
   */
  it('never puts a meaningless word on the button', () => {
    for (const verb of verbs(STUDIO)) {
      expect(verb, `"${verb}" is not a verb`)
        .not.toMatch(/^(ok|okay|yes|confirm|continue|done|submit)$/i);
    }
  });

  it('starts each one with an actual action', () => {
    for (const verb of verbs(STUDIO)) {
      /* "End the broadcast", "Cut away now", "Add the day-part". */
      expect(verb, `"${verb}" should begin with a verb`)
        .toMatch(/^[A-Z][a-z]+/);
    }
  });

  /*
   * THE QUESTION HAS TO CARRY THE CONSEQUENCE. A question that is only a
   * restatement of the button — "End the broadcast?" — tells somebody
   * nothing they did not know when they pressed it, and the moment is
   * wasted. Every one of these says what happens to what they made.
   */
  it('says what happens, not just what is being asked', () => {
    const questions = [...STUDIO.matchAll(/question:\s*([\s\S]*?),\n\s*(?:field|verb):/g)]
      .map(([, q]) => q!.replace(/[\n\s]+/g, ' '));
    expect(questions.length).toBeGreaterThanOrEqual(6);
    for (const question of questions) {
      /* Long enough to contain a reason, not merely a re-ask. */
      expect(question.replace(/[^a-z ]/gi, '').trim().length,
        `too terse to explain anything: ${question}`).toBeGreaterThan(40);
    }
  });

  /*
   * THE FOUR THAT DESTROY SOMETHING MUST SAY SO, because `danger` is what
   * keeps focus off the button and colours it. A destructive ask that
   * forgot the flag looks exactly like a safe one.
   */
  it('marks the destructive ones destructive', () => {
    for (const verb of ['End the broadcast', 'Cut away now', 'Remove the block',
      'Unschedule', 'Stop the link']) {
      const at = STUDIO.indexOf(`verb: '${verb}'`);
      expect(at, `no ask with verb "${verb}"`).toBeGreaterThan(-1);
      /* `danger` sits within the same object literal, just after the verb. */
      expect(STUDIO.slice(at, at + 120), `"${verb}" is not marked danger`)
        .toMatch(/danger:\s*true/);
    }
  });
});

describe('the dialog itself', () => {
  /*
   * FOCUS MUST NOT LAND ON THE DESTRUCTIVE BUTTON. This is the single
   * property that stops a reflexive Return ending a live broadcast, and
   * it is one line in a component nobody will read again.
   */
  it('moves focus to cancel rather than leaving it where showModal put it', () => {
    expect(CONFIRM).toMatch(/cancelRef\.current\?\.focus\(\)/);
  });

  it('is a real <dialog>, so the focus trap is the browser’s', () => {
    expect(CONFIRM).toMatch(/<dialog/);
    expect(CONFIRM).toMatch(/showModal\(\)/);
  });

  /* Escape and a backdrop click both mean no. */
  it('treats escape and the backdrop as cancel', () => {
    expect(CONFIRM).toMatch(/onCancel=/);
    expect(CONFIRM).toMatch(/event\.target === ref\.current/);
  });

  /*
   * A DISABLED CONFIRM ON AN EMPTY REQUIRED FIELD. Without it the dialog
   * closes, the action runs with an empty string, and something gets
   * created called "".
   */
  it('will not confirm an empty answer unless the answer is optional', () => {
    expect(CONFIRM).toMatch(/optional === true \|\| value\.trim\(\) !== ''/);
    expect(CONFIRM).toMatch(/disabled=\{!ready\}/);
  });
});
