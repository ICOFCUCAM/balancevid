import { callerFor } from '../../../../../../src/auth/request.js';
import { inRoom } from '../../../../../../src/domain/participants.js';
import { loadConversation } from '../../../../../../src/store/repository.js';
import { fail, json } from '../../../../../../src/web/http.js';
import { meIn } from '../../../../../../src/web/room.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Signalling.  [Doctrine ROOM §12, D-06]
 *
 * Two browsers cannot introduce themselves to each other. Somebody has to
 * carry the first few messages — an offer, an answer, and the network
 * addresses each end can be reached on — and after that the media goes
 * directly between them and this route is silent.
 *
 * A MAILBOX, NOT A BROADCAST. Each message names one recipient, and is
 * readable only by them. A room is not a place where everyone hears
 * everyone's connection details: those contain local network addresses, and
 * handing every guest a map of every other guest's LAN is a gift to nobody.
 *
 * IN MEMORY, DELIBERATELY. Signalling is the first two seconds of a
 * connection and means nothing afterwards. Writing it to the conversation
 * would be storing the handshake of a call in the record of what was said.
 *
 * THIS IS THE SEAM THE SFU SLOTS INTO. The brief defers that decision, and
 * what keeps it open is that the ROOM never learns how media travels: peers
 * exchange opaque payloads through here, and an SFU is simply a peer that
 * everyone connects to instead of to each other.
 */

/** One mailbox per room, one queue per recipient. */
const MAILBOXES = new Map<string, Map<string, Envelope[]>>();

interface Envelope {
  from: string;
  /** Opaque to this route: an SDP description, or an ICE candidate. */
  payload: unknown;
  at: number;
}

/**
 * How long an undelivered message is worth keeping.
 *
 * A handshake that has not completed in this long has failed, and the peers
 * will try again from the beginning. Holding older messages means replaying a
 * dead negotiation into a live one.
 */
const TTL_MS = 30_000;
/** A cap per recipient, so a peer that stops polling cannot fill memory. */
const MAX_QUEUED = 64;

/**
 * Forget rooms that are over.
 *
 * The cap above bounds one recipient's queue; nothing bounded the number of
 * ROOMS, and a process that has served a thousand seminars would hold a
 * thousand maps of handshakes that ended months ago. Signalling is the first
 * two seconds of a call, so anything past the TTL is not late — it is
 * finished, and its room can go with it. Swept on the way through rather than
 * on a timer: there is no work to do in a process nobody is calling.
 */
function sweep(now: number): void {
  for (const [conversationId, room] of MAILBOXES) {
    for (const [recipient, queue] of room) {
      const live = queue.filter((envelope) => now - envelope.at <= TTL_MS);
      if (live.length === 0) room.delete(recipient);
      else if (live.length !== queue.length) room.set(recipient, live);
    }
    if (room.size === 0) MAILBOXES.delete(conversationId);
  }
}

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    to?: string; payload?: unknown;
  };

  const context = await authorise(request, id);
  if ('error' in context) return context.error;
  const { conversation, me } = context;

  const to = String(body.to ?? '');
  const recipient = (conversation.participants ?? []).find((p) => p.id === to);
  /*
   * The recipient must be somebody in this room. Without that check the
   * mailbox is a way to discover which participant ids exist, and to post
   * into rooms one is not in.
   */
  if (!recipient || !inRoom(recipient)) return fail(404, 'no such participant');
  if (to === me) return fail(400, 'a peer cannot signal itself');

  sweep(Date.now());
  const room = MAILBOXES.get(id) ?? new Map<string, Envelope[]>();
  MAILBOXES.set(id, room);
  const queue = room.get(to) ?? [];
  // The sender is the signed session, never the request. A message claiming
  // to be from somebody else would let one guest impersonate another's peer.
  queue.push({ from: me, payload: body.payload, at: Date.now() });
  room.set(to, queue.slice(-MAX_QUEUED));
  return json({ ok: true });
}

/**
 * Collect what is waiting.
 *
 * Reading a mailbox empties it: a signalling message is consumed once, and a
 * peer that has read an offer should not read it again on the next poll.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const context = await authorise(request, id);
  if ('error' in context) return context.error;
  const { me } = context;

  const now = Date.now();
  const room = MAILBOXES.get(id);
  const queue = room?.get(me) ?? [];
  // Reading empties it, and the sweep then takes the room away if this was
  // the last thing anybody was waiting for.
  room?.delete(me);
  sweep(now);

  return json({
    messages: queue
      .filter((envelope) => now - envelope.at <= TTL_MS)
      .map((envelope) => ({ from: envelope.from, payload: envelope.payload })),
  });
}

async function authorise(request: Request, id: string): Promise<
  { conversation: Awaited<ReturnType<typeof loadConversation>>; me: string }
  | { error: Response }
> {
  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return { error: fail(404, 'conversation not found') };
  }
  const caller = await callerFor(request, conversation);
  if (caller.access !== 'owner' && caller.access !== 'participant') {
    return { error: fail(404, 'conversation not found') };
  }
  if (!conversation.room?.open) return { error: fail(409, 'this room is not open') };

  const me = meIn(conversation, caller);
  if (!me) return { error: fail(409, 'you are not in this room') };
  return { conversation, me };
}
