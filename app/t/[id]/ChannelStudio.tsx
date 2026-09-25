'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Channel, Programme, ProgrammeSource } from '../../../src/domain/channel.js';
import {
  nextAfter, onAirAt, orderedProgrammes, programmeEnd, programmeStart,
  referencedAssets, sourceKey,
} from '../../../src/domain/channel.js';
import StudioBar from '../../StudioBar.js';

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
  source: ProgrammeSource & { kind: 'render' };
  title: string;
  document: 'conversation' | 'performance';
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

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/channels/${id}`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    setChannel(data.channel);
    setMissing(data.missing ?? []);
    setViolations(data.violations ?? []);
  }, [id]);

  useEffect(() => { void refresh(); }, [refresh]);

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
  const live = onAirAt(channel, now);
  const coming = nextAfter(channel, now);
  const programme = listing.find((entry) => entry.id === chosen) ?? live ?? listing[0];
  const assets = referencedAssets(channel).length;
  const missingKeys = new Set(missing.map(sourceKey));

  /** A label for a reference, from the library if it is still there. */
  const nameOf = useCallback((source: ProgrammeSource): string => {
    if (source.kind === 'live') {
      return channel.ingests.find((ingest) => ingest.id === source.ingestId)?.label
        ?? 'a live feed';
    }
    return library.find((item) => sourceKey(item.source) === sourceKey(source))?.title
      ?? `${source.document} ${source.documentId.slice(0, 12)}`;
  }, [channel.ingests, library]);

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
          gridTemplateAreas: '"library monitor panel" "schedule schedule schedule" '
            + '"transport transport transport"',
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
                      }}>{item.document === 'performance' ? 'S2' : 'S1'}</span>
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
            data-on-air={live ? 'true' : 'false'}
            style={{
              gridArea: 'monitor', position: 'relative', aspectRatio: '16 / 9',
              background: '#05070a', borderRadius: 10,
              border: '1px solid var(--line)', overflow: 'hidden',
            }}
          >
            {live ? (
              <Monitor channel={channel} programme={live} now={now} />
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
              <span data-testid="on-air-lamp" style={{
                padding: '3px 9px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                background: live ? '#c0392b' : 'rgba(5,7,10,0.78)',
                color: live ? '#fff' : 'var(--muted)',
              }}>
                {live ? 'ON AIR' : 'OFF AIR'}
              </span>
              <span style={{
                padding: '3px 8px', borderRadius: 4,
                background: 'rgba(5,7,10,0.78)', fontSize: 11,
                fontFamily: 'ui-monospace, monospace',
              }}>{clock(now)}</span>
            </div>
            {live && (
              <span style={{
                position: 'absolute', left: 10, bottom: 10, padding: '3px 8px',
                borderRadius: 4, background: 'rgba(5,7,10,0.85)', fontSize: 11,
              }}>
                {live.title ?? nameOf(live.source)}
                {' · until '}{clock(programmeEnd(live))}
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

              {/* ---- the two that make media (§5, §6) -------------------- */}
              <Section text="Live and recordings" />
              <div className="row" style={{ gap: 6 }}>
                {channel.ingests.some((ingest) => !ingest.closedAt) ? (
                  <button className="small" data-testid="close-ingest"
                          onClick={() => void patch({
                            action: 'close-ingest',
                            ingestId: channel.ingests.find((i) => !i.closedAt)!.id,
                          })}>
                    Stop the live feed
                  </button>
                ) : (
                  <button className="small" data-testid="open-ingest"
                          title={'A live feed is one of only two things that makes a '
                            + 'new file here. Everything else points at what exists.'}
                          onClick={() => {
                            const label = window.prompt('What is the feed?', 'Live');
                            if (label) void patch({ action: 'open-ingest', label });
                          }}>
                    Go live
                  </button>
                )}
                <button className="small" data-testid="request-recording"
                        title={'The other one. A channel records only what somebody '
                          + 'asks it to keep.'}
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
                  THE DAY
                </div>
                <div className="small muted" style={{ fontSize: 10 }}>
                  {new Date(dayStart).toLocaleDateString('en-GB', {
                    weekday: 'long', day: 'numeric', month: 'short',
                    timeZone: channel.timezone,
                  })}
                </div>
                <div className="small muted" style={{ fontSize: 10, marginTop: 4 }}>
                  {/* The number D-18 is about, where somebody will see it. */}
                  {listing.length} programmes, {assets} files
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

          {/* ---- the transport (§7) ------------------------------------- */}
          <div data-testid="channel-transport" style={{
            gridArea: 'transport', display: 'grid', alignItems: 'center', gap: 12,
            gridTemplateColumns: '1fr auto 1fr',
            border: '1px solid var(--line)', borderRadius: 10,
            background: 'var(--panel)', padding: '10px 14px',
          }}>
            <div className="row" style={{ gap: 10, minWidth: 0 }}>
              <span style={{
                fontFamily: 'ui-monospace, monospace', fontSize: 14, fontWeight: 700,
              }}>{clock(now)}</span>
              <span className="small muted" style={{ fontSize: 11 }}>
                {live
                  ? `${live.title ?? nameOf(live.source)} until ${clock(programmeEnd(live))}`
                  : coming ? `Next: ${coming.title ?? nameOf(coming.source)} `
                    + `at ${clock(programmeStart(coming))}`
                    : 'Nothing scheduled'}
              </span>
            </div>

            {/*
              * THE TRANSMISSION, which is not what the monitor is showing.
              * Printed rather than played: a live HLS stream needs a player
              * library in every browser but Safari, and a studio that pretended
              * its monitor was the transmission would be the one place in this
              * product where what you see is not what goes out.
              */}
            <div className="row" style={{ gap: 6, justifyContent: 'center' }}>
              <span className="small muted" style={{ fontSize: 11 }}>Transmission</span>
              <code className="small" data-testid="playlist-url" style={{
                fontSize: 11, padding: '4px 8px', borderRadius: 6,
                background: 'var(--panel-2)', border: '1px solid var(--line)',
              }}>{`/api/channels/${id}/playlist`}</code>
              <button className="small" data-testid="copy-playlist"
                      onClick={() => void navigator.clipboard?.writeText(
                        `${window.location.origin}/api/channels/${id}/playlist`)}
                      style={{ padding: '4px 9px' }}>Copy</button>
            </div>

            <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
              <span className="small muted" data-testid="asset-count" style={{
                fontSize: 11,
              }}>
                {/* The claim, on screen, where it is checked by looking. */}
                {listing.length} programmes · {assets} {assets === 1 ? 'file' : 'files'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

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
  now, onSchedule,
}: {
  now: number;
  onSchedule: (startsAt: string, durationMs: number, loop: boolean) => void;
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
      <div className="row" style={{ gap: 5 }}>
        <button className="primary small" data-testid="schedule-next-hour"
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
 */
function Monitor({
  channel, programme, now,
}: {
  channel: Channel; programme: Programme; now: number;
}) {
  const source = programme.source;
  const url = source.kind === 'render'
    ? `/api/${source.document === 'performance' ? 'performances' : 'conversations'}`
      + `/${source.documentId}/renders/${source.planHash}/file`
    : undefined;

  /** Where in the media this instant is, by the same arithmetic the engine uses. */
  const intoSlot = now - programmeStart(programme);
  const from = (programme.fromMs ?? 0) / 1000;

  return url ? (
    <video
      data-testid="monitor-video" src={url} autoPlay muted playsInline
      ref={(element) => {
        if (!element) return;
        const want = from + (intoSlot / 1000);
        if (Number.isFinite(element.duration) && element.duration > 0) {
          const target = programme.loop ? want % element.duration : want;
          if (Math.abs(element.currentTime - target) > 1) element.currentTime = target;
        }
      }}
      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
    />
  ) : (
    <div className="small muted" style={{
      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
    }}>
      {channel.ingests.find((ingest) => ingest.id === (source as { ingestId: string })
        .ingestId)?.label ?? 'A live feed'} — arriving
    </div>
  );
}
