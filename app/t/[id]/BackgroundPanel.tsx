'use client';

import React, { useEffect, useRef, useState } from 'react';

import Icon from '../../Icon.js';
import { Section } from './ChannelStudio.js';
import { paintSet, paintSpace } from './spaceArt.js';
import { type LivePlate, PLATE_SECONDS } from './plate.js';
import {
  type Composition, CENTRED, NO_COMPOSITION, SPACE_SHELVES,
  drawable, whyNoBackdrop,
} from '../../../src/domain/composition.js';
import { SPACES_ARE_DRAWN, SPACE_LOOKS } from '../../../src/domain/environment.js';
import {
  type VirtualSet, VIRTUAL_SETS, holds, setById,
} from '../../../src/domain/virtualSet.js';

/**
 * Background and virtual set, per person.  [Doctrine CHANNEL §26, §27, C-14]
 *
 * *"Those look like decorative buttons, not a production-grade virtual-set
 *  system. I would not simply add more backgrounds. We need to build the
 *  underlying system properly."*
 *
 * WHAT THIS REPLACED was ten flat colour squares that wrote
 * `channel.identity.spaceId` — a field C-14 found is **read by nothing**.
 * Pressing one changed a swatch in this panel and nothing on the air.
 *
 * FOUR THINGS THE BRIEF ASKS FOR, IN ONE COLUMN:
 *
 *   A  a background library with real thumbnails, grouped
 *   B  per-person assignment, each participant independent
 *   C  the foreground: which key, how good it will be, and how to get one
 *   D  set positioning, so a host sits in the room rather than on it
 *
 * AND IT IS ONE PERSON AT A TIME, deliberately. Four people × four
 * controls in a 330-pixel column is a spreadsheet; a person picker at the
 * top and one set of controls under it is a channel strip, which is what
 * a desk has always used for exactly this shape of problem. [§29]
 */

/* ------------------------------------------------------------------------ *
 *  A thumbnail that is the set.
 * ------------------------------------------------------------------------ */

function SpaceThumb({ spaceId, width = 92, height = 52 }: {
  spaceId: string; width?: number; height?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const look = SPACE_LOOKS[spaceId];
    const paper = ref.current?.getContext('2d');
    if (!look || !paper) return;
    /*
     * At the device's own resolution: a 92×52 canvas upscaled on a
     * retina screen is a blurred thumbnail of a picture that is about
     * how the light falls, which is the one thing blurring destroys.
     */
    const ratio = Math.min(3, window.devicePixelRatio || 1);
    ref.current!.width = Math.round(width * ratio);
    ref.current!.height = Math.round(height * ratio);
    paintSpace(paper, look, ref.current!.width, ref.current!.height);
  }, [spaceId, width, height]);
  return (
    <canvas ref={ref} aria-hidden="true" data-testid="space-thumb"
            data-space={spaceId}
            style={{ width: '100%', height: '100%', display: 'block' }} />
  );
}

/**
 * A thumbnail that is the SCENE, furniture and all.
 *
 * The same two passes the mixer runs, at 108×61: the room, the riser and
 * the screens, then the desk over where the people would be. A person
 * choosing News Desk sees a desk. [§27]
 */
function SetThumb({ set, width = 108, height = 61 }: {
  set: VirtualSet; width?: number; height?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const paper = ref.current?.getContext('2d');
    if (!paper) return;
    const ratio = Math.min(3, window.devicePixelRatio || 1);
    ref.current!.width = Math.round(width * ratio);
    ref.current!.height = Math.round(height * ratio);
    paintSet(paper, set, ref.current!.width, ref.current!.height, 'behind');
    paintSet(paper, set, ref.current!.width, ref.current!.height, 'front');
  }, [set, width, height]);
  return (
    <canvas ref={ref} aria-hidden="true" data-testid="set-thumb"
            data-set={set.id}
            style={{ width: '100%', height: '100%', display: 'block' }} />
  );
}

/* ------------------------------------------------------------------------ *
 *  A slider that says what it is.
 * ------------------------------------------------------------------------ */

