'use client';

import { useCallback, useEffect, useState } from 'react';
import { TAKE_ACCENT_FALLBACK } from '../../../src/domain/performance.js';

import { useConfirm } from '../../Confirm.js';
import InvitePanel from '../../c/[id]/room/InvitePanel.js';
import type { Channel } from '../../../src/domain/channel.js';
import { roomBase } from '../../../src/domain/document.js';

/**
 * Inviting people onto the broadcast.  [Doctrine CHANNEL §6, ROOM §3, §6, D-19]
 *
 *     GO LIVE (armed)  →  attach a room  →  invite  →  they join
 *                      →  stage them     →  TAKE LIVE
 *
 * THE CHANNEL COULD ALREADY USE A ROOM AND COULD NOT INVITE ANYBODY TO ONE.
 * `goLive` has always taken a `roomId`, so a broadcast could come out of a
 * conversation's room — but the only way to name one was a `window.prompt`
 * asking for a raw `conv_…` id, and the invitation itself lived over in
 * Studio One. Getting a guest onto the air meant: leave the control room,
 * find the conversation, open its room, copy the link, come back, and type
 * an identifier from memory. The capability existed; the door did not.
 *
 * SO THIS BUILDS ALMOST NOTHING. [D-19] Everything below already existed:
 *
 *   InvitePanel          the Room's own panel — link, copy, native share,
 *                        WhatsApp/SMS/email, QR, rotate. Imported, not
 *                        reimplemented: a second invite UI would be a second
 *                        place the join URL can be composed wrongly
 *   /room POST 'open'    opening a room, with the server minting the token
 *   /room GET            who is in it, and the token for the owner
 *   /api/conversations   the list to choose from
 *   attachRoom           the one new line of domain: which room this is
 *
 * ARMED IS THE RIGHT MOMENT. A broadcast that is armed is not on air — the
 * schedule is still going out — so inviting people, waiting for them to
 * arrive and staging them all happens before anybody watching sees a thing.
 * That is the ARM → TAKE discipline doing a second job. [§6]
 */

interface Conversation {
  id: string;
  title: string;
}

interface RoomView {
  open: boolean;
  inviteToken?: string;
  participants?: { id: string; displayName: string }[];
}

