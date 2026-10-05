/**
 * Questions sent to phones, from the two studios with no song.
 *   [TIMELINE B14d, B14e; TAKE-APP T12; D-19, D-25]
 *
 * "With Studio One, and Online TV, videos or audio or other questions
 * for a particular program could be forwarded to their phones."
 *
 * THE SAME REQUEST OBJECT ALL THREE STUDIOS ISSUE, which is the whole
 * design and the thing this file defends. A performance hands out a
 * song to perform against; a conversation and a channel hand out a
 * question. The difference is what travels on the request, not how
 * the request works — and because it is one object, the host's queue
 * reads one list rather than three.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ANSWERS_BY_DEFAULT, MOST_ANSWERS, PHONE_ASKS, answersAllowed, phoneAsk,
} from '../../src/domain/askPhone.js';

const ROOT = join(import.meta.dirname, '..', '..');
const code = (file: string) => readFileSync(join(ROOT, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('what a phone can be asked for', () => {
  /*
   * THREE, AND THE COUNT IS ASSERTED. The brief names five kinds of
   * assignment and two of them — performance and poll — are not this:
   * a performance has a song, and a poll is a tap rather than a
   * recording. What a question to a phone can ask for is a face, a
   * voice, or words.
   */
  it('is a face, a voice, or words', () => {
    expect(Object.keys(PHONE_ASKS)).toEqual(['answer', 'voice', 'written']);
    expect(PHONE_ASKS['answer']).toMatchObject({ kind: 'response', video: true });
    expect(PHONE_ASKS['voice']).toMatchObject({ kind: 'audio', audio: true });
    /* Words only: nothing is recorded, so nothing crosses but text. */
    expect(PHONE_ASKS['written']?.video).toBeUndefined();
    expect(PHONE_ASKS['written']?.audio).toBeUndefined();
  });

  it('answers nothing for a name it does not have', () => {
    expect(phoneAsk('selfie')).toBeUndefined();
    expect(phoneAsk(null)).toBeUndefined();
    expect(phoneAsk(undefined)).toBeUndefined();
  });

  /*
   * BOUNDED, because a link is handed to a stranger and an unbounded
   * allowance is somewhere to put anything. Three by default, for the
   * reason a performance gets three takes: somebody who fluffs their
   * first answer should not need a second link.
   */
  it('allows a bounded number of answers', () => {
    expect(answersAllowed(undefined)).toBe(ANSWERS_BY_DEFAULT);
    expect(answersAllowed(Number.NaN)).toBe(ANSWERS_BY_DEFAULT);
    expect(answersAllowed(1)).toBe(1);
    expect(answersAllowed(0)).toBe(1);
    expect(answersAllowed(-5)).toBe(1);
    expect(answersAllowed(1000)).toBe(MOST_ANSWERS);
    expect(answersAllowed(2.6)).toBe(3);
  });
});

