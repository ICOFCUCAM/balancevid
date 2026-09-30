'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Whatever is on the presenter's screen, as a stream.
 *   [CHANNEL §22, §6; STUDIO-ONE §2D; D-19]
 *
 * THIS LIVED IN `app/t/[id]/` AND HAD NO OPINION ABOUT ONLINE TV.
 * It was written for the channel's mixer, and when Studio One needed
 * *"the user opens a website, presentation, news article, software
 * demonstration, social-media post"* and records it, the honest reading
 * of the file was that it already did that — every line of it is about
 * `getDisplayMedia` and none about broadcasting. So it moved up a folder
 * rather than being copied down, which is the author's own rule: *"don't
 * create separate systems for these features."*
 *
 * ONLINE TV MIXES IT LIVE; STUDIO ONE RECORDS IT AS A SOURCE. Two uses,
 * one answer to "what happens when somebody presses Chrome's own stop
 * sharing button" — which is exactly the thing that would have drifted.
 *
 *     a browser tab  →  getDisplayMedia  →  the canvas mixer  →  the wire
 *
 * WHY THIS IS THE ANSWER AND A SERVER-SIDE BROWSER IS NOT. "The internet
 * should open and connect live for others to see" has two possible
 * implementations. One runs a headless browser in the playout engine and
 * screencasts it into the segments: that means a second browser nobody can
 * see, driven by a control surface nobody has built, signed into nothing —
 * so the pages worth showing, the ones behind a login, are exactly the ones
 * it cannot open. The other shares the browser the presenter is already
 * using, where they are already signed in and already know how to navigate.
 *
 * The second is what every broadcaster does, and it is thirty lines,
 * because the mixer already composes an arbitrary number of arbitrary
 * streams (`useBroadcastMixer`) and a display capture is just another
 * `MediaStream`. It is not only the web: a slide deck open in another
 * application, a spreadsheet, a map, a terminal — anything on the
 * presenter's screen.
 *
 * IT IS A MIXER SOURCE, NOT A ROLL-IN. A rolled-in reference REPLACES the
 * live feed with a file (§5). A shared screen is part of the picture: the
 * presenter stays in frame beside it, which is the whole point of showing
 * somebody a web page while you talk about it. So it goes in as a source
 * and the layout table arranges it, exactly as another guest would be.
 *
 * THE BROWSER OWNS THE PICKER. There is no list of tabs here and there
 * cannot be: which window is shared is a decision the browser takes from
 * the person, outside the page, and that is a security property rather than
 * a limitation. This asks; Chrome answers.
 */

export interface ScreenShare {
  stream: MediaStream | null;
  /** What the browser says is being shared, when it says anything. */
  label: string | null;
  sharing: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

export function useScreenShare(): ScreenShare {
  const held = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    for (const track of held.current?.getTracks() ?? []) track.stop();
    held.current = null;
    setStream(null);
    setLabel(null);
  }, []);

  /* A share is never left running by a page that has gone away. */
  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    setError(null);
    try {
      /*
       * Audio is asked for and not required. Chrome offers tab audio and
       * Firefox does not; a page being demonstrated is usually silent, and
       * failing the whole share because the browser would not give a track
       * nobody needed would be refusing to show a web page over a detail.
       */
      const media = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: true,
      });
      held.current = media;
      setStream(media);
      setLabel(media.getVideoTracks()[0]?.label ?? 'Shared screen');

      /*
       * THE BROWSER'S OWN "STOP SHARING" IS THE REAL CONTROL. Chrome puts a
       * bar at the bottom of the screen and people use it; a studio that
       * only noticed when its own button was pressed would keep a dead
       * black rectangle in the mix.
       */
      const track = media.getVideoTracks()[0];
      if (track) track.addEventListener('ended', () => stop());
    } catch (e) {
      /*
       * Dismissing the picker is not an error. It is somebody deciding not
       * to share, and a red message for it teaches people to distrust red
       * messages.
       */
      const name = (e as { name?: string }).name;
      if (name === 'NotAllowedError' || name === 'AbortError') return;
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [stop]);

  return { stream, label, sharing: Boolean(stream), error, start, stop };
}