export default function GuestsTab({
  channel, guests, levels, onAir, armed, onAttach, Meter,
}: {
  channel: Channel;
  guests: {
    sources: { id: string; label?: string; accent?: string }[];
    tooMany: boolean;
  };
  levels: Record<string, { energy: number; speech: number }>;
  onAir: boolean;
  armed: boolean;
  onAttach: (roomId: string | null) => void;
  /** The control room's own meter, so this draws no second one. */
  Meter: (props: { value: number; label: string }) => React.JSX.Element;
}) {
  const roomId = channel.live?.roomId;
  const [choices, setChoices] = useState<Conversation[]>([]);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');
  const { confirm, dialog } = useConfirm();

  useEffect(() => { setOrigin(window.location.origin); }, []);

  /* The conversations whose rooms this broadcast could come out of. */
  useEffect(() => {
    if (!onAir || roomId) return;
    void (async () => {
      const response = await fetch('/api/conversations', { cache: 'no-store' });
      if (response.ok) setChoices((await response.json()).conversations ?? []);
    })();
  }, [onAir, roomId]);

  /*
   * The room's own state, from the Room's own endpoint. Polled while
   * attached, because people arrive while nobody is looking at this tab —
   * and at the Room's rate, not a rate invented here.
   */
  const readRoom = useCallback(async () => {
    if (!roomId) { setRoom(null); return; }
    try {
      const response = await fetch(
        `${roomBase(roomId)}`, { cache: 'no-store' });
      if (response.ok) setRoom(await response.json() as RoomView);
    } catch { /* momentarily unreachable; keep the last view. */ }
  }, [roomId]);

  useEffect(() => {
    void readRoom();
    if (!roomId) return;
    const timer = setInterval(() => { void readRoom(); }, 4000);
    return () => clearInterval(timer);
  }, [roomId, readRoom]);

  /** Open the room if it has never been opened. Mints the token server-side. */
  const act = async (body: Record<string, unknown>) => {
    if (!roomId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${roomBase(roomId)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError((await response.json().catch(() => ({}))).error
          ?? 'the room refused that');
        return;
      }
      await readRoom();
    } finally { setBusy(false); }
  };

  /* ---- nothing is live: say when guests become possible -------------- */
  if (!onAir) {
    return (
      <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
        Guests come out of a room. Press <strong>GO LIVE</strong> — that arms
        the feed into PREVIEW without putting anything on the wire — then
        invite people here and stage them before you take it live.
      </p>
    );
  }

  /* ---- live, no room: open one, or borrow one -------------------------- */
  if (!roomId) {
    return (
      /*
       * THIS TAB USED TO DEAD-END.  [§6, ROOM §6, D-17]
       *
       * "A broadcast takes its guests from a conversation's room" was the
       * whole of it, and when there were no conversations the only thing on
       * screen was "Start one in Studio One and its room becomes available
       * here" — which is an instruction to buy another studio, written as
       * if it were a next step. The studios are sold separately.
       *
       * So the broadcast's own room comes first, because it is the one that
       * is always available and the one most broadcasts want: guests
       * invited to THIS programme, on THIS channel, by a link. Borrowing a
       * conversation's room stays, below it, for the case it was built for
       * — a seminar already under way in Studio One that is going to air.
       */
      <div data-testid="attach-room" style={{
        display: 'flex', flexDirection: 'column', gap: 'var(--space-4)',
      }}>
        <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
          Guests come out of a room. Open one on this broadcast and send
          people the link; everybody you bring to stage is in the picture.
        </p>
        {/*
          * NOT A CTA, because this is a desk — the same reasoning as
          * `open-room` below it, which is the same action on a
          * conversation. [brief §4]
          */}
        <button className="ctl" data-testid="open-broadcast-room"
                disabled={busy}
                onClick={() => onAttach(channel.id)}
                style={{ width: '100%', padding: '7px 10px' }}>
          Open a room on this broadcast
        </button>
        {choices.length > 0 && (
          <>
            <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-2xs)' }}>
              Or take them from a conversation already running in Studio
              One — everybody staged in it is in the picture.
            </p>
            <select
              data-testid="room-choice" defaultValue=""
              onChange={(event) => {
                if (event.target.value) onAttach(event.target.value);
              }}
              style={{ fontSize: 'var(--text-sm)', padding: '7px 9px' }}
            >
              <option value="" disabled>Choose a conversation&hellip;</option>
              {choices.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>
                  {conversation.title}
                </option>
              ))}
            </select>
          </>
        )}
        {armed && (
          <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-2xs)' }}>
            You are armed, not on air. Nothing reaches the wire until TAKE LIVE.
          </p>
        )}
      </div>
    );
  }

  /* ---- live, room attached: invite, and see who is here ---------------- */
  const joined = room?.participants?.length ?? 0;
  return (
    <div data-testid="broadcast-stage" style={{
      display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
    }}>
      {dialog}
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <span className="muted grow" style={{
          fontSize: 'var(--text-2xs)', letterSpacing: 0.8, fontWeight: 700,
        }}>ON STAGE</span>
        {/* A conversation's room has a page of its own to stand in; a
            broadcast's room is this desk, so there is nowhere else to go. */}
        {roomId !== channel.id && (
          <a className="small" href={`/c/${roomId}/room`} data-testid="to-room"
             target="_blank" rel="noreferrer" style={{ fontSize: 'var(--text-2xs)' }}>
            Open the room
          </a>
        )}
      </div>

      {guests.sources.length === 0 ? (
        <span className="small muted" style={{ fontSize: 'var(--text-xs)' }}>
          {joined > 0
            ? `${joined} in the room, nobody staged yet. Bring somebody to `
              + 'stage in the room and they appear in the picture.'
            : 'Just the camera. Invite somebody below.'}
        </span>
      ) : guests.sources.map((person) => (
        <div key={person.id} className="row" data-testid="stage-person" style={{
          gap: 8, fontSize: 'var(--text-xs)', padding: '5px 7px', borderRadius: 6,
          flexWrap: 'nowrap', background: 'var(--panel-2)',
          border: '1px solid var(--line)',
        }}>
          <span aria-hidden="true" style={{
            width: 8, height: 8, borderRadius: '50%', flex: '0 0 auto',
            background: person.accent ?? TAKE_ACCENT_FALLBACK,
          }} />
          <span className="grow" style={{
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{person.label}</span>
          <Meter value={levels[person.id]?.energy ?? 0}
                 label={person.label ?? 'guest'} />
        </div>
      ))}

      {guests.tooMany && (
        <span className="small" style={{ fontSize: 'var(--text-2xs)', color: 'var(--warn)' }}>
          {/* The Room's own warning, surfaced where it matters: a mesh this
              size is a broadcast that will drop somebody. [ROOM §6, D-14] */}
          More people on stage than a mesh should carry.
        </span>
      )}

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 9 }}>
        {room && !room.open ? (
          <>
            <p className="small muted" style={{ margin: '0 0 7px', fontSize: 'var(--text-xs)' }}>
              {roomId === channel.id ? 'This broadcast' : 'This conversation'}
              &rsquo;s room has never been opened. Opening it makes a link you
              can send to anybody.
            </p>
            {/*
              * NOT A CTA, BECAUSE THIS IS A DESK. Opening the room is an
              * ordinary, frequent, reversible action taken from inside
              * the Live Studio — and a filled blue button on the
              * broadcast console is the object the brief rules out by
              * name. It was only still here because the ban was scoped
              * to five files and this is the sixth. [brief §4]
              */}
            <button className="ctl" data-testid="open-room"
                    disabled={busy}
                    onClick={() => { void act({ action: 'open' }); }}
                    style={{ width: '100%', padding: '7px 10px' }}>
              {busy ? 'Opening…' : 'Open the room'}
            </button>
          </>
        ) : room?.inviteToken ? (
          /*
           * THE ROOM'S OWN PANEL, imported rather than rebuilt. It composes
           * the join URL, the message, the QR and the rotate — and a second
           * copy of it here would be a second place that URL can be wrong.
           * [D-19, ROOM §7]
           */
          <InvitePanel
            conversationId={roomId}
            joinUrl={`${origin}/r/${roomId}?t=${encodeURIComponent(room.inviteToken)}`}
            heading="Invite people onto this broadcast"
            title={channel.name}
            sourceTitle={`${channel.name} — live`}
            busy={busy}
            onRotate={() => { void act({ action: 'rotate-invite' }); }}
          />
        ) : (
          <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
            Reading the room&hellip;
          </p>
        )}
      </div>

      <button className="quiet sm" data-testid="detach-room"
              onClick={() => confirm({
                question: roomId === channel.id
                  ? 'Close this broadcast\u2019s room? The link stops working '
                    + 'and its guests are no longer in the picture.'
                  : 'Take this room off the broadcast? The room keeps '
                    + 'running and its guests stay in it \u2014 it simply stops '
                    + 'being the one this channel is looking at.',
                verb: 'Take it off the broadcast',
                danger: true,
                go: () => onAttach(null),
              })}>
        Use a different room
      </button>

      {error && (
        <p className="small" style={{ margin: 0, color: 'var(--bad)', fontSize: 'var(--text-xs)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
