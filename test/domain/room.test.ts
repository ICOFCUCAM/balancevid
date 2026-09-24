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
  hasLeft, hostOf, inRoom, onStage, presenceOf, raisedHands, stageable,
  type Participant, type ParticipantId,
} from '../../src/domain/participants.js';
import { makeConversation, makeIntervention } from './fixtures.js';
import type { AssetId } from '../../src/domain/document.js';

/**
 * A participant, described by what HAPPENED to them rather than by a state.
 *
 * `joined` and `gone` are timestamps; whether they are waiting or staged is
 * asked of the room. That is the whole point of the model: there is no state
 * field to set wrongly.
 */
const person = (
  id: string, role: Participant['role'],
  when: { joined?: boolean; gone?: boolean } = {},
  extra: Partial<Participant> = {},
): Participant => ({
  id: id as ParticipantId,
  displayName: id.replace('part_', ''),
  role,
  accent: '#6fb3e0',
  invitedAt: '2026-01-01T00:00:00.000Z',
  ...(when.joined || when.gone ? { joinedAt: '2026-01-01T00:01:00.000Z' } : {}),
  ...(when.gone ? { leftAt: '2026-01-01T00:20:00.000Z' } : {}),
  ...extra,
});

describe('being in the room is not being on the stage (ROOM §4)', () => {
  const sarah = person('part_sarah', 'speaker', { joined: true });
  const david = person('part_david', 'speaker', { joined: true });
  const invited = person('part_mo', 'speaker');
  const gone = person('part_ann', 'speaker', { gone: true });
  const staged = ['part_david'];

  it('separates connected from visible', () => {
    // Sarah hears everything and prepares her answer without appearing.
    expect(inRoom(sarah)).toBe(true);
    expect(onStage(sarah, staged)).toBe(false);
    expect(inRoom(david)).toBe(true);
    expect(onStage(david, staged)).toBe(true);
  });

  it('an invitation is not a presence', () => {
    expect(inRoom(invited)).toBe(false);
    expect(onStage(invited, staged)).toBe(false);
  });

  it('someone who has left is neither, and is still remembered', () => {
    // Their recordings are in the conversation, so they cannot be deleted.
    expect(inRoom(gone)).toBe(false);
    expect(hasLeft(gone)).toBe(true);
    expect(gone.displayName).toBe('ann');
  });

  it('gives back the brief\'s three states and nothing else', () => {
    expect(presenceOf(invited, staged)).toBe('invited');
    expect(presenceOf(sarah, staged)).toBe('waiting');
    expect(presenceOf(david, staged)).toBe('staged');
    // Having gone is not a fourth state; it is the absence of a presence.
    expect(presenceOf(gone, staged)).toBeUndefined();
  });

  it('cannot be set wrongly, because it is not set at all', () => {
    // The same person, staged or not, according to the room — not according
    // to a flag on them that something forgot to update.
    expect(presenceOf(sarah, [])).toBe('waiting');
    expect(presenceOf(sarah, ['part_sarah'])).toBe('staged');
    expect(Object.keys(sarah)).not.toContain('state');
  });

  it('the floor can be given to anyone present who is not audience', () => {
    const audience = person('part_row3', 'audience', { joined: true });
    const room = [sarah, david, invited, gone, audience];
    expect(stageable(room).map((p) => p.id)).toEqual(['part_sarah', 'part_david']);
  });

  it('the host is whoever holds the role, not whoever is first', () => {
    const room = [sarah, person('part_james', 'host', { joined: true }), david];
    expect(hostOf(room)?.id).toBe('part_james');
    expect(hostOf([sarah, david])).toBeUndefined();
  });

  it('hands go up in the order they were raised (ROOM §8)', () => {
    const room = [
      person('part_b', 'audience', { joined: true }, { handRaisedAt: '2026-01-01T10:00:02.000Z' }),
      person('part_a', 'audience', { joined: true }, { handRaisedAt: '2026-01-01T10:00:01.000Z' }),
      person('part_c', 'audience', { joined: true }),
      person('part_d', 'audience', {}, { handRaisedAt: '2026-01-01T10:00:00.000Z' }),
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
      person('part_james', 'host', { joined: true }, { displayName: 'James' }),
      person('part_sarah', 'speaker', { joined: true }, { displayName: 'Sarah', accent: '#c2794f' }),
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
      person('part_james', 'host', { joined: true }, { displayName: 'James' }),
    ], 'part_james');
    const shot = plan.shots.find((s) => s.kind === 'response') as { speakerName?: string };
    expect(shot.speakerName).toBeUndefined();
  });

  it('an audience does not count towards needing names', () => {
    const plan = build([
      person('part_james', 'host', { joined: true }, { displayName: 'James' }),
      person('part_row3', 'audience', { joined: true }),
      person('part_row4', 'audience', { joined: true }),
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
      person('part_james', 'host', { joined: true }, { displayName: 'James' }),
      person('part_sarah', 'speaker', { joined: true }, { displayName: 'Sarah' }),
    ], 'part_sarah');
    const text = JSON.stringify(plan);
    for (const leak of ['speakerMode', 'pinned', 'energy', 'speechConfidence',
      'automatic', 'hysteresis', 'inviteToken']) {
      expect(text, `the plan leaks ${leak}`).not.toContain(leak);
    }
  });
});

