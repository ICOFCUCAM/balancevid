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
import SearchPanel from './SearchPanel.js';
import Stage, { StageStatus, type Stance } from './Stage.js';
import Timeline from './Timeline.js';
import SidePanel from './SidePanel.js';
import ClaimCard from './ClaimCard.js';
import ClaimsPanel from './ClaimsPanel.js';
import ExportPanel from './ExportPanel.js';
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
  /** The sentence the author picked to answer, shown beside the way to answer it. */
  const [picked, setPicked] = useState<
    { text: string; startFrame: number; endFrame: number } | null>(null);
  /** Which response is highlighted on the timeline. */
  const [selectedResponse, setSelectedResponse] = useState<string | null>(null);
  /** What this response is answering, shown over the frozen frame while it is. */
  const [answering, setAnswering] = useState<string | null>(null);
  /**
   * The source's own shape, read from the file rather than assumed.
   *
   * A frame that assumes 16:9 puts black bars around anything else, and a
   * frame sized only by a height cap puts them around everything. Taking the
   * ratio from the media means the frame is whatever shape the video is.
   */
  const [sourceAspect, setSourceAspect] = useState<number | null>(null);
  /** A move that would cost a bound statement, waiting to be confirmed. */
  const [pendingMove, setPendingMove] = useState<
    { id: string; frame: number; quote: string } | null>(null);
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
    setAnswering(options.quote ?? options.editedQuote ?? null);
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
    setAnswering(null);
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
   * Move a response to a different moment.
   *
   * This is the only reordering the product has: order is derived from the
   * anchor and never stored (U-08), so moving when a response answers IS
   * moving where it sits in the conversation.
   *
   * A response carrying a quoted statement loses it, because a quote that
   * travels to a moment it no longer describes misquotes a real person
   * (U-05). That is correct, and it is also destructive, so it is said
   * BEFORE it happens rather than discovered afterwards.
   */
  const moveResponse = useCallback(async (id: string, frame: number, confirmed = false) => {
    const target = (snapshot?.conversation?.interventions ?? [])
      .find((iv: any) => iv.id === id);
    if (!target) return;
    if (!confirmed && target.anchor?.quote) {
      setPendingMove({ id, frame, quote: target.anchor.quote });
      return;
    }
    setPendingMove(null);
    await fetch(`/api/conversations/${conversationId}/interventions/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tSourceFrame: frame }),
    });
    await refresh();
  }, [conversationId, refresh, snapshot]);

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

  /** What the one key will do right now. The only state worth naming. */
  const stance: Stance =
    phase === 'recording' || phase === 'starting' ? 'yours'
      : phase === 'stopping' ? 'saving'
        : phase === 'armed' ? 'listening'
          : phase === 'denied' ? 'blocked'
            : 'idle';

  /**
   * Has a response already been given to the chosen statement?
   *
   * Read from the document rather than tracked separately: the binding that
   * matters is the one the render, the article and the captions use, and a
   * second copy of it in component state would eventually disagree.
   */
  const boundIntervention = picked
    ? interventions.find((iv: any) => iv.anchor.quote
      && iv.anchor.quote.trim().toLowerCase() === picked.text.trim().toLowerCase())
    : undefined;
  const boundResponse = boundIntervention
    ? {
      interventionId: boundIntervention.id,
      label: TYPE_PRESENTATION[boundIntervention.type as InterventionType]?.lowerThird
        ?? boundIntervention.type,
    }
    : null;

  const timelineResponses = interventions.map((iv: any) => ({
    id: iv.id,
    tSourceFrame: iv.anchor.tSourceFrame,
    durationFrames: (iv.takes ?? []).find((t: any) => t.id === iv.selectedTakeId)?.durationFrames ?? 0,
    // A face rather than a duration: the timeline should be recognisable at
    // a glance as a sequence of moments you spoke into.
    thumbnailUrl: iv.selectedTakeId
      && (iv.takes ?? []).find((t: any) => t.id === iv.selectedTakeId)?.durationFrames > 0
      ? `/api/conversations/${conversationId}/takes/${iv.selectedTakeId}/media?kind=poster`
      : undefined,
    type: TYPE_PRESENTATION[iv.type as InterventionType]?.lowerThird ?? iv.type,
    selected: iv.id === selectedResponse,
  }));

  const evidenceList = interventions.flatMap((iv: any) =>
    (iv.evidence ?? []).map((e: any) => ({
      id: e.id, title: e.title, tSourceFrame: iv.anchor.tSourceFrame,
    })));
  const noteList = interventions
    .filter((iv: any) => iv.note)
    .map((iv: any) => ({ id: iv.id, text: iv.note, tSourceFrame: iv.anchor.tSourceFrame }));

  return (
    /*
     * The workspace is the window, not a document inside it. [§40]
     *
     * A bar, then a stage that takes every pixel the bars do not, then the
     * controls. The page never scrolls; in Studio the two columns scroll
     * inside themselves. This is what makes the picture fill the screen
     * instead of floating in a band of empty page.
     */
    <div className="shell">
      {/* ---- header: the conversation, and the two things you do with it ---- */}
      <header className="shell-bar">
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 style={{ marginBottom: 0, fontSize: 17, whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {conversation?.title ?? 'Conversation'}
          </h1>
          <div className="small muted" style={{ whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {conversation?.source?.title}
            {ready && <> · {formatTimecode(conversation.source.durationFrames).slice(0, 8)}</>}
            {isEmbedded && ' · plays on its own platform'}
          </div>
          {conversation?.lineage && (
            <div className="small" style={{ color: 'var(--user-accent)' }}>
              Answering{' '}
              <a href={`/c/${conversation.lineage.parentConversationId}/watch`}>
                “{conversation.lineage.chain.at(-1)?.title}”
              </a>
            </div>
          )}
        </div>

        <div className="row" style={{ gap: 0, flexWrap: 'nowrap' }} role="tablist" aria-label="Mode">
          <button role="tab" data-testid="mode-live"
                  aria-selected={mode === 'live'} onClick={() => setMode('live')}
                  style={{ borderRadius: '8px 0 0 8px', padding: '7px 14px',
                    background: mode === 'live' ? '#2b5f8a' : undefined }}>
            Live
          </button>
          <button role="tab" data-testid="mode-studio"
                  aria-selected={mode === 'studio'} onClick={() => setMode('studio')}
                  style={{ borderRadius: '0 8px 8px 0', padding: '7px 14px',
                    background: mode === 'studio' ? '#2b5f8a' : undefined }}>
            Studio
          </button>
        </div>
        <a className="btn" href="/" style={{ padding: '7px 14px' }}>All conversations</a>
        <SignOut />
      </header>

      {/*
        Live is watch → interrupt → respond → continue and nothing else. Every
        panel removed from here is one less thing between a person and the
        sentence they want to answer. Studio is where the same conversation is
        taken apart.
      */}
      <div className="shell-body" style={{
        display: 'grid',
        gridTemplateColumns: mode === 'live'
          ? 'minmax(0, 1fr)'
          : 'minmax(0, 1.65fr) minmax(380px, 1fr)',
        gap: mode === 'live' ? 0 : 14,
        ...(mode === 'live' ? {} : { padding: '14px 20px' }),
      }}>
        <div className={mode === 'live' ? undefined : 'shell-scroll'}
             style={mode === 'live'
               ? { minHeight: 0, display: 'grid' }
               : { paddingRight: 4 }}>
          {/*
            In Live the stage IS the body and takes all of it. In Studio it is
            the first thing in a column that scrolls, so it is given a share of
            the window rather than all of it.
          */}
          {/*
            In Studio the stage is given a share of the window rather than all
            of it, so the conversation timeline sits under it without anyone
            having to scroll to find it. The column is sized so that share is
            close to the width a 16:9 picture wants — the two agree, and the
            picture very nearly fills the column.
          */}
          <div style={mode === 'live'
            ? { minHeight: 0 }
            : { height: '48vh', minHeight: 240, marginBottom: 12 }}>
          <Stage
            fit="height"
            aspect={isEmbedded ? 16 / 9 : sourceAspect}
            stance={stance}
            cameraStream={camRef}
            cameraOn={phase !== 'cold' && phase !== 'denied'}
            claim={answering}
          >
            {isEmbedded ? (
              <div style={{
                position: 'absolute', inset: 0, background: '#000',
              }}>
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
                playsInline
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  if (v.videoWidth && v.videoHeight) setSourceAspect(v.videoWidth / v.videoHeight);
                }}
                style={{
                  display: 'block', background: '#000', borderRadius: 0,
                  // The frame already carries the source's ratio, so filling
                  // it edge to edge letterboxes at neither end.
                  width: '100%', height: '100%', objectFit: 'contain',
                }}
              />
            ) : (
              /*
               * Not yet playable. A <video> element pointed at a source that
               * is still being prepared is a broken player, and a broken
               * player is worse than an honest wait.
               */
              <div data-testid="source-preparing" style={{
                position: 'absolute', inset: 0,
                display: 'grid', placeItems: 'center', color: 'var(--muted)',
                lineHeight: 1.5,
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 15, marginBottom: 4 }}>Preparing your video</div>
                  <div className="small">
                    This happens once. You can start responding as soon as it appears.
                  </div>
                </div>
              </div>
            )}
          </Stage>
          </div>


          {/* ---- the conversation itself, in Studio ------------------- */}
          {mode === 'studio' && (
          <div className="panel" style={{ marginTop: 12 }}>
            <Timeline
              durationFrames={conversation?.source?.durationFrames ?? 0}
              currentFrame={currentFrame}
              responses={timelineResponses}
              onMove={(id, frame) => { void moveResponse(id, frame); }}
              pendingClaim={picked && !boundResponse
                ? { startFrame: picked.startFrame, anchorFrame: picked.endFrame }
                : null}
              onSeek={seekTo}
              onSelect={setSelectedResponse}
            />
            {pendingMove && (
              <div data-testid="move-confirm" style={{
                marginTop: 10, padding: '10px 12px', borderRadius: 6,
                border: '1px solid #e0b24f', background: 'rgba(224,178,79,0.10)',
              }}>
                <div className="small" style={{ marginBottom: 8 }}>
                  This response quotes “{pendingMove.quote.slice(0, 80)}
                  {pendingMove.quote.length > 80 ? '…' : ''}”. Moving it to{' '}
                  {formatTimecode(pendingMove.frame).slice(0, 8)} means it no longer
                  answers that sentence, so the quote is removed rather than
                  left pointing at the wrong moment. The recording is untouched.
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="small" data-testid="move-cancel"
                          onClick={() => setPendingMove(null)}>
                    Leave it where it is
                  </button>
                  <button className="small" data-testid="move-confirm-go"
                          onClick={() => {
                            void moveResponse(pendingMove.id, pendingMove.frame, true);
                          }}>
                    Move it and drop the quote
                  </button>
                </div>
              </div>
            )}

            {working > 0 && (
              <p className="small muted" style={{ margin: '8px 0 0' }}>
                Preparing {working} {working === 1 ? 'response' : 'responses'}…
              </p>
            )}
          </div>
          )}

          {/* ---- everything after the conversation is made ------------ */}
          {mode === 'studio' && (
            <div style={{ marginTop: 12 }}>
              <StudioMode
                conversationId={conversationId}
                snapshot={snapshot}
                refresh={refresh}
                onRerecord={rerecord}
                canRecord={phase === 'armed'}
                onSeek={seekTo}
              />

              <ExportPanel
                conversationId={conversationId}
                conversation={conversation}
                snapshot={snapshot}
                refresh={refresh}
              />
            </div>
          )}

          {/* In Live the only progress worth showing is that something is
              still being prepared — said once, quietly. */}
          {mode === 'live' && working > 0 && (
            <p className="small muted" style={{ marginTop: 10, textAlign: 'center' }}>
              Preparing {working} {working === 1 ? 'response' : 'responses'}…
            </p>
          )}
        </div>

        {mode === 'studio' && (
        <SidePanel
          height="100%"
          transcript={transcript}
          transcriptReady={Boolean(transcriptVersion && transcript?.sentences?.length)}
          currentFrame={currentFrame}
          selected={picked}
          onSelect={setPicked}
          onSeek={seekTo}
          evidence={evidenceList}
          notes={noteList}
          search={(
            <SearchPanel
              conversationId={conversationId}
              canRecord={phase === 'armed'}
              onSeek={seekTo}
              onRespond={(frame, quote) => interrupt({ frame, ...(quote ? { quote } : {}) })}
            />
          )}
          statements={(
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
          )}
        />
        )}
      </div>


      {/* ---- the controls, along the bottom edge ------------------------ */}
      <footer className="shell-foot">
        {error && (
          <div className="small" style={{ color: 'var(--bad)', marginBottom: 8 }}>{error}</div>
        )}
        {phase === 'denied' && (
          <div className="small" style={{ color: 'var(--bad)', marginBottom: 8 }}>
            We could not reach your camera or microphone. Check the permissions
            for this site in your browser, then press space again.
          </div>
        )}
        {/* ---- the statement being answered, when one is chosen ------ */}
        {picked && (
          <ClaimCard
            quote={picked.text}
            startFrame={picked.startFrame}
            anchorFrame={picked.endFrame}
            boundTo={boundResponse}
            canRecord={phase === 'armed'}
            onWatch={() => seekTo(picked.startFrame)}
            onClear={() => setPicked(null)}
            /*
             * The selection is NOT cleared here. Once the response exists
             * the card flips to its bound state, which is the confirmation
             * that the statement is attached — clearing it would make the
             * most important moment of the interaction look like a dismissal.
             */
            onRespond={() => interrupt({ frame: picked.endFrame, quote: picked.text })}
          />
        )}

        {/* ---- the one key, said plainly ----------------------------- */}
        <div style={{ display: picked && !boundResponse ? 'none' : undefined }}>
          <div className="row" style={{ gap: 14 }}>
            <StageStatus
              stance={stance}
              currentFrame={currentFrame}
              durationFrames={conversation?.source?.durationFrames ?? 0}
            />
            <span aria-hidden style={{ width: 1, alignSelf: 'stretch',
              background: 'var(--line)', margin: '0 2px' }} />
            <kbd style={{
              padding: '8px 18px', borderRadius: 6, border: '1px solid var(--line)',
              background: 'rgba(255,255,255,0.06)', fontSize: 14, letterSpacing: 1,
            }}>SPACE</kbd>
            <span className="grow small">
              {stance === 'yours' ? 'to continue the video' : 'to interrupt and respond'}
            </span>

            <select
              aria-label="Kind of response"
              value={type}
              onChange={(e) => setType(e.target.value as InterventionType)}
              style={{ width: 'auto' }}
            >
              {INTERVENTION_TYPES.map((t) => (
                <option key={t} value={t}>{TYPE_PRESENTATION[t].lowerThird}</option>
              ))}
            </select>

            {phase === 'cold' && (
              <button className="primary" data-testid="enable-camera" onClick={() => void arm()}>
                Enable camera
              </button>
            )}
            {recording && (
              <button className="primary" data-testid="continue-button" onClick={() => resume()}>
                Continue
              </button>
            )}
            {phase === 'armed' && (
              <button data-testid="interrupt-button" onClick={() => interrupt()}>
                Interrupt
              </button>
            )}
          </div>
          {phase === 'cold' && (
            <p className="small muted" style={{ margin: '8px 0 0' }}>
              Your camera runs a rolling eight-second buffer while you watch, so
              pressing space late never clips the first words of your answer.
              Nothing is kept unless you respond.
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
