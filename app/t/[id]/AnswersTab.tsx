'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import Icon from '../../Icon.js';
import { PHONE_ASKS } from '../../../src/domain/askPhone.js';
import type { Channel } from '../../../src/domain/channel.js';
import { HOUSE_SAMPLE_RATE, formatMasterPosition } from '../../../src/domain/time.js';

/**
 * The queue: questions sent to phones, and the answers that came back.
 *   [TIMELINE B14d, B14e; D-25, CHANNEL §5, §8]
 *
 * "Questions for a particular program could be forwarded to their
 *  phones... waiting for live TV or conversational studio program
 *  where the host can cite their participation and play their view
 *  that is already on the queue."
 *
 * THREE THINGS IN ONE PANEL, because they are one job: ask, wait, play.
 * A control room where the question is typed in one place and the
 * answers arrive in another is a control room where the host is
 * looking at the wrong screen when an answer lands.
 *
 * PLAYING ONE IS NOT SCHEDULING ONE. A channel broadcasts renders and
 * live ingests; an answer is neither, and turning it into a
 * programme would mean a submission became production material
 * without anybody accepting it (D-25). So it goes out the way a guest
 * does: it becomes a SOURCE IN THE MIXER, drawn into the live picture
 * beside the presenter, and it leaves when it ends. That is also what
 * the host actually means — the answer is played INTO the show, not
 * instead of it.
 *
 * CITING IS SEPARATE FROM PLAYING, and deliberately: a host reads
 * somebody's written answer out and cites them without playing
 * anything, and a host plays a recording and leaves the caption up
 * afterwards while they respond to it. Two buttons, because they are
 * two decisions.
 */

interface Answer {
  requestId: string;
  submissionId: string;
  who?: string;
  asks: string;
  kind: string;
  durationSamples?: number;
  at: string;
  device?: string;
}

interface Row {
  id: string;
  state: string;
  participant?: string;
  assignment: { asks: string; kind: string };
  createdAt?: string;
  submissions?: {
    id: string; kind: string; durationSamples?: number; at: string;
    device?: string;
  }[];
}

