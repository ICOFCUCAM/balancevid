'use client';

import type { RecordingSink } from './useMasterRecording.js';

/**
 * Where Studio Two's own recorder sends a take.
 *   [Doctrine STUDIO-TWO §10, U-06; D-19]
 *
 * The three calls that used to be written inside the recorder, moved out
 * unchanged — same paths, same bodies, same method on each. What moved
 * is only WHICH of them the hook knows about, so the sync arithmetic it
 * exists for can serve the Take App as well without being copied.
 */
export function performanceSink(performanceId: string): RecordingSink {
  return {
    begin: async (spec) => {
      const response = await fetch(`/api/performances/${performanceId}/takes`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(spec),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'could not begin the take');
      return data.takeId as string;
    },
    chunk: async (takeId, index, body) => {
      await fetch(
        `/api/performances/${performanceId}/takes/${takeId}?index=${index}`,
        { method: 'POST', body,
          headers: { 'content-type': 'application/octet-stream' } },
      );
    },
    finish: async (takeId, spec) => {
      const response = await fetch(`/api/performances/${performanceId}/takes/${takeId}`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(spec),
      });
      const data = await response.json().catch(() => ({}));
      return { jobId: data.job?.id as string | undefined };
    },
  };
}
