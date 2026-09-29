/**
 * The terms on the door.
 * [MASTER-EDIT §10; Doctrine ROOM §6, §7, D-03, D-06, D-19, U-22]
 *
 * §10 asked for three things — a role chosen at invitation time, per-guest
 * camera/mic/screen, and an expiry — and the measured answer was that they
 * are one shape:
 *
 *   "an invitation is currently a door, not a door with terms on it. A
 *    token says 'you may come in'; it does not say as what, with which
 *    devices, or until when."
 *
 * WHAT IS PROVED HERE:
 *
 *   absent terms mean exactly what they meant before the field existed,
 *   because every room already open has none;
 *   the grants are COPIED onto the person as they arrive, so changing the
 *   terms does not silently change what people already in the room may do;
 *   a link cannot mint a host, because it can be forwarded;
 *   an expired link is refused, and an unreadable expiry is not — locking
 *   every guest out of a live conversation is worse than a link outliving
 *   its terms, and rotation is the revocation that always works.
 */
import { describe, expect, it } from 'vitest';

import type { Conversation } from '../../src/domain/document.js';
import {
  DEVICE_CAPABILITIES, capabilitiesOf, may,
} from '../../src/domain/participants.js';
import {
  inviteOpen, joinRoom, openRoom, setGrant, setInviteTerms, setStaged,
} from '../../src/domain/roomEdit.js';
import { EditError } from '../../src/domain/edit.js';
import { mayRecord } from '../../src/web/room.js';
import { makeConversation, S } from './fixtures.js';

const AT = '2026-09-29T12:00:00.000Z';
const LATER = '2026-09-29T13:00:00.000Z';

function room(): Conversation {
  const conversation = makeConversation(S(60));
  openRoom(conversation, { inviteToken: 'tok_1', hostName: 'James', now: AT });
  return conversation;
}

describe('a room opened before any of this existed', () => {
  /*
   * THE MIGRATION, AND IT IS THE WHOLE MIGRATION. Every room already open
   * has no terms. Absent has to mean what it meant yesterday, or the deploy
   * that adds this changes who is allowed into live conversations.
   */
  it('still admits an audience member with their role and no clock', () => {
    const conversation = room();
    expect(conversation.room?.terms).toBeUndefined();
    expect(inviteOpen(conversation.room!, LATER)).toBe(true);

    const joined = joinRoom(conversation, 'Ade', AT);
    expect(joined.role).toBe('audience');
    expect(joined.grants).toBeUndefined();
    expect(capabilitiesOf(joined)).toEqual([]);
  });
});

describe('what the link admits somebody as', () => {
  it('is what the terms say', () => {
    const conversation = room();
    setInviteTerms(conversation, { as: 'speaker' });
    expect(joinRoom(conversation, 'Sarah', AT).role).toBe('speaker');
  });

  /*
   * A LINK CANNOT MINT A HOST, because a link can be forwarded. A host who
   * sent an invitation over WhatsApp would be one forward away from
   * somebody who could close the room on them.
   */
  it('is never a host, whatever is asked for', () => {
    const conversation = room();
    expect(() => setInviteTerms(conversation, { as: 'host' as never }))
      .toThrow(/cannot admit somebody as host/);
    expect(conversation.room?.terms).toBeUndefined();
  });

  /*
   * A CALLER WHO NAMES A ROLE MEANS IT. That is how a host adds somebody
   * directly, and it must not be overridden by what the link happens to say.
   */
  it('does not override a role the caller asked for', () => {
    const conversation = room();
    setInviteTerms(conversation, { as: 'speaker' });
    expect(joinRoom(conversation, 'Ade', AT, 'editor').role).toBe('editor');
  });
});

