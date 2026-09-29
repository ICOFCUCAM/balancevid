/**
 * Where this instance is running.  [Doctrine D-14, D-16]
 *
 * THE ARCHITECTURE SAYS LOCAL, CLOUD AND HYBRID ARE ONE PRODUCT IN TWO
 * OPERATING MODES, decided at the start rather than bolted on later. This
 * is the smallest honest piece of that: a label the interface can show
 * which is derived from the machine rather than typed into a mockup.
 *
 * IT REPORTS, IT DOES NOT DECIDE. Nothing in the product behaves
 * differently because of what this returns, and it must not start to —
 * the moment a code path branches on "are we in the cloud" there are two
 * products again, which is the thing the decision was made to avoid. Its
 * only job is to answer the question a person asks when they are looking
 * at two browser tabs and cannot remember which is the laptop.
 *
 * AND IT DOES NOT GUESS A BRAND. A host that has not said what it is gets
 * "Self-hosted", not the name of whichever platform seemed likeliest. A
 * badge that names the wrong provider is worse than a vague one, because
 * somebody will act on it.
 */

export interface Runtime {
  /** What to call it, in the badge. */
  label: string;
  /** True when this is somebody else's machine. */
  hosted: boolean;
}

/**
 * The variables each platform sets for its own reasons, which is why they
 * are trustworthy: none of them exists to be detected.
 */
const HOSTS: { env: string; label: string }[] = [
  { env: 'FLY_APP_NAME', label: 'Fly.io' },
  { env: 'RENDER', label: 'Render' },
  { env: 'RAILWAY_ENVIRONMENT', label: 'Railway' },
  { env: 'VERCEL', label: 'Vercel' },
  { env: 'K_SERVICE', label: 'Cloud Run' },
  { env: 'DYNO', label: 'Heroku' },
  { env: 'WEBSITE_INSTANCE_ID', label: 'Azure' },
  { env: 'KUBERNETES_SERVICE_HOST', label: 'Kubernetes' },
];

export function runtime(env: NodeJS.ProcessEnv = process.env): Runtime {
  /*
   * AN EXPLICIT ANSWER WINS. An operator who has written down what this
   * machine is knows better than any heuristic here, and a deployment
   * behind a proxy on hardware nobody has heard of has no other way to
   * say so.
   */
  const stated = env['BALANCEVID_RUNTIME']?.trim();
  if (stated) {
    return { label: stated, hosted: stated.toLowerCase() !== 'local' };
  }

  const found = HOSTS.find((host) => {
    const value = env[host.env];
    return value !== undefined && value !== '';
  });
  if (found) return { label: found.label, hosted: true };

  /*
   * NODE_ENV=production ON A MACHINE THAT NAMES NO PLATFORM is a server
   * somebody set up themselves. It is not "Local" — a person reading the
   * badge on their laptop must be able to tell the two apart — and it is
   * not a brand either, because we do not know one.
   */
  if (env['NODE_ENV'] === 'production') {
    return { label: 'Self-hosted', hosted: true };
  }
  return { label: 'Local', hosted: false };
}
