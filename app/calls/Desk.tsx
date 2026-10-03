'use client';

/**
 * Where a call is run and its entries are marked.
 *   [GO-VIRAL V-2, V-5; Doctrine D-19, D-25, U-15]
 *
 * THE DOOR THAT WAS MISSING. V-2 built the campaign object and
 * its six states, V-3 its terms, V-4 its public page — and every
 * one of those was reachable only by curl. A capability with no
 * door is the thing this whole series keeps finding and deleting;
 * this is the door.
 *
 * IT IS NOT A FOURTH STUDIO. There is no timeline here, no
 * renderer, nothing about how a performance is produced. What an
 * organiser does with a call is: move it along, say what it is
 * marked on, name who marks, read what they said, and see what
 * that adds up to. Five things, in that order, on one page.
 *
 * AND IT SCORES NOTHING ITSELF. `takeRanking.ts` is not imported
 * here and must not be: *"a panel handed a machine's score has
 * been anchored by a measurement that cannot hear."* Every number
 * on this page came out of somebody's hands. [V-5]
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  type CampaignState, beforeRunning, stillBeingWritten,
} from '../../src/domain/campaign.js';
import {
  type Criterion, type Judge, type Judgement, type Mark, type Verdict,
  judgementProblem, verdictSays,
} from '../../src/domain/judging.js';

interface Entry {
  submissionId: string;
  kind: 'video' | 'audio' | 'text';
  at: string;
  participant?: string;
  judgements: Judgement[];
}

interface Call {
  id: string;
  title: string;
  state: CampaignState;
  clock: string;
  says: string;
  at: string;
  slug?: string;
  listed: boolean;
  rules: { asks: string; criteria?: string; prize?: string };
  scorecard: Criterion[];
  panel: Judge[];
  entries: number;
  submitted: number;
}

/**
 * One verb per move, which is the shape of the campaign machine.
 *   [V-2; GO-VIRAL V-8]
 *
 * THE FIVE AT THE TOP ARE DRAWN ONLY WHERE A CALL CAN BE IN ONE
 * OF THOSE STATES, AND THAT NEEDS NO FLAG ON THIS PAGE. A desk on
 * an installation that is not the network is showing calls that
 * start at SCHEDULED and can never go back, so `from` never
 * matches and the buttons never appear. The page asks the call
 * what it is, not the installation what it may do.
 */
const MOVES: { action: string; says: string; from: CampaignState[] }[] = [
  { action: 'submit', says: 'Hand it in', from: ['draft'] },
  { action: 'review', says: 'Start looking at it', from: ['submitted'] },
  { action: 'approve', says: 'Approve it', from: ['review'] },
  { action: 'back', says: 'Send it back', from: ['submitted', 'review'] },
  { action: 'schedule', says: 'Put it in the calendar', from: ['approved'] },
  { action: 'begin', says: 'Open it', from: ['scheduled'] },
  { action: 'closing', says: 'Last stretch', from: ['live'] },
  { action: 'reopen', says: 'Back to open', from: ['closing'] },
  { action: 'judge', says: 'Start judging', from: ['live', 'closing'] },
  { action: 'announce', says: 'Announce the result', from: ['judging'] },
  { action: 'complete', says: 'Close it for good', from: ['results'] },
];

