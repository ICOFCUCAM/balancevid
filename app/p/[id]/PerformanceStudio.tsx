'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { TAKE_ACCENT_FALLBACK } from '../../../src/domain/performance.js';
import Icon from '../../Icon.js';
import type { Performance } from '../../../src/domain/performance.js';
import { MASTER_CLASSES, SPACES, mayPublish } from '../../../src/domain/performance.js';
import { EFFECT_LOOKS, SPACES_ARE_DRAWN } from '../../../src/domain/environment.js';
import { describeCalibration } from '../../../src/domain/calibration.js';
import { describeDrift } from '../../../src/domain/drift.js';
import { HOUSE_SAMPLE_RATE, formatMasterPosition } from '../../../src/domain/time.js';
import { useConfirm } from '../../Confirm.js';
import { NO_WORKER } from '../../../src/domain/health.js';
import { useCamera } from '../../useCamera.js';
import { useQuality } from '../../useQuality.js';
import { cameraConstraints } from '../../useDevices.js';
import { QUALITIES } from '../../../src/domain/quality.js';
import { MenuButton, RightClickHint, useMenu, type MenuEntry } from '../../Menu.js';
import { useMasterRecording } from './useMasterRecording.js';
import { performanceSink } from './performanceSink.js';
import PerformersPanel from './PerformersPanel.js';
import UploadTake from './UploadTake.js';
import SwitchingStage from './SwitchingStage.js';
import Delivery, { type ChannelDestination } from './Delivery.js';
import RoomPlate from './RoomPlate.js';
import { useCalibration } from './useCalibration.js';
import { nudgeItems, nudgeSays } from './takeNudge.js';
import StudioBar from '../../StudioBar.js';
import type { StudioId } from '../../../src/domain/account.js';
import { bodyOf } from '../../../src/domain/saidBy.js';
import './studio-two.css';

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

