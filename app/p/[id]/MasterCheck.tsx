'use client';

import { useState } from 'react';
import type { Performance, RenderProblem } from '../../../src/domain/performance.js';
import { masterCheck, repairsFor } from '../../../src/domain/performance.js';
import { EXPORT_PROFILES } from '../../../src/domain/presentation.js';
import { formatMasterPosition } from '../../../src/domain/time.js';
import Icon from '../../Icon.js';

/**
 * Everything that must be true before a master is worth rendering.
 * [MASTER-EDIT §13, §12 P0]
 *
 * WHY A LIST AND NOT A SENTENCE. The console already refused a render it
 * could not make, and named what was wrong — but only what was WRONG. An
 * author pressing a button on a four-minute render wants to know what was
 * looked at, not only what failed, because the value of a green list is that
 * it tells you the render is worth starting. A refusal tells you nothing
 * about the nine things that were fine.
 *
 * AND EVERY TICK CARRIES WHAT IT COMPARED. A checklist is a promise, and the
 * one way to break it is to tick something nobody checked. Each line says
 * what it measured — `00:05.000 projected against 00:05.000 of song`,
 * `2 join(s), every mix covered on both sides` — so a green tick is a
 * statement rather than a mood.
 *
 * THE REPAIRS ARE THE POINT. A diagnosis an author has to translate into an
 * action is half a product, and a repair menu that offers five things of
 * which three cannot work is worse than no menu: it teaches them to stop
 * reading it. So each remedy says whether it applies and why, and "Choose a
 * take" lists only the takes that would actually cover the stretch —
 * `coversSpan`, the same question the timeline asks.
 */
