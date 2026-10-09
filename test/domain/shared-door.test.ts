/**
 * One link, many people, three goes each, one master.
 *   [TAKE-PLATFORM P1, P6, P39, P41; D-03, D-13, D-19, D-21, D-25]
 *
 * > *"I WANT THE TAKE THREE CHANCES FOR A PARTICULAR SONG TO HAVE
 * > AN OPTION WHERE IT COULD BE SEND TO MORE THAN ONE PERSON. AT
 * > THE END THE STUDIO WILL HAVE MULTIPLE SUBMISSION FROM THE
 * > DIFFERENT INDIVIDUALS TO CREATE THE MASTER FROM."*
 *
 * AND ALL OF IT WAS BUILT EXCEPT THE DOOR.
 *
 *   `claim()`          mints a request per claimer, each with its
 *                      OWN token and `allowed.takes = 3`
 *   the claim route    is already guest-writable, so somebody with
 *                      no account may call it
 *   every request      carries `holder: { kind: 'performance' }`,
 *                      so the submissions arrive in the one song
 *
 * Which is the concept exactly: one address, many people, three
 * goes each because the allowance is on the REQUEST and each
 * person now has their own — the same fact that made sharing a
 * single invite link wrong is what makes claiming right.
 *
 * The only thing absent was an address to send. It was reachable
 * by opening the Take App and happening to find the song, and by
 * nothing else. The ninth capability in this session built,
 * correct, documented and pointed at by nothing. [D-13]
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { mayBePublic } from '../../src/auth/policy.js';
import { accessOf, maySubmit } from '../../src/domain/availability.js';
import { takesLeft } from '../../src/domain/participation.js';
import type { ParticipationRequest } from '../../src/domain/participation.js';

const bare = (path: string) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** A request as `claim()` mints one, for one claimer. */
const claimed = (over: Partial<ParticipationRequest> = {}): ParticipationRequest => ({
  id: 'req_1', holder: { kind: 'performance', id: 'perf_1' },
  assignment: { kind: 'performance', asks: 'Sing along' },
  allowed: { video: true, takes: 3 },
  token: 'a'.repeat(40), claimed: true, state: 'sent',
  createdAt: '2026-10-09T00:00:00.000Z', ...over,
} as unknown as ParticipationRequest);

