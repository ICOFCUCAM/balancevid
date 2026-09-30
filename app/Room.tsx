import Link from 'next/link';

import Icon, { type IconName } from './Icon.js';
import Still from './Still.js';
import { BuildingRail, type SpaceReading } from './Rail.js';
import type { Room as TheRoom } from '../src/domain/rooms.js';

/**
 * The front door of a production room.
 *   [D-19, D-24, U-19; DESIGN "the rooms"]
 *
 * *"When you click Conversation Studio on the Home this is where you
 * enter. It does not look professional… It looks more like an internal
 * prototype or setup page."*
 *
 * THE DIAGNOSIS WAS COMPOSITION, NOT COLOUR, and the largest part of it
 * was that a room was not inside the building at all: no rail, no way to
 * the other two rooms, one "Home" link back out, and the working area
 * occupying the top fifth of a black screen. A person standing in Studio
 * One could not see that Studio Two existed.
 *
 * SO A ROOM IS NOW THE BUILDING WITH A ROOM IN IT. The rail is the same
 * one the home page draws, from the same file. What changes between the
 * three is what `rooms.ts` says: the photograph, the label, the stages,
 * the sentence.
 *
 * AND THE IDENTITY IS THE SIZE OF AN IDENTITY. `SOURCE → RESPONSE` was a
 * grey eyebrow in small caps above a form; it is the largest thing on the
 * page now, over the room's own photograph, because it is what the room
 * IS. The author's note: *"the most important concept is too small."*
 */
