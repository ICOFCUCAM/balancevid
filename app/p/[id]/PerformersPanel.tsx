'use client';

import { useCallback, useEffect, useState } from 'react';

import { useConfirm } from '../../Confirm.js';
import ShareLink from '../../ShareLink.js';
import { HOUSE_SAMPLE_RATE, formatMasterPosition } from '../../../src/domain/time.js';
import { angleSays, arrivalsIn, spreadSays } from '../../../src/domain/angles.js';

/**
 * Inviting performers, and what comes back.
 *   [TAKE-APP T2, T2a, T5a, T9a, T10, T10a, T11; D-25]
 *
 *     invite  →  a link to send  →  they record on a phone
 *             →  it lands here   →  preview  →  accept  →  a take
 *
 * THE PRODUCER'S END OF THE BOUNDARY, and the whole of it. A
 * participant holds a request; a producer holds a studio; this panel
 * is where the two meet and nothing else about either crosses.
 *
 * ACCEPTING IS THE ONLY MOMENT A SUBMISSION BECOMES PRODUCTION
 * MATERIAL. Until then what exists is a file on a request that the
 * performance knows nothing about — it is not in the rail, not in
 * the timeline, not in an export, and deleting the request takes it
 * with it. After it, there is an ordinary take, made by the ordinary
 * assembler: joined, normalised, MEASURED and aligned against the
 * song exactly as a take recorded in this room is. [D-25, D-19]
 *
 * PREVIEW BEFORE DECIDING, because a producer who has to accept
 * something to find out what it is has not been given a choice. The
 * media is served by an owner's route that checks the submission
 * belongs to this performance.
 */

interface Submission {
  /** Its own id, which the state machine moves. */
  id: string;
  /**
   * The asset its media is under, which every route that serves or
   * accepts it is keyed on.  [TAKE-APP T10]
   *
   * TWO IDS FOR ONE THING, and the listing carried only the first
   * until a browser run asked for a file by the wrong name and got
   * "no such submission" back — from a panel looking straight at
   * the thing it was asking about.
   */
  assetId: string;
  kind: string;
  durationSamples?: number;
  at: string;
  acceptedAt?: string;
  device?: string;
  /** Which capture this is one angle of, where it is one. [B-3] */
  capturedIn?: { id: string; offsetSamples: number; spreadSamples?: number };
}

interface RequestRow {
  id: string;
  state: string;
  participant?: string;
  assignment: { asks: string; kind: string };
  createdAt?: string;
  expiresAt?: string;
  submissions?: Submission[];
}

