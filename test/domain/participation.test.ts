/**
 * The boundary between production and participation.
 *   [Doctrine D-25; TAKE-APP T2, T4, T5, T6, T9, T10, T16, T16a]
 *
 * WHAT THIS FILE IS ACTUALLY PROTECTING is one sentence of the author's:
 * "I would not immediately store it as Evening Conversation → Episode 4 →
 * James's response, because the producer may not actually use it." Every
 * test below is downstream of that. A submission is something somebody
 * sent until somebody holding the studio accepts it, and the moment that
 * stops being true the product's record stops being an edit and becomes a
 * log of arrivals.
 *
 * The second thing it protects is the door. A request IS a credential
 * handed to somebody with no account, over WhatsApp, and every property
 * that makes that safe — it expires, it is revocable, it admits exactly
 * one kind of answer, it tells the holder nothing about the production —
 * is asserted here rather than left to the routes.
 */

import { describe, expect, it } from 'vitest';

import {
  REQUEST_NEXT, REQUEST_STATES, type ParticipationRequest,
  type RequestState, isOpen, mayMove, takesLeft, viewFor,
} from '../../src/domain/participation.js';
import {
  ParticipationError, accept, advance, attach, hold, markSent, newRequest,
  open, receive, reject, rotate, submit,
} from '../../src/domain/participationEdit.js';

const NOW = '2026-09-30T10:00:00.000Z';
const LATER = '2026-09-30T11:00:00.000Z';
const TOKEN = 'a'.repeat(32);

function request(over: Partial<Parameters<typeof newRequest>[0]> = {}) {
  return newRequest({
    holder: { kind: 'performance', id: 'perf_one' },
    assignment: {
      kind: 'performance',
      asks: 'Sing the second verse',
      reference: { title: 'The Ancient of Days', durationSamples: 48_000 * 244 },
    },
    allowed: { video: true, takes: 3 },
    token: TOKEN,
    participant: 'James',
    now: NOW,
    ...over,
  });
}

describe('asking somebody for something', () => {
  it('starts created, with the moment written down', () => {
    const made = request();
    expect(made.state).toBe('created');
    expect(made.history).toEqual([{ state: 'created', at: NOW }]);
    expect(made.id).toMatch(/^req_/);
  });

  it('refuses a request that does not say what it wants', () => {
    expect(() => request({ assignment: { kind: 'response', asks: '   ' } }))
      .toThrow(ParticipationError);
  });

  /* A door with nothing behind it. */
  it('refuses a request nobody could answer', () => {
    expect(() => request({ allowed: {} })).toThrow(/cannot be answered/);
  });

  it('refuses a token too short to be a credential', () => {
    expect(() => request({ token: 'abc' })).toThrow(/too short/);
  });

  /*
   * "The phone knows exactly what the performer is supposed to perform
   * against." Without the reference there is nothing to play, nothing to
   * sync to, and a submission that cannot be placed on anybody's
   * timeline — which is an ordinary phone camera, the one thing the
   * brief says the Take App must be more than. [T6]
   */
  it('refuses a performance request with nothing to perform against', () => {
    expect(() => request({
      assignment: { kind: 'performance', asks: 'Sing it' },
    })).toThrow(/what is being performed against/);
  });

  it('refuses a reference whose length nobody measured', () => {
    expect(() => request({
      assignment: {
        kind: 'performance', asks: 'Sing it',
        reference: { title: 'A song', durationSamples: 0 },
      },
    })).toThrow(/no measured length/);
  });

  it('lets the other kinds ask for a response with no reference', () => {
    const asked = request({
      assignment: { kind: 'question', asks: 'Do you agree with this statement?' },
      allowed: { video: true, audio: true },
    });
    expect(asked.assignment.asks).toBe('Do you agree with this statement?');
  });
});

describe('what the holder of a link is told', () => {
  /*
   * THE AUDIENCE DOES NOT ENTER THE STUDIO. A participant learns what is
   * being asked of them and nothing else — not which performance this
   * is, not who else was asked, not what anyone sent. A client handed
   * the document is a client that can be read for it. [D-25]
   */
  it('is what is being asked, and nothing about the production', () => {
    const made = request();
    const view = viewFor(made);
    expect(view.assignment.asks).toBe('Sing the second verse');
    expect(view.allowed.video).toBe(true);
    expect(JSON.stringify(view)).not.toContain('perf_one');
    expect(view).not.toHaveProperty('holder');
    expect(view).not.toHaveProperty('history');
  });

  /* Echoing a credential into a response body is how credentials end up
     in logs. They already have it. */
  it('never contains the token', () => {
    expect(JSON.stringify(viewFor(request()))).not.toContain(TOKEN);
  });

  it('says how many they have already sent, so a client can count takes', () => {
    const made = request();
    open(made, NOW);
    submit(made, { assetId: 'asset_a', kind: 'video', at: NOW }, NOW);
    expect(viewFor(made).submitted).toBe(1);
    expect(takesLeft(made)).toBe(2);
  });
});

