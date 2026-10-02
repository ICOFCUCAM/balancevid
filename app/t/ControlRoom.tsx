import Link from 'next/link';

import Icon from '../Icon.js';
import { type AirState, airMeans, airSays } from '../../src/domain/health.js';
import { NewWork } from '../Room.js';
import type { DestinationKind } from '../../src/domain/distribution.js';
import { MARK } from '../platformMark.js';

export interface OnTheAir {
  id: string;
  name: string;
  href: string;
  timezone: string;
  /** What the SCHEDULE says should be playing, or nothing. */
  scheduled: string | null;
  /** What the badge says, decided once in the domain. [C-31] */
  air: AirState;
  showing: string | null;
  /** Whether segments are actually arriving. */
  transmitting: boolean;
  /** The operator's sentence when those two disagree. */
  health: string | null;
  next: { title: string; at: number } | null;
  today: { at: number; title: string; minutes: number | null }[];
  inLoop: number;
  published: boolean;
  destinations: { kind: DestinationKind; label: string;
    state: 'connected' | 'off' | 'none' }[];
}

/**
 * Operating a channel, rather than filling in a form to make one.
 *   [CHANNEL §4, §15, §17, §18]
 *
 * *"The main Online TV page should be about operating channels, not
 * filling out a form."* And: *"don't force Online TV to copy the other
 * studios… their entry experiences should be different."*
 *
 * THE ORDER IS THE AUTHOR'S: channel state, preview, now and next, the
 * three controls, the channel list, the programming, then distribution.
 * Making a channel is at the bottom and folded away, because it is the
 * thing an operator does once.
 */
