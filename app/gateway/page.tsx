import type { Metadata } from 'next';

import { canonicalFor } from '../../src/web/hosting.js';
import Icon from '../Icon.js';
import ProductAtlas from './ProductAtlas.js';
import Reveal from './Reveal.js';
import SiteNav from './SiteNav.js';
import './gateway.css';

/**
 * balancevid.com — the public product gateway.
 *   [TV-NETWORK N-1; Doctrine D-21, D-24, U-19]
 *
 * > *"Do not create a separate BalanceVid TV website yet. Build
 * > `balancevid.com/tv` as a public, pre-login television
 * > network. Then keep `balancevid.com` → public
 * > BalanceVid/product gateway and `balancevid.com/app/...` →
 * > authenticated production environment."*
 *
 * THE MAP ASKED FOR THIS PAGE AND THIS IS THE PAGE. Until now the
 * installation's front door was the sign-in form: a stranger who
 * typed the address was asked for a password before being told
 * what the password was for. The television network at `/tv`, the
 * participation app at `/take` and the campaign directory at
 * `/go` were all public and all unreachable from the root.
 *
 * SIGNED OUT GETS THIS; SIGNED IN GETS THE BUILDING. The decision
 * is `middleware.ts`'s, where the session already is, and it is
 * a rewrite rather than a redirect so the public address of the
 * public site is `/` and not `/gateway`. Asking twice whether
 * somebody is signed in is how two answers come to disagree.
 * [D-19]
 *
 * EVERY WORD, EVERY NUMBER AND EVERY BREAK IS THE BRIEF'S. The
 * headlines break where it breaks them, the feature lists carry
 * all eight items, the comparison table carries all ten rows and
 * the plans carry no limits — because the brief says, in the one
 * piece of copy on the page that is about itself, *"This page
 * intentionally does not invent storage, processing or
 * infrastructure limits."* That sentence is kept, and so is the
 * discipline behind it. [D-21]
 *
 * ELEVEN LINKS POINT AT `#`, AND THEY ARE LEFT THAT WAY ON
 * PURPOSE. Documentation, the API, release notes, the self-hosted
 * guide, the specification sheet, four desktop and server
 * downloads, and the company pages do not exist yet. Three
 * choices were available: delete them, point them somewhere
 * plausible, or leave them where the brief put them. The first
 * loses the shape of the site, the second is the lie D-21 is
 * about, and the third is a list of what is left to build that
 * is visible to everyone who looks at the page. Each becomes a
 * route as it is built. Everything that DOES exist is wired:
 * `/tv`, `/take`, `/go` and `/signin`.
 *
 * THE NINE PHOTOGRAPHS ARE SWAPPABLE BY FILENAME. Each is named
 * for the slot it fills — `balancevid-hero.jpg`,
 * `balancevid-online-tv.jpg` — and nothing but the file itself
 * decides what is in it. Replacing the art is replacing a file.
 */

/**
 * WHAT THIS PAGE SAYS ABOUT ITSELF.
 *
 * `metadataBase` COMES FROM THE INSTALLATION'S OWN NAME, through
 * the same helper the canonical tag uses, because a relative
 * `og:image` is resolved against it and Next's default is
 * `localhost:3000` — which is the address every social card would
 * have carried. Where no host is configured there is no base, no
 * absolute image, and no claim; the title and description still
 * work. [N-8, U-19]
 */
const base = canonicalFor('/', process.env['BALANCEVID_HOST']);

export const metadata: Metadata = {
  ...(base ? { metadataBase: new URL(base) } : {}),
  title: 'BalanceVid — The Video Platform You Can Run Your Way',
  description:
    'BalanceVid — The video platform you can run your way. Create, record, '
    + 'produce, broadcast and distribute video from one connected system.',
  openGraph: {
    type: 'website',
    title: 'BalanceVid — The Video Platform You Can Run Your Way',
    description:
      'Create, record, produce, broadcast and distribute video from one '
      + 'connected system — in the cloud or on infrastructure you control.',
    ...(base ? {
      images: [{
        url: '/images/balancevid-card.jpg',
        width: 2048,
        height: 758,
        alt: 'Creators recording and streaming on BalanceVid.',
      }],
    } : {}),
  },
  twitter: { card: base ? 'summary_large_image' : 'summary' },
};

/** The four steps the spine names, and the strip repeats. */
const SPINE: { number: string; title: string }[] = [
  { number: '01', title: 'Create' },
  { number: '02', title: 'Produce' },
  { number: '03', title: 'Broadcast' },
  { number: '04', title: 'Participate' },
];

/** The same four, as the places this system calls them. */
const SYSTEM: { says: string; name: string }[] = [
  { says: '01 / INTERACTIVE', name: 'Studio One' },
  { says: '02 / PERFORMANCE', name: 'Studio Two' },
  { says: '03 / TELEVISION', name: 'Online TV' },
  { says: '04 / PARTICIPATION', name: 'Take' },
];

