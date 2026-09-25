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
        <div className="grow" style={{ minWidth: 0 }}>
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
        <a className="btn" href="/" style={{ padding: '7px 14px' }}>Leave</a>
      </header>

      {/*
        * Three panels and a timeline, which is the shape the work has.
        * [Doctrine STUDIO-TWO §2, §5, §7]
        *
        * LEFT is what you have recorded, CENTRE is what is on screen and when,
        * RIGHT is how it is set up. The same division Studio One arrived at
        * for a different job — and the reason it is a division at all is that
        * directing needs the takes and the timeline visible at once, which a
        * single scrolling column cannot do.
        *
        * The panels scroll independently so the stage and the timeline stay
        * where they are while somebody reads down a list of environments.
        */}
      <div className="shell-body" style={{
        display: 'grid', gap: 14, padding: '14px 18px', minHeight: 0,
        /*
         * TWO columns, not three. The directing surface carries its own
         * stage-and-composition split, so a third column here would be a
         * fourth panel — and the setting-up (rights, device, room) is done
         * once and then never again, which is not what a permanent column is
         * for. It folds away below.
         */
        gridTemplateColumns: 'minmax(250px, 330px) minmax(0, 1fr)',
      }}>
        <div className="shell-scroll" style={{ minWidth: 0 }}>
        {/* ---- the takes, all on one clock --------------------------- */}
        <section style={{ marginTop: 20 }} data-testid="takes">
          <h2 style={{ fontSize: 15, marginBottom: 2 }}>Takes</h2>
          {/*
            * A take is not only something recorded here. Somebody films a
            * verse on a proper camera on a beach; the product's job is to put
            * it on the song, not to tell them to perform it again into a
            * webcam. It goes through the recording path exactly, so it is
            * assembled, measured and aligned by the same code. [§2, §10]
            */}
          <UploadTake
            performanceId={performance.id}
            environment={{ kind: environment.startsWith('space:') ? 'space' : environment,
              ...(environment.startsWith('space:')
                ? { spaceId: environment.slice(6) } : {}) }}
            onFinished={(jobId) => { void watchJob(jobId); }}
          />
          {performance.takes.length === 0 ? (
            <p className="small muted" style={{ marginTop: 8 }}>
              None yet. Every take you record or upload is placed on the same
              song, so you can cut between them later.
            </p>
          ) : (
            performance.takes.map((take) => (
              <div key={take.id} className="panel" data-testid="take-row"
                   data-take-id={take.id}
                   data-offset={take.alignment.offsetSamples}
                   style={{ padding: 9, marginBottom: 7 }}>
                {/*
                  * A face, a name, and what is known about it — in a column
                  * three hundred pixels wide. The first version put the name
                  * and the timing on one row with `nowrap`, which was fine
                  * across a page and collides in a rail.
                  */}
                <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  {/*
                    * A background rather than an <img>, because a take
                    * assembled before posters existed has none — and a
                    * background that 404s shows the colour underneath, while
                    * an <img> that 404s shows a broken-image icon. An empty
                    * frame in the take's own colour is honest; a broken icon
                    * says something is wrong when nothing is.
                    */}
                  <div
                    data-testid="take-poster"
                    aria-hidden="true"
                    style={{
                      flex: '0 0 auto', width: 64, height: 36, borderRadius: 3,
                      backgroundColor: `${take.accent ?? '#3e7ca6'}33`,
                      backgroundImage:
                        `url(/api/performances/${performance.id}/takes/${take.id}/media?kind=poster)`,
                      backgroundSize: 'cover', backgroundPosition: 'center',
                      // The take's own colour, so the rail, the lane and the
                      // scene blocks are plainly about the same take. [§2]
                      border: `1px solid ${take.accent ?? 'var(--line)'}`,
                    }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontWeight: 600, display: 'block' }}>
                    {take.label}
                  </span>
                  <span className="small muted" style={{ display: 'block', fontSize: 11 }}>
                    {take.durationSamples > 0
                      ? `${take.alignment.offsetSamples < 0
                        ? 'starts just before the song'
                        : `starts at ${formatMasterPosition(take.alignment.offsetSamples)}`} · `
                        + `${formatMasterPosition(take.durationSamples)} long`
                      : 'saving…'}
                  </span>
                  </div>
                </div>
                <div className="small muted" style={{ marginTop: 3, fontSize: 11 }}>
                  {/* How it was placed, said plainly: a measurement and a
                      guess are different things. [S-3] */}
                  {take.alignment.method === 'heard'
                    ? 'placed by listening to the song in the recording'
                    : take.alignment.method === 'calibrated'
                      ? 'placed by the clock, less this device’s measured delay'
                      : take.alignment.method === 'unplaced'
                        /* Nobody has. Saying "placed by you" of a take the
                           author has never touched is the kind of small lie
                           that makes them stop believing the rest. [§10] */
                        ? 'not placed yet — drag it to where it belongs'
                        : take.alignment.method === 'manual'
                        ? 'placed by you'
                        : 'placed from your browser’s audio clock'}
                  {/* Drift, where it was measured. A ratio of exactly one is
                      not mentioned, because it is the absence of a finding
                      rather than a finding. [§10, S-3] */}
                  {describeDrift(take.alignment.rateRatio)
                    && ` · ${describeDrift(take.alignment.rateRatio)}`}
                </div>
                {/*
                  * Bedroom → Studio, afterwards and without singing it again.
                  * This select IS the promise of §4: the environment is a
                  * field, so changing it costs a re-render and nothing else.
                  */}
                <div className="row" style={{ gap: 6, marginTop: 5, alignItems: 'center' }}>
                  <label className="small muted" style={{ fontSize: 11 }}
                         htmlFor={`env-${take.id}`}>Show this take in</label>
                  <select
                    id={`env-${take.id}`} data-testid="take-environment-after"
                    data-take-id={take.id}
                    disabled={busy || (!measured && take.environment.kind === 'original')}
                    value={take.environment.kind === 'space'
                      ? take.environment.spaceId ?? 'original'
                      : take.environment.kind}
                    onChange={(e) => void act({
                      action: 'set-environment', takeId: take.id,
                      environment: e.target.value === 'original' ? { kind: 'original' }
                        : e.target.value === 'blur' ? { kind: 'blur' }
                          : { kind: 'space', spaceId: e.target.value },
                    })}
                    style={{ fontSize: 11, padding: '2px 6px', width: 'auto' }}
                  >
                    <option value="original">the room it was shot in</option>
                    {(measured || take.plateAssetId) && (
                      <option value="blur">that room, softened</option>
                    )}
                    {(measured || take.plateAssetId) && SPACES.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>

                {/*
                  * And what is done to the picture.  [§4]
                  *
                  * A separate row from the environment because they answer
                  * separate questions: one is what is behind you, the other
                  * is how the panel is lit and graded. Stored on the take
                  * like everything else here, so changing it costs nothing
                  * and re-renders rather than re-records.
                  */}
                <div className="row" style={{ gap: 6, marginTop: 4, alignItems: 'center' }}>
                  <label className="small muted" style={{ fontSize: 11 }}
                         htmlFor={`fx-${take.id}`}>Treatment</label>
                  <select
                    id={`fx-${take.id}`} data-testid="take-effect" data-take-id={take.id}
                    disabled={busy}
                    value={take.effect ?? 'none'}
                    onChange={(e) => void act({
                      action: 'set-effect', takeId: take.id,
                      effect: e.target.value === 'none' ? null : e.target.value,
                    })}
                    style={{ fontSize: 11, padding: '2px 6px', width: 'auto' }}
                  >
                    <option value="none">none</option>
                    {Object.values(EFFECT_LOOKS).map((look) => (
                      <option key={look.id} value={look.id}>{look.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))
          )}
        </section>
        </div>

        <div className="shell-scroll" style={{ minWidth: 0 }}>
        {/* ---- directing: many takes, one song (§2, §7, §8, §15) ------ */}
        {performance.takes.some((t) => t.durationSamples > 0) && (
          <section style={{ marginTop: 20 }}>
            <h2 style={{ fontSize: 15, marginBottom: 2 }}>Direct</h2>
            <p className="small muted" style={{ marginTop: 0, maxWidth: 640 }}>
              Play the song and press a number to put that take on screen. The
              song never moves — you are deciding which performance occupies
              each part of it, and you can drag the boundaries afterwards.
            </p>
            <SwitchingStage performance={performance} onChanged={setPerformance} />
          </section>
        )}
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
        {/* ---- record against it ------------------------------------- */}
        <section style={{ marginTop: 16 }} data-testid="record">
          <h2 style={{ fontSize: 15, marginBottom: 2 }}>Perform</h2>
          <p className="small muted" style={{ marginTop: 0, maxWidth: 640 }}>
            Wear headphones. If the song plays out loud it goes into your
            microphone as well as your voice, and the finished video carries
            it twice.
          </p>

          <div className="row" style={{ gap: 14, alignItems: 'flex-start', marginTop: 10 }}>
            <video
              ref={recording.videoRef} autoPlay muted playsInline
              data-testid="performer-camera"
              style={{
                width: 260, aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 8,
                border: `2px solid ${recording.phase === 'recording' ? '#e0674f' : 'var(--line)'}`,
                background: '#0d1319',
                display: recording.stream ? 'block' : 'none',
              }}
            />
            <div className="grow" style={{ minWidth: 220 }}>
              {recording.phase === 'idle' && (
                <button className="primary" data-testid="arm" disabled={!ready}
                        onClick={() => void recording.arm()}>
                  {ready ? 'Turn on camera and load the song' : 'Preparing the song…'}
                </button>
              )}
              {recording.phase === 'arming' && <div className="small muted">Loading…</div>}

              {(recording.phase === 'ready' || recording.phase === 'finishing') && (
                <>
                  <div className="field" style={{ maxWidth: 280 }}>
                    <label htmlFor="take-label">Call this take</label>
                    <input id="take-label" data-testid="take-label" value={label}
                           placeholder={`Take ${performance.takes.length + 1}`}
                           onChange={(e) => setLabel(e.target.value)} />
                  </div>
                  <div className="field" style={{ maxWidth: 280 }}>
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
    </div>
  );
}
