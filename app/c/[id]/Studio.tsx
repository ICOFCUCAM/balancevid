'use client';

/**
 * Live Conversation Mode.  [Doctrine §36, U-27, U-28, Part 0 principle 4]
 *
 * "The spacebar is the product."
 *
 *   video playing  -> SPACE -> pause, stamp, start recording (with pre-roll)
 *   recording      -> SPACE -> stop recording, resume source from the same frame
 *
 * A user must be able to go from source to published video without ever
 * opening Studio Mode (U-28), so everything needed to finish is on this screen.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { INTERVENTION_TYPES, type InterventionType } from '../../../src/domain/document.js';
import { HOUSE_FPS, formatTimecode, type Frames } from '../../../src/domain/time.js';
import { TYPE_PRESENTATION } from '../../../src/domain/presentation.js';
import { forDisplay, type Transcript } from '../../../src/transcribe/types.js';
import { sentenceAtFrame } from '../../../src/transcribe/segmentation.js';

/** Self-contained segments: the only rolling pre-roll a browser can actually
 *  replay, because MediaRecorder writes its header into the first blob. [U-04] */
const SEGMENT_MS = 4000;
const PREROLL_SEGMENTS = 2; // ~8 seconds
/**
 * Below this, a segment is a bare WebM header with no frames in it -- what you
 * get when a recorder is stopped milliseconds after starting, which happens
 * whenever the user interrupts right on a segment boundary. Uploading it would
 * only hand the worker a stub to throw away.
 */
const MIN_SEGMENT_BYTES = 1024;

type Phase = 'cold' | 'arming' | 'armed' | 'starting' | 'recording' | 'stopping' | 'denied';

interface Snapshot {
  conversation: any;
  timeline: any;
  sourceRatio: number;
  plan: any;
  planError: string | null;
  invariantError: string | null;
  jobs: any[];
}

