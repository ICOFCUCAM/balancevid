'use client';

import { favoritesAmong } from '../../../src/domain/favorites.js';
import { ChannelGrid, type Listing, useFavorites } from '../Tv.js';

/**
 * The viewer's own lineup.  [TV-NETWORK N-9]
 *
 * PER DEVICE, AND IT SAYS SO. A viewer who stars three channels
 * on a laptop and opens this on a phone finds it empty, and a
 * page that let them discover that by themselves would be a page
 * they think has lost their list. One line, under the count.
 *
 * NOTHING AT ALL UNTIL STORAGE HAS BEEN READ, not an empty state.
 * "You have not kept any channels yet" shown for a frame to
 * somebody with twelve of them is the page calling itself empty
 * before it has looked.
 */
export default function Favorites({ channels }: { channels: Listing[] }) {
  const { list, ready } = useFavorites();
  if (!ready) {
    return <p className="muted" data-testid="tv-favorites-waiting">&nbsp;</p>;
  }
  const kept = favoritesAmong(channels, list);
  return (
    <>
      <p className="muted" style={{ margin: '0 0 var(--space-5)' }}>
        {kept.length === 0
          ? 'Kept on this device, and not anywhere you have not kept them.'
          : `${kept.length === 1 ? 'One channel' : `${kept.length} channels`}, `
            + 'kept on this device.'}
      </p>
      <ChannelGrid channels={kept} empty={
        <p className="muted" data-testid="tv-favorites-empty">
          No channels kept yet. The star beside a channel keeps it here —
          in this browser, with no account.
        </p>
      } />
      {/*
        * A SLUG IN STORAGE THAT NOBODY ANSWERS TO IS NOT SHOWN AS
        * A GAP, and it is not silently forgotten either: the slug
        * stays, so a channel that comes back comes back starred.
        * This is the one line that explains the arithmetic when
        * the two counts differ. [N-9]
        */}
      {list.length > kept.length && (
        <p className="small muted" data-testid="tv-favorites-gone"
           style={{ marginTop: 'var(--space-5)' }}>
          {list.length - kept.length === 1
            ? 'One channel you kept is not in the directory just now.'
            : `${list.length - kept.length} channels you kept are not in the `
              + 'directory just now.'}
          {' '}They will come back here if they return.
        </p>
      )}
    </>
  );
}
