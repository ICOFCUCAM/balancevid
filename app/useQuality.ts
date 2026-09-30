'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  type Quality, type QualityId, DEFAULT_QUALITY, DEFAULT_RECORDING_QUALITY,
  LIVE_QUALITY_ORDER, QUALITY_ORDER, qualityFor, liveCapable,
} from '../src/domain/quality.js';

/**
 * The broadcast quality this MACHINE is set to.  [Doctrine CHANNEL §23, D-19]
 *
 * PER BROWSER, NOT PER CHANNEL, and the reasoning is in `quality.ts`: the
 * setting is really a statement about the camera in the room and the
 * building's uplink, and those belong to where somebody is sitting. A guest
 * joining from a hotel should not inherit the studio's Maximum and spend the
 * show dropping frames.
 *
 * WHY IT DOES NOT READ localStorage DURING RENDER. The server renders this
 * page too, and it has no localStorage — a first render that used the stored
 * value on the client and the default on the server is React #418, which
 * this product has already paid for once. So the first render is always the
 * default and the stored value arrives immediately after, before anything is
 * broadcast.
 */

/*
 * TWO PRESETS, NOT ONE, AND THEY ANSWER DIFFERENT QUESTIONS.
 *
 *   live       what this machine can COMPOSITE AND SEND right now — a
 *              statement about the CPU and the uplink, at this moment.
 *   recording  how good a SOURCE to keep — a statement about the camera
 *              and about what the footage will later be asked to do.
 *
 * A studio on a poor line records at 2160p and broadcasts at 720p, and
 * both of those are correct at the same time. One shared preset would
 * force the operator to choose which of the two to get wrong.
 *
 * THE LIVE KEY IS UNCHANGED, so nobody's stored broadcast setting moves
 * when this ships.
 */
const KEYS: Record<QualityScope, string> = {
  live: 'balancevid.quality',
  recording: 'balancevid.recording-quality',
};

const DEFAULTS: Record<QualityScope, QualityId> = {
  live: DEFAULT_QUALITY,
  recording: DEFAULT_RECORDING_QUALITY,
};

/** Which menu, and which of the two remembered answers. */
export type QualityScope = 'live' | 'recording';

export interface QualityChoice {
  quality: Quality;
  id: QualityId;
  /** False until the stored value has been read, which is one paint. */
  settled: boolean;
  choose: (id: QualityId) => void;
  /** The presets this scope may offer, worst to best. */
  offered: QualityId[];
}

export function useQuality(scope: QualityScope = 'live'): QualityChoice {
  const [id, setId] = useState<QualityId>(DEFAULTS[scope]);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEYS[scope]);
      if (stored) setId(qualityFor(stored).id);
    } catch { /* private browsing, or storage disabled. The default stands. */ }
    setSettled(true);
  }, [scope]);

  const choose = useCallback((next: QualityId) => {
    setId(next);
    try {
      window.localStorage.setItem(KEYS[scope], next);
    } catch { /* as above. */ }
  }, [scope]);

  /*
   * A STORED `ultra` NEVER REACHES THE AIR.
   *
   * The two keys are separate, so this should not happen — but a shared
   * machine, a hand-edited preference or a future rename could put one
   * there, and going live at 2160p through a JavaScript canvas mixer is
   * a dropped-frame show rather than a sharp one. Clamped where it is
   * read, not where it is written, because that is the place that
   * cannot be bypassed. [quality.ts]
   */
  const resolved = scope === 'live' && !liveCapable(id) ? qualityFor('maximum') : qualityFor(id);

  return {
    quality: resolved,
    id: resolved.id,
    settled,
    choose,
    offered: scope === 'live' ? LIVE_QUALITY_ORDER : QUALITY_ORDER,
  };
}
