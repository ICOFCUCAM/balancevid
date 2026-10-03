/**
 * What is left to send, and how far it got.
 *   [Doctrine U-06, D-21; TAKE-DESKTOP T-5]
 *
 * > *"Submit sends the set under one capture, resumable per
 * > source … Judged on: a four-camera capture recorded offline,
 * > then submitted when a connection returns, arriving in the
 * > inbox as one capture with four angles."*
 *
 * RESUMABLE IS THE HALF A BROWSER RUN CANNOT PROVE ON ITS OWN.
 * It was proved on a real one — a 42 MB send killed mid-angle,
 * resumed at the piece after the last acknowledged, with the
 * earlier pieces' modification times unchanged on the
 * installation's disk — and that run took two processes, a
 * fake camera and a deliberate network failure. What it cannot
 * do is ask the question for every shape of interruption. This
 * does.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MOST_ANGLES, type Capture } from '../../shared/src/capture.js';
import {
  type Sending, NOTHING_SENT, nextStep, progressOf, readSending, remaining,
  sendingSays, troubleFrom, verdictOf,
} from '../../desktop/src/submit.js';

const PIECE = 1000;

const capture = (bytes: number[], label = (n: number) => `Camera ${n + 1}`): Capture => ({
  id: 'cap_1',
  label: 'Hall',
  beganAt: '2026-10-03T12:00:00.000Z',
  sampleRate: 48000,
  spreadMs: 0.8,
  startedTogether: true,
  angles: bytes.map((size, n) => ({
    sourceId: `s${n}`,
    label: label(n),
    file: `0${n + 1}-cam.webm`,
    calledAtMs: 0,
    offsetSamples: n * 10,
    bytes: size,
    hasAudio: true,
  })),
});

const to = { name: 'The Studio' };

describe('what is still to go up', () => {
  it('is all of it when nothing has been sent', () => {
    const left = remaining(capture([2500, 1200]), NOTHING_SENT, PIECE);
    expect(left.map((one) => one.track)).toEqual([0, 1]);
    expect(left[0]!.pieces.map((one) => one.index)).toEqual([0, 1, 2]);
    expect(left[1]!.pieces.map((one) => one.index)).toEqual([0, 1]);
  });

  /*
   * THE WHOLE OF "RESUMABLE PER SOURCE". A count per track says
   * exactly which pieces remain, because the pieces of one angle
   * are sent in order and the track stops at the first that
   * fails.
   */
  it('is what the installation has not acknowledged, per angle', () => {
    const left = remaining(capture([2500, 1200]), { done: { 0: 2 } }, PIECE);
    expect(left.map((one) => one.track)).toEqual([0, 1]);
    /* Camera 1 picks up at piece two, at the byte it stopped on. */
    expect(left[0]!.pieces).toEqual([{ index: 2, at: 2000, bytes: 500 }]);
    expect(left[1]!.pieces.map((one) => one.index)).toEqual([0, 1]);
  });

  /* An angle entirely up is not in the list at all. */
  it('leaves out an angle that has all arrived', () => {
    const left = remaining(capture([2500, 1200]), { done: { 0: 3 } }, PIECE);
    expect(left.map((one) => one.track)).toEqual([1]);
  });

  /*
   * A COUNT HIGHER THAN THERE ARE PIECES IS NOT NEGATIVE WORK.
   * The file is on a disk a person can open and the record is
   * JSON beside it; a hand-edited count must not make the sender
   * slice backwards.
   */
  it('cannot be made to send a negative number of pieces', () => {
    expect(remaining(capture([2500]), { done: { 0: 99 } }, PIECE)).toEqual([]);
  });

  /* And it names the angle, because the sender posts by file. */
  it('says which file each angle is', () => {
    const left = remaining(capture([1000, 1000]), NOTHING_SENT, PIECE);
    expect(left.map((one) => one.file)).toEqual(['01-cam.webm', '02-cam.webm']);
    expect(left.map((one) => one.label)).toEqual(['Camera 1', 'Camera 2']);
  });
});