export default function AnswersTab({
  channel, onAir, onPlay, playing, citing, onCite,
}: {
  channel: Channel;
  onAir: boolean;
  /**
   * Put this answer into the live picture, or take it out.
   *
   * The stream is made here — a hidden `<video>` playing the file,
   * captured — and handed up, because the mixer belongs to the
   * control room and a second mixer in a panel would be a second
   * picture going out. [D-19]
   */
  onPlay: (answer: Answer | null, stream: MediaStream | null) => void;
  playing: string | null;
  /** Whether a name is on air now, so it can be taken down. */
  citing: boolean;
  onCite: (who: { name?: string; asks: string } | null) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [asks, setAsks] = useState('');
  const [wants, setWants] = useState<string>('answer');
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => { setOrigin(window.location.origin); }, []);

  /*
   * POLLED, because an answer arrives from somebody else's phone and
   * nothing in this tab can know when. Every four seconds: often
   * enough that a host asking a question live sees the first answer
   * while they are still talking, rare enough not to be a load on a
   * machine that is encoding video. [ROOM §12's own argument]
   */
  const read = useCallback(async () => {
    const response = await fetch(`/api/channels/${channel.id}/requests`,
      { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) return;
    const data = await response.json().catch(() => ({}));
    setRows((data.requests ?? []) as Row[]);
  }, [channel.id]);

  useEffect(() => {
    void read();
    const timer = window.setInterval(() => { void read(); }, 4000);
    return () => window.clearInterval(timer);
  }, [read]);

  const ask = useCallback(async () => {
    setBusy(true);
    setError(null);
    setLink(null);
    try {
      const response = await fetch(`/api/channels/${channel.id}/requests`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ asks, wants }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'that could not be sent');
      setLink(String(data.link));
      setAsks('');
      await read();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [asks, channel.id, read, wants]);

  /*
   * A FILE BECOMES A SOURCE. `captureStream` on a playing video is
   * the one bridge between "media on disk" and "a feed in the
   * mixer", and it is why an answer can join the picture beside the
   * presenter rather than replacing the programme.
   */
  const play = useCallback((answer: Answer) => {
    const element = video.current;
    if (!element) return;
    element.src = `/api/channels/${channel.id}/answers/`
      + `${answer.requestId}/${answer.submissionId}`;
    element.currentTime = 0;
    void element.play().then(() => {
      const stream = (element as HTMLVideoElement & {
        captureStream?: () => MediaStream;
      }).captureStream?.();
      onPlay(answer, stream ?? null);
    }).catch(() => setError('that answer would not play'));
  }, [channel.id, onPlay]);

  const stop = useCallback(() => {
    video.current?.pause();
    onPlay(null, null);
  }, [onPlay]);

  const answers: Answer[] = rows.flatMap((row) => (row.submissions ?? []).map(
    (one) => ({
      requestId: row.id,
      submissionId: one.id,
      ...(row.participant ? { who: row.participant } : {}),
      asks: row.assignment.asks,
      kind: one.kind,
      ...(one.durationSamples ? { durationSamples: one.durationSamples } : {}),
      at: one.at,
      ...(one.device ? { device: one.device } : {}),
    })));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* THE QUESTION, TYPED WHERE THE ANSWERS WILL LAND. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label className="small muted" htmlFor="answers-asks">
          Ask the audience
        </label>
        <textarea
          id="answers-asks" data-testid="answers-asks" rows={2}
          value={asks} placeholder="What do you think of tonight’s programme?"
          onChange={(event) => setAsks(event.target.value)}
          style={{ fontSize: 'var(--text-sm)', resize: 'vertical' }}
        />
        <div className="row" style={{ gap: 6 }}>
          <select data-testid="answers-wants" value={wants}
                  onChange={(event) => setWants(event.target.value)}
                  style={{ fontSize: 'var(--text-sm)', width: 'auto' }}>
            {Object.entries(PHONE_ASKS).map(([id, one]) => (
              <option key={id} value={id}>{one.label}</option>
            ))}
          </select>
          <button className="ctl" data-testid="answers-send"
                  disabled={busy || !asks.trim()}
                  onClick={() => void ask()}
                  style={{ flex: 1 }}>
            {busy ? 'Making a link…' : 'Make a link to send'}
          </button>
        </div>
        {error && (
          <p className="small" data-testid="answers-error"
             style={{ margin: 0, color: 'var(--ink-on-bad)' }}>{error}</p>
        )}
      </div>

      {/*
        * THE LINK, ONCE, AND THEN NEVER AGAIN.  [T14]
        *
        * It is a credential. This is the only response that carries
        * it — a producer can rotate it, but they cannot read it back
        * out of the queue — so it is shown here until the next
        * question is asked, and it is selected on focus because the
        * next thing anybody does with it is copy it into WhatsApp.
        *
        * NOT THE ROOM'S INVITE PANEL, which wants a conversation, a
        * source title and a rotate handler: borrowing it would mean
        * lying to it about three things to reuse a copy button.
        */}
      {link && origin && (
        <div data-testid="answers-link" style={{
          display: 'flex', flexDirection: 'column', gap: 5,
          padding: '8px 9px', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--line)', background: 'var(--console-control)',
        }}>
          <span className="small muted">
            Send this to whoever is answering. It is shown once.
          </span>
          <input
            readOnly data-testid="answers-link-url"
            value={`${origin}/take/${link}`}
            onFocus={(event) => event.currentTarget.select()}
            style={{ fontSize: 'var(--text-xs)', fontFamily: 'ui-monospace, monospace' }}
          />
        </div>
      )}

      {/*
        * THE QUEUE. Everything that has come back, newest first,
        * because a live host reads down from the top.
        */}
      <div className="small muted" style={{ marginTop: 2 }}>
        {answers.length === 0
          ? 'Nothing has come back yet.'
          : `${answers.length} answer(s)`}
      </div>
      <ul data-testid="answers-queue" style={{
        listStyle: 'none', margin: 0, padding: 0,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {[...answers].reverse().map((answer) => {
          const live = playing === answer.submissionId;
          return (
            <li key={answer.submissionId} data-testid="answers-row"
                data-live={live ? 'true' : 'false'}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 5,
                  padding: '8px 9px', borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${live ? 'var(--ink-300)' : 'var(--line)'}`,
                  background: 'var(--console-control)',
                }}>
              <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
                <span className="grow" style={{
                  fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semi)',
                }}>{answer.who ?? 'Anonymous'}</span>
                <span className="mono small muted">
                  {answer.durationSamples
                    ? formatMasterPosition(answer.durationSamples)
                    : '—'}
                </span>
              </div>
              <p className="small muted" style={{ margin: 0 }}>{answer.asks}</p>
              <div className="row" style={{ gap: 6 }}>
                {/*
                  * PLAY IS OFF AIR UNTIL THE CHANNEL IS ON AIR, and
                  * says so rather than going missing: a host who
                  * cannot find the button while a programme is
                  * running has lost the moment. [U-04]
                  */}
                <button className="ctl sm" data-testid="answers-play"
                        disabled={!onAir}
                        title={onAir
                          ? 'Play it into the live picture'
                          : 'The channel is not on air'}
                        onClick={() => (live ? stop() : play(answer))}>
                  <Icon name={live ? 'stop' : 'play'} size={11} />
                  {live ? ' Take it out' : ' Play it in'}
                </button>
                <button className="ctl sm" data-testid="answers-cite"
                        disabled={!onAir}
                        title={onAir
                          ? 'Put their name on air'
                          : 'The channel is not on air'}
                        onClick={() => onCite({
                          ...(answer.who ? { name: answer.who } : {}),
                          asks: answer.asks,
                        })}>
                  Cite them
                </button>
                {answer.device && (
                  <span className="small muted" style={{
                    alignSelf: 'center', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: 120,
                  }} title={answer.device}>{answer.device}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {citing ? (
        <button className="ctl sm" data-testid="answers-uncite"
                onClick={() => onCite(null)}>
          Take the name down
        </button>
      ) : null}

      {/*
        * THE ELEMENT THE STREAM COMES FROM. Muted, because its sound
        * goes out through the MIXER — playing it aloud in the control
        * room as well would put it into the presenter's microphone
        * and broadcast it twice.
        */}
      <video ref={video} data-testid="answers-player" muted playsInline
             onEnded={() => onPlay(null, null)}
             style={{
               /* A picture takes the screen radius, not a card's:
                  the console's own rule, and this is a monitor. */
               width: '100%', borderRadius: 'var(--radius-screen)',
               background: 'var(--screen-bed)',
               display: playing ? 'block' : 'none',
             }} />
    </div>
  );
}

/** Exported for the tests, which assert what a duration reads as. */
export const ANSWER_RATE = HOUSE_SAMPLE_RATE;
