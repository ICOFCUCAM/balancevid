'use client';

import { useCallback, useState } from 'react';

/**
 * A frame, or honestly nothing.
 *   [U-19, D-19]
 *
 * A POSTER CAN BE MISSING FOR REASONS THAT SAY NOTHING ABOUT THE WORK: a
 * take that has not been assembled yet, a render swept off the disk, a
 * conversation made before posters existed. What must never happen is the
 * browser's own broken-image glyph, which reads as "your recording is
 * damaged" — a lie the product would be telling about somebody's own
 * material.
 *
 * SO IT RENDERS NOTHING, and the well behind it stays a well.
 *
 * IT LIVED INSIDE `Workspace.tsx` AND THE ROOMS DID NOT HAVE IT. The
 * first browser run of the performance room showed a column of broken
 * images down the whole list, because `RoomList` had written its own
 * `<img>` with no `onError` — the exact fault this component was written
 * to prevent, reintroduced two hundred lines away from the fix. One
 * definition, in one file, used by both. [D-19]
 */
export default function Still({ src }: { src: string | null }) {
  const [broken, setBroken] = useState(false);
  /*
   * A CACHED 404 NEVER FIRES `onError`. The image is already complete by
   * the time React attaches the handler, so the callback ref checks the
   * decoded width the moment the node exists — which is the only way to
   * catch the second visit to a page whose posters are gone.
   */
  const check = useCallback((node: HTMLImageElement | null) => {
    if (node && node.complete && node.naturalWidth === 0) setBroken(true);
  }, []);
  if (!src || broken) return null;
  return (
    <img alt="" src={src} ref={check} onError={() => setBroken(true)} style={{
      width: '100%', height: '100%', objectFit: 'cover', display: 'block',
    }} />
  );
}
