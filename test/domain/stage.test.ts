/**
 * Who is on stage.  [Doctrine ROOM §2, §3, §8]
 *
 * The brief's requirement is not "pick the active speaker" — it is that a
 * cough, a keyboard click or a noisy room must NOT make the screen jump. So
 * these tests are mostly about what must not happen, played out over time in
 * milliseconds rather than asserted on a single reading.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POLICY, decideStage, initialStageState, pin, resumeAutomatic,
  selectSpeaker, type StageState, type VoiceReading,
} from '../../src/domain/stage.js';
import type { ParticipantId } from '../../src/domain/participants.js';

const HOST = 'part_host' as ParticipantId;
const SARAH = 'part_sarah' as ParticipantId;
const DAVID = 'part_david' as ParticipantId;

const silent = (id: ParticipantId): VoiceReading =>
  ({ participantId: id, energy: 0.01, speechConfidence: 0.02 });
const speech = (id: ParticipantId, energy = 0.6): VoiceReading =>
  ({ participantId: id, energy, speechConfidence: 0.92 });
/** Loud and not a voice: a door, a keyboard, a chair. */
const noise = (id: ParticipantId, energy = 0.95): VoiceReading =>
  ({ participantId: id, energy, speechConfidence: 0.08 });

const TICK = 100;

/** Play readings through the policy, one tick at a time, and report the end. */
function play(
  state: StageState, frames: VoiceReading[][], startAt = 0,
): { state: StageState; active: (ParticipantId | null)[] } {
  let now = startAt;
  let current = state;
  const active: (ParticipantId | null)[] = [];
  for (const readings of frames) {
    const decision = decideStage(current, readings, now);
    current = decision.state;
    active.push(decision.active);
    now += TICK;
  }
  return { state: current, active };
}

/** N ticks of the same room. */
const hold = (reading: VoiceReading[], ticks: number) =>
  Array.from({ length: ticks }, () => reading);

describe('a cough must not take the stage (ROOM §2)', () => {
  it('ignores a loud, brief noise entirely', () => {
    const start = initialStageState(HOST);
    // Two ticks — 200ms — of a door slam from Sarah's room.
    const { active } = play(start, [
      ...hold([speech(HOST), silent(SARAH)], 10),
      ...hold([speech(HOST), noise(SARAH)], 2),
      ...hold([speech(HOST), silent(SARAH)], 10),
    ]);
    expect(new Set(active)).toEqual(new Set([HOST]));
  });

  it('ignores a cough even when it is a voice, because it is over too soon', () => {
    // High confidence, high energy, 300ms. Shorter than minSpeakingMs.
    const start = initialStageState(HOST);
    const { active } = play(start, [
      ...hold([speech(HOST), silent(SARAH)], 20),
      ...hold([speech(HOST), speech(SARAH, 0.99)], 3),
      ...hold([speech(HOST), silent(SARAH)], 10),
    ]);
    expect(active.every((id) => id === HOST)).toBe(true);
  });

  it('but gives the floor to speech that persists', () => {
    const start = initialStageState(HOST);
    const { active } = play(start, [
      ...hold([speech(HOST), silent(SARAH)], 20),
      // Sarah speaks over him, clearly and for more than a moment.
      ...hold([speech(HOST, 0.3), speech(SARAH, 0.85)], 20),
    ]);
    expect(active.at(-1)).toBe(SARAH);
  });
});

describe('a noisy room is not a talkative one (ROOM §2)', () => {
  it('judges a participant against their own noise floor', () => {
    const start = initialStageState(HOST);
    // David sits in a kitchen: constant 0.5 of extractor fan, no voice.
    const kitchen: VoiceReading = {
      participantId: DAVID, energy: 0.55, speechConfidence: 0.1, noiseFloor: 0.5,
    };
    const { active } = play(start, hold([speech(HOST), kitchen], 40));
    expect(active.at(-1)).toBe(HOST);
  });

  it('and still hears them when they speak above it', () => {
    const start = initialStageState(HOST);
    const kitchenVoice: VoiceReading = {
      participantId: DAVID, energy: 0.9, speechConfidence: 0.9, noiseFloor: 0.5,
    };
    const { active } = play(start, [
      ...hold([speech(HOST, 0.2), { ...kitchenVoice, energy: 0.5, speechConfidence: 0.1 }], 20),
      ...hold([speech(HOST, 0.2), kitchenVoice], 25),
    ]);
    expect(active.at(-1)).toBe(DAVID);
  });

  it('never stages someone who is muted, however loud their room', () => {
    const start = initialStageState(HOST);
    const loudMuted: VoiceReading = {
      participantId: SARAH, energy: 0.99, speechConfidence: 0.99, muted: true,
    };
    const { active } = play(start, hold([speech(HOST, 0.2), loudMuted], 40));
    expect(active.every((id) => id === HOST)).toBe(true);
  });
});

