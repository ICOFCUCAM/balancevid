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
  authorParticipant, hasSeveralVoices, participantFor, responseNumbers,
  speakingParticipants,
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
