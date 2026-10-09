'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';

import Icon from '../../Icon.js';
import BottomBar from '../BottomBar.js';
import { GroundToggle } from '../../Ground.js';
import type { EmbedWay } from '../../../src/domain/embed.js';
import { hostOf } from '../../../src/domain/embed.js';

/**
 * Embed Take, as a page a publisher can work from.
 *   [TAKE-PLATFORM P6, P13; Doctrine D-04, D-19, U-19, U-02]
 *
 * > *"Bring participation to your website. Share the public link
 * > or add the experience directly to your page."*
 *
 * THE CODE IS SHOWN IN FULL AND NOT BEHIND A BUTTON. Everything
 * on this page is inert markup — no script, no token, no account
 * — so there is nothing to hide, and a publisher deciding whether
 * to paste something into their own site is entitled to read it
 * first. A copy button that is the only way to see what you are
 * copying is a copy button nobody careful uses.
 *
 * AND THE COST OF EACH WAY IS BESIDE IT, not in a footnote. A
 * frame loses the app's storage and needs the page's permission
 * for a camera; both fail silently on somebody else's website a
 * week after they stopped looking, which is exactly the kind of
 * thing this product says out loud. [U-19, embed.ts]
 *
 * THE PREVIEW IS THE REAL MARKUP, rendered. Not a picture of it
 * and not a second version written to look like it — the same
 * string that is in the box above it, so the two cannot drift.
 * The frame's preview is a real frame pointed at this
 * installation, which is also the only honest way to find out
 * that it works. [U-02]
 */
export default function Embed(
  { address, ways }: { address: string | null; ways: EmbedWay[] },
) {
  const [said, setSaid] = useState<string | null>(null);

  const copy = useCallback(async (what: string, named: string) => {
    try {
      await navigator.clipboard.writeText(what);
      setSaid(`${named} copied.`);
    } catch {
      /* A browser that refuses the clipboard has not broken
         anything: the text is on the page, selectable. [U-19] */
      setSaid('Could not copy — select the text in the box instead.');
    }
  }, []);

  return (
    <div className="tk-page" data-ground="light" data-ground-host
         data-testid="take-embed">
      <header className="tk-bar">
        <Link href="/take" className="tk-ident">
          <span aria-hidden="true" className="tk-ident-mark">
            <Icon name="link" size={16} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span className="tk-ident-name">Embed Take</span>
            <span className="tk-ident-says">Participation, on your own site</span>
          </span>
        </Link>
        <Link href="/take" className="tk-bar-way">
          <Icon name="home" size={14} />
          Home
        </Link>
        <GroundToggle />
      </header>

      <main className="tk-main">
        {said && <p className="tk-say" data-testid="embed-said">{said}</p>}

        {/*
          * NO ADDRESS, NO SNIPPETS. An installation behind a proxy
          * that strips its headers cannot be told what it is
          * called, and a page that guessed would hand a publisher
          * markup pointing at the wrong site — a failure that
          * happens on THEIR page and looks like their mistake.
          * [U-19, page.tsx]
          */}
        {address === null ? (
          <section className="tk-shelf" data-testid="embed-no-address">
            <div className="tk-shelf-head">
              <h2 className="tk-shelf-title">This installation has no public address</h2>
            </div>
            <p className="tk-note">
              The server cannot see the host it is being reached on, so there
              is no address to put in a snippet. Whoever runs this
              installation can set one by passing the forwarded host through
              the proxy in front of it.
            </p>
          </section>
        ) : (
          <>
            {/*
              * THE ADDRESS FIRST, BECAUSE MOST PEOPLE CAME FOR IT.
              * A studio sharing Take in a message, on a poster or
              * down a telephone needs one line, not a snippet.
              */}
            <section className="tk-shelf" data-testid="embed-address">
              <div className="tk-shelf-head">
                <h2 className="tk-shelf-title">The public link</h2>
              </div>
              <p className="tk-note">
                Anyone can open this. No account, nothing to download: a phone
                installs Take to its home screen from the page itself.
              </p>
              <p className="tk-embed-url" data-testid="embed-url">{address}</p>
              <div className="tk-embed-acts">
                <button type="button" className="tk-go"
                        data-testid="embed-copy-link"
                        onClick={() => void copy(address, 'Link')}>
                  <Icon name="link" size={14} />
                  Copy link
                </button>
                <a className="tk-go tk-go-quiet" href="/take"
                   data-testid="embed-open" target="_blank" rel="noopener">
                  <Icon name="play" size={14} />
                  Open Take
                </a>
              </div>
            </section>

            {ways.map((way) => (
              <section key={way.id} className="tk-shelf"
                       data-testid="embed-way" data-way={way.id}>
                <div className="tk-shelf-head">
                  <h2 className="tk-shelf-title">{way.says}</h2>
                </div>
                <p className="tk-note">{way.what}</p>

                {/*
                  * WHAT IT CANNOT DO, where there is anything. An
                  * empty list draws nothing rather than a
                  * reassuring sentence nobody can check. [U-19]
                  */}
                {way.costs.length > 0 && (
                  <ul className="tk-embed-costs" data-testid="embed-costs">
                    {way.costs.map((cost) => <li key={cost}>{cost}</li>)}
                  </ul>
                )}

                <pre className="tk-embed-code" data-testid="embed-code">
                  <code>{way.code}</code>
                </pre>

                <div className="tk-embed-acts">
                  <button type="button" className="tk-go"
                          data-testid="embed-copy-code"
                          onClick={() => void copy(way.code, 'Code')}>
                    <Icon name="list" size={14} />
                    Copy code
                  </button>
                </div>

                {/*
                  * AND WHAT IT LOOKS LIKE, from the same string.
                  * `dangerouslySetInnerHTML` with markup this
                  * product composed itself from its own origin —
                  * nothing here comes from a request, a store or a
                  * person, and `embed.test.ts` holds it to that.
                  */}
                <p className="tk-embed-label">On your page:</p>
                <div className="tk-embed-show" data-testid="embed-preview"
                     dangerouslySetInnerHTML={{ __html: way.code }} />
              </section>
            ))}

            <section className="tk-shelf" data-testid="embed-about">
              <div className="tk-shelf-head">
                <h2 className="tk-shelf-title">Before you publish</h2>
              </div>
              <p className="tk-note">
                Test it on your own page first. Visitors are asked for the
                camera or microphone only when they choose to record, and
                never by this page or by the link.
              </p>
              <p className="tk-note">
                Everything recorded through {hostOf(address)} stays with this
                installation. Embedding Take on a website does not give that
                website access to anybody’s recording.
              </p>
            </section>
          </>
        )}
      </main>
    
      <BottomBar here="/take/embed" />
    </div>
  );
}