describe('how far along', () => {
  /*
   * BYTES AND NOT PIECES, because angles are not the same
   * length: a camera that dropped out after a minute has three
   * pieces and the others have three hundred, and a bar counting
   * pieces would sit at a quarter with a twentieth of the work
   * done.
   */
  it('counts bytes the installation has acknowledged', () => {
    const seen = progressOf(capture([2500, 100000]), { done: { 0: 2 } }, PIECE);
    expect(seen.bytes).toBe(2000);
    expect(seen.total).toBe(102500);
    expect(seen.anglesDone).toBe(0);
    expect(seen.angles).toBe(2);
    expect(seen.sent).toBe(false);
  });

  it('counts an angle done only when all of it is up', () => {
    expect(progressOf(capture([2500]), { done: { 0: 2 } }, PIECE).anglesDone).toBe(0);
    expect(progressOf(capture([2500]), { done: { 0: 3 } }, PIECE).anglesDone).toBe(1);
  });

  /*
   * SENT IS THE INSTALLATION'S WORD AND NOT A COUNT REACHING
   * ITS TOTAL. Every byte uploaded is still bytes in a
   * directory until the send turns them into a submission —
   * which is D-25 on the installation's side and was found to
   * be true here by a send that uploaded 42 MB and was then
   * refused.
   */
  it('is not sent merely because every byte arrived', () => {
    const all = { done: { 0: 3 } };
    expect(progressOf(capture([2500]), all, PIECE).sent).toBe(false);
    expect(progressOf(capture([2500]),
      { ...all, sentAt: 'then' }, PIECE).sent).toBe(true);
  });
});

describe('the next thing to do', () => {
  /*
   * A STATE READ OFF THE RECORD RATHER THAN HELD IN A VARIABLE,
   * so a send resumed in a later run of the application reaches
   * the same conclusion as one that never stopped. There is no
   * resume path and normal path; there is one path that starts
   * wherever it starts.
   */
  it('walks open, declare, pieces, send, done', () => {
    const one = capture([2500]);
    expect(nextStep(one, NOTHING_SENT, PIECE)).toEqual({ do: 'open' });
    const opened: Sending = { done: {}, openedAt: 'now' };
    expect(nextStep(one, opened, PIECE)).toEqual({ do: 'declare' });
    const declared: Sending = { ...opened, submissionId: 'sub_x' };
    expect(nextStep(one, declared, PIECE).do).toBe('pieces');
    const uploaded: Sending = { ...declared, done: { 0: 3 } };
    const send = nextStep(one, uploaded, PIECE);
    expect(send.do).toBe('send');
    if (send.do === 'send') expect(send.tracks).toHaveLength(1);
    expect(nextStep(one, { ...uploaded, sentAt: 'then' }, PIECE))
      .toEqual({ do: 'done' });
  });

  /*
   * REFUSED BEFORE A BYTE MOVES. An angle that recorded nothing
   * cannot arrive — the route refuses a track with no pieces —
   * and discovering that after three cameras have gone up is
   * discovering it at the worst moment.
   */
  it('refuses before it opens anything', () => {
    const step = nextStep(capture([2500, 0]), NOTHING_SENT, PIECE);
    expect(step.do).toBe('refuse');
    if (step.do === 'refuse') expect(step.because).toContain('Camera 2');
  });

  /* A capture already sent is done, whatever else is true. */
  it('is done once the installation has called it a submission', () => {
    expect(nextStep(capture([0]), { done: {}, sentAt: 'then' }, PIECE))
      .toEqual({ do: 'done' });
  });
});

describe('a record off a disk a person can open', () => {
  /*
   * ANYTHING MAY BE IN THIS FILE, and a hand-edited count would
   * make the sender skip pieces that were never sent — a
   * submission with a hole in it, of a plausible length, that
   * nobody can tell from a good one until they watch it. [D-21]
   */
  it('believes only whole counts that are not negative', () => {
    expect(readSending({ done: { 0: 3, 1: -1, 2: 1.5, 3: 'x', 4: NaN } }).done)
      .toEqual({ 0: 3 });
  });

  /*
   * A TRACK NUMBER IS ONE THE PROTOCOL WOULD HAVE ISSUED. The
   * first version allowed two digits, so 99 — a number no
   * capture can have, kept as a key the sender would then carry
   * around meaning nothing.
   */
  it('believes only track numbers that could be tracks', () => {
    expect(readSending({ done: { 0: 1, '../x': 2, 99: 3, '': 4, 7: 5 } }).done)
      .toEqual({ 0: 1, 7: 5 });
    expect(readSending({ done: { [MOST_ANGLES]: 1 } }).done).toEqual({});
  });

  it('reads nothing out of nothing', () => {
    for (const bad of [null, undefined, 7, 'x', []]) {
      expect(readSending(bad).done).toEqual({});
    }
  });

  it('carries the three strings, bounded', () => {
    const read = readSending({
      done: {}, openedAt: 'a', submissionId: 'b', sentAt: 'c',
      trouble: 'x'.repeat(900),
    });
    expect(read.openedAt).toBe('a');
    expect(read.submissionId).toBe('b');
    expect(read.sentAt).toBe('c');
    expect(read.trouble).toHaveLength(200);
  });

  it('leaves out what was not a string', () => {
    const read = readSending({ done: {}, submissionId: 5, sentAt: {} });
    expect(read.submissionId).toBeUndefined();
    expect(read.sentAt).toBeUndefined();
  });
});

