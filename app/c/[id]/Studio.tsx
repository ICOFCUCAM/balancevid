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

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Brand from '../../Brand.js';
import SignOut from '../../SignOut.js';
import SourceTransport from './SourceTransport.js';
import { useConfirm } from '../../Confirm.js';
import { typingIn } from '../../../src/domain/keys.js';
import { useMenu, type MenuEntry } from '../../Menu.js';
import SearchPanel from './SearchPanel.js';
import Stage, { StageStatus, type Stance } from './Stage.js';
import ClipRail, { type ClipRailItem } from './ClipRail.js';
import PeopleRail, { type RailPerson } from './PeopleRail.js';
import CompositionRail, { type ExplainTool } from './CompositionRail.js';
import ExplainSurface from './ExplainSurface.js';
import CompositionStage from './CompositionStage.js';
import PublishStage from './PublishStage.js';
import Reader from './Reader.js';
import Timeline from './Timeline.js';
import SidePanel from './SidePanel.js';
import ClaimCard from './ClaimCard.js';
import ClaimsPanel from './ClaimsPanel.js';
import { INTERVENTION_TYPES, type InterventionType } from '../../../src/domain/document.js';
import { HOUSE_FPS, formatTimecode, type Frames } from '../../../src/domain/time.js';
import { TYPE_PRESENTATION } from '../../../src/domain/presentation.js';
import { forDisplay, type Transcript } from '../../../src/transcribe/types.js';
import { sentenceAtFrame } from '../../../src/transcribe/segmentation.js';
import StudioMode from './StudioMode.js';
import { answered, asked } from '../../answered.js';
import { bodyOf } from '../../../src/domain/saidBy.js';
import AudioPanel from './AudioPanel.js';
import './studio-one.css';

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

/**
 * THE AUTHOR IS THE RESPONDER, ON A DARK GROUND.  [Doctrine U-20]
 *
 * This was #a35a34 in both places it appears, and #a35a34 is the
 * responder's colour DARKENED FOR WHITE — the value the published
 * article and the interactive player declare inside their light theme.
 * Studio One has no light theme. So the one person guaranteed to be in
 * every conversation was drawn, in the only place they are drawn, in a
 * colour belonging to a page this studio never renders.
 *
 * It is a hex rather than `var(--user-accent)` because it travels as
 * data — into `RailPerson.accent`, and from there into places that mix
 * an alpha into it — and `design-system.test.ts` now refuses the
 * light-ground pair anywhere in `app/`, which is what stops it coming
 * back.
 */
