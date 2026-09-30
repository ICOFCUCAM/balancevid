import { studiosOf } from '../src/domain/account.js';
import { theAccount } from '../src/store/accounts.js';
import { listChannels } from '../src/store/channels.js';
import { listPerformances } from '../src/store/performances.js';
import { listConversations } from '../src/store/repository.js';
import { bytesLabel, diskSpace } from '../src/store/space.js';
import type { SpaceReading } from './Rail.js';
import type { StudioId } from '../src/domain/account.js';

/**
 * What every room needs in order to be inside the building.
 *   [D-19]
 *
 * The rail is the same in all four places that draw it, so what feeds
 * it should be gathered once rather than in four page files that would
 * slowly stop agreeing about what the Library count means.
 *
 * IT COUNTS EVERYTHING, WHICH IS WHAT THE LIBRARY ROW SAYS. The row
 * reads "Media & Recordings" and its number is every made thing in the
 * building — not the things in the room you happen to be standing in.
 */
export interface Building {
  owned: StudioId[];
  space: SpaceReading;
  libraryCount: number;
  heroHref?: string;
}

export async function theBuilding(): Promise<Building> {
  const [account, space, conversations, performances, channels] = await Promise.all([
    theAccount(),
    diskSpace(),
    listConversations().catch(() => []),
    listPerformances().catch(() => []),
    listChannels().catch(() => []),
  ]);
  /* The newest channel, which is the one the Distribution row means. */
  const front = [...channels].sort(
    (a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
  return {
    owned: studiosOf(account),
    libraryCount: conversations.length + performances.length + channels.length,
    ...(front ? { heroHref: `/t/${front.id}` } : {}),
    space: {
      used: bytesLabel(space.usedBytes),
      free: bytesLabel(space.freeBytes),
      total: bytesLabel(space.totalBytes),
      fraction: space.totalBytes > 0
        ? (space.totalBytes - space.freeBytes) / space.totalBytes : 0,
      partial: space.partial,
    },
  };
}
