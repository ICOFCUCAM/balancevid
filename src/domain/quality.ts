/**
 * How good the picture is, and who decides.  [Doctrine CHANNEL §7, §23, U-23, D-19]
 *
 * THE COMPLAINT THAT PRODUCED THIS. An operator watched the feed meter read
 * `62 kB/s` and asked, reasonably, whether that was all the product could do.
 * It was not — 62 kB/s was what a static test picture compresses to, and the
 * ceiling was already 2.5 Mbps — but the question underneath it was right:
 * THERE WAS NO WAY TO ASK FOR MORE. Three separate files each hard-coded a
 * number, none of them was reachable from the studio, and a broadcaster with
 * a cinema camera and a gigabit uplink got exactly the same 720p as a laptop
 * on a train.
 *
 * FOUR NUMBERS THAT MUST MOVE TOGETHER, which is the whole reason this is one
 * table rather than four settings:
 *
 *   the CAMERA is asked for a size            (getUserMedia constraints)
 *   the MIXER composites onto a canvas        (useBroadcastMixer)
 *   the ENCODER records that canvas           (useLiveEncoder)
 *   the ENGINE re-encodes onto the wire       (playout/segment.ts)
 *
 * Raise the camera alone and the mixer throws the detail away, because the
 * encoder records the CANVAS and never sees the camera. Raise the canvas
 * alone and a 2.5 Mbps ceiling smears it. Raise the bitrate alone and you
 * spend bandwidth describing 720p very precisely. Every one of those is a
 * setting that appears to work and does nothing, so there are no four
 * settings: there is a preset, and a preset moves all of them.
 *
 * WHY THE CHOICE LIVES ON THE MACHINE AND NOT IN THE CHANNEL. What a preset
 * really asks about is the camera in the room and the upstream bandwidth of
 * the building — properties of WHERE SOMEBODY IS SITTING, not of the channel.
 * The same channel broadcast from a studio and from a hotel wants two
 * different answers, and a per-channel setting would make the second person
 * quietly ruin the first person's show. So this is stored per browser.
 *
 * TWO PRESETS, NOT ONE, and they are different questions:
 *
 *   INGEST  — what this machine captures, mixes, encodes and sends up. Chosen
 *             by whoever is broadcasting, on their own machine.
 *   STREAM  — what the channel transmits to everybody. One answer for the
 *             whole channel, set for the deployment, because it is the
 *             viewers' bandwidth being spent and not the operator's.
 *
 * AND INGEST ABOVE STREAM IS NOT WASTED, which is the non-obvious part. The
 * engine re-encodes every piece to the house format (segment.ts), so a 1080p
 * ingest reaches viewers at whatever the channel transmits. But the ingest
 * file IS THE ARCHIVE — `channelLiveBuffer` is the webm that gets promoted
 * into `assets/` when a live session is kept (INV-17). Recording at 1080p
 * while transmitting at 720p is how broadcast has always worked: you keep the
 * good copy.
 */

export type QualityId = 'low' | 'standard' | 'high' | 'maximum';

export interface Quality {
  id: QualityId;
  label: string;
  width: number;
  height: number;
  fps: number;
  /** Video bits per second, as MediaRecorder wants it. */
  videoBitsPerSecond: number;
  audioBitsPerSecond: number;
  /** What this asks of the machine and the line, in one line, for the menu. */
  needs: string;
}

/**
 * The range.
 *
 * `standard` is EXACTLY what every one of the four places did before this
 * table existed — 1280×720, 30 fps, 2500k, 128k — so the default changes
 * nothing for anybody who never opens the menu. That is deliberate: a
 * quality control that silently re-tunes a working broadcast on upgrade is a
 * regression wearing a feature's clothes.
 *
 * The steps are roughly a doubling of pixels-per-second each time, and the
 * bitrates follow at the ratios a VP8/H.264 encoder actually needs rather
 * than at the ratio of the pixel counts — compression efficiency improves
 * with resolution, so 4× the pixels does not want 4× the bits.
 */
export const QUALITIES: Record<QualityId, Quality> = {
  low: {
    id: 'low',
    label: 'Low — 360p',
    width: 640,
    height: 360,
    fps: 24,
    videoBitsPerSecond: 600_000,
    audioBitsPerSecond: 64_000,
    needs: 'For a weak connection or mobile data. About 83 kB/s up.',
  },
  standard: {
    id: 'standard',
    label: 'Standard — 720p',
    width: 1280,
    height: 720,
    fps: 30,
    videoBitsPerSecond: 2_500_000,
    audioBitsPerSecond: 128_000,
    needs: 'Broadcast default. About 330 kB/s up on ordinary home broadband.',
  },
  high: {
    id: 'high',
    label: 'High — 1080p',
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitsPerSecond: 6_000_000,
    audioBitsPerSecond: 160_000,
    needs: 'For a good camera and a solid line. About 770 kB/s up.',
  },
  maximum: {
    id: 'maximum',
    label: 'Maximum — 1080p60',
    width: 1920,
    height: 1080,
    fps: 60,
    videoBitsPerSecond: 12_000_000,
    audioBitsPerSecond: 192_000,
    /*
     * The CPU warning is not decoration. The mixer composites every frame in
     * JavaScript, so 60 fps is twice the compositing work as well as twice
     * the encoding, and a laptop that cannot keep up does not fail — it
     * silently drops frames, which looks like a bad connection.
     */
    needs: 'Sport and music. Needs a fast machine: about 1.5 MB/s up.',
  },
};

