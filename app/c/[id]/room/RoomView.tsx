'use client';

import { useCallback, useEffect, useState } from 'react';
import InvitePanel from './InvitePanel.js';

/**
 * The Conversation Room.  [Doctrine ROOM §1, §3, §4, §5, §8]
 *
 * A different window from the Studio, deliberately. The Studio is one person
 * composing; this is several people present, and the thing it has to make
 * obvious is the distinction the whole brief turns on:
 *
 *   BEING IN THE ROOM ≠ BEING ON THE MAIN STAGE.
 *
 * So the people are in one rail with their presence beside their name, and
 * the stage is a separate area showing only who the viewer would see. Sarah
 * sitting in the rail, hearing everything, is a normal state with a name —
 * not a person who has failed to appear.
 *
 * The same component serves the host and a guest. What differs is what they
 * may do, and that is decided by the server: a guest's room view has no
 * invite token in it and their controls are the ones they are allowed.
 */

export interface RoomState {
  open: boolean;
  title: string;
  sourceTitle: string;
  speakerMode: 'automatic' | 'manual' | 'host' | 'conversation';
  stagedParticipantIds: string[];
  pinnedParticipantId: string | null;
  participants: {
    id: string; displayName: string; role: 'host' | 'speaker' | 'audience';
    accent: string; presence?: 'invited' | 'waiting' | 'staged';
    handRaisedAt?: string; me?: boolean;
  }[];
  hands: string[];
  inviteToken?: string;
  meId?: string;
}

const MODES = [
  { id: 'automatic', label: 'Automatic', hint: 'Follows whoever is speaking' },
  { id: 'manual', label: 'Manual', hint: 'You choose who appears' },
  { id: 'host', label: 'Host', hint: 'You stay on stage unless you move it' },
  { id: 'conversation', label: 'Conversation', hint: 'Between speakers, back to you in silence' },
] as const;

/** Presence, said in words rather than only in colour. [D-04, U-20] */
const PRESENCE: Record<string, { dot: string; label: string }> = {
  staged: { dot: '#4f8adf', label: 'On stage' },
  waiting: { dot: '#7d8b99', label: 'Waiting' },
  invited: { dot: 'transparent', label: 'Invited' },
};

