/**
 * Loading and editing whatever a room was opened on.  [ROOM §6, CHANNEL §6]
 *
 * A room used to be a property of a Conversation, so every route that
 * answered about one reached for `loadConversation`. A channel can now open a
 * room of its own — same `Room`, same `roomEdit`, same invite panel — and the
 * only thing that differs is which file the record lives in.
 *
 * SO THE ROUTES ASK FOR A HOST AND NOT FOR A DOCUMENT. Six route files, an
 * auth check and a view all take a `RoomHost`; this is the one place that
 * decides which kind of host an id names. The alternative was six more route
 * files with `loadChannel` in them, which is six more places for the answer
 * to drift.
 *
 * BY THE ID'S OWN PREFIX, which is not a convention this invents: `newId`
 * has always minted `conv_…` and `chan_…`, and every other part of the
 * product already relies on an id saying what it is. An id that names
 * neither is not "try both" — it is a caller asking about something that
 * does not exist, and answering it would mean two filesystem reads and a
 * 404 either way.
 */

import type { Channel } from '../domain/channel.js';
import { type Conversation, type RoomHost, roomHostKind } from '../domain/document.js';
import { loadChannel, mutateChannel } from './channels.js';
import { loadConversation, mutateConversation } from './repository.js';

export async function loadRoomHost(id: string): Promise<RoomHost> {
  const kind = roomHostKind(id);
  if (kind === 'channel') return loadChannel(id);
  if (kind === 'conversation') return loadConversation(id);
  throw new Error(`no room host: ${id}`);
}

/**
 * Load, change, save — under whatever lock that kind of document uses.
 *
 * The two paths are not merged into one: a conversation is edited under a
 * directory lock because takes are being written into it from several
 * browsers at once, and a channel is not. Pretending they are the same thing
 * here would mean choosing one of those, and both choices are wrong for the
 * other document.
 */
export async function mutateRoomHost(
  id: string, change: (draft: RoomHost) => void | Promise<void>,
): Promise<RoomHost> {
  const kind = roomHostKind(id);
  if (kind === 'channel') {
    return mutateChannel(id, (draft: Channel) => change(draft));
  }
  if (kind === 'conversation') {
    return mutateConversation(id, (draft: Conversation) => change(draft));
  }
  throw new Error(`no room host: ${id}`);
}
