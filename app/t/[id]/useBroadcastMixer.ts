'use client';

import { useEffect, useRef, useState } from 'react';
import { LAYOUTS, takeSlots } from '../../../src/domain/presentation.js';

/**
 * Several people, one picture.  [Doctrine CHANNEL §6, ROOM §4, U-18, D-19]
 *
 *     YOU  →  YOU + SARAH  →  SARAH  →  SOURCE VIDEO  →  TRIPTYCH
 *
 * The missing piece between the Conversation Room and the broadcast: the Room
 * has the people, the staging and the speaker switching, and the encoder
 * takes ONE stream. This is what makes one out of several.
 *
 * WHAT IT DOES NOT DO, because those things already exist:
 *
 *   it does not connect to anybody — `useRoomMesh` does that, and gives back
 *     `{ participantId, stream }` for everyone on stage;
 *   it does not decide who is on stage — the Room does, by hand or by voice
 *     activity with hysteresis (ROOM §4, D-17);
 *   it does not invent geometry — `LAYOUTS` is the composition engine and its
 *     rects are the same ones `render/compose.ts` gives ffmpeg. A quad here
 *     and a quad in an export are one table, so a broadcast and a recording
 *     of it cannot drift apart.
 *
 * WHY A CANVAS AND NOT A SERVER MIX. Mixing on the server would mean every
 * participant's camera travelling to it, being decoded, composited and
 * re-encoded — an SFU and a rendering farm, for a room of three. The browser
 * already has every stream decoded and on screen; drawing them into a canvas
 * costs one composite per frame and produces exactly the single feed the
 * encoder wants. D-14 says an SFU comes later and this is why it can.
 */

export interface MixerSource {
  id: string;
  stream: MediaStream;
  /** Drawn under the picture, as the stage badge does in Studio Two. */
  label?: string;
  accent?: string;
}

export interface BroadcastMixer {
  /** One stream: the composited picture and everybody's microphones. */
  stream: MediaStream | null;
  /** Which arrangement is being drawn, after the automatic choice. */
  layoutId: string;
  ready: boolean;
}

/**
 * Which arrangement fits this many people.
 *
 * Chosen from the layout table rather than hard-coded, so a layout added for
 * Studio Two is available to a broadcast the day it exists. One person is
 * full screen; two are side by side; three across; four a quad; more, the
 * six-way. The operator can override it, which is what a vision mixer is.
 */
export function arrangementFor(count: number): string {
  if (count <= 1) return 'performance_full';
  if (count === 2) return 'performance_half';
  if (count === 3) return 'performance_thirds';
  if (count === 4) return 'performance_quad';
  return 'performance_six';
}

