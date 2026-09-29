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
    <div data-testid="sound">
      {/*
        * A SETTING ON THE MASTER, NOT A SECTION OF THE PAGE.
        *
        * This was its own `<section>` with its own legend, sitting between
        * the timeline and the render button as though choosing where the
        * sound comes from were a separate stage of the work. It is not: it
        * is a property OF the master, and it belongs inside the module that
        * makes one — the same relationship the arrangement has to the
        * stage. What it answers is one question, so it reads as one line
        * with a bank of positions after it rather than a heading over three
        * cards. [D-19]
        */}
      <div className="row" style={{
        gap: 'var(--space-4)', alignItems: 'baseline', marginBottom: 'var(--space-3)',
      }}>
        <span className="module-label">Audio</span>
        <span className="module-sub grow" style={{ minWidth: 0 }}>
          where the finished sound comes from
        </span>
      </div>

      {/*
        * A BANK OF THREE POSITIONS. They were three bordered rectangles in
        * a row with a semibold title each — the shape of a pricing table —
        * and four pixels of air between them, which leaves three objects
        * that happen to agree. A mode selector on a desk is one piece of
        * metal with positions cut into it. [brief §4]
        */}
      <div className="ctl-bank is-across" style={{ flexWrap: 'wrap' }}>
        {MODES.map((option) => (
          <button
            key={option.id}
            data-testid="audio-mode"
            data-mode={option.id}
            data-chosen={mode === option.id ? 'true' : 'false'}
            aria-pressed={mode === option.id}
            disabled={busy || (option.id === 'master_vocal' && withSound.length === 0)}
            onClick={() => void act({
              action: 'audio-mode', mode: option.id,
              ...(option.id === 'master_vocal'
                ? { vocalTakeId: performance.audio.vocalTakeId ?? withSound[0]?.id }
                : {}),
            })}
            /*
              * THREE MUTUALLY EXCLUSIVE CHOICES, which is a control and
              * not three cards. They were three bordered rectangles in
              * a row with a 13px semibold title each — the shape of a
              * pricing table — and the chosen one turned blue. On a
              * desk this is a bank of three positions: they share a
              * face, the chosen one is lit, and the sentence under each
              * is the explanation rather than a second heading.
              */
            className={`ctl${mode === option.id ? ' is-on' : ''}`}
            style={{
              textAlign: 'left', padding: '8px 11px',
              display: 'block', flex: '1 1 210px', minWidth: 0,
            }}
          >
            <div style={{
              fontWeight: 'var(--weight-semi)', fontSize: 'var(--text-sm)',
              letterSpacing: 0, textTransform: 'none',
            }}>{option.label}</div>
            <div style={{
              fontSize: 'var(--text-2xs)', color: 'var(--ink-300)',
              marginTop: 2, letterSpacing: 0, textTransform: 'none',
              lineHeight: 'var(--leading-snug)',
            }}>{option.hint}</div>
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
          <summary className="small muted" style={{ cursor: 'pointer', fontSize: 'var(--text-sm)' }}
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
                style={{ fontSize: 'var(--text-xs)', padding: '2px 6px', width: 'auto' }}
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
    </div>
  );
}
