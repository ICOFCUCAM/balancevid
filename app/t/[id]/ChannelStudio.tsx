'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Channel, Programme, ProgrammeSource } from '../../../src/domain/channel.js';
import type { OnAir, RotationEntry } from '../../../src/domain/channel.js';
import {
  nextAfter, onAirAt, orderedProgrammes, programmeEnd, programmeStart,
  referencedAssets, rotationLengthMs, rotationOffsets, sourceKey, whatIsOn,
} from '../../../src/domain/channel.js';
import StudioBar from '../../StudioBar.js';
import { useLiveEncoder } from './useLiveEncoder.js';

/**
 * The Channel Studio.  [Doctrine CHANNEL §1–§7, D-18, INV-17]
 *
 * One clock, running whether or not anybody is looking. A schedule of
 * references. A stream.
 *
 * THE LEFT RAIL IS NOT A MEDIA LIBRARY, it is a list of references — every
 * finished render both other studios have made, with a duration on it so a
 * slot can be the right length without anybody typing a number they guessed.
 * Dragging one onto the schedule stores the reference it was handed. There is
 * no upload here, and there is no "add to channel": a channel holds nothing.
 *
 * THE MONITOR IS NOT THE STREAM, and says so. Playing the actual broadcast
 * would need an HLS player, and every browser but Safari needs a library for
 * that; what this shows instead is the referenced media, seeked to where the
 * schedule says the channel is and kept there by the wall clock. That is what
 * a playout monitor is — the desk's confidence check, not the transmission —
 * and the transmission's URL is printed beside it for a player that wants it.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The slot lengths a scheduler reaches for, in minutes. */
const SLOTS = [5, 15, 30, 60, 90, 120];

interface LibraryItem {
  /** A reference. A render from either studio, or a piece of other media. */
  source: ProgrammeSource;
  title: string;
  document: 'conversation' | 'performance' | 'other';
  documentId: string;
  planHash: string;
  bytes: number;
  madeAt: string;
}

