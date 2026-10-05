'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import SiteNav from '../gateway/SiteNav.js';
import Icon from '../Icon.js';
import {
  type Download, type Platform, HOW_TO_NAME, sizeSays,
} from '../../src/domain/downloads.js';

/**
 * The download centre, and the one code that opens it.
 *   [TAKE-PLATFORM P6; Doctrine D-21, D-04]
 *
 * THREE STATES AND THREE SENTENCES. An installation with no
 * activation code set, one with a code nobody has typed, and one
 * that is open are different situations, and a page that showed
 * the same locked card for the first two would send somebody
 * looking for a code that does not exist. [D-21]
 *
 * WHAT EACH THING IS FOR IS SAID BESIDE IT. "Take Desktop" and
 * "BalanceVid" are not the same product and the cards used to
 * claim they were — the brief's band offered "BalanceVid Windows
 * — Desktop production environment", which is not what this
 * repository builds. Take Desktop is a multi-camera capture
 * station; the server bundle is the installation. Two things,
 * two sentences.
 */

const PLATFORM_SAYS: Record<Platform, string> = {
  linux: 'Linux',
  win: 'Windows',
  mac: 'macOS',
  android: 'Android',
  server: 'Self-hosted',
};

const PRODUCT_SAYS: Record<Download['product'], string> = {
  'take-desktop': 'Take Desktop',
  take: 'Take',
  balancevid: 'BalanceVid',
};

/** What the thing is, said once, where somebody is deciding. */
const PRODUCT_IS: Record<Download['product'], string> = {
  'take-desktop':
    'A multi-camera capture station. It records to its own disk and '
    + 'submits to this installation; it does not need the internet to '
    + 'record.',
  take:
    'Record your part on your phone and send it to the studio.',
  balancevid:
    'The whole system, to run on your own infrastructure.',
};

export default function DownloadCentre(
  { releases, gate }: {
    releases: Download[];
    gate: 'unconfigured' | 'locked' | 'open';
  },
) {
  return (
    <div className="bv-site bv-one-band">
      <SiteNav />
      <main>
        <section className="section downloads" style={{ paddingTop: 140 }}>
          <div className="container">

            <div className="section-header">
              <div className="eyebrow">DOWNLOAD CENTER</div>
              <div>
                <h2>Install the tools<br />you need.</h2>
                <p>
                  The Take App installs straight from this site. Take
                  Desktop and the self-hosted installation are release
                  files, and this installation decides who may have them.
                </p>
              </div>
            </div>

            {/*
              * THE APP FIRST, BECAUSE IT IS THE ONE THAT NEEDS NO CODE
              * AND NO FILE. It is a progressive web application: the
              * phone installs it from the page. [D-21]
              */}
            <div className="download-grid" style={{ marginBottom: 'var(--space-7)' }}>
              <a className="download" href="/take" data-testid="download-take-app">
                <span className="download-number">01 / MOBILE</span>
                <h3>Take App</h3>
                <p>
                  Open calls, the channels on air and your own library.
                  Installs to your home screen from the app itself — no
                  store account, no code.
                </p>
              </a>
              <a className="download" href="/tv" data-testid="download-tv-app">
                <span className="download-number">02 / MOBILE</span>
                <h3>BalanceVid TV</h3>
                <p>
                  The network, as an app. Installs the same way, from the
                  guide.
                </p>
              </a>
            </div>

            <Gate gate={gate} releases={releases} />

          </div>
        </section>
      </main>
    </div>
  );
}

function Gate(
  { gate, releases }: {
    gate: 'unconfigured' | 'locked' | 'open';
    releases: Download[];
  },
) {
  /*
   * NOTHING TO OFFER IS NOT A FAULT, and it is not the same thing as
   * a locked gate. An installation that has published no release
   * files is the ordinary case for a fresh deployment, and the
   * sentence it gets says what to do rather than apologising.
   */
  if (releases.length === 0) {
    return (
      <div className="download" data-testid="downloads-empty" style={{ cursor: 'default' }}>
        <h3>No release files on this installation</h3>
        <p>
          The Take App above installs from this site and needs none.
          Take Desktop and the self-hosted bundle are built and placed
          on the server by whoever runs it.
        </p>
        <p className="small" style={{ marginTop: 10, opacity: 0.7 }}>{HOW_TO_NAME}</p>
      </div>
    );
  }

  if (gate === 'unconfigured') {
    return (
      <div className="download" data-testid="downloads-unconfigured"
           style={{ cursor: 'default' }}>
        <h3>Downloads are closed on this installation</h3>
        <p>
          {releases.length === 1 ? 'One release is' : `${releases.length} releases are`}
          {' '}ready, and nobody has set an activation code for them yet.
          Whoever runs this installation sets <code>BALANCEVID_ACTIVATION</code>,
          and they open to anybody holding it.
        </p>
      </div>
    );
  }

  return (
    <>
      {gate === 'locked' && <Unlock count={releases.length} />}
      <div className="download-grid" data-testid="downloads-list">
        {releases.map((one, index) => (
          <Release key={one.file} one={one} index={index} open={gate === 'open'} />
        ))}
      </div>
    </>
  );
}