export default function RoomView({
  conversationId, host, initial,
}: { conversationId: string; host: boolean; initial: RoomState }) {
  const [room, setRoom] = useState<RoomState>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/conversations/${conversationId}/room`,
      { cache: 'no-store' });
    if (response.ok) setRoom(await response.json());
  }, [conversationId]);

  /*
   * Polling, not sockets — for now, and stated rather than hidden. The room's
   * live media path is a later stage (the brief's SFU decision), and until
   * then presence is the only thing that moves. Two seconds is fast enough to
   * feel present and slow enough to cost nothing.
   */
  useEffect(() => {
    const timer = setInterval(() => { void refresh(); }, 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  const act = async (body: Record<string, unknown>, path = 'room') => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/${path}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'that did not work');
      if (data.participants) setRoom(data);
      else await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const staged = new Set(room.stagedParticipantIds);
  const present = room.participants.filter((p) => p.presence);
  const onStage = present.filter((p) => staged.has(p.id));
  const me = room.participants.find((p) => p.me);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  return (
    <div className="shell">
      <header className="shell-bar">
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 17, margin: 0, whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis' }}>{room.title}</h1>
          <div className="small muted">
            {room.sourceTitle} · {present.length}{' '}
            {present.length === 1 ? 'person here' : 'people here'}
          </div>
        </div>
        {host && (
          <>
            <a className="btn" href={`/c/${conversationId}`} style={{ padding: '7px 14px' }}>
              Studio
            </a>
            <button data-testid="room-close" disabled={busy}
                    onClick={() => void act({ action: 'close' })}>
              Close room
            </button>
          </>
        )}
      </header>

      <div className="shell-body" style={{
        display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr) 300px',
        gap: 14, padding: '14px 20px',
      }}>
        {/* ---- who is here, and where they stand ---------------------- */}
        <aside className="shell-scroll" data-testid="people-rail" aria-label="People">
          <div className="small muted" style={{ textTransform: 'uppercase',
            letterSpacing: 0.8, fontSize: 11, marginBottom: 8 }}>
            In the room
          </div>

          {present.map((person) => {
            const isStaged = staged.has(person.id);
            const pinned = room.pinnedParticipantId === person.id;
            const presence = PRESENCE[person.presence ?? 'waiting']!;
            return (
              <div
                key={person.id}
                data-testid="room-person"
                data-participant-id={person.id}
                data-presence={person.presence}
                className="panel"
                style={{ padding: 9, marginBottom: 7, borderColor: isStaged
                  ? 'var(--source-accent)' : 'var(--line)' }}
              >
                <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                  <span aria-hidden style={{
                    width: 9, height: 9, borderRadius: '50%', flex: '0 0 auto',
                    background: person.accent,
                  }} />
                  <span className="grow" style={{ minWidth: 0, fontWeight: 600,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {person.displayName}{person.me ? ' (you)' : ''}
                  </span>
                  {person.handRaisedAt && (
                    <span data-testid="hand-up" title="Wants to speak"
                          style={{ flex: '0 0 auto' }}>✋</span>
                  )}
                </div>

                <div className="row small muted" style={{ gap: 6, marginTop: 3 }}>
                  <span aria-hidden style={{
                    width: 7, height: 7, borderRadius: '50%', background: presence.dot,
                    border: person.presence === 'invited' ? '1px solid var(--line)' : 'none',
                  }} />
                  <span className="grow">
                    {presence.label}{pinned ? ' · pinned' : ''}
                    {person.role === 'host' ? ' · host' : ''}
                  </span>
                </div>

                {host && (
                  <div className="row" style={{ gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
                    {/*
                      "Sarah, what do you think?" → click Sarah. [ROOM §1, §8]
                      Bringing an audience member in promotes them, because
                      the host deciding they may speak IS the promotion.
                    */}
                    <button
                      className="small" data-testid="stage-toggle"
                      disabled={busy}
                      onClick={() => void act({
                        action: 'stage',
                        staged: isStaged
                          ? room.stagedParticipantIds.filter((id) => id !== person.id)
                          : [...room.stagedParticipantIds, person.id],
                      })}
                      style={{ padding: '3px 8px', fontSize: 11 }}
                    >
                      {isStaged ? 'Take off stage' : 'Bring in'}
                    </button>
                    <button
                      className="small" data-testid="pin-toggle"
                      disabled={busy}
                      onClick={() => void act({
                        action: 'pin', pinned: pinned ? null : person.id,
                      })}
                      style={{ padding: '3px 8px', fontSize: 11,
                        background: pinned ? '#2b5f8a' : undefined }}
                    >
                      {pinned ? 'Unpin' : 'Pin'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {present.length === 0 && (
            <p className="small muted">Nobody yet. Send someone the link.</p>
          )}
        </aside>

        {/* ---- what the viewer would see ------------------------------ */}
        <section style={{ minHeight: 0, display: 'grid', gridTemplateRows: 'auto 1fr' }}>
          <div className="small muted" style={{ textTransform: 'uppercase',
            letterSpacing: 0.8, fontSize: 11, marginBottom: 8 }}>
            On stage
          </div>
          <div data-testid="room-stage" style={{
            background: '#08090b', borderRadius: 10, border: '1px solid var(--line)',
            display: 'grid', placeItems: 'center', padding: 16, minHeight: 0,
          }}>
            {onStage.length === 0 ? (
              <p className="small muted" style={{ textAlign: 'center', maxWidth: 320 }}>
                Nobody is on stage. Everyone here can hear the conversation;
                bring someone in when you want them seen.
              </p>
            ) : (
              <div style={{
                display: 'grid', gap: 10, width: '100%', height: '100%',
                gridTemplateColumns: `repeat(${Math.min(onStage.length, 3)}, 1fr)`,
              }}>
                {onStage.map((person) => (
                  <div key={person.id} data-testid="stage-tile" style={{
                    borderRadius: 8, border: `2px solid ${person.accent}`,
                    background: '#0d1319', display: 'grid', placeItems: 'center',
                    minHeight: 120, position: 'relative',
                  }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{person.displayName}</span>
                    <span style={{
                      position: 'absolute', left: 0, bottom: 0, padding: '2px 8px',
                      background: person.accent, color: '#0e0f11', fontSize: 10,
                      fontWeight: 700, borderTopRightRadius: 4,
                    }}>
                      {person.role === 'host' ? 'HOST' : 'SPEAKER'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ---- how the stage is driven, and the way in ---------------- */}
        <aside className="shell-scroll">
          {host ? (
            <>
              <div className="small muted" style={{ textTransform: 'uppercase',
                letterSpacing: 0.8, fontSize: 11, marginBottom: 6 }}>
                Speaker mode
              </div>
              <div data-testid="speaker-mode" style={{ marginBottom: 8 }}>
                {MODES.map((mode) => (
                  <button
                    key={mode.id}
                    data-testid="mode-option"
                    data-mode={mode.id}
                    data-chosen={room.speakerMode === mode.id ? 'true' : 'false'}
                    disabled={busy}
                    onClick={() => void act({ action: 'speaker-mode', speakerMode: mode.id })}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', marginBottom: 5,
                      padding: '7px 10px', borderRadius: 7,
                      background: room.speakerMode === mode.id
                        ? 'rgba(43,95,138,0.30)' : 'var(--panel-2)',
                      border: `1px solid ${room.speakerMode === mode.id
                        ? '#6fb3e0' : 'var(--line)'}`,
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{mode.label}</div>
                    <div className="small muted" style={{ fontSize: 11 }}>{mode.hint}</div>
                  </button>
                ))}
              </div>

              {/* A pin outranks the microphones, and says so while it does. */}
              {room.pinnedParticipantId && (
                <div className="panel small" data-testid="pin-notice"
                     style={{ padding: 9, marginBottom: 10, borderColor: '#6fb3e0' }}>
                  <div style={{ marginBottom: 6 }}>
                    Held on{' '}
                    {room.participants.find((p) => p.id === room.pinnedParticipantId)
                      ?.displayName ?? 'someone'} — automatic switching is paused.
                  </div>
                  <button className="small" data-testid="resume-automatic" disabled={busy}
                          onClick={() => void act({ action: 'pin', pinned: null })}>
                    Resume automatic
                  </button>
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                <InvitePanel
                  conversationId={conversationId}
                  joinUrl={`${origin}/r/${conversationId}?t=${
                    encodeURIComponent(room.inviteToken ?? '')}`}
                  title={room.title}
                  sourceTitle={room.sourceTitle}
                  busy={busy}
                  onRotate={() => void act({ action: 'rotate-invite' })}
                />
              </div>
            </>
          ) : (
            /* A guest's side: what they may do, which is about themselves. */
            <div data-testid="guest-controls">
              <div className="small muted" style={{ textTransform: 'uppercase',
                letterSpacing: 0.8, fontSize: 11, marginBottom: 6 }}>
                You
              </div>
              <p className="small muted" style={{ marginTop: 0, lineHeight: 1.45 }}>
                You are in the room and can hear everything. You appear in the
                video only when the host brings you in.
              </p>
              {me?.handRaisedAt ? (
                <button className="small" data-testid="lower-hand" disabled={busy}
                        onClick={() => void act({ action: 'lower-hand' }, 'room/presence')}>
                  Put my hand down
                </button>
              ) : (
                <button className="primary" data-testid="raise-hand" disabled={busy}
                        onClick={() => void act({ action: 'raise-hand' }, 'room/presence')}>
                  I&rsquo;d like to speak
                </button>
              )}
              <button
                className="small" data-testid="leave-room" disabled={busy}
                onClick={() => void act({ action: 'leave' }, 'room/presence')}
                style={{ marginTop: 8, display: 'block' }}
              >
                Leave the room
              </button>
            </div>
          )}

          {error && (
            <p className="small" style={{ color: 'var(--bad)', marginTop: 10 }}>{error}</p>
          )}
        </aside>
      </div>

      <footer className="shell-foot">
        <div className="row small muted" style={{ gap: 14 }}>
          <span className="grow">
            {/* The distinction, said once where everyone can see it. */}
            Everyone here can hear the conversation. Only the people on stage
            appear in the finished video.
          </span>
          {room.hands.length > 0 && host && (
            <span data-testid="hands-count" style={{ color: 'var(--warn)' }}>
              {room.hands.length}{' '}
              {room.hands.length === 1 ? 'hand up' : 'hands up'}
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}
