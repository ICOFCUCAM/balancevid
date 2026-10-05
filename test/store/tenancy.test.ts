/**
 * What an account owns lives underneath it.  [Doctrine D-06, U-24, U-25]
 *
 * D-06: "Tenant isolation is enforced at the data layer, not in application
 * code alone. One user reaching another's unpublished recordings is the
 * worst incident this product can have." On a filesystem store the data
 * layer is the path, so this is where that sentence either becomes true or
 * stays an intention.
 *
 * THE RISKY HALF IS THE MOVE, not the layout. Every deployment made before
 * accounts existed holds its work at `var/conversations` and three siblings,
 * and those directories are hours of recorded speech that exist nowhere
 * else. So most of what is tested here is the migration refusing to do
 * anything clever.
 */

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { OWNER_ACCOUNT_ID } from '../../src/domain/account.js';

let root: string;
let paths: typeof import('../../src/store/paths.js').paths;
let owned: typeof import('../../src/store/paths.js').owned;
let ensureDirs: typeof import('../../src/store/paths.js').ensureDirs;
let forget: typeof import('../../src/store/paths.js').forgetStorageMigration;

beforeAll(async () => {
  root = await mkdtempRoot();
  process.env['BALANCEVID_VAR'] = root;
  ({
    paths, owned, ensureDirs, forgetStorageMigration: forget,
  } = await import('../../src/store/paths.js'));
});

async function mkdtempRoot(): Promise<string> {
  const { mkdtemp } = await import('node:fs/promises');
  return mkdtemp(join(tmpdir(), 'bv-tenancy-'));
}

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

beforeEach(async () => {
  /* Each test is a process that has just come up onto this volume. */
  forget();
  for (const entry of await readdir(root).catch(() => [])) {
    await rm(join(root, entry), { recursive: true, force: true });
  }
});

/** A document at the address a pre-accounts instance used. */
async function oldWork(root_: string, kind: string, id: string): Promise<void> {
  await mkdir(join(root_, kind, id), { recursive: true });
  await writeFile(join(root_, kind, id, 'thing.json'), '{"real":true}', 'utf8');
}

describe('where the work lives', () => {
  it('puts everything an account owns underneath it', () => {
    const under = `accounts/${OWNER_ACCOUNT_ID}`;
    expect(paths.conversations()).toContain(under);
    expect(paths.performances()).toContain(under);
    expect(paths.channels()).toContain(under);
    expect(paths.library()).toContain(under);
    /* And the things composed from them follow without being told. */
    expect(paths.document('conv_1')).toContain(under);
    expect(paths.channelSegment('chan_1', 4)).toContain(under);
    expect(paths.deck('deck_1')).toContain(under);
  });

  /*
   * THE INSTANCE'S OWN THINGS ARE NOT THE ACCOUNT'S. A job queue belongs to
   * the worker pool that drains it, speech models are versioned with the
   * code, and the playout heartbeat is about a process. Filing those under
   * whoever happens to be the first account would be wrong the day there is
   * a second one.
   */
  it('leaves what belongs to the instance at the top', () => {
    const under = `accounts/${OWNER_ACCOUNT_ID}`;
    expect(paths.queue()).not.toContain(under);
    expect(paths.accounts()).not.toContain(under);
  });

  /*
   * The isolation claim itself: an id cannot climb out of its account's
   * tree, because `safe()` refuses anything with a separator in it. This is
   * what makes the path a boundary rather than a convention. [D-06]
   */
  it('cannot be walked out of with a hostile id', () => {
    for (const nasty of ['../../other', 'a/b', '..', 'x\u0000y']) {
      expect(() => paths.conversation(nasty), nasty).toThrow(/unsafe/);
    }
    expect(() => owned('../elsewhere')).toThrow(/unsafe/);
  });
});

