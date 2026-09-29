'use client';

import type { AudioMode, Performance, Scene } from '../../../src/domain/performance.js';
import { joinRoom, orderedScenes } from '../../../src/domain/performance.js';
import { LAYOUTS, takeSlots } from '../../../src/domain/presentation.js';
import {
  MAX_TRANSITION_FRAMES, MIN_TRANSITION_FRAMES, TRANSITIONS, TRANSITION_ALIGNS,
  transitionAlignOf, transitionOf,
} from '../../../src/domain/transitions.js';
import { HOUSE_FPS, formatMasterPosition, framesToSeconds } from '../../../src/domain/time.js';

/**
 * What a segment of the Master Video IS, and what can be done to it.
 * [Doctrine STUDIO-TWO §7, §8, §11, MASTER-EDIT §2, §3, §4]
 *
 * THE MASTER VIDEO LANE WAS A PICTURE OF THE EDIT, NOT THE EDIT. It drew a
 * block per scene, with the take's colour and its clock range on it, and
 * answered no click at all. Everything a person would want to do to one of
 * those blocks — swap the take in it, change its arrangement, change how it
 * arrives, give it its own sound — existed as a domain operation and was
 * reachable from somewhere else: the composition rail (which sets the NEXT
 * cut, not the selected one), a `<select>` behind a Transitions toggle, a
 * disclosure called Audio settings, and a menu on the programme monitor.
 *
 * Four places, none of them the block. Selecting the thing and being shown
 * what it is, is how every editor has worked since they had mice.
 *
 * IT SHOWS STATE, WHICH IS WHY IT IS NOT THE MONITOR'S MENU. A menu offers
 * actions; an inspector shows the clip's arrangement, its transition and its
 * sound as they ARE, so an author can see that this scene is on Half and the
 * next one is on Full without pressing anything. The menu stays: the same
 * operations, reached from the picture, for somebody working at speed. One
 * list of operations, two ways in — which is the rule the product's own Menu
 * component was built on. [D-19]
 *
 * WHAT IT DELIBERATELY DOES NOT HAVE YET, said out loud rather than drawn
 * as a dead control:
 *
 *   TRIM IN/OUT per segment. A Scene has a `fromSample` and no end — it runs
 *   until the next one begins, which is what makes the picture track a
 *   PARTITION of the song and therefore continuous by construction. Giving a
 *   scene its own out-point would let two scenes leave a hole between them,
 *   which is the one thing INV-03 exists to prevent. Moving a boundary is
 *   `moveScene`, and that is the honest operation here.
 *
 * TRANSITION DURATION AND ALIGNMENT USED TO BE ON THAT LIST, and the reason
 * given was that duration "is a constraint satisfaction problem against both
 * neighbours' coverage, not a number box". That was true about the
 * constraint and wrong about the conclusion: the constraint is CHECKABLE.
 * `joinProblems` is the same question MASTER CHECK asks before a render and
 * the planner asks before it builds one, so the length can be the author's
 * to set, with the + going dead at what the join can pay for and anything
 * the server still refuses being put back with the reason. [MASTER-EDIT §3]
 */

export type Selection =
  | { kind: 'clip'; sceneId: string }
  /** The join BETWEEN two scenes, stored on the later one. [MASTER-EDIT §3] */
  | { kind: 'join'; sceneId: string };

/**
 * A sixth of a second per press.
 *
 * Not one frame, which would take thirty presses to cross a second and
 * teaches an author that the control is for pedants; not a quarter second,
 * which cannot express the third-of-a-second default it starts from. Five
 * frames divides the dissolve's ten and the fade's twenty-four is two
 * presses off, which is close enough to walk to.
 */
const STEP = Math.round(HOUSE_FPS / 6);

const AUDIO_LABELS: Record<AudioMode, string> = {
  music_and_mic: 'Song and whoever is on screen',
  take_audio: 'Only this camera',
  master_vocal: 'Song and one vocal',
};

