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
          <h1 style={{ fontSize: 'var(--text-lg)', margin: 0, whiteSpace: 'nowrap',
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
        {/*
          * THE ROOM IS ONE RAIL, NOT A STACK OF CARDS IN A VOID.
          * [brief §3, §4]
          *
          * Each person was their own bordered `.panel` with its own
          * margin, under a bare legend, in a column that stopped after
          * the last one — so a room with one person in it was a small
          * rectangle floating at the top of nine hundred pixels of
          * empty desk, and a room with six was six rectangles with
          * gaps between them. Both read as a dashboard; neither reads
          * as the list of who is here.
          *
          * Same shape the takes rail took in 39: one module that runs
          * the height of its bay, with a head, and people as ROWS
          * inside it separated by a rule. A row's borders are its
          * neighbours, which is why a list looks like a list.
          */}
        <aside className="panel" data-testid="people-rail" aria-label="People"
               style={{
                 display: 'flex', flexDirection: 'column', minHeight: 0,
                 height: '100%', padding: 0, overflow: 'hidden',
               }}>
          <div className="module-head">
            <span className="module-label grow">In the room</span>
            <span className="mono readout" data-testid="room-count" style={{
              fontSize: 'var(--text-2xs)', color: 'var(--ink-400)',
            }}>{String(present.length).padStart(2, '0')}</span>
          </div>
          <div className="shell-scroll" style={{
            flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
          }}>

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
                style={{
                  padding: '8px 10px',
                  borderBottom: '1px solid var(--console-rule)',
                  /*
                    * ON STAGE IS SAID BY A LIT LEADING EDGE, which is
                    * how every rail in this product says "this one" —
                    * the takes rail, the clip rail, the schedule's
                    * running block. It was said by recolouring the
                    * whole card's border, an object that no longer
                    * exists and that in a stack of six put six
                    * competing outlines on the screen.
                    */
                  borderLeft: `3px solid ${isStaged
                    ? 'var(--source-accent)' : 'transparent'}`,
                  background: isStaged
                    ? 'var(--console-control)' : 'transparent',
                }}
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
                  {/*
                    * A WORD, NOT A PICTOGRAM. This was ✋ — an emoji,
                    * so full colour on macOS and Windows, and
                    * carrying a platform-chosen skin tone in a room
                    * where the mark means "this person would like to
                    * speak".
                    *
                    * I drew a hand for the icon set and measured it
                    * at the size this row actually uses. Four
                    * variants, and at 13px none of them reads as a
                    * hand — they are all the same small blob. At
                    * 40px they are fine, which is how an icon that
                    * does not work ships.
                    *
                    * So it takes the object the product already has
                    * for "this needs attention": the armed state
                    * badge, with a word in it. Findable at a glance
                    * down a rail of six people, legible at any size,
                    * and not colour alone. [U-19]
                    */}
                  {person.handRaisedAt && (
                    <span className="state is-armed" data-testid="hand-up"
                          title="Wants to speak">HAND</span>
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
                      style={{ padding: '3px 8px', fontSize: 'var(--text-xs)' }}
                    >
                      {isStaged ? 'Take off stage' : 'Bring in'}
                    </button>
                    <button
                      className="small"
                      data-testid="pin-toggle"
                      aria-pressed={pinned}
                      disabled={busy}
                      onClick={() => void act({
                        action: 'pin', pinned: pinned ? null : person.id,
                      })}
                      style={{ padding: '3px 8px', fontSize: 'var(--text-xs)' }}
                    >
                      {pinned ? 'Unpin' : 'Pin'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {present.length === 0 && (
            <p className="small muted" style={{ padding: '10px 12px', margin: 0 }}>
              Nobody yet. Send someone the link.
            </p>
          )}
          </div>
        </aside>

        {/* ---- what the viewer would see ------------------------------ */}
        <section style={{ minHeight: 0, display: 'grid', gridTemplateRows: 'auto 1fr' }}>
          <div className="row" style={{ gap: 10, marginBottom: 8, flexWrap: 'nowrap' }}>
            <div className="small muted grow" style={{ textTransform: 'uppercase',
              letterSpacing: '0.1em', fontSize: 'var(--text-2xs)' }}>
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
            background: 'var(--screen-bed)', borderRadius: 'var(--radius-screen)',
            border: '1px solid var(--console-edge)',
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
                      /*
                        * A STAGE TILE IS A FRAME AROUND A PERSON, and the
                        * accent border is how the room says which person
                        * — the same colour their lower third will carry
                        * in the finished edit (U-20). A 2px line in that
                        * colour is correct and was doing it alone, which
                        * made a lit tile and an unlit one look equally
                        * present.
                        *
                        * So the border stays and gains a halo in the same
                        * hue, and the halo only appears when there is
                        * actually a picture. Somebody on stage with their
                        * camera off should look like what they are:
                        * present, and not yet visible.
                        */
                      style={{
                        borderRadius: 'var(--radius-screen)',
                        border: `2px solid ${person.accent}`,
                        background: 'var(--screen-bed)', display: 'grid', placeItems: 'center',
                        minHeight: 120, position: 'relative', overflow: 'hidden',
                        boxShadow: live
                          ? `0 0 0 3px ${person.accent}26, 0 4px 16px rgba(0,0,0,0.5)`
                          : 'inset 0 2px 8px rgba(0,0,0,0.5)',
                        transition: 'box-shadow var(--motion-base) var(--ease-out)',
                      }}
                    >
                      {live ? (
                        /*
                          Own picture muted, always: a room where you hear
                          yourself a beat late is a room nobody can speak in.
                        */
                        <LiveTile stream={live} muted={mine} name={person.displayName} />
                      ) : (
                        <div style={{
                          textAlign: 'center', padding: 'var(--space-5)',
                        }}>
                          <div style={{
                            fontSize: 'var(--text-md)',
                            fontWeight: 'var(--weight-semi)',
                            letterSpacing: 'var(--tracking-tight)',
                          }}>
                            {person.displayName}
                          </div>
                          <div style={{
                            marginTop: 'var(--space-2)',
                            fontSize: 'var(--text-sm)',
                            color: 'var(--text-faint)',
                          }}>
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
                      {/*
                        * THE ROLE FLAG IS THE ONE THING HERE ALLOWED TO BE
                        * SOLID. It sits in the corner the way a name super
                        * does on a broadcast, in the person's own accent,
                        * with dark text on it — because the accents are
                        * chosen to be light enough to carry a lower third,
                        * and light-on-light would be unreadable.
                        */}
                      <span style={{
                        position: 'absolute', left: 0, bottom: 0,
                        padding: '2px var(--space-4)',
                        background: person.accent, color: '#0b0d0f',
                        fontSize: 'var(--text-2xs)',
                        fontWeight: 'var(--weight-bold)',
                        letterSpacing: '0.07em',
                        borderTopRightRadius: 'var(--radius-xs)',
                      }}>
                        {person.role === 'host' ? 'HOST' : 'SPEAKER'}
                      </span>
                      {live && (
                        <span style={{
                          position: 'absolute', right: 0, bottom: 0,
                          padding: '2px var(--space-4)',
                          /*
                           * A NAME SUPER IS PRINTED ON THE PICTURE, not
                           * frosted over it — the last glass surface in
                           * the product, and the one most likely to be
                           * over a moving face. A blurred sample of
                           * somebody's chin behind their own name is
                           * not a material any broadcast graphic has
                           * ever been made of. [brief §19]
                           */
                          background: 'rgba(0,0,0,0.72)',
                          fontSize: 'var(--text-xs)',
                          fontWeight: 'var(--weight-medium)',
                          color: 'rgba(255,255,255,0.92)',
                          borderTopLeftRadius: 'var(--radius-xs)',
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
                letterSpacing: '0.1em', fontSize: 'var(--text-2xs)', marginBottom: 6 }}>
                Speaker mode
              </div>
              <div className="ctl-bank" data-testid="speaker-mode"
                   style={{ marginBottom: 8 }}>
                {MODES.map((mode) => (
                  <button
                    key={mode.id}
                    data-testid="mode-option"
                    data-mode={mode.id}
                    data-chosen={room.speakerMode === mode.id ? 'true' : 'false'}
                    aria-pressed={room.speakerMode === mode.id}
                    disabled={busy}
                    onClick={() => void act({ action: 'speaker-mode', speakerMode: mode.id })}
                    /*
                      * FOUR MUTUALLY EXCLUSIVE POSITIONS, which is one
                      * control and not four cards. Same bank as Studio
                      * Two's sound modes in 17: they share a face, the
                      * chosen one is lit along its leading edge, and
                      * the sentence under each is an explanation.
                      *
                      * They now share EDGES as well as a face. Four
                      * pixels of air between four `.ctl`s leaves four
                      * objects that happen to agree; a seam makes them
                      * one piece of metal with positions cut into it.
                      */
                    className={`ctl${room.speakerMode === mode.id ? ' is-on' : ''}`}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '8px 11px',
                    }}
                  >
                    <div style={{
                      fontWeight: 'var(--weight-semi)', fontSize: 'var(--text-sm)',
                      letterSpacing: 0, textTransform: 'none',
                    }}>{mode.label}</div>
                    <div style={{
                      fontSize: 'var(--text-2xs)', color: 'var(--ink-300)',
                      marginTop: 2, letterSpacing: 0, textTransform: 'none',
                      lineHeight: 'var(--leading-snug)',
                    }}>{mode.hint}</div>
                  </button>
                ))}
              </div>

              {/* A pin outranks the microphones, and says so while it does. */}
              {room.pinnedParticipantId && (
                <div className="panel small" data-testid="pin-notice"
                     style={{ padding: 9, marginBottom: 10, borderColor: 'var(--accent)' }}>
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
                letterSpacing: '0.1em', fontSize: 'var(--text-2xs)', marginBottom: 6 }}>
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
                <button className="ctl is-key" data-testid="raise-hand" disabled={busy}
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
              width: 132, aspectRatio: '16 / 9', objectFit: 'cover',
              /* Your own camera is a picture like any other. 6px slipped
                 under the radius ban, which only looks for 8 and above. */
              borderRadius: 'var(--radius-screen)',
              border: `2px solid ${capture.recording ? '#e0674f' : 'var(--line)'}`,
              display: capture.armed ? 'block' : 'none', flex: '0 0 auto',
            }}
          />
          <div className="grow" style={{ minWidth: 0 }}>
            {capture.recording ? (
              /*
                * THE STATE OF THE ROOM IS A LEGEND. Three values —
                * recording, armed, off — set as a bold sentence above
                * an explanation, which reads as a heading and competes
                * with the one control beside it. [brief §13]
                */
              <div className="module-label" data-testid="recording-now"
                   style={{ color: 'var(--ink-on-bad)' }}>
                Recording you
              </div>
            ) : capture.armed ? (
              <div className="module-label">Microphone on</div>
            ) : (
              <div className="module-label">Microphone off</div>
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
            <button className="ctl" data-testid="mic-off" onClick={capture.disarm}>
              Turn off
            </button>
          ) : (
            /*
              * THE ONE LOUD CONTROL IN THE ROOM. Nothing here works
              * until the microphone is on — the room cannot tell who
              * is speaking, so the stage cannot follow anybody — which
              * makes this the same kind of object as ENABLE CAMERA in
              * Studio One and GO LIVE in the control room. It should
              * look like their sibling rather than like a sign-up
              * button.
              */
            <button className="ctl is-key" data-testid="mic-on"
                    onClick={() => void capture.arm()}
                    style={{ padding: '8px 14px' }}>
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
        objectFit: 'cover', background: 'var(--screen-bed)',
      }}
    />
  );
}
