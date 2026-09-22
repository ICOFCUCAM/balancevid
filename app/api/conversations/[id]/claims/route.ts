import type { SuggestionDecision } from '../../../../../src/domain/suggestions.js';
import { suggestionKey } from '../../../../../src/domain/suggestions.js';
import { EditError, bindAcceptedClaim, decideClaim } from '../../../../../src/domain/edit.js';
import { claimsFor } from '../../../../../src/knowledge/index.js';
import { loadConversation, audit, mutateConversation } from '../../../../../src/store/repository.js';
import { loadTranscript } from '../../../../../src/store/transcripts.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Suggested claims, with the author's decisions applied.  [Doctrine §20, U-15]
 *
 * Detection runs here, on every read, rather than being stored: the
 * suggestions are derived from the transcript (INV-00) and only the decisions
 * are document state. An author who has decided nothing has a Conversation
 * that contains nothing from this endpoint.
 */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }

  const stored = await loadTranscript(id);
  const result = await claimsFor(conversation, stored?.transcript ?? null);

  return json({
    claims: result.claims.map((claim) => ({
      key: claim.key,
      status: claim.status,
      effectiveQuote: claim.effectiveQuote,
      suggested: claim.suggestion.payload,
      provenance: claim.suggestion.provenance,
      ...(claim.decision ? { decision: claim.decision } : {}),
    })),
    // Shown next to the list, never buried: an author judging a suggestion
    // needs to know what produced it. [U-03's discipline, applied to U-15]
    detector: result.detector
      ? {
        id: result.detector.id,
        label: result.detector.label,
        version: result.detector.version,
        characteristics: result.detector.characteristics,
      }
      : null,
    ...(result.unavailable ? { unavailable: result.unavailable } : {}),
  });
}

/**
 * Accept, edit or reject one suggestion — and optionally bind it.
 *
 * This is the only door between the knowledge layer and the document. It is
 * deliberately one endpoint: a decision and its binding happen together, under
 * one lock, so a document can never hold a bound claim with no recorded
 * acceptance behind it (INV-06).
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    key?: string;
    status?: SuggestionDecision['status'];
    by?: string;
    editedQuote?: string;
    /** When present, the accepted claim is bound to this intervention. */
    interventionId?: string;
  };

  if (!body.key) return fail(400, 'which suggestion?');
  if (!body.status || !['accepted', 'edited', 'rejected'].includes(body.status)) {
    return fail(400, 'status must be accepted, edited or rejected');
  }
  if (!body.by?.trim()) {
    // INV-06 is not satisfiable anonymously, so the request fails rather than
    // recording a decision nobody made.
    return fail(400, 'a claim decision must record who made it [INV-06, U-15]');
  }

  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }

  const stored = await loadTranscript(id);
  const { claims, unavailable } = await claimsFor(conversation, stored?.transcript ?? null);
  if (unavailable) return fail(409, unavailable);

  const claim = claims.find((c) => c.key === body.key);
  if (!claim) return fail(404, 'that suggestion is not among the current ones');
  if (claim.suggestion.payload.kind !== 'claim') return fail(400, 'not a claim suggestion');
  const payload = claim.suggestion.payload;

  // The source's own words, for the verbatim check inside bindAcceptedClaim.
  const sourceText = (stored?.transcript?.sentences ?? []).map((s) => s.text).join(' ');
  const at = new Date().toISOString();
  const quote = body.status === 'edited' ? (body.editedQuote ?? '') : payload.quote;

  try {
    const updated = await mutateConversation(id, (draft) => {
      decideClaim(draft, {
        suggestionKey: suggestionKey(payload),
        status: body.status!,
        by: body.by!.trim(),
        at,
        provenance: claim.suggestion.provenance,
        ...(body.status === 'edited' ? { editedQuote: body.editedQuote ?? '' } : {}),
      });

      if (body.interventionId && body.status !== 'rejected') {
        bindAcceptedClaim(draft, body.interventionId, {
          quote,
          sourceText,
          startFrame: payload.startFrame,
          origin: {
            ...claim.suggestion.provenance,
            suggestionId: claim.suggestion.id,
            acceptedBy: body.by!.trim(),
            acceptedAt: at,
          },
          ...(stored?.version ? { transcriptVersion: stored.version } : {}),
        });
      }
    });

    // The audit log is the trail that survives a document rollback. [U-15]
    await audit(id, {
      action: `claim.${body.status}`,
      acceptedBy: body.by.trim(),
      detail: {
        suggestionKey: body.key,
        model: claim.suggestion.provenance.model,
        version: claim.suggestion.provenance.version,
        promptHash: claim.suggestion.provenance.promptHash,
        ...(body.interventionId ? { interventionId: body.interventionId } : {}),
        ...(body.status === 'edited' ? { editedQuote: body.editedQuote } : {}),
      },
    });

    return json({
      decision: updated.claimDecisions?.find((d) => d.suggestionKey === body.key),
      ...(body.interventionId
        ? { intervention: updated.interventions.find((i) => i.id === body.interventionId) }
        : {}),
    });
  } catch (error) {
    if (error instanceof EditError) return fail(400, error.message);
    return fail(500, error instanceof Error ? error.message : 'could not record the decision');
  }
}