export default function Studio({ conversationId }: { conversationId: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [phase, setPhase] = useState<Phase>('cold');
  const [type, setType] = useState<InterventionType>('critique');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const camRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const ringRef = useRef<Blob[]>([]);
  const phaseRef = useRef<Phase>('cold');
  const anchorRef = useRef<number>(0);
  const typeRef = useRef<InterventionType>('critique');
  const takeRef = useRef<Promise<{ interventionId: string; takeId: string }> | null>(null);
  const indexRef = useRef(0);
  const prerollRef = useRef(0);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const finalizeRef = useRef<(() => Promise<void>) | null>(null);
  const mimeRef = useRef<string>('video/webm');
  const disarmRef = useRef(false);

  const setPhaseBoth = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/conversations/${conversationId}`, { cache: 'no-store' });
    if (response.ok) setSnapshot(await response.json());
  }, [conversationId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // The transcript arrives after the source is playable, in its own job, so it
  // is fetched when the document says a version exists.
  const transcriptVersion = snapshot?.conversation?.source?.transcriptVersion ?? null;
  useEffect(() => {
    if (!transcriptVersion) return;
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/conversations/${conversationId}/transcript`, { cache: 'no-store' });
      if (!response.ok || cancelled) return;
      const data = await response.json();
      if (!cancelled) setTranscript(data.transcript ?? null);
    })();
    return () => { cancelled = true; };
  }, [conversationId, transcriptVersion]);

  // The transcript follows playback (§16): the sentence being spoken is
  // highlighted, and it freezes where the user interrupts.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => setCurrentFrame(Math.floor(video.currentTime * HOUSE_FPS));
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('seeked', onTime);
    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('seeked', onTime);
    };
  }, [snapshot?.conversation?.source?.durationFrames]);

  /**
   * Poll while anything is still being processed.
   *
   * Source normalisation and take assembly both happen in the worker (U-23),
   * so the document changes without the page doing anything. Without this the
   * screen silently freezes on whatever was true when the last response was
   * saved -- and the export button stays disabled after the work that would
   * enable it has already finished.
   */
  const working = (() => {
    if (!snapshot) return true;
    if (!(snapshot.conversation?.source?.durationFrames > 0)) return true;
    const assembling = (snapshot.conversation?.interventions ?? []).some(
      (iv: any) => (iv.takes ?? []).every((t: any) => t.durationFrames === 0));
    const queued = (snapshot.jobs ?? []).some(
      (job: any) => job.state === 'pending' || job.state === 'running');
    return assembling || queued;
  })();

  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => { void refresh(); }, 1200);
    return () => clearInterval(timer);
  }, [working, refresh]);

  // ---- capture ------------------------------------------------------------

  const startSegment = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || disarmRef.current) return;
    const recorder = new MediaRecorder(stream, { mimeType: mimeRef.current });
    const parts: Blob[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size > 0) parts.push(event.data); };
    recorder.onstop = () => {
      const blob = new Blob(parts, { type: mimeRef.current });
      handleSegment(blob);
      if (phaseRef.current !== 'stopping' && !disarmRef.current) startSegment();
    };
    recorder.start();
    recRef.current = recorder;
    window.setTimeout(() => {
      if (recRef.current === recorder && recorder.state === 'recording') recorder.stop();
    }, SEGMENT_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upload = useCallback(async (takeId: string, index: number, blob: Blob) => {
    await fetch(
      `/api/conversations/${conversationId}/takes/${takeId}/chunks?index=${index}`,
      { method: 'POST', body: blob, headers: { 'content-type': 'application/octet-stream' } },
    );
  }, [conversationId]);

  const handleSegment = useCallback((blob: Blob) => {
    const current = phaseRef.current;

    if (current !== 'starting' && current !== 'recording' && current !== 'stopping') {
      // Rolling pre-roll: hold the last few seconds, discard the rest.
      if (blob.size >= MIN_SEGMENT_BYTES) {
        ringRef.current = [...ringRef.current, blob].slice(-PREROLL_SEGMENTS);
      }
      return;
    }

    // Uploads are chained so segment order on disk matches capture order.
    chainRef.current = chainRef.current.then(async () => {
      const take = await takeRef.current;
      if (!take) return;

      if (blob.size >= MIN_SEGMENT_BYTES) {
        await upload(take.takeId, indexRef.current++, blob);
        // The segment sealed by the key press ends AT the press, so it is
        // pre-roll too -- the words said before deciding to speak. [U-04]
        if (phaseRef.current === 'starting') prerollRef.current += 1;
      }

      if (phaseRef.current === 'starting') setPhaseBoth('recording');
      // Finalising before the last segment reached disk would silently discard
      // the end of the response -- the most recently spoken words, and the ones
      // the user is most likely to have cared about.
      else if (phaseRef.current === 'stopping') await finalizeRef.current?.();
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [upload, setPhaseBoth]);

  const arm = useCallback(async () => {
    setError(null);
    setPhaseBoth('arming');
    try {
      // The conferencing defaults destroy voice quality for recording, and are
      // the reason most webcam commentary sounds thin. [Doctrine U-26 §1]
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: HOUSE_FPS } },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: 48000,
        },
      });
      streamRef.current = stream;
      if (camRef.current) { camRef.current.srcObject = stream; void camRef.current.play(); }

      for (const candidate of ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm']) {
        if (MediaRecorder.isTypeSupported(candidate)) { mimeRef.current = candidate; break; }
      }

      // Live level monitoring. Silent failure during an irreplaceable take is
      // never acceptable. [U-26 §3]
      try {
        const audio = new AudioContext();
        const analyser = audio.createAnalyser();
        analyser.fftSize = 512;
        audio.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
          setLevel(peak);
          if (!disarmRef.current) requestAnimationFrame(tick);
        };
        tick();
      } catch { /* metering is a nicety; recording is not */ }

      disarmRef.current = false;
      setPhaseBoth('armed');
      startSegment();
    } catch (e) {
      setPhaseBoth('denied');
      setError(e instanceof Error ? e.message : 'camera and microphone access was refused');
    }
  }, [setPhaseBoth, startSegment]);

  useEffect(() => () => {
    disarmRef.current = true;
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  // ---- the one key --------------------------------------------------------

  const interrupt = useCallback((options: { frame?: Frames; quote?: string } = {}) => {
    const video = videoRef.current;
    if (!video) return;

    // Synchronous, before any render or network call. Nothing may sit between
    // the keypress and the timestamp. [Doctrine U-04 §4, D-05]
    const frame = options.frame ?? Math.floor(video.currentTime * HOUSE_FPS);
    video.pause();
    if (options.frame !== undefined) video.currentTime = options.frame / HOUSE_FPS;

    anchorRef.current = frame;
    indexRef.current = 0;
    prerollRef.current = 0;
    setPhaseBoth('starting');
    setStatus(`interrupted at ${formatTimecode(frame)} (frame ${frame})`);

    takeRef.current = fetch(`/api/conversations/${conversationId}/interventions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tSourceFrame: frame,
        type: typeRef.current,
        ...(options.quote ? { quote: options.quote } : {}),
      }),
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'could not open the intervention');
      return data as { interventionId: string; takeId: string };
    });

    // Flush the buffered pre-roll first, so it lands ahead of everything the
    // user is about to say. Appended to the chain before the sealed segment,
    // which keeps segment order on disk equal to capture order.
    chainRef.current = chainRef.current.then(async () => {
      const take = await takeRef.current;
      if (!take) return;
      for (const buffered of ringRef.current) {
        await upload(take.takeId, indexRef.current++, buffered);
      }
      prerollRef.current = ringRef.current.length;
      ringRef.current = [];
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)));

    // Seal the in-flight segment: it holds the moments just before the press.
    if (recRef.current?.state === 'recording') recRef.current.stop();
  }, [conversationId, setPhaseBoth, upload]);

  const finalizeTake = useCallback(async () => {
    if (finalizeRef.current === null) return;
    finalizeRef.current = null; // once only, however the last segment arrives

    const take = await takeRef.current;
    if (take) {
      await fetch(`/api/conversations/${conversationId}/takes/${take.takeId}/finalize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          interventionId: take.interventionId,
          prerollSegments: prerollRef.current,
          captureMimeType: mimeRef.current,
        }),
      });
    }

    // Resume the source from EXACTLY the frame it stopped on. Not around it.
    const video = videoRef.current;
    if (video) {
      video.currentTime = anchorRef.current / HOUSE_FPS;
      await video.play().catch(() => { /* autoplay policy */ });
    }
    setStatus(`resumed at ${formatTimecode(anchorRef.current)} · response saved`);
    setPhaseBoth('armed');
    startSegment();
    await refresh();
  }, [conversationId, refresh, setPhaseBoth, startSegment]);

  const resume = useCallback(() => {
    setPhaseBoth('stopping');
    finalizeRef.current = finalizeTake;

    if (recRef.current?.state === 'recording') {
      // The segment handler finalises once this last blob is safely uploaded.
      recRef.current.stop();
    } else {
      // Nothing in flight (we are between segments): finalise directly rather
      // than waiting for an onstop that will never fire.
      chainRef.current = chainRef.current
        .then(() => finalizeTake())
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }
  }, [finalizeTake, setPhaseBoth]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.code !== 'Space') return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      event.preventDefault();
      const current = phaseRef.current;
      if (current === 'recording') { resume(); return; }
      if (current === 'armed') { interrupt(); return; }
      if (current === 'cold' || current === 'denied') { void arm(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [arm, interrupt, resume]);

  // ---- rendering ----------------------------------------------------------

  const startRender = useCallback(async () => {
    setError(null);
    const response = await fetch(`/api/conversations/${conversationId}/renders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ exportProfileId: 'youtube_16x9', burnInCaptions: true }),
    });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? 'render refused'); return; }
    setRenderJobId(data.job.id);
  }, [conversationId]);

  const [renderJob, setRenderJob] = useState<any>(null);
  useEffect(() => {
    if (!renderJobId) return;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/jobs/${renderJobId}`, { cache: 'no-store' });
      if (!response.ok) return;
      const { job } = await response.json();
      setRenderJob(job);
      if (job.state === 'done' || job.state === 'failed') {
        clearInterval(timer);
        void refresh();
      }
    }, 900);
    return () => clearInterval(timer);
  }, [renderJobId, refresh]);

  const conversation = snapshot?.conversation;
  const ready = conversation?.source?.durationFrames > 0;
  const interventions = conversation?.interventions ?? [];
  const pending = interventions.filter((i: any) =>
    (i.takes ?? []).every((t: any) => t.durationFrames === 0)).length;
  const recording = phase === 'starting' || phase === 'recording' || phase === 'stopping';
  const currentSentence = transcript ? sentenceAtFrame(transcript.sentences, currentFrame) : null;

  /**
   * Respond to a specific statement.  [Doctrine §11, §12, U-09, U-10]
   *
   * The cut defaults to the END of the sentence: someone answering a claim
   * wants the audience to hear the claim first. Cutting at its start would
   * remove it from the final video and the response would answer something
   * nobody heard.
   *
   * If the user has selected part of the sentence, that selection is the
   * claim -- bound to its hash server-side, so what appears on the quote card
   * is what the source actually said.
   */
  const respondToSentence = useCallback((sentence: any) => {
    if (!transcript) return;
    const selected = typeof window !== 'undefined' ? String(window.getSelection() ?? '').trim() : '';
    const full = forDisplay(sentence.text, transcript.characteristics);
    const quote = selected && full.toLowerCase().includes(selected.toLowerCase()) ? selected : full;
    interrupt({ frame: sentence.endFrame, quote });
  }, [transcript, interrupt]);

  return (
    <div className="wrap">
      <div className="row" style={{ marginBottom: 16 }}>
        <div className="grow">
          <h1 style={{ marginBottom: 2 }}>{conversation?.title ?? 'Conversation'}</h1>
          <div className="small muted">
            Source: {conversation?.source?.title} · Class {conversation?.source?.class}
            {ready && <> · {formatTimecode(conversation.source.durationFrames)}</>}
          </div>
        </div>
        <a className="btn" href="/">All conversations</a>
      </div>

      {error && <div className="panel" style={{ borderColor: 'var(--bad)', marginBottom: 12 }}>{error}</div>}
      {snapshot?.invariantError && (
        <div className="panel" style={{ borderColor: 'var(--bad)', marginBottom: 12 }}>
          Invariant violation: {snapshot.invariantError}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,0.85fr) minmax(0,1.6fr) minmax(0,1fr)', gap: 16 }}>
        <section className="panel" style={{ maxHeight: '78vh', overflow: 'auto', padding: 12 }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <strong className="grow">Source transcript</strong>
            {transcript && (
              <span className="small muted mono">{transcript.sentences.length}</span>
            )}
          </div>
          {!transcriptVersion && (
            <div className="small muted">
              Transcribing… this runs after the source is playable, so you can
              start responding without waiting for it.
            </div>
          )}
          {transcript?.sentences.map((sentence) => {
            const active = currentSentence?.id === sentence.id;
            return (
              <div
                key={sentence.id}
                style={{
                  borderLeft: `2px solid ${active ? 'var(--source-accent)' : 'transparent'}`,
                  background: active ? 'var(--panel-2)' : 'transparent',
                  padding: '6px 8px', marginBottom: 2, borderRadius: 4,
                }}
              >
                <div className="row" style={{ gap: 8 }}>
                  <button
                    className="small mono"
                    style={{ padding: '1px 6px', background: 'transparent', border: 'none', color: 'var(--source-accent)' }}
                    onClick={() => {
                      const video = videoRef.current;
                      if (video) video.currentTime = sentence.startFrame / HOUSE_FPS;
                    }}
                    title="Jump here"
                  >
                    {formatTimecode(sentence.startFrame)}
                  </button>
                  <button
                    className="small grow"
                    style={{ padding: '1px 6px', textAlign: 'right', background: 'transparent', border: 'none', color: 'var(--user-accent)' }}
                    onClick={() => respondToSentence(sentence)}
                    disabled={phase !== 'armed'}
                    title="They finish the sentence, then you reply"
                  >
                    respond ↵
                  </button>
                </div>
                <div className="small" style={{ padding: '0 6px' }}>
                  {forDisplay(sentence.text, transcript.characteristics)}
                </div>
              </div>
            );
          })}
          {transcript && transcript.sentences.length === 0 && (
            <div className="small muted">No speech was detected in this source.</div>
          )}
        </section>

        <section>
          <div className="panel" style={{ padding: 10 }}>
            {ready ? (
              <video
                ref={videoRef}
                src={`/api/conversations/${conversationId}/source`}
                controls
                preload="auto"
                playsInline
              />
            ) : (
              <div className="muted" style={{ padding: 40, textAlign: 'center' }}>
                Normalising the source to the house format…
                <div className="small">Constant frame rate, keyframe every second — this is what makes the cuts exact.</div>
              </div>
            )}
          </div>

          <div className="panel" style={{ marginTop: 12 }}>
            <div className="row">
              <strong className="grow">
                {phase === 'cold' && 'Press space to arm the camera'}
                {phase === 'arming' && 'Requesting camera and microphone…'}
                {phase === 'armed' && 'Play the video. Press space to interrupt.'}
                {phase === 'starting' && 'Recording — press space to continue the source'}
                {phase === 'recording' && 'Recording — press space to continue the source'}
                {phase === 'stopping' && 'Saving your response…'}
                {phase === 'denied' && 'Camera access refused'}
              </strong>
              {recording && (
                // The camera light is the truth. [Doctrine D-03]
                <span className="mono small" style={{ color: 'var(--bad)' }}>● REC</span>
              )}
            </div>

            <div className="row" style={{ marginTop: 10 }}>
              <button onClick={() => (phaseRef.current === 'recording' ? resume() : interrupt())}
                      disabled={phase !== 'armed' && !recording}>
                {recording ? '↩ Continue source' : '✋ Interrupt'}
              </button>
              <button onClick={() => void arm()} disabled={phase === 'armed' || recording}>
                🎙 Arm camera
              </button>
              <select
                value={type}
                onChange={(e) => { const v = e.target.value as InterventionType; setType(v); typeRef.current = v; }}
                style={{ width: 220 }}
                disabled={recording}
              >
                {INTERVENTION_TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_PRESENTATION[t].lowerThird}</option>
                ))}
              </select>
            </div>
            <p className="small muted" style={{ marginBottom: 0 }}>
              {status || 'One key does the whole loop: space interrupts, space continues.'}
            </p>
          </div>
        </section>

        <aside>
          <div className="panel">
            <div className="row" style={{ marginBottom: 8 }}>
              <strong className="grow">You</strong>
              <span className="small muted mono">
                {phase === 'armed' || recording ? `${Math.round(level * 100)}%` : 'off'}
              </span>
            </div>
            <video ref={camRef} muted playsInline style={{ aspectRatio: '16/9', objectFit: 'cover' }} />
            <div style={{ height: 6, background: 'var(--panel-2)', borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, level * 140)}%`,
                background: level > 0.92 ? 'var(--bad)' : level > 0.6 ? 'var(--warn)' : 'var(--ok)',
              }} />
            </div>
            <p className="small muted" style={{ marginBottom: 0, marginTop: 8 }}>
              An 8-second buffer runs continuously, so pressing space late never
              clips the first words of your response.
            </p>
          </div>

          <div className="panel" style={{ marginTop: 12 }}>
            <strong>Conversation</strong>
            <div className="small muted" style={{ marginBottom: 8 }}>
              {interventions.length} intervention{interventions.length === 1 ? '' : 's'}
              {pending > 0 && <> · {pending} still processing</>}
              {snapshot && <> · {Math.round(snapshot.sourceRatio * 100)}% source</>}
            </div>
            {interventions.length === 0 && <div className="small muted">Nothing yet.</div>}
            {[...interventions]
              .sort((a: any, b: any) => a.anchor.tSourceFrame - b.anchor.tSourceFrame)
              .map((ivn: any) => {
                const take = (ivn.takes ?? []).find((t: any) => t.id === ivn.selectedTakeId);
                const usable = take ? take.mediaOutFrame - take.mediaInFrame : 0;
                return (
                  <div key={ivn.id} className="row small" style={{ borderTop: '1px solid var(--line)', padding: '7px 0' }}>
                    <span className="mono" style={{ color: 'var(--source-accent)' }}>
                      {formatTimecode(ivn.anchor.tSourceFrame)}
                    </span>
                    <span className="grow" style={{ color: 'var(--user-accent)' }}>
                      {TYPE_PRESENTATION[ivn.type as InterventionType]?.lowerThird ?? ivn.type}
                    </span>
                    <span className="mono muted">
                      {usable > 0 ? formatTimecode(usable) : '…'}
                    </span>
                    {ivn.anchor?.quote && (
                      <div className="small muted" style={{ flexBasis: '100%', fontStyle: 'italic' }}>
                        “{ivn.anchor.quote}”
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          <div className="panel" style={{ marginTop: 12 }}>
            <strong>Export</strong>
            <div className="small muted" style={{ marginBottom: 8 }}>
              {snapshot?.plan
                ? <>{snapshot.plan.shots} shots · {formatTimecode(snapshot.plan.totalOutputFrames)} · mastered to {snapshot.plan.audio.loudnessLufs} LUFS</>
                : snapshot?.planError ?? 'Nothing to render yet.'}
            </div>
            <button className="primary" onClick={() => void startRender()}
                    disabled={!snapshot?.plan || pending > 0 || recording}>
              Generate final video
            </button>
            {pending > 0 && <p className="small muted">Waiting for {pending} response{pending === 1 ? '' : 's'} to finish processing.</p>}
            {(snapshot?.jobs ?? []).filter((j: any) => j.state === 'failed').map((j: any) => (
              <p key={j.id} className="small" style={{ color: 'var(--bad)' }}>
                {j.kind} failed: {j.error}
              </p>
            ))}
            {renderJob && (
              <div className="small" style={{ marginTop: 10 }}>
                <div className="mono">{renderJob.state} {renderJob.progress != null && `· ${renderJob.progress}%`}</div>
                {renderJob.state === 'failed' && <div style={{ color: 'var(--bad)' }}>{renderJob.error}</div>}
                {renderJob.state === 'done' && renderJob.result?.planHash && (
                  <div style={{ marginTop: 6 }}>
                    <div className="muted">
                      {renderJob.result.shotsRendered} rendered, {renderJob.result.shotsCached} cached
                    </div>
                    <a className="btn" style={{ display: 'inline-block', marginTop: 6 }}
                       href={`/api/conversations/${conversationId}/renders/${renderJob.result.planHash}/file`}>
                      Download MP4
                    </a>{' '}
                    <a className="small" href={`/api/conversations/${conversationId}/renders/${renderJob.result.planHash}/file?kind=srt`}>.srt</a>{' '}
                    <a className="small" href={`/api/conversations/${conversationId}/renders/${renderJob.result.planHash}/file?kind=vtt`}>.vtt</a>
                  </div>
                )}
              </div>
            )}
            {snapshot?.plan && (
              <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
                {snapshot.plan.attribution.text}
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
