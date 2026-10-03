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

import { STEPS, BUILT_TO, houseSays, reached, standing } from './shell.js';

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function draw(): void {
  const root = document.getElementById('app');
  if (!root) return;

  root.appendChild(el('h1', 'mark', 'Take'));
  root.appendChild(el('p', 'sub',
    'Multi-camera capture, recorded on this machine.'));

  const flow = el('ol', 'flow');
  for (const step of STEPS) {
    const item = el('li', reached(step) ? 'step on' : 'step', step);
    item.dataset['step'] = step;
    item.dataset['on'] = reached(step) ? 'true' : 'false';
    if (step === BUILT_TO) item.dataset['next'] = 'true';
    flow.appendChild(item);
  }
  root.appendChild(flow);

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