export default function PerformanceStudio(
  { initial, studioOneId, studioThreeId, channels = [], owned }: {
    initial: Performance; studioOneId?: string; studioThreeId?: string;
    owned?: StudioId[];
    channels?: ChannelDestination[];
  },
) {
  const [performance, setPerformance] = useState(initial);
  /* The product's own dialog, in place of the browser's. [Confirm.tsx] */
  const { confirm, dialog: confirmDialog } = useConfirm();
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

  /*
   * WHETHER ANYTHING IS GOING TO DO THE WORK.  [D-13, D-21; health.ts]
   *
   * The header said "Preparing the song\u2026" until the master had been
   * measured \u2014 which is a job, and a job is run by the WORKER, a
   * separate process from this web tier. On an installation with
   * nothing draining the queue it said "Preparing" for ever, which
   * is a spinner with nothing behind it.
   */
  const [unattended, setUnattended] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/performances/${id}`, { cache: 'no-store' });
    if (!response.ok) return;
    const said = await response.json();
    setPerformance(said.performance);
    setUnattended(Boolean(said.unattended));
  }, [id]);

  /**
   * An edit to the document, and the document that came back.
   *
   * The same door the directing surface uses, for the same reason: one place
   * that writes and one place that reads the answer, so the rail and the
   * stage can never be looking at two versions of one performance.
   */
  const patch = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch(`/api/performances/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setWarning(data.error ?? 'that change was refused'); return; }
    setWarning(null);
    setPerformance(data.performance);
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
      const data = bodyOf(await response.text());
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

  /*
   * WHICH CAMERA, AND HOW GOOD A SOURCE TO KEEP.
   *   [quality.ts, useDevices, CHANNEL §23]
   *
   * THE RECORDER ASKED FOR 1280×720 AND NAMED NO CAMERA, and neither
   * was a decision anybody made: the constraint was written into the
   * hook. The render is resolution-agnostic — it takes the source's
   * own dimensions — so every master this studio has produced is
   * 720p. The author's own performance probes at 1280×720, three
   * takes, all of them.
   *
   * Online TV has had the preset and the picker since §23; this is
   * the same two controls on the path that records the performance,
   * from the same two hooks rather than a second copy. [D-19]
   */
  const camera = useCamera();
  const grade = useQuality('recording');

  const recording = useMasterRecording({
    /* One recorder, two destinations. `performanceSink` is the three
       calls that used to be written inside the hook, unchanged. [D-19] */
    sink: useMemo(() => performanceSink(id), [id]),
    masterUrl: `/api/performances/${id}/master`,
    sampleRate: HOUSE_SAMPLE_RATE,
    countInSeconds: COUNT_IN_SECONDS,
    latencySamples,
    video: cameraConstraints(
      camera.cameraId, grade.quality.width, grade.quality.height,
      grade.quality.fps),
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

  /*
   * ONE MENU FOR THE WHOLE STUDIO. The take rail had its own `<details>`
   * and nothing else in here had anything; now the rail, the song and
   * whatever comes next all raise the same list by right-click or by
   * their `⋯`. [D-19]
   */
  const { menu, onRow, fromButton } = useMenu();

  /**
   * DELETING THE SONG IS DELETING THE PERFORMANCE, and saying anything
   * else would be a lie about what the button does.
   *
   * Studio Two is one song and the takes performed over it — the song is
   * the root document, not an attachment to it, so there is no state in
   * which the song is gone and the takes remain. Until now the only way
   * to remove an uploaded song was to leave the studio, find the card on
   * the home page and delete it from there, which is a long way round for
   * the commonest mistake in this room: uploading the wrong file.
   *
   * The question names every consequence rather than the immediate one,
   * and the count of takes is in it, because "delete the song" reads as
   * far smaller than it is when you have recorded nine takes over it.
   */
  const askDeleteSong = () => {
    const takes = performance.takes.length;
    confirm({
      question: `Delete \u201c${performance.title}\u201d? The song goes, and `
        + `with it ${takes === 0 ? 'this whole performance'
          : `${takes} ${takes === 1 ? 'take' : 'takes'} recorded over it, `
            + 'every scene you have directed and every render made from '
            + 'them'}. It cannot be undone.`,
      verb: 'Delete the song',
      danger: true,
      go: () => { void deleteSong(); },
    });
  };

  const deleteSong = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/performances/${id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'that could not be deleted');
      /*
       * The studio it was showing no longer exists, so there is nowhere
       * to stay. A full navigation rather than a router push, because
       * every hook in here is holding a performance that is now gone.
       */
      window.location.href = '/';
    } catch (e) {
      setWarning(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const songItems = (): MenuEntry[] => [
    {
      label: 'Rename the song\u2026',
      onSelect: () => confirm({
        question: 'This is what the rail, the home page and the published '
          + 'page will call it. The file\u2019s own tags are left alone.',
        field: { label: 'What is this song called?', initial: performance.title },
        verb: 'Rename it',
        go: (next) => {
          if (next && next !== performance.title) {
            void act({ action: 'rename', title: next });
          }
        },
      }),
    },
    {
      label: 'Download the prepared audio',
      href: `/api/performances/${id}/master`,
      disabled: ready ? false : 'It is still being prepared',
      hint: 'The normalised master the takes were performed against',
    },
    {
      label: 'Delete the song\u2026',
      danger: true,
      disabled: busy,
      onSelect: askDeleteSong,
    },
  ];




  return (
    /*
     * THE PRODUCTION ROOM, AS THE BRIEF DRAWS IT.
     *   [STUDIO-TWO §1, §3, §4, §13]
     *
     *     TAKES → TIMELINE → MASTER
     *
     * > *"the underlying architecture is good, but visually it
     * > still feels like a developer-built editing utility, not
     * > a professional multicamera production room"*
     *
     * NOTHING BELOW IS NEW MACHINERY. The alignment, the master
     * clock, the switching, the recorder and the render queue
     * are all above this line and are not touched by it. What
     * changed is the frame.
     *
     * THE ROOM IS FIXED AND WHAT IS UNDER IT IS A DOCUMENT. The
     * brief draws one screen: a bar, three columns and a
     * timeline, and it never scrolls. This studio has more than
     * that screen holds — the camera setup, the room plate, the
     * master check, delivery and publish — and hiding any of it
     * to keep the brief's exact height would be removing
     * features to make a picture fit. So the room is the
     * brief's, at the brief's size, and the rest is a document
     * beneath it. [the brief: *"none of our features should be
     * abandoned"*]
     */
    <div className="s2">
      <div className="app">
      {confirmDialog}
      {menu}
      {/*
        * THE BAR IS THE BRIEF'S AND IT CARRIES THE APPLICATION'S.
        *
        * The brief's bar is a brand, a product name, a project
        * and three buttons. `StudioBar` is the six places every
        * studio shares, and it is how a person gets from here to
        * Studio One — a bar that replaced it would be a bar that
        * removed the way out, so it sits inside this one where
        * the brief puts its product label. [D-19, D-24]
        */}
      <header className="topbar">
      {/*
        * NO TRAILING SUMMARY ON THE SHARED BAR, because this one
        * now says it once. `StudioBar` printed the title, the
        * artist and the length; the brief's own project block
        * and status say the same three things a few pixels to
        * the right, and two readouts of one fact are two places
        * it can disagree. The brief's is the one kept — it is
        * what this bar was redrawn for — and it carries the
        * artist the old one did. [D-19]
        */}
      <StudioBar
        current="studio-two"
        studioOneId={studioOneId}
        studioThreeId={studioThreeId}
        owned={owned}
        extra={[{
          id: 'publish' as const,
          label: 'Publish',
          icon: 'upload' as const,
          ...(performance.scenes.length > 0
            ? {
              onClick: () => document.querySelector('[data-testid="publish"]')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
            }
            : { hint: 'Direct some scenes first — there is nothing to publish yet' }),
        }]}
      />

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
      {/*
        * THE PROJECT AND THE TWO THINGS THE BRIEF PUTS BESIDE
        * IT. `Create Master` is NOT one of them: that control
        * already exists, in the transport under the stage,
        * where the edit is driven from. A second button for one
        * action is two places it can go out of date, and the
        * one in the transport knows whether there is anything
        * to make. [D-19, D-21]
        */}
        <div className="project" data-testid="master-summary">
          <span className="project-dot" />
          <span>
            {performance.title}
            {performance.master.artist ? ` \u00b7 ${performance.master.artist}` : ''}
          </span>
        </div>

        <div className="top-spacer" />

        {/*
          * AND IT SAYS SO RATHER THAN SPINNING.  [D-13, D-21, U-19]
          *
          * > *"music get stuck in studio 2 and show preparing and
          * > never complete preparing"*
          *
          * It was not stuck: nothing had picked it up. The worker is
          * a separate process and on that installation none was
          * running, so the one word the room had for it was the one
          * word that could never come true. [health.ts, unattended]
          */}
        <div className="status" data-testid="s2-status"
             data-unattended={!ready && unattended ? 'yes' : 'no'}
             title={!ready && unattended ? NO_WORKER : undefined}
             style={!ready && unattended
               ? { color: 'var(--state-live)' } : undefined}>
          {ready ? songLength
            : unattended ? 'Nothing is preparing it' : 'Preparing the song\u2026'}
        </div>

        <a className="top-button" data-testid="s2-preview"
           href={`/p/${performance.id}/watch`}>
          Preview
        </a>
      </header>

      <div className="s2-body shell-scroll" style={{ padding: '14px 18px' }}>
        <SwitchingStage
          performance={performance}
          onChanged={setPerformance}
          chosenTake={chosenTake}
          onChooseTake={setChosenTake}
          takesPanel={({ takeMenu, at }) => (
            /*
              * A MODULE IS THE COLUMN, NOT A CARD AT THE TOP OF IT.
              * [brief §3, §4]
              *
              * The takes rail shrink-wrapped its two takes and stopped,
              * leaving two thirds of the left column as bare desk with
              * a bordered rectangle floating at the top of it. That is
              * the single most recognisable "dashboard" shape there is,
              * and it was the largest one left in this studio.
              *
              * On a desk a rail runs the height of the bay it is in —
              * because the bay is the rail's, not because it has enough
              * to put in it. Empty space belongs INSIDE the module,
              * under the last take, where it reads as room for more
              * takes rather than as a gap in the furniture.
              */
            <div className="panel" data-testid="takes" style={{
              minWidth: 0, padding: 10, display: 'flex',
              flexDirection: 'column', gap: 8,
              height: '100%', minHeight: 0,
            }}>
              {/*
                * THE TAKES COLUMN.  [benchmark, §2, §5, §7]
                *
                * A heading with the count, one button that adds a take, and
                * the takes. That is all the benchmark has and it was right to
                * have only that: the column had grown five numbered empty
                * slots, three buttons and a paragraph, none of which is a
                * take, and all of which was in the way of the four that were.
                *
                * ADDING AND REMOVING ARE BOTH HERE. Record is the header
                * button; the other two ways in — a film of a performance, and
                * footage that is not a performance at all — are one row under
                * it, small, because they are the same decision made less
                * often. Removing is on the take itself, where the take is.
                */}
              <div className="row" style={{
                justifyContent: 'space-between', alignItems: 'center', gap: 8,
              }}>
                <span className="row" style={{ gap: 7, alignItems: 'center' }}>
                  <span className="module-label">Takes</span>
                  {/*
                    * A COUNT IS A NUMBER, not a pill. It sat in a
                    * rounded capsule with its own border — the shape
                    * of a notification badge, which is a thing you are
                    * supposed to act on. This is how many takes there
                    * are.
                    */}
                  <span className="mono readout" data-testid="take-count" style={{
                    fontSize: 'var(--text-2xs)', color: 'var(--ink-400)',
                  }}>{String(performance.takes.length).padStart(2, '0')}</span>
                </span>
                {recording.phase === 'idle' && (
                  <button
                    className="ctl" data-testid="arm" disabled={!ready}
                    title={'Opens the camera and loads the song into your headphones. '
                      + 'Wear them — a song out loud goes into the microphone with your '
                      + 'voice, and the video then carries it twice.'}
                    onClick={() => void recording.arm()}
                    style={{ padding: '6px 11px', flex: '0 0 auto' }}
                  >
                    {ready ? '+ Record take' : 'Preparing\u2026'}
                  </button>
                )}
              </div>

              {/*
                * WHAT IS ABOUT TO BE RECORDED, BEFORE IT IS.
                *   [quality.ts, useDevices; U-19]
                *
                * Two controls the studio did not have, on the path
                * that makes the master. Idle only: changing either
                * mid-take would reopen the camera, so they are gone
                * once the count-in starts rather than present and
                * refusing.
                *
                * THE CAMERA PICKER WAITS FOR REAL LABELS, because
                * `enumerateDevices` answers with unnamed entries
                * until permission is granted and a menu reading
                * "Camera 1, Camera 2" helps nobody choose. It
                * appears once the camera has been opened for the
                * first time. [useDevices]
                */}
              {recording.phase === 'idle' && (
                <div data-testid="record-setup" style={{
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                  {camera.devices.named && camera.devices.cameras.length > 1 && (
                    <label className="field" style={{ margin: 0 }}>
                      <span className="module-sub">Camera</span>
                      <select className="small" data-testid="record-camera"
                              value={camera.cameraId ?? ''}
                              onChange={(event) => camera.chooseCamera(
                                event.target.value || undefined)}>
                        <option value="">This machine’s default</option>
                        {camera.devices.cameras.map((one) => (
                          <option key={one.deviceId} value={one.deviceId}>
                            {one.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="field" style={{ margin: 0 }}>
                    <span className="module-sub">Record at</span>
                    <select className="small" data-testid="record-quality"
                            value={grade.id}
                            onChange={(event) => grade.choose(
                              event.target.value as typeof grade.id)}>
                      {grade.offered.map((one) => (
                        <option key={one} value={one}>{QUALITIES[one].label}</option>
                      ))}
                    </select>
                  </label>
                  <p className="small muted" style={{
                    margin: 0, fontSize: 'var(--text-2xs)',
                  }}>{grade.quality.records}</p>
                  {camera.lost && (
                    <p className="small" data-testid="record-camera-lost" style={{
                      margin: 0, fontSize: 'var(--text-2xs)',
                      color: 'var(--ink-on-bad)',
                    }}>
                      {camera.lost} is no longer connected — using the default.
                    </p>
                  )}
                </div>
              )}

              {/*
                * THE LIST TAKES THE SLACK AND SCROLLS INSIDE IT, so the
                * two things that are not takes — the camera when it is
                * armed, and the two ways to bring footage in — keep
                * their place at the foot of the module. Before this the
                * whole column scrolled, which meant arming the camera
                * could push the record button out of sight at the
                * moment you were about to use it.
                */}
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 7,
                flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
              }}>
                {performance.takes.length === 0 && recording.phase === 'idle' && (
                  <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
                    Record against the song, or bring in something you filmed.
                  </p>
                )}
                {performance.takes.map((take) => {
                  const placed = take.alignment.method !== 'unplaced';
                  /*
                   * A row says what its take IS. For a performance that is
                   * where it looks like it was shot; for footage it is
                   * neither a room nor a space — there is nobody in it to put
                   * anywhere — so it says the one thing that governs how it
                   * behaves: whether it repeats to fill what it is cut into.
                   */
                  const footage = take.kind === 'footage';
                  const where = footage
                    ? (take.loop ? 'Footage \u00b7 loops' : 'Footage')
                    : take.environment.kind === 'space'
                      ? SPACES.find((sp) => sp.id === take.environment.spaceId)?.label
                        ?? 'a space'
                      : take.environment.kind === 'blur' ? 'Blurred'
                        : 'Original';
                  /*
                   * The number is the KEY, so it is the position among the
                   * takes that can actually go on screen — not the position
                   * in the list. A take still assembling has no key, and
                   * printing one next to it would be an instruction that does
                   * nothing when followed.
                   */
                  const key = take.durationSamples > 0
                    ? performance.takes.filter((t) => t.durationSamples > 0)
                      .findIndex((t) => t.id === take.id) + 1
                    : null;
                  const chosen = chosenTake === take.id;
                  return (
                    <div
                      key={take.id} data-testid="take-row" data-take-id={take.id}
                      data-filled="true" data-offset={take.alignment.offsetSamples}
                      {...onRow(take.label, () => takeMenu(take))}
                      style={{
                        display: 'flex', gap: 8, alignItems: 'center',
                        minWidth: 0, position: 'relative',
                      }}
                    >
                      {/* The colour, outside the card, as the benchmark puts
                          it: a take's identity is not part of its card, it is
                          the thread that runs through the stage badge, the
                          timeline lane and every block of the master video. */}
                      <span aria-hidden="true" style={{
                        width: 9, height: 9, borderRadius: '50%', flex: '0 0 auto',
                        background: take.accent ?? TAKE_ACCENT_FALLBACK,
                        opacity: placed || footage ? 1 : 0.4,
                      }} />
                      <button
                        type="button" data-testid="take-card"
                        onClick={() => setChosenTake(take.id)}
                        title={key ? `${take.label} \u2014 key ${key}` : take.label}
                        style={{
                          flex: '1 1 auto', minWidth: 0, display: 'flex',
                          gap: 9, alignItems: 'center', padding: 7,
                          borderRadius: 3, textAlign: 'left', font: 'inherit',
                          color: 'inherit', cursor: 'pointer',
                          /*
                           * A TAKE IS A SOURCE, and the chosen one is
                           * lit on its leading edge in the take's OWN
                           * colour — the thread that runs through the
                           * rail, the stage badge, the number key and
                           * every block of the master video. It was
                           * outlined in that colour and tinted blue,
                           * which is two cues saying different things.
                           */
                          background: chosen
                            ? 'var(--console-control-hover)'
                            : 'var(--console-control)',
                          border: '1px solid var(--console-seam)',
                          boxShadow: chosen
                            ? `inset 3px 0 0 ${take.accent ?? TAKE_ACCENT_FALLBACK},`
                              + ' var(--console-bevel-strong)'
                            : 'var(--console-bevel)',
                        }}
                      >
                        {/*
                          * A background rather than an <img>: a take assembled
                          * before posters existed has none, and a background
                          * that 404s shows the colour underneath while an
                          * <img> shows a broken icon.
                          */}
                        <span
                          data-testid="take-poster" aria-hidden="true"
                          style={{
                            flex: '0 0 auto', width: 64, height: 38,
                            borderRadius: 'var(--radius-screen)',
                            backgroundColor: `${take.accent ?? TAKE_ACCENT_FALLBACK}33`,
                            backgroundImage: `url(/api/performances/${performance.id}`
                              + `/takes/${take.id}/media?kind=poster)`,
                            backgroundSize: 'cover', backgroundPosition: 'center',
                          }}
                        />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{
                            fontWeight: 600, fontSize: 'var(--text-base)', display: 'block',
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>{take.label}</span>
                          <span className="small muted" style={{
                            fontSize: 'var(--text-xs)', display: 'block', overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {/*
                              * WHO PERFORMED IT, where it came from
                              * somebody who is not here. [TAKE-APP
                              * T5a] "James — 3 submitted takes": a
                              * rail showing five takes with no way to
                              * tell whose is which is a rail a
                              * producer cannot work from, and a take
                              * the author recorded needs no name.
                              */}
                            {take.performer && (
                              <span data-testid="take-performer">
                                {`${take.performer} \u00b7 `}
                              </span>
                            )}
                            {footage || placed ? where : 'not placed yet'}
                            {/*
                              * AND WHETHER IT HAS BEEN PUSHED. A take
                              * held a few frames behind the others is a
                              * decision somebody made, and a rail that
                              * does not show it is a rail where the
                              * reason a take sounds late is invisible.
                              * Said in words, never by position alone.
                              * [U-19]
                              */}
                            {nudgeSays(take) && (
                              <span data-testid="take-nudge">
                                {` \u00b7 ${nudgeSays(take)}`}
                              </span>
                            )}
                          </span>
                          <span className="small muted" style={{
                            fontSize: 'var(--text-xs)', display: 'block',
                            fontFamily: 'ui-monospace, monospace',
                          }}>
                            {take.durationSamples > 0
                              ? formatMasterPosition(take.durationSamples).slice(0, 5)
                              : '\u2026'}
                          </span>
                        </span>
                      </button>
                      {/*
                        * What can be done to this take, reached two ways.
                        *
                        * This was a `<details>` — which needs no outside-click
                        * handling and no portal, and is also not a menu: it is
                        * a disclosure widget, so it announced itself as one,
                        * had no arrow keys, and left the next person to add
                        * right-click here writing the list out a second time.
                        *
                        * Rename, loop and remove belong to a take rather than
                        * to the composition, and they are not three buttons on
                        * every row, because a delete button on every row of a
                        * list is the one you press by accident. [D-19]
                        */}
                      <MenuButton about={take.label} small
                                  items={() => takeMenu(take)}
                                  open={fromButton} />
                    </div>
                  );
                })}
                {performance.takes.length > 0 && (
                  <RightClickHint what="a take" />
                )}
              </div>

              {/* ---- the camera, when it is on ------------------------- */}
              {recording.phase !== 'idle' && (
                <section data-testid="record" style={{
                  display: 'flex', flexDirection: 'column', gap: 8,
                  borderTop: '1px solid var(--line)', paddingTop: 8,
                  flex: '0 0 auto',
                }}>
                  <video
                    ref={recording.videoRef} autoPlay muted playsInline
                    data-testid="performer-camera"
                    style={{
                      width: '100%', aspectRatio: '16 / 9', objectFit: 'cover',
                      borderRadius: 'var(--radius-screen)', background: 'var(--screen-bed)',
                      border: `2px solid ${recording.phase === 'recording'
                        ? '#e0674f' : 'var(--line)'}`,
                      display: recording.stream ? 'block' : 'none',
                    }}
                  />
                  {recording.phase === 'arming'
                    && <div className="small muted">Loading\u2026</div>}

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
                        <select
                          id="take-space" data-testid="take-environment" value={environment}
                          title={'Stored with the take, not burned into it \u2014 change '
                            + 'it afterwards without singing the song again.'}
                          onChange={(e) => setEnvironment(e.target.value)}
                        >
                          <option value="original">The room you are in</option>
                          {/* Anything else needs a plate, and a menu that offers
                              what it cannot do is a menu that lies. [§4, INV-16] */}
                          {measured
                            && <option value="blur">The room you are in, softened</option>}
                          {measured && SPACES.map((sp) => (
                            <option key={sp.id} value={sp.id}>{sp.label}</option>
                          ))}
                        </select>
                        {!measured && (
                          <span className="small muted" style={{ fontSize: 'var(--text-xs)' }}>
                            Measure your room in Set up to stand anywhere else.
                          </span>
                        )}
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <button
                          className="ctl is-critical" data-testid="start-take"
                          disabled={recording.phase === 'finishing'}
                          onClick={() => void recording.start(label,
                            environment === 'original'
                              ? { kind: 'original' }
                              : environment === 'blur'
                                ? { kind: 'blur' }
                                : { kind: 'space', spaceId: environment })}
                          style={{ flex: '1 1 auto' }}
                        >
                          {recording.phase === 'finishing' ? 'Saving\u2026' : 'Record a take'}
                        </button>
                        {/*
                          * RECORDING FROM WHERE THE PLAYHEAD IS.
                          * [TIMELINE B7]
                          *
                          * "Imagine the user is editing a performance
                          * and realizes: I need an extra vocal section
                          * here." Then they should not have to sit
                          * through three minutes of song to reach it.
                          *
                          * A SECOND BUTTON RATHER THAN A CHANGE TO THE
                          * FIRST, and only when the playhead is
                          * actually somewhere. Making "Record a take"
                          * start wherever the line happens to be left
                          * would mean a take that silently begins at
                          * 02:41 because somebody scrubbed there an
                          * hour ago — a mode, and an invisible one.
                          */}
                        {Math.round(at()) > 0 && (
                          <button
                            className="ctl" data-testid="start-take-here"
                            disabled={recording.phase === 'finishing'}
                            title={'The song starts where the playhead is, '
                              + 'not at the top'}
                            onClick={() => void recording.start(label,
                              environment === 'original'
                                ? { kind: 'original' }
                                : environment === 'blur'
                                  ? { kind: 'blur' }
                                  : { kind: 'space', spaceId: environment },
                              Math.round(at()))}
                            style={{ flex: '0 0 auto' }}
                          >
                            From here
                          </button>
                        )}
                        <button className="small" data-testid="disarm"
                                onClick={recording.disarm}>Turn off</button>
                      </div>
                    </>
                  )}

                  {recording.phase === 'counting' && (
                    <div data-testid="count-in" style={{ fontWeight: 600, fontSize: 'var(--text-lg)' }}>
                      Get ready\u2026
                    </div>
                  )}

                  {recording.phase === 'recording' && (
                    <>
                      <div data-testid="recording-now"
                           style={{ fontWeight: 600, color: '#e0674f', fontSize: 'var(--text-md)' }}>
                        Recording \u00b7 {formatMasterPosition(
                          Math.round(recording.position * HOUSE_SAMPLE_RATE))} of {songLength}
                      </div>
                      <button className="ctl is-critical" data-testid="stop-take"
                              onClick={recording.stop}>Stop</button>
                    </>
                  )}

                  {recording.error && (
                    <p className="small" style={{ color: 'var(--bad)' }}>{recording.error}</p>
                  )}
                </section>
              )}

              {/*
                * The other two ways a slot gets filled, one line. A take
                * filmed on a real camera is still a take, and a clip of the
                * sea is not a take at all but occupies the same slot. [§2,
                * §5, §10]
                */}
              {recording.phase === 'idle' && (
                <div style={{
                  display: 'flex', gap: 6, alignItems: 'stretch',
                  borderTop: '1px solid var(--line)', paddingTop: 8,
                  flex: '0 0 auto',
                }}>
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
                  <UploadTake
                    compact footage
                    performanceId={performance.id}
                    onFinished={(jobId) => { void watchJob(jobId); }}
                  />
                </div>
              )}

              {/*
                * AND THE THIRD WAY A SLOT GETS FILLED: somebody who is
                * not here.  [TAKE-APP T2, T9a, T10, T11; D-25]
                *
                * A link to a phone, and what comes back. It sits with
                * the other two because it is the same slot — a take
                * accepted from a performer's phone is an ordinary take
                * in this rail, assembled and aligned by the same code
                * — and it is the only one of the three where the
                * material exists before the performance knows about
                * it.
                */}
              {recording.phase === 'idle' && (
                <PerformersPanel
                  performanceId={performance.id}
                  /*
                   * BOTH HALVES, because either alone is a door
                   * that looks open and refuses: `accessOf`
                   * returns null unless `respondable` is set, so a
                   * published song with participation closed lets
                   * nobody in. [availability.ts, claim.ts]
                   */
                  open_={Boolean(performance.publication
                    && !performance.publication.unpublishedAt
                    && performance.publication.respondable)}
                  onTakeAccepted={(jobId) => { void watchJob(jobId); }}
                />
              )}
            </div>
          )}
        />


        {/* ---- master, deliver, publish (§9, §14, S-7) --------------- */}
        {/*
          * THREE ACTS UNDER ONE ROOF. These were three sections with three
          * headings and a fourth heading between them, each fetching its own
          * jobs; they are one region of the studio and they answer to one
          * poll. The controls inside are the same controls. [D-19]
          */}
        {performance.takes.some((t) => t.durationSamples > 0)
          && <Delivery performance={performance} onChanged={setPerformance}
                       channels={channels} />}
        {/*
          * Setting up: done once, then never again. Open by default until
          * there is a take, because an empty studio's only useful action is
          * in here — and folded once there is, because a rail is for what you
          * have made.
          */}
        <details data-testid="setup" open={performance.takes.length === 0}
                 style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--text-base)', fontWeight: 600 }}>
            Set up
          </summary>
        {/* ---- what may be done with this music ---------------------- */}
        <section className="panel" data-testid="master-rights" style={{ padding: 12 }}>
          <div className="small muted" style={{ textTransform: 'uppercase',
            letterSpacing: '0.1em', fontSize: 'var(--text-2xs)', marginBottom: 6 }}>
            This music
          </div>
          {/*
            * THE SONG, AS A THING YOU CAN DO SOMETHING TO. This section
            * was four buttons about the song's licence with no song on
            * it: the only place the uploaded file appeared was a line of
            * grey text in the bar at the top, and the only way to get rid
            * of one uploaded by mistake was to leave, find the card on
            * the home page, and delete it from there.
            */}
          <div className="row" data-testid="song-row"
               {...onRow(performance.title, songItems)}
               style={{
                 gap: 'var(--space-3)', flexWrap: 'nowrap', marginBottom: 10,
                 padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                 background: 'var(--surface-sunk)',
                 border: 'var(--border) solid var(--line)',
               }}>
            <span aria-hidden="true" style={{
              flex: '0 0 auto', width: 30, height: 30,
              display: 'grid', placeItems: 'center',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--studio-two-wash)',
              color: 'var(--studio-two)',
            }}><Icon name="music" size={14} /></span>
            <span className="grow" style={{ minWidth: 0 }}>
              <span style={{
                display: 'block', fontWeight: 'var(--weight-semi)',
                fontSize: 'var(--text-base)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{performance.title}</span>
              <span className="muted" style={{
                display: 'block', fontSize: 'var(--text-2xs)',
              }}>
                {performance.master.artist ? `${performance.master.artist} \u00b7 ` : ''}
                {ready ? songLength : 'preparing\u2026'}
                {' \u00b7 '}
                {performance.takes.length} {performance.takes.length === 1
                  ? 'take' : 'takes'} over it
              </span>
            </span>
            <MenuButton about={performance.title} items={songItems}
                        open={fromButton} />
          </div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {MASTER_CLASSES.map((cls) => (
              <button
                key={cls}
                className="small"
                data-testid="master-class"
                data-class={cls}
                data-chosen={performance.master.class === cls ? 'true' : 'false'}
                aria-pressed={performance.master.class === cls}
                disabled={busy}
                title={CLASS_LABELS[cls]!.hint}
                onClick={() => void act({
                  action: 'classify-master', class: cls,
                  licence: performance.master.licence ?? null,
                })}
                style={{
                  padding: '5px 10px', fontSize: 'var(--text-sm)',
                  background: performance.master.class === cls
                    ? 'var(--accent-wash)' : undefined,
                  borderColor: performance.master.class === cls ? 'var(--accent)' : undefined,
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
            letterSpacing: '0.1em', fontSize: 'var(--text-2xs)', marginBottom: 6 }}>
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
          <p className="small muted" style={{ fontSize: 'var(--text-xs)', marginTop: 6,
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