function Dial({
  label, value, min, max, step, format, onChange, testid,
}: {
  label: string; value: number; min: number; max: number; step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  testid: string;
}) {
  return (
    <label className="col" style={{ gap: 2, minWidth: 0 }}>
      <span className="row" style={{ gap: 6, minWidth: 0 }}>
        <span className="grow muted" style={{
          fontSize: 'var(--text-2xs)', minWidth: 0,
        }}>{label}</span>
        {/* The NUMBER, because a slider with no readout is a control you
            cannot return to a value you liked. [U-19] */}
        <span className="mono" style={{
          flex: '0 0 auto', fontSize: 'var(--text-2xs)',
          color: 'var(--ink-200)',
        }}>{format(value)}</span>
      </span>
      <input
        type="range" data-testid={testid}
        min={min} max={max} step={step} value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
      />
    </label>
  );
}

/* ------------------------------------------------------------------------ *
 *  The panel.
 * ------------------------------------------------------------------------ */

export interface Composited {
  id: string;
  label: string;
  composition: Composition;
  plate?: LivePlate | null;
  greenScreen?: boolean;
}

export default function BackgroundPanel({
  people, chosen, onChoose, onChange, onPlate, onGreenScreen, busy,
  setId, onSet,
}: {
  /** The station's own studio, if it has one. [§27, §13] */
  setId?: string;
  onSet: (setId: string) => void;
  /** Everybody in the mix: the host first, then the Room's staging order. */
  people: Composited[];
  chosen: string | null;
  onChoose: (id: string) => void;
  onChange: (id: string, composition: Composition) => void;
  onPlate: (id: string) => void;
  onGreenScreen: (id: string, on: boolean) => void;
  /** A plate is being taken for this person right now. */
  busy: string | null;
}) {
  const [shelf, setShelf] = useState<string>('studio');
  const person = people.find((one) => one.id === chosen) ?? people[0] ?? null;

  if (!person) {
    return (
      <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-2xs)' }}>
        Nobody is in the picture yet. Go live, and the set applies to whoever
        is on stage.
      </p>
    );
  }

  const composition = person.composition;
  const set = (over: Partial<Composition>) =>
    onChange(person.id, { ...composition, ...over });
  const cannot = whyNoBackdrop(composition.key);
  const open = SPACE_SHELVES.find((one) => one.id === shelf) ?? SPACE_SHELVES[0]!;

  const scene = setById(setId);

  return (
    <div className="col" style={{ gap: 0, minWidth: 0 }}>
      {/* ---- §27. THE STATION'S SET ------------------------------------ */}
      {/*
        * *"Background and Virtual Set should not be the same thing.
        * Background simply replaces what's behind a person. Virtual Set
        * is a complete production scene."*
        *
        * So they are two sections, and the set is first, because it is
        * the studio: it decides the room, where people stand, what is in
        * front of them and how they are lit. A background is what one
        * person has behind them when there is no studio to put them in.
        */}
      <Section text="Virtual set" aside={(
        <span className="muted" style={{ fontSize: 'var(--text-2xs)' }}>
          {scene ? `${holds(scene)} on set` : 'None'}
        </span>
      )} />
      <div style={{
        display: 'grid', gap: 5,
        gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
      }}>
        {VIRTUAL_SETS.map((one) => {
          const on = one.id === setId;
          return (
            <button
              key={one.id} type="button"
              data-testid="virtual-scene" data-set={one.id}
              data-chosen={on ? 'true' : 'false'}
              aria-pressed={on}
              onClick={() => onSet(on ? '' : one.id)}
              title={one.says}
              style={{
                padding: 0, position: 'relative', aspectRatio: '16 / 9',
                borderRadius: 'var(--radius-screen)', overflow: 'hidden',
                cursor: 'pointer', background: 'var(--screen-bed)',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--console-seam)'}`,
                borderTopWidth: on ? 2 : 1,
                opacity: on ? 1 : 0.88,
              }}
            >
              <SetThumb set={one} />
              <span style={{
                position: 'absolute', left: 0, right: 0, bottom: 0,
                padding: '2px 3px', textAlign: 'center',
                fontSize: 'var(--text-2xs)', lineHeight: '12px',
                background: 'rgba(0,0,0,0.72)',
                color: on ? 'var(--ink-000)' : 'var(--ink-100)',
                overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>{one.label}</span>
            </button>
          );
        })}
      </div>
      {scene && (
        <p className="small muted" data-testid="set-says" style={{
          margin: '6px 0 0', fontSize: 'var(--text-2xs)',
        }}>{scene.says}</p>
      )}

      {/* ---- B. WHO ---------------------------------------------------- */}
      <Section text="Who" aside={(
        <span className="muted" style={{ fontSize: 'var(--text-2xs)' }}>
          {people.length} in the picture
        </span>
      )} />
      {/*
        * EVERY PERSON WEARS THEIR OWN ANSWER. *"So each participant can
        * have an independent background."* The row says who, and what
        * they are currently composited into, so the operator does not
        * have to click through four people to find the one still sitting
        * in their kitchen. [§26 B]
        */}
      <div className="col" data-testid="composite-people" style={{ gap: 2 }}>
        {people.map((one) => {
          const mine = one.id === person.id;
          const backdrop = one.composition.backdrop;
          const says = backdrop.kind === 'space'
            ? SPACE_LOOKS[backdrop.spaceId]?.label ?? backdrop.spaceId
            : backdrop.kind === 'blur' ? 'Blurred' : 'Their own room';
          return (
            <button
              key={one.id} type="button" className="row"
              data-testid="composite-person" data-person={one.id}
              data-chosen={mine ? 'true' : 'false'}
              aria-pressed={mine}
              onClick={() => onChoose(one.id)}
              style={{
                width: '100%', gap: 6, minWidth: 0, padding: '4px 6px',
                textAlign: 'left', font: 'inherit', color: 'inherit',
                border: `1px solid ${mine ? 'var(--accent)' : 'transparent'}`,
                borderRadius: 'var(--radius-xs)',
                background: mine ? 'var(--console-control)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <span className="grow" style={{
                minWidth: 0, fontSize: 'var(--text-xs)',
                overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>{one.label}</span>
              <span className="muted" style={{
                flex: '0 0 auto', fontSize: 'var(--text-2xs)',
                /* Amber where a set is chosen that cannot be drawn: it is
                   showing their room, and the panel should not pretend
                   otherwise on a row the operator is scanning. */
                color: drawable(one.composition)
                  ? 'var(--ink-400)' : 'var(--state-mute-ink)',
              }}>{says}</span>
            </button>
          );
        })}
      </div>

      {/* ---- A. THE BACKGROUND LIBRARY --------------------------------- */}
      {/*
        * AND IT SAYS WHEN IT DOES NOT APPLY. With a set on, everybody is
        * cut out of their own room and placed in the station's, so a
        * per-person backdrop decides nothing — and a shelf of swatches
        * that changes nothing is the fault this whole panel replaced.
        * The separation and the positioning below still apply, because
        * they are about the person rather than the room. [§27, U-19]
        */}
      {scene ? (
        <>
          <Section text="Background" aside={(
            <button
              type="button" className="ctl" data-testid="drop-set"
              onClick={() => onSet('')}
              style={{ padding: '1px 6px', fontSize: 'var(--text-2xs)' }}
            >Leave the set</button>
          )} />
          <p className="small muted" data-testid="set-provides" style={{
            margin: 0, fontSize: 'var(--text-2xs)',
          }}>
            {scene.label} is providing the room, so each person is composited
            into it rather than into a background of their own.
          </p>
        </>
      ) : (
      <>
      <Section text="Background / Set" aside={(
        <span className="row" style={{ gap: 4 }}>
          {[{ id: 'none', label: 'Their room' }, { id: 'blur', label: 'Blur' }]
            .map((option) => {
              const on = composition.backdrop.kind === option.id;
              return (
                <button
                  key={option.id} type="button" className="ctl"
                  data-testid={`backdrop-${option.id}`}
                  aria-pressed={on}
                  onClick={() => set({
                    backdrop: option.id === 'none'
                      ? { kind: 'none' } : { kind: 'blur' },
                  })}
                  style={{
                    padding: '2px 6px', fontSize: 'var(--text-2xs)',
                    borderColor: on ? 'var(--accent)' : undefined,
                  }}
                >{option.label}</button>
              );
            })}
        </span>
      )} />

      {/*
        * THREE SHELVES, ONE OPEN. *"Studio / Performance / Places."*
        * Eleven thumbnails at a readable size is four hundred pixels of
        * column; one shelf at a time is the same library in a hundred,
        * and the shelf a person is looking for is named. [§26 A, §29]
        */}
      <div className="row" data-testid="space-shelves" style={{ gap: 4, marginBottom: 6 }}>
        {SPACE_SHELVES.map((one) => (
          <button
            key={one.id} type="button" className="ctl"
            data-testid="space-shelf" data-shelf={one.id}
            aria-pressed={one.id === shelf}
            onClick={() => setShelf(one.id)}
            title={one.says}
            style={{
              flex: 1, padding: '3px 4px', fontSize: 'var(--text-2xs)',
              borderColor: one.id === shelf ? 'var(--accent)' : undefined,
            }}
          >{one.label}</button>
        ))}
      </div>

      <div style={{
        display: 'grid', gap: 5,
        gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
      }}>
        {open.spaceIds.map((spaceId) => {
          const on = composition.backdrop.kind === 'space'
            && composition.backdrop.spaceId === spaceId;
          return (
            <button
              key={spaceId} type="button"
              data-testid="virtual-set" data-space={spaceId}
              data-chosen={on ? 'true' : 'false'}
              aria-pressed={on}
              onClick={() => set({ backdrop: { kind: 'space', spaceId } })}
              title={SPACE_LOOKS[spaceId]?.label}
              style={{
                padding: 0, position: 'relative', aspectRatio: '16 / 9',
                borderRadius: 'var(--radius-screen)', overflow: 'hidden',
                cursor: 'pointer', background: 'var(--screen-bed)',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--console-seam)'}`,
                borderTopWidth: on ? 2 : 1,
                opacity: on ? 1 : 0.88,
              }}
            >
              <SpaceThumb spaceId={spaceId} />
              <span style={{
                position: 'absolute', left: 0, right: 0, bottom: 0,
                padding: '2px 3px', textAlign: 'center',
                fontSize: 'var(--text-2xs)', lineHeight: '12px',
                letterSpacing: '-0.01em',
                background: 'rgba(0,0,0,0.72)',
                color: on ? 'var(--ink-000)' : 'var(--ink-100)',
                display: '-webkit-box', WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical', overflow: 'hidden',
                overflowWrap: 'break-word',
              }}>{SPACE_LOOKS[spaceId]?.label ?? spaceId}</span>
            </button>
          );
        })}
      </div>
      <p className="small muted" style={{
        margin: '6px 0 0', fontSize: 'var(--text-2xs)',
      }}>{SPACES_ARE_DRAWN}</p>
      </>
      )}

      {/* ---- C. THE FOREGROUND ----------------------------------------- */}
      <Section text="Separation" aside={(
        <span className="muted" style={{ fontSize: 'var(--text-2xs)' }}>
          {composition.key.kind === 'chroma' ? 'Green screen'
            : composition.key.kind === 'plate' ? 'Plate' : 'None'}
        </span>
      )} />
      {/*
        * SAID, NOT GREYED OUT. A disabled swatch teaches somebody the
        * feature is broken; a sentence teaches them what to do, and both
        * of the two things to do are one press. [S-6, U-19]
        */}
      {cannot && (
        <p className="small" data-testid="no-key" style={{
          margin: '0 0 6px', fontSize: 'var(--text-2xs)',
          color: 'var(--state-mute-ink)',
        }}>{cannot}</p>
      )}
      {person.plate && (
        <p className="small muted" data-testid="plate-verdict" style={{
          margin: '0 0 6px', fontSize: 'var(--text-2xs)',
          color: person.plate.ok ? 'var(--ink-300)' : 'var(--state-mute-ink)',
        }}>{person.plate.says}</p>
      )}
      <div className="row" style={{ gap: 5 }}>
        <button
          className="ctl" type="button" data-testid="take-plate"
          disabled={busy === person.id}
          onClick={() => onPlate(person.id)}
          title={`Hold still with nobody in shot for about ${PLATE_SECONDS} `
            + 'seconds. The room is measured, not photographed to a server.'}
          style={{ flex: 1, padding: '5px 7px', fontSize: 'var(--text-2xs)' }}
        >
          {busy === person.id ? 'Measuring the room…'
            : person.plate ? 'Take the plate again' : 'Take a plate'}
        </button>
        <button
          className="ctl" type="button" data-testid="green-screen"
          aria-pressed={Boolean(person.greenScreen)}
          onClick={() => onGreenScreen(person.id, !person.greenScreen)}
          title="They have a green screen behind them, which keys better than
anything measured."
          style={{
            flex: 1, padding: '5px 7px', fontSize: 'var(--text-2xs)',
            borderColor: person.greenScreen ? 'var(--accent)' : undefined,
          }}
        >Green screen</button>
      </div>

      {/* ---- D. SET POSITIONING ---------------------------------------- */}
      <Section text="In the set" aside={(
        <button
          type="button" className="ctl" data-testid="frame-reset"
          onClick={() => set({ frame: CENTRED, light: 0 })}
          title="Put them back where they started"
          style={{ padding: '1px 6px', fontSize: 'var(--text-2xs)' }}
        >Reset</button>
      )} />
      <div className="col" style={{ gap: 7 }}>
        <Dial
          label="Across" testid="frame-x" value={composition.frame.x}
          min={0} max={1} step={0.01}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(x) => set({ frame: { ...composition.frame, x } })}
        />
        <Dial
          label="Up and down" testid="frame-y" value={composition.frame.y}
          min={0} max={1} step={0.01}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(y) => set({ frame: { ...composition.frame, y } })}
        />
        <Dial
          label="Size" testid="frame-scale" value={composition.frame.scale}
          min={0.4} max={2.5} step={0.01}
          format={(value) => `${value.toFixed(2)}×`}
          onChange={(scale) => set({ frame: { ...composition.frame, scale } })}
        />
        <Dial
          label="Crop from the top" testid="frame-crop"
          value={composition.frame.crop}
          min={0} max={0.6} step={0.01}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(crop) => set({ frame: { ...composition.frame, crop } })}
        />
        <Dial
          label="Lighting" testid="frame-light" value={composition.light}
          min={-1} max={1} step={0.02}
          format={(value) => (value === 0 ? 'As shot'
            : `${value > 0 ? '+' : ''}${value.toFixed(2)}`)}
          onChange={(light) => set({ light })}
        />
        <button
          type="button" className="ctl row" data-testid="frame-flip"
          aria-pressed={composition.frame.flip}
          onClick={() => set({
            frame: { ...composition.frame, flip: !composition.frame.flip },
          })}
          title="Mirror them, which is what most people expect of their own camera"
          style={{
            gap: 6, padding: '5px 7px', fontSize: 'var(--text-2xs)',
            justifyContent: 'center',
            borderColor: composition.frame.flip ? 'var(--accent)' : undefined,
          }}
        >
          <Icon name="expand" size={11} turn={90} />
          Mirror
        </button>
      </div>

      {/*
        * AND WHAT IS ACTUALLY HAPPENING, at the bottom, where a desk puts
        * its state. A set chosen that cannot be drawn is the one
        * condition this panel must never let pass silently — it is the
        * exact shape of the bug C-14 found. [U-19]
        */}
      {!drawable(composition) && (
        <p className="small" data-testid="not-composited" style={{
          margin: 'var(--space-4) 0 0', fontSize: 'var(--text-2xs)',
          color: 'var(--state-mute-ink)',
        }}>
          {person.label} is going out in their own room until there is
          something to separate them from it.
        </p>
      )}
      {drawable(composition) && composition.backdrop.kind !== 'none' && (
        <p className="small muted" data-testid="is-composited" style={{
          margin: 'var(--space-4) 0 0', fontSize: 'var(--text-2xs)',
        }}>
          Composited into the programme feed, not just this preview.
        </p>
      )}
    </div>
  );
}

export { NO_COMPOSITION };
