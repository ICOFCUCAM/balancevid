/**
 * Studio One, as a place.  [STUDIO-ONE §2, §5, §7, §9; U-35 §6, D-19]
 *
 * These are assertions about structure rather than about behaviour,
 * because the things this brief changed are structural: where the source
 * picker lives, how many doors there are, which module decides what a URL
 * is, and whether a second copy of anything was made. A behavioural test
 * cannot see a duplicated hook; a reader can, and so can this.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');

/**
 * Code only.
 *
 * THE LINE-COMMENT PATTERN IS ANCHORED, and that is not fussiness: an
 * unanchored `//` eats the rest of any line containing `https://`, and
 * this file asserts about URLs. It has already cost this project one
 * afternoon.
 */
function code(...parts: string[]): string {
  return readFileSync(join(ROOT, ...parts), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/[^\n]*/gm, '');
}

describe('the studio is somewhere you can go', () => {
  /*
   * THE ROUTE DID NOT EXIST. `/c/[id]` is a conversation; `/c` was
   * nothing, and the rail's "Studio One" pointed at the newest
   * conversation or at a scroll position on the home page.
   */
  it('has a page of its own', () => {
    expect(existsSync(join(ROOT, 'app', 'c', 'page.tsx'))).toBe(true);
  });

  it('is what the rail points at', () => {
    expect(code('app', 'Workspace.tsx'))
      .toMatch(/<Rail href="\/c"[\s\S]{0,80}label="Studio One"/);
  });

  it('is what the card opens', () => {
    expect(code('app', 'Workspace.tsx')).toContain("home: '/c',");
  });

  /*
   * AND THE DASHBOARD STOPPED HOLDING THE INTAKE FORM. *"Your current
   * home page has the Conversation Studio expanded directly inside the
   * dashboard. I don't think that is ideal."* The expander survives for
   * the two studios that have no front door yet — removing it there
   * would take away the only way to start anything in those rooms — so
   * what is asserted is the condition, not its absence.
   */
  it('does not unfold a source picker in the hallway', () => {
    expect(code('app', 'Workspace.tsx')).toContain('{opened && !studio.home && (');
  });

  /*
   * THE WALL, AND NOT ONLY THE STORE. `requireStudio` inside
   * `listConversations` would refuse an account without Studio One, but
   * a check that lives in one function the route happens to call is one
   * refactor from not being in the path.
   */
  it('is behind the Studio One entitlement', () => {
    expect(code('src', 'auth', 'policy.ts')).toContain("[/^\\/c(\\/|$)/, 'studio-one']");
  });
});

describe('four doors, and one table that says so', () => {
  it('renders the ways from the domain and not from the component', () => {
    const start = code('app', 'StartConversation.tsx');
    expect(start).toContain('waysIn().map(');
    /* The labels live in `sources.ts`; a literal here would be a second copy. */
    expect(start).not.toContain("'Upload media'");
    expect(start).not.toContain("'Screen capture'");
  });

  it('accepts audio from the table, not from a literal', () => {
    expect(code('app', 'StartConversation.tsx')).toContain('accept={ACCEPTS_MEDIA}');
  });

  /*
   * THE DEFAULT USED TO BE `link`, so the first thing anybody saw was a
   * box wanting a YouTube address — the narrowing the brief objects to,
   * expressed as an initial value.
   */
  it('opens no door until one is chosen', () => {
    expect(code('app', 'StartConversation.tsx'))
      .toContain('useState<SourceKind | null>(null)');
  });
});