const AUTHOR_ACCENT = '#c2794f';

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
  /*
   * The tool in the author's hand, if any.
   *
   * Lives here rather than in the rail because it changes what the STAGE is:
   * armed, the middle of the screen stops being a player and becomes the
   * frame being marked. A mode that changes another panel belongs to neither.
   */
  const [explainTool, setExplainTool] = useState<ExplainTool | null>(null);
  /* Read by the key handler, which is registered once and must not go stale. */
  const modeRef = useRef<'live' | 'studio' | 'publish'>('live');
  /** The shape under the pointer, drawn on the composition as it forms. */
  const [markDraft, setMarkDraft] = useState<any>(null);
  /** The notes panel, for teaching from a page while the camera runs. */
  const [readerOpen, setReaderOpen] = useState(false);
  const readerRef = useRef(false);
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
  /**
   * WHICH TAB IS SHOWING, IN EACH OF THE TWO TAB ROWS.
   *
   * The brief draws three control tabs and three production
   * tabs and switches them with `classList`. Here they are
   * state, for the reason the gateway's product tabs are: React
   * renders these nodes and has its own opinion about their
   * className, so a tab that was pressed reverts on the next
   * render — intermittently, which is the worst kind of bug to
   * be handed. [D-19]
   */
  const [control, setControl] =
    useState<'respond' | 'transcript' | 'audio' | 'output'>('respond');
  const [production, setProduction] =
    useState<'timeline' | 'responses'>('timeline');

  const [mode, setMode] = useState<'live' | 'studio' | 'publish'>('live');

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

  /* One menu and one dialog for the whole studio. [D-19] */
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { menu, onRow } = useMenu();

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
      const data = bodyOf(await response.text());
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
  /*
   * How many responses are still being put together.
   *
   * A count, not a flag: "Preparing responses…" appeared on a conversation
   * with no responses at all, because a source whose duration was not yet
   * known counted as work in progress. Those are two different things — one
   * is the video getting ready, the other is the author's recordings — and
   * saying the second when only the first is true is simply wrong.
   */
  const working = (() => {
    if (!snapshot) return 0;
    const interventionsNow = (snapshot.conversation?.interventions ?? []) as any[];
    return interventionsNow.filter(
      (iv) => (iv.takes ?? []).every((t: any) => t.durationFrames === 0)).length;
  })();

  /*
   * Poll while anything is still becoming ready: the source being normalised
   * counts as well as the responses being assembled, even though only the
   * second is what "Preparing responses" means.
   */
  const settling = working > 0
    || !(snapshot?.conversation?.source?.durationFrames > 0)
    || ((snapshot?.jobs ?? []) as any[]).some(
      (job) => job.state === 'pending' || job.state === 'running');

  useEffect(() => {
    if (!settling) return;
    const timer = setInterval(() => { void refresh(); }, 1200);
    return () => clearInterval(timer);
  }, [settling, refresh]);

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
      return await answered<{ interventionId: string; takeId: string }>(
        response, 'could not open the intervention');
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
      return await answered<{ interventionId: string; takeId: string }>(
        response, 'could not open a new take');
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

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { readerRef.current = readerOpen; }, [readerOpen]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.code !== 'Space') return;
      /*
       * Space belongs to the conversation, and Publish is not the
       * conversation. Somebody scrolling a page of formats and clips should
       * not start a recording with the key they use to scroll it.
       */
      if (modeRef.current === 'publish') return;
      /*
       * While the reader is open the page keys belong to it. Space scrolls a
       * document, and a teacher reading from their notes must not end their
       * take by turning the page. The reader handles the key in the capture
       * phase, so this is a second line of defence rather than the only one.
       */
      if (readerRef.current) return;
      /*
       * Anything the person is typing or reading into keeps its own
       * keys. This studio's version of the test was the strongest of
       * the three in the product — it is the one `domain/keys.ts`
       * took, and it is asked from there now. [C-39]
       */
      if (typingIn(event.target as HTMLElement | null)) return;
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
    const { ok, data, says } = await asked<{ job: { id: string } }>(
      response, 'render refused');
    if (!ok) { setError(says); return; }
    setRenderJobId(data.job.id);
  }, [conversationId]);

  const [renderJob, setRenderJob] = useState<any>(null);
  useEffect(() => {
    if (!renderJobId) return;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/jobs/${renderJobId}`, { cache: 'no-store' });
      if (!response.ok) return;
      const { job } = bodyOf(await response.text());
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

  /*
   * The left rail: what I said.
   *
   * Ordered by the moment answered, because that is the only order the
   * conversation has — order is derived from the anchor and never stored
   * (U-08), so this list and the timeline cannot disagree.
   */
  /*
   * The assembly job for each intervention, so a recording that is not coming
   * back can say so. Without this, a queue that nothing is draining and a job
   * that threw look identical to the author — both are the word "preparing",
   * forever, with nothing to do about it (D-07).
   */
  const assemblyJobs = new Map<string, any>();
  for (const job of (snapshot?.jobs ?? []) as any[]) {
    if (job.kind !== 'assemble_take') continue;
    const forId = String(job.payload?.interventionId ?? '');
    if (!forId) continue;
    const held = assemblyJobs.get(forId);
    // The latest attempt is the one that describes where things stand.
    if (!held || job.createdAt > held.createdAt) assemblyJobs.set(forId, job);
  }

  /*
   * Who is in this conversation, and who said what.  [D-17, ROOM §4]
   *
   * Derived here, beside the clips, from the same document — the author is a
   * participant like anyone else, and where the document stores nothing the
   * resolver supplies them. Names appear on the cards only when there is more
   * than one voice, which is the same test the lower third and the captions
   * use, so the rail and the finished video cannot disagree.
   */
  const participants: any[] = (conversation as any)?.participants ?? [];
  const authorName = (conversation as any)?.publication?.author ?? 'You';
  const whoOf = (iv: any) =>
    participants.find((p: any) => p.id === iv.participantId)
    ?? { id: 'author', displayName: authorName, accent: AUTHOR_ACCENT,
      role: 'host' };
  const voices = new Map<string, RailPerson>();
  for (const iv of interventions) {
    const who = whoOf(iv);
    const existing = voices.get(who.id);
    if (existing) existing.responses += 1;
    else voices.set(who.id, {
      id: who.id, displayName: who.displayName, accent: who.accent,
      role: who.role, responses: 1,
      ...(who.presence ? { presence: who.presence } : {}),
    });
  }
  // The author leads the list even before they have answered: it is theirs.
  if (!voices.has('author') && !participants.some((p: any) => p.role === 'host')) {
    voices.set('author', {
      id: 'author', displayName: authorName, accent: AUTHOR_ACCENT,
      role: 'host', responses: 0,
    });
  }
  const people = [...voices.values()].sort((a, b) =>
    a.role === 'host' ? -1 : b.role === 'host' ? 1 : 0);
  const severalVoices = people.length > 1;

  const clips: ClipRailItem[] = [...interventions]
    .sort((a: any, b: any) => a.anchor.tSourceFrame - b.anchor.tSourceFrame)
    .map((iv: any, index: number) => {
      const take = (iv.takes ?? []).find((t: any) => t.id === iv.selectedTakeId);
      const presentation = TYPE_PRESENTATION[iv.type as InterventionType];
      const job = assemblyJobs.get(iv.id);
      const ready = Boolean(take && take.durationFrames > 0);
      const state: ClipRailItem['state'] = ready ? 'ready'
        : job?.state === 'failed' ? 'failed'
        : job?.state === 'running' ? 'preparing'
        : job?.state === 'pending' ? 'waiting'
        : 'preparing';
      return {
        id: iv.id,
        index,
        tSourceFrame: iv.anchor.tSourceFrame,
        durationFrames: take?.durationFrames ?? 0,
        label: presentation?.lowerThird ?? iv.type,
        accent: presentation?.accent ?? '#8A8F98',
        ...(severalVoices ? { speakerName: whoOf(iv).displayName } : {}),
        ...(ready
          ? { posterUrl: `/api/conversations/${conversationId}/takes/${take.id}/media?kind=poster` }
          : {}),
        ...(iv.anchor.quote ? { quote: iv.anchor.quote } : {}),
        state,
        ...(state === 'failed' && job?.error ? { error: String(job.error) } : {}),
        ...(state === 'failed' && job?.id ? { jobId: String(job.id) } : {}),
      };
    });
  const composing = interventions.find((iv: any) => iv.id === selectedResponse) ?? null;

  /*
   * What there is to read, right now.
   *
   * The response being composed if there is one; otherwise the one whose
   * moment the playhead is nearest, because while teaching the author is at
   * a point in the source and the notes for that point are the ones they
   * want. No new place to put notes: it is the evidence and the note already
   * on the response.
   */
  const readingFor = composing ?? [...interventions]
    .sort((a: any, b: any) =>
      Math.abs(a.anchor.tSourceFrame - currentFrame)
      - Math.abs(b.anchor.tSourceFrame - currentFrame))[0] ?? null;
  const readingDoc = (readingFor?.evidence ?? [])
    .find((e: any) => (e.pageAssetIds?.length ?? 0) > 0) ?? null;
  const readingPages: number = readingDoc?.pageAssetIds?.length ?? 0;
  const readingPage: number = Math.min(
    Math.max(1, readingDoc?.locator?.page ?? 1), Math.max(1, readingPages));
  const hasReading = readingPages > 0 || Boolean(readingFor?.note);

  const annotationBase = composing
    ? `/api/conversations/${conversationId}/interventions/${composing.id}/annotations`
    : '';
  /*
   * WHAT CAN BE DONE TO A RESPONSE, reached from the response.
   *
   * Studio One had no menu of any kind. Changing what kind of move a
   * response is meant scrolling to the composer and finding a select;
   * deleting one was not possible from this screen at all, so the way to
   * undo a mistaken interruption was to leave the studio and delete the
   * whole conversation. [D-19]
   */
  const clipItems = (clip: ClipRailItem): MenuEntry[] => [
    {
      label: 'Watch from here',
      onSelect: () => { setSelectedResponse(clip.id); seekTo(clip.tSourceFrame); },
    },
    {
      label: 'Change what kind of move this is\u2026',
      hint: 'The lower third, and how the article reads it',
      onSelect: () => confirm({
        question: 'This is the label the finished video puts under your '
          + 'face, and the word the article uses for what you did here.',
        field: {
          label: 'What kind of move is this?',
          initial: (interventions.find((iv: any) => iv.id === clip.id)?.type
            ?? 'explain') as string,
          choices: INTERVENTION_TYPES.map((kind) => ({
            value: kind, label: TYPE_PRESENTATION[kind].lowerThird,
          })),
        },
        verb: 'Change it',
        go: (kind) => {
          void call(`/api/conversations/${conversationId}/interventions/${clip.id}`,
            { method: 'PATCH', body: JSON.stringify({ type: kind }) });
        },
      }),
    },
    clip.state === 'failed' && clip.jobId
      ? {
        label: 'Try assembling it again',
        hint: clip.error ?? undefined,
        onSelect: () => { void call(`/api/jobs/${clip.jobId}`, { method: 'POST' }); },
      }
      : null,
    {
      label: 'Delete this response\u2026',
      danger: true,
      onSelect: () => confirm({
        /*
         * WHAT SURVIVES IS THE POINT. The recordings stay on disk — the
         * route's own comment says so — and somebody deleting a response
         * should know they are removing it from the film rather than
         * shredding the footage. [D-13]
         */
        question: `Remove \u201c${clip.label}\u201d from this conversation? `
          + 'The point in the video, the claim it answers and the cut all '
          + 'go. The recording itself stays on disk.',
        verb: 'Remove the response',
        danger: true,
        go: () => {
          void call(
            `/api/conversations/${conversationId}/interventions/${clip.id}`,
            { method: 'DELETE' });
          setSelectedResponse(null);
        },
      }),
    },
  ];

  const call = async (path: string, init: RequestInit) => {
    const response = await fetch(path, {
      headers: { 'content-type': 'application/json' }, ...init,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? 'that change did not save');
      return;
    }
    await refresh();
  };

  const evidenceList = interventions.flatMap((iv: any) =>
    (iv.evidence ?? []).map((e: any) => ({
      id: e.id, title: e.title, tSourceFrame: iv.anchor.tSourceFrame,
    })));
  const noteList = interventions
    .filter((iv: any) => iv.note)
    .map((iv: any) => ({ id: iv.id, text: iv.note, tSourceFrame: iv.anchor.tSourceFrame }));

  return (
    /*
     * THE WORKSTATION, AS THE BRIEF DRAWS IT.  [§36, §40, U-27, U-28]
     *
     *     SOURCE → PAUSE → RESPOND → REVIEW → PRODUCE
     *
     * A bar, then four regions that between them answer four
     * questions, and a window that never scrolls:
     *
     *   LEFT    what am I answering   the source, the people, the responses
     *   CENTRE  what will they see    the picture, the transport, the one key
     *   RIGHT   how do I express it   the layout, the marks, the audio, the output
     *   BOTTOM  when does it happen   the timeline, and every take under it
     *
     * NOTHING BELOW IS NEW MACHINERY. Every component here was
     * already in this studio and is passed the same props it was
     * passed before; what changed is the frame they sit in. The
     * recorder, the ring buffer, the segment rotation, the claim
     * binding and the render queue are all above this line and
     * are not touched by it. [the brief: *"I dont want to change
     * the engines and features of studio 1"*]
     *
     * LIVE KEEPS ITS ARGUMENT. The brief draws one layout, always
     * four regions. Live's whole point is that every panel
     * removed is one less thing between a person and the sentence
     * they want to answer — so the frame stays and the three
     * rails fold away, leaving the picture and the key. [U-27]
     */
    <div className="s1">
      {confirmDialog}
      {menu}

      <div className="app">

        {/* ---- the bar: what this is, and the way out of it ---------- */}
        <header className="topbar">

          <div className="brand">
            <Brand wordmark={false} />
            <div className="brand-title">
              BALANCEVID
              <span>STUDIO ONE</span>
            </div>
          </div>

          {/*
            * THE CONVERSATION, CENTRED, WHICH IS WHERE A DESK PUTS
            * THE NAME OF WHAT IS LOADED. The source and its
            * duration go underneath because they answer *which
            * cut of it*, and the lineage line goes under that in
            * the responder's own colour, because a conversation
            * that answers another one is a different object from
            * one that does not. [U-20]
            */}
          <div className="project">
            <div className="project-name" title={conversation?.title ?? 'Conversation'}>
              {conversation?.title ?? 'Conversation'}
            </div>
            <div className="project-meta">
              {conversation?.source?.title}
              {ready && <> · {formatTimecode(conversation.source.durationFrames).slice(0, 8)}</>}
              {isEmbedded && ' · plays on its own platform'}
            </div>
            {conversation?.lineage && (
              <div className="project-meta" style={{ color: 'var(--user-accent)' }}>
                Answering{' '}
                <a href={`/c/${conversation.lineage.parentConversationId}/watch`}>
                  “{conversation.lineage.chain.at(-1)?.title}”
                </a>
              </div>
            )}
          </div>

          <div className="top-actions">

            {/*
              * THE LAMP SAYS WHAT IS TRUE, WHICH IS NOT "AUTOSAVED".
              *
              * The brief draws a green dot and the word Autosaved.
              * This studio has no save — a response is written when
              * it is recorded and a mark when it is placed, and
              * there is no document in hand to be dirty. What it
              * does have is a state worth a lamp: a camera that is
              * cold, a take being recorded, and work the queue is
              * still preparing. A dot that always says the same
              * word is a dot nobody reads. [D-21, U-19]
              */}
            <div className="status" data-testid="studio-status">
              <span className="status-dot" style={recording
                ? { background: 'var(--red)' }
                : phase === 'cold' || phase === 'denied'
                  ? { background: 'var(--muted-2)' }
                  : working > 0 ? { background: 'var(--amber)' } : {}} />
              {recording ? 'Recording'
                : phase === 'denied' ? 'No camera'
                  : phase === 'cold' ? 'Camera off'
                    : working > 0
                      ? `Preparing ${working}`
                      : 'Ready'}
            </div>

            <div className="viewer-mode" role="tablist" aria-label="Mode">
              <button role="tab" data-testid="mode-live"
                      aria-selected={mode === 'live'}
                      className={mode === 'live' ? 'mode-pill active' : 'mode-pill'}
                      onClick={() => setMode('live')}>
                LIVE
              </button>
              <button role="tab" data-testid="mode-studio"
                      aria-selected={mode === 'studio'}
                      className={mode === 'studio' ? 'mode-pill active' : 'mode-pill'}
                      onClick={() => setMode('studio')}>
                STUDIO
              </button>
              <button role="tab" data-testid="mode-publish"
                      aria-selected={mode === 'publish'}
                      className={mode === 'publish' ? 'mode-pill active' : 'mode-pill'}
                      onClick={() => setMode('publish')}>
                PUBLISH
              </button>
            </div>

            {/*
              * THE BRIEF'S UNDO AND REDO ARE NOT HERE, and that is
              * the one thing it draws that this studio does not
              * answer. There is no undo stack: a take is a file on
              * disk the moment it stops, and a mark is a row. Two
              * arrows that do nothing on a recording desk are worse
              * than two arrows that are absent, because the first
              * thing anybody reaches for after a mistake is the
              * one that does not work. [D-21]
              */}

            <a className="top-btn" data-testid="preview-link"
               href={`/c/${conversationId}/watch`}>
              Preview
            </a>
            <a className="top-btn" data-testid="open-room-link"
               href={`/c/${conversationId}/room`}>
              + Invite
            </a>
            <button className="top-btn primary" data-testid="produce"
                    onClick={() => setMode('publish')}>
              Produce
            </button>
            <a className="top-btn" href="/">All conversations</a>
            <SignOut />

          </div>

        </header>


        <main className="workspace" data-mode={mode}>

          {/* ===================================================
               SOURCE RAIL — what am I answering
               =================================================== */}
          {mode === 'studio' && (
          <aside className="source-rail">

            <div className="rail-header">
              <div className="rail-title">SOURCE</div>
              <button className="rail-action" data-testid="add-response"
                      disabled={phase !== 'armed'}
                      onClick={() => interrupt()}>
                + Respond
              </button>
            </div>

            <div className="source-content s1-slot">

              <div className="section-label">CURRENT SOURCE</div>

              {/*
                * THE SOURCE CARD IS THE SOURCE, not a drawing of
                * one. Where a poster exists it is the poster;
                * where the source is still being prepared the card
                * says so, because that is the state an author
                * most needs to see and the state the brief's
                * stand-in could not have. [U-19]
                */}
              <article className="source-card selected" data-testid="source-card">
                <div className="source-thumb">
                  {ready && !isEmbedded
                    ? <div className="fake-person" aria-hidden="true" />
                    : <div className="fake-person" aria-hidden="true" />}
                  {ready && (
                    <div className="source-duration">
                      {formatTimecode(conversation.source.durationFrames).slice(3, 8)}
                    </div>
                  )}
                </div>
                <div className="source-info">
                  <div className="source-name">
                    {conversation?.source?.title ?? 'Source'}
                  </div>
                  <div className="source-sub">
                    {isEmbedded ? 'Plays on its own platform' : 'Uploaded video'}
                    {ready && ` · ${HOUSE_FPS}fps`}
                  </div>
                  <div className="source-state">
                    {ready ? 'Ready' : 'Preparing'}
                  </div>
                </div>
              </article>

              {/* People, then what was said: two lists, because a
                  person and a response are two things. [D-17]
                  Each brings its own heading, so this rail does
                  not label them a second time. */}
              <PeopleRail
                people={people}
                roomHref={`/c/${conversationId}/room`}
                canInvite={Boolean(conversation)}
              />

              <ClipRail
                rowMenu={(clip) => onRow(
                  clip.label || `Response ${clip.index}`, () => clipItems(clip))}
                items={clips}
                selectedId={selectedResponse}
                onSelect={(id) => {
                  setSelectedResponse(id);
                  const chosen = interventions.find((iv: any) => iv.id === id);
                  if (chosen) seekTo(chosen.anchor.tSourceFrame);
                }}
                onAdd={() => interrupt()}
                onRetry={(jobId) => { void call(`/api/jobs/${jobId}`, { method: 'POST' }); }}
                canAdd={phase === 'armed'}
              />

            </div>

          </aside>
          )}


          {/* ===================================================
               PUBLISH — the one region that is a document
               =================================================== */}
          {mode === 'publish' && (
            <section className="publish-area">
              <PublishStage
                conversationId={conversationId}
                conversation={conversation}
                snapshot={snapshot}
                refresh={refresh}
                embedded={isEmbedded}
              />
            </section>
          )}


          {/* ===================================================
               VIEWER — what will they see
               =================================================== */}
          {mode !== 'publish' && (
          <section className="viewer-area" data-key="yes">

            <div className="viewer-toolbar">

              <div className="viewer-mode">
                <button className={!composing ? 'mode-pill active' : 'mode-pill'}
                        data-testid="view-source"
                        onClick={() => { setExplainTool(null); setSelectedResponse(null); }}>
                  SOURCE
                </button>
                <button className={composing ? 'mode-pill active' : 'mode-pill'}
                        data-testid="view-response"
                        disabled={clips.length === 0}
                        onClick={() => {
                          const first = clips[0];
                          if (first) setSelectedResponse(first.id);
                        }}>
                  RESPONSE
                </button>
                <a className="mode-pill" data-testid="view-master"
                   href={`/c/${conversationId}/watch`}>
                  MASTER
                </a>
              </div>

              <div className="viewer-meta">
                <span>{HOUSE_FPS} FPS</span>
                <span>{formatTimecode(currentFrame)}</span>
                <span data-testid="viewer-state">
                  {recording ? 'RECORDING' : stance === 'yours' ? 'SPEAKING' : 'PAUSED'}
                </span>
              </div>

            </div>


            <div className="canvas-wrap">
              {/* The ratio the picture actually is, handed to the
                  frame so the two agree. [U-18] */}
              <div className="video-stage" data-testid="video-stage"
                   style={{
                     ['--stage-ar' as string]: String(isEmbedded ? 16 / 9 : sourceAspect),
                     ['--stage-fit' as string]: String(isEmbedded ? 16 / 9 : sourceAspect),
                   } as CSSProperties}>

                <div className="s1-picture">
                  <Stage
                    fit="height"
                    aspect={isEmbedded ? 16 / 9 : sourceAspect}
                    stance={stance}
                    cameraStream={camRef}
                    cameraOn={phase !== 'cold' && phase !== 'denied'}
                    claim={answering}
                  >
                    {/*
                      With a response chosen, the middle of the screen shows the
                      COMPOSITION — the two of you in the layout that will be
                      exported — rather than the source alone. Armed with a tool, the
                      author marks that composition directly, which is both how a
                      person explains something and the only placement that means the
                      same thing in the export. [U-12, U-18, §15]
                    */}
                    {composing && !isEmbedded ? (
                      <CompositionStage
                        conversationId={conversationId}
                        intervention={composing}
                        drafts={markDraft ? [markDraft] : []}
                      >
                        {explainTool && (
                          <ExplainSurface
                            intervention={composing}
                            tool={explainTool}
                            onDraft={setMarkDraft}
                            onDone={() => { setExplainTool(null); setMarkDraft(null); }}
                            onPlace={(mark) => {
                              setMarkDraft(null);
                              void call(annotationBase, {
                                method: 'POST',
                                body: JSON.stringify({ ...mark, style: {} }),
                              });
                            }}
                          />
                        )}
                      </CompositionStage>
                    ) : isEmbedded ? (
                      <div style={{
                        position: 'absolute', inset: 0, background: 'var(--screen-bed)',
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
                        playsInline
                        onLoadedMetadata={(e) => {
                          const v = e.currentTarget;
                          if (v.videoWidth && v.videoHeight) setSourceAspect(v.videoWidth / v.videoHeight);
                        }}
                        style={{
                          display: 'block', background: 'var(--screen-bed)', borderRadius: 0,
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
                          <div style={{ fontSize: 'var(--text-md)', marginBottom: 4 }}>Preparing your video</div>
                          <div className="small">
                            This happens once. You can start responding as soon as it appears.
                          </div>
                        </div>
                      </div>
                    )}
                  </Stage>
                </div>

                <div className="viewer-top-left">
                  {composing ? 'COMPOSITION · AS EXPORTED' : 'SOURCE · ORIGINAL'}
                </div>

                <div className="viewer-timecode">
                  {formatTimecode(currentFrame)}
                </div>

                {/* The marker is the brief's reminder that the source
                    is held on a frame. It is drawn when it is true. */}
                <div className="paused-marker"
                     style={{ opacity: stance === 'yours' ? 1 : 0 }} />

              </div>
            </div>


            <div className="viewer-controls">
              {/*
                * THE TRANSPORT, UNDER THE PICTURE RATHER THAN ACROSS IT.
                * The browser's bar floated over the bottom of the frame,
                * which is the one part of a source somebody is most often
                * looking at — a lower third, a caption, a name super. A
                * desk puts its transport below the monitor. [brief §12]
                */}
              {!isEmbedded && ready ? (
                <div className="s1-transport">
                  <SourceTransport
                    video={videoRef.current}
                    player={sourcePlayerRef.current}
                    currentFrame={currentFrame}
                    durationFrames={
                      snapshot?.conversation?.source?.durationFrames ?? 0}
                    onSeek={seekTo}
                  />
                </div>
              ) : <span className="s1-transport" />}

              <div className="time-readout">
                {formatTimecode(currentFrame).slice(0, 8)}
              </div>
            </div>


            {/* ---- the one key, and the statement it answers -------- */}
            <div className="key-bar">
              {error && (
                <div className="small" style={{ color: 'var(--bad)', marginBottom: 8 }}>{error}</div>
              )}
              {phase === 'denied' && (
                <div className="small" style={{ color: 'var(--bad)', marginBottom: 8 }}>
                  We could not reach your camera or microphone. Check the permissions
                  for this site in your browser, then press space again.
                </div>
              )}

              {picked && (
                <div style={{ marginBottom: 10 }}>
                <ClaimCard
                  quote={picked.text}
                  startFrame={picked.startFrame}
                  anchorFrame={picked.endFrame}
                  boundTo={boundResponse}
                  canRecord={phase === 'armed'}
                  /* The floor passes when the recording starts, and the card
                     should say so rather than keep offering to begin. */
                  speaking={stance === 'yours'}
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
                </div>
              )}

              {/*
                With a statement chosen, the claim card is already saying what space
                does, so this bar does not say it twice — but it keeps everything
                else. Hiding the whole bar hid the camera button with it, which left
                the card telling someone to enable a camera they could no longer
                reach.
              */}
              <div className="row" style={{ gap: 14 }}>
                <StageStatus
                  stance={stance}
                  currentFrame={currentFrame}
                  durationFrames={conversation?.source?.durationFrames ?? 0}
                />
                {/*
                  * A DIVIDER IN A BAR FADES AT ITS ENDS. A hard 1px rule
                  * meeting the bar's own edges makes a cross, and the eye
                  * finds the junction rather than the separation.
                  */}
                <span aria-hidden style={{
                  width: 1, alignSelf: 'stretch', margin: '0 var(--space-1)',
                  background: 'linear-gradient(180deg, transparent,'
                    + ' var(--line) 25%, var(--line) 75%, transparent)',
                }} />
                {picked && !boundResponse ? (
                  <span className="grow" />
                ) : (
                  <>
                    {/*
                      * THE ONE KEY IN THE PRODUCT, drawn as a key.
                      *
                      * It was a bordered rectangle with a faint wash, which
                      * is a chip. A keycap has a top face and a front edge:
                      * a light hairline along the top, a dark one along the
                      * bottom, and the label sitting on the face. That is
                      * two shadows, and it is the difference between a
                      * label that says "space" and an object that says
                      * "press me".
                      *
                      * It matters here more than anywhere else in the
                      * product, because SPACE is the whole interaction of
                      * Studio One — the interrupt is the product (U-04),
                      * and this is the only place it is taught.
                      */}
                    <kbd style={{
                      padding: 'var(--space-4) var(--space-7)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--ink-500)',
                      borderBottomColor: 'var(--ink-900)',
                      borderBottomWidth: 2,
                      background: 'linear-gradient(180deg,'
                        + ' var(--ink-600), var(--ink-700))',
                      fontSize: 'var(--text-md)',
                      fontWeight: 'var(--weight-semi)',
                      letterSpacing: '0.1em',
                      color: 'var(--ink-050)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1),'
                        + ' 0 1px 2px rgba(0,0,0,0.45)',
                      fontFamily: 'inherit',
                    }}>SPACE</kbd>
                    <span className="grow" style={{
                      fontSize: 'var(--text-base)', color: 'var(--text-dim)',
                    }}>
                      {stance === 'yours' ? 'to continue the video' : 'to interrupt and respond'}
                    </span>
                  </>
                )}

                {/*
                  * WHAT KIND OF MOVE THIS WILL BE, which is the setting the
                  * lower third of the finished video is cut from — so it
                  * belongs beside the key that starts the recording, and it
                  * belongs at the size of a technical readout rather than
                  * of a form field. [U-11]
                  */}
                <select
                  aria-label="Kind of response"
                  data-testid="response-type"
                  className="small-select"
                  value={type}
                  onChange={(e) => setType(e.target.value as InterventionType)}
                >
                  {INTERVENTION_TYPES.map((t) => (
                    <option key={t} value={t}>{TYPE_PRESENTATION[t].lowerThird}</option>
                  ))}
                </select>

                {/*
                  Notes, reachable without leaving the page. Recording is a camera
                  stream, so reading here cannot alter a frame of it — and staying
                  in the tab keeps the segment rotation that makes the take
                  crash-safe (U-06).
                */}
                <button
                  className="ctl"
                  style={{ padding: '8px 14px' }}
                  data-testid="toggle-reader"
                  data-open={readerOpen ? 'true' : 'false'}
                  aria-pressed={readerOpen}
                  onClick={() => setReaderOpen(!readerOpen)}
                  title={hasReading
                    ? 'Read your notes or slides while you speak'
                    : 'Attach a PDF or write a note on a response to read it here'}
                >
                  Notes
                </button>
                {/*
                  * THE ONE LOUD CONTROL IN STUDIO ONE, and it earns it:
                  * nothing in this room can be done until the camera is up,
                  * and until it is, this is the only thing to press.
                  */}
                {/*
                  * THE ONE LOUD CONTROL IN STUDIO ONE, and it is
                  * loud by being LIT rather than by being a
                  * different kind of object. It was `.primary` —
                  * the product's generic filled blue — and the
                  * console moved it to `.ctl.is-key` so that it
                  * belongs to the same family as GO LIVE and TAKE
                  * LIVE. Putting the brief's filled blue back here
                  * would undo that, on the one surface the rule
                  * was written about. `console.test.ts` holds it.
                  */}
                {phase === 'cold' && (
                  <button className="ctl is-key" data-testid="enable-camera"
                          onClick={() => void arm()}
                          style={{ padding: '8px 14px' }}>
                    Enable camera
                  </button>
                )}
                {recording && (
                  <button className="ctl is-critical" data-testid="continue-button"
                          style={{ padding: '8px 14px' }}
                          onClick={() => resume()}>
                    Continue
                  </button>
                )}
                {phase === 'armed' && (
                  <button className="ctl" data-testid="interrupt-button"
                          style={{ padding: '8px 14px' }}
                          onClick={() => interrupt()}>
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

          </section>
          )}


          {/* ===================================================
               CONTROL RAIL — how do I express it
               =================================================== */}
          {mode === 'studio' && (
          <aside className="control-rail">

            <div className="control-tabs" role="tablist" aria-label="Controls">
              {(['respond', 'transcript', 'audio', 'output'] as const).map((id) => (
                <button key={id} role="tab" aria-selected={control === id}
                        data-testid={`control-${id}`}
                        className={control === id ? 'control-tab active' : 'control-tab'}
                        onClick={() => setControl(id)}>
                  {id === 'respond' ? 'RESPOND'
                    : id === 'transcript' ? 'TRANSCRIPT'
                      : id === 'audio' ? 'AUDIO' : 'OUTPUT'}
                </button>
              ))}
            </div>

            <div className="control-panel s1-slot">

              {/* ---- RESPOND ---------------------------------- */}
              <section className={control === 'respond' ? 's1-panel active' : 's1-panel'}
                       data-testid="panel-respond">
                <div className="panel-heading">
                  <h2>Response</h2>
                  <span>{composing ? 'Selected' : 'Studio One'}</span>
                </div>

                <div className="production-state">
                  <div className="eyebrow">CURRENT STATE</div>
                  <strong>
                    {recording ? 'Recording response'
                      : phase === 'cold' ? 'Camera off'
                        : phase === 'denied' ? 'No camera'
                          : composing ? 'Response selected'
                            : stance === 'yours' ? 'Paused on source' : 'Watching source'}
                  </strong>
                  <p>
                    {recording
                      ? 'Your response is being captured from this exact source position.'
                      : phase === 'cold'
                        ? 'Enable the camera to begin. A rolling buffer runs while you watch.'
                        : composing
                          ? 'Choose how the two of you appear, and mark the picture.'
                          : 'The source is positioned at an exact moment. Press space to respond from here.'}
                  </p>
                </div>

                {/*
                  * THE LAYOUT AND THE MARKS ARE ONE RAIL, because
                  * they describe one response. `CompositionRail`
                  * already is that rail; it moves into the panel
                  * whole rather than being taken apart, which is
                  * how its layout list, its tool row and its mark
                  * list stay the one thing they were. [D-19]
                  */}
                {composing ? (
                  <CompositionRail
                    intervention={composing}
                    embedded={isEmbedded}
                    tool={explainTool}
                    disabled={recording}
                    onTool={setExplainTool}
                    onLayout={(layoutId) => {
                      void call(`/api/conversations/${conversationId}/interventions/${composing.id}`, {
                        method: 'PATCH', body: JSON.stringify({ layoutId }),
                      });
                    }}
                    onRemoveMark={(id) => {
                      void call(`${annotationBase}/${id}`, { method: 'DELETE' });
                    }}
                    onTimeMark={(id) => {
                      const take = (composing.takes ?? [])
                        .find((t: any) => t.id === composing.selectedTakeId);
                      if (!take) return;
                      void call(`${annotationBase}/${id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({
                          appearOffset: 0,
                          dismissOffset: take.mediaOutFrame - take.mediaInFrame,
                        }),
                      });
                    }}
                    onBack={() => { setExplainTool(null); setSelectedResponse(null); }}
                  />
                ) : (
                  <>
                    <div className="control-section">
                      <div className="control-label">
                        <span>Kind of response</span>
                        <strong>{TYPE_PRESENTATION[type].lowerThird}</strong>
                      </div>
                      <select className="small-select" style={{ width: '100%' }}
                              aria-label="Kind of response"
                              value={type}
                              onChange={(e) => setType(e.target.value as InterventionType)}>
                        {INTERVENTION_TYPES.map((t) => (
                          <option key={t} value={t}>{TYPE_PRESENTATION[t].lowerThird}</option>
                        ))}
                      </select>
                    </div>

                    <div className="control-section">
                      <button className={recording ? 'record-button recording' : 'record-button'}
                              data-testid="record-response"
                              disabled={phase !== 'armed' && !recording}
                              onClick={() => (recording ? resume() : interrupt())}>
                        {recording ? '■  STOP RECORDING' : '●  RECORD RESPONSE'}
                      </button>
                    </div>

                    <div className="control-section">
                      <div className="setting-row">
                        <span className="setting-name">Pre-roll</span>
                        <span className="setting-value">8 seconds</span>
                      </div>
                      <div className="setting-row">
                        <span className="setting-name">Segment</span>
                        <span className="setting-value">{SEGMENT_MS / 1000}s</span>
                      </div>
                      <div className="setting-row">
                        <span className="setting-name">Responses</span>
                        <span className="setting-value">{interventions.length}</span>
                      </div>
                    </div>
                  </>
                )}
              </section>

              {/* ---- TRANSCRIPT, and everything it carries ----- */}
              <section className={control === 'transcript' ? 's1-panel active' : 's1-panel'}
                       data-testid="panel-transcript">
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
              </section>

              {/* ---- AUDIO ------------------------------------ */}
              <section className={control === 'audio' ? 's1-panel active' : 's1-panel'}
                       data-testid="panel-audio">
                <div className="panel-heading">
                  <h2>Audio</h2>
                  <span>Master</span>
                </div>
                {/*
                  * THE SAME PANEL PUBLISH SHOWS, and `hasRender`
                  * is read the same way it reads it — from the
                  * job list on the snapshot both already hold.
                  * Audio is taken from a finished render, so a
                  * panel that guessed whether one existed would
                  * offer a download of nothing. [D-19, U-22]
                  */}
                <AudioPanel
                  conversationId={conversationId}
                  hasRender={(snapshot?.jobs ?? []).some((j: any) =>
                    (j.kind === 'render' || j.kind === 'render_reel')
                    && j.state === 'done')}
                />
              </section>

              {/* ---- OUTPUT ----------------------------------- */}
              <section className={control === 'output' ? 's1-panel active' : 's1-panel'}
                       data-testid="panel-output">
                <div className="panel-heading">
                  <h2>Output</h2>
                  <span>Master</span>
                </div>
                <div className="control-section">
                  <div className="setting-row">
                    <span className="setting-name">Frame rate</span>
                    <span className="setting-value">{HOUSE_FPS} fps</span>
                  </div>
                  <div className="setting-row">
                    <span className="setting-name">Source</span>
                    <span className="setting-value">
                      {ready
                        ? formatTimecode(conversation.source.durationFrames).slice(0, 8)
                        : 'Preparing'}
                    </span>
                  </div>
                  <div className="setting-row">
                    <span className="setting-name">Responses</span>
                    <span className="setting-value">{interventions.length}</span>
                  </div>
                </div>
                <div className="production-state">
                  <div className="eyebrow">SOURCE STATUS</div>
                  <strong>{isEmbedded ? 'Not compositable' : 'Compositable'}</strong>
                  <p>
                    {isEmbedded
                      ? 'This source plays on its own platform, so it cannot be '
                        + 'cut into the finished media. The responses still can.'
                      : 'This source can be included in the finished media.'}
                  </p>
                </div>
              </section>

            </div>

          </aside>
          )}


          {/* ===================================================
               PRODUCTION — when does it happen
               =================================================== */}
          {mode === 'studio' && (
          <section className="production-area">

            <div className="production-tabs" role="tablist" aria-label="Production">
              <button role="tab" aria-selected={production === 'timeline'}
                      data-testid="production-timeline"
                      className={production === 'timeline'
                        ? 'production-tab active' : 'production-tab'}
                      onClick={() => setProduction('timeline')}>
                TIMELINE
              </button>
              <button role="tab" aria-selected={production === 'responses'}
                      data-testid="production-responses"
                      className={production === 'responses'
                        ? 'production-tab active' : 'production-tab'}
                      onClick={() => setProduction('responses')}>
                RESPONSES
              </button>

              <div className="production-actions">
                {working > 0 && (
                  <span className="small muted" style={{ marginRight: 8 }}>
                    Preparing {working} {working === 1 ? 'response' : 'responses'}…
                  </span>
                )}
              </div>
            </div>

            <div className="s1-slot" style={{ padding: 12 }}>

              {production === 'timeline' && (
                <>
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
                      margin: 10, padding: '10px 12px', borderRadius: 6,
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
                </>
              )}

              {production === 'responses' && (
                <StudioMode
                  conversationId={conversationId}
                  snapshot={snapshot}
                  refresh={refresh}
                  onRerecord={rerecord}
                  canRecord={phase === 'armed'}
                  onSeek={seekTo}
                />
              )}

            </div>

          </section>
          )}

        </main>

      </div>

      {/* The notes a person reads from while they speak, over
          everything, because that is what it is for. [U-06, U-33] */}
      {readerOpen && (
        <Reader
          title={readingDoc?.title ?? 'Your notes'}
          pageCount={readingPages}
          page={readingPage}
          pages={(n) => `/api/conversations/${conversationId}/evidence/` +
            `${readingDoc?.id}/capture?page=${n}`}
          onPage={(n) => {
            if (!readingDoc || !readingFor) return;
            void call(
              `/api/conversations/${conversationId}/interventions/${readingFor.id}` +
              `/evidence/${readingDoc.id}`,
              { method: 'PATCH', body: JSON.stringify({ page: n }) },
            );
          }}
          {...(readingFor?.note ? { note: readingFor.note } : {})}
          onClose={() => setReaderOpen(false)}
        />
      )}
    </div>
  );
}