export default function Room({
  room, owned, space, libraryCount, heroHref, start, children, head = 'photo',
}: {
  room: TheRoom;
  /**
   * WHETHER THIS ROOM'S IDENTITY SITS ON A PHOTOGRAPH.
   *
   * *"Don't force Online TV to copy the other studios… their entry
   * experiences should be different."* A studio opens on an invitation
   * to start something, and a photograph of the room is the right way
   * to say what kind of work that is. A control room opens on a system
   * that is already running: the first thing under the title should be
   * the channel, not a picture of a gallery. So the third room states
   * its identity as type on the page and gives the space to the desk.
   */
  head?: 'photo' | 'plain';
  owned: import('../src/domain/account.js').StudioId[];
  space: SpaceReading;
  libraryCount: number;
  heroHref?: string;
  /**
   * The way in — this room's own intake, where it has one.
   *
   * THE CONTROL ROOM HAS NONE AT THE TOP. Studio One and Studio Two open
   * on "start something"; a channel is already running whether or not
   * anybody is standing here, so Online TV opens on what it is doing and
   * puts making another one at the bottom. [CHANNEL §4]
   */
  start: React.ReactNode;
  /** What has been made here. */
  children: React.ReactNode;
}) {
  return (
    <div className="building" style={{ background: 'var(--ink-900)' }}>
      <BuildingRail owned={owned} libraryCount={libraryCount} space={space}
                    current={room.id}
                    {...(heroHref ? { heroHref } : {})} />

      <div className="building-shell">
        {/*
          * WHERE YOU ARE, AND THAT THE ROOM IS READY.
          *
          * The author's own sketch has this line: `Home / Studio One
          * • Ready`. It is a breadcrumb rather than a back button
          * because the rail is the way out now — and "Ready" is not
          * decoration, it is the one thing a production room should say
          * about itself before you ask it to do anything.
          */}
        <div className="room-bar">
          <span className="row" style={{ gap: 6, minWidth: 0 }}>
            <Link href="/" data-testid="back-home" style={{
              textDecoration: 'none', color: 'var(--ink-400)',
            }}>Home</Link>
            <span aria-hidden="true" style={{ color: 'var(--ink-450)' }}>/</span>
            <span style={{ color: 'var(--ink-100)' }}>{room.tab}</span>
          </span>
          <span className="grow" />
          {/*
            * A CHIP, NOT A SENTENCE. It is a status indicator and it
            * reads as one: bordered, lettered wide, with the lamp that
            * every other state in this product carries beside the word.
            */}
          <span data-testid="room-ready" className="room-ready">
            <span aria-hidden="true" className="room-ready-dot" />
            {room.ready}
          </span>
        </div>

        <div className="building-body" id="top">
          {/* ---- the room, said at the size it deserves ------------ */}
          {head === 'plain' ? (
            <section data-testid="room-hero" className="room-head">
              <p className="room-hero-label">{room.label}</p>
              <h1 data-testid="room-stages" className="room-hero-stages">
                {room.stages.map((stage, index) => (
                  <span key={stage} className="row" style={{ gap: 12 }}>
                    {index > 0 && (
                      <span aria-hidden="true" style={{ color: 'var(--ink-400)' }}>
                        <Icon name="arrow" size={20} />
                      </span>
                    )}
                    {stage}
                  </span>
                ))}
              </h1>
              <p data-testid="room-says" className="room-hero-says">{room.says}</p>
            </section>
          ) : (
          <section data-testid="room-hero" className="room-hero">
            <img alt="" src={room.art} className="room-hero-art"
                 style={{ objectPosition: room.focus }} />
            {/*
              * THE PHOTOGRAPH IS A GROUND, NOT A PICTURE TO LOOK AT.
              * Type sits on it, so it is washed in the room's colour and
              * darkened from the left — the same veil the home page's
              * cards use, at the strength that keeps 4.5:1 under white.
              */}
            <span aria-hidden="true" className="room-hero-veil"
                  style={{ background: room.veil }} />
            <span aria-hidden="true" className="room-hero-shade" />
            <div className="room-hero-said">
              <p className="room-hero-label">{room.label}</p>
              <h1 data-testid="room-stages" className="room-hero-stages">
                {room.stages.map((stage, index) => (
                  <span key={stage} className="row" style={{ gap: 12 }}>
                    {index > 0 && (
                      <span aria-hidden="true" style={{ color: 'var(--ink-300)' }}>
                        <Icon name="arrow" size={20} />
                      </span>
                    )}
                    {stage}
                  </span>
                ))}
              </h1>
              <p data-testid="room-says" className="room-hero-says">{room.says}</p>
            </div>
          </section>
          )}

          {start}
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * The way into a room, as production actions rather than a form.
 *
 * *"Four equal boxes make it feel like a form. Studio One is supposed to
 * be a production environment, not merely an intake form."*
 *
 * What changed is the framing and not the four things: a titled panel
 * that says what pressing one of these begins, and each action carrying
 * its own glyph in the room's colour so the row reads as four doors
 * rather than four fields.
 */
export function NewWork({
  title, says, children, footnote, laid = 'doors',
}: {
  title: string;
  says: string;
  children: React.ReactNode;
  /**
   * `doors` for a row of equal choices; `plain` when the room's way in
   * is a sequence rather than a choice.
   *
   * STUDIO TWO IS NOT STUDIO ONE WITH DIFFERENT WORDING. One offers
   * four ways in and the other offers an order — the song, then takes,
   * then the timeline, then the master. Putting both through the same
   * equal-columns grid is what left a four-step list and a file field
   * sharing two columns, with the field stretched to the height of the
   * list beside it.
   */
  laid?: 'doors' | 'plain';
  /**
   * Small print, at the bottom, quiet.
   *
   * The deferred live source used to sit under the four doors in the
   * same weight as everything else. *"It should not be prominent in the
   * production UI. It exposes implementation gaps rather than presenting
   * the product."* It is still said — this product does not hide what it
   * cannot do — but it is said last and small.
   */
  footnote?: React.ReactNode;
}) {
  return (
    <section data-testid="new-work" className="panel room-new">
      <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
        <span aria-hidden="true" className="room-new-mark">
          <Icon name="plus" size={16} />
        </span>
        <span className="grow" style={{ minWidth: 0 }}>
          <h2 className="room-new-title">{title}</h2>
          <p className="room-new-says">{says}</p>
        </span>
      </div>
      <div className={laid === 'doors' ? 'room-doors' : 'room-plain'}>{children}</div>
      {footnote && <p className="room-new-foot">{footnote}</p>}
    </section>
  );
}

/** One way in. */
export function Door({
  icon, tone, label, says, onSelect, href, chosen, testId, way,
}: {
  icon: IconName;
  /** The colour of the tile, so four doors are four things. */
  tone: string;
  label: string;
  says: string;
  onSelect?: () => void;
  href?: string;
  chosen?: boolean;
  testId?: string;
  way?: string;
}) {
  const inside = (
    <>
      <span aria-hidden="true" className="room-door-mark"
            style={{ background: tone }}><Icon name={icon} size={17} /></span>
      <span className="room-door-label">{label}</span>
      <span className="room-door-says">{says}</span>
      <span aria-hidden="true" className="room-door-go">
        <Icon name="arrow" size={14} />
      </span>
    </>
  );
  const shared = {
    className: chosen ? 'room-door is-chosen' : 'room-door',
    ...(testId ? { 'data-testid': testId } : {}),
    ...(way ? { 'data-way': way } : {}),
  };
  return href
    ? <Link href={href} {...shared}>{inside}</Link>
    : <button type="button" {...shared} aria-pressed={chosen}
              onClick={onSelect}>{inside}</button>;
}

/** One thing made in a room, as a card. */
export interface RoomCard {
  id: string;
  href: string;
  poster: string | null;
  title: string;
  /** What kind of thing it is — "Video", "Audio", "Screen", "YouTube". */
  from: string;
  under: string;
  when: string;
  /** "Published", or nothing. */
  state?: string | null;
  live?: boolean;
}

/**
 * What has been made in this room.
 *
 * CARDS RATHER THAN A TABLE, because a production room's own work is
 * the thing you recognise by its picture — which is the one column a
 * table made smallest. The row version is still right on the home page,
 * where three kinds of work are mixed and the kind matters more than
 * the frame. [DESIGN]
 */
export function RoomWork({
  rows, heading, empty, emptySays, more,
}: {
  rows: RoomCard[];
  heading: string;
  empty: string;
  emptySays: string;
  more?: React.ReactNode;
}) {
  /*
   * A LIST WHOSE ROWS CANNOT HAVE A PICTURE KEEPS NO WELL FOR ONE.
   *
   * A channel is a schedule, not a thing with a first frame, so the
   * control room was about to show one big empty 16:9 rectangle per
   * channel — the same fault the row version had as a column of empty
   * wells, in a larger size. Where SOME rows have a picture the well
   * stays, because then the gap is information.
   */
  const pictures = rows.some((one) => one.poster !== null);

  return (
    <section style={{ marginTop: 26 }}>
      <div className="row" style={{
        margin: '0 0 12px', flexWrap: 'nowrap', alignItems: 'baseline', gap: 12,
      }}>
        <h2 className="grow" style={{
          margin: 0, minWidth: 0, fontSize: 'var(--text-lg)',
          letterSpacing: 'var(--tracking-tight)',
        }}>{heading}</h2>
        {more}
      </div>

      {rows.length === 0 ? (
        /*
          * AN EMPTY PROFESSIONAL WORKSPACE, NOT AN UNFINISHED PROGRAM.
          * *"Nothing here yet"* read as a page that had failed to load
          * something. A panel with the room's own glyph in it, a title
          * and one instruction reads as a room waiting for a project.
          */
        <div data-testid="nothing-yet" className="panel room-empty">
          <span aria-hidden="true" className="room-empty-mark">
            <Icon name="library" size={20} />
          </span>
          <strong className="room-empty-title">{empty}</strong>
          <span className="room-empty-says">{emptySays}</span>
        </div>
      ) : (
        <div data-testid="room-list" className="room-cards">
          {rows.map((one) => (
            <Link key={one.id} href={one.href} data-testid="room-row"
                  className={pictures ? 'panel room-card' : 'panel room-card room-card-flat'}>
              {pictures ? (
                <span aria-hidden="true" className="room-card-art">
                  <Still src={one.poster} />
                  <span className="room-card-kind">{one.from}</span>
                  {one.live && (
                    <span data-testid="row-live" className="room-card-live">
                      <span aria-hidden="true" /> ON AIR
                    </span>
                  )}
                </span>
              ) : (
                <span className="room-card-tags">
                  <span className="room-card-kind is-inline">{one.from}</span>
                  {one.live && (
                    <span data-testid="row-live" className="room-card-live is-inline">
                      <span aria-hidden="true" /> ON AIR
                    </span>
                  )}
                </span>
              )}
              <span className="room-card-said">
                <strong className="room-card-title">{one.title}</strong>
                <span className="room-card-under">{one.under}</span>
                <span className="row" style={{ gap: 8, marginTop: 8 }}>
                  <span className="room-card-when">{one.when}</span>
                  <span className="grow" />
                  {one.state && (
                    <span data-testid="room-fact" className="room-card-state">
                      {one.state}
                    </span>
                  )}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
