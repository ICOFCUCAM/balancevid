'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Performance } from '../../../src/domain/performance.js';
import { MASTER_CLASSES, SPACES, mayPublish } from '../../../src/domain/performance.js';
import { EFFECT_LOOKS, SPACES_ARE_DRAWN } from '../../../src/domain/environment.js';
import { describeCalibration } from '../../../src/domain/calibration.js';
import { describeDrift } from '../../../src/domain/drift.js';
import { HOUSE_SAMPLE_RATE, formatMasterPosition } from '../../../src/domain/time.js';
import { useMasterRecording } from './useMasterRecording.js';
import UploadTake from './UploadTake.js';
import SwitchingStage from './SwitchingStage.js';
import MasterRender from './MasterRender.js';
import RoomPlate from './RoomPlate.js';
import { useCalibration } from './useCalibration.js';
import SoundModes from './SoundModes.js';
import PublishPanel from './PublishPanel.js';

/**
 * The Performance Studio.  [Doctrine STUDIO-TWO §1, §3, §4, §10, §13]
 *
 * One song. One master timeline. Many performances.
 *
 * Choose the music, record against it again and again, direct which take is
 * on screen at each moment, then make one video out of the lot. Each of those
 * rests on the one before it, and all of them rest on a take landing exactly
 * where the document says it does — which is why alignment was built first and
 * why nothing here ever moves the song.
 */

/** A musical lead-in, so nobody sings from a standing start. [S-10] */
const COUNT_IN_SECONDS = 4;

/**
 * How many takes the rail shows before there are any. [§2]
 *
 * Five, because the brief names five — living room, studio, beach, stage,
 * landscape — and because the transport's number keys start at one. An empty
 * slot is not decoration; it is the shape of the work, stated before the work
 * exists.
 */
const TAKE_SLOTS = 5;

const CLASS_LABELS: Record<string, { label: string; hint: string }> = {
  own: { label: 'I made this', hint: 'Your own recording or composition' },
  licensed: { label: 'I have a licence', hint: 'A sync licence, or a licensed library track' },
  open: { label: 'Openly licensed', hint: 'Public domain, or a licence that permits this' },
  third_party: {
    label: "Somebody else's",
    hint: 'Perform and export privately. Publishing needs rights you have.',
  },
};

