'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  type Quality, type QualityId, DEFAULT_QUALITY, qualityFor,
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

const KEY = 'balancevid.quality';

export interface QualityChoice {
  quality: Quality;
  id: QualityId;
  /** False until the stored value has been read, which is one paint. */
  settled: boolean;
  choose: (id: QualityId) => void;
}

export function useQuality(): QualityChoice {
  const [id, setId] = useState<QualityId>(DEFAULT_QUALITY);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY);
      if (stored) setId(qualityFor(stored).id);
    } catch { /* private browsing, or storage disabled. The default stands. */ }
    setSettled(true);
  }, []);

  const choose = useCallback((next: QualityId) => {
    setId(next);
    try { window.localStorage.setItem(KEY, next); } catch { /* as above. */ }
  }, []);

  return { quality: qualityFor(id), id, settled, choose };
}