describe('the devices the link switches on', () => {
  it('arrive written onto the person, not read back from the room', () => {
    const conversation = room();
    setInviteTerms(conversation, { grants: { 'use.microphone': true } });
    const ade = joinRoom(conversation, 'Ade', AT);
    expect(ade.grants).toEqual({ 'use.microphone': true });
    expect(may(ade, 'use.microphone')).toBe(true);
    expect(may(ade, 'use.camera')).toBe(false);
  });

  /*
   * AN INVITATION DESCRIBES AN ARRIVAL. Tightening the terms must not reach
   * back into a room and take a microphone off somebody mid-sentence —
   * which is exactly what reading the room's grants at permission-check
   * time would do.
   */
  it('do not change for somebody already in the room', () => {
    const conversation = room();
    setInviteTerms(conversation, { grants: { 'use.camera': true } });
    const early = joinRoom(conversation, 'Ade', AT);
    setInviteTerms(conversation, { grants: { 'use.camera': false } });
    const late = joinRoom(conversation, 'Bola', LATER);

    expect(may(early, 'use.camera')).toBe(true);
    expect(may(late, 'use.camera')).toBe(false);
  });

  it('can be withheld from a role that would otherwise have them', () => {
    const conversation = room();
    setInviteTerms(conversation, {
      as: 'speaker', grants: { 'use.camera': false },
    });
    const sarah = joinRoom(conversation, 'Sarah', AT);
    expect(sarah.role).toBe('speaker');
    expect(may(sarah, 'use.camera')).toBe(false);
    /* And the rest of the role survives. */
    expect(may(sarah, 'use.microphone')).toBe(true);
    expect(may(sarah, 'respond')).toBe(true);
  });

  it('refuses a permission nobody wrote', () => {
    const conversation = room();
    expect(() => setInviteTerms(conversation, { grants: { fly: true } as never }))
      .toThrow(/no such permission/);
  });

  /*
   * SPARSE, so a participant carrying nothing is a participant nobody made
   * a decision about. An empty grants object on every arrival would read as
   * three decisions somebody took. [U-22 §2]
   */
  it('leaves nothing behind when the terms grant nothing', () => {
    const conversation = room();
    setInviteTerms(conversation, { as: 'speaker' });
    expect(joinRoom(conversation, 'Sarah', AT).grants).toBeUndefined();
  });
});

describe('until when', () => {
  it('refuses a link past its expiry', () => {
    const conversation = room();
    setInviteTerms(conversation, { expiresAt: '2026-09-29T12:30:00.000Z' });
    expect(inviteOpen(conversation.room!, AT)).toBe(true);
    expect(inviteOpen(conversation.room!, LATER)).toBe(false);
    expect(() => joinRoom(conversation, 'Ade', LATER)).toThrow(/expired/);
    expect(() => joinRoom(conversation, 'Ade', AT)).not.toThrow();
  });

  it('is nothing at all until somebody sets one', () => {
    const conversation = room();
    expect(inviteOpen(conversation.room!, '2099-01-01T00:00:00.000Z')).toBe(true);
  });

  it('comes off again', () => {
    const conversation = room();
    setInviteTerms(conversation, { expiresAt: '2026-09-29T12:30:00.000Z' });
    setInviteTerms(conversation, { expiresAt: null });
    expect(inviteOpen(conversation.room!, LATER)).toBe(true);
  });

  it('refuses something that is not a date', () => {
    const conversation = room();
    expect(() => setInviteTerms(conversation, { expiresAt: 'soon' }))
      .toThrow(/not a date/);
    expect(() => setInviteTerms(conversation, { expiresAt: 'soon' }))
      .toThrow(EditError);
  });

  /*
   * AN UNREADABLE DATE IS A GOOD INVITATION, and this is the one place the
   * safe direction points the other way from usual. A corrupt `expiresAt`
   * would otherwise lock every guest out of a live conversation — a much
   * worse failure than a link outliving its terms, and the host can still
   * rotate the token, which is the revocation that always works.
   */
  it('does not lock a live room out over a corrupt date', () => {
    const conversation = room();
    conversation.room!.terms = { expiresAt: 'not a date at all' };
    expect(inviteOpen(conversation.room!, LATER)).toBe(true);
  });

  /* A closed room is closed whatever the clock says. */
  it('is still shut when the room is shut', () => {
    const conversation = room();
    conversation.room!.open = false;
    expect(inviteOpen(conversation.room!, AT)).toBe(false);
  });
});

