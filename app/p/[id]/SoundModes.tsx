'use client';

import { useState } from 'react';
import type { AudioMode, Performance } from '../../../src/domain/performance.js';
import { orderedScenes } from '../../../src/domain/performance.js';
import { formatMasterPosition } from '../../../src/domain/time.js';

/**
 * Where the finished sound comes from.  [Doctrine STUDIO-TWO §9, S-7]
 *
 * §9's three modes, and S-7's fourth — one scene answering differently from
 * the rest. Written as one panel rather than scattered through the studio,
 * because they are one question: which sources are audible, and where.
 *
 * THE SENTENCE THAT HAS TO BE SAID OUT LOUD is that the sound does not cut
 * when the picture does. Mode C is the reason anybody would use this studio
 * twice — sing it once properly, then perform it five times to camera — and an
 * author who does not know the vocal survives the cut will record the song
 * five more times instead.
 *
 * It is said BY THE OPTIONS rather than above them. There was a paragraph
 * here explaining the idea, over three buttons whose own second lines explain
 * the same idea in the words of the choice being made — so the paragraph was
 * a lecture before a question that answers it. A studio is a room you work
 * in, not a page you read.
 */

const MODES: { id: AudioMode; label: string; hint: string }[] = [
  {
    id: 'music_and_mic',
    label: 'The song, and whoever is on screen',
    hint: 'Your microphone over the backing track, following the picture.',
  },
  {
    id: 'take_audio',
    label: 'Only what that camera recorded',
    hint: 'The take’s own sound, room and all. No backing track underneath.',
  },
  {
    id: 'master_vocal',
    label: 'The song, and one vocal throughout',
    hint: 'Sing it once properly; the vocal stays put while the picture cuts.',
  },
];

export default function SoundModes({
  performance, onChanged,
}: {
  performance: Performance;
  onChanged: (next: Performance) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const id = performance.id;
  const usable = performance.takes.filter((take) => take.durationSamples > 0);
  const withSound = usable.filter((take) => take.hasAudio !== false);
  const scenes = orderedScenes(performance);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/performances/${id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'that did not work');
      onChanged(data.performance);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const mode = performance.audio.mode;

  return (
    <section style={{ marginTop: 18 }} data-testid="sound">
      <h2 style={{ fontSize: 14, margin: '0 0 7px' }}>Sound</h2>

      {/* Three across, because they are three answers to one question and a
          column of three makes the third look like an afterthought. */}
      <div style={{
        display: 'grid', gap: 7,
        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
        maxWidth: 900,
      }}>
        {MODES.map((option) => (
          <button
            key={option.id}
            data-testid="audio-mode"
            data-mode={option.id}
            data-chosen={mode === option.id ? 'true' : 'false'}
            disabled={busy || (option.id === 'master_vocal' && withSound.length === 0)}
            onClick={() => void act({
              action: 'audio-mode', mode: option.id,
              ...(option.id === 'master_vocal'
                ? { vocalTakeId: performance.audio.vocalTakeId ?? withSound[0]?.id }
                : {}),
            })}
            style={{
              textAlign: 'left', padding: '7px 10px',
              background: mode === option.id ? 'rgba(43,95,138,0.30)' : undefined,
              borderColor: mode === option.id ? '#6fb3e0' : undefined,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13 }}>{option.label}</div>
            <div className="small muted" style={{ fontSize: 11 }}>{option.hint}</div>
          </button>
        ))}
      </div>

      {mode === 'master_vocal' && (
        <div className="field" style={{ maxWidth: 280, marginTop: 10 }}>
          <label htmlFor="vocal-take"
                 title={'A take like any other — recorded against the same song, '
                   + 'placed the same way. Its picture need never appear.'}>
            The vocal
          </label>
          <select
            id="vocal-take" data-testid="vocal-take" disabled={busy}
            value={performance.audio.vocalTakeId ?? ''}
            onChange={(e) => void act({
              action: 'audio-mode', mode: 'master_vocal', vocalTakeId: e.target.value,
            })}
          >
            {withSound.map((take) => (
              <option key={take.id} value={take.id}>{take.label}</option>
            ))}
          </select>
        </div>
      )}

      {usable.some((take) => take.hasAudio === false) && (
        <p className="small muted" data-testid="silent-takes" style={{ marginTop: 8 }}>
          {/* Measured when the take landed, not assumed. [§9] */}
          {usable.filter((t) => t.hasAudio === false).map((t) => t.label).join(', ')}
          {' '}recorded no sound, so nothing is mixed in from{' '}
          {usable.filter((t) => t.hasAudio === false).length === 1 ? 'it' : 'them'}.
        </p>
      )}

      {scenes.length > 0 && (
        <details style={{ marginTop: 10 }} data-testid="scene-audio">
          <summary className="small muted" style={{ cursor: 'pointer', fontSize: 12 }}
                   title={'For the chorus that should carry the crowd from the stage '
                     + 'take while everything else stays on the studio vocal.'}>
            One section at a time
          </summary>
          {scenes.map((scene) => (
            <div key={scene.id} className="row"
                 style={{ gap: 8, alignItems: 'center', marginTop: 4 }}>
              <span className="small muted" style={{ width: 110, flex: '0 0 auto' }}>
                {scene.label ?? formatMasterPosition(scene.fromSample)}
              </span>
              <select
                data-testid="scene-audio-mode" data-scene-id={scene.id}
                disabled={busy} value={scene.audioMode ?? ''}
                onChange={(e) => void act({
                  action: 'scene-audio', sceneId: scene.id,
                  mode: e.target.value === '' ? null : e.target.value,
                })}
                style={{ fontSize: 11, padding: '2px 6px', width: 'auto' }}
              >
                <option value="">same as the rest</option>
                {MODES.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>
          ))}
        </details>
      )}

      {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}
    </section>
  );
}
