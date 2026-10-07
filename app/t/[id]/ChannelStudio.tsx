'use client';

import AvailabilityFields from '../../AvailabilityFields.js';
import type { TakeAvailability } from '../../../src/domain/availability.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Channel, ChannelBlock, OnAir, Overrun, Programme, ProgrammeSource,
  RotationEntry,
} from '../../../src/domain/channel.js';
import {
  overrunSays,
  blockAt, nextAfter, onAirAt, orderedBlocks, orderedProgrammes, programmeEnd,
  programmeStart, referencedAssets, rotationLengthMs, rotationOffsets,
  sourceKey, whatIsOn,
} from '../../../src/domain/channel.js';
import { sameCivilDay, shortDay } from '../../../src/domain/calendar.js';
import { SPACES } from '../../../src/domain/performance.js';
import { SPACE_LOOKS } from '../../../src/domain/environment.js';
import { PLATFORMS, type Destination } from '../../../src/domain/distribution.js';
import { LIVE_DELAY_MS } from '../../../src/domain/playout.js';
import {
  FLASH_MS, type DeskTab, type RailTab, jumpFor,
} from '../../../src/domain/fragments.js';
import { airtime } from '../../../src/domain/airtime.js';
import {
  type Bus, busFor, onProgramCount, roomOnProgram, saysFor,
} from '../../../src/domain/multiView.js';
import StudioBar from '../../StudioBar.js';
import Icon from '../../Icon.js';
import {
  MenuButton, MenuHost, RightClickHint, useRowMenu, type MenuEntry,
} from '../../Menu.js';
import { useLiveEncoder } from './useLiveEncoder.js';
import ConfidenceMonitor from './ConfidenceMonitor.js';
import GuestGrid from './GuestGrid.js';
import MediaPlayerPanel, { MediaPreview } from './MediaPlayer.js';
import BackgroundPanel, { type Composited } from './BackgroundPanel.js';
import { type LivePlate, takePlate } from './plate.js';
import {
  type Composition, NO_COMPOSITION, keyFor,
} from '../../../src/domain/composition.js';
import { setById } from '../../../src/domain/virtualSet.js';
import { useBroadcastGuests } from './useBroadcastGuests.js';
import { NO_TRACKS, useTrackStates } from './useTrackStates.js';
import {
  type GuestFeed, type GuestReading, guestCount, readGuests,
} from '../../../src/domain/guestGrid.js';
/*
 * `clock` under another name: this file already has one, and it answers a
 * different question — what time it is, against what length a thing is.
 * Two functions called `clock` in one control room is how a schedule comes
 * to print a duration where a start time belongs.
 */
import {
  type PlayableItem, type PlayerState, IDLE,
  act as playerAct, clock as runsFor, may as playerMay, playerSays, search,
} from '../../../src/domain/mediaPlayer.js';
import { arrangementFor, useBroadcastMixer } from './useBroadcastMixer.js';
import { useFeedLevels } from './useFeedLevels.js';
import AnswersTab from './AnswersTab.js';
import GuestsTab from './GuestsTab.js';
import SlidesPanel from './SlidesPanel.js';
import { type ScreenShare, useScreenShare } from '../../useScreenShare.js';
import {
  type Devices, cameraConstraints, microphoneConstraints, useDevices,
} from '../../useDevices.js';
import { useQuality } from '../../useQuality.js';
import { useConfirm } from '../../Confirm.js';
import { useShot } from './useShot.js';
import {
  type Tone,
  CAPTION_SHARE, COUNTDOWN_READINGS, DEFAULT_SPAN, FRAME_SHARE,
  LENGTH_READINGS, blockTone,
  audioState, canZoom, carriesSound, fitsText, labelNudge, leftOf,
  pieces, piecesSay, roomOnScreen, soundRuns, soundSays, spanSays,
  stepFor, windowFor, zoomed,
} from '../../../src/domain/scheduleView.js';
/*
 * THE GRAPHICS LANE ASKS THE COMPOSITOR.  [D-19, C-47]
 *
 * It drew lower thirds from the identity document, which is one
 * layer of a four-layer composite read off the settings rather
 * than off the thing that draws. `marksFor` has computed all four
 * since the identity was written.
 */
import {
  type GraphicEvent, LAYERS, graphicsOver, layerSays,
} from '../../../src/domain/graphicsLane.js';
/*
 * WHAT KIND OF THING IS ON, in the words a listing would use.
 * Written for the lower third in C-42 and read by nothing else,
 * while the VIDEO TRACKS lane — whose entire job is to say what
 * source occupies a period — said nothing at all. [D-19, C-47]
 */
import { sourceLine, sourceOf, stateLine } from '../../../src/domain/caption.js';
/* A deck is one thing with twelve pages, and the rail listed the
   pages. [§20, D-04, C-48] */
import { deckSays, libraryRows } from '../../../src/domain/libraryRows.js';
import { GENRES } from '../../../src/domain/station.js';
/* One table of what an upload may be, read by the route that
   enforces it and the picker that offers it. [D-19, C-14, C-48] */
import {
  MOST_UPLOAD_BYTES, acceptsAttribute,
} from '../../../src/domain/libraryUpload.js';
import type { StudioId } from '../../../src/domain/account.js';
import {
  type Quality, type QualityId, QUALITIES, QUALITY_ORDER, aboveTransmission,
  qualityFor, rateSentence, rateVerdict, targetBytesPerSecond,
} from '../../../src/domain/quality.js';
import { bodyOf } from '../../../src/domain/saidBy.js';
import { asked } from '../../answered.js';
import type { EngineState, StreamState } from '../../../src/domain/health.js';
import './studio-three.css';

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

