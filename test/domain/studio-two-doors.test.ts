/**
 * No way to start another song from inside one, and a link that
 * promised more than it gives.
 *   [Doctrine D-13, D-19, D-21, U-02; TAKE-PLATFORM P1]
 *
 * > *"the studio two suppose to have add project or New project,
 * > and library. One Take link could be sent to multiple people
 * > who will send 3 each of their take mobile videos"*
 *
 * TWO REPORTS, AND THE CODE ANSWERED THEM DIFFERENTLY.
 *
 * THE FIRST WAS A DOOR NAILED SHUT. `StudioBar` dropped the
 * `href` from whichever studio you were already in — reasonable
 * sounding, since a link to where you are is no link. But you
 * were not where it goes: you were inside ONE performance and the
 * tab's destination is the LIST, which is the only place
 * `StartPerformance` has ever lived. So from inside a song there
 * was no way to begin another, and the intake was built,
 * correct, and reachable from one page this bar never pointed at.
 *
 * THE SECOND WAS ALREADY HALF TRUE AND HALF A TRAP. Three takes
 * per link is not a feature to add: `POST /api/performances/<id>/
 * requests` has defaulted to `takes: body.takes ?? 3` all along.
 * But `takesLeft` counts against the REQUEST, not the person, so
 * one link sent to five people is three goes BETWEEN them — and
 * the panel labelled an unnamed one *"Anybody with the link"*,
 * which is exactly the reading that produces a choir sharing
 * three takes and two singers told the link is full.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { roomFor } from '../../src/domain/rooms.js';
import { takesLeft } from '../../src/domain/participation.js';
import type { ParticipationRequest } from '../../src/domain/participation.js';

const bare = (path: string) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('getting back out of a studio', () => {
  /*
   * EVERY STUDIO'S TAB GOES SOMEWHERE, including the one you are
   * standing in — because what it goes to is the list, not the
   * document. A tab with no href is a dead control on the only
   * bar the page has. [D-13]
   */
  it('the bar links each studio to its own list while you are in it', () => {
    const BAR = bare('app/StudioBar.tsx');
    for (const studio of ['studio-one', 'studio-two', 'online-tv']) {
      expect(BAR, studio).toMatch(
        new RegExp(`current === '${studio}'\\s*\\n?\\s*\\? roomFor\\('${studio}'\\)\\.href`));
    }
    /* And never silently nothing, which is what it did. */
    expect(BAR).not.toMatch(/\.\.\.\(current === 'studio-two' \? \{\} :/);
    expect(BAR).not.toMatch(/\.\.\.\(current === 'studio-one' \? \{\} :/);
    expect(BAR).not.toMatch(/\.\.\.\(current === 'online-tv' \? \{\} :/);
  });

  /*
   * AND THE TAB IS RENDERED AS A LINK, which the first attempt
   * at this fix was not. The bar returned a `<span>` for the tab
   * you were on BEFORE looking at whether it had an `href`, so
   * the href was discarded and the page did not change at all.
   * Opening the page caught it; no assertion about the href
   * could have. [U-02, D-13]
   */
  it('and renders the current tab as a link when it has one', () => {
    const BAR = bare('app/StudioBar.tsx');
    /* The span branch is now the one for a tab with nowhere to go. */
    expect(BAR).toMatch(/if \(on && !tab\.href\) \{/);
    expect(BAR).toMatch(/if \(on && tab\.href\) \{[\s\S]{0,200}<a key=\{tab\.id\}/);
    /* And it still says which section you are in. */
    expect(BAR.match(/aria-current="page"/g) ?? []).toHaveLength(2);
    /* The old unconditional span is gone. */
    expect(BAR).not.toMatch(/if \(on\) \{[\s\S]{0,40}<span/);
  });

  /*
   * AND IT IS THE SAME ADDRESS THE HOME PAGE USES. Two lists for
   * one studio is how a product grows a second front door that
   * only half the app knows about. [D-19]
   */
  it('and uses the one address the rest of the building uses', () => {
    expect(roomFor('studio-two').href).toBe('/p');
    expect(roomFor('studio-one').href).toBe('/c');
    expect(roomFor('online-tv').href).toBe('/t');
    expect(bare('app/StudioBar.tsx')).toMatch(/from '\.\.\/src\/domain\/rooms\.js'/);
  });

  /*
   * AND THE LIST IS WHERE A NEW ONE BEGINS, which is the only
   * reason linking to it is worth anything.
   */
  it('and that list is where the intake is', () => {
    expect(bare('app/p/page.tsx')).toMatch(/StartPerformance/);
    expect(bare('app/c/page.tsx')).toMatch(/StartConversation/);
    expect(bare('app/t/page.tsx')).toMatch(/StartChannel/);
  });

  /* The Library tab already went to the library; it was not the
     thing that was missing, and it is not changed. */
  it('leaves the Library tab alone, which already worked', () => {
    expect(bare('app/StudioBar.tsx')).toMatch(/id: 'library'[\s\S]{0,80}href: '\/#performances'/);
  });
});

describe('what one take link actually gives', () => {
  const link = (over: Partial<ParticipationRequest> = {}): ParticipationRequest => ({
    id: 'req_1', holder: { kind: 'performance', id: 'perf_1' },
    assignment: { asks: 'Sing' }, allowed: { video: true, takes: 3 },
    token: 't'.repeat(40), state: 'sent', createdAt: '2026-10-09T00:00:00.000Z',
    ...over,
  } as unknown as ParticipationRequest);

  /*
   * THREE GOES IS ALREADY THE DEFAULT, and was before any of this
   * — `takes: body.takes ?? 3` in the performance requests route.
   * Nothing to add; the panel simply never said it.
   */
  it('three takes, which Studio Two has always asked for', () => {
    expect(takesLeft(link())).toBe(3);
    expect(bare('app/api/performances/[id]/requests/route.ts'))
      .toMatch(/takes: body\.takes \?\? 3/);
  });

  /*
   * BUT THE ALLOWANCE IS ON THE LINK, NOT THE PERSON. This is the
   * whole of the misunderstanding: five people holding one link
   * share three goes, and the fourth is told it is full having
   * done nothing.
   */
  it('and they are shared by whoever holds it, not three each', () => {
    const used = link({
      submissions: [
        { id: 's1' }, { id: 's2' },
      ] as unknown as ParticipationRequest['submissions'],
    });
    expect(takesLeft(used)).toBe(1);
    /* A third from anybody at all closes it for everybody. */
    const full = link({
      submissions: [
        { id: 's1' }, { id: 's2' }, { id: 's3' },
      ] as unknown as ParticipationRequest['submissions'],
    });
    expect(takesLeft(full)).toBe(0);
  });

  /*
   * SO THE PANEL SAYS SO WHERE THE LINK IS MADE — the moment the
   * decision is taken, against a mistake that is otherwise only
   * discovered from the complaints. [D-21]
   */
  it('and the panel says it before one is sent to everybody', () => {
    const PANEL = bare('app/p/[id]/PerformersPanel.tsx');
    expect(PANEL).toMatch(/data-testid="one-link-one-performer"/);
    expect(PANEL).toMatch(/One link, one performer, three goes/);
    expect(PANEL).toMatch(/make a link each/);
  });

  /*
   * AND THE LABEL THAT INVITED THE MISTAKE IS GONE. It was true —
   * a bearer token is usable by whoever holds it — and it read as
   * an instruction to share one.
   */
  it('no longer labels a nameless link “anybody with the link”', () => {
    const PANEL = bare('app/p/[id]/PerformersPanel.tsx');
    expect(PANEL).not.toMatch(/\?\? 'Anybody with the link'/);
    expect(PANEL).toMatch(/\?\? 'Unnamed performer'/);
  });
});
