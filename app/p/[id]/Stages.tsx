'use client';

import type { Performance } from '../../../src/domain/performance.js';
import {
  type RenderState, type StageId, stageNow, stagesOf,
} from '../../../src/domain/performance.js';

/**
 * Where the work has got to.  [Doctrine STUDIO-TWO §2, §14, U-04, D-14]
 *
 * PERFORM → COMPOSE → MASTER → DELIVER is not a new idea about Studio Two;
 * it is what Studio Two already does, said out loud. Takes are recorded,
 * scenes are directed over them, one file is made, and then versions of that
 * file go out. The studio had all four and named none of them, so the page
 * below the editor read as a list of unrelated controls — sound, then
 * shapes, then a clip, then a preview picture, then a publish button — with
 * nothing saying which of them belonged to the same act.
 *
 * IT IS A READOUT AND NOT A WIZARD, which is the whole difference. Nothing
 * here gates anything: a take can be re-recorded after the master is made,
 * a scene moved after it is published, and the render pressed again. Every
 * stage is reachable at every moment, exactly as before. What this says is
 * where the work IS, the way a desk's meters say what the signal is doing —
 * and it is derived from the document on every render, so it cannot say
 * something the document does not.
 *
 * A PRODUCT THAT MAKES YOU CLICK NEXT is the thing this must not become.
 * U-04: the interrupt is the product. A person who has just recorded a
 * fourth take and wants to see it against the second is not at a step.
 */

/** Where on the page each stage happens. Presentation, so: here. */
const TARGETS: Record<StageId, string> = {
  perform: '[data-testid="take-rail"]',
  compose: '[data-testid="performance-timeline"]',
  master: '[data-testid="master-render"]',
  deliver: '[data-testid="deliver"]',
};

export default function Stages({
  performance, renders,
}: {
  performance: Performance;
  renders: RenderState[];
}) {
  const stages = stagesOf(performance, renders);
  const at = stageNow(stages);

  return (
    <nav className="ctl-bank is-across" data-testid="stages"
         aria-label="Where the work has got to"
         style={{ marginTop: 18 }}>
      {stages.map((stage, index) => (
        <button
          key={stage.id}
          type="button"
          className="ctl"
          data-testid="stage"
          data-stage={stage.id}
          data-here={index === at ? 'true' : 'false'}
          data-done={stage.done ? 'true' : 'false'}
          aria-current={index === at ? 'step' : undefined}
          title={stage.hint}
          onClick={() => document.querySelector(TARGETS[stage.id] ?? 'body')
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          /*
           * `minWidth: 0` OR THE STRIP RUNS OFF THE PAGE. A flex child's
           * default minimum is its content, so four cells at `1 1 0` with a
           * sentence in each are four cells as wide as their sentences,
           * and the fourth hangs past the edge of everything below it.
           */
          style={{
            textAlign: 'left', padding: '7px 10px',
            flex: '1 1 0', minWidth: 0,
          }}
        >
          <span className="row" style={{ gap: 'var(--space-3)', flexWrap: 'nowrap' }}>
            {/*
              * THE NUMBER IS THE ORDER, NOT A SCORE. A tick on a done stage
              * and a number on the rest would make the numbers mean
              * "outstanding", which they do not — stage two stays stage two
              * after it is finished. So the number is always the number, and
              * doneness is said by the lamp beside it. [U-19: never colour
              * alone]
              */}
            <span aria-hidden="true" className="readout" style={{
              fontSize: 'var(--text-2xs)', opacity: 0.7, flex: '0 0 auto',
            }}>{index + 1}</span>
            <span className="grow" style={{
              minWidth: 0, fontWeight: 'var(--weight-semi)',
              fontSize: 'var(--text-sm)', letterSpacing: 0, textTransform: 'none',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{stage.label}</span>
            <span className={`state ${stage.done ? 'is-on' : 'is-off'}`}
                  style={{ padding: '1px 5px', flex: '0 0 auto' }}>
              {stage.done ? 'done' : index === at ? 'current' : 'pending'}
            </span>
          </span>
          <span className="muted" style={{
            display: 'block', marginTop: 2, fontSize: 'var(--text-2xs)',
            letterSpacing: 0, textTransform: 'none',
            lineHeight: 'var(--leading-snug)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{stage.hint}</span>
        </button>
      ))}
    </nav>
  );
}
