'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Performance } from '../../../src/domain/performance.js';
import { orderedScenes, sceneAt } from '../../../src/domain/performance.js';
import { LAYOUTS, takeSlots } from '../../../src/domain/presentation.js';
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

/** The arrangements an author can reach with a key, in the order they appear. */
const ARRANGEMENTS = [
  'performance_full', 'performance_half', 'performance_quad', 'performance_focus',
] as const;

export default function SwitchingStage({
  performance, onChanged,
}: {
  performance: Performance;
  onChanged: (next: Performance) => void;
}) {
  const [arrangement, setArrangement] = useState<string>('performance_full');
  const [pending, setPending] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const ordered = orderedScenes(performance);
  const usable = performance.takes.filter((t) => t.durationSamples > 0);
  const slots = takeSlots(LAYOUTS[arrangement]!);

  const player = usePerformancePlayer(performance);
  const current = sceneAt(performance, Math.round(player.position));
  const visible = current?.takeIds ?? [];

  const write = useCallback(async (at: number, layoutId: string, takeIds: string[]) => {
    setError(null);
    try {
      const response = await fetch(`/api/performances/${performance.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'set-scene', at: Math.round(at), layoutId, takeIds }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'that did not work');
      onChanged(data.performance);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [onChanged, performance.id]);

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
  const pct = (samples: number) => `${Math.max(0, Math.min(100, (samples / duration) * 100))}%`;

  return (
    <div data-testid="switching-stage">
      {/* ---- what the viewer would see --------------------------------- */}
      <div
        data-testid="performance-stage"
        data-layout={current?.layoutId ?? 'none'}
        style={{
          position: 'relative', aspectRatio: '16 / 9', background: '#08090b',
          borderRadius: 10, border: '1px solid var(--line)', overflow: 'hidden',
        }}
      >
        {performance.takes.map((take) => {
          const layout = current ? LAYOUTS[current.layoutId] : undefined;
          const slot = current?.takeIds.indexOf(take.id) ?? -1;
          const layer = layout?.layers.filter((l) => l.source === 'take')[slot];
          const shown = slot >= 0 && Boolean(layer);
          return (
            <video
              key={take.id}
              ref={(el) => player.attach(take.id, el)}
              src={`/api/performances/${performance.id}/takes/${take.id}/media`}
              /*
               * MUTED, all of them. The song is the sound; §9's audio modes
               * decide what else is heard, and until they are built playing
               * four takes' microphones over the master would be noise.
               */
              muted
              playsInline
              preload="auto"
              data-testid="stage-take"
              data-take-id={take.id}
              data-shown={shown ? 'true' : 'false'}
              style={{
                position: 'absolute',
                display: shown ? 'block' : 'none',
                left: `${(layer?.rect.x ?? 0) * 100}%`,
                top: `${(layer?.rect.y ?? 0) * 100}%`,
                width: `${(layer?.rect.w ?? 1) * 100}%`,
                height: `${(layer?.rect.h ?? 1) * 100}%`,
                objectFit: 'cover',
                background: '#0d1319',
              }}
            />
          );
        })}

        {!current && (
          <div className="small muted" style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            textAlign: 'center', padding: 20,
          }}>
            Nothing on this part of the song yet. Play it and press a number to
            put somebody there.
          </div>
        )}

        <div className="small" style={{
          position: 'absolute', left: 0, bottom: 0, padding: '3px 9px',
          background: 'rgba(8,9,11,0.72)', fontSize: 11, fontWeight: 600,
        }}>
          {formatMasterPosition(Math.round(player.position))} / {formatMasterPosition(duration)}
          {current?.label ? ` · ${current.label}` : ''}
        </div>
      </div>

      {/* ---- the song, and the scenes cut into it (§2, §8) -------------- */}
      <div
        data-testid="master-timeline"
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          player.seek(Math.round(((e.clientX - box.left) / box.width) * duration));
        }}
        style={{
          position: 'relative', height: 44, marginTop: 10, cursor: 'pointer',
          background: 'var(--panel-2)', borderRadius: 6, border: '1px solid var(--line)',
          overflow: 'hidden',
        }}
      >
        {ordered.map((scene, i) => {
          const to = ordered[i + 1]?.fromSample ?? duration;
          return (
            <div
              key={scene.id}
              data-testid="timeline-scene"
              data-scene-id={scene.id}
              data-from={scene.fromSample}
              title={`${scene.label ?? LAYOUTS[scene.layoutId]?.label ?? scene.layoutId}`}
              style={{
                position: 'absolute', top: 0, bottom: 0,
                left: pct(scene.fromSample), width: pct(to - scene.fromSample),
                background: 'rgba(43,95,138,0.35)',
                borderLeft: '2px solid #6fb3e0',
                padding: '4px 6px', fontSize: 10, overflow: 'hidden',
              }}
            >
              {scene.takeIds.map((tid) =>
                performance.takes.find((t) => t.id === tid)?.label ?? '?').join(' + ')}
            </div>
          );
        })}
        <div style={{
          position: 'absolute', top: 0, bottom: 0, width: 2, background: '#e0674f',
          left: pct(player.position),
        }} />
      </div>

      {/* ---- the controls ---------------------------------------------- */}
      <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <button className="primary" data-testid="player-play" disabled={!player.ready}
                onClick={() => (player.playing ? player.pause() : void player.play())}>
          {player.playing ? 'Pause' : 'Play the song'}
        </button>
        <button
          className="small" data-testid="live-switching"
          data-on={live ? 'true' : 'false'}
          onClick={() => { setLive(!live); setPending([]); }}
          style={{ background: live ? 'rgba(224,103,79,0.3)' : undefined,
            borderColor: live ? '#e0674f' : undefined }}
        >
          {live ? 'Directing — press 1–9' : 'Direct with the number keys'}
        </button>
        <select
          data-testid="arrangement"
          value={arrangement}
          onChange={(e) => { setArrangement(e.target.value); setPending([]); }}
          style={{ width: 'auto', padding: '4px 8px' }}
        >
          {ARRANGEMENTS.map((a) => (
            <option key={a} value={a}>
              {LAYOUTS[a]!.label} · {takeSlots(LAYOUTS[a]!)}
            </option>
          ))}
        </select>
        <button className="small" data-testid="clear-scenes"
                onClick={() => void fetch(`/api/performances/${performance.id}`, {
                  method: 'PATCH', headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ action: 'clear-scenes' }),
                }).then((r) => r.json()).then((d) => d.performance && onChanged(d.performance))}>
          Start the edit again
        </button>
      </div>

      {slots > 1 && (
        <p className="small muted" data-testid="pending-hint" style={{ marginTop: 6 }}>
          {/* Half and quad need more than one key before a scene exists. */}
          {`"${LAYOUTS[arrangement]!.label}" holds ${slots}. `}
          {pending.length > 0
            ? `Chosen ${pending.length} of ${slots}.`
            : 'Press that many numbers to place a scene.'}
        </p>
      )}

      {/* ---- the takes, numbered as the keys are ------------------------ */}
      <div className="row" data-testid="take-rail" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {usable.map((take, i) => (
          <button
            key={take.id}
            className="small"
            data-testid="rail-take"
            data-take-id={take.id}
            data-visible={visible.includes(take.id) ? 'true' : 'false'}
            onClick={() => choose(i)}
            style={{
              padding: '6px 10px', fontSize: 12,
              background: pending.includes(take.id)
                ? 'rgba(224,103,79,0.3)'
                : visible.includes(take.id) ? 'rgba(43,95,138,0.30)' : undefined,
              borderColor: visible.includes(take.id) ? '#6fb3e0' : undefined,
            }}
          >
            <strong>{i + 1}</strong> · {take.label}
          </button>
        ))}
        {usable.length === 0 && (
          <span className="small muted">Record a take first — then you can cut between them.</span>
        )}
      </div>

      {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}
    </div>
  );
}
