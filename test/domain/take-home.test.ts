/**
 * The Take App's home, and taking part without an invitation.
 *   [TAKE-PLATFORM P1, P2, P3, P4, P5, P6, U5, PART FIVE; D-03, D-25, U-31]
 *
 * *"I actually think Take App should not feel like a recording utility
 * with a library attached. If the user opens it and sees only 'My Takes,'
 * it will feel narrow and disposable."*
 *
 * So `/take` is the other door: somebody who was sent nothing, arriving
 * to see what this installation offers. `/take/<link>` remains one
 * assignment for one person.
 *
 * THE ONE GENUINELY NEW POWER IS A PUBLIC WRITE, and it is the only
 * write on this instance a stranger may make that CREATES something.
 * Most of this file is about the conditions on it, because that is
 * where the risk is.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { mayBePublic } from '../../src/auth/policy.js';
import {
  CLAIMS_BY_DEFAULT, availabilityFrom, claimsAllowed, mayClaim,
} from '../../src/domain/availability.js';
import { asOrigin } from '../../app/take/connections.js';

const ROOT = join(import.meta.dirname, '..', '..');
const code = (file: string) => readFileSync(join(ROOT, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*/gm, '');

const HOME = code('app/take/TakeHome.tsx');
const PAGE = code('app/take/page.tsx');
const CLAIM = code('app/api/participate/[kind]/[id]/route.ts');
const FIELDS = code('app/AvailabilityFields.tsx');
const CONN = code('app/take/connections.ts');
/*
 * THE RULES MOVED AND THE STORAGE DID NOT. Take Software for
 * desktop keeps the same list in a file beside its own settings
 * and must not have its own opinion about what an origin is — so
 * `asOrigin`, the stored-list reader and the what-an-installation-
 * may-say rule are shared, and this file keeps `localStorage` and
 * a `fetch` from a page. [D-19, TAKE-DESKTOP T-2]
 */
const MODEL = code('shared/src/connections.ts');
const LIST = code('app/api/participate/route.ts');

describe('the home is reachable without an account', () => {
  /*
   * WHICH IS THE PREMISE. A person browsing for a song to sing on has
   * no account here by construction, and neither does the browser
   * fetching the listing for them.
   */
  it('opens /take and its listing to a stranger', () => {
    expect(mayBePublic('/take', 'GET')).toBe(true);
    expect(mayBePublic('/take/', 'GET')).toBe(true);
    expect(mayBePublic('/api/participate', 'GET')).toBe(true);
  });

  /*
   * AND OPENS NOTHING ELSE UNDER IT. The home pattern is anchored with
   * no segment after it, so the only other way into `/take/…` is a
   * link shaped like a credential.
   */
  it('does not open a bare id as though it were a link', () => {
    expect(mayBePublic('/take/perf_abc', 'GET')).toBe(false);
    expect(mayBePublic('/take/anything/else', 'GET')).toBe(false);
    /* A real link still works: id, a dot, and a secret. */
    expect(mayBePublic('/take/req_abc.SECRETSECRETSECRET', 'GET')).toBe(true);
  });
});

