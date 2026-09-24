/**
 * The Room's data model and the composition boundary.  [Doctrine ROOM §4, §9, §10, §12]
 *
 * The brief's instruction for this stage: "Establish the data-model and
 * composition boundaries now so the feature does not require a later
 * architectural rewrite." What that means in practice is two properties,
 * both tested here:
 *
 *   A conversation with participants is the SAME OBJECT as one without, so
 *   nothing about a solo conversation changes and there is no second kind.
 *
 *   The renderer is told WHO, never HOW — `activeParticipant = Sarah` and
 *   nothing about microphones, hosts, or who clicked what.
 */
import { describe, expect, it } from 'vitest';
import { buildRenderPlan } from '../../src/domain/plan.js';
import {
  hostOf, inRoom, onStage, raisedHands, stageable,
  type Participant, type ParticipantId,
} from '../../src/domain/participants.js';
import { makeConversation, makeIntervention } from './fixtures.js';
import type { AssetId } from '../../src/domain/document.js';

const person = (
  id: string, role: Participant['role'], state: Participant['state'],
  extra: Partial<Participant> = {},
): Participant => ({
  id: id as ParticipantId,
  displayName: id.replace('part_', ''),
  role, state,
  accent: '#6fb3e0',
  invitedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

describe('being in the room is not being on the stage (ROOM §4)', () => {
  const sarah = person('part_sarah', 'speaker', 'waiting');
  const david = person('part_david', 'speaker', 'staged');
  const invited = person('part_mo', 'speaker', 'invited');
  const gone = person('part_ann', 'speaker', 'left');

  it('separates connected from visible', () => {
    // Sarah hears everything and prepares her answer without appearing.
    expect(inRoom(sarah)).toBe(true);
    expect(onStage(sarah)).toBe(false);
    expect(inRoom(david)).toBe(true);
    expect(onStage(david)).toBe(true);
  });

  it('an invitation is not a presence', () => {
    expect(inRoom(invited)).toBe(false);
    expect(onStage(invited)).toBe(false);
  });

  it('someone who has left is neither, and is still remembered', () => {
    // Their recordings are in the conversation, so they cannot be deleted.
    expect(inRoom(gone)).toBe(false);
    expect(gone.state).toBe('left');
  });

  it('the floor can be given to anyone present who is not audience', () => {
    const audience = person('part_row3', 'audience', 'waiting');
    const room = [sarah, david, invited, gone, audience];
    expect(stageable(room).map((p) => p.id)).toEqual(['part_sarah', 'part_david']);
  });

  it('the host is whoever holds the role, not whoever is first', () => {
    const room = [sarah, person('part_james', 'host', 'staged'), david];
    expect(hostOf(room)?.id).toBe('part_james');
    expect(hostOf([sarah, david])).toBeUndefined();
  });

  it('hands go up in the order they were raised (ROOM §8)', () => {
    const room = [
      person('part_b', 'audience', 'waiting', { handRaisedAt: '2026-01-01T10:00:02.000Z' }),
      person('part_a', 'audience', 'waiting', { handRaisedAt: '2026-01-01T10:00:01.000Z' }),
      person('part_c', 'audience', 'waiting'),
      person('part_d', 'audience', 'invited', { handRaisedAt: '2026-01-01T10:00:00.000Z' }),
    ];
    // Not d: an invitation nobody has used cannot raise a hand.
    expect(raisedHands(room).map((p) => p.id)).toEqual(['part_a', 'part_b']);
  });
});

describe('the composition boundary (ROOM §9)', () => {
  const build = (participants?: Participant[], who?: string) => {
    const conversation = makeConversation(600, [makeIntervention(120, 90, { type: 'critique' })]);
    conversation.source.mezzanineAssetId = 'asset_source' as AssetId;
    for (const ivn of conversation.interventions) {
      for (const take of ivn.takes) take.assetId = 'asset_response' as AssetId;
      if (who) ivn.participantId = who as ParticipantId;
    }
    if (participants) conversation.participants = participants;
    return buildRenderPlan(conversation);
  };

  it('a conversation with nobody named plans exactly as it always did', () => {
    const plan = build();
    const shot = plan.shots.find((s) => s.kind === 'response') as
      { participantId?: string; speakerName?: string; lowerThird: string };
    expect(shot.participantId).toBeUndefined();
    expect(shot.speakerName).toBeUndefined();
    expect(shot.lowerThird).toBe('CRITIQUE');
  });

  it('names the speaker when a room holds more than one', () => {
    const plan = build([
      person('part_james', 'host', 'staged', { displayName: 'James' }),
      person('part_sarah', 'speaker', 'staged', { displayName: 'Sarah', accent: '#c2794f' }),
    ], 'part_sarah');
    const shot = plan.shots.find((s) => s.kind === 'response') as
      { participantId?: string; speakerName?: string; accent: string };
    expect(shot.participantId).toBe('part_sarah');
    expect(shot.speakerName).toBe('Sarah');
    // Speaker identity is carried by colour too (U-20).
    expect(shot.accent).toBe('#c2794f');
  });

  it('does not name a name nobody needs', () => {
    // One speaker, alone. A lower third reading their own name on every
    // response of their own conversation is noise.
    const plan = build([
      person('part_james', 'host', 'staged', { displayName: 'James' }),
    ], 'part_james');
    const shot = plan.shots.find((s) => s.kind === 'response') as { speakerName?: string };
    expect(shot.speakerName).toBeUndefined();
  });

  it('an audience does not count towards needing names', () => {
    const plan = build([
      person('part_james', 'host', 'staged', { displayName: 'James' }),
      person('part_row3', 'audience', 'waiting'),
      person('part_row4', 'audience', 'waiting'),
    ], 'part_james');
    const shot = plan.shots.find((s) => s.kind === 'response') as { speakerName?: string };
    expect(shot.speakerName).toBeUndefined();
  });

  it('the plan says who, and nothing about how they were chosen', () => {
    /*
     * The boundary, asserted directly. A plan carries a participant id and a
     * name; it carries no speaker mode, no pin, no microphone reading and no
     * trace of whether a host clicked or a detector decided. If any of that
     * appeared here, changing automatic to manual after the fact (ROOM §10)
     * would mean re-planning against live state that no longer exists.
     */
    const plan = build([
      person('part_james', 'host', 'staged', { displayName: 'James' }),
      person('part_sarah', 'speaker', 'staged', { displayName: 'Sarah' }),
    ], 'part_sarah');
    const text = JSON.stringify(plan);
    for (const leak of ['speakerMode', 'pinned', 'energy', 'speechConfidence',
      'automatic', 'hysteresis', 'inviteToken']) {
      expect(text, `the plan leaks ${leak}`).not.toContain(leak);
    }
  });
});
