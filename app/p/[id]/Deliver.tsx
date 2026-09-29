'use client';

import { useState } from 'react';
import type { Performance } from '../../../src/domain/performance.js';
import { mayPublish } from '../../../src/domain/performance.js';
import { clipCandidates } from '../../../src/domain/performanceClips.js';
import { EXPORT_PROFILES } from '../../../src/domain/presentation.js';
import { formatMasterPosition } from '../../../src/domain/time.js';
import { MASTER_PROFILE, latestFor } from './MasterRender.js';

/**
 * The versions that go out, and what state each is in.
 * [Doctrine STUDIO-TWO §14, §15, U-22, U-30]
 *
 * WHAT WAS HERE BEFORE was a row of four buttons under the heading "Make the
 * video" — YouTube 16:9, Vertical 9:16, Square 1:1, Portrait 4:5 — of which
 * one was selected, and a separate "Make the master video" that made
 * whichever was. That is a MODE: the button's effect depended on a selection
 * made somewhere else on the page, and nothing on screen said which of the
 * four existed already. Under it, a second heading, "Share it", held a clip
 * candidate, a link-preview button and a publish button, three unrelated
 * things sharing a container because they were built in the same week.
 *
 * A DELIVERY LIST IS A TABLE OF STATES. Each shape is a row that says what
 * it is, whether it exists, and what can be done about that — which is the
 * question an author actually has here, and the one four identical buttons
 * could not answer. The master is not in this list because the master is not
 * a version of itself; it is upstairs, where it is made.
 *
 * NO NEW CAPABILITY. Same profiles, same `/renders` route, same clip
 * candidates, same jobs. [D-19]
 */

export interface RenderJob {
  id: string;
  state: 'pending' | 'running' | 'done' | 'failed';
  progress?: number;
  error?: string | null;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
}

/** §14's shapes other than the master, in the order an author wants them. */
const VERSIONS = ['vertical_9x16', 'square_1x1', 'portrait_4x5'] as const;

