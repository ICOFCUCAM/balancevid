/**
 * The queue: answers from phones, cited and played on air.
 *   [TIMELINE B14e; CHANNEL §5, §8; D-19, D-25]
 *
 * "...waiting for live TV or conversational studio program where the
 *  host can cite their participation and play their view that is
 *  already on the queue."
 *
 * TWO DECISIONS, DELIBERATELY SEPARATE. A host reads somebody's
 * written answer out and cites them without playing anything; a host
 * plays a recording and leaves the caption up afterwards while they
 * respond to it. One button for each.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Channel, OnAir } from '../../src/domain/channel.js';
import { ChannelEditError, cite } from '../../src/domain/channelEdit.js';
import { DEFAULT_IDENTITY, marksFor } from '../../src/domain/identity.js';

const ROOT = join(import.meta.dirname, '..', '..');
const code = (file: string) => readFileSync(join(ROOT, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const AT = '2026-09-30T20:00:00.000Z';

function channel(over: Partial<Channel> = {}): Channel {
  return {
    id: 'chan_one', name: 'BalanceVid TV', createdAt: AT,
    schedule: [], rotation: [], blocks: [], destinations: [],
    identity: { ...DEFAULT_IDENTITY },
    live: {
      ingestId: 'ing_one' as never, phase: 'on_air', startedAt: AT,
    },
    ...over,
  } as Channel;
}

describe('putting somebody’s name on air', () => {
  it('goes up with what they were answering, and comes down again', () => {
    const one = channel();
    cite(one, { name: 'Amina Yusuf', asks: 'What did you make of it?' }, AT);
    expect(one.live?.citing).toEqual({
      name: 'Amina Yusuf', asks: 'What did you make of it?', at: AT,
    });
    cite(one, null, AT);
    expect(one.live?.citing).toBeUndefined();
  });

  /*
   * A NAME IS OPTIONAL AND A QUESTION IS NOT. "Amina Yusuf" over
   * somebody's face says nothing a viewer joining now can use; the
   * question says the whole of it, and plenty of people answer
   * without giving a name.
   */
  it('needs something to have been asked, and not a name', () => {
    const one = channel();
    cite(one, { asks: 'What did you make of it?' }, AT);
    expect(one.live?.citing?.name).toBeUndefined();
    expect(() => cite(one, { name: 'Amina', asks: '   ' }, AT))
      .toThrow(/say what they were answering/);
  });

  it('is bounded, because it arrives from a phone', () => {
    const one = channel();
    cite(one, { name: 'A'.repeat(300), asks: 'B'.repeat(400) }, AT);
    expect(one.live?.citing?.name).toHaveLength(80);
    expect(one.live?.citing?.asks).toHaveLength(160);
  });

  /* Every other live control refuses off air, and a caption over
     nothing is no different. */
  it('is refused when the channel is not live', () => {
    const off = channel({ live: undefined as never });
    expect(() => cite(off, { asks: 'x' }, AT)).toThrow(ChannelEditError);
    expect(() => cite(off, { asks: 'x' }, AT)).toThrow(/not live/);
    const done = channel();
    done.live!.endedAt = AT;
    expect(() => cite(done, { asks: 'x' }, AT)).toThrow(/not live/);
  });
});

describe('what the viewer sees while somebody is cited', () => {
  const on = (one: Channel): OnAir =>
    ({ kind: 'live', session: one.live! } as OnAir);
  /* The channel's own caption, which is what a citation replaces. */
  const marks = (one: Channel, intoMs = 0) =>
    marksFor(one.identity, on(one), intoMs, () => one.name);

  /*
   * A CITATION REPLACES THE PROGRAMME'S NAME. A lower third that
   * still said the show's title over a stranger's face would be the
   * station taking credit for what somebody sent in — and two plates
   * in one corner is one plate nobody can read.
   */
  it('is their name, and not the channel’s', () => {
    const one = channel();
    cite(one, { name: 'Amina Yusuf', asks: 'What did you make of it?' }, AT);
    const lower = marks(one).filter((mark) => mark.kind === 'lower-third');
    expect(lower).toHaveLength(1);
    expect(lower[0]?.text).toBe('Amina Yusuf  ·  What did you make of it?');
  });

  it('is the question alone where nobody gave a name', () => {
    const one = channel();
    cite(one, { asks: 'What did you make of it?' }, AT);
    expect(marks(one).find((mark) => mark.kind === 'lower-third')?.text)
      .toBe('What did you make of it?');
  });

  /*
   * AND IT IGNORES `show` AND `holdMs`, which are a statement about
   * how the CHANNEL captions itself rather than about whether a
   * named contributor is named. A station that never shows lower
   * thirds still has to credit the person whose answer is on screen.
   */
  it('is shown even on a channel that never shows lower thirds', () => {
    const one = channel({
      identity: { ...DEFAULT_IDENTITY, lowerThird: { show: 'never', holdMs: 0 } },
    });
    cite(one, { name: 'Amina', asks: 'Why?' }, AT);
    expect(marks(one).some((mark) => mark.kind === 'lower-third')).toBe(true);
  });

  /* And a long way into a programme, where the channel's own title
     has long since come down. */
  it('is shown after the channel’s own title has gone', () => {
    const one = channel();
    expect(marks(one, 60_000).some((mark) => mark.kind === 'lower-third'))
      .toBe(false);
    cite(one, { name: 'Amina', asks: 'Why?' }, AT);
    expect(marks(one, 60_000).some((mark) => mark.kind === 'lower-third'))
      .toBe(true);
  });

  it('goes back to the channel’s own caption when it comes down', () => {
    const one = channel();
    cite(one, { name: 'Amina', asks: 'Why?' }, AT);
    cite(one, null, AT);
    const lower = marks(one).find((mark) => mark.kind === 'lower-third');
    expect(lower?.text).not.toContain('Amina');
  });
});

