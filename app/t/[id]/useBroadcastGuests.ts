'use client';

import { useEffect, useState } from 'react';
import { useRoomMesh } from '../../c/[id]/room/useRoomMesh.js';
import type { MixerSource } from './useBroadcastMixer.js';
import type { Link } from '../../../src/domain/guestGrid.js';
import { roomBase } from '../../../src/domain/document.js';

/**
 * The people in the room, as things to compose.  [Doctrine CHANNEL §6, ROOM]
 *
 * "You can bring people into the room. Bring Sarah to stage. Automatic
 *  speaker switching can operate."
 *
 * THIS BUILDS NOTHING THAT EXISTS. The Conversation Room already has
 * invitation by link, participants in the room and on the stage, manual and
 * automatic speaker switching with hysteresis, and a WebRTC mesh that hands
 * back a stream per person (D-17, ROOM §4, §6). A channel going live NAMES a
 * room; this reads it.
 *
 * What it adds is one translation: the Room's idea of who is on stage becomes
 * the mixer's list of pictures to draw, in the Room's own staging order — so
 * "bring Sarah to stage" changes the broadcast without anybody touching the
 * broadcast.
 *
 * The polling is the Room's own presence endpoint, at the Room's own rate. A
 * second mechanism for finding out who is on stage would be a second answer
 * to that question, and the two would differ at exactly the moment somebody
 * was brought up.
 */

const PRESENCE_MS = 2000;

interface RoomParticipant {
  id: string;
  displayName: string;
  accent?: string;
  role?: string;
  /** The room says which row is the caller's, when the caller has one. */
  me?: boolean;
}

export function useBroadcastGuests({
  roomId, localStream, enabled,
}: {
  /** The conversation whose room this broadcast is coming out of. */
  roomId: string | undefined;
  /** The operator's own camera, which is always the first picture. */
  localStream: MediaStream | null;
  enabled: boolean;
}): {
  sources: MixerSource[];
  staged: RoomParticipant[];
  tooMany: boolean;
  /**
   * WHAT EACH GUEST'S LINK IS DOING, by participant id.  [CHANNEL §24]
   *
   * The mesh has held this all along and this hook used to drop it, which
   * is what C-14 found: the multi-view could not say "connecting" or
   * "lost" about a guest whose state was being tracked one file away.
   * Forwarded rather than re-derived — a second opinion about whether a
   * peer is connected is a second answer to a question with one. [D-19]
   */
  states: Record<string, Link>;
} {
  const [staged, setStaged] = useState<RoomParticipant[]>([]);
  const [meId, setMeId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!roomId || !enabled) { setStaged([]); return; }
    let stopped = false;
    const read = async () => {
      try {
        const response = await fetch(
          `${roomBase(roomId)}`, { cache: 'no-store' });
        if (!response.ok || stopped) return;
        const data = await response.json() as {
          participants?: RoomParticipant[];
          stagedParticipantIds?: string[];
          meId?: string;
        };
        const order = data.stagedParticipantIds ?? [];
        /*
         * IN THE ROOM'S ORDER, not in the order the streams arrived. The
         * staging order is a decision somebody made — who is on the left —
         * and sorting by connection time would reshuffle the picture
         * whenever a guest's browser reconnected.
         */
        setStaged(order
          .map((id) => (data.participants ?? []).find((person) => person.id === id))
          .filter((person): person is RoomParticipant => Boolean(person)));
        /*
         * WHO THIS BROWSER IS IN THE MESH, and it was asking for a field
         * the room has never sent.  [CHANNEL §24, C-14]
         *
         * This read `data.hostId`. `roomView` returns `meId`, `role` and
         * a `me` flag, and has never returned `hostId` — so `meId` here
         * was ALWAYS `undefined`, `useRoomMesh` returns early on
         * `!meId`, and no peer connection was ever opened for a
         * broadcast. Every guest was staged, listed and counted, and
         * none of them ever reached the mixer or the multi-view. That is
         * the whole of *"camera 2, being guest"* showing nothing, and no
         * amount of drawing four quarters would have filled them.
         *
         * THREE READINGS, IN ORDER OF AUTHORITY, and they are the ones
         * the Room's own view already uses: what the room says the
         * caller is, the row the room flagged as theirs, and — for the
         * OWNER, who is not a participant and so has neither — the
         * participant `openRoom` created with `role: 'host'`. The
         * broadcaster IS the host of the room they opened; that is the
         * identity the signalling is keyed on. [ROOM §3, D-19]
         */
        setMeId(data.meId
          ?? (data.participants ?? []).find((person) => person.me)?.id
          ?? (data.participants ?? []).find(
            (person) => person.role === 'host')?.id);
      } catch { /* the room is momentarily unreachable; keep the last list. */ }
    };
    void read();
    const timer = setInterval(() => { void read(); }, PRESENCE_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [roomId, enabled]);

  const peerIds = staged
    .map((person) => person.id)
    .filter((id) => id !== meId);

  const mesh = useRoomMesh({
    conversationId: roomId ?? '',
    meId,
    peerIds,
    localStream,
    /*
     * The broadcaster is on stage by definition — they are the channel. This
     * is the Room's own "sending" flag and it means the same thing here: this
     * browser's camera goes out.
     */
    sending: true,
    enabled: Boolean(roomId) && enabled,
  });

  const sources: MixerSource[] = [];
  if (localStream) {
    sources.push({
      id: meId ?? 'me',
      stream: localStream,
      label: staged.find((person) => person.id === meId)?.displayName ?? 'You',
      accent: staged.find((person) => person.id === meId)?.accent ?? '#a35a34',
    });
  }
  for (const person of staged) {
    if (person.id === meId) continue;
    const remote = mesh.remotes.find((entry) => entry.participantId === person.id);
    if (!remote) continue;
    sources.push({
      id: person.id,
      stream: remote.stream,
      label: person.displayName,
      ...(person.accent ? { accent: person.accent } : {}),
    });
  }

  return { sources, staged, tooMany: mesh.tooMany, states: mesh.states };
}