describe('changing the cut without re-recording (ROOM §10)', () => {
  /*
   * "Change automatic switching to manual ... without having to record the
   *  conversation again."
   *
   * For that sentence to be true, the record of WHO HELD THE STAGE WHEN has
   * to be data the author can edit afterwards. The first instinct was to add
   * a `stageHistory` to the room — and it would have been a fourth field
   * declared and never read, which this codebase has now shipped three times.
   *
   * It is not needed. The stage history already exists: it is the
   * interventions, ordered by their anchors (U-08), each naming the
   * participant who spoke. A live room does not produce a separate log of
   * switches — each switch IS someone taking a turn, and a turn is an
   * intervention. So "change automatic to manual" is editing the
   * conversation, which is the one thing this product has always been able
   * to do, and the media is untouched throughout.
   */
  const threeWay = () => {
    const conversation = makeConversation(1200, [
      makeIntervention(120, 90, { type: 'critique' }),
      makeIntervention(400, 90, { type: 'explain' }),
      makeIntervention(700, 90, { type: 'agree' }),
    ]);
    conversation.source.mezzanineAssetId = 'asset_source' as AssetId;
    for (const ivn of conversation.interventions) {
      for (const take of ivn.takes) take.assetId = 'asset_response' as AssetId;
    }
    conversation.participants = [
      person('part_james', 'host', { joined: true }, { displayName: 'James' }),
      person('part_sarah', 'speaker', { joined: true },
        { displayName: 'Sarah', accent: '#c2794f' }),
      person('part_mike', 'speaker', { joined: true },
        { displayName: 'Michael', accent: '#4f8a5b' }),
    ];
    // As the room decided it live: automatic switching gave these turns out.
    const order = ['part_james', 'part_sarah', 'part_mike'];
    conversation.interventions.forEach((ivn, i) => {
      ivn.participantId = order[i] as ParticipantId;
    });
    return conversation;
  };

  it('the plan follows who is attributed, turn by turn', () => {
    const plan = buildRenderPlan(threeWay());
    const names = plan.shots
      .filter((s) => s.kind === 'response')
      .map((s) => (s as { speakerName?: string }).speakerName);
    expect(names).toEqual(['James', 'Sarah', 'Michael']);
  });

  it('reassigning a turn changes the video and touches no media', () => {
    /*
     * One conversation, edited in place — which is the only way this property
     * means anything. Two separately built fixtures have different take ids
     * and would compare unequal for a reason that has nothing to do with
     * whether the media moved.
     */
    const conversation = threeWay();
    const media = () => conversation.interventions
      .flatMap((iv) => iv.takes.map((t) => `${t.id}:${t.assetId}:${t.durationFrames}`));
    const mediaBefore = media();
    const hashBefore = buildRenderPlan(conversation).planHash;

    // The host reviews it afterwards: that second turn was actually Michael.
    conversation.interventions[1]!.participantId = 'part_mike' as ParticipantId;

    const plan = buildRenderPlan(conversation);
    expect(plan.shots.filter((s) => s.kind === 'response')
      .map((s) => (s as { speakerName?: string }).speakerName))
      .toEqual(['James', 'Michael', 'Michael']);

    // Not one frame of anybody's recording moved.
    expect(media()).toEqual(mediaBefore);

    /*
     * And the plan DID change. The plan hash is what the shot cache keys on
     * (U-16): if reassigning a turn left it alone, the old video would be
     * served for the new cut and the edit would appear to do nothing.
     */
    expect(plan.planHash).not.toBe(hashBefore);
  });

  it('a mode is a decision about the finished video, so it is on the document', () => {
    /*
     * `speakerMode` belongs to the conversation and not to a browser session,
     * for exactly the reason §10 gives: it must be changeable after the
     * discussion is over, and a setting that lived only in the live session
     * would be gone by then.
     */
    const conversation = threeWay();
    conversation.room = {
      inviteToken: 'tok_x', issuedAt: '2026-01-01T00:00:00.000Z',
      open: true, speakerMode: 'automatic',
    };
    const roundTripped = JSON.parse(JSON.stringify(conversation));
    expect(roundTripped.room.speakerMode).toBe('automatic');
    roundTripped.room.speakerMode = 'manual';
    expect(JSON.parse(JSON.stringify(roundTripped)).room.speakerMode).toBe('manual');
  });

  it('and the mode never reaches the renderer', () => {
    // §9: the engine is told who, not how. A plan that carried the mode
    // would have to be rebuilt against live state to change it.
    const conversation = threeWay();
    conversation.room = {
      inviteToken: 'tok_secret_do_not_leak', issuedAt: '2026-01-01T00:00:00.000Z',
      open: true, speakerMode: 'automatic', pinnedParticipantId: 'part_sarah' as ParticipantId,
    };
    const text = JSON.stringify(buildRenderPlan(conversation));
    expect(text).not.toContain('speakerMode');
    expect(text).not.toContain('tok_secret_do_not_leak');
    expect(text).not.toContain('pinnedParticipantId');
  });
});