describe('the two routes that issue one', () => {
  const conversation = code('app/api/conversations/[id]/requests/route.ts');
  const channel = code('app/api/channels/[id]/requests/route.ts');

  /*
   * ONE OBJECT, THREE ISSUERS. If these built their own request
   * shapes the inbox would have three, and the queue could not read
   * one list. [D-19]
   */
  it('build the same request the performance route builds', () => {
    for (const [name, source] of [
      ['conversation', conversation], ['channel', channel],
    ] as const) {
      expect(source, name).toContain('newRequest({');
      expect(source, name).toContain('token: newSecret()');
      expect(source, name).toContain('await saveRequest(request)');
    }
    expect(conversation).toContain("holder: { kind: 'conversation', id: conversation.id }");
    expect(channel).toContain("holder: { kind: 'channel', id: channel.id }");
  });

  /*
   * NO REFERENCE, which is what tells the phone there is no clock to
   * keep. A conversation and a channel have no song, and writing an
   * empty one would make the Take App fetch a file that is not there
   * and show "could not read the song" over a question about the
   * news.
   */
  it('write no song to perform against', () => {
    expect(conversation).not.toContain('reference');
    expect(channel).not.toContain('reference');
  });

  /*
   * AN EMPTY QUESTION IS REFUSED RATHER THAN FILLED IN. A performance
   * can default to "sing along to X" because the song says what is
   * wanted; nothing about a conversation or a channel does.
   */
  it('refuse an empty question', () => {
    for (const source of [conversation, channel]) {
      expect(source).toContain("if (!asks) return fail(400, 'say what you are asking for')");
    }
  });

  it('refuse an ask that is not one of the three', () => {
    for (const source of [conversation, channel]) {
      expect(source).toContain(
        "if (!wants) return fail(400, 'that is not something a phone can be asked for')");
    }
  });

  /*
   * THE LINK IS RETURNED ONCE. A producer can rotate the token; what
   * they cannot do is read it back out of a listing, which keeps the
   * credential out of every log and screenshot but the one response
   * that made it. [T14]
   */
  it('return the link once and never in the listing', () => {
    for (const [name, source] of [
      ['conversation', conversation], ['channel', channel],
    ] as const) {
      expect(source, name).toContain('link: linkFor(request)');
      const listing = source.slice(source.indexOf('export async function GET'));
      expect(listing, name).not.toContain('linkFor');
      expect(listing, name).not.toContain('token');
    }
  });

  /*
   * A CLASS B SOURCE IS SOMEBODY ELSE'S PLAYER and is not ours to
   * hand to a phone: only the mezzanine, which is the one copy we
   * hold and may show. [U-01, U-02, INV-15]
   */
  it('hand out only a source we hold as a file', () => {
    expect(conversation).toContain('conversation.source?.mezzanineAssetId');
    expect(conversation).not.toContain('embedUrl');
    /* A channel is a running programme and has no file at all. */
    expect(channel).not.toContain('watch:');
  });

  /* Each lists only its own. A conversation's inbox showing a
     channel's answers would be the boundary leaking sideways. */
  it('list only their own requests', () => {
    expect(conversation).toContain("request.holder.kind === 'conversation'");
    expect(channel).toContain("request.holder.kind === 'channel'");
  });
});

