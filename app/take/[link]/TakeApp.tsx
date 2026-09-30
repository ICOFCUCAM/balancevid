'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import Icon from '../../Icon.js';

import { useMasterRecording } from '../../p/[id]/useMasterRecording.js';
import { HOUSE_SAMPLE_RATE, formatMasterPosition } from '../../../src/domain/time.js';
import type { RequestView } from '../../../src/domain/participation.js';
import { dropTake, sendTake, takeSink, type KeptSpec } from './takeSink.js';

/**
 * The performer's whole screen.  [Doctrine D-25; TAKE-APP T3, T4, T5, T13]
 *
 * THE BRIEF DREW THIS SCREEN and it is built as drawn: the production's
 * name, which take this is, the camera, the song's clock, one button.
 * Then, when the take ends: review it, keep it, or record again. Then
 * submit what was kept.
 *
 * IT IS DELIBERATELY NOT A STUDIO. "The phone does not need to become a
 * miniature Studio Two." There is no timeline here, no layout picker,
 * no other take, no sight of anybody else's work — because the
 * participant is not deciding anything about the finished thing, and a
 * client handed a studio is a client that can be read for one. [D-25]
 *
 * THE HARD PART IS BORROWED WHOLE. `useMasterRecording` is the studio's
 * own recorder: the song scheduled on the audio clock, the offset taken
 * at the instant the first chunk closes, the device's latency
 * subtracted, the elapsed time measured where it is honest. It differs
 * here by one argument — where the bytes go. [D-19]
 *
 * A COUNT-IN, BECAUSE NOBODY SINGS FROM A STANDING START. The studio
 * uses four seconds and so does this; it is the same performance being
 * recorded, and a performer who has to guess when the song begins is
 * one who begins late. [S-10]
 */

const COUNT_IN_SECONDS = 4;

/**
 * The heading for a request with no song behind it.  [B14d, T12]
 *
 * A performance's heading is the song's title, which says what the
 * page is for before a word of the ask is read. A question has no
 * title, and "…" over somebody's camera says nothing at all.
 */
function asksFor(kind: string): string {
  switch (kind) {
    case 'question': return 'A question for you';
    case 'audio': return 'Record an answer';
    case 'poll': return 'A question for you';
    default: return 'Record a reply';
  }
}

/** A recording the performer has made and not yet sent. [T4] */
interface Kept {
  /** The submission id its segments are under, on the server. */
  id: string;
  /** What the phone believes it is, in seconds, for a line of text. */
  seconds: number;
  at: string;
  /** What the phone measured, held until they decide. */
  spec: KeptSpec;
  state: 'kept' | 'sending' | 'sent' | 'gone';
}

