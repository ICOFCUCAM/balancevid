'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Channel, ChannelBlock, OnAir, Programme, ProgrammeSource, RotationEntry,
} from '../../../src/domain/channel.js';
import {
  blockAt, nextAfter, onAirAt, orderedBlocks, orderedProgrammes, programmeEnd,
  programmeStart, referencedAssets, rotationLengthMs, rotationOffsets,
  sourceKey, whatIsOn,
} from '../../../src/domain/channel.js';
import { SPACES } from '../../../src/domain/performance.js';
import { SPACE_LOOKS } from '../../../src/domain/environment.js';
import { PLATFORMS } from '../../../src/domain/distribution.js';
import StudioBar from '../../StudioBar.js';
import { useLiveEncoder } from './useLiveEncoder.js';
import { useBroadcastGuests } from './useBroadcastGuests.js';
import { arrangementFor, useBroadcastMixer } from './useBroadcastMixer.js';
import { useFeedLevels } from './useFeedLevels.js';

/**
 * The control room.  [Doctrine CHANNEL §1–§9, §15, D-18, D-19, INV-17]
 *
 *   ┌──────────┬───────────────────────────────┬──────────────┐
 *   │ PLAYLIST │  PROGRAM OUTPUT   │ PREVIEW   │  LIVE STUDIO │
 *   │ LIBRARY  │                   ├───────────┤  Camera      │
 *   │ SCHEDULES│                   │ MULTI-VIEW│  Guests      │
 *   │          ├───────────────────────────────┤  Screens     │
 *   │          │  24/7 SCHEDULE — timeline     │  Graphics    │
 *   └──────────┴───────────────────────────────┴──────────────┘
 *   ● 00:15:32 ▮▮▯  ■ ▶ ▶|  TAKE LIVE  ⚠ EMERGENCY  ▮▮▯  OUTPUT
 *
 * The benchmark's shape, and the reason it is that shape: a control room is
 * read left to right as WHAT THERE IS → WHAT IS GOING OUT → WHO IS ON IT,
 * with the irreversible buttons along the bottom where a hand rests and
 * nothing else can be hit by accident.
 *
 * NOTHING HERE IS NEW MACHINERY. [D-19] Every region is a picture of
 * something that already exists and was already tested without a screen:
 *
 *   Playlist            the rotation, and `rotationOffsets` for its column
 *   Library             `/api/channels/library` — references, never copies
 *   Schedules           `programmes` and `blocks`
 *   Program Output      `whatIsOn`, the one function the engine also calls
 *   Preview (Next)      `nextAfter` and the turn of the loop after this one
 *   Multi-view          the camera, the Room's staged guests, the schedule
 *   24/7 Schedule       `whatIsOn` walked forward across the window
 *   Camera / Guests     `useBroadcastGuests` over the Room's own presence
 *   Virtual Set         `SPACES` and `SPACE_LOOKS`, Studio Two's own table
 *   Graphics            `identity` — drawn at the broadcast layer, never burnt
 *   Audio               `useFeedLevels` over the Room's `measureVoice`
 *   Transport           `take-live`, `next`, `emergency`, `end-live`
 *   Stream Output       `destinations`
 *
 * THE MONITOR IS NOT THE STREAM, and says so. Playing the actual broadcast
 * would need an HLS player, and every browser but Safari needs a library for
 * that; what this shows instead is the referenced media, seeked to where the
 * schedule says the channel is and kept there by the wall clock. That is what
 * a playout monitor is — the desk's confidence check, not the transmission —
 * and the transmission's URL is on VIEW CHANNEL for a player that wants it.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The slot lengths a scheduler reaches for, in minutes. */
const SLOTS = [5, 15, 30, 60, 90, 120];

/**
 * How much of the day the timeline shows at once.
 *
 * Two and a half hours, the benchmark's window, and it is the right one: a
 * whole day compressed into a strip makes a five-minute ident two pixels
 * wide, and the thing an operator actually needs to see is the join between
 * what is on now and what follows it.
 */
const WINDOW_MS = 2.5 * HOUR;
const STEP_MS = 30 * MINUTE;
/** How far back the window starts, so what is on now has visible history. */
const BEHIND_MS = 15 * MINUTE;

type RailTab = 'playlist' | 'library' | 'schedules';
type DeskTab = 'camera' | 'guests' | 'screens' | 'graphics' | 'audio';
type ScheduleView = 'timeline' | 'list' | 'calendar';

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

/** A stretch of the timeline: one thing, on air, from here to there. */
interface Segment {
  fromMs: number;
  toMs: number;
  on: OnAir;
  title: string;
}

/* ------------------------------------------------------------------------ */