export const DEFAULT_QUALITY: QualityId = 'standard';

/** The menu, worst to best, which is the order a range adjuster runs in. */
export const QUALITY_ORDER: QualityId[] = ['low', 'standard', 'high', 'maximum'];

/**
 * A stored or typed id, resolved to a real one.
 *
 * Never throws and never returns undefined: this is read from localStorage
 * and from an environment variable, and a broadcast that refuses to start
 * because a preference file holds an old word is a worse outcome than a
 * broadcast at the default.
 */
export function qualityFor(id: string | null | undefined): Quality {
  /*
   * `hasOwn` rather than a truthiness check on the lookup: a plain object
   * indexed by an arbitrary string answers for `constructor` and `toString`
   * as well as for the four real ids, and `QUALITIES['constructor']` is a
   * function that would then be read for a width.
   */
  return id && Object.hasOwn(QUALITIES, id)
    ? QUALITIES[id as QualityId]
    : QUALITIES[DEFAULT_QUALITY];
}

/**
 * What the feed meter should be reading when all is well.
 *
 * The meter shows bytes per second. Without this the number is unreadable:
 * `62 kB/s` is excellent for a still picture, catastrophic for a concert,
 * and identical on screen. Shown against a target it explains itself.
 */
export function targetBytesPerSecond(quality: Quality): number {
  return Math.round(
    (quality.videoBitsPerSecond + quality.audioBitsPerSecond) / 8);
}

/**
 * What the measured rate means.  [D-20]
 *
 * NOT A PERCENTAGE OF TARGET, because a video encoder is variable by design:
 * a presenter sitting still in front of a plain wall genuinely produces a
 * tenth of the target bitrate and there is nothing wrong. Only the top of
 * the range says anything — a feed pinned AT its ceiling is a feed that
 * wanted more than it was allowed, and that is the one case where raising
 * the preset would visibly help.
 *
 *   'starved'  nothing is arriving at all
 *   'easy'     well under the ceiling: the picture is not being limited
 *   'working'  using most of the range, which is what a busy shot looks like
 *   'capped'   at the ceiling, and the ceiling is what is costing detail
 */
export type RateVerdict = 'starved' | 'easy' | 'working' | 'capped';

export function rateVerdict(
  bytesPerSecond: number, quality: Quality,
): RateVerdict {
  const target = targetBytesPerSecond(quality);
  if (bytesPerSecond <= 0) return 'starved';
  if (bytesPerSecond >= target * 0.92) return 'capped';
  if (bytesPerSecond >= target * 0.6) return 'working';
  return 'easy';
}

/**
 * What to tell the operator about the number they are looking at.
 *
 * Written for somebody mid-broadcast: what it means, and whether there is
 * anything to do about it. 'easy' deliberately says the quiet part — a low
 * number is usually the picture being easy to compress, not a fault, and an
 * operator who does not know that spends the show worrying.
 */
export function rateSentence(
  bytesPerSecond: number, quality: Quality,
): string {
  const target = targetBytesPerSecond(quality);
  const kb = (bytes: number) => `${Math.round(bytes / 1000)} kB/s`;
  switch (rateVerdict(bytesPerSecond, quality)) {
    case 'starved':
      return 'Nothing is reaching the channel.';
    case 'capped':
      return `At the ${quality.label} ceiling (${kb(target)}). `
        + 'A higher setting would carry more detail.';
    case 'working':
      return `${kb(bytesPerSecond)} of ${kb(target)}. Using the range.`;
    default:
      return `${kb(bytesPerSecond)} of ${kb(target)}. `
        + 'A still picture compresses small — this is normal.';
  }
}

/**
 * Whether the ingest setting is above what the channel transmits.
 *
 * True is not a warning and the studio must not draw it as one: the extra
 * detail is kept in the archive even when viewers do not see it (INV-17).
 * It exists so the studio can say WHERE the extra quality goes, because an
 * operator who chose Maximum and then compared the monitor with their own
 * preview would otherwise conclude the setting did nothing.
 */
export function aboveTransmission(ingest: Quality, stream: Quality): boolean {
  return ingest.width * ingest.height * ingest.fps
    > stream.width * stream.height * stream.fps;
}

/** ffmpeg wants `2500k`, MediaRecorder wants `2500000`. One table, two forms. */
export function kbps(bitsPerSecond: number): string {
  return `${Math.round(bitsPerSecond / 1000)}k`;
}

/**
 * What the CHANNEL transmits, for the deployment.
 *
 * Per deployment rather than per channel, and this is a considered limit
 * rather than an oversight: every segment on the wire must have identical
 * codec parameters or players stall at the boundary (segment.ts), and the
 * playout engine encodes in real time — a deployment that let each channel
 * pick 1080p60 would discover its ffmpeg budget during somebody's broadcast.
 * When channels need their own answer it becomes a channel field and this
 * function becomes its default; until then one honest knob.
 */
export function streamQuality(
  env: Record<string, string | undefined> = process.env,
): Quality {
  return qualityFor(env['STREAM_QUALITY']);
}
