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
import type { AssetId, Conversation } from '../../src/domain/document.js';
import { meIn, roomView } from '../../src/web/room.js';
import { type RoomHost, roomBase, roomHostKind } from '../../src/domain/document.js';
import {
  joinRoom, openRoom, setStaged,
} from '../../src/domain/roomEdit.js';
import {
  attachRoom, ChannelEditError, goLive, newChannel,
} from '../../src/domain/channelEdit.js';

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

/**
 * Who a caller IS in a room.  [Doctrine ROOM §1, §12, D-03]
 *
 * This is the question Stage 3 shipped without an answer to, and Stage 4
 * found. A guest's session names them outright; an owner's session says they
 * own the conversation, which is a different fact — so the host was nobody in
 * their own room, and nothing addressed to them by name could reach them.
 * Nothing looked broken: the rail listed them, the stage held them.
 *
 * The brief settled it in advance — "the host is its first participant, not a
 * special case beside the list" — and these tests are that sentence, checked.
 */
describe('who a caller is in the room (ROOM §1, §12)', () => {
  const room = (): Conversation => {
    const conversation = makeConversation(600);
    conversation.participants = [
      person('part_james', 'host', { joined: true }, { displayName: 'James' }),
      person('part_sarah', 'audience', { joined: true }, { displayName: 'Sarah' }),
      person('part_gone', 'audience', { gone: true }, { displayName: 'Ade' }),
    ];
    conversation.room = {
      inviteToken: 'tok_secret_do_not_leak', issuedAt: '2026-01-01T00:00:00.000Z',
      open: true, speakerMode: 'automatic',
      stagedParticipantIds: ['part_james' as ParticipantId],
    };
    return conversation;
  };

  it('the owner is the host participant, though their session never says so', () => {
    expect(meIn(room(), { access: 'owner' })).toBe('part_james');
  });

  it('a guest is whoever their session says, host or not', () => {
    expect(meIn(room(), { access: 'participant', participantId: 'part_sarah' }))
      .toBe('part_sarah');
  });

  it('and a stranger is nobody, rather than falling back to the host', () => {
    // The fallback is for the OWNER. A public caller inheriting the host's
    // identity would be able to act as them.
    expect(meIn(room(), { access: 'public' })).toBeUndefined();
    expect(meIn(room(), { access: 'denied' })).toBeUndefined();
  });

  it('so the host sees themselves in their own room', () => {
    const view = roomView(room(), true) as {
      meId?: string; participants: { id: string; me?: boolean }[];
    };
    expect(view.meId).toBe('part_james');
    expect(view.participants.find((p) => p.me)?.id).toBe('part_james');
  });

  it('and a guest sees themselves, and only themselves', () => {
    const view = roomView(room(), false, 'part_sarah' as ParticipantId) as {
      meId?: string; participants: { id: string; me?: boolean }[];
    };
    expect(view.meId).toBe('part_sarah');
    expect(view.participants.filter((p) => p.me).map((p) => p.id)).toEqual(['part_sarah']);
  });

  it('while the invitation reaches the host and nobody else (D-03)', () => {
    // It is the credential that lets anyone in: a participant who could read
    // it could re-issue it to people the host never invited.
    expect(JSON.stringify(roomView(room(), true))).toContain('tok_secret_do_not_leak');
    expect(JSON.stringify(roomView(room(), false, 'part_sarah' as ParticipantId)))
      .not.toContain('tok_secret_do_not_leak');
  });

  it('and somebody who has left is not in the room a guest is shown', () => {
    const view = roomView(room(), false, 'part_sarah' as ParticipantId) as {
      participants: { id: string }[];
    };
    expect(view.participants.map((p) => p.id)).toEqual(['part_james', 'part_sarah']);
  });
});

/**
 * A BROADCAST'S OWN ROOM.  [Doctrine CHANNEL §6, ROOM §6, D-17, D-19]
 *
 * `channel.ts` used to record, as a decision, that "a channel going live
 * names the conversation whose room it is coming out of rather than growing
 * a second room of its own — a second room would be a second place
 * invitations, staging and speaker detection could disagree."
 *
 * The reasoning is right and the conclusion was too narrow. What must not be
 * duplicated is the room's MACHINERY; which document holds the record is a
 * different question, and answering it "a conversation, always" made Online
 * TV's guests depend on Studio One. The studios are sold separately, so an
 * account with only a channel had a Guests tab whose one way forward read
 * "Start one in Studio One and its room becomes available here".
 *
 * What these prove is the thing that makes it safe: a Channel is a
 * `RoomHost`, and the SAME functions operate on it. Not a parallel
 * implementation that happens to behave alike — the same `openRoom`, the
 * same `joinRoom`, the same `setStaged`.
 */