export default function PerformanceStudio({ initial }: { initial: Performance }) {
  const [performance, setPerformance] = useState(initial);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [environment, setEnvironment] = useState('original');
  const [busy, setBusy] = useState(false);
  /**
   * Which take the composition panel is editing.
   *
   * Held here, not in the directing surface, because choosing one is
   * something you do in the takes rail and the rail is rendered here. It is
   * handed down so both point at the same take. [§2, §5]
   */
  const [chosenTake, setChosenTake] = useState<string | null>(null);

  const id = performance.id;
  const ready = performance.master.durationSamples > 0;
  /** A room has been measured, so a matte can be made. [§4, S-6, INV-16] */
  const measured = performance.plates.length > 0;

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/performances/${id}`, { cache: 'no-store' });
    if (response.ok) setPerformance((await response.json()).performance);
  }, [id]);

  /* The song is still being decoded when the studio first opens. */
  useEffect(() => {
    if (ready) return;
    const timer = setInterval(() => { void refresh(); }, 1500);
    return () => clearInterval(timer);
  }, [ready, refresh]);

  /**
   * What the worker found once the take landed.
   *
   * The leakage warning is the important one and it is shown while the author
   * is still in the room to do something about it: a finished video carrying
   * the backing track twice has a phasing artefact that cannot be removed
   * afterwards, and the answer is headphones. [§10, S-3]
   */
  const watchJob = useCallback(async (jobId: string) => {
    for (let i = 0; i < 120; i += 1) {
      await new Promise((r) => setTimeout(r, 1000));
      const response = await fetch(`/api/performances/${id}`, { cache: 'no-store' });
      if (!response.ok) continue;
      const data = await response.json();
      setPerformance(data.performance);
      const job = (data.jobs ?? []).find((j: any) => j.id === jobId);
      if (!job || job.state === 'pending' || job.state === 'running') continue;
      if (job.state === 'failed') { setWarning(job.error ?? 'that take could not be assembled'); return; }
      /*
       * A device that recorded at a rate it did not claim ruins every take it
       * makes, and no offset or ratio rescues it. Said first, because it is
       * the only one of these the author can do something about. [§10, S-3]
       */
      if (typeof job.result?.captureRatePercent === 'number') {
        setWarning(
          `This device produced ${Math.abs(job.result.captureRatePercent)}% `
          + `${job.result.captureRatePercent < 0 ? 'less' : 'more'} audio than the `
          + 'time it ran for, which means it is not recording at the rate it says. '
          + 'The take is kept, but it will not line up. Try a different microphone '
          + 'or input device.');
        return;
      }
      if (job.result?.masterAudible) {
        setWarning(
          'The song is coming out of your speakers and into your microphone. '
          + 'The take is aligned precisely — but the finished video will carry '
          + 'the backing track twice, slightly apart, and that cannot be removed '
          + 'later. Use headphones for the next one.');
      } else {
        setNotice(`Take placed at ${formatMasterPosition(
          Number(job.result?.offsetSamples ?? 0))} on the song.`);
      }
      return;
    }
  }, [id]);

  /*
   * What this device adds, measured once and remembered by this browser.
   * Zero until it has been, and zero is honest: the browser's clock alone is
   * usually within a few hundredths of a second, and saying so beats
   * pretending a number nobody measured. [§10, S-3]
   */
  const device = useCalibration();
  const latencySamples = device.calibration?.confident
    ? device.calibration.latencySamples : 0;

  const recording = useMasterRecording({
    performanceId: id,
    masterUrl: `/api/performances/${id}/master`,
    sampleRate: HOUSE_SAMPLE_RATE,
    countInSeconds: COUNT_IN_SECONDS,
    latencySamples,
    onFinished: (jobId) => { void watchJob(jobId); },
  });

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/performances/${id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'that did not work');
      setPerformance(data.performance);
      setWarning(null);
    } catch (e) {
      setWarning(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const songLength = formatMasterPosition(performance.master.durationSamples);

  return (
    <div className="shell">
      <header className="shell-bar">
        <div style={{ minWidth: 0, maxWidth: 340 }}>
          <h1 style={{ fontSize: 17, margin: 0, whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis' }}>{performance.title}</h1>
          <div className="small muted" data-testid="master-summary">
            {performance.master.title}
            {performance.master.artist ? ` · ${performance.master.artist}` : ''}
            {ready ? ` · ${songLength}` : ' · preparing…'}
            {` · ${performance.takes.length} `}
            {performance.takes.length === 1 ? 'take' : 'takes'}
          </div>
        </div>
        {/*
          * THE PLACES THERE ARE.  [§1]
          *
          * The benchmark's bar reads Conversations / Studio One / Studio Two
          * / Library / Publish. Two of those have nowhere to go: there is no
          * library page, and Studio One is a particular conversation rather
          * than a place — you reach one from the list. A tab that goes
          * nowhere is a menu that lies, which is the same rule that keeps
          * unmeasured spaces out of the environment picker (INV-16).
          *
          * So: where you came from, where you are, and the one thing at the
          * end of this studio that the bar can actually take you to.
          */}
        <nav className="row" data-testid="studio-nav"
             style={{ gap: 4, flexWrap: 'nowrap' }}>
          <a className="btn small" href="/" style={{ padding: '6px 12px' }}>
            Conversations
          </a>
          <span className="btn small" aria-current="page" style={{
            padding: '6px 12px', cursor: 'default',
            borderColor: '#3d7fd6', background: 'rgba(45,110,200,0.18)',
          }}>
            Studio Two
          </span>
          <button
            className="small" data-testid="to-publish" style={{ padding: '6px 12px' }}
            disabled={performance.scenes.length === 0}
            onClick={() => document.querySelector('[data-testid="publish"]')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            Publish
          </button>
        </nav>
        <span className="grow" />
        <a className="btn small" href="/" style={{ padding: '6px 12px' }}>Leave</a>
      </header>

      {/*
        * ONE GRID, not a grid inside a grid.
        *
        * The takes rail, the stage and the composition panel are three
        * columns of one row, and the timeline runs underneath all three. A
        * rail in its own outer grid cannot share a row with panels that live
        * in an inner one, and a timeline nested in a middle column cannot
        * span the width — which is what it did when this was two columns.
        *
        * So the rail is handed to the directing surface and placed by it.
        */}
      <div className="shell-body shell-scroll" style={{ padding: '14px 18px' }}>
        <SwitchingStage
          performance={performance}
          onChanged={setPerformance}
          chosenTake={chosenTake}
          onChooseTake={setChosenTake}
          takesPanel={(
            <div className="panel" data-testid="takes" style={{
              minWidth: 0, padding: 10, display: 'flex',
              flexDirection: 'column', gap: 8,
            }}>
              {/*
                * THE TAKES COLUMN.  [Doctrine STUDIO-TWO §2, §5, §7]
                *
                * "Take 1 — Living room. Take 2 — Virtual recording studio.
                *  Take 3 — Beach. Take 4 — Concert stage. Take 5 — Outdoor
                *  landscape. All five are synchronized to the same song."
                *
                * So the column is FIVE SLOTS, filled or not. An empty studio
                * that shows a sentence saying there is nothing here tells you
                * what you already know; five numbered slots tell you what the
                * work is — and the numbers are the keys you will press in the
                * transport to direct with them, so the rail and the keyboard
                * agree before there is anything to press.
                *
                * More than five takes is fine and the column grows. Fewer
                * than five still shows five, because the shape of a
                * performance does not depend on how much of it exists yet.
                */}
              <div className="row" style={{
                justifyContent: 'space-between', alignItems: 'baseline',
              }}>
                <span className="small muted" style={{
                  textTransform: 'uppercase', letterSpacing: 0.8,
                  fontSize: 11, fontWeight: 700,
                }}>Takes</span>
                <span className="small muted" data-testid="take-count"
                      style={{ fontSize: 11 }}>
                  {performance.takes.length} of {Math.max(TAKE_SLOTS, performance.takes.length)}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Array.from(
                  { length: Math.max(TAKE_SLOTS, performance.takes.length) },
                  (_unused, slot) => {
                    const take = performance.takes[slot];
                    if (!take) {
                      return (
                        <div key={`empty-${slot}`} data-testid="take-slot"
                             data-filled="false"
                             style={{
                               display: 'flex', gap: 8, alignItems: 'center',
                               padding: 5, borderRadius: 8, minHeight: 42,
                               border: '1px dashed var(--line)', opacity: 0.55,
                             }}>
                          <span className="small muted" aria-hidden="true" style={{
                            width: 22, height: 22, borderRadius: 6, flex: '0 0 auto',
                            display: 'grid', placeItems: 'center', fontSize: 11,
                            border: '1px dashed var(--line)',
                          }}>{slot + 1}</span>
                          <span className="small muted" style={{ fontSize: 11 }}>
                            Empty — record or upload
                          </span>
                        </div>
                      );
                    }
                    const placed = take.alignment.method !== 'unplaced';
                    const where = take.environment.kind === 'space'
                      ? SPACES.find((sp) => sp.id === take.environment.spaceId)?.label
                        ?? 'a space'
                      : take.environment.kind === 'blur' ? 'Blurred'
                        : 'Original';
                    /*
                     * The number is the KEY, so it is the position among the
                     * takes that can actually go on screen — not the position
                     * in the list. A take still assembling has no key, and
                     * printing one next to it would be an instruction that
                     * does nothing when followed.
                     */
                    const key = take.durationSamples > 0
                      ? performance.takes.filter((t) => t.durationSamples > 0)
                        .findIndex((t) => t.id === take.id) + 1
                      : null;
                    const chosen = chosenTake === take.id;
                    return (
                      <button
                        key={take.id} type="button"
                        data-testid="take-row" data-take-id={take.id}
                        data-slot={slot + 1} data-filled="true"
                        data-offset={take.alignment.offsetSamples}
                        onClick={() => setChosenTake(take.id)}
                        style={{
                          display: 'flex', gap: 8, alignItems: 'center', width: '100%',
                          padding: 5, borderRadius: 8, textAlign: 'left',
                          font: 'inherit', color: 'inherit', cursor: 'pointer',
                          background: chosen ? 'rgba(45,110,200,0.16)' : 'var(--panel-2)',
                          border: `1px solid ${chosen
                            ? (take.accent ?? '#3d7fd6') : 'var(--line)'}`,
                        }}
                      >
                        {/* The key, in the take's own colour — the same colour
                            the stage badge, the timeline lane and every block
                            of the master video carry. */}
                        <span aria-hidden="true" style={{
                          width: 22, height: 22, borderRadius: 6, flex: '0 0 auto',
                          display: 'grid', placeItems: 'center',
                          fontSize: 12, fontWeight: 700, color: '#0a0c10',
                          background: take.accent ?? '#3e7ca6',
                          opacity: key ? 1 : 0.4,
                        }}>{key ?? '·'}</span>
                        {/*
                          * A background rather than an <img>: a take assembled
                          * before posters existed has none, and a background
                          * that 404s shows the colour underneath while an
                          * <img> shows a broken icon.
                          */}
                        <span
                          data-testid="take-poster" aria-hidden="true"
                          style={{
                            flex: '0 0 auto', width: 52, height: 30, borderRadius: 4,
                            backgroundColor: `${take.accent ?? '#3e7ca6'}33`,
                            backgroundImage: `url(/api/performances/${performance.id}`
                              + `/takes/${take.id}/media?kind=poster)`,
                            backgroundSize: 'cover', backgroundPosition: 'center',
                            border: `1px solid ${take.accent ?? 'var(--line)'}`,
                          }}
                        />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{
                            fontWeight: 600, fontSize: 13, display: 'block',
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>{take.label}</span>
                          <span className="small muted"
                                style={{ fontSize: 11, display: 'block' }}>
                            {placed ? where : 'not placed yet'}
                          </span>
                        </span>
                        <span className="small muted" style={{
                          flex: '0 0 auto', fontSize: 11,
                          fontFamily: 'ui-monospace, monospace',
                        }}>
                          {take.durationSamples > 0
                            ? formatMasterPosition(take.durationSamples).slice(0, 5)
                            : '…'}
                        </span>
                      </button>
                    );
                  },
                )}
              </div>

              {/*
                * HOW A SLOT GETS FILLED, under the slots.
                *
                * Recording used to be inside the Set up fold, which said a
                * take is something you arrange once. It is the thing you do
                * five times. Uploading sits beside it because a take filmed
                * on a real camera is still a take. [§2, §10]
                */}
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                  <section data-testid="record" style={{ marginTop: 4 }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <video
                ref={recording.videoRef} autoPlay muted playsInline
                data-testid="performer-camera"
                style={{
                  width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 8,
                  border: `2px solid ${recording.phase === 'recording' ? '#e0674f' : 'var(--line)'}`,
                  background: '#0d1319',
                  display: recording.stream ? 'block' : 'none',
                }}
              />
              <div style={{ minWidth: 0 }}>
                {recording.phase === 'idle' && (
                  /*
                    * Two ways to fill a slot, side by side, because they are
                    * the same decision: this take comes from this camera, or
                    * from a file. Stacked they read as a step and an
                    * afterthought. [§2, §10]
                    */
                  <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                    <button className="primary" data-testid="arm" disabled={!ready}
                            title={'Opens the camera and loads the song into '
                              + 'your headphones, ready to record.'}
                            onClick={() => void recording.arm()}
                            style={{ flex: '1 1 0', minWidth: 0, padding: '7px 8px' }}>
                      {ready ? 'Record a take' : 'Preparing…'}
                    </button>
                    <UploadTake
                      compact
                      performanceId={performance.id}
                      environment={{
                        kind: environment.startsWith('space:') ? 'space' : environment,
                        ...(environment.startsWith('space:')
                          ? { spaceId: environment.slice(6) } : {}),
                      }}
                      onFinished={(jobId) => { void watchJob(jobId); }}
                    />
                  </div>
                )}
                {recording.phase === 'arming' && <div className="small muted">Loading…</div>}

                {(recording.phase === 'ready' || recording.phase === 'finishing') && (
                  <>
                    <div className="field" style={{ maxWidth: '100%' }}>
                      <label htmlFor="take-label">Call this take</label>
                      <input id="take-label" data-testid="take-label" value={label}
                             placeholder={`Take ${performance.takes.length + 1}`}
                             onChange={(e) => setLabel(e.target.value)} />
                    </div>
                    <div className="field" style={{ maxWidth: '100%' }}>
                      <label htmlFor="take-space">Where it should look like</label>
                      <select id="take-space" data-testid="take-environment" value={environment}
                              onChange={(e) => setEnvironment(e.target.value)}>
                        <option value="original">The room you are in</option>
                        {/* Anything else needs a plate, and a menu that offers
                            what it cannot do is a menu that lies. [§4, INV-16] */}
                        {measured && <option value="blur">The room you are in, softened</option>}
                        {measured && SPACES.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                      <span className="small muted" style={{ fontSize: 11 }}>
                        {measured
                          /* The recording is kept whatever this says. [§4, S-6] */
                          ? 'Stored with the take, not burned into it — you can change '
                            + 'it afterwards without singing the song again.'
                          : 'Measure your room below to put yourself anywhere else.'}
                      </span>
                    </div>
                    <button
                      className="primary" data-testid="start-take"
                      disabled={recording.phase === 'finishing'}
                      onClick={() => void recording.start(label, environment === 'original'
                        ? { kind: 'original' }
                        : environment === 'blur'
                          ? { kind: 'blur' }
                          : { kind: 'space', spaceId: environment })}
                    >
                      {recording.phase === 'finishing' ? 'Saving…' : 'Record a take'}
                    </button>
                    <button className="small" data-testid="disarm"
                            onClick={recording.disarm} style={{ marginLeft: 8 }}>
                      Turn off
                    </button>
                  </>
                )}

                {recording.phase === 'counting' && (
                  <div data-testid="count-in" style={{ fontWeight: 600, fontSize: 18 }}>
                    Get ready…
                  </div>
                )}

                {recording.phase === 'recording' && (
                  <>
                    <div data-testid="recording-now"
                         style={{ fontWeight: 600, color: '#e0674f', fontSize: 16 }}>
                      Recording · {formatMasterPosition(
                        Math.round(recording.position * HOUSE_SAMPLE_RATE))} of {songLength}
                    </div>
                    <button className="primary" data-testid="stop-take"
                            onClick={recording.stop} style={{ marginTop: 8 }}>
                      Stop
                    </button>
                  </>
                )}

                {recording.error && (
                  <p className="small" style={{ color: 'var(--bad)' }}>{recording.error}</p>
                )}
              </div>
            </div>
                  </section>
                {/* The one line that decides whether a take is usable: a song
                    playing out loud is recorded twice. [§9, S-7] */}
                <p className="small muted" style={{ margin: '6px 0 0', fontSize: 11 }}>
                  Wear headphones — a song out loud goes into the microphone with
                  your voice.
                </p>
              </div>
            </div>
          )}
        />


        {/* ---- where the sound comes from (§9, S-7) ------------------ */}
        {performance.takes.some((t) => t.durationSamples > 0)
          && <SoundModes performance={performance} onChanged={setPerformance} />}

        {/* ---- one video, when they are ready (§14) ------------------ */}
        {performance.takes.some((t) => t.durationSamples > 0)
          && <MasterRender performance={performance} />}

        {/* ---- the short one, and the link preview (§14) -------------- */}
        {performance.scenes.length > 0
          && <PublishPanel performance={performance} onChanged={setPerformance} />}
        {/*
          * Setting up: done once, then never again. Open by default until
          * there is a take, because an empty studio's only useful action is
          * in here — and folded once there is, because a rail is for what you
          * have made.
          */}
        <details data-testid="setup" open={performance.takes.length === 0}
                 style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Set up
          </summary>
        {/* ---- what may be done with this music ---------------------- */}
        <section className="panel" data-testid="master-rights" style={{ padding: 12 }}>
          <div className="small muted" style={{ textTransform: 'uppercase',
            letterSpacing: 0.8, fontSize: 11, marginBottom: 6 }}>
            This music
          </div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {MASTER_CLASSES.map((cls) => (
              <button
                key={cls}
                className="small"
                data-testid="master-class"
                data-class={cls}
                data-chosen={performance.master.class === cls ? 'true' : 'false'}
                disabled={busy}
                title={CLASS_LABELS[cls]!.hint}
                onClick={() => void act({
                  action: 'classify-master', class: cls,
                  licence: performance.master.licence ?? null,
                })}
                style={{
                  padding: '5px 10px', fontSize: 12,
                  background: performance.master.class === cls
                    ? 'rgba(43,95,138,0.30)' : undefined,
                  borderColor: performance.master.class === cls ? '#6fb3e0' : undefined,
                }}
              >
                {CLASS_LABELS[cls]!.label}
              </button>
            ))}
          </div>
          <p className="small muted" data-testid="publish-posture"
             style={{ marginTop: 6, marginBottom: 0, maxWidth: 640 }}>
            {mayPublish(performance.master)
              ? CLASS_LABELS[performance.master.class]!.hint
              : 'You can perform, export and keep this privately. Publishing it from '
                + 'here needs music you own, hold a licence for, or that is openly '
                + 'licensed — performing over a commercial recording is not something '
                + 'this product can put your name to.'}
          </p>
        </section>
        {/* ---- what this device adds (§10, S-3) ---------------------- */}
        <section className="panel" data-testid="calibration"
                 data-latency={latencySamples}
                 style={{ padding: 12, marginTop: 16 }}>
          <div className="small muted" style={{ textTransform: 'uppercase',
            letterSpacing: 0.8, fontSize: 11, marginBottom: 6 }}>
            This device
          </div>
          <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="small" data-testid="calibrate"
              disabled={device.phase === 'listening'}
              onClick={() => void device.run()}
            >
              {device.phase === 'listening'
                ? `Listening… ${device.countdown}`
                : device.calibration ? 'Measure it again' : 'Measure the delay'}
            </button>
            {device.calibration?.confident && (
              <button className="small" data-testid="forget-calibration"
                      onClick={device.forget}>
                Forget it
              </button>
            )}
            <span className="small muted" data-testid="calibration-state"
                  style={{ maxWidth: 460 }}>
              {describeCalibration(device.calibration)}
            </span>
          </div>
          <p className="small muted" style={{ fontSize: 11, marginTop: 6,
            marginBottom: 0, maxWidth: 640 }}>
            {/* The one instruction that makes the measurement possible, and the
                opposite of the one recording needs. [S-3] */}
            Take your headphones off for this one: the microphone has to hear
            the click your speakers make. Put them back on to record.
          </p>
          {device.error && (
            <p className="small" style={{ color: 'var(--bad)' }}>{device.error}</p>
          )}
        </section>
        {/* ---- the room, measured (§4, S-6) -------------------------- */}
        <RoomPlate performance={performance} stream={recording.stream}
                   onChanged={setPerformance} />

        {warning && (
          <p className="panel small" data-testid="leakage-warning"
             style={{ padding: 10, marginTop: 12, borderColor: 'var(--warn)' }}>
            {warning}
          </p>
        )}
        {notice && !warning && (
          <p className="small muted" data-testid="take-notice" style={{ marginTop: 12 }}>
            {notice}
          </p>
        )}
        </details>
      </div>
    </div>
  );
}
