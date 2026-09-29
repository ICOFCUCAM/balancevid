/**
 * A channel's own room.  [CHANNEL §6, ROOM §6, D-19]
 *
 * THE SAME HANDLERS, at an honest path. Everything a room route does is
 * about a `RoomHost` now, and `mutateRoomHost` already decides from the id
 * whether that host is a conversation or a channel — so this file is a
 * re-export and not a second implementation. Six of these against six
 * copies of 595 lines is the whole of why the domain was widened first.
 *
 * It exists at all because `/api/conversations/chan_…/room` would be a lie
 * in a URL, and the route table is also the security policy: `policy.ts`
 * decides what a caller without the owner's session may reach by matching
 * paths, and a path that says "conversations" while serving a channel is a
 * rule nobody can audit.
 */
export { GET, POST, dynamic } from '../../../conversations/[id]/room/route.js';