describe('taking part without an invitation', () => {
  /*
   * THE ONLY CREATING WRITE A STRANGER MAY MAKE, so the rule names the
   * method as well as the path — a rule that names a route without
   * naming what may be done to it is not a rule about anything, which
   * this file learnt from a real hole.
   */
  it('is allowed as a POST and nothing else', () => {
    expect(mayBePublic('/api/participate/music/perf_abc', 'POST')).toBe(true);
    for (const method of ['DELETE', 'PUT', 'PATCH']) {
      expect(mayBePublic('/api/participate/music/perf_abc', method)).toBe(false);
    }
  });

  /* And it reaches no further than its own shape. */
  it('does not open anything else under the same prefix', () => {
    expect(mayBePublic('/api/participate/music/perf_abc/extra', 'POST')).toBe(false);
    expect(mayBePublic('/api/participate/music', 'POST')).toBe(false);
    expect(mayBePublic('/api/participate', 'POST')).toBe(false);
  });

  /*
   * THE AUTHOR OPENED THE DOOR, NOT US. `respondable` says a take may
   * be sent by SOMEBODY; `listed` says it may be found. Neither alone
   * is permission for a stranger, and the route requires both plus the
   * policy being `anyone`.
   */
  it('requires the author to have opened it to anyone, and listed it', () => {
    const conditions = CLAIM.match(
      /if \(!isListed\(publication\) \|\| !maySubmit\(publication, 'anyone'\)\) return no\(\);/g);
    expect(conditions).toHaveLength(3);
  });

  /* Unpublished or withdrawn is refused before anything else. */
  it('refuses anything unpublished or withdrawn', () => {
    const guards = CLAIM.match(
      /if \(!publication \|\| publication\.unpublishedAt\) return no\(\);/g);
    expect(guards).toHaveLength(3);
  });

  /*
   * ONE REFUSAL FOR EVERY REASON. A route that answered "no such
   * performance" and "that is closed" differently would be a way to
   * enumerate somebody's drafts. [D-03]
   */
  it('answers alike whatever the reason', () => {
    expect(CLAIM).toMatch(/const no = \(\) => fail\(404,/);
    /* Including the catch: a load that throws must not be a tell. */
    const caught = CLAIM.slice(CLAIM.lastIndexOf('catch (error)'));
    expect(caught).toMatch(/return no\(\);/);
    /* And there is no other failure message to compare against. */
    const messages = [...CLAIM.matchAll(/fail\(\d+, '([^']+)'/g)].map((m) => m[1]);
    expect(new Set(messages).size).toBeLessThanOrEqual(2);
  });

  /*
   * IT MINTS THE SAME OBJECT A PRODUCER MINTS, which is the whole
   * design: no self-service request type, no second invitation model.
   * Once it exists, a claimed request is indistinguishable from an
   * invited one and everything downstream works unchanged. [P35, D-19]
   */
  it('creates an ordinary participation request', () => {
    expect(CLAIM).toMatch(/newRequest\(\{/);
    expect(CLAIM).toMatch(/holder: \{ kind: 'performance'/);
    expect(CLAIM).toMatch(/holder: \{ kind: 'conversation'/);
    expect(CLAIM).toMatch(/holder: \{ kind: 'channel'/);
    /* And nothing else: no parallel store, no second object. */
    expect(CLAIM).not.toMatch(/interface [A-Z]/);
  });

  /* A conversation is judged by the predicate that already exists. */
  it('uses isRespondable for a conversation', () => {
    expect(CLAIM).toMatch(/if \(!isRespondable\(conversation\)\) return no\(\);/);
  });
});

describe('the four sections', () => {
  /*
   * THREE OF THEM ARE ONE QUERY GROUPED BY KIND — not three
   * subsystems, and not three fetches. [U5, D-19]
   */
  it('fetches once and groups', () => {
    const fetches = HOME.match(/fetch\('\/api\/participate'/g);
    expect(fetches).toHaveLength(1);
    expect(HOME).toMatch(/rows\.filter\(\(row\) => row\.kind === section\.kind\)/);
    for (const id of ['music', 'video', 'programme']) {
      expect(HOME).toContain(`kind: '${id}'`);
    }
  });

  /* Each is named as the brief names it. */
  it('is Music, Video, Online TV and My Takes', () => {
    expect(HOME).toMatch(/title: 'Music'/);
    expect(HOME).toMatch(/title: 'Video'/);
    expect(HOME).toMatch(/title: 'Online TV'/);
    expect(HOME).toMatch(/My takes/);
  });

  /* And the verb matches what is being offered. */
  it('asks for the right thing per kind', () => {
    expect(HOME).toMatch(/return 'Take this song'/);
    expect(HOME).toMatch(/return 'Respond'/);
    expect(HOME).toMatch(/return 'Send something in'/);
  });

  /*
   * WATCH BEFORE DECIDING, which is the brief's own order for video
   * and Online TV and right for a song too: nobody sings on something
   * they have not heard.
   */
  it('offers a way to hear it first', () => {
    expect(HOME).toMatch(/data-testid="row-watch"/);
    expect(HOME).toMatch(/row\.kind === 'music' \? 'Listen' : 'Watch'/);
  });
});

describe('what the home offers, and what it does not', () => {
  /*
   * A BUTTON ONLY WHERE IT WOULD WORK. `openToAnyone` is the one
   * question a browsing surface can answer for itself; an item that is
   * respondable but narrower needs an invitation the producer hands
   * out, and a button that would be refused is a control that looks
   * like a fault. [U-19, PART FIVE]
   */
  it('offers the action only where a stranger may act', () => {
    expect(HOME).toMatch(/\{row\.openToAnyone && !isElsewhere\(row\) \? \(/);
    expect(HOME).toMatch(/data-testid="row-invite-only"/);
    expect(HOME).toMatch(/By invitation/);
  });

  /*
   * AND NOTHING AT ALL FOR SOMETHING MERELY BROWSABLE. Listed but not
   * respondable is the brief's own first row: people can discover it
   * and cannot take it.
   */
  it('offers no action on something that is only browsable', () => {
    expect(HOME).toMatch(/: row\.respondable \? \(/);
    expect(HOME).toMatch(/\) : null\}/);
  });
});

describe('my takes lives on the device', () => {
  /*
   * NOT A SHORTCUT. A list of which productions somebody is taking
   * part in is exactly what must not accumulate centrally — §12's
   * argument about the footage, applied to the participant. The server
   * is asked nothing about who this person is. [U3, P16]
   */
  it('is held in local storage and nowhere else', () => {
    expect(HOME).toMatch(/'balancevid\.take\.mine'/);
    expect(HOME).toMatch(/window\.localStorage\.setItem\(MINE/);
    /* No endpoint is asked who this person is. */
    expect(HOME).not.toMatch(/\/api\/(me|account|profile|identity)/);
  });

  /* And a device that cannot remember still works. [U-19] */
  it('survives storage being refused', () => {
    expect(HOME).toMatch(/catch \{\s*\n[\s\S]{0,200}return \[\];/);
  });

  /*
   * THE LINK IS KEPT BEFORE THE PAGE MOVES. It is returned once and is
   * the credential; losing it between the response and the navigation
   * would lose the only copy. [T2a]
   */
  it('keeps the link before it navigates to it', () => {
    const take = HOME.slice(HOME.indexOf('const take = useCallback'));
    expect(take.indexOf('keepMine(')).toBeLessThan(take.indexOf('window.location.href'));
  });

  /*
   * AND IT IS NOT SHOWN EMPTY. A first-time visitor has none, and an
   * empty "My Takes" at the top of the first screen is the narrow,
   * disposable impression the brief is trying to avoid.
   */
  it('is absent until there is something in it', () => {
    expect(HOME).toMatch(/\{mine\.length > 0 && \(/);
  });
});

describe('the page itself says nothing', () => {
  /*
   * THE SAME RULE `/take/<link>` FOLLOWS. The list is fetched by the
   * client, so a page source cannot carry a title its author had not
   * decided to show. [D-03]
   */
  it('renders no content on the server', () => {
    expect(PAGE).toMatch(/return <TakeHome \/>;/);
    expect(PAGE).not.toMatch(/listPerformances|listConversations|participate/);
  });

  /*
   * AND IT SAYS WHOSE INSTALLATION THIS IS. One Take App speaks to
   * many independent BalanceVid installations, and somebody taking
   * part in three should never be unsure which they are looking at.
   * [P13, P22]
   */
  it('says where what you record ends up', () => {
    /*
     * IT USED TO SAY "one BalanceVid installation", which was true
     * when the home could only show one. With several in the list
     * that sentence is wrong in the direction that matters: it would
     * tell a musician with three production companies that the three
     * are one place.
     */
    expect(HOME).toMatch(/Every BalanceVid keeps its own productions/);
    expect(HOME).toMatch(/this list is on your device/);
    expect(HOME).not.toMatch(/one BalanceVid installation/);
  });
});

describe('the ceiling on claims', () => {
  /*
   * THE EXPOSURE THIS CLOSES, and it was one I opened: each press of
   * "Take this song" writes a request, so an item set to `anyone`
   * without a bound is an item opened to a script. The client's own
   * memory covers the accidental repeat and not the deliberate one.
   */
  it('is finite when nobody set one', () => {
    expect(CLAIMS_BY_DEFAULT).toBeGreaterThan(0);
    expect(claimsAllowed(undefined)).toBe(CLAIMS_BY_DEFAULT);
    expect(claimsAllowed({ respondable: true, access: 'anyone' }))
      .toBe(CLAIMS_BY_DEFAULT);
  });

  /*
   * SILENCE IS A BOUND THEY CAN RAISE, not an unbounded number. A
   * producer ticking "anyone" is saying WHO may take part, not
   * agreeing to how many.
   */
  it('takes the number a producer gave, including zero', () => {
    expect(claimsAllowed({ respondable: true, access: 'anyone', claims: 5 })).toBe(5);
    expect(claimsAllowed({ respondable: true, access: 'anyone', claims: 0 })).toBe(0);
  });

  /* And never a value that is not a count. */
  it('refuses a ceiling that is not a whole number of takes', () => {
    for (const bad of [-1, 1.5, NaN, Infinity]) {
      expect(claimsAllowed({ respondable: true, access: 'anyone', claims: bad }))
        .toBe(CLAIMS_BY_DEFAULT);
    }
  });

  it('stops letting people in once it is reached', () => {
    const open = { respondable: true, listed: true, access: 'anyone' as const, claims: 2 };
    expect(mayClaim(open, 0)).toBe(true);
    expect(mayClaim(open, 1)).toBe(true);
    expect(mayClaim(open, 2)).toBe(false);
    expect(mayClaim(open, 99)).toBe(false);
  });

  /* A ceiling never opens a door the policy keeps shut. */
  it('lets nobody in where the policy would not', () => {
    expect(mayClaim({ respondable: false, claims: 100 }, 0)).toBe(false);
    expect(mayClaim({ respondable: true, access: 'invited', claims: 100 }, 0)).toBe(false);
    expect(mayClaim({ respondable: true, access: 'link', claims: 100 }, 0)).toBe(false);
  });

  /*
   * IT COUNTS CLAIMS AND NOT INVITATIONS. A producer inviting a choir
   * must not spend the ceiling the public is coming through — which is
   * the whole reason `claimed` exists on the request.
   */
  it('counts only what strangers claimed', () => {
    expect(CLAIM).toMatch(/\.filter\(\(one\) => one\.claimed/);
    expect(CLAIM).toMatch(/claimed: true,/);
    const marks = CLAIM.match(/claimed: true,/g);
    expect(marks).toHaveLength(3);
  });

  /* One per holder, each counting its own. */
  it('bounds every kind, against its own holder', () => {
    expect(CLAIM).toMatch(/mayClaim\(publication, await claimsSoFar\('performance', performance\.id\)\)/);
    expect(CLAIM).toMatch(/mayClaim\(publication, await claimsSoFar\('conversation', conversation\.id\)\)/);
    expect(CLAIM).toMatch(/mayClaim\(publication, await claimsSoFar\('channel', channel\.id\)\)/);
  });

  /*
   * A FULL ITEM ANSWERS LIKE A CLOSED ONE. A counter a stranger can
   * read is a counter a stranger can watch. [D-03]
   */
  it('says nothing about being full', () => {
    expect(CLAIM).not.toMatch(/full|limit reached|too many/i);
  });

  /*
   * AND THE CEILING IS OFFERED ONLY WHERE IT DOES SOMETHING. Every
   * policy but `anyone` means the producer hands out the invitations,
   * and a control that cannot act looks like a fault. [U-19]
   */
  it('is asked for only where strangers can come through', () => {
    expect(FIELDS).toMatch(
      /\{respondable && \(value\.access \?\? 'anyone'\) === 'anyone' && \(/);
    expect(FIELDS).toMatch(/data-testid=\{`\$\{testId\}-claims`\}/);
    expect(FIELDS).toMatch(/do\s*\n?\s*not count towards it/);
  });

  /*
   * AND NOTHING THAT IS NOT A COUNT IS EVER WRITTEN DOWN.
   *
   * A MUTATION SURVIVED HERE: `availabilityFrom` accepting any number
   * left every test passing, because `claimsAllowed` refuses a
   * fractional or negative ceiling when it READS one, so behaviour
   * stayed safe. What it does not prevent is `claims: 1.5` being
   * persisted into the document and handed back to the producer as
   * the number they set. A stored value nobody will honour is a lie
   * told to whoever reads it next.
   */
  it('writes down nothing that is not a whole count', () => {
    for (const bad of [1.5, -1, NaN, Infinity, '5', null, {}]) {
      expect(
        availabilityFrom({ respondable: true, access: 'anyone', claims: bad }).claims,
        String(bad),
      ).toBeUndefined();
    }
    expect(availabilityFrom({ respondable: true, access: 'anyone', claims: 0 }).claims)
      .toBe(0);
  });

  /* And it is not stored where it would mean nothing. */
  it('is not kept on an item strangers cannot claim', () => {
    expect(availabilityFrom({ respondable: true, access: 'invited', claims: 5 }).claims)
      .toBeUndefined();
    expect(availabilityFrom({ respondable: false, claims: 5 }).claims).toBeUndefined();
    expect(availabilityFrom({ respondable: true, access: 'anyone', claims: 5 }).claims)
      .toBe(5);
  });
});

describe('many installations, one app', () => {
  /*
   * *"Imagine you are a musician. Your Take app might have… each a
   * separate production environment. Yet you have one Take App."*
   *
   * THE LIST LIVES ON THE DEVICE, which is §12's argument about the
   * footage turned on the participant: which production companies
   * somebody works with must not accumulate centrally, and there is no
   * index above them to ask.
   */
  it('remembers installations on the device and nowhere else', () => {
    expect(CONN).toMatch(/'balancevid\.take\.instances'/);
    expect(CONN).toMatch(/window\.localStorage\.setItem\(KEY/);
    /* No registry is consulted, and none exists to consult. */
    expect(CONN).not.toMatch(/registry|directory|balancevid\.com/i);
  });

  /*
   * READ ACROSS, ACT ON THE OWNER — the division the whole thing turns
   * on. Merging three listings is a cross-origin GET of public data.
   * Claiming is a WRITE and gets no CORS at all, so it happens on the
   * installation that will hold the recording.
   */
  it('reads other installations but never claims on them', () => {
    expect(LIST).toMatch(/'access-control-allow-origin': '\*'/);
    /* The claim route is the POST beside it, and has no CORS header. */
    expect(CLAIM).not.toMatch(/access-control-allow-origin/i);
  });

  it('sends a person to the owner rather than claiming for them', () => {
    expect(HOME).toMatch(/data-testid="row-take-there"/);
    expect(HOME).toMatch(/href=\{`\$\{row\.from!\.origin\}\/take`\}/);
    /* The button that claims is only for rows belonging to this page. */
    expect(HOME).toMatch(/\{row\.openToAnyone && !isElsewhere\(row\) \? \(/);
  });

  /*
   * A CROSS-ORIGIN READ CARRIES NO COOKIE, and not merely by default:
   * the listing must not vary by who is asking, so a credential could
   * only add risk. Stated where a reader would otherwise have to check.
   */
  it('asks other installations without credentials', () => {
    expect(CONN).toMatch(/credentials: 'omit'/);
    expect(LIST).not.toMatch(/allow-credentials/i);
  });

  /*
   * AN INSTALLATION MAY NAME ITSELF AND MAY NOT PLACE ITSELF. A row
   * that carried its own origin would be a row that could claim
   * somebody else's — so the origin stored is the one this device
   * actually reached.
   */
  it('trusts an installation for its name and not for its address', () => {
    /* `reached` is the origin the device actually got an answer
       from; nothing in the answer can replace it. */
    expect(MODEL).toMatch(/return \{ name: said\.name\.slice\([^)]*\), origin: reached \}/);
    expect(MODEL).not.toMatch(/origin:\s*said\./);
    expect(HOME).toMatch(/from\?: \{ name: string; origin: string \}/);
  });

  /*
   * AN ORIGIN IS REFUSED RATHER THAN REPAIRED. What is stored is
   * somewhere this device will later fetch from and send a person to,
   * so nearly-a-URL is worse than nothing.
   */
  it('refuses anything that is not an origin', () => {
    expect(asOrigin('')).toBeNull();
    expect(asOrigin('   ')).toBeNull();
    expect(asOrigin('javascript:alert(1)')).toBeNull();
    /*
     * A REFUSED SCHEME MUST NOT BECOME A DIFFERENT ORIGIN. The first
     * version prepended `https://` to anything not starting `http`,
     * so `ftp://studio.example` became `https://ftp` — a reachable
     * host nobody typed. Caught here.
     */
    expect(asOrigin('ftp://studio.example')).toBeNull();
    expect(asOrigin('file:///etc/passwd')).toBeNull();
    expect(asOrigin('data:text/html,x')).toBeNull();
    /* Credentials in a URL make one origin look like another. */
    expect(asOrigin('https://evil@studio.example')).toBeNull();
    expect(asOrigin('https://a:b@studio.example')).toBeNull();
  });

  /*
   * A SCHEME IS NOT A PORT. A browser run refused `localhost:3101`
   * as though `localhost:` were a scheme, so a self-hosted
   * installation on a port could not be added at all — while
   * `ftp://` still had to be refused. The digit is what separates
   * them: a port is digits, and no scheme begins with one.
   */
  it('tells a port from a scheme', () => {
    expect(asOrigin('localhost:3101')).toBe('https://localhost:3101');
    expect(asOrigin('studio.example:8443')).toBe('https://studio.example:8443');
    expect(asOrigin('http://localhost:3101')).toBe('http://localhost:3101');
  });

  it('keeps only the origin of something that is one', () => {
    expect(asOrigin('https://studio.example/take?x=1#y')).toBe('https://studio.example');
    expect(asOrigin('  https://studio.example/  ')).toBe('https://studio.example');
    expect(asOrigin('http://localhost:3100/anything')).toBe('http://localhost:3100');
    /* A bare host is what somebody types; the safe scheme is assumed. */
    expect(asOrigin('studio.example')).toBe('https://studio.example');
  });

  /*
   * ONE THAT CANNOT BE REACHED IS SHOWN, NOT DROPPED. A self-hosted
   * installation on a laptop is often simply asleep, and a connection
   * that silently disappears is a person wondering whether they
   * imagined adding it. [U-19, P20]
   */
  it('says when an installation is not answering', () => {
    expect(HOME).toMatch(/not answering just now/);
    expect(HOME).toMatch(/setAsleep\(quiet\)/);
  });

  /*
   * AND THE LABEL APPEARS ONLY WHEN IT SAYS SOMETHING. With one
   * installation, naming it on every row says the only thing that
   * could be true. [U-19]
   */
  it('labels a row with its installation only where there are several', () => {
    expect(HOME).toMatch(/connections\.length > 0 && row\.from\?\.name !== row\.author/);
  });

  /*
   * AND NEVER TWICE. A browser run showed "Redemption Records ·
   * Redemption Records": a production company publishing under its
   * own name is the ordinary case, and then the author and the
   * installation are the same words.
   */
  it('does not print the same name twice', () => {
    expect(HOME).toMatch(/row\.from\?\.name !== row\.author/);
  });

  /* A remote row's watch link has to leave this origin too. */
  it('points a remote watch link at the installation that holds it', () => {
    expect(HOME).toMatch(/\$\{isElsewhere\(row\) \? row\.from!\.origin : ''\}\$\{row\.watch\}/);
  });
});

describe('a name somebody else chose', () => {
  /*
   * AN INSTALLATION NAMES ITSELF, so every label made from that name
   * is as long as a stranger decided. "The Redemption Records
   * Recording Company of Greater Manchester Limited" in a button on a
   * 412px phone pushes the title out of its own card — and `askInstance`
   * allows eighty characters, so this is a case the product will meet
   * rather than a contrived one. Bounded where it is drawn rather than
   * trusted at its source. [U-19]
   */
  it('bounds every label made from an installation name', () => {
    const button = HOME.slice(HOME.indexOf('row-take-there'),
      HOME.indexOf('</a>', HOME.indexOf('row-take-there')));
    expect(button).toMatch(/textOverflow: 'ellipsis'/);
    expect(button).toMatch(/whiteSpace: 'nowrap'/);
    /* And the whole name is still reachable, on hover. */
    expect(button).toMatch(/title=\{`Open on \$\{row\.from!\.name\}`\}/);
  });

  /*
   * TWO THINGS A MEASUREMENT CAUGHT AND READING THE CSS WOULD NOT.
   *
   * `text-overflow` does nothing on a FLEX CONTAINER, and `.btn` is
   * one — so the ellipsis on the anchor truncated nothing at all. And
   * a grid item's automatic minimum size is its MIN-CONTENT, so the
   * column grew to fit an unbreakable label and took every card with
   * it: 492px inside a 412px phone, clipped rather than scrolled,
   * with the action simply not on screen.
   */
  it('puts the ellipsis on a block, not on the flex container', () => {
    const button = HOME.slice(HOME.indexOf('row-take-there'),
      HOME.indexOf('</a>', HOME.indexOf('row-take-there')));
    expect(button).toMatch(/display: 'block', overflow: 'hidden',\s*\n\s*textOverflow: 'ellipsis'/);
  });

  it('lets the column and its cards shrink below min-content', () => {
    expect(HOME).toMatch(/width: '100%', maxWidth: 480, minWidth: 0,/);
    expect(HOME).toMatch(/minWidth: 0, overflow: 'hidden',\n\};/);
  });

  /* The name is also capped where it arrives, so nothing stores a novel. */
  it('caps the name at the door as well', () => {
    expect(MODEL).toMatch(/NAME_LONGEST = 80/);
    expect(MODEL).toMatch(/said\.name\.slice\(0, NAME_LONGEST\)/);
  });

  /*
   * AND THERE IS EXACTLY ONE ORIGIN PARSER. This is the point of
   * having moved it: `asOrigin` carries two bugs found the hard
   * way — `ftp://studio.example` becoming a reachable host called
   * `ftp`, and `localhost:3101` refused as though a port were a
   * scheme — and a desktop application with its own would make
   * both again. The tell is the scheme regex; if it ever appears
   * outside the shared library, there are two answers to what an
   * origin is. [D-19]
   */
  it('parses an origin in one place', () => {
    const everywhere = ['app', 'src', 'desktop/src', 'shared/src']
      .flatMap((dir) => readdirSync(join(ROOT, dir),
        { recursive: true, encoding: 'utf8' })
        .filter((name) => /\.tsx?$/.test(name))
        .map((name) => join(dir, name)));
    const parsers = everywhere.filter((file) =>
      /\[a-z0-9\+\.-\]\*\):\(\?!\\d\)/.test(code(file)));
    expect(parsers).toEqual([join('shared/src', 'connections.ts')]);
  });
});
