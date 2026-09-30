/**
 * How good the picture is.  [Doctrine CHANNEL §7, §23, U-23, D-19]
 *
 * THE COMPLAINT. An operator read `62 kB/s` off the feed meter and asked
 * whether there should be a range adjuster "for those with better cameras and
 * systems". The 62 was a still test picture compressing well, not a cap — but
 * the setting genuinely did not exist, and the numbers behind it were written
 * as literals in three files that had to agree and had no way to.
 *
 * What is protected here is that agreement: one table, and a default that is
 * byte-for-byte what the literals were.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_QUALITY, QUALITIES, QUALITY_ORDER, aboveTransmission, kbps,
  qualityFor, rateSentence, rateVerdict, streamQuality, targetBytesPerSecond,
} from '../../src/domain/quality.js';

describe('the default changes nothing', () => {
  /*
   * THE REGRESSION THIS EXISTS TO CATCH. Before the table, four places each
   * held 1280×720 at 2500k/128k. A quality control that shipped with a
   * different default would re-tune every existing broadcast on upgrade —
   * a change nobody asked for, arriving as a surprise mid-show.
   */
  it('is exactly the numbers that were hard-coded before it', () => {
    const standard = QUALITIES[DEFAULT_QUALITY];
    expect(standard.width).toBe(1280);
    expect(standard.height).toBe(720);
    expect(standard.fps).toBe(30);
    expect(standard.videoBitsPerSecond).toBe(2_500_000);
    expect(standard.audioBitsPerSecond).toBe(128_000);
  });

  it('gives ffmpeg the strings the segment encoder was written with', () => {
    expect(kbps(QUALITIES.standard.videoBitsPerSecond)).toBe('2500k');
    expect(kbps(QUALITIES.standard.audioBitsPerSecond)).toBe('128k');
  });

  /*
   * A deployment that sets nothing transmits what it transmitted yesterday.
   */
  it('is what a deployment transmits when it has said nothing', () => {
    expect(streamQuality({}).id).toBe('standard');
    expect(streamQuality({ STREAM_QUALITY: 'high' }).id).toBe('high');
  });
});

describe('the range', () => {
  it('runs worst to best, which is the order an adjuster moves in', () => {
    expect(QUALITY_ORDER).toEqual(['low', 'standard', 'high', 'maximum', 'ultra']);
    const pixels = QUALITY_ORDER.map((id) => {
      const step = QUALITIES[id];
      return step.width * step.height * step.fps;
    });
    expect([...pixels].sort((a, b) => a - b)).toEqual(pixels);
  });

  /*
   * THE FOUR NUMBERS MOVE TOGETHER OR THE SETTING IS A LIE. A preset that
   * raised the resolution without the bitrate would spend the whole increase
   * on compression artefacts; one that raised the bitrate without the
   * resolution would describe 720p very precisely. Either is a control that
   * appears to work and does not.
   */
  it('raises the bitrate with the resolution, every step', () => {
    const rates = QUALITY_ORDER.map((id) => QUALITIES[id].videoBitsPerSecond);
    expect([...rates].sort((a, b) => a - b)).toEqual(rates);
  });

  it('says what each one costs, because the menu is the only place to say it', () => {
    for (const id of QUALITY_ORDER) {
      expect(QUALITIES[id].needs, id).toMatch(/\S/);
      expect(QUALITIES[id].label, id).toMatch(/\S/);
    }
  });
});

