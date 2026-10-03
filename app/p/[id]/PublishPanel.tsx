'use client';

import AvailabilityFields from '../../AvailabilityFields.js';
import {
  describeAvailability, type TakeAvailability,
} from '../../../src/domain/availability.js';
import { useCallback, useState } from 'react';
import type { Performance } from '../../../src/domain/performance.js';
import { HOUSE_SAMPLE_RATE, mayPublish } from '../../../src/domain/performance.js';
import { PLATFORMS, POSTING, profileForShape } from '../../../src/domain/distribution.js';
import { EXPORT_PROFILES } from '../../../src/domain/presentation.js';
import type { ChannelDestination } from './Delivery.js';
import { type RenderJob } from './Deliver.js';
import { latestFor } from './MasterRender.js';

/**
 * A page to send people.  [Doctrine STUDIO-TWO §14, U-30, U-31, INV-15]
 *
 * The last act, and now the only thing in its own module. It used to share a
 * heading called "Share it" with the clip candidates and the render jobs —
 * three unrelated things in one container because they were built in the
 * same week — and it ended in a red sentence:
 *
 *     make the master video first — there is nothing to publish yet
 *
 * WHICH IS A STATE AND NOT AN ERROR. `--bad` is the colour this product uses
 * for something having gone wrong, and nothing has: a performance that has
 * not been mastered is the ordinary condition of every performance for most
 * of its life. It is a lamp that is not lit, so it is drawn as one.
 *
 * THE CARD IS THE PICTURE A LINK ARRIVES WITH (U-30), which is why it sits
 * here rather than with the versions: it is not something to watch, it is
 * what a stranger sees before they decide whether to.
 *
 * AND A PAGE IS NOT THE ONLY PLACE A PERFORMANCE GOES.  [CHANNEL §5, D-19]
 *
 * A channel has been able to broadcast a Studio Two render since the
 * scheduler was written — `ProgrammeSource {kind:'render', document:
 * 'performance', documentId, planHash}` — and the control room's library
 * already lists performances to pick from. The capability was whole; the
 * door opened only from Online TV's side. An author who has just made a
 * master and wants it on their own channel had to leave the studio, find
 * the control room, open its library and search for what they had just
 * made — the same shape of gap as the broadcast that could not invite
 * anybody because the invitation lived in Studio One.
 *
 * What is NOT here is a row of YouTube and TikTok "Connect" buttons.
 * `distribution.ts` models those destinations and nothing in this product
 * uploads to any of them; a button that says Connect and does nothing is
 * worse than its absence, because absence is at least true. The vertical,
 * square and portrait cuts exist for those places and DELIVER hands you
 * the files.
 */

interface CardJob {
  id: string;
  state: 'pending' | 'running' | 'done' | 'failed';
  payload?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
}