/**
 * Cloud against self-hosted, every row of it.
 *
 * `true` IS THE TICK AND IT IS NOT A CHARACTER. The brief writes
 * the last four rows as `✓`, which is whatever the reader's
 * font has — a hairline in one family and a heavy brush in
 * another, and nothing at all in a few. It is drawn from the
 * product's own icon set instead, and the cell carries the word
 * for a screen reader, which a `✓` never did. [D-14]
 */
const SPEC: { of: string; cloud: string | true; self: string | true }[] = [
  { of: 'Infrastructure', cloud: 'BalanceVid', self: 'You' },
  { of: 'Server management', cloud: 'Managed', self: 'You control' },
  { of: 'Software updates', cloud: 'Managed', self: 'You control' },
  { of: 'Media storage', cloud: 'According to plan', self: 'Your infrastructure' },
  { of: 'Scaling', cloud: 'Cloud plan', self: 'Your infrastructure' },
  { of: 'Installation', cloud: 'Ready to use', self: 'Install yourself' },
  { of: 'Take integration', cloud: true, self: true },
  { of: 'Studio One', cloud: true, self: true },
  { of: 'Studio Two', cloud: true, self: true },
  { of: 'Online TV', cloud: true, self: true },
];

/** One cell of it: a word, or the tick and the word behind it. */
function Says({ it }: { it: string | true }) {
  if (it !== true) return <td>{it}</td>;
  return (
    <td className="check">
      <Icon name="passed" size={16} />
      <span className="off-screen">Included</span>
    </td>
  );
}

/** The four plans, which name no limits. */
const PLANS: { number: string; name: string; says: string }[] = [
  { number: '01', name: 'Starter', says: 'For getting started.' },
  { number: '02', name: 'Professional', says: 'For serious production.' },
  { number: '03', name: 'Business', says: 'For organizations and channels.' },
  { number: '04', name: 'Enterprise', says: 'For large deployments.' },
];

interface Card {
  number: string;
  name: string;
  says: string;
  href: string;
}

/*
 * THE DOWNLOAD CENTRE. Take installs from `/take` — it is a
 * progressive web application, which is how it reaches both
 * phones, and the page offers the installation itself. The four
 * below it are built and not yet served from anywhere, so they
 * keep the brief's `#`.
 */
const DOWNLOADS: Card[] = [
  { number: '01 / MOBILE', name: 'Take for Android',
    says: 'Audience participation.', href: '/take' },
  { number: '02 / MOBILE', name: 'Take for iOS',
    says: 'Audience participation.', href: '/take' },
  { number: '03 / DESKTOP', name: 'BalanceVid Windows',
    says: 'Desktop production environment.', href: '#' },
  { number: '04 / DESKTOP', name: 'BalanceVid Linux',
    says: 'Desktop production environment.', href: '#' },
  { number: '05 / SERVER', name: 'Self-hosted Installation',
    says: 'Deploy BalanceVid on your infrastructure.', href: '#' },
  { number: '06 / TECHNICAL', name: 'System Requirements',
    says: 'Current supported environments.', href: '#' },
];

const DOCS: Card[] = [
  { number: '01', name: 'Getting Started',
    says: 'Understand the platform.', href: '#' },
  { number: '02', name: 'Cloud',
    says: 'Deploy and operate BalanceVid Cloud.', href: '#' },
  { number: '03', name: 'Self-hosted',
    says: 'Install and operate your own system.', href: '#' },
  { number: '04', name: 'Take',
    says: 'Participation architecture.', href: '#' },
  { number: '05', name: 'Online TV',
    says: 'Channels, schedules and playout.', href: '#' },
  { number: '06', name: 'API',
    says: 'Connect your systems.', href: '#' },
];

const FOOTER: { of: string; links: { says: string; href: string }[] }[] = [
  {
    of: 'Products',
    links: [
      { says: 'Studio One', href: '#products' },
      { says: 'Studio Two', href: '#products' },
      { says: 'Online TV', href: '/tv' },
      { says: 'Take', href: '/take' },
      { says: 'Go Viral', href: '/go' },
    ],
  },
  {
    of: 'Platform',
    links: [
      { says: 'Cloud', href: '#platform' },
      { says: 'Self-hosted', href: '#platform' },
      { says: 'Downloads', href: '#downloads' },
      { says: 'Pricing', href: '#pricing' },
      { says: 'Specifications', href: '#' },
    ],
  },
  {
    of: 'Developers',
    links: [
      { says: 'Documentation', href: '#' },
      { says: 'API', href: '#' },
      { says: 'Self-hosted Guide', href: '#' },
      { says: 'Release Notes', href: '#' },
    ],
  },
  {
    of: 'Company',
    links: [
      { says: 'About', href: '#' },
      { says: 'Contact', href: '#' },
      { says: 'Enterprise', href: '#' },
      { says: 'Campaigns', href: '/go' },
      { says: 'Privacy', href: '#' },
    ],
  },
];

