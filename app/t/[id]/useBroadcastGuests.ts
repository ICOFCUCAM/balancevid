'use client';

import { useEffect, useState } from 'react';
import { useRoomMesh } from '../../c/[id]/room/useRoomMesh.js';
import type { MixerSource } from './useBroadcastMixer.js';

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
}

export function useBroadcastGuests({
  roomId, localStream, enabled,
}: {
  /** The conversation whose room this broadcast is coming out of. */
  roomId: string | undefined;
  /** The operator's own camera, which is always the first picture. */
  localStream: MediaStream | null;
  enabled: boolean;
}): { sources: MixerSource[]; staged: RoomParticipant[]; tooMany: boolean } {
  const [staged, setStaged] = useState<RoomParticipant[]>([]);
  const [meId, setMeId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!roomId || !enabled) { setStaged([]); return; }
    let stopped = false;
    const read = async () => {
      try {
        const response = await fetch(
          `/api/conversations/${roomId}/room`, { cache: 'no-store' });
        if (!response.ok || stopped) return;
        const data = await response.json() as {
          participants?: RoomParticipant[];
          stagedParticipantIds?: string[];
          hostId?: string;
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
        setMeId(data.hostId);
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

  return { sources, staged, tooMany: mesh.tooMany };
}
