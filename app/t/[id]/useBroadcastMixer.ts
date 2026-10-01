'use client';

import { useEffect, useRef, useState } from 'react';
import { LAYOUTS, takeSlots } from '../../../src/domain/presentation.js';
import type { Composition } from '../../../src/domain/composition.js';
import { type VirtualSet, arrangementIn } from '../../../src/domain/virtualSet.js';
import { LiveCompositor } from './compositor.js';
import { paintSet } from './spaceArt.js';

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
  /**
   * WHAT GOES BEHIND THIS PERSON, AND HOW THEY SIT IN IT.  [§26, §28]
   *
   * Absent, their own room is drawn as it arrives — which is what every
   * broadcast this product has made has done, because `identity.spaceId`
   * was written by ten buttons and read by nothing. Present, the picture
   * goes through the compositor before it reaches the canvas, and the
   * canvas is what `captureStream` hands the encoder. That is the whole
   * of *"part of the master composition, not just a CSS background
   * behind a preview."* [C-14]
   */
  composition?: Composition;
  /**
   * Three seconds of this person's room with nobody in it, as an image.
   *
   * The measurement the plate key differences against. Held by the
   * caller because a plate belongs to the person, not to the mixer, and
   * because Studio Two already has one per performance. [STUDIO-TWO §4]
   */
  plate?: TexImageSource | null;
}

