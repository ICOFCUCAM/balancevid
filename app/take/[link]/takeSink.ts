'use client';

import type { RecordingSink } from '../../p/[id]/useMasterRecording.js';

/**
 * Where the Take App sends a recording.  [D-19, D-25; TAKE-APP T3, T5]
 *
 * The second of two sinks, and the whole reason the recorder takes one:
 * everything difficult about recording against a song — the song on the
 * audio clock, the offset taken at the instant the first chunk closes,
 * the device latency subtracted, the elapsed time measured where it is
 * honest — is identical on a producer's laptop and a performer's phone,
 * and must not exist twice.
 *
 * WHAT DIFFERS IS THREE URLS AND ONE FACT: this one reports the device,
 * because a producer with twenty submissions and one that is out of
 * sync needs to know which phone it came from, and on the studio's own
 * recorder there is only ever one machine.
 */
export function takeSink(link: string): RecordingSink {
  const at = `/api/take/${encodeURIComponent(link)}`;
  return {
    begin: async () => {
      const response = await fetch(`${at}/submissions`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? 'could not start recording');
      }
      return data.submissionId as string;
    },
    chunk: async (id, index, body) => {
      await fetch(`${at}/submissions/${id}?index=${index}`, {
        method: 'POST', body,
        headers: { 'content-type': 'application/octet-stream' },
      });
    },
    finish: async (id, spec) => {
      await fetch(`${at}/submissions/${id}`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...spec,
          device: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
        }),
      });
      /*
       * NO JOB COMES BACK, and that is the design rather than an
       * omission. A submission is not turned into a take until a
       * producer accepts it — that is the only moment D-25 allows — so
       * there is nothing for the performer to wait on and nothing for
       * them to be told about somebody else's production.
       */
      return {};
    },
  };
}
