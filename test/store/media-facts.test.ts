/**
 * How long a thing is, asked once.  [CHANNEL §25, C-14; D-18]
 *
 * The two pure halves of the measurement: whether a remembered answer is
 * still about this file, and what to believe of what ffprobe said. Both
 * are held here because both fail silently in production — a stale
 * duration is a schedule slot of the wrong length, and a trusted zero is
 * a programme the playout engine thinks is over before it starts.
 */

import { describe, expect, it } from 'vitest';

import { fresh, readProbe } from '../../src/store/mediaFacts.js';

const file = { bytes: 1024, modifiedAt: '2026-09-30T10:00:00.000Z' };

describe('a remembered measurement', () => {
  it('is fresh when the file is the one it was measured from', () => {
    expect(fresh({ ...file }, file)).toBe(true);
  });

  it('is stale when there is none', () => {
    expect(fresh(null, file)).toBe(false);
  });

  it('is stale when the file has been re-rendered at the same length', () => {
    /* Same plan rendered twice: same bytes, new time. */
    expect(fresh(
      { bytes: 1024, modifiedAt: '2026-09-29T10:00:00.000Z' }, file)).toBe(false);
  });

  it('is stale when the file has been restored at the same time', () => {
    /* A backup keeps the time and can differ in length. */
    expect(fresh(
      { bytes: 99, modifiedAt: '2026-09-30T10:00:00.000Z' }, file)).toBe(false);
  });
});

describe('what ffprobe said', () => {
  const probe = (format: unknown, streams: unknown[] = []) =>
    JSON.stringify({ format, streams });

  it('reads a duration in milliseconds', () => {
    expect(readProbe(probe({ duration: '244.083000' }))?.durationMs)
      .toBe(244_083);
  });

  it('reads the streams that decide what kind of thing it is', () => {
    const facts = readProbe(probe({ duration: '10' }, [
      { codec_type: 'video', width: 1920, height: 1080 },
      { codec_type: 'audio' },
    ]));
    expect(facts).toEqual({
      durationMs: 10_000, hasVideo: true, hasAudio: true,
      width: 1920, height: 1080,
    });
  });

  it('knows a song from a video', () => {
    const song = readProbe(probe({ duration: '244' }, [{ codec_type: 'audio' }]));
    expect(song?.hasVideo).toBe(false);
    expect(song?.hasAudio).toBe(true);
    expect(song?.width).toBe(0);
  });

  it('believes nothing about a container with no duration', () => {
    /* An invented zero is a claim, and the wrong one: zero is the length
       of nothing, and this is a file of unknown length. */
    expect(readProbe(probe({}))).toBeNull();
    expect(readProbe(probe({ duration: 'N/A' }))).toBeNull();
    expect(readProbe(probe({ duration: '-3' }))).toBeNull();
  });

  it('believes nothing about output it cannot parse', () => {
    expect(readProbe('')).toBeNull();
    expect(readProbe('ffprobe: No such file or directory')).toBeNull();
  });

  it('survives a probe with no streams array at all', () => {
    expect(readProbe(JSON.stringify({ format: { duration: '5' } })))
      .toEqual({
        durationMs: 5000, hasVideo: false, hasAudio: false,
        width: 0, height: 0,
      });
  });

  it('rounds rather than truncating', () => {
    expect(readProbe(probe({ duration: '1.9996' }))?.durationMs).toBe(2000);
  });
});