export default function ChannelStudio({
  initial, studioOneId, studioTwoId,
}: {
  initial: Channel;
  studioOneId?: string;
  studioTwoId?: string;
}) {
  const [channel, setChannel] = useState(initial);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<ProgrammeSource[]>([]);
  const [violations, setViolations] = useState<string[]>([]);
  /**
   * The wall clock, ticking.
   *
   * A channel is the one document in this product whose state changes when
   * nobody touches it, so the page has to move on its own. Once a second: the
   * listing moves in minutes and the monitor is steered by the video element,
   * so sixty redraws a second would buy nothing and cost the frame budget.
   */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const id = channel.id;
  /**
   * THE PIPE. Camera → microphone → this → the channel's live buffer.
   *
   * Held at the top of the studio rather than inside the live panel, because
   * a component that unmounts takes the camera with it — and the panel
   * re-renders on every tick of the clock.
   */
  const encoder = useLiveEncoder(id);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/channels/${id}`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    setChannel(data.channel);
    setMissing(data.missing ?? []);
    setViolations(data.violations ?? []);
  }, [id]);

  useEffect(() => { void refresh(); }, [refresh]);

  /*
   * The camera follows the session, not a button. Arming opens it, ending
   * closes it — so a broadcast that was ended from another tab, or by the
   * document changing underneath, does not leave a camera light on.
   */
  const phase = channel.live?.phase;
  useEffect(() => {
    if ((phase === 'armed' || phase === 'on_air') && !encoder.running) {
      void encoder.start();
    }
    if (phase === undefined || phase === 'ended') encoder.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/channels/library', { cache: 'no-store' });
      if (response.ok) setLibrary((await response.json()).items ?? []);
    })();
  }, []);

  const patch = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch(`/api/channels/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error ?? 'that change was refused'); return false; }
    setError(null);
    setChannel(data.channel);
    void refresh();
    return true;
  }, [id, refresh]);

  const listing = orderedProgrammes(channel);
  /*
   * WHAT IS ACTUALLY ON, by the same function the playout engine uses: live,
   * then a fixed slot, then the loop. Computed here from the ticking clock
   * rather than read from the server, so the studio and the wire agree
   * without a round trip every second. [§4, §5]
   */
  const on: OnAir = whatIsOn(channel, now);
  /** Armed, on air, or neither. The two modes and the step between. [§6] */
  const session = channel.live && channel.live.phase !== 'ended'
    ? channel.live : undefined;
  const onAir = Boolean(session);
  const armed = session?.phase === 'armed';
  const emergency = Boolean(channel.emergency);
  const keeping = Boolean(
    channel.ingests.find((ingest) => ingest.id === session?.ingestId)?.keep);
  const turn = rotationLengthMs(channel);
  const offsets = rotationOffsets(channel);
  const live = onAirAt(channel, now);
  const coming = nextAfter(channel, now);
  const programme = listing.find((entry) => entry.id === chosen) ?? live ?? listing[0];
  const assets = referencedAssets(channel).length;
  const missingKeys = new Set(missing.map(sourceKey));

  /** A label for a reference, from the library if it is still there. */
  const nameOf: (source: ProgrammeSource) => string = useCallback((source) => {
    if (source.kind === 'live') {
      return channel.ingests.find((ingest) => ingest.id === source.ingestId)?.label
        ?? 'a live feed';
    }
    const known = library.find(
      (item) => sourceKey(item.source) === sourceKey(source))?.title;
    if (known) return known;
    if (source.kind === 'media') return 'a picture';
    if (source.kind === 'live_event') return source.note ?? 'LIVE \u2014 booked';
    return `${source.document} ${source.documentId.slice(0, 12)}`;
  }, [channel.ingests, library]);

  /**
   * WHAT IS NEXT, which in a channel with a loop is rarely the next fixed
   * slot. It is whichever comes sooner: the programme that pre-empts, or the
   * turn of the rotation that follows this one. [§4, §6]
   */
  const upNext = (() => {
    const soonest = coming ? programmeStart(coming) : Infinity;
    if (on.kind === 'rotation' && channel.rotation.length > 0) {
      const index = channel.rotation.findIndex((e) => e.id === on.entry.id);
      const after = channel.rotation[(index + 1) % channel.rotation.length]!;
      if (on.untilMs <= soonest) return after.title ?? nameOf(after.source);
    }
    return coming ? (coming.title ?? nameOf(coming.source)) : null;
  })();

  /* ---- the day the listing is drawn over --------------------------- */
  const dayStart = useMemo(() => {
    const first = listing[0];
    const anchor = first ? programmeStart(first) : now;
    return Math.floor(anchor / DAY) * DAY;
  }, [listing, now]);
  const across = (at: number) => `${((at - dayStart) / DAY) * 100}%`;

  const clock = (at: number) => new Date(at).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: channel.timezone,
  });

  return (
    <div className="shell">
      <StudioBar
        current="studio-three"
        studioOneId={studioOneId}
        studioTwoId={studioTwoId}
        trailing={(
          <span className="small muted" style={{
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {channel.name}
            {' · '}
            {new Date(now).toLocaleTimeString('en-GB', { timeZone: channel.timezone })}
            {' '}
            {channel.timezone}
          </span>
        )}
      />

      <div className="shell-body shell-scroll" style={{ padding: '14px 18px' }}>
        <div style={{
          display: 'grid', minHeight: 0, gap: 12,
          gridTemplateColumns: 'minmax(250px, 330px) minmax(0, 1fr) minmax(290px, 360px)',
          gridTemplateAreas: '"library monitor panel" "loop loop loop" '
            + '"schedule schedule schedule" "transport transport transport"',
          alignItems: 'start',
        }}>
          {/* ---- what there is to broadcast (§3) ------------------------ */}
          <div style={{
            gridArea: 'library', position: 'relative', alignSelf: 'stretch',
            minHeight: 0,
          }}>
            <div className="shell-scroll" style={{ position: 'absolute', inset: 0 }}>
              <div className="panel" data-testid="broadcast-library" style={{
                minWidth: 0, padding: 10, display: 'flex',
                flexDirection: 'column', gap: 8,
              }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>Library</span>
                  <span className="small muted" style={{ fontSize: 11 }}>
                    {library.length} to broadcast
                  </span>
                </div>
                {/*
                  * Said once, here, because it is the one thing about this
                  * studio somebody has to understand: nothing is copied. [D-18]
                  */}
                <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
                  Scheduling points at these. Nothing is copied, whatever the
                  schedule does with it.
                </p>
                {library.length === 0 && (
                  <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
                    Nothing finished yet. Make a video in Studio One or Two.
                  </p>
                )}
                {library.map((item) => {
                  const key = sourceKey(item.source);
                  const on = picked === key;
                  const times = listing.filter(
                    (entry) => sourceKey(entry.source) === key).length;
                  return (
                    <button
                      key={key} type="button" data-testid="library-item"
                      data-source-key={key}
                      onClick={() => setPicked(on ? null : key)}
                      style={{
                        display: 'flex', gap: 9, alignItems: 'center', width: '100%',
                        padding: 7, borderRadius: 9, textAlign: 'left',
                        font: 'inherit', color: 'inherit', cursor: 'pointer',
                        background: on ? 'rgba(45,110,200,0.16)' : 'var(--panel-2)',
                        border: `1px solid ${on ? '#3d7fd6' : 'var(--line)'}`,
                      }}
                    >
                      <span aria-hidden="true" style={{
                        flex: '0 0 auto', width: 52, height: 30, borderRadius: 5,
                        background: '#0d1319', border: '1px solid var(--line)',
                        display: 'grid', placeItems: 'center', fontSize: 9,
                        color: 'var(--muted)',
                      }}>{item.document === 'performance' ? 'S2'
                        : item.document === 'other' ? 'LIB' : 'S1'}</span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{
                          fontWeight: 600, fontSize: 13, display: 'block',
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>{item.title}</span>
                        <span className="small muted" style={{ fontSize: 11 }}>
                          {(item.bytes / 1_000_000).toFixed(0)} MB
                          {/* The count that proves the rule, on the thing it
                              is about: scheduled six times, one file. */}
                          {times > 0 && ` · scheduled ${times}×`}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ---- the monitor (§7) --------------------------------------- */}
          <div
            data-testid="channel-monitor"
            data-on-air={on.kind !== 'off' ? 'true' : 'false'}
            data-mode={on.kind}
            style={{
              gridArea: 'monitor', position: 'relative', aspectRatio: '16 / 9',
              background: '#05070a', borderRadius: 10,
              border: '1px solid var(--line)', overflow: 'hidden',
            }}
          >
            {on.kind === 'live' && on.source.kind === 'live' ? (
              /*
               * THE OPERATOR'S OWN PICTURE, not the transmission. What goes
               * out is this twelve seconds later (LIVE_DELAY_MS); showing the
               * delayed version on the desk is how presenters end up talking
               * over themselves.
               */
              <video
                ref={encoder.videoRef} autoPlay muted playsInline
                data-testid="live-preview"
                style={{
                  width: '100%', height: '100%', objectFit: 'contain',
                  display: encoder.stream ? 'block' : 'none',
                }}
              />
            ) : on.kind !== 'off' ? (
              <Monitor on={on} channel={channel} />
            ) : (
              <div className="small muted" style={{
                position: 'absolute', inset: 0, display: 'grid',
                placeItems: 'center', textAlign: 'center', padding: 20,
              }}>
                Off air.
                {coming
                  ? ` Next at ${clock(programmeStart(coming))}.`
                  : ' Nothing is scheduled.'}
              </div>
            )}
            <div className="row" style={{
              position: 'absolute', left: 10, top: 10, gap: 8,
            }}>
              {/*
                * THREE STATES, NOT TWO. Red is the red button — somebody is
                * live. Blue is the channel running itself, which is the
                * ordinary condition of a channel with a loop and not
                * something to call "off". Grey is genuinely nothing, which a
                * channel with a rotation can never be. [§4, §5]
                */}
              <span data-testid="on-air-lamp" data-mode={on.kind} style={{
                padding: '3px 9px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                background: on.kind === 'live' ? '#c0392b'
                  : on.kind === 'backup' || on.kind === 'emergency' ? '#8e6a1f'
                    : on.kind === 'off' ? 'rgba(5,7,10,0.78)'
                      : 'rgba(45,110,200,0.55)',
                color: on.kind === 'off' ? 'var(--muted)' : '#fff',
              }}>
                {on.kind === 'live' ? '\u25cf LIVE'
                  : on.kind === 'backup' ? 'BACKUP'
                    : on.kind === 'emergency' ? 'EMERGENCY'
                      : on.kind === 'off' ? 'OFF AIR' : 'ON AIR'}
              </span>
              <span style={{
                padding: '3px 8px', borderRadius: 4,
                background: 'rgba(5,7,10,0.78)', fontSize: 11,
                fontFamily: 'ui-monospace, monospace',
              }}>{clock(now)}</span>
            </div>
            {on.kind !== 'off' && (
              <span style={{
                position: 'absolute', left: 10, bottom: 10, padding: '3px 8px',
                borderRadius: 4, background: 'rgba(5,7,10,0.85)', fontSize: 11,
              }}>
                {on.kind === 'emergency' ? `Emergency \u00b7 ${nameOf(on.source)}`
                  : on.kind === 'backup'
                    ? `Backup \u00b7 ${nameOf(on.source)}`
                    : on.kind === 'live'
                    ? (on.session.segment
                      ? nameOf(on.session.segment) : 'The live studio')
                    : (on.kind === 'programme'
                      ? on.programme.title : on.entry.title) ?? nameOf(on.source)}
                {(on.kind === 'programme' || on.kind === 'rotation')
                  && ` \u00b7 until ${clock(on.untilMs)}`}
              </span>
            )}
          </div>

          {/* ---- the programme (§3, §4) --------------------------------- */}
          <div style={{
            gridArea: 'panel', position: 'relative', alignSelf: 'stretch',
            minHeight: 0,
          }}>
            <aside data-testid="programme-panel" className="shell-scroll" style={{
              position: 'absolute', inset: 0, padding: '4px 12px 8px',
              border: '1px solid var(--line)', borderRadius: 10,
              background: 'var(--panel)',
            }}>
              {/*
                * PROGRAM — NOW PLAYING / NEXT, which is the first thing a
                * control room's right-hand column says and the first thing
                * anybody walking up to it needs to know. [§6]
                */}
              <Section text="Program" aside={(
                <span className="small" data-testid="program-mode" style={{
                  fontSize: 10, fontWeight: 700,
                  color: on.kind === 'emergency' || on.kind === 'backup'
                    || on.kind === 'live' ? '#e07a6b' : '#6fa9ea',
                }}>
                  {on.kind === 'emergency' ? 'EMERGENCY'
                    : on.kind === 'backup' ? 'BACKUP'
                      : on.kind === 'live' ? 'LIVE' : 'AUTO'}
                </span>
              )} />
              <div className="panel" data-testid="now-next" style={{
                padding: 9, display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div>
                  <div className="small muted" style={{
                    fontSize: 9, letterSpacing: 0.8, fontWeight: 700,
                  }}>NOW PLAYING</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {on.kind === 'off' ? 'Nothing'
                      : on.kind === 'emergency' || on.kind === 'backup'
                        ? nameOf(on.source)
                        : on.kind === 'live'
                          ? (on.session.segment
                            ? nameOf(on.session.segment) : 'The live studio')
                          : (on.kind === 'programme'
                            ? on.programme.title : on.entry.title) ?? nameOf(on.source)}
                  </div>
                  {(on.kind === 'programme' || on.kind === 'rotation') && (
                    <div className="small muted" style={{ fontSize: 11 }}>
                      until {clock(on.untilMs)}
                    </div>
                  )}
                </div>
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: 7 }}>
                  <div className="small muted" style={{
                    fontSize: 9, letterSpacing: 0.8, fontWeight: 700,
                  }}>NEXT</div>
                  <div style={{ fontSize: 13 }}>
                    {upNext ?? '\u2014'}
                  </div>
                </div>
              </div>

              <Section text="Schedule it" />
              {!picked ? (
                <p className="small muted" style={{ fontSize: 11, margin: 0 }}>
                  Pick something from the library.
                </p>
              ) : (
                <Scheduler
                  now={now}
                  onSchedule={(startsAt, durationMs, loop) => {
                    const item = library.find(
                      (entry) => sourceKey(entry.source) === picked);
                    if (!item) return;
                    void patch({
                      action: 'schedule', source: item.source,
                      startsAt, durationMs, title: item.title, ...(loop ? { loop } : {}),
                    });
                  }}
                  onRotate={(durationMs, loop) => {
                    const item = library.find(
                      (entry) => sourceKey(entry.source) === picked);
                    if (!item) return;
                    void patch({
                      action: 'rotate', source: item.source,
                      durationMs, title: item.title, ...(loop ? { loop } : {}),
                    });
                  }}
                />
              )}

              <Section
                text="On the schedule"
                aside={(
                  <span className="small muted" style={{ fontSize: 10 }}>
                    {listing.length} slots · {assets} files
                  </span>
                )}
              />
              {programme ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {programme.title ?? nameOf(programme.source)}
                  </div>
                  <div className="small muted" style={{ fontSize: 11 }}>
                    {clock(programmeStart(programme))}
                    {' – '}
                    {clock(programmeEnd(programme))}
                    {programme.loop ? ' · loops' : ''}
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="small" data-testid="toggle-loop"
                            onClick={() => void patch({
                              action: 'move', programmeId: programme.id,
                              durationMs: programme.durationMs,
                            })}
                            style={{ display: 'none' }}>loop</button>
                    <button className="small" data-testid="unschedule"
                            onClick={() => {
                              if (!window.confirm(
                                'Take it off the schedule? The video itself is '
                                + 'untouched.')) return;
                              void patch({
                                action: 'unschedule', programmeId: programme.id,
                              });
                            }}
                            style={{ color: 'var(--bad)' }}>
                      Unschedule
                    </button>
                  </div>
                </div>
              ) : (
                <p className="small muted" style={{ fontSize: 11, margin: 0 }}>
                  Nothing scheduled yet.
                </p>
              )}

              {/* ---- the live chain (§6, §8) ----------------------------- */}
              <Section
                text={armed ? 'Armed \u2014 not on air' : onAir ? 'On air, live' : 'Live'}
                aside={armed ? (
                  <span className="small" style={{ fontSize: 10, color: '#e0c14f' }}>
                    preview
                  </span>
                ) : undefined}
              />
              {onAir ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/*
                    * "You can bring up Studio One conversations, Studio Two
                    * performances, videos, images, graphics, announcements."
                    * A reference like every other reference: while it is up it
                    * is what goes out, and the feed is underneath it.
                    */}
                  <div className="row" style={{ gap: 6 }}>
                    <button
                      className="small" data-testid="roll-in"
                      disabled={!picked}
                      title={picked
                        ? 'Put the picked item on air over the live feed'
                        : 'Pick something from the library first'}
                      onClick={() => {
                        const item = library.find(
                          (entry) => sourceKey(entry.source) === picked);
                        if (item) void patch({ action: 'roll-in', source: item.source });
                      }}
                      style={{ flex: '1 1 0' }}
                    >
                      Roll it in
                    </button>
                    <button
                      className="small" data-testid="roll-out"
                      disabled={!channel.live?.segment}
                      onClick={() => void patch({ action: 'roll-in', source: null })}
                      style={{ flex: '1 1 0' }}
                    >
                      Back to the room
                    </button>
                  </div>
                  {/*
                    * WHETHER THE PIPE IS ACTUALLY DELIVERING. A live studio
                    * that says LIVE while nothing is arriving is the worst
                    * screen in a control room, so the chunk counters are on
                    * it: what reached the channel, and what did not. [§7]
                    */}
                  <div className="row" data-testid="feed-health" style={{
                    gap: 8, fontSize: 11, padding: '5px 8px', borderRadius: 7,
                    background: 'var(--panel-2)', border: '1px solid var(--line)',
                  }}>
                    <span aria-hidden="true" style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: encoder.running && encoder.dropped === 0 ? '#4f8a5b'
                        : encoder.running ? '#e0c14f' : '#8e2f24',
                    }} />
                    <span className="grow muted">
                      {encoder.running
                        ? `Feed \u00b7 ${encoder.sent} sent`
                          + (encoder.dropped ? ` \u00b7 ${encoder.dropped} lost` : '')
                        : encoder.error ?? 'No camera'}
                    </span>
                    {encoder.running && (
                      <span className="muted" style={{
                        fontFamily: 'ui-monospace, monospace',
                      }}>{Math.round(encoder.rate / 1000)} kB/s</span>
                    )}
                  </div>

                  {/*
                    * SAVE THIS LIVE SESSION.  [§8]
                    *
                    * A decision, not an action, and it can be taken at any
                    * point: pressing it at 20:40 keeps the whole show. Off by
                    * default, which is the brief's rule — a channel that kept
                    * everything by default would be the duplication rule
                    * broken from the other end.
                    */}
                  <label className="row" data-testid="keep-live" style={{
                    gap: 7, fontSize: 12, padding: '6px 8px', borderRadius: 7,
                    border: `1px solid ${keeping ? '#c0392b' : 'var(--line)'}`,
                    background: keeping ? 'rgba(192,57,43,0.14)' : 'var(--panel-2)',
                  }}>
                    <input
                      type="checkbox" checked={keeping}
                      onChange={(event) => void patch({
                        action: 'keep-live', keep: event.target.checked,
                      })}
                    />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600 }}>Save this live session</span>
                      <span className="small muted" style={{
                        display: 'block', fontSize: 10,
                      }}>
                        {keeping
                          ? 'It becomes an archived recording when you end it.'
                          : 'Off: the live buffer is discarded after the broadcast.'}
                      </span>
                    </span>
                  </label>
                  {channel.live?.roomId ? (
                    <a className="btn small" data-testid="to-room"
                       href={`/c/${channel.live.roomId}/room`}
                       style={{ textAlign: 'center' }}>
                      Open the room
                    </a>
                  ) : (
                    <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
                      No room attached — it is a feed with nobody invited.
                    </p>
                  )}
                  <button
                    className="small" data-testid="end-live"
                    onClick={() => {
                      if (!window.confirm(
                        'End the live broadcast? The schedule resumes where the '
                        + 'clock says it should be.')) return;
                      void patch({ action: 'end-live' });
                    }}
                    style={{ borderColor: '#c0392b', color: '#e07a6b' }}
                  >
                    End live
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* The button itself is on the control bar, where a control
                      room keeps it. This says what it will do. */}
                  <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
                    GO LIVE brings the camera up and shows it to you. Nothing
                    reaches the wire until you press TAKE LIVE.
                  </p>
                  <button className="small" data-testid="request-recording"
                          title={'A channel records only what somebody asks it to '
                            + 'keep. It is the other of the two things that make a '
                            + 'new file here.'}
                          onClick={() => {
                            const label = window.prompt('What should it be called?');
                            if (!label) return;
                            void patch({
                              action: 'record', label,
                              fromAt: new Date(now).toISOString(),
                              toAt: new Date(now + HOUR).toISOString(),
                              requestedBy: 'owner',
                            });
                          }}>
                    Record the next hour
                  </button>
                </div>
              )}

              {violations.length > 0 && (
                <p className="small" data-testid="violations"
                   style={{ color: 'var(--warn)', fontSize: 11, marginTop: 8 }}>
                  {violations.join(' ')}
                </p>
              )}
              {error && (
                <p className="small" style={{ color: 'var(--bad)', fontSize: 11 }}>
                  {error}
                </p>
              )}
            </aside>
          </div>

          {/* ---- the day (§2) ------------------------------------------- */}
          <div data-testid="schedule-strip" style={{
            gridArea: 'schedule', border: '1px solid var(--line)', borderRadius: 10,
            background: 'var(--panel)', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex' }}>
              <div style={{
                width: 190, flex: '0 0 auto', borderRight: '1px solid var(--line)',
                padding: '8px 10px',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
                  FIXED TIMES
                </div>
                <div className="small muted" style={{ fontSize: 10 }}>
                  {new Date(dayStart).toLocaleDateString('en-GB', {
                    weekday: 'long', day: 'numeric', month: 'short',
                    timeZone: channel.timezone,
                  })}
                </div>
                <div className="small muted" style={{ fontSize: 10, marginTop: 4 }}>
                  {/* The number D-18 is about, where somebody will see it. */}
                  {listing.length} fixed, {channel.rotation.length} in the loop,{' '}
                  {assets} {assets === 1 ? 'file' : 'files'}
                </div>
              </div>

              <div style={{ position: 'relative', flex: 1, minWidth: 0, height: 96 }}>
                {/* Every hour, so a slot can be read without counting. */}
                {Array.from({ length: 25 }, (_unused, hour) => (
                  <div key={hour} aria-hidden="true" style={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: `${(hour / 24) * 100}%`, width: 1,
                    background: hour % 6 === 0 ? 'var(--line)' : 'rgba(255,255,255,0.05)',
                  }} />
                ))}
                {Array.from({ length: 5 }, (_unused, mark) => (
                  <span key={mark} className="small muted" style={{
                    position: 'absolute', top: 2, fontSize: 9,
                    left: `calc(${(mark * 6 / 24) * 100}% + 3px)`,
                  }}>{String(mark * 6).padStart(2, '0')}:00</span>
                ))}

                {listing.map((entry) => {
                  const start = programmeStart(entry);
                  const end = programmeEnd(entry);
                  if (end < dayStart || start > dayStart + DAY) return null;
                  const broken = missingKeys.has(sourceKey(entry.source));
                  const on = live?.id === entry.id;
                  return (
                    <button
                      key={entry.id} type="button" data-testid="schedule-block"
                      data-programme-id={entry.id}
                      onClick={() => setChosen(entry.id)}
                      title={`${entry.title ?? nameOf(entry.source)} — `
                        + `${clock(start)} to ${clock(end)}`}
                      style={{
                        position: 'absolute', top: 18, bottom: 10,
                        left: across(start),
                        width: `${((end - start) / DAY) * 100}%`,
                        minWidth: 2, padding: '4px 6px', borderRadius: 5,
                        textAlign: 'left', font: 'inherit', fontSize: 10,
                        color: 'inherit', cursor: 'pointer', overflow: 'hidden',
                        /*
                         * Red for a reference with nothing behind it. It is the
                         * one fault a listing cannot show by looking right: the
                         * slot is there, the title is there, and the hour goes
                         * out black.
                         */
                        background: broken ? 'rgba(200,60,50,0.28)'
                          : on ? 'rgba(45,110,200,0.40)' : 'rgba(45,110,200,0.18)',
                        border: `1px solid ${broken ? '#c0392b'
                          : on ? '#6fa9ea' : 'var(--line)'}`,
                      }}
                    >
                      <span style={{
                        display: 'block', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontWeight: 600,
                      }}>{entry.title ?? nameOf(entry.source)}</span>
                      <span className="muted" style={{ fontSize: 9 }}>
                        {clock(start)}{broken ? ' · missing' : ''}
                      </span>
                    </button>
                  );
                })}

                {/* Where the clock is. The one line on this page that moves. */}
                {now >= dayStart && now <= dayStart + DAY && (
                  <div aria-hidden="true" data-testid="playhead" style={{
                    position: 'absolute', top: 0, bottom: 0, width: 2,
                    left: across(now), background: '#e0674f',
                    pointerEvents: 'none',
                  }} />
                )}
              </div>
            </div>
          </div>

          {/* ---- the loop (§4) ------------------------------------------ */}
          {/*
            * THE BRIEF'S LISTING, with the column it is written in:
            *
            *     00:00  Music Video — Everlasting Love
            *     04:17  History Discussion
            *     28:42  Music Video — Performance 2
            *
            * Those are offsets into one turn, not times of day, and they are
            * derived from the durations — which is why moving an entry moves
            * everything after it and nobody edits a number. [§4]
            */}
          <div data-testid="rotation-strip" style={{
            gridArea: 'loop', border: '1px solid var(--line)', borderRadius: 10,
            background: 'var(--panel)', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex' }}>
              <div style={{
                width: 190, flex: '0 0 auto', borderRight: '1px solid var(--line)',
                padding: '8px 10px',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
                  THE LOOP
                </div>
                <div className="small muted" style={{ fontSize: 10 }}>
                  {turn > 0
                    ? `${offsetLabel(turn)} round, then again`
                    : 'Empty — the channel is off between programmes'}
                </div>
              </div>
              <div className="shell-scroll" style={{
                flex: 1, minWidth: 0, maxHeight: 156, padding: 6,
              }}>
                {channel.rotation.length === 0 ? (
                  <p className="small muted" style={{ margin: 4, fontSize: 11 }}>
                    Put something in the loop and the channel is never off air.
                  </p>
                ) : channel.rotation.map((entry, index) => {
                  const playing = on.kind === 'rotation' && on.entry.id === entry.id;
                  return (
                    <div
                      key={entry.id} data-testid="rotation-entry"
                      data-entry-id={entry.id} data-playing={playing ? 'true' : 'false'}
                      style={{
                        display: 'flex', gap: 9, alignItems: 'center',
                        padding: '3px 6px', borderRadius: 5, fontSize: 11,
                        background: playing ? 'rgba(45,110,200,0.22)' : 'transparent',
                      }}
                    >
                      <span className="muted" style={{
                        fontFamily: 'ui-monospace, monospace', flex: '0 0 auto',
                        width: 52,
                      }}>{offsetLabel(offsets[index] ?? 0)}</span>
                      <span style={{
                        flex: 1, minWidth: 0, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontWeight: playing ? 700 : 500,
                      }}>{entry.title ?? nameOf(entry.source)}</span>
                      <span className="muted" style={{ flex: '0 0 auto', fontSize: 10 }}>
                        {offsetLabel(entry.durationMs)}
                      </span>
                      <button
                        className="small" data-testid="rotation-up"
                        disabled={index === 0}
                        title="Earlier in the loop"
                        onClick={() => void patch({
                          action: 'move-in-rotation', entryId: entry.id,
                          position: index - 1,
                        })}
                        style={{ border: 0, background: 'none', padding: '0 4px' }}
                      >&#8593;</button>
                      <button
                        className="small" data-testid="rotation-out"
                        title="Take it out of the loop. The video is untouched."
                        onClick={() => void patch({
                          action: 'unrotate', entryId: entry.id,
                        })}
                        style={{
                          border: 0, background: 'none', padding: '0 4px',
                          color: 'var(--bad)',
                        }}
                      >&times;</button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ---- the control bar (§6) ----------------------------------- */}
          {/*
            * [▶ PLAY] [● GO LIVE] [TAKE LIVE] [NEXT] [EMERGENCY]
            *
            * A control room's bottom rail, and the order matters: what the
            * channel is doing on the left, the live chain in the middle, and
            * the button you hit when something has gone wrong at the far
            * right where nothing else is — because the one thing worse than
            * needing it is pressing it by accident.
            */}
          <div data-testid="channel-transport" style={{
            gridArea: 'transport', display: 'grid', alignItems: 'center', gap: 12,
            gridTemplateColumns: 'minmax(0, 1fr) auto auto',
            border: '1px solid var(--line)', borderRadius: 10,
            background: 'var(--panel)', padding: '10px 14px',
          }}>
            <div className="row" style={{ gap: 10, minWidth: 0 }}>
              <span style={{
                fontFamily: 'ui-monospace, monospace', fontSize: 14, fontWeight: 700,
              }}>{clock(now)}</span>
              <span className="small muted" style={{
                fontSize: 11, minWidth: 0, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {/*
                  * WHICH MODE, in words, because the two modes are the point:
                  * PROGRAM is the channel running itself and LIVE is somebody
                  * having taken control. [§6]
                  */}
                {on.kind === 'emergency' ? 'EMERGENCY \u2014 cut away'
                  : on.kind === 'backup' ? 'BACKUP \u2014 the feed failed'
                    : on.kind === 'live' ? 'LIVE \u2014 you have the channel'
                      : 'PROGRAM \u2014 the channel is running itself'}
              </span>
            </div>

            <div className="row" data-testid="control-bar" style={{ gap: 6 }}>
              {/* PLAY is where the loop is, because in PROGRAM there is
                  nothing to start — the channel is already running. It jumps
                  the studio's clock back to live instead. */}
              <button className="small" data-testid="next-item"
                      disabled={channel.rotation.length === 0}
                      title="Cut to the next item in the loop now"
                      onClick={() => void patch({ action: 'next' })}>
                NEXT &#9654;&#9654;
              </button>
              {!onAir ? (
                <button
                  className="primary" data-testid="go-live"
                  title={'Brings the camera up and shows it to you. Nothing '
                    + 'reaches the wire until you press TAKE LIVE — the '
                    + 'programme keeps playing until then.'}
                  onClick={() => {
                    const label = window.prompt('What is the live show called?', 'Live');
                    if (!label) return;
                    const roomId = window.prompt(
                      'Which conversation\u2019s room are the people in? '
                      + '(blank for a feed with nobody)', '') || undefined;
                    void patch({ action: 'go-live', label, roomId });
                  }}
                  style={{ background: '#8e2f24', borderColor: '#8e2f24' }}
                >
                  &#9679; GO LIVE
                </button>
              ) : armed ? (
                <button
                  className="primary" data-testid="take-live"
                  title="Cut the live feed to air"
                  onClick={() => void patch({ action: 'take-live' })}
                  style={{ background: '#c0392b', borderColor: '#c0392b' }}
                >
                  TAKE LIVE
                </button>
              ) : (
                <button
                  className="small" data-testid="end-live"
                  title={'Return to program. The schedule resumes where the clock '
                    + 'says, and the viewer sees one continuous channel.'}
                  onClick={() => {
                    if (!window.confirm(keeping
                      ? 'End the broadcast? It will be saved as a recording.'
                      : 'End the broadcast? It is NOT being saved, so the live '
                        + 'buffer is discarded.')) return;
                    void patch({ action: 'end-live' });
                  }}
                  style={{ borderColor: '#c0392b', color: '#e07a6b' }}
                >
                  TAKE PROGRAM
                </button>
              )}
            </div>

            <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
              <span className="small muted" data-testid="asset-count" style={{
                fontSize: 11,
              }}>
                {/*
                  * THE CLAIM, ON SCREEN. Everything scheduled — the loop and
                  * the fixed slots together — against the number of files
                  * behind it.
                  */}
                {channel.rotation.length + listing.length} scheduled ·{' '}
                {assets} {assets === 1 ? 'file' : 'files'}
              </span>
              {/*
                * THE SAFE PLAYLIST, so the automatic failover has somewhere
                * to go. Without one a lost feed falls through to the loop,
                * which is already something — but a channel that has said
                * what it shows when things go wrong is a channel that has
                * thought about it. [§9]
                */}
              <button
                className="small" data-testid="set-backup"
                disabled={!picked && !channel.backup}
                title={channel.backup
                  ? `Backup: ${nameOf(channel.backup)} — click to clear`
                  : 'Set the picked item as the safe playlist'}
                onClick={() => {
                  if (channel.backup) { void patch({ action: 'backup', source: null }); return; }
                  const item = library.find(
                    (entry) => sourceKey(entry.source) === picked);
                  if (item) void patch({ action: 'backup', source: item.source });
                }}
                style={channel.backup
                  ? { borderColor: '#8e6a1f', color: '#e0c14f' } : {}}
              >
                {channel.backup ? 'BACKUP SET' : 'SET BACKUP'}
              </button>
              <button
                className="small" data-testid="emergency"
                title={emergency
                  ? 'Cut back to whatever the channel would be showing'
                  : 'Cut away immediately. Beats live.'}
                disabled={!emergency && !picked}
                onClick={() => {
                  if (emergency) { void patch({ action: 'emergency', source: null }); return; }
                  const item = library.find(
                    (entry) => sourceKey(entry.source) === picked);
                  if (!item) return;
                  if (!window.confirm(
                    `Cut away to "${item.title}" now? This interrupts whatever is `
                    + 'on air, including a live broadcast.')) return;
                  void patch({ action: 'emergency', source: item.source });
                }}
                style={emergency
                  ? { background: '#c0392b', borderColor: '#c0392b', color: '#fff' }
                  : { borderColor: '#8e2f24', color: '#e07a6b' }}
              >
                {emergency ? 'CLEAR EMERGENCY' : 'EMERGENCY'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

/** `04:17` — the brief's column. Hours only once there are any. */
function offsetLabel(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

function Section({ text, aside }: { text: string; aside?: React.ReactNode }) {
  return (
    <div className="row" style={{
      alignItems: 'baseline', justifyContent: 'space-between', margin: '9px 0 5px',
    }}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{text}</span>
      {aside}
    </div>
  );
}

/**
 * When, and for how long.
 *
 * The time is offered rather than typed: a scheduler works in the next slot,
 * the top of the next hour, or tomorrow at the same time, and a text field
 * asking for an ISO instant is a text field somebody gets a zone wrong in.
 */
function Scheduler({
  now, onSchedule, onRotate,
}: {
  now: number;
  onSchedule: (startsAt: string, durationMs: number, loop: boolean) => void;
  onRotate: (durationMs: number, loop: boolean) => void;
}) {
  const [minutes, setMinutes] = useState(60);
  const [loop, setLoop] = useState(false);
  const topOfHour = Math.ceil(now / HOUR) * HOUR;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
        {SLOTS.map((option) => (
          <button
            key={option} type="button" data-testid="slot-length"
            data-minutes={option}
            data-chosen={minutes === option ? 'true' : 'false'}
            onClick={() => setMinutes(option)}
            style={{
              padding: '6px 4px', fontSize: 11, borderRadius: 7,
              border: `1px solid ${minutes === option ? '#3d7fd6' : 'var(--line)'}`,
              background: minutes === option
                ? 'rgba(45,110,200,0.22)' : 'var(--panel-2)',
            }}
          >{option} min</button>
        ))}
      </div>
      <label className="row small muted" style={{ gap: 6, fontSize: 11 }}>
        <input type="checkbox" data-testid="loop-it" checked={loop}
               onChange={(event) => setLoop(event.target.checked)} />
        Play it again until the slot is over
      </label>
      {/*
        * TWO WAYS ON, and the loop is the first because it is the one that
        * keeps the channel online. Adding to the loop asks for no time at
        * all: the entry's place is the sum of what comes before it, and the
        * channel plays round and round forever. A fixed time is the second,
        * for the thing that has to be at nine. [§2, §4]
        */}
      <button className="primary small" data-testid="add-to-loop"
              onClick={() => onRotate(minutes * MINUTE, loop)}
              style={{ width: '100%' }}>
        Add to the loop
      </button>
      <div className="row" style={{ gap: 5 }}>
        <button className="small" data-testid="schedule-next-hour"
                onClick={() => onSchedule(
                  new Date(topOfHour).toISOString(), minutes * MINUTE, loop)}
                style={{ flex: '1 1 0' }}>
          At {new Date(topOfHour).toLocaleTimeString('en-GB', {
            hour: '2-digit', minute: '2-digit',
          })}
        </button>
        <button className="small" data-testid="schedule-tomorrow"
                onClick={() => onSchedule(
                  new Date(topOfHour + DAY).toISOString(), minutes * MINUTE, loop)}
                style={{ flex: '1 1 0' }}>
          Tomorrow
        </button>
      </div>
    </div>
  );
}

/**
 * The confidence monitor.  [§7]
 *
 * The referenced media, seeked to where the schedule says the channel is, and
 * nudged back whenever it drifts more than a second from it. The wall clock
 * is the reference and the video follows — exactly the relationship Studio
 * Two's player has with the song, and for the same reason: a video element's
 * clock is a suggestion.
 *
 * It is handed `OnAir` rather than a programme, so it does not have to know
 * whether what it is showing came from the loop, a fixed slot or the red
 * button. One function decides that, and this draws whatever it said.
 */
function Monitor({ on, channel }: { on: OnAir; channel: Channel }) {
  if (on.kind === 'off') return null;
  const source = on.source;

  if (source.kind === 'live') {
    const ingest = channel.ingests.find((entry) => entry.id === source.ingestId);
    return (
      <div className="small muted" style={{
        position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
        textAlign: 'center', padding: 20,
      }}>
        {ingest?.label ?? 'The live studio'}
        <br />
        {/* Honest: the feed's encoder writes to the channel's asset, and a
            monitor of a feed that has not started is a monitor of nothing. */}
        <span style={{ fontSize: 11 }}>
          {on.kind === 'live' && on.session.roomId
            ? 'Coming out of the room' : 'Waiting for the feed'}
        </span>
      </div>
    );
  }

  if (source.kind === 'live_event') {
    /* A booked slot with nobody live: the loop is what actually goes out, so
       the monitor says what the schedule promised and what happened. */
    return (
      <div className="small muted" style={{
        position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
        textAlign: 'center', padding: 20,
      }}>
        {source.note ?? 'Live event'}
        <br />
        <span style={{ fontSize: 11 }}>Nobody is live \u2014 the loop is on air</span>
      </div>
    );
  }
  const url = source.kind === 'media'
    ? `/api/library/${source.assetId}`
    : `/api/${source.document === 'performance' ? 'performances' : 'conversations'}`
      + `/${source.documentId}/renders/${source.planHash}/file`;

  if (source.kind === 'media' && source.form === 'image') {
    return (
      <img alt="" src={url} data-testid="monitor-still"
           style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    );
  }

  return (
    <video
      data-testid="monitor-video" src={url} autoPlay muted playsInline
      ref={(element) => {
        if (!element) return;
        const want = on.fromMs / 1000;
        if (Number.isFinite(element.duration) && element.duration > 0) {
          const target = want % element.duration;
          if (Math.abs(element.currentTime - target) > 1) element.currentTime = target;
        }
      }}
      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
    />
  );
}
