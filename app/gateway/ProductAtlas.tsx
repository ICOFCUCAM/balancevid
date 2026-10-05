'use client';

import { useState } from 'react';

/**
 * One system, four ways to create — as a set of tabs.
 *   [TV-NETWORK N-1; Doctrine D-04, D-19]
 *
 * THE FOUR PANELS ARE THE FOUR PRODUCTS THIS CODEBASE BUILDS, and
 * every word of their copy and every item of their feature lists
 * is the brief's. Nothing here is summarised to fit: a list that
 * said *"and more"* would be the one place a reader goes looking
 * for what the product does and finds a shrug.
 *
 * THE SWITCH IS STATE RATHER THAN `classList`. The brief swapped
 * an `active` class on nodes it found with `querySelectorAll`,
 * which works until React renders the same nodes and has its own
 * opinion about their className — then a tab that was pressed
 * reverts on the next render, intermittently, which is the worst
 * kind of bug to be handed. Same classes, same stylesheet, one
 * owner. [D-19]
 *
 * AND THE TABS ARE TABS. `role="tab"` with `aria-selected` and a
 * panel that names its tab is what the pattern has needed since
 * ARIA 1.0; a `<button>` that silently changes what is on screen
 * announces nothing to anybody not watching it happen.
 */

interface Product {
  key: string;
  /** The number in the tab's corner. */
  number: string;
  name: string;
  /** The line above the headline. */
  eyebrow: string;
  /** The headline, which breaks where the brief breaks it. */
  heading: React.ReactNode;
  says: string;
  does: string[];
  /** Where the button goes, and what it says. */
  go: { href: string; says: string };
  image: string;
}

/*
 * WHERE EACH BUTTON GOES, AND WHY TWO OF THEM GO TO THE DOOR.
 *
 * Online TV and Take are public surfaces of this installation —
 * `/tv` is the network and `/take` is the participation app, both
 * of which an anonymous visitor may open and both of which exist.
 * The two studios do not have a public page: they are the
 * production environment, which is behind the one door this
 * installation has. Pointing their buttons at `/signin` is the
 * true answer; pointing them at a marketing page that does not
 * exist would be the other kind. [D-21]
 */
const PRODUCTS: Product[] = [
  {
    key: 'studio1',
    number: '01',
    name: 'Studio One',
    eyebrow: 'STUDIO ONE / CONVERSATION PRODUCTION',
    heading: <>Watch.<br />Pause.<br />Respond.</>,
    says: 'Turn video into a conversation. Pause at an exact moment, '
      + 'explain what happened, record your response and produce '
      + 'something new from the interaction.',
    does: ['Pause anywhere', 'Transcript-aware interaction',
      'Record your response', 'Visual response tools',
      'Vertical production', 'Audio processing', 'Export',
      'Interactive video'],
    go: { href: '/signin', says: 'Explore Studio One' },
    image: '/images/balancevid-studio-one.jpg',
  },
  {
    key: 'studio2',
    number: '02',
    name: 'Studio Two',
    eyebrow: 'STUDIO TWO / PERFORMANCE PRODUCTION',
    heading: <>Turn multiple takes into one performance.</>,
    says: 'Record multiple performances, align them to one master song '
      + 'clock and build the final performance by choosing the best '
      + 'sections from every take.',
    does: ['Multi-camera recording', 'Multiple takes', 'Master song clock',
      'Independent offsets', 'Draggable timeline', 'Trim / crop / reframe',
      'Recording into timeline', 'Effects and SFX'],
    go: { href: '/signin', says: 'Explore Studio Two' },
    image: '/images/balancevid-studio-two.jpg',
  },
  {
    key: 'tv',
    number: '03',
    name: 'Online TV',
    eyebrow: 'ONLINE TV / CHANNEL CONTROL',
    heading: <>Your channel.<br />Running around the clock.</>,
    says: 'Combine Studio One, Studio Two, live sessions, scheduled '
      + 'programmes and channel content into a continuous television '
      + 'service.',
    does: ['Continuous playout', 'Live studio', 'Programme scheduling',
      'Repeating programming', 'Channel identity', 'Live failover',
      'Programme output', 'Distribution'],
    go: { href: '/tv', says: 'Explore Online TV' },
    image: '/images/balancevid-online-tv.jpg',
  },
  {
    key: 'take',
    number: '04',
    name: 'Take',
    eyebrow: 'TAKE / AUDIENCE PARTICIPATION',
    heading: <>The audience can take part.</>,
    says: 'Take connects audiences with independent BalanceVid '
      + 'installations so viewers can participate in channels, '
      + 'campaigns and productions.',
    does: ['Music', 'Video', 'Online TV', 'My Takes',
      'Participation Requests', 'Multi-instance participation',
      'Creator recording', 'Submission workflow'],
    go: { href: '/take', says: 'Explore Take' },
    image: '/images/balancevid-take.jpg',
  },
];

export default function ProductAtlas() {
  const [showing, setShowing] = useState(PRODUCTS[0]!.key);

  return (
    <>
      <div className="product-nav" role="tablist"
           aria-label="One platform, four products">
        {PRODUCTS.map((one) => (
          <button key={one.key} type="button" role="tab"
                  id={`tab-${one.key}`}
                  aria-selected={one.key === showing}
                  aria-controls={`panel-${one.key}`}
                  className={one.key === showing
                    ? 'product-tab active' : 'product-tab'}
                  data-product={one.key}
                  onClick={() => setShowing(one.key)}>
            <small>{one.number}</small>
            <strong>{one.name}</strong>
          </button>
        ))}
      </div>

      {PRODUCTS.map((one) => (
        <article key={one.key} role="tabpanel"
                 id={`panel-${one.key}`}
                 aria-labelledby={`tab-${one.key}`}
                 className={one.key === showing
                   ? 'product-panel active' : 'product-panel'}
                 data-panel={one.key}>

          <div className="product-image"
               style={{ backgroundImage: `url('${one.image}')` }}></div>

          <div className="product-copy">
            <div className="eyebrow">{one.eyebrow}</div>

            <h3>{one.heading}</h3>

            <p>{one.says}</p>

            <ul className="feature-list">
              {one.does.map((does) => <li key={does}>{does}</li>)}
            </ul>

            <a className="button light" href={one.go.href}>{one.go.says}</a>
          </div>

        </article>
      ))}
    </>
  );
}
