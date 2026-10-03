/**
 * The producer's end of the boundary.
 *   [TAKE-APP T2, T5a, T9, T9a, T10, T10a, T11; D-25, D-19]
 *
 *     invite  →  a link to send  →  they record on a phone
 *             →  it lands here   →  preview  →  accept  →  a take
 *
 * ACCEPTING IS THE ONLY MOMENT A SUBMISSION BECOMES PRODUCTION
 * MATERIAL, and that is the whole of D-25. Until then what exists is
 * a file on a request the performance knows nothing about — not in
 * the rail, not in the timeline, not in an export. After it, there is
 * an ordinary take.
 *
 * AND IT BECOMES ONE THROUGH THE PIPELINE EVERY OTHER TAKE GOES
 * THROUGH, which is the part worth defending: the submission is put
 * where a recorder's segments go and the ordinary assembler is
 * queued. A second path that turned a file into a take would be a
 * second place alignment could be got wrong, and alignment is what
 * this studio is for. [D-19, S-3]
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const code = (file: string) => readFileSync(join(ROOT, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const ROUTE = code('app/api/performances/[id]/requests/[requestId]/route.ts');
const PANEL = code('app/p/[id]/PerformersPanel.tsx');
const MEDIA = code(
  'app/api/performances/[id]/requests/[requestId]/submissions/[submissionId]/route.ts');

describe('accepting a submission', () => {
  /*
   * THE ORDINARY ASSEMBLER, NOT A SECOND PATH. Joined, normalised,
   * MEASURED, aligned against the master, postered and stripped —
   * all of it already written, and none of it worth having twice.
   */
  it('makes a take the way every other take is made', () => {
    expect(ROUTE).toContain("kind: 'assemble_performance_take'");
    expect(ROUTE).toMatch(/paths\.performanceChunks\(id, takeId\)/);
    expect(ROUTE).toMatch(/join\(chunkDir, '000000\.part'\)/);
    /* And nothing here runs ffmpeg: the web tier never does. [U-23] */
    expect(ROUTE).not.toMatch(/ffmpeg|decodeToAnalysis|normalise/);
  });

  /*
   * THE REQUEST MOVES FIRST, THEN THE TAKE, THEN THE MEDIA.
   *
   * The first version put the take first, on U-06's argument that a
   * document should learn about a take before its media exists —
   * right about a RECORDER, where the media is arriving and may not
   * finish, and wrong here, where the media already exists and the
   * thing that can fail is the acceptance. A browser run proved it:
   * an accept the state machine refused had already put a take in
   * the rail, leaving the author somebody's name on a take with no
   * media and no way to know why.
   *
   * A copy that fails after the declaration leaves a take with no
   * media, which is exactly what a crashed recorder leaves and what
   * the product already shows and deletes.
   */
  it('accepts first, declares second, copies third', () => {
    const accepted = ROUTE.indexOf('accept(draft, submission.id, now, by)');
    const declared = ROUTE.indexOf('addTake(draft');
    const copied = ROUTE.indexOf('copyFile(');
    expect(accepted).toBeGreaterThan(0);
    expect(accepted).toBeLessThan(declared);
    expect(declared).toBeLessThan(copied);
  });

  /*
   * UNPLACED, NOT MEASURED. The phone's own number travels as a
   * HINT and the worker decides; calling it a measurement here would
   * make a stranger's clock into a fact about this performance —
   * and the worker's check against the song is what catches a phone
   * recording at a rate it did not claim. [§10, S-3, INV-06]
   */
  it('treats the phone’s own number as a hint and not a measurement', () => {
    expect(ROUTE).toMatch(/method: 'unplaced',/);
    expect(ROUTE).toMatch(/hintSamples: Math\.round\(submission\.offsetSamples \?\? 0\)/);
  });

  /* Who made it travels with it, so the rail can say. [T5a] */
  it('records who performed it', () => {
    expect(ROUTE).toMatch(/\.\.\.\(found\.participant \? \{ performer: found\.participant \} : \{\}\)/);
    expect(code('app/p/[id]/PerformanceStudio.tsx'))
      .toContain('data-testid="take-performer"');
    expect(code('src/domain/performance.ts')).toMatch(/\n {2}performer\?: string;/);
  });

  /*
   * CHECKED AGAINST THE PERFORMANCE THAT ASKED. Without it a
   * producer could act on another producer's request by editing a
   * path, which is exactly the boundary D-25 draws.
   */
  it('refuses a request that belongs to somebody else', () => {
    expect(ROUTE).toMatch(
      /found\.holder\.kind !== 'performance' \|\| found\.holder\.id !== id/);
    expect(ROUTE).toMatch(/const REQUEST = \/\^req_\[A-Za-z0-9\]\{1,64\}\$\//);
    expect(ROUTE).toMatch(/const SUBMISSION = \/\^sub_\[A-Za-z0-9_-\]\{1,120\}\$\//);
  });

  it('refuses a submission the request does not have', () => {
    expect(ROUTE).toMatch(/if \(!submission\) return fail\(404, 'no such submission'\)/);
  });

  /*
   * A SUBMISSION HAS TWO IDS — its own, which the state machine
   * moves, and the ASSET its media is under, which every route that
   * serves or accepts it is keyed on. The listing carried only the
   * first, and a browser run asked for a file by the wrong name and
   * got "no such submission" back from a panel looking straight at
   * the thing it was asking about. Three listings had the same hole.
   */
  it('tells the producer both of a submission’s ids', () => {
    for (const file of [
      'app/api/performances/[id]/requests/route.ts',
      'app/api/conversations/[id]/requests/route.ts',
      'app/api/channels/[id]/requests/route.ts',
    ]) {
      const listing = code(file);
      expect(listing, file).toMatch(/id: submission\.id,/);
      expect(listing, file).toMatch(/assetId: submission\.assetId,/);
    }
    /* And the surfaces ask by the asset, not by the other one. */
    expect(PANEL).not.toMatch(/submissionId: one\.id/);
    expect(code('app/t/[id]/AnswersTab.tsx')).toMatch(/submissionId: one\.assetId,/);
  });

  /* An unknown verb is a refusal, not a fall-through to accepting
     something. */
  it('refuses a verb it does not have', () => {
    expect(ROUTE).toMatch(
      /default: return fail\(400, 'that is not something to do with a request'\)/);
  });
});