describe('resolving a stored id', () => {
  /*
   * READ FROM localStorage AND FROM AN ENVIRONMENT VARIABLE, both of which
   * can hold a word from an older version. A broadcast that will not start
   * because a preference file is stale is worse than one at the default.
   */
  it('falls back rather than throwing on anything it does not know', () => {
    expect(qualityFor(undefined).id).toBe('standard');
    expect(qualityFor(null).id).toBe('standard');
    expect(qualityFor('').id).toBe('standard');
    /*
     * THIS LINE USED TO READ `qualityFor('ultra')`, chosen as an
     * obviously-invented word — and then 2160p shipped and the
     * invented word became a real preset, so the test went on
     * passing for a while and then failed for the right reason. A
     * placeholder that can become real is not a good placeholder:
     * `cinema` is not on the ladder and the two structural cases
     * below cannot be.
     */
    expect(qualityFor('cinema').id).toBe('standard');
    expect(qualityFor('720p').id).toBe('standard');
    expect(qualityFor('constructor').id).toBe('standard');
    expect(qualityFor('toString').id).toBe('standard');
  });

  /* And a preset that IS on the ladder resolves to itself, including
     the one that is recording-only. */
  it('returns the recording-only preset when it is asked for', () => {
    expect(qualityFor('ultra').id).toBe('ultra');
  });

  it('returns what was asked for when it exists', () => {
    expect(qualityFor('maximum').id).toBe('maximum');
  });
});

describe('what the meter is saying', () => {
  const standard = QUALITIES.standard;

  it('knows what the ceiling is, in the units the meter reads', () => {
    /* (2_500_000 + 128_000) / 8 */
    expect(targetBytesPerSecond(standard)).toBe(328_500);
  });

  /*
   * THE 62 kB/s THAT STARTED THIS. It is a tenth of the ceiling, and
   * nothing is wrong: a static picture compresses to almost nothing. The
   * product must say so, because the operator's own reading was that the
   * product was limited.
   */
  it('calls a low rate normal rather than broken', () => {
    expect(rateVerdict(62_000, standard)).toBe('easy');
    expect(rateSentence(62_000, standard)).toMatch(/normal/);
  });

  it('calls a feed at its ceiling what it is: limited by the setting', () => {
    expect(rateVerdict(325_000, standard)).toBe('capped');
    expect(rateSentence(325_000, standard)).toMatch(/higher setting/);
  });

  it('distinguishes a busy shot from a pinned one', () => {
    expect(rateVerdict(250_000, standard)).toBe('working');
  });

  /*
   * Nothing arriving is the one reading that IS a fault, and it must not be
   * dressed up as "compresses small".
   */
  it('says plainly when nothing is arriving', () => {
    expect(rateVerdict(0, standard)).toBe('starved');
    expect(rateSentence(0, standard)).toMatch(/Nothing/);
  });

  /*
   * A cheap preset pins early: the same 300 kB/s that is comfortable at
   * Standard is far past Low's ceiling, and the verdict has to follow the
   * setting rather than the number.
   */
  it('reads the same rate differently against a different ceiling', () => {
    expect(rateVerdict(300_000, QUALITIES.low)).toBe('capped');
    expect(rateVerdict(300_000, QUALITIES.high)).toBe('easy');
  });
});

describe('recording above what you transmit', () => {
  /*
   * NOT AN ERROR — it is how broadcast has always worked, and the ingest
   * file is the archive (INV-17). What this answers is the operator who
   * chose Maximum, looked at the monitor, and wondered if anything happened.
   */
  it('notices when the ingest carries more than the wire', () => {
    expect(aboveTransmission(QUALITIES.high, QUALITIES.standard)).toBe(true);
    expect(aboveTransmission(QUALITIES.maximum, QUALITIES.high)).toBe(true);
  });

  it('is silent when they match, or when the wire is the wider one', () => {
    expect(aboveTransmission(QUALITIES.standard, QUALITIES.standard)).toBe(false);
    expect(aboveTransmission(QUALITIES.low, QUALITIES.standard)).toBe(false);
  });

  /*
   * FRAME RATE COUNTS, not just the frame. 1080p60 over 1080p30 is twice
   * the picture per second and the archive keeps all of it.
   */
  it('counts frames per second, not only pixels per frame', () => {
    expect(aboveTransmission(QUALITIES.maximum, QUALITIES.high)).toBe(true);
    expect(QUALITIES.maximum.width).toBe(QUALITIES.high.width);
  });
});