export default function ClipInspector({
  performance, selection, usable, busy, onAct, onClose,
}: {
  performance: Performance;
  selection: Selection;
  usable: { id: string; label?: string; accent?: string }[];
  busy: boolean;
  onAct: (body: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const ordered = orderedScenes(performance);
  const index = ordered.findIndex((scene) => scene.id === selection.sceneId);
  const scene = ordered[index];
  if (!scene) return null;
  const before = index > 0 ? ordered[index - 1] : undefined;
  const to = ordered[index + 1]?.fromSample ?? performance.master.durationSamples;
  const layout = LAYOUTS[scene.layoutId];
  const slots = takeSlots(layout ?? LAYOUTS['performance_full']!);
  const name = (id: string) =>
    usable.find((take) => take.id === id)?.label ?? 'a take';

  /*
   * REPLACING A TAKE MUST NOT MOVE THE BOUNDARY. `set-scene` at the scene's
   * OWN `fromSample` rewrites it in place; the switching path snaps to the
   * beat grid, which is right when placing a cut and wrong when swapping a
   * face. [MASTER-EDIT §4]
   */
  /** The scene's ids are branded; this talks to a JSON route. */
  const ids = (): string[] => [...scene.takeIds];

  const rewrite = (takeIds: string[], layoutId = scene.layoutId) => onAct({
    action: 'set-scene', at: scene.fromSample, layoutId, takeIds,
  });

  const head = (label: string, sub: string) => (
    <header className="module-head">
      <span className="module-label">{label}</span>
      <span className="module-sub grow" style={{ minWidth: 0 }}>{sub}</span>
      <button className="ctl sm" data-testid="inspector-close" onClick={onClose}
              title="Close the inspector (Esc)">Close</button>
    </header>
  );

  const group = (label: string, children: React.ReactNode) => (
    <div>
      <div className="module-label" style={{ marginBottom: 'var(--space-2)' }}>
        {label}
      </div>
      {children}
    </div>
  );

  /* ---- the join between two takes  [MASTER-EDIT §3] ------------------ */
  if (selection.kind === 'join') {
    const style = scene.transition ?? 'cut';
    const mix = transitionOf(scene).frames;
    const align = transitionAlignOf(scene);
    /*
     * The ceiling is the smaller of the two: a length the AUTHOR may type,
     * and a length this join can pay for. The room is asked of the same
     * function the edit and MASTER CHECK ask, so the + going dead and the
     * server refusing are the same answer arriving a moment apart. [D-19]
     */
    const room = joinRoom(ordered, index, performance.master.durationSamples);
    const ceiling = Math.min(
      MAX_TRANSITION_FRAMES,
      align === 'before' ? room.before
        : align === 'after' ? room.after
          : Math.min(room.before, room.after) * 2,
    );
    const timing = (body: { frames?: number | null; align?: string }) =>
      onAct({ action: 'transition-timing', sceneId: scene.id, ...body });
    return (
      <section className="module" data-testid="transition-inspector"
               data-scene-id={scene.id} style={{ gridArea: 'inspector' }}>
        {head('Transition',
          `${before ? name(before.takeIds[0] ?? '') : 'the start'} → ${name(scene.takeIds[0] ?? '')}`
          + ` · ${formatMasterPosition(scene.fromSample)}`)}
        <div className="module-body is-padded" style={{
          display: 'flex', flexDirection: 'column', gap: 'var(--space-4)',
        }}>
          {group('Type', (
            <div className="ctl-bank">
              {Object.values(TRANSITIONS).map((option) => (
                <button key={option.id} className={`ctl${style === option.id ? ' is-on' : ''}`}
                        data-testid="transition-type" data-style={option.id}
                        aria-pressed={style === option.id}
                        disabled={busy || !before}
                        title={before ? option.hint : 'nothing comes before it'}
                        onClick={() => onAct({
                          action: 'scene-transition', sceneId: scene.id,
                          transition: option.id,
                        })}
                        style={{ textAlign: 'left', padding: '7px 10px', display: 'block' }}>
                  <span style={{
                    fontWeight: 'var(--weight-semi)', fontSize: 'var(--text-sm)',
                    letterSpacing: 0, textTransform: 'none',
                  }}>{option.label}</span>
                  <span className="muted" style={{
                    display: 'block', fontSize: 'var(--text-2xs)', marginTop: 2,
                    letterSpacing: 0, textTransform: 'none',
                  }}>{option.hint}</span>
                </button>
              ))}
            </div>
          ))}
          {mix > 0 && group('Duration', (
            <div className="row" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              {/* is-across, because a stepper whose − sits above its + is a
                  list of two options and not a stepper. */}
              <div className="ctl-bank is-across">
                <button className="ctl" data-testid="transition-shorter"
                        disabled={busy || mix - STEP < MIN_TRANSITION_FRAMES}
                        title="A sixth of a second shorter"
                        onClick={() => timing({ frames: mix - STEP })}>&minus;</button>
                <button className="ctl" data-testid="transition-longer"
                        disabled={busy || mix + STEP > ceiling}
                        title={mix + STEP > ceiling
                          ? 'the sections either side cannot pay for more'
                          : 'A sixth of a second longer'}
                        onClick={() => timing({ frames: mix + STEP })}>+</button>
              </div>
              <span className="readout" data-testid="transition-duration"
                    style={{ fontSize: 'var(--text-sm)' }}>
                {`${framesToSeconds(mix).toFixed(2)}s`}
              </span>
              <span className="module-sub" data-testid="transition-frames">
                {`${mix} frames of ${ceiling}`}
              </span>
              {scene.transitionFrames !== undefined && (
                <button className="ctl sm" data-testid="transition-default"
                        disabled={busy} title="Back to this style's own length"
                        onClick={() => timing({ frames: null })}>Default</button>
              )}
            </div>
          ))}
          {mix > 0 && group('Paid by', (
            <div className="ctl-bank is-across">
              {(Object.keys(TRANSITION_ALIGNS) as (keyof typeof TRANSITION_ALIGNS)[])
                .map((id) => (
                  <button key={id} className={`ctl${align === id ? ' is-on' : ''}`}
                          data-testid="transition-align" data-align={id}
                          aria-pressed={align === id} disabled={busy}
                          title={TRANSITION_ALIGNS[id].hint}
                          onClick={() => timing({ align: id })}>
                    {TRANSITION_ALIGNS[id].label}
                  </button>
                ))}
            </div>
          ))}
          {/*
            * THE SENTENCE STAYS, THE LAST CLAUSE GOES. It used to end "not
            * yet yours to set", which described a constraint and drew the
            * conclusion that the author could not have the control. The
            * constraint is checkable — `joinProblems` is what MASTER CHECK
            * and the planner ask — so what it now says is what actually
            * binds, and the + goes dead at the bound rather than never
            * having been there. [MASTER-EDIT §3, INV-03]
            */}
          <p className="small muted" style={{ margin: 0, maxWidth: 560 }}>
            A transition is paid for out of the two shots it joins &mdash;
            because the song does not get longer to make room for it. That is
            what limits the length: {mix > 0
              ? `this join can spend ${ceiling} frames before one of the two
                 sections runs out, and both takes need picture across the
                 whole overlap.`
              : 'a cut is instant, so it costs neither of them anything.'}
          </p>
        </div>
      </section>
    );
  }

  /* ---- the clip itself  [MASTER-EDIT §2, §4] ------------------------- */
  return (
    <section className="module" data-testid="clip-inspector"
             data-scene-id={scene.id} style={{ gridArea: 'inspector' }}>
      {head('Master clip',
        `${scene.label ? `${scene.label} · ` : ''}`
        + `${formatMasterPosition(scene.fromSample)} – ${formatMasterPosition(to)}`)}

      <div className="module-body is-padded" style={{
        display: 'grid', gap: 'var(--space-5)',
        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
        alignItems: 'start',
      }}>
        {/* SOURCE — one row per panel, because a Half holds two. [§4] */}
        {group(slots === 1 ? 'Source' : 'Sources', (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {scene.takeIds.map((takeId, panel) => (
              <label key={panel} className="field" style={{ margin: 0 }}>
                {slots > 1 && (
                  <span className="module-sub">Panel {panel + 1}</span>
                )}
                <select
                  data-testid="clip-source" data-panel={panel}
                  disabled={busy} value={takeId}
                  onChange={(event) => {
                    const takeIds = ids();
                    takeIds[panel] = event.target.value;
                    rewrite(takeIds);
                  }}
                  style={{ fontSize: 'var(--text-sm)' }}
                >
                  {usable.map((take) => (
                    <option key={take.id} value={take.id}
                            disabled={take.id !== takeId
                              && ids().includes(take.id)}>
                      {take.label ?? take.id}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        ))}

        {/* COMPOSITION — the arrangements this many takes can fill. [U-18] */}
        {group('Composition', (
          <select data-testid="clip-layout" disabled={busy} value={scene.layoutId}
                  onChange={(event) => {
                    const next = LAYOUTS[event.target.value];
                    if (!next) return;
                    const want = takeSlots(next);
                    /* Fill new panels from the takes not already in the scene,
                       and drop the tail when the arrangement is smaller. */
                    const here = ids();
                    const spare = usable
                      .map((take) => take.id)
                      .filter((id) => !here.includes(id));
                    const takeIds = want <= here.length
                      ? here.slice(0, want)
                      : [...here, ...spare].slice(0, want);
                    if (takeIds.length !== want) return;
                    rewrite(takeIds, next.id);
                  }}
                  style={{ fontSize: 'var(--text-sm)' }}>
            {Object.values(LAYOUTS)
              .filter((option) => {
                const want = takeSlots(option);
                return want > 0 && want <= usable.length;
              })
              .map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
          </select>
        ))}

        {/* TRANSITION — the join, edited from the clip that arrives. [§11] */}
        {group('Transition', (
          <select data-testid="clip-transition" disabled={busy || !before}
                  title={before ? undefined : 'nothing comes before it'}
                  value={scene.transition ?? 'cut'}
                  onChange={(event) => onAct({
                    action: 'scene-transition', sceneId: scene.id,
                    transition: event.target.value,
                  })}
                  style={{ fontSize: 'var(--text-sm)' }}>
            {Object.values(TRANSITIONS).map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        ))}

        {/* AUDIO — this section only, when it differs. [S-7] */}
        {group('Audio', (
          <select data-testid="clip-audio" disabled={busy}
                  value={scene.audioMode ?? ''}
                  onChange={(event) => onAct({
                    action: 'scene-audio', sceneId: scene.id,
                    mode: event.target.value === '' ? null : event.target.value,
                  })}
                  style={{ fontSize: 'var(--text-sm)' }}>
            <option value="">Same as the rest</option>
            {(Object.keys(AUDIO_LABELS) as AudioMode[]).map((mode) => (
              <option key={mode} value={mode}>{AUDIO_LABELS[mode]}</option>
            ))}
          </select>
        ))}
      </div>

      <div className="module-body is-padded" style={{
        borderTop: 'var(--border) solid var(--console-rule)',
        display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap',
      }}>
        <button className="ctl sm" data-testid="clip-start-here" disabled={busy}
                title="move this clip's beginning to the playhead"
                onClick={() => onAct({ action: 'move-scene-to-playhead', sceneId: scene.id })}>
          Start at playhead
        </button>
        <button className="ctl sm" data-testid="clip-remove" disabled={busy}
                onClick={() => onAct({ action: 'remove-scene', sceneId: scene.id })}>
          Remove clip
        </button>
      </div>
    </section>
  );
}

/** Exported for the timeline, so a join and a clip agree on what they are. */
export function joinsOf(performance: Performance): Scene[] {
  return orderedScenes(performance).slice(1);
}