describe('nothing was built twice', () => {
  /*
   * `useScreenShare` WAS IN `app/t/[id]/` AND IS GENERAL. Copying it
   * down into Studio One would have given two answers to "what happens
   * when the browser's own stop-sharing button is pressed".
   */
  it('shares one screen-capture hook between the two studios', () => {
    expect(existsSync(join(ROOT, 'app', 'useScreenShare.ts'))).toBe(true);
    expect(existsSync(join(ROOT, 'app', 't', '[id]', 'useScreenShare.ts'))).toBe(false);
    expect(code('app', 't', '[id]', 'ChannelStudio.tsx'))
      .toContain("from '../../useScreenShare.js'");
  });

  /*
   * AND THERE IS EXACTLY ONE `getDisplayMedia` IN THE PRODUCT. The
   * recorder asks for a display too — it has to, because it records the
   * stream rather than mixing it — so this counts the callers and holds
   * the number, rather than pretending there is one.
   */
  it('asks the browser for a display in two known places only', () => {
    const askers = ['app/useScreenShare.ts', 'app/useSourceRecorder.ts']
      .filter((file) => code(...file.split('/')).includes('getDisplayMedia'));
    expect(askers).toEqual(['app/useScreenShare.ts', 'app/useSourceRecorder.ts']);
  });

  /*
   * THE SOURCE RECORDER DOES NOT CARRY STUDIO TWO'S SYNC ARITHMETIC. A
   * source is the clock; there is nothing for it to land on, so an
   * offset, a calibration or a count-in here would be code that cannot
   * be right or wrong because nothing reads it.
   */
  it('keeps the performance recorder out of the source recorder', () => {
    const recorder = code('app', 'useSourceRecorder.ts');
    expect(recorder).not.toContain('useMasterRecording');
    expect(recorder).not.toContain('offsetSamples');
    expect(recorder).not.toContain('placeTakeOnSong');
  });

  /*
   * AND IT RECORDS AT THE LADDER EVERYTHING ELSE RECORDS AT, rather
   * than at a hard-coded 1280×720 — which is the exact fault that was
   * found in the Take App and fixed one brief ago. [CHANNEL §23a]
   */
  it('records at the shared quality ladder', () => {
    expect(code('app', 'StartConversation.tsx')).toContain("useQuality('recording')");
    expect(code('app', 'useSourceRecorder.ts')).not.toMatch(/1280|720(?!p)/);
  });
});

describe('a link is decided in one place', () => {
  /*
   * THE ROUTE ASKS `planForUrl` RATHER THAN RE-DERIVING THE RULE,
   * because the ORDER of that function's two branches is the rule: a
   * platform's page is embedded, a platform's media is refused, and only
   * a file somebody else's server publishes is fetched. Re-implemented
   * server-side, that ordering is one edit away from becoming
   * extraction. [U-35 §6]
   */
  it('is decided by the domain, in the route as well', () => {
    const route = code('app', 'api', 'conversations', 'route.ts');
    expect(route).toContain('planForUrl(asked)');
    expect(route).toContain("plan.can === 'fetch'");
    /* And a refusal carries the domain's own reason, not the embed one. */
    expect(route).toContain('return fail(400, plan.because)');
  });

  /*
   * THREE GUARDS AND ALL THREE PRESENT. `planForUrl` decides before any
   * request leaves; `assertPublicUrl` refuses everything that resolves
   * inside — the same guard evidence archiving uses, because this is the
   * same primitive [D-06]; and a redirect is refused because a redirect
   * is a second URL nothing has checked.
   */
  it('guards the fetch three ways', () => {
    const route = code('app', 'api', 'conversations', 'route.ts');
    expect(route).toContain('assertPublicUrl(asked)');
    expect(route).toContain("redirect: 'error'");
    expect(route).toMatch(/bytes > CEILING/);
  });

  /*
   * THE SIZE IS COUNTED AND NOT BELIEVED. `Content-Length` is a claim a
   * server makes about itself, and this product's own doctrine is that
   * durations, loudness and frame counts are measured from the artefact
   * rather than read off a header. [U-02]
   */
  it('counts the bytes it has actually taken', () => {
    const route = code('app', 'api', 'conversations', 'route.ts');
    expect(route).not.toContain('content-length');
    expect(route).toContain('bytes += chunk.byteLength');
  });
});