describe('moving an instance that already has work', () => {
  it('carries all four roots underneath the account', async () => {
    await oldWork(root, 'conversations', 'conv_old');
    await oldWork(root, 'performances', 'perf_old');
    await oldWork(root, 'channels', 'chan_old');
    await mkdir(join(root, 'library', 'decks'), { recursive: true });
    await writeFile(join(root, 'library', 'ident.png'), 'x', 'utf8');

    await ensureDirs();

    expect(await readdir(paths.conversations())).toContain('conv_old');
    expect(await readdir(paths.performances())).toContain('perf_old');
    expect(await readdir(paths.channels())).toContain('chan_old');
    expect(await readdir(paths.library())).toContain('ident.png');
    /* And nothing is left behind at the old address. */
    expect(await readdir(root)).not.toContain('conversations');
  });

  /*
   * The worker, the web tier and the playout engine all start together.
   * Whichever loses is told the source is gone, which is the answer and not
   * a failure.
   */
  it('is safe when three processes do it at once', async () => {
    await oldWork(root, 'conversations', 'conv_race');
    const { ensureDirs: a } = await import('../../src/store/paths.js');
    await Promise.all([a(), a(), a()]);
    expect(await readdir(paths.conversations())).toContain('conv_race');
  });

  it('does nothing the second time', async () => {
    await oldWork(root, 'conversations', 'conv_twice');
    await ensureDirs();
    await ensureDirs();
    expect(await readdir(paths.conversations())).toEqual(['conv_twice']);
  });

  it('is content when there was never anything to move', async () => {
    await ensureDirs();
    expect(await readdir(paths.conversations())).toEqual([]);
  });

  /*
   * TWO SETS OF WORK IS NOT A THING TO GUESS AT. If both addresses hold
   * something, merging or overwriting would destroy one of them, and which
   * one is not a decision a startup script gets to make silently. Both are
   * left exactly as they are.
   */
  it('refuses to choose when both addresses hold work', async () => {
    await oldWork(root, 'conversations', 'conv_old');
    await mkdir(paths.conversations(), { recursive: true });
    await writeFile(join(paths.conversations(), 'marker'), 'new', 'utf8');

    await ensureDirs();

    /* Nothing was deleted, on either side. */
    expect(await readdir(join(root, 'conversations'))).toContain('conv_old');
    expect(await readdir(paths.conversations())).toContain('marker');
  });
});

/**
 * AND NOTHING NAMES ANOTHER INSTALLATION'S RECORD.
 *   [GO-VIRAL V-8, separation two; D-06]
 *
 * > *"A customer's installation has no path function that names a
 * > network record, which is the same kind of enforcement
 * > `owned()` already is — a missed path join cannot reach
 * > outside the tree."*
 *
 * THE BALANCEVID PUBLIC COMPETITION NETWORK IS AN INSTALLATION,
 * not a tier above one, and the whole weight of that claim rests
 * on there being no way to write its records from here. On a
 * filesystem store the way to name somebody else's record is to
 * have their ORIGIN in a path — so what is checked is that no
 * path function will take one, and that every path this module
 * can produce lands under one of four roots on this volume.
 *
 * DERIVED FROM THE MODULE AND NOT FROM A LIST SOMEBODY KEEPS UP
 * TO DATE. A `network/` root added tomorrow fails this without
 * anybody remembering to come back, which is the only form of
 * this assertion worth writing. [D-19]
 */
