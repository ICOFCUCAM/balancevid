/**
 * The signalling mailbox, attacked.  [Doctrine ROOM §12, D-03, D-06]
 *
 * Signalling carries the addresses a browser can be reached on, including the
 * ones on its local network. A room where everyone can read everyone's
 * connection details hands every guest a map of every other guest's LAN, and
 * that is a thing you only find out you have done afterwards.
 *
 * So the mailbox is tested the way the guest credential is: as attempts to
 * break it. The end-to-end run proves the refusals a browser meets; this
 * proves the two properties a browser cannot check, because in a live room
 * every peer is already draining its own queue — that a message reaches ONE
 * person, and that reading it consumes it.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureOwner, ownerCookie } from '../helpers/session.js';
import { makeConversation } from '../domain/fixtures.js';
import type { Conversation } from '../../src/domain/document.js';
import type { ParticipantId } from '../../src/domain/participants.js';

const INVITE = 'tok_signalling_room_invitation_0001';

let dir: string;
let route: typeof import('../../app/api/conversations/[id]/room/signal/route.js');
let repo: typeof import('../../src/store/repository.js');
let guest: typeof import('../../src/auth/guest.js');
let conversationId: string;
let owner: string;

/** A cookie for one of the room's guests. */
async function as(participantId: string): Promise<string> {
  const { token } = await guest.issueGuest({ conversationId, participantId }, INVITE);
  return `${guest.GUEST_COOKIE}=${token}`;
}

const post = (cookie: string, body: unknown) => route.POST(
  new Request('http://test/api', {
    method: 'POST', body: JSON.stringify(body), headers: { cookie },
  }),
  { params: Promise.resolve({ id: conversationId }) },
);

const collect = async (cookie: string) => (await (await route.GET(
  new Request('http://test/api', { headers: { cookie } }),
  { params: Promise.resolve({ id: conversationId }) },
)).json()) as { messages: { from: string; payload: unknown }[] };

beforeAll(async () => {
  // VAR_ROOT is read when the store module first loads, so the environment is
  // set before anything that touches it is imported.
  dir = await mkdtemp(join(tmpdir(), 'balancevid-signal-'));
  process.env['BALANCEVID_VAR'] = dir;
  const hash = configureOwner();
  owner = await ownerCookie(hash);

  repo = await import('../../src/store/repository.js');
  route = await import('../../app/api/conversations/[id]/room/signal/route.js');
  guest = await import('../../src/auth/guest.js');

  const conversation: Conversation = makeConversation(600);
  conversation.participants = [
    { id: 'part_james' as ParticipantId, displayName: 'James', role: 'host',
      accent: '#6fb3e0', invitedAt: '2026-01-01T00:00:00.000Z',
      joinedAt: '2026-01-01T00:01:00.000Z' },
    { id: 'part_sarah' as ParticipantId, displayName: 'Sarah', role: 'speaker',
      accent: '#c2794f', invitedAt: '2026-01-01T00:00:00.000Z',
      joinedAt: '2026-01-01T00:02:00.000Z' },
    { id: 'part_mike' as ParticipantId, displayName: 'Michael', role: 'audience',
      accent: '#4f8a5b', invitedAt: '2026-01-01T00:00:00.000Z',
      joinedAt: '2026-01-01T00:03:00.000Z' },
    { id: 'part_ade' as ParticipantId, displayName: 'Ade', role: 'audience',
      accent: '#8a6fb3', invitedAt: '2026-01-01T00:00:00.000Z' },
  ];
  conversation.room = {
    inviteToken: INVITE, issuedAt: '2026-01-01T00:00:00.000Z',
    open: true, speakerMode: 'automatic',
    stagedParticipantIds: ['part_james' as ParticipantId],
  };
  await repo.saveConversation(conversation);
  conversationId = conversation.id;
});

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('a message reaches one person', () => {
  it('the named recipient, and nobody else', async () => {
    expect((await post(owner, { to: 'part_sarah', payload: { offer: 'sdp' } })).status).toBe(200);

    // Michael is in the same room and may poll as often as he likes.
    expect((await collect(await as('part_mike'))).messages).toEqual([]);
    expect((await collect(await as('part_sarah'))).messages)
      .toEqual([{ from: 'part_james', payload: { offer: 'sdp' } }]);
  });

  it('and reading it consumes it', async () => {
    // A peer that has read an offer must not read it again on the next poll:
    // replaying a finished handshake into a live connection breaks it.
    await post(owner, { to: 'part_sarah', payload: { candidate: 'a' } });
    const sarah = await as('part_sarah');
    expect((await collect(sarah)).messages).toHaveLength(1);
    expect((await collect(sarah)).messages).toEqual([]);
  });
});

describe('the sender is the session, never the request', () => {
  it('a guest signalling as somebody else is still read as themselves', async () => {
    // There is no `from` field the route reads. This proves the one a
    // request might invent is not one of them.
    await post(await as('part_mike'),
      { to: 'part_sarah', from: 'part_james', payload: { candidate: 'b' } });
    expect((await collect(await as('part_sarah'))).messages)
      .toEqual([{ from: 'part_mike', payload: { candidate: 'b' } }]);
  });

  it('and the owner is the host participant, not a nameless owner', async () => {
    // The same identity the room view gives them (ROOM §1): the host is a
    // participant, so their peers have somebody to answer.
    await post(owner, { to: 'part_mike', payload: { candidate: 'c' } });
    expect((await collect(await as('part_mike'))).messages[0]?.from).toBe('part_james');
  });
});

describe('who may be written to', () => {
  const refused = async (body: unknown, status: number) => {
    expect((await post(await as('part_sarah'), body)).status).toBe(status);
  };

  it('somebody who never arrived is not a mailbox', async () => {
    // Ade was invited and has not joined. Without this the mailbox is a way
    // to discover which participant ids exist (D-03).
    await refused({ to: 'part_ade', payload: {} }, 404);
  });

  it('nor is somebody who is not in this conversation at all', async () => {
    await refused({ to: 'part_nobody', payload: {} }, 404);
  });

  it('nor is naming nobody a way to reach the room', async () => {
    await refused({ payload: {} }, 404);
  });

  it('and a peer cannot post into its own mailbox', async () => {
    await refused({ to: 'part_sarah', payload: {} }, 400);
  });
});

describe('the room is the boundary', () => {
  it('a stranger cannot tell whether the room exists (D-03)', async () => {
    const response = await route.POST(
      new Request('http://test/api', {
        method: 'POST', body: JSON.stringify({ to: 'part_sarah', payload: {} }),
      }),
      { params: Promise.resolve({ id: conversationId }) },
    );
    expect(response.status).toBe(404);
  });

  it('a guest holding another room\'s invitation is nobody here', async () => {
    const { token } = await guest.issueGuest(
      { conversationId, participantId: 'part_sarah' }, 'tok_a_different_rooms_invitation');
    expect((await post(`${guest.GUEST_COOKIE}=${token}`,
      { to: 'part_mike', payload: {} })).status).toBe(404);
  });

  it('and a closed room signals nothing at all', async () => {
    const conversation = await repo.loadConversation(conversationId);
    conversation.room = { ...conversation.room!, open: false };
    await repo.saveConversation(conversation);
    try {
      expect((await post(owner, { to: 'part_sarah', payload: {} })).status).toBe(409);
    } finally {
      conversation.room = { ...conversation.room!, open: true };
      await repo.saveConversation(conversation);
    }
  });
});
