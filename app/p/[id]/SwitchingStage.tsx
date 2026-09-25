'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MasterClass, Performance } from '../../../src/domain/performance.js';
import {
  MASTER_CLASSES, SPACES, isFootage, orderedScenes, sceneAt,
} from '../../../src/domain/performance.js';
import { EFFECT_LOOKS, SPACE_LOOKS } from '../../../src/domain/environment.js';
import { LAYOUTS, takeSlots } from '../../../src/domain/presentation.js';
import {
  BEATS_USABLE_CONFIDENCE, beatPositions, snapToBeat,
} from '../../../src/domain/beats.js';
import { TRANSITIONS } from '../../../src/domain/transitions.js';
import { HOUSE_SAMPLE_RATE, formatMasterPosition } from '../../../src/domain/time.js';
import { usePerformancePlayer } from './usePerformancePlayer.js';

/**
 * Directing the music video.  [Doctrine STUDIO-TWO §2, §5, §6, §7, §8, §15]
 *
 * "You press 1 → 3 → 2 → 4 → 2 → 1. Prof Class records those decisions onto
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
  performance_quad: 'Quad',
  performance_pip: 'PiP',
  performance_focus: 'Focus',
  performance_beside_master: 'Master',
};

/** The arrangements an author can reach with a key, in the order they appear. */
const ARRANGEMENTS = [
  'performance_full', 'performance_half', 'performance_quad',
  'performance_pip', 'performance_focus', 'performance_beside_master',
] as const;

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
  takesPanel?: React.ReactNode;
}) {
  const [arrangement, setArrangement] = useState<string>('performance_full');
  const [pending, setPending] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  /** Snapping is OFF until the author turns it on, which is the acceptance. */
  const [snap, setSnap] = useState(false);
  const [snapped, setSnapped] = useState<number | null>(null);
  /** The transitions row is asked for from the transport, not always on. */
  const [showTransitions, setShowTransitions] = useState(false);

  const ordered = orderedScenes(performance);
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
  const allTakes = multiview ?? usableIds.length > 1;
  const visible = allTakes ? usableIds : (current?.takeIds ?? []);

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

  const patch = useCallback(async (body: Record<string, unknown>) => {
    setError(null);
    const response = await fetch(`/api/performances/${performance.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error ?? 'that did not work'); return; }
    onChanged(data.performance);
  }, [onChanged, performance.id]);

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

  useEffect(() => {
    if (!live) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key >= '1' && event.key <= '9') {
        event.preventDefault();
        choose(Number(event.key) - 1);
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        if (player.playing) player.pause(); else void player.play();
      }
    };
    // Capture, so the page's other keys never swallow a switch mid-song.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [choose, live, player]);

  const duration = performance.master.durationSamples;
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

  /** Every take's own colour, so four rows are told apart before they are read. */
  const accentOf = (takeId: string | undefined) =>
    performance.takes.find((t) => t.id === takeId)?.accent ?? '#6fb3e0';

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
  const subject = usable.find((t) => t.id === chosen) ?? usable[0];

  const tile = (
    key: string, label: string, isChosen: boolean, onPick: () => void,
    testid: string, disabled?: boolean, swatch?: string, fullLabel?: string,
  ) => (
    <button
      key={key} type="button" data-testid={testid} data-option={key}
      data-chosen={isChosen ? 'true' : 'false'} disabled={disabled}
      onClick={onPick} title={fullLabel ?? label}
      style={{
        /*
         * SQUARE. The three pickers are one kind of control — pick one of
         * these — and a grid of squares says so at a glance; rectangles of
         * whatever height their label happened to need said the three groups
         * were three different things. The aspect ratio does the work, so a
         * one-word tile and a three-word tile are the same tile.
         */
        aspectRatio: '1 / 1',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 4, padding: '6px 4px',
        borderRadius: 7, cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1px solid ${isChosen ? '#3d7fd6' : 'var(--line)'}`,
        background: isChosen ? 'rgba(45,110,200,0.22)' : 'var(--panel-2)',
        color: 'inherit', font: 'inherit', fontSize: 11, lineHeight: 1.25,
        opacity: disabled ? 0.4 : 1, textAlign: 'center', width: '100%',
      }}
    >
      {swatch && (
        <span aria-hidden="true" style={{
          width: '100%', flex: '1 1 auto', minHeight: 0, borderRadius: 4,
          background: swatch,
        }} />
      )}
      <span style={{ flex: '0 0 auto' }}>{label}</span>
    </button>
  );

  const sectionTitle = (text: string, aside?: React.ReactNode) => (
    <div className="row" style={{
      alignItems: 'baseline', justifyContent: 'space-between', margin: '9px 0 5px',
    }}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{text}</span>
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
        + '"notes notes notes" "transport transport transport"',
      alignItems: 'start',
    }}>
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
          {takesPanel}
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
            background: '#05070a', borderRadius: 10,
            border: '1px solid var(--line)', overflow: 'hidden',
          }}
        >
          {visible.length === 0 && (
            <div className="small muted" style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center', textAlign: 'center',
              padding: 20,
            }}>
              Nothing is on screen at this moment. Press a number while the
              song plays, or pick a take below.
            </div>
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
                     backgroundColor: `${take.accent ?? '#3e7ca6'}22`,
                     backgroundImage:
                       `url(/api/performances/${performance.id}/takes/${take.id}/media?kind=poster)`,
                     backgroundSize: 'cover', backgroundPosition: 'center',
                     borderRadius: 6, overflow: 'hidden',
                     /* A gutter between monitors, so five panels read as
                        five and not as one wide picture. A border rather than
                        an inset shadow, because a shadow draws under the
                        video and a video fills its panel. Only on the
                        multiview: in Program the layout's rects ARE the
                        composition, and a gap the renderer will not draw
                        would be a preview that lies. */
                     ...(allTakes
                       ? { border: '2px solid #05070a', boxSizing: 'border-box' as const }
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
                    width: '100%', height: '100%', objectFit: 'cover',
                    display: 'block',
                  }}
                />
                {/* The take's name, in the take's colour, where the benchmark
                    puts it: bottom left of its own panel — with the key in
                    front of it on the multiview, because that is the whole
                    point of looking at them all at once. */}
                <span style={{
                  position: 'absolute', left: 6, bottom: 6, padding: '3px 7px',
                  borderRadius: 4, fontSize: 11, fontWeight: 600,
                  background: take.accent ?? '#3e7ca6', color: '#0a0c10',
                  maxWidth: 'calc(100% - 12px)', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {allTakes && key > 0 ? `${key} · ` : ''}{take.label}
                </span>
                {/*
                  * Clicking a monitor is pressing its number. The same
                  * function the key presses and the transport button call —
                  * three ways in, one scene written. [§7]
                  */}
                {allTakes && key > 0 && (
                  <button type="button" data-testid="monitor-pick"
                          data-take-id={take.id}
                          title={`Cut to ${take.label} — key ${key}`}
                          onClick={() => choose(key - 1)}
                          style={{
                            position: 'absolute', inset: 0, padding: 0,
                            background: 'transparent', border: 0,
                            cursor: 'pointer',
                          }} />
                )}
              </div>
            );
          })}
          <div style={{
            position: 'absolute', left: 10, top: 10, padding: '3px 8px',
            borderRadius: 4, background: 'rgba(5,7,10,0.78)', fontSize: 11,
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
                   position: 'absolute', right: 10, top: 10, gap: 0,
                   borderRadius: 6, overflow: 'hidden',
                   border: '1px solid rgba(255,255,255,0.18)',
                   background: 'rgba(5,7,10,0.78)',
                 }}>
              {([['program', 'Program'], ['all', 'All takes']] as const).map(([id, text]) => {
                const on = (id === 'all') === allTakes;
                return (
                  <button key={id} type="button" data-testid="stage-view-option"
                          data-option={id} data-chosen={on ? 'true' : 'false'}
                          onClick={() => setMultiview(id === 'all')}
                          style={{
                            border: 0, borderRadius: 0, padding: '4px 10px',
                            fontSize: 11, cursor: 'pointer', color: 'inherit',
                            background: on ? 'rgba(45,110,200,0.55)' : 'transparent',
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
                 border: '1px solid var(--line)', borderRadius: 10,
                 padding: '4px 12px 8px', background: 'var(--panel)',
               }}>
          {/*
            * WHAT IS CHOSEN, AND WHAT CAN BE DONE TO IT.  [§2, U-06]
            *
            * The rail became rows, which is what let five takes fit — and
            * renaming and deleting went with the cards. They belong here
            * rather than back on the row: the panel is already the place that
            * edits whichever take is chosen, and a delete button on every row
            * of a list is the one you press by accident.
            *
            * The name is committed on blur and on Enter, not on every
            * keystroke: a PATCH per letter is a document written fifteen
            * times to record one rename.
            */}
          {subject && (
            <>
              {sectionTitle('Take', (
                <button type="button" className="small" data-testid="remove-take"
                        title={`Remove ${subject.label} from this performance`}
                        onClick={() => {
                          if (!window.confirm(
                            `Remove "${subject.label}"? Its scenes go with it.`)) return;
                          void patch({ action: 'remove-take', takeId: subject.id });
                        }}
                        style={{
                          border: 0, background: 'none', padding: 0,
                          cursor: 'pointer', color: 'var(--bad)', fontSize: 11,
                        }}>
                  Remove
                </button>
              ))}
              <input
                data-testid="take-name" defaultValue={subject.label} key={subject.id}
                aria-label="What this take is called"
                onBlur={(event) => {
                  const next = event.target.value.trim();
                  if (next && next !== subject.label) {
                    void patch({ action: 'rename-take', takeId: subject.id, label: next });
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
                style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}
              />
            </>
          )}

          {sectionTitle('Composition')}
          {/* Five across: one row when the master has no picture to show, two
              when it has. Squares, like the other two groups, because they
              are all the same kind of control. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
            {ARRANGEMENTS
              .filter((a) => a !== 'performance_beside_master'
                || Boolean(performance.master.videoAssetId))
              .map((a) => tile(
                a, ARRANGEMENT_TILES[a] ?? LAYOUTS[a]!.label, arrangement === a,
                () => { setArrangement(a); setPending([]); },
                'arrangement', false, undefined, LAYOUTS[a]!.label))}
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
                <span className="small muted" style={{ fontSize: 10 }}>{subject.label}</span>
              ))}
              {/* Five across like every other group, so two choices are two
                  tiles rather than two slabs. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
                {tile('loop', 'Loops', subject.loop === true, () => void patch({
                  action: 'set-loop', takeId: subject.id, loop: true,
                }), 'footage-loop')}
                {tile('once', 'Plays once', subject.loop !== true, () => void patch({
                  action: 'set-loop', takeId: subject.id, loop: false,
                }), 'footage-loop')}
              </div>

              {sectionTitle('Whose footage', (
                <span className="small" style={{
                  fontSize: 10,
                  color: subject.rights && subject.rights !== 'third_party'
                    ? 'var(--muted)' : 'var(--warn)',
                }}>
                  {subject.rights ? '' : 'needed to publish'}
                </span>
              ))}
              {/* The same four the master answers, because it is the same
                  question with the same consequence. [INV-15] */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                {MASTER_CLASSES.map((cls: MasterClass) => tile(
                  cls, FOOTAGE_RIGHTS[cls]!, subject.rights === cls,
                  () => {
                    /*
                     * A licence has to say what it is, so the one that needs
                     * a note asks for it here rather than letting the domain
                     * refuse a click with an error nobody expected.
                     */
                    const note = cls === 'licensed' || cls === 'open'
                      ? window.prompt(
                        cls === 'licensed'
                          ? 'What licence permits this footage?'
                          : 'Where is it from, and what permits it?',
                        subject.rightsNote ?? '')
                      : null;
                    if ((cls === 'licensed' || cls === 'open') && !note?.trim()) return;
                    void patch({
                      action: 'set-footage-rights', takeId: subject.id,
                      rights: cls, rightsNote: note,
                    });
                  },
                  'footage-rights'))}
              </div>
              {subject.rightsNote && (
                <p className="small muted" style={{ fontSize: 10, margin: '6px 0 0' }}>
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
                <span className="small muted" style={{ fontSize: 10 }}>{subject.label}</span>
              )}
              {SPACES.length > 6 && (
                <button type="button" className="small" data-testid="view-all-spaces"
                        onClick={() => setAllSpaces(!allSpaces)}
                        style={{
                          border: 0, background: 'none', padding: 0, cursor: 'pointer',
                          color: '#5c9ee0', fontSize: 11,
                        }}>
                  {allSpaces ? 'Show fewer' : 'View all'}
                </button>
              )}
            </span>,
          )}
          {!subject ? (
            <p className="small muted" style={{ fontSize: 11, margin: 0 }}>
              Record or upload a take first.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
              {tile('original', 'Original',
                subject.environment.kind === 'original', () => void patch({
                  action: 'set-environment', takeId: subject.id,
                  environment: { kind: 'original' },
                }), 'environment-option', false, 'var(--panel-2)')}
              {tile('blur', 'Blur',
                subject.environment.kind === 'blur', () => void patch({
                  action: 'set-environment', takeId: subject.id,
                  environment: { kind: 'blur' },
                }), 'environment-option', !subject.plateAssetId, '#2a3038')}
              {(allSpaces ? SPACES : SPACES.slice(0, 6)).map((space) => tile(
                space.id, space.label,
                subject.environment.kind === 'space'
                  && subject.environment.spaceId === space.id,
                () => void patch({
                  action: 'set-environment', takeId: subject.id,
                  environment: { kind: 'space', spaceId: space.id },
                }),
                'environment-option',
                // Everything but their own room needs a measured plate, and
                // a tile that cannot do anything looks like a fault. [INV-16]
                !subject.plateAssetId,
                SPACE_SWATCHES[space.id] ?? '#1b2028',
              ))}
            </div>
          )}

            </>
          )}

          {sectionTitle('Effects')}
          {!subject ? null : (
            /* Five across: None and the four treatments, one row, no gap. */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
              {tile('none', 'None', !subject.effect, () => void patch({
                action: 'set-effect', takeId: subject.id, effect: null,
              }), 'effect-option')}
              {Object.values(EFFECT_LOOKS).map((look) => tile(
                look.id, look.label, subject.effect === look.id,
                () => void patch({
                  action: 'set-effect', takeId: subject.id, effect: look.id,
                }), 'effect-option'))}
            </div>
          )}

        </aside>
        </div>
      </>

      {/* ---- the song, the takes on it, and the edit (§2, §7, §8) ------ */}
      <div data-testid="performance-timeline" style={{
        gridArea: 'timeline',
        border: '1px solid var(--line)', borderRadius: 10,
        background: 'var(--panel)', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex' }}>
          {/* The names, in a fixed column, so every lane starts at one x. */}
          <div style={{
            width: 190, flex: '0 0 auto', borderRight: '1px solid var(--line)',
          }}>
            <div style={{ height: 18 }} />
            <div style={{ height: 52, padding: '6px 10px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
                MASTER SONG
              </div>
              <div className="small muted" style={{ fontSize: 10 }}>
                {performance.master.title}
              </div>
            </div>
            {usable.map((take) => (
              <button key={take.id} type="button" data-testid="lane-label"
                      data-take-id={take.id}
                      onClick={() => setChosen(take.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                        height: 30, padding: '0 10px', border: 0, font: 'inherit',
                        fontSize: 11, textAlign: 'left', cursor: 'pointer',
                        color: 'inherit',
                        background: subject?.id === take.id
                          ? 'rgba(45,110,200,0.16)' : 'transparent',
                      }}>
                <span aria-hidden="true" style={{
                  width: 8, height: 8, borderRadius: '50%', flex: '0 0 auto',
                  background: take.accent ?? '#3e7ca6',
                  opacity: take.alignment.method === 'unplaced' ? 0.4 : 1,
                }} />
                <span style={{ fontWeight: 600 }}>{take.label}</span>
              </button>
            ))}
            <div style={{
              height: 44, display: 'flex', alignItems: 'center', padding: '0 10px',
              borderTop: '1px solid var(--line)', fontSize: 11, fontWeight: 700,
              letterSpacing: 0.5,
            }}>
              MASTER VIDEO
            </div>
          </div>

          {/* Every lane, the same four minutes, one x per sample. */}
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}
               onClick={(e) => {
                 const box = e.currentTarget.getBoundingClientRect();
                 player.seek(Math.round(((e.clientX - box.left) / box.width) * duration));
               }}>
            <div data-testid="master-ruler" style={{ height: 18, position: 'relative' }}>
              {ticks.map((at) => (
                <span key={at} className="muted" style={{
                  position: 'absolute', left: pct(at * HOUSE_SAMPLE_RATE), top: 2,
                  fontSize: 9, fontFamily: 'ui-monospace, monospace',
                  transform: at === 0 ? 'none' : 'translateX(-50%)',
                }}>{clock(at * HOUSE_SAMPLE_RATE)}</span>
              ))}
            </div>

            <div data-testid="master-waveform" style={{ height: 52, position: 'relative' }}>
              {ordered.filter((s) => s.label).map((scene) => (
                <span key={scene.id} style={{
                  position: 'absolute', left: pct(scene.fromSample), top: 0,
                  fontSize: 10, paddingLeft: 5, color: 'rgba(255,255,255,0.72)',
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
              const from = Math.max(0, take.alignment.offsetSamples);
              const to = Math.min(duration, from + take.durationSamples);
              return (
                <div key={take.id} data-testid="take-lane" data-take-id={take.id}
                     data-placed={placed ? 'true' : 'false'}
                     style={{ position: 'relative', height: 30 }}>
                  <div style={{
                    position: 'absolute', left: pct(from),
                    width: pct(Math.max(0, to - from)), top: 2, bottom: 2,
                    borderRadius: 3,
                    border: `1px solid ${take.accent ?? '#3e7ca6'}`,
                    backgroundColor: `${take.accent ?? '#3e7ca6'}22`,
                    backgroundImage:
                      `url(/api/performances/${performance.id}/takes/${take.id}/media?kind=strip)`,
                    backgroundSize: '100% 100%',
                    // A take nobody has placed is drawn faint: it is at zero
                    // because something had to be. [§10]
                    opacity: placed ? 1 : 0.4,
                  }} />
                </div>
              );
            })}

            <div data-testid="master-timeline" style={{
              position: 'relative', height: 44, borderTop: '1px solid var(--line)',
            }}>
              {ordered.map((scene, i) => {
                const to = ordered[i + 1]?.fromSample ?? duration;
                const take = performance.takes.find((t) => t.id === scene.takeIds[0]);
                return (
                  <div key={scene.id} data-testid="timeline-scene"
                       data-scene-id={scene.id} data-from={scene.fromSample}
                       title={scene.label ?? LAYOUTS[scene.layoutId]?.label ?? scene.layoutId}
                       style={{
                         position: 'absolute', top: 4, bottom: 4,
                         left: pct(scene.fromSample), width: pct(to - scene.fromSample),
                         // The take's own colour, so this strip and the lanes
                         // above it are plainly about the same takes. [§2]
                         background: `${take?.accent ?? '#3e7ca6'}33`,
                         borderLeft: `3px solid ${take?.accent ?? '#3e7ca6'}`,
                         borderRadius: 4, padding: '3px 6px', fontSize: 10,
                         overflow: 'hidden',
                       }}>
                    <span style={{ display: 'block', fontWeight: 600 }}>
                      {scene.takeIds.map((tid) =>
                        performance.takes.find((t) => t.id === tid)?.label ?? '?').join(' + ')}
                    </span>
                    <span className="muted" style={{ fontSize: 9 }}>
                      {clock(scene.fromSample)} – {clock(to)}
                    </span>
                  </div>
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

            <div aria-hidden="true" style={{
              position: 'absolute', top: 14, bottom: 0, width: 2,
              background: '#e0674f', left: pct(player.position), pointerEvents: 'none',
            }} />
          </div>
        </div>
      </div>

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
        border: '1px solid var(--line)', borderRadius: 10,
        background: 'var(--panel)', padding: '10px 14px',
      }}>
        {/* ---- left: play, position, monitoring level ---------------- */}
        <div className="row" style={{ gap: 10, alignItems: 'center', minWidth: 0 }}>
          <button className="primary" data-testid="player-play" disabled={!player.ready}
                  onClick={() => (player.playing ? player.pause() : void player.play())}
                  title={player.playing ? 'Pause' : 'Play the song'}
                  style={{
                    width: 40, height: 40, borderRadius: '50%', padding: 0,
                    fontSize: 14, flex: '0 0 auto',
                  }}>
            {player.playing ? '\u275a\u275a' : '\u25b6'}
          </button>
          <span style={{
            fontFamily: 'ui-monospace, monospace', fontSize: 13, flex: '0 0 auto',
          }}>
            {formatMasterPosition(Math.round(player.position))}
            <span className="muted"> / {clock(duration)}</span>
          </span>
          {/*
            * MONITORING, NOT MIXING. This is how loud the song is in the room
            * while somebody directs. It is not written to the document and it
            * changes nothing about the render — turning the song down to hear
            * yourself think must not turn it down in the finished video. [§9]
            */}
          <label className="row" style={{ gap: 5, alignItems: 'center', minWidth: 0 }}
                 title="How loud the song is here. The render is unaffected.">
            <span aria-hidden="true" style={{ fontSize: 12, opacity: 0.7 }}>
              {player.volume === 0 ? '\ud83d\udd07' : '\ud83d\udd0a'}
            </span>
            <input
              type="range" min={0} max={100} step={1}
              data-testid="monitor-volume"
              aria-label="Monitoring volume"
              value={Math.round(player.volume * 100)}
              onChange={(e) => player.setVolume(Number(e.target.value) / 100)}
              style={{ width: 74, accentColor: '#3d7fd6' }}
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
                    style={{
                      width: 34, height: 34, borderRadius: 7, padding: 0,
                      fontWeight: 700, fontSize: 13, cursor: 'pointer',
                      color: '#0a0c10',
                      background: take.accent ?? '#3e7ca6',
                      border: pending.includes(take.id)
                        ? '2px solid #fff' : '1px solid rgba(0,0,0,0.35)',
                    }}>
              {index + 1}
            </button>
          ))}
          <button className="small" data-testid="live-switching"
                  onClick={() => { setLive(!live); setPending([]); }}
                  style={{
                    marginLeft: 6,
                    background: live ? 'rgba(45,110,200,0.28)' : undefined,
                    borderColor: live ? '#3d7fd6' : undefined,
                  }}>
            {live ? 'Directing \u2014 press 1\u20139' : 'Direct with the keys'}
          </button>
        </div>

        {/* ---- right: what acts on the whole edit -------------------- */}
        <div className="row" style={{
          gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap',
          fontSize: 12, whiteSpace: 'nowrap',
        }}>
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
          {/*
            * Half and double time sit ON the snap control, because they are
            * the same fact: a detector that hears a pulse at twice or half
            * what a person counts is the usual way beat detection is wrong,
            * and the correction belongs where the number it corrects is
            * printed — not in a row underneath the transport, where it was
            * the only thing below the bar and fell off the bottom. [§11]
            */}
          {beats?.acceptedBy && (
            <span className="row" data-testid="tempo" style={{ gap: 3 }}>
              <button className="small" data-testid="halve-tempo"
                      title={`Half time \u2014 ${Math.round(beats.bpm / 2)} BPM`}
                      onClick={() => void tempo(beats.bpm / 2)}
                      style={{ padding: '6px 8px' }}>&frac12;</button>
              <button className="small" data-testid="double-tempo"
                      title={`Double time \u2014 ${Math.round(beats.bpm * 2)} BPM`}
                      onClick={() => void tempo(beats.bpm * 2)}
                      style={{ padding: '6px 8px' }}>2&times;</button>
            </span>
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
          <button className="small" data-testid="clear-scenes"
                  disabled={ordered.length === 0}
                  title="Remove every cut and start the edit again"
                  onClick={() => void patch({ action: 'clear-scenes' })}>
            Clear
          </button>
          {/*
            * Takes you to the render, rather than starting one.
            *
            * A master carries a shape, a rights posture and a list of past
            * renders, and the panel that holds those is the one place that
            * knows them. A second button that started a render would be a
            * second place the rights gate could be got wrong. [§14, INV-15]
            */}
          <button className="primary" data-testid="to-master"
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
          <span className="small muted" style={{ fontSize: 11 }}>Transitions</span>
          {ordered.slice(1).map((scene) => (
            <select key={scene.id} className="small" data-testid="scene-transition"
                    data-scene-id={scene.id}
                    value={scene.transition ?? 'cut'}
                    onChange={(e) => void patch({
                      action: 'set-transition', sceneId: scene.id,
                      transition: e.target.value === 'cut' ? null : e.target.value,
                    })}
                    style={{ width: 'auto', fontSize: 11, padding: '2px 6px' }}>
              {Object.values(TRANSITIONS).map((t) => (
                <option key={t.id} value={t.id}>
                  {clock(scene.fromSample)} · {t.label}
                </option>
              ))}
            </select>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <p className="small muted" data-testid="pending-hint" style={{ margin: 0 }}>
          {pending.length} of {slots} chosen. Pick {slots - pending.length} more.
        </p>
      )}
      {error && <p className="small" style={{ color: 'var(--bad)', margin: 0 }}>{error}</p>}
      </div>
    </div>
  );
}
