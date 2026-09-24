'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import InvitePanel from './InvitePanel.js';
import { useRoomCapture } from './useRoomCapture.js';
import { MESH_LIMIT, useRoomMesh } from './useRoomMesh.js';

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

  /*
   * Everyone's own camera and microphone.  [ROOM §2, §10, §12]
   *
   * Measuring runs for anyone who has turned their microphone on; recording
   * runs only while the host has them on stage. Nothing here is sent to
   * anybody else — each browser records ITSELF, and the video is made from
   * those recordings afterwards, which is why the finished conversation does
   * not depend on anybody's connection holding up.
   *
   * Seeing each other live is the separate thing below.
   */
  const meId = room.meId ?? room.participants.find((p) => p.me)?.id;
  const iAmStaged = Boolean(meId && room.stagedParticipantIds.includes(meId));
  const sourceFrame = useRef(0);
  const capture = useRoomCapture({
    conversationId,
    staged: iAmStaged,
    sourceFrame: () => sourceFrame.current,
  });

  /*
   * Seeing and hearing each other, live.  [ROOM §12]
   *
   * Who connects to whom follows the room's own distinction rather than a
   * convenience: if I am on stage my camera goes to everyone present, and if
   * I am not, I only connect to the people who are. Two people both waiting
   * in the rail have nothing to send each other, so they do not connect.
   */
  const stagedIds = room.stagedParticipantIds;
  const peerIds = (iAmStaged
    ? room.participants.filter((p) => p.presence)
    : room.participants.filter((p) => p.presence && stagedIds.includes(p.id))
  ).map((p) => p.id).filter((id) => id !== meId);

  const mesh = useRoomMesh({
    conversationId,
    meId,
    peerIds,
    localStream: capture.stream,
    sending: iAmStaged,
    enabled: room.open,
  });

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/conversations/${conversationId}/room`,
      { cache: 'no-store' });
    if (response.ok) setRoom(await response.json());
  }, [conversationId]);

  /*
   * Polling, not sockets — for presence, and stated rather than hidden. The
   * live pictures do not come through here: they are peer-to-peer, and this
   * carries only who is present and where they stand. Two seconds is fast
   * enough to feel present and slow enough to cost nothing.
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
          <div className="row" style={{ gap: 10, marginBottom: 8, flexWrap: 'nowrap' }}>
            <div className="small muted grow" style={{ textTransform: 'uppercase',
              letterSpacing: 0.8, fontSize: 11 }}>
              On stage
            </div>
            {/*
              The mesh's honest edge, said out loud rather than degraded
              through. [ROOM §12] Above this many, every browser is uploading
              to every other one, and the fix is a relay on the server rather
              than a larger number here.
            */}
            {mesh.tooMany && (
              <span className="small" data-testid="mesh-limit"
                    style={{ color: 'var(--warn)' }}>
                Live video is limited to {MESH_LIMIT} people at once — everyone
                is still recorded.
              </span>
            )}
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
                {onStage.map((person) => {
                  const mine = person.id === meId;
                  const live = mine
                    ? capture.stream
                    : mesh.remotes.find((r) => r.participantId === person.id)?.stream ?? null;
                  /*
                    Your own tile has no connection: it is your camera, in
                    your browser. Saying `self` rather than `connected` keeps
                    it out of any question asked about the network — a check
                    for "somebody is connected" that matches your own face has
                    not checked anything.
                  */
                  const link = mine ? 'self' : mesh.states[person.id] ?? 'new';
                  return (
                    <div
                      key={person.id}
                      data-testid="stage-tile"
                      data-participant-id={person.id}
                      data-live={live ? 'true' : 'false'}
                      data-connection={link}
                      style={{
                        borderRadius: 8, border: `2px solid ${person.accent}`,
                        background: '#0d1319', display: 'grid', placeItems: 'center',
                        minHeight: 120, position: 'relative', overflow: 'hidden',
                      }}
                    >
                      {live ? (
                        /*
                          Own picture muted, always: a room where you hear
                          yourself a beat late is a room nobody can speak in.
                        */
                        <LiveTile stream={live} muted={mine} name={person.displayName} />
                      ) : (
                        <div style={{ textAlign: 'center', padding: 8 }}>
                          <div style={{ fontSize: 15, fontWeight: 600 }}>
                            {person.displayName}
                          </div>
                          <div className="small muted" style={{ marginTop: 3 }}>
                            {/*
                              Why there is no picture, in words. A tile that is
                              blank for an unexplained reason reads as broken;
                              a camera nobody turned on is not.
                            */}
                            {mine
                              ? 'Turn your camera on to be seen'
                              : link === 'failed'
                                ? 'Could not reach them'
                                : link === 'connected'
                                  ? 'Their camera is off'
                                  : 'Connecting…'}
                          </div>
                        </div>
                      )}
                      <span style={{
                        position: 'absolute', left: 0, bottom: 0, padding: '2px 8px',
                        background: person.accent, color: '#0e0f11', fontSize: 10,
                        fontWeight: 700, borderTopRightRadius: 4,
                      }}>
                        {person.role === 'host' ? 'HOST' : 'SPEAKER'}
                      </span>
                      {live && (
                        <span style={{
                          position: 'absolute', right: 0, bottom: 0, padding: '2px 8px',
                          background: 'rgba(8,9,11,0.72)', fontSize: 11, fontWeight: 600,
                          borderTopLeftRadius: 4,
                        }}>
                          {person.displayName}{mine ? ' (you)' : ''}
                        </span>
                      )}
                    </div>
                  );
                })}
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
        <div className="row" style={{ gap: 12, marginBottom: 8, flexWrap: 'nowrap' }}>
          {/*
            Their own picture, small, and only once they have turned it on.
            The recording indicator is the picture itself (D-03): if you can
            see yourself, you are being recorded.
          */}
          <video
            ref={capture.videoRef} autoPlay muted playsInline
            data-testid="my-camera"
            style={{
              width: 132, aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 6,
              border: `2px solid ${capture.recording ? '#e0674f' : 'var(--line)'}`,
              display: capture.armed ? 'block' : 'none', flex: '0 0 auto',
            }}
          />
          <div className="grow" style={{ minWidth: 0 }}>
            {capture.recording ? (
              <div data-testid="recording-now" style={{ fontWeight: 600, color: '#e0674f' }}>
                Recording you
              </div>
            ) : capture.armed ? (
              <div style={{ fontWeight: 600 }}>Microphone on</div>
            ) : (
              <div style={{ fontWeight: 600 }}>Microphone off</div>
            )}
            <div className="small muted">
              {capture.recording
                ? 'You are on stage, and this is being kept.'
                : capture.armed
                  ? 'Heard, not recorded. Recording starts when you are brought in.'
                  : 'Turn it on so the room can tell when you are speaking.'}
            </div>
          </div>
          {capture.armed ? (
            <button className="small" data-testid="mic-off" onClick={capture.disarm}>
              Turn off
            </button>
          ) : (
            <button className="primary" data-testid="mic-on" onClick={() => void capture.arm()}>
              Turn on camera and microphone
            </button>
          )}
        </div>

        {capture.error && (
          <p className="small" style={{ color: 'var(--bad)', margin: '0 0 8px' }}>
            {capture.error}
          </p>
        )}

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

/**
 * Somebody's live picture.  [ROOM §12]
 *
 * A component of its own because a MediaStream cannot be handed to React as a
 * prop of `<video>` — `srcObject` is set on the element, never in the markup,
 * and doing it in a ref effect is the difference between a picture and a
 * black rectangle.
 */
function LiveTile({ stream, muted, name }: {
  stream: MediaStream; muted: boolean; name: string;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || element.srcObject === stream) return;
    element.srcObject = stream;
    // Autoplay can still be refused; the room has already had a click for
    // the microphone, so this almost always succeeds and failing is silent.
    void element.play().catch(() => { /* the poster stays, the audio does not. */ });
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      aria-label={name}
      data-testid="stage-video"
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover', background: '#0d1319',
      }}
    />
  );
}