export function useBroadcastMixer({
  sources, layoutId, enabled, width = 1280, height = 720, fps = 30,
}: {
  sources: MixerSource[];
  /** An operator's choice. Absent means the automatic one. */
  layoutId?: string;
  enabled: boolean;
  width?: number;
  height?: number;
  fps?: number;
}): BroadcastMixer {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videosRef = useRef(new Map<string, HTMLVideoElement>());
  const audioRef = useRef<{
    context: AudioContext;
    destination: MediaStreamAudioDestinationNode;
    taps: Map<string, MediaStreamAudioSourceNode>;
  } | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const chosen = layoutId ?? arrangementFor(sources.length);
  /*
   * Kept in a ref as well, because the draw loop below runs for the length of
   * a broadcast and must not be torn down and rebuilt every time somebody
   * joins — a restarted `captureStream` is a new track, and a new track
   * mid-broadcast is a gap in the recording.
   */
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const layoutRef = useRef(chosen);
  layoutRef.current = chosen;

  /* ---- the picture ---------------------------------------------------- */
  useEffect(() => {
    if (!enabled) { setStream(null); return; }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvasRef.current = canvas;
    const paper = canvas.getContext('2d', { alpha: false });
    if (!paper) return;

    const context = new AudioContext();
    const destination = context.createMediaStreamDestination();
    audioRef.current = { context, destination, taps: new Map() };

    const captured = canvas.captureStream(fps);
    const mixed = new MediaStream([
      ...captured.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);
    setStream(mixed);

    let stopped = false;
    const draw = () => {
      if (stopped) return;
      const people = sourcesRef.current;
      const layout = LAYOUTS[layoutRef.current] ?? LAYOUTS['performance_full']!;
      const panels = layout.layers.filter((layer) => layer.source === 'take');

      paper.fillStyle = '#05070a';
      paper.fillRect(0, 0, width, height);

      people.slice(0, Math.max(1, takeSlots(layout))).forEach((person, index) => {
        const rect = panels[index]?.rect ?? { x: 0, y: 0, w: 1, h: 1 };
        const box = {
          x: rect.x * width, y: rect.y * height,
          w: rect.w * width, h: rect.h * height,
        };
        const video = videosRef.current.get(person.id);
        if (video && video.videoWidth > 0) {
          /*
           * COVER, not contain: a letterboxed person inside a panel that is
           * itself letterboxed inside a frame is a face four hundred pixels
           * from the nearest edge. The same choice `render/compose.ts` makes
           * for a take, and for the same reason.
           */
          const scale = Math.max(box.w / video.videoWidth, box.h / video.videoHeight);
          const drawnW = video.videoWidth * scale;
          const drawnH = video.videoHeight * scale;
          paper.save();
          paper.beginPath();
          paper.rect(box.x, box.y, box.w, box.h);
          paper.clip();
          paper.drawImage(
            video,
            box.x + (box.w - drawnW) / 2, box.y + (box.h - drawnH) / 2,
            drawnW, drawnH,
          );
          paper.restore();
        } else {
          paper.fillStyle = person.accent ?? '#12181f';
          paper.fillRect(box.x, box.y, box.w, box.h);
        }

        /* Who this is, where the stage badge goes in Studio Two. */
        if (person.label && people.length > 1) {
          const size = Math.round(height * 0.028);
          paper.font = `600 ${size}px system-ui, sans-serif`;
          const text = person.label;
          const pad = Math.round(size * 0.5);
          const wide = paper.measureText(text).width + pad * 2;
          paper.fillStyle = person.accent ?? 'rgba(5,7,10,0.8)';
          paper.fillRect(
            box.x + pad, box.y + box.h - size - pad * 2.2, wide, size + pad);
          paper.fillStyle = '#0a0c10';
          paper.fillText(
            text, box.x + pad * 2, box.y + box.h - pad * 1.6);
        }

        /* A hairline between panels, so two people read as two. */
        if (people.length > 1) {
          paper.strokeStyle = '#05070a';
          paper.lineWidth = 3;
          paper.strokeRect(box.x, box.y, box.w, box.h);
        }
      });

      window.requestAnimationFrame(draw);
    };
    window.requestAnimationFrame(draw);

    return () => {
      stopped = true;
      for (const track of captured.getTracks()) track.stop();
      void context.close();
      audioRef.current = null;
      setStream(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, width, height, fps]);

  /* ---- the people, attached and detached as they come and go ---------- */
  useEffect(() => {
    const wanted = new Set(sources.map((person) => person.id));

    for (const person of sources) {
      let video = videosRef.current.get(person.id);
      if (!video) {
        /*
         * A detached <video> per person. It is never added to the document —
         * it exists only so the canvas has something to draw from, which is
         * the one way to get frames out of a MediaStream in a browser.
         */
        video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        videosRef.current.set(person.id, video);
      }
      if (video.srcObject !== person.stream) {
        video.srcObject = person.stream;
        void video.play().catch(() => undefined);
      }

      /*
       * EVERY MICROPHONE, MIXED — not just the one on screen. A guest who is
       * speaking over the picture of somebody else is still speaking, and a
       * broadcast that muted them until the vision cut to them would clip the
       * first word of every answer. Who is SEEN is the Room's decision; who
       * is HEARD is everybody. [ROOM §4]
       */
      const audio = audioRef.current;
      if (audio && !audio.taps.has(person.id)
        && person.stream.getAudioTracks().length > 0) {
        try {
          const tap = audio.context.createMediaStreamSource(person.stream);
          tap.connect(audio.destination);
          audio.taps.set(person.id, tap);
        } catch { /* a stream with no live audio track: nothing to tap. */ }
      }
    }

    for (const [id, video] of videosRef.current) {
      if (wanted.has(id)) continue;
      video.srcObject = null;
      videosRef.current.delete(id);
      const tap = audioRef.current?.taps.get(id);
      if (tap) { tap.disconnect(); audioRef.current?.taps.delete(id); }
    }
  }, [sources]);

  return { stream, layoutId: chosen, ready: Boolean(stream) };
}
