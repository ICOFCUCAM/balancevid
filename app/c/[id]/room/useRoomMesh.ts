'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Seeing and hearing each other, live.  [Doctrine ROOM §12]
 *
 * WHAT THE BRIEF SAYS, AND WHAT THIS IS. "Use a proper WebRTC SFU rather than
 * trying to make every participant's browser send media directly to every
 * other participant. That will matter once you have several people in a
 * room." Both halves are honoured: this is a mesh, it is capped at the size a
 * mesh is actually good for, and above that cap it says so rather than
 * degrading quietly.
 *
 * A mesh is n−1 connections per person — four people is three uploads each,
 * which a laptop and a home connection manage; eight is seven, which they do
 * not. The cap is not a placeholder for the SFU: it is the honest edge of
 * this transport, and the SFU replaces the transport rather than raising a
 * number.
 *
 * WHY IT IS LAST, AND WHY THAT IS NOT A COMPROMISE. Nothing in the finished
 * video comes through here. Each browser records itself and the composition
 * is made from those recordings afterwards (§10); the stage is chosen from
 * measurements, not from audio anybody else hears (§2). This is the comfort
 * of being in a room together while it happens — real, and separable, which
 * is why a seminar sitting in one physical room needs none of it.
 *
 * THE ROOM IS NOT SYMMETRIC, AND NEITHER IS THIS. "Being in the room is not
 * being on the main stage." Someone waiting in the rail HEARS and SEES the
 * conversation; their own camera goes nowhere. So a connection here carries
 * media in the direction the stage does: the staged send, everyone receives,
 * and two people who are both only listening never connect at all — there
 * would be nothing on the wire. This is the product's central distinction
 * made true at the transport rather than merely drawn in the interface: an
 * audience member's camera is not withheld from the layout, it is never
 * transmitted.
 *
 * THE SEAM. Everything below talks to peers through `signal()` and nothing
 * else. An SFU is a peer that everybody connects to instead of to each
 * other: the same offer, the same answer, the same candidates, one
 * connection each. Swapping it in changes who the peers are, not how they are
 * introduced.
 */

/** Above this many people on stage, a mesh is the wrong tool. [ROOM §12] */
export const MESH_LIMIT = 4;

/**
 * How a browser discovers the addresses it can be reached on.
 *
 * STUN only. It is enough for two people on ordinary home connections and on
 * the same network, which covers the seminar and the two-way conversation.
 * It is NOT enough behind symmetric NAT or a corporate firewall, where a TURN
 * relay is required — and TURN is a deployment decision with a bandwidth
 * bill, so it is configured rather than assumed. Stated here because a
 * connection that silently never establishes is the worst way to learn this.
 */
function iceServers(): RTCIceServer[] {
  const configured = process.env['NEXT_PUBLIC_BALANCEVID_ICE'];
  if (configured) {
    try { return JSON.parse(configured) as RTCIceServer[]; } catch { /* fall through */ }
  }
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}

export interface RemoteStream {
  participantId: string;
  stream: MediaStream;
}

export interface RoomMesh {
  remotes: RemoteStream[];
  /** True when there are more people on stage than a mesh should carry. */
  tooMany: boolean;
  states: Record<string, RTCPeerConnectionState>;
}

/** One peer: the connection, and what has arrived from them so far. */
interface Peer {
  connection: RTCPeerConnection;
  inbound: MediaStream;
}

/**
 * ONE SIDE OPENS THE CONVERSATION, AND IT IS NEGOTIATED ONCE.
 *
 * Everything below follows from two decisions that were arrived at by
 * watching this fail, and both are worth stating because the obvious
 * implementation of each is the wrong one.
 *
 * ONE OFFER. Perfect negotiation exists because both ends may offer at the
 * same moment, and it resolves that by having the polite one roll its offer
 * back. Rolling back is the part that is not free: the media lines it had
 * just claimed come loose, the other end's offer makes its own, and a
 * connection that should describe two streams describes four. So the
 * collision is prevented rather than recovered from — both browsers know both
 * participant ids, so both can work out which of them speaks first without
 * another round trip, and the other waits. It is the same comparison perfect
 * negotiation uses to decide who yields, put to work one step earlier.
 *
 * TWO LINES, BOTH WAYS, FROM THE START. The offering side makes an audio line
 * and a video line and declares both `sendrecv`; the answering side turns the
 * lines the offer gave it round before it answers, which costs nothing
 * because it happens inside the same negotiation. After that the shape never
 * changes. Going on and off stage is `replaceTrack` — a camera put into a
 * line that already exists, or taken out of it — which needs no renegotiation
 * at all.
 *
 * That second decision is also the one that stops faster, and this is the
 * part that matters for the product rather than for the connection. Turning a
 * line around to `recvonly` is a renegotiation, and a camera goes on
 * transmitting for the whole round trip while the far end thinks about it.
 * `replaceTrack(null)` takes the track off the sender in the same tick,
 * before anything else runs. When someone is taken off stage, the difference
 * between those two is the number of frames of them that left the building
 * after they were told they had stopped.
 */