describe('playing one into the show', () => {
  const tab = code('app/t/[id]/AnswersTab.tsx');
  const studio = code('app/t/[id]/ChannelStudio.tsx');

  /*
   * A SOURCE IN THE MIXER, NOT A ROLL-IN AND NOT A PROGRAMME.
   *
   * Rolling a reference in REPLACES the live feed with a file, and
   * scheduling one would make a submission into production material
   * without anybody accepting it (D-25). An answer joins the picture
   * beside the presenter, which is what "play it INTO the show"
   * means — and it is the same thing a shared screen already does.
   */
  it('joins the mixer beside the presenter', () => {
    expect(studio).toMatch(/\.\.\.\(answer\s*\n?\s*\? \[\{ id: answer\.id, stream: answer\.stream, label: answer\.label \}\] : \[\]\),/);
    expect(studio).toMatch(/sources: mixed,/);
    /* And not by any other route. */
    expect(tab).not.toContain("action: 'roll-in'");
    expect(tab).not.toContain("action: 'schedule'");
  });

  /*
   * `captureStream` IS THE BRIDGE between media on disk and a feed
   * in the mixer, and it is the whole reason this works without a
   * new kind of programme source.
   */
  it('makes a stream out of the file by playing it', () => {
    expect(tab).toMatch(/captureStream\?\.\(\)/);
    expect(tab).toMatch(/element\.src = `\/api\/channels\/\$\{channel\.id\}\/answers\//);
  });

  /*
   * THE ELEMENT IS MUTED. Its sound goes out through the MIXER;
   * playing it aloud in the control room as well would put it into
   * the presenter's microphone and broadcast it twice.
   */
  it('does not play the answer aloud in the control room', () => {
    expect(tab).toMatch(/<video ref=\{video\} data-testid="answers-player" muted/);
  });

  /* It leaves when it ends, without anybody taking it out. */
  it('leaves the picture when it finishes', () => {
    expect(tab).toMatch(/onEnded=\{\(\) => onPlay\(null, null\)\}/);
  });

  /*
   * OFF AIR IT IS GREYED, NOT MISSING. A host who cannot find the
   * button while a programme is running has lost the moment. [U-04]
   */
  it('is greyed off air rather than hidden', () => {
    expect(tab).toMatch(/data-testid="answers-play"\s*\n?\s*disabled=\{!onAir\}/);
    expect(tab).toMatch(/data-testid="answers-cite"\s*\n?\s*disabled=\{!onAir\}/);
    expect(tab).toMatch(/'The channel is not on air'/);
  });
});

describe('the queue itself', () => {
  const tab = code('app/t/[id]/AnswersTab.tsx');
  const route = code('app/api/channels/[id]/answers/[requestId]/[submissionId]/route.ts');

  /*
   * POLLED, because an answer arrives from somebody else's phone and
   * nothing in this tab can know when.
   */
  it('watches for answers rather than waiting to be told', () => {
    expect(tab).toMatch(/window\.setInterval\(\(\) => \{ void read\(\); \}, 4000\)/);
    expect(tab).toMatch(/window\.clearInterval\(timer\)/);
  });

  /* Newest first, because a live host reads down from the top. */
  it('puts the newest answer at the top', () => {
    expect(tab).toMatch(/\[\.\.\.answers\]\.reverse\(\)\.map/);
  });

  /*
   * THE LINK IS SHOWN ONCE AND NEVER READ BACK. It is a credential,
   * and the queue a host puts on a studio screen carries none. [T14]
   */
  it('shows the link once, from the response that made it', () => {
    expect(tab).toMatch(/setLink\(String\(data\.link\)\)/);
    expect(tab).toMatch(/It is shown once\./);
  });

  /*
   * AND THE MEDIA IS THE OWNER'S. Checked against the channel that
   * asked, because without that a broadcaster could read another
   * broadcaster's answers by editing a path. [D-25, INV-15]
   */
  it('serves an answer only to the channel that asked for it', () => {
    expect(route).toMatch(
      /found\.holder\.kind !== 'channel' \|\| found\.holder\.id !== id/);
    expect(route).toMatch(/const REQUEST = \/\^req_\[A-Za-z0-9\]\{1,64\}\$\//);
    expect(route).toMatch(/const SUBMISSION = \/\^sub_\[A-Za-z0-9_-\]\{1,120\}\$\//);
  });

  /*
   * AND ONLY ONE THAT WAS SENT. Segments for a recording the
   * performer deleted, or has not sent, are bytes they have not
   * given anybody. [T4, D-25]
   */
  it('serves nothing for a recording that was never sent', () => {
    expect(route).toMatch(
      /!\(found\.submissions \?\? \[\]\)\.some\(\(one\) => one\.assetId === submissionId\)/);
  });
});
