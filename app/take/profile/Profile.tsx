'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import Icon from '../../Icon.js';
import BottomBar from '../BottomBar.js';
import { GroundToggle } from '../../Ground.js';
import Connections from '../Connections.js';
import GetTheApp from '../GetTheApp.js';

/**
 * Profile and connections.
 *   [TAKE-PLATFORM P13, P22, P23, P25; TAKE-APP T16; D-03, D-25, U-19]
 *
 * > *"Take is designed to work without forcing an account for
 * > every participation link. Your device keeps your own saved
 * > participation links."*
 *
 * A PROFILE WITH NO ACCOUNT BEHIND IT, which is the only kind
 * this product can honestly offer and is not a weaker thing than
 * the other kind. The Take App has never had a sign-in: no
 * installation is told which others this device knows, nothing
 * about this phone is written down anywhere, and a person who
 * clears their storage has cleared it. That is said on the page
 * rather than discovered.
 *
 * BOTH UPLOADED DESIGNS PUT THE FIFTH TAB HERE and both fill it
 * with the same four things — the installations this device takes
 * part in, which one is serving the page, the embed tools, and
 * what the app is allowed to use. All four exist in this product.
 * Three of them were on the home screen, where a first-time
 * visitor met them before finding anything to sing. [D-04]
 *
 * NO AVATAR AND NO NAME, because there is nobody to name. The
 * uploaded homepage draws a photograph in the top right; a
 * product with no accounts drawing a face would be drawing
 * somebody else's. [U-19]
 */
export default function Profile() {
  const [here, setHere] = useState<{ name: string; origin: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      /*
       * WHICH INSTALLATION THIS IS, FROM THE INSTALLATION. The
       * same answer the home screen reads, and the only fact on
       * this page that does not come out of the device's own
       * storage. [P13]
       */
      const said = await fetch('/api/participate', { cache: 'no-store' })
        .then((r) => r.json()).catch(() => ({}));
      if (alive && said.instance) setHere(said.instance);
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="tk-page" data-ground="light" data-ground-host
         data-testid="take-profile">
      <header className="tk-bar">
        <Link href="/take" className="tk-ident">
          <span style={{ minWidth: 0 }}>
            <span className="tk-ident-name">
              Balance<span className="tk-ident-vid">Vid</span>
            </span>
            <span className="tk-ident-says">Profile</span>
          </span>
        </Link>
        <Link href="/take" className="tk-bar-way">
          <Icon name="home" size={14} />
          Home
        </Link>
        <GroundToggle />
      </header>

      <main className="tk-main">
        <section className="tk-shelf" data-testid="profile-about">
          <div className="tk-shelf-head">
            <h2 className="tk-shelf-title">No account, by design</h2>
          </div>
          <p className="tk-note">
            Take works without asking who you are. The links a studio sends
            you, the installations you have added and the work you have kept
            are on this device and nowhere else — no installation is told
            which others you use.
          </p>
        </section>

        <Connections here={here} />

        <section className="tk-shelf" data-testid="profile-embed">
          <div className="tk-shelf-head">
            <h2 className="tk-shelf-title">Take, on your own site</h2>
          </div>
          <div className="tk-band">
            <span aria-hidden="true" className="tk-band-mark">
              <Icon name="link" size={18} />
            </span>
            <span className="tk-band-said">
              <span className="tk-band-name">Embed Take</span>
              <span className="tk-band-under">
                The public link, and the code for a page of your own.
              </span>
            </span>
            <a className="tk-band-go" href="/take/embed"
               data-testid="profile-embed-way">
              Get embed code
              <Icon name="arrow" size={14} />
            </a>
          </div>
        </section>

        <section className="tk-shelf" data-testid="profile-permissions">
          <div className="tk-shelf-head">
            <h2 className="tk-shelf-title">Camera, microphone and storage</h2>
          </div>
          {/*
            * WHAT THE APP ASKS FOR AND WHEN, rather than a row
            * of switches this product cannot operate. A web app
            * cannot revoke a permission the browser granted —
            * only the browser can — so a toggle here would be a
            * control that does nothing, which is the one thing
            * worse than no control. It says where the real one
            * is instead. [U-19, D-21]
            */}
          <p className="tk-note">
            The camera and microphone are asked for when you press record, and
            never before. Your browser holds that permission, not this app:
            you can take it back in the site settings of whichever browser
            you are reading this in.
          </p>
          <p className="tk-note">
            Recordings are held on this device until they have been sent, so
            an upload survives a tunnel or a locked phone. Nothing is kept
            after a studio has it.
          </p>
        </section>

        <section className="tk-shelf" data-testid="profile-work">
          <div className="tk-shelf-head">
            <h2 className="tk-shelf-title">Your work</h2>
          </div>
          <ul className="tk-rows">
            <li className="tk-row">
              <span aria-hidden="true" className="tk-row-mark">
                <Icon name="library" size={16} />
              </span>
              <span className="tk-row-said">
                <span className="tk-row-name">My Takes</span>
                <span className="tk-row-under">
                  Everything this device holds, and what each studio did with it
                </span>
              </span>
              <span className="tk-row-go">
                <a className="tk-go" href="/take/library"
                   data-testid="profile-library">
                  Open
                </a>
              </span>
            </li>
          </ul>
        </section>

        <GetTheApp />
      </main>
    
      <BottomBar here="/take/profile" />
    </div>
  );
}