describe('what a person is told', () => {
  /*
   * THE DESTINATION IS NAMED AND THE CREDENTIAL IS NOT. A person
   * about to send four cameras of somebody's performance should
   * be able to read where it is going; the secret that
   * authorises it is not theirs to read off a screen in a hall.
   */
  it('names where it is going and how much there is', () => {
    const said = sendingSays(capture([2 * 1024 * 1024]), NOTHING_SENT, to, PIECE);
    expect(said).toContain('The Studio');
    expect(said).toContain('2 MB');
    expect(said).not.toMatch(/secret|token|link/i);
  });

  it('counts what has arrived once something has', () => {
    const said = sendingSays(capture([4000, 4000]), { done: { 0: 2 } }, to, PIECE);
    expect(said).toContain('0 of 2 angles complete');
    expect(said).toContain('of');
  });

  it('says it is sent, and what it was sent as', () => {
    expect(sendingSays(capture([1000, 1000]),
      { done: {}, sentAt: 'then' }, to, PIECE))
      .toBe('Sent to The Studio as one capture of 2 angles.');
  });

  /*
   * A STATION THAT IS NOT POINTED AT ANYTHING SAYS SO, rather
   * than offering a button that cannot act. [U-19]
   */
  it('says there is nowhere to send it rather than offering to', () => {
    expect(sendingSays(capture([1000]), NOTHING_SENT, null, PIECE))
      .toContain('connect to a studio first');
  });

  /* And a refusal is the thing worth saying, before anything else. */
  it('says why it cannot be sent at all', () => {
    expect(sendingSays(capture([1000, 0]), NOTHING_SENT, to, PIECE))
      .toContain('Camera 2');
  });
});

/* ------------------------------------------------------------------ *
 *  What an answer from the installation means.
 * ------------------------------------------------------------------ */

/**
 * THREE OUTCOMES AND NOT TWO, which is the browser queue's own
 * conclusion reached again out here.
 *
 * > *"'Sent' and 'try again' are the obvious pair; the third is
 * > a refusal that trying again cannot fix — an empty chunk, a
 * > link that is no longer open, an id the server will not
 * > accept. Retrying those forever is a counter that never
 * > reaches zero."*
 *
 * The two clients cannot share the code — one is a classic
 * script in a service worker, the other is Node in Electron —
 * so this is the assertion that they agree about the rule.
 * [D-19, U-19]
 */
describe('what an answer means', () => {
  it('reads the three outcomes the browser queue reads', () => {
    expect(verdictOf(202)).toBe('ok');
    expect(verdictOf(201)).toBe('ok');
    expect(verdictOf(408)).toBe('again');
    expect(verdictOf(429)).toBe('again');
    expect(verdictOf(503)).toBe('again');
    expect(verdictOf(500)).toBe('again');
    /* A refusal trying again cannot fix. */
    expect(verdictOf(400)).toBe('dead');
    expect(verdictOf(404)).toBe('dead');
    expect(verdictOf(409)).toBe('dead');
  });

  /*
   * AND IT IS THE SAME RULE THE QUEUE SPELLS OUT, read off its
   * source because that file cannot be imported — it is a
   * classic script, which is what lets the page and the service
   * worker share one queue. A duplication a test compares
   * against its twin cannot drift.
   */
  it('agrees with the queue the browser drains', () => {
    const queue = readFileSync(
      join(import.meta.dirname, '..', '..', 'public', 'take-app', 'queue.js'),
      'utf8');
    expect(queue).toMatch(/response\.status === 408 \|\| response\.status === 429/);
    expect(queue).toMatch(/response\.status >= 500\) return 'again'/);
    expect(queue).toMatch(/if \(response\.ok\) return 'sent'/);
  });

  /*
   * THE INSTALLATION'S OWN WORDS WHERE IT GAVE ANY. A refusal
   * rewritten into a generic failure is a refusal nobody can act
   * on: *"this request accepts 1 recording(s) and has them"* is
   * something an operator can do something about, and "upload
   * failed" is not. [U-19]
   */
  it('keeps a refusal a person can act on', () => {
    expect(troubleFrom(404, 'anything')).toBe('that link is not open');
    expect(troubleFrom(409, 'this request accepts 1 and has them'))
      .toBe('this request accepts 1 and has them');
    expect(troubleFrom(503, 'anything')).toContain('try again');
    expect(troubleFrom(400, 'that studio would not take it'))
      .toBe('that studio would not take it');
  });
});