describe('setting the terms', () => {
  it('changes one thing and leaves the others', () => {
    const conversation = room();
    setInviteTerms(conversation, { as: 'speaker' });
    setInviteTerms(conversation, { expiresAt: '2026-09-29T12:30:00.000Z' });
    expect(conversation.room?.terms?.as).toBe('speaker');
    expect(conversation.room?.terms?.expiresAt).toBeTruthy();
  });

  /*
   * TIGHTENING AN INVITATION IS NOT REVOKING IT. A host who could not add
   * an expiry without breaking the link they already sent would simply not
   * add one. `rotate-invite` stays the way to withdraw a link.
   */
  it('never touches the token', () => {
    const conversation = room();
    const was = conversation.room!.inviteToken;
    setInviteTerms(conversation, { as: 'speaker', expiresAt: LATER });
    expect(conversation.room!.inviteToken).toBe(was);
  });

  it('leaves no terms at all when everything is cleared', () => {
    const conversation = room();
    setInviteTerms(conversation, { as: 'speaker', expiresAt: LATER });
    setInviteTerms(conversation, { as: null, expiresAt: null });
    expect(conversation.room?.terms).toBeUndefined();
  });

  it('is a device list a panel can group', () => {
    expect(DEVICE_CAPABILITIES).toEqual([
      'use.camera', 'use.microphone', 'use.screen',
    ]);
  });
});

/*
 * AND THE DEVICES ARE ENFORCED WHERE RECORDING IS DECIDED.
 * [MASTER-EDIT §10, ROOM §3, ROOM §10]
 *
 * `mayRecord` had no test of its own, which is worth saying because it is
 * the gate every guest recording passes: the interventions route asks it
 * and refuses with a 404 when it says no. Putting a new permission into an
 * untested function is how a permission quietly stops being checked, so
 * what is asserted here is the whole ladder — closed room, off stage, no
 * `respond`, no devices — and not only the rung this change added.
 *
 * A camera permission enforced in the browser is a button that is easy not
 * to draw and impossible to rely on. This is the place it counts.
 */
describe('who may actually record', () => {
  function staged(
    build: (conversation: Conversation, id: string) => void = () => undefined,
  ): { conversation: Conversation; id: string } {
    const conversation = room();
    setInviteTerms(conversation, { as: 'speaker' });
    const sarah = joinRoom(conversation, 'Sarah', AT);
    setStaged(conversation, [sarah.id]);
    build(conversation, sarah.id);
    return { conversation, id: sarah.id };
  }

  const asGuest = (id: string) => ({ access: 'participant' as const, participantId: id });

  it('lets a staged speaker with a camera record', () => {
    const { conversation, id } = staged();
    expect(mayRecord(conversation, asGuest(id))).toBe(true);
  });

  it('refuses somebody who is not on stage', () => {
    const conversation = room();
    setInviteTerms(conversation, { as: 'speaker' });
    const sarah = joinRoom(conversation, 'Sarah', AT);
    expect(mayRecord(conversation, asGuest(sarah.id))).toBe(false);
  });

  it('refuses everybody once the room is closed', () => {
    const { conversation, id } = staged();
    conversation.room!.open = false;
    expect(mayRecord(conversation, asGuest(id))).toBe(false);
  });

  /*
   * THE RUNG THIS CHANGE ADDED. A guest whose camera and microphone were
   * both withheld is on stage to be SEEN, which is `setStaged`, and is not
   * thereby somebody recording into the finished video.
   */
  it('refuses a staged speaker with no camera and no microphone', () => {
    const { conversation, id } = staged((c, who) => {
      const person = c.participants!.find((p) => p.id === who)!;
      person.grants = { 'use.camera': false, 'use.microphone': false };
    });
    expect(mayRecord(conversation, asGuest(id))).toBe(false);
  });

  /*
   * EITHER, NOT BOTH. Somebody with a microphone and no camera is
   * contributing audio, which this product composes perfectly well;
   * requiring both would make withholding a camera withhold a voice.
   */
  it('lets a microphone alone record', () => {
    const { conversation, id } = staged((c, who) => {
      const person = c.participants!.find((p) => p.id === who)!;
      person.grants = { 'use.camera': false };
    });
    expect(mayRecord(conversation, asGuest(id))).toBe(true);
  });

  /* And the owner is never asked any of this. */
  it('never asks any of it of the owner', () => {
    const { conversation } = staged();
    conversation.room!.open = false;
    expect(mayRecord(conversation, { access: 'owner' })).toBe(true);
  });
});

