'use client';

import { useEffect, useState } from 'react';
import type { Performance, RenderProblem } from '../../../src/domain/performance.js';
import { lyricsStatus, masterCheck } from '../../../src/domain/performance.js';
import { repairsFor } from '../../../src/domain/takeRanking.js';
import { EXPORT_PROFILES } from '../../../src/domain/presentation.js';
import { formatMasterPosition, HOUSE_SAMPLE_RATE } from '../../../src/domain/time.js';
import { MIN_LINE_SAMPLES } from '../../../src/domain/lyrics.js';
import { phrasesIn } from '../../../src/domain/phrases.js';
import Icon from '../../Icon.js';

/**
 * How far one press moves a caption.  [MASTER-EDIT §16, L7]
 *
 * A QUARTER OF A SECOND, because of what the error actually is.
 * `synchronise` puts every line on a measured phrase of singing, so a
 * line is never adrift by seconds — it is out by a breath the detector
 * counted or missed at one end. A step sized for that is a step small
 * enough to hear and large enough that a correction is two presses
 * rather than ten.
 *
 * AND AN OFFSET BIGGER THAN A FEW PRESSES IS NOT A NUDGE. If a line
 * wants moving by a bar, the synchronise was wrong and running it again
 * is the honest remedy; clicking forty times to hide that would leave
 * the rest of the track just as wrong.
 */
const NUDGE_STEP = Math.round(HOUSE_SAMPLE_RATE / 4);

/**
 * Everything that must be true before a master is worth rendering.
 * [MASTER-EDIT §13, §12 P0]
 *
 * WHY A LIST AND NOT A SENTENCE. The console already refused a render it
 * could not make, and named what was wrong — but only what was WRONG. An
 * author pressing a button on a four-minute render wants to know what was
 * looked at, not only what failed, because the value of a green list is that
 * it tells you the render is worth starting. A refusal tells you nothing
 * about the nine things that were fine.
 *
 * AND EVERY TICK CARRIES WHAT IT COMPARED. A checklist is a promise, and the
 * one way to break it is to tick something nobody checked. Each line says
 * what it measured — `00:05.000 projected against 00:05.000 of song`,
 * `2 join(s), every mix covered on both sides` — so a green tick is a
 * statement rather than a mood.
 *
 * THE REPAIRS ARE THE POINT. A diagnosis an author has to translate into an
 * action is half a product, and a repair menu that offers five things of
 * which three cannot work is worse than no menu: it teaches them to stop
 * reading it. So each remedy says whether it applies and why, and "Choose a
 * take" lists only the takes that would actually cover the stretch —
 * `coversSpan`, the same question the timeline asks.
 */
