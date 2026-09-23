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
import SignOut from '../../SignOut.js';
import { INTERVENTION_TYPES, type InterventionType } from '../../../src/domain/document.js';
import { HOUSE_FPS, formatTimecode, type Frames } from '../../../src/domain/time.js';
import { TYPE_PRESENTATION } from '../../../src/domain/presentation.js';
import { forDisplay, type Transcript } from '../../../src/transcribe/types.js';
import { sentenceAtFrame } from '../../../src/transcribe/segmentation.js';
import StudioMode from './StudioMode.js';

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
  /** Two modes (§36). Live is the front door; Studio is never required (U-28). */
  const [mode, setMode] = useState<'live' | 'studio'>('live');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const embedRef = useRef<HTMLIFrameElement | null>(null);
  const ytRef = useRef<any>(null);
  /**
   * One interface over both kinds of source.  [Doctrine U-01]
   *
   * A governed source is our own <video>; an embedded one is the provider's
   * player, driven through the provider's API. The one-key loop does not know
   * or care which — it asks for the current frame, pauses, and resumes.
   */
  const sourcePlayerRef = useRef<{
    currentFrame(): number;
    pause(): void;
    play(): void;
    seek(frame: number): void;
    durationFrames(): number;
  } | null>(null);
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

  const isEmbedded = snapshot?.conversation?.source?.class === 'B';

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

  /**
   * Deep links back from the article (U-14) land on ?t=<frame>.
   *
   * The article cites a moment; following the citation has to arrive at that
   * exact moment, or the citation is decorative.
   */
  const [deepLinked, setDeepLinked] = useState(false);
  useEffect(() => {
    if (deepLinked) return;
    const video = videoRef.current;
    if (!video || !(snapshot?.conversation?.source?.durationFrames > 0)) return;
    const frame = Number(new URLSearchParams(window.location.search).get('t'));
    if (!Number.isFinite(frame) || frame <= 0) { setDeepLinked(true); return; }
    video.currentTime = frame / HOUSE_FPS;
    setCurrentFrame(frame);
    setDeepLinked(true);
  }, [deepLinked, snapshot?.conversation?.source?.durationFrames]);

  useEffect(() => {
    if (isEmbedded) return;
    const video = videoRef.current;
    if (!video) return;
    sourcePlayerRef.current = {
      currentFrame: () => Math.floor(video.currentTime * HOUSE_FPS),
      pause: () => video.pause(),
      play: () => { void video.play().catch(() => undefined); },
      seek: (frame) => { video.currentTime = frame / HOUSE_FPS; },
      durationFrames: () => Math.floor((video.duration || 0) * HOUSE_FPS),
    };
  }, [isEmbedded, snapshot?.conversation?.source?.durationFrames]);

  // The provider's player. We never touch their media; we ask their player to
  // play, to pause, and where it is. [U-01, U-35 §6]
  useEffect(() => {
    if (!isEmbedded || snapshot?.conversation?.source?.provider !== 'youtube') return;
    const win = window as any;
    const attach = () => {
      if (!embedRef.current || ytRef.current) return;
      ytRef.current = new win.YT.Player(embedRef.current, {
        events: {
          onReady: () => {
            sourcePlayerRef.current = {
              currentFrame: () => Math.floor((ytRef.current?.getCurrentTime() ?? 0) * HOUSE_FPS),
              pause: () => ytRef.current?.pauseVideo(),
              play: () => ytRef.current?.playVideo(),
              seek: (frame) => ytRef.current?.seekTo(frame / HOUSE_FPS, true),
              durationFrames: () => Math.floor((ytRef.current?.getDuration() ?? 0) * HOUSE_FPS),
            };
            const duration = sourcePlayerRef.current.durationFrames();
            if (duration > 0 && !(snapshot?.conversation?.source?.durationFrames > 0)) {
              void fetch(`/api/conversations/${conversationId}/source-meta`, {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ durationFrames: duration }),
              }).then(() => refresh());
            }
          },
        },
      });
    };
    if (win.YT?.Player) { attach(); return; }
    const previous = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = () => { previous?.(); attach(); };
    if (!document.querySelector('script[data-yt-api]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.dataset['ytApi'] = '1';
      script.onerror = () => setError(
        'the provider\u2019s player could not be loaded from this network');
      document.head.append(script);
    }
  }, [isEmbedded, snapshot?.conversation?.source?.provider,
      snapshot?.conversation?.source?.durationFrames, conversationId, refresh]);

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

  /**
   * Everything a take needs to begin, however it was started.
   *
   * Shared by INTERRUPT and RE-RECORD so the pre-roll behaves identically in
   * both: the buffered segments are flushed first, then the segment sealed by
   * the key press, then whatever is said next.
   */
  const beginTake = useCallback((
    take: Promise<{ interventionId: string; takeId: string }>,
  ) => {
    indexRef.current = 0;
    prerollRef.current = 0;
    takeRef.current = take;
    setPhaseBoth('starting');

    chainRef.current = chainRef.current.then(async () => {
      const resolved = await takeRef.current;
      if (!resolved) return;
      for (const buffered of ringRef.current) {
        await upload(resolved.takeId, indexRef.current++, buffered);
      }
      prerollRef.current = ringRef.current.length;
      ringRef.current = [];
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)));

    // Seal the in-flight segment: it holds the moments just before the press.
    if (recRef.current?.state === 'recording') recRef.current.stop();
  }, [upload, setPhaseBoth]);

  const interrupt = useCallback((options: {
    frame?: Frames; quote?: string;
    /** Answering a SUGGESTED claim. The server binds it with its provenance. */
    claimKey?: string; by?: string; editedQuote?: string;
  } = {}) => {
    const player = sourcePlayerRef.current;
    if (!player) return;

    // Synchronous, before any render or network call. Nothing may sit between
    // the keypress and the timestamp. [Doctrine U-04 §4, D-05]
    const frame = options.frame ?? player.currentFrame();
    player.pause();
    if (options.frame !== undefined) player.seek(options.frame);

    anchorRef.current = frame;
    setStatus(`interrupted at ${formatTimecode(frame)} (frame ${frame})`);

    beginTake(fetch(`/api/conversations/${conversationId}/interventions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tSourceFrame: frame,
        type: typeRef.current,
        ...(options.quote ? { quote: options.quote } : {}),
        ...(options.claimKey
          ? {
            claimKey: options.claimKey,
            by: options.by,
            ...(options.editedQuote ? { editedQuote: options.editedQuote } : {}),
          }
          : {}),
      }),
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'could not open the intervention');
      return data as { interventionId: string; takeId: string };
    }));
  }, [beginTake, conversationId]);

  /**
   * Re-record an existing point.  [Doctrine U-06 §1, §17]
   *
   * Appends a take; the previous one stays until the new one is assembled, so
   * an abandoned re-record costs nothing and nothing is ever overwritten.
   */
  const rerecord = useCallback((interventionId: string) => {
    if (phaseRef.current !== 'armed') return;
    const player = sourcePlayerRef.current;
    // Resume lands back exactly here, so re-recording does not move the source.
    anchorRef.current = player ? player.currentFrame() : anchorRef.current;
    player?.pause();
    setStatus('re-recording — press space to finish');

    beginTake(fetch(
      `/api/conversations/${conversationId}/interventions/${interventionId}/takes`,
      { method: 'POST', headers: { 'content-type': 'application/json' } },
    ).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'could not open a new take');
      return data as { interventionId: string; takeId: string };
    }));
  }, [beginTake, conversationId]);

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
    const player = sourcePlayerRef.current;
    if (player) {
      player.seek(anchorRef.current);
      player.play();
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

  const seekTo = useCallback((frame: number) => {
    sourcePlayerRef.current?.seek(frame);
    setCurrentFrame(frame);
  }, []);

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
          {conversation?.lineage && (
            <div className="small" style={{ color: 'var(--user-accent)' }}>
              Responding to{' '}
              <a href={`/c/${conversation.lineage.parentConversationId}/watch`}>
                “{conversation.lineage.chain.at(-1)?.title}”
              </a>
              {conversation.lineage.chain.length > 1
                && ` · ${conversation.lineage.chain.length} responses deep`}
            </div>
          )}
          <div className="small muted">
            Source: {conversation?.source?.title}
            {' · '}
            {isEmbedded
              ? `${conversation?.source?.provider ?? 'embedded'} — played on its own platform`
              : 'your own copy'}
            {ready && <> · {formatTimecode(conversation.source.durationFrames)}</>}
          </div>
        </div>
        {/* Two modes (§36). Live is the whole product; Studio is the refinement
            nobody is required to open (U-28). */}
        <div className="row" style={{ gap: 0 }} role="tablist" aria-label="Mode">
          <button
            role="tab"
            aria-selected={mode === 'live'}
            onClick={() => setMode('live')}
            style={{ borderRadius: '8px 0 0 8px', background: mode === 'live' ? '#2b5f8a' : undefined }}
          >
            Live
          </button>
          <button
            role="tab"
            aria-selected={mode === 'studio'}
            onClick={() => setMode('studio')}
            style={{ borderRadius: '0 8px 8px 0', background: mode === 'studio' ? '#2b5f8a' : undefined }}
          >
            Studio
          </button>
        </div>
        <a className="btn" href="/">All conversations</a>
        <SignOut />
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
          {isEmbedded ? (
            <div className="small muted">
              The source plays on its own platform, so we never see its audio
              and cannot transcribe it. Interrupt with space; you can bind the
              statement you are answering by typing it on the response.
            </div>
          ) : !transcriptVersion ? (
            <div className="small muted">
              Transcribing… this runs after the source is playable, so you can
              start responding without waiting for it.
            </div>
          ) : null}
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

          <ClaimsPanel
            conversationId={conversationId}
            transcriptVersion={transcriptVersion}
            canRecord={phase === 'armed'}
            onSeek={seekTo}
            onRespond={(claim: any, by: string, editedQuote?: string) => interrupt({
              frame: claim.suggested.endFrame,
              claimKey: claim.key,
              by,
              ...(editedQuote ? { editedQuote } : {}),
            })}
          />
        </section>

        <section>
          <div className="panel" style={{ padding: 10 }}>
            {isEmbedded ? (
              <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#000' }}>
                <iframe
                  ref={embedRef}
                  src={snapshot?.conversation?.source?.embedUrl}
                  title={snapshot?.conversation?.source?.title ?? 'Source'}
                  allow="accelerometer; encrypted-media; picture-in-picture"
                  allowFullScreen
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                />
              </div>
            ) : ready ? (
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
                    disabled={
                      (isEmbedded ? interventions.length === 0 : !snapshot?.plan)
                      || pending > 0 || recording
                    }>
              {isEmbedded ? 'Generate response reel' : 'Generate final video'}
            </button>
            {isEmbedded && (
              <p className="small muted" style={{ marginTop: 6, marginBottom: 0 }}>
                The original stays on its own platform, so the reel contains
                your material only. The conversation itself is published as a
                player that drives the original.
              </p>
            )}
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

          <BundlePanel conversationId={conversationId} ready={Boolean(renderJob?.state === 'done')} />

          <PublishPanel
            conversationId={conversationId}
            conversation={conversation}
            hasRender={Boolean(renderJob?.state === 'done' || conversation?.publication)}
            onChanged={refresh}
          />

          {/*
            Every representation of this conversation, generated on demand.
            The Conversation is the canonical artifact; these are renderings of
            it, and none of them is stored. [INV-00, D-16]
          */}
          <div className="panel" style={{ marginTop: 12 }}>
            <strong>Representations</strong>
            <p className="small muted" style={{ marginTop: 2 }}>
              The same conversation, rendered other ways. Generated on request,
              never stored.
            </p>
            <div className="row" style={{ gap: 8 }}>
              <a className="btn small" href={`/c/${conversationId}/watch`} target="_blank" rel="noreferrer">
                Watch the conversation
              </a>
              <a className="btn small" href={`/c/${conversationId}/article`} target="_blank" rel="noreferrer">
                Read as an article
              </a>
            </div>
            <div
              className="small"
              style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}
            >
              {['manifest.json', 'article.md', 'article.json', 'captions.srt', 'captions.vtt', 'timeline.json', 'render-plan.json']
                .map((id) => (
                  <a
                    key={id}
                    className="small mono"
                    style={{ whiteSpace: 'nowrap' }}
                    href={`/api/conversations/${conversationId}/representations?id=${id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {id}
                  </a>
                ))}
            </div>
          </div>
        </aside>
      </div>

      {mode === 'studio' && (
        <section style={{ marginTop: 20 }}>
          <h2 style={{ marginBottom: 8 }}>Studio</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            Trim, audition another take, re-record, move a point, or change how
            it looks. Everything here edits the conversation; the video, the
            captions and the article are rebuilt from it.
          </p>
          <StudioMode
            conversationId={conversationId}
            snapshot={snapshot}
            refresh={refresh}
            onRerecord={rerecord}
            canRecord={phase === 'armed'}
            onSeek={seekTo}
          />
        </section>
      )}
    </div>
  );
}