export default function Gateway() {
  return (
    <div className="bv-site">

      <SiteNav />

      <main>

        {/* HERO */}

        <section className="hero" id="start">
          <div className="container hero-grid">

            <div className="hero-copy">
              <div className="eyebrow">THE VIDEO PLATFORM YOU CAN RUN YOUR WAY.</div>

              <h1>
                Video should<br />
                not end at play.
              </h1>

              <p className="hero-lead">
                Create, record, produce, broadcast and distribute video
                from one connected system — in the cloud or on infrastructure
                you control.
              </p>

              <div className="hero-actions">
                <a className="button blue" href="#products">Explore BalanceVid</a>
                <a className="button light" href="#pricing">Compare Plans</a>
              </div>
            </div>

            <aside className="hero-spine">
              {SPINE.map((one) => (
                <div className="spine-item" key={one.number}>
                  <span className="spine-number">{one.number}</span>
                  <span className="spine-title">{one.title}</span>
                </div>
              ))}
            </aside>

          </div>
        </section>


        {/* SYSTEM SPINE */}

        <section className="system-strip">
          <div className="container system-line">
            {SYSTEM.map((one) => (
              <div className="system-step" key={one.name}>
                <span>{one.says}</span>
                <strong>{one.name}</strong>
              </div>
            ))}
          </div>
        </section>


        {/* PRODUCTS */}

        <section className="section section-dark" id="products">

          <div className="container">

            <div className="section-header">
              <div className="eyebrow">ONE PLATFORM / FOUR PRODUCTS</div>

              <div>
                <h2>One system.<br />Four ways to create.</h2>
                <p>
                  BalanceVid connects interactive video, performance production,
                  continuous television and audience participation without
                  forcing them into separate platforms.
                </p>
              </div>
            </div>

            <ProductAtlas />

          </div>
        </section>


        {/* ONLINE TV */}

        <section className="section tv-section" id="tv">

          <div className="container">

            <div className="tv-stage">

              <div className="tv-copy">

                <div className="live-pill">
                  <span className="live-dot"></span>
                  INTERNET TELEVISION
                </div>

                <h2>Your channel.<br />Running around the clock.</h2>

                <p>
                  Build a real channel with programming, live production,
                  playout, schedules and distribution. BalanceVid turns your
                  content library into a continuous television service.
                </p>

                <a className="button light" href="/tv">Explore Online TV</a>

              </div>

            </div>

          </div>
        </section>


        {/* TAKE */}

        <section className="section take-section">

          <div className="container">

            <div className="take-grid">

              <div className="take-copy">

                <div className="eyebrow" style={{ color: 'var(--cyan)' }}>
                  AUDIENCE PARTICIPATION
                </div>

                <h2>The audience can take part.</h2>

                <p>
                  A BalanceVid channel can send a Participation Request
                  directly to Take. The audience records, submits and becomes
                  part of the production without taking ownership away from
                  the destination installation.
                </p>

                <a className="button light" href="/take">Explore Take</a>

              </div>

              <div className="take-image"></div>

            </div>

          </div>
        </section>


        {/* GO VIRAL */}

        <section className="section campaign" id="campaigns">

          <div className="container">

            <div className="campaign-stage">

              <div className="campaign-copy">

                <div className="eyebrow" style={{ color: 'var(--cyan)' }}>
                  GO VIRAL / MUSIC CAMPAIGNS
                </div>

                <h2>Turn music into participation.</h2>

                <p>
                  Artists and music companies can publish campaigns through
                  Take. Discover the song, record a video, submit it, compete,
                  share it and distribute selected results.
                </p>

                <a className="button light" href="/go">Explore Go Viral</a>

              </div>

            </div>

          </div>
        </section>


        {/* DEPLOYMENT */}

        <section className="section section-dark" id="platform">

          <div className="container">

            <div className="section-header">

              <div className="eyebrow">DEPLOYMENT</div>

              <div>
                <h2>Run BalanceVid<br />your way.</h2>

                <p>
                  Choose managed BalanceVid Cloud infrastructure or operate
                  your own installation on infrastructure you control.
                </p>
              </div>

            </div>

          </div>

          <div className="deploy-grid">

            <article className="deploy-card cloud">

              <div className="eyebrow">BALANCEVID CLOUD</div>

              <h3>We run the infrastructure.</h3>

              <p>
                Choose a plan, create your installation and start building.
                Infrastructure, platform maintenance, updates and security
                are managed for you.
              </p>

              <a className="button light" href="#pricing">Explore Cloud</a>

            </article>


            <article className="deploy-card self">

              <div className="eyebrow">SELF-HOSTED</div>

              <h3>Your infrastructure.<br />Your installation.</h3>

              <p>
                Run BalanceVid on supported infrastructure you control.
                Own the server environment, storage, networking and scaling.
              </p>

              <a className="button light" href="#downloads">Self-Hosted Requirements</a>

            </article>

          </div>
        </section>


        {/* CLOUD / SELF HOSTED TABLE */}

        <section className="section spec">

          <div className="container">

            <div className="section-header">

              <div className="eyebrow">PLATFORM COMPARISON</div>

              <div>
                <h2>One platform.<br />Two ways to run it.</h2>
              </div>

            </div>

            <table className="spec-table">

              <thead>
                <tr>
                  <th>Capability</th>
                  <th>Cloud</th>
                  <th>Self-Hosted</th>
                </tr>
              </thead>

              <tbody>
                {SPEC.map((row) => (
                  <tr key={row.of}>
                    <td>{row.of}</td>
                    <Says it={row.cloud} />
                    <Says it={row.self} />
                  </tr>
                ))}
              </tbody>

            </table>

          </div>
        </section>


        {/* PRICING */}

        <section className="section section-blue" id="pricing">

          <div className="container">

            <div className="section-header">

              <div className="eyebrow">PLANS</div>

              <div>
                <h2>Choose the BalanceVid<br />that fits your operation.</h2>

                <p>
                  Commercial limits and pricing are configured from the final
                  BalanceVid specification. This page intentionally does not
                  invent storage, processing or infrastructure limits.
                </p>
              </div>

            </div>

            <div className="product-nav">
              {PLANS.map((plan, at) => (
                <div className={at === 0 ? 'product-tab active' : 'product-tab'}
                     key={plan.name}>
                  <small>{plan.number}</small>
                  <strong>{plan.name}</strong>
                  <p style={{ color: 'var(--plan-note)' }}>{plan.says}</p>
                </div>
              ))}
            </div>

          </div>
        </section>


        {/* DOWNLOADS */}

        <section className="section downloads" id="downloads">

          <div className="container">

            <div className="section-header">

              <div className="eyebrow">DOWNLOAD CENTER</div>

              <div>
                <h2>Install the tools<br />you need.</h2>

                <p>
                  Mobile participation, desktop production and self-hosted
                  BalanceVid installations from one download center.
                </p>
              </div>

            </div>

            <div className="download-grid">
              {DOWNLOADS.map((one) => (
                <a className="download" href={one.href} key={one.number}>
                  <span className="download-number">{one.number}</span>
                  <h3>{one.name}</h3>
                  <p>{one.says}</p>
                </a>
              ))}
            </div>

          </div>
        </section>


        {/* DOCUMENTATION */}

        <section className="section spec" id="developers">

          <div className="container">

            <div className="section-header">

              <div className="eyebrow">DEVELOPERS</div>

              <div>
                <h2>Build on the<br />BalanceVid system.</h2>

                <p>
                  Documentation for cloud deployments, self-hosted
                  installations, Take, production systems, Online TV,
                  campaigns and the API.
                </p>
              </div>

            </div>

            <div className="download-grid">
              {DOCS.map((one) => (
                <a className="download" href={one.href} key={one.number}>
                  <span className="download-number">{one.number}</span>
                  <h3>{one.name}</h3>
                  <p>{one.says}</p>
                </a>
              ))}
            </div>

          </div>
        </section>


        {/* FINAL */}

        <section className="final">

          <div className="container">

            <div className="eyebrow" style={{ color: 'var(--cyan)' }}>
              BALANCEVID
            </div>

            <h2>Video should not end at play.</h2>

            <p>
              It can become conversation, performance, channel, broadcast,
              competition and participation.
            </p>

            <div className="hero-actions">
              <a className="button light" href="/signin">Start with BalanceVid</a>
              <a className="button light" href="/take">Download Take</a>
              <a className="button light" href="#downloads">Explore Self-Hosting</a>
            </div>

          </div>

        </section>

      </main>


      {/* FOOTER */}

      <footer>

        <div className="container">

          <div className="footer-grid">

            <div>
              <div className="footer-brand">BALANCEVID</div>
              <div className="footer-tag">
                Video. Production. Participation.
              </div>
            </div>

            {FOOTER.map((column) => (
              <div className="footer-column" key={column.of}>
                <strong>{column.of}</strong>
                {column.links.map((link) => (
                  <a href={link.href} key={link.says}>{link.says}</a>
                ))}
              </div>
            ))}

          </div>

          <div className="footer-bottom">
            <span>© 2026 BalanceVid</span>
            <span>Video. Production. Participation.</span>
          </div>

        </div>

      </footer>

      <Reveal within=".bv-site" />

    </div>
  );
}
