import { callerFor } from '../../../../../../src/auth/request.js';
import {
  DEFAULT_POLICY, decideStage, initialStageState, type StageState, type VoiceReading,
} from '../../../../../../src/domain/stage.js';
import { hostOf, inRoom } from '../../../../../../src/domain/participants.js';
import type { ParticipantId } from '../../../../../../src/domain/participants.js';
import { loadConversation, mutateConversation } from '../../../../../../src/store/repository.js';
import { fail, json } from '../../../../../../src/web/http.js';
import { roomView } from '../../../../../../src/web/room.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * What one microphone just heard.  [Doctrine ROOM §2, §9]
 *
 * Each browser measures ITS OWN microphone and posts a reading; the server
 * runs the policy and says who is on stage. Nobody's audio is sent — two
 * numbers are, and they are numbers about the person sending them.
 *
 * WHY THE SERVER DECIDES. Every browser in the room would otherwise run the
 * policy on the readings it happened to have and reach its own conclusion,
 * and the composition would differ between the people watching it. There is
 * one stage because there is one decision, and it is made where the
 * conversation lives.
 *
 * WHY THIS NEEDS NO WEBRTC. Choosing the speaker needs to know who is
 * talking, not to hear them. Recording is local to each browser (§10). So
 * the two things that determine the finished video work with no media
 * transport at all — a seminar in one room, everyone on their own phone,
 * needs nothing else. WebRTC is for seeing each other live, which is a
 * comfort during the conversation and absent from the video afterwards.
 */

/**
 * The decision state, in memory, keyed by conversation.
 *
 * Deliberately NOT in the document. It is the hysteresis of a live moment —
 * who has been speaking for how long — and it means nothing an hour later.
 * What outlives the room is the turns people took, which are interventions
 * (§10). A server restart mid-seminar costs a second of settling, and the
 * alternative is writing to disk ten times a second for state with no reader.
 */
const LIVE = new Map<string, StageState>();

/** Readings older than this are from somebody whose tab has gone. */
const STALE_MS = 4000;
const RECENT = new Map<string, Map<string, { reading: VoiceReading; at: number }>>();

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    energy?: number; speechConfidence?: number; noiseFloor?: number; muted?: boolean;
  };

  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }

  const caller = await callerFor(request, conversation);
  if (caller.access !== 'owner' && caller.access !== 'participant') {
    return fail(404, 'conversation not found');
  }
  const room = conversation.room;
  if (!room?.open) return fail(409, 'this room is not open');

  /*
   * The reading is about the sender, and the sender is the signed session.
   * A participant id in the body would let one guest report that another was
   * shouting, which is a way to take over the screen.
   */
  const me = caller.participantId
    ?? hostOf(conversation.participants ?? [])?.id;
  if (!me) return fail(409, 'you are not in this room');

  const readings = RECENT.get(id) ?? new Map();
  RECENT.set(id, readings);
  const now = Date.now();
  readings.set(me, {
    at: now,
    reading: {
      participantId: me as ParticipantId,
      energy: clamp01(body.energy),
      speechConfidence: clamp01(body.speechConfidence),
      ...(typeof body.noiseFloor === 'number' ? { noiseFloor: clamp01(body.noiseFloor) } : {}),
      ...(body.muted ? { muted: true } : {}),
    },
  });

  // Somebody whose tab closed is not silent; they are gone. Dropping them is
  // what stops the stage waiting on a microphone that will never speak again.
  for (const [who, entry] of readings) {
    if (now - entry.at > STALE_MS) readings.delete(who);
  }

  const host = hostOf(conversation.participants ?? []);
  let state = LIVE.get(id) ?? initialStageState(host?.id ?? null, room.speakerMode);
  // The document is the authority on mode and pin; the live state only
  // carries what the microphones have been doing.
  state = {
    ...state,
    mode: room.speakerMode,
    hostId: host?.id ?? null,
    pinned: room.pinnedParticipantId ?? null,
  };

  const decision = decideStage(
    state, [...readings.values()].map((entry) => entry.reading), now, DEFAULT_POLICY,
  );
  LIVE.set(id, decision.state);

  /*
   * Only a change is written. Automatic switching runs ten times a second and
   * the answer is almost always "the same person" — persisting that would be
   * a write per reading per participant for no information at all.
   */
  if (decision.changed && decision.active) {
    const active = decision.active;
    const present = (conversation.participants ?? []).find((p) => p.id === active);
    if (present && inRoom(present)) {
      conversation = await mutateConversation(id, (draft) => {
        if (draft.room) draft.room.stagedParticipantIds = [active];
      });
    }
  }

  return json({
    active: decision.active,
    reason: decision.reason,
    changed: decision.changed,
    room: roomView(conversation, caller.access === 'owner', caller.participantId),
  });
}

function clamp01(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}
