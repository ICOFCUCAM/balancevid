'use client';

import { useRef, useState } from 'react';

/**
 * A take that was not recorded here.  [Doctrine STUDIO-TWO §2, §10, S-3]
 *
 * "Where you could upload videos to increase the number of takes."
 *
 * A performance is five visual performances of one song, and there is no
 * reason all five have to come out of a browser. Somebody films a verse on a
 * proper camera, on a beach, with a lens — and until now the only way in was
 * to perform it again into a webcam, which is the product telling a musician
 * their good footage is the wrong kind.
 *
 * IT REUSES THE RECORDING PATH ENTIRELY. The file is sent as chunks to the
 * same endpoint a recorder sends segments to, and finalised the same way — so
 * it is assembled, normalised, measured and aligned by exactly the code that
 * handles a recorded take. A second ingest path for uploaded media would be a
 * second place alignment could be got wrong.
 *
 * WHAT IS DIFFERENT IS WHAT IS KNOWN. A recorded take carries the browser's
 * own measurement of where it started against the song. A camera knows
 * nothing about the song, so an uploaded take is declared with NO hint and
 * `manual` as its method — and then the worker listens. If the song was
 * playing while they filmed, which is how anybody performs to a track, it is
 * audible in the recording and the offset is measured from it (S-3). If they
 * wore headphones, nothing is audible, the take lands at zero, and the author
 * nudges it. The product says which of those happened rather than presenting
 * a guess as a measurement. [INV-06, §10]
 */

/** Sent in pieces so a long take is not one request that can fail whole. */
const CHUNK_BYTES = 4 * 1024 * 1024;

export default function UploadTake({
  performanceId, environment, plateAssetId, onFinished, disabled,
}: {
  performanceId: string;
  /** Whatever the studio currently has selected, same as a recorded take. */
  environment?: { kind: string; spaceId?: string; assetId?: string };
  plateAssetId?: string;
  onFinished: (jobId: string) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    setSent(0);
    try {
      /*
       * Declared with no hint at all. A camera does not know when the song
       * started, and sending zero as though it were measured is exactly the
       * lie this studio spent three stages removing. [§10, S-3]
       */
      const declared = await fetch(`/api/performances/${performanceId}/takes`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label: file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Uploaded take',
          method: 'manual',
          ...(environment ? { environment } : {}),
          ...(plateAssetId ? { plateAssetId } : {}),
        }),
      });
      const takeBody = await declared.json().catch(() => ({}));
      if (!declared.ok) throw new Error(takeBody.error ?? 'that take could not be started');
      const takeId = takeBody.take?.id ?? takeBody.takeId;
      if (!takeId) throw new Error('that take could not be started');

      for (let index = 0, at = 0; at < file.size; index += 1, at += CHUNK_BYTES) {
        const part = file.slice(at, Math.min(at + CHUNK_BYTES, file.size));
        const response = await fetch(
          `/api/performances/${performanceId}/takes/${takeId}?index=${index}`,
          { method: 'POST', body: part,
            headers: { 'content-type': 'application/octet-stream' } },
        );
        if (!response.ok) throw new Error('the upload was interrupted');
        setSent(Math.min(100, Math.round(((at + part.size) / file.size) * 100)));
      }

      /*
       * Finalised with no elapsed time either. The check that compares a
       * recorder's running time against the samples that arrived is a check
       * on a DEVICE, and there was no device — sending a number here would
       * fail an honest file for a mismatch with a clock that never ran.
       */
      const done = await fetch(`/api/performances/${performanceId}/takes/${takeId}`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const doneBody = await done.json().catch(() => ({}));
      if (!done.ok) throw new Error(doneBody.error ?? 'that take could not be assembled');
      if (doneBody.job?.id) onFinished(doneBody.job.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setSent(0);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div data-testid="upload-take" style={{ marginTop: 6 }}>
      <input
        ref={input}
        type="file"
        accept="video/*"
        data-testid="upload-take-input"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button
        className="small"
        data-testid="upload-take-button"
        disabled={busy || disabled}
        onClick={() => input.current?.click()}
        style={{ width: '100%' }}
      >
        {busy ? `Uploading… ${sent}%` : 'Upload a take'}
      </button>
      <p className="small muted" style={{ fontSize: 11, margin: '4px 0 0' }}>
        {/* Said before they choose, because it decides whether the take lands
            in the right place or has to be dragged there. */}
        Filmed elsewhere? If the song was playing while you filmed, it will be
        heard in the recording and lined up for you.
      </p>
      {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}
    </div>
  );
}
