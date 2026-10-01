'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TAKE_ACCENT_FALLBACK } from '../../../src/domain/performance.js';
import Icon from '../../Icon.js';
import type { MasterClass, Performance, SoundLayer } from '../../../src/domain/performance.js';
import {
  MASTER_CLASSES, SPACES, effectiveOffset, isFootage, orderedScenes,
  renderProblems, sceneAt, songSections, soundOnSong,
} from '../../../src/domain/performance.js';
import { EFFECT_LOOKS, SPACE_LOOKS } from '../../../src/domain/environment.js';
import {
  CLEANUPS, NO_CLEANUP, adviseCleanup,
} from '../../../src/domain/cleanup.js';
import { STABILIZERS } from '../../../src/domain/stabilize.js';
import {
  proposeFirstCut, worthProposing,
} from '../../../src/domain/takeRanking.js';
import { useConfirm } from '../../Confirm.js';
import { useMenu, type MenuEntry } from '../../Menu.js';
import type { TakeId } from '../../../src/domain/document.js';
import { nudgeSays } from './takeNudge.js';
import { takeMenuItems } from './takeMenu.js';
import { songMenuItems } from './songMenu.js';
import { SOUND_TRACKS, soundMenuItems } from './soundMenu.js';
import { pickSound } from './soundUpload.js';
import { soundSink } from './soundSink.js';
import { useMasterRecording } from './useMasterRecording.js';

/**
 * The lead-in before a voice-over starts.  [TIMELINE B6i; S-10]
 *
 * Shorter than the one a take gets. A performer needs bars to come in
 * on; somebody speaking over a song needs long enough to hear where
 * they are, and four seconds of waiting to say one sentence is four
 * seconds of the author wondering whether the button worked.
 */
const VOICE_COUNT_IN_SECONDS = 2;

/**
 * A colour per audio track, so a lane is identifiable at a glance.
 *
 * Deliberately away from the takes' accents, which are assigned from a
 * palette: a sound is not a take and the timeline should not have to
 * be read twice to tell which is which.
 */
const SOUND_ACCENT: Record<string, string> = {
  voice: '#4f9d8a', effect: '#c08a3e', ambience: '#5b7fb5', music: '#8a6fd0',
};
import ReframeBox from './ReframeBox.js';
import ClipInspector, { type Selection } from './ClipInspector.js';
import { LAYOUTS, takeSlots } from '../../../src/domain/presentation.js';
import {
  BEATS_USABLE_CONFIDENCE, beatPositions, snapToBeat,
} from '../../../src/domain/beats.js';
import { TRANSITIONS } from '../../../src/domain/transitions.js';
import {
  HOUSE_SAMPLE_RATE, formatMasterPosition, parseMasterPosition,
} from '../../../src/domain/time.js';
import { usePerformancePlayer } from './usePerformancePlayer.js';

/**
 * Directing the music video.  [Doctrine STUDIO-TWO §2, §5, §6, §7, §8, §15]
 *
 * "You press 1 → 3 → 2 → 4 → 2 → 1. BalanceVid records those decisions onto
 *  the master timeline. So you are essentially directing the music video
 *  live."
 *
 * ONE ARTEFACT, TWO WAYS IN. §7 is pressing keys while the song plays; §8 is
 * dragging the boundaries afterwards. Both write SCENES, which is why they can
 * never disagree — there is no switching log to reconcile with an edit list.
 * §15's named sections are the same object again, with a label on.
 *
 * The song never moves. Everything here decides what occupies each part of it.
 */

/**
 * A swatch per space, taken from the look the renderer actually draws.
 *
 * Not a photograph and not a guess: the spaces are DRAWN (S-6), so the tile
 * shows the gradient the export will contain. A stock photograph of a beach
 * on a tile whose render is a drawn sky would be the product promising
 * something it does not make.
 */
const SPACE_SWATCHES: Record<string, string> = Object.fromEntries(
  Object.values(SPACE_LOOKS).map((look) => [
    look.id,
    `linear-gradient(180deg, #${look.top.replace('0x', '')}, #${look.bottom.replace('0x', '')})`,
  ]),
);

/**
 * Whose footage this is, in the author's language.  [INV-15, §14]
 *
 * The same four the master's rights use and deliberately the same words: a
 * person answering this question about a clip is answering the question they
 * already answered about the song, and two vocabularies for one question is
 * how one of them gets answered carelessly.
 */
const FOOTAGE_RIGHTS: Record<MasterClass, string> = {
  own: 'I filmed it',
  licensed: 'Licensed',
  open: 'Openly licensed',
  third_party: "Somebody else's",
};

/**
 * The effects, in the words that fit a tile.  [benchmark]
 *
 * Same reason the arrangements are shortened: five tiles across a 320-pixel
 * panel is sixty pixels each, and "Monochrome" set in that is two lines of
 * seven-point type or a word with its end cut off. The look keeps its real
 * name, which is what the hint and the document use.
 */
const EFFECT_TILES: Record<string, string> = {
  monochrome: 'Mono',
};

/**
 * The arrangements, in the words a vision mixer uses.  [§5, §6]
 *
 * Short on purpose: a square tile is as wide as it is tall, and "One large,
 * two small" set across five columns wraps to three lines of six-point type.
 * The full label is on the tile's title, so nothing is lost — the layout
 * table keeps its own names, which are the ones the doctrine and the renderer
 * use, and this is only what fits on a button.
 */
const ARRANGEMENT_TILES: Record<string, string> = {
  performance_full: 'Full',
  performance_half: 'Half',
  performance_thirds: 'Thirds',
  performance_quad: 'Quad',
  performance_six: 'Six',
  performance_pip: 'PiP',
  performance_focus: 'Focus',
  performance_lead: 'Lead',
  performance_beside_master: 'Master',
};

/** The arrangements an author can reach with a key, in the order they appear. */
/**
 * EIGHT, which is four across and two down.
 *
 * `performance_half_stacked` is not among them and that is deliberate: it is
 * what Half BECOMES in a tall frame, not a separate thing to choose (U-22).
 * Offering both would put a decision in front of the author that the reframe
 * already makes correctly — and would make the ninth tile.
 *
 * `performance_beside_master` is a ninth only when the master brought a
 * picture to stand beside, which is the one case where there is something
 * else on screen to arrange. [§3, §5]
 */
const ARRANGEMENTS = [
  'performance_full', 'performance_half', 'performance_thirds',
  'performance_quad', 'performance_six', 'performance_pip',
  'performance_focus', 'performance_lead',
  'performance_beside_master',
] as const;

/**
 * A tile's diagram.  [benchmark]
 *
 * The benchmark's composition tiles show the ARRANGEMENT rather than naming
 * it, which is the right way round: "One large, two small" is a sentence you
 * have to parse and a picture of one large and two small is not. Drawn from
 * the layout's own rects, so a layout whose panels move takes its diagram
 * with it and a diagram can never disagree with what it renders.
 */
function LayoutGlyph({ layoutId }: { layoutId: string }) {
  const layout = LAYOUTS[layoutId];
  const panels = (layout?.layers ?? []).filter(
    (layer) => layer.source === 'take' || layer.source === 'master');
  return (
    <svg width="26" height="17" viewBox="0 0 26 17" aria-hidden="true">
      <rect x="0.5" y="0.5" width="25" height="16" rx="2"
            fill="none" stroke="currentColor" strokeOpacity="0.45" />
      {panels.map((panel, index) => (
        <rect
          key={index}
          x={1 + panel.rect.x * 24} y={1 + panel.rect.y * 15}
          width={Math.max(2, panel.rect.w * 24 - 1)}
          height={Math.max(2, panel.rect.h * 15 - 1)}
          rx="1" fill="currentColor"
          fillOpacity={panel.source === 'master' ? 0.35 : 0.9}
        />
      ))}
    </svg>
  );
}

/** The effects' glyphs: a mark each, in the benchmark's order. */
function EffectGlyph({ id }: { id: string }) {
  const common = {
    width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const, 'aria-hidden': true,
  };
  if (id === 'none') {
    return <svg {...common}><circle cx="8" cy="8" r="6" /><path d="M4 12 12 4" /></svg>;
  }
  if (id === 'lighting') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M13 3l-1.1 1.1M4.1 11.9 3 13" />
      </svg>
    );
  }
  if (id === 'colour') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6" />
        <path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (id === 'spotlight') {
    return (
      <svg {...common}><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2.2"
        fill="currentColor" stroke="none" /></svg>
    );
  }
  /* monochrome: a square half filled, which is what it does. */
  return (
    <svg {...common}>
      <rect x="2" y="2" width="12" height="12" rx="2" />
      <path d="M8 2v12" /><path d="M8 2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8z"
        fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Where one monitor goes in a wall of them.  [§6, §7]
 *
 * Squarest-first: the columns are the square root rounded up, so two takes
 * are side by side, four are a quad, five are a 3x2 with one space, and nine
 * are a 3x3. Deliberately NOT one of the layouts — a layout is a description
 * of an export, and this is a description of a desk. Reusing `performance_quad`
 * here would mean a fifth take either vanished or silently changed the
 * arrangement the author had chosen.
 */
function monitorRect(index: number, count: number): {
  x: number; y: number; w: number; h: number;
} {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / columns));
  const column = index % columns;
  const row = Math.floor(index / columns);
  /* The last row is centred when it is short, so a gap is not a hole at one
     edge — five monitors read as five, not as four and a missing one. */
  const onThisRow = Math.min(columns, count - row * columns);
  const indent = (columns - onThisRow) / 2;
  return {
    x: (column + indent) / columns, y: row / rows, w: 1 / columns, h: 1 / rows,
  };
}