export default function ControlRoom({
  channels, make,
}: { channels: OnTheAir[]; make: React.ReactNode }) {
  const front = channels[0];

  if (!front) {
    /*
     * WITH NO CHANNEL THERE IS NOTHING TO OPERATE, so the form is the
     * page — this once. It is the only state in which the author's
     * objection does not apply, because there is no television system
     * to show yet.
     */
    return (
      <NewWork laid="plain" title="Start a channel"
               says="A channel plays what you have already made, round the clock.">
        <div className="room-intake">{make}</div>
      </NewWork>
    );
  }

  return (
    <>
      <ChannelDesk channel={front} />

      {/*
        * THE LIST IS THERE WITH ONE CHANNEL TOO. A section that appears
        * only on the second channel is a section nobody knows exists,
        * and the row carries what the desk above it does not: that this
        * is a continuous channel, and the way in.
        */}
      <section style={{ marginTop: 26 }}>
        <h2 className="room-section">Channels</h2>
        <div className="panel" data-testid="channel-list"
             style={{ padding: 0, marginTop: 10 }}>
          {channels.map((one, index) => (
            <Link key={one.id} href={one.href} className="tv-channel-row"
                  data-testid="room-row"
                  style={{ borderTop: index === 0 ? 'none'
                    : 'var(--border) solid var(--line)' }}>
              <span aria-hidden="true" className="tv-channel-mark">
                <Icon name="broadcast" size={16} />
              </span>
              <strong className="tv-channel-name">{one.name}</strong>
              <span className="tv-channel-state">
                <Lamp air={one.air} />
                <span className="tv-channel-under">Continuous channel</span>
              </span>
              <span className="tv-channel-next">
                <span className="tv-nownext-label">Next</span>
                {one.next
                  ? `${one.next.title} · ${clock(one.next.at)}`
                  : 'Nothing scheduled'}
              </span>
              <span className="grow" />
              <span className="tv-channel-open">
                Open <Icon name="arrow" size={13} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <Programming channel={front} />
      <Distribution channel={front} />

      {/*
        * AND MAKING ANOTHER ONE, LAST AND FOLDED.
        *
        * *"Channel creation can still exist, but it should be a
        * secondary action."* A `<details>` rather than a button that
        * reveals: the form is the content, and a disclosure is the one
        * control that says "there is more here" without needing state.
        */}
      <details data-testid="make-channel" className="panel tv-make">
        <summary className="tv-make-summary">
          <span aria-hidden="true"><Icon name="plus" size={13} /></span>
          Create another channel
        </summary>
        <div style={{ paddingTop: 12 }}>{make}</div>
      </details>
    </>
  );
}

/**
 * The channel itself, as the thing this page is about.
 *
 * *"I would make the channel itself the hero."*
 */
function ChannelDesk({ channel }: { channel: OnTheAir }) {
  return (
    <section data-testid="channel-desk" className="panel tv-desk">
      {/*
        * THE NAME AND THE STATE READ AS ONE THING, side by side, because
        * "BalanceVid TV, off air" is a single fact about a single channel
        * and putting the lamp at the far end of the panel makes the eye
        * cross an empty rule to finish the sentence.
        */}
      <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
        <strong className="tv-desk-name">{channel.name}</strong>
        <Lamp air={channel.air} />
      </div>

      {/*
        * WHEN THE TRANSMITTER AND THE SCHEDULE DISAGREE, SAY SO.
        *
        * This is the one line the control room never had. `healthSentence`
        * returns nothing when the engine is running and segments are
        * arriving, so it appears exactly when something is wrong — and it
        * is the same function the viewer's route calls, with the operator's
        * audience, so the two can never word it differently. [§18]
        */}
      {channel.health && (
        <p data-testid="channel-health" className="tv-desk-health">
          <span aria-hidden="true"><Icon name="warning" size={13} /></span>
          {channel.health}
        </p>
      )}

      <div className="tv-desk-grid">
        {/*
          * A STANDBY CARD, NOT A BLACK RECTANGLE.
          *
          * *"When the channel is off air, don't show an empty black
          * rectangle. Show a proper channel standby state."* Off air and
          * on air are the same area saying different things, which is
          * what gives a channel one identity across both.
          */}
        <div data-testid="channel-preview" className="tv-preview">
          <span aria-hidden="true" className="tv-preview-mark">
            <Icon name="broadcast" size={18} />
          </span>
          <span className="tv-preview-name">{channel.name}</span>
          {/*
            * ONE BADGE, FROM ONE DECISION. It used to read
            * `transmitting ? 'ON AIR' : …`, which asks the
            * transmitter, beside a NOW line that asks the schedule —
            * so a channel putting black out with nothing on it said
            * ON AIR above "Nothing currently on air". Both true, and
            * the pair a lie. [C-31]
            */}
          <span className="tv-preview-state" data-air={channel.air}>
            {airSays(channel.air)}
          </span>
          {/*
            * WHAT IS COMING, ON ONE LINE UNDER A RULE — the shape a
            * station ident has always had. Three stacked lines made the
            * card read as a form with three fields.
            */}
          {channel.next && (
            <span className="tv-preview-next">
              Next programme
              <span aria-hidden="true" className="tv-preview-sep">·</span>
              <strong>{channel.next.title}</strong>
              <span aria-hidden="true" className="tv-preview-sep">·</span>
              {clock(channel.next.at)}
            </span>
          )}
          {channel.transmitting && (
            <Link href={`${channel.href}/watch`} className="tv-preview-watch">
              Watch the output →
            </Link>
          )}
        </div>

        {/*
          * NOW, NEXT AND THE LOOP, each with the glyph for the kind of
          * fact it is — what is on a screen, what a clock says, what is
          * in a rotation. The label alone is small and grey; the glyph
          * is what makes the three scannable without reading. [U-19]
          */}
        <div className="tv-nownext">
          <Fact glyph="display" label="Now"
                said={channel.showing ?? 'Nothing currently on air'}
                why={channel.scheduled} />
          <Fact glyph="clock" label="Next"
                said={channel.next ? channel.next.title : 'Nothing scheduled'}
                why={channel.next ? clock(channel.next.at) : null} />
          <Fact glyph="loop" label="In the loop"
                said={`${channel.inLoop} ${channel.inLoop === 1 ? 'item' : 'items'}`}
                why={channel.timezone} />
        </div>
      </div>

      {/*
        * THREE RESTRAINED CONTROLS, and each goes somewhere that exists:
        * the control room, its live section, its schedule. No fourth that
        * would have to be built to justify the row.
        */}
      <div className="tv-controls">
        <Link href={channel.href} data-testid="open-channel" className="tv-key">
          <Icon name="play" size={13} /> Open channel
        </Link>
        <Link href={`${channel.href}#live`} className="tv-ctl">
          <Icon name="broadcast" size={13} /> Go live
        </Link>
        <Link href={`${channel.href}#schedules`} className="tv-ctl">
          <Icon name="calendar" size={13} /> Schedule
        </Link>
      </div>
    </section>
  );
}

/**
 * Today, by the clock.
 *
 * *"Online TV should have Programming, because the fundamental object
 * isn't a creative project; it's what the channel is doing over time."*
 */
function Fact({
  glyph, label, said, why,
}: {
  glyph: 'display' | 'clock' | 'loop';
  label: string; said: string; why: string | null;
}) {
  return (
    <div className="tv-fact">
      <span aria-hidden="true" className="tv-fact-mark">
        <Icon name={glyph === 'display' ? 'broadcast' : glyph} size={15} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="tv-nownext-label">{label}</span>
        <span className="tv-nownext-said">{said}</span>
        {why && <span className="tv-nownext-why">{why}</span>}
      </span>
    </div>
  );
}

function Programming({ channel }: { channel: OnTheAir }) {
  return (
    <section style={{ marginTop: 26 }}>
      <div className="row" style={{ gap: 12, alignItems: 'baseline' }}>
        <h2 className="grow room-section" style={{ margin: 0 }}>Programming</h2>
        <Link href={`${channel.href}#schedules`} className="small"
              style={{ color: 'var(--muted)' }}>View schedule →</Link>
      </div>
      {channel.today.length === 0 ? (
        <p className="muted" data-testid="nothing-today" style={{ marginTop: 10 }}>
          Nothing at a fixed time today.{' '}
          {channel.inLoop > 0
            ? `The loop fills the day — ${channel.inLoop} `
              + `${channel.inLoop === 1 ? 'item' : 'items'} in it.`
            : 'The loop is empty, so the channel has nothing to play.'}
        </p>
      ) : (
        <div className="panel" data-testid="programming"
             style={{ padding: 0, marginTop: 10, overflow: 'hidden' }}>
          {/*
            * A TABLE, WITH THE COLUMNS NAMED. Three numbers a broadcaster
            * reads down rather than across — when, what, how long — and
            * an unheaded row of three values makes the reader work out
            * which is which every time.
            */}
          <table className="tv-schedule">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Programme</th>
                <th scope="col">Duration</th>
              </tr>
            </thead>
            <tbody>
              {channel.today.map((slot) => (
                <tr key={`${slot.at}-${slot.title}`} data-testid="tv-slot">
                  <td className="tv-slot-at">{clock(slot.at)}</td>
                  <td className="tv-slot-title">{slot.title}</td>
                  <td className="tv-slot-runs">
                    {slot.minutes === null ? '—' : runs(slot.minutes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Where it goes, restrained.
 *
 * *"Not as a huge dashboard."* The home page has the full panel; this is
 * the same five states as a list, because an operator standing in the
 * control room wants to know whether anything is disconnected, not to
 * manage it from here.
 */
function Distribution({ channel }: { channel: OnTheAir }) {
  return (
    <section style={{ marginTop: 26 }}>
      <h2 className="room-section">Distribution</h2>
      {/*
        * ACROSS, NOT DOWN, AND EACH ONE RECOGNISABLE BEFORE IT IS READ.
        *
        * The marks are the product's own letterforms in the platform's
        * colour, from `platformMark.ts` — not the brands' logos. That is
        * a licensing decision this product took deliberately and wrote
        * down, and a benchmark drawn with real logos does not change it.
        * The state is a word as well as a dot. [U-19]
        */}
      <div className="tv-dests" data-testid="tv-distribution">
        {channel.destinations.map((one) => {
          const mark = MARK[one.kind] ?? MARK['own']!;
          return (
            <div key={one.kind} className="panel tv-dest">
              <span aria-hidden="true" className="tv-dest-mark"
                    style={{ background: mark.wash, color: mark.ink }}>
                {mark.text}
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="tv-dest-name">{one.label}</span>
                <span className="tv-dest-state">
                  <span aria-hidden="true" className={one.state === 'connected'
                    ? 'tv-dot is-on' : 'tv-dot'} />
                  {one.state === 'connected' ? 'Connected'
                    : one.state === 'off' ? 'Turned off' : 'Not connected'}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <Link href={`${channel.href}#distribution`} className="small"
            style={{ color: 'var(--muted)', display: 'inline-block', marginTop: 8 }}>
        Manage distribution →
      </Link>
    </section>
  );
}

/**
 * ON AIR means the transmitter, DUE means the schedule.
 *
 * Three states rather than two, because "the schedule says a programme is
 * playing and nothing is going out" is the condition a control room exists
 * to reveal, and a two-state lamp has nowhere to put it.
 */
function Lamp({ air }: { air: AirState }) {
  const on = air === 'on';
  const said = airMeans(air);
  return (
    /*
     * BLANK TAKES THE DUE LAMP, not the on one: the transmitter is
     * up, and the thing an operator should look at is the empty
     * schedule. Three colours and four states, which is the trade
     * `airSays` makes on purpose — a word is read faster than a
     * fourth colour is learnt. [D-04]
     */
    <span data-testid="channel-lamp" data-state={air} className="tv-lamp">
      <span aria-hidden="true" className={on ? 'tv-dot is-on'
        : air === 'off' ? 'tv-dot' : 'tv-dot is-due'} />
      {said}
    </span>
  );
}

/** `20:00`, in the reader's own clock. */
function clock(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function runs(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `0:${String(m).padStart(2, '0')}`;
}
