'use client';

import { useEffect, useRef, useState } from 'react';
import VideoTransport from '../../../VideoTransport.js';

/**
 * Watching the channel.  [Doctrine CHANNEL §17, §11, U-31]
 *
 *     /playlist  →  ...stream/4291.ts  →  a picture
 *
 * The last link. Everything upstream of this was built and tested without
 * it: the schedule, the loop, the live buffer, the failover, the marks and
 * the segments on disk. What was missing was somebody able to watch them —
 * the playlist and the segments answered 404 to everyone but the owner, and
 * no player in the product could read an `.m3u8` anyway.
 *
 * WHY A LIBRARY AT ALL. Safari plays HLS natively; nothing else does. A
 * `<video src="…m3u8">` is a black rectangle in Chrome and Firefox, which is
 * most viewers. `hls.js` is the one dependency that turns the segments the
 * playout engine has been writing all along into a channel somebody can
 * actually watch, and it is loaded ONLY where the browser has no native
 * support — on an iPhone it never arrives at all.
 *
 * IT IS NOT THE STUDIO'S MONITOR. The control room shows the operator their
 * own picture, undelayed, because a presenter watching the transmission
 * talks over themselves (§7). This is the transmission: twelve seconds
 * behind, segment-aligned, and the same bytes every other viewer is getting.
 *
 * LIVE MEANS THE LIVE EDGE. A player that buffers politely drifts further
 * behind every stall until it is a minute late to its own channel, so a
 * player that has fallen behind the last segment is pushed back to it — the
 * one thing a live player must do that an on-demand one must not.
 */

/** How far behind the edge is too far, before it is nudged forward. */
const DRIFT_S = 12;

/** One audio rendition, as the player can see it. */
export interface Track {
  /** What `hls.js` calls it, or `-1` for the element's own. */
  id: number;
  label: string;
  language: string;
}

