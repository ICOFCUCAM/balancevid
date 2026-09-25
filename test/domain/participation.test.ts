/**
 * More than one voice.  [Doctrine ROOM §3, §4, §9, INV-00, U-20, D-03]
 *
 * "Multi-person participation should be built into the underlying Conversation
 *  model, even if the first release only supports one author."
 *
 * The model was already most of the way there — a Participant, an accent, a
 * `participantId` on every intervention. What was missing was the thing that
 * makes it usable: the AUTHOR was the one voice with no name, no colour and no
 * row in any list, because "absent means the author" left them implicit.
 *
 * These tests defend the two properties that follow from fixing that:
 *
 *   ASKING WHOSE A RESPONSE IS ALWAYS GETS AN ANSWER, so no surface has to
 *   carry its own idea of what an unattributed response means.
 *
 *   AND A SOLO CONVERSATION IS UNCHANGED. A name on every response of a
 *   conversation somebody is alone in is noise, and the whole point of doing
 *   this now is that it costs the single-author case nothing.
 */
import { describe, expect, it } from 'vitest';

import {
  acceptedInterventions, authorParticipant, hasSeveralVoices, orderedInterventions,
  participantFor, renderableInterventions, responseNumbers, speakingParticipants,
} from '../../src/domain/document.js';
import {
  CAPABILITIES, capabilitiesOf, defaultsFor, may, mayBeStaged,
  type Participant, type ParticipantId, type ParticipantRole,
} from '../../src/domain/participants.js';
import { projectTimeline } from '../../src/domain/timeline.js';
import { buildRenderPlan } from '../../src/domain/plan.js';
import { buildCues } from '../../src/render/cues.js';
import { S, makeConversation, makeIntervention, makeTake } from './fixtures.js';
import type { Conversation } from '../../src/domain/document.js';
import type { Transcript } from '../../src/transcribe/types.js';

const person = (
  id: string, displayName: string, role: ParticipantRole = 'speaker',
): Participant => ({
  id: id as ParticipantId, displayName, role, accent: '#336699',
  invitedAt: '2026-01-01T00:00:00.000Z', joinedAt: '2026-01-01T00:00:00.000Z',
});

function talk(voices: (string | null)[]): Conversation {
  // `null` means the author, which is what an old document stores.
  const conversation = makeConversation(S(600), voices.map((_, i) =>
    makeIntervention(S(60 * (i + 1)), S(20), { type: 'critique' })));
  conversation.participants = [person('part_sarah', 'Sarah'), person('part_mike', 'Michael')];
  conversation.interventions.forEach((intervention, i) => {
    intervention.takes = [makeTake(S(20))];
    intervention.selectedTakeId = intervention.takes[0]!.id;
    const who = voices[i];
    if (who) intervention.participantId = who as ParticipantId;
  });
  return conversation;
}

