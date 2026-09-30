'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.js';
import { useRouter } from 'next/navigation';

import {
  ACCEPTS_MEDIA, planForUrl, waysIn, type SourceKind,
} from '../src/domain/sources.js';
import { useCamera } from './useCamera.js';
import { useQuality } from './useQuality.js';
import { useSourceRecorder } from './useSourceRecorder.js';

/**
 * Bringing something into a conversation.
 *   [STUDIO-ONE §1, §2, §4, §6, §7; U-21, INV-07]
 *
 * This used to be a form: fields for the title, the creator, the rights
 * basis, the URL, all at once, before the person had seen anything. That is a
 * database record being filled in, and it set the tone for everything after.
 *
 * It is a journey now, and the middle step is the point of it:
 *
 *   CHOOSE   one of four doors
 *   PREPARE  here is what you are about to have a conversation with —
 *            the picture, the title, who made it, how long it runs
 *   ENTER    the workspace
 *
 * AND THERE USED TO BE TWO DOORS. *"The current Conversation Studio
 * essentially says: give me a YouTube link or upload a video. That makes the
 * product feel like a tool specifically designed around YouTube reaction
 * videos, when the concept you have described is much broader."*
 *
 * The author is describing a product whose subject is `SOURCE → RESPONSE`
 * and whose interface had narrowed the first word to two platforms and one
 * file type. The four doors are in `src/domain/sources.ts`, once, so that
 * this screen, the studio page and the tests cannot disagree about how many
 * there are — and so that the fifth, which the author marked *Later*, is
 * listed as shut rather than forgotten. [D-19]
 *
 * Provenance has not gone anywhere. The creator, the source URL and the
 * rights basis still reach the attribution block on every export (U-21,
 * INV-07), and they are still asked for — under "Source information", where
 * someone who cares can open them, rather than as the first thing anyone
 * meets. What the first screen asks is what the product is about.
 */
type Step = 'choose' | 'ready';

interface Preview {
  kind: 'link' | 'file';
  title: string;
  author: string;
  thumbnailUrl?: string;
  providerLabel?: string;
  canonicalUrl?: string;
  durationSeconds?: number;
  fileName?: string;
  fileSizeMb?: number;
  unverified?: boolean;
}

