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
   * AND THE REST OF THE WORLD'S PHONES.  [D-03, U-02, §25]
   *
   * THREE VIDEO CONTAINERS WAS A LIST OF WHAT A LAPTOP RECORDS.
   * `src/render/ingest.ts` puts every upload through ffmpeg and out
   * the other side as H.264/AAC at the house rate, and the ffmpeg
   * this product ships decodes HEVC, H.263, MPEG-2, MPEG-4 part 2,
   * VP8, VP9, AV1, Theora, ProRes and VC-1 out of mov, mp4, 3gp,
   * 3g2, Matroska, AVI, Ogg and ASF. The engine was ready; the door
   * was three types wide — the same finding `sources.ts` records
   * about `video/*`, one floor down.
   *
   * WHAT IT COST, said concretely rather than as a worry: a phone
   * that writes `.3gp` is most of the phones in the markets this
   * product is for, and its owner met *"that is not a picture, a
   * video or a song this can hold"* — about a video.
   *
   * EVERY LINE BELOW WAS INGESTED BEFORE IT WAS WRITTEN. A fixture
   * per container went through the real `ingest()` and came out in
   * house format; a type nobody had put through is a type this
   * product only believes it supports. [U-02]
   */
  'video/3gpp': { ext: '3gp', form: 'video' },
  'video/3gpp2': { ext: '3g2', form: 'video' },
  'video/x-matroska': { ext: 'mkv', form: 'video' },
  'video/x-msvideo': { ext: 'avi', form: 'video' },
  /* What some Android pickers and older servers call the same thing. */
  'video/avi': { ext: 'avi', form: 'video' },
  'video/msvideo': { ext: 'avi', form: 'video' },
  'video/x-m4v': { ext: 'm4v', form: 'video' },
  'video/mpeg': { ext: 'mpg', form: 'video' },
  'video/ogg': { ext: 'ogv', form: 'video' },
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
  /*
   * A VOICE NOTE FROM A CHEAP HANDSET. AMR is what a low-end
   * Android recorder writes, and both narrowband and wideband
   * decode here — a `.amr` comes out as a black 1280x720 picture
   * with the voice on it, which is what `ingest` does for anything
   * with no video stream. Measured, like the rest. [§25]
   */
  'audio/amr': { ext: 'amr', form: 'video' },
  'audio/3gpp': { ext: '3gp', form: 'video' },
};

/**
 * THE SAME TABLE, ASKED BY FILE NAME.  [U-02, D-21]
 *
 * NOT A SECOND LIST — derived from the one above, so it cannot
 * drift from it. C-14's whole finding was three places each knowing
 * their own containers; a hand-typed extension table beside the
 * MIME table would be that again.
 *
 * Where the first key wins: `video/avi` and `video/x-msvideo` both
 * say `avi`, and either is a correct answer to "what is an .avi".
 */
const BY_EXTENSION: Readonly<Record<string, Accepted>> = Object.freeze(
  Object.fromEntries(
    Object.values(ACCEPTS).map((one) => [one.ext, one]).reverse(),
  ) as Record<string, Accepted>,
);

/**
 * The declared types that are not a claim about anything.
 *
 * ANDROID'S FILE PICKER SAYS THIS ABOUT REAL VIDEOS, routinely —
 * for a file on an SD card, one saved by a messaging app, or
 * anything outside MediaStore's index. The browser is not claiming
 * the file is binary; it is declining to say what it is, and
 * refusing a video because the picker shrugged is refusing it for
 * the phone's filing habits.
 */
const SAYS_NOTHING = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

/**
 * May this file become a library item?
 *
 * THE TYPE FIRST AND THE NAME ONLY IF THE TYPE SAID NOTHING, which
 * is the narrow version of this on purpose. A browser that declares
 * `image/gif` has made a positive claim and this refuses it; one
 * that declares `application/octet-stream` has made none, and the
 * name is then the only evidence there is.
 *
 * It is not a wider hole than it looks. The extension decides the
 * container this is STORED as, and `ingest` still has to read the
 * bytes — a file called `.mp4` that is not one fails there, with a
 * sentence about the file rather than a silent 415 about its name.
 */
export function accepted(
  type: string | null | undefined,
  filename?: string | null,
): Accepted | undefined {
  const mime = (type ?? '').split(';')[0]!.trim().toLowerCase();
  const byType = ACCEPTS[mime];
  if (byType) return byType;
  if (!SAYS_NOTHING.has(mime)) return undefined;
  const dot = (filename ?? '').toLowerCase().trim().lastIndexOf('.');
  if (dot < 0) return undefined;
  return BY_EXTENSION[(filename ?? '').toLowerCase().trim().slice(dot + 1)];
}

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
  /*
   * AND THE EXTENSIONS BESIDE THEM, because `accept` is matched
   * against what the PICKER believes a file is, and the pickers
   * that get this wrong are exactly the ones `SAYS_NOTHING` is
   * about. A phone that cannot name its own `.3gp` hides it from a
   * dialog listing MIME types only, and the person concludes the
   * file is gone rather than unoffered. Listing both is what the
   * attribute is for.
   */
  return [
    ...Object.keys(ACCEPTS),
    ...Object.values(ACCEPTS).map((one) => `.${one.ext}`),
  ].filter((one, at, all) => all.indexOf(one) === at).join(',');
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
