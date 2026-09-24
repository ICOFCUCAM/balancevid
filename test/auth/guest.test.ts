/**
 * A guest's credential, attacked.  [Doctrine ROOM §6, §12, D-03, D-06]
 *
 * An invitation is a link somebody forwards over WhatsApp. That is a
 * capability URL, which is a real security model — but only if the capability
 * is small, scoped and revocable. These tests are the proof of each of those
 * three words, written as attempts to break them rather than as descriptions
 * of them working.
 */
import { describe, expect, it } from 'vitest';
import {
  GUEST_HOURS, issueGuest, newInviteToken, verifyGuest, guestCookie,
} from '../../src/auth/guest.js';
import { guestMay, OWNER_ONLY, type RoomAct } from '../../src/auth/policy.js';

const ROOM_A = 'tok_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ROOM_B = 'tok_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const CONV_A = 'conv_aaaa';
const CONV_B = 'conv_bbbb';
const SARAH = 'part_sarah';

describe('a guest session names one room and one person', () => {
  it('verifies for the conversation it was issued for', async () => {
    const { token } = await issueGuest({ conversationId: CONV_A, participantId: SARAH }, ROOM_A);
    await expect(verifyGuest(token, CONV_A, ROOM_A)).resolves
      .toEqual({ conversationId: CONV_A, participantId: SARAH });
  });

  it('does not verify for another conversation, even with the same token', async () => {
    // The conversation is INSIDE the signature, not beside it.
    const { token } = await issueGuest({ conversationId: CONV_A, participantId: SARAH }, ROOM_A);
    await expect(verifyGuest(token, CONV_B, ROOM_A)).resolves.toBeNull();
  });

  it('does not verify against another room\'s token', async () => {
    const { token } = await issueGuest({ conversationId: CONV_A, participantId: SARAH }, ROOM_A);
    await expect(verifyGuest(token, CONV_A, ROOM_B)).resolves.toBeNull();
  });

  it('cannot be rewritten to name a different conversation', async () => {
    const { token } = await issueGuest({ conversationId: CONV_A, participantId: SARAH }, ROOM_A);
    const forged = token.replace(CONV_A, CONV_B);
    await expect(verifyGuest(forged, CONV_B, ROOM_A)).resolves.toBeNull();
  });

  it('cannot be rewritten to name a different participant', async () => {
    const { token } = await issueGuest({ conversationId: CONV_A, participantId: SARAH }, ROOM_A);
    const forged = token.replace(SARAH, 'part_host');
    await expect(verifyGuest(forged, CONV_A, ROOM_A)).resolves.toBeNull();
  });

  it('cannot be extended by editing its expiry', async () => {
    const { token } = await issueGuest(
      { conversationId: CONV_A, participantId: SARAH }, ROOM_A, 0);
    const parts = token.split('.');
    parts[3] = String(Date.now() + 999_999_999);
    await expect(verifyGuest(parts.join('.'), CONV_A, ROOM_A)).resolves.toBeNull();
  });

  it('expires on its own', async () => {
    const now = Date.now();
    const { token, expiresAt } = await issueGuest(
      { conversationId: CONV_A, participantId: SARAH }, ROOM_A, now);
    expect(expiresAt).toBe(now + GUEST_HOURS * 3600_000);
    await expect(verifyGuest(token, CONV_A, ROOM_A, expiresAt - 1)).resolves.not.toBeNull();
    await expect(verifyGuest(token, CONV_A, ROOM_A, expiresAt + 1)).resolves.toBeNull();
  });

  it('refuses nonsense rather than guessing at it', async () => {
    for (const bad of ['', 'x', 'g1.a.b', 'g1.a.b.c.d.e', '....', 'null']) {
      await expect(verifyGuest(bad, CONV_A, ROOM_A)).resolves.toBeNull();
    }
    await expect(verifyGuest(undefined, CONV_A, ROOM_A)).resolves.toBeNull();
    await expect(verifyGuest(null, CONV_A, ROOM_A)).resolves.toBeNull();
  });

  it('verifies against nothing when the room has no token', async () => {
    const { token } = await issueGuest({ conversationId: CONV_A, participantId: SARAH }, ROOM_A);
    await expect(verifyGuest(token, CONV_A, undefined)).resolves.toBeNull();
  });
});

describe('withdrawing an invitation withdraws it', () => {
  it('rotating the room token ends every session in that room', async () => {
    const { token } = await issueGuest({ conversationId: CONV_A, participantId: SARAH }, ROOM_A);
    await expect(verifyGuest(token, CONV_A, ROOM_A)).resolves.not.toBeNull();

    // The host rotates the invite. Sarah is already inside; she should not
    // stay inside, or "withdraw" would mean nothing to the people who matter.
    const rotated = newInviteToken();
    await expect(verifyGuest(token, CONV_A, rotated)).resolves.toBeNull();
  });

  it('and ends it in that room only', async () => {
    const inA = await issueGuest({ conversationId: CONV_A, participantId: SARAH }, ROOM_A);
    const inB = await issueGuest({ conversationId: CONV_B, participantId: SARAH }, ROOM_B);
    // Room A rotates; room B is untouched.
    await expect(verifyGuest(inA.token, CONV_A, newInviteToken())).resolves.toBeNull();
    await expect(verifyGuest(inB.token, CONV_B, ROOM_B)).resolves.not.toBeNull();
  });
});

describe('the invite token itself', () => {
  it('is long enough that holding it is the only way to have it', () => {
    const token = newInviteToken();
    // 32 bytes, base64url: 43 characters, no padding.
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('is different every time', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newInviteToken()));
    expect(tokens.size).toBe(200);
  });
});

describe('the cookie carries the same protections as the owner\'s', () => {
  const cookie = guestCookie('g1.x.y.1.z', CONV_A, Date.now() + 60_000, true);
  it('is not readable by a script', () => expect(cookie).toContain('HttpOnly'));
  it('is not sent by a cross-site form', () => expect(cookie).toContain('SameSite=Lax'));
  it('is not sent in clear over HTTPS', () => expect(cookie).toContain('Secure'));
  it('expires', () => expect(cookie).toMatch(/Max-Age=\d+/));
  it('omits Secure on a plain-HTTP deployment, rather than never being set', () => {
    expect(guestCookie('t', CONV_A, Date.now() + 60_000, false)).not.toContain('Secure');
  });
});

describe('what a guest may do (ROOM §4, §6, D-03)', () => {
  it('may be present, ask to speak, and record themselves', () => {
    for (const act of ['room.read', 'room.presence', 'room.raise-hand',
      'take.own.create', 'take.own.upload', 'source.watch'] as RoomAct[]) {
      expect(guestMay(act), act).toBe(true);
    }
  });

  it('may not touch the author\'s work', () => {
    // Named explicitly rather than by "everything else", so that adding a
    // route tomorrow means seeing the shape of what is protected.
    for (const act of OWNER_ONLY) {
      expect(guestMay(act as unknown as RoomAct), act).toBe(false);
    }
  });

  it('may not do a thing simply because nobody thought of it', () => {
    // The allowlist is closed: an act nobody has classified is refused.
    expect(guestMay('conversation.publish' as unknown as RoomAct)).toBe(false);
    expect(guestMay('' as unknown as RoomAct)).toBe(false);
  });
});