describe('two people talking at once must not strobe (ROOM §2)', () => {
  it('holds the stage when neither is clearly louder', () => {
    const start = initialStageState(HOST);
    // Both at the same level for four seconds, alternating by a hair.
    const frames: VoiceReading[][] = [];
    for (let i = 0; i < 40; i++) {
      frames.push([
        speech(HOST, 0.60 + (i % 2 === 0 ? 0.01 : -0.01)),
        speech(SARAH, 0.60 + (i % 2 === 0 ? -0.01 : 0.01)),
      ]);
    }
    const { active } = play(start, frames);
    // At most one change in four seconds of overlap — not twenty.
    const switches = active.filter((id, i) => i > 0 && id !== active[i - 1]).length;
    expect(switches).toBeLessThanOrEqual(1);
  });

  it('holds for the dwell even when someone louder arrives', () => {
    let state = initialStageState(HOST);
    // Sarah takes the floor.
    state = play(state, hold([speech(HOST, 0.2), speech(SARAH, 0.9)], 20)).state;
    const took = { ...state };
    expect(took.active).toBe(SARAH);

    // David, much louder, immediately after. The dwell holds the stage.
    const soon = decideStage(
      took,
      [speech(HOST, 0.1), speech(SARAH, 0.9), speech(DAVID, 0.99)],
      took.activeSince + 300,
    );
    expect(soon.active).toBe(SARAH);
    expect(soon.reason).toBe('held');
  });

  it('and moves once the dwell has passed and the margin is clear', () => {
    let state = initialStageState(HOST);
    state = play(state, hold([speech(HOST, 0.2), speech(SARAH, 0.9)], 20)).state;
    const after = play(
      state,
      hold([speech(HOST, 0.1), speech(SARAH, 0.3), speech(DAVID, 0.95)], 30),
      state.activeSince + DEFAULT_POLICY.dwellMs + TICK,
    );
    expect(after.active.at(-1)).toBe(DAVID);
  });
});

describe('the person speaking keeps the floor (ROOM §2)', () => {
  it('through a pause between sentences', () => {
    let state = initialStageState(HOST);
    state = play(state, hold([speech(SARAH, 0.8), silent(HOST)], 20)).state;
    expect(state.active).toBe(SARAH);
    // Half a second of breath. Nobody else is speaking.
    const { active } = play(state, hold([silent(SARAH), silent(HOST)], 5),
      state.activeSince + 2000);
    expect(active.every((id) => id === SARAH)).toBe(true);
  });

  it('and is not unseated by someone marginally louder', () => {
    let state = initialStageState(HOST);
    state = play(state, hold([speech(SARAH, 0.70), silent(HOST)], 20)).state;
    const { active } = play(state,
      hold([speech(SARAH, 0.70), speech(DAVID, 0.74)], 30),
      state.activeSince + DEFAULT_POLICY.dwellMs + TICK);
    // 0.04 above is not "clearly louder" — the margin is 0.12.
    expect(active.at(-1)).toBe(SARAH);
  });
});