describe('the author is a participant like anyone else', () => {
  it('even when the document has never stored one', () => {
    const conversation = makeConversation(S(600), []);
    const author = authorParticipant(conversation);
    expect(author.displayName).toBe('You');
    expect(author.role).toBe('host');
    expect(author.accent).toMatch(/^#/);
    // The document is not changed by asking.
    expect(conversation.participants).toBeUndefined();
  });

  it('and the same author twice, so a reference to them survives', () => {
    const conversation = makeConversation(S(600), []);
    expect(authorParticipant(conversation).id).toBe(authorParticipant(conversation).id);
  });

  it('a stored one wins, so a name somebody set is kept', () => {
    const conversation = makeConversation(S(600), []);
    conversation.participants = [person('part_j', 'James', 'host')];
    expect(authorParticipant(conversation).displayName).toBe('James');
  });

  it('asking whose a response is always gets an answer', () => {
    const conversation = talk([null, 'part_sarah', null]);
    const names = conversation.interventions.map(
      (i) => participantFor(conversation, i).displayName);
    expect(names).toEqual(['You', 'Sarah', 'You']);
  });

  /*
   * Somebody can be removed from a room, and their recording stays in the
   * conversation because the finished video is made from it. A response with
   * nobody on it would read as the source saying it.
   */
  it('including one naming somebody the document no longer has', () => {
    const conversation = talk(['part_gone']);
    expect(participantFor(conversation, conversation.interventions[0]!).role).toBe('host');
  });
});

describe('the voices, and their order', () => {
  it('the author first, then everyone else by when they first spoke', () => {
    const conversation = talk([null, 'part_mike', 'part_sarah', 'part_mike']);
    expect(speakingParticipants(conversation).map((p) => p.displayName))
      .toEqual(['You', 'Michael', 'Sarah']);
  });

  it('and somebody invited who has never answered is not a voice yet', () => {
    const conversation = talk([null, null]);
    expect(speakingParticipants(conversation).map((p) => p.displayName)).toEqual(['You']);
    expect(hasSeveralVoices(conversation)).toBe(false);
  });

  it('responses are numbered over the whole argument, not per person', () => {
    const conversation = talk([null, 'part_sarah', null, 'part_mike']);
    const numbers = responseNumbers(conversation);
    expect(conversation.interventions.map((i) => numbers.get(i.id))).toEqual([1, 2, 3, 4]);
  });
});

describe('what the timeline can be drawn from (ROOM §9)', () => {
  it('every response says whose it is and which one it is', () => {
    const conversation = talk([null, 'part_sarah', null]);
    const responses = projectTimeline(conversation).items
      .filter((item) => item.kind === 'response');
    expect(responses.map((r) => r.responseNumber)).toEqual([1, 2, 3]);
    const sarah = responses[1]!;
    expect(sarah.participantId).toBe('part_sarah');
    // The author's, resolved rather than left absent.
    expect(responses[0]!.participantId).toBe(authorParticipant(conversation).id);
  });
});

describe('a solo conversation is unchanged (U-20)', () => {
  const solo = () => talk([null, null]);

  it('no name on any lower third', () => {
    for (const shot of buildRenderPlan(solo()).shots) {
      if (shot.kind === 'response') expect(shot.speakerName).toBeUndefined();
    }
  });

  it('and none in the captions', () => {
    const conversation = solo();
    const cues = buildCues(conversation, projectTimeline(conversation), {
      takes: new Map(conversation.interventions.map((i) => [i.takes[0]!.id, {
        engine: 'test', language: 'en', characteristics: {}, words: [],
        sentences: [{ text: 'I disagree.', startFrame: 0, endFrame: 600, words: [] }],
      } as unknown as Transcript])),
    });
    expect(cues.length).toBeGreaterThan(0);
    for (const cue of cues) expect(cue.speakerName).toBeUndefined();
  });
});

describe('and a conversation with several voices names them', () => {
  const several = () => talk([null, 'part_sarah']);

  it('on every lower third, including the author\'s own', () => {
    const named = buildRenderPlan(several()).shots
      .filter((shot) => shot.kind === 'response')
      .map((shot) => shot.speakerName);
    expect(named).toEqual(['You', 'Sarah']);
  });

  it('and in the captions', () => {
    const conversation = several();
    const cues = buildCues(conversation, projectTimeline(conversation), {
      takes: new Map(conversation.interventions.map((i) => [i.takes[0]!.id, {
        engine: 'test', language: 'en', characteristics: {}, words: [],
        sentences: [{ text: 'I disagree.', startFrame: 0, endFrame: 600, words: [] }],
      } as unknown as Transcript])),
    });
    expect(cues.map((cue) => cue.speakerName)).toEqual(['You', 'Sarah']);
  });

  it('with each person keeping their own colour', () => {
    const conversation = several();
    conversation.participants![0]!.accent = '#00ff00';
    const shots = buildRenderPlan(conversation).shots
      .filter((shot) => shot.kind === 'response');
    expect(shots[1]!.accent).toBe('#00ff00');
    expect(shots[0]!.accent).not.toBe('#00ff00');
  });
});

/*
 * "A multi-person conversation shouldn't automatically give everyone control
 *  over the finished product."
 */
describe('what each person may do (ROOM §3, D-03)', () => {
  it('the host may do everything, and cannot be locked out of their own work', () => {
    const host = person('part_h', 'James', 'host');
    host.grants = { publish: false, 'edit.conversation': false };
    for (const capability of CAPABILITIES) expect(may(host, capability)).toBe(true);
  });

  it('a speaker may answer and tidy their own material, and nothing else', () => {
    expect(capabilitiesOf(person('part_s', 'Sarah'))).toEqual(['respond', 'edit.own']);
  });

  /*
   * The one that matters. Publishing cannot be taken back — the link is out —
   * so it is granted deliberately or not at all, whatever else somebody runs.
   */
  it('nobody but the host publishes by default, not even a co-host', () => {
    for (const role of ['speaker', 'audience', 'editor'] as const) {
      expect(defaultsFor(role)).not.toContain('publish');
    }
  });

  it('but it can be granted, which is the point of it being a capability', () => {
    const sarah = person('part_s', 'Sarah');
    expect(may(sarah, 'publish')).toBe(false);
    sarah.grants = { publish: true };
    expect(may(sarah, 'publish')).toBe(true);
  });

  it('and withheld from someone whose role would otherwise carry it', () => {
    const sarah = person('part_s', 'Sarah');
    sarah.grants = { respond: false };
    expect(may(sarah, 'respond')).toBe(false);
    // Withholding one leaves the others where the role put them.
    expect(may(sarah, 'edit.own')).toBe(true);
  });

  it('an editor shapes the conversation and is never in it', () => {
    const editor = person('part_e', 'Producer', 'editor');
    expect(capabilitiesOf(editor)).toEqual(['edit.conversation']);
    expect(mayBeStaged('editor')).toBe(false);
    expect(may(editor, 'respond')).toBe(false);
  });

  it('an audience member may do nothing to the conversation until brought in', () => {
    expect(capabilitiesOf(person('part_a', 'Someone', 'audience'))).toEqual([]);
  });

  /*
   * Editing your own stumble and re-cutting everyone's argument are different
   * powers. Collapsing them would mean the first grants the second.
   */
  it('tidying your own material is not authority over anyone else\'s', () => {
    const sarah = person('part_s', 'Sarah');
    expect(may(sarah, 'edit.own')).toBe(true);
    expect(may(sarah, 'edit.conversation')).toBe(false);
  });

  it('grants are stored sparsely, so role defaults can still move', () => {
    const sarah = person('part_s', 'Sarah');
    expect(sarah.grants).toBeUndefined();
    expect(may(sarah, 'respond')).toBe(true);
  });
});

/**
 * Several voices answering ONE claim.  [D-17]
 *
 *                     SOURCE CLAIM
 *                          │
 *         ┌────────────────┼────────────────┐
 *        YOU             SARAH            DAVID
 *
 * The open-discussion shape. Nothing in the product offers it yet — there is
 * no way to submit a response to somebody else's conversation — but the
 * COMPOSITION of it already works, and that is the thing that would have been
 * expensive to discover was wrong later.
 *
 * Asserted rather than assumed, because it works by consequence rather than
 * by design: two interventions on the same frame leave a zero-length stretch
 * of source between them, which the projection drops. A change that made a
 * zero-length segment an error, or that assumed one response per anchor,
 * would break this and no other test would notice.
 */
describe('an open discussion composes (D-17)', () => {
  function oneClaim(): Conversation {
    const conversation = makeConversation(S(600), [
      makeIntervention(S(100), S(20), { type: 'critique', quote: 'The policy worked.' }),
      makeIntervention(S(100), S(20), { type: 'critique', quote: 'The policy worked.' }),
      makeIntervention(S(100), S(20), { type: 'critique', quote: 'The policy worked.' }),
    ]);
    conversation.participants = [person('part_sarah', 'Sarah'), person('part_david', 'David')];
    conversation.interventions.forEach((intervention, i) => {
      intervention.takes = [makeTake(S(20))];
      intervention.selectedTakeId = intervention.takes[0]!.id;
      if (i === 1) intervention.participantId = 'part_sarah' as ParticipantId;
      if (i === 2) intervention.participantId = 'part_david' as ParticipantId;
    });
    return conversation;
  }

  it('three answers to one claim play one after another, then the source resumes', () => {
    const items = projectTimeline(oneClaim()).items;
    expect(items.map((item) => item.kind))
      .toEqual(['source', 'response', 'response', 'response', 'source']);
  });

  it('each in their own voice, numbered across the whole argument', () => {
    const conversation = oneClaim();
    const responses = projectTimeline(conversation).items
      .filter((item) => item.kind === 'response');
    expect(responses.map((r) => r.responseNumber)).toEqual([1, 2, 3]);
    expect(buildRenderPlan(conversation).shots
      .filter((shot) => shot.kind === 'response')
      .map((shot) => shot.speakerName)).toEqual(['You', 'Sarah', 'David']);
  });

  it('and it is still frame-exact — three answers add no frames anywhere (INV-03)', () => {
    const timeline = projectTimeline(oneClaim());
    const summed = timeline.items.reduce((total, item) => total + item.durationFrames, 0);
    expect(summed).toBe(timeline.totalOutputFrames);
    // No zero-length stretch of source survives between two answers on the
    // same frame: a segment nobody can see is a segment somebody will
    // eventually render.
    expect(timeline.items.every((item) => item.durationFrames > 0)).toBe(true);
  });

  it('with the source played exactly once, in order, around all three', () => {
    const source = projectTimeline(oneClaim()).items
      .filter((item) => item.kind === 'source');
    expect(source).toHaveLength(2);
    // Out of the first is into the second: the frame answered on is the frame
    // resumed on, three answers or one. [INV-02]
    expect(source[0]!.sourceOutFrame).toBe(source[1]!.sourceInFrame);
    expect(source[0]!.sourceInFrame).toBe(0);
  });
});

/**
 * An offer is not a contribution.  [D-17, D-03]
 *
 * The conversation belongs to whoever opened it. Nothing submits a response
 * yet, and the field exists anyway — because with acceptance implicit, every
 * query in the system means "everything", and the day somebody can submit is
 * the day all of them silently start including responses nobody agreed to.
 */
describe('what the owner has agreed to', () => {
  function withOffer(state: 'pending' | 'accepted' | 'declined'): Conversation {
    const conversation = talk([null, 'part_sarah']);
    conversation.interventions[1]!.submission = {
      by: 'part_sarah' as ParticipantId, at: '2026-01-02T00:00:00.000Z', state,
    };
    return conversation;
  }

  it('a response nobody submitted is the owner\'s own, and needs no record', () => {
    const conversation = talk([null, null]);
    expect(conversation.interventions.every((i) => i.submission === undefined)).toBe(true);
    expect(acceptedInterventions(conversation)).toHaveLength(2);
  });

  it('a pending offer is in the studio and in no export', () => {
    const conversation = withOffer('pending');
    // The author has to be able to see what they have been sent.
    expect(orderedInterventions(conversation)).toHaveLength(2);
    expect(acceptedInterventions(conversation)).toHaveLength(1);
    expect(renderableInterventions(conversation)).toHaveLength(1);
    expect(projectTimeline(conversation).items
      .filter((item) => item.kind === 'response')).toHaveLength(1);
  });

  it('an accepted one is in everything', () => {
    expect(renderableInterventions(withOffer('accepted'))).toHaveLength(2);
  });

  /*
   * Kept, and in nothing. Deleting somebody's recording on their behalf is
   * not a thing this product does, and they should be able to see what
   * happened to what they sent.
   */
  it('a declined one is kept, and reaches no export', () => {
    const conversation = withOffer('declined');
    expect(conversation.interventions).toHaveLength(2);
    expect(renderableInterventions(conversation)).toHaveLength(1);
  });
});

/*
 * And the filter has to hold at every door, not one. An offer that stayed out
 * of the render but turned up in the article, the cards or the chapter list
 * would be published by the back door — which is the failure this field
 * exists to prevent. [D-17, D-16]
 */
describe('a pending offer reaches no representation', () => {
  function pending(): Conversation {
    const conversation = talk([null, 'part_sarah']);
    conversation.interventions[1]!.submission = {
      by: 'part_sarah' as ParticipantId, at: '2026-01-02T00:00:00.000Z', state: 'pending',
    };
    return conversation;
  }

  it('not the article', async () => {
    const { generateArticle } = await import('../../src/article/generate.js');
    const article = generateArticle({
      conversation: pending(), generatedAt: '2026-01-01T00:00:00.000Z' });
    expect(article.exchanges).toHaveLength(1);
  });

  it('not the share card, nor a card of its own', async () => {
    const { buildShareCard } = await import('../../src/publish/card.js');
    const { buildClaimCards } = await import('../../src/publish/claimCard.js');
    const conversation = pending();
    expect(buildShareCard({ conversation, attribution: 'x' }).scale).toContain('1 response');
    expect(buildClaimCards({ conversation, attribution: 'x' })).toHaveLength(1);
  });

  it('not the presentation, which would otherwise stop for it in a room', async () => {
    const { generatePresentation } = await import('../../src/present/generate.js');
    expect(generatePresentation({
      conversation: pending(), generatedAt: '2026-01-01T00:00:00.000Z' }).stops).toHaveLength(1);
  });

  it('and not the clip candidates, which are things offered for publishing', async () => {
    const { clipCandidates } = await import('../../src/domain/clips.js');
    expect(clipCandidates(pending())).toHaveLength(1);
  });

  /*
   * But the author can still FIND it. Search is how somebody looks through
   * their own conversation, and an offer they have been sent is exactly the
   * thing they are looking for.
   */
  it('while the author can still search for it', async () => {
    const { searchConversation } = await import('../../src/search/search.js');
    const conversation = pending();
    const offered = conversation.interventions[1]!;
    offered.note = 'Sarah on the housing figures';
    const hits = searchConversation('housing', { conversation, owned: true });
    // The pending one is findable: the studio sees what exports do not.
    expect(hits.hits.some((hit) => hit.interventionId === offered.id)).toBe(true);
  });
});
