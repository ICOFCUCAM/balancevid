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

export default function PerformanceStudio(
  { initial, studioOneId }: { initial: Performance; studioOneId?: string },
) {
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

  /**
   * The five tabs, and where each of them actually goes.  [benchmark, §13]
   *
   * Written as data so the bar is a loop rather than five hand-placed
   * buttons — and so a tab with nowhere to go is a row with no href rather
   * than a special case in the middle of the markup.
   */
  const studioTabs: {
    id: string; label: string; glyph: string; href?: string;
    onClick?: () => void; hint?: string;
  }[] = [
    { id: 'conversations', label: 'Conversations', glyph: '\u25a2',
      href: '/#conversations' },
    studioOneId
      ? { id: 'studio-one', label: 'Studio One', glyph: '\u25a3',
        href: `/c/${studioOneId}` }
      : { id: 'studio-one', label: 'Studio One', glyph: '\u25a3',
        hint: 'No conversations yet — start one from the library' },
    { id: 'studio-two', label: 'Studio Two', glyph: '\u266a' },
    { id: 'library', label: 'Library', glyph: '\u2637', href: '/#performances' },
    {
      id: 'publish',
      label: 'Publish',
      glyph: '\u2191',
      hint: performance.scenes.length === 0
        ? 'Direct some scenes first — there is nothing to publish yet' : undefined,
      ...(performance.scenes.length > 0
        ? {
          onClick: () => document.querySelector('[data-testid="publish"]')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        }
        : {}),
    },
  ];

  return (
    <div className="shell">
      {/*
        * THE APPLICATION BAR.  [benchmark, §1, §13]
        *
        * Brand, then the five places, then who you are — which is the shape
        * the benchmark draws and the shape every tool of this kind uses. It
        * replaces a bar that carried the performance's title and three
        * buttons, because a studio is a room inside an application and the
        * bar at the top of the screen is the application's, not the room's.
        *
        * CONVERSATIONS and LIBRARY are the same page and different places in
        * it: the library lists conversations and performances, and the two
        * tabs land on the two lists. STUDIO ONE is `/c/[id]` — a real place,
        * where a source is answered and people are invited into the room —
        * so it points at the most recent conversation and says so when there
        * is none. A tab that goes nowhere is a menu that lies, which is the
        * rule that keeps unmeasured spaces out of the environment picker
        * (INV-16).
        */}
      <header className="shell-bar" style={{ gap: 18, padding: '0 18px', minHeight: 52 }}>
        <a href="/" className="row" style={{
          gap: 9, textDecoration: 'none', color: 'inherit', flex: '0 0 auto',
        }}>
          <span aria-hidden="true" style={{
            width: 26, height: 26, borderRadius: 7, display: 'grid',
            placeItems: 'center', background: '#2f7fe0', color: '#fff',
            fontSize: 12, paddingLeft: 2,
          }}>&#9654;</span>
          <strong style={{ fontSize: 15, whiteSpace: 'nowrap' }}>Prof Class</strong>
        </a>

        <nav className="row" data-testid="studio-nav"
             style={{ gap: 2, flexWrap: 'nowrap' }}>
          {studioTabs.map((tab) => {
            const current = tab.id === 'studio-two';
            const body = (
              <>
                <span aria-hidden="true" style={{ opacity: current ? 1 : 0.7 }}>
                  {tab.glyph}
                </span>
                <span>{tab.label}</span>
              </>
            );
            const style = {
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '14px 12px', fontSize: 13,
              textDecoration: 'none', whiteSpace: 'nowrap' as const,
              background: 'none', border: 0, borderRadius: 0,
              borderBottom: `2px solid ${current ? '#2f7fe0' : 'transparent'}`,
              color: current ? '#6fa9ea' : 'var(--text)',
              fontWeight: current ? 700 : 500,
              opacity: tab.href || tab.onClick ? 1 : 0.4,
              cursor: tab.href || tab.onClick ? 'pointer' : 'default',
            };
            if (current) {
              return (
                <span key={tab.id} data-testid={`tab-${tab.id}`} aria-current="page"
                      style={style}>{body}</span>
              );
            }
            if (tab.href) {
              return (
                <a key={tab.id} data-testid={`tab-${tab.id}`} href={tab.href}
                   style={style}>{body}</a>
              );
            }
            return (
              <button key={tab.id} data-testid={`tab-${tab.id}`} type="button"
                      disabled={!tab.onClick} onClick={tab.onClick}
                      title={tab.hint} style={style}>{body}</button>
            );
          })}
        </nav>

        <span className="grow" />
        {/* What this room is, since the bar no longer says it in a heading. */}
        <span className="small muted" data-testid="master-summary" style={{
          minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', textAlign: 'right',
        }}>
          {performance.title}
          {performance.master.artist ? ` \u00b7 ${performance.master.artist}` : ''}
          {ready ? ` \u00b7 ${songLength}` : ' \u00b7 preparing\u2026'}
        </span>
        <a className="btn small" href="/" style={{ padding: '6px 12px', flex: '0 0 auto' }}>
          Leave
        </a>
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
                        * What can be done to this take, on this take.
                        *
                        * A <details> rather than a floating menu: it needs no
                        * outside-click handling, no focus trap and no portal,
                        * and it closes when another one opens because only one
                        * `name` group may be open at a time. Rename and remove
                        * live here because they belong to a take rather than
                        * to the composition — and not as two buttons on every
                        * row, because a delete button on every row of a list
                        * is the one you press by accident.
                        */}
                      <details data-testid="take-menu" name="take-menu"
                               style={{ flex: '0 0 auto', position: 'relative' }}>
                        <summary
                          aria-label={`What to do with ${take.label}`}
                          style={{
                            listStyle: 'none', cursor: 'pointer', padding: '2px 5px',
                            borderRadius: 6, color: 'var(--muted)', fontSize: 15,
                            lineHeight: 1,
                          }}
                        >&#8943;</summary>
                        <div className="panel" style={{
                          position: 'absolute', right: 0, top: '100%', zIndex: 5,
                          padding: 5, minWidth: 148, display: 'flex',
                          flexDirection: 'column', gap: 2,
                        }}>
                          <button
                            className="small" data-testid="rename-take"
                            onClick={(event) => {
                              const next = window.prompt(
                                'What is this take called?', take.label);
                              if (next?.trim() && next.trim() !== take.label) {
                                void patch({
                                  action: 'rename-take', takeId: take.id,
                                  label: next.trim(),
                                });
                              }
                              event.currentTarget.closest('details')
                                ?.removeAttribute('open');
                            }}
                            style={{ border: 0, background: 'none', textAlign: 'left' }}
                          >Rename</button>
                          <button
                            className="small" data-testid="remove-take"
                            onClick={(event) => {
                              event.currentTarget.closest('details')
                                ?.removeAttribute('open');
                              if (!window.confirm(
                                `Remove "${take.label}"? Its scenes go with it.`)) return;
                              void patch({ action: 'remove-take', takeId: take.id });
                            }}
                            style={{
                              border: 0, background: 'none', textAlign: 'left',
                              color: 'var(--bad)',
                            }}
                          >Remove</button>
                        </div>
                      </details>
                    </div>
                  );
                })}
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
