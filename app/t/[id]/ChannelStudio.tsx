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
import { LIVE_DELAY_MS } from '../../../src/domain/playout.js';
import StudioBar from '../../StudioBar.js';
import Icon from '../../Icon.js';
import {
  MenuButton, MenuHost, RightClickHint, useRowMenu, type MenuEntry,
} from '../../Menu.js';
import { useLiveEncoder } from './useLiveEncoder.js';
import { useBroadcastGuests } from './useBroadcastGuests.js';
import { arrangementFor, useBroadcastMixer } from './useBroadcastMixer.js';
import { useFeedLevels } from './useFeedLevels.js';
import GuestsTab from './GuestsTab.js';
import SlidesPanel from './SlidesPanel.js';
import { type ScreenShare, useScreenShare } from './useScreenShare.js';
import {
  type Devices, cameraConstraints, microphoneConstraints, useDevices,
} from '../../useDevices.js';
import { useQuality } from '../../useQuality.js';
import { useConfirm } from '../../Confirm.js';
import {
  type Quality, type QualityId, QUALITIES, QUALITY_ORDER, aboveTransmission,
  qualityFor, rateSentence, rateVerdict, targetBytesPerSecond,
} from '../../../src/domain/quality.js';

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
  initial, studioOneId, studioTwoId, serverNow, transmission,
}: {
  initial: Channel;
  studioOneId?: string;
  studioTwoId?: string;
  /** When the server drew this page. See the note where it is passed. */
  serverNow?: number;
  /** What the channel puts on the wire, as against what this machine sends. */
  transmission?: QualityId;
}) {
  const [channel, setChannel] = useState(initial);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<ProgrammeSource[]>([]);
  const [violations, setViolations] = useState<string[]>([]);
  /**
   * WHETHER ANYTHING IS ACTUALLY GOING OUT.  [§18]
   *
   * Not derived here, because it cannot be: the playout engine is a separate
   * process and this browser has no way to see it. The server looks at the
   * heartbeat and at the age of the newest segment, and hands back the
   * answer and a sentence.
   */
  const [health, setHealth] = useState<{
    engine: 'running' | 'stale' | 'stopped';
    stream: 'transmitting' | 'stalled' | 'silent';
    says: string | null;
  } | null>(null);

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
  /*
   * WHICH camera and WHICH microphone. [§23]
   *
   * Absent means the browser's default, which is what this did before and
   * is right for a laptop with one of each. Named means the capture card,
   * the phone or the second microphone — and the constraint is `exact`, so
   * a chosen device that cannot be opened fails loudly rather than
   * substituting the built-in webcam onto the air.
   */
  const [cameraId, setCameraId] = useState<string | undefined>(undefined);
  const [micId, setMicId] = useState<string | undefined>(undefined);
  const devices = useDevices();
  /*
   * HOW GOOD, which is one setting and not four. [quality.ts]
   *
   * The same preset reaches the camera (what is asked of it), the mixer (the
   * canvas everything is composited onto) and the encoder (the ceiling it
   * may spend). Any one of them raised alone does nothing, because the
   * encoder records the CANVAS and never sees the camera — which is why
   * this is a preset and not three menus.
   */
  const quality = useQuality();
  /*
   * ASKING BEFORE THE IRREVERSIBLE ONES. [Confirm.tsx]
   *
   * These replace `window.confirm`, which on a dark desk is a white box
   * in the operating system's typography, arriving at the top of the
   * window far from the control that raised it — and whose only buttons
   * are OK and Cancel, neither of which says what is about to happen.
   */
  const { confirm, dialog: confirmDialog } = useConfirm();
  const liveNow = channel.live && channel.live.phase !== 'ended';
  const guests = useBroadcastGuests({
    roomId: channel.live?.roomId,
    localStream: camera,
    enabled: Boolean(liveNow),
  });
  /*
   * A SHARED SCREEN IS A SOURCE, NOT A ROLL-IN. [§22]
   *
   * Rolling a reference in REPLACES the live feed with a file; a shared web
   * page is part of the picture, with the presenter still in frame beside
   * it. So it joins the mixer's list and the layout table arranges it,
   * exactly as another guest would be.
   */
  const share = useScreenShare();
  const mixed = useMemo(() => (
    share.stream
      ? [...guests.sources,
        { id: 'screen', stream: share.stream, label: share.label ?? 'Screen' }]
      : guests.sources
  ), [guests.sources, share.stream, share.label]);
  const mixer = useBroadcastMixer({
    sources: mixed,
    layoutId: arrangement,
    enabled: Boolean(liveNow) && mixed.length > 0,
    /*
     * THE CANVAS IS THE REAL CEILING. It always took these three and the
     * studio never passed them, so every broadcast this product has ever
     * made was composited at 1280×720 whatever the cameras could do.
     */
    width: quality.quality.width,
    height: quality.quality.height,
    fps: quality.quality.fps,
  });
  const encoder = useLiveEncoder(id, mixer.stream, quality.quality);

  /* The meters. Every microphone on the desk, and the mix they add up to. */
  const metered = useMemo(() => {
    const entries = mixed.map(
      (person) => ({ id: person.id, stream: person.stream }));
    if (mixer.stream) entries.push({ id: 'master', stream: mixer.stream });
    return entries;
  }, [mixed, mixer.stream]);
  const levels = useFeedLevels(metered, Boolean(liveNow));

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/channels/${id}`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    setChannel(data.channel);
    setMissing(data.missing ?? []);
    setViolations(data.violations ?? []);
    setHealth(data.health ?? null);
  }, [id]);

  useEffect(() => { void refresh(); }, [refresh]);

  /*
   * The engine can die at any moment and nothing on this page would change
   * on its own. Every ten seconds is well inside ENGINE_STALE_MS, so the
   * lamp goes red within one threshold of the process going away.
   */
  useEffect(() => {
    const timer = setInterval(() => { void refresh(); }, 10_000);
    return () => clearInterval(timer);
  }, [refresh]);

  /*
   * The camera follows the session, not a button. Arming opens it, ending
   * closes it — so a broadcast that was ended from another tab, or by the
   * document changing underneath, does not leave a camera light on.
   */
  const phase = channel.live?.phase;
  useEffect(() => {
    let cancelled = false;
    if (phase === 'armed' || phase === 'on_air') {
      /*
       * Re-opened when the chosen device changes, which is why the old
       * stream is stopped first: two streams from one camera is a second
       * red light on the operator's machine, and on some drivers it is an
       * error rather than a picture.
       */
      for (const track of camera?.getTracks() ?? []) track.stop();
      void navigator.mediaDevices.getUserMedia({
        video: cameraConstraints(
          cameraId, quality.quality.width, quality.quality.height,
          quality.quality.fps),
        audio: microphoneConstraints(micId),
      }).then((media) => {
        if (cancelled) {
          for (const track of media.getTracks()) track.stop();
          return;
        }
        setCamera(media);
        /* Labels arrive with permission, so the menu is re-read now. [§23] */
        void devices.refresh();
      }).catch(() => setError(cameraId
        ? 'that camera could not be opened — it may be in use by another '
          + 'application, or unplugged'
        : 'the camera could not be opened'));
    } else {
      for (const track of camera?.getTracks() ?? []) track.stop();
      if (camera) setCamera(null);
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, cameraId, micId, quality.id]);

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
    confirm({
      question: 'Going live opens your camera and puts it in PREVIEW. '
        + 'Nothing reaches the wire until you press TAKE LIVE.',
      field: { label: 'What is the live show called?', initial: 'Live' },
      verb: 'Go live',
      go: (label) => {
    /*
     * IT NO LONGER ASKS WHICH ROOM. It used to, through a second prompt
     * wanting a raw `conv_…` identifier typed from memory — which is why
     * nobody could get a guest on the air without leaving the control room.
     * Arming opens the camera; the Guests tab is where a room is chosen and
     * people are invited, and nothing reaches the wire until TAKE LIVE. [§6]
     */
        void patch({ action: 'go-live', label });
      },
    });
  };
  const endLive = () => confirm({
    question: keeping
      ? 'End the broadcast? It will be saved as a recording.'
      : 'End the broadcast? It is not being saved, so the live buffer is '
        + 'discarded.',
    verb: 'End the broadcast',
    danger: true,
    go: () => void patch({ action: 'end-live' }),
  });

  return (
    /*
      * ONE MENU FOR THE CONTROL ROOM. The rails that want one are three
      * components deep, so the host is here and they reach it through
      * `useRowMenu` rather than through four intermediate props. [D-19]
      */
    <MenuHost>
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
            border: `1px solid ${on.kind === 'live' ? 'var(--state-live-dim)'
              : on.kind === 'off' ? 'var(--line)' : 'rgba(45,110,200,0.45)'}`,
          }}>
            <Dot on={on.kind !== 'off'} colour={on.kind === 'live' ? 'var(--state-live)'
              : on.kind === 'emergency' || on.kind === 'backup' ? 'var(--ink-on-armed)' : 'var(--accent)'} />
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: 0.4 }}>
              {on.kind === 'off' ? 'OFF AIR' : 'ON AIR'}
            </span>
            <span className="mono" style={{ fontSize: 'var(--text-sm)' }}>{hms(elapsedMs)}</span>
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
            {/*
              * NOT A CTA. This was a full-width filled blue button at the
              * top of the rail — the single most SaaS-looking object in
              * the room, and the brightest thing on a screen whose
              * brightest thing should be the programme. Adding to a
              * playlist is an ordinary, frequent, reversible action; it
              * gets an ordinary control. [brief §4]
              */}
            <button
              type="button" className="ctl" data-testid="add-to-playlist"
              aria-expanded={adding}
              onClick={() => { setAdding((open) => !open); setRailTab('library'); }}
              style={{ flex: 1, padding: '7px 10px' }}
            >
              + Add to playlist
            </button>
            <button
              type="button" aria-label="Search" data-testid="rail-search"
              onClick={() => setFilter((value) => (value === null ? '' : null))}
              className={`ctl${filter === null ? '' : ' is-on'}`}
              aria-pressed={filter !== null}
              style={{ flex: '0 0 auto', width: 32, padding: 0, height: 30 }}
            ><Icon name="search" size={13} /></button>
          </div>

          {filter !== null && (
            <div style={{ padding: '6px 9px 0' }}>
              <input
                autoFocus value={filter} data-testid="rail-filter"
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Find something…"
                style={{ fontSize: 'var(--text-sm)', padding: '6px 9px' }}
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
              margin: 0, padding: '7px 10px 0', fontSize: 'var(--text-xs)',
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
                /*
                  * WHAT A FINISHED RENDER CAN BE DONE WITH, on the render.
                  * All four of these already existed and all four needed
                  * the item to be SELECTED first, then a control found
                  * somewhere else on the screen — the emergency cut-away
                  * is four hundred lines away from the list it acts on.
                  * Right-clicking the thing is the shortest way there,
                  * and it selects it on the way so the rest of the screen
                  * agrees about what you meant. [§3]
                  */
                itemsFor={(item) => [
                  {
                    label: 'Add to the loop',
                    hint: 'Fifteen minutes, adjustable afterwards',
                    onSelect: () => {
                      setPicked(sourceKey(item.source));
                      void patch({
                        action: 'rotate', source: item.source,
                        durationMs: 15 * MINUTE, title: item.title,
                      });
                      setRailTab('playlist');
                    },
                  },
                  {
                    label: 'Give it a time\u2026',
                    onSelect: () => {
                      setPicked(sourceKey(item.source));
                      setAdding(true);
                    },
                  },
                  {
                    label: 'Make it the backup',
                    hint: 'What goes out if the live feed fails',
                    onSelect: () => {
                      setPicked(sourceKey(item.source));
                      void patch({ action: 'backup', source: item.source });
                    },
                  },
                  {
                    label: 'Cut away to it now\u2026',
                    danger: true,
                    disabled: onAir ? false : 'The channel is not on air',
                    onSelect: () => {
                      setPicked(sourceKey(item.source));
                      confirm({
                        question: `Cut away to \u201c${item.title}\u201d now? `
                          + 'Whatever is on air stops mid-programme and the '
                          + 'audience sees the change immediately.',
                        verb: 'Cut away now',
                        danger: true,
                        go: () => void patch({
                          action: 'emergency', source: item.source,
                        }),
                      });
                    },
                  },
                ]}
              />
            )}
            {railTab === 'schedules' && (
              <SchedulesRail
                channel={channel} listing={listing} nameOf={nameOf} clock={clock}
                missingKeys={missingKeys} liveId={live?.id} chosen={chosen}
                keep={railRows.keep}
                onChoose={setChosen}
                onUnschedule={(entry) => {
                  confirm({
                    question: 'Take it off the schedule? The video itself is '
                      + 'untouched — it stays in the library.',
                    verb: 'Unschedule',
                    danger: true,
                    go: () => void patch({
                      action: 'unschedule', programmeId: entry.id,
                    }),
                  });
                }}
                onAddBlock={() => {
                  /*
                   * TWO PROMPTS IN A ROW WAS THE WORST OF THEM. A native
                   * dialog cannot hold two fields, so adding a day-part
                   * meant answering a question, having it vanish, and
                   * answering a second one with no way back to the first
                   * — and cancelling the second silently discarded the
                   * name you had already typed.
                   *
                   * One dialog, asked in one breath. The name is the
                   * field; the time comes with it in the same question
                   * because the two are one decision.
                   */
                  confirm({
                    question: 'A day-part is a named stretch of the day '
                      + '\u2014 Morning, Evening \u2014 that programmes '
                      + 'can be scheduled inside.',
                    field: {
                      label: 'What is it called, and when does it start?',
                      placeholder: 'Morning 07:00',
                      initial: 'Morning 07:00',
                    },
                    verb: 'Add the day-part',
                    go: (answer) => {
                      /*
                       * "Morning 07:00" — the time is the last word, and
                       * anything before it is the name. Parsed leniently
                       * because a person typing a name with a number in
                       * it should not be punished for it.
                       */
                      const match = /^(.*?)\s*(\d{1,2}):(\d{2})\s*$/.exec(answer);
                      const name = (match?.[1] ?? answer).trim() || 'Day-part';
                      const hours = Number(match?.[2] ?? 0);
                      const minutes = Number(match?.[3] ?? 0);
                      void patch({
                        action: 'add-block', name,
                        fromMinute: hours * 60 + minutes,
                      });
                    },
                  });
                }}
                onRemoveBlock={(block) => confirm({
                  question: `Remove the ${block.name} block? The programmes `
                    + 'inside it stay where they are — only the block goes.',
                  verb: 'Remove the block',
                  danger: true,
                  go: () => void patch({ action: 'remove-block', blockId: block.id }),
                })}
              />
            )}
          </div>

          <div className="row" style={{
            borderTop: '1px solid var(--line)', padding: '7px 10px',
            fontSize: 'var(--text-2xs)', gap: 8, flex: '0 0 auto',
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
            <Frame testid="program-output" well>
              <Head
                text="Program Output"
                sub="Live stream"
                right={<Status testid="program-mode" mode={on.kind} {...AIR[on.kind]} />}
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
                  /*
                   * THE FRAME AROUND THE TRANSMISSION. 8px of rounding
                   * on the one rectangle in the product that IS a
                   * television picture — a screen has square corners,
                   * and rounding them is the difference between a
                   * monitor and a thumbnail. True black inside, a
                   * hairline around it, nothing else: the brief's
                   * "do not decorate the video". [brief §5]
                   */
                  position: 'relative', flex: '1 1 auto', minHeight: 150,
                  margin: 9, background: 'var(--screen-bed)', borderRadius: 'var(--radius-screen)',
                  border: '1px solid var(--console-edge)',
                  boxShadow: 'var(--console-well)', overflow: 'hidden',
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
                {/*
                  * OVERLAYS ON A PICTURE ARE GLASS, NOT PAINT. A flat
                  * 80%-black plate is a hole cut in the programme; a
                  * blurred, slightly translucent plate with a hairline of
                  * light on its top edge sits ON the picture and lets the
                  * frame continue underneath. Every broadcast interface
                  * does this and it is the single biggest difference
                  * between a monitor that looks professional and one that
                  * looks like a web page with labels on it.
                  */}
                <span data-testid="monitor-clock" className="mono" style={{
                  position: 'absolute', right: 10, top: 10,
                  padding: '3px var(--space-3)',
                  /*
                   * A MONITOR OSD IS PRINTED ON THE GLASS, not floated
                   * over it. These three plates were frosted glass —
                   * `backdrop-filter: blur(10px) saturate(1.1)` — which
                   * is the one material the brief rules out by name,
                   * and on a broadcast monitor it is actively wrong: a
                   * blurred sample of the picture behind a status
                   * readout means the readout changes appearance with
                   * the programme, and the thing it is over is the
                   * thing you are judging. Flat, opaque, square. It
                   * also costs a compositor pass per frame on a surface
                   * that repaints thirty times a second. [brief §19]
                   */
                  borderRadius: 'var(--radius-screen)',
                  background: 'rgba(0,0,0,0.72)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  fontSize: 'var(--text-xs)',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '0.02em',
                  color: 'rgba(255,255,255,0.94)',
                }}>{clock(now)}</span>

                <span data-testid="on-air-lamp" data-mode={on.kind} style={{
                  position: 'absolute', left: 10, top: 10,
                  padding: '3px var(--space-3)',
                  borderRadius: 'var(--radius-screen)',
                  fontSize: 'var(--text-2xs)',
                  fontWeight: 'var(--weight-bold)',
                  letterSpacing: '0.1em',
                  background: on.kind === 'live'
                    ? 'var(--state-live-dim)'
                    : on.kind === 'backup' || on.kind === 'emergency'
                      ? '#8e6a1f'
                      : on.kind === 'off' ? 'rgba(0,0,0,0.72)'
                        : 'rgba(0,0,0,0.72)',
                  border: `1px solid ${on.kind === 'live'
                    ? '#ff6d5c' : 'rgba(255,255,255,0.14)'}`,
                  color: on.kind === 'off'
                    ? 'rgba(255,255,255,0.72)' : 'var(--ink-000)',
                }}>
                  {/* A lamp is a drawn circle, not U+25CF — which is a
                      different diameter and a different baseline in
                      every font, inside a plate 14 pixels tall. */}
                  {on.kind === 'live' && (
                    <span aria-hidden="true" style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: 'currentColor', flex: '0 0 auto',
                      marginRight: 4, display: 'inline-block',
                      verticalAlign: 'middle',
                    }} />
                  )}
                  {on.kind === 'live' ? 'LIVE'
                    : on.kind === 'backup' ? 'BACKUP'
                      : on.kind === 'emergency' ? 'EMERGENCY'
                        : on.kind === 'off' ? 'OFF AIR' : 'ON AIR'}
                </span>

                {on.kind !== 'off' && (
                  <span data-testid="now-playing-chip" style={{
                    position: 'absolute', left: 10, bottom: 10, maxWidth: '62%',
                    padding: '4px var(--space-4)',
                    borderRadius: 'var(--radius-screen)',
                    background: 'rgba(0,0,0,0.72)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    fontSize: 'var(--text-xs)',
                    color: 'rgba(255,255,255,0.94)',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    <span style={{
                      fontSize: 'var(--text-2xs)', marginRight: 'var(--space-3)',
                      letterSpacing: '0.09em',
                      fontWeight: 'var(--weight-bold)',
                      color: 'rgba(255,255,255,0.5)',
                    }}>
                      NOW PLAYING
                    </span>
                    {titleOf(on)}
                    {(on.kind === 'programme' || on.kind === 'rotation')
                      && ` · until ${clock(on.untilMs)}`}
                  </span>
                )}

                {/* The station lockup, bottom right, where a channel's is. */}
                {/*
                  * THE STATION LOCKUP GETS NO PLATE. A channel's bug is
                  * composited onto the outgoing frame with no box behind
                  * it (§10), so a box here would show the desk something
                  * no viewer sees. What keeps it legible over a bright
                  * frame instead is a soft dark shadow behind the letters
                  * themselves — which is exactly what the renderer does.
                  */}
                <span className="row" data-testid="station-lockup" style={{
                  position: 'absolute', right: 10, bottom: 10,
                  gap: 'var(--space-3)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 'var(--weight-bold)',
                  letterSpacing: 'var(--tracking-tight)',
                  color: channel.identity?.ink ?? 'var(--ink-000)',
                  textShadow: '0 1px 6px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9)',
                  opacity: channel.identity?.bug?.opacity ?? 0.9,
                }}>
                  {channel.identity?.bug?.text ?? channel.name}
                  {on.kind === 'live' && (
                    <span style={{
                      padding: '1px var(--space-3)',
                      borderRadius: 'var(--radius-xs)',
                      background: 'var(--state-live)',
                      color: 'var(--ink-000)', fontSize: 'var(--text-2xs)',
                      letterSpacing: '0.09em',
                      fontWeight: 'var(--weight-bold)',
                      boxShadow: '0 0 0 1px rgba(0,0,0,0.55)',
                      textShadow: 'none',
                    }}>{channel.identity?.liveLamp?.text ?? 'LIVE'}</span>
                  )}
                </span>
              </div>
              <Legend on={on} />
            </Frame>

            {/* ---- PREVIEW (NEXT) + MULTI-VIEW ------------------------- */}
            {/*
              * PREVIEW AND MULTI-VIEW SPLIT THE COLUMN, rather than Preview
              * taking whatever its own 16:9 happened to come to. Aspect-
              * locked, it shrank as the column narrowed while Program
              * Output beside it flexed — so the two monitors that are meant
              * to be read together stopped being the same height. [D-22]
              */}
            <div style={{
              display: 'grid', gap: 10, minWidth: 0, minHeight: 0,
              gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
            }}>
              <Frame testid="preview-next" well>
                <Head
                  text="Preview"
                  sub="Next"
                  /*
                    * PREVIEW REPORTS ITS STATE WHERE PROGRAM REPORTS ITS
                    * STATE. These two monitors are read together — that is
                    * the entire reason a gallery has two — and one of them
                    * was saying what it was doing in a badge in its head
                    * while the other said it in a pill lying on the
                    * picture. Same object, same corner, same words.
                    */
                  right={armed
                    ? <Status testid="preview-mode" mode="armed"
                              tone="is-armed" text="Armed" />
                    : upNext
                      ? <Status testid="preview-mode" mode="queued"
                                tone="is-off" text="Next" />
                      : <Status testid="preview-mode" mode="empty"
                                tone="is-off" text="Empty" />}
                />
                <div style={{
                  position: 'relative', flex: '1 1 auto', minHeight: 96,
                  margin: 9, background: 'var(--screen-bed)', borderRadius: 'var(--radius-screen)',
                  overflow: 'hidden',
                  border: `1px solid ${armed ? 'var(--ink-on-armed)' : 'var(--line)'}`,
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
                      placeItems: 'center', fontSize: 'var(--text-xs)',
                    }}>Nothing queued</span>
                  )}
                  <span data-testid="preview-title" style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0,
                    padding: '14px 9px 6px', fontSize: 'var(--text-xs)', fontWeight: 600,
                    background: 'linear-gradient(180deg, transparent, rgba(5,7,10,0.92))',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {armed ? 'The live studio — armed'
                      : upNext?.title ?? '—'}
                  </span>
                </div>
              </Frame>

              <Frame testid="multi-view">
                <Head
                  text="Multi-view"
                  sub="Sources"
                  right={(
                    <span className="muted" style={{
                      fontSize: 'var(--text-2xs)', whiteSpace: 'nowrap', flex: '0 0 auto',
                    }}>
                      {guests.sources.length || 1} in mix
                    </span>
                  )}
                />
                <MultiView
                  channel={channel} on={on} camera={camera} guests={guests.sources}
                  library={library} nameOf={nameOf} studioOneId={studioOneId}
                  studioTwoId={studioTwoId} onAir={onAir}
                  onTake={(source) => void patch({ action: 'roll-in', source })}
                  onBackToRoom={() => void patch({ action: 'roll-in', source: null })}
                  onGraphics={() => setDeskTab('graphics')}
                />
              </Frame>
            </div>
          </div>

          {/* ---- 24/7 SCHEDULE ---------------------------------------- */}
          <Frame testid="schedule-deck">
            {/*
              * THE SCHEDULE'S HEAD IS THE SAME LEGEND AS EVERY OTHER
              * MODULE'S. It was hand-written rather than a `Head`,
              * because it carries three controls — so it kept a 13px
              * bold title while the five modules around it became
              * legends, and it was the last sentence-case heading in
              * the room. The markup stays hand-written; only the voice
              * changes. [brief §13]
              */}
            <div className="row module-head" style={{ flexWrap: 'wrap' }}>
              <span className="module-label">24/7 Schedule</span>
              <span className="module-sub" data-testid="schedule-day" style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                {sameDay(windowNow, now, channel.timezone)
                  ? 'Today'
                  : new Date(windowNow).toLocaleDateString('en-GB', {
                    weekday: 'short', day: 'numeric', month: 'short',
                    timeZone: channel.timezone,
                  })}
                <Icon name="chevron" size={9} turn={90} />
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
                * FOLLOW CLOCK, not "auto-play".
                *
                * The benchmark called it Auto-play and that is what it was
                * called here, and it was a lie in one word: it plays
                * nothing. It pins the timeline window. Nothing on this page
                * can stop the channel — a control room whose most
                * prominent toggle appears to be a transport control is a
                * control room somebody reaches for in a hurry. [D-22]
                */}
              <label className="row" data-testid="auto-play" style={{
                gap: 6, fontSize: 'var(--text-xs)', margin: 0, cursor: 'pointer',
              }} title="Keep the timeline on the clock. The transmission is unaffected.">
                <input
                  type="checkbox" checked={pinned === null}
                  onChange={(event) => setPinned(event.target.checked ? null : now)}
                />
                Follow clock
              </label>
              {pinned !== null && (
                <span className="row" style={{ gap: 4 }}>
                  <button className="small" data-testid="window-back"
                          onClick={() => setPinned((at) => (at ?? now) - HOUR)}
                          style={{ padding: '2px 7px', lineHeight: 0 }}
                  ><Icon name="chevron" size={11} turn={180} /></button>
                  <button className="small" data-testid="window-forward"
                          onClick={() => setPinned((at) => (at ?? now) + HOUR)}
                          style={{ padding: '2px 7px', lineHeight: 0 }}
                  ><Icon name="chevron" size={11} /></button>
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
                /*
                  * ☰ WAS NOT AN ICON. It is U+2630, the trigram for
                  * heaven, and it is read as a hamburger menu by
                  * everybody — over a button that opens the mixer. It
                  * was also the last glyph-as-icon in the studios and
                  * the last hand-written font size, which is not a
                  * coincidence: a character used as a symbol has to be
                  * sized like text because it IS text, and it renders
                  * at a different weight on every platform.
                  */
                style={{
                  border: 0, background: 'none', padding: 0, lineHeight: 0,
                  cursor: 'pointer', color: mixerOpen ? 'var(--accent-soft)' : 'var(--muted)',
                }}
              ><Icon name="faders" size={15} /></button>
            )}
          />

          <div className="row" style={{
            gap: 6, padding: '0 9px 8px', flexWrap: 'nowrap', flex: '0 0 auto',
          }}>
            {/*
              * THE ONE LOUD CONTROL IN THIS PANEL, and only one.
              *
              * GO LIVE and END LIVE were two equal pills side by side —
              * a filled red one and an outlined red one — which is a
              * pair of SaaS buttons and, worse, gives equal visual
              * weight to arming and to stopping. On a desk exactly one
              * of these is available at any moment, and the other is
              * the way back. So the available one is the loud one and
              * the other recedes, which also means the panel's
              * appearance says which state you are in before you read
              * a word of it. [brief §7]
              *
              * `.ctl.is-key` is a legend on a lit surface rather than a
              * CTA: uppercase, tracked, a 4px radius and a one-pixel
              * bevel instead of a 10px pill with a shadow.
              *
              * IT IS NOT RED, AND ITS OWN TOOLTIP SAYS WHY: "Nothing
              * reaches the wire until you press TAKE LIVE — the
              * programme keeps playing until then." GO LIVE brings the
              * camera up in PREVIEW. It was wearing the colour this
              * desk uses for transmission, two feet from the button
              * that actually transmits, while its own copy explained
              * that it does not. Red is for on air and for recording;
              * this is neither. [U-19, U-20]
              */}
            <button
              className={`ctl${onAir ? '' : ' is-key'}`}
              data-testid="go-live"
              disabled={onAir}
              title={'Brings the camera up and shows it to you in PREVIEW. '
                + 'Nothing reaches the wire until you press TAKE LIVE — the '
                + 'programme keeps playing until then.'}
              onClick={goLive}
              style={{ flex: 1, padding: '8px 10px' }}
            >
              Go live
            </button>
            <button
              className={`ctl${onAir ? ' is-armed-danger' : ''}`}
              data-testid="end-live"
              disabled={!onAir}
              title="Return to program. The schedule resumes where the clock says."
              onClick={endLive}
              style={{ flex: 1, padding: '8px 10px' }}
            >
              End live
            </button>
            <button
              type="button" aria-label="Channel settings" data-testid="identity-gear"
              onClick={() => setDeskTab('graphics')}
              style={{
                flex: '0 0 auto', width: 32, height: 32, padding: 0,
                borderRadius: 3, border: '1px solid var(--console-seam)',
                background: 'var(--panel-2)', color: 'inherit', cursor: 'pointer',
              }}
            ><Icon name="settings" size={14} /></button>
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
                padding: 7, borderRadius: 3, background: 'var(--console-control)',
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
                      aria-pressed={chosenOne}
                      onClick={() => setArrangement(option === 'auto' ? undefined : option)}
                      className={`ctl${chosenOne ? ' is-on' : ''}`}
                      style={{ padding: '3px 8px', fontSize: 'var(--text-2xs)' }}
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
                devices={devices}
                cameraId={cameraId} micId={micId}
                onCamera={setCameraId} onMic={setMicId}
                quality={quality.quality} onQuality={quality.choose}
                qualityLocked={Boolean(liveNow)}
                transmission={qualityFor(transmission)}
              />
            )}

            {deskTab === 'guests' && (
              <GuestsTab
                channel={channel} guests={guests} levels={levels}
                onAir={onAir} armed={armed} Meter={Meter}
                onAttach={(roomId) => void patch({
                  action: 'attach-room', ...(roomId ? { roomId } : {}),
                })}
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
                onShow={(source) => void patch({ action: 'roll-in', source })}
                share={share}
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
              {/*
                * WHAT IS OUT, AND HOW FAR THROUGH. This is the one
                * readout on the desk somebody checks without being
                * prompted — "how long have I got" — so the elapsed
                * figure is the bright thing and the total is dim,
                * rather than the two being equal weight in the faint
                * grey they both had.
                */}
              <div style={{
                padding: 9, borderRadius: 3,
                background: 'var(--console-control)',
                border: 'var(--border) solid var(--console-seam)',
                boxShadow: 'var(--console-bevel)',
              }}>
                <div style={{
                  fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semi)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{titleOf(on)}</div>
                <div style={{
                  height: 3, background: 'var(--console-inset)',
                  boxShadow: 'var(--console-well)',
                  margin: '8px 0 6px', overflow: 'hidden',
                }}>
                  <div data-testid="now-progress" style={{
                    height: '100%',
                    width: totalMs > 0
                      ? `${Math.min(100, (intoMs / totalMs) * 100)}%` : '100%',
                    background: on.kind === 'live'
                      ? 'var(--state-live)' : 'var(--accent)',
                  }} />
                </div>
                <div className="row" style={{ fontSize: 'var(--text-2xs)' }}>
                  <span className="grow mono readout" style={{
                    color: 'var(--ink-050)',
                  }}>{hms(intoMs)}</span>
                  <span className="mono readout" style={{
                    color: 'var(--ink-400)',
                  }}>{totalMs > 0 ? hms(totalMs) : '—'}</span>
                </div>
              </div>

              <div className="row" data-testid="next-in" style={{
                marginTop: 6, padding: '6px 9px',
                borderTop: 'var(--border) solid var(--console-rule)',
                fontSize: 'var(--text-xs)', gap: 7,
              }}>
                <span className="module-label">Next in</span>
                <span className="mono readout" style={{
                  fontWeight: 'var(--weight-bold)', color: 'var(--ink-050)',
                }}>
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
                       style={{ gap: 8, fontSize: 'var(--text-xs)' }}>
                    <span className="mono muted" style={{ flex: '0 0 auto' }}>
                      {clock(segment.fromMs)}
                    </span>
                    <span style={{
                      flex: 1, minWidth: 0, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{segment.title}</span>
                    <span className="muted" style={{ flex: '0 0 auto', fontSize: 'var(--text-2xs)' }}>
                      {offsetLabel(segment.toMs - segment.fromMs)}
                    </span>
                  </div>
                ))}
                {segments.length <= 1 && (
                  <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
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
      {/*
        * THE TRANSPORT IS THE EDGE OF THE DESK. [§9]
        *
        * Everything above it is a view of something; everything on it
        * changes the air. That distinction is worth a surface of its own —
        * darker than the room, with a light hairline along the top — so a
        * hand knows it has reached the part where pressing something is
        * consequential, before the eye has read a single label.
        */}
      <footer className="shell-foot" data-testid="channel-transport" style={{
        display: 'grid', alignItems: 'center', gap: 'var(--space-5)',
        padding: 'var(--space-4) var(--space-6)',
        /*
          * `max-content` AND NOT `auto` FOR THE MIDDLE. An `auto` grid
          * track will shrink below the width of what is in it when its
          * neighbours want the room, which is why EMERGENCY was arriving
          * clipped to "⚠ Eme" and sliding under the control beside it.
          * `max-content` refuses, and the two `minmax(0, 1fr)` columns
          * either side give way instead — which is correct, because what
          * they hold is a channel name and a destination count, and both
          * of those can truncate without anybody being harmed.
          */
        gridTemplateColumns: 'minmax(0, 1fr) max-content minmax(0, 1fr)',
        /*
          * A MASTER CONTROL STRIP IS PART OF THE CHASSIS, not a footer
          * laid over it. It carried a top-to-bottom gradient, which is
          * a decorative device and the one thing on a desk that says
          * "this was styled" — a real strip is one tone with a lit top
          * edge, because that is what a piece of extruded metal looks
          * like under a room light. [brief §12, §15]
          */
        background: 'var(--console-chassis)',
        borderTop: 'var(--border) solid var(--console-edge)',
        boxShadow: 'var(--console-bevel)',
      }}>
        <div className="row" style={{
          gap: 'var(--space-4)', minWidth: 0, flexWrap: 'nowrap',
          overflow: 'hidden',
        }}>
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
              confirm({
                question: 'Record the next hour of whatever the channel '
                  + 'shows. It becomes a file in this channel\u2019s library.',
                field: {
                  label: 'What should the recording be called?',
                  placeholder: 'Tonight\u2019s show',
                },
                verb: 'Record the next hour',
                go: (label) => void patch({
                  action: 'record', label,
                  fromAt: new Date(now).toISOString(),
                  toAt: new Date(now + HOUR).toISOString(),
                  requestedBy: 'owner',
                }),
              });
            }}
            /*
              * THE ONE ROUND CONTROL IN THE ROOM, and round on purpose:
              * every other control here is a rectangle, so shape alone
              * says this is the record decision without a label. Armed it
              * carries the live red and its own halo; idle it is a hollow
              * ring, the same filled-versus-hollow grammar the lamps use.
              */
            style={{
              flex: '0 0 auto', width: 34, height: 34,
              borderRadius: 'var(--radius-full)', minHeight: 0,
              padding: 0, cursor: 'pointer', display: 'grid', placeItems: 'center',
              background: onAir && keeping
                ? 'radial-gradient(circle at 50% 35%, #ef5040, #c0342a)'
                : 'var(--surface-float)',
              border: `2px solid ${onAir && keeping
                ? 'var(--state-live)' : 'var(--ink-500)'}`,
              boxShadow: onAir && keeping
                ? '0 0 0 3px var(--state-live-glow), inset 0 1px 0 rgba(255,255,255,0.2)'
                : 'inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            <span aria-hidden="true" style={{
              width: 12, height: 12, borderRadius: 'var(--radius-full)',
              background: onAir && keeping ? 'var(--ink-000)' : 'transparent',
              boxShadow: onAir && keeping
                ? '0 0 0 1px rgba(0,0,0,0.5)'
                : 'inset 0 0 0 2px var(--state-live-dim)',
            }} />
          </button>

          {/*
            * THE STATE, THE WORD AND THE CLOCK, in that order and read as
            * one object. The clock is the largest figure in the room
            * because it is the only number here anybody reads under
            * pressure, and it is tabular so the digits do not shimmer as
            * the seconds turn. [U-08]
            */}
          <span className="row" style={{ gap: 'var(--space-3)', flex: '0 0 auto' }}>
            <span className={`lamp${on.kind === 'live' ? ' is-live'
              : on.kind === 'off' ? '' : ' is-ok'}`} />
            <span style={{
              fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)',
              letterSpacing: '0.09em',
              color: on.kind === 'off' ? 'var(--text-faint)' : 'var(--text)',
            }}>
              {on.kind === 'off' ? 'OFF AIR' : 'ON AIR'}
            </span>
            <span className="mono" data-testid="transport-clock" style={{
              fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)',
              letterSpacing: 'var(--tracking-tight)',
              color: on.kind === 'off' ? 'var(--text-dim)' : 'var(--text)',
              fontVariantNumeric: 'tabular-nums',
            }}>{hms(elapsedMs)}</span>
          </span>

          <Meter value={levels['master']?.energy ?? 0} label="Program" />

          <span className="small muted" style={{
            fontSize: 'var(--text-xs)', minWidth: 0, overflow: 'hidden',
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

        {/*
          * THE CONTROL CLUSTER NEVER SHRINKS. It sat in the middle of a
          * three-column grid whose outer columns were `1fr`, so a long
          * channel name on the left or an extra destination on the right
          * stole width from the middle — and what got squeezed was
          * EMERGENCY, which ended up clipped to "⚠ Eme" and overlapped
          * by the control beside it.
          *
          * A control that is truncated is a control somebody hesitates
          * over, and this is the one in the room that must never be
          * hesitated over. It is `auto` in the grid and `0 0 auto` in the
          * flex, so the outer columns give way instead.
          */}
        <div className="row" data-testid="control-bar" style={{
          gap: 'var(--space-3)', flexWrap: 'nowrap', flex: '0 0 auto',
        }}>
          <button
            className="ctl" data-testid="stop-live" disabled={!onAir}
            aria-label="Take program" title="Stop the live source and return to program"
            onClick={endLive}
            style={{ padding: '7px 11px' }}
          ><Icon name="stop" size={12} /></button>
          <button
            className="ctl" data-testid="resume-program" disabled={!emergency}
            aria-label="Resume programme"
            title="Clear the emergency and let the schedule take the air again"
            onClick={() => void patch({ action: 'emergency', source: null })}
            style={{ padding: '7px 11px' }}
          ><Icon name="play" size={12} /></button>
          <button
            className="ctl" data-testid="next-item"
            disabled={channel.rotation.length === 0}
            title="Cut to the next item in the loop now"
            onClick={() => void patch({ action: 'next' })}
            style={{ padding: '7px 11px' }}
          ><Icon name="next" size={12} /> Next</button>

          {/*
            * A DIVIDER BETWEEN GROUPS OF CONTROLS, at the weight of a
            * seam rather than of a border. It separates transport from
            * the two controls that change what is on air, which is the
            * one grouping in this strip that matters.
            */}
          <span aria-hidden="true" style={{
            width: 1, alignSelf: 'stretch', margin: '2px 5px',
            background: 'var(--console-seam)',
          }} />

          {armed ? (
            <button
              className="ctl is-critical" data-testid="take-live"
              title="Cut the live feed to air"
              onClick={() => void patch({ action: 'take-live' })}
              /*
                * THE MOST CONSEQUENTIAL BUTTON ON THE PAGE, and the only
                * one still allowed to look it — but the HALO goes. It
                * wore a 3px glow in its own hue, which is the one
                * decoration the brief rules out by name, and it was
                * doing a job the surface already does: the button is
                * the only lit red object in a bar of grey ones.
                *
                * Prominence now comes from being lit, tracked and
                * uppercase, which is what the legend on a real take
                * button looks like. [brief §12, §19]
                */
              style={{
                padding: 'var(--space-3) var(--space-6)',
                fontSize: 'var(--text-sm)',
              }}
            >
              Take live
            </button>
          ) : (
            <button
              className="ctl" data-testid="take-live" disabled
              title={onAir
                ? 'Already on air.'
                : 'Press GO LIVE first — the feed is armed into PREVIEW, and '
                  + 'TAKE LIVE is what puts it on the wire.'}
              style={{ padding: 'var(--space-3) var(--space-6)' }}
            >
              Take live
            </button>
          )}

          <button
            className={`ctl ${emergency ? 'is-critical' : 'is-armed-danger'}`}
            data-testid="emergency"
            title={emergency
              ? 'Cut back to whatever the channel would be showing'
              : 'Cut away immediately. Beats live.'}
            disabled={!emergency && !pickedItem}
            onClick={() => {
              if (emergency) { void patch({ action: 'emergency', source: null }); return; }
              if (!pickedItem) return;
              confirm({
                question: `Cut away to “${pickedItem.title}” now? This `
                  + 'interrupts whatever is on air, including a live broadcast.',
                verb: 'Cut away now',
                danger: true,
                go: () => void patch({
                  action: 'emergency', source: pickedItem.source,
                }),
              });
            }}
            /*
              * ARMED IT IS LOUD; IDLE IT IS AN OUTLINE. A destructive
              * control that looks destructive at rest trains the eye to
              * ignore red, and then the red that matters is invisible.
              * So it waits as a red-edged outline and only fills when it
              * is actually holding the channel off its schedule.
              */
            style={{
              padding: 'var(--space-3) var(--space-5)',
              fontSize: 'var(--text-sm)',
              whiteSpace: 'nowrap',
            }}
          >
            {/*
              * ⚠ IS AN EMOJI ON macOS — a yellow-and-black road sign
              * in full colour, on the most consequential button on
              * the desk. The one control whose mark must be
              * unmistakable was wearing a glyph the platform
              * redraws. [U-19]
              */}
            <Icon name="warning" size={12} />
            {emergency ? 'Clear Emergency' : 'Emergency'}
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
              borderRadius: 3, border: '1px solid var(--console-seam)',
              background: 'var(--panel-2)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap',
              /* An icon renders as a block; the row has to be one too or
                 the caret drops onto a line of its own. */
              display: 'inline-flex', alignItems: 'center', gap: 5,
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
              {/* A caret is the chevron at a quarter turn, not ▾. */}
              <Icon name="chevron" size={10} turn={90} />
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
                <span className="module-label grow">Destinations</span>
                <button className="small" data-testid="add-destination"
                        onClick={() => confirm({
                          question: 'Every destination carries the same '
                            + 'moment composed its own way \u2014 a vertical '
                            + 'output is a vertical edit, not this programme '
                            + 'with its sides cut off.',
                          field: {
                            label: 'Where does it go?',
                            initial: 'tiktok',
                            choices: [
                              { value: 'own', label: 'This channel\u2019s own link' },
                              { value: 'tiktok', label: 'TikTok \u2014 vertical' },
                              { value: 'youtube', label: 'YouTube \u2014 16:9' },
                              { value: 'facebook', label: 'Facebook' },
                              { value: 'x', label: 'X' },
                              { value: 'rtmp', label: 'Anything taking an RTMP URL' },
                            ],
                          },
                          verb: 'Add the destination',
                          go: (kind) => void patch({
                            action: 'add-destination', kind,
                          }),
                        })}
                        style={{
                          border: 0, background: 'none', padding: 0,
                          color: 'var(--accent-soft)', fontSize: 'var(--text-xs)', cursor: 'pointer',
                        }}>
                  + Add
                </button>
              </div>
              <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-2xs)' }}>
                This channel is always one of the outputs — the playout
                engine writes its HLS whatever is listed here.
              </p>
              {(channel.destinations ?? []).length === 0 && (
                <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
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
                         gap: 7, fontSize: 'var(--text-xs)', padding: '5px 7px', borderRadius: 6,
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
                        background: state === 'ON' ? 'var(--state-live-dim)'
                          : state === 'READY' ? 'var(--state-ok)'
                            : state === 'NOT CONNECTED' ? 'var(--state-armed-dim)' : 'var(--ink-500)',
                      }}
                    />
                    <span className="grow" style={{
                      minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>{destination.label}</span>
                    <span className="muted" style={{ fontSize: 'var(--text-2xs)' }}>
                      {destination.shape}
                    </span>
                    <span className="muted" style={{ fontSize: 'var(--text-2xs)', fontWeight: 700 }}
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
                        color: 'var(--bad)', cursor: 'pointer', fontSize: 'var(--text-sm)',
                      }}
                    >&times;</button>
                  </div>
                );
              })}
              {(channel.destinations ?? []).some(
                (destination) => destination.enabled
                  && PLATFORMS[destination.kind]?.needsReview) && (
                <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-2xs)' }}>
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
          {/*
            * THE ENGINE, NOT THE SCHEDULE.  [§18]
            *
            * This lamp used to report that the schedule resolved, which is a
            * different question and the easier one: a perfect schedule with
            * no encoder behind it is a listing, and a control room that
            * called that "Online" was answering wrongly rather than
            * declining to answer. Red is nothing being written; amber is
            * something to fix; green is segments arriving.
            */}
          <span className="row" data-testid="server-lamp"
                data-engine={health?.engine ?? 'unknown'}
                data-stream={health?.stream ?? 'unknown'}
                style={{ gap: 6, fontSize: 'var(--text-xs)', flex: '0 0 auto' }}
                title={[health?.says, ...violations, error]
                  .filter(Boolean).join(' \u00b7 ')
                  || 'Segments are being written and every reference has a '
                    + 'file behind it.'}>
            <Dot
              on
              colour={!health ? '#6a7078'
                : health.engine !== 'running' || health.stream === 'silent'
                  ? 'var(--state-live-dim)'
                  : health.stream === 'stalled' ? 'var(--state-warn)'
                    : violations.length > 0 || missing.length > 0 ? 'var(--state-warn)'
                      : 'var(--state-ok)'}
            />
            <span className="muted">
              {!health ? 'Engine: \u2026'
                : health.engine === 'stopped' ? 'Engine: not running'
                  : health.engine === 'stale' ? 'Engine: not responding'
                    : health.stream !== 'transmitting' ? 'Engine: no output'
                      : violations.length > 0 || missing.length > 0
                        ? `On air \u00b7 ${missing.length || violations.length} to fix`
                        : 'On air'}
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
                  gap: 6, fontSize: 'var(--text-xs)', flex: '0 0 auto',
                }}
                title={published
                  ? 'Anybody with the link can watch this channel.'
                  : 'Only you can watch this. Publish it to give it an audience.'}>
            <Dot on colour={published ? 'var(--state-ok)' : 'var(--ink-400)'} />
            <span className="muted">{published ? 'Public' : 'Private'}</span>
          </span>

          <a className="btn small" data-testid="view-channel"
             href={`/t/${id}/watch`} target="_blank" rel="noreferrer"
             title="Open the channel the way a viewer gets it: the transmission, twelve seconds behind."
             style={{ padding: '6px 11px', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
            View Channel
          </a>

          <details data-testid="channel-settings" style={{ position: 'relative' }}>
            <summary aria-label="Channel settings" style={{
              listStyle: 'none', cursor: 'pointer', padding: '5px 8px',
              borderRadius: 3, border: '1px solid var(--console-seam)',
              background: 'var(--panel-2)', fontSize: 'var(--text-base)',
            }}><Icon name="settings" size={14} /></summary>
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
                <span className="grow" style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
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
                    ? { borderColor: 'var(--state-armed-dim)', color: 'var(--ink-on-armed)', fontSize: 'var(--text-xs)' }
                    : { fontSize: 'var(--text-xs)' }}
                >
                  {channel.backup ? 'Clear' : 'Set from pick'}
                </button>
              </div>
              <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
                {channel.backup
                  ? `A lost feed falls to “${nameOf(channel.backup)}” for a `
                    + 'minute, then back to the loop.'
                  : 'Nothing set — a lost feed falls straight through to the loop.'}
              </p>
              {/* ---- who can watch (§17, U-31) ----------------------- */}
              <div className="row" style={{
                borderTop: '1px solid var(--line)', paddingTop: 7,
              }}>
                <span className="grow" style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                  Audience
                </span>
                <button
                  className="small" data-testid="publish-channel"
                  onClick={() => {
                    if (published) {
                      confirm({
                        question: 'Take the channel off the air for viewers? '
                          + 'It keeps transmitting \u2014 the link simply '
                          + 'stops working.',
                        verb: 'Stop the link',
                        danger: true,
                        go: () => void patch({ action: 'unpublish' }),
                      });
                      return;
                    }
                    confirm({
                      question: 'Give the channel a public link. Anyone with '
                        + 'it can watch \u2014 they cannot change anything.',
                      field: {
                        label: 'Who is broadcasting?',
                        placeholder: 'Optional',
                        optional: true,
                      },
                      verb: 'Publish the link',
                      go: (author) => void patch({
                        action: 'publish', ...(author ? { author } : {}),
                      }),
                    });
                  }}
                  style={published
                    ? { borderColor: 'var(--state-armed-dim)', color: 'var(--ink-on-armed)', fontSize: 'var(--text-xs)' }
                    : {
                      background: 'var(--accent-deep)', borderColor: 'var(--accent-deep)', color: 'var(--ink-000)',
                      fontSize: 'var(--text-xs)',
                    }}
                >
                  {published ? 'Take off air' : 'Publish'}
                </button>
              </div>
              <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
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
                    style={{ fontSize: 'var(--text-xs)', padding: '5px 8px' }}
                  />
                </div>
              )}
              <div className="row" style={{
                borderTop: '1px solid var(--line)', paddingTop: 7, fontSize: 'var(--text-xs)',
              }}>
                <span className="grow muted">Timezone</span>
                <span className="mono">{channel.timezone}</span>
              </div>
              <div className="row" style={{ fontSize: 'var(--text-xs)' }}>
                <span className="grow muted">Referenced files</span>
                <span className="mono">{assets}</span>
              </div>
            </div>
          </details>
        </div>

        {(violations.length > 0 || error || health?.says) && (
          <p className="small" data-testid="violations" style={{
            gridColumn: '1 / -1', margin: '4px 0 0', fontSize: 'var(--text-xs)',
            color: error || health?.engine !== 'running'
              ? 'var(--bad)' : 'var(--warn)',
          }}>
            {/*
              * THE ENGINE FIRST. A broken reference matters; nothing being
              * written at all matters more, and it is the fault that used to
              * be invisible from this page. [§18]
              */}
            {error ?? health?.says ?? violations.join(' ')}
          </p>
        )}
      </footer>

      {/*
        * THE DIALOG LIVES AT THE END OF THE SHELL and is rendered on
        * every pass whether or not anything is being asked. A <dialog>
        * in the top layer is not positioned by where it sits in the
        * tree, so this costs nothing and means the hook has somewhere
        * to put its question — a `useConfirm` whose dialog is never
        * mounted silently does nothing at all, which is the worst way
        * for a confirmation to fail. [Confirm.tsx]
        */}
      {confirmDialog}
    </div>
    </MenuHost>
  );
}

/* ======================================================================== *
 *  The containers.
 * ======================================================================== */

/** A panel with a head and a body, which is every box in the benchmark. */
/**
 * A MODULE OF ONE CONSOLE, not a card on a page.  [console.css]
 *
 * WHAT CHANGED AND WHY IT IS ONE COMPONENT. Every container in this room
 * — Program Output, Preview, Multi-view, Live Studio, the schedule, the
 * rail — is a `Frame`. That is the whole reason the room can be
 * re-faced without moving anything: one component is the face of all of
 * them, and nothing about where they sit or what they hold is touched.
 *
 * Three things go and one arrives:
 *
 *   THE 10px RADIUS GOES TO 4. Eight soft rectangles in a grid is the
 *     strongest "web app" signal an interface can emit, and it was
 *     emitting it eight times.
 *   THE DROP SHADOW GOES. `--elev-1` says "floating above the page",
 *     which is what a card does and not what a module does. A module is
 *     machined into the desk.
 *   THE FACE DROPS to `--console-face`, a fiftieth of a stop above the
 *     chassis instead of a clear step above it.
 *   A ONE-PIXEL BEVEL ARRIVES along the top edge, which is how a
 *     physical panel catches a room light and the only depth cue that
 *     works on a near-black surface.
 *
 * `is-well` is for the containers that hold a picture. A programme sits
 * BELOW the surface of the desk, and true black belongs in exactly one
 * place: inside the frame.
 */
function Frame({
  testid, children, well,
}: { testid: string; children: React.ReactNode; well?: boolean }) {
  return (
    <section
      data-testid={testid}
      className={`module${well ? ' is-well' : ''}`}
      style={{ minWidth: 0, height: '100%', overflow: 'hidden' }}
    >
      {children}
    </section>
  );
}

function Head({
  text, sub, right,
}: { text: string; sub?: string; right?: React.ReactNode }) {
  return (
    /*
      * A PANEL HEAD IS A SHELF, NOT A LINE OF TEXT. It was a bold word
      * above a hairline, which reads as the first row of the content
      * rather than as the lid of the box. Giving it its own slightly
      * darker ground separates it from what it heads, the way a rail
      * separates from a shelf — and then the eye finds the six panel
      * titles in this room without reading any of them.
      */
    <div className="row module-head" style={{
      flexWrap: 'nowrap', minWidth: 0,
    }}>
      {/*
        * THE LABEL IS TECHNICAL METADATA, NOT A HEADING. "Program
        * Output" set as a 13px semibold sentence is a section title in
        * a document — it competes with the one thing in the module that
        * should be bright, which is the state. The same words at 10px,
        * uppercase, tracked out and dim are a legend on a piece of
        * equipment: read once, then ignored, which is what a panel
        * label is for.
        *
        * The shelf goes with it. A head with its own lighter ground was
        * a lid on a box, and a console has no boxes — a hairline under
        * the legend is the whole separation a module needs.
        */}
      <span className="module-label" style={{
        minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{text}</span>
      {sub && (
        /*
          * The qualifier is a whisper, not a second title: it answers
          * "which one" for somebody already looking, and competing with
          * the name would make every head two things to read.
          */
        <span className="module-sub" style={{ flex: '0 0 auto' }}>{sub}</span>
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
    /*
      * TWO SHAPES, ONE GRAMMAR. The wide strip heads a panel and marks
      * its place with a rule beneath, the way a tab always has. The
      * compact one is a SEGMENTED CONTROL — a track with a slider in it
      * — and it is a different object because it does a different job:
      * it lives inside a panel and switches a view rather than a place.
      *
      * The track is recessed and the chosen segment is raised out of it,
      * so which one is selected is legible as depth before it is legible
      * as colour. [elevation, D-04]
      */
    <div className="row" data-testid={testid} style={{
      /*
       * THE STRIP ITSELF HAS TO BE ABLE TO SHRINK. Commit 11 made the
       * five desk labels shrink and they still clipped, because the
       * container they are in was `flex: 0 0 auto` — it takes its
       * content width and overflows its panel, so no amount of
       * shrinking inside it changes anything. Fixing the children of a
       * box that cannot itself give way is the ordinary way to spend
       * two attempts on one bug.
       *
       * Neither variant may STRETCH: the compact one is a segmented
       * control that must not spread itself across a header, and the
       * wide one heads a panel it already spans.
       *
       * AND `flex: 1 1 auto` WAS THE WRONG WAY TO SAY IT. `flex` acts
       * on its parent's MAIN axis, and this strip has two parents: the
       * desk's header, which is a row, and the left rail's `Frame`,
       * which is a column. In the row it did what commit 11 wanted; in
       * the column `flex-grow: 1` made the tab strip eat every pixel
       * of vertical slack in the rail — a 220px-tall tab strip with
       * the playlist crushed into the bottom half of the panel, which
       * is what that empty upper half in the control room was.
       *
       * THE COMPACT ONE HAD THE SAME BUG FOR THE SAME REASON. It was
       * `flex: 0 0 auto` so that it would not stretch, which also
       * meant it could not give way — and the Live Studio's desk strip
       * is the compact variant with FIVE labels in a 328px column, so
       * it overflowed by seventeen pixels and clipped AUDIO to "AUDI".
       * That is the third time this exact clip has been fixed, twice
       * on the wrong element: 05 widened the labels, 11 shrank them
       * inside a box that could not shrink, and 21 fixed the wide
       * variant while the desk strip was quietly the compact one.
       *
       * Both variants now say the same three things. Growing and
       * shrinking are two properties; the shorthand sets both, and
       * only one of them was ever wanted.
       */
      gap: 0, flexWrap: 'nowrap',
      flexGrow: 0, flexShrink: 1, flexBasis: 'auto', minWidth: 0,
      borderBottom: compact ? 0 : 'var(--border) solid var(--line)',
      ...(compact
        ? {
          border: 'var(--border) solid var(--console-seam)',
          borderRadius: '3px', padding: 2,
          background: 'var(--console-inset)',
          boxShadow: 'var(--console-well)',
        }
        : {}),
    }}>
      {options.map((option) => {
        const chosen = option.id === value;
        return (
          <button
            key={option.id} type="button" data-testid={`${testid}-${option.id}`}
            data-chosen={chosen ? 'true' : 'false'}
            aria-pressed={chosen}
            onClick={() => onChange(option.id)}
            style={{
              /*
                * A SEGMENT SHRINKS ONLY WHEN IT HAS TO. `0 1 auto`
                * keeps the compact control's segments at their label
                * width while there is room — which is what a segmented
                * control should look like — and lets them ellipsise
                * rather than clip when there is not.
                */
              flex: compact ? '0 1 auto' : '1 1 0',
              /*
               * THEY HAVE TO FIT. Uppercasing and tracking these out in
               * 05 widened the five Live Studio desks past their panel
               * and clipped AUDIO to "AUDI" — a legend that does not
               * fit is worse than the sentence case it replaced. They
               * shrink now, and the tracking is lighter on the wide
               * variant, which has five labels to seat rather than
               * three.
               */
              minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              /*
                * THE PADDING FOLLOWS THE COUNT, not the variant. A
                * five-up compact strip in a 330px column has 64px a
                * segment; eight of those pixels were air at each end.
                */
              padding: compact
                ? `var(--space-2) ${options.length > 3
                  ? 'var(--space-3)' : 'var(--space-4)'}`
                : 'var(--space-4) var(--space-1)',
              minHeight: compact ? 24 : 32,
              font: 'inherit',
              /*
               * A TAB IS A LEGEND, NOT A LABEL. These name the five
               * desks in the Live Studio and the three views of the
               * schedule; they are signage, read by shape and position,
               * and they were set as sentence-case UI text competing
               * with everything else on the panel.
               */
              fontSize: 'var(--text-2xs)',
              /*
                * AND SO DOES THE TRACKING. The wide variant already
                * tracked lighter "because it has five labels to seat
                * rather than three" — the right reason attached to the
                * wrong property. The Live Studio's compact strip has
                * five labels too, and at 0.08em they did not fit.
                */
              letterSpacing: options.length > 3 ? '0.04em' : '0.08em',
              textTransform: 'uppercase',
              fontWeight: chosen ? 'var(--weight-bold)' : 'var(--weight-semi)',
              cursor: 'pointer',
              /*
               * THE CHOSEN SEGMENT WAS A FILLED BLUE CHIP with a
               * gradient and a raise — the exact "bright SaaS button"
               * the brief rules out for a selected state. On a desk a
               * chosen segment is a LIT one: it comes forward by a
               * couple of per cent of lightness and keeps a hard edge
               * underneath it. The blue is in the edge, not the fill.
               */
              color: chosen ? 'var(--ink-000)' : 'var(--ink-300)',
              background: compact && chosen
                ? 'var(--console-control-hover)' : 'transparent',
              border: 0,
              borderRadius: compact ? '2px' : 0,
              borderBottom: `2px solid ${chosen
                ? 'var(--accent)' : 'transparent'}`,
              boxShadow: compact && chosen ? 'var(--console-bevel)' : 'none',
              transition: 'color var(--motion-fast) var(--ease-out),'
                + ' background-color var(--motion-fast) var(--ease-out),'
                + ' border-color var(--motion-fast) var(--ease-out)',
            }}
          >{option.label}</button>
        );
      })}
    </div>
  );
}

function Section({ text, aside }: { text: string; aside?: React.ReactNode }) {
  return (
    /*
      * A SUB-HEAD INSIDE A PANEL. Small, tracked out and dimmed rather
      * than large and bold: a section label is signage, and signage is
      * read by shape. Bold at 12px in a dense column competes with the
      * panel's own title two centimetres above it, and then neither
      * wins. [D-04]
      */
    <div className="row" style={{
      alignItems: 'baseline', justifyContent: 'space-between',
      margin: 'var(--space-5) 0 var(--space-2)',
    }}>
      <span style={{
        fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)',
        letterSpacing: '0.07em', textTransform: 'uppercase',
        color: 'var(--text-faint)',
      }}>{text}</span>
      {aside}
    </div>
  );
}

function Dot({ on, colour }: { on: boolean; colour: string }) {
  return (
    /*
      * A LAMP, NOT A DOT. The glow was a flat 7px blur in the lamp's own
      * colour, which on a dark ground reads as a smudge rather than as
      * something lit. A lit object has a hard core and a soft halo: the
      * inset dark ring gives the core its edge, and the halo is wide and
      * faint rather than narrow and strong. [status.css]
      */
    <span aria-hidden="true" style={{
      width: 8, height: 8, borderRadius: 'var(--radius-full)', flex: '0 0 auto',
      background: on ? colour : 'var(--ink-500)',
      /*
       * THE HALO IS MIXED, NOT SUFFIXED. It was `${colour}22`, which
       * works for a hex and silently produces nothing for a token —
       * `var(--state-ok)22` is not a colour, so the whole declaration
       * is dropped and the lamp loses its glow. Of this component's
       * four call sites, three already passed a token on at least one
       * branch — including the encoder lamp, whose every state is a
       * token — and every one of those branches has been unlit since
       * the day it was converted. The two that still looked right were
       * the two that had never been converted.
       */
      boxShadow: on
        ? `0 0 0 2.5px color-mix(in srgb, ${colour} 13%, transparent),`
          + ` 0 0 8px color-mix(in srgb, ${colour} 33%, transparent),`
          + ' inset 0 0 0 1px rgba(0,0,0,0.35)'
        : 'inset 0 0 0 1px rgba(0,0,0,0.4)',
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
      {/*
        * AN UNLIT SEGMENT IS STILL PART OF THE INSTRUMENT. They were
        * drawn in the panel colour, so a quiet meter looked like an
        * empty space where a meter should be — and on a desk the whole
        * point of a meter is that you can see the headroom you are not
        * using. Unlit segments now sit just above the ground they are
        * on: present, dark, and clearly a scale.
        *
        * AND THE LIT ONES DO NOT GLOW. Each had a 4px bloom in its own
        * colour, which on eight segments three pixels wide is eight
        * overlapping halos — the meter reads as a smear of colour
        * rather than as a count of lit segments, and counting the
        * segments is the entire job. A meter is the one instrument on
        * a desk that must be read at a glance and precisely at the
        * same time. Flat, hard-edged, on a dark scale. [brief §9, §18]
        */}
      {Array.from({ length: 8 }, (_unused, index) => {
        const colour = index > 6 ? 'var(--state-live)'
          : index > 4 ? 'var(--state-warn)' : 'var(--state-ok)';
        const on = index < lit;
        return (
          <span key={index} aria-hidden="true" style={{
            width: 3, height: 5 + index * 1.6, borderRadius: 1,
            background: on ? colour : 'rgba(255,255,255,0.09)',
            transition: 'background-color 60ms linear',
          }} />
        );
      })}
    </span>
  );
}

/* ======================================================================== *
 *  The left rail.
 * ======================================================================== */

/** A numbered row: index, thumbnail, title, subtitle, duration, menu. */
function Row({
  index, source, title, subtitle, duration, badge, chosen, testid, dataset,
  onClick, about, items,
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
  /*
   * WHAT CAN BE DONE TO THIS ROW, as a list rather than as a rendered
   * menu. It used to be a `<React.ReactNode>` holding a `<details>`, so
   * every rail built its own markup and right-clicking a row was not
   * possible without building it a second time. The row now declares the
   * actions and the shared menu draws them, from the `⋯` and from the
   * right-click alike. [D-19]
   */
  about?: string;
  items?: () => MenuEntry[];
}) {
  const { onRow, fromButton } = useRowMenu();
  return (
    <div
      data-testid={testid} {...dataset}
      {...(items && about ? onRow(about, items) : {})}
      /*
        * A LIST OF ROWS IS READ AS A LIST, NOT AS A STACK OF CARDS. Every
        * row carried its own full border, so twenty rows drew forty
        * horizontal lines and the eye had to work out which pairs
        * belonged together. A row is now a surface with a hairline
        * UNDER it — one line between neighbours instead of two — and the
        * list reads as a column rather than as a pile.
        *
        * The chosen row is the exception and keeps a full outline plus a
        * marker on its leading edge, because it is no longer one of the
        * list: it is the one you picked.
        */
      /*
        * A LIST, NOT A STACK OF CARDS. Rows sat on their own tinted
        * surface, each with a radius, a border and two pixels of gap —
        * which is a column of small cards. A playlist is a LIST: the
        * rows share a face and are separated by one hairline, so twenty
        * of them read as one object with twenty entries rather than as
        * twenty objects.
        *
        * The chosen one is the exception and is marked on its leading
        * edge rather than outlined and tinted. An outline in a column
        * of outlines has to be found by comparison; a bar on the
        * leading edge is found without. [D-04, U-19, brief §4]
        */
      style={{
        display: 'flex', gap: 'var(--space-3)', alignItems: 'center',
        padding: 'var(--space-3)',
        background: chosen ? 'var(--console-control)' : 'transparent',
        borderBottom: '1px solid var(--console-rule)',
        boxShadow: chosen
          ? 'inset 2px 0 0 var(--accent), var(--console-bevel)' : 'none',
        transition: 'background-color var(--motion-fast) var(--ease-out)',
      }}
    >
      {/*
        * THE ORDINAL IS FURNITURE. It tells you where you are in a loop
        * and is never the thing being looked for, so it sits at the
        * faintest tone the ramp offers — present when counted, silent
        * when scanned.
        */}
      {/*
        * TWO DIGITS, LIKE EVERY OTHER ORDINAL IN THIS ROOM. A "9" above
        * a "10" is a ragged left edge on a column whose only job is to
        * be counted down.
        */}
      <span className="mono readout" style={{
        flex: '0 0 auto', width: 16, fontSize: 'var(--text-2xs)',
        textAlign: 'right', color: 'var(--ink-400)',
      }}>{String(index).padStart(2, '0')}</span>
      <button
        type="button" onClick={onClick}
        style={{
          display: 'flex', gap: 9, alignItems: 'center', flex: 1, minWidth: 0,
          padding: 0, border: 0, background: 'none', font: 'inherit',
          color: 'inherit', textAlign: 'left',
          cursor: onClick ? 'pointer' : 'default',
        }}
      >
        {/*
          * THE THUMBNAIL IS A WELL, like every other picture in the
          * product: recessed, 16:9, and dark inside so an empty one
          * reads as "nothing here yet" rather than as a broken image.
          */}
        <span style={{
          flex: '0 0 auto', width: 62, height: 35,
          borderRadius: 'var(--radius-screen)',
          overflow: 'hidden', position: 'relative', background: 'var(--screen-bed)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.07),'
            + ' inset 0 1px 3px rgba(0,0,0,0.6)',
        }}>
          {source ? <Thumb source={source} /> : null}
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="row" style={{ gap: 6 }}>
            <span style={{
              fontWeight: 'var(--weight-semi)', fontSize: 'var(--text-sm)',
              minWidth: 0, overflow: 'hidden', letterSpacing: '-0.005em',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{title}</span>
            {badge}
          </span>
          <span style={{
            fontSize: 'var(--text-2xs)', display: 'block', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: 'var(--text-faint)', marginTop: 1,
          }}>{subtitle}</span>
        </span>
      </button>
      {/*
        * THE DURATION IS A NUMBER IN A COLUMN and must line up with the
        * ones above and below it, or a list of times reads as a ragged
        * edge. Tabular figures and a right edge do that. [U-08]
        */}
      <span className="mono" style={{
        flex: '0 0 auto', fontSize: 'var(--text-2xs)',
        color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums',
      }}>{duration}</span>
      {items && about && (
        <MenuButton about={about} items={items} open={fromButton} small />
      )}
    </div>
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
      <p className="empty" style={{
        margin: 0, padding: 'var(--space-8) var(--space-5)',
        fontSize: 'var(--text-xs)', maxWidth: '30ch',
      }}>
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
                background: 'var(--state-live-dim)', color: 'var(--ink-000)', fontSize: 'var(--text-2xs)',
                fontWeight: 800, letterSpacing: 0.5,
              }}>LIVE</span>
            ) : entry.loop ? (
              <span className="muted" style={{ lineHeight: 0 }}
                    title="Plays round for ever"><Icon name="loop" size={11} /></span>
            ) : undefined}
            about={title}
            items={() => [
              {
                label: 'Move up',
                disabled: index === 0 ? 'It is already first' : false,
                onSelect: () => onMove(entry, index - 1),
              },
              {
                label: 'Move down',
                disabled: index === channel.rotation.length - 1
                  ? 'It is already last' : false,
                onSelect: () => onMove(entry, index + 1),
              },
              {
                label: 'Remove from the loop',
                danger: true,
                hint: 'The file is untouched — a loop holds references',
                onSelect: () => onRemove(entry),
              },
            ]}
          />
        );
      })}
      <p className="small muted" style={{ margin: '6px 2px 0', fontSize: 'var(--text-2xs)' }}>
        {/* The one sentence D-18 is about, next to the thing it is about. */}
        The loop plays round for ever. Scheduling something twice adds no file.
      </p>
      <RightClickHint what="an entry" />
    </>
  );
}

/** THE LIBRARY — every finished render both other studios have made. [§3] */
function LibraryRail({
  items, listing, picked, keep, onPick, itemsFor,
}: {
  items: LibraryItem[];
  listing: Programme[];
  picked: string | null;
  keep: (text: string) => boolean;
  onPick: (key: string) => void;
  /* What to do with a finished render. The rail does not know; §3. */
  itemsFor: (item: LibraryItem) => MenuEntry[];
}) {
  if (items.length === 0) {
    return (
      <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
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
            about={item.title}
            items={() => itemsFor(item)}
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
        <p className="empty" style={{
          margin: 0, padding: 'var(--space-8) var(--space-5)',
          fontSize: 'var(--text-xs)', maxWidth: '30ch',
        }}>
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
                background: 'var(--state-live-dim)', color: 'var(--ink-000)', fontSize: 'var(--text-2xs)', fontWeight: 800,
              }}>NO FILE</span>
            ) : liveId === entry.id ? (
              <span style={{
                flex: '0 0 auto', padding: '1px 5px', borderRadius: 3,
                background: 'var(--state-live-dim)', color: 'var(--ink-000)', fontSize: 'var(--text-2xs)', fontWeight: 800,
              }}>LIVE</span>
            ) : undefined}
            about={title}
            items={() => [{
              label: 'Unschedule',
              danger: true,
              hint: 'Takes it out of the day. The file is untouched.',
              onSelect: () => onUnschedule(entry),
            }]}
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
                    border: 0, background: 'none', padding: 0, fontSize: 'var(--text-xs)',
                    color: 'var(--accent-soft)', cursor: 'pointer',
                  }}>+ Add</button>
        )}
      />
      {blocks.length === 0 ? (
        <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
          None. The channel&rsquo;s own loop runs all day.
        </p>
      ) : blocks.map((block) => (
        <div key={block.id} className="row" data-testid="block-row"
             data-block-id={block.id}
             style={{
               gap: 8, fontSize: 'var(--text-xs)', padding: '5px 7px', borderRadius: 6,
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
          <span className="muted" style={{ fontSize: 'var(--text-2xs)' }}>
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
  onTake, onBackToRoom, onGraphics,
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
  /** Put this source over the live feed. The Screens tab's own action. */
  onTake: (source: ProgrammeSource) => void;
  /** Take whatever is rolled in back down. */
  onBackToRoom: () => void;
  onGraphics: () => void;
}) {
  const guest = guests.find((person) => person.stream !== camera) ?? null;
  const fromStudioTwo = library.find((item) => item.document === 'performance');
  const fromStudioOne = library.find((item) => item.document === 'conversation');
  const scheduled = on.kind === 'programme' || on.kind === 'rotation'
    ? on.source : undefined;

  const rolledIn = Boolean(channel.live?.segment);

  /*
   * WHAT IS ACTUALLY GOING OUT, which is not what `live` meant.
   *
   * `live` was doing three jobs on this grid: "the camera is on air"
   * (tile 1), "something is scheduled" (tile 5) and "a bug is
   * configured" (tile 6). With a blue outline that was merely vague.
   * With the program tally 03 gave it, it became a lie — three sources
   * claiming the air at once, in a panel whose own header said "1 in
   * mix".
   *
   * `whatIsOn` already knows the answer and is the same function the
   * playout engine uses, so the tally cannot disagree with the
   * transmitter. Exactly one of the first two can be true at a time.
   */
  const transmitting = on.kind !== 'off';
  const roomOnProgram = on.kind === 'live';
  const playerOnProgram = on.kind === 'programme' || on.kind === 'rotation'
    || on.kind === 'emergency' || on.kind === 'backup';

  const tiles: {
    n: number; label: string; sub: string; live: boolean;
    /** Lit, but not on program: an overlay that is keyed over it. */
    on?: boolean;
    stream?: MediaStream | null; source?: ProgrammeSource; href?: string;
    /* A drawn mark, not a character — see Icon.tsx. The em dash
       fallback is text, which is why this is a node. */
    glyph?: React.ReactNode;
    /** What clicking it does, and what to say when it cannot. */
    act?: () => void; why?: string;
  }[] = [
    /*
     * THE TWO CAMERAS ARE THE ROOM, and the room is what lies underneath
     * anything rolled in. So clicking one takes the roll-in back down —
     * which is the only thing "cut to camera" can honestly mean here,
     * because who is SEEN in the mix is the Room's decision (ROOM §4) and
     * not a gallery button's.
     */
    {
      n: 1, label: 'Camera 1', sub: 'Host',
      live: roomOnProgram && Boolean(camera),
      stream: camera,
      ...(rolledIn ? { act: onBackToRoom } : {}),
      why: onAir
        ? (rolledIn ? 'Back to the room' : 'The room is already on air')
        : 'Only while you are live',
    },
    {
      n: 2, label: 'Camera 2', sub: guest?.label ?? 'Guest',
      live: onAir && Boolean(guest), stream: guest?.stream ?? null,
      ...(rolledIn ? { act: onBackToRoom } : {}),
      why: onAir
        ? (rolledIn ? 'Back to the room' : 'The room is already on air')
        : 'Only while you are live',
    },
    {
      n: 3, label: 'Studio Two', sub: fromStudioTwo?.title ?? 'Music Video',
      live: Boolean(scheduled && fromStudioTwo
        && sourceKey(scheduled) === sourceKey(fromStudioTwo.source)),
      ...(fromStudioTwo ? { source: fromStudioTwo.source } : {}),
      ...(studioTwoId ? { href: `/p/${studioTwoId}` } : {}),
      ...(onAir && fromStudioTwo
        ? { act: () => onTake(fromStudioTwo.source) } : {}),
      why: fromStudioTwo
        ? (onAir ? 'Roll it in over the live feed' : 'Only while you are live')
        : 'Nothing finished in Studio Two yet',
    },
    {
      n: 4, label: 'Studio One', sub: fromStudioOne?.title ?? 'Conversation',
      live: Boolean(scheduled && fromStudioOne
        && sourceKey(scheduled) === sourceKey(fromStudioOne.source)),
      ...(fromStudioOne ? { source: fromStudioOne.source } : {}),
      ...(studioOneId ? { href: `/c/${studioOneId}` } : {}),
      ...(onAir && fromStudioOne
        ? { act: () => onTake(fromStudioOne.source) } : {}),
      why: fromStudioOne
        ? (onAir ? 'Roll it in over the live feed' : 'Only while you are live')
        : 'Nothing finished in Studio One yet',
    },
    {
      n: 5, label: 'Media Player', sub: scheduled ? nameOf(scheduled) : 'Idle',
      live: playerOnProgram && Boolean(scheduled),
      ...(scheduled ? { source: scheduled } : {}),
      ...(onAir && scheduled ? { act: () => onTake(scheduled) } : {}),
      why: scheduled
        ? (onAir ? 'Roll the scheduled programme in over the live feed'
          : 'Only while you are live')
        : 'Nothing is scheduled right now',
    },
    {
      n: 6, label: 'Graphics',
      sub: channel.identity?.bug?.text ?? channel.name,
      /*
       * AN OVERLAY IS NOT A SOURCE ON PROGRAM. Graphics is drawn OVER
       * whatever is going out; it never has the air to itself. Giving
       * it the program tally put two red bars in a grid whose whole
       * job is to say which single thing is on — so it says ON,
       * quietly, which is what a keyer's indicator says.
       */
      on: transmitting
        && Boolean(channel.identity?.bug || channel.identity?.lowerThird),
      live: false,
      glyph: <Icon name="graphics" size={15} />,
      act: onGraphics,
      why: 'Open the identity controls',
    },
  ];

  return (
    <div data-testid="multiview-grid" style={{
      display: 'grid', gap: 'var(--space-3)', padding: 'var(--space-3)',
      flex: '1 1 auto', minHeight: 0,
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gridTemplateRows: 'repeat(2, minmax(0, 1fr))', alignContent: 'center',
    }}>
      {tiles.map((tile) => (
        <button
          key={tile.n} type="button" data-testid="multiview-tile"
          data-source={tile.n} data-live={tile.live ? 'true' : 'false'}
          data-actionable={tile.act ? 'true' : 'false'}
          disabled={!tile.act}
          onClick={tile.act}
          title={`${tile.label} — ${tile.sub}`
            + (tile.why ? `\n${tile.why}` : '')}
          /*
            * A TILE IS A MONITOR IN A RACK, and a rack is a row of
            * recessed wells rather than a row of cards. The inset dark
            * edge is what makes six of them read as one instrument
            * instead of six floating rectangles. [elevation]
            *
            * THE LIVE ONE WEARS A TALLY. It had a tinted halo — a 2px
            * blue glow spreading outside the tile — which finds the eye
            * but is the wrong object: a halo is a web affordance, and a
            * switcher has never had one. A rack tells you what is on air
            * with a TALLY: a hard bar along the top edge of the monitor,
            * in the colour of the bus it is on. It is found just as
            * fast, it costs no pixels outside the tile, and it is what
            * the equipment this is imitating actually does.
            *
            * Red for program, blue for preview, because those are the
            * two buses and an operator already knows which is which.
            * [brief §6 — "a restrained blue/white active edge"]
            */
          style={{
            position: 'relative', minHeight: 44,
            borderRadius: 'var(--radius-screen)', padding: 0, minWidth: 0,
            overflow: 'hidden', background: 'var(--screen-bed)', textAlign: 'left',
            font: 'inherit', color: 'inherit',
            cursor: tile.act ? 'pointer' : 'default',
            /*
             * A DISABLED TILE IS STILL A MONITOR. It is dimmed rather than
             * greyed: an operator watching six sources needs to see the one
             * they cannot cut to as much as the ones they can.
             */
            opacity: tile.act || tile.live ? 1 : 0.7,
            border: `1px solid ${tile.live
              ? 'rgba(226,59,46,0.55)'
              : tile.on ? 'rgba(63,142,232,0.45)' : 'var(--console-seam)'}`,
            boxShadow: tile.live
              ? 'inset 0 3px 0 0 var(--state-live),'
                + ' inset 0 0 0 1px rgba(226,59,46,0.16)'
              : tile.on
                ? 'inset 0 2px 0 0 var(--accent),'
                  + ' inset 0 1px 3px rgba(0,0,0,0.6)'
                : 'inset 0 1px 3px rgba(0,0,0,0.6)',
            transition: 'box-shadow var(--motion-fast) var(--ease-out),'
              + ' border-color var(--motion-fast) var(--ease-out),'
              + ' opacity var(--motion-fast) var(--ease-out)',
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
              placeItems: 'center', fontSize: 'var(--text-md)', opacity: 0.4,
            }}>{tile.glyph ?? '—'}</span>
          )}
          {/*
            * THE SOURCE NUMBER, which is how an operator actually refers
            * to a tile out loud. It sits on its own plate rather than on
            * the picture: a number over moving video is unreadable for
            * whichever frames happen to be pale behind it.
            */}
          {/*
            * ZERO-PADDED, because inputs on a switcher are 01..24 and a
            * bare "1" beside a "12" is a different width and a different
            * object. It sits below the tally bar rather than over it.
            */}
          <span className="mono readout" style={{
            position: 'absolute', left: 0, top: tile.live ? 3 : 0,
            padding: '2px 5px 2px 4px',
            borderBottomRightRadius: 'var(--radius-xs)',
            /* The same plate alpha as every other OSD in the product.
               This was 0.78 — a fourth private near-black, arrived at
               by eye on this one tile. No hairline, because a plate
               seated into a corner has only two edges to draw and a
               border on those two reads as a torn label. */
            background: 'rgba(0,0,0,0.72)',
            fontSize: 'var(--text-2xs)', lineHeight: 1.25,
            fontWeight: 'var(--weight-bold)',
            letterSpacing: '0.04em',
            color: tile.live ? '#ff9c91' : 'var(--ink-200)',
          }}>{String(tile.n).padStart(2, '0')}</span>
          {/*
            * THE NAME PLATE. A single-stop gradient leaves a visible seam
            * where it starts; three stops with an eased middle is what
            * makes a scrim read as light falling off rather than as a
            * translucent box laid over the picture.
            */}
          <span style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            padding: '14px var(--space-2) var(--space-2)',
            fontSize: 'var(--text-2xs)', lineHeight: 1.3,
            background: 'linear-gradient(180deg, transparent 0%,'
              + ' rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.9) 100%)',
          }}>
            <span style={{
              display: 'block', fontWeight: 'var(--weight-semi)',
              overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', color: 'var(--ink-000)',
            }}>{tile.label}</span>
            <span className="row" style={{
              gap: 5, flexWrap: 'nowrap', minWidth: 0,
            }}>
              <span className="grow" style={{
                minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.62)',
              }}>{tile.sub}</span>
              {/*
                * STATUS, IN A WORD, on every input. The brief asks each
                * source to say availability as well as identity, and a
                * tile that says only its name leaves "can I cut to this"
                * to be discovered by clicking. LIVE / READY / — is the
                * whole vocabulary, and it survives greyscale because it
                * is a word. [brief §8, U-19]
                */}
              <span style={{
                flex: '0 0 auto', fontSize: 'var(--text-2xs)',
                fontWeight: 'var(--weight-bold)', letterSpacing: '0.08em',
                color: tile.live ? '#ff9c91'
                  : tile.on ? 'rgba(146, 194, 240, 0.95)'
                    : tile.act ? 'rgba(146, 214, 166, 0.92)'
                      : 'rgba(255,255,255,0.35)',
              }}>
                {tile.live ? 'LIVE' : tile.on ? 'ON'
                  : tile.act ? 'READY' : '\u2014'}
              </span>
            </span>
          </span>
        </button>
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
      {/*
        * THE LANE NAMES ARE A LEGEND, NOT CONTENT. They are read once
        * when somebody first meets the timeline and never again, so
        * they sit at the faintest tone and in the smallest size the
        * scale has. Anything louder and four labels compete with the
        * programmes they are labelling, every second of every day.
        */}
      <span style={{
        flex: '0 0 auto', width: 96,
        padding: '5px var(--space-4) 0 0', textAlign: 'right',
      }}>
        <span style={{
          display: 'block', fontSize: 'var(--text-2xs)',
          fontWeight: 'var(--weight-bold)', color: 'var(--ink-300)',
          letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>{name}</span>
        {note && (
          <span style={{
            display: 'block', fontSize: 'var(--text-2xs)',
            transform: 'scale(0.85)', transformOrigin: 'right top',
            color: 'var(--ink-400)',
          }}>{note}</span>
        )}
      </span>
      {/*
        * A LANE IS A TRACK, AND A TRACK IS A GROOVE. The lanes were
        * separated by a hairline and nothing else, so four of them read
        * as three lines rather than as four channels. A recessed ground
        * gives each one a floor for its blocks to sit on, which is what
        * makes a timeline read as a timeline rather than as a table.
        */}
      <div style={{
        position: 'relative', flex: 1, minWidth: 0, height,
        borderTop: 'var(--border) solid var(--line)',
        background: 'rgba(0,0,0,0.22)',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)',
      }}>{children}</div>
    </div>
  );

  return (
    <div data-testid="schedule-strip" style={{ minWidth: 0 }}>
      {/* ---- the ruler ------------------------------------------------ */}
      <div className="row" style={{ alignItems: 'stretch' }}>
        <span style={{ flex: '0 0 auto', width: 96 }} />
        {/*
          * A RULE IS A RULE, NOT A ROW OF NUMBERS.
          *
          * The time scale was five clock readings floating in eighteen
          * pixels of air, and a reading with nothing under it does not
          * say WHERE it is — the eye has to drop a plumb line by guess
          * to find which pixel 00:30 actually means. Every measuring
          * instrument ever made solves this the same way: the number
          * sits above a mark, and the mark touches the thing being
          * measured.
          *
          * So each label now has a tick descending to the first lane,
          * and a baseline runs the width. Nothing else changes — same
          * step, same labels, same positions. [brief §11]
          */}
        <div style={{
          position: 'relative', flex: 1, minWidth: 0, height: 20,
          borderBottom: 'var(--border) solid var(--console-edge)',
        }}>
          {Array.from({ length: ticks + 1 }, (_unused, index) => {
            const at = windowFrom + index * STEP_MS;
            return (
              <span key={index}>
                <span className="mono readout" style={{
                  position: 'absolute', top: 1, left: across(at),
                  fontSize: 'var(--text-2xs)', color: 'var(--ink-300)',
                  letterSpacing: '0.04em',
                  transform: index === 0 ? 'none' : 'translateX(-50%)',
                }}>{clock(at)}</span>
                <span aria-hidden="true" style={{
                  position: 'absolute', bottom: 0, left: across(at),
                  width: 1, height: 5, background: 'var(--console-edge)',
                }} />
              </span>
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
                  /*
                   * A PROGRAMME BLOCK IS A CLIP IN A TRACK, and a clip
                   * has square ends. The 5px radius rounded both ends of
                   * every block, which puts four pixels of empty track
                   * either side of a thing whose whole meaning is
                   * "occupies exactly this span" — and where two
                   * programmes butt up against each other it drew a gap
                   * that is not there. 2px, which is a cut edge rather
                   * than a pill. [brief §11]
                   */
                  minWidth: 3, padding: '3px 5px', borderRadius: 2,
                  textAlign: 'left', font: 'inherit', fontSize: 'var(--text-2xs)',
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
                        : segment.on.kind === 'programme' ? 'rgba(45,110,200,0.26)'
                          : 'rgba(45,110,200,0.12)',
                  /*
                   * THE ONE ON AIR IS LIT ALONG ITS TOP EDGE, the same
                   * tally the multi-view learned in 03. It was outlined
                   * in the same accent as the chosen one, so "what is
                   * going out right now" and "what I clicked" were the
                   * same mark on a lane of forty blocks.
                   */
                  borderTop: holds
                    ? '2px solid var(--state-live)'
                    : `1px solid ${broken ? 'var(--state-live-dim)'
                      : isChosen ? 'var(--accent-soft)' : 'var(--console-edge)'}`,
                  borderRight: `1px solid ${broken ? 'var(--state-live-dim)'
                    : isChosen ? 'var(--accent-soft)' : 'var(--console-edge)'}`,
                  borderBottom: `1px solid ${broken ? 'var(--state-live-dim)'
                    : isChosen ? 'var(--accent-soft)' : 'var(--console-edge)'}`,
                  borderLeft: `1px solid ${broken ? 'var(--state-live-dim)'
                    : isChosen ? 'var(--accent-soft)' : 'var(--console-edge)'}`,
                  boxShadow: isChosen
                    ? 'inset 0 0 0 1px rgba(127,180,238,0.35)' : 'none',
                }}
              >
                <span style={{
                  display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', fontWeight: 600,
                }}>{segment.title}</span>
                <span className="muted" style={{ fontSize: 'var(--text-2xs)' }}>
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
              minWidth: 3, overflow: 'hidden',
              borderRadius: 'var(--radius-screen)',
              border: '1px solid var(--line)', background: 'var(--screen-bed)',
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
                minWidth: 3, borderRadius: 4, padding: '0 5px', fontSize: 'var(--text-2xs)',
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
              position: 'absolute', left: 8, top: 5, fontSize: 'var(--text-2xs)',
            }}>No lower thirds — set them in Graphics</span>
          )}
        </Lane>

        {/* ---- AUDIO: continuous, by definition ------------------------- */}
        <Lane name="Audio" note="always on" height={34}>
          <div data-testid="audio-lane" style={{
            position: 'absolute', inset: '3px 0', borderRadius: 4,
            background: 'rgba(42,140,140,0.20)', border: '1px solid #2f7f7f',
            padding: '0 6px', fontSize: 'var(--text-2xs)', lineHeight: '19px', color: '#8fd2d2',
            overflow: 'hidden', whiteSpace: 'nowrap',
          }}>
            Master Audio (Program)
          </div>
        </Lane>

        {/* ---- the playhead --------------------------------------------- */}
        {now >= windowFrom && now <= windowTo && (
          /*
            * THE PLAYHEAD IS NOW, AND NOW IS THE ONLY THING ON THIS PAGE
            * THAT MOVES BY ITSELF. It was a 2px line the same red as
            * several other things; it is now the live red with a glow,
            * so it is found instantly in a field of blocks without
            * being thick enough to hide what is under it.
            */
          <div aria-hidden="true" data-testid="playhead" style={{
            position: 'absolute', top: 0, bottom: 0, width: 2,
            left: `calc(96px + (100% - 96px) * `
              + `${(now - windowFrom) / (windowTo - windowFrom)})`,
            /*
             * THE GLOW GOES. It was an 8px bloom in the playhead's own
             * hue, which on a lane of tinted blocks reads as the line
             * being out of focus. A playhead is a hairline you trust to
             * be exactly where it says — bloom is the opposite claim.
             * 1px of solid red with a hard 1px dark edge either side is
             * both thinner and easier to find, because the eye locks on
             * to the edge contrast rather than the brightness.
             */
            background: 'var(--state-live)', pointerEvents: 'none', zIndex: 5,
            boxShadow: '0 0 0 1px rgba(0,0,0,0.55)',
          }}>
            {/*
              * THE FLAG IS A FLAG, not a pill. Square-cornered, seated
              * on the ruler, pointing at its own line — which is what a
              * timecode marker looks like on every edit system, and
              * what makes it read as attached to the playhead rather
              * than floating near it.
              *
              * IT SAYS THE TIME AND NOTHING ELSE, for two reasons.
              *
              * The first is that it was LYING. It read "ON AIR 01:15",
              * and the playhead is drawn whenever now falls inside the
              * window — which it does at four in the morning on a
              * channel that is off air. A red flag claiming ON AIR over
              * a dead schedule is the third instance of this same bug
              * in this pass, and the same answer applies: a marker
              * reports where it is, and `whatIsOn` is the only thing
              * that reports what is happening. [U-20]
              *
              * The second is that at ninety-four pixels it ran into the
              * next ruler label and clipped it to ":30" — a fragment
              * that reads as a different, wrong time. Occluding a
              * number entirely is fine and every edit system does it;
              * occluding two thirds of one is not. At forty pixels it
              * clears a 145px label step, and a direct hit now covers a
              * label rather than shaving it.
              */}
            <span className="mono readout" data-testid="playhead-flag" style={{
              position: 'absolute', top: -19, left: -1,
              padding: '2px 6px 2px 5px',
              borderRadius: '0 2px 2px 0',
              background: 'var(--state-live-dim)',
              borderLeft: '2px solid var(--state-live)',
              color: 'var(--ink-000)', fontSize: 'var(--text-2xs)',
              fontWeight: 'var(--weight-bold)', whiteSpace: 'nowrap',
              letterSpacing: '0.07em',
            }}>{clock(now)}</span>
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
                 gap: 10, padding: '6px 8px', borderRadius: 6, fontSize: 'var(--text-sm)',
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
            <span className="muted" style={{ flex: '0 0 auto', fontSize: 'var(--text-2xs)' }}>
              {segment.on.kind === 'off' ? 'off air'
                : segment.on.kind === 'rotation'
                  ? (segment.on.blockName ?? 'the loop')
                  : segment.on.kind}
            </span>
            <span className="mono muted" style={{ flex: '0 0 auto', fontSize: 'var(--text-2xs)' }}>
              {offsetLabel(segment.toMs - segment.fromMs)}
            </span>
          </div>
        );
      })}
      {channel.backup && (
        <p className="small muted" style={{ margin: '8px 2px 0', fontSize: 'var(--text-2xs)' }}>
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
            position: 'absolute', top: 0, fontSize: 'var(--text-2xs)',
            left: `calc(${(mark * 6 / 24) * 100}% + 3px)`,
          }}>{String(mark * 6).padStart(2, '0')}:00</span>
        ))}
        {blocks.map((block) => (
          <div key={block.id} data-testid="calendar-block" style={{
            position: 'absolute', top: 14, bottom: 2,
            left: `${(block.fromMinute / (24 * 60)) * 100}%`,
            padding: '0 6px', borderRadius: 4, fontSize: 'var(--text-2xs)', lineHeight: '14px',
            whiteSpace: 'nowrap',
            background: block.id === holding
              ? 'rgba(45,110,200,0.38)' : 'rgba(45,110,200,0.16)',
            border: '1px solid var(--line)',
          }}>{block.name}</div>
        ))}
      </div>

      {blocks.length === 0 && (
        <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
          No day-parts. Add one in Schedules and the channel gets a morning
          that is different from its evening.
        </p>
      )}

      {blocks.map((block) => (
        <div key={block.id} className="panel" data-testid="calendar-row"
             data-block-id={block.id} style={{ padding: 9 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="mono muted" style={{ fontSize: 'var(--text-xs)' }}>
              {atMinute(block.fromMinute)}
            </span>
            <strong className="grow" style={{ fontSize: 'var(--text-sm)' }}>{block.name}</strong>
            {block.id === holding && (
              <span style={{
                padding: '1px 6px', borderRadius: 3, background: 'var(--accent-deep)',
                fontSize: 'var(--text-2xs)', fontWeight: 800,
              }}>ON AIR</span>
            )}
            <button className="small" data-testid="add-to-block"
                    onClick={() => onAddToBlock(block)}
                    style={{
                      border: 0, background: 'none', padding: 0, fontSize: 'var(--text-xs)',
                      color: 'var(--accent-soft)', cursor: 'pointer',
                    }}>+ Add pick</button>
          </div>
          {block.rotation.length === 0 ? (
            <p className="small muted" style={{ margin: '5px 0 0', fontSize: 'var(--text-2xs)' }}>
              Empty — the channel&rsquo;s own loop runs through this block.
            </p>
          ) : block.rotation.map((entry) => (
            <div key={entry.id} className="row" data-testid="block-entry"
                 style={{ gap: 8, fontSize: 'var(--text-xs)', marginTop: 4 }}>
              <span style={{
                flex: 1, minWidth: 0, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{entry.title ?? nameOf(entry.source)}</span>
              <span className="mono muted" style={{ fontSize: 'var(--text-2xs)' }}>
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

      <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-2xs)' }}>
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
  devices, cameraId, micId, onCamera, onMic,
  quality, onQuality, qualityLocked, transmission,
}: {
  devices: Devices;
  cameraId?: string;
  micId?: string;
  onCamera: (deviceId: string | undefined) => void;
  onMic: (deviceId: string | undefined) => void;
  quality: Quality;
  onQuality: (id: QualityId) => void;
  /** On air: the canvas cannot be resized without cutting the feed. */
  qualityLocked: boolean;
  transmission: Quality;
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
          borderRadius: 'var(--radius-screen)', overflow: 'hidden', background: 'var(--screen-bed)',
          border: `1px solid ${armed ? 'var(--ink-on-armed)' : onAir ? 'var(--state-live-dim)' : 'var(--line)'}`,
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
              placeItems: 'center', fontSize: 'var(--text-xs)', textAlign: 'center', padding: 10,
            }}>Camera off. GO LIVE brings it up.</span>
          )}
          <span style={{
            position: 'absolute', left: 6, bottom: 5, padding: '2px 7px',
            borderRadius: 'var(--radius-screen)',
            background: 'rgba(0,0,0,0.72)',
            border: '1px solid rgba(255,255,255,0.14)',
            color: 'rgba(255,255,255,0.94)',
            fontSize: 'var(--text-2xs)', fontWeight: 600,
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

      {/* ---- which camera, which microphone (§23) ------------------- */}
      <div data-testid="device-picker" style={{
        display: 'flex', flexDirection: 'column', gap: 5, marginTop: 9,
      }}>
        <select
          data-testid="camera-choice" value={cameraId ?? ''}
          onChange={(event) => onCamera(event.target.value || undefined)}
          style={{ fontSize: 'var(--text-xs)', padding: '6px 8px' }}
        >
          <option value="">Camera — the system default</option>
          {devices.cameras.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
        <select
          data-testid="mic-choice" value={micId ?? ''}
          onChange={(event) => onMic(event.target.value || undefined)}
          style={{ fontSize: 'var(--text-xs)', padding: '6px 8px' }}
        >
          <option value="">Microphone — the system default</option>
          {devices.microphones.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
        {/*
          * ---- HOW GOOD (§7, quality.ts) --------------------------------
          *
          * Beside the device menus because it is the same question asked
          * twice: WHICH camera, and THEN how much of it to use. A capture
          * card chosen above and left at Standard is a cinema camera
          * composited onto a 720p canvas, which is the exact trap this
          * control exists to close.
          */}
        <select
          data-testid="quality-choice" value={quality.id}
          disabled={qualityLocked}
          onChange={(event) => onQuality(event.target.value as QualityId)}
          style={{ fontSize: 'var(--text-xs)', padding: '6px 8px' }}
        >
          {QUALITY_ORDER.map((id) => (
            <option key={id} value={id}>{QUALITIES[id]!.label}</option>
          ))}
        </select>
        <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-2xs)' }}>
          {qualityLocked
            /*
             * NOT A LIMITATION BEING APOLOGISED FOR. Resizing the canvas
             * mid-broadcast restarts `captureStream`, and a new track in the
             * middle of a live session is a gap in the file that becomes the
             * archive. Waiting is the right answer; saying so is the honest
             * way to make waiting acceptable.
             */
            ? `${quality.needs} Changing it cuts the feed, so it waits for the `
              + 'next broadcast.'
            : quality.needs}
        </p>
        {aboveTransmission(quality, transmission) && (
          /*
           * NOT A WARNING, AND IT MUST NOT READ AS ONE. The extra detail is
           * genuinely kept: the ingest webm is the file promoted into the
           * archive when a session is saved (INV-17), so recording above
           * what you transmit is the ordinary broadcast practice of keeping
           * the good copy. What would be dishonest is letting somebody
           * choose Maximum, watch the monitor, and think nothing happened.
           */
          <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-2xs)' }}>
            The channel transmits at {transmission.height}p, so viewers see
            {' '}{transmission.height}p — the extra detail is kept in the
            recording of this session.
          </p>
        )}
        {!devices.named && devices.cameras.length > 0 && (
          /*
           * `enumerateDevices` returns cameras with blank labels until
           * permission has been granted, so before GO LIVE the menu is
           * numbered rather than named. Saying why beats a list of
           * "Camera 1, Camera 2" that looks like a fault. [§23]
           */
          <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-2xs)' }}>
            Your browser will not name the devices until you allow access.
            Go live once and the real names appear.
          </p>
        )}
        {devices.cameras.length === 0 && (
          <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-2xs)' }}>
            No camera found. A phone works as one over USB (Continuity
            Camera, Camo, EpocCam, or Android&rsquo;s webcam mode), and a
            professional camera works through a UVC capture card — both
            appear here once the computer sees them.
          </p>
        )}
      </div>

      <div data-testid="feed-health" style={{
        fontSize: 'var(--text-xs)', padding: '6px 8px', borderRadius: 7, marginTop: 8,
        background: 'var(--panel-2)', border: '1px solid var(--line)',
      }}>
        <div className="row" style={{ gap: 8 }}>
          <Dot on colour={encoder.running && encoder.dropped === 0 ? 'var(--state-ok)'
            : encoder.running ? 'var(--state-warn)' : 'var(--state-live-dim)'} />
          <span className="grow muted">
            {encoder.running
              ? `Feed · ${encoder.sent} sent`
                + (encoder.dropped ? ` · ${encoder.dropped} lost` : '')
              : encoder.error ?? 'No camera'}
          </span>
          {encoder.running && (
            <span className="mono muted" data-testid="feed-rate">
              {Math.round(encoder.rate / 1000)}
              <span style={{ opacity: 0.55 }}>
                {' / '}{Math.round(targetBytesPerSecond(quality) / 1000)} kB/s
              </span>
            </span>
          )}
        </div>
        {encoder.running && (
          /*
           * A RATE WITH NOTHING TO COMPARE IT TO IS NOT INFORMATION. This
           * whole control exists because somebody read `62 kB/s` and could
           * not tell whether the product was broken, throttled, or simply
           * pointed at a still picture — which it was. A bar against the
           * ceiling and one sentence answer that in a glance. [D-20]
           */
          <>
            <div style={{
              height: 3, borderRadius: 2, marginTop: 6, overflow: 'hidden',
              background: 'rgba(255,255,255,0.08)',
            }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, Math.round(
                  (encoder.rate / Math.max(1, targetBytesPerSecond(quality))) * 100))}%`,
                background: rateVerdict(encoder.rate, quality) === 'capped'
                  ? 'var(--state-warn)' : 'var(--state-ok)',
                transition: 'width 400ms linear',
              }} />
            </div>
            <p className="small muted" data-testid="feed-rate-note" style={{
              margin: '5px 0 0', fontSize: 'var(--text-2xs)',
            }}>{rateSentence(encoder.rate, quality)}</p>
          </>
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
          <span className="muted" style={{
            fontSize: 'var(--text-2xs)',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            {spaceId ? SPACE_LOOKS[spaceId]?.label ?? spaceId : 'None'}
            <Icon name="chevron" size={9} turn={90} />
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
              aria-pressed={chosen}
              onClick={() => onSpace(chosen ? '' : space.id)}
              title={space.label}
              /*
                * AN ASSET IN A LIBRARY, not a swatch in a palette. Ten
                * rounded squares in a five-across grid with a caption
                * under each is the shape of a colour picker, and these
                * are SETS — the room a presenter is composited into.
                * Square corners, a seam between neighbours instead of
                * a gap, and the chosen one lit along its top edge in
                * the same accent the rest of the room now uses for
                * "this is the one". [brief §10]
                */
              style={{
                padding: 0, aspectRatio: '1 / 1', borderRadius: 'var(--radius-screen)',
                overflow: 'hidden', cursor: 'pointer', position: 'relative',
                background: SPACE_SWATCHES[space.id] ?? '#1b2028',
                border: `1px solid ${chosen
                  ? 'var(--accent)' : 'var(--console-seam)'}`,
                borderTopWidth: chosen ? 2 : 1,
                borderTopColor: chosen ? 'var(--accent)' : 'var(--console-seam)',
                opacity: chosen ? 1 : 0.82,
              }}
            >
              {/*
                * 7px WAS NOT A SIZE, IT WAS AN APOLOGY. The type scale
                * bottoms at 10px for a reason — below that a label is a
                * grey smear that tells you a word is present without
                * telling you which. The plate is a scrim on the picture
                * now rather than a caption bar under it, which buys the
                * three pixels back without the tile growing.
                */}
              {/*
                * AND IT WRAPS RATHER THAN ELLIPSISING. Five tiles
                * across a 330px column is 56 pixels; "Recording
                * Studio" wants about 85, so on one line it became
                * "Recordi…" — which does not distinguish it from a
                * Recording Booth, and four of the ten sets were in
                * that state. An ellipsis is the right answer for a
                * programme title, where the first words identify it
                * and the row can be widened. It is the wrong answer
                * for a fixed grid of ten proper nouns, all of which
                * have to be told apart at a glance.
                *
                * Two lines, clamped, which is what Studio Two's larger
                * tiles have always done with the same ten labels — so
                * this also stops the same set being named two
                * different ways in two rooms. [brief §13, D-19]
                */}
              <span style={{
                position: 'absolute', left: 0, right: 0, bottom: 0,
                fontSize: 'var(--text-2xs)', lineHeight: '12px',
                padding: '2px 3px', textAlign: 'center',
                letterSpacing: '-0.01em',
                color: chosen ? 'var(--ink-000)' : 'var(--ink-100)',
                /*
                  * A PLATE, NOT A FADE. The scrim reached full
                  * opacity 35% down the label — fine under one line,
                  * and under two it left the FIRST line sitting on
                  * the raw swatch. Four of the ten sets are light
                  * (Modern Room is near-white, Beach and Mountain are
                  * pale sky), so "Modern" was grey on grey while
                  * "Room" underneath it was white on black.
                  *
                  * It is the same plate every other label on a
                  * picture in this product uses, which also means the
                  * tone is measured rather than dependent on which
                  * set happens to be behind it. [brief §19]
                  */
                background: 'rgba(0,0,0,0.72)',
                display: '-webkit-box', WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical', overflow: 'hidden',
                overflowWrap: 'break-word',
              }}>{space.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function VMeter({ value, tint = 'var(--state-ok)' }: { value: number; tint?: string }) {
  const lit = Math.min(1, value * 1.6);
  return (
    /*
      * A VERTICAL METER IS A WELL WITH LIGHT RISING IN IT. The track is
      * recessed rather than merely outlined, so the column has a
      * bottom for the level to stand on — and the gradient runs green
      * to amber to red at the points a broadcast engineer expects
      * them, which is why the stops are at 78% and not spread evenly.
      * An evenly-spread meter is amber at conversational speech, and
      * then amber means nothing.
      */
    <span aria-hidden="true" style={{
      width: 7, height: '100%', minHeight: 54,
      borderRadius: 'var(--radius-xs)',
      background: 'var(--ink-900)',
      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06),'
        + ' inset 0 1px 3px rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'flex-end', overflow: 'hidden',
    }}>
      <span style={{
        width: '100%', height: `${lit * 100}%`,
        background: `linear-gradient(0deg, ${tint}, var(--state-warn) 78%,`
          + ' var(--state-live))',
        boxShadow: lit > 0.92 ? 'inset 0 0 0 1px rgba(255,160,150,0.5)' : 'none',
        transition: 'height 60ms linear',
      }} />
    </span>
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
  channel, picked, onAir, nameOf, onRollIn, onRollOut, onShow, share,
}: {
  channel: Channel;
  picked: LibraryItem | null;
  onAir: boolean;
  nameOf: (source: ProgrammeSource) => string;
  onRollIn: () => void;
  onRollOut: () => void;
  /** Put a named reference up — what a slide needs and a pick does not. */
  onShow: (source: ProgrammeSource) => void;
  /** A live web page, or anything else on the presenter's screen. [§22] */
  share: ScreenShare;
}) {
  const up = channel.live?.segment;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div className="panel" style={{ padding: 9 }}>
        <div className="muted" style={{
          fontSize: 'var(--text-2xs)', letterSpacing: 0.8, fontWeight: 700,
        }}>ROLLED IN</div>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
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
      <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
        {picked
          ? `Ready: “${picked.title}”.`
          : 'Pick something in the Library and it can go up over the feed.'}
      </p>

      {/* ---- a live web page, or anything on screen (§22) --------- */}
      <div data-testid="screen-share" style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        borderTop: '1px solid var(--line)', paddingTop: 9, marginTop: 2,
      }}>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <span className="muted grow" style={{
            fontSize: 'var(--text-2xs)', letterSpacing: 0.8, fontWeight: 700,
          }}>LIVE SCREEN</span>
          {share.sharing && (
            <span style={{
              padding: '1px 6px', borderRadius: 3, background: 'var(--studio-tv)',
              color: 'var(--ink-000)', fontSize: 'var(--text-2xs)', fontWeight: 800, letterSpacing: 0.5,
            }}>IN THE MIX</span>
          )}
        </div>
        {share.sharing ? (
          <>
            <div className="row" style={{
              gap: 7, fontSize: 'var(--text-xs)', padding: '5px 7px', borderRadius: 6,
              flexWrap: 'nowrap', background: 'var(--panel-2)',
              border: '1px solid var(--line)',
            }}>
              <Dot on colour="var(--studio-tv)" />
              <span className="grow" style={{
                minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>{share.label}</span>
            </div>
            <button className="small" data-testid="stop-share"
                    onClick={share.stop}
                    style={{ borderColor: 'var(--state-live-dim)', color: '#e07a6b' }}>
              Stop sharing
            </button>
          </>
        ) : (
          <>
            <button
              className="small" data-testid="start-share" disabled={!onAir}
              title={onAir
                ? 'Your browser asks which tab, window or screen to share'
                : 'Only while you are live'}
              onClick={() => { void share.start(); }}
            >
              Share a tab, window or screen
            </button>
            <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-2xs)' }}>
              {/*
                * Said once, because it is the difference between this and
                * everything else in the tab: a shared screen JOINS the
                * picture rather than replacing it.
                */}
              It joins the picture beside you, rather than replacing the feed
              — a live web page with the presenter still in frame.
            </p>
          </>
        )}
        {share.error && (
          <p className="small" style={{ margin: 0, color: 'var(--bad)', fontSize: 'var(--text-xs)' }}>
            {share.error}
          </p>
        )}
      </div>

      {/*
        * SLIDES ARE THE SAME DOOR. A deck is an order over library images
        * and advancing one is `roll-in` of the next — so it belongs in the
        * tab named after putting things up, rather than in a tab of its
        * own that would do the same thing by a second route. [§20, D-19]
        */}
      <SlidesPanel
        channel={channel} onAir={onAir}
        onShow={onShow} onRollOut={onRollOut}
      />
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
      <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
        Drawn onto the broadcast, never onto your videos.
      </p>

      <label className="small" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
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
          style={{ fontSize: 'var(--text-sm)', padding: '6px 9px', marginTop: 3 }}
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
                aria-pressed={chosen}
                onClick={() => onIdentity({
                  bug: {
                    text: identity?.bug?.text ?? channel.name,
                    corner, opacity: identity?.bug?.opacity ?? 0.85,
                  },
                })}
                className={`ctl${chosen ? ' is-on' : ''}`}
                style={{ padding: '3px 8px', fontSize: 'var(--text-2xs)' }}
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
              aria-pressed={chosen}
              onClick={() => onIdentity({
                lowerThird: {
                  show, holdMs: identity?.lowerThird?.holdMs ?? 8000,
                  ...(identity?.lowerThird?.presenter
                    ? { presenter: identity.lowerThird.presenter } : {}),
                },
              })}
              className={`ctl${chosen ? ' is-on' : ''}`}
              style={{ flex: 1, padding: '5px 4px', fontSize: 'var(--text-2xs)' }}
            >{show}</button>
          );
        })}
      </div>

      <label className="small" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
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
          style={{ fontSize: 'var(--text-sm)', padding: '6px 9px', marginTop: 3 }}
        />
      </label>

      <label className="small" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
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
          style={{ fontSize: 'var(--text-sm)', padding: '6px 9px', marginTop: 3 }}
        />
      </label>
      <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-2xs)' }}>
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
  /*
   * A MIXER IS A STRIP OF CHANNELS, NOT A COLUMN OF CARDS.
   *
   * Every channel had its own rounded rectangle with its own border and
   * a gap under it — so four microphones read as four objects rather
   * than as four channels of one desk. On real equipment the channels
   * share a face and are separated by a hairline, and the MASTER is set
   * apart from them: it is not another input, it is what they sum to.
   *
   * The master gets a rule beneath it and a slightly lighter face; the
   * inputs run underneath as a list. Nothing moves, nothing is removed,
   * and the meters are the same meters. [brief §9]
   */
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      border: 'var(--border) solid var(--console-seam)',
      borderRadius: 3, overflow: 'hidden',
      background: 'var(--console-inset)',
    }}>
      <div className="row" data-testid="master-audio" style={{
        gap: 8, padding: '7px 9px', fontSize: 'var(--text-xs)',
        background: 'var(--console-control)',
        borderBottom: 'var(--border) solid var(--console-edge)',
        boxShadow: 'var(--console-bevel)',
        flexWrap: 'nowrap',
      }}>
        <span className="grow module-label" style={{ color: 'var(--ink-200)' }}>
          Master
        </span>
        <Meter value={levels['master']?.energy ?? 0} label="master" />
        {/*
          * THE RATE IS A READOUT. A number that changes every second,
          * beside a meter, in a proportional face, re-flows on every
          * tick — which is the shimmer that makes a mixer look cheap.
          */}
        <span className="mono readout" style={{
          fontSize: 'var(--text-2xs)', color: 'var(--ink-300)',
          minWidth: 52, textAlign: 'right',
        }}>
          {encoder.running ? `${Math.round(encoder.rate / 1000)} kB/s` : '—'}
        </span>
      </div>

      {guests.sources.length === 0 ? (
        <p style={{
          margin: 0, padding: '8px 9px', fontSize: 'var(--text-2xs)',
          color: 'var(--ink-300)',
        }}>
          {onAir ? 'One microphone: yours.'
            : 'Nothing is live. Microphones appear when the stage does.'}
        </p>
      ) : guests.sources.map((person, index) => (
        <div key={person.id} className="row" data-testid="audio-channel" style={{
          gap: 8, fontSize: 'var(--text-xs)', padding: '5px 9px',
          flexWrap: 'nowrap',
          borderTop: index === 0
            ? 0 : 'var(--border) solid var(--console-rule)',
        }}>
          {/* Channels are numbered on a desk, and counted from one. */}
          <span className="mono readout" style={{
            flex: '0 0 auto', width: 16, fontSize: 'var(--text-2xs)',
            color: 'var(--ink-400)', textAlign: 'right',
          }}>{String(index + 1).padStart(2, '0')}</span>
          <span className="grow" style={{
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{person.label ?? person.id}</span>
          {/*
            * SPEAKING, as a word rather than as a meter reading. A
            * level meter says how loud; it does not say whether that
            * is a voice or a chair moving, and the stage follows the
            * voice. [ROOM §4]
            */}
          <span style={{
            flex: '0 0 auto', fontSize: 'var(--text-2xs)',
            letterSpacing: '0.07em',
            color: (levels[person.id]?.speech ?? 0) > 0.5
              ? 'var(--ink-on-ok)' : 'transparent',
          }}>VOICE</span>
          <Meter value={levels[person.id]?.energy ?? 0} label={person.label ?? 'mic'} />
        </div>
      ))}

      {/*
        * SAVE THIS LIVE SESSION, said in words as well as by the red circle
        * in the transport — because the circle is a decision somebody has to
        * be able to read, not just press. [§8]
        */}
      <label className="row" data-testid="keep-live-label" style={{
        gap: 8, fontSize: 'var(--text-xs)', padding: '8px 9px', margin: 0,
        flexWrap: 'nowrap', alignItems: 'flex-start',
        borderTop: 'var(--border) solid var(--console-edge)',
        boxShadow: keeping ? 'inset 2px 0 0 var(--state-live)' : 'none',
        background: keeping ? 'var(--state-live-wash)' : 'var(--console-control)',
      }}>
        <input
          type="checkbox" checked={keeping} disabled={!onAir}
          onChange={(event) => onKeep(event.target.checked)}
        />
        <span style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 600 }}>Save this live session</span>
          <span className="muted" style={{ display: 'block', fontSize: 'var(--text-2xs)' }}>
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
      /*
        * A THING WITH NO PICTURE SHOULD LOOK DELIBERATE, NOT EMPTY. A
        * flat slab with a word on it is what a broken image looks like;
        * fine diagonal hatching is what an EMPTY SLOT looks like, and
        * broadcast tools have used exactly that to mean "no signal here"
        * for as long as there have been racks.
        *
        * The hatch is drawn in CSS at 4px, faint enough to read as
        * texture rather than as a pattern demanding attention, and the
        * word sits on top of it saying which kind of nothing this is.
        */
      <span aria-hidden="true" style={{
        position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
        fontSize: 'var(--text-2xs)',
        fontWeight: 'var(--weight-bold)', letterSpacing: '0.08em',
        color: 'var(--ink-400)',
        background: 'repeating-linear-gradient(45deg,'
          + ' var(--ink-800) 0 3px, var(--ink-750) 3px 6px)',
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
            aria-pressed={minutes === option}
            onClick={() => setMinutes(option)}
            className={`ctl${minutes === option ? ' is-on' : ''}`}
            style={{ padding: '5px 4px', fontSize: 'var(--text-2xs)' }}
          >{option} min</button>
        ))}
      </div>
      <label className="row muted" style={{ gap: 6, fontSize: 'var(--text-xs)', margin: 0 }}>
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
      <button className="ctl" data-testid="add-to-loop"
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
 * WHAT THE PICTURE ACTUALLY IS.  [brief §5, D-16, U-08, INV-02]
 *
 * Every broadcast monitor in the world carries a legend under the
 * glass saying what it is looking at — raster, rate, and how far
 * behind the transmission is. Program Output had a title, a mode
 * badge and a picture, and nothing anywhere on the desk said what
 * format the channel was in. That is the difference between a
 * monitor and a `<video>` in a box.
 *
 * IT IS MEASURED, NEVER ASSERTED. The obvious version of this prints
 * `1920×1080 · 30 fps` because that is the house format, and it is
 * then wrong the first time somebody puts a phone video in the
 * rotation — which, in a product whose whole premise is that people
 * answer each other from wherever they are, is the second programme.
 * A legend that lies about the signal is worse than no legend: it is
 * the thing an operator checks when the picture looks wrong.
 *
 * So it reads the element. `videoWidth`/`videoHeight` on a playing
 * file, `naturalWidth` on a still, and for a live feed the track's
 * own settings — which is the only place a frame rate is honestly
 * available, because a browser will not tell you a file's. When
 * there is nothing to measure it says so rather than guessing.
 */