export default function PerformersPanel({
  performanceId, onTakeAccepted,
}: {
  performanceId: string;
  /** A take is being made from a submission; the studio watches the job. */
  onTakeAccepted: (jobId: string) => void;
}) {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [open, setOpen] = useState(false);
  const [asks, setAsks] = useState('');
  const [who, setWho] = useState('');
  /*
   * THE LINK AND WHAT IT ASKS FOR, TOGETHER.
   *
   * This was the link alone, and the share message read the `asks`
   * field beside it — which `invite` clears the instant the link comes
   * back, so every message sent from here said "a part" however
   * carefully the producer had described the part. A browser run
   * caught it: the field said "Second verse, harmony" and WhatsApp
   * was handed "You're asked to record: a part." [T2b]
   *
   * The ask travels with the link because it belongs to the link, not
   * to a form that has already been emptied.
   */
  const [made, setMade] = useState<{ link: string; asks: string } | null>(null);
  const [origin, setOrigin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<
    { requestId: string; submissionId: string } | null>(null);
  const { confirm, dialog } = useConfirm();

  useEffect(() => { setOrigin(window.location.origin); }, []);

  /*
   * POLLED WHILE THE PANEL IS OPEN, and not otherwise. A submission
   * arrives from somebody else's phone and nothing here can know
   * when; polling a studio nobody is looking at is a request every
   * six seconds for a number that changes twice a day.
   */
  const read = useCallback(async () => {
    const response = await fetch(`/api/performances/${performanceId}/requests`,
      { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) return;
    const data = await response.json().catch(() => ({}));
    setRows((data.requests ?? []) as RequestRow[]);
  }, [performanceId]);

  useEffect(() => {
    void read();
    if (!open) return undefined;
    const timer = window.setInterval(() => { void read(); }, 6000);
    return () => window.clearInterval(timer);
  }, [open, read]);

  const invite = useCallback(async () => {
    setBusy(true);
    setError(null);
    setMade(null);
    try {
      const response = await fetch(`/api/performances/${performanceId}/requests`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(asks.trim() ? { asks: asks.trim() } : {}),
          ...(who.trim() ? { participant: who.trim() } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'that link could not be made');
      setMade({ link: String(data.link), asks: asks.trim() });
      setAsks('');
      setWho('');
      await read();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [asks, performanceId, read, who]);

  const act = useCallback(async (
    requestId: string, body: Record<string, unknown>,
  ) => {
    setError(null);
    const response = await fetch(
      `/api/performances/${performanceId}/requests/${requestId}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => null);
    const data = await response?.json().catch(() => ({})) ?? {};
    if (!response?.ok) {
      setError(data.error ?? 'that did not work');
      return;
    }
    if (data.job?.id) onTakeAccepted(String(data.job.id));
    /* A new link for a request that already exists: the ask is the
       one it was created with, and it is on the row. */
    if (data.link) {
      setMade({
        link: String(data.link),
        asks: rows.find((row) => row.id === requestId)?.assignment.asks ?? '',
      });
    }
    await read();
  }, [onTakeAccepted, performanceId, read, rows]);

  const waiting = rows.flatMap((row) => (row.submissions ?? [])
    .filter((one) => !one.acceptedAt)).length;

  return (
    <div data-testid="performers" style={{ flex: '0 0 auto' }}>
      <button
        className="ctl" data-testid="performers-open"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        style={{ width: '100%', padding: '7px 10px' }}
      >
        Invite performers
        {waiting > 0 && (
          <span data-testid="performers-waiting" className="readout" style={{
            marginLeft: 6, padding: '0 5px', borderRadius: 'var(--radius-screen)',
            background: 'var(--accent)', color: 'var(--ink-000)',
            fontSize: 'var(--text-2xs)',
          }}>{waiting}</span>
        )}
      </button>

      {open && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8,
        }}>
          {/*
            * WHAT IS BEING ASKED, AND OF WHOM. Both optional: the
            * song already says what is wanted, and plenty of links go
            * out before anybody knows who will answer. [T2]
            */}
          <input
            data-testid="performers-who" value={who}
            placeholder="Who is this for? (optional)"
            onChange={(event) => setWho(event.target.value)}
            style={{ fontSize: 'var(--text-sm)' }}
          />
          <input
            data-testid="performers-asks" value={asks}
            placeholder="What are you asking for? (optional)"
            onChange={(event) => setAsks(event.target.value)}
            style={{ fontSize: 'var(--text-sm)' }}
          />
          <button className="ctl" data-testid="performers-invite"
                  disabled={busy} onClick={() => void invite()}>
            {busy ? 'Making a link…' : 'Make a link to send'}
          </button>

          {error && (
            <p className="small" data-testid="performers-error"
               style={{ margin: 0, color: 'var(--bad)' }}>{error}</p>
          )}

          {/*
            * THE LINK, ONCE. It is a credential and this is the only
            * response that carries it — a producer can rotate it, but
            * they cannot read it back out of the list. [T14]
            */}
          {made && origin && (
            <div data-testid="performers-link" style={{
              padding: '7px 8px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--line)', background: 'var(--surface-sunk)',
            }}>
              {/*
                * SENDABLE BY ANYTHING, and by the same component the Room
                * sends its invitations with. This was a read-only input
                * and nothing else — technically true to "it is a URL, so
                * every channel carries it", and in front of a producer
                * with a band to reach it meant copying a string by hand
                * into four conversations. [T2b, D-19]
                *
                * THE QR IS THE ONE THAT MATTERS HERE and it is why the
                * square was worth a route: four people in a rehearsal
                * room, each holding the phone they will record on, do
                * not want a link in a chat thread. Put it on the laptop
                * and they all scan it. [ROOM §7]
                */}
              <ShareLink
                testId="performers"
                url={`${origin}/take/${made.link}`}
                title={made.asks || 'A part to record'}
                note="Send this to them. It is shown once."
                message={`You're asked to record: ${made.asks || 'a part'}.`
                  + `\n\nOpen this on your phone: ${origin}/take/${made.link}`}
                qrSrc={`/api/requests/${made.link.split('.')[0]}/qr`}
                qrCaption="Scan to record your part"
              />
            </div>
          )}

          {rows.length === 0 && (
            <p className="small muted" style={{ margin: 0 }}>
              Nobody has been invited yet.
            </p>
          )}

          <ul data-testid="performers-list" style={{
            listStyle: 'none', margin: 0, padding: 0,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            {rows.map((row) => (
              <li key={row.id} data-testid="performers-row" data-state={row.state}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 5,
                    padding: '7px 8px', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--line)',
                    background: 'var(--surface-sunk)',
                  }}>
                <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
                  <span className="grow" style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--weight-semi)',
                  }}>{row.participant ?? 'Anybody with the link'}</span>
                  <span className="small muted">{row.state}</span>
                </div>
                <p className="small muted" style={{ margin: 0 }}>
                  {row.assignment.asks}
                </p>

                {/*
                  * ONE ARRIVAL, NOT N FILES.  [B-3]
                  *
                  * A capture station pointing four cameras at one
                  * song used to arrive here as four rows that look
                  * exactly like four separate people — and the job
                  * this list exists for, deciding what to use, is
                  * the wrong job to be handed four times for one
                  * performance. `arrivalsIn` groups them; every
                  * submission made before captures existed is an
                  * arrival of one and draws as it always did.
                  */}
                {arrivalsIn(row.submissions ?? []).map((arrival) => (
                  <div key={arrival[0]!.id} data-testid="performers-arrival"
                       data-angles={arrival.length}
                       style={{
                         display: 'flex', flexDirection: 'column', gap: 4,
                         ...(arrival.length > 1 ? {
                           paddingLeft: 8,
                           borderLeft: 'var(--border) solid var(--line-soft)',
                         } : {}),
                       }}>
                  {arrival.length > 1 && (
                    /*
                      * WHAT THE PRODUCER NEEDS BEFORE THEY LOOK AT
                      * ANY OF IT: how many views there are, and
                      * whether they held together. A frame at 30fps
                      * is 33 ms, so a spread the producer can
                      * compare to that is the difference between a
                      * cut and a repair. [T-4]
                      */
                    <div className="row small" data-testid="performers-capture"
                         style={{ gap: 6, color: 'var(--ink-300)' }}>
                      <span className="grow">{arrival.length} angles of one take</span>
                      {spreadSays(arrival, HOUSE_SAMPLE_RATE) && (
                        <span className="mono muted" data-testid="performers-spread">
                          {spreadSays(arrival, HOUSE_SAMPLE_RATE)}
                        </span>
                      )}
                    </div>
                  )}
                  {/*
                    * ONE ARRIVAL IS ONE DECISION. [B-3]
                    *
                    * Found on a screen and not in the plan: grouping
                    * four angles into one row still left four "Use
                    * it" buttons, so the producer was shown one
                    * thing and asked about it four times — which is
                    * most of the failure this stage was written to
                    * end. A capture is taken as a capture, because
                    * three angles of four is a multiview with a
                    * camera missing.
                    *
                    * ONE AT A TIME AND IN ORDER, not four at once:
                    * each accept moves the request and copies a
                    * file, and four of those racing is four writers
                    * on one document. A failure part way leaves
                    * what was accepted accepted, which the rows
                    * below say for themselves.
                    *
                    * The angles that are already in the rail are
                    * not offered again, so pressing this after one
                    * was taken by hand takes the other three.
                    */}
                  {arrival.filter((one) => !one.acceptedAt).length > 1 && (
                    <button className="ctl sm" data-testid="performers-accept-capture"
                            disabled={busy}
                            onClick={() => void (async () => {
                              setBusy(true);
                              try {
                                for (const one of arrival) {
                                  if (one.acceptedAt) continue;
                                  await act(row.id, {
                                    action: 'accept', submissionId: one.assetId,
                                  });
                                }
                              } finally { setBusy(false); }
                            })()}>
                      {`Use all ${arrival.filter((one) => !one.acceptedAt).length}`}
                    </button>
                  )}
                  {arrival.map((one) => {
                  const live = playing?.submissionId === one.assetId;
                  return (
                    <div key={one.id} data-testid="performers-submission"
                         data-accepted={one.acceptedAt ? 'true' : 'false'}
                         style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div className="row" style={{ gap: 6 }}>
                        <span className="mono small muted grow">
                          {one.durationSamples
                            ? formatMasterPosition(one.durationSamples) : '—'}
                          {one.device ? ` · ${one.device.slice(0, 28)}` : ''}
                          {angleSays(arrival, one) && (
                            <span data-testid="performers-angle">
                              {` · ${angleSays(arrival, one)}`}
                            </span>
                          )}
                        </span>
                        {one.acceptedAt ? (
                          <span className="small" data-testid="performers-accepted"
                                style={{ color: 'var(--ink-300)' }}>In the rail</span>
                        ) : (
                          <>
                            {/* PREVIEW BEFORE DECIDING: a producer who
                                has to accept something to find out what
                                it is has not been given a choice. */}
                            <button className="ctl sm" data-testid="performers-play"
                                    onClick={() => setPlaying(live ? null : {
                                      requestId: row.id,
                                      submissionId: one.assetId,
                                    })}>
                              {live ? 'Close' : 'Watch'}
                            </button>
                            <button className="ctl sm" data-testid="performers-accept"
                                    onClick={() => void act(row.id, {
                                      action: 'accept',
                                      submissionId: one.assetId,
                                    })}>
                              Use it
                            </button>
                          </>
                        )}
                      </div>
                      {live && (
                        <video data-testid="performers-player" controls
                               src={`/api/performances/${performanceId}/requests/`
                                 + `${row.id}/submissions/${one.assetId}`}
                               style={{
                                 width: '100%',
                                 borderRadius: 'var(--radius-screen)',
                                 background: 'var(--screen-bed)',
                               }} />
                      )}
                    </div>
                  );
                  })}
                  </div>
                ))}

                <div className="row" style={{ gap: 6 }}>
                  <button className="ctl sm" data-testid="performers-hold"
                          title="Park it — you have not decided"
                          onClick={() => void act(row.id, { action: 'hold' })}>
                    Hold
                  </button>
                  <button className="ctl sm" data-testid="performers-reject"
                          title="Do not use it. Not an end — you can change your mind"
                          onClick={() => void act(row.id, { action: 'reject' })}>
                    Pass
                  </button>
                  {/*
                    * WITHDRAWING IS A NEW SECRET, which stops the old
                    * link working for whoever holds it — including
                    * somebody who has already opened it. So it asks.
                    * [ROOM §6, D-25]
                    */}
                  <button className="ctl sm" data-testid="performers-rotate"
                          onClick={() => confirm({
                            question: 'Make a new link? The one you sent stops '
                              + 'working immediately, for anybody who has it — '
                              + 'including somebody part-way through recording.',
                            verb: 'Make a new link',
                            danger: true,
                            go: () => void act(row.id, { action: 'rotate' }),
                          })}>
                    New link
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {dialog}
    </div>
  );
}

/** Exported for the tests, which assert what a duration reads as. */
export const PERFORMER_RATE = HOUSE_SAMPLE_RATE;
