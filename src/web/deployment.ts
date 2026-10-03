/**
 * What this running installation is.  [Doctrine D-13]
 *
 * *"Could it be telling us that features written might not even be
 *  deployed?"*
 *
 * It could, and nothing in the product could answer. `package.json` has
 * said `0.1.0` through every release; no page says what it was built
 * from; and the only way to tell one build from another was to request a
 * file that exists in the newer one and see whether it 404s.
 *
 * READ FROM THE ENVIRONMENT, AT THE MOMENT SOMEBODY ASKS. Not baked in
 * at build time: a constant compiled into the bundle is the commit the
 * IMAGE was built from, and a container can be restarted, rolled back or
 * promoted without that changing. The platform puts the truth in the
 * process, so the process is what is read.
 *
 * AND IT DEGRADES TO HONESTY. An installation started by hand — `npm
 * start` on a laptop, a container run without the platform — has none of
 * these set, and says `unknown` rather than inventing a version. A
 * version somebody cannot trust is worse than no version, because it is
 * the thing they would check before concluding a deploy had not
 * happened.
 */

/** What the deploy platform puts in the container. */
const FROM = {
  commit: 'DEPLOYPRO_GIT_SHA',
  deployment: 'DEPLOYPRO_DEPLOYMENT',
  environment: 'DEPLOYPRO_ENV',
  url: 'DEPLOYPRO_URL',
} as const;

export interface Deployment {
  /** The commit this container is running, or `unknown`. */
  commit: string;
  /** Short enough to compare by eye against a branch's head. */
  short: string;
  deployment?: string;
  environment?: string;
  url?: string;
  /** When this process started, which is when the build went live here. */
  startedAt: string;
}

const STARTED = new Date().toISOString();

export function deployment(
  env: Record<string, string | undefined> = process.env,
): Deployment {
  const commit = (env[FROM.commit] ?? '').trim() || 'unknown';
  return {
    commit,
    /*
     * SEVEN CHARACTERS, which is what git itself prints and what a
     * person compares against a branch's head without reading forty
     * hex digits. `unknown` is left whole: truncating it to `unknow`
     * would look like a hash.
     */
    short: commit === 'unknown' ? commit : commit.slice(0, 7),
    ...(env[FROM.deployment]?.trim()
      ? { deployment: env[FROM.deployment]!.trim() } : {}),
    ...(env[FROM.environment]?.trim()
      ? { environment: env[FROM.environment]!.trim() } : {}),
    ...(env[FROM.url]?.trim() ? { url: env[FROM.url]!.trim() } : {}),
    startedAt: STARTED,
  };
}

/* ------------------------------------------------------------------ *
 *  Whether this installation reviews calls.  [GO-VIRAL V-8]
 * ------------------------------------------------------------------ */

/**
 * The one installation on which a call is written by one person
 * and passed by another.
 *
 * READ FROM THE PROCESS, FOR THE SAME REASON THE COMMIT IS, AND
 * FOR A SECOND ONE THAT MATTERS MORE. *"Operating the network
 * must not become an entitlement, because an entitlement is
 * something an account can be granted and this is the one
 * capability that cannot be."* An entitlement is a field on a
 * record; a record can be edited, copied into a backup, restored
 * onto somebody else's machine and granted by whoever holds the
 * password. What a container was started with is none of those
 * things. [GO-VIRAL V-8]
 *
 * AND IT IS NOT A SECRET, WHICH IS WHY IT IS SAFE TO READ THIS
 * WAY. A self-hoster who sets it has an installation that reviews
 * its own calls — two people in one organisation, which is a
 * reasonable thing to want and costs nobody anything. What it
 * does NOT give them is any reach into another installation's
 * records: there is no path function on any installation that
 * names a record belonging to another one, which is the
 * enforcement, and this flag cannot create one. [paths.ts]
 *
 * OFF IS THE ANSWER FOR ANYTHING BUT A PLAIN YES. An installation
 * started with `BALANCEVID_REVIEW=maybe` is not half-reviewing;
 * it is an installation whose operator mistyped, and the safe
 * reading of a mistyped flag is the behaviour every installation
 * had before the flag existed.
 */
export function reviewsCalls(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const said = (env['BALANCEVID_REVIEW'] ?? '').trim().toLowerCase();
  return said === '1' || said === 'true' || said === 'yes';
}