export default function ChannelPlayer({
  channelId, poster, onAir = false, compact = false, onVideo, onAudio,
  onSubtitles, onQuality,
}: {
  channelId: string;
  poster?: string;
  /** From the channel's own `now` endpoint — see VideoTransport. */
  onAir?: boolean;
  /**
   * The same player, small enough to sit in the corner of a desk.
   * [§18, C-28]
   *
   * No transport and no prose: a confidence monitor is a hundred and
   * sixty pixels wide, and a clock, a LIVE badge and two lines of
   * explanation do not fit in it — nor are they wanted, because an
   * operator is looking at this to answer one question and the
   * answer is the picture. What the prose used to say is said
   * instead by the sentence the control room already computes, which
   * knows about the engine as well as the player. [D-19]
   */
  compact?: boolean;
  /**
   * The element, once it exists, so a caller can sample it.
   *
   * A confidence monitor an operator has to WATCH is a confidence
   * monitor that misses the fault, which is exactly how C-24
   * survived. Handing the element out lets the desk measure the
   * picture instead of hoping somebody notices it.
   */
  onVideo?: (video: HTMLVideoElement | null) => void;
  /**
   * The audio renditions this stream turned out to have, once it
   * has been read. [N-10]
   */
  onAudio?: (audio: {
    tracks: Track[]; chosen: number; pick: (id: number) => void;
  }) => void;
  /**
   * The caption tracks this stream turned out to have, once it
   * has been read. [§17, N-10]
   *
   * THE SAME SHAPE AS `onAudio` AND ONE DIFFERENCE: `chosen` of
   * `-1` means OFF, which is a state audio does not have. A
   * viewer always hears something; a viewer does not always
   * want words on their picture, and off is where they start.
   */
  onSubtitles?: (subs: {
    tracks: Track[]; chosen: number; pick: (id: number) => void;
  }) => void;
  /**
   * The picture sizes this stream turned out to carry. [§23]
   *
   * THE SAME SHAPE AGAIN, AND `-1` MEANS AUTO rather than off.
   * A ladder's whole point is that the player measures the
   * line and chooses; the menu exists for the viewer who knows
   * better than the measurement — on a metered connection, or
   * on a screen where 360p is plenty.
   */
  onQuality?: (levels: {
    tracks: Track[]; chosen: number; pick: (id: number) => void;
  }) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  /*
   * THE AUDIO RENDITIONS, DISCOVERED FROM THE STREAM AND NOT
   * FROM THE DOCUMENT.  [N-10]
   *
   * The station document says what a broadcaster INTENDED; the
   * master playlist says what the encoder is writing and the
   * account is entitled to. A picker built on the first offers
   * languages that go silent when they are chosen, which is the
   * worst shape this fault takes — the viewer blames their own
   * connection. So the player asks the stream. [D-21, U-19]
   */
  const [tracks, setTracks] = useState<Track[]>([]);
  const [chosen, setChosen] = useState(-1);
  const pick = useRef<(id: number) => void>(() => undefined);
  /* And the captions, discovered the same way and for the same
     reason: the document says what a broadcaster intended, the
     playlist says what is being written. [D-21] */
  const [subs, setSubs] = useState<Track[]>([]);
  const [showing, setShowing] = useState(-1);
  const pickSub = useRef<(id: number) => void>(() => undefined);
  /* And the rungs, for the same reason again. */
  const [levels, setLevels] = useState<Track[]>([]);
  const [level, setLevel] = useState(-1);
  const pickLevel = useRef<(id: number) => void>(() => undefined);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    /*
     * THE MASTER FIRST, AND A 404 IS THE ORDINARY ANSWER. Most
     * channels carry one audio track and have no master at all;
     * `hls.js` follows a master transparently when there is one,
     * so the only thing that changes for them is one HEAD-shaped
     * request that fails fast. [D-19]
     */
    const url = `/api/channels/${channelId}/playlist`;
    const master = `/api/channels/${channelId}/master.m3u8`;
    let destroy: (() => void) | undefined;
    let cancelled = false;

    /*
     * Native first. Safari and every iOS browser play HLS in the video
     * element, and handing those a JavaScript player would be shipping a
     * megabyte to re-implement something already in the operating system.
     */
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      /*
       * SAFARI PICKS ITS OWN TRACK AND LETS US MOVE IT. The
       * element exposes `audioTracks` once the master is parsed,
       * which is the operating system's own switcher rather than
       * a second implementation of one.
       */
      void fetch(master, { method: 'GET' })
        .then((answer) => { if (!cancelled) video.src = answer.ok ? master : url; })
        .catch(() => { if (!cancelled) video.src = url; });
      const held = (video as unknown as {
        audioTracks?: { length: number; [at: number]: {
          label: string; language: string; enabled: boolean } };
      }).audioTracks;
      const sync = () => {
        if (!held || held.length < 2) return;
        setTracks(Array.from({ length: held.length }, (_, at) => ({
          id: at,
          label: held[at]!.label || held[at]!.language,
          language: held[at]!.language,
        })));
        for (let at = 0; at < held.length; at += 1) {
          if (held[at]!.enabled) setChosen(at);
        }
      };
      pick.current = (id) => {
        if (!held) return;
        for (let at = 0; at < held.length; at += 1) held[at]!.enabled = at === id;
        setChosen(id);
      };
      /*
       * AND THE CAPTIONS, WHICH SAFARI PUTS ON `textTracks`.
       * The element draws them itself once a track's `mode` is
       * `showing`, which is the operating system's own renderer
       * rather than a second one in this file.
       */
      const texts = video.textTracks;
      const syncText = () => {
        const held = Array.from({ length: texts.length }, (_, at) => texts[at]!)
          .filter((one) => one.kind === 'subtitles' || one.kind === 'captions');
        setSubs(held.map((one, at) => ({
          id: at, label: one.label || one.language || 'Captions',
          language: one.language ?? '',
        })));
        setShowing(held.findIndex((one) => one.mode === 'showing'));
      };
      pickSub.current = (id) => {
        const held = Array.from({ length: texts.length }, (_, at) => texts[at]!)
          .filter((one) => one.kind === 'subtitles' || one.kind === 'captions');
        held.forEach((one, at) => { one.mode = at === id ? 'showing' : 'disabled'; });
        setShowing(id);
      };
      texts.addEventListener?.('addtrack', syncText);
      video.addEventListener('loadedmetadata', sync);
      video.addEventListener('loadedmetadata', syncText);
      destroy = () => {
        video.removeEventListener('loadedmetadata', sync);
        video.removeEventListener('loadedmetadata', syncText);
        texts.removeEventListener?.('addtrack', syncText);
      };
      setReady(true);
    } else {
      void (async () => {
        try {
          const { default: Hls } = await import('hls.js');
          if (cancelled) return;
          if (!Hls.isSupported()) {
            setError('This browser cannot play the channel.');
            return;
          }
          const hls = new Hls({
            /*
             * A live window of six four-second segments (playout.ts). Asking
             * to start three from the end is asking to start at the edge
             * with one segment of slack, which is what a channel wants: any
             * more is a viewer watching the past, any less is a viewer
             * stalling on every hiccup.
             */
            liveSyncDurationCount: 3,
            lowLatencyMode: false,
            enableWorker: true,
            /*
             * `hls.js` RENDERS THE CUES ITSELF, into the
             * element's own text tracks. Left off, a channel's
             * captions would be fetched, parsed and never
             * drawn — which is the one failure a viewer reads
             * as *this product has no captions*.
             */
            enableWebVTT: true,
            renderTextTracksNatively: true,
          });
          /*
           * THE MASTER WHERE THERE IS ONE. `hls.js` reads a
           * master and a media playlist through the same door,
           * so this is a URL choice and not a second code path.
           */
          const answer = await fetch(master).catch(() => null);
          if (cancelled) { hls.destroy(); return; }
          hls.loadSource(answer?.ok ? master : url);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setReady(true);
            /*
             * `audioTracks` IS EMPTY ON A MEDIA PLAYLIST, which
             * is the common case and needs no branch: no
             * renditions, no picker.
             */
            const held = hls.audioTracks;
            if (held.length > 1) {
              setTracks(held.map((one, at) => ({
                id: at,
                label: one.name || one.lang || `Track ${at + 1}`,
                language: one.lang ?? '',
              })));
              setChosen(hls.audioTrack);
            }
            /*
             * ONE CAPTION TRACK IS STILL A CHOICE, unlike one
             * audio track. The question a subtitle control
             * answers is *do you want words*, which has two
             * answers however many languages there are — so
             * `> 0` here where the audio above wants `> 1`.
             * [D-04]
             */
            /*
             * THE LADDER, IF THERE IS ONE. `levels` holds one
             * entry for a master with a single variant, which
             * is not a choice — the same `> 1` rule the audio
             * picker uses, and for the same reason. [D-21]
             */
            if (hls.levels.length > 1) {
              setLevels(hls.levels.map((one, at) => ({
                id: at,
                label: one.height ? `${one.height}p` : `${Math.round(
                  (one.bitrate ?? 0) / 1000)}k`,
                language: '',
              })));
              /* Auto, until somebody says otherwise. */
              setLevel(hls.autoLevelEnabled ? -1 : hls.currentLevel);
            }
            const words = hls.subtitleTracks;
            if (words.length > 0) {
              setSubs(words.map((one, at) => ({
                id: at,
                label: one.name || one.lang || `Captions ${at + 1}`,
                language: one.lang ?? '',
              })));
              /* Off until somebody asks. [D-21] */
              hls.subtitleDisplay = false;
              hls.subtitleTrack = -1;
              setShowing(-1);
            }
          });
          hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => {
            setChosen(hls.audioTrack);
          });
          hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, () => {
            setShowing(hls.subtitleTrack);
          });
          /*
           * THE MENU FOLLOWS THE MEASUREMENT. On Auto the
           * player moves between rungs by itself, and a
           * control that went on saying *720p* while the
           * stream had stepped down would be a control that
           * lies about what you are watching. [D-21]
           */
          hls.on(Hls.Events.LEVEL_SWITCHED, () => {
            setLevel(hls.autoLevelEnabled ? -1 : hls.currentLevel);
          });
          pick.current = (id) => { hls.audioTrack = id; };
          pickLevel.current = (id) => {
            hls.currentLevel = id;
            setLevel(id);
          };
          pickSub.current = (id) => {
            hls.subtitleDisplay = id >= 0;
            hls.subtitleTrack = id;
          };
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;
            /*
             * A fatal network or media error on a LIVE stream is usually the
             * channel between segments, not the end of it — so it recovers
             * rather than giving up, which is what the playout engine's own
             * black-segment fallback assumes the viewer will do. [§11, §9]
             */
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
            else { hls.destroy(); setError('The channel could not be loaded.'); }
          });
          destroy = () => hls.destroy();
        } catch {
          if (!cancelled) setError('The channel could not be loaded.');
        }
      })();
    }

    /* Back to the edge, whenever it has drifted off it. */
    const chase = setInterval(() => {
      if (!video.duration || Number.isNaN(video.duration)) return;
      const end = video.seekable.length > 0
        ? video.seekable.end(video.seekable.length - 1) : video.duration;
      if (end - video.currentTime > DRIFT_S) video.currentTime = end - 1;
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(chase);
      destroy?.();
    };
  }, [channelId]);

  /*
   * HANDED OUT RATHER THAN DRAWN HERE. This component is the
   * picture and the transport; WHERE a language picker belongs
   * is a question about the page around it — the station page
   * puts it in the bar under the picture, and the control
   * room's confidence monitor must not grow one at all. [§18,
   * D-19]
   */
  useEffect(() => {
    onAudio?.({ tracks, chosen, pick: (id: number) => pick.current(id) });
  }, [onAudio, tracks, chosen]);

  useEffect(() => {
    onSubtitles?.({
      tracks: subs, chosen: showing, pick: (id: number) => pickSub.current(id),
    });
  }, [onSubtitles, subs, showing]);

  useEffect(() => {
    onQuality?.({
      tracks: levels, chosen: level, pick: (id: number) => pickLevel.current(id),
    });
  }, [onQuality, levels, level]);

  return (
    <>
      {/*
        * THE PICTURE AND ITS TRANSPORT ARE ONE OBJECT, which is why
        * the bar is inside the bordered frame rather than under it:
        * the native control bar was drawn over the bottom of the
        * picture and this replaces it in the same place, seated on
        * the frame's own bottom edge.
        */}
      <div style={{
        border: 'var(--border) solid var(--line)',
        borderRadius: 'var(--radius-screen)', overflow: 'hidden',
        background: 'var(--screen-bed)',
      }}>
        <video
          /*
            * THE ELEMENT GOES INTO STATE AS WELL AS INTO THE REF.
            * The transport is a sibling that needs the element as a
            * prop, and a ref read during render is `null` on the
            * first pass — so a transport handed `videoRef.current`
            * only wakes up if something else happens to re-render
            * the page afterwards.
            */
          ref={(element) => {
            videoRef.current = element;
            setVideo(element);
            onVideo?.(element);
          }}
          data-testid="channel-player"
          autoPlay playsInline muted
          {...(poster ? { poster } : {})}
          style={{
            width: '100%', aspectRatio: '16 / 9', borderRadius: 0,
            background: 'var(--screen-bed)', border: 0, display: 'block',
          }}
        />
        {/* A channel has no end, so: a clock and no scrub. The LIVE
            badge is a separate fact and comes from the server. */}
        {!compact && <VideoTransport video={video} continuous onAir={onAir} />}
      </div>
      {!compact && error && (
        <p className="small" data-testid="player-error"
           style={{ color: 'var(--bad)', marginTop: 8 }}>
          {error}
        </p>
      )}
      {!compact && !ready && !error && (
        <p className="small muted" data-testid="player-waiting"
           style={{ marginTop: 8 }}>
          {/* Honest about which of the two it is. A channel whose engine is
              not running has segments nobody is writing, and "loading" for
              ever is the least useful thing a page can say. */}
          Tuning in&hellip; if this does not start, the channel&rsquo;s playout
          engine may not be running.
        </p>
      )}
    </>
  );
}
