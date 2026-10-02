/**
 * What the library will take IN.
 *   [Doctrine CHANNEL §3, §25, D-14, D-19, C-14, C-48]
 *
 * IN THE DOMAIN AND NOT THE STORE, which is the one thing that
 * decides where this can be read. `libraryMedia.ts` holds the
 * containers and imports `node:fs` to find them, so a page that
 * imported it for this table dragged the filesystem into the
 * browser bundle and the build said so. [D-14]
 *
 * And this is not a question about the filesystem. It is a
 * question about a MIME type, answered identically on both sides
 * of the wire, which is exactly what belongs here.
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

/**
 * WHAT AN UPLOAD MAY BE, by the type the browser declares.
 *
 * THE FOURTH LIST. C-14 found three places each knowing their own
 * containers and made them one table — the one above. This is the
 * question that table does not answer: not *what is this file on
 * disk* but *may this file become one*, and it lived as a private
 * `KINDS` inside the upload route, where the only other thing that
 * needs it — the picker that decides which files a person is even
 * offered — could not read it.
 *
 * So the picker did not read it. There was no picker: the route has
 * never been called by any surface in this product. The first one
 * built would have typed the list a second time and the two would
 * have drifted, which is the whole of C-14 happening again on the
 * way in.
 *
 * AND IT STORED A PNG AS A `.jpg`. Every still mapped to `jpg`
 * because that was the only still the table above had, so a
 * rasterised page went in as PNG bytes under a name claiming JPEG —
 * *"a file whose name lies to every reader of it"*, in this file's
 * own words about the sound it had just fixed. A deck's own pages
 * are written as `.png` by `decks.ts` and read back correctly; only
 * the ones a person uploaded were renamed.
 */
export interface Accepted {
  /** The container it is stored as — a name that tells the truth. */
  ext: string;
  /** What a `ProgrammeSource` can say about it today. */
  form: 'image' | 'video';
}

export const ACCEPTS: Readonly<Record<string, Accepted>> = {
  'image/jpeg': { ext: 'jpg', form: 'image' },
  'image/png': { ext: 'png', form: 'image' },
  'image/webp': { ext: 'webp', form: 'image' },
  'video/mp4': { ext: 'mp4', form: 'video' },
  'video/webm': { ext: 'webm', form: 'video' },
  'video/quicktime': { ext: 'mov', form: 'video' },
  /*
   * THE SOUNDS keep their own containers, which is C-14's finding:
   * an `.mp3` stored as `.mp4` is a file that lies. `form` stays
   * `video` because that is what a `ProgrammeSource` can say today;
   * what an audio item LOOKS like on air is the channel's visual
   * treatment, and that is still to build. [§25]
   */
  'audio/mpeg': { ext: 'mp3', form: 'video' },
  'audio/mp4': { ext: 'm4a', form: 'video' },
  'audio/x-m4a': { ext: 'm4a', form: 'video' },
  'audio/aac': { ext: 'm4a', form: 'video' },
  'audio/ogg': { ext: 'ogg', form: 'video' },
  'audio/wav': { ext: 'wav', form: 'video' },
  'audio/x-wav': { ext: 'wav', form: 'video' },
  'audio/flac': { ext: 'flac', form: 'video' },
  'audio/x-flac': { ext: 'flac', form: 'video' },
};

/**
 * The same list, as a file picker's `accept` attribute.
 *
 * SO THE PICKER CANNOT OFFER WHAT THE SERVER WILL REFUSE. An
 * `accept` typed by hand beside a server allow-list is two lists
 * again, and the way it fails is the worst available: a person
 * chooses a file the dialog showed them, waits for it to go up, and
 * is told 415.
 */
export function acceptsAttribute(): string {
  return Object.keys(ACCEPTS).join(',');
}

/**
 * Big enough for an ident, a caption card or a song; not for a film.
 *
 * SAID ON THE CONTROL, NOT ONLY ENFORCED AT THE SERVER. A cap a
 * person meets by waiting out an upload and then being refused is a
 * cap that was never communicated. Films arrive from the studios as
 * renders and are referenced, never copied (§3, D-18).
 */
export const MOST_UPLOAD_BYTES = 64 * 1024 * 1024;