export default function Desk({ id }: { id: string }) {
  const [call, setCall] = useState<Call | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [results, setResults] = useState<Verdict[]>([]);
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  const look = useCallback(async () => {
    const [one, marking] = await Promise.all([
      fetch(`/api/campaigns/${id}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/campaigns/${id}/judgements`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (one) {
      setCall({
        ...one.campaign, clock: one.clock, says: one.says, at: one.at,
        listed: one.listed, scorecard: one.scorecard, panel: one.panel,
        entries: one.entries, submitted: one.submitted,
      });
    }
    if (marking) {
      setEntries(marking.entries ?? []);
      setResults(marking.results ?? []);
      setOpen(Boolean(marking.open));
    }
  }, [id]);

  useEffect(() => { void look(); }, [look]);

  /** One verb, one refusal, one refresh. Every control goes through it. */
  const act = useCallback(async (body: Record<string, unknown>) => {
    setSaid(null);
    const response = await fetch(`/api/campaigns/${id}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      setSaid(typeof data?.error === 'string' ? data.error : 'that did not work');
      return false;
    }
    await look();
    return true;
  }, [id, look]);

  if (!call) {
    return <p className="small muted" data-testid="desk-loading">Reading the call…</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="row" style={{ gap: 'var(--space-3)', alignItems: 'baseline' }}>
          <h1 data-testid="desk-title" style={{
            margin: 0, fontSize: 'var(--text-xl)',
          }}>{call.title}</h1>
          <span className="grow" />
          <span className="small" data-testid="desk-state"
                data-state={call.state}>{call.state}</span>
        </div>
        <p className="small muted" data-testid="desk-says"
           style={{ margin: 0 }}>{call.says}</p>
        {/*
          * THE ADDRESS, AND WHETHER IT ANSWERS YET.
          *   [GO-VIRAL V-8; D-03]
          *
          * FOUND IN A SCREENSHOT. A draft said *in the
          * directory* under a link that 404s, because `listed`
          * is the author's standing answer to *put this in the
          * directory when it runs* and the page read it as *it
          * is in the directory*. Two different sentences, and
          * the one on the screen was the false one.
          *
          * SO IT IS PLAIN TEXT UNTIL THE CALL IS PASSED. A link
          * an organiser can press and be 404'd by is worse than
          * no link: it reads as though their call were broken
          * rather than not yet public.
          */}
        <p className="small muted" style={{ margin: 0 }}>
          {beforeRunning(call) ? (
            <span data-testid="desk-public">{call.at}</span>
          ) : (
            <a href={call.at} data-testid="desk-public">{call.at}</a>
          )}
          {beforeRunning(call)
            ? (call.listed
              ? ' · in the directory once it runs' : ' · not listed')
            : (call.listed ? ' · in the directory' : ' · not listed')}
          {` · ${call.submitted} of ${call.entries} have sent something`}
        </p>
      </header>

      {said && (
        <p className="small" data-testid="desk-said"
           style={{ margin: 0, color: 'var(--ink-on-bad)' }}>{said}</p>
      )}

      {/*
        * WHAT THIS CALL ACTUALLY ASKS FOR.  [GO-VIRAL V-8]
        *
        * FOUND IN A SCREENSHOT, AND IT IS THE PLAINEST OMISSION IN
        * THE WHOLE OF GO-VIRAL. The organiser's own words — the
        * instruction, the basis, the prize — were on the public
        * page from V-4 and never once on the page where the
        * organiser manages the call. A desk that shows the state
        * machine and the scorecard but not the sentence the whole
        * call is about is a control panel for something you cannot
        * see.
        *
        * THE SAME THREE LABELS THE PUBLIC PAGE USES, in the same
        * order, because the value of them here is to be exactly
        * what a stranger is reading. Different wording in the two
        * places would make an organiser check the public page to
        * be sure — which is the page they would have had to open
        * anyway, which is the bug.
        */}
      <section className="panel" data-testid="desk-rules" style={{
        padding: 'var(--space-4)', display: 'flex',
        flexDirection: 'column', gap: 'var(--space-3)',
      }}>
        <div>
          <h2 className="small muted" style={HEAD}>What to do</h2>
          <p data-testid="desk-asks" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            {call.rules.asks}
          </p>
        </div>
        {call.rules.criteria && (
          <div>
            <h2 className="small muted" style={HEAD}>Judged on</h2>
            <p data-testid="desk-criteria" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {call.rules.criteria}
            </p>
          </div>
        )}
        {call.rules.prize && (
          <div>
            <h2 className="small muted" style={HEAD}>Prize</h2>
            <p data-testid="desk-prize" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {call.rules.prize}
            </p>
          </div>
        )}
      </section>

      {/*
        * WHERE IT GOES NEXT, AND ONLY WHERE IT CAN GO.  [V-2]
        *
        * `CAMPAIGN_NEXT` is a table the domain owns and this draws
        * the row for the state it is in — so a button that would
        * be refused is a button that is not there. The clock
        * guards the domain refuses on top of that (judging cannot
        * start while entries are arriving) are reported rather
        * than re-derived here.
        */}
      <section>
        <h2 className="small muted" style={HEAD}>Where it goes next</h2>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {MOVES.filter((move) => move.from.includes(call.state)).map((move) => (
            <button key={move.action} className="ctl sm"
                    data-testid={`desk-move-${move.action}`}
                    onClick={() => void act({ action: move.action })}>
              {move.says}
            </button>
          ))}
          {MOVES.every((move) => !move.from.includes(call.state)) && (
            <span className="small muted" data-testid="desk-no-moves">
              Nothing more to do with this one.
            </span>
          )}
        </div>
      </section>

      <Scorecard call={call} act={act} />
      <Panel call={call} act={act} />
      <Marking call={call} entries={entries} open={open} onDone={look} />
      <Results call={call} results={results} entries={entries} />
    </div>
  );
}

const HEAD: React.CSSProperties = {
  margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.08em',
};

/* ------------------------------------------------------------------ *
 *  What the panel marks.
 * ------------------------------------------------------------------ */

/**
 * THE FORM CLOSES WHEN THE CALL OPENS, which is the stage's rule
 * drawn rather than merely enforced: *"publish the criteria
 * before the campaign opens, not after it closes."* The domain
 * refuses it either way; a page that still offered the field
 * would be a page inviting somebody to be refused.
 */
function Scorecard(
  { call, act }: { call: Call; act: (body: Record<string, unknown>) => Promise<boolean> },
) {
  const [says, setSays] = useState('');
  const [outOf, setOutOf] = useState(10);
  /* A draft and a scheduled call are the same moment on two kinds
     of installation: written, not yet open. [GO-VIRAL V-8] */
  const fixed = !stillBeingWritten(call);
  return (
    <section>
      <h2 className="small muted" style={HEAD}>Marked on</h2>
      {call.scorecard.length === 0 ? (
        <p className="small muted" data-testid="desk-no-scorecard" style={{ margin: '0 0 8px' }}>
          Nothing yet. A call with no criteria cannot be marked on a form —
          which is a perfectly ordinary way to run one, and is also the
          thing you cannot change once it has opened.
        </p>
      ) : (
        <ul data-testid="desk-scorecard" style={LIST}>
          {call.scorecard.map((one) => (
            <li key={one.id} className="row" data-testid="desk-criterion"
                style={ROW}>
              <span className="grow">{one.says}</span>
              <span className="small muted">out of {one.outOf}</span>
              {!fixed && (
                <button className="ctl sm" data-testid="desk-uncriterion"
                        onClick={() => void act({
                          action: 'uncriterion', criterion: one.id,
                        })}>Remove</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {/*
        * AND WHY IT IS FIXED, WHICH IS NOT ONE REASON.
        *   [GO-VIRAL V-8]
        *
        * FOUND IN A SCREENSHOT. A call waiting to be looked at
        * said *the criteria cannot change while people are
        * recording against them* — over a call nobody has
        * recorded against, that has not opened, and that nobody
        * outside this installation can see. The rule is right
        * and the sentence was about a different call.
        *
        * THE TWO REASONS ARE GENUINELY DIFFERENT. Once a call is
        * running, changing the scorecard re-scales marks already
        * made. While it is being reviewed, changing it means what
        * was passed is not what runs — and the way out is to send
        * it back, which the page says, because a person reading
        * *fixed* needs to know what to do rather than that they
        * cannot.
        */}
      {fixed ? (
        <p className="small muted" data-testid="desk-criteria-fixed" style={{ margin: 0 }}>
          {beforeRunning(call)
            ? 'Fixed while somebody else has it. What was approved has to be '
              + 'what runs — send it back to change the criteria.'
            : 'Fixed. The criteria were published before this call opened and '
              + 'cannot change while people are recording against them.'}
        </p>
      ) : (
        <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input data-testid="desk-criterion-says" value={says}
                 placeholder="What is being marked"
                 onChange={(e) => setSays(e.target.value)}
                 style={{ flex: '1 1 180px', minWidth: 0 }} />
          <input data-testid="desk-criterion-outof" type="number" min={1}
                 value={outOf} onChange={(e) => setOutOf(Number(e.target.value))}
                 style={{ width: 80 }} />
          <button className="ctl sm" data-testid="desk-add-criterion"
                  disabled={!says.trim()}
                  onClick={async () => {
                    if (await act({ action: 'criterion', says, outOf })) setSays('');
                  }}>Publish it</button>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 *  Who marks.
 * ------------------------------------------------------------------ */

/**
 * NAMES, AND THE PAGE SAYS SO. One account exists on an
 * installation; this records who a judgement is attributed to and
 * does not pretend they signed in. Saying that on the page is
 * cheaper than a reader assuming otherwise. [§4]
 */
function Panel(
  { call, act }: { call: Call; act: (body: Record<string, unknown>) => Promise<boolean> },
) {
  const [name, setName] = useState('');
  const shut = call.state === 'results' || call.state === 'completed';
  return (
    <section>
      <h2 className="small muted" style={HEAD}>Who marks</h2>
      {call.panel.length === 0 ? (
        <p className="small muted" data-testid="desk-no-panel" style={{ margin: '0 0 8px' }}>
          Nobody yet. Nothing can be marked until somebody is named.
        </p>
      ) : (
        <ul data-testid="desk-panel" style={LIST}>
          {call.panel.map((one) => (
            <li key={one.id} data-testid="desk-judge" style={ROW}>{one.name}</li>
          ))}
        </ul>
      )}
      {!shut && (
        <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input data-testid="desk-judge-name" value={name}
                 placeholder="Who is marking"
                 onChange={(e) => setName(e.target.value)}
                 style={{ flex: '1 1 180px', minWidth: 0 }} />
          <button className="ctl sm" data-testid="desk-add-judge"
                  disabled={!name.trim()}
                  onClick={async () => {
                    if (await act({ action: 'panel', name })) setName('');
                  }}>Add</button>
        </div>
      )}
      <p className="small muted" style={{ margin: '8px 0 0' }}>
        These are names on a record, not accounts. What is written down is
        who a judgement is attributed to.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 *  Marking.
 * ------------------------------------------------------------------ */

function Marking({ call, entries, open, onDone }: {
  call: Call; entries: Entry[]; open: boolean; onDone: () => Promise<void>;
}) {
  return (
    <section>
      <h2 className="small muted" style={HEAD}>Entries</h2>
      {!open && (
        <p className="small muted" data-testid="desk-not-judging" style={{ margin: '0 0 8px' }}>
          Marking opens when this call reaches judging.
        </p>
      )}
      {entries.length === 0 ? (
        <p className="small muted" data-testid="desk-no-entries" style={{ margin: 0 }}>
          Nothing to mark. An entry appears here when the person who made it
          agreed that it could be shown.
        </p>
      ) : (
        <ul data-testid="desk-entries" style={{ ...LIST, gap: 'var(--space-4)' }}>
          {entries.map((entry, index) => (
            <Entry key={entry.submissionId} call={call} entry={entry}
                   index={index} open={open} onDone={onDone} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One entry, with what each judge said and a form for the next.
 *
 * THE FORM IS REFUSED BEFORE IT IS SENT. `judgementProblem` is
 * the domain's own predicate, imported here rather than
 * reimplemented, so the button greys for exactly the reasons the
 * write would refuse — every criterion marked, a judge on the
 * panel, a reason in words. One rule, two callers. [D-19]
 */
function Entry({ call, entry, index, open, onDone }: {
  call: Call; entry: Entry; index: number; open: boolean;
  onDone: () => Promise<void>;
}) {
  const [by, setBy] = useState('');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [says, setSays] = useState('');
  const [said, setSaid] = useState<string | null>(null);

  /* What this judge already said, so a correction opens on it. */
  const mine = entry.judgements.find((one) => one.by === by);
  useEffect(() => {
    if (!mine) return;
    setScores(Object.fromEntries(mine.marks.map((m) => [m.criterion, m.score])));
    setSays(mine.says);
  }, [mine?.id]);

  const marks: Mark[] = useMemo(() => call.scorecard.map((one) => ({
    criterion: one.id, score: scores[one.id] ?? NaN,
  })), [call.scorecard, scores]);

  const wrong = judgementProblem({
    criteria: call.scorecard, panel: call.panel, by, marks, says,
  });

  const send = useCallback(async () => {
    setSaid(null);
    const response = await fetch(`/api/campaigns/${call.id}/judgements`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entry: entry.submissionId, by, marks, says }),
    }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      setSaid(typeof data?.error === 'string' ? data.error : 'that did not work');
      return;
    }
    await onDone();
  }, [by, call.id, entry.submissionId, marks, onDone, says]);

  return (
    <li data-testid="desk-entry" style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: 'var(--space-3)', border: '1px solid var(--line)',
      borderRadius: 'var(--radius-md)', background: 'var(--console-control)',
    }}>
      <div className="row" style={{ gap: 'var(--space-3)', alignItems: 'flex-start' }}>
        {/*
          * THE ENTRY ITSELF, THROUGH THE PUBLIC ROUTE IT IS ALREADY
          * SERVED BY. A second media path for the organiser would
          * be a second set of rules about who may see what, and
          * this page is only ever open to the owner. [D-19]
          */}
        <video data-testid="desk-entry-media" controls preload="metadata"
               src={`/api/go/${call.slug ?? call.id}/entries/`
                 + `${encodeURIComponent(entry.submissionId)}/media`}
               /*
                 * `--radius-screen` AND NOT A CARD'S CORNER, which
                 * the design suite refused outright: *"a picture
                 * rounded like a card"* is the signal it watches
                 * for, and a monitor is not a tile. The producer's
                 * own inbox player is already drawn this way.
                 */
               style={{
                 width: 160, aspectRatio: '3 / 4', objectFit: 'cover',
                 background: 'var(--screen-bed)',
                 borderRadius: 'var(--radius-screen)',
               }} />
        <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontWeight: 'var(--weight-semi)' }}>
            {entry.participant ?? `Entry ${index + 1}`}
          </span>
          {entry.judgements.length === 0 ? (
            <span className="small muted">Nobody has marked this yet.</span>
          ) : (
            <ul style={{ ...LIST, gap: 4 }}>
              {entry.judgements.map((one) => (
                <li key={one.id} className="small" data-testid="desk-judgement">
                  <strong>{call.panel.find((j) => j.id === one.by)?.name ?? 'somebody'}</strong>
                  {': '}
                  {one.marks.reduce((all, m) => all + m.score, 0)}
                  {' — '}
                  <span className="muted">{one.says}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <select data-testid="desk-entry-judge" value={by}
                  onChange={(e) => { setBy(e.target.value); setScores({}); setSays(''); }}>
            <option value="">Marking as…</option>
            {call.panel.map((one) => (
              <option key={one.id} value={one.id}>{one.name}</option>
            ))}
          </select>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {call.scorecard.map((one) => (
              <label key={one.id} className="small" data-testid="desk-mark"
                     style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {one.says}
                <input type="number" min={0} max={one.outOf} style={{ width: 70 }}
                       value={scores[one.id] ?? ''}
                       onChange={(e) => setScores((was) => ({
                         ...was, [one.id]: Number(e.target.value),
                       }))} />
                <span className="muted">/ {one.outOf}</span>
              </label>
            ))}
          </div>
          <textarea data-testid="desk-entry-says" rows={2} value={says}
                    placeholder="Why — in words. A score without one is not a judgement."
                    onChange={(e) => setSays(e.target.value)} />
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <button className="ctl sm primary" data-testid="desk-mark-send"
                    disabled={Boolean(wrong)} onClick={() => void send()}>
              {mine ? 'Change this mark' : 'Record it'}
            </button>
            {wrong && (
              <span className="small muted" data-testid="desk-mark-wrong">{wrong}</span>
            )}
          </div>
          {said && (
            <span className="small" style={{ color: 'var(--ink-on-bad)' }}>{said}</span>
          )}
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ *
 *  What it adds up to.
 * ------------------------------------------------------------------ */

/**
 * DERIVED ON EVERY READ AND STORED NOWHERE, which is the stage's
 * judging criterion: *"the result recomputes exactly from the
 * stored judgements."* Nothing on this page writes a standing,
 * and correcting one mark moves it.
 */
function Results(
  { call, results, entries }: { call: Call; results: Verdict[]; entries: Entry[] },
) {
  /*
   * THE POSITION IS DRAWN AND NOT LEFT TO THE LIST.
   *
   * FOUND IN A SCREENSHOT: `list-style: decimal` draws no marker
   * on a `display: flex` item, so a standing came out as two
   * rows with nothing saying which was first — which is the one
   * thing a result is.
   */
  const nameOf = (submissionId: string) => {
    const found = entries.findIndex((one) => one.submissionId === submissionId);
    return entries[found]?.participant ?? `Entry ${found + 1}`;
  };
  return (
    <section>
      <h2 className="small muted" style={HEAD}>What it adds up to</h2>
      {results.length === 0 ? (
        <p className="small muted" data-testid="desk-no-results" style={{ margin: 0 }}>
          Nothing has been marked yet.
        </p>
      ) : (
        <ol data-testid="desk-results" style={{ ...LIST, listStyle: 'none' }}>
          {results.map((one, place) => (
            <li key={one.entry} data-testid="desk-result" style={ROW}>
              <span className="mono muted" style={{ minWidth: '1.5em' }}>
                {place + 1}
              </span>
              <span className="grow">{nameOf(one.entry)}</span>
              <span className="small muted">{verdictSays(one)}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="small muted" style={{ margin: '8px 0 0' }}>
        Worked out from the judgements above, every time this page is read.
        Nothing stores a standing, so correcting a mark moves it.
        {call.scorecard.length > 0
          && ` Out of ${call.scorecard.reduce((all, one) => all + one.outOf, 0)}.`}
      </p>
    </section>
  );
}

const LIST: React.CSSProperties = {
  listStyle: 'none', margin: 0, padding: 0,
  display: 'flex', flexDirection: 'column', gap: 6,
};

const ROW: React.CSSProperties = {
  display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px',
  border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
};