describe('a broadcast can open a room of its own', () => {
  const AT = '2026-01-01T09:00:00.000Z';
  const live = () => {
    const channel = newChannel('BalanceVid TV', 'Africa/Lagos', AT);
    goLive(channel, 'Live', AT);
    return channel;
  };

  /*
   * A TYPE-LEVEL CLAIM, AND ONLY `tsc` CAN CHECK IT. Deleting `room?: Room`
   * from `Channel` leaves every runtime assertion below passing —
   * `openRoom` writes the property regardless, and vitest strips types
   * rather than checking them. The mutation went green and the annotation
   * on the next line is what caught it.
   */
  it('is a RoomHost by its type', () => {
    const channel: RoomHost = live();
    expect(roomHostKind(channel.id)).toBe('channel');
  });

  it('is a RoomHost, so the room\'s own functions take it', () => {
    const channel = live();
    const host = openRoom(channel, {
      inviteToken: 'tok_abcdefghijklmnop', hostName: 'Broadcaster', now: AT,
    });
    expect(channel.room?.open).toBe(true);
    expect(channel.participants?.map((p) => p.displayName)).toEqual(['Broadcaster']);
    expect(channel.room?.stagedParticipantIds).toEqual([host.id]);
  });

  it('and a stranger joins it with the same joinRoom a conversation uses', () => {
    const channel = live();
    openRoom(channel, {
      inviteToken: 'tok_abcdefghijklmnop', hostName: 'Broadcaster', now: AT,
    });
    const guest = joinRoom(channel, 'Amara', '2026-01-01T09:05:00.000Z');
    expect(channel.participants?.map((p) => p.displayName))
      .toEqual(['Broadcaster', 'Amara']);
    /* In the room and not in the picture, which is the whole of §4. */
    expect(channel.room?.stagedParticipantIds).not.toContain(guest.id);
    setStaged(channel, [guest.id]);
    expect(channel.room?.stagedParticipantIds).toEqual([guest.id]);
  });

  /*
   * AND THE ROOM IT NAMES IS ITSELF. Every layer downstream — the poll, the
   * invite link, the join route, the guest policy — resolves from that one
   * id, which is why there is no second concept for "whose room this is".
   */
  it('names itself as the room, and refuses another broadcast\'s', () => {
    const channel = live();
    attachRoom(channel, channel.id);
    expect(channel.live?.roomId).toBe(channel.id);

    const other = live();
    expect(() => attachRoom(channel, other.id)).toThrow(ChannelEditError);
    expect(() => attachRoom(channel, other.id))
      .toThrow(/cannot take its guests from another broadcast/);
    /* And still says what it said before the refusal. */
    expect(channel.live?.roomId).toBe(channel.id);
  });

  it('and refuses an id that names no room at all', () => {
    const channel = live();
    expect(() => attachRoom(channel, 'perf_0123456789abcdef')).toThrow(/not a room/);
    expect(() => attachRoom(channel, 'nonsense')).toThrow(/not a room/);
  });

  /*
   * A channel has a `name` where a conversation has a `title`, and is about
   * nothing but itself where a conversation is about a source. The room
   * view says so rather than showing a blank heading to everybody who
   * joins.
   */
  it('and the room is called what the channel is called', () => {
    const channel = live();
    openRoom(channel, {
      inviteToken: 'tok_abcdefghijklmnop', hostName: 'Broadcaster', now: AT,
    });
    const view = roomView(channel, true);
    expect(view['title']).toBe('BalanceVid TV');
    expect(view['sourceTitle']).toBeUndefined();
  });
});

/**
 * ONE DISCRIMINATOR, READ IN THREE LAYERS.
 *
 * The store opens a file by it, the routes live at a path because of it, and
 * the browser builds that path from it. Three copies of
 * `startsWith('chan_')` would be three chances for a guest to be sent to a
 * path the security policy never admitted them to — and the one that
 * drifted would be whichever nobody tested.
 */
describe('which document a room id names', () => {
  it('reads the prefix newId has always minted', () => {
    expect(roomHostKind('conv_0123456789abcdef')).toBe('conversation');
    expect(roomHostKind('chan_0123456789abcdef')).toBe('channel');
    expect(roomHostKind('perf_0123456789abcdef')).toBeNull();
    expect(roomHostKind('')).toBeNull();
  });

  it('and sends each to the path its own handlers answer at', () => {
    expect(roomBase('conv_abc')).toBe('/api/conversations/conv_abc/room');
    expect(roomBase('chan_abc')).toBe('/api/channels/chan_abc/room');
  });

  /*
   * An id that names nothing goes to the conversation path, which 404s.
   * The alternative — throwing — would put an exception in the middle of
   * a render for a URL somebody mistyped.
   */
  it('and an id that names nothing 404s rather than throwing mid-render', () => {
    expect(roomBase('nonsense')).toBe('/api/conversations/nonsense/room');
  });
});