function Legend({ on }: { on: OnAir }) {
  const [format, setFormat] = useState<string | null>(null);
  const [rate, setRate] = useState<number | null>(null);

  /*
   * THE PICTURE IS NOT THIS COMPONENT'S CHILD. It is drawn by
   * `Monitor` or by the live `<video>` above, both of which already
   * existed and neither of which this pass is going to restructure
   * to thread a ref through. [brief: do not create parallel systems]
   * So the legend finds the picture in the well it sits under, and
   * re-measures whenever the element says its dimensions arrived.
   */
  const measure = useCallback((host: HTMLElement | null) => {
    if (!host) return undefined;
    const well = host.previousElementSibling;
    if (!well) return undefined;

    const read = () => {
      const video = well.querySelector('video');
      const still = well.querySelector('img');
      if (video && video.videoWidth > 0) {
        setFormat(`${video.videoWidth}×${video.videoHeight}`);
        const track = (video.srcObject as MediaStream | null)
          ?.getVideoTracks?.()[0];
        const fps = track?.getSettings?.().frameRate;
        setRate(typeof fps === 'number' && fps > 0 ? Math.round(fps) : null);
        return;
      }
      if (still && still.naturalWidth > 0) {
        setFormat(`${still.naturalWidth}×${still.naturalHeight}`);
        setRate(null);
        return;
      }
      setFormat(null);
      setRate(null);
    };

    read();
    /*
     * A raster arrives late and changes without a React render — a
     * new segment, a track that renegotiates, a still that decodes.
     * Polling a DOM property twice a second is the cheap correct
     * answer where there is no event that fires for all three.
     */
    const timer = window.setInterval(read, 500);
    return () => window.clearInterval(timer);
  }, []);

  /*
   * A RATIO IS ONLY WORTH SAYING WHEN IT IS A RATIO PEOPLE USE.
   *
   * A canvas feed at 1464×823 reduces to 1464:823, because the two
   * numbers are coprime — which is true, useless, and wider than the
   * raster it is explaining. Broadcast ratios are all small: 16:9,
   * 4:3, 1:1, 9:16, 21:9. So it is printed when both terms are small
   * and dropped when they are not, which is the honest reading of "a
   * feed that is not a standard shape has no standard name".
   *
   * Found by measuring a real non-standard feed rather than by
   * thinking about it — 1920×1080 reduces to 16:9 and every test I
   * would have written by hand used 1920×1080.
   */
  const ratio = (() => {
    if (!format) return null;
    const [w, h] = format.split('×').map(Number);
    if (!w || !h) return null;
    const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b));
    const d = g(w, h);
    const [a, c] = [w / d, h / d];
    return a <= 32 && c <= 32 ? `${a}:${c}` : null;
  })();

  return (
    <div
      data-testid="program-legend"
      /*
        * REACT 19 LETS A REF CALLBACK RETURN ITS OWN CLEANUP, which is
        * what this needs and the reason there is no effect here. The
        * first version of this held the interval's clear in state and
        * ran it from a `useEffect` keyed on itself — a state update
        * inside a ref callback, on every attach, to schedule a
        * teardown React will now do properly.
        */
      ref={measure}
      className="row"
      style={{
        gap: 'var(--space-4)', flex: '0 0 auto', flexWrap: 'nowrap',
        padding: '5px 10px', minHeight: 24, overflow: 'hidden',
        borderTop: 'var(--border) solid var(--console-rule)',
        background: 'var(--console-inset)',
      }}
    >
      <span className="mono readout" data-testid="program-format" style={{
        fontSize: 'var(--text-2xs)', letterSpacing: '0.04em',
        color: format ? 'var(--ink-200)' : 'var(--ink-400)',
      }}>{format ?? 'NO SIGNAL'}</span>
      {ratio && <span className="unit">{ratio}</span>}
      {rate !== null && (
        <span className="mono readout unit" data-testid="program-rate">
          {rate} fps
        </span>
      )}
      <span className="grow" />
      {/*
        * HOW FAR BEHIND THE TRANSMISSION IS. The desk shows the
        * operator's own picture, not what a viewer has; twelve
        * seconds is the gap, and a presenter who does not know that
        * talks over themselves. It is only true while live, so it is
        * only said while live. [LIVE_DELAY_MS]
        */}
      {on.kind === 'live' && (
        <span className="mono readout" data-testid="program-delay" style={{
          fontSize: 'var(--text-2xs)', letterSpacing: '0.04em',
          color: 'var(--ink-300)',
        }}>
          TX +{Math.round(LIVE_DELAY_MS / 1000)}s
        </span>
      )}
    </div>
  );
}