export default function PublishPanel({
  performance, onChanged, cardJobs, masterReady, jobs = [], channels = [],
  masterHash, onRendered,
}: {
  performance: Performance;
  onChanged: (next: Performance) => void;
  cardJobs: CardJob[];
  masterReady: boolean;
  /** The renders, so a platform row can say whether its cut exists. */
  jobs?: RenderJob[];
  channels?: ChannelDestination[];
  /** The plan hash of the master as it stands now. */
  masterHash?: string | undefined;
  onRendered: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const id = performance.id;
  /*
   * AVAILABLE FOR TAKES, WHICH WAS A CONSTANT.  [TAKE-PLATFORM P8]
   *
   * `publishPerformance` wrote `respondable: false` and nothing could
   * change it, so the panel below said "nobody can answer it" and was
   * telling the truth about a decision no producer had made. A song
   * published for other people to sing on is the whole of Studio Two's
   * relationship with the Take App, and it was unreachable.
   *
   * THE DEFAULT IS STILL CLOSED. Publishing a master has always meant
   * "anyone with the link can watch this" and must go on meaning only
   * that; opening a song to takes is a second decision, made here.
   */
  const [availability, setAvailability] = useState<TakeAvailability>({
    respondable: false, listed: true,
  });
  const publishable = mayPublish(performance.master);
  const published = Boolean(performance.publication
    && !performance.publication.unpublishedAt);
  const hasCard = cardJobs.some((job) => job.state === 'done');

  const reload = useCallback(async () => {
    const response = await fetch(`/api/performances/${id}`, { cache: 'no-store' });
    if (response.ok) onChanged((await response.json()).performance);
  }, [id, onChanged]);

  const post = async (path: string, body: Record<string, unknown> = {}) => {
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
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/performances/${id}/publish`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? 'that did not work');
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Put the master into a channel's continuous loop, or take it out.
   * [CHANNEL §4, §5]
   *
   * THE ROTATION AND NOT THE SCHEDULE, because a scheduled programme needs
   * a time and "when should this go out" is a question about the channel's
   * day, asked in the control room where the day is. The loop is the
   * channel's default answer to "play this": it goes round until somebody
   * gives it a slot.
   */
  const rotate = async (channelId: string, body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/channels/${channelId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'the channel refused that');
      /* The channel changed, and this page was handed its rotation by the
         server — so the server has to say it again. */
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  /*
   * WHY IT CANNOT BE PUBLISHED, IN THE ORDER THE AUTHOR CAN ACT ON. The
   * rights question is first because it is the one that cannot be fixed by
   * pressing another button, and a person told "make the master first" who
   * then makes it and is told "this music is somebody else's" has been sent
   * the long way round. [INV-15]
   */
  const why = !publishable
    ? 'This music is somebody else’s, so there is no page to give it. '
      + 'A private export is still yours.'
    : !masterReady
      ? 'There is no master video yet. Create one above and this becomes a page '
        + 'anyone with the link can watch.'
      : null;

  const state = published ? { cls: 'is-live', say: 'published' }
    : why ? { cls: 'is-off', say: 'not published' }
      : { cls: 'is-armed', say: 'ready' };

  return (
    <section className="module" data-testid="publish-module"
             data-published={published ? 'true' : 'false'}>
      <header className="module-head">
        <span className="module-label">Publish &amp; distribute</span>
        <span className="module-sub grow" style={{ minWidth: 0 }}>
          platforms, and a page of your own
        </span>
        <span className={`state ${state.cls}`} data-testid="publish-state">
          {state.say}
        </span>
      </header>

      <div className="module-body is-padded" style={{
        display: 'flex', flexDirection: 'column', gap: 'var(--space-5)',
      }}>
        {/* ---- the picture a link arrives with (U-30) ----------------- */}
        {hasCard ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            data-testid="card-image"
            src={`/api/performances/${id}/card?image=1`}
            alt="The link preview for this performance"
            style={{
              width: '100%', display: 'block',
              borderRadius: 'var(--radius-screen)',
              border: 'var(--border) solid var(--line)',
              background: 'var(--screen-bed)',
            }}
          />
        ) : (
          <div aria-hidden="true" style={{
            width: '100%', aspectRatio: '1200 / 630',
            borderRadius: 'var(--radius-screen)',
            border: 'var(--border) dashed var(--line)',
            background: 'var(--screen-bed)',
            display: 'grid', placeItems: 'center',
            fontSize: 'var(--text-2xs)', color: 'var(--text-faint)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>no preview yet</div>
        )}

        <p className="small muted" data-testid="publication-state"
           style={{ margin: 0 }}>
          {published
            ? `Anyone with the link can watch this. ${
              describeAvailability(performance.publication,
                new Date().toISOString())} Withdrawing stops `
              + 'the link working; the video stays here.'
            : why
              ?? 'Publishing puts the master video on a page anyone with the '
                + 'link can watch.'}
        </p>

        {/*
          * BEFORE PUBLISHING, NOT AFTER. These are decided in the same
          * press, so they are above the button rather than in a panel
          * somebody has to find afterwards — and gone once it is
          * published, because changing them then is a different act with
          * a different consequence for people who already hold the link.
          */}
        {!published && !why && (
          <AvailabilityFields
            noun="song"
            value={availability}
            onChange={setAvailability}
            disabled={busy}
          />
        )}

        <div className="row" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          {published ? (
            <>
              <a className="ctl sm" data-testid="watch-link"
                 href={`/p/${id}/watch`} target="_blank" rel="noreferrer">
                View public page
              </a>
              <button className="ctl sm" data-testid="unpublish" disabled={busy}
                      onClick={() => void withdraw()}>
                Unpublish
              </button>
            </>
          ) : (
            <button className="ctl is-key" data-testid="publish"
                    disabled={busy || Boolean(why)}
                    title={why ?? undefined}
                    onClick={() => void post('/publish', { ...availability })}>
              Create public page
            </button>
          )}
          <button className="ctl sm" data-testid="render-card"
                  disabled={busy || !publishable}
                  title={publishable ? undefined
                    : 'a card is made to be posted, and this music is not yours'}
                  onClick={() => void post('/card')}>
            {hasCard ? 'Create it again' : 'Create link preview'}
          </button>
        </div>
      </div>

      {/* ---- and everywhere else it can go -------------------------- */}
      <div data-testid="destinations" className="module-body" style={{
        borderTop: 'var(--border) solid var(--console-rule)',
      }}>
        <div className="module-head" style={{ borderTop: 0 }}>
          <span className="module-label">Distribution</span>
          <span className="module-sub grow" style={{ minWidth: 0 }}>
            your channels, and the format each platform expects
          </span>
        </div>

        {channels.map((channel) => {
          /*
           * THREE STATES, AND THE THIRD IS THE USEFUL ONE. A rotation entry
           * names a PLAN HASH, so re-mastering leaves the channel playing
           * the cut you replaced \u2014 true, silent, and exactly the kind of
           * thing found weeks later. The document knows, so it says.
           */
          const here = channel.rotation;
          const current = here.some((entry) => entry.planHash === masterHash);
          const stale = here.length > 0 && !current;
          const lamp = current ? { cls: 'is-live', say: 'on air' }
            : stale ? { cls: 'is-armed', say: 'older cut' }
              : { cls: 'is-off', say: 'not in rotation' };
          return (
            <div key={channel.id} className="row" data-testid="destination"
                 data-channel={channel.id}
                 data-on={current ? 'true' : stale ? 'stale' : 'false'}
                 style={{
                   gap: 'var(--space-3)', flexWrap: 'nowrap', padding: '6px 10px',
                   borderBottom: 'var(--border) solid var(--console-rule)',
                 }}>
              <span className="grow" style={{
                minWidth: 0, fontSize: 'var(--text-sm)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{channel.name}</span>
              <span className={`state ${lamp.cls}`}>{lamp.say}</span>
              {current ? (
                <button className="ctl sm" data-testid="unrotate" disabled={busy}
                        onClick={() => void rotate(channel.id, {
                          action: 'unrotate', entryId: here[0]!.entryId,
                        })}
                        style={{ flex: '0 0 auto' }}>Remove</button>
              ) : (
                <button className="ctl sm" data-testid="rotate"
                        disabled={busy || !masterReady || !masterHash}
                        title={masterReady ? undefined
                          : 'create the master video first'}
                        onClick={() => void rotate(channel.id, {
                          action: 'rotate',
                          source: {
                            kind: 'render', document: 'performance',
                            documentId: id, planHash: masterHash,
                          },
                          durationMs: Math.round(
                            (performance.master.durationSamples
                              / HOUSE_SAMPLE_RATE) * 1000),
                          title: performance.title,
                        })}
                        style={{ flex: '0 0 auto' }}>
                  {stale ? 'Update to current' : 'Add to rotation'}
                </button>
              )}
            </div>
          );
        })}

        {/*
          * AND THE PLACES THIS PRODUCT DOES NOT POST TO.  [\u00a714]
          *
          * A studio sold on its own has no channel, so a list of channels
          * said nothing at all to most of the people reading it \u2014 and
          * "where it goes" with nothing in it is half a section. What is
          * true today is that BalanceVid makes the cut each place wants and
          * does not upload it for you, so that is what each row says: the
          * shape, whether that cut exists, and the file.
          *
          * NO "CONNECT" BUTTON. Every one of these needs an app review
          * before it could send anything \u2014 `PLATFORMS` records which and
          * why \u2014 and a control promising a connection nobody has built is
          * the one thing worse than the row not being here at all.
          */}
        {POSTING.map(({ kind, label }) => {
          const shape = PLATFORMS[kind].shape;
          const profileId = profileForShape(shape);
          const job = latestFor(jobs, profileId);
          const planHash = job?.result?.['planHash'] as string | undefined;
          const ready = job?.state === 'done' && Boolean(planHash);
          return (
            <div key={kind} className="row" data-testid="posting"
                 data-platform={kind} data-ready={ready ? 'true' : 'false'}
                 style={{
                   gap: 'var(--space-3)', flexWrap: 'nowrap', padding: '6px 10px',
                   borderBottom: 'var(--border) solid var(--console-rule)',
                 }}>
              <span className="grow" style={{
                minWidth: 0, fontSize: 'var(--text-sm)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{label}</span>
              <span className="muted readout" style={{
                fontSize: 'var(--text-2xs)', flex: '0 0 auto',
              }}>{shape}</span>
              <span className={`state ${ready ? 'is-on' : 'is-off'}`}>
                {ready ? 'ready' : 'not created'}
              </span>
              {ready ? (
                <a className="ctl sm" data-testid="posting-download"
                   href={`/api/performances/${id}/renders/${planHash}/file`}
                   download style={{ flex: '0 0 auto' }}>Download</a>
              ) : (
                <button className="ctl sm" data-testid="posting-make"
                        title={`${EXPORT_PROFILES[profileId]?.label ?? profileId}`
                          + ' \u2014 make it under Deliver'}
                        onClick={() => document
                          .querySelector('[data-testid="deliver"]')
                          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                        style={{ flex: '0 0 auto' }}>
                  Create
                </button>
              )}
            </div>
          );
        })}

        <p className="small muted" style={{
          margin: 0, padding: '8px 10px', fontSize: 'var(--text-2xs)',
        }}>
          BalanceVid does not upload for you. It creates the format each
          platform expects; you take the file.
        </p>
        {error && (
          <p className="small" data-testid="publish-error"
             style={{ margin: 0, padding: '0 10px 8px', color: 'var(--bad)' }}>
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
