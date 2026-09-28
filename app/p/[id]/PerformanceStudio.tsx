'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Performance } from '../../../src/domain/performance.js';
import { MASTER_CLASSES, SPACES, mayPublish } from '../../../src/domain/performance.js';
import { EFFECT_LOOKS, SPACES_ARE_DRAWN } from '../../../src/domain/environment.js';
import { describeCalibration } from '../../../src/domain/calibration.js';
import { describeDrift } from '../../../src/domain/drift.js';
import { HOUSE_SAMPLE_RATE, formatMasterPosition } from '../../../src/domain/time.js';
import { useConfirm } from '../../Confirm.js';
import { MenuButton, RightClickHint, useMenu, type MenuEntry } from '../../Menu.js';
import { useMasterRecording } from './useMasterRecording.js';
import UploadTake from './UploadTake.js';
import SwitchingStage from './SwitchingStage.js';
import MasterRender from './MasterRender.js';
import RoomPlate from './RoomPlate.js';
import { useCalibration } from './useCalibration.js';
import SoundModes from './SoundModes.js';
import PublishPanel from './PublishPanel.js';
import StudioBar from '../../StudioBar.js';

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
  { initial, studioOneId, studioThreeId }: {
    initial: Performance; studioOneId?: string; studioThreeId?: string;
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

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/performances/${id}`, { cache: 'no-store' });
    if (response.ok) setPerformance((await response.json()).performance);
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

  const takeItems = (take: Performance['takes'][number]): MenuEntry[] => [
    {
      label: 'Make this the chosen take',
      disabled: chosenTake === take.id ? 'It already is' : false,
      onSelect: () => setChosenTake(take.id),
    },
    {
      label: 'Rename\u2026',
      onSelect: () => confirm({
        question: 'A take\u2019s name is what the rail, the timeline and the '
          + 'lower third will all call it.',
        field: { label: 'What is this take called?', initial: take.label },
        verb: 'Rename it',
        go: (next) => {
          if (next && next !== take.label) {
            void patch({ action: 'rename-take', takeId: take.id, label: next });
          }
        },
      }),
    },
    {
      label: take.loop ? 'Stop looping it' : 'Loop it',
      hint: 'A looped take fills a scene longer than the take itself',
      onSelect: () => void patch({
        action: 'set-loop', takeId: take.id, loop: !take.loop,
      }),
    },
    {
      label: 'Remove\u2026',
      danger: true,
      onSelect: () => confirm({
        question: `Remove \u201c${take.label}\u201d? Every scene cut from it `
          + 'goes with it, and it cannot be undone.',
        verb: 'Remove the take',
        danger: true,
        go: () => void patch({ action: 'remove-take', takeId: take.id }),
      }),
    },
  ];



  return (
    <div className="shell">
      {confirmDialog}
      {menu}
      {/*
        * The application's bar, which every studio shares. It used to be
        * written out here; a second copy of it in Studio Three would have
        * been a second place the tabs go out of date.
        */}
      <StudioBar
        current="studio-two"
        studioOneId={studioOneId}
        studioThreeId={studioThreeId}
        extra={[{
          id: 'publish' as const,
          label: 'Publish',
          glyph: '\u2191',
          ...(performance.scenes.length > 0
            ? {
              onClick: () => document.querySelector('[data-testid="publish"]')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
            }
            : { hint: 'Direct some scenes first — there is nothing to publish yet' }),
        }]}
        trailing={(
          <span className="small muted" data-testid="master-summary" style={{
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', textAlign: 'right',
          }}>
            {performance.title}
            {performance.master.artist ? ` \u00b7 ${performance.master.artist}` : ''}
            {ready ? ` \u00b7 ${songLength}` : ' \u00b7 preparing\u2026'}
          </span>
        )}
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
                  <span style={{ fontSize: 15, fontWeight: 700 }}>Takes</span>
                  <span className="small muted" data-testid="take-count" style={{
                    fontSize: 11, padding: '1px 7px', borderRadius: 9,
                    background: 'var(--panel-2)', border: '1px solid var(--line)',
                  }}>{performance.takes.length}</span>
                </span>
                {recording.phase === 'idle' && (
                  <button
                    className="primary" data-testid="arm" disabled={!ready}
                    title={'Opens the camera and loads the song into your headphones. '
                      + 'Wear them — a song out loud goes into the microphone with your '
                      + 'voice, and the video then carries it twice.'}
                    onClick={() => void recording.arm()}
                    style={{ padding: '6px 11px', fontSize: 12, flex: '0 0 auto' }}
                  >
                    {ready ? '+ Record Take' : 'Preparing\u2026'}
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {performance.takes.length === 0 && recording.phase === 'idle' && (
                  <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
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
                      {...onRow(take.label, () => takeItems(take))}
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
                        background: take.accent ?? '#3e7ca6',
                        opacity: placed || footage ? 1 : 0.4,
                      }} />
                      <button
                        type="button" data-testid="take-card"
                        onClick={() => setChosenTake(take.id)}
                        title={key ? `${take.label} \u2014 key ${key}` : take.label}
                        style={{
                          flex: '1 1 auto', minWidth: 0, display: 'flex',
                          gap: 9, alignItems: 'center', padding: 7,
                          borderRadius: 9, textAlign: 'left', font: 'inherit',
                          color: 'inherit', cursor: 'pointer',
                          background: chosen
                            ? 'rgba(45,110,200,0.16)' : 'var(--panel-2)',
                          border: `1px solid ${chosen
                            ? (take.accent ?? '#3d7fd6') : 'var(--line)'}`,
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
                            flex: '0 0 auto', width: 64, height: 38, borderRadius: 6,
                            backgroundColor: `${take.accent ?? '#3e7ca6'}33`,
                            backgroundImage: `url(/api/performances/${performance.id}`
                              + `/takes/${take.id}/media?kind=poster)`,
                            backgroundSize: 'cover', backgroundPosition: 'center',
                          }}
                        />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{
                            fontWeight: 600, fontSize: 13, display: 'block',
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>{take.label}</span>
                          <span className="small muted" style={{
                            fontSize: 11, display: 'block', overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {footage || placed ? where : 'not placed yet'}
                          </span>
                          <span className="small muted" style={{
                            fontSize: 11, display: 'block',
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
                                  items={() => takeItems(take)}
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
                }}>
                  <video
                    ref={recording.videoRef} autoPlay muted playsInline
                    data-testid="performer-camera"
                    style={{
                      width: '100%', aspectRatio: '16 / 9', objectFit: 'cover',
                      borderRadius: 8, background: '#0d1319',
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
                          <span className="small muted" style={{ fontSize: 11 }}>
                            Measure your room in Set up to stand anywhere else.
                          </span>
                        )}
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <button
                          className="primary" data-testid="start-take"
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
                        <button className="small" data-testid="disarm"
                                onClick={recording.disarm}>Turn off</button>
                      </div>
                    </>
                  )}

                  {recording.phase === 'counting' && (
                    <div data-testid="count-in" style={{ fontWeight: 600, fontSize: 18 }}>
                      Get ready\u2026
                    </div>
                  )}

                  {recording.phase === 'recording' && (
                    <>
                      <div data-testid="recording-now"
                           style={{ fontWeight: 600, color: '#e0674f', fontSize: 15 }}>
                        Recording \u00b7 {formatMasterPosition(
                          Math.round(recording.position * HOUSE_SAMPLE_RATE))} of {songLength}
                      </div>
                      <button className="primary" data-testid="stop-take"
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
              color: 'var(--studio-two)', fontSize: 'var(--text-md)',
            }}>&#9834;</span>
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
                  padding: '5px 10px', fontSize: 12,
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