/**
 * WHAT A MODULE IS DOING, said one way.  [brief §6, §13, U-19, U-20]
 *
 * There were two of these, hand-written, forty lines apart. Program
 * Output's lived in its head: 10px, weight 800, 4px corners, a filled
 * plate in one of five raw colours. Preview's lay on the picture at
 * 9px with 3px corners and a sixth colour. They report the same kind
 * of fact about the two monitors a gallery exists to let you read
 * TOGETHER, and they did not look like the same kind of thing.
 *
 * The badge is `.state`, which the desk already had. The change is not
 * that it is prettier — it is that a filled plate SHOUTS, and four of
 * the five things it was shouting are ordinary. A channel playing its
 * rotation at three in the morning is not an alarm. So the tint is a
 * wash with a lamp in front of it, and the one state that genuinely
 * is an alarm — the red button — is the only one that reads as one.
 *
 * NOT COLOUR ALONE. Every state carries its own word, so the tone is
 * confirmation and never the message. [U-19]
 */
function Status({
  testid, mode, tone, text,
}: {
  testid: string;
  /** For tests and for the DOM to be readable. Not styling. */
  mode: string;
  tone: 'is-live' | 'is-on' | 'is-armed' | 'is-critical' | 'is-off';
  text: string;
}) {
  return (
    <span className={`state ${tone}`} data-testid={testid} data-mode={mode}>
      {text}
    </span>
  );
}

/**
 * THE FIVE THINGS A CHANNEL CAN BE DOING, and the words for them.
 *
 * A table rather than a nested ternary because the ternary it replaces
 * was five deep across two properties and had to be read twice to see
 * that `programme` and `rotation` fell through to the same arm. Five
 * states, one line each, and adding a sixth is adding a line.
 *
 * `live` and the rest are deliberately NOT the same tone: red means a
 * person is on air, and a rotation block is the machine playing to
 * nobody. Telling an operator those are the same event is the single
 * most consequential lie this desk could tell. [U-20]
 */
const AIR: Record<OnAir['kind'],
{ tone: 'is-live' | 'is-on' | 'is-armed' | 'is-critical' | 'is-off'; text: string }> = {
  live: { tone: 'is-live', text: 'On air' },
  emergency: { tone: 'is-critical', text: 'Emergency' },
  backup: { tone: 'is-armed', text: 'Backup' },
  programme: { tone: 'is-on', text: 'On air' },
  rotation: { tone: 'is-on', text: 'On air' },
  off: { tone: 'is-off', text: 'Off air' },
};

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
        <span style={{ fontSize: 'var(--text-xs)' }}>
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
        <span style={{ fontSize: 'var(--text-xs)' }}>
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