export default function MasterCheck({
  performance, profileId, busy, onRepair,
}: {
  performance: Performance;
  profileId: string;
  busy: boolean;
  onRepair: (body: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const { items, ready } = masterCheck(performance, profileId, EXPORT_PROFILES);
  const failed = items.filter((item) => !item.ok);
  /*
   * ONE ISSUE, ONE PLACE TO FIX IT. A hole at the front fails both "Video
   * covers entire duration" and "No timeline gaps" — correctly, they are
   * different questions with the same answer today — and drawing its
   * repair under each is the same offer twice. The checks all still say
   * they failed; the remedy hangs off the first one to report it.
   */
  const shown = new Set<string>();
  const key = (problem: RenderProblem) =>
    `${problem.kind}:${problem.fromSample}:${problem.toSample}`;

  return (
    <section data-testid="master-check" data-ready={ready ? 'true' : 'false'}
             style={{
               border: 'var(--border) solid var(--console-edge)',
               borderRadius: 'var(--radius-module)',
               background: 'var(--console-inset)',
             }}>
      <div className="module-head" style={{ borderBottom: 0 }}>
        <span className="module-label">Master check</span>
        <span className="module-sub grow" style={{ minWidth: 0 }}>
          {ready ? 'ready to create master'
            : `${failed.length} issue${failed.length === 1 ? '' : 's'}`}
        </span>
        <span className={`state ${ready ? 'is-on' : 'is-armed'}`}
              data-testid="check-state">
          {ready ? 'passed' : 'blocked'}
        </span>
      </div>

      <ul style={{ margin: 0, padding: '0 10px 8px', listStyle: 'none' }}>
        {items.map((item) => (
          <li key={item.id} data-testid="check-item" data-check={item.id}
              data-ok={item.ok ? 'true' : 'false'}>
            <div className="row" style={{
              gap: 'var(--space-3)', alignItems: 'baseline', flexWrap: 'nowrap',
              padding: '3px 0',
            }}>
              {/*
                * A MARK AND A WORD, never colour alone. The eight per cent
                * who cannot separate this green from this amber read the
                * glyph. [U-19]
                */}
              <span aria-hidden="true" style={{
                flex: '0 0 auto', width: 14, display: 'grid',
                placeItems: 'center',
                color: item.ok ? 'var(--accent-soft)' : '#f0c66a',
              }}><Icon name={item.ok ? 'passed' : 'warning'} size={12} /></span>
              <span style={{
                flex: '0 0 auto', fontSize: 'var(--text-sm)',
                color: item.ok ? 'var(--text)' : '#f0c66a',
              }}>{item.label}</span>
              <span className="muted grow" style={{
                minWidth: 0, fontSize: 'var(--text-2xs)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{item.says}</span>
            </div>

            {/* ---- what is wrong, where, and how to close it --------- */}
            {item.problems?.filter((problem) => {
              if (shown.has(key(problem))) return false;
              shown.add(key(problem));
              return true;
            }).map((problem, index) => (
              <Issue key={`${item.id}-${index}`} performance={performance}
                     problem={problem} busy={busy}
                     open={open === `${item.id}-${index}`}
                     onToggle={() => setOpen(
                       open === `${item.id}-${index}` ? null : `${item.id}-${index}`)}
                     onRepair={onRepair} />
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Issue({
  performance, problem, busy, open, onToggle, onRepair,
}: {
  performance: Performance;
  problem: RenderProblem;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  onRepair: (body: Record<string, unknown>) => void;
}) {
  const [choice, setChoice] = useState<string>('');
  const where = problem.fromSample !== undefined && problem.toSample !== undefined
    ? `${formatMasterPosition(problem.fromSample)} – ${formatMasterPosition(problem.toSample)}`
    : null;
  const repairs = repairsFor(performance, problem);
  const choosable = repairs.find((repair) => repair.id === 'choose');
  const takes = (choosable?.takeIds ?? []).map((id) =>
    performance.takes.find((take) => take.id === id)).filter(Boolean);

  return (
    <div data-testid="check-issue" data-kind={problem.kind} style={{
      margin: '3px 0 7px 22px', padding: 'var(--space-3) var(--space-4)',
      background: 'var(--state-armed-wash)',
      border: 'var(--border) solid rgba(232,179,60,0.36)',
      boxShadow: 'inset 3px 0 0 var(--state-armed)',
      borderRadius: 'var(--radius-module)',
    }}>
      <div className="row" style={{ gap: 'var(--space-4)', flexWrap: 'nowrap' }}>
        <span className="grow" style={{ minWidth: 0, fontSize: 'var(--text-sm)' }}>
          {where && (
            <span className="readout" style={{ marginRight: 'var(--space-3)' }}>
              {where}
            </span>
          )}
          <span style={{ color: '#f0c66a' }}>
            {problem.kind === 'gap' ? 'No visual source'
              : problem.kind === 'short-takes' ? 'The take does not reach across it'
                : problem.kind === 'empty-scene' ? 'Nobody on screen'
                  : 'Nothing on screen yet'}
          </span>
        </span>
        <button className="ctl sm" data-testid="repair" onClick={onToggle}
                aria-expanded={open} style={{ flex: '0 0 auto' }}>
          Repair
        </button>
      </div>

      {open && (
        <div data-testid="repair-options" style={{
          marginTop: 'var(--space-4)', display: 'flex',
          flexDirection: 'column', gap: 'var(--space-3)',
        }}>
          {repairs.map((repair) => (
            <div key={repair.id} className="row" data-testid="repair-option"
                 data-repair={repair.id} data-available={repair.available ? 'true' : 'false'}
                 style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              {repair.id === 'choose' && repair.available ? (
                <>
                  <select data-testid="repair-take" disabled={busy}
                          value={choice} onChange={(e) => setChoice(e.target.value)}
                          style={{ fontSize: 'var(--text-sm)', width: 'auto' }}>
                    <option value="" disabled>Choose a take&hellip;</option>
                    {takes.map((take) => (
                      <option key={take!.id} value={take!.id}>{take!.label}</option>
                    ))}
                  </select>
                  <button className="ctl sm" data-testid="repair-apply"
                          disabled={busy || !choice}
                          onClick={() => onRepair({
                            action: 'cover-with', takeId: choice,
                            fromSample: problem.fromSample,
                            toSample: problem.toSample,
                          })}>
                    Put it on
                  </button>
                </>
              ) : (
                <button className="ctl sm" disabled={busy || !repair.available}
                        title={repair.says}
                        onClick={() => {
                          if (repair.id === 'use-next' && problem.extend) {
                            onRepair({
                              action: 'cover-gap',
                              sceneId: problem.extend.sceneId,
                              fromSample: problem.extend.fromSample,
                            });
                          }
                        }}>
                  {repair.label}
                </button>
              )}
              <span className="muted" style={{
                fontSize: 'var(--text-2xs)', alignSelf: 'center',
              }}>{repair.says}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