/*
 * THE TWO TAB TYPES ARE THE FRAGMENT TABLE'S, not this file's. They
 * were declared here and the table had to name them as strings,
 * which is two definitions of one thing and a renamed tab silently
 * breaking a link. One definition, imported. [C-30]
 */
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
  /** Which deck's page this is, when it is one. [§20, C-48] */
  deck?: { id: string; title: string; page: number; of: number };
  /**
   * What a song is, and what everything else is too.  [§25]
   *
   * *"A song should simply be a Library media item with title,
   * artist/owner, duration, audio/video type, thumbnail/artwork."* Four
   * of the five are these three fields and `Thumb`, which already draws
   * a poster frame from any render. There is no songs table.
   */
  durationMs?: number;
  kind: 'video' | 'audio' | 'image';
  artist?: string;
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
  initial, studioOneId, studioTwoId, serverNow, transmission, owned,
}: {
  initial: Channel;
  studioOneId?: string;
  studioTwoId?: string;
  owned?: StudioId[];
  /** When the server drew this page. See the note where it is passed. */
  serverNow?: number;
  /** What the channel puts on the wire, as against what this machine sends. */
  transmission?: QualityId;
}) {
  const [channel, setChannel] = useState(initial);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  /** Which deck in the library rail is showing its pages. [C-48] */
  const [openDeck, setOpenDeck] = useState<string | null>(null);
  const upload = useRef<HTMLInputElement | null>(null);
  const [putting, setPutting] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<ProgrammeSource[]>([]);
  /**
   * ITEMS SHORTER THAN THE SLOTS THEY SIT IN.
   *   [channel.ts `slotsOverrunning`, §3, §4, D-21]
   *
   * Not a missing reference and not a violation: the file is there
   * and the schedule is legal. It is a duration that disagrees
   * with its media, which until now went out as black for the
   * difference — on one measured channel, 99.4% of every loop.
   */
  const [overrunning, setOverrunning] = useState<Overrun[]>([]);
  const [violations, setViolations] = useState<string[]>([]);
  /**
   * WHETHER ANYTHING IS ACTUALLY GOING OUT.  [§18]
   *
   * Not derived here, because it cannot be: the playout engine is a separate
   * process and this browser has no way to see it. The server looks at the
   * heartbeat and at the age of the newest segment, and hands back the
   * answer and a sentence.
   */
  /*
   * WHAT THE CONFIDENCE MONITOR CAN SEE, raised out of it so it sits
   * with the desk's own sentence rather than beside it in a corner.
   * Held here because the monitor is the only thing that knows, and
   * the status bar is the only place an operator reads. [§18, C-28]
   */
  /*
   * WHAT EACH DESTINATION IS ACTUALLY DOING, from the engine, which
   * is the only thing that knows. `enabled` is in the document and is
   * the operator's switch; this is the connector's answer, and D-21
   * requires both to be shown. No key is in it: the server address
   * and whether one exists, and nothing else. [§15, C-29]
   */
  const [senders, setSenders] = useState<Record<string, {
    state?: string; says?: string; at?: string;
    server?: string; hasKey: boolean;
  }>>({});

  const [seen, setSeen] = useState<
    { says: string; tone: 'fault' | 'note' } | null>(null);

  /*
   * THE TWO STATES ARE THE DOMAIN'S, NOT A COPY OF THEM.
   *
   * This wrote the unions out by hand, and a hand-written copy
   * of a union is a copy that does not grow with it: when
   * `EngineState` gained `earlier` — the state that tells an
   * old heartbeat on the volume from a fresh corpse — the room
   * could not be given the new reading, because its own type
   * said no such thing existed. The compiler caught it, which
   * is the only reason this is a comment and not a bug. [D-19]
   */
  const [health, setHealth] = useState<{
    engine: EngineState;
    stream: StreamState;
    says: string | null;
    /*
     * WHY A HEALTHY CHANNEL IS STILL DARK. Not a fault, and that is the
     * point: `says` answers *is the machinery working* and every one of
     * its answers is about a process. This answers *have you asked it
     * for anything* — armed but never taken to air, or nothing to play.
     * Both are correct behaviour, and a correct state that looks like a
     * fault is the one nobody can diagnose. [§6, §9]
     */
    dark: string | null;
    /** A recent render failure, for the confidence monitor to rank. [C-28] */
    failing?: { says: string };
    /*
     * AND WHICH OF THEM TO SHOW. Both can be true at once, so the order
     * is decided in the domain where it can be tested, and the tone
     * comes with the sentence: red for a thing that is broken teaches
     * an operator to read red, and red for a thing that is merely true
     * teaches them to ignore it. [D-04]
     */
    note: { says: string; tone: 'fault' | 'note' } | null;
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
  /**
   * ONE GUEST, ALONE ON THE PROGRAMME BUS.  [§24]
   *
   * *"clicking a guest should select that guest as the programme source."*
   * A gallery decision, held here beside the arrangement it overrides, and
   * never written to the channel: which guest is in shot at 19:42 is not a
   * property of the station. [D-19]
   */
  const [solo, setSolo] = useState<string | null>(null);
  /**
   * THE MEDIA PLAYER'S SELECTION, and nothing else.  [§25]
   *
   * A key into the library and how far along the road to air it has got.
   * Not written to the channel and not a copy of anything: what is loaded
   * at 19:42 is no more a property of the station than which guest is in
   * shot. Taking it live is what reaches the document, through the
   * roll-in the channel already had. [D-18]
   */
  const [player, setPlayer] = useState<PlayerState>(IDLE);
  const [find, setFind] = useState('');

  /* ---- WHAT EACH PERSON IS COMPOSITED INTO.  [§26, §27, C-14] -------- *
   *
   * Per person, because the brief is: *"So each participant can have an
   * independent background."* Held here rather than on the channel for
   * the same reason the solo is — which set Guest 3 is in at 19:42 is a
   * gallery decision — while the CHANNEL'S OWN set stays on the identity,
   * because *"a station does not repaint its studio between programmes"*
   * and that is what `identity.spaceId` has always meant.
   *
   * IT IS ALSO THE FIRST THING THAT READS IT. C-14: the field was
   * written by ten buttons and read by nothing. The house set is now the
   * default every person starts in. */
  const [sets, setSets] = useState<Record<string, Composition>>({});
  const [plates, setPlates] = useState<Record<string, LivePlate>>({});
  const [greens, setGreens] = useState<Record<string, boolean>>({});
  const [plating, setPlating] = useState<string | null>(null);
  const [dressing, setDressing] = useState<string | null>(null);
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
   * WHETHER THE AUDIENCE MAY SEND SOMETHING IN.  [TAKE-PLATFORM P10]
   *
   * The third producer surface, and the last one without this.
   * `ChannelPublication` has carried the three fields since the model
   * landed and both readers honour them; only the control room could
   * not SET them. The same component Studio One and Studio Two use,
   * because a channel means exactly what they mean by it and a second
   * copy is how two surfaces come to disagree about who is allowed
   * in. [D-19]
   */
  const [availability, setAvailability] = useState<TakeAvailability>({
    respondable: false, listed: true,
  });
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
  /*
   * AND SO IS AN ANSWER SOMEBODY SENT IN.  [TIMELINE B14e; D-25]
   *
   * "The host can... play their view that is already on the queue."
   * Not as a roll-in, which REPLACES the live feed with a file, and
   * not as a programme, which would make a submission into
   * production material without anybody accepting it. It joins the
   * mixer beside the presenter, the layout table arranges it, and it
   * leaves when it ends — which is what "play it INTO the show"
   * means.
   */
  const [answer, setAnswer] = useState<
    { id: string; label: string; stream: MediaStream } | null>(null);
  /**
   * The house set, from the channel's own identity.
   *
   * Everybody starts in it and anybody can be moved out of it. A person
   * with no entry in `sets` is not a person with no set — they are a
   * person in the station's. [§26 B, §13]
   */
  const houseSet = useMemo<Composition>(() => ({
    ...NO_COMPOSITION,
    ...(channel.identity?.spaceId
      ? { backdrop: { kind: 'space' as const, spaceId: channel.identity.spaceId } }
      : {}),
  }), [channel.identity?.spaceId]);
  const compositionFor = useCallback((id: string): Composition => {
    const chosen = sets[id] ?? houseSet;
    /*
     * THE KEY IS NOT CHOSEN, IT IS WHAT THEY HAVE. A plate measured for
     * this person, or a green screen they said is there — and `keyFor`
     * ranks them in the brief's own order. Recomputed rather than stored
     * so that taking a plate changes what is possible at once, without
     * anybody having to press the set again. [§26 C]
     */
    const plate = plates[id];
    return {
      ...chosen,
      key: keyFor({
        ...(greens[id] ? { greenScreen: true } : {}),
        ...(plate ? {
          plate: {
            assetId: 'live' as never, noise: plate.noise,
            quality: plate.quality, width: plate.width,
            height: plate.height, capturedAt: plate.capturedAt,
          },
        } : {}),
      }),
    };
  }, [sets, houseSet, plates, greens]);

  const mixed = useMemo(() => [
    ...guests.sources,
    /* NOT A FACE, and the mixer is told so rather than left to read
       the id: a set with a monitor puts this on it instead of giving
       it a panel beside the people. [§27, C-23] */
    ...(share.stream
      ? [{
        id: 'screen', stream: share.stream, label: share.label ?? 'Screen',
        kind: 'screen' as const,
      }]
      : []),
    ...(answer
      ? [{ id: answer.id, stream: answer.stream, label: answer.label }] : []),
  ].map((person) => ({
    /*
     * AND THROUGH THE COMPOSITOR ON THE WAY TO THE CANVAS. This is the
     * line that makes a chosen set *"part of the master composition"*:
     * `useBroadcastMixer` draws into the canvas `captureStream` hands
     * the encoder, so a background attached here is on the wire. [§26]
     */
    ...person,
    composition: compositionFor(person.id),
    plate: plates[person.id]?.still ?? null,
  })),
  [answer, guests.sources, share.stream, share.label, compositionFor, plates]);
  const mixer = useBroadcastMixer({
    sources: mixed,
    layoutId: arrangement,
    solo,
    /*
     * THE STATION'S STUDIO, from the identity — the first thing that
     * reads `setId`, as `spaceId` was the first thing to be read at all.
     * A set draws the room once for the whole frame and cuts each person
     * into their position in it; without one, everybody keeps their own
     * background. [§27, §13]
     */
    set: setById(channel.identity?.setId),
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
    const data = bodyOf(await response.text());
    setChannel(data.channel);
    setMissing(data.missing ?? []);
    setOverrunning(data.overrunning ?? []);
    setViolations(data.violations ?? []);
    setHealth(data.health ?? null);
    setSenders(data.senders ?? {});
  }, [id]);

  useEffect(() => { void refresh(); }, [refresh]);

  /**
   * WHAT A LINK WITH A FRAGMENT ON IT IS SUPPOSED TO DO.  [U-19]
   *
   * The front doors added five of these — GO LIVE and SCHEDULE on the
   * control-room landing page, *"Manage distribution →"*, *"View schedule
   * →"*, and the rail's own Channels and Distribution — and **only
   * `#library` had a target**. The other four scrolled to nothing: the
   * page loaded, the fragment was ignored, and a person who pressed GO
   * LIVE arrived at the top of a control room where nothing had
   * happened. A link that does nothing is worse than no link, because it
   * teaches somebody the product is broken.
   *
   * AND A SCROLL IS NOT ENOUGH HERE. This is a console: every panel is
   * already on screen, so scrolling to one is a no-op and the link would
   * still appear dead. What each fragment NAMES is a thing to do —
   * bring the camera desk up, open the stream-output drawer, put the
   * schedule in view — so that is what it does.
   *
   * ON ARRIVAL, AND WHENEVER THE FRAGMENT CHANGES. Not on every render
   * — that would fight the operator for the desk they had chosen — but
   * `hashchange` is a navigation and has to be honoured: going from
   * `#identity` to `#live` on a page that is already open changes no
   * document, so React never remounts and a mount-only effect leaves
   * the graphics desk up while the address bar says `#live`. The
   * browser demonstrated exactly that.
   */
  useEffect(() => {
    let timer = 0;
    let fade = 0;
    const act = () => {
      /*
       * ONE TABLE DECIDES. `#schedules` used to fall through both of
       * the two branches that were here and scroll to a zero-size
       * anchor that was already on screen, so it selected nothing
       * and said nothing: the audit's *"the behaviour is real and
       * the feedback is nil"*. The table is in the domain and tested
       * against this file, so a renamed tab is a failing test rather
       * than a dead link nobody presses until it matters. [C-30]
       */
      const jump = jumpFor(window.location.hash);
      if (!jump) return;
      /*
       * EVERY PREVIOUS MARK GOES FIRST.  [C-30]
       *
       * Without this the second jump cancelled the first panel's
       * fade and left it marked for the rest of the session — the
       * exact *"panel that looks selected"* this comment calls a
       * worse lie than no feedback, written above the code that did
       * it. Visible only by jumping twice, which is what a browser
       * found and reading did not.
       */
      for (const marked of document.querySelectorAll('[data-arrived]')) {
        marked.removeAttribute('data-arrived');
      }
      if (jump.rail) setRailTab(jump.rail);
      if (jump.desk) setDeskTab(jump.desk);
      /*
       * AND IT WAITS FOR THE ELEMENT. One `setTimeout` after paint was
       * not enough and the browser said so: `#distribution` is a
       * disclosure in the transport bar that is not in the tree until
       * the channel has loaded, so the effect ran, found nothing, and
       * the drawer stayed shut — the same silent nothing the missing
       * ids produced.
       *
       * Two seconds of looking, then it gives up, because a fragment
       * for something that never arrives is not worth a standing timer.
       */
      window.clearInterval(timer);
      let tries = 0;
      timer = window.setInterval(() => {
        tries += 1;
        const target = document.getElementById(jump.panel)
          ?? document.querySelector(`[data-testid="${jump.panel}"]`);
        if (target) {
          if (target instanceof HTMLDetailsElement) target.open = true;
          target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          /*
           * AND SOMETHING MOVES. A console answers a link by doing
           * the thing, and every panel is already on screen — so
           * without this the operator has no way to tell a link that
           * worked from one that did nothing. Removed again after a
           * second: a mark that stayed would be a panel that looks
           * selected for the rest of the session. [D-04]
           */
          target.setAttribute('data-arrived', 'true');
          window.clearTimeout(fade);
          fade = window.setTimeout(
            () => target.removeAttribute('data-arrived'), FLASH_MS);
        }
        if (target || tries > 16) window.clearInterval(timer);
      }, 120);
    };
    act();
    window.addEventListener('hashchange', act);
    return () => {
      window.removeEventListener('hashchange', act);
      window.clearInterval(timer);
      window.clearTimeout(fade);
    };
  }, []);

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

  const refreshLibrary = useCallback(async () => {
    const response = await fetch('/api/channels/library', { cache: 'no-store' });
    if (response.ok) setLibrary((await response.json()).items ?? []);
  }, []);

  useEffect(() => { void refreshLibrary(); }, [refreshLibrary]);

  /**
   * PUT A FILE IN THE LIBRARY, from the room that broadcasts it.
   *   [§3, §25, D-19, C-48]
   *
   * RAW BYTES WITH THE TYPE IN THE HEADER, because that is what the
   * route has always taken: `Content-Type` is the allow-list key and
   * `X-Label` is the name. Not multipart — there is one file and no
   * fields, and a boundary-encoded body would be a second thing to
   * parse for no second thing to carry.
   *
   * AND THE SIZE IS CHECKED HERE AS WELL AS THERE. The server's cap
   * is the one that counts, but a cap a person meets by waiting out
   * a long upload and then being refused is a cap nobody was told
   * about. Refusing it before a byte leaves is the same answer,
   * sooner.
   *
   * THE NAME IS THE FILENAME, MINUS ITS EXTENSION. Asking for one
   * would be a dialog between choosing a file and seeing it arrive,
   * and the file already has a name somebody chose. It can be
   * renamed afterwards like anything else.
   */
  const putInLibrary = useCallback(async (file: File) => {
    if (file.size === 0) { setError('that file is empty'); return; }
    if (file.size > MOST_UPLOAD_BYTES) {
      setError(`${file.name} is too big for the library — an ident, a `
        + 'caption card or a song, up to '
        + `${Math.round(MOST_UPLOAD_BYTES / (1024 * 1024))} MB. A film `
        + 'comes from a studio as a render.');
      return;
    }
    setPutting(true);
    try {
      const response = await fetch('/api/library', {
        method: 'POST',
        headers: {
          'content-type': file.type,
          'x-label': file.name.replace(/\.[^.]+$/, '').slice(0, 120),
          /* The name as well as the label: on a phone whose picker
             could not say what the file is, its extension is the
             only evidence left. [libraryUpload.accepted] */
          'x-filename': file.name.slice(-120),
        },
        body: file,
      });
      if (!response.ok) {
        const said = await response.json().catch(() => ({}));
        setError(said.error ?? 'that file was refused');
        return;
      }
      setError(null);
      /*
       * AND THE RAIL IS ASKED AGAIN RATHER THAN TOLD. The response
       * carries the item, but the broadcast listing is a different
       * question from the upload listing — it measures duration,
       * reads sidecars and knows which deck a page belongs to —
       * and building a row from the POST's answer would be a
       * second, thinner version of it. [D-19]
       */
      await refreshLibrary();
      setRailTab('library');
    } catch {
      setError('that file did not reach the library');
    } finally {
      setPutting(false);
    }
  }, [refreshLibrary]);

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

  /* ---- THE FOUR MONITORS.  [§24, C-14] ------------------------------- *
   *
   * Nothing below is measured here. The streams are the Room's, the link
   * states are the mesh's, the energy and the speech confidence are
   * `measureVoice`'s, and whether a track is delivering anything is the
   * browser's. C-14 found every one of them already being computed and
   * thrown away before it reached the multi-view; this is the assembly,
   * and `readGuests` — which is pure and tested — is the judgement. */
  const tracks = useTrackStates(mixed, Boolean(liveNow));
  const guestFeeds = useMemo<GuestFeed[]>(() => guests.sources
    /* The operator's own camera is tile 01. Tile 02 is everybody else. */
    .filter((person) => person.stream !== camera)
    .map((person) => {
      const track = tracks[person.id] ?? NO_TRACKS;
      const level = levels[person.id];
      return {
        id: person.id,
        ...(person.label ? { label: person.label } : {}),
        ...(guests.states[person.id]
          ? { link: guests.states[person.id]! } : {}),
        hasVideo: track.hasVideo, videoDark: track.videoDark,
        hasAudio: track.hasAudio, audioDark: track.audioDark,
        ...(level ? { energy: level.energy, speech: level.speech } : {}),
      };
    }), [guests.sources, guests.states, camera, tracks, levels]);
  /*
   * THE HOST'S OWN LEVEL. `useFeedLevels` meters every microphone on
   * the desk and the operator's is one of them; tile 01 just never
   * asked for it. Found the same way C-14 found the guests'. [D-19]
   */
  /*
   * WHAT THE TWO STUDIOS HAVE FINISHED. Lifted out of the multi-view
   * so that the grid's tally and the header's count are computed from
   * ONE list: a header that found its own copy would be a second
   * opinion about what is on the air, which is the fault C-27 is
   * about. [D-22]
   */
  const fromStudioTwo = useMemo(
    () => library.find((item) => item.document === 'performance'),
    [library]);
  const fromStudioOne = useMemo(
    () => library.find((item) => item.document === 'conversation'),
    [library]);

  const hostLevel = useMemo(() => {
    const me = guests.sources.find((person) => person.stream === camera);
    return me ? levels[me.id]?.energy : undefined;
  }, [guests.sources, camera, levels]);

  /*
   * HOW MANY SOURCES ARE ON PROGRAM, counted the way the tiles decide
   * it and deduplicated by source — because the room is two monitors
   * of one thing, and CAMERA 1 and GUESTS both wearing the tally is
   * one source on air and not two.
   *
   * It can only ever read 0 or 1, and that is the point: it would
   * read 2 the moment the tally started lying again, in the place an
   * operator is already looking. [C-27]
   */
  const guestReadings = useMemo(() => readGuests(guestFeeds, {
    solo,
    /*
     * THE GUESTS ARE ON AIR WHEN THE ROOM IS. Not when the channel is
     * transmitting anything — a rolled-in file is going out over the top
     * of them, and a quarter wearing a red tally under a music video
     * would be the tally lying. The same condition tile 01 uses. [§24]
     *
     * AND IT SAID THAT WHILE DOING THE OPPOSITE. `on.kind` stays
     * `'live'` while a reference is rolled in, because a rolled-in
     * segment replaces the feed INSIDE the live answer rather than
     * beside it — so every quarter wore a red tally under exactly the
     * music video this comment names. The rule was right from the
     * first day and the condition never implemented it. [C-27]
     */
    transmitting: roomOnProgram(on),
  }), [guestFeeds, solo, on]);
  /*
   * A SOLO ON SOMEBODY WHO HAS LEFT IS RELEASED, not remembered. Holding
   * it would black the programme out the moment a guest's browser closed,
   * and the operator would be looking at the one tile that says why.
   */
  useEffect(() => {
    if (solo && !guestFeeds.some((one) => one.id === solo)) setSolo(null);
  }, [guestFeeds, solo]);
  const takeGuest = useCallback((id: string) => {
    setSolo((was) => (was === id ? null : id));
  }, []);

  /* ---- THE MEDIA PLAYER.  [§25] --------------------------------------- *
   *
   * The same rows the left rail's Library tab lists — the same fetch, the
   * same objects — turned into what a picker needs. A second listing would
   * be a second answer to "what is there to play". [D-19] */
  const playable = useMemo<PlayableItem[]>(() => library.map((item) => ({
    key: sourceKey(item.source),
    title: item.title,
    ...(item.artist ? { artist: item.artist } : {}),
    ...(item.durationMs !== undefined ? { durationMs: item.durationMs } : {}),
    kind: item.kind,
  })), [library]);
  const cued = useMemo(
    () => library.find((item) => sourceKey(item.source) === player.key) ?? null,
    [library, player.key]);
  /*
   * A CUED ITEM THAT HAS LEFT THE LIBRARY IS EJECTED, for the same reason
   * a solo on a departed guest is released: taking it would put a
   * reference to a file nobody can read on the air. [§4's missing keys]
   */
  useEffect(() => {
    if (player.key && library.length > 0 && !cued) setPlayer(IDLE);
  }, [player.key, library.length, cued]);
  /*
   * WHAT THE PREVIEW MONITOR IS SHOWING, when the player has something.
   *
   * `taken` is deliberately not here: from the moment it goes to air the
   * channel's roll-in owns it, Program Output shows it, and a preview
   * still playing the same file would be the same thing on two monitors
   * a second apart. [§25]
   */
  const programCount = useMemo(() => {
    const cuedNow = cued?.source;
    const mine = [
      channel.live
        ? { kind: 'live' as const, ingestId: channel.live.ingestId } : undefined,
      fromStudioTwo?.source, fromStudioOne?.source, cuedNow,
      on.kind === 'programme' || on.kind === 'rotation' ? on.source : undefined,
    ].filter((one): one is ProgrammeSource => Boolean(one));
    return new Set(mine
      .filter((one) => busFor({
        on, mine: one, ...(cuedNow ? { cued: cuedNow } : {}),
      }) === 'program')
      .map(sourceKey)).size;
  }, [channel.live, fromStudioTwo, fromStudioOne, cued, on]);

  const mediaCued = (player.phase === 'loaded' || player.phase === 'playing')
    && cued
    ? {
      key: player.key!, title: cued.title, kind: cued.kind,
      ...(cued.artist ? { artist: cued.artist } : {}),
      ...(cued.durationMs !== undefined ? { durationMs: cued.durationMs } : {}),
    } satisfies PlayableItem
    : null;
  const cuedUrl = cued ? urlFor(cued.source) : null;

  /**
   * Everybody in the picture, with what they are composited into.
   *
   * The mixer's own list, so the panel cannot show a person the
   * compositor is not drawing — which is the shape of every disagreement
   * this control room has had. [D-19]
   */
  const composited = useMemo<Composited[]>(() => mixed.map((person) => ({
    id: person.id,
    label: person.label ?? 'Camera',
    composition: compositionFor(person.id),
    plate: plates[person.id] ?? null,
    greenScreen: Boolean(greens[person.id]),
  })), [mixed, compositionFor, plates, greens]);

  /**
   * Measure somebody's room.  [§26 C]
   *
   * OF WHOEVER IS SELECTED, INCLUDING A GUEST. Their camera is already
   * decoded in this browser, so *"ask them to step out of shot and press
   * Take plate"* is the whole procedure — nothing is uploaded and nothing
   * of their room is stored anywhere but this page. [D-03]
   */
  const measureRoom = useCallback(async (id: string) => {
    /*
     * FROM THE MIXER'S OWN DECODED PICTURE. A second `<video>` on the
     * same stream would be a second decode of the same bytes, and a
     * `querySelector` for one in the document would find nothing: the
     * mixer's elements are detached on purpose.
     */
    const video = mixer.videoFor(id);
    if (!video) return;
    setPlating(id);
    try {
      const measured = await takePlate(video);
      setPlates((was) => ({ ...was, [id]: measured }));
    } catch {
      /* No picture yet, or a canvas that refused. The panel keeps
         saying there is no plate, which is true. */
    } finally {
      setPlating(null);
    }
  }, [mixer]);

  const takeMedia = useCallback(() => {
    if (!cued) return;
    void patch({ action: 'roll-in', source: cued.source });
    setPlayer((was) => playerAct(was, 'take'));
  }, [cued, patch]);
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
  /*
   * HOW MUCH CLOCK IS ON SCREEN.  [§2, U-08, C-46]
   *
   * It was `WINDOW_MS = 2.5 * HOUR`, and the comment above it was
   * right about both halves of the trade: a day compressed into a
   * strip makes a five-minute ident two pixels wide, AND an
   * eight-second lower third is 0.09% of two and a half hours. The
   * answer to a trade you cannot win is not to pick a side; it is
   * to let the operator move.
   *
   * A VIEW AND NOTHING ELSE, which is Studio Two's rule for its own
   * timeline: not in the document, changes no schedule, and the
   * channel transmits identically whatever is on screen.
   */
  const [span, setSpan] = useState<number>(DEFAULT_SPAN);
  /*
   * THE PANEL'S OWN WIDTH, because the ruler's step depends on it:
   * the same two and a half hours wants fewer labels on a narrow
   * column than on a wide one, and a ruler that crowds is a ruler
   * nobody reads. Measured rather than assumed. [C-46]
   */
  const strip = useRef<HTMLDivElement | null>(null);
  const [stripWidth, setStripWidth] = useState(1100);
  useEffect(() => {
    const box = strip.current;
    if (!box) return undefined;
    const watch = new ResizeObserver(() => {
      /* The lane column, not the frame: the 96px of lane names is
         not part of the scale. */
      setStripWidth(Math.max(240, box.clientWidth - 96));
    });
    watch.observe(box);
    return () => watch.disconnect();
  }, []);
  /* The ruler's step follows the span, so the labels stay round and
     never crowd. Width is the panel's, measured below. */
  const stepMs = stepFor(span, stripWidth);
  const { from: windowFrom, to: windowTo } = windowFor(span, windowNow, stepMs);
  const across = (at: number) =>
    `${((Math.min(windowTo, Math.max(windowFrom, at)) - windowFrom) / span) * 100}%`;

  /**
   * WHAT THE CHANNEL WILL ACTUALLY SHOW, hour by hour.
   *
   * Walked rather than laid out: at each instant the same `whatIsOn` the
   * playout engine calls is asked what is on, and the answer's own end is
   * where the next question is asked. A lane drawn from the programme list
   * alone would be a lane that lies about every gap the loop fills — and the
   * gaps are most of a channel's day. [§4, §5]
   */
  /*
   * THE WALK MOVED TO THE DOMAIN, where the five-minute step could be
   * seen for what it is: a sampling rate, not a structure. Inside
   * this `useMemo` it drew an empty channel as a day of five-minute
   * items — the author's *"full schedule timeline with 0 scheduled
   * and no loop"*. [C-31]
   */
  const segments: Segment[] = useMemo(
    () => airtime(channel, windowFrom, windowTo).map((stretch) => ({
      ...stretch, title: titleOf(stretch.on),
    })),
    [channel, windowFrom, windowTo, titleOf]);

  /**
   * WHAT CAN BE DONE TO A THING ON AIR, in one place.
   *   [D-19, C-47]
   *
   * > *"can we edit, add, remove files directly from this?"*
   *
   * Not from the strip, no: a block's whole click handler was
   * `onChoose` — it SELECTED. Every verb existed, on the rails
   * beside it, behind a menu that was built to be shared (*"every
   * rail built its own markup and right-clicking a row was not
   * possible without building it a second time"*) and that the
   * strip had never been given.
   *
   * So these are hoisted out of the two rails that had them inline
   * and handed to both. One list, one set of confirmations, two
   * surfaces — rather than a second editing system on the
   * timeline, which is the thing this product is told not to
   * build.
   *
   * AND THERE IS NO DRAG, DELIBERATELY. On a 24/7 channel the
   * horizontal axis is wall clock: dragging a block changes when
   * something transmits, by however far a hand slipped — at the
   * day span one pixel is ninety-eight seconds. A rotation entry
   * has no clock time of its own at all, so dragging it sideways
   * would mean nothing. And an edge-drag to trim would either lie
   * about the media or silently re-encode somebody's master; a
   * take has a timeline for that and this is not it. A menu is
   * reversible and names what it does. [D-21, §3]
   */
  const moveInRotation = (entry: RotationEntry, position: number) =>
    void patch({ action: 'move-in-rotation', entryId: entry.id, position });
  const removeFromLoop = (entry: RotationEntry) =>
    void patch({ action: 'unrotate', entryId: entry.id });
  const unschedule = (entry: Programme) => {
    confirm({
      question: 'Take it off the schedule? The video itself is '
        + 'untouched — it stays in the library.',
      verb: 'Unschedule',
      danger: true,
      go: () => void patch({ action: 'unschedule', programmeId: entry.id }),
    });
  };

  /**
   * The same verbs, for a block on the strip.
   *
   * REACHED FROM THE BLOCK AN OPERATOR IS LOOKING AT, which is the
   * whole of it: they can see the thing on the timeline, and the
   * list of what to do about it was on the other side of the
   * room. "Show in the rail" is last and is the one verb that is
   * not an edit — it moves the selection to the row, so the two
   * surfaces stop being separate places.
   */
  const blockMenu = useCallback((state: OnAir): MenuEntry[] => {
    if (state.kind === 'rotation') {
      const index = channel.rotation
        .findIndex((entry) => entry.id === state.entry.id);
      const entry = channel.rotation[index];
      if (!entry) return [];
      return [
        {
          label: 'Move earlier in the loop',
          disabled: index === 0 ? 'It is already first' : false,
          onSelect: () => moveInRotation(entry, index - 1),
        },
        {
          label: 'Move later in the loop',
          disabled: index === channel.rotation.length - 1
            ? 'It is already last' : false,
          onSelect: () => moveInRotation(entry, index + 1),
        },
        {
          label: 'Remove from the loop',
          danger: true,
          hint: 'Takes it out of the rotation. The file is untouched.',
          onSelect: () => confirm({
            question: `Remove ${entry.title ?? 'it'} from the loop? `
              + 'The video itself stays in the library.',
            verb: 'Remove from the loop',
            danger: true,
            go: () => removeFromLoop(entry),
          }),
        },
        {
          label: 'Show in the playlist',
          onSelect: () => { setRailTab('playlist'); setChosen(entry.id); },
        },
      ];
    }
    if (state.kind === 'programme') {
      const programme = state.programme;
      return [
        {
          label: 'Unschedule',
          danger: true,
          hint: 'Takes it out of the day. The file is untouched.',
          onSelect: () => unschedule(programme),
        },
        {
          label: 'Show in the schedule',
          onSelect: () => { setRailTab('schedules'); setChosen(programme.id); },
        },
      ];
    }
    /*
     * AND NOTHING FOR A HOLE OR A LIVE FEED. A gap is the absence
     * of a thing, so there is nothing to act on; the live
     * broadcast is ended from the one control that ends it, not
     * from a right-click on a schedule strip. [D-21]
     */
    return [];
  }, [channel.rotation, confirm, patch]);

  /**
   * DELETE A PIECE OF MEDIA FROM THE LIBRARY.  [§3, D-19, C-49]
   *
   * THE REFUSAL IS THE INTERESTING PATH and it is the server's to
   * write: it knows which channels hold the asset and in which
   * slots, and it answers with a sentence naming them. Showing
   * that sentence rather than a status is the whole of `asked`.
   */
  const removeFromLibrary = useCallback(async (item: LibraryItem) => {
    if (item.source.kind !== 'media') return;
    const { ok, says } = await asked(
      await fetch(`/api/library/${item.source.assetId}`, { method: 'DELETE' }),
      'could not delete it');
    if (!ok) { setError(says); return; }
    setError(null);
    await refreshLibrary();
  }, [refreshLibrary]);

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
    {/*
     * THE CONTROL ROOM, AS THE BRIEF DRAWS IT.
     *   [CHANNEL §2, §12, §13]
     *
     *     RUNDOWN → PROGRAM → TRANSMISSION
     *
     * NOTHING BELOW IS NEW MACHINERY. The playout engine, the
     * schedule, the switcher, the ingest and the destinations
     * are untouched; what changed is the frame they sit in.
     *
     * THE SHAPE WAS ALREADY THIS SHAPE, which is why the
     * integration is a change of dress rather than of plan: a
     * bar, a rail, a gallery, a live studio and a master
     * control strip along the bottom. The brief named the same
     * five regions this room already had.
     */}
    <div className="s3">
      <div className="app">
      <header className="topbar">
      <StudioBar
        current="online-tv"
        studioOneId={studioOneId}
        studioTwoId={studioTwoId}
        owned={owned}
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
      />

      {/*
        * THE CHANNEL AND THE CLOCK, ONCE. `StudioBar` printed
        * the name, the time and the zone in its trailing slot;
        * the brief draws the same three things as a channel
        * block and a clock, which is what a gallery has on the
        * wall. Two readouts of one fact are two places it can
        * disagree, and a control room is the last place to
        * have two clocks. [D-19]
        */}
      <div className="channel" data-testid="channel-ident">
        <span className="channel-dot" data-on={on.kind} />
        <span className="channel-name">{channel.name}</span>
        {/*
          * THE SHORT IDENTITY, WHERE THERE IS ONE. The brief
          * prints `#BAL-01` beside the name, and this network's
          * equivalent is the station's callsign — optional, by
          * `station.ts`, because a channel is identified by its
          * slug and a callsign is a second, shorter name its
          * owner may not have chosen. Absent rather than
          * invented. [TV-NETWORK, D-21]
          */}
        {channel.station?.callsign && (
          <span className="channel-id">#{channel.station.callsign}</span>
        )}
      </div>

      <div className="spacer" />

      <div className="clock" data-testid="channel-clock">
        {new Date(now).toLocaleTimeString('en-GB', { timeZone: channel.timezone })}
        {' · '}
        {channel.timezone.toUpperCase()}
      </div>

      <a className="top-button" data-testid="view-channel"
         href={`/t/${channel.id}/watch`}>
        View Channel
      </a>
      </header>

      {/*
        * THREE COLUMNS AND A FOOTER, at fixed widths, because a control room
        * is a place before it is a page: the playlist is always in the same
        * corner and the transport is always under your hand, whatever is on.
        *
        * The widths are the brief's now and they live in the
        * stylesheet with the rest of the room.
        */}
      <main className="main">
        {/* ============ LEFT RAIL ======================================= */}
        <aside className="left">
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
            {/*
              * AND SOMEWHERE TO PUT A FILE IN.  [§3, §25, D-19, C-48]
              *
              * > *"HOW COME I CANNOT UPLOAD MEDIA INTO PLAYLIST"*
              *
              * Because there was nowhere to. `+ Add to playlist`
              * is not an uploader and never claimed to be — its
              * whole handler opens the Library tab — and the
              * control room had no file input at all. The product
              * has five; none of them was here.
              *
              * AND THE ROUTE WAS WRITTEN AND CALLED BY NOTHING.
              * `POST /api/library` has existed with its allow-list,
              * its size cap, its sidecar and its 415 since the
              * library could hold a song, and every reference to
              * `/api/library` in this product is a GET. The
              * capability was built and no surface reached it,
              * which is the fifth time this month.
              *
              * IT IS AN IDENT, NOT A FILM, and the control says so
              * rather than letting somebody find out by waiting out
              * a four-hundred-megabyte upload and being refused.
              * Films arrive from the studios as renders and are
              * referenced, never copied. [§3, D-18]
              */}
            <button
              type="button" className="ctl" data-testid="library-upload"
              disabled={putting}
              title={'An ident, a caption card, a sting or a song \u2014 up to '
                + `${Math.round(MOST_UPLOAD_BYTES / (1024 * 1024))} MB. `
                + 'Films come from the studios as renders.'}
              onClick={() => upload.current?.click()}
              style={{ flex: '0 0 auto', padding: '7px 10px' }}
            >{putting ? 'Adding\u2026' : '+ File'}</button>
            <input
              ref={upload} type="file" hidden data-testid="library-file"
              accept={acceptsAttribute()}
              onChange={(event) => {
                const picked = event.target.files?.[0];
                event.target.value = '';
                if (picked) void putInLibrary(picked);
              }}
            />
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
                now={now} ownMs={pickedItem.durationMs}
                /*
                  * AND WHEN NO LENGTH IS CHOSEN, NONE IS SENT. An
                  * omitted `durationMs` is the route's instruction to
                  * measure the file the reference resolves to; a
                  * `durationMs: undefined` in the body would be the
                  * same thing, but saying it this way makes the two
                  * cases visible at the call. [route.ts `lengthFor`]
                  */
                onSchedule={(startsAt, durationMs, loop) => {
                  void patch({
                    action: 'schedule', source: pickedItem.source,
                    startsAt, title: pickedItem.title,
                    ...(durationMs === undefined ? {} : { durationMs }),
                    ...(loop ? { loop } : {}),
                  });
                  setAdding(false);
                  setRailTab('schedules');
                }}
                onRotate={(durationMs, loop) => {
                  void patch({
                    action: 'rotate', source: pickedItem.source,
                    title: pickedItem.title,
                    ...(durationMs === undefined ? {} : { durationMs }),
                    ...(loop ? { loop } : {}),
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
                onMove={moveInRotation}
                onRemove={removeFromLoop}
              />
            )}
            {railTab === 'library' && (
              <LibraryRail
                items={library} listing={listing} picked={picked}
                keep={railRows.keep}
                openDeck={openDeck} onOpenDeck={setOpenDeck}
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
                    /*
                     * ITS OWN LENGTH, AND NOBODY SENDS A NUMBER.
                     *
                     * This read `item.durationMs ?? 15 * MINUTE`, and
                     * the fifteen was never a choice — it was the
                     * absence of one. `BroadcastItem` had no duration,
                     * so every slot was the same guess, and a 5-second
                     * ident went into a quarter of an hour of black.
                     * The library can measure now, but so can the
                     * route, and the route is the one that cannot be
                     * wrong: it opens the file this reference actually
                     * resolves to. So no length is sent at all, and
                     * the slot becomes exactly as long as the media.
                     * [route.ts `lengthFor`, channel.ts `slotLength`]
                     */
                    hint: item.durationMs
                      ? `${runsFor(item.durationMs)}, adjustable afterwards`
                      : 'As long as the media is \u2014 measured when it goes in',
                    onSelect: () => {
                      setPicked(sourceKey(item.source));
                      void patch({
                        action: 'rotate', source: item.source,
                        title: item.title,
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
                  /*
                   * AND IT CAN BE DELETED.  [§3, §20, D-18, D-19, C-49]
                   *
                   * > *"ALSO IT POSSIBLE TO DELETE INFORMATION FROM
                   * > THE LIBRARY? BECAUSE I DONT THINK SO AND IT
                   * > SHOULD BE A CONCERN."*
                   *
                   * It was not. `DELETE /api/library/<id>` has existed,
                   * careful and complete — owner-checked, refusing with
                   * a 409 and a sentence if the asset is the safe
                   * playlist on any channel, removing every container,
                   * the sidecar and the measurement — and **nothing in
                   * this product called it.** The sixth capability this
                   * month that was built and not reached.
                   *
                   * ONLY FOR MEDIA SOMEBODY PUT IN. A render belongs to
                   * the conversation or performance that made it and is
                   * deleted with that; offering a verb here that the
                   * route would refuse is a menu item that exists to
                   * fail. [§3]
                   */
                  ...(item.source.kind === 'media' ? [{
                    label: 'Delete from the library…',
                    danger: true,
                    hint: 'Removes the file. Refused while anything is '
                      + 'scheduled on it.',
                    onSelect: () => confirm({
                      question: `Delete “${item.title}” from the `
                        + 'library? The file is removed and this cannot be '
                        + 'undone. Anything scheduled on it will refuse the '
                        + 'deletion rather than go to black.',
                      verb: 'Delete it',
                      danger: true,
                      go: () => void removeFromLibrary(item),
                    }),
                  }] : []),
                ]}
              />
            )}
            {railTab === 'schedules' && (
              <SchedulesRail
                channel={channel} listing={listing} nameOf={nameOf} clock={clock}
                missingKeys={missingKeys} liveId={live?.id} chosen={chosen}
                keep={railRows.keep}
                onChoose={setChosen}
                onUnschedule={unschedule}
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
        </aside>

        {/* ============ CENTRE ========================================== */}
        <section className="center" style={{
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

                {/*
                  * THE TRANSMISSION, IN THE CORNER.  [§18, §7, C-28]
                  *
                  * This monitor is the operator's own canvas and must
                  * stay that way — a presenter watching themselves
                  * twelve seconds late talks over themselves. What
                  * §7 cannot be read to forbid is the station ever
                  * looking at its own output: C-24 was a channel
                  * transmitting black for as long as it took somebody
                  * to open the viewer page in another tab.
                  *
                  * So it is a sixth of the size, permanently silent,
                  * labelled with its own delay, and off until asked
                  * for. And it is measured rather than watched,
                  * because an operator glancing at a small muted
                  * picture on a busy desk is exactly the attention
                  * the fault survived the first time.
                  */}
                {health && (
                  <ConfidenceMonitor
                    channelId={id}
                    engine={health.engine} stream={health.stream} on={on}
                    {...(health.failing ? { failing: health.failing } : {})}
                    onNote={setSeen}
                  />
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
                  /*
                   * A CUED ITEM OUTRANKS AN ARMED CAMERA, because preview
                   * is *what you are about to cut to* and the operator
                   * has just said which. The camera is still armed and
                   * still one press from the air; it is simply not what
                   * is being looked at. Taken or ejected, this falls
                   * back to the camera and then to the schedule. [§25, §6]
                   */
                  right={mediaCued
                    ? <Status testid="preview-mode" mode="media"
                              tone="is-armed" text="Media" />
                    : armed
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
                  {mediaCued && cuedUrl ? (
                    <MediaPreview
                      item={mediaCued}
                      url={cuedUrl}
                      playing={player.phase === 'playing'}
                      station={channel.identity?.bug?.text ?? channel.name}
                      {...(channel.identity?.ink ? { ink: channel.identity.ink } : {})}
                      onEnded={() => setPlayer((was) => playerAct(was, 'pause'))}
                      onTime={(atMs) => setPlayer((was) => ({ ...was, atMs }))}
                    />
                  ) : armed ? (
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
                    {mediaCued
                      ? playerSays(player, () => mediaCued.title)
                      : armed ? 'The live studio — armed'
                        : upNext?.title ?? '—'}
                  </span>
                </div>
              </Frame>

              <Frame testid="multi-view">
                <Head
                  text="Multi-view"
                  sub="Sources"
                  /*
                    * THE HEADER IS THE GRID'S OWN PROOF.  [§24, C-27]
                    *
                    * It read "N in mix", which is a fact about the
                    * audio mixer and says nothing about the tally
                    * beside it — and while three tiles were wearing
                    * the program bar at once, that header sat above
                    * them agreeing with none of it.
                    *
                    * PROGRAM is the count of tiles on the program bus
                    * and it can only ever read 0 or 1. That is the
                    * point: a number that would read 2 the moment the
                    * tally started lying again, in the place an
                    * operator is already looking.
                    *
                    * AND IT IS NOT ALONE, because by itself it would
                    * have swapped one misreading for another. Rolling
                    * a library item in over the live show puts a
                    * picture on the wire that none of the six tiles
                    * stands for, so the count correctly reads 0 —
                    * which an operator glancing at a transmitting
                    * channel would read as "nothing is on air".
                    * ON AIR is the other half, and the two together
                    * say the thing that is actually true: something
                    * is going out, and it is not one of these six.
                    * Found by rolling one in and reading the header.
                    * [C-27]
                    */
                  right={(
                    <span className="row" data-testid="multiview-count" style={{
                      gap: 'var(--space-2)', flexWrap: 'nowrap',
                      flex: '0 0 auto', fontSize: 'var(--text-2xs)',
                      whiteSpace: 'nowrap',
                    }}>
                      <span data-testid="multiview-air" style={{
                        fontWeight: 'var(--weight-bold)',
                        letterSpacing: '0.06em',
                        color: on.kind === 'off'
                          ? 'var(--muted)' : 'var(--state-live-ink)',
                      }}>{on.kind === 'off' ? 'OFF AIR' : 'ON AIR'}</span>
                      <span className="muted" style={{
                        letterSpacing: '0.06em',
                      }}>{programCount} PROGRAM</span>
                    </span>
                  )}
                />
                <MultiView
                  channel={channel} on={on} camera={camera} guests={guests.sources}
                  guestReadings={guestReadings} guestsStaged={guestFeeds}
                  solo={solo} onSolo={takeGuest}
                  player={player}
                  {...(hostLevel === undefined ? {} : { hostLevel })}
                  {...(fromStudioOne ? { fromStudioOne } : {})}
                  {...(fromStudioTwo ? { fromStudioTwo } : {})}
                  {...(cued ? { cuedTitle: cued.title, cuedSource: cued.source } : {})}
                  onMedia={() => setDeskTab('media')}
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
          <div id="schedules" style={{ display: 'contents' }} />
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
                {/*
                  * "TODAY" ALONE IS A WORD, NOT A DATE.  [brief point 5]
                  *
                  * An as-run query, a rights window and a scheduling
                  * mistake are all about a DATE, and the one surface
                  * showing the day's transmission would not say which
                  * day it was unless you had already paged away from
                  * it. The word stays, because "today" is what an
                  * operator is thinking; the date joins it.
                  */}
                {sameCivilDay(windowNow, now, channel.timezone) ? 'Today · ' : ''}
                {shortDay(windowNow, channel.timezone)}
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
              {/*
                * HOW MUCH CLOCK IS ON SCREEN.  [§2, U-08, C-46]
                *
                * The span is a view and nothing else — it changes no
                * schedule and the channel transmits identically
                * whatever is on it. So the control is quiet, beside
                * the other view controls, and says what it is
                * showing rather than a multiplier nobody can picture.
                */}
              <span className="row" data-testid="schedule-zoom"
                    style={{ gap: 4 }}>
                <button className="small" data-testid="zoom-out"
                        disabled={!canZoom(span, -1)}
                        title="Show more of the day"
                        onClick={() => setSpan((at) => zoomed(at, -1))}
                        style={{ padding: '2px 8px', lineHeight: 1.6,
                          fontSize: 'var(--text-xs)' }}>&minus;</button>
                <span className="mono readout" data-testid="zoom-span"
                      style={{ fontSize: 'var(--text-2xs)', minWidth: 54,
                        textAlign: 'center', color: 'var(--ink-300)' }}>
                  {spanSays(span)}
                </span>
                <button className="small" data-testid="zoom-in"
                        disabled={!canZoom(span, 1)}
                        title="Show less, in more detail"
                        onClick={() => setSpan((at) => zoomed(at, 1))}
                        style={{ padding: '2px 8px', lineHeight: 1.6,
                          fontSize: 'var(--text-xs)' }}>+</button>
              </span>
              <RightClickHint what="a block" />
              {pinned !== null && (
                <span className="row" style={{ gap: 4 }}>
                  <button className="small" data-testid="window-back"
                          onClick={() => setPinned((at) => (at ?? now) - span / 2)}
                          style={{ padding: '2px 7px', lineHeight: 0 }}
                  ><Icon name="chevron" size={11} turn={180} /></button>
                  <button className="small" data-testid="window-forward"
                          onClick={() => setPinned((at) => (at ?? now) + span / 2)}
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
                  stepMs={stepMs} stripRef={strip} stripWidth={stripWidth}
                  clock={clock} missingKeys={missingKeys} chosen={chosen}
                  onChoose={setChosen} menuFor={blockMenu}
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
                    /* No length: the route measures the file. The
                       fifteen-minute default that stood here is what
                       put five seconds into a twenty-five minute
                       slot. [route.ts `lengthFor`] */
                    void patch({
                      action: 'add-to-block', blockId: block.id,
                      source: pickedItem.source,
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
        </section>

        {/* ============ RIGHT COLUMN — LIVE STUDIO ====================== */}
        <div id="live" style={{ display: 'contents' }} />
        <aside className="right">
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
              /* The library, as a switcher source. Tile 05 opens it. [§25] */
              { id: 'media', label: 'Media' },
              /* What each person is composited into. [§26, §27] */
              { id: 'set', label: 'Set' },
              { id: 'graphics', label: 'Graphics' },
              /* What the world calls it: the address and the shelf,
                 which is not what it draws. [N-1] */
              { id: 'listing', label: 'Listing' },
              { id: 'audio', label: 'Audio' },
              /* The queue: questions sent to phones, and what came
                 back. [TIMELINE B14d, B14e] */
              { id: 'answers', label: 'Answers' },
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

            {deskTab === 'answers' && (
              <AnswersTab
                channel={channel}
                onAir={Boolean(channel.live && channel.live.phase === 'on_air')}
                playing={answer?.id ?? null}
                citing={Boolean(channel.live?.citing)}
                onCite={(who) => void patch({
                  action: 'cite', ...(who ? { citing: who } : { citing: null }),
                })}
                onPlay={(one, stream) => {
                  setAnswer(one && stream
                    ? {
                      id: one.submissionId,
                      label: one.who ?? 'A viewer',
                      stream,
                    }
                    : null);
                }}
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
                share={share} library={library}
              />
            )}

            {deskTab === 'media' && (
              <MediaPlayerPanel
                items={playable} state={player} query={find} onQuery={setFind}
                onAir={onAir}
                onLoad={(key) => setPlayer((was) => playerAct(was, 'load', key))}
                onPlay={() => setPlayer((was) => playerAct(was, 'play'))}
                onPause={() => setPlayer((was) => playerAct(was, 'pause'))}
                onTake={takeMedia}
                onEject={() => setPlayer(IDLE)}
              />
            )}

            {deskTab === 'set' && (
              <BackgroundPanel
                people={composited}
                chosen={dressing ?? composited[0]?.id ?? null}
                busy={plating}
                onChoose={setDressing}
                onChange={(id, composition) =>
                  setSets((was) => ({ ...was, [id]: composition }))}
                onGreenScreen={(id, on) =>
                  setGreens((was) => ({ ...was, [id]: on }))}
                onPlate={(id) => { void measureRoom(id); }}
                {...(channel.identity?.setId
                  ? { setId: channel.identity.setId } : {})}
                onSet={(setId) => void patch({
                  action: 'identity', identity: { setId },
                })}
              />
            )}

            {deskTab === 'listing' && (
              <ListingTab
                channel={channel}
                onStation={(station) => void patch({ action: 'station', station })}
              />
            )}
            {deskTab === 'graphics' && (
              /*
               * NAMED, because the home page's hero links straight here:
               * `${channel.href}#identity` is how somebody edits a
               * channel's marks without going through the desk. The tab
               * is chosen on arrival; the id is what the browser scrolls
               * to, and what the link test can see. [U-19]
               */
              <div id="identity" style={{ scrollMarginTop: 20 }}>
              <GraphicsTab
                channel={channel}
                onIdentity={(body) => void patch({
                  action: 'identity', identity: body,
                })}
              />
              </div>
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
        </aside>
      </main>

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
      <footer className="bottom" data-testid="channel-transport" style={{
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
          <details
            id="distribution" data-testid="stream-output"
            style={{ position: 'relative' }}
          >
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
                /*
                 * THE CONNECTOR'S OWN ANSWER, not a guess from the
                 * kind. Until C-29 this read `kind === 'own'` and
                 * said NOT CONNECTED for everything else, which was
                 * true then and is not now: a plain RTMP destination
                 * with a key is a destination that sends, and the
                 * engine is the only thing that knows whether it is
                 * actually sending. [§15, D-21]
                 */
                const sender = senders[destination.id];
                const canSend = destination.kind === 'own'
                  || destination.kind === 'rtmp';
                const state = !destination.enabled ? 'OFF'
                  : destination.kind === 'own' ? (onAir ? 'ON' : 'READY')
                    : sender?.state === 'on' ? 'ON'
                      : sender?.state === 'blocked' ? 'BLOCKED'
                        : canSend && sender?.hasKey ? 'READY'
                          : canSend ? 'NO KEY' : 'NOT CONNECTED';
                return (
                  <div key={destination.id}
                       style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div className="row"
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
                            : state === 'BLOCKED' ? 'var(--state-bad)'
                              : state === 'NOT CONNECTED' || state === 'NO KEY'
                                ? 'var(--state-armed-dim)' : 'var(--ink-500)',
                      }}
                    />
                    <span className="grow" style={{
                      minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>{destination.label}</span>
                    <span className="muted" style={{ fontSize: 'var(--text-2xs)' }}>
                      {destination.shape}
                    </span>
                    <span className="muted" style={{
                      fontSize: 'var(--text-2xs)', fontWeight: 700,
                      color: state === 'BLOCKED' ? 'var(--bad)' : undefined,
                    }}
                      /* THE CONNECTOR'S WORDS WHERE THERE ARE ANY.
                         D-21 wants both facts, and "BLOCKED" without
                         a reason is the lamp that loses an evening. */
                          title={sender?.says
                            ?? (platform?.needsReview ? platform.hint : undefined)}>
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
                  {/*
                    * THE REASON, PRINTED, NOT HOVERED.  [D-21, C-35]
                    *
                    * A tooltip is where a detail goes when the lamp
                    * already says enough. BLOCKED says nothing: the
                    * destination could want a key, want an approved
                    * app, want a different composition, or be sitting
                    * on a build of ffmpeg that cannot read what this
                    * channel writes. One of those the operator fixes in
                    * the box below; one of them nobody fixes without
                    * being told. So the sentence is on the screen
                    * whenever the state is the bad one.
                    */}
                  {state === 'BLOCKED' && sender?.says && (
                    /* A WASH AND AN EDGE, NOT A WALL OF RED. The lamp
                       and the word already carry the alarm; the
                       sentence has to be READ, and five lines of
                       warning colour is the one thing an operator
                       skips. */
                    <p data-testid="destination-reason"
                       style={{
                         margin: 0, padding: '6px 8px',
                         borderRadius: 6, borderLeft: '2px solid var(--bad)',
                         background: 'var(--state-bad-wash)',
                         color: 'var(--muted)',
                         fontSize: 'var(--text-2xs)', lineHeight: 1.5,
                       }}>{sender.says}</p>
                  )}
                  {destination.kind === 'rtmp' && (
                    <RtmpKey
                      destination={destination}
                      {...(sender?.server ? { server: sender.server } : {})}
                      hasKey={Boolean(sender?.hasKey)}
                      onSet={(server, key) => void patch({
                        action: 'set-destination-key',
                        destinationId: destination.id, server, key,
                      })}
                      onClear={() => void patch({
                        action: 'set-destination-key',
                        destinationId: destination.id, server: '', key: '',
                      })}
                    />
                  )}
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
              {/*
                * THE HEARTBEAT, AND NOTHING ELSE.  [§18, D-20]
                *
                * A fourth answer lived here — `not started here`,
                * for a beat older than this web tier's own boot —
                * and it was wrong on the deployment it mattered
                * on. BalanceVid runs SPLIT: the web containers are
                * one service, the engine another, and they share
                * the volume. The engine outlives any one web
                * container by design, so its beat is routinely
                * older than the reader's boot, and this label
                * called a working transmitter unstarted.
                *
                * The lamp beside it is read from across a room. It
                * gets the question the shared volume can actually
                * answer: is the pulse fresh, is it cold, or was
                * there never one.
                */}
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
            * AND WHETHER THE LISTING CAN FILL ITS OWN SLOTS.
            *   [channel.ts `overrunSays`, D-21, D-04]
            *
            * THE FAULT THAT COST A CHANNEL 99% OF ITS OUTPUT and
            * showed up on no instrument: every item five seconds
            * long in a slot of minutes, so the viewer heard five
            * seconds and then nothing. The engine was perfect
            * throughout, which is exactly why nothing caught it —
            * every signal in this bar asks about the transmitter,
            * and this is about what the transmitter was asked to
            * play.
            *
            * It loops now rather than going black, so this is a
            * note and not an alarm: something is on the wire, and
            * an ident repeating two hundred times is still a
            * duration somebody should fix.
            */}
          {overrunning.length > 0 && (
            <span className="row"
                  style={{ gap: 6, flex: '0 0 auto', whiteSpace: 'nowrap' }}>
              <span className="small" data-testid="overrunning"
                    style={{ color: 'var(--state-warn)', whiteSpace: 'nowrap' }}
                    title={overrunSays(overrunning) ?? ''}>
                {overrunning.length === 1
                  ? '1 item is shorter than its slot'
                  : `${overrunning.length} items are shorter than their slots`}
              </span>
              {/*
                * AND THE WAY OUT IS A BUTTON, NOT A CHORE.
                *
                * The notice beside it used to end *"Set the slot to
                * the length of the media"*, which is a sentence
                * telling somebody to open eight items and type eight
                * numbers that are sitting in the files. It is one
                * `slotsOverrunning` call on the server — the same one
                * that produced this count — so it is one action.
                * [route.ts `retime`, channelEdit.ts `retimeSlots`]
                */}
              <button className="small" data-testid="retime"
                      onClick={() => void patch({ action: 'retime' })}
                      title={'Set each of these slots to the length of the '
                        + 'media in it. Nothing is lengthened and no media '
                        + 'is touched.'}
                      style={{ padding: '2px 8px', whiteSpace: 'nowrap' }}>
                Match the media
              </button>
            </span>
          )}

          {/*
            * WHAT THE CONFIDENCE MONITOR CAN SEE.  [§18, C-28]
            *
            * In the status bar rather than beside the picture that
            * found it, because this is the line an operator reads and
            * a fault announced only in a 168-pixel corner is a fault
            * announced to nobody. It appears only while the monitor
            * is open: a sentence about a picture nothing is looking
            * at would be a claim with no evidence behind it.
            *
            * It ranks itself against the engine and the stream with
            * `confidenceSays`, which keeps `controlRoomNote`'s own
            * order — two instruments on one desk must not describe
            * one condition two different ways. [§6]
            */}
          {seen && (
            <span className="row" data-testid="confidence-note"
                  data-tone={seen.tone} style={{
                    gap: 6, fontSize: 'var(--text-xs)', minWidth: 0,
                  }} title={seen.says}>
              <Dot on colour={seen.tone === 'fault'
                ? 'var(--state-bad)' : 'var(--state-warn)'} />
              <span style={{
                color: seen.tone === 'fault'
                  ? 'var(--state-bad)' : 'var(--muted)',
                overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', maxWidth: 420,
              }}>{seen.says}</span>
            </span>
          )}

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
                        action: 'publish', ...author ? { author } : {},
                        ...availability,
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
              {/*
                * DECIDED IN THE SAME PRESS, so it is here rather than in
                * a panel somebody has to find afterwards — and gone once
                * the channel is on air, because changing it then is a
                * different act with a different consequence for people
                * who already hold the link. [P10]
                */}
              {!published && (
                <AvailabilityFields
                  noun="programme"
                  value={availability}
                  onChange={setAvailability}
                />
              )}
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

        {(violations.length > 0 || error || health?.note) && (
          <p className="small" data-testid="violations" style={{
            gridColumn: '1 / -1', margin: '4px 0 0', fontSize: 'var(--text-xs)',
            /*
              * THE COLOUR FOLLOWS WHAT IS BEING SAID, not which field it
              * came out of. A line telling the operator they have not
              * pressed TAKE LIVE yet is not a fault and must not be
              * painted as one.
              */
            color: error || health?.note?.tone === 'fault'
              ? 'var(--bad)'
              : violations.length > 0 ? 'var(--warn)' : 'var(--text-faint)',
          }}>
            {/*
              * THE ENGINE FIRST. A broken reference matters; nothing being
              * written at all matters more, and it is the fault that used
              * to be invisible from this page. [§18]
              *
              * `note` has already chosen between the transmitter's
              * sentence and the operator's — both are often true and a
              * desk that says both is a desk talking over itself. [§6]
              */}
            {error ?? health?.note?.says
              ?? (violations.length > 0 ? violations.join(' ') : null)}
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
export function Strip({
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
      /*
       * AND THE FIFTH TIME, IT WRAPS.
       *
       * The paragraph above is the history of one clip fixed four ways,
       * and every one of them was a way of making the labels smaller.
       * Eight desks — Camera, Guests, Screens, Media, Set, Graphics,
       * Audio, Answers — do not fit in 328 pixels at any legible size,
       * so shrinking them again would produce eight stubs instead of
       * one. A segmented control with two rows is still a segmented
       * control; a row of "CAM… GUE… SCR…" is not a control at all.
       * [U-19, §29]
       */
      gap: 0, flexWrap: compact ? 'wrap' : 'nowrap', rowGap: 2,
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
              /*
               * A QUARTER EACH, so eight desks make two rows of four
               * rather than one row of stubs and a second row of one.
               * `1 1 22%` lets four sit on a line with the gaps and
               * grow into whatever is left over. [§29]
               */
              flex: compact ? '1 1 22%' : '1 1 0',
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
              /*
                * AND A SIXTH LABEL NEEDED A THIRD STEP. Adding
                * ANSWERS to the Live Studio's five desks left six
                * uppercase words in a 330px column with no air
                * between them — not clipped, which is what the rule
                * above was written to stop, but running together as
                * one string. A segmented control has no gaps by
                * design, so the separation has to come from the
                * padding, and at six there was none left to give.
                */
              padding: compact
                ? `var(--space-2) ${options.length > 5
                  ? 'var(--space-1)'
                  : options.length > 3
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
              letterSpacing: options.length > 5
                ? '0.01em' : options.length > 3 ? '0.04em' : '0.08em',
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

export function Section({ text, aside }: { text: string; aside?: React.ReactNode }) {
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
  onClick, about, items, inset,
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
  /** A page belonging to the row above it, stepped in. [§20, C-48] */
  inset?: boolean;
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
        /*
         * A PAGE BELONGS TO THE ROW ABOVE IT, and the step plus the
         * rule on its leading edge is what says so. Without it a
         * deck's twelve pages read as twelve more things in the
         * list, which is the state this grouping exists to leave.
         * [§20, C-48]
         */
        ...(inset ? {
          paddingLeft: 'calc(var(--space-3) + 16px)',
          boxShadow: 'inset 2px 0 0 var(--console-rule)',
        } : {}),
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
            /*
             * ON AIR, NOT LIVE.  [§13, D-21, U-20, C-49]
             *
             * > *"ANCIENT OF DAYS IS LIVE BUT THE TV HAS NOT GONE
             * > LIVE."*
             *
             * The author read the badge correctly; the badge was
             * wrong. This entry is a RECORDING being transmitted
             * from the loop, and the channel has no camera open.
             *
             * The product already holds this line where it costs
             * something — `marksFor` pushes the LIVE lamp only when
             * `on.kind === 'live'`, because *"a channel whose LIVE
             * light is part of its logo is a channel lying to its
             * viewers"* — and broke it in its own control room,
             * where the operator who most needs to know whether a
             * camera is open reads it.
             */
            badge={playing ? (
              <span style={{
                flex: '0 0 auto', padding: '1px 5px', borderRadius: 3,
                background: 'var(--state-live-dim)', color: 'var(--ink-000)', fontSize: 'var(--text-2xs)',
                fontWeight: 800, letterSpacing: 0.5,
              }}>ON AIR</span>
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
  items, listing, picked, keep, onPick, itemsFor, openDeck, onOpenDeck,
}: {
  items: LibraryItem[];
  listing: Programme[];
  picked: string | null;
  keep: (text: string) => boolean;
  onPick: (key: string) => void;
  /* What to do with a finished render. The rail does not know; §3. */
  itemsFor: (item: LibraryItem) => MenuEntry[];
  /** Which deck is showing its pages, if any. [C-48] */
  openDeck: string | null;
  onOpenDeck: (id: string | null) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
        Nothing finished yet. Make a video in Studio One or Studio Two and it
        appears here — as a reference, never as a copy.
      </p>
    );
  }
  /*
   * A DECK IS ONE THING WITH TWELVE PAGES.  [§20, D-04, C-48]
   *
   * > *"HOW COME I CANNOT UPLOAD MEDIA INTO PLAYLIST"*
   *
   * The rail that question was asked of held twelve rows all
   * called "Admission Package — Dorot…", above the one video the
   * author wanted. Every row was CORRECT — a page is a still, a
   * still is schedulable, and the schedule is the only way to put
   * a caption card out at a TIME, the Slides panel being the way
   * to put one up NOW. Nothing said they were one thing.
   */
  const rows = libraryRows(
    items.filter((item) => keep(item.title) || Boolean(item.deck)), openDeck);
  return (
    <>
      {rows.map((row, index) => {
        if (row.kind === 'deck') {
          /* A shut deck is one line; the pages are what it stands
             for, and the line is what shuts them again. */
          if (!keep(row.title)) return null;
          return (
            <Row
              key={`deck:${row.id}`}
              index={index + 1}
              source={row.pages[0]!.source}
              title={row.title}
              subtitle={`Deck · ${deckSays(row.pages.length)}`}
              duration=""
              chosen={false}
              testid="library-deck"
              dataset={{
                'data-deck': row.id,
                'data-open': row.open ? 'true' : 'false',
              } as Record<string, string>}
              onClick={() => onOpenDeck(row.open ? null : row.id)}
              about={row.title}
              items={() => [{
                label: row.open ? 'Close the deck' : 'Show its slides',
                hint: 'Each page can be scheduled on its own.',
                onSelect: () => onOpenDeck(row.open ? null : row.id),
              }]}
            />
          );
        }
        const item = row.item;
        if (row.kind === 'item' && !keep(item.title)) return null;
        const key = sourceKey(item.source);
        const times = listing.filter(
          (entry) => sourceKey(entry.source) === key).length;
        return (
          <Row
            key={key}
            index={index + 1}
            /* A page of an open deck is stepped in, so the list
               reads as a deck with pages under it rather than as
               thirteen things in a row. */
            inset={row.kind === 'page'}
            source={item.source}
            title={item.title}
            /*
             * MEGABYTES WERE WHAT IT HAD, not what a scheduler wants.
             * *"[ Song — Ancient Days   04:04 ]"* — a person building an
             * evening needs the length and whose it is; the size on disk
             * is a fact about the machine. It is kept where it belongs,
             * in the menu for a row, and out of the line a person reads
             * down. [§25, C-14]
             */
            subtitle={[
              item.artist ?? studioOf(item.source),
              item.kind === 'audio' ? 'Audio' : null,
              /* The count that proves the rule, on the thing it is about:
                 scheduled six times, one file. */
              times > 0 ? `scheduled ${times}×` : null,
            ].filter(Boolean).join(' · ')}
            duration={item.kind === 'image' ? '' : runsFor(item.durationMs)}
            chosen={picked === key}
            testid={row.kind === 'page' ? 'library-page' : 'library-item'}
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
              /* ON AIR, not LIVE: a scheduled programme transmitting
                 is not a camera that is open. [§13, U-20, C-49] */
              <span style={{
                flex: '0 0 auto', padding: '1px 5px', borderRadius: 3,
                background: 'var(--state-live-dim)', color: 'var(--ink-000)', fontSize: 'var(--text-2xs)', fontWeight: 800,
              }}>ON AIR</span>
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
  channel, on, camera, guests, guestReadings, guestsStaged, solo,
  library, nameOf, studioOneId, studioTwoId, onAir,
  player, cuedTitle, cuedSource, hostLevel, fromStudioOne, fromStudioTwo,
  onTake, onBackToRoom, onGraphics, onSolo, onMedia,
}: {
  /** What each studio has finished, found once by the studio. [C-27] */
  fromStudioOne?: LibraryItem | undefined;
  fromStudioTwo?: LibraryItem | undefined;
  /**
   * The operator's own microphone, 0–1, where it is being measured.
   *
   * ALREADY MEASURED AND THROWN AWAY, which is the same finding C-14
   * made about the guests: `useFeedLevels` has metered every
   * microphone on the desk since it was written, the host's among
   * them, and tile 01 showed a picture with no indication of whether
   * the person in it could be heard. [D-19]
   */
  hostLevel?: number;
  /** What the media player is doing, so tile 05 can say it. [§25] */
  player: PlayerState;
  cuedTitle?: string;
  cuedSource?: ProgrammeSource;
  onMedia: () => void;
  channel: Channel;
  on: OnAir;
  camera: MediaStream | null;
  guests: { id: string; stream: MediaStream; label?: string }[];
  /** The four quarters of tile 02, already read. [§24] */
  guestReadings: GuestReading[];
  /** Everybody the Room has on stage, which may be more than four. */
  guestsStaged: { id: string }[];
  solo: string | null;
  onSolo: (id: string) => void;
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

  /*
   * EVERY TILE ASKS THE SAME QUESTION OF THE SAME FUNCTION.  [C-27]
   *
   * It used to ask three different ones — "the camera is on air",
   * "something is scheduled", "a bug is configured" — and two of them
   * were wrong whenever a reference was rolled in over a live show:
   * CAMERA 1 wore the program tally while a film covered it, and the
   * film's own tile stayed dark. `busFor` compares a tile's source
   * against what `whatIsOn` says is going out, which is the same
   * function the playout engine uses, so the tally cannot disagree
   * with the transmitter. [D-22]
   */
  const roomSource: ProgrammeSource | undefined = channel.live
    ? { kind: 'live', ingestId: channel.live.ingestId } : undefined;
  const bus = (
    mine?: ProgrammeSource, extra?: { keyed?: boolean },
  ): Bus | null => busFor({
    on,
    ...(mine ? { mine } : {}),
    ...(cuedSource ? { cued: cuedSource } : {}),
    ...(extra?.keyed ? { keyed: true } : {}),
  });

  const tiles: {
    n: number; label: string; sub: string;
    /** Which bus, decided once, by the function above. */
    bus: Bus | null;
    /**
     * A picture was expected and did not arrive. Undefined where the
     * question does not apply: a tile standing for a file on disk has
     * no signal to lose. [C-27]
     */
    signal?: boolean;
    /**
     * WHAT TO SAY WHEN THERE IS NOTHING TO SHOW.  [§24, D-04, C-27]
     *
     * A dead black rectangle is the one thing a rack must never be:
     * an operator cannot tell it from a source that has failed. Every
     * tile with nothing behind it now says, in a few words, what it
     * is waiting for — which is also the difference between "absent"
     * and "broken", and the reason absent is not dressed as a fault.
     */
    standby?: string;
    /**
     * A live microphone this browser is measuring, 0–1.
     *
     * ONLY WHERE IT IS REALLY MEASURED. Tiles 03, 04 and 05 stand for
     * files whose audio is in the playout engine, which the web tier
     * cannot hear — the same wall `health.ts` describes between the
     * two processes. A bar fed from the master mix would be the room's
     * level with a film's name on it, and a meter that reads zero for
     * an unmeasurable source is worse than no meter: it says silence.
     * [§11, D-20]
     */
    meter?: number;
    stream?: MediaStream | null; source?: ProgrammeSource; href?: string;
    /* A drawn mark, not a character — see Icon.tsx. The em dash
       fallback is text, which is why this is a node. */
    glyph?: React.ReactNode;
    /**
     * A TILE THAT IS ITSELF A MULTI-VIEW.  [§24]
     *
     * Present, it replaces the tile's single picture and the tile becomes
     * a group rather than a button — because what is clickable is now
     * inside it. Everything else about the tile is untouched, which is
     * the requirement: *"Fixed dimensions. No expansion. No
     * deformation."*
     */
    grid?: React.ReactNode;
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
      bus: bus(roomSource),
      /* A camera is the one tile that can lose a picture it was
         supposed to have: live, with no stream, is a fault. Off air
         it is simply not running. */
      ...(onAir ? { signal: Boolean(camera) } : {}),
      ...(camera ? {} : { standby: onAir ? 'No camera' : 'Camera off' }),
      ...(hostLevel === undefined ? {} : { meter: hostLevel }),
      stream: camera,
      ...(rolledIn ? { act: onBackToRoom } : {}),
      why: onAir
        ? (rolledIn ? 'Back to the room' : 'The room is already on air')
        : 'Only while you are live',
    },
    /*
     * 02 IS NOT A CAMERA, IT IS THE GUESTS.  [§24]
     *
     * *"02 Camera 2 — Guest should become 02 GUESTS — 4."* It was never a
     * second camera: it was the first staged person who was not the
     * operator, with the other three in the mix and off the monitor. Four
     * quarters in the same box is the whole change, and the count is the
     * Room's, not the grid's — a fifth guest is staged, mixed and
     * audible, and the sub-line says so rather than losing them.
     */
    {
      n: 2, label: 'Guests',
      sub: guestsStaged.length === 0 ? 'Nobody on stage'
        : `${guestCount(guestsStaged)} on stage`,
      bus: guestReadings.some((one) => one.onAir) ? 'program' : null,
      /* The loudest guest, so the tile says somebody is talking
         without the operator reading four quarters. */
      meter: Math.max(0, ...guestReadings.map((one) => one.energy)),
      ...(guestsStaged.length === 0
        ? { standby: 'Nobody on stage yet' } : {}),
      grid: (
        <GuestGrid
          readings={guestReadings}
          streamFor={(id) => guests.find(
            (person) => person.id === id)?.stream ?? null}
          onSelect={onSolo}
          disabled={!onAir}
        />
      ),
      /*
       * AND IT SAYS WHEN THE ROOM IS UNDERNEATH SOMETHING. A rolled-in
       * reference replaces the live feed (§5), so soloing a guest while
       * one is playing changes what is composited and not what is going
       * out. Saying so is cheaper than an operator discovering it.
       */
      why: !onAir ? 'Only while you are live'
        : rolledIn
          ? 'A programme is rolled in over the room \u2014 tile 01 takes it down'
          : solo
            ? 'One guest is on programme \u2014 click them again to release'
            : 'Click a guest to put them on programme alone',
    },
    {
      n: 3, label: 'Studio Two',
      /* THE PROGRAMME, NAMED. "Music Video" was a placeholder standing
         where the thing's own title belongs, and a rack whose third
         input is labelled with a genre is a rack an operator cannot
         call a cut from. [C-27] */
      /* THE SUB SAYS WHAT THE INPUT IS, the standby says why it is
         empty. Both saying "nothing finished" was one fact twice in a
         hundred-pixel box. */
      sub: fromStudioTwo?.title ?? 'Performance',
      bus: bus(fromStudioTwo?.source),
      ...(fromStudioTwo ? {} : { standby: 'Nothing yet' }),
      ...(fromStudioTwo ? { source: fromStudioTwo.source } : {}),
      ...(studioTwoId ? { href: `/p/${studioTwoId}` } : {}),
      ...(onAir && fromStudioTwo
        ? { act: () => onTake(fromStudioTwo.source) } : {}),
      why: fromStudioTwo
        ? (onAir ? 'Roll it in over the live feed' : 'Only while you are live')
        : 'Nothing finished in Studio Two yet',
    },
    {
      n: 4, label: 'Studio One',
      sub: fromStudioOne?.title ?? 'Conversation',
      bus: bus(fromStudioOne?.source),
      ...(fromStudioOne ? {} : { standby: 'Nothing yet' }),
      ...(fromStudioOne ? { source: fromStudioOne.source } : {}),
      ...(studioOneId ? { href: `/c/${studioOneId}` } : {}),
      ...(onAir && fromStudioOne
        ? { act: () => onTake(fromStudioOne.source) } : {}),
      why: fromStudioOne
        ? (onAir ? 'Roll it in over the live feed' : 'Only while you are live')
        : 'Nothing finished in Studio One yet',
    },
    /*
     * 05 IS THE PLAYER, NOT THE SCHEDULE.  [§25, C-14]
     *
     * It read `scheduled ? nameOf(scheduled) : 'Idle'`, so "Idle" meant
     * "nothing is scheduled" on a tile called Media Player, and clicking
     * it rolled in whatever the clock had reached — which is what the
     * PROGRAM button beside it already does. There was no way to load
     * anything, which is the architectural gap the brief names.
     *
     * Now it says what the PLAYER is doing, shows what is cued, and
     * clicking it opens the picker. Taking a thing to air is the
     * transport's own red control, one press away and clearly labelled,
     * rather than a side effect of clicking a monitor.
     */
    {
      n: 5, label: 'Media Player',
      sub: playerSays(player, () => cuedTitle,
        scheduled ? nameOf(scheduled) : undefined),
      bus: bus(cuedSource ?? scheduled),
      /* The player's own sub-line already says it is empty, so the
         plate says what to do about it instead. */
      ...(cuedSource || scheduled ? {} : { standby: 'Pick a clip' }),
      ...(cuedSource ? { source: cuedSource }
        : scheduled ? { source: scheduled } : {}),
      act: onMedia,
      why: 'Open the player and pick something from the Library',
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
      bus: bus(undefined, {
        keyed: Boolean(channel.identity?.bug || channel.identity?.lowerThird),
      }),
      ...(channel.identity?.bug || channel.identity?.lowerThird ? {} : {
        standby: transmitting ? 'Picture is bare' : 'Identity off',
      }),
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
      {tiles.map((tile) => {
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
        /*
         * THREE BUSES, THREE COLOURS, ONE BAR.  [§6, §24, C-27]
         *
         *   PROGRAM  red     this is what the audience can see
         *   PREVIEW  blue    this is cued to go next
         *   KEY      amber   this is drawn over whoever is on program
         *
         * The grid had two of these and used blue for both the
         * second and the third, which is a gallery wall where blue
         * means two things: an operator reading it could not tell
         * "next" from "over the top". The keyer takes the house's
         * third state colour, and the bar's thickness ranks them —
         * program is the thickest because it is the only one that is
         * already out of the building.
         */
        const live = tile.bus === 'program';
        const says = saysFor(tile.bus, {
          ...(tile.signal === undefined ? {} : { signal: tile.signal }),
          ...(tile.act ? { ready: true } : {}),
        });
        const edge = live ? 'var(--state-live)'
          : tile.bus === 'preview' ? 'var(--accent)'
            : tile.bus === 'key' ? 'var(--state-armed)' : null;
        const style: React.CSSProperties = {
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
            opacity: tile.act || tile.bus ? 1 : 0.7,
            border: `1px solid ${edge
              ? `color-mix(in srgb, ${edge} 50%, transparent)`
              : 'var(--console-seam)'}`,
            boxShadow: edge
              ? `inset 0 ${live ? 3 : 2}px 0 0 ${edge},`
                + ` inset 0 0 0 1px color-mix(in srgb, ${edge} 16%,`
                + ' transparent), inset 0 1px 3px rgba(0,0,0,0.6)'
              : 'inset 0 1px 3px rgba(0,0,0,0.6)',
            transition: 'box-shadow var(--motion-fast) var(--ease-out),'
              + ' border-color var(--motion-fast) var(--ease-out),'
              + ' opacity var(--motion-fast) var(--ease-out)',
        };
        const title = `${tile.label} \u2014 ${tile.sub}`
          + (says === '\u2014' ? '' : ` \u2014 ${says}`)
          + (tile.why ? `\n${tile.why}` : '');

        /*
         * THE PICTURE. A tile holding its own grid draws that instead
         * of a single source, and everything around it is unchanged —
         * the plate, the number, the tally, the box. That is the whole
         * of *"the boxt must not be enlarge"*: the contents divide and
         * the rack does not move. [§24]
         */
        const picture = tile.grid ?? (
          tile.stream ? (
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
            /*
              * A STANDBY PLATE, NOT A BLACK RECTANGLE.  [§24, D-04]
              *
              * Six dead black panels is a rack an operator cannot
              * read: a source that has nothing in it and a source
              * that has failed look identical, and the only way to
              * tell them apart was to click. A tile with nothing
              * behind it now says what it is waiting for — quietly,
              * in the dim ink that means "absent" rather than the
              * red that means "broken".
              */
            <span aria-hidden="true" className="muted" data-testid="tile-standby"
              style={{
                position: 'absolute', left: 0, right: 0, top: 0, bottom: 28,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 3,
                padding: '0 var(--space-2)',
                textAlign: 'center', opacity: 0.55,
              }}
            >
              <span style={{ fontSize: 'var(--text-md)', opacity: 0.6 }}>
                {tile.glyph ?? '\u2014'}</span>
              {tile.standby && (
                /* THREE OR FOUR WORDS, because a tile is about a
                   hundred pixels wide and a sentence in it runs under
                   the name plate. The sentence version of the same
                   thing is already on the tile's own tooltip, where
                   there is room for it. */
                <span style={{
                  fontSize: 'var(--text-2xs)', lineHeight: 1.2,
                  maxWidth: '94%', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{tile.standby}</span>
              )}
            </span>
          )
        );
        const plates = (
          <>
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
              position: 'absolute', left: 0, top: edge ? (live ? 3 : 2) : 0,
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
              color: live ? 'var(--state-live-ink)' : 'var(--ink-200)',
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
                  * THE LEVEL, WHERE THERE IS ONE TO READ.  [§24, C-27]
                  *
                  * Four segments and no numbers: the question an
                  * operator asks of a multi-view is "is that
                  * microphone alive", not "how many dB". It appears
                  * only on the two tiles whose audio this browser
                  * actually measures — a bar that reads zero for a
                  * source nobody is metering says silence, which is
                  * a different and worse lie than saying nothing.
                  */}
                {tile.meter !== undefined && (
                  <span className="row" data-testid="tile-meter"
                    aria-hidden="true"
                    style={{ gap: 1, flexWrap: 'nowrap', flex: '0 0 auto' }}
                  >
                    {[0.08, 0.26, 0.5, 0.74].map((step) => (
                      <span key={step} style={{
                        width: 2, height: 7, borderRadius: 1,
                        background: tile.meter! > step
                          ? (step > 0.6 ? 'var(--state-warn)' : 'var(--state-ok)')
                          : 'rgba(255,255,255,0.18)',
                      }} />
                    ))}
                  </span>
                )}
                {/*
                  * STATUS, IN A WORD, on every input. The brief asks each
                  * source to say availability as well as identity, and a
                  * tile that says only its name leaves "can I cut to this"
                  * to be discovered by clicking. The vocabulary grew to
                  * six with C-27 — PREVIEW and KEY because blue used to
                  * mean both, NO SIGNAL because a tile offering a cut to
                  * a dead input is the tally lying in its quietest form
                  * — and every one of them survives greyscale, because
                  * each is a word. [brief §8, U-19]
                  */}
                <span data-testid="tile-says" style={{
                  flex: '0 0 auto', fontSize: 'var(--text-2xs)',
                  fontWeight: 'var(--weight-bold)', letterSpacing: '0.08em',
                  color: live ? 'var(--state-live-ink)'
                    : tile.bus === 'preview' ? 'rgba(146, 194, 240, 0.95)'
                      : tile.bus === 'key' ? 'var(--state-armed)'
                        : says === 'NO SIGNAL' ? 'var(--state-bad)'
                          : says === 'READY' ? 'rgba(146, 214, 166, 0.92)'
                            : 'rgba(255,255,255,0.35)',
                }}>{says}</span>
              </span>
            </span>
          </>
        );

        /*
         * A GRID OF BUTTONS CANNOT LIVE INSIDE A BUTTON, and that is
         * not a technicality: a nested button is invalid, unreachable
         * by keyboard in the order a person expects, and announced as
         * one control by a screen reader. So the guests tile is a
         * GROUP with four controls in it, wearing the identical box.
         * Nothing about the geometry differs — only what claims the
         * click. [U-19]
         */
        return tile.grid ? (
          <div
            key={tile.n} data-testid="multiview-tile"
            data-source={tile.n} data-live={live ? 'true' : 'false'}
            data-bus={tile.bus ?? 'off'} data-says={says}
            data-actionable="grid"
            role="group" aria-label={title} title={title} style={style}
          >{picture}{plates}</div>
        ) : (
          <button
            key={tile.n} type="button" data-testid="multiview-tile"
            data-source={tile.n} data-live={live ? 'true' : 'false'}
            data-bus={tile.bus ?? 'off'} data-says={says}
            data-actionable={tile.act ? 'true' : 'false'}
            disabled={!tile.act} onClick={tile.act} title={title}
            style={style}
          >{picture}{plates}</button>
        );
      })}
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
/**
 * HOW EACH KIND OF BLOCK IS PAINTED.  [§2, §18, D-21, C-31, C-46]
 *
 * ONE ROW OF THIS TABLE IS THE WHOLE POINT. `off` and `rotation`
 * both fell through to the same faint blue, so a HOLE IN THE
 * SCHEDULE — the single thing an operator most needs to find at a
 * glance — was painted exactly like a quiet turn of the loop. The
 * word "Off air" was on the block, and a schedule lane is SCANNED
 * rather than read: colour arrives first and the colour said
 * "something is on".
 *
 * So a hole is now the absence of a block rather than a block of a
 * different colour: no fill, a dashed rule, and a diagonal hatch —
 * the mark every rundown and every edit system has used for empty
 * track since they were drawn on paper. It cannot be mistaken for
 * programming because it is not painted like programming.
 *
 * The other six rows are the colours this lane already had. The
 * table exists so that the NEXT kind added to `OnAir` has to be
 * given one, instead of falling through a chain of ternaries into
 * whatever the last `else` happened to be. That fall-through is
 * what this fixes.
 */
const TONE: Record<Tone, {
  bed: string; edge: string; hatch?: string; dashed?: boolean; ink?: string;
}> = {
  missing: { bed: 'rgba(200,60,50,0.28)', edge: 'var(--console-edge)' },
  /*
   * > *"The red should communicate live/on-air state, not simply
   * > fill the whole event."*  [brief point 1]
   *
   * It filled it, at a third opacity, so a two-hour live
   * broadcast was the loudest object in the room for two hours
   * and the ONE block actually going out at this second — which
   * carries the dot and the countdown — had nothing left to be
   * louder than. A quarter of the fill and a red edge: the state
   * is still unmistakable and the tally can still beat it.
   */
  live: { bed: 'rgba(192,57,43,0.14)', edge: 'var(--state-live-dim)' },
  standby: { bed: 'rgba(201,154,46,0.26)', edge: 'var(--console-edge)' },
  programme: { bed: 'rgba(45,110,200,0.26)', edge: 'var(--console-edge)' },
  loop: { bed: 'rgba(45,110,200,0.12)', edge: 'var(--console-edge)' },
  hole: {
    bed: 'transparent', edge: 'var(--line)', dashed: true,
    ink: 'var(--ink-400)',
    hatch: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0 5px, '
      + 'transparent 5px 11px)',
  },
};

/**
 * ONE LANE, AND IT LIVES OUT HERE FOR A REASON.  [C-47]
 *
 * It was declared inside `Timeline`'s body, so every render made a
 * NEW COMPONENT TYPE and React unmounted and remounted all four
 * lanes and everything on them. The clock ticks once a second,
 * which means the whole strip was destroyed and rebuilt sixty
 * times a minute.
 *
 * That is not a tidiness point. It remounts a `<video>` element
 * per filmstrip cell every second — which is most of why the
 * browser reached its media-element ceiling the moment the window
 * widened — it drops focus out of anything on the strip, and it
 * is why a right-click had to race the clock to land on a block
 * that still existed long enough to receive it.
 *
 * It closes over nothing: four props and its children.
 */
/**
 * Where the graphics lane's four tracks sit, and how far apart.
 *
 * NAMED, BECAUSE TWO PLACES DRAW THEM: the tracks themselves and the
 * legend beside them. Two copies of `3 + row * 15` is two copies
 * until somebody changes one. [D-19]
 *
 * The first track starts below the lane's own name rather than beside
 * it, so the column reads as a heading with four entries under it
 * instead of `GRAPHICS` and `CHANNEL BUG` on one line.
 */
const GRAPHICS_TOP = 19;
const GRAPHICS_PITCH = 15;

function Lane({ name, note, height, rows, children }: {
  name: string; note?: string; height: number;
  /*
   * A LANE WITH TRACKS INSIDE IT NAMES THEM HERE, NOT IN THEM.
   *   [C-48, D-04]
   *
   * The graphics lane draws four tracks — the bug, the LIVE lamp,
   * the lower third, NEXT — and named none of them, because only
   * the bug is ever wide enough to carry a label: it holds its text
   * all day, while a lower third is eight seconds, two pixels of a
   * two-and-a-half-hour window. Three rows of anonymous ticks.
   *
   * The first fix put the name inside the row at its left edge, and
   * a browser run showed exactly why that is wrong: the bug's bar
   * starts at the window's left edge and runs the whole width, so
   * `CHANNEL BUG` and `Channel bug: BALANCEVID` were printed on top
   * of each other — and the first tick of each other row landed on
   * its own name.
   *
   * A LEGEND GOES IN THE LEGEND COLUMN. It is already there, ninety-
   * six pixels of it, holding this lane's own name; the tracks are
   * the same kind of thing one level down. The caller passes the
   * tops it draws its rows at, so the two cannot drift.
   *
   * AND THE COLUMN HOLDS ONE OR THE OTHER, not both: the note sits
   * directly under the name, which is where the first track's own
   * name goes — `21 events` and `CHANNEL BUG` printed over each
   * other the first time this was drawn. Named tracks are the better
   * answer anyway, and they are the answer to the complaint the
   * note caused: *“GRAPHICS shows ‘21 events’ as undifferentiated
   * ticks”*. A total across four layers does not say which. [D-04]
   */
  rows?: { name: string; lit: boolean; top: number; height: number }[];
  children: React.ReactNode;
}) {
  return (
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
        flex: '0 0 auto', width: 96, position: 'relative',
        padding: '5px var(--space-4) 0 0', textAlign: 'right',
      }}>
        <span style={{
          display: 'block', fontSize: 'var(--text-2xs)',
          fontWeight: 'var(--weight-bold)', color: 'var(--ink-300)',
          letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>{name}</span>
        {note && !rows && (
          <span style={{
            display: 'block', fontSize: 'var(--text-2xs)',
            transform: 'scale(0.85)', transformOrigin: 'right top',
            color: 'var(--ink-400)',
          }}>{note}</span>
        )}
        {/*
          * THE TRACKS INSIDE THIS LANE, at the tops the lane itself
          * draws them at. Dimmer than the lane's own name because
          * they are one level down, and dimmer again where the track
          * is empty — which is the legend saying "this layer exists
          * and is off" rather than the layer not existing.
          */}
        {rows?.map((row) => (
          <span key={row.name} data-testid="lane-row-name" style={{
            position: 'absolute', right: 'var(--space-4)',
            top: row.top, height: row.height, lineHeight: `${row.height}px`,
            fontSize: 'var(--text-2xs)', letterSpacing: '0.06em',
            textTransform: 'uppercase', whiteSpace: 'nowrap',
            transform: 'scale(0.85)', transformOrigin: 'right center',
            color: row.lit ? 'var(--ink-300)' : 'var(--ink-450)',
          }}>{row.name}</span>
        ))}
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
}

function Timeline({
  segments, channel, now, windowFrom, windowTo, across, stepMs, stripRef,
  stripWidth, clock, missingKeys, chosen, onChoose, menuFor,
}: {
  segments: Segment[];
  channel: Channel;
  now: number;
  windowFrom: number;
  windowTo: number;
  across: (at: number) => string;
  /** The ruler's interval, chosen for this span at this width. [C-46] */
  stepMs: number;
  stripRef: React.RefObject<HTMLDivElement | null>;
  /** The lane's own width in pixels, so legibility is a measurement
   *  rather than a guess about how long a programme is. [C-46] */
  stripWidth: number;
  clock: (at: number) => string;
  missingKeys: Set<string>;
  chosen: string | null;
  onChoose: (id: string) => void;
  /** What can be done to a block, from the same list the rails
   *  show. The strip had none of it. [C-47] */
  menuFor: (on: OnAir) => MenuEntry[];
}) {
  const { onRow } = useRowMenu();
  const ticks = Math.round((windowTo - windowFrom) / stepMs);
  /*
   * WHAT THE COMPOSITOR WILL HAVE DRAWN, over this window. Asked
   * of `marksFor` itself rather than derived from the identity
   * document, so the lane cannot drift from the picture. [C-47]
   */
  const graphics: GraphicEvent[] = useMemo(
    () => graphicsOver(channel, windowFrom, windowTo, segments),
    [channel, windowFrom, windowTo, segments]);

  /*
   * WHICH PIECE OF MEDIA EACH STRETCH IS, AND WHERE IN IT.
   *
   * The filmstrip's own fact, and the one thing on this page that
   * can show a loop turning over. [scheduleView.ts, C-48]
   */
  const made = useMemo(() => pieces(segments), [segments]);

  /*
   * AND THE MASTER BUS AS RUNS RATHER THAN AS BLOCKS, so the lane
   * says where sound STOPS instead of re-drawing PROGRAM's own
   * boundaries and writing one word in each. [C-48, §11]
   */
  const sound = useMemo(() => soundRuns(segments.map((segment) => ({
    fromMs: segment.fromMs,
    toMs: segment.toMs,
    sound: audioState(blockTone(segment.on, segment.on.kind !== 'off'
      && missingKeys.has(sourceKey(segment.on.source)))),
  }))), [segments, missingKeys]);


  return (
    <div ref={stripRef} data-testid="schedule-strip" style={{ minWidth: 0 }}>
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
            const at = windowFrom + index * stepMs;
            /*
             * BOTH ENDS TUCKED IN.  [C-38's argument, one surface along]
             *
             * Every label was centred except the first, so the LAST
             * hung half its width past the right edge and was
             * clipped: `23:0`. A measuring instrument whose last
             * number is shaved cannot be trusted at the end of the
             * scale, which is where a schedule is read.
             */
            const nudge = labelNudge(index, ticks + 1);
            return (
              <span key={index}>
                <span className="mono readout" style={{
                  position: 'absolute', top: 1, left: across(at),
                  fontSize: 'var(--text-2xs)', color: 'var(--ink-300)',
                  letterSpacing: '0.04em',
                  transform: nudge === 'start' ? 'none'
                    : nudge === 'end' ? 'translateX(-100%)'
                      : 'translateX(-50%)',
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
            const tone = blockTone(segment.on, broken);
            const paint = TONE[tone];
            /* The one block under the playhead counts itself down; forty
               blocks each counting down is a lane nobody reads. [D-04] */
            const left = leftOf(segment, now);
            const edge = broken ? 'var(--state-live-dim)'
              : isChosen ? 'var(--accent-soft)' : paint.edge;
            /*
             * A BLOCK NARROWER THAN ONE CLOCK READING SAYS NOTHING.
             * At a day the strip read `2: 5: 4036 9:2: 5:` across a
             * hundred eight-pixel blocks — not small text but noise
             * with the shape of text, which is harder to look past
             * than an empty block. [C-46]
             */
            const words = fitsText(segment.toMs - segment.fromMs,
              windowTo - windowFrom, stripWidth);
            /* And the countdown is four readings long, so it gets its
               own threshold: below it the block keeps the number that
               cannot wait and drops the one that follows from it. */
            const roomy = fitsText(segment.toMs - segment.fromMs,
              windowTo - windowFrom, stripWidth, COUNTDOWN_READINGS);
            /*
             * AND THE LENGTH HAS A THRESHOLD OF ITS OWN, because it
             * is four characters beside a title and not a sentence.
             * Gated on the countdown's four readings it vanished
             * from every block in the lane — the one number the
             * brief draws on the right of the line, absent because
             * a different string that shares the block is long.
             */
            const wide = fitsText(segment.toMs - segment.fromMs,
              windowTo - windowFrom, stripWidth, LENGTH_READINGS);
            const rule = `1px ${paint.dashed ? 'dashed' : 'solid'} ${edge}`;
            return (
              <button
                key={`p${segment.fromMs}`} type="button"
                data-testid="schedule-block"
                {...(segment.on.kind === 'programme'
                  ? { 'data-programme-id': segment.on.programme.id } : {})}
                data-kind={segment.on.kind}
                onClick={() => { if (id) onChoose(id); }}
                data-tone={tone}
                {...onRow(segment.title, () => menuFor(segment.on))}
                title={`${segment.title} — ${clock(segment.fromMs)} to `
                  + `${clock(segment.toMs)}`
                  + (left === null ? '' : ` · ${offsetLabel(left)} left`)}
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
                  /*
                   * TWO LINES, WHICH IS WHAT THE MARKUP ALWAYS SAID.
                   * [C-46]
                   *
                   * The two spans inside are `display: block` and were
                   * written to stack — a title over a duration. They
                   * did not. The room's own stylesheet makes every
                   * `<button>` a row flex with `align-items: center`,
                   * so they became flex ITEMS side by side, splitting
                   * eighty pixels between them: `Statio… 1…`, a title
                   * cut short and a duration cut to one digit, which
                   * is a worse reading than no duration at all.
                   *
                   * A block laid out by a rule it does not declare is
                   * a block that changes when somebody edits a global,
                   * so this declares it. The direction is the fix; the
                   * spans are untouched.
                   */
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'stretch', justifyContent: 'flex-start',
                  textAlign: 'left', font: 'inherit', fontSize: 'var(--text-2xs)',
                  color: paint.ink ?? 'inherit',
                  cursor: id ? 'pointer' : 'default',
                  overflow: 'hidden',
                  /*
                   * WHAT KIND OF BLOCK THIS IS DECIDES HOW IT IS PAINTED,
                   * and the judgement is `blockTone`'s rather than a chain
                   * of ternaries here — see TONE above for why a hole is
                   * hatched rather than tinted. Red for a reference with
                   * nothing behind it stays at the top of the order: it is
                   * the one fault a listing cannot show by looking right,
                   * because the slot is there, the title is there, and the
                   * hour goes out black.
                   */
                  background: paint.bed,
                  backgroundImage: paint.hatch ?? 'none',
                  /*
                   * THE ONE ON AIR IS LIT ALONG ITS TOP EDGE, the same
                   * tally the multi-view learned in 03. It was outlined
                   * in the same accent as the chosen one, so "what is
                   * going out right now" and "what I clicked" were the
                   * same mark on a lane of forty blocks.
                   */
                  borderTop: holds ? '2px solid var(--state-live)' : rule,
                  borderRight: rule,
                  borderBottom: rule,
                  borderLeft: rule,
                  boxShadow: isChosen
                    ? 'inset 0 0 0 1px rgba(127,180,238,0.35)' : 'none',
                }}
              >
                {/*
                  * TWO LINES, AND THE BRIEF DREW THEM.
                  *   [brief point 1, §13, U-20, C-47]
                  *
                  * > *"LIVE STUDIO                    2:30:00*
                  * >  *LIVE · Studio One"*
                  *
                  * The title and the length are one line because
                  * they are one fact — WHAT, and HOW LONG — and the
                  * length is the only thing on a block whose width
                  * is fixed and known, so it is the thing that sits
                  * right and never truncates. It was sharing the
                  * line by accident, both halves shrinking, and
                  * `Statio… 1…` was the result.
                  *
                  * ● ON AIR LEADS THE LINE, WHICH IS THE BRIEF'S
                  * "one thing I would add later". The block under
                  * the playhead was lit along its top edge and
                  * nothing else — a tally an operator has to be
                  * taught. And it says it only when it is TRUE: the
                  * playhead is drawn whenever now falls in the
                  * window, which it does at four in the morning on
                  * a channel that is off air, and a marker claiming
                  * ON AIR over a hole is the fault U-20 already
                  * fixed once on the playhead's own flag.
                  */}
                <span className="row" style={{
                  gap: 5, alignItems: 'baseline', minWidth: 0,
                  lineHeight: 1.3, flex: '0 0 auto',
                  /*
                   * AND IT DOES NOT WRAP, SAID HERE.  [C-47]
                   *
                   * `.row` is `flex-wrap: wrap` in the room's own
                   * stylesheet, which is right for a toolbar and
                   * wrong for a line inside a fifty-pixel block: the
                   * length dropped to a third line and the block
                   * overflowed its lane by seven pixels, on exactly
                   * the blocks wide enough to show a length at all.
                   *
                   * The second global rule this block was laid out
                   * by without declaring, after `button`'s own
                   * `display: flex`. A line that must be one line
                   * says so where it is written.
                   */
                  flexWrap: 'nowrap',
                }}>
                  {holds && segment.on.kind !== 'off' && (
                    <span aria-hidden="true" data-testid="block-on-air" style={{
                      width: 5, height: 5, borderRadius: '50%', flex: '0 0 auto',
                      background: 'var(--state-live)',
                      boxShadow: '0 0 0 2px rgba(192,57,43,0.25)',
                    }} />
                  )}
                  <span style={{
                    flex: '1 1 auto', minWidth: 0, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontWeight: 600,
                  }}>{words ? segment.title : ''}</span>
                  {/* The length never truncates: it is four
                      characters and it is why the line exists. */}
                  {wide && (
                    <span className="mono" style={{
                      flex: '0 0 auto', fontSize: 'var(--text-2xs)',
                      color: 'var(--ink-300)',
                    }}>{offsetLabel(segment.toMs - segment.fromMs)}</span>
                  )}
                </span>
                {/*
                  * AND THE SECOND LINE IS WHAT THIS IS — or, on the
                  * one block under the playhead, when it ends and
                  * how much is left, because that outranks it for
                  * exactly one block in the lane. [D-04]
                  */}
                <span data-testid="block-foot" style={{
                  display: 'block', fontSize: 'var(--text-2xs)',
                  lineHeight: 1.3, flex: '0 0 auto',
                  whiteSpace: 'nowrap', overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  color: left === null ? 'var(--ink-400)' : 'var(--state-live)',
                  fontWeight: left === null ? 400 : 600,
                }}>
                  {!words ? '' : left === null
                    ? (segment.on.kind === 'off' ? 'Nothing scheduled'
                      : (stateLine(segment.on)
                        ?? sourceLine(sourceOf(segment.on)) ?? ''))
                    : roomy
                      ? `ON AIR · ends ${clock(segment.toMs)} · `
                        + `${offsetLabel(left)} left`
                      : `${offsetLabel(left)} left`}
                  {words && broken ? ' · missing' : ''}
                </span>
              </button>
            );
          })}
        </Lane>

        {/* ---- VIDEO TRACKS: which piece of media, and where in it ------ */}
        {/*
          * IT KNEW NOTHING THE LANE ABOVE IT DID NOT.  [C-48, D-19, D-04]
          *
          * The caption read `stateLine(on) ?? sourceLine(sourceOf(on))`,
          * which is the exact expression PROGRAM's second line is built
          * from — so "Studio Two · Performance" was printed twice, one
          * row apart, on every block in the window. A whole lane of the
          * screen spent repeating the line above it.
          *
          * AND `sourceLine` IS THE VIEWER'S CAPTION. It was written for
          * the lower third in C-42, where "Studio Two · Performance" is
          * all a viewer should be told. An operator looking at a video
          * track already knows which studio made it. What they cannot
          * see anywhere else is WHICH PIECE and WHERE IN IT — the thing
          * a video track has carried since tape.
          *
          * `on.fromMs` IS HOW FAR INTO THE MEDIA, not a wall clock: the
          * same number the countdown is built from, and nothing on this
          * page had ever shown it. So the caption is now the media's own
          * timecode, and a loop turning over — three identical titles in
          * PROGRAM — reads here as `00:00 →` three times, with a cut
          * before each. [scheduleView.ts]
          */}
        <Lane name="Video Tracks" note={piecesSay(made)} height={44}>
          {segments.map((segment, index) => (
            <div key={`v${segment.fromMs}`} data-testid="filmstrip-cell"
                 data-cut={made[index]?.cut ? 'yes' : 'no'} style={{
              position: 'absolute', top: 3, bottom: 3, left: across(segment.fromMs),
              width: `calc(${across(segment.toMs)} - ${across(segment.fromMs)})`,
              minWidth: 3, overflow: 'hidden',
              borderRadius: 'var(--radius-screen)',
              border: '1px solid var(--line)', background: 'var(--screen-bed)',
              /*
               * THE JOIN IS THE LANE'S WHOLE POINT, so it is a mark and
               * not an inference. The five-minute walk cuts one film
               * into pieces; a border on every cell drew a join where
               * there was none and no join where there was one.
               */
              borderLeft: made[index]?.cut
                ? '2px solid var(--ink-300)' : '1px solid var(--line)',
              /* A strip of sprocket holes: the join between two pieces of
                 video, which is what this lane is for seeing. */
              backgroundImage:
                'repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 1px, '
                + 'transparent 1px 9px)',
            }}>
              {/*
                * A FRAME ONLY WHERE THERE IS ROOM FOR ONE: a poster in a
                * three-pixel cell is a fetch nobody can see.
                *
                * AND "ROOM" IS A SHARE OF THE WINDOW, NOT A DURATION.
                * [C-46]
                *
                * Eight minutes was five per cent of the fixed window and
                * is half a per cent of a day — five pixels. Left as a
                * duration, the first zoom out to twenty-four hours
                * mounted a `<video>` element per stretch and Chromium
                * refused them wholesale: *"Blocked attempt to create a
                * WebMediaPlayer as there are too many WebMediaPlayers
                * already in existence."* The filmstrip went blank at
                * exactly the span somebody zoomed out to survey.
                *
                * A share keeps the old behaviour at the old window to
                * the pixel — 8 min is 1/18.75 of two and a half hours —
                * and caps the count at eighteen whatever the span. The
                * lane is the same; it is the WINDOW that stopped being
                * a constant, and this is the second thing in this file
                * that was measuring against it without saying so.
                */}
              {segment.on.kind !== 'off'
                && roomOnScreen(segment.toMs - segment.fromMs,
                  windowTo - windowFrom, FRAME_SHARE) && (
                <Thumb source={segment.on.source} />
              )}
              {/*
                * AND IT SAYS WHERE IN THE MEDIA THIS IS.
                *   [brief point 4, C-47, C-48]
                *
                * > *"The timeline should tell the operator what source
                * > is actually occupying that period."*
                *
                * Which it answered with the lane above's own sentence.
                * The source is one row up and has not moved; what is
                * here now is the part of the answer only a video track
                * can give — the timecode of the piece under the
                * playhead, and where it was entered and left.
                *
                * THE WORD STAYS WHERE THE WORD IS ALL THERE IS. A still
                * has no timecode to run, and `00:00 → 00:08` on a
                * photograph would be a running number over something
                * that is not running. [D-21]
                */}
              {segment.on.kind !== 'off' && (() => {
                const piece = made[index];
                /* `made` is mapped from `segments`, one for one, so
                   this cannot miss — said to the compiler, which has
                   no way to know an index came from the same map. */
                if (!piece) return null;
                const still = segment.on.source.kind === 'media'
                  && segment.on.source.form === 'image';
                const says = still ? 'Slide'
                  : stateLine(segment.on)
                    ? `${stateLine(segment.on)} · ${offsetLabel(piece.intoMs)}`
                    : `${offsetLabel(piece.intoMs)} → ${offsetLabel(piece.outMs)}`;
                if (!says || !fitsText(segment.toMs - segment.fromMs,
                  windowTo - windowFrom, stripWidth)) return null;
                return (
                  <span data-testid="source-line" style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0,
                    padding: '1px 4px', fontSize: 'var(--text-2xs)',
                    lineHeight: '13px', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    color: 'var(--ink-200)',
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.72))',
                  }}>{says}</span>
                );
              })()}
            </div>
          ))}
        </Lane>

        {/* ---- GRAPHICS: every layer the compositor draws --------------- */}
        {/*
          * IT DREW ONE LAYER OF FOUR, AND READ IT OFF THE SETTINGS.
          *   [brief point 7, D-19, C-40, C-44, C-47]
          *
          * > *"You shouldn't build Slide graphics / Lower thirds /
          * > Channel bug / NEXT graphic / Programme title as five
          * > unrelated features."*
          *
          * They never were five features. `marksFor` has computed the
          * bug, the LIVE lamp, the lower third and NEXT from one list
          * since the identity was written, and the compositor draws
          * that list. This lane drew lower thirds, from the identity
          * DOCUMENT — because `marksFor` needs three inputs that
          * lived inside the playout worker as private functions, so
          * the page could not call it at all.
          *
          * So the lane did not disagree with the compositor. It had
          * never spoken to it. A row per layer now, from the same
          * function, sampled at the instants its answer can change.
          *
          * A SLIDE IS NOT ON THIS LANE AND SHOULD NOT BE. A slide is
          * a `media` source with `form: 'image'` — it IS the
          * programme, full frame, and it appears in PROGRAM where
          * every other source does. Drawing it here would claim it
          * composites OVER a picture when it is the picture. [§3]
          */}
        <Lane name="Graphics" height={GRAPHICS_TOP + LAYERS.length * GRAPHICS_PITCH}
              rows={LAYERS.map((layer, row) => ({
                name: layerSays(layer),
                lit: graphics.some((event) => event.kind === layer),
                top: GRAPHICS_TOP + row * GRAPHICS_PITCH,
                height: GRAPHICS_PITCH - 2,
              }))}>
          {LAYERS.map((layer, row) => {
            const on = graphics.filter((event) => event.kind === layer);
            return (
              <div key={layer} data-testid="graphics-row" data-layer={layer}
                   style={{
                     position: 'absolute', left: 0, right: 0,
                     top: GRAPHICS_TOP + row * GRAPHICS_PITCH,
                     height: GRAPHICS_PITCH - 2,
                   }}>
                {/*
                  * A ROW IS DRAWN EVEN WHEN IT IS EMPTY, which is the
                  * lane saying "this layer exists and is not on"
                  * rather than the layer not existing. An operator
                  * looking for the LIVE lamp needs to find the row
                  * and see it dark — a missing row reads as a
                  * capability the channel does not have.
                  */}
                <div aria-hidden="true" style={{
                  position: 'absolute', inset: 0, borderRadius: 2,
                  background: 'rgba(125,86,196,0.06)',
                  border: '1px dashed #3a2f55',
                }} />
                {on.map((event) => (
                  <div key={`${layer}${event.fromMs}`} data-testid="graphics-cell"
                       data-layer={layer}
                       title={`${layerSays(layer)} — ${event.says}`}
                       style={{
                         position: 'absolute', top: 0, bottom: 0,
                         left: across(event.fromMs),
                         width: `calc(${across(event.toMs)} - `
                           + `${across(event.fromMs)})`,
                         minWidth: 3, borderRadius: 2, padding: '0 4px',
                         fontSize: 'var(--text-2xs)', lineHeight: '11px',
                         overflow: 'hidden', whiteSpace: 'nowrap',
                         textOverflow: 'ellipsis',
                         /* The lamp is a statement of fact about the
                            transmission, not station branding, so it is
                            the live red every other such mark uses. */
                         background: layer === 'lamp'
                           ? 'rgba(192,57,43,0.42)' : 'rgba(125,86,196,0.45)',
                         border: `1px solid ${layer === 'lamp'
                           ? 'var(--state-live-dim)' : '#8a6fd0'}`,
                       }}>
                    {fitsText(event.toMs - event.fromMs,
                      windowTo - windowFrom, stripWidth, 2)
                      ? `${layerSays(layer)}: ${event.says}`
                      : fitsText(event.toMs - event.fromMs,
                        windowTo - windowFrom, stripWidth)
                        ? layerSays(layer) : ''}
                  </div>
                ))}
              </div>
            );
          })}
        </Lane>

        {/* ---- AUDIO: the master bus, as runs --------------------------- */}
        {/*
          * IT WAS A LABEL PRETENDING TO BE A TRACK.  [§11, D-21, C-46]
          *
          * One bar the width of the window, reading "Master Audio
          * (Program)", drawn identically over a programme, over a hole
          * and over a dead reference — and noted "always on", which is
          * the claim it had no business making. The engine puts
          * `anullsrc` on the wire for a hole and for a missing render
          * alike (`black()`, §11): those four seconds are silence, and
          * this was the one lane on the page asserting the opposite.
          *
          * A track that is wrong about silence is worse than no track,
          * because it is the lane somebody checks when a viewer says
          * they heard nothing. So it was drawn from the same walk as
          * every other lane, and it said "Silence" exactly where the
          * engine makes silence and nowhere else.
          *
          * AND THEN IT SAID "PROGRAMME" TWELVE TIMES.  [C-48, D-04]
          *
          * Drawn from the same walk means drawn in PROGRAM's own
          * boundaries — a cell per programme, the same word in each,
          * directly under the lane those boundaries belong to. Correct,
          * and a row of the screen spent saying nothing.
          *
          * SOUND IS CONTINUOUS AND A SCHEDULE IS NOT. A boundary
          * between two programmes is not a boundary in the audio, and
          * what an operator asks of a master bus is where the sound
          * STOPS. Drawn as runs, a window of twelve programmes is one
          * bar reading "Programme", and the four seconds of silence the
          * engine makes for a hole is a visible BREAK in it rather than
          * one grey cell among twelve. The lane is unchanged about what
          * it claims; only its boundaries are its own now.
          */}
        <Lane name="Audio" note={soundSays(sound)} height={34}>
          {sound.map((run) => {
            const heard = run.sound === 'programme';
            return (
              <div
                key={`a${run.fromMs}`} data-testid="audio-cell"
                data-sound={run.sound} data-stretches={run.stretches}
                title={heard
                  ? `Programme audio — unbroken for ${offsetLabel(run.toMs - run.fromMs)}`
                  : run.sound === 'fault'
                    ? 'Silence — this slot has no media behind it'
                    : 'Silence — the engine generates it for this stretch'}
                style={{
                  position: 'absolute', top: 3, bottom: 3,
                  left: across(run.fromMs),
                  width: `calc(${across(run.toMs)} - ${across(run.fromMs)})`,
                  minWidth: 3, borderRadius: 2, padding: '0 6px',
                  fontSize: 'var(--text-2xs)', lineHeight: '22px',
                  overflow: 'hidden', whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  background: heard ? 'rgba(42,140,140,0.20)'
                    : run.sound === 'fault' ? 'rgba(200,60,50,0.18)' : 'transparent',
                  backgroundImage: heard ? 'none'
                    : 'repeating-linear-gradient(135deg, '
                      + 'rgba(255,255,255,0.06) 0 5px, transparent 5px 11px)',
                  border: heard ? '1px solid #2f7f7f'
                    : `1px dashed ${run.sound === 'fault'
                      ? 'var(--state-live-dim)' : 'var(--line)'}`,
                  color: heard ? '#8fd2d2'
                    : run.sound === 'fault' ? 'var(--state-live)' : 'var(--ink-400)',
                }}
              >
                {/*
                  * A WAVEFORM IS NOT DRAWN HERE and the lane does not
                  * pretend to one: nothing on this page has decoded the
                  * media, and a generated squiggle would be a picture of
                  * audio that was never measured. The lane says which
                  * stretches carry programme sound and which are the
                  * engine's own silence, which is the question a
                  * schedule can answer honestly.
                  */}
                {fitsText(run.toMs - run.fromMs,
                  windowTo - windowFrom, stripWidth)
                  ? (heard ? 'Programme'
                    : run.sound === 'fault' ? 'Silence · no media' : 'Silence') : ''}
              </div>
            );
          })}
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
  camera, mixer, levels, onAir, armed, encoder,
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
  encoder: {
    running: boolean; sent: number; dropped: number; retried: number;
    why: string | null; rate: number; error: string | null;
  };
}) {
  const feed = mixer ?? camera;
  /*
   * AND WHETHER THE PICTURE IS ANY GOOD.  [§23, C-45]
   *
   * This panel has always reported the device, the preset and the
   * feed's bitrate — everything about the TRANSPORT and nothing
   * about the PICTURE. Read from the feed that is actually going
   * out, because a dark camera composited onto a bright set is not
   * a dark picture, and judging the camera would be judging
   * something nobody sees. [D-22]
   */
  const shot = useShot(feed);
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

      {/*
        * WHAT IS WRONG WITH THE PICTURE, if anything.  [§23, C-45]
        *
        * Above the feed's own health rather than below it, because
        * a bitrate is a number an operator checks and a flat room
        * is a thing they can still fix in the minute before they
        * go on air.
        *
        * Nothing at all when the shot is fine: a camera panel that
        * always has something to say is a panel nobody reads, which
        * is the brief's own point 10 pointed at the control room.
        */}
      {shot.length > 0 && (
        <ul data-testid="shot-notes" style={{
          margin: '8px 0 0', padding: '7px 9px', listStyle: 'none',
          display: 'flex', flexDirection: 'column', gap: 4,
          borderRadius: 7, borderLeft: '2px solid var(--state-armed)',
          background: 'var(--panel-2)', color: 'var(--muted)',
          fontSize: 'var(--text-2xs)', lineHeight: 1.45,
        }}>
          {shot.map((one) => (
            <li key={one.code} data-shot={one.code}>{one.says}</li>
          ))}
        </ul>
      )}

      <div data-testid="feed-health" style={{
        fontSize: 'var(--text-xs)', padding: '6px 8px', borderRadius: 7, marginTop: 8,
        background: 'var(--panel-2)', border: '1px solid var(--line)',
      }}>
        <div className="row" style={{ gap: 8 }}>
          <Dot on colour={encoder.running && encoder.dropped === 0 ? 'var(--state-ok)'
            : encoder.running ? 'var(--state-warn)' : 'var(--state-live-dim)'} />
          {/*
            * RETRIED IS NOT LOST, AND SAYING SO IS THE POINT.
            *
            * A chunk that needed a second attempt and got there
            * cost the viewer nothing; one that did not is two
            * seconds the broadcast is permanently further behind.
            * Printing them as one number would have the presenter
            * either ignoring a real problem or chasing one that
            * the retry already solved. And when something IS
            * lost, the reason goes beside the count, because "12
            * lost" and "12 lost — the channel answered 500" send
            * two different people to look. [D-21]
            */}
          <span className="grow muted" data-testid="feed-note">
            {encoder.running
              ? `Feed · ${encoder.sent} sent`
                + (encoder.retried ? ` · ${encoder.retried} resent` : '')
                + (encoder.dropped ? ` · ${encoder.dropped} lost` : '')
                + (encoder.dropped && encoder.why ? ` — ${encoder.why}` : '')
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
  channel, picked, onAir, nameOf, onRollIn, onRollOut, onShow, share, library,
}: {
  channel: Channel;
  picked: LibraryItem | null;
  /** The whole library, so a picture slide can name one of its images. */
  library: LibraryItem[];
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
        /*
         * THE LIBRARY'S IMAGES, from the list the studio already holds.
         * A picture slide NAMES a library asset rather than uploading
         * one — the route's own rule — so the chooser is a view of what
         * is already there and not a second media store. [§3, D-18]
         */
        pictures={library
          .filter((item) => item.source.kind === 'media'
            && item.source.form === 'image')
          .map((item) => ({
            assetId: (item.source as { assetId: string }).assetId,
            title: item.title,
          }))}
        ink={channel.identity?.ink}
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
      <Hatch says={source.kind === 'live' ? 'LIVE' : 'EVENT'} />
    );
  }
  if (source.kind === 'media' && source.form === 'image') {
    return (
      <img alt="" src={url} data-testid="thumb"
           style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    );
  }
  /*
   * AND IF THIS BROWSER CANNOT DRAW IT, SAY SO.  [D-21, U-19, D-04]
   *
   * The library takes the containers the world's phones record —
   * `.3gp`, `.mkv`, `.avi`, `.mpg`, `.amr` — because the playout
   * engine is ffmpeg and reads all of them. A `<video>` element is
   * not ffmpeg, and most of them it will not decode. Nor will it
   * decode `.mov`, which this library has accepted since long
   * before the rest: a Chromium built without proprietary codecs
   * declines QuickTime, which is the same reason the take route
   * keeps a VP9 proxy beside every mezzanine.
   *
   * SO THE TILE WAS A BLACK RECTANGLE, which is what a broken
   * upload looks like. The file is there, it is correct, and it
   * will go to air — the only thing that cannot happen is this
   * browser drawing a frame of it, and that is a sentence rather
   * than a void. The element's own `error` is the evidence: no
   * guess about which container this browser likes, asked of the
   * one party that knows. [U-02]
   */
  return <MovingThumb url={url} />;
}

/**
 * The "nothing to show here" slab, drawn once.
 *
 * A FLAT SLAB WITH A WORD ON IT IS WHAT A BROKEN IMAGE LOOKS LIKE;
 * fine diagonal hatching is what an EMPTY SLOT looks like, and
 * broadcast tools have used exactly that to mean "no signal here"
 * for as long as there have been racks.
 *
 * The hatch is drawn in CSS at 4px, faint enough to read as
 * texture rather than as a pattern demanding attention, and the
 * word sits on top of it saying which kind of nothing this is.
 */
function Hatch({ says }: { says: string }) {
  return (
    <span aria-hidden="true" data-testid="thumb-hatch" style={{
      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
      fontSize: 'var(--text-2xs)',
      fontWeight: 'var(--weight-bold)', letterSpacing: '0.08em',
      color: 'var(--ink-400)',
      background: 'repeating-linear-gradient(45deg,'
        + ' var(--ink-800) 0 3px, var(--ink-750) 3px 6px)',
    }}>{says}</span>
  );
}

/** A poster frame, or the honest absence of one. [Thumb] */
function MovingThumb({ url }: { url: string }) {
  const [undrawable, setUndrawable] = useState(false);
  if (undrawable) return <Hatch says="NO PREVIEW" />;
  return (
    <video
      data-testid="thumb" src={`${url}#t=1`} preload="metadata" muted playsInline
      onError={() => setUndrawable(true)}
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

/**
 * When, and for how long.
 *
 * The time is offered rather than typed: a scheduler works in the next slot,
 * the top of the next hour, or tomorrow at the same time, and a text field
 * asking for an ISO instant is a text field somebody gets a zone wrong in.
 */
function Scheduler({
  now, ownMs, onSchedule, onRotate,
}: {
  now: number;
  /** How long the picked item actually is, when anything knows. */
  ownMs?: number | undefined;
  onSchedule: (
    startsAt: string, durationMs: number | undefined, loop: boolean) => void;
  onRotate: (durationMs: number | undefined, loop: boolean) => void;
}) {
  /*
   * `null` IS "AS LONG AS IT IS", AND IT IS THE DEFAULT.
   *   [route.ts `lengthFor`, channel.ts `slotLength`]
   *
   * This opened on sixty. Six buttons marked `5 15 30 60 90 120
   * min` over a file whose length the panel was ALREADY SHOWING
   * two rows up, and whichever one was lit went into the document
   * as the truth about the programme. That is how eight items of
   * five seconds came to be scheduled for four to twenty-five
   * minutes — and the operator was then told to go and correct
   * them one at a time.
   *
   * So the row opens on the item's own length and the minutes are
   * the override. Choosing one is choosing a slot LONGER than the
   * thing in it, which is a real intention — a bed under a block,
   * a trailer in a half-hour — so that is the only case where the
   * repeat checkbox appears at all. When the slot IS the media
   * there is nothing to repeat, and nothing to ask.
   */
  const [minutes, setMinutes] = useState<number | null>(ownMs ? null : 60);
  const [loop, setLoop] = useState(false);
  const topOfHour = Math.ceil(now / HOUR) * HOUR;
  const chosenMs = minutes === null ? undefined : minutes * MINUTE;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
        {ownMs !== undefined && (
          <button
            type="button" data-testid="slot-own-length"
            data-chosen={minutes === null ? 'true' : 'false'}
            aria-pressed={minutes === null}
            onClick={() => { setMinutes(null); setLoop(false); }}
            className={`ctl${minutes === null ? ' is-on' : ''}`}
            style={{
              gridColumn: '1 / -1', padding: '5px 4px',
              fontSize: 'var(--text-2xs)',
            }}
          >Its own length {'\u2014'} {hms(ownMs)}</button>
        )}
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
      {minutes !== null && (
        <label className="row muted"
               style={{ gap: 6, fontSize: 'var(--text-xs)', margin: 0 }}>
          <input type="checkbox" data-testid="loop-it" checked={loop}
                 onChange={(event) => setLoop(event.target.checked)} />
          Play it again until the slot is over
        </label>
      )}
      {/*
        * TWO WAYS ON, and the loop is the first because it is the one that
        * keeps the channel online. Adding to the loop asks for no time at
        * all: the entry's place is the sum of what comes before it, and the
        * channel plays round and round forever. A fixed time is the second,
        * for the thing that has to be at nine. [§2, §4]
        */}
      <button className="ctl" data-testid="add-to-loop"
              onClick={() => onRotate(chosenMs, loop)}
              style={{ width: '100%', padding: '6px 10px' }}>
        Add to the loop
      </button>
      <div className="row" style={{ gap: 5 }}>
        <button className="small" data-testid="schedule-next-hour"
                onClick={() => onSchedule(
                  new Date(topOfHour).toISOString(), chosenMs, loop)}
                style={{ flex: '1 1 0', padding: '6px 8px' }}>
          At {new Date(topOfHour).toLocaleTimeString('en-GB', {
            hour: '2-digit', minute: '2-digit',
          })}
        </button>
        <button className="small" data-testid="schedule-tomorrow"
                onClick={() => onSchedule(
                  new Date(topOfHour + DAY).toISOString(), chosenMs, loop)}
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

/**
 * Where a stream key is typed, and the only place.  [§15, D-21, C-29]
 *
 *     server  rtmp://a.rtmp.youtube.com/live2
 *     key     ••••••••  (set)                       Replace   Clear
 *
 * THE KEY IS WRITE-ONLY, which is the whole design of this control.
 * There is no route that returns one and nothing here ever holds one
 * after it is sent: the field is cleared on submit and the row
 * afterwards says only that a key EXISTS. A product that can show you
 * your own stream key can show it to whoever is standing behind you,
 * and there is nothing you can do with it on screen that you cannot
 * do by pasting a new one.
 *
 * THE SERVER IS NOT A SECRET and is shown, because an operator
 * checking which of four destinations points at YouTube needs to see
 * that, and the address alone lets nobody broadcast as anybody.
 *
 * AND IT IS THE DOOR FOR THREE PLATFORMS. YouTube, Facebook and X all
 * take a server URL and a key today; their own connectors wait on an
 * app review, this does not. [ONLINE-TV-AUDIT §4.1]
 */
function RtmpKey({
  destination, server, hasKey, onSet, onClear,
}: {
  destination: Destination;
  server?: string;
  hasKey: boolean;
  onSet: (server: string, key: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [where, setWhere] = useState(server ?? '');
  const [key, setKey] = useState('');

  if (!open) {
    return (
      <div className="row" style={{
        gap: 6, flexWrap: 'nowrap', padding: '0 7px 2px',
        fontSize: 'var(--text-2xs)',
      }}>
        <span className="muted grow" style={{
          minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {hasKey ? `${server ?? 'Server set'} · key set`
            : 'No server or key yet'}
        </span>
        <button
          type="button" className="small" data-testid="set-rtmp-key"
          onClick={() => { setWhere(server ?? ''); setKey(''); setOpen(true); }}
          style={{ fontSize: 'var(--text-2xs)', padding: '2px 7px' }}
        >{hasKey ? 'Replace' : 'Set key'}</button>
        {hasKey && (
          <button
            type="button" className="small" data-testid="clear-rtmp-key"
            onClick={onClear}
            style={{
              fontSize: 'var(--text-2xs)', padding: '2px 7px',
              color: 'var(--bad)',
            }}
          >Clear</button>
        )}
      </div>
    );
  }

  const ready = where.trim().length > 0 && key.trim().length > 0;
  return (
    <div data-testid="rtmp-key-form" style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '6px 7px 8px',
      borderRadius: 'var(--radius-control)',
      background: 'var(--panel-2)', border: '1px solid var(--line)',
    }}>
      <input
        data-testid="rtmp-server" value={where} spellCheck={false}
        onChange={(event) => setWhere(event.target.value)}
        placeholder={`Server URL — e.g. rtmp://a.rtmp.youtube.com/live2`}
        style={{ fontSize: 'var(--text-xs)', padding: '5px 8px' }}
      />
      <input
        data-testid="rtmp-key" value={key} spellCheck={false}
        /*
         * A PASSWORD FIELD, because the thing being typed is one:
         * it keeps the key off the screen in a room with a camera in
         * it, and out of the browser's own form history.
         */
        type="password" autoComplete="off"
        onChange={(event) => setKey(event.target.value)}
        placeholder={hasKey ? 'New stream key' : 'Stream key'}
        style={{ fontSize: 'var(--text-xs)', padding: '5px 8px' }}
      />
      <div className="row" style={{ gap: 5, flexWrap: 'nowrap' }}>
        <span className="muted grow" style={{ fontSize: 'var(--text-2xs)' }}>
          {destination.shape === '16:9'
            ? 'Sent as a copy of the channel — no re-encode.'
            : `A ${destination.shape} destination needs its own encode, `
              + 'which is not built yet.'}
        </span>
        <button
          type="button" className="small" data-testid="cancel-rtmp-key"
          onClick={() => { setKey(''); setOpen(false); }}
          style={{ fontSize: 'var(--text-2xs)', padding: '3px 8px' }}
        >Cancel</button>
        <button
          type="button" className="small" data-testid="save-rtmp-key"
          disabled={!ready}
          onClick={() => {
            onSet(where.trim(), key.trim());
            /* Not kept for a moment longer than it takes to send. */
            setKey('');
            setOpen(false);
          }}
          style={{
            fontSize: 'var(--text-2xs)', padding: '3px 8px',
            border: '1px solid var(--accent)',
            background: ready ? 'var(--accent-wash)' : 'transparent',
          }}
        >Save</button>
      </div>
    </div>
  );
}

/**
 * What the world calls this channel.  [§2, §3, TV-NETWORK N-1]
 *
 * SEPARATE FROM GRAPHICS BECAUSE THE MODEL SEPARATES THEM. The bug,
 * the lamp and the lower third are composited onto the picture;
 * this is the address a stranger types, the callsign in a listing
 * and the shelf it stands on. One is seen by somebody already
 * watching, the other by somebody deciding whether to.
 *
 * EVERY FIELD SAVES ON BLUR AND NONE OF THEM IS REQUIRED. A channel
 * with a name already has everything it needs to be listed — the
 * address is suggested from the name the first time this is opened
 * — and the rest is a station filling in its own card over time.
 */
function ListingTab({ channel, onStation }: {
  channel: Channel;
  onStation: (station: Record<string, unknown>) => void;
}) {
  const station = channel.station;
  const listed = channel.publication
    && !channel.publication.unpublishedAt
    && channel.publication.listed !== false;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
        How this channel appears to somebody who has not found it yet.
      </p>

      <label className="small" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
        Web address
        <input className="small" data-testid="station-slug"
               defaultValue={station?.slug ?? ''}
               placeholder={channel.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
               onBlur={(event) => onStation({ slug: event.target.value })} />
      </label>
      {station?.slug && (
        <p className="small muted" data-testid="station-url"
           style={{ margin: 0, fontSize: 'var(--text-2xs)' }}>
          /tv/channels/{station.slug}
        </p>
      )}

      <label className="small" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
        Callsign
        <input className="small" data-testid="station-callsign-field"
               defaultValue={station?.callsign ?? ''} placeholder="RDTV"
               onBlur={(event) => onStation({ callsign: event.target.value })} />
      </label>

      <label className="small" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
        Kind
        <select className="small" data-testid="station-genre"
                defaultValue={station?.genre ?? ''}
                onChange={(event) => onStation({ genre: event.target.value || undefined })}>
          <option value="">Not said</option>
          {GENRES.map((genre) => (
            <option key={genre} value={genre}
                    style={{ textTransform: 'capitalize' }}>{genre}</option>
          ))}
        </select>
      </label>

      <div className="row" style={{ gap: 8 }}>
        <label className="small grow" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
          Language
          <input className="small" data-testid="station-language"
                 defaultValue={station?.language ?? ''} placeholder="en"
                 onBlur={(event) => onStation({ language: event.target.value })} />
        </label>
        <label className="small grow" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
          Country
          <input className="small" data-testid="station-country"
                 defaultValue={station?.country ?? ''} placeholder="CM"
                 onBlur={(event) => onStation({ country: event.target.value })} />
        </label>
      </div>

      <label className="small" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
        About
        <textarea className="small" rows={3} data-testid="station-description"
                  defaultValue={station?.description ?? ''}
                  placeholder="One or two sentences for the directory."
                  onBlur={(event) => onStation({ description: event.target.value })} />
      </label>

      {/*
        * THE CAPTIONS, WHICH ARE A SWITCH AND NOT A SETTING.
        *   [§17, N-10]
        *
        * There is nothing to configure: the words come from the
        * transcript of whatever is scheduled, through the same
        * `buildVtt` every export uses, and the only question is
        * whether they go on the wire. A panel of caption
        * options here would be five controls over one boolean.
        *
        * AND IT COSTS NOTHING, unlike the audio renditions. A
        * product that charged a station for its deaf audience
        * would be charging for access to itself, so there is no
        * extra to check and no upsell beside the box.
        *
        * WHAT IT SAYS UNDERNEATH IS WHAT IT CANNOT DO. Only a
        * programme that came out of a BalanceVid studio has a
        * transcript; a film somebody uploaded to the library
        * has none, and a live feed has not been said yet. An
        * owner who ticked this and saw captions on half their
        * day would otherwise think it was broken. [D-21, U-19]
        */}
      <label className="row small" data-testid="station-subtitles"
             style={{ gap: 8, margin: '4px 0 0', fontSize: 'var(--text-xs)',
                      alignItems: 'center' }}>
        <input type="checkbox" checked={station?.subtitles === true}
               onChange={(event) =>
                 onStation({ subtitles: event.target.checked })} />
        Broadcast captions
      </label>
      <p className="small muted" data-testid="station-subtitles-how"
         style={{ margin: 0, fontSize: 'var(--text-2xs)', lineHeight: 1.5 }}>
        Programmes made in a BalanceVid studio are already transcribed, and
        their captions go out as a track a viewer can turn on. An uploaded
        film and a live feed have no transcript, so the caption track runs
        empty while one of those is on air.
      </p>

      {/*
        * THE STATION'S OWN FRONT DOOR.  [N-8]
        *
        * Below the address above and not beside it, because the
        * order on this desk is the order of the identities: the
        * slug is what the directory links to and what the
        * canonical tag points at, and this is a second door the
        * owner also owns. The brief: "The channel owner can
        * eventually have a custom domain, but BalanceVid provides
        * the canonical public channel identity."
        *
        * AND THE INSTRUCTION IS NEXT TO THE FIELD, because a
        * domain box with nothing beside it is a box that does
        * nothing: the owner has to point DNS at this installation
        * and somebody has to issue a certificate, and neither of
        * those happens because a value was typed here.
        */}
      <label className="small" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
        Own domain
        <input className="small" data-testid="station-domain"
               defaultValue={station?.domain ?? ''}
               placeholder="tv.yourstation.com"
               onBlur={(event) => onStation({ domain: event.target.value })} />
      </label>
      <p className="small muted" data-testid="station-domain-how"
         style={{ margin: 0, fontSize: 'var(--text-2xs)', lineHeight: 1.5 }}>
        {station?.domain
          ? <>Point <code>{station.domain}</code> at this server with a CNAME or
            an A record, and give it a certificate there. Until both are done
            the address will not answer — nothing on this page can do it
            for you.</>
          : <>A host you own, which will show this station and nothing else.
            The directory keeps <code>/tv/channels/{station?.slug ?? '…'}</code> as
            the canonical address.</>}
      </p>

      {/*
        * AND WHETHER IT IS FINDABLE AT ALL, said here rather than
        * assumed. Being listed is `publication.listed`, which is a
        * different decision from being watchable and has been in
        * the document for a long time — this is the first surface
        * that tells an owner which way theirs is set. [§10]
        */}
      <p className="small muted" data-testid="station-standing"
         style={{ margin: '4px 0 0', fontSize: 'var(--text-2xs)' }}>
        {!channel.publication || channel.publication.unpublishedAt
          ? 'Not published, so it is not in the directory.'
          : listed
            ? 'Listed in BalanceVid TV.'
            : 'Published but unlisted — reachable by its address only.'}
      </p>
    </div>
  );
}