describe('and nothing reaches another installation', () => {
  /**
   * The arguments that are not identifiers, and why each is not.
   *
   * NAMED RATHER THAN QUIETLY SKIPPED, because an exemption
   * nobody can see is an exemption nobody can argue with — and
   * because the reason is the same argument the test is making.
   * None of these three can carry an origin: a number has no
   * separator to carry it with, and a type of four words is
   * chosen at the call site rather than arriving from HTTP.
   */
  const NOT_AN_ID: Record<string, number[]> = {
    /* One of four words, fixed by its type. */
    queueState: [0],
    /* A version number and a segment number. Arithmetic, not names. */
    performanceVersion: [1],
    channelSegment: [1],
  };

  /** What may sit directly under the volume. */
  const ROOTS = ['accounts', 'overlays', 'queue', 'senders'];

  function every(): [string, (...args: string[]) => string][] {
    return Object.entries(paths)
      .filter(([, value]) => typeof value === 'function') as
      [string, (...args: string[]) => string][];
  }

  it('has every path on this installation\'s own volume', () => {
    for (const [name, fn] of every()) {
      const made = fn(...Array.from({ length: fn.length }, () => 'thing_1'));
      expect(made.startsWith(`${root}/`), `${name} -> ${made}`).toBe(true);
    }
  });

  /*
   * FOUR ROOTS AND NO FIFTH. This is the assertion a network
   * record would have to break: it has to live somewhere, and
   * everywhere it could live is named here.
   */
  it('puts everything under one of four roots and invents no other', () => {
    const seen = new Set<string>();
    for (const [, fn] of every()) {
      const made = fn(...Array.from({ length: fn.length }, () => 'thing_1'));
      seen.add(made.slice(root.length + 1).split('/')[0]!);
    }
    expect([...seen].sort()).toEqual(ROOTS);
  });

  /*
   * AND AN ORIGIN CANNOT GET INTO A PATH, BY EITHER OF THE TWO
   * MECHANISMS THIS MODULE HAS.
   *
   * `safe()` REFUSES ONE, because `https://network.example` holds
   * a colon and two separators and the alphabet it issues has
   * neither — so a route trying to file a record under the
   * installation it came from could not express the path.
   *
   * AND THE EXTENSIONS SCRUB ONE, which is the other half and the
   * reason this is not written as *throws*. `asset(id, assetId,
   * ext)` strips everything but letters and digits from its last
   * argument, so an origin passed there becomes a meaningless
   * suffix on a file inside this account's own tree. Writing the
   * assertion as *throws* would have said the module was wrong
   * where it is merely strict in a different way.
   *
   * WHAT IS ACTUALLY CLAIMED IS THE OUTCOME: whatever is handed
   * in, the path is still on this volume and the argument has
   * introduced no separator, no parent and no scheme.
   */
  it('cannot be handed an origin wherever it takes an id', () => {
    const origins = [
      'https://network.example', 'network.example', '//network.example',
      'https:/network.example', '../../network.example',
    ];
    for (const [name, fn] of every()) {
      if (fn.length === 0) continue;
      const exempt = NOT_AN_ID[name] ?? [];
      for (const origin of origins) {
        /* In every position, not only the first: a path function
           that filed `assets/<id>/<origin>` would be as wrong. */
        for (let slot = 0; slot < fn.length; slot += 1) {
          if (exempt.includes(slot)) continue;
          const args = Array.from(
            { length: fn.length }, (_, i) => (i === slot ? origin : 'thing_1'));
          const where = `${name}(${slot}) ${origin}`;
          let made: string | null = null;
          try {
            made = fn(...args);
          } catch (error) {
            expect(String(error), where).toMatch(/unsafe/);
            continue;
          }
          expect(made.startsWith(`${root}/`), where).toBe(true);
          for (const forbidden of [':', '//', '..']) {
            expect(made.includes(forbidden), `${where} -> ${made}`).toBe(false);
          }
        }
      }
    }
  });

  /*
   * A CUSTOMER'S OWN CALLS ARE THEIR OWN, which is the first
   * separation and the half of it that lives on disk. A campaign
   * is a record like any other and is filed like one. [V-8]
   */
  it('files a call under the account that opened it', () => {
    const under = `accounts/${OWNER_ACCOUNT_ID}`;
    expect(paths.campaigns()).toContain(under);
    expect(paths.campaignDocument('camp_1')).toContain(under);
  });
});

/*
 * A LANGUAGE ARRIVES FROM A URL.  [CHANNEL §7, D-06, N-10]
 *
 * `channelAudio` is the one path function whose argument is typed
 * by a stranger, so it is the one that has to refuse a traversal
 * — and it refuses by producing a harmless path inside the
 * channel's own directory rather than by throwing, which keeps
 * every caller the same shape and makes the request a 404.
 */
describe('an alternate audio path (N-10)', () => {
  const MINE = 'chan_aaaaaaaaaaaaaaaaaaaa';

  it('stays inside the channel it was asked about', () => {
    for (const language of [
      '../../../../etc', '..', '../other', 'fr/../../..', '/etc/passwd',
      'fr\u0000', 'f', '', ' ', 'a'.repeat(40),
    ]) {
      const where = paths.channelAudio(MINE, language);
      expect(where.startsWith(paths.channelAudioRoot(MINE)), language).toBe(true);
      expect(where.includes('..'), language).toBe(false);
    }
  });

  /*
   * A ONE-LETTER TAG IS NOT A LANGUAGE. It cannot escape the
   * directory, but it is not a subtag either, and a path
   * function that accepted it would be the only thing in this
   * product with its own idea of what a language is. [D-19]
   */
  it('refuses what is not a subtag, not merely what is dangerous', () => {
    for (const language of ['f', 'e1', '1en', 'en-', 'en--GB', 'toolongatag']) {
      expect(paths.channelAudio(MINE, language), language)
        .toBe(paths.channelAudioRoot(MINE));
    }
  });

  it('accepts the subtags a broadcaster actually uses', () => {
    for (const language of ['en', 'fr', 'swa', 'pt-BR', 'zh-Hant']) {
      expect(paths.channelAudio(MINE, language))
        .toBe(`${paths.channelAudioRoot(MINE)}/${language.toLowerCase()}`);
    }
  });

  /* A refused language lands on the root, which holds no
     segments, so the request 404s exactly as an unproduced one
     does. */
  it('refuses by producing a path with nothing in it', () => {
    expect(paths.channelAudio(MINE, '../..')).toBe(paths.channelAudioRoot(MINE));
  });

  it('numbers a segment the way the video segments are numbered', () => {
    expect(paths.channelAudioSegment(MINE, 'fr', 12))
      .toBe(`${paths.channelAudio(MINE, 'fr')}/12.ts`);
    expect(paths.channelAudioSegment(MINE, 'fr', -3))
      .toBe(`${paths.channelAudio(MINE, 'fr')}/0.ts`);
  });
});

