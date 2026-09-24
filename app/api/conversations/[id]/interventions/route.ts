import {
  INTERVENTION_TYPES, type Intervention, type InterventionId,
  type InterventionType, type TakeId,
} from '../../../../../src/domain/document.js';
import { newId, quoteHash } from '../../../../../src/domain/ids.js';
import { assertFrames } from '../../../../../src/domain/time.js';
import { EditError, bindAcceptedClaim, decideClaim } from '../../../../../src/domain/edit.js';
import { claimsFor } from '../../../../../src/knowledge/index.js';
import { audit, loadConversation, mutateConversation } from '../../../../../src/store/repository.js';
import { callerFor, isOwner } from '../../../../../src/auth/request.js';
import { mayRecord } from '../../../../../src/web/room.js';
import { loadTranscript } from '../../../../../src/store/transcripts.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Open an intervention. Called the instant the key is pressed.
 *
 * The take is created empty: it has no usable frames until the worker has
 * assembled and measured it, so the domain simply does not render it yet. No
 * "pending" flag is needed -- an empty take is already unrenderable.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const body = await request.json() as {
    tSourceFrame?: number;
    type?: string;
    quote?: string;
    note?: string;
    /**
     * Set when the author is answering a SUGGESTED claim rather than one they
     * found themselves. The quote is then taken from the suggestion and
     * carries its provenance — it never arrives as plain `quote`, because a
     * suggestion that enters as author-selected text is exactly the silent
     * path U-15 forbids.
     */
    claimKey?: string;
    /** Who accepted it. INV-06 is not satisfiable anonymously. */
    by?: string;
    editedQuote?: string;
  };

  /*
   * Whose turn is this?  [Doctrine ROOM §9, §10, D-03]
   *
   * The owner records into their own conversation, as they always have. A
   * guest records only as THEMSELVES, and only while the host has them on
   * stage — a room where anyone may put themselves into the finished video
   * whenever they like is not one a host controls.
   *
   * The participant comes from the signed session and never from the body.
   * That is the single line that stops a guest attributing a recording to
   * somebody else, and it is why the body has no participant field to send.
   */
  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }
  const caller = await callerFor(request, conversation);
  if (!mayRecord(conversation, caller)) return fail(404, 'conversation not found');

  const tSourceFrame = Number(body.tSourceFrame);
  try {
    assertFrames(tSourceFrame);
  } catch {
    return fail(400, 'tSourceFrame must be a non-negative integer frame index');
  }

  const type = (body.type ?? 'critique') as InterventionType;
  if (!INTERVENTION_TYPES.includes(type)) return fail(400, `unknown intervention type: ${type}`);

  const interventionId = newId('ivn') as InterventionId;
  const takeId = newId('take') as TakeId;
  // A quote passed here is one the author highlighted in the transcript
  // themselves. A suggested claim takes the `claimKey` path below instead.
  const quote = body.claimKey ? undefined : body.quote?.trim();

  if (body.claimKey && !body.by?.trim()) {
    return fail(400, 'answering a suggested claim must record who accepted it [INV-06, U-15]');
  }

  const intervention: Intervention = {
    id: interventionId,
    anchor: {
      tSourceFrame,
      // The claim is bound to its hash the moment it is captured, so it cannot
      // later drift from what was actually said (INV-05, U-10).
      ...(quote ? { quote, quoteHash: quoteHash(quote) } : {}),
    },
    type,
    takes: [{
      id: takeId,
      assetId: newId('asset'),
      createdAt: new Date().toISOString(),
      durationFrames: 0,
      prerollFrames: 0,
      mediaInFrame: 0,
      mediaOutFrame: 0,
    }],
    selectedTakeId: takeId,
    ...(caller.participantId ? { participantId: caller.participantId as never } : {}),
    ...(body.note ? { note: body.note } : {}),
    createdAt: new Date().toISOString(),
  };

  /**
   * Answering a suggestion: the acceptance and the binding happen in the same
   * mutation as the intervention's creation, under one lock. There is no
   * window in which the document holds a bound suggested claim with no
   * recorded acceptance behind it (INV-06).
   */
  let accepted: { key: string; model: string; quote: string } | null = null;
  if (body.claimKey) {
    let conversation;
    try {
      conversation = await loadConversation(id);
    } catch {
      return fail(404, 'conversation not found');
    }
    const stored = await loadTranscript(id);
    const { claims, unavailable } = await claimsFor(conversation, stored?.transcript ?? null);
    if (unavailable) return fail(409, unavailable);
    const claim = claims.find((c) => c.key === body.claimKey);
    if (!claim || claim.suggestion.payload.kind !== 'claim') {
      return fail(404, 'that suggestion is not among the current ones');
    }
    const payload = claim.suggestion.payload;
    const sourceText = (stored?.transcript?.sentences ?? []).map((s) => s.text).join(' ');
    const edited = body.editedQuote?.trim();
    const bound = edited || payload.quote;
    const at = new Date().toISOString();
    const by = body.by!.trim();

    try {
      await mutateConversation(id, (draft) => {
        draft.interventions.push(intervention);
        decideClaim(draft, {
          suggestionKey: claim.key,
          status: edited ? 'edited' : 'accepted',
          by, at,
          provenance: claim.suggestion.provenance,
          ...(edited ? { editedQuote: edited } : {}),
        });
        bindAcceptedClaim(draft, interventionId, {
          quote: bound,
          sourceText,
          startFrame: payload.startFrame,
          origin: {
            ...claim.suggestion.provenance,
            suggestionId: claim.suggestion.id,
            acceptedBy: by,
            acceptedAt: at,
          },
          ...(stored?.version ? { transcriptVersion: stored.version } : {}),
        });
      });
    } catch (error) {
      if (error instanceof EditError) return fail(400, error.message);
      return fail(500, error instanceof Error ? error.message : 'could not bind the claim');
    }
    accepted = { key: claim.key, model: claim.suggestion.provenance.model, quote: bound };
  } else {
    try {
      await mutateConversation(id, (conversation) => {
        conversation.interventions.push(intervention);
      });
    } catch (error) {
      return fail(404, error instanceof Error ? error.message : 'conversation not found');
    }
  }

  await audit(id, {
    action: 'intervention.opened',
    ...(accepted ? { acceptedBy: body.by!.trim() } : {}),
    detail: {
      interventionId, takeId, tSourceFrame, type,
      ...(accepted ? { suggestionKey: accepted.key, model: accepted.model } : {}),
    },
  });
  return json({ interventionId, takeId }, { status: 201 });
}

/** Delete an intervention. Takes are kept on disk; only the document changes. */
export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  /*
   * The owner's, and only the owner's.  [D-03, D-06]
   *
   * Checked here as well as in middleware, because middleware decides which
   * ROUTES may be reached and this file answers more than one method on the
   * same route. Guests may POST here to record themselves; nobody but the
   * owner may delete somebody's work.
   */
  if (!(await isOwner(request))) return fail(404, 'conversation not found');
  const interventionId = new URL(request.url).searchParams.get('interventionId');
  if (!interventionId) return fail(400, 'interventionId is required');
  await mutateConversation(id, (conversation) => {
    conversation.interventions = conversation.interventions.filter((i) => i.id !== interventionId);
  });
  await audit(id, { action: 'intervention.deleted', detail: { interventionId } });
  return json({ ok: true });
}