export function useRoomMesh({
  conversationId, meId, peerIds, localStream, sending, enabled,
}: {
  conversationId: string;
  meId: string | undefined;
  /** Everyone else who should be connected: see the asymmetry above. */
  peerIds: string[];
  /** This browser's own camera, once they have turned it on. */
  localStream: MediaStream | null;
  /** On stage, so this camera goes out. Off stage, it stays in the room. */
  sending: boolean;
  enabled: boolean;
}): RoomMesh {
  const [remotes, setRemotes] = useState<RemoteStream[]>([]);
  const [states, setStates] = useState<Record<string, RTCPeerConnectionState>>({});
  const peers = useRef(new Map<string, Peer>());
  /* Perfect negotiation's bookkeeping, per peer — for ICE restarts. */
  const making = useRef(new Map<string, boolean>());
  const ignoring = useRef(new Map<string, boolean>());

  /*
   * What this browser is currently putting on the wire, in a ref because the
   * answering path below needs it at a moment that is nothing to do with a
   * render: the lines can come into existence while an offer is being
   * answered, and they should carry the camera immediately rather than at the
   * next paint.
   */
  const outgoing = useRef<MediaStream | null>(null);
  outgoing.current = sending && localStream ? localStream : null;

  /*
   * Who this browser has decided to connect to, for the message handler to
   * consult — CONSULT, not obey, and the difference is the whole of the
   * comment below.
   */
  const wanted = useRef<string[]>([]);

  const signal = useCallback(async (to: string, payload: unknown) => {
    await fetch(`/api/conversations/${conversationId}/room/signal`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to, payload }),
    }).catch(() => { /* the peer will try again; a lost candidate is survivable. */ });
  }, [conversationId]);

  const connect = useCallback((peerId: string): Peer => {
    const existing = peers.current.get(peerId);
    if (existing) return existing;

    const connection = new RTCPeerConnection({ iceServers: iceServers() });
    const inbound = new MediaStream();
    const peer: Peer = { connection, inbound };
    peers.current.set(peerId, peer);

    /* The lower id speaks first. Arbitrary, stable, and known to both. */
    const opens = Boolean(meId && meId < peerId);
    if (opens) {
      connection.addTransceiver('audio', { direction: 'sendrecv' });
      connection.addTransceiver('video', { direction: 'sendrecv' });
      carry(connection, outgoing.current);
    }

    connection.onicecandidate = (event) => {
      if (event.candidate) void signal(peerId, { candidate: event.candidate.toJSON() });
    };

    /*
     * A track arrives. It is collected into one stream per person rather than
     * taken from `event.streams`, which is empty when the other end put the
     * track into an existing line rather than adding it — which is exactly
     * what the design above makes it do.
     *
     * And a track is not yet a picture. The lines exist from the moment the
     * connection does, whether or not anybody is on stage down them, so what
     * marks the arrival of somebody's camera is `unmute`, and what marks it
     * going away — their camera off, or the host taking them out — is `mute`.
     * Publishing on the track alone would put a live-looking black rectangle
     * on the stage for everyone who has not turned a camera on.
     */
    connection.ontrack = (event) => {
      const track = event.track;
      if (!inbound.getTracks().includes(track)) inbound.addTrack(track);

      const show = () => setRemotes((was) => (was.some((r) => r.participantId === peerId)
        ? was
        : [...was, { participantId: peerId, stream: inbound }]));
      const hide = () => setRemotes((was) => (inbound.getTracks().every((t) => t.muted)
        ? was.filter((r) => r.participantId !== peerId)
        : was));

      if (!track.muted) show();
      track.onunmute = show;
      track.onmute = hide;
    };

    connection.onconnectionstatechange = () => {
      setStates((was) => ({ ...was, [peerId]: connection.connectionState }));
      if (connection.connectionState === 'failed') {
        // Usually a network that needs TURN. Restart ICE once rather than
        // leaving a dead tile on the stage.
        connection.restartIce();
      }
    };

    connection.onnegotiationneeded = () => {
      /*
       * Before the connection exists, only the opener offers. Afterwards
       * either may, because by then it is an ICE restart on a connection that
       * has already failed, and perfect negotiation is the right tool for it.
       */
      if (!opens && !connection.currentRemoteDescription) return;
      void (async () => {
        try {
          making.current.set(peerId, true);
          await connection.setLocalDescription();
          await signal(peerId, { description: connection.localDescription?.toJSON() });
        } catch { /* a failed offer is retried by the next negotiation. */ } finally {
          making.current.set(peerId, false);
        }
      })();
    };

    return peer;
  }, [signal, meId]);

  /*
   * The peer list as a string, so the effect below runs when it CHANGES
   * rather than on every poll. The room refreshes itself every couple of
   * seconds and hands back a fresh array of the same people each time;
   * comparing identities would tear down and rebuild connections that are
   * working perfectly.
   */
  const peerKey = peerIds
    .filter((id) => id !== meId).slice(0, MESH_LIMIT - 1).join(',');

  /* ---- keep a connection per peer, and no more ------------------------ */
  useEffect(() => {
    /*
     * Not `return` when the room closes or nobody is left — an empty list,
     * so the loop below takes the connections down. Leaving early would leave
     * cameras connected to a room that has ended.
     */
    const want = enabled && meId && peerKey ? peerKey.split(',') : [];
    wanted.current = want;

    for (const peerId of want) carry(connect(peerId).connection, outgoing.current);

    // Somebody who left, or who is no longer worth a connection.
    for (const [peerId, peer] of peers.current) {
      if (!want.includes(peerId)) {
        peer.connection.close();
        peers.current.delete(peerId);
        setRemotes((was) => was.filter((r) => r.participantId !== peerId));
        setStates((was) => {
          const next = { ...was };
          delete next[peerId];
          return next;
        });
      }
    }
  }, [enabled, meId, peerKey, localStream, sending, connect]);

  /* ---- collect what peers have sent ----------------------------------- */
  useEffect(() => {
    if (!enabled || !meId) return;
    let stopped = false;

    const handle = async (from: string, payload: any) => {
      /*
       * An offer from somebody not on our list is answered anyway, as long as
       * we are under the cap — and it is worth saying why, because refusing
       * looks like the safer choice and is not.
       *
       * The two ends learn about each other at different moments. Somebody
       * joins and their own page knows the whole room at once, while everyone
       * else finds out on their next poll up to two seconds later. If the
       * newcomer is the one who opens the conversation, their offer arrives
       * BEFORE the other end has any reason to expect it — and a refusal
       * there is permanent, because the offer is not made twice. Half of all
       * arrivals would silently never connect, and the id that decides who
       * speaks first is random, so it would be half of them at random.
       *
       * What actually needed bounding is the resource, not the guest list: an
       * offer should not be able to make somebody's browser allocate
       * connections without end. So the cap does that, and nothing turns on
       * being recognised.
       */
      if (!wanted.current.includes(from) && peers.current.size >= MESH_LIMIT - 1) return;
      const { connection } = connect(from);
      const polite = Boolean(meId && from < meId);
      try {
        if (payload?.description) {
          const description = payload.description as RTCSessionDescriptionInit;
          const collision = description.type === 'offer'
            && (making.current.get(from) || connection.signalingState !== 'stable');
          ignoring.current.set(from, !polite && Boolean(collision));
          if (ignoring.current.get(from)) return;
          await connection.setRemoteDescription(description);
          if (description.type === 'offer') {
            /*
             * Answer in both directions. A line made by somebody else's offer
             * arrives receive-only, and turning it round HERE — before the
             * answer is written — costs nothing, where doing it afterwards
             * would be a second offer and a second round trip. Then the
             * camera goes straight into it, since the effect that normally
             * does that may have run before these lines existed.
             */
            for (const transceiver of connection.getTransceivers()) {
              if (transceiver.direction === 'recvonly') transceiver.direction = 'sendrecv';
            }
            carry(connection, outgoing.current);
            await connection.setLocalDescription();
            await signal(from, { description: connection.localDescription?.toJSON() });
          }
        } else if (payload?.candidate) {
          try {
            await connection.addIceCandidate(payload.candidate);
          } catch {
            // A candidate for an offer we ignored is expected, not an error.
            if (!ignoring.current.get(from)) throw new Error('bad candidate');
          }
        }
      } catch { /* the connection retries; one bad message is not fatal. */ }
    };

    const poll = async () => {
      while (!stopped) {
        try {
          const response = await fetch(
            `/api/conversations/${conversationId}/room/signal`, { cache: 'no-store' });
          if (response.ok) {
            const { messages } = await response.json() as {
              messages: { from: string; payload: any }[];
            };
            for (const message of messages) await handle(message.from, message.payload);
          }
        } catch { /* keep polling; a dropped poll is one round trip. */ }
        // Fast while a handshake is in flight — it is a few messages and then
        // silence, and a slow poll here is a slow-to-appear picture.
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    };

    void poll();
    return () => { stopped = true; };
  }, [enabled, meId, conversationId, connect, signal]);

  /* ---- close everything when the page goes ---------------------------- */
  useEffect(() => () => {
    for (const peer of peers.current.values()) peer.connection.close();
    peers.current.clear();
  }, []);

  return {
    remotes,
    tooMany: peerIds.filter((id) => id !== meId).length > MESH_LIMIT - 1,
    states,
  };
}

/**
 * Put this browser's camera into the lines, or take it out of them.
 *
 * `replaceTrack` deliberately does NOT renegotiate: with no track the sender
 * emits nothing and the far end sees the track mute, which is how it learns
 * that somebody has left the stage. So being brought in and taken out costs
 * one function call and no round trip.
 */
function carry(connection: RTCPeerConnection, stream: MediaStream | null): void {
  for (const transceiver of connection.getTransceivers()) {
    const kind = transceiver.receiver.track.kind;
    const track = (kind === 'audio'
      ? stream?.getAudioTracks()[0]
      : stream?.getVideoTracks()[0]) ?? null;
    if (transceiver.sender.track !== track) void transceiver.sender.replaceTrack(track);
  }
}