/*
 * AND THE TWO PATHS THAT CAME AFTER IT.  [§7, §17, §23, D-06]
 *
 * `channelAudio` was *the one path function whose argument is
 * typed by a stranger* when it was written, and it is now one of
 * three: a caption track names a language the same way, and a
 * rung of the ladder names a preset. Both reach the path builder
 * off a URL, both refuse by producing a harmless path rather
 * than by throwing, and the rule above holds for all three.
 *
 * TESTED SEPARATELY RATHER THAN BY A LOOP OVER THE THREE,
 * because they do not refuse the same things: a language is a
 * subtag and a rung is one of five words, and a test that
 * checked them with one predicate would be a test that could
 * not tell which of the two rules it was holding up. [D-04]
 */
describe('a caption path (§17)', () => {
  const MINE = 'chan_aaaaaaaaaaaaaaaaaaaa';

  it('stays inside the channel it was asked about', () => {
    for (const language of [
      '../../../../etc', '..', '../other', 'fr/../../..', '/etc/passwd',
      'fr\u0000', 'f', '', ' ', 'a'.repeat(40),
    ]) {
      const where = paths.channelSubtitle(MINE, language);
      expect(where.startsWith(paths.channelSubtitleRoot(MINE)), language)
        .toBe(true);
      expect(where.includes('..'), language).toBe(false);
    }
  });

  /* The same rule about what a language IS, by the same
     function — one answer, not two. [D-19] */
  it('accepts a subtag and refuses what is not one', () => {
    expect(paths.channelSubtitle(MINE, 'pt-BR'))
      .toBe(`${paths.channelSubtitleRoot(MINE)}/pt-br`);
    expect(paths.channelSubtitle(MINE, 'toolongatag'))
      .toBe(paths.channelSubtitleRoot(MINE));
  });

  /* `.vtt`, because a caption segment is text and the route
     serves it as `text/vtt`. Served as anything else a browser
     hands the bytes to the wrong reader and the track silently
     carries nothing. */
  it('numbers a segment the way the others are, and names it vtt', () => {
    expect(paths.channelSubtitleSegment(MINE, 'en', 12))
      .toBe(`${paths.channelSubtitle(MINE, 'en')}/12.vtt`);
    expect(paths.channelSubtitleSegment(MINE, 'en', -3))
      .toBe(`${paths.channelSubtitle(MINE, 'en')}/0.vtt`);
  });
});

describe('a rung path (§23)', () => {
  const MINE = 'chan_aaaaaaaaaaaaaaaaaaaa';

  it('stays inside the channel it was asked about', () => {
    for (const rung of [
      '../../../../etc', '..', '../other', 'low/../../..', '/etc/passwd',
      'low\u0000', '', ' ', 'a'.repeat(40),
    ]) {
      const where = paths.channelRung(MINE, rung);
      expect(where.startsWith(paths.channelRungRoot(MINE)), rung).toBe(true);
      expect(where.includes('..'), rung).toBe(false);
    }
  });

  /*
   * THE FIVE WORDS AND NOTHING ELSE. A rung is a `QualityId`,
   * not a free string: `standard` is a directory and `banana`
   * is a request for one that will never hold a segment.
   */
  it('accepts a preset and refuses anything else', () => {
    for (const rung of ['low', 'standard', 'high', 'maximum', 'ultra']) {
      expect(paths.channelRung(MINE, rung))
        .toBe(`${paths.channelRungRoot(MINE)}/${rung}`);
    }
    for (const rung of ['banana', 'LOW', 'constructor', 'standard ']) {
      expect(paths.channelRung(MINE, rung), rung)
        .toBe(paths.channelRungRoot(MINE));
    }
  });

  /* Transport, like the house rendition it is an alternative
     to, numbered on the same grid. */
  it('numbers a segment the way the house rendition is', () => {
    expect(paths.channelRungSegment(MINE, 'low', 12))
      .toBe(`${paths.channelRung(MINE, 'low')}/12.ts`);
  });

  /*
   * AND IT IS NOT INSIDE `stream/`. A set-top box is already
   * reading that address and a ladder must not move what was
   * already there. [D-18]
   */
  it('leaves the house rendition where it was', () => {
    expect(paths.channelRungRoot(MINE).startsWith(paths.channelStream(MINE)))
      .toBe(false);
    expect(paths.channelSegment(MINE, 12))
      .toBe(`${paths.channelStream(MINE)}/12.ts`);
  });
});
