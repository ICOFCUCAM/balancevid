'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Performance } from '../../../src/domain/performance.js';
import { renderProblems } from '../../../src/domain/performance.js';
import Deliver, { type RenderJob } from './Deliver.js';
import MasterRender, { MASTER_PROFILE, latestFor } from './MasterRender.js';
import PublishPanel from './PublishPanel.js';
import Stages from './Stages.js';

/**
 * Everything after the edit: MASTER, DELIVER, PUBLISH.
 * [Doctrine STUDIO-TWO §14, D-19, U-04]
 *
 * ONE POLL FOR THREE MODULES, which is why this exists at all. The render
 * jobs decide what every one of them says — whether the master is ready,
 * how many versions exist, whether there is anything to publish — and three
 * components each fetching `/renders` every two seconds would be three
 * answers that disagree for a second at a time, on the same screen, about
 * the same file. They were already two.
 *
 * IT ALSO OWNS THE ORDER, and the order is the point. The lower half of this
 * studio was seven headings deep — sound, shapes, a clip, a preview picture,
 * a publish button, a red sentence, a disclosure — with nothing saying which
 * belonged together. They are three acts: make the one file, make versions
 * of it, give it a page. Naming them is most of the work; the controls
 * underneath are the same controls.
 */
/**
 * A channel this performance could go out on, and whether it already is.
 *
 * Resolved on the server, from the channel's own rotation, because "is this
 * render in that loop" is a question about the channel's document and not
 * something a studio should be guessing from a list of names.
 */
export interface ChannelDestination {
  id: string;
  name: string;
  /** The entries in its rotation that point at THIS performance. */
  rotation: { entryId: string; planHash: string }[];
}

export default function Delivery({
  performance, onChanged, channels = [],
}: {
  performance: Performance;
  onChanged: (next: Performance) => void;
  channels?: ChannelDestination[];
}) {
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [audioJobs, setAudioJobs] = useState<RenderJob[]>([]);
  const [clipJobs, setClipJobs] = useState<RenderJob[]>([]);
  const [cardJobs, setCardJobs] = useState<RenderJob[]>([]);

  const id = performance.id;

  const refresh = useCallback(async () => {
    const [renders, audio, clips, card] = await Promise.all([
      fetch(`/api/performances/${id}/renders`, { cache: 'no-store' }),
      fetch(`/api/performances/${id}/audio`, { cache: 'no-store' }),
      fetch(`/api/performances/${id}/clips`, { cache: 'no-store' }),
      fetch(`/api/performances/${id}/card`, { cache: 'no-store' }),
    ]);
    if (renders.ok) setJobs(((await renders.json()).jobs ?? []) as RenderJob[]);
    if (audio.ok) setAudioJobs(((await audio.json()).jobs ?? []) as RenderJob[]);
    if (clips.ok) setClipJobs(((await clips.json()).jobs ?? []) as RenderJob[]);
    if (card.ok) setCardJobs(((await card.json()).jobs ?? []) as RenderJob[]);
  }, [id]);

  useEffect(() => { void refresh(); }, [refresh]);

  /* While something is rendering, ask again. Rendering is minutes, not ms. */
  const working = [...jobs, ...audioJobs, ...clipJobs, ...cardJobs]
    .some((job) => job.state === 'pending' || job.state === 'running');
  useEffect(() => {
    if (!working) return undefined;
    const timer = setInterval(() => { void refresh(); }, 2000);
    return () => clearInterval(timer);
  }, [working, refresh]);

  const masterReady = latestFor(jobs, MASTER_PROFILE)?.state === 'done';
  /*
   * The same question the renderer asks, in the words the author already
   * read upstairs — so a disabled version button explains itself with the
   * sentence that is on screen rather than a second wording of it. [D-19]
   */
  const problems = renderProblems(performance);
  const blocked = problems[0]
    ? `${problems[0].kind === 'no-scenes' ? 'nothing is on screen yet'
      : 'the song is not covered yet'} — see Master above`
    : null;

  return (
    <>
      <Stages performance={performance} renders={jobs} />
      {/*
        * THREE COLUMNS, NOT THREE STACKED PANELS.  [brief §4]
        *
        * Master, Deliver and Publish are three acts that happen in order,
        * and an order reads left to right on a desk — the same reason the
        * stage strip above is a row. Stacked, each one is as wide as the
        * page and as short as its contents, which is how a 300px card ended
        * up with a 300px column of empty dark beside it. Side by side they
        * share a baseline, fill the width, and you can see all three at
        * once, which is the point of knowing there are three.
        *
        * `auto-fit` and not three fixed tracks: below about 1100px they
        * stack, because three 340px columns of controls is not a layout,
        * it is a squeeze. `align-items: start` so a short column stays
        * short instead of stretching to match the tallest — a module with
        * air at the bottom is the thing being fixed here.
        */}
      <div data-testid="post" style={{
        display: 'grid', gap: 'var(--space-4)', marginTop: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        alignItems: 'start',
      }}>
      <MasterRender
        performance={performance} onChanged={onChanged}
        jobs={jobs} audioJobs={audioJobs} onRendered={() => { void refresh(); }}
      />
      <Deliver
        performance={performance} jobs={jobs} clipJobs={clipJobs}
        masterReady={masterReady} blocked={blocked}
        onRendered={() => { void refresh(); }}
      />
      <PublishPanel
        performance={performance} onChanged={onChanged}
        cardJobs={cardJobs} masterReady={masterReady}
        channels={channels} jobs={jobs}
        masterHash={latestFor(jobs, MASTER_PROFILE)?.result?.['planHash'] as string
          | undefined}
        onRendered={() => { void refresh(); }}
      />
      </div>
    </>
  );
}
