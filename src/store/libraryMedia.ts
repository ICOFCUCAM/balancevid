/**
 * What the library can hold, in one table.
 * [Doctrine CHANNEL §3, §25, C-14; D-18, D-19]
 *
 * *"A song should simply be a Library media item with title, artist/owner,
 *  duration, audio/video type, thumbnail/artwork if available."*
 *
 * IT COULD NOT HOLD ONE. Three places each knew their own list of
 * containers and all three knew the same three: the upload route accepted
 * pictures and video, the serving route tried `png`, then `jpg`, then
 * `mp4`, and the playout resolver returned `mp4` for anything that was not
 * a still. A song went in as an `.m4a` and came back out of the studio's
 * own monitor as **MEDIA_ELEMENT_ERROR: Format error**, because the file
 * being served was an `.mp4` that did not exist.
 *
 * THE LISTS WERE NOT WRONG, THERE WERE THREE OF THEM. Which is the same
 * fault D-19 is about, and the fix is the same: one table, and the three
 * callers read it. Adding a container is now one line rather than three
 * edits, two of which would be found by a person discovering that a song
 * plays in the picker and is black on the air.
 */

import { existsSync } from 'node:fs';

import { paths } from './paths.js';

export interface Container {
  /** As it is stored on disk, and as `paths.libraryMedia` wants it. */
  ext: string;
  /** What to serve it as. A browser trusts this and will not sniff past it. */
  type: string;
  /**
   * A picture, which has no duration of its own and is held for its slot.
   * [§3's `stillMs`]
   */
  still: boolean;
}

/**
 * IN THE ORDER THEY ARE LOOKED FOR, and the order is not arbitrary.
 *
 * PNG before JPEG because a slide is type: a deck's pages are rasterised
 * to PNG (§20) and a photograph uploaded as an ident is a JPEG, and
 * guessing wrong puts a caption card on air as black. MP4 before the
 * sounds because almost everything here moves, and the first `existsSync`
 * that hits is the last one run.
 */
export const CONTAINERS: readonly Container[] = [
  { ext: 'png', type: 'image/png', still: true },
  { ext: 'jpg', type: 'image/jpeg', still: true },
  /*
   * AND WEBP, WHICH AN UPLOAD COULD ALREADY SEND AND NOTHING COULD
   * STORE HONESTLY. The upload route accepted `image/webp` and wrote
   * the bytes to a `.jpg`, because `.jpg` was the only still this
   * table had room for — which is the fault this file's own opening
   * paragraph is about, committed against it. [C-48]
   */
  { ext: 'webp', type: 'image/webp', still: true },
  { ext: 'mp4', type: 'video/mp4', still: false },
  /*
   * AND THE SOUNDS. An `.m4a` is an MP4 with no picture in it, which is
   * why it is served as `audio/mp4` and not as `video/mp4`: the container
   * is the same and what the browser does with it is not.
   */
  { ext: 'm4a', type: 'audio/mp4', still: false },
  { ext: 'mp3', type: 'audio/mpeg', still: false },
  { ext: 'ogg', type: 'audio/ogg', still: false },
  { ext: 'wav', type: 'audio/wav', still: false },
  { ext: 'flac', type: 'audio/flac', still: false },
  /*
   * AND THE TWO OTHER MOVING CONTAINERS AN UPLOAD COULD SEND.
   *
   * `video/webm` and `video/quicktime` were accepted and written to
   * `.mp4`, and *nothing is transcoded here* — the route says so in
   * its own opening paragraph. So the bytes were WebM and the name
   * said MP4, and the serving route then told the browser
   * `video/mp4` about them. ffmpeg sniffs and never noticed; a
   * `<video>` element is the one that does. The same fault as the
   * `.mp3` stored as `.mp4` this table was extracted to fix, in the
   * two formats nobody checked. [C-14, C-48]
   */
  { ext: 'webm', type: 'video/webm', still: false },
  { ext: 'mov', type: 'video/quicktime', still: false },
];

/** The container a stored filename is, or nothing if it is not one. */
export function containerOf(name: string): Container | undefined {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return undefined;
  const ext = name.slice(dot + 1).toLowerCase();
  return CONTAINERS.find((one) => one.ext === ext);
}

/** Is this stored filename a picture? Used where only that matters. */
export function isStill(name: string): boolean {
  return containerOf(name)?.still ?? false;
}

/**
 * Which file an asset id actually is.
 *
 * SYNCHRONOUSLY, deliberately, and for the reason `playoutSources` already
 * gives about the pair it replaced: this is the one place a reference
 * becomes a path, and the playout engine calls it inside the loop that
 * keeps the stream ahead of the playhead. Making it async to save a
 * handful of `existsSync` calls would turn every caller in that loop into
 * an await.
 */
export function libraryFile(
  assetId: string, { moving }: { moving?: boolean } = {},
): { path: string; container: Container } | null {
  for (const container of CONTAINERS) {
    if (moving !== undefined && container.still === moving) continue;
    const path = paths.libraryMedia(assetId, container.ext);
    if (existsSync(path)) return { path, container };
  }
  return null;
}