export default function MasterCheck({
  performance, profileId, busy, onRepair,
}: {
  performance: Performance;
  profileId: string;
  busy: boolean;
  /** Answers with the refusal, or null, so a control can say it where
     it happened rather than at the top of a panel nobody is looking at. */
  onRepair: (body: Record<string, unknown>) => Promise<string | null>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const { items, ready } = masterCheck(performance, profileId, EXPORT_PROFILES);
  /*
   * ADVISORY LINES ARE NOT ISSUES. `ready` does not count them, so the
   * header must not either — "1 issue" above a Create button that works
   * is the header and the button disagreeing in front of the author.
   */
  const failed = items.filter((item) => !item.ok && !item.advisory);
  const advised = items.filter((item) => !item.ok && item.advisory);
  /*
   * ONE ISSUE, ONE PLACE TO FIX IT. A hole at the front fails both "Video
   * covers entire duration" and "No timeline gaps" — correctly, they are
   * different questions with the same answer today — and drawing its
   * repair under each is the same offer twice. The checks all still say
   * they failed; the remedy hangs off the first one to report it.
   */
  const shown = new Set<string>();
  const key = (problem: RenderProblem) =>
    `${problem.kind}:${problem.fromSample}:${problem.toSample}`;

  return (
    <section data-testid="master-check" data-ready={ready ? 'true' : 'false'}
             style={{
               border: 'var(--border) solid var(--console-edge)',
               borderRadius: 'var(--radius-module)',
               background: 'var(--console-inset)',
             }}>
      <div className="module-head" style={{ borderBottom: 0 }}>
        <span className="module-label">Master check</span>
        <span className="module-sub grow" style={{ minWidth: 0 }}>
          {ready
            ? (advised.length > 0
              ? `ready to create master — ${advised.length} worth doing first`
              : 'ready to create master')
            : `${failed.length} issue${failed.length === 1 ? '' : 's'}`}
        </span>
        <span className={`state ${ready ? 'is-on' : 'is-armed'}`}
              data-testid="check-state">
          {ready ? 'passed' : 'blocked'}
        </span>
      </div>

      <ul style={{ margin: 0, padding: '0 10px 8px', listStyle: 'none' }}>
        {items.map((item) => (
          <li key={item.id} data-testid="check-item" data-check={item.id}
              data-ok={item.ok ? 'true' : 'false'}
              data-advisory={item.advisory ? 'true' : 'false'}>
            <div className="row" style={{
              gap: 'var(--space-3)', alignItems: 'baseline', flexWrap: 'nowrap',
              padding: '3px 0',
            }}>
              {/*
                * A MARK AND A WORD, never colour alone. The eight per cent
                * who cannot separate this green from this amber read the
                * glyph. [U-19]
                */}
              <span aria-hidden="true" style={{
                flex: '0 0 auto', width: 14, display: 'grid',
                placeItems: 'center',
                color: item.ok ? 'var(--accent-soft)'
                  : item.advisory ? 'var(--text-faint)' : '#f0c66a',
              }}><Icon name={item.ok ? 'passed' : 'warning'} size={12} /></span>
              <span style={{
                flex: '0 0 auto', fontSize: 'var(--text-sm)',
                color: item.ok ? 'var(--text)'
                  : item.advisory ? 'var(--text-faint)' : '#f0c66a',
              }}>{item.label}</span>
              {/*
                * A WORD, NOT A SHADE. An advisory line is drawn quieter
                * than a blocking one AND says which it is, because eight
                * per cent of people cannot separate those two greys and
                * all of them can read. [U-19]
                */}
              {!item.ok && item.advisory && (
                <span className="module-sub" data-testid="check-advisory"
                      style={{ flex: '0 0 auto' }}>worth doing</span>
              )}
              <span className="muted grow" style={{
                minWidth: 0, fontSize: 'var(--text-2xs)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{item.says}</span>
            </div>

            {/*
              * THE WORDS, OFFERED BESIDE THE LINE THAT ASKS FOR THEM.
              * [INV-07, MASTER-EDIT §12 P3]
              *
              * The same shape as a gap's repair below: the list says what
              * is wrong and the remedy hangs off it, rather than sending
              * an author to look for a Lyrics panel somewhere else. It is
              * the only remedy here that is a paste rather than a button,
              * because the words are the author's and nothing in this
              * product can invent them.
              *
              * AND IT IS OFFERED IN EVERY STATE, not only when the line
              * is failing. It used to hang off `!item.ok`, which was
              * fine while "no lyrics" was a failure — and the moment
              * that became a pass (§17), `[ Add lyrics ]` vanished for
              * exactly the author who had none. An optional thing has
              * to be reachable, or it is not optional, it is absent.
              * [MASTER-EDIT §17, L6]
              */}
            {item.id === 'captions' && (
              <Lyrics performance={performance} busy={busy}
                      open={open === 'captions'}
                      onToggle={() => setOpen(open === 'captions' ? null : 'captions')}
                      onRepair={onRepair} />
            )}

            {/* ---- what is wrong, where, and how to close it --------- */}
            {item.problems?.filter((problem) => {
              if (shown.has(key(problem))) return false;
              shown.add(key(problem));
              return true;
            }).map((problem, index) => (
              <Issue key={`${item.id}-${index}`} performance={performance}
                     problem={problem} busy={busy}
                     open={open === `${item.id}-${index}`}
                     onToggle={() => setOpen(
                       open === `${item.id}-${index}` ? null : `${item.id}-${index}`)}
                     onRepair={onRepair} />
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Lyrics, and then their timing.  [MASTER-EDIT §16, L4, L5; INV-07]
 *
 * *"You should not have to know what LRC is just because BalanceVid asked
 *  you for lyrics… lyrics text ≠ timed captions. BalanceVid should accept
 *  the first and derive the second."*
 *
 * WHAT WAS HERE ASKED FOR THE SECOND AND CALLED IT THE FIRST. One box,
 * labelled "Paste lyrics", that accepted only LRC — so an author who
 * pasted their own song got a red refusal explaining a file format they
 * had never heard of, under a heading saying they had supplied no lyrics.
 *
 * TWO SECTIONS NOW, BECAUSE THERE ARE TWO OBJECTS:
 *
 *   LYRICS   the words, which are the author's and are kept as typed;
 *   TIMING   where each line falls, which the product measures from the
 *            master's own audio and the author corrects.
 *
 * AND NO "DISPLAY" SECTION, which the brief also drew. Captions on/off,
 * style and position are not in the document — there is nothing behind
 * them — and three controls that change nothing is the exact fault this
 * panel is being rebuilt to remove. It is named in the ledger instead.
 */
function Lyrics({
  performance, busy, open, onToggle, onRepair,
}: {
  performance: Performance;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  /** Answers with the refusal, or null, so a control can say it where
     it happened rather than at the top of a panel nobody is looking at. */
  onRepair: (body: Record<string, unknown>) => Promise<string | null>;
}) {
  const words = performance.master.lyricsText ?? '';
  const timed = performance.master.lyrics ?? [];
  /* Three states, from one function, so nothing counts a length. [L6] */
  const status = lyricsStatus(performance.master);
  const [text, setText] = useState(words);
  const [said, setSaid] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  /* The box follows the document when somebody else changes it. */
  useEffect(() => { setText(performance.master.lyricsText ?? ''); },
    [performance.master.lyricsText]);

  /**
   * Measure the song, then put the words on it.
   *
   * IN THIS BROWSER, because the audio is already here: the studio plays
   * the master, so `decodeAudioData` is reading a file the page has
   * rather than asking a worker to fetch one. A queued job would be a
   * spinner in front of an answer that takes less time than the request
   * to start it. [§16, L3]
   */
  const synchronise = async () => {
    setSaid(null);
    setNote(null);
    setListening(true);
    try {
      const response = await fetch(`/api/performances/${performance.id}/master`);
      if (!response.ok) throw new Error('the song could not be read');
      const context = new AudioContext();
      const audio = await context.decodeAudioData(await response.arrayBuffer());
      /*
       * THE FIRST CHANNEL, not a downmix. A vocal sits in the middle of
       * a stereo mix, so both channels carry it and averaging them buys
       * nothing but a pass over four minutes of samples.
       */
      const found = phrasesIn(audio.getChannelData(0), audio.sampleRate);
      void context.close();
      const refusal = await onRepair({
        action: 'synchronise-lyrics',
        phrases: found.map((one) => ({
          fromSample: one.fromSample, toSample: one.toSample,
        })),
      });
      setSaid(refusal);
      if (!refusal) {
        setNote(`${found.length} phrase(s) of singing found.`);
      }
    } catch (error) {
      setSaid(error instanceof Error
        ? `the song could not be measured — ${error.message}`
        : 'the song could not be measured');
    } finally {
      setListening(false);
    }
  };

  /**
   * Move one line, and say so where it happened.
   *
   * THE DOCUMENT IS THE STATE. Nothing is held here and no optimistic
   * position is drawn: the press goes to the domain, the domain clamps
   * it, and the row redraws from what came back. A local copy would be
   * a second opinion about where a caption is. [U-19, D-06]
   */
  const nudge = (index: number, bySamples: number) => {
    setSaid(null);
    void onRepair({ action: 'nudge-lyric', index, bySamples })
      .then((refusal) => setSaid(refusal));
  };

  return (
    <div data-testid="check-lyrics" style={{
      margin: '3px 0 7px 22px', padding: 'var(--space-3) var(--space-4)',
      background: 'var(--console-inset)',
      border: 'var(--border) solid var(--console-edge)',
      borderRadius: 'var(--radius-module)',
    }}>
      <div className="row" style={{ gap: 'var(--space-4)', flexWrap: 'nowrap' }}>
        {/*
          * THREE STATES, AND NONE OF THEM AN ACCUSATION.  [§16, L6]
          *
          * *"That prevents the product from ever implying that a music
          * video is incomplete simply because it has no lyrics."* The
          * first line used to be "A song has its words before it has a
          * video", said to somebody who may be exporting an
          * instrumental.
          */}
        <span className="grow small muted" style={{ minWidth: 0 }}>
          {status === 'timed'
            ? `\u2713 Timed lyrics ready \u2014 ${timed.length} line(s)`
            : status === 'untimed'
              ? 'Lyrics supplied \u2014 timing required.'
              : 'Optional. Add lyrics if you want synchronised captions in '
                + 'the finished video.'}
        </span>
        <button className="ctl sm" data-testid="lyrics-toggle" onClick={onToggle}>
          {open ? 'Close' : status === 'none' ? 'Add lyrics' : 'Lyrics & captions'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          {/* ---- LYRICS ------------------------------------------------ */}
          <p className="small" style={{
            margin: '0 0 4px', fontSize: 'var(--text-2xs)',
            letterSpacing: '0.07em', textTransform: 'uppercase',
            color: 'var(--text-faint)', fontWeight: 'var(--weight-bold)',
          }}>Lyrics</p>
          <textarea data-testid="lyrics-text" rows={6} disabled={busy}
                    value={text} onChange={(event) => setText(event.target.value)}
                    placeholder={'Ancient of Days,\nWho can search out Your mind?'}
                    style={{
                      width: '100%', fontSize: 'var(--text-sm)',
                      fontFamily: 'var(--font-mono)',
                    }} />
          <p className="small muted" style={{ margin: '4px 0 6px' }}>
            Just the words, one line each, as you would sing them.
            BalanceVid works out when each line falls by listening to the
            song. Leave this empty for an instrumental — the export is
            complete either way.
          </p>

          {said && (
            <p className="small" data-testid="lyrics-said"
               style={{ color: 'var(--bad)', margin: '0 0 6px' }}>{said}</p>
          )}
          {note && (
            <p className="small muted" data-testid="lyrics-note"
               style={{ margin: '0 0 6px' }}>{note}</p>
          )}

          <div className="row" style={{ gap: 'var(--space-3)' }}>
            <button className="ctl sm" data-testid="lyrics-save"
                    disabled={busy || !text.trim() || text === words}
                    onClick={() => {
                      void onRepair({ action: 'set-lyrics-text', text })
                        .then((refusal) => setSaid(refusal));
                    }}>
              Save lyrics
            </button>
            {(words.trim() || timed.length > 0) && (
              <button className="ctl sm" data-testid="lyrics-clear" disabled={busy}
                      onClick={() => onRepair({ action: 'set-lyrics', lrc: null })}>
                Remove
              </button>
            )}
          </div>

          {/* ---- TIMING ------------------------------------------------ */}
          {words.trim() && (
            <>
              <p className="small" style={{
                margin: 'var(--space-5) 0 4px', fontSize: 'var(--text-2xs)',
                letterSpacing: '0.07em', textTransform: 'uppercase',
                color: 'var(--text-faint)', fontWeight: 'var(--weight-bold)',
              }}>Timing</p>
              <div className="row" style={{ gap: 'var(--space-3)' }}>
                <button
                  className="ctl sm is-key" data-testid="lyrics-sync"
                  disabled={busy || listening}
                  onClick={() => { void synchronise(); }}
                >
                  {listening ? 'Listening to the song…'
                    : timed.length > 0 ? 'Synchronise again' : 'Synchronise lyrics'}
                </button>
                <button className="ctl sm" data-testid="lyrics-advanced"
                        onClick={() => setAdvanced((was) => !was)}>
                  {advanced ? 'Hide LRC import' : 'Import LRC'}
                </button>
              </div>

              {/*
                * THE PREVIEW THE BRIEF DREW, AND THE ADJUSTING.
                * *"Show a timing preview. User adjusts anything that
                * is wrong."* Seeing is what stops somebody exporting a
                * caption track they have never looked at; the two
                * arrows are the rest of the sentence.
                *
                * ON THE LINE ITSELF rather than on a selected line
                * with a control bar above it. A caption is wrong in
                * the place you can see it is wrong, and a bar that
                * acts on "the current line" adds a question — which
                * one is current — to a panel whose whole job is to
                * answer questions.
                */}
              {timed.length > 0 && (
                <div data-testid="lyrics-preview" style={{
                  marginTop: 'var(--space-3)', maxHeight: 180,
                  overflowY: 'auto',
                  border: 'var(--border) solid var(--console-seam)',
                  borderRadius: 'var(--radius-xs)',
                }}>
                  {timed.map((line, index) => {
                    /*
                     * THE DOMAIN'S CLAMP, SHOWN RATHER THAN HIT.
                     * `nudgeLyric` keeps `MIN_LINE_SAMPLES` on both
                     * sides, so a press past the limit is a request
                     * that quietly does nothing — and a control that
                     * does nothing when pressed is the fault this
                     * panel was rebuilt to remove. The same two
                     * numbers grey the arrow out instead. [L7, U-19]
                     */
                    const before = index > 0 ? timed[index - 1] : undefined;
                    const earliest = before
                      ? before.fromSample + MIN_LINE_SAMPLES : 0;
                    const latest = line.toSample - MIN_LINE_SAMPLES;
                    return (
                      <div
                        // eslint-disable-next-line react/no-array-index-key
                        key={index} className="row" data-testid="lyrics-line"
                        style={{
                          gap: 'var(--space-3)', minWidth: 0,
                          padding: '2px 6px',
                          borderBottom: 'var(--border) solid var(--console-rule)',
                        }}
                      >
                        <span className="mono muted" style={{
                          flex: '0 0 auto', fontSize: 'var(--text-2xs)',
                        }}>{formatMasterPosition(line.fromSample)}</span>
                        <span className="grow" style={{
                          minWidth: 0, fontSize: 'var(--text-xs)',
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>{line.text}</span>
                        <button
                          className="ctl" data-testid="lyric-earlier"
                          disabled={busy || line.fromSample <= earliest}
                          aria-label={`Bring "${line.text}" a quarter-second earlier`}
                          title="A quarter-second earlier"
                          onClick={() => { nudge(index, -NUDGE_STEP); }}
                          style={{
                            flex: '0 0 auto', padding: '3px 6px', lineHeight: 0,
                          }}
                        ><Icon name="chevron" size={10} turn={180} /></button>
                        <button
                          className="ctl" data-testid="lyric-later"
                          disabled={busy || line.fromSample >= latest}
                          aria-label={`Hold "${line.text}" a quarter-second later`}
                          title="A quarter-second later"
                          onClick={() => { nudge(index, NUDGE_STEP); }}
                          style={{
                            flex: '0 0 auto', padding: '3px 6px', lineHeight: 0,
                          }}
                        ><Icon name="chevron" size={10} /></button>
                      </div>
                    );
                  })}
                </div>
              )}

              {advanced && (
                <div style={{ marginTop: 'var(--space-3)' }}>
                  <textarea data-testid="lyrics-lrc" rows={4} disabled={busy}
                            placeholder={'[00:12.00]I walked the long way round\n'
                              + '[00:16.50]And found you waiting there'}
                            onChange={(event) => setText(event.target.value)}
                            style={{
                              width: '100%', fontSize: 'var(--text-sm)',
                              fontFamily: 'var(--font-mono)',
                            }} />
                  <p className="small muted" style={{ margin: '4px 0 6px' }}>
                    LRC — a timestamp before each line, which is what lyrics
                    sites and karaoke tools export. Use this when you already
                    have timings you trust.
                  </p>
                  <button className="ctl sm" data-testid="lyrics-lrc-save"
                          disabled={busy || !text.trim()}
                          onClick={() => {
                            void onRepair({ action: 'set-lyrics', lrc: text })
                              .then((refusal) => setSaid(refusal));
                          }}>
                    Use these timings
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Issue({
  performance, problem, busy, open, onToggle, onRepair,
}: {
  performance: Performance;
  problem: RenderProblem;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  /** Answers with the refusal, or null, so a control can say it where
     it happened rather than at the top of a panel nobody is looking at. */
  onRepair: (body: Record<string, unknown>) => Promise<string | null>;
}) {
  const [choice, setChoice] = useState<string>('');
  const where = problem.fromSample !== undefined && problem.toSample !== undefined
    ? `${formatMasterPosition(problem.fromSample)} – ${formatMasterPosition(problem.toSample)}`
    : null;
  const repairs = repairsFor(performance, problem);
  const choosable = repairs.find((repair) => repair.id === 'choose');
  const takes = (choosable?.takeIds ?? []).map((id) =>
    performance.takes.find((take) => take.id === id)).filter(Boolean);

  return (
    <div data-testid="check-issue" data-kind={problem.kind} style={{
      margin: '3px 0 7px 22px', padding: 'var(--space-3) var(--space-4)',
      background: 'var(--state-armed-wash)',
      border: 'var(--border) solid rgba(232,179,60,0.36)',
      boxShadow: 'inset 3px 0 0 var(--state-armed)',
      borderRadius: 'var(--radius-module)',
    }}>
      <div className="row" style={{ gap: 'var(--space-4)', flexWrap: 'nowrap' }}>
        <span className="grow" style={{ minWidth: 0, fontSize: 'var(--text-sm)' }}>
          {where && (
            <span className="readout" style={{ marginRight: 'var(--space-3)' }}>
              {where}
            </span>
          )}
          <span style={{ color: '#f0c66a' }}>
            {problem.kind === 'gap' ? 'No visual source'
              : problem.kind === 'short-takes' ? 'The take does not reach across it'
                : problem.kind === 'empty-scene' ? 'Nobody on screen'
                  : 'Nothing on screen yet'}
          </span>
        </span>
        <button className="ctl sm" data-testid="repair" onClick={onToggle}
                aria-expanded={open} style={{ flex: '0 0 auto' }}>
          Repair
        </button>
      </div>

      {open && (
        <div data-testid="repair-options" style={{
          marginTop: 'var(--space-4)', display: 'flex',
          flexDirection: 'column', gap: 'var(--space-3)',
        }}>
          {repairs.map((repair) => (
            <div key={repair.id} className="row" data-testid="repair-option"
                 data-repair={repair.id} data-available={repair.available ? 'true' : 'false'}
                 style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              {repair.id === 'choose' && repair.available ? (
                <>
                  <select data-testid="repair-take" disabled={busy}
                          value={choice} onChange={(e) => setChoice(e.target.value)}
                          style={{ fontSize: 'var(--text-sm)', width: 'auto' }}>
                    <option value="" disabled>Choose a take&hellip;</option>
                    {takes.map((take) => (
                      <option key={take!.id} value={take!.id}>{take!.label}</option>
                    ))}
                  </select>
                  <button className="ctl sm" data-testid="repair-apply"
                          disabled={busy || !choice}
                          onClick={() => onRepair({
                            action: 'cover-with', takeId: choice,
                            fromSample: problem.fromSample,
                            toSample: problem.toSample,
                          })}>
                    Put it on
                  </button>
                </>
              ) : (
                <button className="ctl sm" disabled={busy || !repair.available}
                        title={repair.says}
                        onClick={() => {
                          if (repair.id === 'use-next' && problem.extend) {
                            onRepair({
                              action: 'cover-gap',
                              sceneId: problem.extend.sceneId,
                              fromSample: problem.extend.fromSample,
                            });
                          }
                          /*
                            * THE HOLE AT THE TOP OF THE SONG, closed by
                            * moving the take that starts late rather
                            * than by stretching somebody else's scene
                            * over it. The domain worked out which take
                            * and how far; this only presses it.
                            * [TIMELINE B11]
                            */
                          if (repair.id === 'align-first' && repair.takeId) {
                            onRepair({
                              action: 'nudge-take',
                              takeId: repair.takeId,
                              nudgeSamples: repair.nudgeSamples ?? 0,
                            });
                          }
                          /*
                            * OR THERE WAS NEVER ANYTHING THERE. Every
                            * other repair answers the hole by putting
                            * something ON it; this one takes the
                            * stretch out of the song. The honest
                            * remedy for an intro nobody performed
                            * over. [TIMELINE B11b, B6k]
                            */
                          if (repair.id === 'remove-section') {
                            onRepair({
                              action: 'remove-section',
                              fromSample: repair.fromSample,
                              toSample: repair.toSample,
                            });
                          }
                        }}>
                  {repair.label}
                </button>
              )}
              <span className="muted" style={{
                fontSize: 'var(--text-2xs)', alignSelf: 'center',
              }}>{repair.says}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
