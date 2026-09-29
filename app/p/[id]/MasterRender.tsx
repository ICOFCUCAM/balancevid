'use client';

import { useState } from 'react';
import type { Performance } from '../../../src/domain/performance.js';
import {
  MASTER_PROFILE, mayPublish, renderProblems,
} from '../../../src/domain/performance.js';
import { EXPORT_PROFILES } from '../../../src/domain/presentation.js';
import { formatMasterPosition } from '../../../src/domain/time.js';
import MasterCheck from './MasterCheck.js';
import SoundModes from './SoundModes.js';
import VideoTransport from '../../VideoTransport.js';
import type { RenderJob } from './Deliver.js';

/**
 * The master render.  [Doctrine STUDIO-TWO §2, §14, S-4, INV-15]
 *
 * "Never merge the individual takes into one irreversible video until the
 *  final master render."
 *
 * Everything before this point is reversible: a scene can be moved, a take
 * renamed, an environment changed, and the document still describes the same
 * performance. This is the one button that produces a file, and the file is a
 * PROJECTION of the document — delete it and press the button again and the
 * same bytes come back, because the plan is derived and the shots are cached
 * by content hash (U-16, INV-00).
 *
 * THE LOWER HALF OF THIS STUDIO READ AS A WEB PAGE UNDER AN EDITOR.
 *
 * Above it: a take rail, a multiview, a composition rail and a timeline —
 * built from `.module`, laid out as a desk, unmistakably software. Below it,
 * in order: a heading and three cards about sound, a heading and four
 * buttons about shapes, a heading and a box about a clip, a preview picture,
 * a publish button, and a red sentence. Seven headings, no structure, and
 * nothing saying which of them belonged to the same act.
 *
 * They belong to three acts, and always did: MASTER makes the one file,
 * DELIVER makes versions and clips of it, PUBLISH gives it a page. This is
 * the first, and it is a `.module` like everything upstairs rather than a
 * `<section>` with an `<h2>` — which is the difference the whole
 * reorganisation is about.
 *
 * NOTHING NEW IS BUILT HERE. The sound modes, the four profiles, the render
 * jobs, the audio extraction and the publication were all already written
 * and are all still the same code. What changed is which of them stand
 * together, and what each one is called. [D-19]
 *
 * WHY IT SHOWS WHAT IS MISSING rather than a disabled button with no reason.
 * A render is refused for knowable causes — the song is not covered, a scene
 * names a take that does not reach it, the music is not the author's to
 * publish — and each is something they can act on. A greyed-out control with
 * a tooltip is how a tool teaches somebody to guess.
 */

/** The newest job for a profile, whatever state it reached. */
export { MASTER_PROFILE };

export function latestFor(jobs: RenderJob[], profileId: string): RenderJob | undefined {
  return [...jobs].reverse().find((job) =>
    String(job.payload?.['exportProfileId'] ?? MASTER_PROFILE) === profileId);
}

