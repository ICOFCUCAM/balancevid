'use client';

import type { RecordingSink } from './useMasterRecording.js';

/**
 * Where a recorded SOUND goes.  [TIMELINE B6i, B8; D-19]
 *
 * "Recording directly into the timeline." The third sink on one
 * recorder, beside the studio's takes and the Take App's — same
 * declare / chunk / finish shape, same alignment arithmetic, same
 * crash-safety. A second recorder for voice-overs would be a second
 * place all of that could be got wrong, and the reason the hook was
 * given a sink in the first place. [U-06]
 *
 * WHAT IS DIFFERENT IS WHEN THE PLACEMENT IS DECIDED. A take is
 * declared with the offset the browser measured and the worker checks
 * it against the song; a sound has no alignment to check — it is put
 * where the author put it — so the placement travels with the FINISH,
 * once the recorder knows where the song actually was when capture
 * began. `MediaRecorder.start()` does not start capturing at the
 * moment it is called, and a voice-over placed at the moment the
 * button was pressed is early by however long the device took to
 * open: the one error nobody can see and everybody hears.
 */
export function soundSink(
  performanceId: string,
  /*
   * ASKED, NOT REMEMBERED.  [D-19]
   *
   * A function rather than a value, because the sink is built once
   * and the name is typed later — the first version took an object,
   * captured whatever the name was when the component mounted, and
   * filed every voice-over under "Voice-over" however carefully the
   * author had named it. The browser found that; nothing else could
   * have, because the name is correct everywhere on the way in.
   */
  place: () => {
    label: string;
    track: 'voice' | 'effect' | 'ambience' | 'music';
    loop?: boolean;
  },
): RecordingSink {
  const base = `/api/performances/${encodeURIComponent(performanceId)}/sounds/recording`;
  return {
    begin: async () => {
      const response = await fetch(base, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'could not begin the recording');
      return data.recordingId as string;
    },
    chunk: async (recordingId, index, body) => {
      await fetch(`${base}/${recordingId}?index=${index}`, {
        method: 'POST', body,
        headers: { 'content-type': 'application/octet-stream' },
      });
    },
    /*
     * `hintSamples` IS THE PLACEMENT, WHOLE.  [§10, S-3]
     *
     * It is already counted from the top of the SONG, not from where
     * the recording started: the hook adds the playhead it was started
     * from to how far into the count-in the recorder actually opened.
     * The first version of this file added the playhead a second time,
     * which is the doubling `useMasterRecording` warns about in the
     * comment directly above the line it takes this from — a
     * voice-over started at 02:00 would have landed at 04:00.
     *
     * For a take this number is a hypothesis the worker checks against
     * the song; here it IS the answer, because nothing about a
     * voice-over can be correlated with music it is spoken over.
     */
    finish: async (recordingId, spec) => {
      const asked = place();
      const response = await fetch(`${base}/${recordingId}`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label: asked.label,
          track: asked.track,
          fromSample: Math.max(0, spec.hintSamples),
          ...(asked.loop ? { loop: true } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'that recording could not be kept');
      return { jobId: data.job?.id as string | undefined };
    },
  };
}