describe('the phone, with no song to record against', () => {
  const hook = code('app/p/[id]/useMasterRecording.ts');
  const app = code('app/take/[link]/TakeApp.tsx');

  /*
   * NOTHING IS A REAL CASE, not a missing argument. The recorder
   * keeps everything it exists for — segments uploaded as they
   * close, the elapsed time on the audio clock, the phase the
   * surface reads — and skips the one thing that needs a song.
   * [D-19, U-06]
   */
  it('is the same recorder, told there is no clock', () => {
    expect(hook).toContain('masterUrl: string | null;');
    expect(hook).toMatch(/if \(masterUrl\) \{\s*\n\s*const response = await fetch\(masterUrl\);/);
    expect(hook).toMatch(/if \(!context \|\| \(masterUrl && !buffer\)\)/);
    /* And no source is scheduled, because there is nothing to play. */
    expect(hook).toMatch(/if \(buffer\) \{\s*\n\s*const source = context\.createBufferSource\(\);/);
  });

  /*
   * THE COUNT-IN STILL RUNS. Somebody asked a question, and nobody
   * should have to start talking from a standing start. [S-10]
   */
  it('still counts in', () => {
    const start = hook.slice(hook.indexOf('const start = useCallback'));
    expect(start).toContain('const beginsAt = context.currentTime + countInSeconds;');
    expect(start.indexOf('setPhase(\'counting\')'))
      .toBeLessThan(start.indexOf('if (buffer) {'));
  });

  /*
   * AND THE OFFSET IS ZERO. An answer is not against anything, so a
   * number there would be a measurement of nothing — and the
   * producer would read it in the inbox as though it meant
   * something.
   */
  it('reports no offset for a recording that is against nothing', () => {
    expect(hook).toMatch(/offsetRef\.current = masterUrl\s*\n?\s*\? placeTakeOnSong\(/);
    expect(hook).toMatch(/:\s*0;/);
  });

  it('asks for no song when the request carries no reference', () => {
    expect(app).toMatch(
      /masterUrl: view && !view\.assignment\.reference\s*\n\s*\? null/);
  });

  /* A heading of "…" over somebody's camera says nothing at all. */
  it('says what the page is for when there is no song title', () => {
    expect(app).toContain('asksFor(view.assignment.kind)');
    expect(code('app/take/[link]/TakeApp.tsx'))
      .toMatch(/case 'question': return 'A question for you';/);
  });

  /*
   * NO CAMERA FOR A SPOKEN ANSWER. `allowed` names what the
   * participant MAY send, and asking a phone for a camera the
   * recording will not use costs a permission prompt and their
   * trust. [T12]
   */
  it('asks only for a microphone when only sound may be sent', () => {
    expect(app).toMatch(/const soundOnly = Boolean\(view\) && !view!\.allowed\.video;/);
    expect(app).toContain('audioOnly: soundOnly,');
    expect(app).toMatch(/soundOnly \? 'Turn the microphone on' : 'Turn the camera on'/);
  });

  /* The headphone warning is about a song, and a question has none:
     a warning that does not apply is one people stop reading. */
  it('does not warn about headphones when there is no song', () => {
    expect(app).toMatch(/\{reference && \(\s*\n\s*<p className="small muted"/);
  });

  /*
   * AND A SPOKEN ANSWER DOES NOT GET A PHONE-SIZED EMPTY RECTANGLE
   * saying "the camera is off". A box the height of the screen with
   * nothing in it reads as something broken rather than as something
   * not asked for — seen in a screenshot of the page, not in a test.
   * [U-04]
   */
  it('does not draw a camera for a request that has none', () => {
    /*
     * THE VIEWFINDER REDESIGN MOVED EVERY ONE OF THESE AND
     * CHANGED NONE OF THEM. The picture is the page now and the
     * chrome sits on the glass, so the branch is a ternary
     * rather than two guards and the empty-rectangle case has a
     * class of its own — but the claim is the same claim: a
     * request that may not send video gets no camera, no
     * phone-sized hole, and a sentence saying which it is.
     */
    expect(app).toMatch(/soundOnly\s*\n?\s*\?/);
    expect(app).toMatch(/<video\s*\n\s*data-testid="take-camera"/);
    expect(app).toMatch(/recording\.phase === 'idle' && !soundOnly/);
    /* The sound-only frame is its own thing with its own
       height, rather than a camera-shaped box with nothing in
       it. [take.css `.rec[data-sound='true']`] */
    expect(app).toContain('className="rec-sound"');
    expect(app).toContain('Sound only — nothing is filmed');
  });

  /*
   * AND THE CLOCK COUNTS UP RATHER THAN TOWARDS 00:00.000. A
   * denominator of nothing is a progress bar that is always full.
   */
  it('shows no total when there is no song to be through', () => {
    /* The tone moved to a class when the clock moved onto the
       glass; the condition did not. [take.css `.rec-clock-of`] */
    expect(app).toMatch(
      /\{reference && \(\s*\n\s*<span className="rec-clock-of">/);
  });

  /*
   * AND THE VIEWFINDER DID NOT ACQUIRE A METER THAT LIES.
   *   [T3, U-19, D-19]
   *
   * A church recording a service on a phone at the back of a
   * hall has one way to discover the microphone was muted and
   * it is afterwards, so the glass carries a level. What it
   * must not be is a second loudness calculation: the control
   * room's meters already answer *is anybody talking*, and two
   * answers would disagree on exactly the quiet sentence where
   * it matters.
   */
  it('reads the level off the meter the control room already uses', () => {
    expect(app).toContain('useFeedLevels');
    expect(app).toMatch(/useFeedLevels\(tapped, recording\.stream !== null\)/);
    /* And no analyser of its own. */
    expect(app).not.toContain('AnalyserNode');
    expect(app).not.toContain('new AudioContext');
  });

  /*
   * THE FLIP IS DRAWN ONLY WHERE THERE IS SOMETHING TO FLIP
   * BETWEEN. Singing to the phone and filming the room are the
   * two things this app is for, and the difference between them
   * was three taps inside a disclosure. A flip button over one
   * camera is a button that does nothing. [D-21]
   */
  it('offers a flip only when the browser has named two cameras', () => {
    expect(app).toMatch(
      /camera\.devices\.named\s*\n?\s*&& camera\.devices\.cameras\.length > 1/);
    expect(app).toContain('data-testid="take-flip"');
  });
});
