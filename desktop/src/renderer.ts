/**
 * The window.  [TAKE-DESKTOP T-1]
 *
 * NO FRAMEWORK, and that is a T-1 decision rather than a
 * permanent one. The shell draws six words and a sentence; a
 * React runtime to do that would be a dependency chosen before
 * anything needs it. T-3 draws a live multiview of N cameras and
 * is the stage that will have an opinion — it reads
 * `guestGrid.ts` and `SwitchingStage.tsx` first, per the
 * document, and whatever it concludes it will conclude with a
 * reason.
 *
 * NO WEB-TIER CODE, which is what T-1 is judged on. This file
 * imports from `shared/` and from itself. The installation's
 * `app/` and `src/` are not reachable from here and a test says
 * so. [T-1]
 */

import {
  STEPS, BUILT_TO, type Step, houseSays, reached, standing,
} from './shell.js';
import { connectScreen } from './connectScreen.js';
import { camerasScreen } from './camerasScreen.js';

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function draw(): void {
  const root = document.getElementById('app');
  if (!root) return;

  /*
   * THE FLOW IS THE NAVIGATION NOW. T-1 drew it because there was
   * nothing else to draw and T-2 had one screen under it; with
   * two screens built, the step a person is looking at is the
   * step they pressed. A second navigation beside a strip that
   * already names every step would be two answers to where you
   * are. [D-19]
   *
   * A STEP THAT IS NOT BUILT CANNOT BE PRESSED, and `BUILT_TO`
   * still decides that, still in one place.
   */
  const screen = el('div', 'screen');
  let leave: (() => void) | null = null;

  /*
   * CAMERAS AND PREPARE ARE ONE SCREEN AND TWO STEPS, which is
   * the decision `camerasScreen` states: the answer to *can this
   * machine record them* changes every time somebody changes
   * *which cameras*, so a PREPARE on its own page would be a page
   * the operator walks to, reads a refusal on, and walks back
   * from.
   *
   * PRESSING PREPARE WENT TO CONNECT. The strip marks every step
   * below `BUILT_TO` as pressable, PREPARE is one of them, and
   * this fell through to the else. Found by looking at the
   * screenshot, where PREPARE was lit and led somewhere else.
   */
  const screenFor = (step: Step) =>
    (step === 'CAMERAS' || step === 'PREPARE' ? camerasScreen : connectScreen);

  const show = (step: Step): void => {
    leave?.();
    leave = screenFor(step)(screen) ?? null;
    const here = screenFor(step);
    for (const item of flow.querySelectorAll('[data-step]')) {
      const named = (item as HTMLElement).dataset['step'] as Step;
      /* Both names light when one screen answers for both. */
      (item as HTMLElement).dataset['here'] =
        screenFor(named) === here && reached(named) ? 'true' : 'false';
    }
  };

  const flow = el('ol', 'flow');
  for (const step of STEPS) {
    const item = el('li', reached(step) ? 'step on' : 'step');
    item.dataset['step'] = step;
    item.dataset['on'] = reached(step) ? 'true' : 'false';
    if (step === BUILT_TO) item.dataset['next'] = 'true';
    if (reached(step)) {
      const press = document.createElement('button');
      press.type = 'button';
      press.className = 'step-go';
      press.dataset['testid'] = 'step-go';
      press.dataset['step'] = step;
      press.textContent = step;
      press.addEventListener('click', () => show(step));
      item.appendChild(press);
    } else {
      item.textContent = step;
    }
    flow.appendChild(item);
  }

  root.append(screen, flow);
  show('CONNECT');

  const says = el('p', 'standing', standing());
  says.id = 'standing';
  root.appendChild(says);

  /* The two numbers both programs have to agree about, read out
     of the shared library rather than typed here. [T-1] */
  const house = el('p', 'house', houseSays());
  house.id = 'house';
  root.appendChild(house);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', draw);
} else {
  draw();
}