/*
 * ONE PERSON'S CAMERA, AFTER THEY ARE ALREADY IN.
 * [MASTER-EDIT §10, ROOM §3]
 *
 * The terms are the per-LINK half. §10 asked for per-GUEST, and this is it:
 * turning one person's camera on without changing what the next arrival
 * gets.
 *
 * It also makes the aliasing hazard below REACHABLE, which is why it is
 * here. A mutation that shared the link's grants object with each arriving
 * participant survived the first battery — nothing could tell the
 * difference, because nothing wrote to a participant's grants. With this
 * edit, sharing would mean turning one guest's camera on turns it on for
 * everybody who joins afterwards, and the host would have no way to see
 * that they had.
 */
describe('granting one person something', () => {
  it('changes them and nobody else', () => {
    const conversation = room();
    setInviteTerms(conversation, { as: 'speaker' });
    const sarah = joinRoom(conversation, 'Sarah', AT);
    const ade = joinRoom(conversation, 'Ade', AT);

    setGrant(conversation, sarah.id, 'use.screen', true);
    expect(may(sarah, 'use.screen')).toBe(true);
    expect(may(ade, 'use.screen')).toBe(false);
  });

  /* THE ALIASING PROPERTY, pinned directly. */
  it('does not reach back into the link everybody else arrives on', () => {
    const conversation = room();
    setInviteTerms(conversation, { as: 'speaker', grants: { 'use.screen': false } });
    const sarah = joinRoom(conversation, 'Sarah', AT);

    setGrant(conversation, sarah.id, 'use.screen', true);

    expect(conversation.room?.terms?.grants).toEqual({ 'use.screen': false });
    const later = joinRoom(conversation, 'Bola', LATER);
    expect(may(later, 'use.screen')).toBe(false);
  });

  /*
   * NULL IS NOT FALSE. Putting a capability back to the role's default is
   * different from withholding it: a role whose defaults change later
   * should carry this person with it, and a stored value echoing today's
   * default would pin them to the old answer.
   */
  it('puts a capability back to the role rather than pinning it', () => {
    const conversation = room();
    setInviteTerms(conversation, { as: 'speaker' });
    const sarah = joinRoom(conversation, 'Sarah', AT);

    setGrant(conversation, sarah.id, 'use.camera', false);
    expect(may(sarah, 'use.camera')).toBe(false);
    setGrant(conversation, sarah.id, 'use.camera', null);
    expect(may(sarah, 'use.camera')).toBe(true);
    expect(sarah.grants).toBeUndefined();
  });

  /*
   * THE HOST IS NOT A SUBJECT OF THIS. `may` returns true for a host
   * whatever the grants say, so writing one would be a control that
   * appears to work and does nothing.
   */
  it('refuses to limit the host, rather than pretending to', () => {
    const conversation = room();
    const host = conversation.participants![0]!;
    expect(host.role).toBe('host');
    expect(() => setGrant(conversation, host.id, 'publish', false))
      .toThrow(/cannot be limited/);
    expect(may(host, 'publish')).toBe(true);
  });

  it('refuses a permission nobody wrote', () => {
    const conversation = room();
    const sarah = joinRoom(conversation, 'Sarah', AT);
    expect(() => setGrant(conversation, sarah.id, 'fly' as never, true))
      .toThrow(/no such permission/);
  });
});
