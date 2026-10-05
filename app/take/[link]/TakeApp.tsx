'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import Icon from '../../Icon.js';

import { useMasterRecording } from '../../p/[id]/useMasterRecording.js';
import { HOUSE_SAMPLE_RATE, formatMasterPosition } from '../../../src/domain/time.js';
import type { RequestView } from '../../../src/domain/participation.js';
import {
  CONSENT_MEANS, CONSENT_SCOPES, type ConsentScope, consentSays,
} from '../../../src/domain/consent.js';
import { dropTake, sendTake, takeSink, type KeptSpec } from './takeSink.js';
import {
  askToBeTold, askToDrain, installWorker, isWatching, settle, startWatching,
  stopWatching, takeQueue,
} from './queue.js';
import InstallBar from './InstallBar.js';
import { useCamera } from '../../useCamera.js';
import { useQuality } from '../../useQuality.js';
import { QUALITIES } from '../../../src/domain/quality.js';
import { cameraConstraints } from '../../useDevices.js';

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
  /** Per recording: segments still on their way, and ones that cannot be. */
  const [outstanding, setOutstanding] = useState<
    Record<string, { left: number; dead: number }>>({});
  /**
   * WHAT THEY HAVE TICKED, AND IT STARTS EMPTY.  [GO-VIRAL V-3]
   *
   * *"with nothing pre-ticked"*, which is not a style note: a box
   * somebody did not untick is not a thing they agreed to, and a
   * product that pre-ticked *broadcast* would be collecting
   * permission by default from people who came to sing.
   */
  const [agreed, setAgreed] = useState<ConsentScope[]>([]);
  const [signing, setSigning] = useState(false);
  /** Whether this device is waiting to hear about this link. [V-7] */
  const [waiting, setWaiting] = useState(false);
  const [told, setTold] = useState<string | null>(null);

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
  /*
   * WHICH CAMERA, AND HOW GOOD.  [T3; quality.ts, useDevices]
   *
   * A PHONE HAS TWO CAMERAS AND THE ANSWER IS NOT OBVIOUS. Somebody
   * singing to their own phone wants the front one; somebody filming
   * the band in the room wants the back one, which is also the better
   * sensor on every phone made. This surface picked neither — it
   * asked for 720p with no device at all and took whatever the
   * browser nominated.
   *
   * AND IT ASKED FOR 720p FROM A PHONE THAT SHOOTS 4K. The render is
   * resolution-agnostic, so that was the ceiling on the master too.
   * The preset is remembered per device, so a performer sets it once.
   */
  /*
   * WHAT THIS CALL ASKS THEM TO AGREE TO, AND WHETHER THEY HAVE.
   *   [GO-VIRAL V-3]
   *
   * `terms` ARRIVES WITH THE ASSIGNMENT and is absent for every
   * request that is not part of a call that asks something — which
   * is every request this product has issued, so the page below is
   * byte for byte the page it was for all of them.
   */
  const terms = view?.terms ?? null;
  const withdrawn = Boolean(view?.consent?.withdrawnAt);
  const mustAgree = Boolean(terms) && !(view?.consent && !withdrawn);

  /*
   * AND THE CAMERA IS NOT TOUCHED UNTIL THEY HAVE.
   *
   * *"Shown on the Take surface before the camera opens."* The gate
   * below returns before the recorder is drawn, so there is no Arm
   * button to press — and this flag is the second half of the same
   * sentence: the device list is not even enumerated, so a phone
   * does not light anything up behind a page asking a question.
   */
  const camera = useCamera(!soundOnly && !mustAgree);
  const grade = useQuality('recording');

  const recording = useMasterRecording({
    sink,
    video: soundOnly ? undefined : cameraConstraints(
      camera.cameraId, grade.quality.width, grade.quality.height,
      grade.quality.fps),
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

  /*
   * THE WORKER, AND A DRAIN ON ARRIVAL.  [T13a]
   *
   * Registering it is what makes this installable and what lets an
   * upload finish after the phone is locked. Draining on load is the
   * other half: a performer whose browser was killed mid-song opens
   * the link again and their segments resume, which is precisely the
   * failure U-06's rolling segments exist to survive and which the
   * original fire-and-forget upload did not.
   *
   * AND ON `online`, because the commonest interruption is not a
   * crash — it is a tunnel.
   */
  useEffect(() => {
    void installWorker();
    void askToDrain();
    const wake = () => { void askToDrain(); };
    window.addEventListener('online', wake);
    return () => { window.removeEventListener('online', wake); };
  }, []);

  /*
   * WHAT IS STILL ON ITS WAY, while anything is waiting to be sent.
   *
   * Polled rather than pushed, because the queue is also drained by a
   * service worker this page cannot subscribe to, and a count that is
   * a second stale is a count nobody notices being stale. The timer
   * stops when there is nothing undecided: a page left open on a
   * finished take should not touch the disk every second.
   */
  const undecided = kept.some((one) => one.state === 'kept' || one.state === 'sending');
  useEffect(() => {
    if (!undecided) return undefined;
    let alive = true;
    const look = async () => {
      const queue = await takeQueue();
      if (!queue || !alive) return;
      const next: Record<string, { left: number; dead: number }> = {};
      for (const one of kept) {
        if (one.state === 'sent' || one.state === 'gone') continue;
        next[one.id] = {
          left: await queue.pending(one.id),
          dead: await queue.broken(one.id),
        };
      }
      if (alive) setOutstanding(next);
    };
    void look();
    const timer = window.setInterval(() => { void look(); }, 1500);
    return () => { alive = false; window.clearInterval(timer); };
  }, [kept, undecided]);

  /*
   * WHAT THIS DEVICE WAS LAST TOLD, AND WHAT IT IS TOLD NOW.
   *   [GO-VIRAL V-7]
   *
   * THE PAGE IS THE ONE SURFACE THAT ALWAYS WORKS. A worker that
   * the browser never wakes, a permission that was refused, a
   * phone with neither — all of them come down to this: the
   * person opens the link and reads what happened. So opening it
   * is also what records that they have been told, which is what
   * stops a notification arriving about the sentence they are
   * looking at.
   */
  const outcome = view?.outcome;
  useEffect(() => {
    let alive = true;
    void (async () => {
      const already = await isWatching(link);
      if (alive) setWaiting(already);
      if (already && outcome?.state) {
        await startWatching(link, outcome.state);
      }
    })();
    return () => { alive = false; };
  }, [link, outcome?.state]);

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
      /*
       * THE SEGMENTS FIRST, AND THAT IS NOT AN OPTIMISATION.
       *
       * Sending is a JOIN of the `.part` files on disk. Sending while
       * a segment is still queued produces a submission with a hole
       * in it, of a plausible length, that nobody can tell from a
       * complete one until they watch it — and the producer would be
       * the one to find out. [T5, U-06]
       */
      /*
       * AND IT SAYS SO WHILE IT WAITS, not a minute later.
       *
       * The first browser run pressed Send with two segments still
       * queued on a phone with no signal, and the page said nothing
       * at all for sixty seconds — the button read "Sending…" and
       * the performer had no way to know whether it was working,
       * stuck, or broken. It was working. A control that looks
       * broken while it is working is a fault. [U-19]
       */
      const queue = await takeQueue();
      const waiting = queue ? await queue.pending(one.id) : 0;
      if (waiting > 0) {
        setSaid(`Still uploading ${waiting} `
          + `${waiting === 1 ? 'part' : 'parts'}. This will send on its own `
          + 'when they arrive — you can leave the page open.');
      }
      const ready = await settle(one.id);
      if (!ready.ok) {
        mark(one.id, 'kept');
        setSaid(ready.reason === 'broken'
          ? `${ready.left === 1 ? 'A part' : `${ready.left} parts`} of that take `
            + 'could not be uploaded. Record it again.'
          : `Still uploading ${ready.left} `
            + `${ready.left === 1 ? 'part' : 'parts'}. It will send once they arrive.`);
        return;
      }
      await sendTake(link, one.id, one.spec);
      setSaid(null);
      mark(one.id, 'sent');
      /*
       * AND ASK THE SERVER WHAT IT NOW HOLDS.  [GO-VIRAL V-7]
       *
       * FOUND IN A SCREENSHOT. The take counter read `kept.length
       * + 1`, which is right within one visit and forgets
       * everything across a reload: a performer who sent one take
       * and opened the link again a week later was told *Take 1
       * of 3* about their second. `submitted` is the server's own
       * count and has been in the view since B-2 — it was simply
       * never read here, and nothing refreshed it after a send.
       */
      const fresh = await fetch(`/api/take/${encodeURIComponent(link)}`, {
        cache: 'no-store',
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (fresh?.request) setView(fresh.request);
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
      /*
       * THE QUEUED SEGMENTS FIRST, and with a queue in front of the
       * network the brief's line becomes literally true: a take
       * deleted before its last segment went up never reaches the
       * server at all. [T4]
       */
      const queue = await takeQueue();
      if (queue) await queue.forget(one.id);
      await dropTake(link, one.id);
      mark(one.id, 'gone');
    } catch (error) {
      setSaid(error instanceof Error ? error.message : 'that did not work');
    }
  }, [link, mark]);

  /*
   * AGREEING.  [GO-VIRAL V-3]
   *
   * ITS OWN REQUEST, SENT BEFORE ANYTHING IS RECORDED, which is
   * the whole substance of this stage. The hash goes back exactly
   * as it arrived — the client never computes one, because a hash
   * the client made up would be a signature on words nobody chose.
   */
  const sign = useCallback(async () => {
    if (!terms) return;
    setSigning(true);
    setSaid(null);
    try {
      const response = await fetch(
        `/api/take/${encodeURIComponent(link)}/consent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ termsHash: terms.hash, permits: agreed }),
        });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSaid(typeof data.error === 'string' ? data.error : 'that did not work');
        return;
      }
      setView(data.request ?? null);
    } catch {
      setSaid('that did not reach the server');
    } finally {
      setSigning(false);
    }
  }, [agreed, link, terms]);

  /*
   * AND TAKING IT BACK, WHICH IS THE HALF THAT MAKES IT CONSENT.
   *
   * D-03: *"separate, specific, revocable, opt-in"*. Revocable is
   * the word, and a product that recorded an agreement and offered
   * no way out of it would have collected a release, not consent.
   * It stops future use and unmakes nothing already done, which is
   * what the screen says in those words.
   */
  const withdraw = useCallback(async () => {
    setSaid(null);
    const response = await fetch(
      `/api/take/${encodeURIComponent(link)}/consent`, { method: 'DELETE' },
    ).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      setSaid(typeof data?.error === 'string' ? data.error : 'that did not work');
      return;
    }
    setAgreed([]);
    setView(data.request ?? null);
  }, [link]);

  if (closed) {
    return (
      <main data-testid="take-closed" style={page}>
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

  /*
   * THE WORDS, BEFORE THE CAMERA.  [GO-VIRAL V-3; Doctrine D-03]
   *
   * > *"Shown on the Take surface before the camera opens, in plain
   * > words, with nothing pre-ticked."*
   *
   * AN EARLY RETURN AND NOT A DIALOGUE OVER THE RECORDER, because
   * a modal is a thing people dismiss. There is no camera behind
   * this, no Arm button to find, and no way past it except by
   * answering it — which is the only arrangement in which the
   * record afterwards means anything.
   *
   * FOUR SEPARATE QUESTIONS, NOT ONE. A person willing to be judged
   * has not thereby agreed to be on television, and the three after
   * the first can each be left alone without stopping them taking
   * part. `entry` is the one that is the act itself.
   *
   * AND IT RENDERS FOR NOBODY ELSE. A request under no call, or a
   * call that asks nothing, has no `terms` and never reaches here.
   */
  if (mustAgree && terms) {
    const sent = view?.submitted ?? 0;
    if (withdrawn && sent > 0) {
      return (
        <main data-testid="take-withdrawn" style={page}>
          <div style={card}>
            <h1 style={brand}>BalanceVid</h1>
            {/*
              * THE RECORD'S OWN WORDS, AND NOT A SECOND COPY OF
              * THEM. `consentSays` is the one sentence this
              * product has for what a record means, and the first
              * draft of this screen wrote its own — which is two
              * places to keep a promise in step and one of them
              * out of sight of the model. [D-19]
              */}
            <p className="small" data-testid="take-consent-says"
               style={{ maxWidth: 340, textAlign: 'center' }}>
              {consentSays(view?.consent)}
            </p>
            {/*
              * AND WHAT WAS AGREED, WHICH THE SENTENCE ABOVE NO
              * LONGER SAYS once it has been taken back. Somebody
              * reading this screen is entitled to the record, not
              * only to its conclusion: these were the permissions,
              * this is the day they were given.
              */}
            {view?.consent && (
              <p className="small muted" style={{
                maxWidth: 340, textAlign: 'center', margin: 0,
              }}>
                Agreed on {view.consent.at.slice(0, 10)}
                {': '}
                {view.consent.permits.join(', ')}. Taken back
                on {view.consent.withdrawnAt?.slice(0, 10)}.
              </p>
            )}
          </div>
        </main>
      );
    }
    return (
      <main data-testid="take-consent" style={page}>
        <div style={card}>
          <h1 style={brand}>BalanceVid</h1>
          <p style={{
            margin: 0, fontSize: 'var(--text-lg)',
            fontWeight: 'var(--weight-bold)', textAlign: 'center',
          }}>Before you record</p>
          {withdrawn && (
            <p className="small muted" data-testid="take-consent-again"
               style={{ margin: 0, textAlign: 'center', maxWidth: 340 }}>
              You took this back. You can agree again if you want to.
            </p>
          )}
          {/*
            * THE WORDS THEMSELVES, WHOLE AND SCROLLABLE. Not a
            * summary and not a link: the hash that is about to be
            * recorded is the hash of exactly this text, and a
            * person who agreed to a summary agreed to a summary.
            */}
          {/*
            * NO HEIGHT CAP, AND THE FIRST DRAFT HAD ONE.
            *
            * A SCREENSHOT DECIDED IT. The box was 260px with
            * `overflow-y: auto`, and on a Pixel the terms ended
            * mid-word — *"nothing further will be done with your
            * vide"* — with no scrollbar drawn and no edge to
            * suggest one. A phone draws no scrollbar until you
            * touch it, so what a person saw was a sentence that
            * stopped. The words are the thing this screen is for;
            * they get the page, and the ticks and the button are
            * below them, which is the order somebody reads in.
            */}
          <div data-testid="take-terms" style={{
            width: '100%',
            padding: 'var(--space-3)', border: '1px solid var(--line)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--console-control)',
            fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap',
            lineHeight: 1.5, color: 'var(--ink-100)',
          }}>{terms.text}</div>

          <ul style={{
            listStyle: 'none', margin: 0, padding: 0, width: '100%',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            {CONSENT_SCOPES.map((scope) => (
              <li key={scope}>
                <label className="row" data-testid={`take-scope-${scope}`}
                       style={{
                         gap: 10, alignItems: 'center', padding: '9px 10px',
                         border: '1px solid var(--line)',
                         borderRadius: 'var(--radius-sm)',
                         background: 'var(--console-control)', cursor: 'pointer',
                       }}>
                  <input
                    type="checkbox" checked={agreed.includes(scope)}
                    onChange={(event) => setAgreed((was) => (event.target.checked
                      ? [...was, scope] : was.filter((one) => one !== scope)))}
                    style={{ width: 20, height: 20, flex: 'none' }}
                  />
                  {/*
                    * `flex: 1` AND `minWidth: 0`, BECAUSE `.row`
                    * WRAPS. Without them the longest of the four
                    * sentences kept its intrinsic width, took the
                    * whole flex line and dropped BELOW its own
                    * checkbox — one row in four drawn differently
                    * from the other three, which on a list of
                    * permissions reads as a different kind of
                    * question. Found in the screenshot.
                    */}
                  <span style={{
                    flex: 1, minWidth: 0, fontSize: 'var(--text-sm)',
                  }}>
                    {CONSENT_MEANS[scope]}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {/*
            * THE BUTTON IS DEAD UNTIL THE FIRST ONE IS TICKED, and
            * it says why rather than simply refusing. Entering is
            * the act; the other three are about what happens to the
            * work afterwards and may all be left alone.
            */}
          <button className="ctl lg primary" data-testid="take-agree"
                  style={wide}
                  disabled={signing || !agreed.includes('entry')}
                  onClick={() => void sign()}>
            {signing ? 'Saving…' : 'I agree'}
          </button>
          {!agreed.includes('entry') && (
            <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>
              The first one is what entering means. Without it there is
              nothing to take part in.
            </p>
          )}
          {said && (
            <p className="small" data-testid="take-consent-said"
               style={{ margin: 0, textAlign: 'center', color: 'var(--ink-on-bad)' }}>
              {said}
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <div className="tk-page" data-testid="take-app">
      {/*
        * AN IDENT, NOT A WORDMARK.  [N-4, applied here]
        *
        * The page opened with the product's name centred in
        * letter-spaced caps over the ask, which is a title card.
        * The same mark the Take home and Go carry, so somebody
        * who arrived from either one is plainly still in the
        * same place.
        */}
      <header className="tk-bar">
        <a href="/take" className="tk-ident">
          <span aria-hidden="true" className="tk-ident-mark">
            <Icon name="mic" size={16} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span className="tk-ident-name">BalanceVid</span>
            <span className="tk-ident-says">Recording</span>
          </span>
        </a>
      </header>
      <main className="tk-stage">

        {/*
          * WHAT HAPPENED, WHERE ANYTHING HAS.  [GO-VIRAL V-7]
          *
          * ABOVE THE CAMERA AND BEFORE THE ASK, because somebody
          * reopening a link after a week is coming back for this
          * and not to record again. Absent until there is
          * something to say, which is every open request.
          */}
        {outcome && (
          <div data-testid="take-outcome" data-state={outcome.state}
               style={{
                 width: '100%', padding: 'var(--space-3)',
                 border: '1px solid var(--line)',
                 borderRadius: 'var(--radius-sm)',
                 background: 'var(--console-control)', textAlign: 'center',
               }}>
            <p style={{ margin: 0, fontWeight: 'var(--weight-semi)' }}>
              {outcome.says}
            </p>
          </div>
        )}

        {/* WHAT IS BEING ASKED, in the producer's own words. [T3] */}
        {/*
          * THE ASK READS AS A SENTENCE, NOT A TITLE CARD. It was
          * letter-spaced uppercase and centred — which is how a
          * film's opening credit is set, and this is an
          * instruction somebody has to follow. [T3]
          */}
        <p data-testid="take-title" className="tk-ask">
          {reference?.title ?? (view ? asksFor(view.assignment.kind) : '…')}
        </p>
        <p data-testid="take-asks" className="tk-ask-said">
          {view?.assignment.asks ?? ''}
        </p>

        {/*
          * WHICH TAKE THIS IS, COUNTING THE ONES ALREADY SENT.
          *   [TAKE-APP T4; GO-VIRAL V-7]
          *
          * `submitted` is the server's count and `kept` is this
          * visit's — and the two must not overlap, so only the
          * recordings that have NOT been sent are added. A take
          * sent a moment ago moves from one to the other when
          * the view is refreshed above.
          */}
        <p data-testid="take-number" className="small muted" style={{ margin: 0 }}>
          {reference ? 'Take' : 'Answer'}{' '}
          {(view?.submitted ?? 0)
            + kept.filter((one) => one.state === 'kept' || one.state === 'sending').length
            + 1}
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

        {/*
          * THE TWO THINGS TO SET BEFORE RECORDING, AND ONLY BEFORE.
          *   [T3; U-19]
          *
          * A phone has a front camera and a back one, and which is
          * right depends entirely on whether the performer is
          * singing to the phone or filming the room. Nothing here
          * used to ask.
          *
          * SHOWN ONLY WHILE THEY STILL MATTER. Once the count-in has
          * started, changing the camera would reopen the stream
          * mid-take — so these are gone from the moment recording
          * begins, rather than present and refusing.
          *
          * AND THE CAMERA LIST IS ONLY REAL AFTER PERMISSION. Before
          * that the browser answers with unnamed entries, so the
          * picker waits for `named` rather than offering a menu of
          * "Camera 1, Camera 2". [useDevices]
          */}
        {!soundOnly
          && (recording.phase === 'idle' || recording.phase === 'ready') && (
          /*
            * SHUT UNTIL IT IS ASKED FOR.  [D-04, U-19]
            *
            * A camera picker, a quality picker and a sentence
            * about megabytes a minute stood between the
            * viewfinder and the only button on the page, so on
            * a 390x844 phone *Turn the camera on* was at the
            * very bottom of the screen — measured in a
            * screenshot. Almost nobody changes either setting,
            * and the one who does will look for them.
            */
          <details data-testid="take-setup" className="tk-setup">
            <summary className="tk-setup-head">
              <Icon name="faders" size={14} />
              Camera and quality
              <span className="tk-setup-now">{grade.quality.label}</span>
              <span aria-hidden="true" className="tk-setup-mark">
                <Icon name="chevron" size={14} />
              </span>
            </summary>
            <div className="tk-setup-body">
            {camera.devices.named && camera.devices.cameras.length > 1 && (
              <label className="grow" style={{ margin: 0, minWidth: 130 }}>
                <span className="module-sub">Camera</span>
                <select className="small" data-testid="take-camera-pick"
                        value={camera.cameraId ?? ''}
                        onChange={(event) => camera.chooseCamera(
                          event.target.value || undefined)}>
                  <option value="">This phone’s default</option>
                  {camera.devices.cameras.map((one) => (
                    <option key={one.deviceId} value={one.deviceId}>
                      {one.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="grow" style={{ margin: 0, minWidth: 130 }}>
              <span className="module-sub">Quality</span>
              <select className="small" data-testid="take-quality-pick"
                      value={grade.id}
                      onChange={(event) => grade.choose(
                        event.target.value as typeof grade.id)}>
                {grade.offered.map((one) => (
                  <option key={one} value={one}>{QUALITIES[one].label}</option>
                ))}
              </select>
            </label>
            {/*
              * WHAT IT COSTS, AND IN THE RIGHT UNITS.
              *
              * `needs` is the LIVE menu's sentence and talks about the
              * uplink — "about 770 kB/s up" — which is meaningless
              * under a record button. `records` is the same preset
              * described as a recording: megabytes a minute, which is
              * what a performer choosing 2160p on a phone needs to
              * know before they sing for four minutes. [U-19]
              */}
            <p className="small muted" style={{ margin: 0, width: '100%' }}>
              {grade.quality.records}
            </p>
            {camera.lost && (
              <p className="small" data-testid="take-camera-lost"
                 style={{ margin: 0, width: '100%', color: 'var(--ink-on-bad)' }}>
                {camera.lost} is no longer connected — using the default.
              </p>
            )}
            </div>
          </details>
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
                  * WHAT IS STILL GOING UP, WHERE THEY CAN SEE IT.
                  *
                  * A performer who presses Send and is told "still
                  * uploading 3 parts" has been given a fact. One who
                  * is told nothing, waits, and presses again has been
                  * given a broken button — and the version of this
                  * page before the queue simply sent whatever had
                  * arrived, so a take could be short and nobody knew.
                  * [T5, U-19]
                  */}
                {/*
                  * AND NOT ONCE IT IS SENT.
                  *
                  * A screenshot of the recovered phone read "↑ 1
                  * Sent" — a count of segments still on their way
                  * beside a take that had demonstrably arrived
                  * complete. The poll stops when nothing is
                  * undecided, so the last snapshot it took was
                  * left on screen next to the word that
                  * contradicts it. A stale number is worse than
                  * no number: this one said the take was short.
                  */}
                {(one.state === 'kept' || one.state === 'sending')
                  && outstanding[one.id]?.dead ? (
                  <span data-testid="take-broken" className="small"
                        title="Those parts cannot be uploaded. Record it again."
                        style={{ color: 'var(--bad)' }}>
                    {outstanding[one.id]!.dead} lost
                  </span>
                ) : (one.state === 'kept' || one.state === 'sending')
                  && outstanding[one.id]?.left ? (
                  <span data-testid="take-uploading" className="small muted">
                    ↑ {outstanding[one.id]!.left}
                  </span>
                ) : null}
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

        {/*
          * LAST, AND NOT FIRST.  [T2c, U-19]
          *
          * A performer who opened a link wants to record, not to
          * install something. The offer sits under the thing they
          * came for and renders nothing at all where there is nothing
          * to install or where they have already installed it — which
          * is most of the time, on most machines.
          */}
        {/*
          * AND THE WAY BACK OUT.  [GO-VIRAL V-3; D-03]
          *
          * LAST, UNDER EVERYTHING, AND NOT HIDDEN. *"Revocable"* is
          * a property of the consent, not of the paperwork: a
          * performer who changes their mind halfway through the
          * week has to be able to say so from the same page they
          * said yes on. It is a quiet control because it is not
          * what they came for, and it is present because it is
          * theirs.
          */}
        {/*
          * AND A WAY TO BE TOLD WITHOUT BEING KNOWN.
          *   [GO-VIRAL V-7; D-03]
          *
          * NO ACCOUNT, NO ADDRESS, NO IDENTITY. The link is
          * already on this device; pressing this writes it into
          * the device's own store beside the upload queue and
          * asks the browser for permission to show a
          * notification. Nothing is sent to the installation and
          * the installation holds nothing about this phone.
          *
          * A REFUSAL COSTS THE NOTIFICATION AND NOTHING ELSE.
          * The device goes on watching either way, and the
          * sentence above appears the next time the link is
          * opened — which is what happens today and remains
          * correct.
          *
          * OFFERED ONLY WHERE THERE IS SOMETHING TO WAIT FOR. A
          * request nobody has sent anything to has no news
          * coming; `submitted` is the moment this becomes a
          * sensible thing to press.
          */}
        {(view?.submitted ?? 0) > 0 && (
          waiting ? (
            <div style={{ width: '100%', textAlign: 'center' }}>
              <p className="small muted" data-testid="take-waiting"
                 style={{ margin: 0 }}>
                {told ?? 'You will be told here when there is news.'}
              </p>
              <button className="ctl sm" data-testid="take-unwatch"
                      style={{ marginTop: 6 }}
                      onClick={() => void (async () => {
                        await stopWatching(link);
                        setWaiting(false);
                        setTold(null);
                      })()}>
                Stop waiting
              </button>
            </div>
          ) : (
            <button className="ctl" data-testid="take-tell-me"
                    style={{ ...wide, minHeight: 40 }}
                    title="Nothing is sent anywhere — this phone asks, using the link it already has"
                    onClick={() => void (async () => {
                      const answer = await askToBeTold(
                        link, view?.outcome?.state ?? 'waiting');
                      setWaiting(true);
                      setTold(answer === 'granted'
                        ? 'This phone will tell you when there is news.'
                        : 'No notifications — you will see it here when you '
                          + 'open this link.');
                    })()}>
              Tell me when there is news
            </button>
          )
        )}

        {view?.consent && !view.consent.withdrawnAt && (
          <>
            {/* What is on record, in the record's own sentence. */}
            <p className="small muted" data-testid="take-consent-says"
               style={{ margin: 0, textAlign: 'center', maxWidth: 340 }}>
              {consentSays(view.consent)}
            </p>
            <button className="ctl" data-testid="take-withdraw"
                    style={{ ...wide, minHeight: 40 }}
                    title="Stops anything further being done with what you sent"
                    onClick={() => void withdraw()}>
              Take back my agreement
            </button>
          </>
        )}

        <InstallBar />
      </main>
    </div>
  );
}

/*
 * A PHONE PAGE, NOT A DESK. One column, generous targets, and nothing
 * that assumes a pointer — this is opened standing up, in a room,
 * holding the thing it is recording with.
 */
/*
 * NOT `className="shell"`, WHICH IS THE EDITOR'S FRAME.
 *   [GO-VIRAL V-8; U-19]
 *
 * `.shell` is `height: 100dvh; overflow: hidden` with a three-row
 * grid, because *"a workspace is not a document… the page itself
 * never scrolls."* That is right for the studio and wrong for
 * every page here: a take page on a 390x844 phone measured 892
 * pixels of content inside an 844-pixel box that could not
 * scroll, so forty-eight pixels were simply unreachable — and on
 * a shorter phone, or once recording adds controls, the primary
 * button goes with them. Found by measuring a screenshot that
 * looked merely cropped.
 *
 * NOTHING WAS GAINED BY IT EITHER. The only other thing `.shell`
 * carries is the console treatment for `.panel`, and no page in
 * the Take App draws one.
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
