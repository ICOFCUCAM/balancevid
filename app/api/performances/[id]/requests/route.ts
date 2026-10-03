import {
  ParticipationError, newRequest,
} from '../../../../../src/domain/participationEdit.js';
import { viewFor } from '../../../../../src/domain/participation.js';
import { loadPerformance } from '../../../../../src/store/performances.js';
import {
  linkFor, listRequests, newSecret, saveRequest,
} from '../../../../../src/store/requests.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Invite performers.  [Doctrine D-25; TAKE-APP T2, T6]
 *
 * The producer's end of the boundary: a performance, a sentence saying
 * what is wanted, and a link to send over WhatsApp.
 *
 * THE REFERENCE IS TAKEN FROM THE DOCUMENT, NOT FROM THE REQUEST BODY,
 * and that is the whole of T6. "The phone knows exactly what the
 * performer is supposed to perform against" — so the title, the measured
 * duration and the accepted tempo are read off the performance here and
 * written INTO the request, where they cannot drift. A client that sent
 * its own reference could send any reference, and a request that fetched
 * one later would describe a song the performer never heard if the
 * producer changed it.
 *
 * THE DURATION IS THE MEASURED ONE. `master.durationSamples` is taken by
 * decoding the file rather than from a container header (U-02), which is
 * what makes it safe to hand a phone as the clock to perform against.
 *
 * AND THE TEMPO ONLY IF A HUMAN ACCEPTED IT. [INV-06] An unaccepted beat
 * grid is a detection; sending it to a performer as "114 BPM" would make
 * a guess look like an instruction.
 */
export async function POST(httpRequest: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const body = await httpRequest.json().catch(() => ({})) as {
    asks?: string;
    participant?: string;
    takes?: number;
    expiresAt?: string;
    /** Sound only — a backing vocal from somebody with a bad camera. */
    audioOnly?: boolean;
  };

  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'that performance could not be found');
  }

  const beats = performance.beats;
  const now = new Date().toISOString();

  try {
    const request = newRequest({
      holder: { kind: 'performance', id: performance.id },
      assignment: {
        kind: 'performance',
        asks: body.asks?.trim() || `Sing along to "${performance.master.title}"`,
        watch: performance.master.assetId,
        reference: {
          title: performance.master.title,
          durationSamples: performance.master.durationSamples,
          ...(beats?.acceptedBy && beats.bpm ? { bpm: beats.bpm } : {}),
          ...(performance.master.countInSamples
            ? { offsetSamples: performance.master.countInSamples } : {}),
        },
      },
      allowed: body.audioOnly
        ? { audio: true, takes: body.takes ?? 3 }
        : { video: true, takes: body.takes ?? 3 },
      token: newSecret(),
      participant: body.participant?.trim() || undefined,
      expiresAt: body.expiresAt,
      now,
    });
    await saveRequest(request);
    /*
     * THE LINK IS RETURNED ONCE, HERE, and the token is never in any
     * other response. A producer can always rotate it; what they cannot
     * do is read it back out of the inbox, which keeps the credential
     * out of every listing, log and screenshot but this one.
     */
    return json({ request: viewFor(request), link: linkFor(request) }, { status: 201 });
  } catch (error) {
    if (error instanceof ParticipationError) return fail(400, error.message);
    throw error;
  }
}

/**
 * What has been asked of whom, for this performance.  [T5a, T9a]
 *
 * The producer's list. Tokens are not in it — see above — so this is
 * safe to render, log and screenshot.
 */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const all = await listRequests();
  const mine = all.filter((request) => request.holder.kind === 'performance'
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
        /*
         * WHICH CAPTURE IT IS ONE ANGLE OF, so the inbox can show
         * one arrival rather than four.  [B-3]
         *
         * Carried rather than counted here: the panel groups with
         * `arrivalsIn`, which is the same function Studio Two's
         * multiview badge reads, so the inbox and the rail cannot
         * come to different conclusions about what belongs
         * together. [D-19]
         */
        capturedIn: submission.capturedIn,
      })),
    })),
  });
}