export default function SwitchingStage({
  performance, onChanged, takesPanel, chosenTake, onChooseTake,
}: {
  performance: Performance;
  onChanged: (next: Performance) => void;
  /**
   * Which take the Background and Effects panels are editing.
   *
   * Held by the studio rather than here because the takes rail is what
   * points at it — clicking a row is the choosing — and the rail is rendered
   * up there. Two copies of "which take" is two answers to one question.
   */
  chosenTake?: string | null;
  onChooseTake?: (id: string) => void;
  /**
   * The takes rail, rendered by the studio and placed by this component.
   *
   * Passed in rather than built here because the rail is about the DOCUMENT
   * — recording, uploading, renaming, deleting — and this component is about
   * DIRECTING. But it has to sit in this grid, because the takes, the stage
   * and the composition panel are three columns of one row and the timeline
   * runs under all three. A rail in its own grid outside this one cannot
   * share a row with them.
   */
  /*
   * IT IS GIVEN THE TAKE MENU rather than building one. The rail is
   * rendered up in the studio, and the things a take menu needs — the
   * playhead, what a cut means, which take the stage is watching alone
   * — all live down here. Passing the list down is what lets the row
   * and the picture raise the SAME one. [D-19]
   */
  takesPanel?: (tools: {
    takeMenu: (take: Performance['takes'][number]) => MenuEntry[];
    /**
     * Where the song is NOW, asked rather than remembered.
     *
     * The rail needs it to offer "record from here" [TIMELINE B7], and
     * a number passed down would be a number ten times a second out of
     * date — the playhead is redrawn at that rate deliberately, and a
     * cut placed a tenth of a second late is three frames out.
     */
    at: () => number;
  }) => React.ReactNode;
}) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  /*
   * THE SAME MENU COMPONENT THE REST OF THE PRODUCT USES, a second
   * instance of it rather than a second implementation — what D-19 rules
   * out is four different objects called a menu, not two rows that each
   * know what can be done to them. [D-19]
   */
  const { menu, onRow } = useMenu();
  /*
   * WHAT IS SELECTED ON THE MASTER VIDEO LANE.  [MASTER-EDIT §2, §3]
   *
   * The lane drew a block per scene and answered no click. Everything a
   * person would want to do to one — swap its take, change its
   * arrangement, change how it arrives, give it its own sound — existed
   * as an operation and was reachable from four other places, none of them
   * the block. Selecting a thing and being shown what it is, is how every
   * editor has worked since they had mice.
   */
  const [selection, setSelection] = useState<Selection | null>(null);
  /*
   * HOW FAR BACK THE DOCUMENT CAN GO.  [MASTER-EDIT §12 P1]
   *
   * Asked of the server rather than counted here: the history is versions
   * on disk, and a page that kept its own tally would disagree with them
   * the first time two tabs were open on one performance.
   */
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [arrangement, setArrangement] = useState<string>('performance_full');
  const [pending, setPending] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  /*
   * Measuring is a pass over the media and can take a second or two, which
   * is long enough that a control giving no sign of life reads as broken.
   */
  const [matching, setMatching] = useState(false);
  const [matchSaid, setMatchSaid] = useState<string | null>(null);
  /* A pass over the whole take, so the control has to show it is alive. */
  const [steadying, setSteadying] = useState(false);
  /** Snapping is OFF until the author turns it on, which is the acceptance. */
  const [snap, setSnap] = useState(false);
  const [snapped, setSnapped] = useState<number | null>(null);
  /** The transitions row is asked for from the transport, not always on. */
  const [showTransitions, setShowTransitions] = useState(false);
  /** True between the pointer going down on the ruler and coming up. */
  const [scrubbing, setScrubbing] = useState(false);
  /**
   * The take whose crop is being drawn, if any.
   *
   * A MODE, AND THE ONLY ONE ON THIS STAGE — which is a cost, so it is
   * worth saying why. Every other control here is a press with an
   * immediate result; a crop is a rectangle somebody draws, and while
   * they are drawing it the picture cannot also be a cut button. It is
   * per take, it is entered from that take's own menu, and the tool
   * says how to leave it. [U-04]
   */
  const [reframing, setReframing] = useState<string | null>(null);
  /**
   * Each take's own frame shape, as its media reports it.
   *
   * ASKED OF THE PICTURE, NOT ASSUMED. Footage brought in from a phone
   * is as likely to be 9:16 as 16:9, and a crop box built on a guessed
   * shape would sit over the letterbox bars rather than the picture.
   * `videoHeight / videoWidth` is the only thing that knows.
   */
  const [aspects, setAspects] = useState<Record<string, number>>({});
  /** The lane column, so an x on the screen can be turned into a sample. */
  const lanes = useRef<HTMLDivElement | null>(null);
  /**
   * How much of the song is on screen, and from where.  [TIMELINE B3a]
   *
   * "Zoom the timeline." A four-minute song across a thousand pixels is
   * a quarter of a second per pixel: fine for arranging scenes, useless
   * for the thing this studio is actually for, which is putting a cut
   * on a beat. At 8× a pixel is thirty milliseconds — about a frame.
   *
   * `at` is the leftmost visible moment as a FRACTION of the song, not
   * a pixel offset, so it survives the window being resized and means
   * the same thing on a phone and a desk.
   *
   * ZOOM IS A VIEW AND NOTHING ELSE. It is not in the document, it does
   * not change a cut, and a render made while zoomed in is identical to
   * one made zoomed out. That is why it is a piece of component state
   * and not an edit. [U-08]
   */
  const [zoom, setZoom] = useState(1);
  const [at, setAt] = useState(0);
  /**
   * The take being dragged along its lane, and how far, in samples.
   *
   * Local until the pointer comes up: the block follows the pointer at
   * sixty frames a second and the DOCUMENT is written once, because a
   * version per pointer move is sixty presses of undo to get back.
   */
  const [dragging, setDragging] = useState<
    { takeId: string; at: number; by: number } | null>(null);
  /* The same, for a sound: held locally, written once on release. */
  const [soundDrag, setSoundDrag] = useState<
    { soundId: string; at: number; by: number } | null>(null);
  /** The sound being measured, so the wait is visible. [B6h, U-19] */
  const [adding, setAdding] = useState<string | null>(null);

  const ordered = orderedScenes(performance);
  /*
   * WHERE THE HOLES ARE, ON THE TIMELINE, WHILE YOU WORK.  [INV-03, U-04]
   *
   * They were only ever named at the bottom of the page, at the moment of
   * rendering, in a sentence — and a sentence cannot point. A stretch of
   * song with nothing on it is a fact about the edit, so it belongs on the
   * edit, drawn where it is: an author scrolling the timeline sees the hole
   * before they ever reach the render button, and clicking it seeks there
   * like clicking anywhere else on these lanes does.
   *
   * The same question the render console and the renderer ask. [D-19]
   */
  const holes = renderProblems(performance)
    .filter((problem) => problem.fromSample !== undefined);
  const usable = performance.takes.filter((t) => t.durationSamples > 0);
  const slots = takeSlots(LAYOUTS[arrangement]!);

  const player = usePerformancePlayer(performance);
  const current = sceneAt(performance, Math.round(player.position));
  /*
   * TWO THINGS TO LOOK AT, AND THEY ARE NOT THE SAME THING.  [§6, §7]
   *
   * PROGRAM is what the viewer would see: the scene at the playhead, in the
   * layout it names. ALL TAKES is the multiview a director works from —
   * every take at once, on one clock, numbered, so you can see what you are
   * about to cut to before you cut to it. "You could have multiple
   * synchronized takes visible simultaneously... you choose which one is
   * visible at each moment" is a description of the second one, and the
   * studio only had the first.
   *
   * It opens on the multiview whenever there is more than one take, because
   * directing is what this studio is for and a single panel showing a scene
   * you already made is not the view you need to make the next one.
   */
  const usableIds = performance.takes
    .filter((t) => t.durationSamples > 0).map((t) => t.id);
  const [multiview, setMultiview] = useState<boolean | null>(null);
  /*
   * WATCHING ONE TAKE IS A THIRD VIEW, not a second player.
   *
   * "Every take should be playable independently" — and it already was,
   * in the sense that the multiview plays all of them at once on the
   * song's clock. What was missing is watching ONE without the others
   * beside it, which is this: the same stage, the same transport, the
   * same clock, one panel. A separate preview window would have been a
   * second transport and a second answer to "where are we". [D-19]
   */
  const [solo, setSolo] = useState<TakeId | null>(null);
  const soloed = solo && usableIds.includes(solo) ? solo : null;
  const allTakes = !soloed && (multiview ?? usableIds.length > 1);
  const visible = soloed
    ? [soloed] : allTakes ? usableIds : (current?.takeIds ?? []);

  const beats = performance.beats;

  const write = useCallback(async (at: number, layoutId: string, takeIds: string[]) => {
    setError(null);
    /*
     * §11's "cut on beat", and S-8's condition on it: the move is visible, it
     * is small, and it only happens because the author turned it on. A cut
     * that moved because a detector was confident is a cut they did not make.
     */
    let where = Math.round(at);
    if (snap && beats?.acceptedBy) {
      const result = snapToBeat(where, beats);
      where = result.sample;
      setSnapped(result.snapped ? where : null);
      if (!result.snapped) setSnapped(null);
    }
    try {
      const response = await fetch(`/api/performances/${performance.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'set-scene', at: where, layoutId, takeIds }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'that did not work');
      onChanged(data.performance);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [beats, onChanged, performance.id, snap]);

  const readHistory = useCallback(async () => {
    const response = await fetch(`/api/performances/${performance.id}/history`,
      { cache: 'no-store' });
    if (response.ok) setHistory(await response.json());
  }, [performance.id]);

  useEffect(() => { void readHistory(); }, [readHistory]);

  /** Walk the document back or forward. [§12 P1] */
  const step = useCallback(async (action: 'undo' | 'redo') => {
    setError(null);
    const response = await fetch(`/api/performances/${performance.id}/history`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error ?? 'that did not work'); return; }
    setHistory({ canUndo: Boolean(data.canUndo), canRedo: Boolean(data.canRedo) });
    if (data.moved) {
      onChanged(data.performance);
      /* A clip that no longer exists cannot stay selected. */
      setSelection(null);
    }
  }, [onChanged, performance.id]);

  /**
   * Returns the refusal, or null.
   *
   * IT USED TO RETURN NOTHING, and that was fine while every caller was a
   * control at the bottom of the stage, beside the line that shows
   * `error`. It stopped being fine the moment MASTER CHECK grew a control
   * of its own: the check list is most of a page below that line, so a
   * refusal about lyrics appeared somewhere the author pasting them could
   * not see — which is the same as not appearing. The message still goes
   * to `error` for everybody else, and now it also comes back so a caller
   * far from that line can say it where it happened. [U-19]
   */
  const patch = useCallback(async (
    body: Record<string, unknown>,
  ): Promise<string | null> => {
    setError(null);
    const response = await fetch(`/api/performances/${performance.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const said = data.error ?? 'that did not work';
      setError(said);
      return said as string;
    }
    onChanged(data.performance);
    void readHistory();
    return null;
  }, [onChanged, performance.id, readHistory]);

  /**
   * Match this take to another, measuring both on the way.
   * [MASTER-EDIT §8]
   *
   * ONE CALL, because choosing "match to Beach" is one act. The route
   * measures whichever takes have not been measured and sets the reference
   * in the same request; sequencing three round trips here would mean this
   * component deciding what to show when the second of them failed.
   */
  const matchTo = useCallback(async (takeId: string, toTakeId: string) => {
    setError(null);
    setMatchSaid(null);
    setMatching(true);
    try {
      const response = await fetch(
        `/api/performances/${performance.id}/takes/${takeId}/colour`,
        {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ to: toTakeId === '' ? null : toTakeId }),
        });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(data.error ?? 'that did not work'); return; }
      onChanged(data.performance);
      setMatchSaid(data.says ?? null);
      void readHistory();
    } finally {
      setMatching(false);
    }
  }, [onChanged, performance.id, readHistory]);

  /**
   * Turn the stabiliser on, measuring the take on the way.
   * [MASTER-EDIT §5]
   */
  const steady = useCallback(async (takeId: string, row: string) => {
    setError(null);
    setSteadying(true);
    try {
      const response = await fetch(
        `/api/performances/${performance.id}/takes/${takeId}/stabilize`,
        {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ stabilize: row === '' ? null : row }),
        });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(data.error ?? 'that did not work'); return; }
      onChanged(data.performance);
      void readHistory();
    } finally {
      setSteadying(false);
    }
  }, [onChanged, performance.id, readHistory]);

  /**
   * Write a proposed arrangement, as scenes.  [MASTER-EDIT §12 P3, U-15]
   *
   * THE PROPOSAL BECOMES REAL HERE AND NOWHERE ELSE. `proposeFirstCut`
   * returns scenes that do not exist; this is the press that makes them,
   * and it goes through `set-scene` like every other edit — so it lands in
   * the history, undoes in one press, and cannot reach the document by a
   * path the rest of the studio does not use. [D-19]
   */
  const applyFirstCut = useCallback(async (
    scenes: { fromSample: number; takeId: string }[],
  ) => {
    for (const scene of scenes) {
      await patch({
        action: 'set-scene', at: scene.fromSample,
        layoutId: 'performance_full', takeIds: [scene.takeId],
      });
    }
  }, [patch]);

  /*
   * WHAT CAN BE DONE TO WHAT IS ON SCREEN.  [§7, §8, §11, U-04]
   *
   * THE PROGRAM MONITOR WAS INERT. Every other object in this studio says
   * what can be done to it — the takes in the rail, the clips, the
   * programmes in the control room — and the one picture the whole studio
   * is about answered neither click. To change the take in a scene you
   * found the take rail; to change how the scene arrives you opened a
   * `Transitions` toggle in the transport, which raised a row of
   * `<select>`s, one per scene, identified by nothing but their order.
   *
   * The transitions were built long ago — cut, dissolve, fade through
   * black, planned and rendered — and reachable only through that row.
   * This does not add a transition; it puts the ones there are where the
   * author is already looking. [D-19]
   *
   * IT IS RAISED BY EITHER BUTTON. Right-click because that is what the
   * rest of the product taught, and LEFT-click because the program monitor
   * has nothing else for a left click to mean — in the multiview it cuts
   * to that take, and here there is no cut to make, so a picture that did
   * nothing at all was the only thing it could be confused with. Both go
   * through `onRow`, so there is one list and not two that drift.
   */
  const rewrite = useCallback((scene: { fromSample: number; layoutId: string },
    takeIds: string[]) => patch({
    action: 'set-scene', at: scene.fromSample, layoutId: scene.layoutId, takeIds,
  }), [patch]);

  const stageMenu = useCallback((panelTakeId: string | null): MenuEntry[] => {
    const at = Math.round(player.positionNow());
    /*
     * NOTHING ON SCREEN HERE is a hole, and the useful thing to offer is
     * the thing that closes it — the same offer the render console makes
     * in a sentence, made where the emptiness actually is.
     */
    if (!current) {
      return usable.map((take) => ({
        label: `Put ${take.label} on screen from here`,
        hint: 'Nothing is on screen at this moment',
        onSelect: () => { void write(at, 'performance_full', [take.id]); },
      }));
    }
    const scene = current;
    const panel = panelTakeId
      ? scene.takeIds.findIndex((id) => id === panelTakeId) : -1;
    const isFirst = ordered[0]?.id === scene.id;
    const transition = scene.transition ?? 'cut';
    return [
      /*
       * Replacing goes through `patch` and not through `write`, because
       * `write` snaps to the beat grid — correct when placing a cut, and
       * wrong here: swapping who is in a panel must not also move the
       * boundary of the scene they are in.
       */
      ...(panel >= 0
        ? usable.filter((take) => !scene.takeIds.includes(take.id))
          .map((take) => ({
            label: `Replace with ${take.label}`,
            onSelect: () => {
              const takeIds = [...scene.takeIds];
              takeIds[panel] = take.id;
              void rewrite(scene, takeIds);
            },
          }))
        : []),
      ...Object.values(TRANSITIONS).map((style) => ({
        label: `Arrives as a ${style.label.toLowerCase()}`,
        hint: style.hint,
        /* The first scene arrives from nothing, so it has no join to
           style. Greyed with the reason rather than hidden: a menu whose
           contents change between visits is a menu nobody learns. */
        ...(isFirst ? { disabled: 'nothing comes before it' } as const
          : style.id === transition ? { disabled: 'already' } as const : {}),
        onSelect: () => {
          void patch({
            action: 'scene-transition', sceneId: scene.id, transition: style.id,
          });
        },
      })),
      {
        label: 'Start this scene here',
        hint: `move its beginning to ${formatMasterPosition(at)}`,
        ...(at === scene.fromSample
          ? { disabled: 'it already starts here' } as const
          : ordered.some((other) => other.id !== scene.id && other.fromSample === at)
            ? { disabled: 'another scene starts there' } as const : {}),
        onSelect: () => {
          void patch({ action: 'move-scene', sceneId: scene.id, at });
        },
      },
      {
        label: 'Remove this scene\u2026',
        danger: true,
        onSelect: () => confirm({
          question: 'Remove this scene? What was on screen here goes back to '
            + 'whatever the scene before it shows \u2014 or to nothing, if it is '
            + 'the first.',
          verb: 'Remove the scene',
          danger: true,
          go: () => { void patch({ action: 'remove-scene', sceneId: scene.id }); },
        }),
      },
    ];
  }, [confirm, current, ordered, patch, player, rewrite, usable, write]);

  /** Who accepted the beats. One owner for now; the field exists for later. */
  const accept = useCallback(
    () => patch({ action: 'accept-beats', by: 'owner' }), [patch]);
  const tempo = useCallback(
    (bpm: number) => patch({ action: 'set-tempo', bpm, by: 'owner' }), [patch]);

  /*
   * The keys. Numbers choose takes; a scene is written as soon as the chosen
   * arrangement is full, which is what makes a one-panel switch feel like one
   * key rather than two.
   */
  const choose = useCallback((index: number) => {
    const take = usable[index];
    if (!take) return;
    const next = pending.includes(take.id)
      ? pending.filter((tid) => tid !== take.id)
      : [...pending, take.id];
    if (next.length >= slots) {
      /*
       * Where the song ACTUALLY is, not where the last repaint said it was.
       * The playhead is drawn ten times a second because redrawing it sixty
       * times is a waste of the frame budget — but a cut placed a tenth of a
       * second late is three frames out, and on a beat that is visible.
       */
      void write(player.positionNow(), arrangement, next.slice(0, slots));
      setPending([]);
    } else {
      setPending(next);
    }
  }, [arrangement, pending, player, slots, usable, write]);

  /*
   * WHAT CAN BE DONE TO A TAKE, RAISED FROM EITHER PLACE.  [§7, S-3, D-19]
   *
   * The list is `takeMenuItems`, and this is the only definition of it in
   * the product: the rail renders it on a row, the multiview renders it
   * on the take's own picture, and neither writes out a verb of its own.
   * A studio where right-clicking a take's picture offers different
   * things from right-clicking its row is a studio with two answers to
   * one question.
   *
   * NOT THE SCENE'S ENTRIES. `stageMenu` offers transitions, moving the
   * boundary and removing the scene, and all of those are about the clip
   * on air, not about the take that was clicked. Offering them from a
   * picture that is NOT on air would be a menu whose items act on
   * something other than the thing under the pointer.
   */
  const takeMenu = useCallback((
    take: Performance['takes'][number],
  ): MenuEntry[] => takeMenuItems(take, {
    performance,
    patch,
    confirm,
    at: () => player.positionNow(),
    keyOf: (takeId) => {
      const index = usableIds.indexOf(takeId as TakeId);
      return index < 0 ? null : index + 1;
    },
    /*
     * THE SAME CALL THE PICTURE MAKES. `choose` is what a left-click on
     * a tile and a press of the number key both run — it fills the
     * arrangement and writes the scene at the playhead — so the menu
     * cannot mean something subtly different by "put it on screen".
     */
    place: (takeId) => {
      const index = usableIds.indexOf(takeId as TakeId);
      if (index >= 0) choose(index);
    },
    onReframe: (takeId) => {
      setReframing(takeId);
      /*
       * Paused, because a crop is drawn over ONE frame and a picture
       * moving under the box is a box you cannot place. It also makes
       * the contained view legible: the whole frame, held still.
       */
      player.pause();
    },
    solo: soloed,
    onSolo: (takeId) => {
      setSolo(takeId as TakeId | null);
      if (takeId) void player.play();
    },
    chosen: chosenTake,
    onChoose: onChooseTake,
  }), [
    choose, chosenTake, confirm, onChooseTake, patch, performance, player,
    soloed, usableIds,
  ]);

  /**
   * What can be done to the song.  [TIMELINE B6]
   *
   * One list, two handles — the lane's head and its waveform — for
   * the same reason the take menu has three: a studio where the
   * gesture works on one half of a lane and not the other is a studio
   * you have to aim at.
   */
  /*
   * "ADD AUDIO."  [TIMELINE B6h, B8]
   *
   * The file is sent, the worker measures it, and the document is read
   * back when it lands — the layer is NOT drawn before then, because
   * its width is its measured length and a block drawn from a guess is
   * a block in the wrong place. The studio says what it is waiting for
   * in the meantime, since an upload with no visible effect for ten
   * seconds reads as nothing having happened. [U-02, U-19]
   */
  const watchSound = useCallback(async (jobId: string) => {
    for (let tries = 0; tries < 120; tries += 1) {
      await new Promise((wake) => { setTimeout(wake, 1000); });
      const response = await fetch(`/api/performances/${performance.id}`,
        { cache: 'no-store' });
      if (!response.ok) continue;
      const data = await response.json();
      const job = (data.jobs ?? [])
        .find((one: { id?: string }) => one.id === jobId);
      if (!job || job.state === 'pending' || job.state === 'running') continue;
      setAdding(null);
      if (job.state === 'failed') {
        setError(job.error ?? 'that sound could not be added');
        return;
      }
      onChanged(data.performance);
      return;
    }
    setAdding(null);
  }, [onChanged, performance.id]);

  const addAudio = useCallback((at: number) => {
    pickSound(performance.id, { track: 'effect', fromSample: at }, {
      onStarted: (label) => { setAdding(label); setError(null); },
      onError: (message) => { setAdding(null); setError(message); },
      onFinished: watchSound,
    });
  }, [performance.id, watchSound]);

  /*
   * RECORDING A SOUND INTO THE TIMELINE.  [TIMELINE B6i, B7]
   *
   * The same hook the studio records takes with, given a third sink
   * and told there is no picture. A voice-over over the song is the
   * same recording problem as a take — the same count-in, the same
   * audio clock, the same measurement of where the song was when
   * capture actually began — and a second recorder for it would be a
   * second place all of that could be got wrong. [D-19, U-06]
   */
  const voiceLabel = useRef('Voice-over');
  const voice = useMasterRecording({
    sink: useMemo(() => soundSink(performance.id, () => ({
      label: voiceLabel.current, track: 'voice',
    })), [performance.id]),
    masterUrl: `/api/performances/${performance.id}/master`,
    sampleRate: HOUSE_SAMPLE_RATE,
    countInSeconds: VOICE_COUNT_IN_SECONDS,
    /* The take recorder's calibration is about a camera and a room;
       nothing here is being lined up against anything. [S-3] */
    latencySamples: 0,
    audioOnly: true,
    /* One sentence at one moment: the microphone goes off when the
       recording is kept, rather than staying open for a second one
       nobody asked for. [U-19] */
    once: true,
    onFinished: (jobId) => {
      setAdding(voiceLabel.current);
      void watchSound(jobId);
    },
  });

  /*
   * ARMED FROM THE PLAYHEAD, AND ONLY FROM THERE. The song starts
   * where the line is and the recording is placed from there, which
   * is the arithmetic that makes recording into a timeline worth
   * having rather than a second way to reach the top of the song.
   * [B7a]
   */
  const recordSound = useCallback((at: number) => {
    confirm({
      question: 'What is this sound? The song will play from the '
        + `playhead after a ${VOICE_COUNT_IN_SECONDS}-second count-in, and `
        + 'what you say over it lands on the Voice lane where it begins.',
      field: { label: 'Name', initial: 'Voice-over' },
      verb: 'Turn the microphone on',
      go: (typed) => {
        voiceLabel.current = typed.trim() || 'Voice-over';
        voiceFrom.current = at;
        void voice.arm();
      },
    });
  }, [confirm, voice]);
  const voiceFrom = useRef(0);

  /*
   * "REPLACE SECTION." The same picker and the same ingest as adding
   * a sound, told where it goes. [TIMELINE B6g, D-19]
   */
  const replaceSection = useCallback((
    fromSample: number, toSample: number,
  ) => {
    pickSound(performance.id, {
      track: 'music',
      fromSample,
      replace: { fromSample, toSample },
    }, {
      onStarted: (label) => { setAdding(label); setError(null); },
      onError: (message) => { setAdding(null); setError(message); },
      onFinished: watchSound,
    });
  }, [performance.id, watchSound]);

  const songMenu = useCallback((): MenuEntry[] => songMenuItems({
    performance, patch, confirm, at: () => player.positionNow(),
    addAudio, recordSound, replaceSection,
  }), [addAudio, confirm, patch, performance, player, recordSound,
    replaceSection]);

  /*
   * AND THE SAME FOR A SOUND, from one definition.  [TIMELINE B8, B12]
   *
   * A layer is a timeline object or it is a setting, and the
   * difference is whether you can right-click it.
   */
  const soundMenu = useCallback((layer: SoundLayer): MenuEntry[] =>
    soundMenuItems(layer, {
      patch,
      confirm,
      at: () => player.positionNow(),
      songSamples: performance.master.durationSamples,
    }), [confirm, patch, performance, player]);

  /*
   * THE KEYS ARE ALWAYS LIVE.  [benchmark, §7]
   *
   * There used to be a button that armed them, which is a mode — and a mode
   * is a thing you have to remember you are in. The benchmark has no such
   * button: the numbers are on the transport in the takes' colours and
   * pressing one cuts to that take, always, which is how every vision mixer
   * that has ever existed behaves.
   *
   * What the mode was really protecting was typing: a "3" meant for a take's
   * name must not cut to take three. That is a question about where the
   * keystroke went, not about a mode, so it is answered by asking. Modifier
   * combinations are left alone for the same reason — Cmd-1 belongs to the
   * browser.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      /*
       * THE ONE MODIFIER THIS STUDIO TAKES.  [§12 P1, U-04]
       *
       * The rule beside the number keys is that modifier combinations are
       * left alone, because Cmd-1 belongs to the browser. Cmd-Z is the
       * exception and not a contradiction: on a page with nothing else to
       * undo, Cmd-Z already MEANS "take back what I just did", and the
       * thing the person just did is an edit to this performance. Taking
       * it is meeting the expectation, not overriding it — and the check
       * below still hands it back the moment a field has focus, where the
       * browser's own undo is the one they want.
       */
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z'
        && !event.altKey) {
        const field = event.target as HTMLElement | null;
        if (field && (/^(INPUT|TEXTAREA|SELECT)$/.test(field.tagName)
          || field.isContentEditable)) return;
        event.preventDefault();
        void step(event.shiftKey ? 'redo' : 'undo');
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
        || target.isContentEditable)) return;
      if (event.key >= '1' && event.key <= '9') {
        event.preventDefault();
        choose(Number(event.key) - 1);
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        if (player.playing) player.pause(); else void player.play();
      }
      /* Esc puts the inspector away, as it closes everything else here. */
      if (event.key === 'Escape') setSelection(null);
    };
    // Capture, so the page's other keys never swallow a switch mid-song.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [choose, player, step]);

  const duration = performance.master.durationSamples;
  /*
   * THE SOUND LAYERS, GROUPED INTO LANES.  [TIMELINE B10a, B12]
   *
   * One lane per TRACK rather than one per sound, because a timeline
   * with a dozen impacts on it is a dozen rows nobody can read — and
   * because the track is the thing the author chose it for. A track
   * with nothing on it is not drawn: an empty lane is furniture, and
   * this column is already tall.
   */
  /*
   * THE STRETCHES OF THE SONG THAT ARE NOT IN THE EXPORT, and the
   * places it has been divided.  [TIMELINE B6a, B6b, B6k]
   *
   * Derived from the same `songSections` the planner and the mixer
   * read, so the lane cannot draw a cut the render does not make.
   */
  const songParts = songSections(performance.master);
  const cutStretches: { fromSample: number; toSample: number }[] = [];
  {
    let at = 0;
    for (const part of songParts) {
      if (part.fromSample > at) {
        cutStretches.push({ fromSample: at, toSample: part.fromSample });
      }
      at = part.toSample;
    }
    if (at < duration) cutStretches.push({ fromSample: at, toSample: duration });
  }
  /* A join is where two kept stretches touch — a division the author
     made and has not cut at. The ends of the song are not joins. */
  const songJoins = songParts
    .slice(1)
    .map((part) => part.fromSample)
    .filter((at, index) => songParts[index]!.toSample === at);

  const soundLanes = SOUND_TRACKS
    .map((track) => ({
      ...track,
      layers: (performance.sounds ?? []).filter((one) => one.track === track.id),
    }))
    .filter((lane) => lane.layers.length > 0);
  /*
   * ONE DEFINITION OF WHERE AN X IS ON THE SONG, for the click and the
   * drag alike, clamped to the song at both ends: there is nothing before
   * the first sample, and by INV-03 nothing after the last.
   */
  /**
   * How far the window may start, so it never shows past the end.
   *
   * At 1x there is nowhere to pan and `at` is pinned to zero, which is
   * what makes zooming out always land somewhere sensible rather than
   * leaving the view parked in the middle of nothing.
   */
  const panLimit = Math.max(0, 1 - 1 / zoom);

  /*
   * THE PLAYHEAD STAYS ON SCREEN.  [TIMELINE B3a]
   *
   * Zoomed to 8x, the song runs off the right of the window in four
   * seconds — and a timeline that plays past its own edge is a
   * timeline you have to chase with a scrollbar. When the line leaves
   * the window the window follows, putting it a fifth of the way in so
   * there is something visible ahead of it.
   *
   * ONLY WHEN IT LEAVES, and not every frame: a view that recentres
   * continuously is one nothing can be dragged on.
   */
  useEffect(() => {
    if (zoom <= 1) { if (at !== 0) setAt(0); return; }
    const where = duration > 0 ? player.position / duration : 0;
    const span = 1 / zoom;
    if (where >= at && where <= at + span) return;
    setAt(Math.max(0, Math.min(panLimit, where - span / 5)));
  }, [at, duration, panLimit, player.position, zoom]);

  const sampleAtX = useCallback((clientX: number): number => {
    const box = lanes.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return 0;
    /* Through the window: the column shows `1 / zoom` of the song,
       beginning at `at`. Both the click and the drag come through
       here, so zooming cannot make them disagree. */
    const along = at + ((clientX - box.left) / box.width) / zoom;
    return Math.max(0, Math.min(duration, Math.round(along * duration)));
  }, [at, duration, zoom]);
  /*
   * Drawn for the first minute only. A four-minute song at 120 BPM is 480
   * marks, which is 480 elements to lay out on every repaint of a timeline
   * whose whole job is to stay smooth while the song plays.
   */
  const marks = beats
    ? beatPositions(beats, Math.min(duration, 60 * 48000))
    : [];
  const pct = (samples: number) => `${Math.max(0, Math.min(100, (samples / duration) * 100))}%`;

  /*
   * The song's own shape.  [§2]
   *
   * Peaks rather than samples: a four-minute song is eleven million of them
   * and this lane is a thousand pixels wide. The server reduces it where the
   * data already lives, and a song still being decoded simply has none —
   * the lane draws scenes and a flat line, which is what it did before.
   */
  const [peaks, setPeaks] = useState<number[]>([]);
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/performances/${performance.id}/waveform`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { peaks: [] }))
      .then((data) => { if (!cancelled) setPeaks(data.peaks ?? []); })
      .catch(() => { /* a timeline without a waveform is still a timeline */ });
    return () => { cancelled = true; };
  }, [performance.id]);

  /** A tick every thirty seconds, or every five when the song is short. */
  const tickStep = duration / HOUSE_SAMPLE_RATE > 150 ? 30 : 5;
  const ticks: number[] = [];
  for (let at = 0; at * HOUSE_SAMPLE_RATE <= duration; at += tickStep) ticks.push(at);
  const clock = (samples: number) => {
    const total = Math.max(0, Math.round(samples / HOUSE_SAMPLE_RATE));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${
      String(total % 60).padStart(2, '0')}`;
  };
  /** Falls back to its own when nobody above is holding the choice. */
  const [ownChoice, setOwnChoice] = useState<string | null>(null);
  const chosen = chosenTake !== undefined ? chosenTake : ownChoice;
  const setChosen = onChooseTake ?? setOwnChoice;
  /*
   * Six spaces, then the rest on request. Eleven tiles is a panel somebody
   * scrolls past to reach the effects underneath, which is how a choice they
   * make every take ends up below the fold.
   */
  const [allSpaces, setAllSpaces] = useState(false);
  /*
   * THE PICTURES THE AUTHOR ALREADY HAS.  [§4, S-6, D-19]
   *
   * `environment.ts` has told the operator for as long as it has
   * existed: *"For a real place behind you, use your own image."* The
   * document has carried `kind: 'custom'` with an `assetId`,
   * `setEnvironment` has refused one without a picture, and
   * `compose.ts` has rendered it through the same matte as every drawn
   * space. The shelf never offered it. A promise in a sentence, a field
   * in a document, a branch in the renderer, and no door.
   *
   * Loaded on the first press rather than with the studio: an author
   * who never wants a custom backdrop should not pay a request for the
   * library on the way to the timeline.
   */
  const [pictures, setPictures] = useState<
    { assetId: string; title: string }[] | null>(null);
  const [picking, setPicking] = useState(false);
  const subject = usable.find((t) => t.id === chosen) ?? usable[0];

  /**
   * One tile in one of the three pickers.  [benchmark, §4, §5, §6]
   *
   * A FIXED HEIGHT PER GROUP, not a square and not whatever the label needed.
   * The benchmark's three groups are different heights on purpose — a
   * composition tile carries a diagram, an environment tile carries a picture
   * of the place, an effect tile carries a small glyph — and forcing them all
   * to one aspect made the effects as tall as the environments and pushed the
   * transport off the bottom of the screen.
   */
  const tile = (
    key: string, label: string, isChosen: boolean, onPick: () => void,
    testid: string, opts: {
      disabled?: boolean; swatch?: string; glyph?: React.ReactNode;
      height: number; title?: string;
      /** Set in a FLEX row, where a tile has to say how wide it is. */
      basis?: string;
    },
  ) => (
    <button
      key={key} type="button" data-testid={testid} data-option={key}
      data-chosen={isChosen ? 'true' : 'false'}
      aria-pressed={isChosen} disabled={opts.disabled}
      onClick={onPick} title={opts.title ?? label}
      /*
        * A CHOICE TILE IS A SWATCH OF THE RESULT, and the one that is
        * chosen has to be findable in a grid of eight without reading
        * eight labels. A tinted fill alone is not enough at this size:
        * at 62px, eight tiles in two rows, the difference between
        * rgba(45,110,200,0.22) and the panel behind it is a few points
        * of luminance and the eye has to hunt.
        *
        * So the chosen one is RAISED as well as tinted — a real border,
        * a highlight on its top edge and a shadow under it — while the
        * rest stay flat in the group. Depth is found without hunting,
        * and it survives greyscale. [D-04, U-19]
        */
      style={{
        height: opts.height,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: opts.swatch ? 'flex-start' : 'center',
        gap: 'var(--space-2)',
        padding: opts.swatch ? 'var(--space-2)' : 'var(--space-2) 3px',
        minHeight: 0,
        /*
         * ONE RENDERER, THREE GRIDS — composition, environment and
         * effects all come through here, which is why this is the
         * whole of Studio Two's option language in one place.
         *
         * IT WAS A SAAS CARD GRID: an 8px radius, a blue gradient fill
         * on the chosen one and a drop shadow lifting it off the page.
         * Twenty of them in a column is twenty floating rectangles,
         * and the chosen one announced itself by becoming a different
         * colour of object rather than by being the lit one.
         *
         * Now: 3px, a seam instead of a border, and the chosen tile
         * comes forward two per cent with a lit top edge. Same rule as
         * the multi-view in 03, the tab strips in 05 and the virtual
         * sets in 10 — one grammar for "this is the one", across four
         * surfaces that used to have four. [brief §4, §10]
         */
        borderRadius: 3,
        cursor: opts.disabled ? 'not-allowed' : 'pointer',
        border: `1px solid ${isChosen
          ? 'var(--accent)' : 'var(--console-seam)'}`,
        borderTopWidth: isChosen ? 2 : 1,
        background: isChosen
          ? 'var(--console-control-hover)' : 'var(--console-control)',
        boxShadow: isChosen
          ? 'var(--console-bevel-strong)' : 'var(--console-bevel)',
        color: 'inherit', font: 'inherit',
        fontSize: 'var(--text-2xs)', lineHeight: 1.25,
        fontWeight: isChosen ? 'var(--weight-semi)' : 'var(--weight-normal)',
        opacity: opts.disabled ? 0.38 : 1, textAlign: 'center',
        ...(opts.basis ? { flex: `0 0 ${opts.basis}`, minWidth: 0 }
          : { width: '100%' }),
        overflow: 'hidden',
        transition: 'box-shadow var(--motion-fast) var(--ease-out),'
          + ' border-color var(--motion-fast) var(--ease-out),'
          + ' background-color var(--motion-fast) var(--ease-out)',
      }}
    >
      {opts.swatch && (
        /*
          * A COLOUR SWATCH IS A SAMPLE OF A RENDERED FRAME, so it gets
          * the same inset hairline every picture in this product gets.
          * Without it a light swatch bleeds into the tile around it and
          * the sample has no edge — which is the one thing a sample
          * needs.
          */
        <span aria-hidden="true" style={{
          width: '100%', flex: '1 1 auto', minHeight: 0,
          borderRadius: 'var(--radius-xs)',
          background: opts.swatch,
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.35)',
        }} />
      )}
      {opts.glyph && (
        <span aria-hidden="true" style={{
          flex: '0 0 auto', display: 'grid', placeItems: 'center',
          color: isChosen ? '#9cc6f5' : 'var(--ink-400)',
          transition: 'color var(--motion-fast) var(--ease-out)',
        }}>{opts.glyph}</span>
      )}
      <span style={{ flex: '0 0 auto' }}>{label}</span>
    </button>
  );

  const sectionTitle = (text: string, aside?: React.ReactNode) => (
    <div className="row" style={{
      alignItems: 'baseline', justifyContent: 'space-between', margin: '9px 0 5px',
    }}>
      {/*
        * The same signage treatment the control room's sub-heads take,
        * so the two studios read as one product rather than as two
        * projects that happen to share a bar. [D-04]
        */}
      <span style={{
        fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)',
        letterSpacing: '0.07em', textTransform: 'uppercase',
        color: 'var(--text-faint)',
      }}>{text}</span>
      {aside}
    </div>
  );

  return (
    <div data-testid="switching-stage" style={{
      /*
       * Three panels in one row, then the timeline under all three, then the
       * transport under that. Named areas rather than nested flexboxes: the
       * timeline has to span the full width, and a timeline nested inside the
       * middle column cannot — which is exactly what it did when this was two
       * columns with the stage and the panel inside one of them.
       */
      display: 'grid', minHeight: 0, gap: 12,
      gridTemplateColumns: 'minmax(250px, 330px) minmax(0, 1fr) minmax(290px, 360px)',
      gridTemplateAreas: '"takes stage panel" "timeline timeline timeline" '
        + '"inspector inspector inspector" "notes notes notes" '
        + '"transport transport transport"',
      alignItems: 'start',
    }}>
      {confirmDialog}
      {menu}
      {/*
        * The rail is as tall as the stage too, and scrolls inside that.
        *
        * Same reason as the panel on the other side: arming the camera adds a
        * preview and two fields to this column, and a column that grows when
        * you turn the camera on would push the timeline and the transport
        * down at the exact moment you are about to perform. The three columns
        * are one row, and one row is the stage's height.
        */}
      <div style={{
        gridArea: 'takes', minWidth: 0, position: 'relative',
        alignSelf: 'stretch', minHeight: 0,
      }}>
        <div className="shell-scroll" style={{ position: 'absolute', inset: 0 }}>
          {takesPanel?.({ takeMenu, at: () => player.positionNow() })}
        </div>
      </div>
      <>
        {/*
          * WHAT THE VIEWER WOULD SEE. Every take on screen at once when the
          * arrangement holds several, laid out as the arrangement lays them
          * out — this is a preview of the composition, not a contact sheet.
          */}
        <div
          data-testid="performance-stage"
          data-layout={current?.layoutId ?? 'none'}
          style={{
            gridArea: 'stage', position: 'relative', aspectRatio: '16 / 9',
            background: 'var(--screen-bed)', borderRadius: 'var(--radius-screen)',
            border: '1px solid var(--line)', overflow: 'hidden',
          }}
        >
          {visible.length === 0 && (
            /*
              * A HOLE IS SOMETHING TO ACT ON, TOO. The sentence told the
              * author what was wrong and left them to go and find the
              * remedy; pressing the emptiness now offers the takes that
              * could fill it. Same list, same place they were looking.
              */
            <button type="button" className="small muted"
                    data-testid="program-actions"
                    {...onRow('this moment', () => stageMenu(null))}
                    onClick={(event) =>
                      onRow('this moment', () => stageMenu(null)).onContextMenu(event)}
                    style={{
                      position: 'absolute', inset: 0, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      textAlign: 'center', padding: 20, background: 'transparent',
                      border: 0, font: 'inherit', color: 'inherit',
                      cursor: 'context-menu',
                    }}>
              Nothing is on screen at this moment. Press a number while the
              song plays, pick a take below, or press here for what can go on it.
            </button>
          )}
          {visible.map((takeId, index) => {
            const take = performance.takes.find((t) => t.id === takeId);
            if (!take) return null;
            /*
             * In PROGRAM the layout places the panel, because the layout is
             * what the export will use. In the multiview nothing is being
             * composed — it is a wall of monitors — so the panels are an even
             * grid, squarest first, and a fifth take makes a 3x2 rather than
             * five slivers.
             */
            const rect = allTakes
              ? monitorRect(index, visible.length)
              : (LAYOUTS[current?.layoutId ?? arrangement] ?? LAYOUTS['performance_full']!)
                .layers.filter((l) => l.source === 'take')[index]?.rect
                ?? { x: 0, y: 0, w: 1, h: 1 };
            const key = usableIds.indexOf(takeId) + 1;
            return (
              <div key={takeId} data-testid="stage-take" data-take-id={takeId}
                   style={{
                     position: 'absolute',
                     left: `${rect.x * 100}%`, top: `${rect.y * 100}%`,
                     width: `${rect.w * 100}%`, height: `${rect.h * 100}%`,
                     backgroundColor: `${take.accent ?? TAKE_ACCENT_FALLBACK}22`,
                     backgroundImage:
                       `url(/api/performances/${performance.id}/takes/${take.id}/media?kind=poster)`,
                     backgroundSize: 'cover', backgroundPosition: 'center',
                     borderRadius: 'var(--radius-screen)', overflow: 'hidden',
                     /* A gutter between monitors, so five panels read as
                        five and not as one wide picture. A border rather than
                        an inset shadow, because a shadow draws under the
                        video and a video fills its panel. Only on the
                        multiview: in Program the layout's rects ARE the
                        composition, and a gap the renderer will not draw
                        would be a preview that lies. */
                     ...(allTakes
                       ? { border: '2px solid var(--screen-bed)', boxSizing: 'border-box' as const }
                       : {}),
                   }}>
                {/*
                  * THE TAKE, MOVING.  [§7, S-2]
                  *
                  * The stage used to be five posters. You cannot direct with
                  * posters: "you play the song and switch takes in real time"
                  * means watching the performances while you choose between
                  * them, and a still frame of a chorus tells you nothing
                  * about whether that is the chorus you want.
                  *
                  * The player steers these — it does not own them. Each one
                  * registers itself on mount and unregisters on unmount, so
                  * whatever is on screen is exactly what is being kept in
                  * time with the song, and a take that is off screen is not
                  * quietly decoding in the background.
                  *
                  * MUTED, ALL OF THEM. The song comes out of the player, and
                  * which audio the finished video carries is a decision the
                  * Sound modes make at render (§9). A monitor that mixed the
                  * takes' own microphones in would be answering that question
                  * with the speakers instead of with the document.
                  *
                  * The poster stays behind it as the background: a take still
                  * assembling has no media to show, and a black rectangle
                  * where a performance should be reads as a fault.
                  */}
                <video
                  data-testid="stage-video" data-take-id={take.id}
                  ref={(element) => { player.attach(take.id, element); }}
                  muted playsInline preload="auto"
                  onLoadedMetadata={(event) => {
                    const media = event.currentTarget;
                    if (!media.videoWidth || !media.videoHeight) return;
                    const ratio = media.videoHeight / media.videoWidth;
                    setAspects((was) => (was[take.id] === ratio
                      ? was : { ...was, [take.id]: ratio }));
                  }}
                  /*
                    * The proxy, not the mezzanine. [U-39]
                    *
                    * The mezzanine is H.264 and a Chromium without
                    * proprietary codecs will not decode it; the route serves
                    * the VP9/WebM copy here and falls back to the mezzanine
                    * when there is no proxy, setting the content type from
                    * what it actually sends. No `type` is declared on this
                    * end for that reason — a declared type the browser
                    * disagrees with is refused without a request being made.
                    */
                  src={`/api/performances/${performance.id}/takes/${take.id}`
                    + '/media?kind=proxy'}
                  style={{
                    width: '100%', height: '100%',
                    /*
                      * CONTAINED WHILE A CROP IS BEING DRAWN, and only
                      * then. A tile fits its video with `cover`, so on
                      * any panel that is not the source's own shape
                      * part of the frame is off the edge — and a box
                      * drawn over a picture whose edges are missing is
                      * a box over something the author cannot see. For
                      * the length of the crop the whole frame is shown,
                      * letterboxed, and `ReframeBox` measures against
                      * that content box rather than the tile.
                      */
                    objectFit: reframing === take.id ? 'contain' : 'cover',
                    display: 'block',
                  }}
                />
                {reframing === take.id && (
                  <ReframeBox
                    sourceAspect={aspects[take.id] ?? 9 / 16}
                    reframe={take.reframe}
                    onDrawn={(rect) => {
                      void patch({
                        action: 'reframe-take', takeId: take.id,
                        /* The whole frame is not a crop; the document
                           stores it as none, through one function. */
                        reframe: rect.w > 0.995 && rect.h > 0.995 ? null : rect,
                      });
                    }}
                    onDone={() => setReframing(null)}
                  />
                )}
                {/* The take's name, in the take's colour, where the benchmark
                    puts it: bottom left of its own panel — with the key in
                    front of it on the multiview, because that is the whole
                    point of looking at them all at once. */}
                {/*
                  * THE TAKE'S COLOUR IS A LAMP, NOT A FLOOD.  [U-20, §19]
                  *
                  * This was a saturated plate of `take.accent` with near
                  * black text, lying on the picture — the same object
                  * Online TV's ARMED pill was, and it is worse here
                  * because there is one per monitor and their colours
                  * differ, so two takes side by side put two different
                  * loud rectangles on two pictures you are comparing.
                  * The colour is the loudest thing on a frame it is
                  * supposed to be labelling.
                  *
                  * The take rail already says which take is which by
                  * lighting its leading edge in the take's own colour.
                  * That is the product's one language for take
                  * identity, so this is the same object at monitor
                  * scale: a dark OSD plate with the colour as a bar
                  * down its leading edge. Identity survives, the
                  * picture wins, and the two monitors stop competing.
                  */}
                <span style={{
                  position: 'absolute', left: 6, bottom: 6,
                  padding: '3px 7px 3px 6px',
                  borderRadius: 'var(--radius-screen)',
                  fontSize: 'var(--text-xs)', fontWeight: 600,
                  background: 'rgba(0,0,0,0.72)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  borderLeft: `3px solid ${take.accent ?? TAKE_ACCENT_FALLBACK}`,
                  color: 'rgba(255,255,255,0.94)',
                  maxWidth: 'calc(100% - 12px)', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {allTakes && key > 0 ? `${key} · ` : ''}{take.label}
                  {/*
                    * AND WHETHER IT IS BEING HELD. A take pushed against
                    * the song is playing at a different moment from the
                    * ones beside it, and a multiview that does not say so
                    * is four pictures that disagree for no stated reason.
                    */}
                  {nudgeSays(take) && (
                    <span data-testid="monitor-nudge" style={{ opacity: 0.8 }}>
                      {` · ${nudgeSays(take)}`}
                    </span>
                  )}
                </span>
                {/*
                  * Clicking a monitor is pressing its number. The same
                  * function the key presses and the transport button call —
                  * three ways in, one scene written. [§7]
                  */}
                {allTakes && key > 0 && (
                  /*
                    * AND RIGHT-CLICKING IT IS THE THIRD WAY IN. The rail
                    * has taught right-click-a-take-for-what-can-be-done
                    * since the first week, and in the multiview the take
                    * is the PICTURE — so the picture answered a left
                    * click and ignored a right one, which is the rail's
                    * lesson unlearned one panel away.
                    *
                    * The list is `tileMenu`, which is the cut this
                    * button already performs plus the pushes from
                    * `takeNudge.ts` — the same entries the rail offers,
                    * from one definition, because two menus on one
                    * object that differ is a studio with two answers to
                    * one question. [D-19]
                    */
                  <button type="button" data-testid="monitor-pick"
                          data-take-id={take.id}
                          title={`Cut to ${take.label} — key ${key}, `
                            + 'or right-click for what else can be done to it'}
                          onClick={() => choose(key - 1)}
                          {...onRow(take.label, () => takeMenu(take))}
                          style={{
                            position: 'absolute', inset: 0, padding: 0,
                            background: 'transparent', border: 0,
                            cursor: 'pointer',
                          }} />
                )}
                {/*
                  * AND IN PROGRAM THE PANEL IS THE SCENE. There is no cut
                  * to make here — this IS what is on air at the playhead
                  * — so the picture answers with what can be done to it
                  * instead of doing nothing. A `<button>` because it is
                  * one: reachable by tab, pressed by Enter, and named.
                  */}
                {!allTakes && (
                  <button type="button" data-testid="program-actions"
                          data-take-id={take.id}
                          title={`What can be done to ${take.label} here`}
                          aria-label={`What can be done to ${take.label} here`}
                          {...onRow(take.label, () => stageMenu(take.id))}
                          onClick={(event) =>
                            onRow(take.label, () => stageMenu(take.id))
                              .onContextMenu(event)}
                          style={{
                            position: 'absolute', inset: 0, padding: 0,
                            background: 'transparent', border: 0,
                            cursor: 'context-menu',
                          }} />
                )}
              </div>
            );
          })}
          {/*
            * AND THE CLOCK IS THE SAME PLATE AS EVERY OTHER OSD. It was
            * a 4px-cornered box in its own near-black; the programme
            * monitor's three plates settled on flat black at 72% with a
            * hairline of light and a 2px corner in commit 14, and there
            * is no reason for this studio's clock to be a different
            * object from that studio's clock.
            */}
          <div className="readout" style={{
            position: 'absolute', left: 10, top: 10, padding: '3px 8px',
            borderRadius: 'var(--radius-screen)',
            background: 'rgba(0,0,0,0.72)',
            border: '1px solid rgba(255,255,255,0.14)',
            color: 'rgba(255,255,255,0.94)',
            fontSize: 'var(--text-xs)',
            fontFamily: 'ui-monospace, monospace',
          }}>
            {formatMasterPosition(Math.round(player.position))} / {clock(duration)}
            {current?.label ? ` \u00b7 ${current.label}` : ''}
          </div>
          {/*
            * Which of the two you are looking at, and how to change it. On
            * the stage rather than in a settings panel, because it is a
            * statement about what is in front of you. [§6, §7]
            */}
          {usableIds.length > 1 && (
            <div className="row" data-testid="stage-view" data-mode={allTakes ? 'all' : 'program'}
                 style={{
                   /*
                    * AN OSD CONTROL, printed on the monitor rather
                    * than floated over it — same rule the programme
                    * monitor's plates learned in 14. Square, opaque,
                    * and the chosen half is LIT rather than filled
                    * blue: at 11px over a picture, a 55%-alpha blue
                    * fill is a coloured smear whose text is the first
                    * thing to go.
                    */
                   position: 'absolute', right: 10, top: 10, gap: 0,
                   borderRadius: 'var(--radius-screen)', overflow: 'hidden',
                   border: '1px solid rgba(255,255,255,0.16)',
                   background: 'rgba(0,0,0,0.72)',
                 }}>
              {([['program', 'Program'], ['all', 'All takes']] as const).map(([id, text]) => {
                const on = (id === 'all') === allTakes;
                return (
                  <button key={id} type="button" data-testid="stage-view-option"
                          data-option={id} data-chosen={on ? 'true' : 'false'}
                          aria-pressed={on}
                          onClick={() => setMultiview(id === 'all')}
                          style={{
                            border: 0, borderRadius: 0, padding: '4px 10px',
                            fontSize: 'var(--text-2xs)', cursor: 'pointer',
                            letterSpacing: '0.07em', textTransform: 'uppercase',
                            fontWeight: on
                              ? 'var(--weight-bold)' : 'var(--weight-semi)',
                            color: on ? 'var(--ink-000)' : 'rgba(255,255,255,0.58)',
                            background: on ? 'rgba(255,255,255,0.1)' : 'transparent',
                            borderBottom: `2px solid ${on
                              ? 'var(--accent)' : 'transparent'}`,
                          }}>
                    {text}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ---- composition, background, effects (§4, §5, §6) ----------- */}
        {/*
          * THE PANEL IS AS TALL AS THE STAGE, AND SCROLLS INSIDE THAT.
          *
          * Square tiles are taller than the rectangles they replaced, and the
          * panel grew past the stage — which pushed the timeline down and the
          * transport off the bottom of the screen. A picker cannot be allowed
          * to decide how tall the studio is.
          *
          * So the wrapper stretches to the row (whose height is the stage's,
          * since the stage is the thing with a fixed 16:9) and contributes no
          * height of its own: the panel inside is absolutely positioned, so
          * however many environments there are, the row stays the row.
          */}
        <div style={{
          gridArea: 'panel', position: 'relative', alignSelf: 'stretch', minHeight: 0,
        }}>
        <aside data-testid="composition-panel" className="shell-scroll"
               style={{
                 position: 'absolute', inset: 0,
                 border: '1px solid var(--console-edge)', borderRadius: 2,
                 padding: '4px 12px 8px', background: 'var(--panel)',
               }}>
          {sectionTitle('Composition')}
          {/* Four across, as the benchmark draws it. A fifth arrangement
              wraps rather than squeezing the row — the column count is the
              shape of the group, not a budget for how many there may be. */}
          {/*
            * Flex rather than grid, so a fifth arrangement makes a CENTRED
            * second row instead of one tile pinned to the left with three
            * empty cells beside it. Four per row either way — the basis is a
            * quarter of the width less its share of the gaps.
            */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center',
          }}>
            {ARRANGEMENTS
              .filter((a) => a !== 'performance_beside_master'
                || Boolean(performance.master.videoAssetId))
              .map((a) => tile(
                a, ARRANGEMENT_TILES[a] ?? LAYOUTS[a]!.label, arrangement === a,
                () => { setArrangement(a); setPending([]); },
                'arrangement',
                {
                  height: 62, glyph: <LayoutGlyph layoutId={a} />,
                  title: LAYOUTS[a]!.label,
                  // Four per row: a quarter of the width, less this tile's
                  // share of the three gaps between four.
                  basis: 'calc(25% - 4.5px)',
                }))}
          </div>

          {/*
            * WHAT THE SECOND GROUP IS ABOUT DEPENDS ON WHAT IS CHOSEN.
            * [§4, §5, §14, S-29]
            *
            * A performance is a person in a room, and the question is which
            * room the viewer sees. Footage is the sea: there is nobody to cut
            * out of it, no plate to key it against, and the two questions it
            * DOES raise — does it repeat, and whose is it — have no home in a
            * background picker. Offering an environment tile for a clip of
            * waves would be the product promising a matte it cannot make
            * (INV-16); offering nothing would leave the panel half empty next
            * to the one thing that stops the performance publishing.
            */}
          {subject && isFootage(subject) ? (
            <>
              {sectionTitle('Footage', (
                <span className="small muted" style={{ fontSize: 'var(--text-2xs)' }}>{subject.label}</span>
              ))}
              {/* Four across, the environment group's shape, because this
                  group stands where that one would. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {tile('loop', 'Loops', subject.loop === true, () => void patch({
                  action: 'set-loop', takeId: subject.id, loop: true,
                }), 'footage-loop', { height: 48 })}
                {tile('once', 'Plays once', subject.loop !== true, () => void patch({
                  action: 'set-loop', takeId: subject.id, loop: false,
                }), 'footage-loop', { height: 48 })}
              </div>

              {sectionTitle('Whose footage', (
                <span className="small" style={{
                  fontSize: 'var(--text-2xs)',
                  color: subject.rights && subject.rights !== 'third_party'
                    ? 'var(--muted)' : 'var(--warn)',
                }}>
                  {subject.rights ? '' : 'needed to publish'}
                </span>
              ))}
              {/* The same four the master answers, because it is the same
                  question with the same consequence. [INV-15] */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {MASTER_CLASSES.map((cls: MasterClass) => tile(
                  cls, FOOTAGE_RIGHTS[cls]!, subject.rights === cls,
                  () => {
                    /*
                     * A licence has to say what it is, so the one that needs
                     * a note asks for it here rather than letting the domain
                     * refuse a click with an error nobody expected.
                     */
                    if (cls !== 'licensed' && cls !== 'open') {
                      void patch({
                        action: 'set-footage-rights', takeId: subject.id,
                        rights: cls, rightsNote: null,
                      });
                      return;
                    }
                    confirm({
                      question: cls === 'licensed'
                        ? 'A licence has to say what it is. This travels '
                          + 'with the footage into the attribution block of '
                          + 'every export.'
                        : 'Open material still needs a source. This travels '
                          + 'with the footage into the attribution block of '
                          + 'every export.',
                      field: {
                        label: cls === 'licensed'
                          ? 'What licence permits this footage?'
                          : 'Where is it from, and what permits it?',
                        placeholder: cls === 'licensed'
                          ? 'CC BY 4.0, or the agreement it came under'
                          : 'Public domain \u2014 NASA, 1972',
                        initial: subject.rightsNote ?? '',
                      },
                      verb: 'Record the rights',
                      go: (note) => void patch({
                        action: 'set-footage-rights', takeId: subject.id,
                        rights: cls, rightsNote: note,
                      }),
                    });
                  },
                  'footage-rights', { height: 48 }))}
              </div>
              {subject.rightsNote && (
                <p className="small muted" style={{ fontSize: 'var(--text-2xs)', margin: '6px 0 0' }}>
                  {subject.rightsNote}
                </p>
              )}
            </>
          ) : (
            <>
          {sectionTitle(
            'Background / Environment',
            <span className="row" style={{ gap: 8, alignItems: 'baseline' }}>
              {subject && (
                <span className="small muted" style={{ fontSize: 'var(--text-2xs)' }}>{subject.label}</span>
              )}
              {SPACES.length > 6 && (
                <button type="button" className="small" data-testid="view-all-spaces"
                        onClick={() => setAllSpaces(!allSpaces)}
                        style={{
                          border: 0, background: 'none', padding: 0, cursor: 'pointer',
                          color: '#5c9ee0', fontSize: 'var(--text-xs)',
                        }}>
                  {allSpaces ? 'Show fewer' : 'View all'}
                </button>
              )}
            </span>,
          )}
          {!subject ? (
            <p className="small muted" style={{ fontSize: 'var(--text-xs)', margin: 0 }}>
              Record or upload a take first.
            </p>
          ) : (
            /* Four across and two rows, as the benchmark draws it: their own
               room, softened, and six places. */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {tile('original', 'Original',
                subject.environment.kind === 'original', () => void patch({
                  action: 'set-environment', takeId: subject.id,
                  environment: { kind: 'original' },
                }), 'environment-option',
                { height: 66, swatch: 'var(--panel-2)', title: 'The room you are in' })}
              {tile('blur', 'Blur',
                subject.environment.kind === 'blur', () => void patch({
                  action: 'set-environment', takeId: subject.id,
                  environment: { kind: 'blur' },
                }), 'environment-option',
                { height: 66, swatch: '#2a3038', disabled: !subject.plateAssetId,
                  title: 'The room you are in, softened' })}
              {/*
                * YOUR OWN PICTURE, which the renderer has always been
                * able to draw. The swatch is the picture itself once
                * one is chosen, because a tile is a sample of the
                * result and a grey square would be a sample of
                * nothing.
                */}
              {tile('custom', 'Your picture',
                subject.environment.kind === 'custom',
                () => {
                  setPicking((was) => !was);
                  if (pictures === null) {
                    void fetch('/api/library')
                      .then((response) => response.json())
                      .then((data: { items?: {
                        source: { assetId: string; form: string };
                        title: string }[] }) => setPictures(
                        (data.items ?? [])
                          .filter((one) => one.source.form === 'image')
                          .map((one) => ({
                            assetId: one.source.assetId, title: one.title }))))
                      .catch(() => setPictures([]));
                  }
                },
                'environment-option',
                {
                  height: 66,
                  swatch: subject.environment.kind === 'custom'
                    && subject.environment.assetId
                    ? `url(/api/library/${subject.environment.assetId})`
                      + ' center/cover no-repeat'
                    : '#242a33',
                  disabled: !subject.plateAssetId,
                  title: 'A picture of your own, from the library',
                })}
              {(allSpaces ? SPACES : SPACES.slice(0, 6)).map((space) => tile(
                space.id, space.label,
                subject.environment.kind === 'space'
                  && subject.environment.spaceId === space.id,
                () => void patch({
                  action: 'set-environment', takeId: subject.id,
                  environment: { kind: 'space', spaceId: space.id },
                }),
                'environment-option',
                {
                  height: 66,
                  swatch: SPACE_SWATCHES[space.id] ?? '#1b2028',
                  // Everything but their own room needs a measured plate, and
                  // a tile that cannot do anything looks like a fault. [INV-16]
                  disabled: !subject.plateAssetId,
                },
              ))}
            </div>
          )}

          {/*
            * AND THE PICTURES THEMSELVES, under the shelf rather than in
            * a dialog. Choosing a backdrop is a thing an author does
            * while looking at the performer it goes behind, and a modal
            * over the stage hides the one picture the choice is about.
            */}
          {subject && picking && (
            <div data-testid="picture-shelf" style={{ marginTop: 8 }}>
              {pictures === null ? (
                <p className="small muted" style={{
                  fontSize: 'var(--text-2xs)', margin: 0 }}>Looking…</p>
              ) : pictures.length === 0 ? (
                <p className="small muted" style={{
                  fontSize: 'var(--text-2xs)', margin: 0 }}>
                  No pictures in the library yet. Anything you upload there
                  can stand behind you here.
                </p>
              ) : (
                <div style={{
                  display: 'grid', gap: 6,
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  /* A library grows and this panel does not. Six rows of
                     pictures pushed the transport off the bottom of the
                     screen the first time it was looked at. */
                  maxHeight: 190, overflowY: 'auto',
                }}>
                  {pictures.map((one) => tile(
                    one.assetId,
                    /*
                      * THE LABEL IS CUT AND THE TITLE IS NOT. An uploaded
                      * picture is named by whoever uploaded it — "Written
                      * here — Live from the control room" — and at a
                      * quarter of this panel's width that is three lines
                      * of wrapped text under a 56px swatch, which clips.
                      * The swatch is what identifies a picture anyway;
                      * the full name is on hover and in the tooltip.
                      */
                    one.title.length > 18
                      ? `${one.title.slice(0, 17)}\u2026` : one.title,
                    subject.environment.kind === 'custom'
                      && subject.environment.assetId === one.assetId,
                    () => void patch({
                      action: 'set-environment', takeId: subject.id,
                      environment: { kind: 'custom', assetId: one.assetId },
                    }),
                    'picture-option',
                    {
                      height: 56,
                      swatch: `url(/api/library/${one.assetId})`
                        + ' center/cover no-repeat',
                      title: one.title,
                    },
                  ))}
                </div>
              )}
            </div>
          )}

            </>
          )}

          {sectionTitle('Effects')}
          {!subject ? null : (
            /* Five across, one row: None and the four treatments, exactly as
               the benchmark draws them. Shorter than the other two groups —
               a glyph and a word, where an environment needs a picture. */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
              {tile('none', 'None', !subject.effect, () => void patch({
                action: 'set-effect', takeId: subject.id, effect: null,
              }), 'effect-option',
              { height: 48, glyph: <EffectGlyph id="none" />, title: 'No treatment' })}
              {Object.values(EFFECT_LOOKS).map((look) => tile(
                look.id, EFFECT_TILES[look.id] ?? look.label,
                subject.effect === look.id,
                () => void patch({
                  action: 'set-effect', takeId: subject.id, effect: look.id,
                }), 'effect-option',
                { height: 48, glyph: <EffectGlyph id={look.id} />,
                  title: `${look.label} \u2014 ${look.hint}` }))}
            </div>
          )}

          {/*
            * SOUND, BESIDE PICTURE, BECAUSE IT IS THE SAME QUESTION ABOUT
            * THE SAME TAKE.  [MASTER-EDIT §8, §12 P2]
            *
            * An Effect is what to do about the light the take was shot in;
            * a Cleanup is what to do about the room it was recorded in. The
            * benchmark files those under two different tabs and this does
            * not, because in this product both are properties of one
            * recording and the author is choosing between takes, not
            * between panels. [U-18]
            *
            * WORDS AND NOT GLYPHS. There is no drawing of "a fridge in the
            * background", and inventing one would be five tiles the author
            * has to hover to read. [U-19]
            */}
          {/*
            * MATCH, UNDER EFFECTS, BECAUSE IT IS THE SAME QUESTION ONE STEP
            * EARLIER.  [MASTER-EDIT §8, §12 P2]
            *
            * An Effect is a decision about how this take should look; a
            * match is a correction that has to happen BEFORE the decision,
            * so that "warmer" means warmer than the other takes rather than
            * warmer than whatever this camera happened to do. Same panel,
            * one control above the other, in the order the render applies
            * them.
            *
            * A SELECT AND NOT TILES. The choices are the other takes, so
            * there is no fixed set to draw and nothing to draw them as —
            * and there is usually one other take, where five tiles would be
            * four empty boxes. [U-18]
            */}
          {!subject || usable.length < 2 ? null : (
            <>
              {sectionTitle('Match')}
              <select className="small" data-testid="match-to"
                      value={subject.matchTo ?? ''}
                      disabled={matching}
                      onChange={(event) => { void matchTo(subject.id, event.target.value); }}
                      style={{ fontSize: 'var(--text-sm)', width: '100%' }}>
                <option value="">Its own colour</option>
                {usable.filter((other) => other.id !== subject.id).map((other) => (
                  <option key={other.id} value={other.id}>
                    Match to {other.label ?? other.id}
                  </option>
                ))}
              </select>
              {matching && (
                <p className="small muted" data-testid="match-working"
                   style={{ margin: 0 }}>
                  Measuring both takes&hellip;
                </p>
              )}
              {matchSaid && (
                <p className="small muted" data-testid="match-said"
                   style={{ margin: 0 }}>{matchSaid}</p>
              )}
            </>
          )}

          {/*
            * STEADY, AFTER MATCH, BECAUSE IT IS THE FIRST THING THE RENDER
            * DOES AND THE LAST THING AN AUTHOR DECIDES.  [MASTER-EDIT §5]
            *
            * Drawn as words rather than tiles for the reason the cleanups
            * are: there is no picture of "handheld", and inventing one
            * would be three tiles the author has to hover to read. [U-19]
            *
            * A TAKE IN A REPLACED BACKGROUND SEES A SENTENCE, NOT A DEAD
            * CONTROL. The two cannot both be on — the matte is keyed
            * against a still of the room the stabiliser moves away from —
            * and a greyed row with no explanation teaches an author to
            * guess. [INV-16]
            */}
          {!subject ? null : (
            <>
              {sectionTitle('Steady')}
              {subject.environment?.kind !== 'original' ? (
                <p className="small muted" data-testid="steady-blocked"
                   style={{ margin: 0 }}>
                  This take is in a replaced background, which is keyed
                  against a still of its own room. Stabilising moves the
                  picture away from that still, so the two cannot both be on.
                </p>
              ) : (
                <>
                  <div className="ctl-bank">
                    <button className={`ctl${!subject.stabilize ? ' is-on' : ''}`}
                            data-testid="steady-option" data-steady="none"
                            aria-pressed={!subject.stabilize} disabled={steadying}
                            onClick={() => { void steady(subject.id, ''); }}
                            style={{ textAlign: 'left', padding: '7px 10px', display: 'block' }}>
                      <span style={{
                        fontWeight: 'var(--weight-semi)', fontSize: 'var(--text-sm)',
                        letterSpacing: 0, textTransform: 'none',
                      }}>As shot</span>
                      <span className="muted" style={{
                        display: 'block', fontSize: 'var(--text-2xs)', marginTop: 2,
                        letterSpacing: 0, textTransform: 'none',
                      }}>Every wobble you made, kept. The default.</span>
                    </button>
                    {Object.values(STABILIZERS).map((row) => (
                      <button key={row.id}
                              className={`ctl${subject.stabilize === row.id ? ' is-on' : ''}`}
                              data-testid="steady-option" data-steady={row.id}
                              aria-pressed={subject.stabilize === row.id}
                              disabled={steadying}
                              onClick={() => { void steady(subject.id, row.id); }}
                              style={{ textAlign: 'left', padding: '7px 10px', display: 'block' }}>
                        <span style={{
                          fontWeight: 'var(--weight-semi)', fontSize: 'var(--text-sm)',
                          letterSpacing: 0, textTransform: 'none',
                        }}>{row.label}</span>
                        <span className="muted" style={{
                          display: 'block', fontSize: 'var(--text-2xs)', marginTop: 2,
                          letterSpacing: 0, textTransform: 'none',
                        }}>{row.hint}</span>
                      </button>
                    ))}
                  </div>
                  {steadying && (
                    <p className="small muted" data-testid="steady-working"
                       style={{ margin: 0 }}>
                      Watching the whole take to see where it moved&hellip;
                    </p>
                  )}
                </>
              )}
            </>
          )}

          {sectionTitle('Sound')}
          {/*
            * WHAT WAS MEASURED, AND WHAT IT SUGGESTS.
            * [MASTER-EDIT §12 P3, U-02, U-15]
            *
            * Above the rows rather than replacing them: the advice says
            * which row and why, and the author presses it or presses
            * another. It never proposes `Heavy`, which costs a swirl
            * behind the vocal — a machine choosing the row with a known
            * cost on somebody's behalf is the trade U-15 says is theirs.
            *
            * Only when it disagrees with what is already set, for the same
            * reason the best-take line only shows when it disagrees: advice
            * that repeats the current answer is noise.
            */}
          {subject && (() => {
            const advice = adviseCleanup(subject.sound);
            if (!advice) return null;
            const already = (subject.cleanup ?? NO_CLEANUP) === advice.id;
            if (already) return null;
            return (
              <div data-testid="cleanup-advice">
                <div className="row" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <span className="module-sub">Measured</span>
                  <button className="ctl sm" data-testid="cleanup-advice-apply"
                          onClick={() => void patch({
                            action: 'set-cleanup', takeId: subject.id,
                            cleanup: advice.id === NO_CLEANUP ? null : advice.id,
                          })}>
                    {advice.id === NO_CLEANUP
                      ? 'Leave it as recorded'
                      : `Use ${CLEANUPS[advice.id]?.label ?? advice.id}`}
                  </button>
                </div>
                <p className="small muted" style={{ margin: '2px 0 0' }}>
                  {advice.says}.
                </p>
              </div>
            );
          })()}
          {!subject ? null : subject.hasAudio === false ? (
            <p className="small muted" data-testid="cleanup-silent"
               style={{ margin: 0 }}>
              This take was recorded with no sound in it, so there is nothing
              to clean.
            </p>
          ) : (
            <div className="ctl-bank">
              <button className={`ctl${!subject.cleanup ? ' is-on' : ''}`}
                      data-testid="cleanup-option" data-cleanup="none"
                      aria-pressed={!subject.cleanup}
                      title="Leave the recording as it was made"
                      onClick={() => void patch({
                        action: 'set-cleanup', takeId: subject.id, cleanup: null,
                      })}
                      style={{ textAlign: 'left', padding: '7px 10px', display: 'block' }}>
                <span style={{
                  fontWeight: 'var(--weight-semi)', fontSize: 'var(--text-sm)',
                  letterSpacing: 0, textTransform: 'none',
                }}>As recorded</span>
                <span className="muted" style={{
                  display: 'block', fontSize: 'var(--text-2xs)', marginTop: 2,
                  letterSpacing: 0, textTransform: 'none',
                }}>Nothing is removed. The default, and often right.</span>
              </button>
              {Object.values(CLEANUPS).map((row) => (
                <button key={row.id}
                        className={`ctl${subject.cleanup === row.id ? ' is-on' : ''}`}
                        data-testid="cleanup-option" data-cleanup={row.id}
                        aria-pressed={subject.cleanup === row.id}
                        onClick={() => void patch({
                          action: 'set-cleanup', takeId: subject.id, cleanup: row.id,
                        })}
                        style={{ textAlign: 'left', padding: '7px 10px', display: 'block' }}>
                  <span style={{
                    fontWeight: 'var(--weight-semi)', fontSize: 'var(--text-sm)',
                    letterSpacing: 0, textTransform: 'none',
                  }}>{row.label}</span>
                  <span className="muted" style={{
                    display: 'block', fontSize: 'var(--text-2xs)', marginTop: 2,
                    letterSpacing: 0, textTransform: 'none',
                  }}>{row.hint}</span>
                </button>
              ))}
            </div>
          )}

        </aside>
        </div>
      </>

      {/* ---- the song, the takes on it, and the edit (§2, §7, §8) ------ */}
      {/*
        * THE EDIT SURFACE IS DARKER THAN THE ROOM AROUND IT, the way a
        * timeline is in every editor there has ever been. The reason is
        * not convention for its own sake: the tracks carry small bright
        * marks — takes, transitions, a playhead — and small bright marks
        * need a dark floor or they read as noise on a grey field.
        */}
      <div data-testid="performance-timeline" style={{
        gridArea: 'timeline',
        border: 'var(--border) solid var(--line)',
        borderRadius: 'var(--radius-module)',
        background: 'var(--ink-850)', overflow: 'hidden',
        boxShadow: 'var(--elev-1)',
      }}>
        <div style={{ display: 'flex' }}>
          {/* The names, in a fixed column, so every lane starts at one x. */}
          {/*
            * THE TRACK HEADS ARE A FIXED COLUMN and belong to the
            * furniture rather than to the edit, so they sit a step
            * lighter than the tracks they label — the same relationship
            * the control room's rail has to its lanes.
            */}
          <div style={{
            width: 190, flex: '0 0 auto',
            borderRight: 'var(--border) solid var(--line)',
            background: 'var(--surface-raised)',
          }}>
            <div style={{ height: 18 }} />
            {/*
              * THE SONG IS A LANE LIKE ANY OTHER NOW.  [TIMELINE B6]
              *
              * Right-click it for what can be done to it, which is
              * what this studio already teaches on a take's row, a
              * take's picture and a take's block. The head is the
              * handle because the head is the thing that says which
              * lane this is — and the waveform beside it carries the
              * same menu, so the gesture works wherever the eye is.
              */}
            <div data-testid="song-head"
                 {...onRow(performance.master.title, songMenu)}
                 style={{ height: 52, padding: '6px 10px', cursor: 'context-menu' }}>
              <div style={{
                fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)',
                letterSpacing: '0.08em', color: 'var(--text-dim)',
              }}>
                MASTER SONG
              </div>
              <div className="small muted" style={{ fontSize: 'var(--text-2xs)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {performance.master.title}
              </div>
              {/*
                * Half and double time live ON the song's own lane, because a
                * tempo is a fact about the song. A detector that hears a
                * pulse at twice or half what a person counts is the usual way
                * beat detection is wrong, and the correction belongs beside
                * the thing it is about rather than in the transport, which
                * the benchmark keeps for playing and directing. [§11]
                */}
              {beats?.acceptedBy && (
                <span className="row" data-testid="tempo"
                      style={{ gap: 4, marginTop: 2 }}>
                  <span className="small muted" style={{ fontSize: 'var(--text-2xs)' }}>
                    {Math.round(beats.bpm)} BPM
                  </span>
                  <button className="small" data-testid="halve-tempo"
                          title={`Half time \u2014 ${Math.round(beats.bpm / 2)} BPM`}
                          onClick={() => void tempo(beats.bpm / 2)}
                          style={{ padding: '0 5px', fontSize: 'var(--text-2xs)' }}>&frac12;</button>
                  <button className="small" data-testid="double-tempo"
                          title={`Double time \u2014 ${Math.round(beats.bpm * 2)} BPM`}
                          onClick={() => void tempo(beats.bpm * 2)}
                          style={{ padding: '0 5px', fontSize: 'var(--text-2xs)' }}>2&times;</button>
                </span>
              )}
            </div>
            {usable.map((take) => (
              <button key={take.id} type="button" data-testid="lane-label"
                      data-take-id={take.id}
                      onClick={() => setChosen(take.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                        height: 30, padding: '0 10px', border: 0, font: 'inherit',
                        fontSize: 'var(--text-xs)', textAlign: 'left', cursor: 'pointer',
                        color: 'inherit',
                        background: subject?.id === take.id
                          ? 'rgba(45,110,200,0.16)' : 'transparent',
                      }}>
                <span aria-hidden="true" style={{
                  width: 8, height: 8, borderRadius: '50%', flex: '0 0 auto',
                  background: take.accent ?? TAKE_ACCENT_FALLBACK,
                  opacity: take.alignment.method === 'unplaced' ? 0.4 : 1,
                }} />
                <span style={{ fontWeight: 600 }}>{take.label}</span>
              </button>
            ))}
            {/*
              * THE AUDIO GROUP.  [TIMELINE B12, B10a]
              *
              * "AUDIO — song, voice-over, effects, ambience." One head
              * per track that has something on it, under the takes and
              * over the master video, which is the order the brief
              * drew and the order the ear works in.
              */}
            {/*
              * WHAT IS BEING WAITED FOR, WHILE IT IS BEING WAITED FOR.
              *
              * A sound is not on the timeline until its length has been
              * counted, which takes a few seconds — and an upload with
              * no visible effect for a few seconds reads as an upload
              * that did not happen. [U-19, B6h]
              */}
            {/*
              * THE MICROPHONE, WHILE IT IS ON.  [TIMELINE B6i, U-19]
              *
              * On the head column beside the lanes rather than in a
              * dialogue over them, because the thing being recorded
              * INTO is the timeline and the author is watching the
              * playhead move. A modal here would hide the one thing
              * they need to see.
              */}
            {voice.phase !== 'idle' && (
              <div data-testid="voice-recorder" data-phase={voice.phase}
                   style={{
                     height: 26, padding: '0 10px', display: 'flex',
                     alignItems: 'center', gap: 6,
                     fontSize: 'var(--text-2xs)',
                     color: voice.phase === 'recording'
                       ? 'var(--bad)' : 'var(--text-dim)',
                   }}>
                <Icon name="mic" size={11} />
                <span className="grow" style={{
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {voice.phase === 'arming' ? 'Turning the microphone on\u2026'
                    : voice.phase === 'ready' ? voiceLabel.current
                      : voice.phase === 'counting' ? 'Counting in\u2026'
                        : voice.phase === 'recording' ? 'Recording\u2026'
                          : 'Keeping it\u2026'}
                </span>
                {voice.phase === 'ready' && (
                  <button className="small" data-testid="voice-go"
                          title={'The song plays from the playhead after a '
                            + `${VOICE_COUNT_IN_SECONDS}-second count-in`}
                          onClick={() => {
                            void voice.start(voiceLabel.current,
                              { kind: 'original' }, voiceFrom.current);
                          }}
                          style={{ padding: '0 6px', fontSize: 'var(--text-2xs)' }}>
                    Start
                  </button>
                )}
                {(voice.phase === 'recording' || voice.phase === 'counting') && (
                  <button className="small" data-testid="voice-stop"
                          onClick={() => voice.stop()}
                          style={{ padding: '0 6px', fontSize: 'var(--text-2xs)' }}>
                    Stop
                  </button>
                )}
                {(voice.phase === 'ready' || voice.phase === 'arming') && (
                  <button className="small" data-testid="voice-cancel"
                          onClick={() => voice.disarm()}
                          style={{
                            border: 0, background: 'none', padding: 0,
                            fontSize: 'var(--text-2xs)', color: 'var(--muted)',
                            cursor: 'pointer',
                          }}>
                    Cancel
                  </button>
                )}
              </div>
            )}
            {adding && (
              <div data-testid="sound-measuring" style={{
                height: 26, padding: '0 10px', display: 'flex',
                alignItems: 'center', gap: 6,
                fontSize: 'var(--text-2xs)', color: 'var(--text-dim)',
              }}>
                <Icon name="sound" size={11} />
                <span className="grow" style={{
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>{adding}</span>
                <span className="muted">measuring…</span>
              </div>
            )}
            {soundLanes.map((lane) => (
              <div key={lane.id} data-testid="sound-head" data-track={lane.id}
                   style={{
                     display: 'flex', alignItems: 'center', gap: 7,
                     height: 26, padding: '0 10px',
                     fontSize: 'var(--text-2xs)',
                     letterSpacing: '0.06em', color: 'var(--text-dim)',
                     fontWeight: 'var(--weight-bold)',
                   }}>
                <Icon name="sound" size={11} />
                <span className="grow">{lane.label.toUpperCase()}</span>
                <span className="muted" style={{ fontWeight: 400 }}>
                  {lane.layers.length}
                </span>
              </div>
            ))}
            {/*
              * THE LABEL OVER ITS CONTROLS, NOT BESIDE THEM.
              *
              * This row is a fixed 190px head and it was asked to hold
              * a spaced-out caption, four zoom steps and a Clear on one
              * line. It could not: the caption broke across two lines,
              * the steps wrapped, and the second row of them was drawn
              * over the take lane above — visible in every screenshot
              * of this studio for weeks and invisible in every test,
              * because nothing here measures a box. Two deliberate
              * lines fit in the same 44px the lane opposite is.
              */}
            <div style={{
              height: 44, display: 'flex', flexDirection: 'column',
              justifyContent: 'center', gap: 3,
              padding: '0 var(--space-5)',
              borderTop: 'var(--border) solid var(--line)',
              fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)',
              letterSpacing: '0.08em', color: 'var(--text-dim)',
            }}>
              <span style={{ whiteSpace: 'nowrap' }}>MASTER VIDEO</span>
              <span className="row" style={{ gap: 8 }}>
              {/*
                * ZOOM SITS ON THE TIMELINE, not on the transport.
                * [TIMELINE B3a]
                *
                * The transport is for playing and directing; this is a
                * statement about the ruler you are looking at, so it
                * belongs on the ruler's own row — the same argument
                * half-time and double-time make for living on the
                * song's lane rather than beside the play button.
                *
                * FOUR STEPS, NAMED IN WHAT THEY MEAN. At 8x a pixel is
                * about a frame on a four-minute song, which is the
                * point at which a cut can be put ON a beat rather than
                * near one; past that the ruler is longer than anybody's
                * patience with a pan.
                */}
              <span className="row" data-testid="zoom" style={{ gap: 3 }}>
                {[1, 2, 4, 8].map((step) => (
                  <button key={step} className="small" data-testid="zoom-step"
                          data-step={step} aria-pressed={zoom === step}
                          title={step === 1
                            ? 'The whole song'
                            : `${step}\u00d7 \u2014 ${
                              formatMasterPosition(Math.round(duration / step))
                            } across the window`}
                          onClick={() => {
                            /* Zooming keeps the playhead where it is:
                               the moment you are looking at is the
                               moment you meant to look at. */
                            const where = duration > 0
                              ? player.positionNow() / duration : 0;
                            const span = 1 / step;
                            setZoom(step);
                            setAt(Math.max(0, Math.min(
                              Math.max(0, 1 - span), where - span / 2)));
                          }}
                          style={{
                            padding: '0 6px', fontSize: 'var(--text-2xs)',
                            fontWeight: zoom === step
                              ? 'var(--weight-bold)' : 'var(--weight-semi)',
                            color: zoom === step ? 'var(--ink-000)' : undefined,
                          }}>
                    {step === 1 ? 'Fit' : `${step}\u00d7`}
                  </button>
                ))}
              </span>
              {/* Starting the edit again belongs on the edit, not on the
                  transport: it is the one control here that destroys
                  something, and it should be where that something is. */}
              {ordered.length > 0 && (
                <button className="small" data-testid="clear-scenes"
                        title="Remove every cut and start the edit again"
                        onClick={() => confirm({
                          question: 'Remove every cut and start the edit '
                            + 'again? The takes stay exactly as they are '
                            + '\u2014 only the cuts between them go.',
                          verb: 'Clear the edit',
                          danger: true,
                          go: () => void patch({ action: 'clear-scenes' }),
                        })}
                        style={{
                          border: 0, background: 'none', padding: 0, fontSize: 'var(--text-2xs)',
                          fontWeight: 500, color: 'var(--muted)', cursor: 'pointer',
                        }}>Clear</button>
              )}
              </span>
            </div>
          </div>

          {/* Every lane, the same four minutes, one x per sample. */}
          {/*
            * ONE TRACK, WIDER THAN THE COLUMN.  [TIMELINE B3a]
            *
            * Zoom is done here and nowhere else: the column clips, the
            * track inside it is `zoom` times as wide, and `pct()` keeps
            * meaning exactly what it meant — a percentage of the SONG,
            * which is now a percentage of the track. So every ruler
            * tick, scene block, take lane, beat mark, hole and join
            * zooms and pans without one of them being told about it,
            * and nothing can be left behind when a new lane is added.
            *
            * The alternative was giving `pct` a window and clamping,
            * which piles everything outside the view against the edges
            * — a timeline that lies at both ends.
            */}
          <div ref={lanes} style={{
                 position: 'relative', flex: 1, minWidth: 0, overflow: 'hidden',
               }}
               onClick={(e) => player.seek(sampleAtX(e.clientX))}>
          <div data-testid="lane-track" style={{
            position: 'relative',
            width: `${(zoom * 100).toFixed(4)}%`,
            marginLeft: `-${(at * zoom * 100).toFixed(4)}%`,
          }}>
            {/*
              * THE RULER IS THE SCRUB STRIP, and until now the playhead
              * could only be JUMPED to, never taken hold of.
              *
              * Clicking a lane has always seeked — so the position was
              * reachable — but an author watching a take come in late
              * wants to pull the line back to the exact moment before it
              * and watch that moment again, and a click is one guess per
              * press. Dragging is the same seek repeated while the
              * pointer is down, which is why it is the SAME function: a
              * scrub that landed on a different sample from a click at
              * the same x would be two answers to "where is that".
              *
              * The pointer is captured, so a drag that leaves the strip
              * — upwards over the monitors, or past the end of the song
              * — keeps scrubbing and still ends when the button comes
              * up. Clamped to the song at both ends by `sampleAtX`:
              * there is nothing before zero, and INV-03 says there is
              * nothing after the last sample either.
              */}
            <div data-testid="master-ruler"
                 title="Drag to scrub \u2014 the song goes no earlier than its start"
                 onPointerDown={(event) => {
                   event.currentTarget.setPointerCapture(event.pointerId);
                   setScrubbing(true);
                   player.seek(sampleAtX(event.clientX));
                 }}
                 onPointerMove={(event) => {
                   if (scrubbing) player.seek(sampleAtX(event.clientX));
                 }}
                 onPointerUp={(event) => {
                   event.currentTarget.releasePointerCapture(event.pointerId);
                   setScrubbing(false);
                 }}
                 onPointerCancel={() => setScrubbing(false)}
                 style={{
                   height: 18, position: 'relative',
                   cursor: 'ew-resize', touchAction: 'none',
                 }}>
              {ticks.map((at) => (
                <span key={at} className="muted" style={{
                  position: 'absolute', left: pct(at * HOUSE_SAMPLE_RATE), top: 2,
                  fontSize: 'var(--text-2xs)', fontFamily: 'ui-monospace, monospace',
                  transform: at === 0 ? 'none' : 'translateX(-50%)',
                }}>{clock(at * HOUSE_SAMPLE_RATE)}</span>
              ))}
            </div>

            <div data-testid="master-waveform"
                 {...onRow(performance.master.title, songMenu)}
                 style={{ height: 52, position: 'relative' }}>
              {/*
                * WHAT IS NOT IN THE EXPORT, DRAWN WHERE IT IS.
                *   [TIMELINE B6a, B6b, B6k]
                *
                * The song's lane is four minutes long whatever the
                * author has cut out of it, because everything else on
                * this timeline is still on the song's own clock. So
                * the stretches that will not be exported are shaded
                * out and struck through, rather than the lane getting
                * shorter and every take under it moving.
                *
                * Under the waveform and not over it, and with no
                * pointer events, or this pane would swallow the
                * right-click that raises the song's own menu — a
                * mistake the dimming panes over the crop tool already
                * made once. [U-04]
                */}
              {cutStretches.map((cut) => (
                <div key={cut.fromSample} data-testid="song-cut"
                     data-from={cut.fromSample} data-to={cut.toSample}
                     title={'Not exported \u2014 '
                       + `${clock(cut.fromSample)} to ${clock(cut.toSample)}`}
                     style={{
                       position: 'absolute', top: 0, bottom: 0,
                       left: pct(cut.fromSample),
                       width: pct(cut.toSample - cut.fromSample),
                       background: 'rgba(0,0,0,0.72)',
                       borderLeft: '1px solid rgba(255,255,255,0.22)',
                       borderRight: '1px solid rgba(255,255,255,0.22)',
                       pointerEvents: 'none',
                     }} />
              ))}
              {/*
                * AND A STRETCH WHOSE SOUND COMES FROM SOMEWHERE ELSE,
                * which looks exactly like the song unless it is said.
                * Marked rather than shaded out: it IS in the export,
                * it is just not the song. [TIMELINE B6g]
                */}
              {songParts.filter((part) => part.assetId).map((part) => (
                <div key={`r${part.fromSample}`} data-testid="song-replaced"
                     data-from={part.fromSample} data-to={part.toSample}
                     title={'Something else plays here \u2014 '
                       + `${clock(part.fromSample)} to ${clock(part.toSample)}`}
                     style={{
                       position: 'absolute', top: 14, height: 36,
                       left: pct(part.fromSample),
                       width: pct(part.toSample - part.fromSample),
                       border: '1px solid rgba(220,170,80,0.55)',
                       background: 'rgba(220,170,80,0.14)',
                       borderRadius: 2,
                       pointerEvents: 'none',
                     }} />
              ))}
              {/* And the joins, which are where a division is: a hair
                  line, because a division changes nothing. [B6b] */}
              {songJoins.map((at) => (
                <div key={at} data-testid="song-join" data-at={at}
                     style={{
                       position: 'absolute', top: 12, bottom: 12,
                       left: pct(at), width: 1,
                       background: 'rgba(255,255,255,0.35)',
                       pointerEvents: 'none',
                     }} />
              ))}
              {ordered.filter((s) => s.label).map((scene) => (
                <span key={scene.id} style={{
                  position: 'absolute', left: pct(scene.fromSample), top: 0,
                  fontSize: 'var(--text-2xs)', paddingLeft: 5, color: 'rgba(255,255,255,0.72)',
                }}>{scene.label}</span>
              ))}
              <svg width="100%" height="36" style={{ position: 'absolute', top: 14 }}
                   preserveAspectRatio="none" aria-hidden="true">
                {peaks.length === 0 ? (
                  <line x1="0" y1="18" x2="100%" y2="18"
                        stroke="var(--line)" strokeWidth="1" />
                ) : peaks.map((peak, index) => {
                  const w = 100 / peaks.length;
                  const h = Math.max(1, peak * 32);
                  return (
                    <rect key={index} x={`${index * w}%`} y={(36 - h) / 2}
                          width={`${w}%`} height={h} fill="#8a6fd0" opacity={0.9} />
                  );
                })}
              </svg>
            </div>

            {usable.map((take) => {
              const placed = take.alignment.method !== 'unplaced';
              /*
               * `effectiveOffset`, NOT THE RAW MEASUREMENT. The planner,
               * the mixer and the player all add the author's nudge to
               * the offset; this lane did not, so a pushed take played in
               * one place and drew in another. Nothing could show it
               * until the nudge had a control — a divergence that was
               * real for months and unreachable. [D-19]
               */
              const from = Math.max(0, effectiveOffset(take.alignment));
              const to = Math.min(duration, from + take.durationSamples);
              /* Where it is being dragged to, while the pointer is down. */
              const held = dragging?.takeId === take.id ? dragging : null;
              const shown = held ? Math.max(0, from + held.by) : from;
              return (
                <div key={take.id} data-testid="take-lane" data-take-id={take.id}
                     data-placed={placed ? 'true' : 'false'}
                     data-from={shown}
                     style={{ position: 'relative', height: 30 }}>
                  {/*
                    * DRAG THE TAKE ITSELF, which is the direct form of
                    * the same push the menu makes exactly.
                    *
                    * "A take begins late — the user can drag it back."
                    * The block IS the take on the song, so taking hold
                    * of it and moving it is the most obvious thing in
                    * the studio, and until now it was the one lane
                    * nothing could be done to.
                    *
                    * IT WRITES THE NUDGE, NEVER THE MEASUREMENT. The
                    * drag is the author correcting where the automatic
                    * answer put it, which is exactly what
                    * `alignment.nudgeSamples` is for — so a re-measure
                    * later does not quietly undo it, and how far out
                    * the machine was stays readable. [S-3, INV-14]
                    *
                    * ONE WRITE, ON RELEASE. The block follows the
                    * pointer locally while it is down and the document
                    * is written once at the end: a PATCH per pointer
                    * move would be sixty versions of one decision, and
                    * undo would have to be pressed sixty times.
                    */}
                  <div role="button" tabIndex={-1}
                       data-testid="take-lane-block"
                       title={`Drag to move ${take.label} against the song`
                         + ' \u2014 right-click for what else can be done to it'}
                       {...onRow(take.label, () => takeMenu(take))}
                       onPointerDown={(event) => {
                         event.currentTarget.setPointerCapture(event.pointerId);
                         setDragging({ takeId: take.id, at: event.clientX, by: 0 });
                       }}
                       onPointerMove={(event) => {
                         if (dragging?.takeId !== take.id) return;
                         const box = lanes.current?.getBoundingClientRect();
                         if (!box || box.width <= 0) return;
                         /*
                          * DIVIDED BY THE ZOOM, because the box is the
                          * WINDOW and the track inside it is `zoom`
                          * times as wide. Without it a drag at 8x moved
                          * the take eight times as far as the pointer
                          * went — the lane drew the new position
                          * correctly the whole time, which is what made
                          * it look like the studio rather than the
                          * arithmetic. Found by writing the sound lane
                          * beside it. [B3a, D-19]
                          */
                         const by = Math.round(
                           ((event.clientX - dragging.at) / box.width)
                           * duration / zoom);
                         setDragging({ ...dragging, by });
                       }}
                       onPointerUp={(event) => {
                         event.currentTarget.releasePointerCapture(event.pointerId);
                         const by = dragging?.takeId === take.id ? dragging.by : 0;
                         setDragging(null);
                         /* A press that did not move is a press, not a drag. */
                         if (by === 0) return;
                         void patch({
                           action: 'nudge-take', takeId: take.id,
                           nudgeSamples: (take.alignment.nudgeSamples ?? 0) + by,
                         });
                       }}
                       onPointerCancel={() => setDragging(null)}
                       style={{
                         position: 'absolute', left: pct(shown),
                         width: pct(Math.max(0, to - from)), top: 2, bottom: 2,
                         borderRadius: 3, padding: 0,
                         border: `1px solid ${take.accent ?? TAKE_ACCENT_FALLBACK}`,
                         backgroundColor: `${take.accent ?? TAKE_ACCENT_FALLBACK}22`,
                         backgroundImage:
                           `url(/api/performances/${performance.id}/takes/${take.id}/media?kind=strip)`,
                         backgroundSize: '100% 100%',
                         // A take nobody has placed is drawn faint: it is at zero
                         // because something had to be. [§10]
                         opacity: placed ? 1 : 0.4,
                         cursor: held ? 'grabbing' : 'grab',
                         touchAction: 'none',
                       }} />
                  {/*
                    * WHAT THE DRAG IS DOING, IN WORDS, WHILE IT HAPPENS.
                    * A block sliding under the pointer says which way;
                    * it does not say how far, and "how far" is the whole
                    * decision. [U-19]
                    */}
                  {held && held.by !== 0 && (
                    <span data-testid="take-lane-drag" className="readout" style={{
                      position: 'absolute', left: pct(shown), top: -2,
                      padding: '1px 5px', fontSize: 'var(--text-2xs)',
                      background: 'rgba(0,0,0,0.72)',
                      border: '1px solid rgba(255,255,255,0.16)',
                      borderRadius: 'var(--radius-screen)', whiteSpace: 'nowrap',
                    }}>
                      {formatMasterPosition(shown)}
                      {` \u00b7 ${held.by > 0 ? '+' : '\u2212'}`}
                      {formatMasterPosition(Math.abs(held.by))}
                    </span>
                  )}
                </div>
              );
            })}

            {/*
              * THE SOUNDS, ON THE SAME FOUR MINUTES AS EVERYTHING ELSE.
              *   [TIMELINE B8, B12]
              *
              * Each block is where its sound is heard, drawn from
              * `soundOnSong` — the same function the planner and the
              * mixer read, so a block cannot draw in one place and
              * play in another. That divergence was real on the take
              * lane for months and nothing could show it. [D-19]
              *
              * Right-click it for what can be done to it, drag it to
              * move it: the same two gestures the take lane teaches,
              * and the reason a second editing system was not built.
              */}
            {/* Their lanes, empty: the two columns are rows of one grid
                and a head with no lane opposite shifts everything
                under it. */}
            {voice.phase !== 'idle' && <div style={{ height: 26 }} />}
            {adding && <div style={{ height: 26 }} />}
            {soundLanes.map((lane) => (
              <div key={lane.id} data-testid="sound-lane" data-track={lane.id}
                   style={{ position: 'relative', height: 26 }}>
                {lane.layers.map((layer) => {
                  const on = soundOnSong(layer, duration);
                  const held = soundDrag?.soundId === layer.id ? soundDrag : null;
                  const shown = held
                    ? Math.max(0, Math.min(duration, on.fromSample + held.by))
                    : on.fromSample;
                  return (
                    <div key={layer.id} role="button" tabIndex={-1}
                         data-testid="sound-block" data-sound-id={layer.id}
                         data-from={shown}
                         title={`Drag to move ${layer.label} along the song`
                           + ' \u2014 right-click for what else can be done to it'}
                         {...onRow(layer.label, () => soundMenu(layer))}
                         onPointerDown={(event) => {
                           event.currentTarget.setPointerCapture(event.pointerId);
                           setSoundDrag({
                             soundId: layer.id, at: event.clientX, by: 0,
                           });
                         }}
                         onPointerMove={(event) => {
                           if (soundDrag?.soundId !== layer.id) return;
                           const box = lanes.current?.getBoundingClientRect();
                           if (!box || box.width <= 0) return;
                           setSoundDrag({
                             ...soundDrag,
                             by: Math.round(
                               ((event.clientX - soundDrag.at) / box.width)
                               * duration / zoom),
                           });
                         }}
                         onPointerUp={(event) => {
                           event.currentTarget.releasePointerCapture(event.pointerId);
                           const by = soundDrag?.soundId === layer.id
                             ? soundDrag.by : 0;
                           setSoundDrag(null);
                           /* A press that did not move is a press. */
                           if (by === 0) return;
                           void patch({
                             action: 'move-sound', soundId: layer.id,
                             fromSample: Math.max(0, Math.min(
                               duration, layer.fromSample + by)),
                           });
                         }}
                         onPointerCancel={() => setSoundDrag(null)}
                         style={{
                           position: 'absolute', left: pct(shown),
                           width: pct(Math.max(
                             HOUSE_SAMPLE_RATE / 20, on.toSample - on.fromSample)),
                           top: 3, bottom: 3, borderRadius: 3,
                           padding: '0 5px', overflow: 'hidden',
                           whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                           font: 'inherit', fontSize: 'var(--text-2xs)',
                           lineHeight: '20px', textAlign: 'left',
                           color: 'var(--ink-000)',
                           border: `1px solid ${SOUND_ACCENT[layer.track]}`,
                           background: `${SOUND_ACCENT[layer.track]}2e`,
                           /* Muted is drawn faint, never removed: it is
                              still on the timeline where it was left. */
                           opacity: layer.muted ? 0.35 : 1,
                           cursor: held ? 'grabbing' : 'grab',
                           touchAction: 'none',
                         }}>
                      {layer.muted ? '\u2014 ' : ''}{layer.label}
                      {layer.loop ? ' \u21bb' : ''}
                    </div>
                  );
                })}
              </div>
            ))}

            <div data-testid="master-timeline" style={{
              position: 'relative', height: 44, borderTop: '1px solid var(--line)',
            }}>
              {/*
                * UNDER THE SCENES, not over them: a scene that covers this
                * stretch is the answer, and the mark is what shows through
                * where there is none. Hatched rather than flooded, because
                * a solid amber band would read as a THING on the timeline,
                * and a hole is the absence of one.
                */}
              {holes.map((hole) => (
                <div key={`hole-${hole.kind}-${hole.fromSample}`}
                     data-testid="timeline-hole" data-kind={hole.kind}
                     title={hole.say}
                     style={{
                       position: 'absolute', top: 4, bottom: 4,
                       left: pct(hole.fromSample!),
                       width: pct(hole.toSample! - hole.fromSample!),
                       borderRadius: 'var(--radius-screen)',
                       border: 'var(--border) solid rgba(232,179,60,0.44)',
                       backgroundImage: 'repeating-linear-gradient(45deg,'
                         + ' rgba(232,179,60,0.16) 0 5px, transparent 5px 10px)',
                     }} />
              ))}
              {ordered.map((scene, i) => {
                const to = ordered[i + 1]?.fromSample ?? duration;
                const take = performance.takes.find((t) => t.id === scene.takeIds[0]);
                const chosen = selection?.kind === 'clip'
                  && selection.sceneId === scene.id;
                return (
                  <button key={scene.id} type="button" data-testid="timeline-scene"
                       data-scene-id={scene.id} data-from={scene.fromSample}
                       data-selected={chosen ? 'true' : 'false'}
                       aria-pressed={chosen}
                       title={scene.label ?? LAYOUTS[scene.layoutId]?.label ?? scene.layoutId}
                       /* Selecting must not also move the playhead — the
                          lane column seeks on click, and a clip being
                          inspected is not a place you asked to hear. */
                       onClick={(event) => {
                         event.stopPropagation();
                         setSelection(chosen ? null : { kind: 'clip', sceneId: scene.id });
                       }}
                       style={{
                         position: 'absolute', top: 4, bottom: 4,
                         left: pct(scene.fromSample), width: pct(to - scene.fromSample),
                         // The take's own colour, so this strip and the lanes
                         // above it are plainly about the same takes. [§2]
                         background: `${take?.accent ?? TAKE_ACCENT_FALLBACK}33`,
                         borderLeft: `3px solid ${take?.accent ?? TAKE_ACCENT_FALLBACK}`,
                         borderRadius: 'var(--radius-screen)',
                         padding: '3px 6px', fontSize: 'var(--text-2xs)',
                         overflow: 'hidden', textAlign: 'left',
                         font: 'inherit', color: 'inherit', cursor: 'pointer',
                         /* The chosen clip is lit on its own outline, the
                            same cue the rails use. [brief §3] */
                         border: chosen ? '1px solid var(--accent)' : '1px solid transparent',
                         boxShadow: chosen ? 'inset 0 0 0 1px rgba(63,142,232,0.35)' : 'none',
                       }}>
                    <span style={{ display: 'block', fontWeight: 600 }}>
                      {scene.takeIds.map((tid) =>
                        performance.takes.find((t) => t.id === tid)?.label ?? '?').join(' + ')}
                    </span>
                    <span className="muted" style={{ fontSize: 'var(--text-2xs)' }}>
                      {clock(scene.fromSample)} – {clock(to)}
                    </span>
                  </button>
                );
              })}

              {/*
                * THE JOINS, AS THINGS.  [MASTER-EDIT §3]
                *
                * A transition is not a property of a clip you read down a
                * list — it is the seam between two of them, and it is at a
                * place on the timeline. A handle on that place is the only
                * honest way to point at it. It is stored on the LATER scene,
                * which is the same fact said in the document: `transition`
                * is how a scene ARRIVES.
                */}
              {ordered.slice(1).map((scene) => {
                const chosen = selection?.kind === 'join'
                  && selection.sceneId === scene.id;
                const style = scene.transition ?? 'cut';
                return (
                  <button key={`join-${scene.id}`} type="button"
                          data-testid="timeline-join" data-scene-id={scene.id}
                          data-style={style}
                          data-selected={chosen ? 'true' : 'false'}
                          aria-pressed={chosen}
                          aria-label={`Transition at ${clock(scene.fromSample)}`}
                          title={`${TRANSITIONS[style]?.label ?? style} · ${clock(scene.fromSample)}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelection(chosen ? null : { kind: 'join', sceneId: scene.id });
                          }}
                          style={{
                            position: 'absolute', top: 0, bottom: 0,
                            /* Centred ON the seam, because that is where it
                               is — and wide enough to hit on a laptop. */
                            left: `calc(${pct(scene.fromSample)} - 6px)`,
                            width: 12, padding: 0, background: 'transparent',
                            border: 0, cursor: 'pointer', display: 'grid',
                            placeItems: 'center',
                          }}>
                    <span aria-hidden="true" style={{
                      width: style === 'cut' ? 2 : 8, height: 14,
                      borderRadius: 'var(--radius-screen)',
                      background: chosen ? 'var(--accent)' : 'rgba(255,255,255,0.34)',
                      /* A cut is a line; a mix is a band. Shape as well as
                         colour, so the two are told apart without it. [U-19] */
                      border: style === 'cut' ? 0
                        : `1px solid ${chosen ? 'var(--accent)' : 'rgba(255,255,255,0.5)'}`,
                    }} />
                  </button>
                );
              })}
              {beats && marks.map((at) => (
                <div key={at} data-testid="beat-mark" style={{
                  position: 'absolute', top: 0, height: 5, width: 1,
                  background: beats.acceptedBy
                    ? 'rgba(224,193,79,0.85)' : 'rgba(255,255,255,0.28)',
                  left: pct(at),
                }} />
              ))}
            </div>

            {/*
              * THE LINE, AND A HANDLE SAYING IT CAN BE TAKEN HOLD OF.
              *
              * The line itself stays `pointerEvents: none` — it is two
              * pixels wide and moves ten times a second, which is the
              * worst drag target a studio could offer. The pointer falls
              * through it to the ruler underneath, which is the strip
              * that actually scrubs, so the whole width of the song is
              * grabbable rather than two pixels of it.
              *
              * The tab is what makes that discoverable: a grab handle
              * drawn at the top of the line, in the ruler band, where
              * the pointer already turns into a scrub cursor. Shape and
              * cursor, not colour alone. [U-19]
              */}
            <div data-testid="playhead" aria-hidden="true" style={{
              position: 'absolute', top: 14, bottom: 0, width: 2,
              background: '#e0674f', left: pct(player.position), pointerEvents: 'none',
            }}>
              <span data-testid="playhead-grip" style={{
                position: 'absolute', top: -13, left: -4, width: 10, height: 13,
                borderRadius: '2px 2px 5px 5px',
                background: '#e0674f',
                boxShadow: scrubbing ? '0 0 0 2px rgba(224,103,79,0.35)' : 'none',
              }} />
            </div>
          </div>
          </div>
        </div>
      </div>

      {/*
        * THE INSPECTOR SITS UNDER THE THING IT INSPECTS.  [MASTER-EDIT §2]
        *
        * Not in the composition rail, which sets the NEXT cut and would
        * have to change meaning when something is selected — a mode, and
        * an invisible one. Under the timeline it is beside the block it is
        * about, and it is simply absent when nothing is selected.
        */}
      {selection && (
        <ClipInspector
          performance={performance} selection={selection} usable={usable}
          busy={false}
          onAct={(body) => {
            if (body['action'] === 'move-scene-to-playhead') {
              void patch({
                action: 'move-scene', sceneId: body['sceneId'],
                at: Math.round(player.positionNow()),
              });
              return;
            }
            if (body['action'] === 'remove-scene') setSelection(null);
            void patch(body);
          }}
          onClose={() => setSelection(null)}
        />
      )}

      {/* ---- the transport (§7) ---------------------------------------- */}
      {/*
        * THREE GROUPS, LEFT TO CENTRE TO RIGHT.
        *
        * Transport on the left — play, where the song is, how loud it is in
        * the room. Directing in the middle — the number keys, which are the
        * one control you use while it is running, so they sit under the
        * stage rather than off at an edge. Everything that acts on the WHOLE
        * edit on the right: beats, transitions, and the render.
        *
        * It is a grid rather than a flex row with `marginLeft: auto`, because
        * the keys have to stay centred under the stage whether there is one
        * of them or nine — and an auto margin centres nothing, it just pushes.
        */}
      <div data-testid="transport" style={{
        gridArea: 'transport',
        display: 'grid', alignItems: 'center', gap: 12,
        /*
         * Equal outer columns so the middle one is centred in the BAR, and
         * therefore under the stage. Matching the studio's own column widths
         * would not centre it: the takes rail is 330 and the composition
         * panel 360, and a centre computed from unequal sides is not one.
         */
        gridTemplateColumns: '1fr auto 1fr',
        /*
         * A TRANSPORT IS PART OF THE DESK. It was a rounded card
         * floating under the stage; it is the strip the edit is driven
         * from, which makes it the same object as Online TV's master
         * control bar. Same face, same bevel, same 4px. [brief §12]
         */
        border: '1px solid var(--console-edge)',
        borderRadius: 'var(--radius-module)',
        background: 'var(--console-face)',
        boxShadow: 'var(--console-bevel)',
        padding: '9px 13px',
      }}>
        {/* ---- left: play, position, monitoring level ---------------- */}
        <div className="row" style={{ gap: 10, alignItems: 'center', minWidth: 0 }}>
          {/*
            * A 40px BLUE CIRCLE IS A MEDIA-PLAYER BUTTON, which is the
            * right object on a podcast page and the wrong one on a
            * desk. Every transport ever built — tape, vision mixer,
            * edit controller — uses square keys, because they sit in a
            * row and a row of circles has gaps in it. Same key as
            * Online TV's transport, which is now the same shape.
            */}
          {/*
            * BACK TO THE VERY BEGINNING, as one press.
            *
            * The song's start is the position an author returns to more
            * often than any other — every time they want to watch the
            * opening again — and reaching it by dragging meant landing
            * on sample 400 and wondering why the first frame looked
            * wrong. A scrub can reach zero and a key can be held; this
            * is the one that cannot miss.
            */}
          <button className="ctl" data-testid="player-start"
                  disabled={!player.ready}
                  onClick={() => player.seek(0)}
                  title="Back to the start of the song"
                  aria-label="Back to the start of the song"
                  style={{
                    width: 34, height: 30, padding: 0, flex: '0 0 auto',
                    display: 'grid', placeItems: 'center',
                  }}>
            <Icon name="start" size={12} />
          </button>
          <button className="ctl" data-testid="player-play"
                  disabled={!player.ready}
                  onClick={() => (player.playing ? player.pause() : void player.play())}
                  title={player.playing ? 'Pause' : 'Play the song'}
                  style={{
                    width: 34, height: 30, padding: 0, flex: '0 0 auto',
                    display: 'grid', placeItems: 'center',
                  }}>
            <Icon name={player.playing ? 'pause' : 'play'} size={12} />
          </button>
          {/*
            * THE CLOCK IS A WAY IN, NOT A LABEL.  [TIMELINE B3b]
            *
            * "Jump to an exact moment." A drag is one guess per press
            * and a click on a four-minute lane is worth about a
            * second; when an author knows they want 02:41 the fastest
            * route is to say so. The readout was already showing the
            * number, so it is the obvious thing to press — and it
            * stays a readout, in the same type, because a control
            * that shouts is a control in the way.
            */}
          <button className="mono readout" data-testid="player-goto"
                  title="Go to an exact moment"
                  onClick={() => confirm({
                    question: 'Where in the song? Minutes and seconds \u2014 '
                      + `2:41, 2:41.500 or just 161. The song is ${clock(duration)}.`,
                    field: {
                      label: 'Go to',
                      initial: formatMasterPosition(Math.round(player.position)),
                    },
                    verb: 'Go there',
                    go: (typed) => {
                      const at = parseMasterPosition(typed ?? '');
                      /* Nothing rather than zero: seeking to the start
                         because somebody typed a word is a jump they
                         did not ask for. */
                      if (at === null) {
                        setError('that is not a time in this song');
                        return;
                      }
                      setError(null);
                      player.seek(Math.max(0, Math.min(duration, at)));
                    },
                  })}
                  style={{
                    fontSize: 'var(--text-xs)', flex: '0 0 auto',
                    color: 'var(--ink-050)', background: 'none',
                    border: 0, padding: 0, cursor: 'pointer',
                  }}>
            {formatMasterPosition(Math.round(player.position))}
            <span style={{ color: 'var(--ink-400)' }}> / {clock(duration)}</span>
          </button>
          {/*
            * MONITORING, NOT MIXING. This is how loud the song is in the room
            * while somebody directs. It is not written to the document and it
            * changes nothing about the render — turning the song down to hear
            * yourself think must not turn it down in the finished video. [§9]
            */}
          <label className="row" style={{ gap: 5, alignItems: 'center', minWidth: 0 }}
                 title="How loud the song is here. The render is unaffected.">
            <span aria-hidden="true" style={{ fontSize: 'var(--text-sm)', opacity: 0.7 }}>
              {player.volume === 0 ? '\ud83d\udd07' : '\ud83d\udd0a'}
            </span>
            <input
              type="range" min={0} max={100} step={1}
              data-testid="monitor-volume"
              aria-label="Monitoring volume"
              value={Math.round(player.volume * 100)}
              onChange={(e) => player.setVolume(Number(e.target.value) / 100)}
              style={{ width: 74, accentColor: 'var(--accent)' }}
            />
          </label>
        </div>

        {/* ---- centre: the number keys, under the stage -------------- */}
        {/*
          * As buttons in the takes' own colours. Pressing them and clicking
          * them write the same scene through the same function — the keyboard
          * is faster, not different. [§7]
          */}
        <div className="row" data-testid="take-keys" style={{
          gap: 6, justifyContent: 'center', flexWrap: 'wrap',
        }}>
          {usable.slice(0, 9).map((take, index) => (
            <button key={take.id} type="button" data-testid="take-key"
                    data-take-id={take.id}
                    onClick={() => choose(index)}
                    title={`${take.label} \u2014 key ${index + 1}`}
                    /*
                      * THE NUMBER KEYS ARE INPUTS ON A SWITCHER, and
                      * they keep the take's own colour because that
                      * colour is the thread running through the rail,
                      * the stage badge and every block of the master.
                      * What changes is the shape: 3px rather than 7,
                      * and the armed one is marked with a tally along
                      * its top edge rather than outlined in white —
                      * an outline changes the key's size by two pixels
                      * and the row shifts as you arm one. [§7]
                      */
                    style={{
                      width: 32, height: 30, borderRadius: 3, padding: 0,
                      fontWeight: 'var(--weight-bold)',
                      fontSize: 'var(--text-sm)', cursor: 'pointer',
                      color: '#0a0c10',
                      background: take.accent ?? TAKE_ACCENT_FALLBACK,
                      border: '1px solid rgba(0,0,0,0.4)',
                      borderTop: pending.includes(take.id)
                        ? '3px solid #fff' : '1px solid rgba(0,0,0,0.4)',
                      boxShadow: 'var(--console-bevel)',
                    }}>
              {index + 1}
            </button>
          ))}
        </div>

        {/* ---- right: what acts on the whole edit -------------------- */}
        <div className="row" style={{
          gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap',
          fontSize: 'var(--text-sm)', whiteSpace: 'nowrap',
        }}>
          {/*
            * UNDO FIRST IN THE GROUP THAT ACTS ON THE WHOLE EDIT, because
            * that is what it acts on. A bank of two, because they are one
            * control with two directions. [§12 P1]
            */}
          <div className="ctl-bank is-across" data-testid="history">
            <button className="ctl" data-testid="undo" disabled={!history.canUndo}
                    title="Undo the last change to this performance"
                    onClick={() => { void step('undo'); }}
                    style={{ padding: '5px 9px' }}>Undo</button>
            <button className="ctl" data-testid="redo" disabled={!history.canRedo}
                    title="Put back the change you just undid"
                    onClick={() => { void step('redo'); }}
                    style={{ padding: '5px 9px' }}>Redo</button>
          </div>
          {beats && (
            <button className="small" data-testid="snap-to-beat"
                    disabled={!beats.acceptedBy && !snap}
                    onClick={() => {
                      if (!beats.acceptedBy) { void accept(); setSnap(true); return; }
                      setSnap(!snap);
                    }}
                    style={{
                      background: snap ? 'rgba(224,193,79,0.22)' : undefined,
                      borderColor: snap ? '#e0c14f' : undefined,
                    }}>
              Snap{beats.bpm ? ` \u00b7 ${Math.round(beats.bpm)} BPM` : ' to beat'}
            </button>
          )}
          <button className="small" data-testid="show-transitions"
                  disabled={ordered.length < 2}
                  onClick={() => setShowTransitions(!showTransitions)}
                  style={{
                    background: showTransitions ? 'rgba(45,110,200,0.22)' : undefined,
                    borderColor: showTransitions ? '#3d7fd6' : undefined,
                  }}>
            Transitions{ordered.length > 1 ? ` \u00b7 ${ordered.length - 1}` : ''}
          </button>
          {/*
            * Takes you to the render, rather than starting one.
            *
            * A master carries a shape, a rights posture and a list of past
            * renders, and the panel that holds those is the one place that
            * knows them. A second button that started a render would be a
            * second place the rights gate could be got wrong. [§14, INV-15]
            */}
          <button className="ctl" data-testid="to-master"
                  disabled={ordered.length === 0}
                  onClick={() => document.querySelector('[data-testid="master-render"]')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            Create master
          </button>
        </div>
      </div>

      {/* ---- everything that is said rather than shown ----------------- */}
      {/*
        * ABOVE the transport, not below it.
        *
        * Under the bar these were the last thing on the page, which on a
        * laptop is the first thing off it — a hint you have to scroll for is
        * a hint nobody reads. The row only exists when it has something in
        * it, so the transport keeps its place until there is news.
        */}
      <div style={{
        gridArea: 'notes', display: 'flex', flexDirection: 'column', gap: 6,
      }}>
      {beats && !beats.acceptedBy && (
        <p className="small muted" data-testid="beats-suggestion" style={{ margin: 0 }}>
          A pulse of about {Math.round(beats.bpm)} BPM was detected, at{' '}
          {Math.round(beats.confidence * 100)}% confidence. Turning on snapping
          accepts it — nothing moves a cut until you do. [§11]
        </p>
      )}
      {snapped !== null && (
        <p className="small" data-testid="snapped-note" style={{ margin: 0 }}>
          Moved to the nearest beat.
        </p>
      )}

      {/* ---- how one scene becomes the next (§11) ---------------------- */}
      {ordered.length > 1 && showTransitions && (
        <div className="row" data-testid="transitions" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className="small muted" style={{ fontSize: 'var(--text-xs)' }}>Transitions</span>
          {ordered.slice(1).map((scene) => (
            <select key={scene.id} className="small" data-testid="scene-transition"
                    data-scene-id={scene.id}
                    value={scene.transition ?? 'cut'}
                    onChange={(e) => void patch({
                      action: 'set-transition', sceneId: scene.id,
                      transition: e.target.value === 'cut' ? null : e.target.value,
                    })}
                    style={{ width: 'auto', fontSize: 'var(--text-xs)', padding: '2px 6px' }}>
              {Object.values(TRANSITIONS).map((t) => (
                <option key={t.id} value={t.id}>
                  {clock(scene.fromSample)} · {t.label}
                </option>
              ))}
            </select>
          ))}
        </div>
      )}

      {/*
        * A FIRST CUT, OFFERED ONLY WHERE THERE IS NOTHING TO LOSE.
        * [MASTER-EDIT §12 P3; Doctrine U-15, U-04, AI_MAY 'suggest structure']
        *
        * An empty Master Video lane is the one moment this is a gift
        * rather than a threat: there is no arrangement to overwrite, and
        * the blank timeline is the hardest part of this studio to start
        * from. `worthProposing` is what makes that true, and it is in the
        * domain rather than here so the rule is one rule.
        *
        * IT SAYS ITS METHOD BEFORE IT ACTS. The author presses a button
        * that describes what it will do — how many sections, cut on what —
        * because "make me a first cut" from a machine that will not say
        * how is the thing U-15 exists to refuse. And it is one press to
        * undo, because undo exists.
        */}
      {worthProposing(performance) && (() => {
        const cut = proposeFirstCut(performance);
        if (cut.refused) {
          return (
            <p className="small muted" data-testid="first-cut-refused"
               style={{ margin: 0 }}>
              {`A first cut is not possible yet: ${cut.refused}.`}
            </p>
          );
        }
        return (
          <div className="row" data-testid="first-cut"
               style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <button className="ctl" data-testid="first-cut-apply"
                    onClick={() => { void applyFirstCut(cut.scenes); }}>
              Make a first cut
            </button>
            <span className="small muted" style={{ flex: '1 1 240px', minWidth: 0 }}>
              {`${cut.says}. Nothing here can hear the song — change any of `
                + 'it, or press undo.'}
            </span>
          </div>
        );
      })()}

      {pending.length > 0 && (
        <p className="small muted" data-testid="pending-hint" style={{ margin: 0 }}>
          {pending.length} of {slots} chosen. Pick {slots - pending.length} more.
        </p>
      )}
      {error && (
        <p className="small" data-testid="stage-error"
           style={{ color: 'var(--bad)', margin: 0 }}>{error}</p>
      )}
      </div>
    </div>
  );
}