export default function ChannelStudio({
  initial, studioOneId, studioTwoId, serverNow,
}: {
  initial: Channel;
  studioOneId?: string;
  studioTwoId?: string;
  /** When the server drew this page. See the note where it is passed. */
  serverNow?: number;
}) {
  const [channel, setChannel] = useState(initial);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<ProgrammeSource[]>([]);
  const [violations, setViolations] = useState<string[]>([]);

  /* ---- which face of each container is showing ------------------------ */
  const [railTab, setRailTab] = useState<RailTab>('playlist');
  const [deskTab, setDeskTab] = useState<DeskTab>('camera');
  const [view, setView] = useState<ScheduleView>('timeline');
  const [filter, setFilter] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [mixerOpen, setMixerOpen] = useState(false);
  /**
   * Where the timeline is looking. `null` is the benchmark's AUTO-PLAY: the
   * window follows the clock. Pinning it is how an operator looks at tonight
   * without the strip sliding out from under them.
   */
  const [pinned, setPinned] = useState<number | null>(null);

  /**
   * The wall clock, ticking.
   *
   * A channel is the one document in this product whose state changes when
   * nobody touches it, so the page has to move on its own. Once a second: the
   * listing moves in minutes and the monitor is steered by the video element,
   * so sixty redraws a second would buy nothing and cost the frame budget.
   */
  const [now, setNow] = useState(() => serverNow ?? Date.now());
  useEffect(() => {
    /*
     * Straight to the browser's own clock once, so a page served from a
     * cache or a slow connection is not a second behind for a second, and
     * then once a second after that.
     */
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const id = channel.id;

  /**
   * THE CAMERA, THE ROOM, THE MIX, THE PIPE — in that order.
   *
   * The operator's own camera is opened once here; the room's staged guests
   * arrive through the Room's own mesh; the mixer draws them into one picture
   * using the same layout table the renderer uses; and the encoder pushes
   * that one stream. Each of the four knows nothing about the others but the
   * stream it is handed. Held at the top of the studio rather than inside the
   * live panel, because a component that unmounts takes the camera with it —
   * and the panel re-renders on every tick of the clock. [§6, ROOM, U-18]
   */
  const [camera, setCamera] = useState<MediaStream | null>(null);
  const [arrangement, setArrangement] = useState<string | undefined>(undefined);
  const liveNow = channel.live && channel.live.phase !== 'ended';
  const guests = useBroadcastGuests({
    roomId: channel.live?.roomId,
    localStream: camera,
    enabled: Boolean(liveNow),
  });
  const mixer = useBroadcastMixer({
    sources: guests.sources,
    layoutId: arrangement,
    enabled: Boolean(liveNow) && guests.sources.length > 0,
  });
  const encoder = useLiveEncoder(id, mixer.stream);

  /* The meters. Every microphone on the desk, and the mix they add up to. */
  const metered = useMemo(() => {
    const entries = guests.sources.map(
      (person) => ({ id: person.id, stream: person.stream }));
    if (mixer.stream) entries.push({ id: 'master', stream: mixer.stream });
    return entries;
  }, [guests.sources, mixer.stream]);
  const levels = useFeedLevels(metered, Boolean(liveNow));

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
    let cancelled = false;
    if (phase === 'armed' || phase === 'on_air') {
      if (!camera) {
        void navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        }).then((media) => { if (!cancelled) setCamera(media); })
          .catch(() => setError('the camera could not be opened'));
      }
    } else {
      for (const track of camera?.getTracks() ?? []) track.stop();
      if (camera) setCamera(null);
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* The pipe follows the mix, which follows the session. */
  useEffect(() => {
    if ((phase === 'armed' || phase === 'on_air') && mixer.stream && !encoder.running) {
      void encoder.start();
    }
    if (phase === undefined || phase === 'ended') encoder.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mixer.stream]);

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

  /* ---- what the clock says -------------------------------------------- */
  const listing = orderedProgrammes(channel);
  /*
   * WHAT IS ACTUALLY ON, by the same function the playout engine uses:
   * emergency, then backup, then live, then a fixed slot, then a day-part,
   * then the loop. Computed here from the ticking clock rather than read from
   * the server, so the studio and the wire agree without a round trip every
   * second. [§4, §5]
   */
  const on: OnAir = whatIsOn(channel, now);
  /** Armed, on air, or neither. The two modes and the step between. [§6] */
  const session = channel.live && channel.live.phase !== 'ended'
    ? channel.live : undefined;
  const onAir = Boolean(session);
  const armed = session?.phase === 'armed';
  const emergency = Boolean(channel.emergency);
  /** Whether a stranger with the link can watch this. [§17] */
  const published = Boolean(
    channel.publication && !channel.publication.unpublishedAt);
  const keeping = Boolean(
    channel.ingests.find((ingest) => ingest.id === session?.ingestId)?.keep);
  const turn = rotationLengthMs(channel);
  const offsets = rotationOffsets(channel);
  const live = onAirAt(channel, now);
  const coming = nextAfter(channel, now);
  const programme = listing.find((entry) => entry.id === chosen) ?? live ?? listing[0];
  const assets = referencedAssets(channel).length;
  const missingKeys = useMemo(
    () => new Set(missing.map(sourceKey)), [missing]);
  const pickedItem = library.find(
    (entry) => sourceKey(entry.source) === picked) ?? null;

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
    if (source.kind === 'live_event') return source.note ?? 'LIVE — booked';
    return `${source.document} ${source.documentId.slice(0, 12)}`;
  }, [channel.ingests, library]);

  const titleOf = useCallback((state: OnAir): string => {
    switch (state.kind) {
      case 'off': return 'Off air';
      case 'emergency': case 'backup': return nameOf(state.source);
      case 'live':
        return state.session.segment
          ? nameOf(state.session.segment) : 'The live studio';
      case 'programme':
        return state.programme.title ?? nameOf(state.source);
      case 'rotation':
        return state.entry.title ?? nameOf(state.source);
    }
  }, [nameOf]);

  /**
   * WHAT IS NEXT, which in a channel with a loop is rarely the next fixed
   * slot. It is whichever comes sooner: the programme that pre-empts, or the
   * turn of the rotation that follows this one. [§4, §6]
   */
  const upNext: { title: string; source: ProgrammeSource } | null = (() => {
    const soonest = coming ? programmeStart(coming) : Infinity;
    if (on.kind === 'rotation' && channel.rotation.length > 0) {
      const index = channel.rotation.findIndex((entry) => entry.id === on.entry.id);
      const after = channel.rotation[(index + 1) % channel.rotation.length]!;
      if (on.untilMs <= soonest) {
        return { title: after.title ?? nameOf(after.source), source: after.source };
      }
    }
    if (!coming) return null;
    return {
      title: coming.title ?? nameOf(coming.source), source: coming.source,
    };
  })();

  /**
   * HOW LONG THE RED LIGHT HAS BEEN ON, which is the number the benchmark
   * puts in three places and the only number a gallery ever reads aloud.
   * While live it is time since TAKE; otherwise it is time into whatever the
   * schedule has on, because a channel is always some way into something.
   */
  const elapsedMs = session?.takenAt
    ? Math.max(0, now - Date.parse(session.takenAt))
    : on.kind === 'off' ? 0 : on.fromMs;
  /** How far into the thing on air the channel is. */
  const intoMs = on.kind === 'off' ? 0 : on.fromMs;
  /** How long this thing runs for in total, where that is knowable. */
  const totalMs = (on.kind === 'programme' || on.kind === 'rotation')
    ? on.fromMs + (on.untilMs - now) : 0;

  const clock = useCallback((at: number) => new Date(at).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: channel.timezone,
  }), [channel.timezone]);

  /*
   * The origin, for the shareable link, and only once mounted: rendering
   * `window.location` on the server is rendering something the server does
   * not have, and guessing it is how a link goes out naming localhost.
   */
  const [origin, setOrigin] = useState('');
  useEffect(() => { setOrigin(window.location.origin); }, []);

  /* ---- the timeline's window ------------------------------------------ */
  const windowNow = pinned ?? now;
  const windowFrom = Math.floor((windowNow - BEHIND_MS) / STEP_MS) * STEP_MS;
  const windowTo = windowFrom + WINDOW_MS;
  const across = (at: number) =>
    `${((Math.min(windowTo, Math.max(windowFrom, at)) - windowFrom) / WINDOW_MS) * 100}%`;

  /**
   * WHAT THE CHANNEL WILL ACTUALLY SHOW, hour by hour.
   *
   * Walked rather than laid out: at each instant the same `whatIsOn` the
   * playout engine calls is asked what is on, and the answer's own end is
   * where the next question is asked. A lane drawn from the programme list
   * alone would be a lane that lies about every gap the loop fills — and the
   * gaps are most of a channel's day. [§4, §5]
   */
  const segments: Segment[] = useMemo(() => {
    const out: Segment[] = [];
    let at = windowFrom;
    for (let guard = 0; guard < 240 && at < windowTo; guard += 1) {
      const state = whatIsOn(channel, at);
      const ends = (state.kind === 'programme' || state.kind === 'rotation')
        ? state.untilMs : at + 5 * MINUTE;
      const toMs = Math.min(windowTo, Math.max(ends, at + MINUTE));
      out.push({ fromMs: at, toMs, on: state, title: titleOf(state) });
      at = toMs;
    }
    return out;
  }, [channel, windowFrom, windowTo, titleOf]);

  const railRows = useMemo(() => {
    const needle = (filter ?? '').trim().toLowerCase();
    const keep = (text: string) =>
      needle === '' || text.toLowerCase().includes(needle);
    return { keep, needle };
  }, [filter]);

  /* ---------------------------------------------------------------- */

  const goLive = () => {
    const label = window.prompt('What is the live show called?', 'Live');
    if (!label) return;
    const roomId = window.prompt(
      'Which conversation’s room are the people in? '
      + '(blank for a feed with nobody)', '') || undefined;
    void patch({ action: 'go-live', label, roomId });
  };
  const endLive = () => {
    if (!window.confirm(keeping
      ? 'End the broadcast? It will be saved as a recording.'
      : 'End the broadcast? It is NOT being saved, so the live buffer is '
        + 'discarded.')) return;
    void patch({ action: 'end-live' });
  };

  return (
    <div className="shell">
      <StudioBar
        current="online-tv"
        studioOneId={studioOneId}
        studioTwoId={studioTwoId}
        lamp={(
          <span className="row" data-testid="bar-on-air" data-mode={on.kind} style={{
            gap: 7, padding: '4px 10px', borderRadius: 5, flex: '0 0 auto',
            background: on.kind === 'live' ? 'rgba(192,57,43,0.18)'
              : on.kind === 'off' ? 'transparent' : 'rgba(45,110,200,0.14)',
            border: `1px solid ${on.kind === 'live' ? '#c0392b'
              : on.kind === 'off' ? 'var(--line)' : 'rgba(45,110,200,0.45)'}`,
          }}>
            <Dot on={on.kind !== 'off'} colour={on.kind === 'live' ? '#e04b37'
              : on.kind === 'emergency' || on.kind === 'backup' ? '#e0c14f' : '#4f8ad6'} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}>
              {on.kind === 'off' ? 'OFF AIR' : 'ON AIR'}
            </span>
            <span className="mono" style={{ fontSize: 12 }}>{hms(elapsedMs)}</span>
          </span>
        )}
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

      {/*
        * THREE COLUMNS AND A FOOTER, at fixed widths, because a control room
        * is a place before it is a page: the playlist is always in the same
        * corner and the transport is always under your hand, whatever is on.
        */}
      <div className="shell-body" style={{
        display: 'grid', gap: 10, padding: '10px 12px', minHeight: 0,
        gridTemplateColumns: 'minmax(260px, 330px) minmax(0, 1fr) minmax(280px, 330px)',
      }}>
        {/* ============ LEFT RAIL ======================================= */}
        <Frame testid="channel-rail">
          <Strip
            testid="rail-tabs"
            value={railTab}
            onChange={(next) => setRailTab(next as RailTab)}
            options={[
              { id: 'playlist', label: 'Playlist' },
              { id: 'library', label: 'Library' },
              { id: 'schedules', label: 'Schedules' },
            ]}
          />

          <div className="row" style={{
            gap: 6, padding: '8px 9px 0', flexWrap: 'nowrap', flex: '0 0 auto',
          }}>
            <button
              type="button" className="primary" data-testid="add-to-playlist"
              onClick={() => { setAdding((open) => !open); setRailTab('library'); }}
              style={{
                flex: 1, padding: '7px 10px', fontSize: 12,
                background: '#2f6fd0', borderColor: '#2f6fd0',
              }}
            >
              + Add to Playlist
            </button>
            <button
              type="button" aria-label="Search" data-testid="rail-search"
              onClick={() => setFilter((value) => (value === null ? '' : null))}
              style={{
                flex: '0 0 auto', width: 32, padding: 0, height: 30,
                background: filter === null ? 'var(--panel-2)' : 'rgba(45,110,200,0.22)',
                border: `1px solid ${filter === null ? 'var(--line)' : '#3d7fd6'}`,
                borderRadius: 8, cursor: 'pointer', color: 'inherit',
              }}
            >&#9906;</button>
          </div>

          {filter !== null && (
            <div style={{ padding: '6px 9px 0' }}>
              <input
                autoFocus value={filter} data-testid="rail-filter"
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Find something…"
                style={{ fontSize: 12, padding: '6px 9px' }}
              />
            </div>
          )}

          {/*
            * THE ONE THING SOMEBODY HAS TO UNDERSTAND ABOUT THIS STUDIO,
            * said once and where the adding happens: nothing is copied.
            * [D-18, INV-17]
            */}
          {adding && (
            <p className="small muted" style={{
              margin: 0, padding: '7px 10px 0', fontSize: 11,
            }}>
              {pickedItem
                ? `“${pickedItem.title}” — put it in the loop, or give it a time.`
                : 'Pick something below. Scheduling points at it; nothing is copied.'}
            </p>
          )}
          {adding && pickedItem && (
            <div style={{ padding: '7px 10px 0' }}>
              <Scheduler
                now={now}
                onSchedule={(startsAt, durationMs, loop) => {
                  void patch({
                    action: 'schedule', source: pickedItem.source,
                    startsAt, durationMs, title: pickedItem.title,
                    ...(loop ? { loop } : {}),
                  });
                  setAdding(false);
                  setRailTab('schedules');
                }}
                onRotate={(durationMs, loop) => {
                  void patch({
                    action: 'rotate', source: pickedItem.source,
                    durationMs, title: pickedItem.title, ...(loop ? { loop } : {}),
                  });
                  setAdding(false);
                  setRailTab('playlist');
                }}
              />
            </div>
          )}

          <div data-testid="rail-body" style={{
            flex: '1 1 0', minHeight: 0, overflowY: 'auto', padding: '8px 9px 10px',
          }}>
            {railTab === 'playlist' && (
              <PlaylistRail
                channel={channel} offsets={offsets} on={on} nameOf={nameOf}
                keep={railRows.keep}
                onMove={(entry, position) => void patch({
                  action: 'move-in-rotation', entryId: entry.id, position,
                })}
                onRemove={(entry) => void patch({
                  action: 'unrotate', entryId: entry.id,
                })}
              />
            )}
            {railTab === 'library' && (
              <LibraryRail
                items={library} listing={listing} picked={picked}
                keep={railRows.keep}
                onPick={(key) => setPicked(picked === key ? null : key)}
              />
            )}
            {railTab === 'schedules' && (
              <SchedulesRail
                channel={channel} listing={listing} nameOf={nameOf} clock={clock}
                missingKeys={missingKeys} liveId={live?.id} chosen={chosen}
                keep={railRows.keep}
                onChoose={setChosen}
                onUnschedule={(entry) => {
                  if (!window.confirm(
                    'Take it off the schedule? The video itself is untouched.')) return;
                  void patch({ action: 'unschedule', programmeId: entry.id });
                }}
                onAddBlock={() => {
                  const name = window.prompt('What is the day-part called?', 'Morning');
                  if (!name) return;
                  const at = window.prompt('It starts at (HH:MM, this channel’s time)', '07:00');
                  if (!at) return;
                  const [hours, minutes] = at.split(':').map(Number);
                  void patch({
                    action: 'add-block', name,
                    fromMinute: (hours ?? 0) * 60 + (minutes ?? 0),
                  });
                }}
                onRemoveBlock={(block) => {
                  if (!window.confirm(`Remove the ${block.name} block?`)) return;
                  void patch({ action: 'remove-block', blockId: block.id });
                }}
              />
            )}
          </div>

          <div className="row" style={{
            borderTop: '1px solid var(--line)', padding: '7px 10px',
            fontSize: 10, gap: 8, flex: '0 0 auto',
          }}>
            {/* THE CLAIM, ON SCREEN: everything scheduled against the files
                behind it. Six showings of one film is still one file. [D-18] */}
            <span className="muted grow" data-testid="asset-count">
              {channel.rotation.length + listing.length} scheduled ·{' '}
              {assets} {assets === 1 ? 'file' : 'files'}
            </span>
            <span className="muted">
              {turn > 0 ? `${offsetLabel(turn)} round` : 'no loop'}
            </span>
          </div>
        </Frame>

        {/* ============ CENTRE ========================================== */}
        <div style={{
          display: 'grid', gap: 10, minHeight: 0, minWidth: 0,
          /*
            * The programme above, the day below, and the split is the one a
            * gallery has: you watch the top half and plan in the bottom.
            */
          gridTemplateRows: 'minmax(0, 1.3fr) minmax(0, 1fr)',
        }}>
          <div style={{
            display: 'grid', gap: 10, minWidth: 0, minHeight: 0,
            gridTemplateColumns: 'minmax(0, 1.75fr) minmax(0, 1fr)',
          }}>
            {/* ---- PROGRAM OUTPUT (LIVE STREAM) ------------------------ */}
            <Frame testid="program-output">
              <Head
                text="Program Output"
                sub="(Live Stream)"
                right={(
                  <span data-testid="program-mode" data-mode={on.kind} style={{
                    padding: '3px 9px', borderRadius: 4, fontSize: 10,
                    fontWeight: 800, letterSpacing: 0.6, color: '#fff',
                    background: on.kind === 'live' ? '#c0392b'
                      : on.kind === 'emergency' ? '#b3431f'
                        : on.kind === 'backup' ? '#8e6a1f'
                          : on.kind === 'off' ? '#2a3038' : '#2f6fd0',
                  }}>
                    {on.kind === 'live' ? '● ON AIR'
                      : on.kind === 'emergency' ? 'EMERGENCY'
                        : on.kind === 'backup' ? 'BACKUP'
                          : on.kind === 'off' ? 'OFF AIR' : '● ON AIR'}
                  </span>
                )}
              />
              {/*
                * THE BIGGEST THING IN THE ROOM, because it is the only one
                * that is actually going out. It takes the height the column
                * has left rather than a fixed ratio: a gallery with a
                * postage-stamp program monitor and a large everything-else
                * is a gallery nobody watches the programme on.
                */}
              <div
                data-testid="channel-monitor"
                data-on-air={on.kind !== 'off' ? 'true' : 'false'}
                data-mode={on.kind}
                style={{
                  position: 'relative', flex: '1 1 auto', minHeight: 150,
                  margin: 9, background: '#05070a', borderRadius: 8,
                  border: '1px solid var(--line)', overflow: 'hidden',
                }}
              >
                {on.kind === 'live' && on.source.kind === 'live' ? (
                  /*
                   * THE OPERATOR'S OWN PICTURE, not the transmission. What
                   * goes out is this twelve seconds later (LIVE_DELAY_MS);
                   * showing the delayed version on the desk is how presenters
                   * end up talking over themselves.
                   */
                  <video
                    autoPlay muted playsInline
                    data-testid="live-preview"
                    ref={(element) => {
                      if (element && element.srcObject !== mixer.stream) {
                        element.srcObject = mixer.stream;
                      }
                    }}
                    style={{
                      width: '100%', height: '100%', objectFit: 'contain',
                      display: mixer.stream ? 'block' : 'none',
                    }}
                  />
                ) : on.kind !== 'off' ? (
                  <Monitor on={on} channel={channel} playing={pinned === null} />
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

                {/*
                  * THE MARKS, WHERE THE BROADCAST DRAWS THEM. The bug and the
                  * LIVE lamp are composited by the playout engine onto the
                  * outgoing frame and are never burnt into a source video
                  * (§10); the monitor shows them in the same corners so the
                  * desk sees what a viewer sees. [D-16]
                  */}
                <span data-testid="monitor-clock" className="mono" style={{
                  position: 'absolute', right: 9, top: 9, padding: '3px 8px',
                  borderRadius: 4, background: 'rgba(5,7,10,0.8)', fontSize: 11,
                }}>{clock(now)}</span>

                <span data-testid="on-air-lamp" data-mode={on.kind} style={{
                  position: 'absolute', left: 9, top: 9,
                  padding: '3px 9px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                  background: on.kind === 'live' ? '#c0392b'
                    : on.kind === 'backup' || on.kind === 'emergency' ? '#8e6a1f'
                      : on.kind === 'off' ? 'rgba(5,7,10,0.78)'
                        : 'rgba(45,110,200,0.55)',
                  color: on.kind === 'off' ? 'var(--muted)' : '#fff',
                }}>
                  {on.kind === 'live' ? '● LIVE'
                    : on.kind === 'backup' ? 'BACKUP'
                      : on.kind === 'emergency' ? 'EMERGENCY'
                        : on.kind === 'off' ? 'OFF AIR' : 'ON AIR'}
                </span>

                {on.kind !== 'off' && (
                  <span data-testid="now-playing-chip" style={{
                    position: 'absolute', left: 9, bottom: 9, maxWidth: '60%',
                    padding: '4px 9px', borderRadius: 5,
                    background: 'rgba(5,7,10,0.85)', fontSize: 11,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    <span className="muted" style={{ fontSize: 9, marginRight: 6 }}>
                      NOW PLAYING
                    </span>
                    {titleOf(on)}
                    {(on.kind === 'programme' || on.kind === 'rotation')
                      && ` · until ${clock(on.untilMs)}`}
                  </span>
                )}

                {/* The station lockup, bottom right, where a channel's is. */}
                <span className="row" data-testid="station-lockup" style={{
                  position: 'absolute', right: 9, bottom: 9, gap: 6,
                  padding: '4px 9px', borderRadius: 5,
                  background: 'rgba(5,7,10,0.72)', fontSize: 11, fontWeight: 700,
                  color: channel.identity?.ink ?? '#fff',
                  opacity: channel.identity?.bug?.opacity ?? 0.85,
                }}>
                  {channel.identity?.bug?.text ?? channel.name}
                  {on.kind === 'live' && (
                    <span style={{
                      padding: '1px 6px', borderRadius: 3, background: '#c0392b',
                      color: '#fff', fontSize: 9, letterSpacing: 0.6,
                    }}>{channel.identity?.liveLamp?.text ?? 'LIVE'}</span>
                  )}
                </span>
              </div>
            </Frame>

            {/* ---- PREVIEW (NEXT) + MULTI-VIEW ------------------------- */}
            <div style={{
              display: 'grid', gap: 10, minWidth: 0, minHeight: 0,
              gridTemplateRows: 'auto minmax(0, 1fr)',
            }}>
              <Frame testid="preview-next">
                <Head text="Preview" sub="(Next)" />
                <div style={{
                  position: 'relative', aspectRatio: '16 / 9', margin: 9,
                  background: '#05070a', borderRadius: 8, overflow: 'hidden',
                  border: `1px solid ${armed ? '#e0c14f' : 'var(--line)'}`,
                }}>
                  {/*
                    * IN A GALLERY, PREVIEW IS WHAT YOU ARE ABOUT TO CUT TO.
                    * Armed and not on air, that is the live feed: this is
                    * the whole of the ARM → TAKE discipline, and the reason
                    * the studio has two pictures rather than one. [§6]
                    */}
                  {armed ? (
                    <video
                      autoPlay muted playsInline data-testid="armed-preview"
                      ref={(element) => {
                        if (element && element.srcObject !== mixer.stream) {
                          element.srcObject = mixer.stream;
                        }
                      }}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : upNext ? (
                    <Thumb source={upNext.source} />
                  ) : (
                    <span className="small muted" style={{
                      position: 'absolute', inset: 0, display: 'grid',
                      placeItems: 'center', fontSize: 11,
                    }}>Nothing queued</span>
                  )}
                  <span data-testid="preview-title" style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0,
                    padding: '14px 9px 6px', fontSize: 11, fontWeight: 600,
                    background: 'linear-gradient(180deg, transparent, rgba(5,7,10,0.92))',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {armed ? 'The live studio — armed'
                      : upNext?.title ?? '—'}
                  </span>
                  {armed && (
                    <span style={{
                      position: 'absolute', left: 8, top: 8, padding: '2px 7px',
                      borderRadius: 3, fontSize: 9, fontWeight: 800,
                      background: '#8e6a1f', color: '#fff', letterSpacing: 0.6,
                    }}>ARMED</span>
                  )}
                </div>
              </Frame>

              <Frame testid="multi-view">
                <Head
                  text="Multi-view"
                  sub="(Sources)"
                  right={(
                    <span className="muted" style={{
                      fontSize: 10, whiteSpace: 'nowrap', flex: '0 0 auto',
                    }}>
                      {guests.sources.length || 1} in mix
                    </span>
                  )}
                />
                <MultiView
                  channel={channel} on={on} camera={camera} guests={guests.sources}
                  library={library} nameOf={nameOf} studioOneId={studioOneId}
                  studioTwoId={studioTwoId} onAir={onAir}
                />
              </Frame>
            </div>
          </div>

          {/* ---- 24/7 SCHEDULE ---------------------------------------- */}
          <Frame testid="schedule-deck">
            <div className="row" style={{
              gap: 9, padding: '7px 10px', borderBottom: '1px solid var(--line)',
              flexWrap: 'wrap',
            }}>
              <strong style={{ fontSize: 13 }}>24/7 Schedule</strong>
              <span className="small muted" data-testid="schedule-day" style={{
                fontSize: 11,
              }}>
                {sameDay(windowNow, now, channel.timezone)
                  ? 'Today'
                  : new Date(windowNow).toLocaleDateString('en-GB', {
                    weekday: 'short', day: 'numeric', month: 'short',
                    timeZone: channel.timezone,
                  })}
                {' ▾'}
              </span>
              <span className="grow" />
              <Strip
                testid="schedule-view"
                value={view}
                compact
                onChange={(next) => setView(next as ScheduleView)}
                options={[
                  { id: 'timeline', label: 'Timeline' },
                  { id: 'list', label: 'List' },
                  { id: 'calendar', label: 'Calendar' },
                ]}
              />
              {/*
                * AUTO-PLAY. The timeline rides the clock, which is what a
                * channel does; turning it off pins the window so an operator
                * can look at tonight without the strip sliding away. The
                * transmission is untouched either way — nothing on this page
                * can stop the channel.
                */}
              <label className="row" data-testid="auto-play" style={{
                gap: 6, fontSize: 11, margin: 0, cursor: 'pointer',
              }} title="Keep the timeline on the clock. The transmission is unaffected.">
                <input
                  type="checkbox" checked={pinned === null}
                  onChange={(event) => setPinned(event.target.checked ? null : now)}
                />
                Auto-play
              </label>
              {pinned !== null && (
                <span className="row" style={{ gap: 4 }}>
                  <button className="small" data-testid="window-back"
                          onClick={() => setPinned((at) => (at ?? now) - HOUR)}
                          style={{ padding: '2px 7px' }}>&#9664;</button>
                  <button className="small" data-testid="window-forward"
                          onClick={() => setPinned((at) => (at ?? now) + HOUR)}
                          style={{ padding: '2px 7px' }}>&#9654;</button>
                </span>
              )}
            </div>

            <div style={{
              flex: '1 1 0', minHeight: 0, overflowY: 'auto', padding: 9,
            }}>
              {view === 'timeline' && (
                <Timeline
                  segments={segments} channel={channel} now={now}
                  windowFrom={windowFrom} windowTo={windowTo} across={across}
                  clock={clock} missingKeys={missingKeys} chosen={chosen}
                  onChoose={setChosen}
                />
              )}
              {view === 'list' && (
                <ListView
                  segments={segments} clock={clock} now={now}
                  nameOf={nameOf} channel={channel}
                />
              )}
              {view === 'calendar' && (
                <CalendarView
                  channel={channel} now={now} listing={listing} clock={clock}
                  nameOf={nameOf}
                  onAddToBlock={(block) => {
                    if (!pickedItem) {
                      setError('Pick something in the Library first.');
                      return;
                    }
                    void patch({
                      action: 'add-to-block', blockId: block.id,
                      source: pickedItem.source, durationMs: 15 * MINUTE,
                      title: pickedItem.title,
                    });
                  }}
                  onRemoveFromBlock={(block, entry) => void patch({
                    action: 'remove-from-block', blockId: block.id, entryId: entry.id,
                  })}
                />
              )}
            </div>
          </Frame>
        </div>

        {/* ============ RIGHT COLUMN — LIVE STUDIO ====================== */}
        <Frame testid="live-studio">
          <Head
            text="Live Studio"
            right={(
              <button
                type="button" aria-label="Mixer" data-testid="mixer-toggle"
                onClick={() => setMixerOpen((open) => !open)}
                style={{
                  border: 0, background: 'none', padding: 0, fontSize: 14,
                  cursor: 'pointer', color: mixerOpen ? '#6fa9ea' : 'var(--muted)',
                }}
              >&#9776;</button>
            )}
          />

          <div className="row" style={{
            gap: 6, padding: '0 9px 8px', flexWrap: 'nowrap', flex: '0 0 auto',
          }}>
            <button
              className="primary" data-testid="go-live"
              disabled={onAir}
              title={'Brings the camera up and shows it to you in PREVIEW. '
                + 'Nothing reaches the wire until you press TAKE LIVE — the '
                + 'programme keeps playing until then.'}
              onClick={goLive}
              style={{
                flex: 1, padding: '8px 10px', fontSize: 12,
                background: onAir ? 'var(--panel-2)' : '#8e2f24',
                borderColor: onAir ? 'var(--line)' : '#8e2f24',
                opacity: onAir ? 0.5 : 1,
              }}
            >
              &#9679; Go Live
            </button>
            <button
              className="small" data-testid="end-live"
              disabled={!onAir}
              title="Return to program. The schedule resumes where the clock says."
              onClick={endLive}
              style={{
                flex: 1, padding: '8px 10px', fontSize: 12,
                borderColor: onAir ? '#c0392b' : 'var(--line)',
                color: onAir ? '#e07a6b' : 'var(--muted)',
              }}
            >
              End Live
            </button>
            <button
              type="button" aria-label="Channel settings" data-testid="identity-gear"
              onClick={() => setDeskTab('graphics')}
              style={{
                flex: '0 0 auto', width: 32, height: 32, padding: 0,
                borderRadius: 8, border: '1px solid var(--line)',
                background: 'var(--panel-2)', color: 'inherit', cursor: 'pointer',
              }}
            >&#9881;</button>
          </div>

          <Strip
            testid="desk-tabs"
            value={deskTab}
            compact
            onChange={(next) => setDeskTab(next as DeskTab)}
            options={[
              { id: 'camera', label: 'Camera' },
              { id: 'guests', label: 'Guests' },
              { id: 'screens', label: 'Screens' },
              { id: 'graphics', label: 'Graphics' },
              { id: 'audio', label: 'Audio' },
            ]}
          />

          <div style={{
            flex: '1 1 0', minHeight: 0, overflowY: 'auto', padding: 9,
          }}>
            {mixerOpen && (
              /*
                * WHICH ARRANGEMENT, from the same table Studio Two picks
                * from. Automatic by headcount, overridable — which is what a
                * vision mixer is. [U-18]
                */
              <div data-testid="mixer-panel" style={{
                display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 9,
                padding: 7, borderRadius: 8, background: 'var(--panel-2)',
                border: '1px solid var(--line)',
              }}>
                {(['auto', 'performance_full', 'performance_half',
                  'performance_thirds', 'performance_quad'] as const).map((option) => {
                  const chosenOne = option === 'auto'
                    ? arrangement === undefined : arrangement === option;
                  return (
                    <button
                      key={option} type="button" data-testid="stage-arrangement"
                      data-option={option} data-chosen={chosenOne ? 'true' : 'false'}
                      onClick={() => setArrangement(option === 'auto' ? undefined : option)}
                      style={{
                        padding: '3px 7px', fontSize: 10, borderRadius: 5,
                        border: `1px solid ${chosenOne ? '#3d7fd6' : 'var(--line)'}`,
                        background: chosenOne ? 'rgba(45,110,200,0.22)' : 'transparent',
                      }}
                    >
                      {option === 'auto'
                        ? `Auto (${arrangementFor(guests.sources.length)
                          .replace('performance_', '')})`
                        : option.replace('performance_', '')}
                    </button>
                  );
                })}
              </div>
            )}

            {deskTab === 'camera' && (
              <CameraTab
                camera={camera} mixer={mixer.stream} levels={levels}
                onAir={onAir} armed={armed} encoder={encoder}
                spaceId={channel.identity?.spaceId}
                onSpace={(spaceId) => void patch({
                  action: 'identity', identity: { spaceId },
                })}
              />
            )}

            {deskTab === 'guests' && (
              <GuestsTab
                channel={channel} guests={guests} levels={levels} onAir={onAir}
              />
            )}

            {deskTab === 'screens' && (
              <ScreensTab
                channel={channel} picked={pickedItem} onAir={onAir}
                nameOf={nameOf}
                onRollIn={() => {
                  if (pickedItem) {
                    void patch({ action: 'roll-in', source: pickedItem.source });
                  }
                }}
                onRollOut={() => void patch({ action: 'roll-in', source: null })}
              />
            )}

            {deskTab === 'graphics' && (
              <GraphicsTab
                channel={channel}
                onIdentity={(body) => void patch({
                  action: 'identity', identity: body,
                })}
              />
            )}

            {deskTab === 'audio' && (
              <AudioTab
                guests={guests} levels={levels} encoder={encoder} onAir={onAir}
                keeping={keeping}
                onKeep={(keep) => void patch({ action: 'keep-live', keep })}
              />
            )}

            {/* ---- NOW PLAYING / NEXT / UPCOMING ---------------------- */}
            <div data-testid="now-next" style={{ marginTop: 11 }}>
              <Section text="Now Playing" />
              <div className="panel" style={{ padding: 9 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{titleOf(on)}</div>
                <div style={{
                  height: 4, borderRadius: 2, background: 'var(--panel-2)',
                  margin: '7px 0 5px', overflow: 'hidden',
                }}>
                  <div data-testid="now-progress" style={{
                    height: '100%',
                    width: totalMs > 0
                      ? `${Math.min(100, (intoMs / totalMs) * 100)}%` : '100%',
                    background: on.kind === 'live' ? '#c0392b' : '#2f6fd0',
                  }} />
                </div>
                <div className="row mono muted" style={{ fontSize: 10 }}>
                  <span className="grow">{hms(intoMs)}</span>
                  <span>{totalMs > 0 ? hms(totalMs) : '—'}</span>
                </div>
              </div>

              <div className="row" data-testid="next-in" style={{
                marginTop: 8, padding: '6px 9px', borderRadius: 7,
                background: 'var(--panel-2)', border: '1px solid var(--line)',
                fontSize: 11, gap: 7,
              }}>
                <span className="muted">Next in</span>
                <span className="mono" style={{ fontWeight: 700 }}>
                  {(on.kind === 'programme' || on.kind === 'rotation')
                    ? hms(Math.max(0, on.untilMs - now)) : '—'}
                </span>
                <span className="grow muted" style={{
                  minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', textAlign: 'right',
                }}>{upNext?.title ?? ''}</span>
              </div>

              <Section text="Upcoming" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {segments.slice(1, 6).map((segment) => (
                  <div key={segment.fromMs} className="row" data-testid="upcoming-row"
                       style={{ gap: 8, fontSize: 11 }}>
                    <span className="mono muted" style={{ flex: '0 0 auto' }}>
                      {clock(segment.fromMs)}
                    </span>
                    <span style={{
                      flex: 1, minWidth: 0, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{segment.title}</span>
                    <span className="muted" style={{ flex: '0 0 auto', fontSize: 10 }}>
                      {offsetLabel(segment.toMs - segment.fromMs)}
                    </span>
                  </div>
                ))}
                {segments.length <= 1 && (
                  <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
                    Put something in the loop and the channel is never off air.
                  </p>
                )}
              </div>
            </div>
          </div>
        </Frame>
      </div>

      {/* ============ THE TRANSPORT =================================== */}
      {/*
        * [● REC] 00:15:32 ▮▮▯ │ [■][▶][▶| NEXT] [TAKE LIVE] [⚠ EMERGENCY] │
        *                        ▮▮▯ OUTPUT ▾  ● SERVER  VIEW CHANNEL  ⚙
        *
        * The order matters: what the channel is doing on the left, the live
        * chain in the middle, and the button you hit when something has gone
        * wrong at the right where nothing else is — because the one thing
        * worse than needing it is pressing it by accident.
        */}
      <footer className="shell-foot" data-testid="channel-transport" style={{
        display: 'grid', alignItems: 'center', gap: 12, padding: '8px 14px',
        gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
      }}>
        <div className="row" style={{ gap: 10, minWidth: 0, flexWrap: 'nowrap' }}>
          {/*
            * SAVE THIS LIVE SESSION.  [§8]
            *
            * The big red circle, and it is a DECISION rather than an action:
            * pressing it at 20:40 keeps the whole show, because the buffer is
            * already on disk and keeping it is a rename (`keepBuffer`). Off by
            * default, which is the brief's rule — a channel that kept
            * everything would be the duplication rule broken from the other
            * end. Off air it books a recording instead, which is the only
            * other thing that makes a new file here. [INV-17]
            */}
          <button
            type="button" data-testid={onAir ? 'keep-live' : 'request-recording'}
            aria-pressed={onAir ? keeping : undefined}
            title={onAir
              ? (keeping
                ? 'This live session will be saved as a recording when it ends.'
                : 'Save this live session. Off, the live buffer is discarded.')
              : 'Ask the channel to record the next hour of whatever it shows.'}
            onClick={() => {
              if (onAir) { void patch({ action: 'keep-live', keep: !keeping }); return; }
              const label = window.prompt('What should the recording be called?');
              if (!label) return;
              void patch({
                action: 'record', label,
                fromAt: new Date(now).toISOString(),
                toAt: new Date(now + HOUR).toISOString(),
                requestedBy: 'owner',
              });
            }}
            style={{
              flex: '0 0 auto', width: 34, height: 34, borderRadius: '50%',
              padding: 0, cursor: 'pointer', display: 'grid', placeItems: 'center',
              background: onAir && keeping ? '#c0392b' : 'var(--panel-2)',
              border: `2px solid ${onAir && keeping ? '#e04b37' : '#6d3129'}`,
            }}
          >
            <span aria-hidden="true" style={{
              width: 13, height: 13, borderRadius: '50%',
              background: onAir && keeping ? '#fff' : '#8e2f24',
            }} />
          </button>

          <span className="row" style={{ gap: 7, flex: '0 0 auto' }}>
            <Dot on={on.kind !== 'off'} colour={on.kind === 'live' ? '#e04b37' : '#4f8ad6'} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
              {on.kind === 'off' ? 'OFF AIR' : 'ON AIR'}
            </span>
            <span className="mono" data-testid="transport-clock" style={{
              fontSize: 15, fontWeight: 700,
            }}>{hms(elapsedMs)}</span>
          </span>

          <Meter value={levels['master']?.energy ?? 0} label="Program" />

          <span className="small muted" style={{
            fontSize: 11, minWidth: 0, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {/*
              * WHICH MODE, in words, because the two modes are the point:
              * PROGRAM is the channel running itself and LIVE is somebody
              * having taken control. [§6]
              */}
            {on.kind === 'emergency' ? 'EMERGENCY — cut away'
              : on.kind === 'backup' ? 'BACKUP — the feed failed'
                : on.kind === 'live' ? 'LIVE — you have the channel'
                  : armed ? 'PROGRAM — live is armed in preview'
                    : 'PROGRAM — the channel is running itself'}
          </span>
        </div>

        <div className="row" data-testid="control-bar" style={{
          gap: 6, flexWrap: 'nowrap',
        }}>
          <button
            className="small" data-testid="stop-live" disabled={!onAir}
            aria-label="Take program" title="Stop the live source and return to program"
            onClick={endLive}
            style={{ padding: '7px 11px' }}
          >&#9632;</button>
          <button
            className="small" data-testid="resume-program" disabled={!emergency}
            aria-label="Resume programme"
            title="Clear the emergency and let the schedule take the air again"
            onClick={() => void patch({ action: 'emergency', source: null })}
            style={{ padding: '7px 11px' }}
          >&#9654;</button>
          <button
            className="small" data-testid="next-item"
            disabled={channel.rotation.length === 0}
            title="Cut to the next item in the loop now"
            onClick={() => void patch({ action: 'next' })}
            style={{ padding: '7px 11px' }}
          >&#9654;&#9612; Next</button>

          <span aria-hidden="true" style={{
            width: 1, alignSelf: 'stretch', background: 'var(--line)', margin: '0 3px',
          }} />

          {armed ? (
            <button
              className="primary" data-testid="take-live"
              title="Cut the live feed to air"
              onClick={() => void patch({ action: 'take-live' })}
              style={{
                background: '#c0392b', borderColor: '#c0392b', padding: '7px 14px',
                fontSize: 12,
              }}
            >
              Take Live
            </button>
          ) : (
            <button
              className="small" data-testid="take-live" disabled
              title={onAir
                ? 'Already on air.'
                : 'Press GO LIVE first — the feed is armed into PREVIEW, and '
                  + 'TAKE LIVE is what puts it on the wire.'}
              style={{ padding: '7px 14px', fontSize: 12 }}
            >
              Take Live
            </button>
          )}

          <button
            className="small" data-testid="emergency"
            title={emergency
              ? 'Cut back to whatever the channel would be showing'
              : 'Cut away immediately. Beats live.'}
            disabled={!emergency && !pickedItem}
            onClick={() => {
              if (emergency) { void patch({ action: 'emergency', source: null }); return; }
              if (!pickedItem) return;
              if (!window.confirm(
                `Cut away to "${pickedItem.title}" now? This interrupts whatever `
                + 'is on air, including a live broadcast.')) return;
              void patch({ action: 'emergency', source: pickedItem.source });
            }}
            style={emergency
              ? {
                background: '#c0392b', borderColor: '#c0392b', color: '#fff',
                padding: '7px 12px', fontSize: 12,
              }
              : { borderColor: '#8e2f24', color: '#e07a6b', padding: '7px 12px', fontSize: 12 }}
          >
            {emergency ? '⚠ Clear Emergency' : '⚠ Emergency'}
          </button>
        </div>

        <div className="row" style={{
          gap: 9, justifyContent: 'flex-end', minWidth: 0, flexWrap: 'nowrap',
        }}>
          <Meter value={levels['master']?.energy ?? 0} label="Out" />

          {/* ---- where the programme goes (§15, D-21) ------------------ */}
          <details data-testid="stream-output" style={{ position: 'relative' }}>
            <summary className="small" style={{
              listStyle: 'none', cursor: 'pointer', padding: '6px 10px',
              borderRadius: 8, border: '1px solid var(--line)',
              background: 'var(--panel-2)', fontSize: 11, whiteSpace: 'nowrap',
            }}>
              Stream Output
              {' '}
              <span className="muted">
                {/*
                  * THE CHANNEL'S OWN HLS IS ALWAYS ONE OF THEM. The playout
                  * engine writes it whether or not anybody declared a
                  * destination row, so the count is that one plus whatever
                  * else is switched on — a control room reading "0
                  * outputs" while transmitting would be lying about the
                  * transmission.
                  */}
                ({1 + (channel.destinations ?? []).filter(
                  (destination) => destination.enabled
                    && destination.kind !== 'own').length})
              </span>
              {' ▾'}
            </summary>
            <div className="panel" style={{
              position: 'absolute', right: 0, bottom: 'calc(100% + 7px)', width: 300,
              padding: 10, display: 'flex', flexDirection: 'column', gap: 5,
              zIndex: 40, boxShadow: '0 12px 34px rgba(0,0,0,0.5)',
            }}>
              {/*
                * ONE PROGRAMME, SEVERAL AUDIENCES, each composing the same
                * moment its own way — and each its own SHAPE, because a
                * vertical output is a vertical edit and not a 16:9 programme
                * with its sides cut off. [§15, U-22, D-21]
                */}
              <div className="row">
                <strong className="grow" style={{ fontSize: 12 }}>Destinations</strong>
                <button className="small" data-testid="add-destination"
                        onClick={() => {
                          const kind = window.prompt(
                            'Which destination? own, tiktok, youtube, facebook, '
                            + 'x, rtmp', 'tiktok');
                          if (kind) void patch({ action: 'add-destination', kind });
                        }}
                        style={{
                          border: 0, background: 'none', padding: 0,
                          color: '#5c9ee0', fontSize: 11, cursor: 'pointer',
                        }}>
                  + Add
                </button>
              </div>
              <p className="small muted" style={{ margin: 0, fontSize: 10 }}>
                This channel is always one of the outputs — the playout
                engine writes its HLS whatever is listed here.
              </p>
              {(channel.destinations ?? []).length === 0 && (
                <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
                  Nothing else. Add a destination to send the same programme
                  somewhere else.
                </p>
              )}
              {(channel.destinations ?? []).map((destination) => {
                const platform = PLATFORMS[destination.kind];
                /*
                 * SWITCHED ON IS NOT SENDING. Only the channel's own
                 * connector is implemented; the rest are declared and
                 * blocked, and saying "ON" for one of those would be the
                 * screen that loses a broadcast.
                 */
                const canSend = destination.kind === 'own';
                const state = !destination.enabled ? 'OFF'
                  : canSend ? (onAir ? 'ON' : 'READY') : 'NOT CONNECTED';
                return (
                  <div key={destination.id} className="row"
                       data-testid="destination" data-kind={destination.kind}
                       data-state={state}
                       style={{
                         gap: 7, fontSize: 11, padding: '5px 7px', borderRadius: 6,
                         background: 'var(--panel-2)', border: '1px solid var(--line)',
                       }}>
                    <button
                      type="button" aria-label={`Turn ${destination.label} on or off`}
                      data-testid="toggle-destination"
                      onClick={() => void patch({
                        action: 'set-destination', destinationId: destination.id,
                        enabled: !destination.enabled,
                      })}
                      style={{
                        width: 9, height: 9, borderRadius: '50%', padding: 0,
                        border: 0, cursor: 'pointer', flex: '0 0 auto',
                        background: state === 'ON' ? '#c0392b'
                          : state === 'READY' ? '#4f8a5b'
                            : state === 'NOT CONNECTED' ? '#8e6a1f' : '#2a3038',
                      }}
                    />
                    <span className="grow" style={{
                      minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>{destination.label}</span>
                    <span className="muted" style={{ fontSize: 9 }}>
                      {destination.shape}
                    </span>
                    <span className="muted" style={{ fontSize: 9, fontWeight: 700 }}
                          title={platform?.needsReview ? platform.hint : undefined}>
                      {state}
                    </span>
                    <button
                      type="button" data-testid="remove-destination"
                      onClick={() => void patch({
                        action: 'remove-destination', destinationId: destination.id,
                      })}
                      style={{
                        border: 0, background: 'none', padding: '0 2px',
                        color: 'var(--bad)', cursor: 'pointer', fontSize: 12,
                      }}
                    >&times;</button>
                  </div>
                );
              })}
              {(channel.destinations ?? []).some(
                (destination) => destination.enabled
                  && PLATFORMS[destination.kind]?.needsReview) && (
                <p className="small muted" style={{ margin: 0, fontSize: 10 }}>
                  {/* Said plainly rather than shown as a working switch: a
                      platform whose Live products are behind an app review is
                      not something this can turn on for you. */}
                  Those platforms review apps before they may broadcast. The
                  connector has to be approved for your account and region.
                </p>
              )}
            </div>
          </details>

          {/*
            * IS THE STATION UP. Green is a schedule that resolves and a feed
            * that is arriving; amber is a reference with nothing behind it,
            * which is the one fault a listing cannot show by looking right.
            */}
          <span className="row" data-testid="server-lamp" style={{
            gap: 6, fontSize: 11, flex: '0 0 auto',
          }} title={[...violations, ...(error ? [error] : [])].join(' ')
            || 'The schedule resolves and every reference has a file behind it.'}>
            <Dot
              on
              colour={violations.length > 0 || missing.length > 0 ? '#c99a2e'
                : encoder.running && encoder.dropped > 0 ? '#c99a2e' : '#4f8a5b'}
            />
            <span className="muted">
              Server: {violations.length > 0 || missing.length > 0
                ? `${missing.length || violations.length} to fix` : 'Online'}
            </span>
          </span>

          {/*
            * WHO CAN WATCH, where a broadcaster cannot miss it. An
            * unpublished channel transmits perfectly and is reachable by
            * nobody, and that is exactly the fault a control room full of
            * green lamps would hide. [§17]
            */}
          <span className="row" data-testid="publish-lamp"
                data-published={published ? 'true' : 'false'} style={{
                  gap: 6, fontSize: 11, flex: '0 0 auto',
                }}
                title={published
                  ? 'Anybody with the link can watch this channel.'
                  : 'Only you can watch this. Publish it to give it an audience.'}>
            <Dot on colour={published ? '#4f8a5b' : '#6a7078'} />
            <span className="muted">{published ? 'Public' : 'Private'}</span>
          </span>

          <a className="btn small" data-testid="view-channel"
             href={`/t/${id}/watch`} target="_blank" rel="noreferrer"
             title="Open the channel the way a viewer gets it: the transmission, twelve seconds behind."
             style={{ padding: '6px 11px', fontSize: 11, whiteSpace: 'nowrap' }}>
            View Channel
          </a>

          <details data-testid="channel-settings" style={{ position: 'relative' }}>
            <summary aria-label="Channel settings" style={{
              listStyle: 'none', cursor: 'pointer', padding: '5px 8px',
              borderRadius: 8, border: '1px solid var(--line)',
              background: 'var(--panel-2)', fontSize: 13,
            }}>&#9881;</summary>
            <div className="panel" style={{
              position: 'absolute', right: 0, bottom: 'calc(100% + 7px)', width: 290,
              padding: 10, display: 'flex', flexDirection: 'column', gap: 7,
              zIndex: 40, boxShadow: '0 12px 34px rgba(0,0,0,0.5)',
            }}>
              {/*
                * THE SAFE PLAYLIST, so the automatic failover has somewhere to
                * go. Without one a lost feed falls through to the loop, which
                * is already something — but a channel that has said what it
                * shows when things go wrong is a channel that has thought
                * about it. [§9]
                */}
              <div className="row">
                <span className="grow" style={{ fontSize: 12, fontWeight: 600 }}>
                  Safe playlist
                </span>
                <button
                  className="small" data-testid="set-backup"
                  disabled={!pickedItem && !channel.backup}
                  onClick={() => {
                    if (channel.backup) {
                      void patch({ action: 'backup', source: null });
                      return;
                    }
                    if (pickedItem) {
                      void patch({ action: 'backup', source: pickedItem.source });
                    }
                  }}
                  style={channel.backup
                    ? { borderColor: '#8e6a1f', color: '#e0c14f', fontSize: 11 }
                    : { fontSize: 11 }}
                >
                  {channel.backup ? 'Clear' : 'Set from pick'}
                </button>
              </div>
              <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
                {channel.backup
                  ? `A lost feed falls to “${nameOf(channel.backup)}” for a `
                    + 'minute, then back to the loop.'
                  : 'Nothing set — a lost feed falls straight through to the loop.'}
              </p>
              {/* ---- who can watch (§17, U-31) ----------------------- */}
              <div className="row" style={{
                borderTop: '1px solid var(--line)', paddingTop: 7,
              }}>
                <span className="grow" style={{ fontSize: 12, fontWeight: 600 }}>
                  Audience
                </span>
                <button
                  className="small" data-testid="publish-channel"
                  onClick={() => {
                    if (published) {
                      if (!window.confirm(
                        'Take the channel off the air for viewers? It keeps '
                        + 'transmitting \u2014 the link simply stops working.')) return;
                      void patch({ action: 'unpublish' });
                      return;
                    }
                    const author = window.prompt(
                      'Who is broadcasting? (optional)', '') ?? undefined;
                    void patch({ action: 'publish', ...(author ? { author } : {}) });
                  }}
                  style={published
                    ? { borderColor: '#8e6a1f', color: '#e0c14f', fontSize: 11 }
                    : {
                      background: '#2f6fd0', borderColor: '#2f6fd0', color: '#fff',
                      fontSize: 11,
                    }}
                >
                  {published ? 'Take off air' : 'Publish'}
                </button>
              </div>
              <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
                {/*
                  * SAID PLAINLY, because it is the one thing about publishing
                  * a channel that is not obvious: nothing is copied and
                  * nothing stops. [D-18, §17]
                  */}
                {published
                  ? 'Anybody with the link can watch. Nothing was copied to '
                    + 'publish it \u2014 the playout engine was already writing '
                    + 'these segments.'
                  : 'Only you can watch. Publishing moves no files; it decides '
                    + 'who may fetch the segments already going out.'}
              </p>
              {published && (
                <div className="row" style={{ gap: 6 }}>
                  <input
                    readOnly data-testid="public-link"
                    value={`${origin}/t/${id}/watch`}
                    onFocus={(event) => event.currentTarget.select()}
                    style={{ fontSize: 11, padding: '5px 8px' }}
                  />
                </div>
              )}
              <div className="row" style={{
                borderTop: '1px solid var(--line)', paddingTop: 7, fontSize: 11,
              }}>
                <span className="grow muted">Timezone</span>
                <span className="mono">{channel.timezone}</span>
              </div>
              <div className="row" style={{ fontSize: 11 }}>
                <span className="grow muted">Referenced files</span>
                <span className="mono">{assets}</span>
              </div>
            </div>
          </details>
        </div>

        {(violations.length > 0 || error) && (
          <p className="small" data-testid="violations" style={{
            gridColumn: '1 / -1', margin: '4px 0 0', fontSize: 11,
            color: error ? 'var(--bad)' : 'var(--warn)',
          }}>
            {error ?? violations.join(' ')}
          </p>
        )}
      </footer>
    </div>
  );
}

/* ======================================================================== *
 *  The containers.
 * ======================================================================== */

/** A panel with a head and a body, which is every box in the benchmark. */
function Frame({
  testid, children,
}: { testid: string; children: React.ReactNode }) {
  return (
    <section data-testid={testid} style={{
      display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0,
      height: '100%', borderRadius: 10, border: '1px solid var(--line)',
      background: 'var(--panel)', overflow: 'hidden',
    }}>
      {children}
    </section>
  );
}

function Head({
  text, sub, right,
}: { text: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="row" style={{
      gap: 7, padding: '7px 10px', borderBottom: '1px solid var(--line)',
      minHeight: 34, flexWrap: 'nowrap', flex: '0 0 auto',
    }}>
      <strong style={{
        fontSize: 13, minWidth: 0, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{text}</strong>
      {sub && (
        <span className="muted" style={{
          fontSize: 11, flex: '0 0 auto', whiteSpace: 'nowrap',
        }}>{sub}</span>
      )}
      <span className="grow" />
      {right}
    </div>
  );
}

/**
 * The tab strip, which the benchmark uses in three places.
 *
 * One component rather than three, for the reason `StudioBar` is one
 * component: a strip copied is a strip that gets a different underline in
 * one corner of the room and looks like a different product.
 */
function Strip({
  testid, value, options, onChange, compact,
}: {
  testid: string;
  value: string;
  options: readonly { id: string; label: string }[];
  onChange: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div className="row" data-testid={testid} style={{
      gap: 0, flexWrap: 'nowrap', flex: '0 0 auto',
      borderBottom: compact ? 0 : '1px solid var(--line)',
      ...(compact
        ? {
          border: '1px solid var(--line)', borderRadius: 8, padding: 2,
          background: 'var(--panel-2)',
        }
        : {}),
    }}>
      {options.map((option) => {
        const chosen = option.id === value;
        return (
          <button
            key={option.id} type="button" data-testid={`${testid}-${option.id}`}
            data-chosen={chosen ? 'true' : 'false'}
            onClick={() => onChange(option.id)}
            style={{
              flex: compact ? '0 0 auto' : '1 1 0', padding: compact ? '4px 9px' : '9px 4px',
              font: 'inherit', fontSize: compact ? 11 : 12,
              fontWeight: chosen ? 700 : 500, cursor: 'pointer',
              color: chosen ? (compact ? '#fff' : '#6fa9ea') : 'var(--muted)',
              background: compact
                ? (chosen ? '#2f6fd0' : 'transparent') : 'none',
              border: 0, borderRadius: compact ? 6 : 0,
              borderBottom: compact ? 0 : `2px solid ${chosen ? '#2f6fd0' : 'transparent'}`,
            }}
          >{option.label}</button>
        );
      })}
    </div>
  );
}

function Section({ text, aside }: { text: string; aside?: React.ReactNode }) {
  return (
    <div className="row" style={{
      alignItems: 'baseline', justifyContent: 'space-between', margin: '10px 0 5px',
    }}>
      <span style={{ fontSize: 12, fontWeight: 700 }}>{text}</span>
      {aside}
    </div>
  );
}

function Dot({ on, colour }: { on: boolean; colour: string }) {
  return (
    <span aria-hidden="true" style={{
      width: 8, height: 8, borderRadius: '50%', flex: '0 0 auto',
      background: on ? colour : '#2a3038',
      boxShadow: on ? `0 0 7px ${colour}` : 'none',
    }} />
  );
}

/** A level meter. Eight segments, because a bar is read as a number. */
function Meter({ value, label }: { value: number; label: string }) {
  const lit = Math.round(Math.min(1, value * 1.6) * 8);
  return (
    <span className="row" data-testid="level-meter" data-label={label}
          title={`${label} · ${Math.round(value * 100)}%`}
          style={{ gap: 2, flex: '0 0 auto' }}>
      {Array.from({ length: 8 }, (_unused, index) => (
        <span key={index} aria-hidden="true" style={{
          width: 3, height: 5 + index * 1.6, borderRadius: 1,
          background: index < lit
            ? (index > 6 ? '#c0392b' : index > 4 ? '#c99a2e' : '#4f8a5b')
            : 'var(--panel-2)',
        }} />
      ))}
    </span>
  );
}

/* ======================================================================== *
 *  The left rail.
 * ======================================================================== */

/** A numbered row: index, thumbnail, title, subtitle, duration, menu. */
function Row({
  index, source, title, subtitle, duration, badge, chosen, testid, dataset,
  onClick, menu,
}: {
  index: number;
  source?: ProgrammeSource;
  title: string;
  subtitle: string;
  duration: string;
  badge?: React.ReactNode;
  chosen?: boolean;
  testid: string;
  dataset?: Record<string, string>;
  onClick?: () => void;
  menu?: React.ReactNode;
}) {
  return (
    <div
      data-testid={testid} {...dataset}
      style={{
        display: 'flex', gap: 9, alignItems: 'center', padding: 6,
        borderRadius: 9, marginBottom: 5,
        background: chosen ? 'rgba(45,110,200,0.16)' : 'var(--panel-2)',
        border: `1px solid ${chosen ? '#3d7fd6' : 'var(--line)'}`,
      }}
    >
      <span className="mono muted" style={{
        flex: '0 0 auto', width: 13, fontSize: 10, textAlign: 'right',
      }}>{index}</span>
      <button
        type="button" onClick={onClick}
        style={{
          display: 'flex', gap: 9, alignItems: 'center', flex: 1, minWidth: 0,
          padding: 0, border: 0, background: 'none', font: 'inherit',
          color: 'inherit', textAlign: 'left',
          cursor: onClick ? 'pointer' : 'default',
        }}
      >
        <span style={{
          flex: '0 0 auto', width: 62, height: 36, borderRadius: 5,
          overflow: 'hidden', position: 'relative', background: '#0d1319',
          border: '1px solid var(--line)',
        }}>
          {source ? <Thumb source={source} /> : null}
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="row" style={{ gap: 6 }}>
            <span style={{
              fontWeight: 600, fontSize: 12, minWidth: 0, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{title}</span>
            {badge}
          </span>
          <span className="muted" style={{
            fontSize: 10, display: 'block', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{subtitle}</span>
        </span>
      </button>
      <span className="mono muted" style={{ flex: '0 0 auto', fontSize: 10 }}>
        {duration}
      </span>
      {menu}
    </div>
  );
}

/**
 * The ⋯ menu.
 *
 * `name` groups them so opening one closes the others, which is the browser
 * doing what a menu manager would otherwise have to — the same mechanism
 * Studio Two's take menu uses. [STUDIO-TWO §5]
 */
function Menu({ children }: { children: React.ReactNode }) {
  return (
    <details name="rail-menu" data-testid="row-menu" style={{
      position: 'relative', flex: '0 0 auto',
    }}>
      <summary style={{
        listStyle: 'none', cursor: 'pointer', padding: '0 4px',
        color: 'var(--muted)', fontSize: 13,
      }}>&#8943;</summary>
      <div className="panel" style={{
        position: 'absolute', right: 0, top: '100%', zIndex: 30, padding: 5,
        width: 170, display: 'flex', flexDirection: 'column', gap: 2,
        boxShadow: '0 10px 28px rgba(0,0,0,0.5)',
      }}>{children}</div>
    </details>
  );
}

function MenuItem({
  label, onClick, danger, disabled,
}: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button" disabled={disabled} onClick={onClick}
      style={{
        border: 0, background: 'none', textAlign: 'left', font: 'inherit',
        fontSize: 11, padding: '5px 7px', borderRadius: 5, cursor: 'pointer',
        color: danger ? 'var(--bad)' : 'inherit', opacity: disabled ? 0.4 : 1,
      }}
    >{label}</button>
  );
}

/**
 * THE PLAYLIST — the channel's rotation, in the brief's own column.
 *
 *     1  00:00  Music Video — Everlasting Love    04:17
 *     2  04:17  History Discussion               24:25
 *
 * Those are offsets into one turn, not times of day, and they are derived
 * from the durations — which is why moving an entry moves everything after it
 * and nobody edits a number. [§4]
 */
function PlaylistRail({
  channel, offsets, on, nameOf, keep, onMove, onRemove,
}: {
  channel: Channel;
  offsets: number[];
  on: OnAir;
  nameOf: (source: ProgrammeSource) => string;
  keep: (text: string) => boolean;
  onMove: (entry: RotationEntry, position: number) => void;
  onRemove: (entry: RotationEntry) => void;
}) {
  if (channel.rotation.length === 0) {
    return (
      <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
        Nothing in the loop. Put something here and the channel is never off
        air — it plays round and round until a fixed slot pre-empts it.
      </p>
    );
  }
  return (
    <>
      {channel.rotation.map((entry, index) => {
        const title = entry.title ?? nameOf(entry.source);
        if (!keep(title)) return null;
        const playing = on.kind === 'rotation' && on.entry.id === entry.id;
        return (
          <Row
            key={entry.id}
            index={index + 1}
            source={entry.source}
            title={title}
            subtitle={`${studioOf(entry.source)} · ${offsetLabel(offsets[index] ?? 0)} in`}
            duration={offsetLabel(entry.durationMs)}
            chosen={playing}
            testid="rotation-entry"
            dataset={{
              'data-entry-id': entry.id,
              'data-playing': playing ? 'true' : 'false',
            } as Record<string, string>}
            badge={playing ? (
              <span style={{
                flex: '0 0 auto', padding: '1px 5px', borderRadius: 3,
                background: '#c0392b', color: '#fff', fontSize: 8,
                fontWeight: 800, letterSpacing: 0.5,
              }}>LIVE</span>
            ) : entry.loop ? (
              <span className="muted" style={{ fontSize: 9 }}>&#8635;</span>
            ) : undefined}
            menu={(
              <Menu>
                <MenuItem
                  label="Move up" disabled={index === 0}
                  onClick={() => onMove(entry, index - 1)}
                />
                <MenuItem
                  label="Move down"
                  disabled={index === channel.rotation.length - 1}
                  onClick={() => onMove(entry, index + 1)}
                />
                <MenuItem
                  label="Remove from the loop" danger
                  onClick={() => onRemove(entry)}
                />
              </Menu>
            )}
          />
        );
      })}
      <p className="small muted" style={{ margin: '6px 2px 0', fontSize: 10 }}>
        {/* The one sentence D-18 is about, next to the thing it is about. */}
        The loop plays round for ever. Scheduling something twice adds no file.
      </p>
    </>
  );
}

/** THE LIBRARY — every finished render both other studios have made. [§3] */
function LibraryRail({
  items, listing, picked, keep, onPick,
}: {
  items: LibraryItem[];
  listing: Programme[];
  picked: string | null;
  keep: (text: string) => boolean;
  onPick: (key: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
        Nothing finished yet. Make a video in Studio One or Studio Two and it
        appears here — as a reference, never as a copy.
      </p>
    );
  }
  return (
    <>
      {items.map((item, index) => {
        if (!keep(item.title)) return null;
        const key = sourceKey(item.source);
        const times = listing.filter(
          (entry) => sourceKey(entry.source) === key).length;
        return (
          <Row
            key={key}
            index={index + 1}
            source={item.source}
            title={item.title}
            subtitle={`${studioOf(item.source)} · `
              + `${(item.bytes / 1_000_000).toFixed(0)} MB`
              /* The count that proves the rule, on the thing it is about:
                 scheduled six times, one file. */
              + (times > 0 ? ` · scheduled ${times}×` : '')}
            duration=""
            chosen={picked === key}
            testid="library-item"
            dataset={{ 'data-source-key': key } as Record<string, string>}
            onClick={() => onPick(key)}
          />
        );
      })}
    </>
  );
}

/** THE SCHEDULES — the fixed slots, and the shape of the day. [§2, §5] */
function SchedulesRail({
  channel, listing, nameOf, clock, missingKeys, liveId, chosen, keep,
  onChoose, onUnschedule, onAddBlock, onRemoveBlock,
}: {
  channel: Channel;
  listing: Programme[];
  nameOf: (source: ProgrammeSource) => string;
  clock: (at: number) => string;
  missingKeys: Set<string>;
  liveId?: string;
  chosen: string | null;
  keep: (text: string) => boolean;
  onChoose: (id: string) => void;
  onUnschedule: (entry: Programme) => void;
  onAddBlock: () => void;
  onRemoveBlock: (block: ChannelBlock) => void;
}) {
  const blocks = orderedBlocks(channel);
  return (
    <>
      {listing.length === 0 ? (
        <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
          No fixed times. Everything comes from the loop, which is a perfectly
          good channel — a fixed slot is for the thing that has to be at nine.
        </p>
      ) : listing.map((entry, index) => {
        const title = entry.title ?? nameOf(entry.source);
        if (!keep(title)) return null;
        const broken = missingKeys.has(sourceKey(entry.source));
        return (
          <Row
            key={entry.id}
            index={index + 1}
            source={entry.source}
            title={title}
            subtitle={`${clock(programmeStart(entry))} – `
              + `${clock(programmeEnd(entry))}`
              + (broken ? ' · missing' : entry.loop ? ' · loops' : '')}
            duration={offsetLabel(entry.durationMs)}
            chosen={chosen === entry.id || liveId === entry.id}
            testid="schedule-row"
            dataset={{ 'data-programme-id': entry.id } as Record<string, string>}
            onClick={() => onChoose(entry.id)}
            badge={broken ? (
              <span style={{
                flex: '0 0 auto', padding: '1px 5px', borderRadius: 3,
                background: '#8e2f24', color: '#fff', fontSize: 8, fontWeight: 800,
              }}>NO FILE</span>
            ) : liveId === entry.id ? (
              <span style={{
                flex: '0 0 auto', padding: '1px 5px', borderRadius: 3,
                background: '#c0392b', color: '#fff', fontSize: 8, fontWeight: 800,
              }}>LIVE</span>
            ) : undefined}
            menu={(
              <Menu>
                <MenuItem label="Unschedule" danger
                          onClick={() => onUnschedule(entry)} />
              </Menu>
            )}
          />
        );
      })}

      {/*
        * THE SHAPE OF THE DAY. A block holding the air plays ITS loop, and
        * the channel's own loop is what runs when no block does. [§5]
        */}
      <Section
        text="Day-parts"
        aside={(
          <button className="small" data-testid="add-block" onClick={onAddBlock}
                  style={{
                    border: 0, background: 'none', padding: 0, fontSize: 11,
                    color: '#5c9ee0', cursor: 'pointer',
                  }}>+ Add</button>
        )}
      />
      {blocks.length === 0 ? (
        <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
          None. The channel&rsquo;s own loop runs all day.
        </p>
      ) : blocks.map((block) => (
        <div key={block.id} className="row" data-testid="block-row"
             data-block-id={block.id}
             style={{
               gap: 8, fontSize: 11, padding: '5px 7px', borderRadius: 6,
               marginBottom: 4, background: 'var(--panel-2)',
               border: '1px solid var(--line)',
             }}>
          <span className="mono muted" style={{ flex: '0 0 auto' }}>
            {atMinute(block.fromMinute)}
          </span>
          <span className="grow" style={{
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{block.name}</span>
          <span className="muted" style={{ fontSize: 10 }}>
            {block.rotation.length} in its loop
          </span>
          <button type="button" data-testid="remove-block"
                  onClick={() => onRemoveBlock(block)}
                  style={{
                    border: 0, background: 'none', padding: '0 2px',
                    color: 'var(--bad)', cursor: 'pointer',
                  }}>&times;</button>
        </div>
      ))}
    </>
  );
}

/* ======================================================================== *
 *  The multi-view.
 * ======================================================================== */

/**
 * SIX SOURCES, NUMBERED.  [§6, benchmark]
 *
 *     ┌1 CAMERA 1┬2 CAMERA 2┬3 STUDIO TWO┐
 *     ├4 STUDIO 1┼5 MEDIA   ┼6 GRAPHICS  ┤
 *
 * A gallery's multi-view is not decoration: it is the answer to "what can I
 * cut to, and is it there". Each tile is a real thing — the operator's
 * camera, the Room's staged guests, the two studios' most recent renders,
 * whatever the schedule has on, and the identity layer — and a tile with
 * nothing behind it says so rather than showing a plausible black rectangle.
 *
 * The blue border is CONTRIBUTING: this source is part of what is going out
 * right now. That is computed from `whatIsOn` and the mixer's source list,
 * not from a click, because a tile that lit up when you selected it would be
 * a tile that lies about the transmission.
 */
function MultiView({
  channel, on, camera, guests, library, nameOf, studioOneId, studioTwoId, onAir,
}: {
  channel: Channel;
  on: OnAir;
  camera: MediaStream | null;
  guests: { id: string; stream: MediaStream; label?: string }[];
  library: LibraryItem[];
  nameOf: (source: ProgrammeSource) => string;
  studioOneId?: string;
  studioTwoId?: string;
  onAir: boolean;
}) {
  const guest = guests.find((person) => person.stream !== camera) ?? null;
  const fromStudioTwo = library.find((item) => item.document === 'performance');
  const fromStudioOne = library.find((item) => item.document === 'conversation');
  const scheduled = on.kind === 'programme' || on.kind === 'rotation'
    ? on.source : undefined;

  const tiles: {
    n: number; label: string; sub: string; live: boolean;
    stream?: MediaStream | null; source?: ProgrammeSource; href?: string;
    glyph?: string;
  }[] = [
    {
      n: 1, label: 'Camera 1', sub: 'Host', live: onAir && Boolean(camera),
      stream: camera,
    },
    {
      n: 2, label: 'Camera 2', sub: guest?.label ?? 'Guest',
      live: onAir && Boolean(guest), stream: guest?.stream ?? null,
    },
    {
      n: 3, label: 'Studio Two', sub: fromStudioTwo?.title ?? 'Music Video',
      live: Boolean(scheduled && fromStudioTwo
        && sourceKey(scheduled) === sourceKey(fromStudioTwo.source)),
      ...(fromStudioTwo ? { source: fromStudioTwo.source } : {}),
      ...(studioTwoId ? { href: `/p/${studioTwoId}` } : {}),
    },
    {
      n: 4, label: 'Studio One', sub: fromStudioOne?.title ?? 'Conversation',
      live: Boolean(scheduled && fromStudioOne
        && sourceKey(scheduled) === sourceKey(fromStudioOne.source)),
      ...(fromStudioOne ? { source: fromStudioOne.source } : {}),
      ...(studioOneId ? { href: `/c/${studioOneId}` } : {}),
    },
    {
      n: 5, label: 'Media Player', sub: scheduled ? nameOf(scheduled) : 'Idle',
      live: Boolean(scheduled),
      ...(scheduled ? { source: scheduled } : {}),
    },
    {
      n: 6, label: 'Graphics',
      sub: channel.identity?.bug?.text ?? channel.name,
      live: Boolean(channel.identity?.bug || channel.identity?.lowerThird),
      glyph: '◰',
    },
  ];

  return (
    <div data-testid="multiview-grid" style={{
      display: 'grid', gap: 6, padding: 9, flex: '1 1 auto', minHeight: 0,
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gridTemplateRows: 'repeat(2, minmax(0, 1fr))', alignContent: 'center',
    }}>
      {tiles.map((tile) => (
        <div
          key={tile.n} data-testid="multiview-tile" data-source={tile.n}
          data-live={tile.live ? 'true' : 'false'}
          title={`${tile.label} — ${tile.sub}`}
          style={{
            position: 'relative', minHeight: 44, borderRadius: 6,
            overflow: 'hidden', background: '#05070a',
            border: `1px solid ${tile.live ? '#3d7fd6' : 'var(--line)'}`,
            boxShadow: tile.live ? '0 0 0 1px rgba(61,127,214,0.45)' : 'none',
          }}
        >
          {tile.stream ? (
            <video
              autoPlay muted playsInline
              ref={(element) => {
                if (element && element.srcObject !== tile.stream) {
                  element.srcObject = tile.stream ?? null;
                }
              }}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : tile.source ? (
            <Thumb source={tile.source} />
          ) : (
            <span aria-hidden="true" className="muted" style={{
              position: 'absolute', inset: 0, display: 'grid',
              placeItems: 'center', fontSize: 16, opacity: 0.4,
            }}>{tile.glyph ?? '—'}</span>
          )}
          <span className="mono" style={{
            position: 'absolute', left: 3, top: 3, padding: '0 4px',
            borderRadius: 3, background: 'rgba(5,7,10,0.8)', fontSize: 9,
            fontWeight: 700,
          }}>{tile.n}</span>
          <span style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            padding: '9px 4px 3px', fontSize: 9, lineHeight: 1.25,
            background: 'linear-gradient(180deg, transparent, rgba(5,7,10,0.92))',
          }}>
            <span style={{
              display: 'block', fontWeight: 700, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{tile.label}</span>
            <span className="muted" style={{
              display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>{tile.sub}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/* ======================================================================== *
 *  The schedule deck.
 * ======================================================================== */

/**
 * FOUR LANES, and they are the four things that leave the building. [§2, §10]
 *
 *   PROGRAM        what `whatIsOn` says, walked across the window
 *   VIDEO TRACKS   the same, as a filmstrip, so a join can be seen
 *   GRAPHICS       where the identity layer draws a lower third
 *   AUDIO          the master, which is continuous by definition
 *
 * The playhead is the one line on this page that moves by itself.
 */
function Timeline({
  segments, channel, now, windowFrom, windowTo, across, clock, missingKeys,
  chosen, onChoose,
}: {
  segments: Segment[];
  channel: Channel;
  now: number;
  windowFrom: number;
  windowTo: number;
  across: (at: number) => string;
  clock: (at: number) => string;
  missingKeys: Set<string>;
  chosen: string | null;
  onChoose: (id: string) => void;
}) {
  const ticks = Math.round((windowTo - windowFrom) / STEP_MS);
  const lowerThird = channel.identity?.lowerThird;
  const holdMs = lowerThird?.holdMs ?? 8000;

  const Lane = ({ name, note, height, children }: {
    name: string; note?: string; height: number; children: React.ReactNode;
  }) => (
    <div className="row" data-testid="timeline-lane" data-lane={name}
         style={{ alignItems: 'stretch', gap: 0 }}>
      <span style={{
        flex: '0 0 auto', width: 96, padding: '5px 8px 0 0', textAlign: 'right',
      }}>
        <span className="muted" style={{
          display: 'block', fontSize: 10, fontWeight: 600,
        }}>{name}</span>
        {note && (
          <span className="muted" style={{
            display: 'block', fontSize: 8, opacity: 0.7,
          }}>{note}</span>
        )}
      </span>
      <div style={{
        position: 'relative', flex: 1, minWidth: 0, height,
        borderTop: '1px solid var(--line)',
      }}>{children}</div>
    </div>
  );

  return (
    <div data-testid="schedule-strip" style={{ minWidth: 0 }}>
      {/* ---- the ruler ------------------------------------------------ */}
      <div className="row" style={{ alignItems: 'stretch' }}>
        <span style={{ flex: '0 0 auto', width: 96 }} />
        <div style={{ position: 'relative', flex: 1, minWidth: 0, height: 18 }}>
          {Array.from({ length: ticks + 1 }, (_unused, index) => {
            const at = windowFrom + index * STEP_MS;
            return (
              <span key={index} className="muted mono" style={{
                position: 'absolute', top: 0, left: across(at), fontSize: 9,
                transform: index === 0 ? 'none' : 'translateX(-50%)',
              }}>{clock(at)}</span>
            );
          })}
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        {/* ---- PROGRAM -------------------------------------------------- */}
        <Lane name="Program" height={58}>
          {segments.map((segment) => {
            const broken = segment.on.kind !== 'off'
              && missingKeys.has(sourceKey(segment.on.source));
            const id = segment.on.kind === 'programme' ? segment.on.programme.id
              : segment.on.kind === 'rotation' ? segment.on.entry.id : undefined;
            const isChosen = Boolean(id && id === chosen);
            const holds = segment.fromMs <= now && now < segment.toMs;
            return (
              <button
                key={`p${segment.fromMs}`} type="button"
                data-testid="schedule-block"
                {...(segment.on.kind === 'programme'
                  ? { 'data-programme-id': segment.on.programme.id } : {})}
                data-kind={segment.on.kind}
                onClick={() => { if (id) onChoose(id); }}
                title={`${segment.title} — ${clock(segment.fromMs)} to `
                  + `${clock(segment.toMs)}`}
                style={{
                  position: 'absolute', top: 4, bottom: 4,
                  left: across(segment.fromMs),
                  width: `calc(${across(segment.toMs)} - ${across(segment.fromMs)})`,
                  minWidth: 3, padding: '3px 5px', borderRadius: 5,
                  textAlign: 'left', font: 'inherit', fontSize: 10,
                  color: 'inherit', cursor: id ? 'pointer' : 'default',
                  overflow: 'hidden',
                  /*
                   * Red for a reference with nothing behind it. It is the one
                   * fault a listing cannot show by looking right: the slot is
                   * there, the title is there, and the hour goes out black.
                   */
                  background: broken ? 'rgba(200,60,50,0.28)'
                    : segment.on.kind === 'live' ? 'rgba(192,57,43,0.32)'
                      : segment.on.kind === 'emergency'
                        || segment.on.kind === 'backup' ? 'rgba(201,154,46,0.26)'
                        : segment.on.kind === 'programme' ? 'rgba(45,110,200,0.34)'
                          : 'rgba(45,110,200,0.15)',
                  border: `1px solid ${broken ? '#c0392b'
                    : isChosen || holds ? '#6fa9ea' : 'var(--line)'}`,
                }}
              >
                <span style={{
                  display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', fontWeight: 600,
                }}>{segment.title}</span>
                <span className="muted" style={{ fontSize: 9 }}>
                  {offsetLabel(segment.toMs - segment.fromMs)}
                  {broken ? ' · missing' : ''}
                </span>
              </button>
            );
          })}
        </Lane>

        {/* ---- VIDEO TRACKS: the same, as a strip of frames ------------- */}
        <Lane name="Video Tracks" note="frames" height={44}>
          {segments.map((segment) => (
            <div key={`v${segment.fromMs}`} data-testid="filmstrip-cell" style={{
              position: 'absolute', top: 3, bottom: 3, left: across(segment.fromMs),
              width: `calc(${across(segment.toMs)} - ${across(segment.fromMs)})`,
              minWidth: 3, borderRadius: 4, overflow: 'hidden',
              border: '1px solid var(--line)', background: '#0d1319',
              /* A strip of sprocket holes: the join between two pieces of
                 video, which is what this lane is for seeing. */
              backgroundImage:
                'repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 1px, '
                + 'transparent 1px 9px)',
            }}>
              {/* A frame only where there is room for one: a poster in a
                  three-pixel cell is a fetch nobody can see. */}
              {segment.on.kind !== 'off'
                && segment.toMs - segment.fromMs >= 8 * MINUTE && (
                <Thumb source={segment.on.source} />
              )}
            </div>
          ))}
        </Lane>

        {/* ---- GRAPHICS: where the identity layer draws ----------------- */}
        <Lane
          name="Graphics" height={32}
          note={lowerThird && lowerThird.show === 'at-start'
            ? `${Math.round(holdMs / 1000)}s at each join`
            : lowerThird?.show === 'always' ? 'always up' : 'off'}
        >
          {/*
            * THE LANE'S GROUND says what the identity layer is doing; the
            * blocks on it say WHEN. With `at-start` they are eight-second
            * ticks at each join, which is the truth — a lane drawn as one
            * long bar would be a lane claiming a lower third is up all day.
            */}
          <div aria-hidden="true" style={{
            position: 'absolute', inset: '3px 0', borderRadius: 4,
            background: 'rgba(125,86,196,0.08)', border: '1px dashed #4a3a70',
          }} />
          {lowerThird && lowerThird.show !== 'never' && segments.map((segment) => {
            const toMs = lowerThird.show === 'always'
              ? segment.toMs : Math.min(segment.toMs, segment.fromMs + holdMs);
            return (
              <div key={`g${segment.fromMs}`} data-testid="graphics-cell" style={{
                position: 'absolute', top: 3, bottom: 3, left: across(segment.fromMs),
                width: `calc(${across(toMs)} - ${across(segment.fromMs)})`,
                minWidth: 3, borderRadius: 4, padding: '0 5px', fontSize: 9,
                lineHeight: '24px', overflow: 'hidden', whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                background: 'rgba(125,86,196,0.45)', border: '1px solid #8a6fd0',
              }}>
                {toMs - segment.fromMs > WINDOW_MS / 8
                  ? `Lower Third: ${segment.title}` : ''}
              </div>
            );
          })}
          {(!lowerThird || lowerThird.show === 'never') && (
            <span className="muted" style={{
              position: 'absolute', left: 8, top: 5, fontSize: 9,
            }}>No lower thirds — set them in Graphics</span>
          )}
        </Lane>

        {/* ---- AUDIO: continuous, by definition ------------------------- */}
        <Lane name="Audio" note="always on" height={34}>
          <div data-testid="audio-lane" style={{
            position: 'absolute', inset: '3px 0', borderRadius: 4,
            background: 'rgba(42,140,140,0.20)', border: '1px solid #2f7f7f',
            padding: '0 6px', fontSize: 9, lineHeight: '19px', color: '#8fd2d2',
            overflow: 'hidden', whiteSpace: 'nowrap',
          }}>
            Master Audio (Program)
          </div>
        </Lane>

        {/* ---- the playhead --------------------------------------------- */}
        {now >= windowFrom && now <= windowTo && (
          <div aria-hidden="true" data-testid="playhead" style={{
            position: 'absolute', top: 0, bottom: 0, width: 2,
            left: `calc(96px + (100% - 96px) * `
              + `${(now - windowFrom) / (windowTo - windowFrom)})`,
            background: '#e0674f', pointerEvents: 'none', zIndex: 5,
          }}>
            <span className="mono" style={{
              position: 'absolute', top: -20, left: -34, padding: '1px 5px',
              borderRadius: 3, background: '#c0392b', color: '#fff', fontSize: 9,
              fontWeight: 700, whiteSpace: 'nowrap',
            }}>ON AIR {clock(now)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** The same window, read as a listing — which is how a channel is published. */
function ListView({
  segments, clock, now, nameOf, channel,
}: {
  segments: Segment[];
  clock: (at: number) => string;
  now: number;
  nameOf: (source: ProgrammeSource) => string;
  channel: Channel;
}) {
  return (
    <div data-testid="schedule-list">
      {segments.map((segment) => {
        const holds = segment.fromMs <= now && now < segment.toMs;
        return (
          <div key={segment.fromMs} className="row" data-testid="list-row"
               data-playing={holds ? 'true' : 'false'}
               style={{
                 gap: 10, padding: '6px 8px', borderRadius: 6, fontSize: 12,
                 background: holds ? 'rgba(45,110,200,0.16)' : 'transparent',
                 borderBottom: '1px solid var(--line)',
               }}>
            <span className="mono muted" style={{ flex: '0 0 auto', width: 46 }}>
              {clock(segment.fromMs)}
            </span>
            <span style={{
              flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', fontWeight: holds ? 700 : 500,
            }}>{segment.title}</span>
            <span className="muted" style={{ flex: '0 0 auto', fontSize: 10 }}>
              {segment.on.kind === 'off' ? 'off air'
                : segment.on.kind === 'rotation'
                  ? (segment.on.blockName ?? 'the loop')
                  : segment.on.kind}
            </span>
            <span className="mono muted" style={{ flex: '0 0 auto', fontSize: 10 }}>
              {offsetLabel(segment.toMs - segment.fromMs)}
            </span>
          </div>
        );
      })}
      {channel.backup && (
        <p className="small muted" style={{ margin: '8px 2px 0', fontSize: 10 }}>
          If a live feed fails, &ldquo;{nameOf(channel.backup)}&rdquo; holds the
          air for a minute, then the loop resumes.
        </p>
      )}
    </div>
  );
}

/** The day, as day-parts — the shape a schedule is planned in. [§5] */
function CalendarView({
  channel, now, listing, clock, nameOf, onAddToBlock, onRemoveFromBlock,
}: {
  channel: Channel;
  now: number;
  listing: Programme[];
  clock: (at: number) => string;
  nameOf: (source: ProgrammeSource) => string;
  onAddToBlock: (block: ChannelBlock) => void;
  onRemoveFromBlock: (block: ChannelBlock, entry: RotationEntry) => void;
}) {
  const blocks = orderedBlocks(channel);
  const holding = blockAt(channel, now)?.block.id;
  return (
    <div data-testid="schedule-calendar" style={{
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {/* The 24 hours, with the fixed slots laid on them. */}
      <div style={{ position: 'relative', height: 30 }}>
        {Array.from({ length: 25 }, (_unused, hour) => (
          <div key={hour} aria-hidden="true" style={{
            position: 'absolute', top: 12, bottom: 0, left: `${(hour / 24) * 100}%`,
            width: 1,
            background: hour % 6 === 0 ? 'var(--line)' : 'rgba(255,255,255,0.05)',
          }} />
        ))}
        {Array.from({ length: 5 }, (_unused, mark) => (
          <span key={mark} className="muted mono" style={{
            position: 'absolute', top: 0, fontSize: 9,
            left: `calc(${(mark * 6 / 24) * 100}% + 3px)`,
          }}>{String(mark * 6).padStart(2, '0')}:00</span>
        ))}
        {blocks.map((block) => (
          <div key={block.id} data-testid="calendar-block" style={{
            position: 'absolute', top: 14, bottom: 2,
            left: `${(block.fromMinute / (24 * 60)) * 100}%`,
            padding: '0 6px', borderRadius: 4, fontSize: 9, lineHeight: '14px',
            whiteSpace: 'nowrap',
            background: block.id === holding
              ? 'rgba(45,110,200,0.38)' : 'rgba(45,110,200,0.16)',
            border: '1px solid var(--line)',
          }}>{block.name}</div>
        ))}
      </div>

      {blocks.length === 0 && (
        <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
          No day-parts. Add one in Schedules and the channel gets a morning
          that is different from its evening.
        </p>
      )}

      {blocks.map((block) => (
        <div key={block.id} className="panel" data-testid="calendar-row"
             data-block-id={block.id} style={{ padding: 9 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="mono muted" style={{ fontSize: 11 }}>
              {atMinute(block.fromMinute)}
            </span>
            <strong className="grow" style={{ fontSize: 12 }}>{block.name}</strong>
            {block.id === holding && (
              <span style={{
                padding: '1px 6px', borderRadius: 3, background: '#2f6fd0',
                fontSize: 9, fontWeight: 800,
              }}>ON AIR</span>
            )}
            <button className="small" data-testid="add-to-block"
                    onClick={() => onAddToBlock(block)}
                    style={{
                      border: 0, background: 'none', padding: 0, fontSize: 11,
                      color: '#5c9ee0', cursor: 'pointer',
                    }}>+ Add pick</button>
          </div>
          {block.rotation.length === 0 ? (
            <p className="small muted" style={{ margin: '5px 0 0', fontSize: 10 }}>
              Empty — the channel&rsquo;s own loop runs through this block.
            </p>
          ) : block.rotation.map((entry) => (
            <div key={entry.id} className="row" data-testid="block-entry"
                 style={{ gap: 8, fontSize: 11, marginTop: 4 }}>
              <span style={{
                flex: 1, minWidth: 0, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{entry.title ?? nameOf(entry.source)}</span>
              <span className="mono muted" style={{ fontSize: 10 }}>
                {offsetLabel(entry.durationMs)}
              </span>
              <button type="button" data-testid="remove-from-block"
                      onClick={() => onRemoveFromBlock(block, entry)}
                      style={{
                        border: 0, background: 'none', padding: '0 2px',
                        color: 'var(--bad)', cursor: 'pointer',
                      }}>&times;</button>
            </div>
          ))}
        </div>
      ))}

      <p className="small muted" style={{ margin: 0, fontSize: 10 }}>
        {listing.length} fixed {listing.length === 1 ? 'slot sits' : 'slots sit'}
        {' '}above all of this — the first one today is at{' '}
        {listing[0] ? clock(programmeStart(listing[0])) : '—'}.
      </p>
    </div>
  );
}

/* ======================================================================== *
 *  The live studio's tabs.
 * ======================================================================== */

/**
 * The gradients Studio Two already ships for its spaces.
 *
 * Built from `SPACE_LOOKS` rather than typed out, so a space added to the
 * renderer appears here the day it exists and the chip is the colour the
 * frame will actually be. [U-18, D-19, INV-16]
 */
const SPACE_SWATCHES: Record<string, string> = Object.fromEntries(
  Object.values(SPACE_LOOKS).map((look) => [
    look.id,
    `linear-gradient(180deg, #${look.top.replace('0x', '')}, `
    + `#${look.bottom.replace('0x', '')})`,
  ]),
);

function CameraTab({
  camera, mixer, levels, onAir, armed, encoder, spaceId, onSpace,
}: {
  camera: MediaStream | null;
  mixer: MediaStream | null;
  levels: Record<string, { energy: number; speech: number }>;
  onAir: boolean;
  armed: boolean;
  encoder: { running: boolean; sent: number; dropped: number; rate: number; error: string | null };
  spaceId?: string;
  onSpace: (spaceId: string) => void;
}) {
  const feed = mixer ?? camera;
  return (
    <>
      <div className="row" style={{ gap: 9, alignItems: 'stretch' }}>
        <div style={{
          flex: 1, minWidth: 0, position: 'relative', aspectRatio: '16 / 9',
          borderRadius: 8, overflow: 'hidden', background: '#05070a',
          border: `1px solid ${armed ? '#e0c14f' : onAir ? '#c0392b' : 'var(--line)'}`,
        }}>
          {feed ? (
            <video
              autoPlay muted playsInline data-testid="host-preview"
              ref={(element) => {
                if (element && element.srcObject !== feed) element.srcObject = feed;
              }}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span className="small muted" style={{
              position: 'absolute', inset: 0, display: 'grid',
              placeItems: 'center', fontSize: 11, textAlign: 'center', padding: 10,
            }}>Camera off. GO LIVE brings it up.</span>
          )}
          <span style={{
            position: 'absolute', left: 6, bottom: 5, padding: '2px 7px',
            borderRadius: 4, background: 'rgba(5,7,10,0.8)', fontSize: 10,
            fontWeight: 600,
          }}>You (Host)</span>
        </div>
        {/*
          * VERTICAL METERS, beside the picture, where a desk has them: a
          * presenter checks their level by glancing sideways, not by reading
          * a number somewhere else on the page.
          */}
        <div className="row" style={{ gap: 4, flex: '0 0 auto', alignItems: 'flex-end' }}>
          <VMeter value={levels['master']?.energy ?? 0} />
          <VMeter value={levels['master']?.speech ?? 0} tint="#4f8ad6" />
        </div>
      </div>

      <div className="row" data-testid="feed-health" style={{
        gap: 8, fontSize: 11, padding: '6px 8px', borderRadius: 7, marginTop: 8,
        background: 'var(--panel-2)', border: '1px solid var(--line)',
      }}>
        <Dot on colour={encoder.running && encoder.dropped === 0 ? '#4f8a5b'
          : encoder.running ? '#c99a2e' : '#8e2f24'} />
        <span className="grow muted">
          {encoder.running
            ? `Feed · ${encoder.sent} sent`
              + (encoder.dropped ? ` · ${encoder.dropped} lost` : '')
            : encoder.error ?? 'No camera'}
        </span>
        {encoder.running && (
          <span className="mono muted">{Math.round(encoder.rate / 1000)} kB/s</span>
        )}
      </div>

      {/*
        * BACKGROUND / VIRTUAL SET — Studio Two's own spaces, not a second
        * table of them. A space is a measured room the renderer knows how to
        * draw; a channel picking one is picking the same thing a performance
        * picks. [D-19, INV-16, S-6]
        */}
      <Section
        text="Background / Virtual Set"
        aside={(
          <span className="muted" style={{ fontSize: 10 }}>
            {spaceId ? SPACE_LOOKS[spaceId]?.label ?? spaceId : 'None'}
            {' ▾'}
          </span>
        )}
      />
      <div style={{
        display: 'grid', gap: 5, gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
      }}>
        {SPACES.slice(0, 10).map((space) => {
          const chosen = spaceId === space.id;
          return (
            <button
              key={space.id} type="button" data-testid="virtual-set"
              data-space={space.id} data-chosen={chosen ? 'true' : 'false'}
              onClick={() => onSpace(chosen ? '' : space.id)}
              title={space.label}
              style={{
                padding: 0, aspectRatio: '1 / 1', borderRadius: 6,
                overflow: 'hidden', cursor: 'pointer', position: 'relative',
                background: SPACE_SWATCHES[space.id] ?? '#1b2028',
                border: `1px solid ${chosen ? '#3d7fd6' : 'var(--line)'}`,
                boxShadow: chosen ? '0 0 0 1px rgba(61,127,214,0.5)' : 'none',
              }}
            >
              <span style={{
                position: 'absolute', left: 0, right: 0, bottom: 0,
                fontSize: 7, lineHeight: '11px', textAlign: 'center',
                background: 'rgba(5,7,10,0.72)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{space.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function VMeter({ value, tint = '#4f8a5b' }: { value: number; tint?: string }) {
  const lit = Math.min(1, value * 1.6);
  return (
    <span aria-hidden="true" style={{
      width: 7, height: '100%', minHeight: 54, borderRadius: 3,
      background: 'var(--panel-2)', border: '1px solid var(--line)',
      display: 'flex', alignItems: 'flex-end', overflow: 'hidden',
    }}>
      <span style={{
        width: '100%', height: `${lit * 100}%`,
        background: `linear-gradient(0deg, ${tint}, #c99a2e 78%, #c0392b)`,
      }} />
    </span>
  );
}

/**
 * WHO IS ON THE BROADCAST STAGE.  [§6, ROOM §4]
 *
 * The Room decides this — by hand or by voice activity — and the channel
 * reads it. "Bring Sarah to stage" happens over there and the picture changes
 * over here, which is the whole reason a channel names a room rather than
 * growing one.
 */
function GuestsTab({
  channel, guests, levels, onAir,
}: {
  channel: Channel;
  guests: {
    sources: { id: string; label?: string; accent?: string }[];
    tooMany: boolean;
  };
  levels: Record<string, { energy: number; speech: number }>;
  onAir: boolean;
}) {
  if (!channel.live?.roomId) {
    return (
      <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
        {onAir
          ? 'No room attached — it is a feed with nobody invited. Name a '
            + 'conversation’s room when you GO LIVE and its stage becomes '
            + 'this broadcast’s.'
          : 'Go live naming a conversation’s room, and everybody staged in '
            + 'it is in the picture.'}
      </p>
    );
  }
  return (
    <div data-testid="broadcast-stage" style={{
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div className="row">
        <span className="muted grow" style={{
          fontSize: 9, letterSpacing: 0.8, fontWeight: 700,
        }}>ON STAGE</span>
        <a className="small" href={`/c/${channel.live.roomId}/room`}
           data-testid="to-room" style={{ fontSize: 10 }}>Open the room</a>
      </div>
      {guests.sources.length === 0 ? (
        <span className="small muted" style={{ fontSize: 11 }}>
          Just the camera. Bring somebody to stage in the room.
        </span>
      ) : guests.sources.map((person) => (
        <div key={person.id} className="row" data-testid="stage-person" style={{
          gap: 8, fontSize: 11, padding: '5px 7px', borderRadius: 6,
          background: 'var(--panel-2)', border: '1px solid var(--line)',
        }}>
          <span aria-hidden="true" style={{
            width: 8, height: 8, borderRadius: '50%',
            background: person.accent ?? '#3e7ca6',
          }} />
          <span className="grow" style={{
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{person.label}</span>
          <Meter value={levels[person.id]?.energy ?? 0} label={person.label ?? 'guest'} />
        </div>
      ))}
      {guests.tooMany && (
        <span className="small" style={{ fontSize: 10, color: 'var(--warn)' }}>
          {/* The Room's own warning, surfaced where it matters: a mesh this
              size is a broadcast that will drop somebody. [ROOM §6, D-14] */}
          More people on stage than a mesh should carry.
        </span>
      )}
    </div>
  );
}

/**
 * SCREENS — what you can put up over the live feed.  [§5]
 *
 * "You can bring up Studio One conversations, Studio Two performances,
 *  videos, images, graphics, announcements, prepared segments."
 *
 * A reference like every other reference: while it is up it is what goes out,
 * and the feed is underneath it.
 */
function ScreensTab({
  channel, picked, onAir, nameOf, onRollIn, onRollOut,
}: {
  channel: Channel;
  picked: LibraryItem | null;
  onAir: boolean;
  nameOf: (source: ProgrammeSource) => string;
  onRollIn: () => void;
  onRollOut: () => void;
}) {
  const up = channel.live?.segment;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div className="panel" style={{ padding: 9 }}>
        <div className="muted" style={{
          fontSize: 9, letterSpacing: 0.8, fontWeight: 700,
        }}>ROLLED IN</div>
        <div style={{ fontSize: 12, fontWeight: 600 }}>
          {up ? nameOf(up) : 'Nothing — the room is on air'}
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button
          className="small" data-testid="roll-in"
          disabled={!picked || !onAir}
          title={!onAir ? 'Only while you are live'
            : picked ? 'Put the picked item on air over the live feed'
              : 'Pick something in the Library first'}
          onClick={onRollIn}
          style={{ flex: '1 1 0' }}
        >
          Roll it in
        </button>
        <button
          className="small" data-testid="roll-out" disabled={!up}
          onClick={onRollOut} style={{ flex: '1 1 0' }}
        >
          Back to the room
        </button>
      </div>
      <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
        {picked
          ? `Ready: “${picked.title}”.`
          : 'Pick something in the Library and it can go up over the feed.'}
      </p>
    </div>
  );
}

/**
 * GRAPHICS — the identity layer.  [§10, D-16]
 *
 * "The station branding should be applied at the broadcast layer, not
 *  permanently burned into your source videos."
 *
 * So this edits a description of marks, and the playout engine draws them
 * onto the outgoing frame. Nothing here touches a file: turning the bug off
 * changes what the next segment is drawn with and no video on disk differs
 * by a byte.
 */
function GraphicsTab({
  channel, onIdentity,
}: {
  channel: Channel;
  onIdentity: (body: Record<string, unknown>) => void;
}) {
  const identity = channel.identity;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
        Drawn onto the broadcast, never onto your videos.
      </p>

      <label className="small" style={{ margin: 0, fontSize: 11 }}>
        Station bug
        <input
          data-testid="bug-text"
          defaultValue={identity?.bug?.text ?? channel.name}
          placeholder={channel.name}
          onBlur={(event) => onIdentity({
            bug: {
              text: event.target.value,
              corner: identity?.bug?.corner ?? 'top-right',
              opacity: identity?.bug?.opacity ?? 0.85,
            },
          })}
          style={{ fontSize: 12, padding: '6px 9px', marginTop: 3 }}
        />
      </label>

      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
        {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const)
          .map((corner) => {
            const chosen = (identity?.bug?.corner ?? 'top-right') === corner;
            return (
              <button
                key={corner} type="button" data-testid="bug-corner"
                data-corner={corner} data-chosen={chosen ? 'true' : 'false'}
                onClick={() => onIdentity({
                  bug: {
                    text: identity?.bug?.text ?? channel.name,
                    corner, opacity: identity?.bug?.opacity ?? 0.85,
                  },
                })}
                style={{
                  padding: '3px 7px', fontSize: 10, borderRadius: 5,
                  border: `1px solid ${chosen ? '#3d7fd6' : 'var(--line)'}`,
                  background: chosen ? 'rgba(45,110,200,0.22)' : 'transparent',
                }}
              >{corner.replace('-', ' ')}</button>
            );
          })}
      </div>

      <Section text="Lower thirds" />
      <div className="row" style={{ gap: 4 }}>
        {(['never', 'at-start', 'always'] as const).map((show) => {
          const chosen = (identity?.lowerThird?.show ?? 'at-start') === show;
          return (
            <button
              key={show} type="button" data-testid="lower-third"
              data-show={show} data-chosen={chosen ? 'true' : 'false'}
              onClick={() => onIdentity({
                lowerThird: {
                  show, holdMs: identity?.lowerThird?.holdMs ?? 8000,
                  ...(identity?.lowerThird?.presenter
                    ? { presenter: identity.lowerThird.presenter } : {}),
                },
              })}
              style={{
                flex: 1, padding: '5px 4px', fontSize: 10, borderRadius: 6,
                border: `1px solid ${chosen ? '#3d7fd6' : 'var(--line)'}`,
                background: chosen ? 'rgba(45,110,200,0.22)' : 'transparent',
              }}
            >{show}</button>
          );
        })}
      </div>

      <label className="small" style={{ margin: 0, fontSize: 11 }}>
        Presenter
        <input
          data-testid="presenter"
          defaultValue={identity?.lowerThird?.presenter ?? ''}
          placeholder="Nobody knows this but you"
          onBlur={(event) => onIdentity({
            lowerThird: {
              show: identity?.lowerThird?.show ?? 'at-start',
              holdMs: identity?.lowerThird?.holdMs ?? 8000,
              presenter: event.target.value,
            },
          })}
          style={{ fontSize: 12, padding: '6px 9px', marginTop: 3 }}
        />
      </label>

      <label className="small" style={{ margin: 0, fontSize: 11 }}>
        LIVE lamp
        <input
          data-testid="live-lamp"
          defaultValue={identity?.liveLamp?.text ?? 'LIVE'}
          onBlur={(event) => onIdentity({
            liveLamp: {
              corner: identity?.liveLamp?.corner ?? 'top-left',
              text: event.target.value,
            },
          })}
          style={{ fontSize: 12, padding: '6px 9px', marginTop: 3 }}
        />
      </label>
      <p className="small muted" style={{ margin: 0, fontSize: 10 }}>
        The lamp is drawn only while the channel is actually live. A channel
        whose LIVE light is part of its logo is a channel lying to its viewers.
      </p>
    </div>
  );
}

/**
 * AUDIO — every microphone, and the one mix they add up to.
 *
 * Who is SEEN is the Room's decision; who is HEARD is everybody, which is why
 * this lists each stage microphone rather than only the one on screen. A
 * broadcast that muted a guest until the vision cut to them would clip the
 * first word of every answer. [ROOM §4]
 */
function AudioTab({
  guests, levels, encoder, onAir, keeping, onKeep,
}: {
  guests: { sources: { id: string; label?: string }[] };
  levels: Record<string, { energy: number; speech: number }>;
  encoder: { running: boolean; rate: number };
  onAir: boolean;
  keeping: boolean;
  onKeep: (keep: boolean) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div className="row" data-testid="master-audio" style={{
        gap: 8, padding: '7px 9px', borderRadius: 7, fontSize: 11,
        background: 'var(--panel-2)', border: '1px solid var(--line)',
      }}>
        <span className="grow" style={{ fontWeight: 600 }}>Master (Program)</span>
        <Meter value={levels['master']?.energy ?? 0} label="master" />
        <span className="mono muted" style={{ fontSize: 10 }}>
          {encoder.running ? `${Math.round(encoder.rate / 1000)} kB/s` : '—'}
        </span>
      </div>

      {guests.sources.length === 0 ? (
        <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
          {onAir ? 'One microphone: yours.'
            : 'Nothing is live. Microphones appear when the stage does.'}
        </p>
      ) : guests.sources.map((person) => (
        <div key={person.id} className="row" data-testid="audio-channel" style={{
          gap: 8, fontSize: 11, padding: '5px 7px', borderRadius: 6,
          background: 'var(--panel-2)', border: '1px solid var(--line)',
        }}>
          <span className="grow" style={{
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{person.label ?? person.id}</span>
          <span className="muted" style={{ fontSize: 9 }}>
            {(levels[person.id]?.speech ?? 0) > 0.5 ? 'voice' : ''}
          </span>
          <Meter value={levels[person.id]?.energy ?? 0} label={person.label ?? 'mic'} />
        </div>
      ))}

      {/*
        * SAVE THIS LIVE SESSION, said in words as well as by the red circle
        * in the transport — because the circle is a decision somebody has to
        * be able to read, not just press. [§8]
        */}
      <label className="row" data-testid="keep-live-label" style={{
        gap: 8, fontSize: 12, padding: '7px 9px', borderRadius: 7, margin: 0,
        flexWrap: 'nowrap', alignItems: 'flex-start',
        border: `1px solid ${keeping ? '#c0392b' : 'var(--line)'}`,
        background: keeping ? 'rgba(192,57,43,0.14)' : 'var(--panel-2)',
      }}>
        <input
          type="checkbox" checked={keeping} disabled={!onAir}
          onChange={(event) => onKeep(event.target.checked)}
        />
        <span style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 600 }}>Save this live session</span>
          <span className="muted" style={{ display: 'block', fontSize: 10 }}>
            {keeping
              ? 'It becomes an archived recording when you end it.'
              : 'Off: the live buffer is discarded after the broadcast.'}
          </span>
        </span>
      </label>
    </div>
  );
}

/* ======================================================================== *
 *  Pictures and small things.
 * ======================================================================== */

/** Where a reference's bytes are. The one place a source becomes a URL. */
function urlFor(source: ProgrammeSource): string | null {
  if (source.kind === 'media') return `/api/library/${source.assetId}`;
  if (source.kind === 'render') {
    return `/api/${source.document === 'performance' ? 'performances' : 'conversations'}`
      + `/${source.documentId}/renders/${source.planHash}/file`;
  }
  return null;
}

/**
 * A poster frame.
 *
 * `preload="metadata"` and a time fragment: the browser fetches the header
 * and one frame rather than the film, which is what makes a rail of eight
 * thumbnails cost about as much as a rail of eight icons.
 */
function Thumb({ source }: { source: ProgrammeSource }) {
  const url = urlFor(source);
  if (!url) {
    return (
      <span aria-hidden="true" className="muted" style={{
        position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
        fontSize: 9, background: '#121820',
      }}>{source.kind === 'live' ? 'LIVE' : 'EVENT'}</span>
    );
  }
  if (source.kind === 'media' && source.form === 'image') {
    return (
      <img alt="" src={url} data-testid="thumb"
           style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    );
  }
  return (
    <video
      data-testid="thumb" src={`${url}#t=1`} preload="metadata" muted playsInline
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}

/** `1:04:17`, or `04:17`. The brief's column, hours only once there are any. */
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

/** `00:15:32` — the gallery clock, always three fields. */
function hms(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}`
    + `:${pad(total % 60)}`;
}

/** Minutes past midnight, as a clock. */
function atMinute(minute: number): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(minute / 60) % 24)}:${pad(minute % 60)}`;
}

/** Which studio a reference came out of, for a row's second line. */
function studioOf(source: ProgrammeSource): string {
  switch (source.kind) {
    case 'render':
      return source.document === 'performance' ? 'Studio Two' : 'Studio One';
    case 'media': return 'Library';
    case 'live': return 'Live ingest';
    case 'live_event': return 'Booked live';
  }
}

function sameDay(a: number, b: number, timezone: string): boolean {
  const day = (at: number) => new Date(at).toLocaleDateString('en-GB', { timeZone: timezone });
  return day(a) === day(b);
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
              padding: '5px 4px', fontSize: 11, borderRadius: 7,
              border: `1px solid ${minutes === option ? '#3d7fd6' : 'var(--line)'}`,
              background: minutes === option
                ? 'rgba(45,110,200,0.22)' : 'var(--panel-2)',
            }}
          >{option} min</button>
        ))}
      </div>
      <label className="row muted" style={{ gap: 6, fontSize: 11, margin: 0 }}>
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
              style={{ width: '100%', padding: '6px 10px' }}>
        Add to the loop
      </button>
      <div className="row" style={{ gap: 5 }}>
        <button className="small" data-testid="schedule-next-hour"
                onClick={() => onSchedule(
                  new Date(topOfHour).toISOString(), minutes * MINUTE, loop)}
                style={{ flex: '1 1 0', padding: '6px 8px' }}>
          At {new Date(topOfHour).toLocaleTimeString('en-GB', {
            hour: '2-digit', minute: '2-digit',
          })}
        </button>
        <button className="small" data-testid="schedule-tomorrow"
                onClick={() => onSchedule(
                  new Date(topOfHour + DAY).toISOString(), minutes * MINUTE, loop)}
                style={{ flex: '1 1 0', padding: '6px 8px' }}>
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
function Monitor({
  on, channel, playing,
}: { on: OnAir; channel: Channel; playing: boolean }) {
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
        {/* Honest: the feed's encoder writes to the channel's buffer, and a
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
        <span style={{ fontSize: 11 }}>
          Nobody is live — the loop is on air
        </span>
      </div>
    );
  }

  const url = urlFor(source)!;

  if (source.kind === 'media' && source.form === 'image') {
    return (
      <img alt="" src={url} data-testid="monitor-still"
           style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    );
  }

  return (
    <video
      data-testid="monitor-video" src={url} autoPlay={playing} muted playsInline
      ref={(element) => {
        if (!element) return;
        if (!playing) { element.pause(); return; }
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