describe('the door', () => {
  it('is open while there is no clock on it', () => {
    expect(isOpen(request(), LATER)).toBe(true);
  });

  it('shuts at the moment it was given', () => {
    const made = request({ expiresAt: '2026-09-30T10:30:00.000Z' });
    expect(isOpen(made, NOW)).toBe(true);
    expect(isOpen(made, LATER)).toBe(false);
  });

  /*
   * THE SAFE DIRECTION IS OPEN, which is the same choice `roomEdit`
   * makes about a corrupt expiry and for the same reason: locking
   * somebody out in the middle of a four-minute take is a worse failure
   * than a link that outlives its terms, and rotating the token is the
   * revocation that always works.
   */
  it('treats an unreadable expiry as no expiry', () => {
    expect(isOpen(request({ expiresAt: 'whenever' }), LATER)).toBe(true);
  });

  it('refuses to open, or to take a submission, once it is shut', () => {
    const made = request({ expiresAt: '2026-09-30T10:30:00.000Z' });
    expect(() => open(made, LATER)).toThrow(/closed/);
    expect(() => submit(made, { assetId: 'a', kind: 'video', at: LATER }, LATER))
      .toThrow(/closed/);
  });

  /*
   * Withdrawing it is a new secret, exactly as a room's invitation is
   * withdrawn: an invitation you cannot take back from the person who
   * used it is not one you can withdraw. [ROOM §6]
   */
  it('is withdrawn by rotating the secret', () => {
    const made = request();
    const fresh = 'b'.repeat(32);
    rotate(made, fresh, LATER);
    expect(made.token).toBe(fresh);
    expect(made.history.at(-1)).toEqual({ state: 'created', at: LATER, by: 'rotated' });
    expect(() => rotate(made, 'short', LATER)).toThrow(/too short/);
  });

  /* What a production has used cannot be un-asked. */
  it('is shut once its answer is in a programme', () => {
    const made = request();
    open(made, NOW);
    submit(made, { assetId: 'a', kind: 'video', at: NOW }, NOW);
    receive(made, NOW);
    accept(made, made.submissions![0]!.id, NOW, 'owner');
    attach(made, NOW, 'owner');
    expect(isOpen(made, NOW)).toBe(false);
  });
});

describe('the lifecycle', () => {
  it('has the nine states the brief names, in order', () => {
    expect([...REQUEST_STATES]).toEqual([
      'created', 'sent', 'opened', 'recording', 'submitted',
      'received', 'reviewed', 'accepted', 'rejected', 'attached',
    ]);
  });

  it('runs the whole way through, and writes down every step', () => {
    const made = request();
    markSent(made, NOW, 'owner');
    open(made, NOW);
    advance(made, 'recording', NOW);
    submit(made, { assetId: 'asset_a', kind: 'video', at: NOW }, NOW);
    receive(made, NOW);
    hold(made, NOW, 'owner');
    accept(made, made.submissions![0]!.id, NOW, 'owner');
    attach(made, LATER, 'owner');
    expect(made.history.map((entry) => entry.state)).toEqual([
      'created', 'sent', 'opened', 'recording', 'submitted',
      'received', 'reviewed', 'accepted', 'attached',
    ]);
    expect(made.history.at(-1)).toEqual({ state: 'attached', at: LATER, by: 'owner' });
  });

  /*
   * REFUSED RATHER THAN IGNORED. A lifecycle that silently drops a
   * transition is one nobody can debug from the record it leaves.
   */
  it('refuses a move it does not allow, and says which', () => {
    const made = request();
    expect(() => advance(made, 'accepted', NOW)).toThrow(/created request cannot become accepted/);
    expect(made.state).toBe('created');
  });

  /* A person can record, dislike it, and record again. */
  it('lets recording repeat, because takes do', () => {
    const made = request();
    open(made, NOW);
    advance(made, 'recording', NOW);
    advance(made, 'recording', LATER);
    expect(made.history.filter((e) => e.state === 'recording')).toHaveLength(2);
  });

  /* And a producer can change their mind about somebody's performance. */
  it('lets a rejected request be accepted after all', () => {
    const made = request();
    open(made, NOW);
    submit(made, { assetId: 'a', kind: 'video', at: NOW }, NOW);
    receive(made, NOW);
    reject(made, NOW, 'owner');
    expect(() => accept(made, made.submissions![0]!.id, LATER, 'owner')).not.toThrow();
    expect(made.state).toBe('accepted');
  });

  it('ends at attached, and nowhere else', () => {
    const terminal = REQUEST_STATES.filter((s) => REQUEST_NEXT[s].length === 0);
    expect(terminal).toEqual(['attached']);
  });

  /* Refreshing a page is not a state change. */
  it('is not moved by being told where it already is', () => {
    const made = request();
    open(made, NOW);
    open(made, LATER);
    expect(made.history.filter((e) => e.state === 'opened')).toHaveLength(1);
  });

  it('agrees with its own table', () => {
    for (const from of REQUEST_STATES) {
      for (const to of REQUEST_STATES) {
        expect(mayMove(from, to), `${from} -> ${to}`)
          .toBe(REQUEST_NEXT[from].includes(to));
      }
    }
  });
});

