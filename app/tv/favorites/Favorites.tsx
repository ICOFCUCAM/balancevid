'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import {
  carried, favoritesAmong, readCarried,
} from '../../../src/domain/favorites.js';
import Icon from '../../Icon.js';
import { Address, type Listing, useFavorites } from '../Tv.js';
import { identityFor } from '../art.js';
import { Clock } from '../guide/Grid.js';

/** What a channel is showing, as the server computed it. */
export interface Showing {
  now: string | null;
  live: boolean;
  untilMs: number | null;
  next: string | null;
  nextAt: number | null;
}

/**
 * The viewer's own lineup.  [TV-NETWORK N-9]
 *
 * A LINEUP IS A LIST AND NOT A GRID. `favoritesAmong` has sorted
 * this by `dialOrder` since N-9 — the same comparator the M3U
 * uses — and the page drew it as a grid of cards, which threw
 * the ordering away at the last step. The directory is browsed
 * and is alphabetical; this is TUNED, and is read down the
 * numbers. [D-04, N-6]
 *
 * PER DEVICE, AND IT SAYS SO. A viewer who stars three channels
 * on a laptop and opens this on a phone finds it empty, and a
 * page that let them discover that by themselves would be a page
 * they think has lost their list.
 *
 * NOTHING AT ALL UNTIL STORAGE HAS BEEN READ, not an empty state.
 * "You have not kept any channels yet" shown for a frame to
 * somebody with twelve of them is the page calling itself empty
 * before it has looked.
 */
export default function Favorites(
  { channels, showing }: {
    channels: Listing[];
    showing: Record<string, Showing>;
  },
) {
  const { list, ready, toggle, keep } = useFavorites();
  const kept = useMemo(
    () => favoritesAmong(channels, list), [channels, list]);
  const onAir = kept.filter((one) => showing[one.slug]?.live).length;

  if (!ready) {
    /* The frame, with nothing in it: the header and the page's
       own shape are known before storage is, and drawing them
       late is a page that jumps. */
    return (
      <>
        <Band kept={null} onAir={0} />
        <div className="fav-body">
          <div className="fav-list" data-testid="tv-favorites-waiting" />
          <Aside list={[]} />
        </div>
      </>
    );
  }

  return (
    <>
      <Band kept={kept.length} onAir={onAir} />
      <div className="fav-body">
        <div style={{ minWidth: 0 }}>
          <Offer held={list} keep={keep} />
          <div className="fav-list" data-testid="tv-favorites">
            {kept.length === 0
              ? (
                <p className="fav-empty" data-testid="tv-favorites-empty">
                  No channels kept yet. The star beside a channel keeps it
                  here — in this browser, with no account.
                </p>
              )
              : kept.map((one) => (
                <Row key={one.slug} channel={one}
                     on={showing[one.slug]} drop={() => toggle(one.slug)} />
              ))}
          </div>
          {/*
            * A SLUG IN STORAGE THAT NOBODY ANSWERS TO IS NOT SHOWN
            * AS A GAP, and it is not silently forgotten either:
            * the slug stays, so a channel that comes back comes
            * back starred. This is the one line that explains the
            * arithmetic when the two counts differ. [N-9]
            */}
          {list.length > kept.length && (
            <p className="fav-gone" data-testid="tv-favorites-gone">
              {list.length - kept.length === 1
                ? 'One channel you kept is not in the directory just now.'
                : `${list.length - kept.length} channels you kept are not in `
                  + 'the directory just now.'}
              {' '}They will come back here if they return.
            </p>
          )}
        </div>
        <Aside list={list} />
      </div>
    </>
  );
}

