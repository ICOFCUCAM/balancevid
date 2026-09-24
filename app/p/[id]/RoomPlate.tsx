'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Performance } from '../../../src/domain/performance.js';
import {
  type RoomPlate as Plate, SPACES_ARE_DRAWN, SPACE_LOOKS,
  matteThreshold, plateVerdict,
} from '../../../src/domain/environment.js';

/**
 * Measuring the room, and showing what it buys.  [Doctrine STUDIO-TWO §4, S-6]
 *
 * "The author sees the matte BEFORE they record the other four takes, not
 *  after — because if it is poor in their room, the answer is a light or a
 *  different wall, and they need to know that at take one."
 *
 * So this is not a settings panel. It is three seconds of the empty room, a
 * measurement of how much that room moves on its own, and then the key running
 * live on the camera with a backdrop behind it — the same difference against
 * the same plate at the same threshold the renderer will use. What the author
 * sees here is what they will get, and if it flickers here it will flicker
 * there, which is precisely the thing they need to find out now.
 */

/** Long enough to measure the room's noise, short enough to stand outside. */
const PLATE_SECONDS = 3;
/** The preview runs small: it is answering "will this hold up", not "is this sharp". */
const PREVIEW_W = 320;
const PREVIEW_H = 180;
const PREVIEW_FPS = 12;