describe('what came back', () => {
  it('is kept on the request and nowhere near a production', () => {
    const made = request();
    open(made, NOW);
    const sent = submit(made, {
      assetId: 'asset_a', kind: 'video', durationSamples: 48_000 * 134,
      offsetSamples: 1200, device: 'Pixel 8 / Chrome 140', at: NOW,
    }, NOW);
    expect(sent.id).toMatch(/^sub_/);
    expect(made.submissions).toHaveLength(1);
    expect(made.state).toBe('submitted');
    expect(sent.acceptedAt).toBeUndefined();
  });

  /*
   * ONLY WHAT THEY CHOSE ARRIVES. "Take 3 doesn't have to reach the
   * server at all if they delete it locally." So a deleted take is not
   * a submission that gets removed — it is one that never existed, and
   * nothing here needs a notion of it. [T4]
   */
  it('counts down the takes a request will still accept', () => {
    const made = request({ allowed: { video: true, takes: 2 } });
    open(made, NOW);
    submit(made, { assetId: 'a', kind: 'video', at: NOW }, NOW);
    expect(takesLeft(made)).toBe(1);
    submit(made, { assetId: 'b', kind: 'video', at: NOW }, NOW);
    expect(takesLeft(made)).toBe(0);
    expect(() => submit(made, { assetId: 'c', kind: 'video', at: NOW }, NOW))
      .toThrow(/accepts 2 submission/);
  });

  it('allows one submission when the request did not say', () => {
    const made = request({ allowed: { video: true } });
    open(made, NOW);
    submit(made, { assetId: 'a', kind: 'video', at: NOW }, NOW);
    expect(takesLeft(made)).toBe(0);
  });

  /* A request is a door that admits exactly one kind of answer. */
  it('refuses a kind of answer the request did not ask for', () => {
    const made = request({ allowed: { video: true } });
    open(made, NOW);
    expect(() => submit(made, { assetId: 'a', kind: 'audio', at: NOW }, NOW))
      .toThrow(/does not ask for sound/);
    expect(() => submit(made, { assetId: 'a', kind: 'text', said: 'yes', at: NOW }, NOW))
      .toThrow(/does not ask for writing/);
  });

  it('refuses a take count that is not a count', () => {
    for (const takes of [0, -1, 1.5]) {
      expect(() => request({ allowed: { video: true, takes } }), String(takes))
        .toThrow(/at least one submission/);
    }
  });
});