function Release(
  { one, index, open }: { one: Download; index: number; open: boolean },
) {
  const number = `${String(index + 1).padStart(2, '0')} / `
    + PLATFORM_SAYS[one.platform].toUpperCase();
  const body = (
    <>
      <span className="download-number">{number}</span>
      <h3>{PRODUCT_SAYS[one.product]} {one.version}</h3>
      <p>{PRODUCT_IS[one.product]}</p>
      <p className="small" style={{ marginTop: 10, opacity: 0.75 }}>
        {/*
          * THE FORM AND THE SIZE, because both decide. A person on a
          * managed Linux machine needs the `.deb` and a person on any
          * other needs the AppImage, and neither wants to find out
          * which they downloaded afterwards. [D-04]
          */}
        <span data-testid="release-form">{one.form}</span>
        {' · '}
        <span data-testid="release-size">{sizeSays(one.bytes)}</span>
        {!open && <> · <span data-testid="release-locked">locked</span></>}
      </p>
    </>
  );

  /*
   * A LOCKED CARD IS NOT A LINK. A control that cannot act looks like
   * a fault, and an anchor to a route that will answer 403 is a
   * control that cannot act. [U-19]
   */
  return open
    ? (
      <a className="download" data-testid="release" data-file={one.file}
         href={`/api/downloads/${encodeURIComponent(one.file)}`}>
        {body}
      </a>
    )
    : (
      <div className="download" data-testid="release" data-file={one.file}
           aria-disabled="true" style={{ cursor: 'default', opacity: 0.72 }}>
        {body}
      </div>
    );
}

function Unlock({ count }: { count: number }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState<string | null>(null);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (busy || code.trim().length === 0) return;
    setBusy(true);
    setWrong(null);
    try {
      const answer = await fetch('/api/downloads/unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (answer.ok) {
        /*
         * THE CODE IS NOT KEPT IN THE PAGE. The server set a cookie;
         * everything the page needs to know follows from it, so the
         * page asks the server again rather than remembering.
         */
        setCode('');
        router.refresh();
        return;
      }
      const said = await answer.json().catch(() => ({})) as { error?: string };
      setWrong(said.error ?? 'that did not work');
    } catch {
      setWrong('could not reach this installation');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="download" data-testid="downloads-unlock" onSubmit={send}
          style={{ cursor: 'default', marginBottom: 'var(--space-6)' }}>
      <span className="download-number">ACTIVATION</span>
      <h3>
        {count === 1 ? 'One release' : `${count} releases`}, behind one code
      </h3>
      <p>
        Type the activation code for this installation and the downloads
        below open for a day.
      </p>
      <div className="row" style={{ gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <input
          data-testid="activation-code"
          /* `text`, not `password`: this is an installation's code
             rather than a person's secret, and somebody typing it off
             a message wants to see whether they typed it right. */
          type="text"
          value={code}
          autoComplete="off"
          spellCheck={false}
          placeholder="Activation code"
          aria-label="Activation code"
          onChange={(event) => setCode(event.target.value)}
          style={{
            flex: '1 1 220px', minWidth: 0, padding: '11px 14px',
            borderRadius: 8, border: '1px solid var(--line)',
            background: 'rgba(255,255,255,0.04)', color: 'inherit',
            font: 'inherit',
          }}
        />
        <button className="button" type="submit" data-testid="activation-go"
                disabled={busy || code.trim().length === 0}>
          <Icon name="disk" size={14} />
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </div>
      {wrong && (
        <p className="small" data-testid="activation-wrong"
           style={{ marginTop: 10, color: 'var(--state-live)' }}>{wrong}</p>
      )}
    </form>
  );
}