export default function RoomPlate({
  performance, stream, onChanged,
}: {
  performance: Performance;
  stream: MediaStream | null;
  onChanged: (next: Performance) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counting, setCounting] = useState(0);
  const [space, setSpace] = useState('concert_stage');

  const id = performance.id;
  const plate = performance.plates[performance.plates.length - 1];

  const record = useCallback(async () => {
    if (!stream) { setError('turn the camera on first'); return; }
    setError(null);
    setBusy(true);
    try {
      const recorder = new MediaRecorder(stream);
      const parts: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) parts.push(event.data); };
      const finished = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(parts));
      });
      recorder.start();
      for (let left = PLATE_SECONDS; left > 0; left -= 1) {
        setCounting(left);
        await new Promise((r) => setTimeout(r, 1000));
      }
      setCounting(0);
      recorder.stop();

      const response = await fetch(`/api/performances/${id}/plates`, {
        method: 'POST', body: await finished,
        headers: { 'content-type': 'application/octet-stream' },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'that plate could not be saved');

      // The measurement happens in the worker; wait for it rather than
      // guessing, because the number is the whole point of the exercise.
      for (let i = 0; i < 60; i += 1) {
        await new Promise((r) => setTimeout(r, 1000));
        const poll = await fetch(`/api/performances/${id}`, { cache: 'no-store' });
        if (!poll.ok) continue;
        const next = await poll.json();
        const found = (next.performance.plates ?? [])
          .some((p: Plate) => p.assetId === data.assetId);
        if (found) { onChanged(next.performance); return; }
        const job = (next.jobs ?? []).find((j: { id: string }) => j.id === data.job?.id);
        if (job?.state === 'failed') throw new Error(job.error ?? 'that plate could not be measured');
      }
      throw new Error('the plate is taking longer than expected to measure');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCounting(0);
      setBusy(false);
    }
  }, [id, onChanged, stream]);

  const verdict = plate ? plateVerdict(plate) : null;

  return (
    <section className="panel" data-testid="room-plate" style={{ padding: 12, marginTop: 16 }}>
      <div className="small muted" style={{ textTransform: 'uppercase',
        letterSpacing: 0.8, fontSize: 11, marginBottom: 6 }}>
        Your room
      </div>
      <p className="small muted" style={{ marginTop: 0, maxWidth: 640 }}>
        To put you anywhere but the room you are in, we need three seconds of
        that room with nobody in it. Step out of shot, press the button, and
        leave the camera where it is — if it moves afterwards, take another.
      </p>

      <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          className="primary" data-testid="record-plate"
          disabled={busy || !stream}
          onClick={() => void record()}
        >
          {counting > 0 ? `Hold still… ${counting}`
            : busy ? 'Measuring…'
              : plate ? 'Measure the room again' : 'Measure my room'}
        </button>
        {!stream && (
          <span className="small muted">Turn the camera on first.</span>
        )}
        {plate && (
          <span className="small" data-testid="plate-verdict"
                data-usable={verdict!.ok ? 'true' : 'false'}
                style={{ color: verdict!.ok ? undefined : 'var(--warn)', maxWidth: 420 }}>
            {verdict!.text}
          </span>
        )}
      </div>

      {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}

      {plate && (
        <>
          <div className="row" style={{ gap: 12, marginTop: 12, alignItems: 'flex-start' }}>
            <MattePreview
              plateUrl={`/api/performances/${id}/plates/${plate.assetId}/image`}
              threshold={matteThreshold(plate)}
              stream={stream}
              spaceId={space}
            />
            <div style={{ minWidth: 200 }}>
              <div className="field" style={{ maxWidth: 260 }}>
                <label htmlFor="preview-space">Behind you</label>
                <select id="preview-space" data-testid="preview-space" value={space}
                        onChange={(e) => setSpace(e.target.value)}>
                  {Object.values(SPACE_LOOKS).map((look) => (
                    <option key={look.id} value={look.id}>{look.label}</option>
                  ))}
                </select>
              </div>
              <p className="small muted" style={{ fontSize: 11, maxWidth: 260 }}>
                {/* Said here rather than discovered in the export. [§4, S-6] */}
                {SPACES_ARE_DRAWN}
              </p>
              <p className="small muted" style={{ fontSize: 11, maxWidth: 260 }}>
                This preview keys against the same plate, at the same threshold,
                as the finished video. If it flickers here it will flicker there.
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * The key, running live.
 *
 * The same arithmetic the renderer does, in a canvas: difference each pixel
 * from the plate, and where the difference is below the room's own measured
 * noise, show the backdrop instead. Deliberately the same shape as the filter
 * graph rather than a prettier approximation of it — a preview that uses a
 * better technique than the export is a preview that flatters it.
 */
function MattePreview({
  plateUrl, threshold, stream, spaceId,
}: {
  plateUrl: string;
  threshold: number;
  stream: MediaStream | null;
  spaceId: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const plateData = useRef<ImageData | null>(null);
  const [ready, setReady] = useState(false);

  /* The plate, at the preview's size, once. */
  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (cancelled) return;
      const scratch = document.createElement('canvas');
      scratch.width = PREVIEW_W;
      scratch.height = PREVIEW_H;
      const context = scratch.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0, PREVIEW_W, PREVIEW_H);
      plateData.current = context.getImageData(0, 0, PREVIEW_W, PREVIEW_H);
      setReady(true);
    };
    image.src = plateUrl;
    return () => { cancelled = true; };
  }, [plateUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
  }, [stream]);

  useEffect(() => {
    if (!ready || !stream) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;

    const backdrop = drawBackdrop(spaceId);
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      if (video.readyState >= 2) {
        context.drawImage(video, 0, 0, PREVIEW_W, PREVIEW_H);
        const frame = context.getImageData(0, 0, PREVIEW_W, PREVIEW_H);
        const plate = plateData.current!;
        for (let i = 0; i < frame.data.length; i += 4) {
          const difference = Math.max(
            Math.abs(frame.data[i]! - plate.data[i]!),
            Math.abs(frame.data[i + 1]! - plate.data[i + 1]!),
            Math.abs(frame.data[i + 2]! - plate.data[i + 2]!),
          );
          if (difference <= threshold) {
            frame.data[i] = backdrop[i]!;
            frame.data[i + 1] = backdrop[i + 1]!;
            frame.data[i + 2] = backdrop[i + 2]!;
          }
        }
        context.putImageData(frame, 0, 0);
      }
      window.setTimeout(tick, 1000 / PREVIEW_FPS);
    };
    tick();
    return () => { stopped = true; };
  }, [ready, stream, threshold, spaceId]);

  return (
    <div>
      <video ref={videoRef} muted playsInline style={{ display: 'none' }} />
      <canvas
        ref={canvasRef} width={PREVIEW_W} height={PREVIEW_H}
        data-testid="matte-preview"
        style={{ width: PREVIEW_W, height: PREVIEW_H, borderRadius: 8,
          border: '1px solid var(--line)', background: '#0d1319' }}
      />
    </div>
  );
}

/** The space's wash, as flat pixels: enough to judge the edge against. */
function drawBackdrop(spaceId: string): Uint8ClampedArray {
  const look = SPACE_LOOKS[spaceId] ?? Object.values(SPACE_LOOKS)[0]!;
  const top = rgb(look.top);
  const bottom = rgb(look.bottom);
  const pixels = new Uint8ClampedArray(PREVIEW_W * PREVIEW_H * 4);
  for (let y = 0; y < PREVIEW_H; y += 1) {
    const t = y / (PREVIEW_H - 1);
    for (let x = 0; x < PREVIEW_W; x += 1) {
      const i = (y * PREVIEW_W + x) * 4;
      pixels[i] = top[0] + (bottom[0] - top[0]) * t;
      pixels[i + 1] = top[1] + (bottom[1] - top[1]) * t;
      pixels[i + 2] = top[2] + (bottom[2] - top[2]) * t;
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace(/^0x/, ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
