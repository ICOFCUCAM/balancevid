import {
  ParticipationError, newRequest,
} from '../../../../../src/domain/participationEdit.js';
import { viewFor } from '../../../../../src/domain/participation.js';
import { answersAllowed, phoneAsk } from '../../../../../src/domain/askPhone.js';
import { loadChannel } from '../../../../../src/store/channels.js';
import {
  linkFor, listRequests, newSecret, saveRequest,
} from '../../../../../src/store/requests.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Send a question to the audience's phones.  [TIMELINE B14d, B14e; D-25]
 *
 * "With... Online TV, videos or audio or other questions for a
 * particular program could be forwarded to their phones... waiting
 * for live tv or conversational studio program where the host can
 * cite their participation and play their view that is already on
 * the queue."
 *
 * THE SAME REQUEST OBJECT THE OTHER TWO STUDIOS ISSUE, which is what
 * makes the queue possible: a channel's answers and a conversation's
 * answers are the same kind of thing, received the same way, and the
 * host's queue reads one list rather than two. [D-19]
 *
 * NOTHING ABOUT THE PROGRAMME CROSSES. Not the playlist, not who else
 * answered, not what is on air — a participant holds a request and a
 * producer holds a channel, and this object is the whole of the
 * boundary between them. [D-25]
 */
export async function POST(httpRequest: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const body = await httpRequest.json().catch(() => ({})) as {
    asks?: string;
    /** `answer`, `voice` or `written`. Anything else is a refusal. */
    wants?: string;
    participant?: string;
    answers?: number;
    expiresAt?: string;
  };

  let channel;
  try {
    channel = await loadChannel(id);
  } catch {
    return fail(404, 'that channel could not be found');
  }

  const wants = phoneAsk(body.wants ?? 'answer');
  if (!wants) return fail(400, 'that is not something a phone can be asked for');
  const asks = body.asks?.trim();
  /* A question is the whole point, so an empty one is refused rather
     than filled in: nothing about a channel says what is wanted. */
  if (!asks) return fail(400, 'say what you are asking for');

  const now = new Date().toISOString();
  try {
    const request = newRequest({
      holder: { kind: 'channel', id: channel.id },
      assignment: {
        kind: wants.kind,
        asks,
        /*
         * NOTHING TO WATCH FIRST. A channel is a running programme
         * rather than a file, and the thing an answer is about is
         * whatever was on air when the question was sent — which is
         * not an asset anybody can be handed. The question carries
         * the context, in the producer's own words. [T14]
         */
      },
      allowed: {
        ...(wants.video ? { video: true } : {}),
        ...(wants.audio ? { audio: true } : {}),
        takes: answersAllowed(body.answers),
      },
      token: newSecret(),
      participant: body.participant?.trim() || undefined,
      expiresAt: body.expiresAt,
      now,
    });
    await saveRequest(request);
    /* The link is returned once, here, and never read back out of a
       listing: the credential stays out of every log and screenshot
       but this one. [T14] */
    return json({ request: viewFor(request), link: linkFor(request) },
      { status: 201 });
  } catch (error) {
    if (error instanceof ParticipationError) return fail(400, error.message);
    throw error;
  }
}

/**
 * The queue.  [TIMELINE B14e; T9a]
 *
 * "A queue of answers the host cites and plays live." Every request
 * this channel has sent, with what has come back — which is the list
 * a host reads on air. Tokens are not in it, so it is safe to render
 * on a studio screen somebody is pointing a camera at. [T14]
 */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const all = await listRequests();
  const mine = all.filter((request) => request.holder.kind === 'channel'
    && request.holder.id === id);
  return json({
    requests: mine.map((request) => ({
      ...viewFor(request),
      createdAt: request.createdAt,
      expiresAt: request.expiresAt,
      submissions: (request.submissions ?? []).map((submission) => ({
        id: submission.id,
        /*
         * AND THE ASSET IT IS, which is what every route that serves
         * or accepts it is keyed on. [TAKE-APP T10]
         *
         * A submission has two ids — its own, which the state machine
         * moves, and the asset its media is under — and a listing
         * that carried only the first made the producer's surface
         * ask for a file by the wrong name. Which it did: "no such
         * submission", from a panel that was looking at the thing it
         * was asking about.
         */
        assetId: submission.assetId,
        kind: submission.kind,
        durationSamples: submission.durationSamples,
        at: submission.at,
        acceptedAt: submission.acceptedAt,
        device: submission.device,
      })),
    })),
  });
}
