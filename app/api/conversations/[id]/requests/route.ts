import {
  ParticipationError, newRequest,
} from '../../../../../src/domain/participationEdit.js';
import { viewFor } from '../../../../../src/domain/participation.js';
import { answersAllowed, phoneAsk } from '../../../../../src/domain/askPhone.js';
import { loadConversation } from '../../../../../src/store/repository.js';
import {
  linkFor, listRequests, newSecret, saveRequest,
} from '../../../../../src/store/requests.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Send a question to somebody's phone.  [TIMELINE B14d; D-25, T12]
 *
 * "With Studio One... questions for a particular program could be
 * forwarded to their phones."
 *
 * THE SAME REQUEST OBJECT A PERFORMANCE ISSUES, with a different
 * assignment on it. A conversation has no song to perform against, so
 * nothing is written into `reference` and the phone is told there is
 * no clock to keep — which is the one difference, and it is data.
 *
 * WHAT THEY MAY WATCH FIRST is the conversation's own source, named
 * by id rather than by URL for the reason the upload destination is
 * not one: an origin written into a record breaks the moment a
 * self-hosted installation moves, and a forged one is somewhere to
 * send a stranger's camera. [T14]
 *
 * NOTHING ABOUT THE PRODUCTION CROSSES. Not the transcript, not the
 * other answers, not the other people — a participant holds a
 * request and a producer holds a studio, and this object is the whole
 * of the boundary between them. [D-25]
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

  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'that conversation could not be found');
  }

  const wants = phoneAsk(body.wants ?? 'answer');
  if (!wants) return fail(400, 'that is not something a phone can be asked for');
  const asks = body.asks?.trim();
  /*
   * A QUESTION IS THE WHOLE POINT, so an empty one is refused rather
   * than filled in. A performance can default to "sing along to X"
   * because the song says what is wanted; nothing here does.
   */
  if (!asks) return fail(400, 'say what you are asking for');

  const now = new Date().toISOString();
  try {
    const request = newRequest({
      holder: { kind: 'conversation', id: conversation.id },
      assignment: {
        kind: wants.kind,
        asks,
        /*
         * THE MEZZANINE, WHICH IS THE ONE COPY WE MAY SHOW, and only
         * for a source we hold as a file: a Class B source is
         * somebody else's player and is not ours to hand to a phone.
         * [U-01, U-02, INV-15]
         */
        ...(conversation.source?.mezzanineAssetId
          ? { watch: conversation.source.mezzanineAssetId } : {}),
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

/** What has been asked of whom, for this conversation. [T5a, T9a] */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const all = await listRequests();
  const mine = all.filter((request) => request.holder.kind === 'conversation'
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