export default function MasterRender({
  performance, onChanged, jobs, audioJobs, onRendered,
}: {
  performance: Performance;
  onChanged: (next: Performance) => void;
  /** Lifted: DELIVER lists the same jobs, and one poll is enough. */
  jobs: RenderJob[];
  audioJobs: RenderJob[];
  onRendered: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /* The element goes into state as well, because the transport is a sibling
     that needs it as a prop and a ref read during render is null. */
  const [preview, setPreview] = useState<HTMLVideoElement | null>(null);

  const id = performance.id;
  const publishable = mayPublish(performance.master);
  /*
   * THE SAME QUESTION THE RENDERER ASKS, asked here so the answer is the
   * same one. This used to be re-derived: gaps summed into a single number
   * and that number printed through `formatMasterPosition`, which formats a
   * POSITION — so "1.248 seconds of song are uncovered, somewhere" was shown
   * as `00:01.248 of the song has nothing on screen`, a clock reading that
   * names nowhere. And `span.missing` was never consulted at all, so a scene
   * whose take runs out halfway left this button enabled and the author
   * found out by pressing it and reading the server's refusal.
   */
  const problems = renderProblems(performance);
  const master = latestFor(jobs, MASTER_PROFILE);
  const profile = EXPORT_PROFILES[MASTER_PROFILE]!;
  const takes = performance.takes.filter((take) => take.durationSamples > 0);
  const planHash = master?.result?.['planHash'] as string | undefined;
  const audioDone = audioJobs.some((job) => job.state === 'done'
    && String(job.result?.['planHash'] ?? job.payload?.['planHash'] ?? '') === planHash);
  const audioWorking = audioJobs.some((job) =>
    (job.state === 'pending' || job.state === 'running')
    && String(job.payload?.['planHash'] ?? '') === planHash);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/performances/${id}/renders`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          exportProfileId: MASTER_PROFILE, allowUnpublishable: !publishable,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'that render could not be planned');
      onRendered();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const takeAudio = async () => {
    if (!planHash) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/performances/${id}/audio`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ planHash }),
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

  /*
   * A STATE, NOT AN ERROR.  [D-14, U-19]
   *
   * "make the master video first — there is nothing to publish yet" was
   * drawn in `--bad` at the foot of the page, which is the colour this
   * product uses for something having gone wrong. Nothing has gone wrong: a
   * performance that has not been mastered yet is the ordinary condition of
   * every performance for most of its life. It is a lamp that is not lit.
   */
  /*
   * THE WORDS ON A DESK ARE THE WORDS FOR THE WORK.  [D-14]
   *
   * `not made`, `Make it`, `Make it again`, `Make an audio file`. Four
   * controls in the room where a video is finished, all built on the verb a
   * child uses for a sandcastle. The domain underneath has said `render`
   * and `export` since it was written — `/renders`, `RenderJob`,
   * `EXPORT_PROFILES`, `assertPerformanceRenderable` — so the screen was
   * less precise than the code driving it, which is the wrong way round and
   * is most of what reads as a prototype.
   *
   * CREATE, because that is the word the benchmark uses and one verb is
   * worth more than the best verb. `Create` / `Not created` / `Ready` runs
   * through the master, the versions, the clips, the card and the page; a
   * screen that said Render here, Export there and Make somewhere else
   * would be three vocabularies for one act.
   *
   * PLAIN SPEECH STAYS WHERE THE PRODUCT IS EXPLAINING A CHOICE. "The song,
   * and whoever is on screen" is not changing: it is a decision described
   * in the words of making it, which is a different job from naming an
   * operation.
   */
  const state = master?.state === 'done' ? { cls: 'is-on', say: 'ready' }
    : master?.state === 'failed' ? { cls: 'is-critical', say: 'failed' }
      : master ? { cls: 'is-armed', say: `${master.progress ?? 0}%` }
        : { cls: 'is-off', say: 'not created' };

  return (
    <section className="module" data-testid="master-render"
             data-state={master?.state ?? 'none'}>
      <header className="module-head">
        <span className="module-label">Master</span>
        <span className="module-sub grow" style={{
          minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
        }}>your final video, from the takes you directed</span>
        <span className={`state ${state.cls}`} data-testid="master-state">{state.say}</span>
      </header>

      <div className="module-body is-padded" style={{
        display: 'flex', flexDirection: 'column', gap: 'var(--space-5)',
      }}>
        {/*
          * THE MASTER, WATCHABLE.  [§14, U-04]
          *
          * The one file this studio exists to produce, and the only way to
          * see it was to download it. A picture of the thing you just made,
          * on the page where you made it, is not decoration: it is how an
          * author finds the cut that landed a frame late without opening a
          * second application.
          *
          * The same `<video>` and the same transport every other picture in
          * this product uses, on the same square-cornered bed. [D-19]
          */}
        {master?.state === 'done' && planHash && (
          <div style={{
            border: 'var(--border) solid var(--line)',
            borderRadius: 'var(--radius-screen)', overflow: 'hidden',
            background: 'var(--screen-bed)',
          }}>
            <video
              data-testid="master-preview"
              src={`/api/performances/${id}/renders/${planHash}/file`}
              playsInline preload="metadata"
              ref={setPreview}
              style={{
                width: '100%', aspectRatio: '16 / 9', display: 'block',
                border: 0, borderRadius: 0, objectFit: 'contain',
                background: 'var(--screen-bed)',
              }}
            />
            <VideoTransport video={preview} />
          </div>
        )}

        {/* ---- what the file is, whether or not it exists yet --------- */}
        <div className="row" style={{ gap: 'var(--space-5)', flexWrap: 'wrap' }}>
          <div className="grow" style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 'var(--text-md)', fontWeight: 'var(--weight-semi)',
              letterSpacing: 'var(--tracking-tight)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{performance.title}</div>
            <div className="muted readout" style={{
              fontSize: 'var(--text-2xs)', marginTop: 2,
            }}>
              {formatMasterPosition(performance.master.durationSamples)}
              {' · '}{profile.width}×{profile.height}
              {' · '}{takes.length} {takes.length === 1 ? 'take' : 'takes'}
            </div>
          </div>
          {master?.state === 'done' && planHash && (
            <div className="row" style={{ gap: 'var(--space-3)', flex: '0 0 auto' }}>
              <a className="ctl sm" data-testid="render-download"
                 href={`/api/performances/${id}/renders/${planHash}/file`} download>
                Download
              </a>
              {/* The same render, listened to rather than watched. [§14] */}
              <button className="ctl sm" data-testid="make-audio"
                      disabled={busy || audioWorking} onClick={() => void takeAudio()}>
                {audioWorking ? 'Creating…'
                  : audioDone ? 'Create it again' : 'Create audio file'}
              </button>
              {audioDone && (
                <a className="ctl sm" data-testid="audio-download"
                   href={`/api/performances/${id}/renders/${planHash}/file?kind=mp3`}
                   download>Download audio</a>
              )}
            </div>
          )}
        </div>

        {/* ---- where the finished sound comes from (§9, S-7) ---------- */}
        {takes.length > 0 && (
          <SoundModes performance={performance} onChanged={onChanged} />
        )}

        {/*
          * MASTER CHECK.  [MASTER-EDIT §13]
          *
          * This was a list of what was WRONG, and only that. An author
          * about to start a four-minute render wants to know what was
          * looked at — the value of a green list is that it says the
          * render is worth starting, and a refusal says nothing about the
          * nine things that were fine.
          */}
        <MasterCheck performance={performance} profileId={MASTER_PROFILE}
                     busy={busy}
                     onRepair={(body) => repair(id, body, setBusy, setError)} />

        {/* ---- the one button that makes a file ----------------------- */}
        <div className="row" style={{ gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          {/*
            * THE KEY CONTROL IS THE ACT, and once the file exists making it
            * again is not the act — it is a correction. A loud button that
            * stays loud after its job is done teaches an operator to stop
            * reading it. [brief §4]
            */}
          <button className={`ctl${master ? '' : ' is-key'}`}
                  data-testid="render-master"
                  disabled={busy || problems.length > 0}
                  {...(problems.length > 0
                    ? { title: 'the song is not covered yet' } : {})}
                  onClick={() => void start()}>
            {busy ? 'Creating…'
              : master ? 'Create it again'
                : publishable ? 'Create master video' : 'Create a private copy'}
          </button>
          {!publishable && (
            <p className="small muted" data-testid="private-only"
               style={{ margin: 0, maxWidth: 560 }}>
              {/* INV-15, said where the file is made rather than only where
                  the music was classified. */}
              This music is somebody else&rsquo;s, so the video is yours to keep
              and not ours to publish. Mark it as yours, licensed or openly
              licensed in Set up and this becomes a publishable master.
            </p>
          )}
        </div>

        {master?.state === 'failed' && (
          <p className="small" data-testid="render-failed"
             style={{ margin: 0, color: 'var(--bad)' }}>
            {master.error ?? 'the render failed'}
          </p>
        )}
        {error && (
          <p className="small" data-testid="render-error"
             style={{ margin: 0, color: 'var(--bad)' }}>{error}</p>
        )}
      </div>
    </section>
  );
}

/**
 * Apply a repair.  [MASTER-EDIT §13]
 *
 * One path for every remedy, because they are all the same shape: a PATCH
 * that either closes the hole or refuses with the reason it would not. The
 * refusals matter more than the successes here — `coverGap` and `coverWith`
 * both put the document back rather than trading one refusal for another.
 */
/**
 * Returns the refusal, or null.
 *
 * IT USED TO RETURN NOTHING and only set `setError`, which puts the
 * message at the top of this panel. That was fine while every repair was a
 * button two lines from there. It stopped being fine when the check list
 * grew a paste box: a refusal about lyrics appeared above a panel the
 * author had scrolled past, which is the same as not appearing. The
 * message still goes to `setError` for everybody, and now it also comes
 * back so a control can say it where it happened. [U-19]
 */
async function repair(
  id: string, body: Record<string, unknown>,
  setBusy: (busy: boolean) => void, setError: (message: string | null) => void,
): Promise<string | null> {
  setBusy(true);
  setError(null);
  try {
    const response = await fetch(`/api/performances/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? 'that repair did not work');
    /* The document changed under the page, so the page has to be told. */
    window.location.reload();
    return null;
  } catch (e) {
    const said = e instanceof Error ? e.message : String(e);
    setError(said);
    setBusy(false);
    return said;
  }
}