export interface BroadcastMixer {
  /** One stream: the composited picture and everybody's microphones. */
  stream: MediaStream | null;
  /** Which arrangement is being drawn, after the automatic choice. */
  layoutId: string;
  ready: boolean;
  /**
   * The decoded picture for one person, for anything that needs FRAMES
   * rather than a stream.  [§26 C]
   *
   * The mixer already holds a `<video>` per person — detached, existing
   * only so the canvas has something to draw from — and taking a plate
   * needs exactly that: sixteen frames of a decoded picture. Handing the
   * element back is cheaper and more honest than attaching a second
   * `<video>` to the same stream, which is a second decode of the same
   * bytes for the same reason.
   */
  videoFor: (id: string) => HTMLVideoElement | null;
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
  sources, layoutId, solo = null, set = null, enabled,
  width = 1280, height = 720, fps = 30,
}: {
  sources: MixerSource[];
  /** An operator's choice. Absent means the automatic one. */
  layoutId?: string;
  /**
   * ONE SOURCE, FULL FRAME, BY THE OPERATOR'S HAND.  [CHANNEL §24]
   *
   * *"clicking a guest should select that guest as the programme source."*
   * This is that click, and it is a VISION MIXER'S action rather than the
   * Room's: it does not unstage anybody, does not reach the conversation,
   * and ends the moment it is pressed again. The Room still decides who is
   * in the room; the gallery decides who is in the picture, which is the
   * division this file's own header already draws.
   *
   * IT DOES NOT TOUCH THE AUDIO. Every staged microphone stays in the mix
   * while one person has the picture, because a guest answering over a
   * close-up of somebody else is still answering — the rule below, and
   * ROOM §4's. Cutting the sound with the vision would clip the first word
   * of every reply.
   *
   * A SOLO ON SOMEBODY WHO HAS LEFT IS NOT A SOLO. If no source carries
   * this id the layout falls back to the arrangement, rather than showing
   * a black frame for a guest whose browser closed.
   */
  solo?: string | null;
  /**
   * THE STATION'S STUDIO.  [§27]
   *
   * *"Virtual Set is a complete production scene."* Present, the scene
   * is drawn once for the whole frame — the room, the riser, the
   * screens — each person is CUT OUT of their own room and composited
   * into their position in it, and the desk goes over them so they sit
   * behind it rather than on it. Absent, every person keeps their own
   * background and the layout is the arrangement it always was.
   *
   * A set belongs to the CHANNEL and a background to a person, which is
   * the distinction §27 opens with, and it is why this is one prop and
   * `MixerSource.composition` is per source. [§13]
   */
  set?: VirtualSet | null;
  enabled: boolean;
  width?: number;
  height?: number;
  fps?: number;
}): BroadcastMixer {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /*
   * ONE COMPOSITOR FOR THE WHOLE MIX, built the first time somebody
   * actually asks for a background. A GL context per guest would be four
   * contexts and four sets of compiled shaders, against a browser limit
   * of about sixteen; and a broadcast where nobody has chosen a set
   * should not pay for a context at all.
   */
  const compositorRef = useRef<LiveCompositor | null>(null);
  const videosRef = useRef(new Map<string, HTMLVideoElement>());
  const audioRef = useRef<{
    context: AudioContext;
    destination: MediaStreamAudioDestinationNode;
    taps: Map<string, MediaStreamAudioSourceNode>;
  } | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  /*
   * A SET NAMES THE ARRANGEMENT, unless the operator has overridden it.
   * A News Desk is drawn for two people behind a desk, and putting four
   * in it would be four people behind a desk drawn for two. The
   * operator's own choice still wins — that is what a vision mixer is.
   */
  const chosen = layoutId
    ?? (set ? arrangementIn(set, sources.length)
      : arrangementFor(sources.length));
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
  const soloRef = useRef(solo);
  soloRef.current = solo;
  const setRef = useRef(set);
  setRef.current = set;

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
      const now = performance.now();
      const all = sourcesRef.current;
      const alone = soloRef.current === null ? null
        : all.find((person) => person.id === soloRef.current) ?? null;
      const people = alone ? [alone] : all;
      const layout = alone
        ? LAYOUTS['performance_full']!
        : LAYOUTS[layoutRef.current] ?? LAYOUTS['performance_full']!;
      const panels = layout.layers.filter((layer) => layer.source === 'take');

      /*
       * THE SCENE FIRST, AND ONCE. A virtual set's room is the STUDIO,
       * not four rooms in four panels, so it is drawn for the whole
       * frame before anybody is composited into it. [§27]
       */
      const scene = setRef.current;
      if (scene) {
        paintSet(paper, scene, width, height, 'behind');
      } else {
        paper.fillStyle = '#05070a';
        paper.fillRect(0, 0, width, height);
      }

      /*
       * AND THEN THE COMPOSITOR IS SHOWN IT.  [§27, S-43]
       *
       * A person standing in a set comes back as a cutout, because the
       * set is the studio and four panels are not four rooms — and
       * that is exactly why the shader had no pixels to ground them
       * against. It has them now: the room is finished on this canvas
       * before anybody is drawn into it, so a light wrap and a contact
       * shadow can be taken from the surface they are actually
       * standing on.
       *
       * ONCE, HERE, AND BEFORE THE FIRST PERSON — not inside the loop.
       * Per person it would be the same picture uploaded four times,
       * and by the second person the canvas already carries the first,
       * so nobody's shoulder would be lit by their colleague.
       */
      if (compositorRef.current) {
        try {
          compositorRef.current.useBackdrop(
            scene ? canvas : null, scene?.spaceId);
        } catch { /* A lost context. The broadcast carries on. */ }
      }

      people.slice(0, Math.max(1, takeSlots(layout))).forEach((person, index) => {
        const rect = panels[index]?.rect ?? { x: 0, y: 0, w: 1, h: 1 };
        const box = {
          x: rect.x * width, y: rect.y * height,
          w: rect.w * width, h: rect.h * height,
        };
        const video = videosRef.current.get(person.id);
        /*
         * THROUGH THE COMPOSITOR, WHEN THERE IS ONE TO GO THROUGH. It
         * answers false for a person with no background chosen, or one
         * whose backdrop needs a matte nothing has provided — and then
         * the raw picture is drawn, which is the honest outcome S-6
         * asks for rather than a black rectangle where somebody was.
         */
        let composited = false;
        if (video && video.videoWidth > 0 && person.composition) {
          try {
            if (!compositorRef.current) {
              compositorRef.current = new LiveCompositor();
              /* The first person of the first frame: the backdrop was
                 handed over above, before this existed. */
              compositorRef.current.useBackdrop(
                scene ? canvas : null, scene?.spaceId);
            }
            composited = compositorRef.current.draw(
              video, person.plate ?? null,
              /* THE SET LIGHTS THEM FOR THE ROOM THEY ARE STANDING IN,
                 and their own adjustment is added to it: a stage is dark
                 and a news studio is flat and bright. [§27] */
              scene
                ? { ...person.composition,
                  light: Math.max(-1, Math.min(1,
                    person.composition.light + scene.light)) }
                : person.composition,
              { w: box.w, h: box.h }, now,
              /* Where this panel is in the set, so the wrap and the
                 shadow read the part of the room they are against. */
              { cutout: Boolean(scene), within: box });
            if (composited) {
              paper.drawImage(compositorRef.current.canvas,
                box.x, box.y, box.w, box.h);
            }
          } catch {
            /* No WebGL, a lost context, a driver that refused. The
               broadcast continues with the room they are in. */
            composited = false;
          }
        }
        if (composited) {
          /* Drawn already, through the compositor. */
        } else if (video && video.videoWidth > 0) {
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

      /*
       * AND THE DESK LAST. What `inFront` marks is drawn over everybody,
       * which is the single ordering that stops a composite reading as
       * cutouts standing on air. [§27]
       */
      if (scene) paintSet(paper, scene, width, height, 'front');

      window.requestAnimationFrame(draw);
    };
    window.requestAnimationFrame(draw);

    return () => {
      stopped = true;
      for (const track of captured.getTracks()) track.stop();
      void context.close();
      compositorRef.current?.dispose();
      compositorRef.current = null;
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

  return {
    stream,
    layoutId: chosen,
    ready: Boolean(stream),
    videoFor: (id) => videosRef.current.get(id) ?? null,
  };
}