/**
 * Suggested claims.  [Doctrine §20, U-15, INV-06]
 *
 * Finding the sentence worth answering in forty minutes of video IS the work.
 * This makes it a list — and then gets out of the way, because everything
 * below is a proposal and none of it is in the conversation until the author
 * puts it there.
 *
 * Three things are kept visibly separate, which is the whole point:
 *
 *   what the SOURCE said        the quote, verbatim, never rewritten
 *   what the MACHINE suggested  and why, in words, next to what produced it
 *   what the AUTHOR chose       accepted, narrowed, or turned down
 */
function ClaimsPanel({
  conversationId, transcriptVersion, canRecord, onSeek, onRespond,
}: {
  conversationId: string;
  transcriptVersion?: number;
  canRecord: boolean;
  onSeek: (frame: number) => void;
  onRespond: (claim: any, by: string, editedQuote?: string) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [by, setBy] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/conversations/${conversationId}/claims`);
    if (response.ok) setData(await response.json());
  }, [conversationId]);

  // Re-read when the transcript arrives: before that there is nothing to find.
  useEffect(() => { void load(); }, [load, transcriptVersion]);

  /**
   * Keep asking while the source is still being transcribed.
   *
   * Without this, opening Studio a second before transcription finishes left
   * the panel saying "not transcribed yet" until someone thought to reload —
   * and the thing it was waiting for had arrived seconds later. A Class B
   * source is different: it will never have a transcript, so there is nothing
   * to wait for and the panel says so once.
   */
  const waiting = typeof data?.unavailable === 'string'
    && /not been transcribed/i.test(data.unavailable);
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(() => { void load(); }, 2000);
    return () => clearInterval(timer);
  }, [waiting, load]);

  const decide = async (claim: any, status: string, editedQuote?: string) => {
    setError(null);
    if (!by.trim()) {
      // INV-06 is not satisfiable anonymously, and saying so is better than a
      // disabled button with no explanation.
      setError('Put your name in first — a decision about a suggestion records who made it.');
      return;
    }
    const response = await fetch(`/api/conversations/${conversationId}/claims`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: claim.key, status, by, ...(editedQuote ? { editedQuote } : {}) }),
    });
    if (!response.ok) {
      setError((await response.json().catch(() => ({}))).error ?? 'could not record that');
      return;
    }
    setEditing(null);
    await load();
  };

  if (!data) return null;
  const claims: any[] = data.claims ?? [];

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 12 }}
         data-testid="claims-panel">
      <div className="row" style={{ marginBottom: 6 }}>
        <strong className="grow">Claims worth answering</strong>
        <span className="small muted mono">{claims.length}</span>
      </div>

      {data.unavailable ? (
        <p className="small muted" data-testid="claims-unavailable" style={{ margin: 0 }}>
          {data.unavailable}.
        </p>
      ) : (
        <>
          {/* What produced these, stated rather than implied. [U-03, U-15] */}
          {data.detector && (
            <p className="small muted" style={{ marginTop: 0 }}>
              <button className="small" onClick={() => setOpen(!open)}
                      style={{ padding: '0 4px', marginRight: 6 }}>
                {open ? '▾' : '▸'}
              </button>
              Suggested by {data.detector.label} (v{data.detector.version}).
              {open && <> {data.detector.characteristics.summary}{' '}
                {data.detector.characteristics.local
                  ? 'It runs on this machine; your source\'s words are not sent anywhere.'
                  : 'It runs remotely.'}{' '}
                Nothing here is in your conversation until you put it there.</>}
            </p>
          )}

          <div className="field" style={{ marginBottom: 8 }}>
            <label htmlFor="claims-by" className="small">Decisions recorded as</label>
            <input id="claims-by" value={by} placeholder="Your name"
                   data-testid="claims-by"
                   onChange={(e) => setBy(e.target.value)} />
          </div>
          {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}

          {claims.length === 0 && (
            <p className="small muted" style={{ margin: 0 }}>
              Nothing stood out. That is a statement about the shapes this finder
              looks for, not about the video.
            </p>
          )}

          {claims.map((claim) => (
            <div key={claim.key} data-testid="claim" data-status={claim.status}
                 style={{
                   border: '1px solid var(--line)', borderRadius: 6,
                   padding: 8, marginBottom: 8,
                   opacity: claim.status === 'rejected' ? 0.55 : 1,
                 }}>
              <div className="row small" style={{ gap: 6, marginBottom: 4 }}>
                <button className="small" onClick={() => onSeek(claim.suggested.startFrame)}
                        title="Jump to the moment it was said">
                  {formatTimecode(claim.suggested.startFrame).slice(0, 8)}
                </button>
                <span className="grow muted">
                  {claim.status === 'suggested' ? 'suggested' : `you ${claim.status} this`}
                </span>
              </div>

              {editing === claim.key ? (
                <>
                  <textarea rows={3} value={draft} data-testid="claim-edit"
                            onChange={(e) => setDraft(e.target.value)}
                            style={{ width: '100%', fontSize: 13 }} />
                  <p className="small muted" style={{ margin: '2px 0 6px' }}>
                    Narrow it to the part that matters. It has to stay the
                    source's own words — your wording belongs in a note.
                  </p>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="small" onClick={() => void decide(claim, 'edited', draft)}>
                      Save the narrower claim
                    </button>
                    <button className="small" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="small" style={{ marginBottom: 4 }}>
                    “{claim.effectiveQuote}”
                  </div>
                  {claim.status === 'edited' && (
                    <div className="small muted" style={{ marginBottom: 4 }}>
                      Suggested as: “{claim.suggested.quote}”
                    </div>
                  )}
                  <div className="small muted" style={{ marginBottom: 6 }}>
                    Flagged because it {claim.suggested.reasons.join(', ')}.
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="small" disabled={!canRecord}
                            data-testid="claim-respond"
                            onClick={() => {
                              // Checked here as well as server-side: otherwise
                              // recording starts and the intervention that was
                              // supposed to hold it is refused.
                              if (!by.trim()) {
                                setError('Put your name in first — answering a suggestion '
                                  + 'records who accepted it.');
                                return;
                              }
                              setError(null);
                              onRespond(claim, by,
                                claim.status === 'edited' ? claim.effectiveQuote : undefined);
                            }}>
                      Respond to this
                    </button>
                    <button className="small" data-testid="claim-edit-open"
                            onClick={() => { setEditing(claim.key); setDraft(claim.effectiveQuote); }}>
                      Narrow it
                    </button>
                    <button className="small" data-testid="claim-reject"
                            onClick={() => void decide(claim, 'rejected')}>
                      {claim.status === 'rejected' ? 'Rejected' : 'Not this one'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/**
 * Publishing.  [Doctrine U-31]
 *
 * The consent question is asked here, once, and it is not pre-answered: the
 * author decides whether anyone may respond to what they made. It cannot be
 * added later, because by then there would be responses made under an
 * assumption nobody stated.
 */
/**
 * Everything required to publish, already written.  [Doctrine U-30, §39]
 *
 * The end of an edit is the most fatiguing moment of the whole process, and it
 * is exactly where every other tool hands the author a blank description box.
 * The document already knows the chapters, the claims and the attribution, so
 * none of it is retyped here — it is copied.
 */
function BundlePanel({ conversationId, ready }: { conversationId: string; ready: boolean }) {
  const [data, setData] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/conversations/${conversationId}/bundle`);
    if (response.ok) setData(await response.json());
  }, [conversationId]);

  useEffect(() => { void load(); }, [load, ready]);

  // Thumbnails arrive from the worker after the export finishes, so the panel
  // waits for them rather than showing dashed boxes until someone reloads.
  const pending = data?.bundle
    && (data.renderedThumbnails?.length ?? 0) < data.bundle.thumbnails.length
    && data.thumbnailJob?.state !== 'failed';
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setInterval(() => { void load(); }, 1500);
    return () => clearInterval(timer);
  }, [pending, load]);

  const bundle = data?.bundle;
  if (!bundle) return null;
  const rendered: string[] = data.renderedThumbnails ?? [];

  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      // Clipboard permission is not guaranteed. Every field below is also a
      // selectable text box, so a refusal here costs a keystroke, not the work.
      setCopied(null);
    }
  };

  const chapterText = bundle.chapters
    .map((c: any) => `${c.timecode.slice(0, 8)} ${c.title}`).join('\n');

  return (
    <div className="panel" style={{ marginTop: 12 }} data-testid="bundle-panel">
      <strong>Ready to publish</strong>
      <p className="small muted" style={{ marginTop: 2 }}>
        Written from the conversation itself. Nothing here was invented — the
        titles are claims you bound, the chapters are your own cuts.
      </p>

      <div className="field">
        <label htmlFor="bundle-description">Description</label>
        <textarea id="bundle-description" readOnly rows={8} value={bundle.description}
                  data-testid="bundle-description"
                  style={{ width: '100%', fontSize: 13, fontFamily: 'inherit' }} />
        <button className="small" onClick={() => void copy('description', bundle.description)}>
          {copied === 'description' ? 'Copied' : 'Copy description'}
        </button>
      </div>

      <div className="field">
        <label>Chapters</label>
        {bundle.chapters.length > 0 ? (
          <>
            <pre className="small mono" data-testid="bundle-chapters"
                 style={{ margin: '0 0 6px', whiteSpace: 'pre-wrap' }}>{chapterText}</pre>
            <button className="small" onClick={() => void copy('chapters', chapterText)}>
              {copied === 'chapters' ? 'Copied' : 'Copy chapters'}
            </button>
          </>
        ) : (
          /* An ignored chapter list is worse than none, so we say why. */
          <p className="small muted" data-testid="bundle-chapters-note" style={{ margin: 0 }}>
            No chapter list: {bundle.chaptersNote}.
          </p>
        )}
      </div>

      <div className="field">
        <label>Suggested titles</label>
        <div className="small" data-testid="bundle-titles">
          {bundle.suggestedTitles.map((title: string) => (
            <div key={title} className="row" style={{ gap: 8, marginBottom: 4 }}>
              <span className="grow">{title}</span>
              <button className="small" onClick={() => void copy(title, title)}>
                {copied === title ? 'Copied' : 'Copy'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Thumbnails</label>
        {bundle.thumbnails.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>
            Respond somewhere in the video and its thumbnails appear here.
          </p>
        ) : (
          <div data-testid="bundle-thumbnails"
               style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {bundle.thumbnails.map((candidate: any) => (
              <figure key={candidate.id} style={{ margin: 0 }}>
                {rendered.includes(candidate.id) ? (
                  <a href={`/api/conversations/${conversationId}/bundle?thumbnail=${candidate.id}`}
                     target="_blank" rel="noreferrer">
                    <img alt={candidate.label} data-testid={`thumb-${candidate.kind}`}
                         src={`/api/conversations/${conversationId}/bundle?thumbnail=${candidate.id}`}
                         style={{ width: '100%', borderRadius: 4, display: 'block' }} />
                  </a>
                ) : (
                  <div className="small muted" style={{
                    aspectRatio: '16 / 9', border: '1px dashed var(--line)', borderRadius: 4,
                    display: 'grid', placeItems: 'center', textAlign: 'center', padding: 4,
                  }}>{data.thumbnailJob?.state === 'failed'
                    ? 'could not be drawn'
                    : pending ? 'drawing…' : 'rendered with the export'}</div>
                )}
                <figcaption className="small muted">{candidate.label}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>

      <div className="row" style={{ gap: 8 }}>
        <a className="btn small"
           href={`/api/conversations/${conversationId}/representations?id=bundle.json`}
           target="_blank" rel="noreferrer">Whole bundle (JSON)</a>
        <a className="btn small" href={bundle.links.article} target="_blank" rel="noreferrer">
          Article
        </a>
        <a className="btn small"
           href={`/api/conversations/${conversationId}/representations?id=captions.srt`}
           target="_blank" rel="noreferrer">Captions</a>
      </div>
    </div>
  );
}

function PublishPanel({
  conversationId, conversation, hasRender, onChanged,
}: {
  conversationId: string;
  conversation: any;
  hasRender: boolean;
  onChanged: () => Promise<void>;
}) {
  const [respondable, setRespondable] = useState(true);
  const [author, setAuthor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publication = conversation?.publication;
  const live = publication && !publication.unpublishedAt;

  const act = async (init: RequestInit) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/publish`, init);
      if (!response.ok) {
        throw new Error((await response.json().catch(() => ({}))).error ?? 'could not publish');
      }
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <strong>Publish</strong>
      {live ? (
        <>
          <p className="small muted" style={{ marginTop: 2 }}>
            Published {publication.publishedAt?.slice(0, 10)}
            {publication.author ? ` as ${publication.author}` : ''} ·{' '}
            {publication.respondable
              ? 'anyone may respond to it'
              : 'responses are not allowed'}
          </p>
          <div className="row">
            <a className="btn small" href={`/c/${conversationId}/watch`} target="_blank" rel="noreferrer">
              Open it
            </a>
            <button className="small" disabled={busy}
                    onClick={() => void act({ method: 'DELETE' })}>
              Withdraw
            </button>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Withdrawing stops new responses. Responses already made are left
            alone — they answered a version that existed.
          </p>
        </>
      ) : (
        <>
          <p className="small muted" style={{ marginTop: 2 }}>
            A published conversation can itself be answered. That is how a
            response becomes an exchange.
          </p>
          <div className="field">
            <label htmlFor="pub-author">Publish as</label>
            <input id="pub-author" value={author} placeholder="Your name"
                   onChange={(e) => setAuthor(e.target.value)} />
          </div>
          <label className="row small" style={{ gap: 8, marginBottom: 8 }}>
            <input type="checkbox" checked={respondable} style={{ width: 'auto' }}
                   onChange={(e) => setRespondable(e.target.checked)} />
            <span>Allow anyone to respond to this</span>
          </label>
          {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}
          <button
            className="primary"
            disabled={busy || !hasRender}
            onClick={() => void act({
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ respondable, author }),
            })}
          >
            {publication?.unpublishedAt ? 'Publish again' : 'Publish'}
          </button>
          {!hasRender && (
            <p className="small muted" style={{ marginBottom: 0 }}>
              Render the conversation first — what gets published is a finished
              video, not a draft that could change under whoever answers it.
            </p>
          )}
        </>
      )}
    </div>
  );
}