describe('what each person who opens the link gets', () => {
  /*
   * THREE GOES OF THEIR OWN. The allowance is on the request and
   * each claimer has their own request — which is why claiming
   * gives what sharing one invite link could never give.
   */
  it('their own three goes, not a share of somebody else’s', () => {
    const first = claimed({ id: 'req_1', token: 'a'.repeat(40) });
    const second = claimed({ id: 'req_2', token: 'b'.repeat(40) });
    expect(takesLeft(first)).toBe(3);
    expect(takesLeft(second)).toBe(3);

    /* The first singer uses all three. The second still has three. */
    const spent = claimed({
      id: 'req_1',
      submissions: [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
    } as unknown as Partial<ParticipationRequest>);
    expect(takesLeft(spent)).toBe(0);
    expect(takesLeft(second)).toBe(3);
  });

  /*
   * AND THEIR OWN TOKEN, which is what makes one person
   * revocable without touching the rest — the very property the
   * model cited for refusing a multi-person token, now satisfied
   * rather than traded away. [participation.ts]
   */
  it('their own credential, so one can be revoked alone', () => {
    const a = claimed({ id: 'req_1', token: 'a'.repeat(40) });
    const b = claimed({ id: 'req_2', token: 'b'.repeat(40) });
    expect(a.token).not.toBe(b.token);
  });

  /*
   * AND EVERY ONE OF THEM BELONGS TO THE SAME SONG, which is the
   * other half of the ask: the studio ends with submissions from
   * different individuals to cut one master from.
   */
  it('and all of them hang off the one performance', () => {
    for (const one of [claimed({ id: 'req_1' }), claimed({ id: 'req_2' })]) {
      expect(one.holder).toEqual({ kind: 'performance', id: 'perf_1' });
    }
  });
});

describe('the claim that mints them', () => {
  const CLAIM = bare('src/web/claim.ts');

  /* Three goes, from the one place that decides it. */
  it('gives a performance claimer three goes', () => {
    expect(CLAIM).toMatch(/allowed: \{ video: true, takes: 3 \}/);
  });

  /* A fresh secret each time, never a shared one. */
  it('and a token of their own', () => {
    expect(CLAIM).toMatch(/token: newSecret\(\)/);
  });

  /*
   * AND IT IS GATED ON THE AUTHOR'S OWN DECISIONS — both of
   * them. `openness` refuses unless `accessOf` returns a policy,
   * and that returns null unless `respondable` is set. So
   * publishing alone is a door that looks open and is not.
   *
   * MEASURED, and this is why the panel's first wording was
   * wrong: a song published with participation closed answered
   * `maySubmit: false`; published WITH participation open let two
   * strangers through, each with their own three goes.
   *   [availability.ts `accessOf`, U-02]
   */
  it('and only for a song its author published', () => {
    expect(CLAIM).toMatch(/openness\(\s*performance\.publication/);
  });

  it('and only when participation is open, not merely published', () => {
    expect(accessOf({ respondable: false } as never)).toBeNull();
    expect(accessOf(undefined)).toBeNull();
    expect(accessOf({ respondable: true } as never)).not.toBeNull();
    /* Which is what `maySubmit` turns into a yes or no. */
    const now = '2026-10-09T12:00:00.000Z';
    expect(maySubmit({ respondable: false } as never, 'anyone', now)).toBe(false);
    expect(maySubmit({ respondable: true } as never, 'anyone', now)).toBe(true);
  });
});

describe('the door, which was the only missing part', () => {
  const PAGE = bare('app/participate/[kind]/[id]/page.tsx');
  const DOOR = bare('app/participate/[kind]/[id]/Door.tsx');
  const PANEL = bare('app/p/[id]/PerformersPanel.tsx');

  /*
   * A STRANGER CAN REACH IT. The claim route is already
   * guest-writable; a page behind a sign-in would put the button
   * behind a wall the people being invited will never pass.
   */
  it('is reachable without an account', () => {
    expect(mayBePublic('/participate/music/perf_abc', 'GET')).toBe(true);
    expect(mayBePublic('/participate/music/perf_abc', 'HEAD')).toBe(true);
  });

  it('and the claim it presses was already open to them', () => {
    expect(mayBePublic('/api/participate/music/perf_abc', 'POST')).toBe(true);
  });

  /* Readable, never writable: the page is not a form. */
  it('but may not be written to', () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      expect(mayBePublic('/participate/music/perf_abc', method), method).toBe(false);
    }
  });

  /*
   * IT CLAIMS ON THE PRESS, NOT ON ARRIVAL. A request minted by
   * opening the link would be spent by everyone who looked, and
   * by every preview a messaging app fetches on their behalf —
   * twenty requests and three singers. [D-21]
   */
  it('mints nothing until somebody presses it', () => {
    expect(DOOR).toMatch(/onClick=\{\(\) => void take\(\)\}/);
    expect(DOOR).not.toMatch(/useEffect\([\s\S]{0,120}take\(\)/);
  });

  /*
   * AND NOTHING ABOUT THE SONG IS RENDERED UNTIL IT IS KNOWN TO
   * BE OPEN. A page source must not carry a title its author has
   * not decided to show, and a closed song and one that never
   * existed are one answer. [D-03]
   */
  it('says nothing about a song that is not open', () => {
    expect(PAGE).toMatch(/if \(open !== 'open'\)/);
    const before = PAGE.slice(0, PAGE.indexOf("open !== 'open'"));
    /* The import sits above the gate; what must not happen above
       it is the CALL. */
    expect(before).not.toMatch(/loadPerformance\(/);
    expect(PAGE).toMatch(/state="missing"/);
  });

  /* It walks through the door the Take App already uses. */
  it('and hands off to the recorder that already exists', () => {
    expect(DOOR).toMatch(/window\.location\.href = `\/take\/\$\{/);
    expect(DOOR).not.toMatch(/\/api\/door|\/api\/invite/);
  });

  /*
   * AND STUDIO TWO SAYS THE ADDRESS, which is the whole of what
   * was missing. A door nothing points at is the fault this file
   * is about. [D-13]
   */
  it('and Studio Two gives the producer the address', () => {
    expect(PANEL).toMatch(/\/participate\/music\/\$\{performanceId\}/);
    expect(PANEL).toMatch(/data-testid="shared-door"/);
    expect(PANEL).toMatch(/own three goes/);
  });

  /*
   * AND EXPLAINS ITSELF WHEN THE SONG IS NOT PUBLISHED, rather
   * than hiding the feature. A control that vanishes teaches
   * nobody why. [D-21]
   */
  it('and says what to do when the song is not open yet', () => {
    expect(PANEL).toMatch(/data-testid="shared-door-shut"/);
    /*
     * BOTH DECISIONS, NAMED. The first wording said only
     * "publish the song", which I had wrong until I drove it:
     * publishing decides who may WATCH, participation decides
     * who may SING, and the door needs both. Telling an operator
     * only the first is how a control comes to look broken.
     */
    expect(PANEL).toMatch(/audience participation\s+open/);
    expect(PANEL).toMatch(/who may watch it; participation/);
  });

  /* And the panel only offers the address when both are true. */
  it('and only offers the address when a stranger could really get in', () => {
    const STUDIO = bare('app/p/[id]/PerformanceStudio.tsx');
    expect(STUDIO).toMatch(/publication\.respondable/);
    expect(STUDIO).toMatch(/!performance\.publication\.unpublishedAt/);
    expect(PANEL).toMatch(/\{open_ && origin \?/);
  });
});