describe('accepting one, which is the only moment the separation ends', () => {
  function submitted(): ParticipationRequest {
    const made = request();
    open(made, NOW);
    submit(made, { assetId: 'asset_a', kind: 'video', at: NOW }, NOW);
    submit(made, { assetId: 'asset_b', kind: 'video', at: NOW }, NOW);
    receive(made, NOW);
    return made;
  }

  /*
   * IT HANDS BACK WHAT WAS ACCEPTED AND WRITES NOTHING INTO A
   * PRODUCTION. A domain module that reached into a performance would be
   * participation reaching into production, which is the thing D-25
   * exists to prevent — so the studio that owns the document does the
   * attaching, with this as its input.
   */
  it('marks the one, and leaves the other alone', () => {
    const made = submitted();
    const second = made.submissions![1]!;
    const got = accept(made, second.id, LATER, 'owner');
    expect(got.id).toBe(second.id);
    expect(got.acceptedAt).toBe(LATER);
    expect(made.submissions![0]!.acceptedAt).toBeUndefined();
    expect(made.state).toBe('accepted');
  });

  it('refuses a submission that is not on this request', () => {
    expect(() => accept(submitted(), 'sub_nothing', LATER, 'owner'))
      .toThrow(/no submission/);
  });

  /* Nothing is part of a production before this. */
  it('leaves everything unaccepted until somebody accepts it', () => {
    const made = submitted();
    expect(made.submissions!.every((s) => !s.acceptedAt)).toBe(true);
    expect(made.state).toBe('received');
  });

  it('records who decided, because a queue is worked by people', () => {
    const made = submitted();
    accept(made, made.submissions![0]!.id, LATER, 'owner');
    expect(made.history.at(-1)).toEqual({ state: 'accepted', at: LATER, by: 'owner' });
  });
});

describe('the states, as a shape', () => {
  /* Data, not booleans: the difference between asking "where is this"
     and reconstructing it from three flags. [U-18] */
  it('is a table, so a new state has one place to be added', () => {
    const named = new Set<RequestState>(REQUEST_STATES);
    for (const [from, tos] of Object.entries(REQUEST_NEXT)) {
      expect(named.has(from as RequestState), from).toBe(true);
      for (const to of tos) expect(named.has(to), `${from} -> ${to}`).toBe(true);
    }
    expect(Object.keys(REQUEST_NEXT)).toHaveLength(REQUEST_STATES.length);
  });

  /* Every state is reachable from the beginning, or it is decoration. */
  it('can reach every state from created', () => {
    const seen = new Set<RequestState>(['created']);
    for (let pass = 0; pass < REQUEST_STATES.length; pass += 1) {
      for (const state of [...seen]) {
        for (const next of REQUEST_NEXT[state]) seen.add(next);
      }
    }
    expect([...seen].sort()).toEqual([...REQUEST_STATES].sort());
  });
});

/**
 * DECIDING ABOUT SOMETHING IS RECEIVING IT.  [T10, T16a]
 *
 * `submitted` is the CLIENT's word — the phone says it sent one — and
 * `received` is the producer's, and the table allows only
 * `submitted → received`. That is right: a producer who has not got
 * it cannot have an opinion about it. What it must not become is a
 * button called "I have it" in front of the buttons that matter.
 *
 * Found in a browser: the first accept of a real submission came
 * back "a submitted request cannot become accepted" — the table
 * being right and the caller being wrong.
 */
describe('a producer deciding about something just submitted', () => {
  const at = '2026-09-30T00:00:00.000Z';
  const sent = () => {
    const request = newRequest({
      holder: { kind: 'performance', id: 'perf_one' },
      assignment: {
        kind: 'performance', asks: 'Sing it',
        reference: { title: 'A song', durationSamples: 240000 },
      },
      allowed: { video: true, takes: 3 },
      token: 'a'.repeat(40),
      now: at,
    });
    open(request, at);
    submit(request, {
      assetId: 'sub_one' as never, kind: 'video', at,
    }, at);
    return request;
  };

  it('is received on the way past, and only once', () => {
    const request = sent();
    expect(request.state).toBe('submitted');
    accept(request, request.submissions![0]!.id, at, 'owner');
    expect(request.state).toBe('accepted');
    /* And the step it passed through is in the history, because a
       state nothing recorded is a state nobody can audit. */
    expect(request.history.map((one) => one.state))
      .toContain('received');
  });

  it('is the same for passing on one', () => {
    const request = sent();
    reject(request, at, 'owner');
    expect(request.state).toBe('rejected');
  });

  it('is the same for holding one', () => {
    const request = sent();
    hold(request, at, 'owner');
    expect(request.state).toBe('reviewed');
  });

  /* And it does not fire when there was nothing to pass through: a
     request already received is not received twice. */
  it('does not receive one that has been received already', () => {
    const request = sent();
    receive(request, at);
    const before = request.history.filter((one) => one.state === 'received').length;
    hold(request, at, 'owner');
    expect(request.history.filter((one) => one.state === 'received'))
      .toHaveLength(before);
  });
});