export default function TakeApp({ link }: { link: string }) {
  const [view, setView] = useState<RequestView | null>(null);
  const [closed, setClosed] = useState(false);
  const [kept, setKept] = useState<Kept[]>([]);
  const [said, setSaid] = useState<string | null>(null);

  /*
   * A FINISHED RECORDING IS KEPT, NOT SENT.  [TAKE-APP T4]
   *
   * The sink hands it back rather than sending it, and this list is
   * what the performer decides about. Its segments are already on
   * the server — a phone that loses a call mid-song must not lose
   * the performance with it — but nothing has crossed to the
   * producer until Send.
   */
  /*
   * SOUND ONLY, WHERE THE REQUEST SAYS SO.  [T12, B14d]
   *
   * `allowed` names what the participant MAY send, and a request for
   * audio simply does not carry `video`. Asking a phone for a camera
   * the recording will not use costs a permission prompt, a light on
   * the device and the participant's trust.
   */
  const soundOnly = Boolean(view) && !view!.allowed.video;

  const sink = useMemo(() => takeSink(link, (id, spec) => {
    setKept((was) => [...was, {
      id, spec, seconds: spec.elapsedSamples / HOUSE_SAMPLE_RATE,
      at: new Date().toISOString(), state: 'kept',
    }]);
  }), [link]);
  /*
   * A SONG TO PERFORM AGAINST, OR A QUESTION TO ANSWER.  [B14d, T12]
   *
   * A performance request carries a reference; a question does not,
   * and asking for one would 404 and leave the performer looking at
   * "could not read the song" over a question about the news. The
   * recorder is told there is no clock, and everything else about
   * the page is the same.
   */
  const recording = useMasterRecording({
    sink,
    masterUrl: view && !view.assignment.reference
      ? null
      : `/api/take/${encodeURIComponent(link)}/reference`,
    sampleRate: HOUSE_SAMPLE_RATE,
    countInSeconds: COUNT_IN_SECONDS,
    /*
     * NO CALIBRATION ON A PHONE THE PRODUCT HAS NEVER SEEN. The studio
     * measures its own device's latency with a loopback test the author
     * runs on purpose; a performer opening a link has done no such
     * thing, and guessing a number would be worse than admitting there
     * is none. The worker checks the offset against the master anyway,
     * which is what catches it. [S-3]
     */
    latencySamples: 0,
    /* An audio request has no picture to take, and asking a phone for
       a camera it will not use costs a permission prompt and the
       participant's trust. [T12, B14d] */
    audioOnly: soundOnly,
    onFinished: () => { /* Nothing to wait on: see `takeSink`. */ },
  });

  /* What is being asked, fetched against the same link that opened it. */
  useEffect(() => {
    let alive = true;
    void (async () => {
      const response = await fetch(`/api/take/${encodeURIComponent(link)}`, {
        cache: 'no-store',
      }).catch(() => null);
      if (!alive) return;
      if (!response?.ok) { setClosed(true); return; }
      const data = await response.json().catch(() => ({}));
      setView(data.request ?? null);
    })();
    return () => { alive = false; };
  }, [link]);

  const reference = view?.assignment.reference;
  const songSeconds = reference ? reference.durationSamples / HOUSE_SAMPLE_RATE : 0;

  const begin = useCallback(async () => {
    setSaid(null);
    try {
      await recording.start(
        `${view?.participant ?? 'Take'} ${kept.length + 1}`,
        { kind: 'original' },
      );
    } catch (error) {
      setSaid(error instanceof Error ? error.message : 'that did not work');
    }
  }, [kept.length, recording, view]);

  /* Stopping ends the recording; the sink above adds it to the list. */
  const end = useCallback(() => { recording.stop(); }, [recording]);

  const mark = useCallback((id: string, state: Kept['state']) => {
    setKept((was) => was.map(
      (one) => (one.id === id ? { ...one, state } : one)));
  }, []);

  /*
   * SEND, which is the moment it crosses to the producer. [D-25, T5]
   *
   * The state goes to `sending` first and back to `kept` if it
   * fails, because a phone on a train will fail at this and the
   * performer needs the button back rather than a row that says
   * nothing.
   */
  const send = useCallback(async (one: Kept) => {
    setSaid(null);
    mark(one.id, 'sending');
    try {
      await sendTake(link, one.id, one.spec);
      mark(one.id, 'sent');
    } catch (error) {
      mark(one.id, 'kept');
      setSaid(error instanceof Error ? error.message : 'that did not send');
    }
  }, [link, mark]);

  /*
   * AND DELETE, which is the brief's own line: "Take 3 doesn't have
   * to reach the server at all if they delete it locally." It did
   * reach it, in segments, because a dropped call must not cost a
   * good take — so this removes them rather than leaving them until
   * the request is swept. [T4]
   */
  const drop = useCallback(async (one: Kept) => {
    setSaid(null);
    try {
      await dropTake(link, one.id);
      mark(one.id, 'gone');
    } catch (error) {
      setSaid(error instanceof Error ? error.message : 'that did not work');
    }
  }, [link, mark]);

  if (closed) {
    return (
      <main className="shell" data-testid="take-closed" style={page}>
        <div style={card}>
          <h1 style={brand}>BalanceVid</h1>
          <p className="small muted" style={{ maxWidth: 320, textAlign: 'center' }}>
            This link is not open. It may have been used, withdrawn, or run
            out — the person who sent it can send another.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="shell" data-testid="take-app" style={page}>
      <div style={card}>
        <h1 style={brand}>BalanceVid</h1>

        {/* WHAT IS BEING ASKED, in the producer's own words. [T3] */}
        <p data-testid="take-title" style={{
          margin: 0, fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)',
          letterSpacing: '0.04em', textTransform: 'uppercase', textAlign: 'center',
        }}>{reference?.title ?? (view ? asksFor(view.assignment.kind) : '…')}</p>
        <p data-testid="take-asks" className="small" style={{
          margin: 0, textAlign: 'center', color: 'var(--ink-100)', maxWidth: 340,
        }}>{view?.assignment.asks ?? ''}</p>

        <p data-testid="take-number" className="small muted" style={{ margin: 0 }}>
          {reference ? 'Take' : 'Answer'} {kept.length + 1}
          {view?.allowed.takes ? ` of ${view.allowed.takes}` : ''}
        </p>

        {/*
          * THE CAMERA, WHICH IS THE WHOLE PAGE ON A PHONE. Mirrored,
          * because a performer watching themselves is using it as a
          * mirror and an unmirrored preview makes people reach the
          * wrong way. The recording itself is not mirrored.
          */}
        {/*
          * AND A SPOKEN ANSWER HAS NO PICTURE, so it does not get a
          * phone-sized empty rectangle saying "the camera is off".
          * A box the height of the screen with nothing in it reads as
          * something broken rather than as something not asked for.
          * [U-04, B14d]
          */}
        <div data-testid="take-stage" data-sound={soundOnly ? 'true' : 'false'}
             style={{
               position: 'relative', width: '100%',
               ...(soundOnly
                 ? { minHeight: 132, display: 'grid', placeItems: 'center' }
                 : { aspectRatio: '3 / 4' }),
               borderRadius: 'var(--radius-screen)', overflow: 'hidden',
               background: 'var(--screen-bed)', border: '1px solid var(--line)',
             }}>
          {soundOnly && (
            <span className="row" style={{
              gap: 8, color: 'var(--ink-300)', fontSize: 'var(--text-sm)',
            }}>
              <Icon name="mic" size={16} />
              {recording.phase === 'recording' ? 'Listening\u2026'
                : recording.phase === 'idle' ? 'Sound only \u2014 nothing is filmed'
                  : 'Ready'}
            </span>
          )}
          {!soundOnly && (
            <video
              data-testid="take-camera" ref={recording.videoRef}
              muted playsInline autoPlay
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                transform: 'scaleX(-1)', display: 'block',
              }}
            />
          )}
          {recording.phase === 'counting' && (
            <div data-testid="take-countin" style={overlay}>
              {/* The display step, which exists for exactly this: "a
                  display figure: the clock, the counter". */}
              <span style={{
                fontSize: 'var(--text-2xl)',
                fontWeight: 'var(--weight-bold)',
              }}>
                {Math.max(1, Math.ceil(COUNT_IN_SECONDS - recording.position))}
              </span>
            </div>
          )}
          {recording.phase === 'idle' && !soundOnly && (
            <div style={overlay}>
              <span className="small muted">The camera is off</span>
            </div>
          )}
          {recording.phase === 'recording' && (
            <span data-testid="take-live" style={{
              position: 'absolute', top: 10, left: 10, padding: '3px 8px',
              borderRadius: 'var(--radius-screen)', background: 'rgba(0,0,0,0.72)',
              border: '1px solid rgba(255,255,255,0.16)',
              color: '#e0674f', fontSize: 'var(--text-2xs)',
              fontWeight: 'var(--weight-bold)', letterSpacing: '0.08em',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              <Icon name="live" size={9} /> RECORDING
            </span>
          )}
        </div>

        {/*
          * THE SONG'S CLOCK, which is the only clock on this screen —
          * and there is no clock at all when there is no song, so it
          * counts up rather than towards a total of 00:00.000. A
          * denominator of nothing is a progress bar that is always
          * full. [U-04, B14d]
          */}
        <p data-testid="take-clock" className="mono readout" style={{
          margin: 0, fontSize: 'var(--text-sm)',
        }}>
          {formatMasterPosition(Math.round(
            Math.max(0, recording.position) * HOUSE_SAMPLE_RATE))}
          {reference && (
            <span style={{ color: 'var(--ink-400)' }}>
              {' / '}
              {formatMasterPosition(Math.round(songSeconds * HOUSE_SAMPLE_RATE))}
            </span>
          )}
        </p>

        {recording.error && (
          <p data-testid="take-error" className="small" style={{
            margin: 0, color: 'var(--ink-on-bad)', textAlign: 'center',
          }}>{recording.error}</p>
        )}
        {said && (
          <p data-testid="take-said" className="small" style={{
            margin: 0, color: 'var(--ink-on-bad)', textAlign: 'center',
          }}>{said}</p>
        )}

        {/* ONE BUTTON AT A TIME, because there is one thing to do next. */}
        {recording.phase === 'idle' && (
          <button className="ctl lg" data-testid="take-arm" style={wide}
                  onClick={() => void recording.arm()}>
            {soundOnly ? 'Turn the microphone on' : 'Turn the camera on'}
          </button>
        )}
        {recording.phase === 'arming' && (
          <button className="ctl lg" disabled style={wide}>Preparing…</button>
        )}
        {recording.phase === 'ready' && (
          <button className="ctl lg primary" data-testid="take-start" style={wide}
                  onClick={() => void begin()}>
            {reference ? 'Start recording' : 'Start answering'}
          </button>
        )}
        {(recording.phase === 'counting' || recording.phase === 'recording') && (
          <button className="ctl lg" data-testid="take-stop" style={wide}
                  onClick={end}>
            Stop
          </button>
        )}
        {recording.phase === 'finishing' && (
          <button className="ctl lg" disabled style={wide}>Saving…</button>
        )}

        {/*
          * WHAT THEY HAVE MADE SO FAR. [T4]
          *
          * The brief's list, with one difference stated plainly rather
          * than hidden: a take's SEGMENTS are already on the server by
          * the time it ends, because a phone that loses a call
          * mid-song must not lose the performance with it. What has
          * not happened is the SUBMISSION — nothing reaches the
          * producer until it is sent, and a take deleted here is never
          * assembled and is swept with the request.
          */}
        {kept.some((one) => one.state !== 'gone') && (
          <ul data-testid="take-list" style={{
            listStyle: 'none', margin: 0, padding: 0, width: '100%',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            {kept.filter((one) => one.state !== 'gone').map((one, index) => (
              <li key={one.id} className="row" data-testid="take-kept"
                  data-state={one.state}
                  style={{
                    gap: 8, alignItems: 'center', padding: '7px 9px',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--console-control)',
                  }}>
                <span className="grow" style={{ fontSize: 'var(--text-sm)' }}>
                  Take {index + 1}
                </span>
                <span className="mono small muted">
                  {formatMasterPosition(Math.round(one.seconds * HOUSE_SAMPLE_RATE))}
                </span>
                {/*
                  * SEND AND DELETE, AND THEN NEITHER.  [T4]
                  *
                  * Once it is sent it belongs to the production, and
                  * a performer who could delete it then would be
                  * deleting out of somebody else's studio. What they
                  * may undo is their own decision not yet acted on.
                  * [D-25]
                  */}
                {one.state === 'sent' ? (
                  <span data-testid="take-sent" className="small" style={{
                    color: 'var(--ink-300)',
                  }}>Sent</span>
                ) : (
                  <>
                    <button className="ctl sm" data-testid="take-send"
                            disabled={one.state === 'sending'}
                            onClick={() => void send(one)}>
                      {one.state === 'sending' ? 'Sending…' : 'Send'}
                    </button>
                    <button className="ctl sm" data-testid="take-drop"
                            disabled={one.state === 'sending'}
                            title="Throw this take away — the producer never sees it"
                            onClick={() => void drop(one)}>
                      Delete
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* The headphone warning is about a SONG, and a question has
            none — a warning that does not apply is a warning people
            stop reading. [U-04] */}
        {reference && (
          <p className="small muted" style={{
            margin: 0, textAlign: 'center', maxWidth: 340,
          }}>
            Wear headphones if you can. If the song comes out of a speaker,
            your recording carries it twice.
          </p>
        )}
      </div>
    </main>
  );
}

/*
 * A PHONE PAGE, NOT A DESK. One column, generous targets, and nothing
 * that assumes a pointer — this is opened standing up, in a room,
 * holding the thing it is recording with.
 */
const page: React.CSSProperties = {
  minHeight: '100dvh', display: 'grid', placeItems: 'center',
  padding: 'var(--space-5)',
};

const card: React.CSSProperties = {
  width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column',
  alignItems: 'center', gap: 'var(--space-4)',
};

const brand: React.CSSProperties = {
  margin: 0, fontSize: 'var(--text-sm)', letterSpacing: '0.18em',
  textTransform: 'uppercase', color: 'var(--ink-300)',
  fontWeight: 'var(--weight-semi)',
};

const wide: React.CSSProperties = { width: '100%', minHeight: 48 };

const overlay: React.CSSProperties = {
  position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
  background: 'rgba(0,0,0,0.72)',
};
