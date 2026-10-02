'use client';

import { useEffect, useState } from 'react';
import {
  type ShotProblem, lookOf, shotProblems,
} from '../../../src/domain/shot.js';

/**
 * Look at the picture before it goes on air.  [CHANNEL §23, D-04, C-45]
 *
 * THE BRIEF'S POINT 8: the camera panel reported the device, the
 * preset and the feed's bitrate — everything about the transport and
 * nothing about the picture. An operator could watch their own
 * preview for ten minutes and never be told the room is flat.
 *
 * IT READS THE MIXED STREAM, NOT THE RAW CAMERA, because that is
 * what the viewer gets: a dark camera composited onto a bright set
 * is not a dark picture, and judging the camera would be judging
 * something nobody sees. [D-22]
 *
 * EVERY TWO SECONDS, ONTO 64×36. The numbers are about the whole
 * frame, so a thumbnail carries all of them, and a control room
 * that spent a millisecond a second on this would be a control room
 * paying for advice it already took. The same bargain the
 * confidence monitor makes. [C-28]
 *
 * THE ARITHMETIC IS NOT HERE. `lookOf` and `shotProblems` are in the
 * domain, where a test can hand them a frame built pixel by pixel;
 * this is the glue that asks a video for one.
 */
const EVERY_MS = 2000;
const W = 64;
const H = 36;

export function useShot(stream: MediaStream | null): ShotProblem[] {
  const [problems, setProblems] = useState<ShotProblem[]>([]);

  useEffect(() => {
    if (!stream || stream.getVideoTracks().length === 0) {
      setProblems([]);
      return undefined;
    }
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const paper = canvas.getContext('2d', { willReadFrequently: true });
    let stopped = false;
    void video.play().catch(() => undefined);

    const look = () => {
      if (stopped || !paper || video.videoWidth === 0) return;
      try {
        paper.drawImage(video, 0, 0, W, H);
        const { data } = paper.getImageData(0, 0, W, H);
        setProblems(shotProblems(lookOf({ rgba: data, width: W, height: H })));
      } catch {
        /* A frame the browser will not hand over is a frame with no
           opinion attached. The panel simply says nothing. */
      }
    };
    const timer = setInterval(look, EVERY_MS);
    const first = setTimeout(look, 600);
    return () => {
      stopped = true;
      clearInterval(timer);
      clearTimeout(first);
      video.srcObject = null;
    };
  }, [stream]);

  return problems;
}