describe('the other three decisions', () => {
  /*
   * HOLD IS NOT A REFUSAL AND NOT AN ACCEPTANCE. A queue with no
   * such state makes every arrival a decision. [T10, T16a]
   */
  it('parks one without deciding about it', () => {
    expect(ROUTE).toMatch(/case 'hold': \{[\s\S]{0,200}hold\(draft, now, by\)/);
    expect(PANEL).toContain('data-testid="performers-hold"');
    expect(PANEL).toMatch(/you have not decided/);
  });

  /* And passing is not an end: a producer may change their mind. */
  it('passes on one without ending it', () => {
    expect(ROUTE).toMatch(/case 'reject': \{[\s\S]{0,400}reject\(draft, now, by,/);
    expect(PANEL).toMatch(/Not an end — you can change your mind/);
  });

  /*
   * AND IT MAY SAY WHY.  [GO-VIRAL G8]
   *
   * Optional, which is the whole of the field: a producer passing
   * on a take in their own studio owes nobody minutes, and every
   * decline written before this one has no reason. What it buys
   * is the case the competition layer needs — *"a decline with no
   * reason is one nobody can review or reverse on grounds"* —
   * and the inbox shows it where it shows the decision.
   *
   * The behaviour is driven in `judging-route.test.ts`; what is
   * read here is that the surface offers the field and draws what
   * comes back.
   */
  it('offers a place to say why, and shows what was said', () => {
    expect(PANEL).toContain('data-testid="performers-reject-why"');
    expect(PANEL).toMatch(/placeholder="why \(optional\)"/);
    expect(PANEL).toContain('data-testid="performers-reject-says"');
    expect(PANEL).toMatch(/\{row\.passedBecause\}/);
  });

  /*
   * WITHDRAWING IS A NEW SECRET, which stops the old link working
   * for whoever holds it — including somebody who has already opened
   * it. So it asks first. [ROOM §6, D-25]
   */
  it('withdraws a link by replacing its secret, and asks first', () => {
    expect(ROUTE).toMatch(/const token = newSecret\(\);/);
    expect(ROUTE).toMatch(/rotate\(draft, token, now\)/);
    expect(PANEL).toMatch(/confirm\(\{[\s\S]{0,300}Make a new link\?/);
    expect(PANEL).toMatch(/including somebody part-way through recording/);
  });
});

describe('the panel', () => {
  /*
   * PREVIEW BEFORE DECIDING. A producer who has to accept something
   * to find out what it is has not been given a choice — and
   * accepting is the one irreversible-ish step in this flow.
   */
  it('plays a submission before anybody accepts it', () => {
    expect(PANEL).toContain('data-testid="performers-play"');
    expect(PANEL).toContain('data-testid="performers-player"');
    expect(PANEL).toMatch(/\/requests\/`\s*\n?\s*\+ `\$\{row\.id\}\/submissions\//);
  });

  /* Once accepted there is nothing left to decide, so the row says
     where it went rather than offering the buttons again. */
  it('offers nothing to decide about one already accepted', () => {
    expect(PANEL).toMatch(
      /one\.acceptedAt \? \([\s\S]{0,300}data-testid="performers-accepted"/);
  });

  /*
   * POLLED WHILE IT IS OPEN, AND NOT OTHERWISE. A submission arrives
   * from somebody else's phone and nothing here can know when;
   * polling a studio nobody is looking at is a request every six
   * seconds for a number that changes twice a day.
   */
  it('watches for submissions only while somebody is watching it', () => {
    expect(PANEL).toMatch(/if \(!open\) return undefined;/);
    expect(PANEL).toMatch(/window\.setInterval\(\(\) => \{ void read\(\); \}, 6000\)/);
    expect(PANEL).toMatch(/window\.clearInterval\(timer\)/);
  });

  /* And it says how many are waiting without being opened, or
     nobody would know to open it. [U-19] */
  it('says how many are waiting before it is opened', () => {
    expect(PANEL).toMatch(
      /const waiting = rows\.flatMap\(\(row\) => \(row\.submissions \?\? \[\]\)\s*\n?\s*\.filter\(\(one\) => !one\.acceptedAt\)\)\.length;/);
    expect(PANEL).toContain('data-testid="performers-waiting"');
  });

  /*
   * The link is a credential and appears once. [T14]
   *
   * THE ASSERTION NAMES THE PROPERTY NOW, NOT THE SETTER. It read
   * `setLink(String(data.link))` and broke when the state grew to
   * carry the ask alongside the link — which was a fix, not a
   * regression, and a test that knows the shape of a `useState` call
   * fails on every refactor and catches none of them. What matters
   * is that the link comes from the response that MADE it and is
   * never read back out of the listing.
   */
  it('shows the link once, from the response that made it', () => {
    expect(PANEL).toMatch(/link: String\(data\.link\)/);
    expect(PANEL).toMatch(/It is shown once\./);
    /* The listing carries no link, so there is nowhere else it
       could have come from. [T14] */
    const row = PANEL.slice(PANEL.indexOf('interface RequestRow'),
      PANEL.indexOf('export default function'));
    expect(row).not.toMatch(/\blink\b/);
  });

  /*
   * AND THE ASK TRAVELS WITH IT.  [T2b]
   *
   * `invite` empties the form the instant the link comes back, so a
   * share message reading the `asks` FIELD said "a part" however
   * carefully the producer had described it. Found in a browser,
   * because a source assertion that a message mentions `asks` cannot
   * tell which `asks`.
   */
  it('keeps the ask beside the link it belongs to', () => {
    expect(PANEL).toMatch(/setMade\(\{ link: String\(data\.link\), asks: asks\.trim\(\) \}\)/);
    const invite = PANEL.slice(PANEL.indexOf('const invite = useCallback'),
      PANEL.indexOf('const act = useCallback'));
    expect(invite.indexOf('setMade(')).toBeLessThan(invite.indexOf("setAsks('')"));
  });

  /* Both fields are optional: the song says what is wanted, and
     plenty of links go out before anybody knows who will answer. */
  it('asks for a name and a question, and needs neither', () => {
    expect(PANEL).toMatch(/placeholder="Who is this for\? \(optional\)"/);
    expect(PANEL).toMatch(/placeholder="What are you asking for\? \(optional\)"/);
    expect(PANEL).toMatch(/data-testid="performers-invite"\s*\n?\s*disabled=\{busy\}/);
  });
});

describe('watching one before deciding', () => {
  it('is the owner’s route, checked against this performance', () => {
    expect(MEDIA).toMatch(
      /found\.holder\.kind !== 'performance' \|\| found\.holder\.id !== id/);
  });

  /* Segments for a recording the performer deleted, or has not sent,
     are bytes they have not given anybody. [T4, D-25] */
  it('serves nothing for a recording that was never sent', () => {
    expect(MEDIA).toMatch(
      /!\(found\.submissions \?\? \[\]\)\.some\(\(one\) => one\.assetId === submissionId\)/);
  });
});

/* ------------------------------------------------------------------ *
 *  B-3 — the thing in between.
 * ------------------------------------------------------------------ */

/**
 * THE MIDDLE OF A THREE-STAGE CHAIN IS WHERE NOTHING LOOKS.
 *
 * B-2 writes `capturedIn` on a submission. B-1 reads it off a take
 * and draws a badge. Both were built, both were tested, and for one
 * stage there was nothing between them: `addTake` in the accept
 * route did not carry the field, so four angles from a real capture
 * station arrived in a performance as four attempts and the badge
 * could never fire for anything but a hand-edited document.
 *
 * *"When a stage adds a field to the model and a branch to the
 * renderer, the thing in between is where the test is missing."*
 * [C-42, C-44, C-46]
 */
describe('a capture survives being accepted', () => {
  const ACCEPT = code(
    'app/api/performances/[id]/requests/[requestId]/route.ts');

  /*
   * COPIED, NOT RE-DERIVED. The offsets were measured against each
   * other by the machine that recorded them, and this studio is not
   * in a position to improve on them.
   */
  it('carries the capture from the submission onto the take', () => {
    expect(ACCEPT).toMatch(
      /capturedIn\s*\?\s*\{\s*capturedIn:\s*submission\.capturedIn\s*\}/);
  });

  /*
   * AND STILL DOES NOT PLACE IT ON THE SONG. Where a capture sits
   * against THIS master is a different question from how far apart
   * its cameras started, and it is still the worker's. Collapsing
   * them would make a stranger's clock a fact about this
   * performance. [S-3, INV-06]
   */
  it('leaves the take unplaced on the master clock', () => {
    expect(ACCEPT).toMatch(/method: 'unplaced'/);
    expect(ACCEPT).not.toMatch(/method: 'measured'/);
  });

  /*
   * FOUR ANGLES ALL CARRY THE SAME PARTICIPANT, so four accepted
   * angles would be four takes called the same thing in the rail —
   * a list a producer cannot act on, which is the failure B-3
   * exists to stop one layer up.
   */
  it('tells four angles of one capture apart in the rail', () => {
    expect(ACCEPT).toMatch(/submission\.capturedIn\?\.id && submission\.device/);
    expect(ACCEPT).toMatch(/submission\.device\.slice\(0, 40\)/);
  });

  /* And the listing hands the panel what it needs to group. */
  it('carries the capture to the producer’s listing', () => {
    expect(code('app/api/performances/[id]/requests/route.ts'))
      .toMatch(/capturedIn: submission\.capturedIn,/);
  });

  /*
   * ONE ARRIVAL IS ONE DECISION, which grouping alone did not
   * give: the first version of this stage drew four angles as one
   * row and still put four "Use it" buttons in it, so the producer
   * was shown one thing and asked about it four times. Found on a
   * screen, not in the plan.
   */
  it('takes a capture in one press, and only what is not taken', () => {
    expect(PANEL).toMatch(/data-testid="performers-accept-capture"/);
    expect(PANEL).toMatch(/arrival\.filter\(\(one\) => !one\.acceptedAt\)\.length > 1/);
    /* Already in the rail is not offered again. */
    expect(PANEL).toMatch(/if \(one\.acceptedAt\) continue;/);
    /*
     * ONE AT A TIME. Each accept moves the request and copies a
     * file; four of those racing is four writers on one document.
     */
    expect(PANEL).toMatch(/for \(const one of arrival\) \{/);
    expect(PANEL).not.toMatch(/Promise\.all\(arrival/);
  });

  /*
   * THE INBOX AND THE MULTIVIEW USE THE SAME FUNCTIONS. Two
   * surfaces that each decided for themselves what belonged
   * together is two surfaces that can disagree about it in front of
   * a producer. [D-19]
   */
  it('groups with the functions Studio Two draws with', () => {
    expect(PANEL).toMatch(/arrivalsIn\(row\.submissions \?\? \[\]\)/);
    /*
     * THE GUARD, not merely the call. `angleSays` appears twice —
     * once deciding whether to draw and once drawing — and an
     * assertion that it appears is satisfied by a version that has
     * stopped deciding. Measured: it was.
     */
    expect(PANEL).toMatch(/\{angleSays\(arrival, one\) && \(/);
    expect(PANEL).toMatch(/\{` · \$\{angleSays\(arrival, one\)\}`\}/);
    expect(PANEL).toMatch(/from '\.\.\/\.\.\/\.\.\/src\/domain\/angles\.js'/);
    expect(code('app/p/[id]/SwitchingStage.tsx'))
      .toMatch(/from '\.\.\/\.\.\/\.\.\/src\/domain\/angles\.js'/);
  });
});
