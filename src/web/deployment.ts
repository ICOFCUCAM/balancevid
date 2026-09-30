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