describe('the host decides, and can take it back (ROOM §3)', () => {
  it('a pin outranks every microphone in the room', () => {
    let state = initialStageState(HOST);
    state = pin(state, SARAH);
    const { active, state: after } = play(state,
      hold([speech(HOST, 0.99), speech(DAVID, 0.95), silent(SARAH)], 40));
    expect(active.every((id) => id === SARAH)).toBe(true);
    expect(after.pinned).toBe(SARAH);
  });

  it('resuming automatic keeps the pinned person on stage while the room is quiet', () => {
    let state = initialStageState(HOST);
    state = pin(state, SARAH);
    state = play(state, hold([silent(HOST), silent(SARAH)], 10)).state;
    state = resumeAutomatic(state, 5000);
    expect(state.pinned).toBeNull();
    // Nobody is speaking, so nobody has earned the floor: Sarah keeps it
    // rather than the picture snapping back the instant the pin lifts.
    const quiet = play(state, hold([silent(HOST), silent(SARAH)], 10), 5100);
    expect(quiet.active.every((id) => id === SARAH)).toBe(true);
  });

  it('and hands it straight over to whoever is already speaking', () => {
    /*
     * The other half, and the one worth being explicit about: "resume
     * automatic" means go back to following the voice. If the host is
     * mid-sentence when the pin lifts, holding the picture on a silent Sarah
     * would be the pin still running under another name.
     */
    let state = initialStageState(HOST);
    state = pin(state, SARAH);
    state = play(state, hold([speech(HOST, 0.9), silent(SARAH)], 10)).state;
    state = resumeAutomatic(state, 5000);
    const speaking = decideStage(state, [speech(HOST, 0.9), silent(SARAH)], 5100);
    expect(speaking.active).toBe(HOST);
    expect(speaking.reason).toBe('took-floor');
  });

  it('manual mode moves for nothing but the host', () => {
    let state = initialStageState(HOST, 'manual');
    const { active } = play(state, hold([silent(HOST), speech(SARAH, 0.99)], 40));
    expect(active.every((id) => id === HOST)).toBe(true);

    state = selectSpeaker(state, SARAH, 4000);
    const after = play(state, hold([silent(SARAH), speech(DAVID, 0.99)], 40), 4100);
    expect(after.active.every((id) => id === SARAH)).toBe(true);
  });

  it('host mode keeps the host on stage whoever is talking', () => {
    const state = initialStageState(HOST, 'host');
    const { active } = play(state, hold([silent(HOST), speech(SARAH, 0.99)], 40));
    expect(active.every((id) => id === HOST)).toBe(true);
  });

  it('bringing someone in is the same act as selecting them (ROOM §8)', () => {
    // "Sarah wants to speak" → "Bring Sarah in" is selectSpeaker, not a
    // second mechanism. The composition engine is told who, not how.
    let state = initialStageState(HOST, 'automatic');
    state = selectSpeaker(state, SARAH, 1000);
    expect(state.active).toBe(SARAH);
    expect(state.pinned).toBeNull();
    // And automatic switching then takes over between them, as the brief says.
    const after = play(state, hold([speech(HOST, 0.95), silent(SARAH)], 30),
      1000 + DEFAULT_POLICY.dwellMs + TICK);
    expect(after.active.at(-1)).toBe(HOST);
  });
});

describe('an empty room', () => {
  it('shows the host when nobody has spoken at all', () => {
    const state = initialStageState(HOST);
    const decision = decideStage(state, [silent(HOST), silent(SARAH)], 0);
    expect(decision.active).toBe(HOST);
  });

  it('gives the room back to the host in conversation mode after silence', () => {
    let state = initialStageState(HOST, 'conversation');
    state = play(state, hold([speech(SARAH, 0.9), silent(HOST)], 20)).state;
    expect(state.active).toBe(SARAH);
    const quiet = play(state, hold([silent(SARAH), silent(HOST)], 30),
      state.activeSince + 3000);
    expect(quiet.active.at(-1)).toBe(HOST);
  });

  it('keeps the last speaker in plain automatic, rather than snapping away', () => {
    let state = initialStageState(HOST, 'automatic');
    state = play(state, hold([speech(SARAH, 0.9), silent(HOST)], 20)).state;
    const quiet = play(state, hold([silent(SARAH), silent(HOST)], 30),
      state.activeSince + 3000);
    expect(quiet.active.at(-1)).toBe(SARAH);
  });

  it('decides nothing when there is nobody to decide between', () => {
    const state = initialStageState(null);
    const decision = decideStage(state, [], 0);
    expect(decision.active).toBeNull();
    expect(decision.reason).toBe('nobody');
  });
});

describe('the decision is pure', () => {
  it('never mutates the state it is given', () => {
    const state = initialStageState(HOST);
    const frozen = JSON.stringify(state);
    decideStage(state, [speech(SARAH, 0.9)], 1000);
    decideStage(state, [speech(DAVID, 0.9)], 2000);
    expect(JSON.stringify(state)).toBe(frozen);
  });

  it('gives the same answer for the same inputs', () => {
    const state = initialStageState(HOST);
    const readings = [speech(HOST, 0.5), speech(SARAH, 0.8)];
    const a = decideStage(state, readings, 1234);
    const b = decideStage(state, readings, 1234);
    expect(a.active).toBe(b.active);
    expect(a.reason).toBe(b.reason);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });

  it('reports the moment the stage actually moved', () => {
    let state = initialStageState(HOST);
    const first = decideStage(state, [speech(HOST, 0.8)], 0);
    expect(first.changed).toBe(false);
    state = play(state, hold([speech(HOST, 0.2), speech(SARAH, 0.9)], 20)).state;
    expect(state.active).toBe(SARAH);
  });
});
