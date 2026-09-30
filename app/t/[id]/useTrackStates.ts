'use client';

import { useEffect, useState } from 'react';

/**
 * Is anything actually arriving?  [Doctrine CHANNEL §24, C-14; U-19]
 *
 * A `MediaStream` in a list is not a picture. A guest who turned their
 * camera off, a guest whose phone went to sleep, a guest on a train losing
 * packets — all three keep their entry in the mixer's list, and the tile
 * that drew them would keep drawing the last frame or nothing at all while
 * saying LIVE underneath it. A multi-view that does that is worse than no
 * multi-view, because an operator trusts it.
 *
 * WHAT THE BROWSER WILL TELL YOU, and it is less than you would like:
 *
 *   the track EXISTS          — the far end has a camera and offered it
 *   the track is `muted`      — it exists and is delivering nothing
 *   the track `ended`         — it is over and will not come back
 *
 * `muted` is the browser's word and it is a bad one: it does NOT mean the
 * person pressed mute. It means no media is flowing, whether because the
 * far end disabled the track or because the connection has starved. Nothing
 * in a browser can tell those apart from this end, so the grid says
 * `NO VIDEO` — what the operator can see — rather than guessing why.
 *
 * AND IT IS AN EVENT, NOT A POLL. The three events below fire the moment
 * media stops and the moment it comes back, so a tile goes dark within a
 * frame of the picture doing so rather than within the next render React
 * happened to schedule.
 */

export interface TrackState {
  hasVideo: boolean;
  /** A video track that exists and is delivering nothing. */
  videoDark: boolean;
  hasAudio: boolean;
  audioDark: boolean;
}

export const NO_TRACKS: TrackState = {
  hasVideo: false, videoDark: false, hasAudio: false, audioDark: false,
};

function readStream(stream: MediaStream): TrackState {
  const video = stream.getVideoTracks()[0];
  const audio = stream.getAudioTracks()[0];
  return {
    hasVideo: Boolean(video && video.readyState === 'live'),
    /*
     * `enabled` is this end's own switch and `muted` is the far end's
     * silence. Both mean the same thing to somebody looking at a monitor:
     * there is a track and there is no picture.
     */
    videoDark: Boolean(video && (video.muted || !video.enabled)),
    hasAudio: Boolean(audio && audio.readyState === 'live'),
    audioDark: Boolean(audio && (audio.muted || !audio.enabled)),
  };
}

export function useTrackStates(
  sources: readonly { id: string; stream: MediaStream }[],
  enabled: boolean,
): Record<string, TrackState> {
  const [states, setStates] = useState<Record<string, TrackState>>({});

  /*
   * The stream identities are what this depends on, not the array — the
   * sources list is rebuilt on every render of the studio and re-subscribing
   * four peers twenty times a second would cost more than the meters do.
   */
  const key = sources.map((one) => `${one.id}:${one.stream.id}`).join(',');

  useEffect(() => {
    if (!enabled) { setStates({}); return; }

    const read = () => {
      const next: Record<string, TrackState> = {};
      for (const one of sources) next[one.id] = readStream(one.stream);
      setStates(next);
    };
    read();

    const off: (() => void)[] = [];
    for (const one of sources) {
      const watch = (target: MediaStreamTrack | MediaStream, event: string) => {
        target.addEventListener(event, read);
        off.push(() => target.removeEventListener(event, read));
      };
      for (const track of one.stream.getTracks()) {
        watch(track, 'mute');
        watch(track, 'unmute');
        watch(track, 'ended');
      }
      /* A camera switched on mid-call arrives as a new track on the same
         stream, which is not a `mute` on anything already being watched. */
      watch(one.stream, 'addtrack');
      watch(one.stream, 'removetrack');
    }
    return () => { for (const stop of off) stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return states;
}