export default function StartConversation() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('choose');
  /*
   * WHICH DOOR IS OPEN, AND NONE IS OPEN AT FIRST.  [§1, §6]
   *
   * The old state was `'link' | 'upload'` and defaulted to `link`, so the
   * first thing anybody saw was a box asking for a YouTube address —
   * which is the narrowing the author is objecting to, expressed as a
   * default value. Four cards and no answer is the honest first screen:
   * *"What would you like to respond to?"* is a question.
   */
  const [door, setDoor] = useState<SourceKind | null>(null);
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  /**
   * WHICH DOOR THE FILE CAME IN BY, kept so the document can be told.
   *
   * A chosen file, a camera and a screen capture are the same bytes to
   * everything downstream — which is the point — so this is the last
   * moment the difference exists. The recent-conversations list has a
   * column for it. [§5]
   */
  const [cameIn, setCameIn] = useState<SourceKind>('upload');
  const [title, setTitle] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [creator, setCreator] = useState('');
  const [rights, setRights] = useState('own');
  const [details, setDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const monitor = useRef<HTMLVideoElement | null>(null);

  /*
   * THE RECORDER IS THE ONE THIS PRODUCT ALREADY HAS A LADDER FOR.
   * `recording` is the same preset Studio Two and the Take App keep their
   * footage at, 2160p included, because "how good a source to keep" is
   * one question. [CHANNEL §23a, D-19]
   */
  const { quality } = useQuality('recording');
  const camera = useCamera(door === 'record');
  const capture = useSourceRecorder(
    quality, door === 'screen' ? 'screen' : 'camera',
    { ...(camera.cameraId ? { cameraId: camera.cameraId } : {}),
      ...(camera.microphoneId ? { microphoneId: camera.microphoneId } : {}) },
  );

  /* The monitor shows what is being recorded, muted, or it is a mirror. */
  useEffect(() => {
    if (monitor.current) monitor.current.srcObject = capture.stream;
  }, [capture.stream]);

  /*
   * WHAT THIS LINK IS, WORKED OUT AS IT IS TYPED.  [§2B]
   *
   * *"The system should tell the user whether the URL can be played
   * directly, imported, or embedded."* It is computed rather than stored
   * because it is a function of the box's contents and nothing else, and
   * a stored copy is a copy that can be stale by one keystroke.
   */
  const plan = planForUrl(url);

  /*
   * A SOURCE WITH NO PICTURE, KNOWN FROM THE FILE AND NOT GUESSED. [§7]
   *
   * The browser already told us: a chosen file carries its MIME type, and
   * `takeFile` only ever finds a poster when a frame decoded. Either is a
   * weaker signal alone — a `.mkv` full of video can report an empty type,
   * and a video whose codec this browser cannot decode has no poster — so
   * the honest test is the type, which is what the person's own operating
   * system said the file is.
   */
  const audioOnly = Boolean(file && file.type.startsWith('audio/'));

  const lookUp = async () => {
    setBusy(true);
    setError(null);
    /*
     * A FILE LINK IS NOT LOOKED UP, BECAUSE THERE IS NOBODY TO ASK.
     *   [§2B]
     *
     * `/api/sources/preview` asks a platform's oEmbed endpoint for a
     * title, a creator and a thumbnail. A university's web server has
     * none of those — it has a file — and asking it would either fail or,
     * worse, become a second outbound request to an address a person
     * typed, before anything has been decided.
     *
     * So the preview for an import is made from what the URL itself says:
     * the file's name, and the host it lives on. Both are facts; neither
     * is fetched. The real title, duration and shape arrive from the
     * MEZZANINE after ingest, measured rather than believed (U-02), which
     * is where an uploaded file's come from too.
     */
    if (plan.can === 'fetch') {
      const named = decodeURIComponent(
        new URL(url.trim()).pathname.split('/').pop() ?? '')
        .replace(/\.[^.]+$/, '') || plan.host;
      setPreview({
        kind: 'link', title: named, author: '',
        providerLabel: plan.host, canonicalUrl: url.trim(),
      });
      setSourceTitle(named);
      setTitle(`My response to “${named}”`);
      setRights('permission');
      setStep('ready');
      setBusy(false);
      return;
    }
    try {
      const response = await fetch('/api/sources/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'could not read that link');
      const found: Preview = {
        kind: 'link',
        title: data.title || 'Untitled video',
        author: data.author ?? '',
        thumbnailUrl: data.thumbnailUrl || undefined,
        providerLabel: data.providerLabel,
        canonicalUrl: data.canonicalUrl,
        durationSeconds: data.durationSeconds,
        unverified: data.unverified,
      };
      setPreview(found);
      setSourceTitle(found.title);
      setTitle(`My response to “${found.title}”`);
      setCreator(found.author ?? '');
      setRights('permission');
      setStep('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** A local file can describe itself without anything leaving the machine. */
  const takeFile = (chosen: File, cameIn: SourceKind = 'upload') => {
    setFile(chosen);
    setCameIn(cameIn);
    const name = chosen.name.replace(/\.[^.]+$/, '');
    const local: Preview = {
      kind: 'file',
      title: name,
      author: '',
      fileName: chosen.name,
      fileSizeMb: Math.round(chosen.size / 1_000_000),
    };
    /*
     * A picture of the file, drawn from the file.
     *
     * A black rectangle where the video should be is the difference between
     * "here is what you are about to answer" and "a file was accepted". The
     * browser can decode one frame without anything leaving the machine, so
     * there is no reason to show nothing.
     */
    const video = document.createElement('video');
    // 'auto', not 'metadata': seeking needs frames, and metadata is only the
    // header. With 'metadata' the seek never completes and the picture never
    // arrives.
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const objectUrl = URL.createObjectURL(chosen);
    let drawn = false;
    const draw = () => {
      if (drawn || !video.videoWidth) return;
      drawn = true;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const url = canvas.toDataURL('image/jpeg', 0.75);
        setPreview((p) => (p && p.kind === 'file' ? { ...p, thumbnailUrl: url } : p));
      } catch { /* a frame we cannot read is not a reason to stop. */ }
      URL.revokeObjectURL(objectUrl);
    };
    video.onloadedmetadata = () => {
      setPreview((p) => (p && p.kind === 'file'
        ? { ...p, durationSeconds: Math.round(video.duration) } : p));
      // A second in, where a title card or a black lead-in has usually ended.
      video.currentTime = Math.min(1, Math.max(0, video.duration - 0.1));
    };
    video.onseeked = draw;
    // Some containers report a seek complete without firing `seeked`; the
    // first decoded frame is just as good a moment to take the picture.
    video.oncanplay = () => { window.setTimeout(draw, 250); };
    video.src = objectUrl;
    setPreview(local);
    setSourceTitle(name);
    setTitle(`My response to “${name}”`);
    setRights('own');
    setStep('ready');
  };

  const enter = async () => {
    setBusy(true);
    setError(null);
    try {
      let response: Response;
      if (preview?.kind === 'file' && file) {
        const form = new FormData();
        form.set('file', file);
        form.set('sourceTitle', sourceTitle || preview.title);
        form.set('creator', creator);
        form.set('rightsBasis', rights);
        form.set('url', '');
        form.set('title', title);
        form.set('capturedAs', cameIn);
        response = await fetch('/api/conversations', { method: 'POST', body: form });
      } else {
        response = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            providerUrl: url,
            sourceTitle: sourceTitle || (preview?.title ?? ''),
            creator,
            rightsBasis: rights,
            title,
          }),
        });
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'could not start the conversation');
      router.push(`/c/${data.conversation.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const minutes = (seconds?: number) => {
    if (!seconds) return null;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  };

  /*
   * The file input lives outside the steps, always mounted.
   *
   * Unmounting it releases the File it is holding, and the object URL made
   * from that File stops resolving — which is why the preparation screen
   * showed a black rectangle where the first frame should be.
   *
   * IT ACCEPTS AUDIO NOW, AND THAT IS THE WHOLE OF §7. `accept="video/*"`
   * was the only thing between this product and *"someone could upload a
   * podcast episode and say: I want to respond to this statement at
   * 12:42"* — `src/render/ingest.ts` has synthesised a black picture for
   * audio-only material since the day it was written, so the engine,
   * the timeline, the transcript and the renderer were all ready and the
   * door was three words wide.
   */
  const filePicker = (
    <input
      ref={fileRef} id="file" type="file" accept={ACCEPTS_MEDIA}
      style={{ display: 'none' }}
      onChange={(e) => { const f = e.target.files?.[0]; if (f) takeFile(f); }}
    />
  );

  /* ---- step one: bring something in -------------------------------- */
  if (step === 'choose') {
    const way = waysIn().find((one) => one.kind === door);
    return (
      <div data-testid="start-choose">
        {filePicker}
        {/*
          * THE HEADING IS A QUESTION NOW.  [§1, §7]
          *
          * It said "Bring a video into the conversation", which answered
          * the question before asking it and answered it too narrowly:
          * the product takes video, audio, a screen and a camera, and
          * the sentence named one of them.
          */}
        <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 4 }}>
          Start a conversation
        </h2>
        <p className="muted" style={{ marginTop: 0, maxWidth: 560 }}>
          What would you like to respond to? Video, audio, a screen or your
          own camera — then interrupt it wherever you have something to say.
        </p>

        {/*
          * FOUR CARDS, FROM THE TABLE AND NOT FROM HERE. A fifth exists
          * in `SOURCE_WAYS`, marked `later` by the author, and `waysIn`
          * is what keeps it out of this row without losing it. [§3, §8]
          */}
        <div data-testid="source-ways" style={{
          display: 'grid', gap: 10, margin: '20px 0 16px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(176px, 1fr))',
        }}>
          {waysIn().map((one) => (
            <button
              key={one.kind} data-testid="source-way" data-way={one.kind}
              aria-pressed={door === one.kind}
              onClick={() => {
                setError(null);
                setDoor(one.kind);
                /*
                 * ONE PRESS IS ENOUGH FOR THE DOORS THAT OPEN SOMETHING.
                 * *"The initial screen stays simple."* Choosing Upload and
                 * then having to press a second button called Choose file
                 * is a step that exists only because the code has two
                 * states; the browser's own picker IS the second step.
                 */
                if (one.kind === 'upload') fileRef.current?.click();
                if (one.kind === 'record' || one.kind === 'screen') {
                  void capture.arm();
                }
              }}
              style={{
                textAlign: 'left', padding: '14px 16px', minWidth: 0,
                background: door === one.kind ? 'var(--accent-wash)' : 'transparent',
                /*
                 * A CHOSEN CARD IS CHROME. This border was --user-accent,
                 * which is the responder's orange, drawn around a blue
                 * wash — the first screen of the product, telling a
                 * speaker-identity story about a radio button. [U-20]
                 */
                border: `1px solid ${door === one.kind ? 'var(--accent)' : 'var(--line)'}`,
              }}
            >
              <div style={{ fontWeight: 'var(--weight-semi)' }}>{one.label}</div>
              <div className="small muted">{one.says}</div>
            </button>
          ))}
        </div>

        {/*
          * AND THEN ONE SIMPLE THING.  [§6]
          *
          * *"And don't make every source type equally complicated."* Each
          * door asks for exactly what it needs and nothing else, and the
          * sentence it asks with comes from the same table as the card.
          */}
        {way && (
          <p className="small muted" data-testid="way-asks"
             style={{ margin: '0 0 8px' }}>{way.asks}</p>
        )}

        {door === 'upload' && (
          <button data-testid="choose-file" onClick={() => fileRef.current?.click()}>
            Choose a file
          </button>
        )}

        {door === 'link' && (
          <>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="grow" id="providerUrl" value={url}
                placeholder="https://www.youtube.com/watch?v=… or https://example.org/talk.mp4"
                data-testid="source-url"
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && plan.can !== 'no') void lookUp();
                }}
              />
              <button className="primary" data-testid="load-video"
                      disabled={busy || plan.can === 'no'} onClick={() => void lookUp()}>
                {busy ? 'Looking…' : 'Load source'}
              </button>
            </div>
            {/*
              * WHAT WILL HAPPEN TO THIS LINK, BEFORE IT HAPPENS.  [§2B]
              *
              * *"The system should tell the user whether the URL can be
              * played directly, imported, or embedded."* Three sentences
              * for three outcomes, and the refusal says why — because
              * "that is not a link to a video we can embed officially"
              * was what a university lecture recording used to get, and
              * it was not true.
              *
              * THE HOST IS NAMED ON AN IMPORT. It is the one fact that
              * tells somebody whether the file they are about to pull in
              * is from where they think it is.
              */}
            {url.trim() !== '' && (
              <p className="small" data-testid="url-plan" data-can={plan.can}
                 style={{
                   marginTop: 6,
                   color: plan.can === 'no' ? 'var(--bad)' : 'var(--muted)',
                 }}>
                {plan.can === 'embed'
                  ? `This plays in ${plan.platform}’s own player. Nothing is `
                    + 'downloaded, and your responses publish alongside it.'
                  : plan.can === 'fetch'
                    ? `This imports the file from ${plan.host}, and it is cut `
                      + 'into one finished film with your responses.'
                    : plan.because}
              </p>
            )}
          </>
        )}

        {/*
          * RECORD, AND SCREEN CAPTURE, WHICH ARE THE SAME CONTROL.  [§2C, §2D]
          *
          * One asks a camera and one asks the browser for a display; after
          * that they are a picture, a clock and a stop button. Two panels
          * would be two places for the stop button to behave differently.
          */}
        {(door === 'record' || door === 'screen') && (
          <div data-testid="capture-panel">
            {capture.state === 'arming' && (
              <p className="small muted">
                {door === 'screen'
                  ? 'Choose a screen, a window or a tab…'
                  : 'Asking for the camera and microphone…'}
              </p>
            )}
            {capture.stream && (
              <video ref={monitor} autoPlay muted playsInline
                     data-testid="capture-monitor"
                     style={{
                       width: '100%', maxWidth: 420, aspectRatio: '16 / 9',
                       borderRadius: 'var(--radius-screen)',
                       border: '1px solid var(--line)',
                       background: 'var(--screen-bed)', display: 'block',
                     }} />
            )}
            {door === 'record' && capture.state === 'ready'
              && camera.devices.cameras.length > 1 && (
              <label className="field" style={{ maxWidth: 420, marginTop: 8 }}>
                <span className="module-sub">Camera</span>
                <select className="small" data-testid="capture-camera"
                        value={camera.cameraId ?? ''}
                        onChange={(e) => camera.chooseCamera(e.target.value || undefined)}>
                  <option value="">Whichever the browser prefers</option>
                  {camera.devices.cameras.map((one) => (
                    <option key={one.deviceId} value={one.deviceId}>{one.label}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              {capture.state === 'idle' && (
                <button data-testid="capture-arm" onClick={() => void capture.arm()}>
                  {door === 'screen' ? 'Choose what to capture' : 'Turn the camera on'}
                </button>
              )}
              {capture.state === 'ready' && (
                <button className="primary" data-testid="capture-start"
                        onClick={() => capture.start()}>
                  Start recording
                </button>
              )}
              {capture.state === 'recording' && (
                <>
                  <button className="primary" data-testid="capture-stop"
                          onClick={() => {
                            void (async () => {
                              const made = await capture.stop();
                              if (made) takeFile(made, door);
                            })();
                          }}>
                    Stop and use this
                  </button>
                  <span className="small" data-testid="capture-elapsed"
                        style={{ alignSelf: 'center' }}>
                    <span aria-hidden="true" style={{
                      display: 'inline-block', width: 8, height: 8,
                      borderRadius: '50%', background: 'var(--bad)',
                      marginRight: 6,
                    }} />
                    {minutes(capture.elapsed) ?? '0:00'}
                  </span>
                </>
              )}
              {capture.state === 'saving' && (
                <span className="small muted">Saving the recording…</span>
              )}
              {capture.state !== 'idle' && capture.state !== 'saving' && (
                <button data-testid="capture-cancel" onClick={() => capture.release()}>
                  Cancel
                </button>
              )}
            </div>
            {/*
              * WHAT THIS WILL COST, WHERE IT IS SPENT. The recorder's own
              * sentence, not the broadcast one: there is no uplink here,
              * only a disk. [CHANNEL §23a, U-19]
              *
              * AND `records` ALREADY NAMES THE RESOLUTION. A browser run
              * printed "High — 1080p · 1080p, which is what the master
              * delivers", because the label and the sentence were
              * concatenated and both begin with the same number.
              */}
            {capture.state === 'ready' && (
              <p className="small muted" style={{ marginTop: 6, fontSize: 'var(--text-2xs)' }}>
                {quality.records}
              </p>
            )}
            {capture.error && (
              <p className="small" data-testid="capture-error"
                 style={{ color: 'var(--bad)' }}>{capture.error}</p>
            )}
          </div>
        )}

        {/*
          * THE DOOR THAT IS NOT OPEN, SAID RATHER THAN OMITTED.  [§3, §8]
          *
          * *"I would also consider Live source… Eventually."* A product
          * that silently lacks a thing and a product that says when it is
          * coming are different products to somebody deciding whether to
          * use it, and the author put it in the table rather than leaving
          * it out.
          */}
        <p className="small muted" data-testid="later-source"
           style={{ marginTop: 14, fontSize: 'var(--text-2xs)' }}>
          A live source — camera, browser, RTMP, SRT or a network feed — is
          not here yet.
        </p>

        {error && <p className="small" style={{ color: 'var(--bad)' }} data-testid="start-error">{error}</p>}
      </div>
    );
  }

  /* ---- step two: see what you are about to enter -------------------- */
  return (
    <div data-testid="start-ready" style={{ position: 'relative' }}>
      {filePicker}
      {/* The source's own picture, blurred behind its own setup screen. */}
      {preview?.thumbnailUrl && (
        <div aria-hidden style={{
          position: 'absolute', inset: -40, zIndex: 0, borderRadius: 16, overflow: 'hidden',
          backgroundImage: `url(${preview.thumbnailUrl})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          filter: 'blur(48px) saturate(1.25)', opacity: 0.30,
        }} />
      )}

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 'var(--text-xs)' }}>
          New conversation
        </div>
        <h2 style={{ fontSize: 'var(--text-xl)', margin: '2px 0 16px' }}>Start a conversation</h2>

        <div className="row" style={{ gap: 16, alignItems: 'flex-start', marginBottom: 18 }}>
          {/*
            A picture, or an honest stand-in — never a black rectangle.
            A poster can be missing for reasons that say nothing about the
            file: a provider that did not answer, or a browser that cannot
            decode this codec. A black box reads as "your upload is broken",
            which is a lie the product tells about the person's own video. So
            when there is no frame to show, the card says what it has: the
            name, and the fact that the picture arrives once it plays.
          */}
          <div
            data-testid="preview-media"
            data-kind={preview?.thumbnailUrl ? 'poster' : 'placeholder'}
            style={{
              width: 280, aspectRatio: '16 / 9', overflow: 'hidden',
              borderRadius: 'var(--radius-screen)',
              border: '1px solid var(--line)', flex: '0 0 auto',
              display: 'grid', placeItems: 'center',
              background: preview?.thumbnailUrl
                ? 'var(--screen-bed)'
                : 'linear-gradient(145deg, #1b2129, #12171d)',
            }}
          >
            {preview?.thumbnailUrl ? (
              <img alt="" src={preview.thumbnailUrl} data-testid="preview-thumb"
                   style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div data-testid="preview-placeholder"
                   style={{ textAlign: 'center', padding: 16, lineHeight: 1.4 }}>
                <div aria-hidden style={{ opacity: 0.5, lineHeight: 0 }}>
                  <Icon name="chevron" size={22} />
                </div>
                <div className="small" style={{ marginTop: 4, wordBreak: 'break-word' }}>
                  {preview?.fileName ?? preview?.title ?? 'Your video'}
                </div>
                {/*
                  * AND FOR A PODCAST THERE IS NO PICTURE TO WAIT FOR. [§7]
                  *
                  * "The picture appears once it plays" is true of a video
                  * whose first frame could not be decoded and a lie about
                  * an MP3 — which would leave somebody watching a box,
                  * waiting for something that is never coming, and
                  * concluding their upload is broken. The engine gives an
                  * audio source a black picture on purpose; the screen
                  * should say so.
                  */}
                <div className="small muted" style={{ fontSize: 'var(--text-xs)', marginTop: 2 }}>
                  {audioOnly
                    ? 'Sound only — the timeline shows it as a black picture'
                    : 'The picture appears once it plays'}
                </div>
              </div>
            )}
          </div>

          <div className="grow" style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, lineHeight: 1.25 }} data-testid="preview-title">
              {sourceTitle || preview?.title}
            </div>
            {preview?.author && <div className="muted" style={{ marginTop: 2 }}>{preview.author}</div>}
            <div className="small muted" style={{ marginTop: 8 }}>
              {[
                minutes(preview?.durationSeconds),
                preview?.providerLabel,
                preview?.fileSizeMb ? `${preview.fileSizeMb} MB` : null,
              ].filter(Boolean).join('  ·  ')}
            </div>
            {preview?.unverified && (
              <div className="small muted" style={{ marginTop: 8 }}>
                We could not reach {preview.providerLabel} for the details. The link
                still works — the title fills in once it plays.
              </div>
            )}
            <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
              {preview?.kind === 'file'
                ? (audioOnly
                  ? 'Your responses and this recording will be cut into one '
                    + 'finished film. Pause it anywhere — at 12:42, at a '
                    + 'sentence — and answer.'
                  : 'Your responses and this video will be cut into one finished film.')
                : 'This video stays on its own platform. Your responses publish alongside '
                  + 'it, as a player that drives the original.'}
            </p>
          </div>
        </div>

        <div className="field">
          <label htmlFor="conversationTitle">What would you like to call this conversation?</label>
          <input id="conversationTitle" value={title} data-testid="conversation-title"
                 onChange={(e) => setTitle(e.target.value)} />
          <div className="small muted">You can change this later.</div>
        </div>

        {/*
          Provenance, kept and not foregrounded. The attribution block is
          generated from these and appears on every export (U-21, INV-07);
          what changes is that nobody has to answer them before they have
          seen the video.
        */}
        <button
          className="small" data-testid="toggle-source-details"
          onClick={() => setDetails(!details)}
          style={{ background: 'transparent', border: 'none', color: 'var(--muted)',
            padding: '6px 0', cursor: 'pointer' }}
        >
          <Icon name="chevron" size={10} {...(details ? { turn: 90 as const } : {})} />
          {' '}Source information — creator, link, rights and attribution
        </button>

        {details && (
          <div style={{ borderLeft: '2px solid var(--line)', paddingLeft: 12, marginBottom: 12 }}>
            <div className="field">
              <label htmlFor="sourceTitle">What the video is called</label>
              <input id="sourceTitle" value={sourceTitle} data-testid="source-title"
                     onChange={(e) => setSourceTitle(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="creator">Original creator</label>
              <input id="creator" value={creator} data-testid="creator"
                     onChange={(e) => setCreator(e.target.value)} />
            </div>
            {preview?.canonicalUrl && (
              <div className="field">
                <label htmlFor="sourceLink">Original link</label>
                <input id="sourceLink" readOnly value={preview.canonicalUrl} />
              </div>
            )}
            <div className="field">
              <label htmlFor="rightsBasis">Rights basis</label>
              <select id="rightsBasis" value={rights} onChange={(e) => setRights(e.target.value)}>
                <option value="own">I own this material</option>
                <option value="permission">I have permission, or it is quoted fairly</option>
                <option value="public_domain">Public domain or open licence</option>
              </select>
            </div>
            <p className="small muted" style={{ marginBottom: 0 }}>
              A credit to the original is generated from these and appears on every
              export. It cannot be removed.
            </p>
          </div>
        )}

        {error && <p className="small" style={{ color: 'var(--bad)' }} data-testid="start-error">{error}</p>}

        <div className="row" style={{ gap: 10, marginTop: 8 }}>
          <button data-testid="start-back" onClick={() => { setStep('choose'); setPreview(null); }}>
            Back
          </button>
          <span className="grow" />
          <button className="primary" data-testid="enter-conversation"
                  disabled={busy || !title.trim()} onClick={() => void enter()}>
            {busy ? 'Preparing…' : 'Enter conversation →'}
          </button>
        </div>
      </div>
    </div>
  );
}
