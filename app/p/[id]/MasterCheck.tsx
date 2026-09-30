'use client';

import { useState } from 'react';
import type { Performance, RenderProblem } from '../../../src/domain/performance.js';
import { masterCheck } from '../../../src/domain/performance.js';
import { repairsFor } from '../../../src/domain/takeRanking.js';
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
  /** Answers with the refusal, or null, so a control can say it where
     it happened rather than at the top of a panel nobody is looking at. */
  onRepair: (body: Record<string, unknown>) => Promise<string | null>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const { items, ready } = masterCheck(performance, profileId, EXPORT_PROFILES);
  /*
   * ADVISORY LINES ARE NOT ISSUES. `ready` does not count them, so the
   * header must not either — "1 issue" above a Create button that works
   * is the header and the button disagreeing in front of the author.
   */
  const failed = items.filter((item) => !item.ok && !item.advisory);
  const advised = items.filter((item) => !item.ok && item.advisory);
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
          {ready
            ? (advised.length > 0
              ? `ready to create master — ${advised.length} worth doing first`
              : 'ready to create master')
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
              data-ok={item.ok ? 'true' : 'false'}
              data-advisory={item.advisory ? 'true' : 'false'}>
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
                color: item.ok ? 'var(--accent-soft)'
                  : item.advisory ? 'var(--text-faint)' : '#f0c66a',
              }}><Icon name={item.ok ? 'passed' : 'warning'} size={12} /></span>
              <span style={{
                flex: '0 0 auto', fontSize: 'var(--text-sm)',
                color: item.ok ? 'var(--text)'
                  : item.advisory ? 'var(--text-faint)' : '#f0c66a',
              }}>{item.label}</span>
              {/*
                * A WORD, NOT A SHADE. An advisory line is drawn quieter
                * than a blocking one AND says which it is, because eight
                * per cent of people cannot separate those two greys and
                * all of them can read. [U-19]
                */}
              {!item.ok && item.advisory && (
                <span className="module-sub" data-testid="check-advisory"
                      style={{ flex: '0 0 auto' }}>worth doing</span>
              )}
              <span className="muted grow" style={{
                minWidth: 0, fontSize: 'var(--text-2xs)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{item.says}</span>
            </div>

            {/*
              * THE WORDS, OFFERED BESIDE THE LINE THAT ASKS FOR THEM.
              * [INV-07, MASTER-EDIT §12 P3]
              *
              * The same shape as a gap's repair below: the list says what
              * is wrong and the remedy hangs off it, rather than sending
              * an author to look for a Lyrics panel somewhere else. It is
              * the only remedy here that is a paste rather than a button,
              * because the words are the author's and nothing in this
              * product can invent them.
              */}
            {item.id === 'captions' && !item.ok && (
              <Lyrics performance={performance} busy={busy}
                      open={open === 'captions'}
                      onToggle={() => setOpen(open === 'captions' ? null : 'captions')}
                      onRepair={onRepair} />
            )}

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

/**
 * Paste the words.  [INV-07, MASTER-EDIT §12 P3]
 *
 * LRC AND NOTHING ELSE, said in the placeholder rather than discovered by
 * being refused. The product will not place a line by guesswork — a
 * four-minute song with twenty lines is not twelve seconds a line — so an
 * author pasting plain lyrics needs to know before they paste, not after.
 */
function Lyrics({
  performance, busy, open, onToggle, onRepair,
}: {
  performance: Performance;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  /** Answers with the refusal, or null, so a control can say it where
     it happened rather than at the top of a panel nobody is looking at. */
  onRepair: (body: Record<string, unknown>) => Promise<string | null>;
}) {
  const [text, setText] = useState('');
  /*
   * SAID HERE, NOT AT THE TOP OF THE PANEL. The reason untimed lyrics are
   * refused is the interesting half of this control, and it has to land
   * beside the box the author just pasted into.
   */
  const [said, setSaid] = useState<string | null>(null);
  const lines = performance.master.lyrics?.length ?? 0;

  return (
    <div data-testid="check-lyrics" style={{
      margin: '3px 0 7px 22px', padding: 'var(--space-3) var(--space-4)',
      background: 'var(--console-inset)',
      border: 'var(--border) solid var(--console-edge)',
      borderRadius: 'var(--radius-module)',
    }}>
      <div className="row" style={{ gap: 'var(--space-4)', flexWrap: 'nowrap' }}>
        <span className="grow small muted" style={{ minWidth: 0 }}>
          {lines === 0
            ? 'A song has its words before it has a video.'
            : `${lines} line(s) so far, and they stop before the singing does.`}
        </span>
        <button className="ctl sm" data-testid="lyrics-toggle" onClick={onToggle}>
          {open ? 'Close' : 'Paste lyrics'}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <textarea data-testid="lyrics-text" rows={6} disabled={busy}
                    value={text} onChange={(event) => setText(event.target.value)}
                    placeholder={'[00:12.00]I walked the long way round\n'
                      + '[00:16.50]And found you waiting there'}
                    style={{
                      width: '100%', fontSize: 'var(--text-sm)',
                      fontFamily: 'var(--font-mono)',
                    }} />
          <p className="small muted" style={{ margin: '4px 0 6px' }}>
            LRC &mdash; a timestamp before each line, which is what lyrics
            sites and karaoke tools export. Nothing here will place a line
            by guesswork: a caption that drifts from the voice is the first
            thing a viewer notices.
          </p>
          {said && (
            <p className="small" data-testid="lyrics-said"
               style={{ color: 'var(--bad)', margin: '0 0 6px' }}>{said}</p>
          )}
          <div className="row" style={{ gap: 'var(--space-3)' }}>
            <button className="ctl sm" data-testid="lyrics-save" disabled={busy || !text.trim()}
                    onClick={() => {
                      void onRepair({ action: 'set-lyrics', lrc: text })
                        .then((refusal) => setSaid(refusal));
                    }}>
              Use these
            </button>
            {lines > 0 && (
              <button className="ctl sm" data-testid="lyrics-clear" disabled={busy}
                      onClick={() => onRepair({ action: 'set-lyrics', lrc: null })}>
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
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
  /** Answers with the refusal, or null, so a control can say it where
     it happened rather than at the top of a panel nobody is looking at. */
  onRepair: (body: Record<string, unknown>) => Promise<string | null>;
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
                          /*
                            * THE HOLE AT THE TOP OF THE SONG, closed by
                            * moving the take that starts late rather
                            * than by stretching somebody else's scene
                            * over it. The domain worked out which take
                            * and how far; this only presses it.
                            * [TIMELINE B11]
                            */
                          if (repair.id === 'align-first' && repair.takeId) {
                            onRepair({
                              action: 'nudge-take',
                              takeId: repair.takeId,
                              nudgeSamples: repair.nudgeSamples ?? 0,
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