/** The band, which says how many and how many of those are live. */
function Band({ kept, onAir }: { kept: number | null; onAir: number }) {
  return (
    <div className="fav-head">
      <div className="fav-head-row">
        <div style={{ minWidth: 0 }}>
          <h1 className="fav-title">
            <Icon name="passed" size={24} />
            Your channels
          </h1>
          <p className="fav-lede">
            The lineup you keep on this device, in channel-number order.
          </p>
        </div>
        {kept !== null && kept > 0 && (
          <span className="fav-count" data-testid="tv-favorites-count">
            {kept === 1 ? '1 channel' : `${kept} channels`}
            {/*
              * HOW MANY ARE ON AIR, absent rather than drawn as a
              * zero: *0 live* over a list of twelve is a line
              * that makes a working page look broken. [D-21]
              */}
            {onAir > 0 && (
              <span className="fav-live">
                <span aria-hidden="true" className="fav-live-dot" />
                {onAir} live now
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/** One channel, as a row on a dial. */
function Row(
  { channel, on, drop }: {
    channel: Listing; on: Showing | undefined; drop: () => void;
  },
) {
  return (
    <div className="fav-row" data-testid="tv-favorite" data-slug={channel.slug}>
      <Link href={`/tv/channels/${channel.slug}`} className="fav-open">
        <span className="fav-num mono readout">
          {channel.number ?? ''}
        </span>
        <span aria-hidden="true" className="fav-mark"
              {...(channel.logoAssetId ? {} : { style: identityFor(channel.slug) })}>
          {channel.logoAssetId
            // eslint-disable-next-line @next/next/no-img-element
            ? <img alt="" src={`/api/tv/channels/${channel.slug}/logo`} />
            : (channel.callsign ?? channel.name.slice(0, 2).toUpperCase())}
        </span>
        <span className="fav-said">
          <span className="fav-name">
            <span className="fav-name-text">{channel.name}</span>
            {on?.live && <span className="fav-tag">LIVE</span>}
          </span>
          {/*
            * UNTIL, NOT A COUNTDOWN. A duration on a page is
            * wrong the moment it is read; an instant stays true,
            * and the browser writes it in the viewer's own
            * clock. [§2]
            *
            * AND ONLY WHERE NOTHING FOLLOWS. The first draft drew
            * *Teaching Hour · until 01:30* over *Next: Gospel
            * Classics at 01:30*, which is one instant printed
            * twice: when something follows, the time it starts IS
            * when this one ends, and the second line says it
            * better. The *until* is for the last thing in the
            * schedule, where it is the only line there is.
            */}
          <span className="fav-under">
            {on?.now ?? channel.says ?? ''}
            {on?.now && !on.next
              && on.untilMs !== null && on.untilMs !== undefined && (
              <> · until <Clock at={on.untilMs} /></>
            )}
          </span>
          {on?.next && (
            <span className="fav-next">
              Then {on.next}
              {on.nextAt !== null && on.nextAt !== undefined && (
                <> at <Clock at={on.nextAt} /></>
              )}
            </span>
          )}
        </span>
      </Link>
      <button type="button" className="fav-drop" onClick={drop}
              data-testid="tv-favorite-drop"
              aria-label={`Remove ${channel.name} from your channels`}>
        <Icon name="close" size={15} />
      </button>
    </div>
  );
}

/**
 * What this list is, and how to carry it.
 *
 * THE COST OF HOLDING NOTHING ABOUT A VIEWER IS THAT THE LIST
 * DOES NOT FOLLOW THEM, and this product states that cost rather
 * than hiding it. It does not have to be paid twice: a list of
 * addresses is small enough to carry in a link, so a viewer can
 * move their lineup to a television WITHOUT this installation
 * ever learning what is in it. Everything a sync would do, a URL
 * does — except keep a record of which channels a named person
 * watches. [D-03, N-9]
 */
function Aside({ list }: { list: string[] }) {
  const [here, setHere] = useState('');
  useEffect(() => {
    /* The origin is the browser's. A link built on the server
       would carry whatever hostname that machine thinks it has,
       which is the fault `hostOf` exists to avoid. [N-8] */
    setHere(window.location.origin);
  }, []);
  const link = here && list.length > 0
    ? `${here}/tv/favorites?add=${carried(list)}` : '';

  return (
    <aside className="fav-aside">
      <p className="fav-aside-lead">Kept on this device</p>
      <p className="fav-aside-said">
        This list lives in this browser and nowhere else. There is no
        account behind it, so nothing here knows what you keep — and it
        does not follow you to another device by itself.
      </p>
      {link && (
        <>
          <p className="fav-aside-said" style={{ marginTop: 'var(--space-4)' }}>
            Carry it across: open this link on the other device.
          </p>
          <div className="fav-carry" data-testid="tv-favorites-link">
            <Address label="Link" url={link} />
          </div>
        </>
      )}
      <div className="fav-ways">
        <Link href="/tv/channels" className="fav-way">
          <Icon name="channels" size={15} />
          All channels
        </Link>
        <Link href="/tv/categories" className="fav-way">
          <Icon name="library" size={15} />
          Browse by category
        </Link>
        <Link href="/tv/guide" className="fav-way">
          <Icon name="calendar" size={15} />
          What is on now
        </Link>
      </div>
    </aside>
  );
}

/**
 * A list that arrived in a link.
 *
 * AN OFFER AND NEVER AN ACTION. A URL anybody can write must not
 * change what is in somebody's browser by being opened — so the
 * page says what it was handed, says how much of it is new, and
 * waits to be pressed. [D-03]
 */
function Offer(
  { held, keep }: { held: string[]; keep: (slugs: readonly string[]) => void },
) {
  const [asked, setAsked] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setAsked(readCarried(query.get('add')));
  }, []);

  const fresh = asked.filter((slug) => !held.includes(slug));
  if (asked.length === 0) return null;
  if (done || fresh.length === 0) {
    return (
      <p className="fav-offer" data-testid="tv-favorites-offer-done">
        <span className="fav-offer-said">
          {asked.length === 1
            ? 'That channel is already in your list.'
            : 'Those channels are already in your list.'}
        </span>
      </p>
    );
  }

  return (
    <div className="fav-offer" data-testid="tv-favorites-offer">
      <span className="fav-offer-said">
        A link is offering {fresh.length === 1
          ? 'one channel' : `${fresh.length} channels`} for this device.
        Nothing has been added yet.
      </span>
      <button type="button" className="ctl"
              data-testid="tv-favorites-accept"
              onClick={() => { keep(fresh); setDone(true); }}>
        Add {fresh.length === 1 ? 'it' : 'them'}
      </button>
    </div>
  );
}
