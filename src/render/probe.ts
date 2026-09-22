/**
 * Probing.  [Doctrine U-02]
 *
 * "duration probed and stored explicitly, never inferred." MediaRecorder WebM
 * in particular reports no reliable duration in its header, and trusting it is
 * how a render silently drifts.
 */

import { HOUSE_FPS, secondsToFrames, type Frames } from '../domain/time.js';
import { ffprobe } from './ffmpeg.js';

export interface MediaInfo {
  durationSeconds: number;
  durationFrames: Frames;
  width: number;
  height: number;
  fps: number;
  hasVideo: boolean;
  hasAudio: boolean;
  audioChannels: number;
  audioSampleRate: number;
  videoCodec?: string;
  audioCodec?: string;
}

export async function probe(path: string): Promise<MediaInfo> {
  const raw = await ffprobe([
    '-v', 'error', '-print_format', 'json',
    '-show_format', '-show_streams',
    // Counting frames is slower but exact. The product's promise is exactness.
    '-count_frames',
    path,
  ]);
  const json = JSON.parse(raw) as {
    format?: { duration?: string };
    streams?: Array<Record<string, unknown>>;
  };

  const streams = json.streams ?? [];
  const video = streams.find((s) => s['codec_type'] === 'video');
  const audio = streams.find((s) => s['codec_type'] === 'audio');

  const fps = video ? parseRational(String(video['avg_frame_rate'] ?? '0/0')) || HOUSE_FPS : HOUSE_FPS;

  // Prefer the counted frame total over the container's claimed duration.
  const counted = video ? Number(video['nb_read_frames'] ?? NaN) : NaN;
  const formatDuration = Number(json.format?.duration ?? NaN);
  const durationSeconds = Number.isFinite(counted) && counted > 0
    ? counted / fps
    : (Number.isFinite(formatDuration) ? formatDuration : 0);

  return {
    durationSeconds,
    durationFrames: Number.isFinite(counted) && counted > 0
      ? Math.round(counted)
      : secondsToFrames(durationSeconds, HOUSE_FPS),
    width: Number(video?.['width'] ?? 0),
    height: Number(video?.['height'] ?? 0),
    fps,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    audioChannels: Number(audio?.['channels'] ?? 0),
    audioSampleRate: Number(audio?.['sample_rate'] ?? 0),
    ...(video?.['codec_name'] ? { videoCodec: String(video['codec_name']) } : {}),
    ...(audio?.['codec_name'] ? { audioCodec: String(audio['codec_name']) } : {}),
  };
}

function parseRational(value: string): number {
  const [n, d] = value.split('/').map(Number);
  if (!n || !d) return 0;
  return n / d;
}

/**
 * Fast frame count, read from the container index rather than by decoding.
 *
 * `probe()` counts frames exactly, which means decoding the whole file -- fine
 * for a short take, far too slow to run after every render. This reads the
 * muxer's own tally, which is authoritative for the files we write ourselves.
 */
export async function probeFrameCount(path: string): Promise<number> {
  const raw = await ffprobe([
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=nb_frames', '-print_format', 'json', path,
  ]);
  const json = JSON.parse(raw) as { streams?: Array<{ nb_frames?: string }> };
  const n = Number(json.streams?.[0]?.nb_frames ?? NaN);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Duration by decoding.  [Doctrine U-02]
 *
 * MediaRecorder's WebM carries no reliable duration in its header, and its
 * frame rate is variable, so neither the container's claim nor a frame count
 * divided by a nominal rate can be trusted. Decoding to null and reading how
 * far ffmpeg actually got is the only honest measurement for a captured
 * segment -- and getting it wrong misplaces the pre-roll trim, which would
 * cut into the user's first words.
 */
export async function measureDurationSeconds(path: string): Promise<number> {
  const { ffmpegCapture } = await import('./ffmpeg.js');
  const { stderr } = await ffmpegCapture(['-i', path, '-f', 'null', '-']);
  let best = 0;
  for (const match of stderr.matchAll(/time=(\d+):(\d\d):(\d\d(?:\.\d+)?)/g)) {
    const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    if (Number.isFinite(seconds)) best = Math.max(best, seconds);
  }
  return best;
}