export default function Deliver({
  performance, jobs, clipJobs, masterReady, blocked, onRendered,
}: {
  performance: Performance;
  jobs: RenderJob[];
  clipJobs: RenderJob[];
  masterReady: boolean;
  /** Why no version can be made, when none can. */
  blocked: string | null;
  onRendered: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const id = performance.id;
  const publishable = mayPublish(performance.master);
  const candidates = clipCandidates(performance);

  const post = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/performances/${id}${path}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'that did not work');
      onRendered();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const made = VERSIONS.filter((profileId) =>
    latestFor(jobs, profileId)?.state === 'done').length;

  return (
    <section className="module" data-testid="deliver" style={{ marginTop: 12 }}>
      <header className="module-head">
        <span className="module-label">Deliver</span>
        <span className="module-sub grow" style={{ minWidth: 0 }}>
          versions and clips of the master
        </span>
        <span className="module-sub readout" data-testid="versions-made">
          {made} of {VERSIONS.length}
        </span>
      </header>

      <div className="module-body">
        {VERSIONS.map((profileId) => {
          const profile = EXPORT_PROFILES[profileId]!;
          const job = latestFor(jobs, profileId);
          const planHash = job?.result?.['planHash'] as string | undefined;
          const state = job?.state === 'done' ? { cls: 'is-on', say: 'ready' }
            : job?.state === 'failed' ? { cls: 'is-critical', say: 'failed' }
              : job ? { cls: 'is-armed', say: `${job.progress ?? 0}%` }
                : { cls: 'is-off', say: 'not made' };
          return (
            <div key={profileId} className="row" data-testid="version"
                 data-profile={profileId} data-state={job?.state ?? 'none'}
                 style={{
                   gap: 'var(--space-4)', flexWrap: 'nowrap',
                   padding: '8px 10px',
                   borderBottom: 'var(--border) solid var(--console-rule)',
                 }}>
              <span className="grow" style={{
                minWidth: 0, fontSize: 'var(--text-sm)',
                fontWeight: 'var(--weight-medium)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{profile.label}</span>
              <span className="muted readout" style={{
                fontSize: 'var(--text-2xs)', flex: '0 0 auto',
              }}>{profile.width}&times;{profile.height}</span>
              <span className={`state ${state.cls}`}>{state.say}</span>
              {job?.state === 'done' && planHash ? (
                <a className="ctl sm" data-testid="version-download"
                   href={`/api/performances/${id}/renders/${planHash}/file`} download
                   style={{ flex: '0 0 auto' }}>Download</a>
              ) : (
                <button className="ctl sm" data-testid="make-version"
                        disabled={busy || Boolean(blocked) || !masterReady}
                        /*
                         * DISABLED ITEMS SAY WHY, the same rule the menus
                         * follow. "Make the master first" is a fact an
                         * author can act on; a grey button is a puzzle.
                         */
                        title={blocked ?? (masterReady ? undefined
                          : 'make the master video first')}
                        onClick={() => void post('/renders', {
                          exportProfileId: profileId,
                          allowUnpublishable: !publishable,
                        })}
                        style={{ flex: '0 0 auto' }}>
                  {job?.state === 'failed' ? 'Try again' : 'Make it'}
                </button>
              )}
            </div>
          );
        })}

        {/* ---- a window on the same master, cut vertical (§14) -------- */}
        <div className="module-head" style={{ borderTop: 0 }}>
          <span className="module-label">Clips</span>
          <span className="module-sub grow" style={{ minWidth: 0 }}>
            a named section of it, cut for a phone
          </span>
        </div>

        {candidates.length === 0 ? (
          <p className="small muted" data-testid="no-clips"
             style={{ margin: 0, padding: '8px 10px' }}>
            Name a section on the timeline and it becomes something you can clip.
          </p>
        ) : candidates.map((candidate) => {
          /*
           * BOTH ENDS, NOT JUST THE START. Two named sections can begin at
           * the same sample — "Opening" and a product-chosen window over
           * the same bar — and matching on one of them makes the second
           * row claim the first one's file. A window is a pair.
           */
          const job = [...clipJobs].reverse().find((entry) =>
            Number(entry.payload?.['fromSample'] ?? -1) === candidate.fromSample
            && Number(entry.payload?.['toSample'] ?? -1) === candidate.toSample);
          const planHash = job?.result?.['planHash'] as string | undefined;
          return (
            <div key={candidate.id} data-testid="clip-candidate"
                 data-candidate={candidate.id}
                 data-suggested={candidate.suggested ? 'true' : 'false'}
                 style={{
                   padding: '8px 10px',
                   borderBottom: 'var(--border) solid var(--console-rule)',
                 }}>
              <div className="row" style={{ gap: 'var(--space-4)', flexWrap: 'nowrap' }}>
                <span className="grow" style={{
                  minWidth: 0, fontSize: 'var(--text-sm)',
                  fontWeight: 'var(--weight-medium)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{candidate.label}</span>
                <span className="muted readout" style={{
                  fontSize: 'var(--text-2xs)', flex: '0 0 auto',
                }}>
                  {formatMasterPosition(candidate.toSample - candidate.fromSample)}
                </span>
                {job?.state === 'done' && planHash ? (
                  <a className="ctl sm" data-testid="clip-download"
                     href={`/api/performances/${id}/clips/${planHash}/file`} download
                     style={{ flex: '0 0 auto' }}>Download</a>
                ) : (
                  <button className="ctl sm" data-testid="render-clip"
                          disabled={busy || Boolean(blocked)}
                          title={blocked ?? undefined}
                          onClick={() => void post('/clips', {
                            fromSample: candidate.fromSample,
                            toSample: candidate.toSample,
                            exportProfileId: 'vertical_9x16',
                            allowUnpublishable: !publishable,
                          })}
                          style={{ flex: '0 0 auto' }}>
                    {job && job.state !== 'failed'
                      ? `${job.progress ?? 0}%` : 'Make a vertical clip'}
                  </button>
                )}
              </div>
              <div className="small muted" style={{
                marginTop: 3, fontSize: 'var(--text-2xs)',
              }}>
                {/* The ranking, said out loud so it can be disagreed with. */}
                {candidate.reasons.join(' · ')}
              </div>
            </div>
          );
        })}

        {error && (
          <p className="small" data-testid="deliver-error"
             style={{ margin: 0, padding: '8px 10px', color: 'var(--bad)' }}>{error}</p>
        )}
      </div>
    </section>
  );
}

/** Whichever of the four has been made, for whoever needs the count. */
export { MASTER_PROFILE };
