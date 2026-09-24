/**
 * Who is on stage.  [Doctrine ROOM §2, §3, §8, §9]
 *
 * The brief is explicit about what this must not be:
 *
 *   "Selecting who to speak should not simply use 'loudest microphone.'
 *    ... Otherwise a cough, keyboard click or background noise could cause
 *    the screen to jump around."
 *
 * A pure function, deliberately. It takes the state of the room and a reading
 * of the microphones and returns who should be seen — no timers of its own,
 * no media, no browser. Everything that makes automatic switching feel
 * calm rather than frantic is arithmetic over time, and arithmetic can be
 * tested exhaustively before a single packet moves. When real voice-activity
 * detection arrives it feeds this; it does not replace it.
 *
 * SIX THINGS STOP THE SCREEN JUMPING, and the brief names all of them:
 *
 *   speech, not volume     energy alone promotes a slammed door. A candidate
 *                          must register as SPEECH — energy above the floor
 *                          AND confidence that it is a voice.
 *   a floor under noise    the room's own hum is measured and subtracted, so
 *                          a loud room does not read as a talkative one.
 *   minimum duration       a cough is loud and over. Speech has to persist
 *                          before it counts as someone taking the floor.
 *   hysteresis             a challenger must be clearly louder than the
 *                          person speaking, not merely louder. Two people at
 *                          the same level leave the stage where it is.
 *   a dwell time           having just switched, the stage stays put for a
 *                          moment. Without this, two people talking over each
 *                          other produce a strobe.
 *   incumbent priority     the person speaking keeps the floor while they are
 *                          still speaking, even below a newcomer's peak.
 *
 * And above all of it: a pin wins, and manual means manual. [ROOM §3]
 */

import type { ParticipantId } from './participants.js';

/**
 * How the stage is being driven.  [ROOM §3]
 *
 *   automatic     follow whoever is speaking
 *   manual        the host says who, and nothing else moves it
 *   host          the host holds the stage unless moved by hand
 *   conversation  automatic, but the host is never dropped for silence —
 *                 the shape of an interview rather than a panel
 */
export type SpeakerMode = 'automatic' | 'manual' | 'host' | 'conversation';

/** One microphone, as the room hears it. */
export interface VoiceReading {
  participantId: ParticipantId;
  /** 0–1. Short-term loudness. On its own this proves nothing. */
  energy: number;
  /**
   * 0–1. How much this sounds like a voice rather than a noise.
   *
   * A separate number from energy on purpose: a door slam is energy 0.9 and
   * speech confidence near zero, and the distinction is the entire reason
   * this module is not `Math.max(energy)`.
   */
  speechConfidence: number;
  /** The room's own floor for this microphone, measured while nobody speaks. */
  noiseFloor?: number;
  /** Muted people are not candidates, however loud the room they sit in. */
  muted?: boolean;
}

export interface StagePolicy {
  /** Below this, after the noise floor is removed, it is not speech. */
  energyThreshold: number;
  /** Below this it is a sound, not a voice. */
  confidenceThreshold: number;
  /** Speech must persist this long before it can take the floor. */
  minSpeakingMs: number;
  /** Having switched, hold for this long before switching again. */
  dwellMs: number;
  /** How much louder a challenger must be than the incumbent, 0–1. */
  hysteresis: number;
  /** The incumbent keeps the floor for this long after they stop. */
  holdAfterSilenceMs: number;
}

/**
 * Defaults chosen for a conversation between people, not for a control room.
 *
 * `minSpeakingMs` is the important one: a cough is 150–300ms and an
 * interjection worth showing is longer. 600ms is comfortably past a cough and
 * short enough that "yes, exactly" still lands on screen.
 */
export const DEFAULT_POLICY: StagePolicy = {
  energyThreshold: 0.12,
  confidenceThreshold: 0.6,
  minSpeakingMs: 600,
  dwellMs: 1200,
  hysteresis: 0.12,
  holdAfterSilenceMs: 1500,
};

/**
 * What the policy remembers between readings.
 *
 * Carried by the caller rather than held here, so the function stays pure and
 * a test can drive a whole conversation through it deterministically.
 */
export interface StageState {
  mode: SpeakerMode;
  /** Who the viewer is seeing. */
  active: ParticipantId | null;
  /** When they took the floor, in the same clock as the readings. */
  activeSince: number;
  /** The host, who holds the floor when nobody else has earned it. */
  hostId: ParticipantId | null;
  /** Set by hand; overrides everything until it is cleared. [ROOM §3] */
  pinned: ParticipantId | null;
  /** How long each voice has been continuously speaking, by id. */
  speakingSince: Record<string, number>;
  /** When each voice was last heard, so silence can be forgiven briefly. */
  lastHeard: Record<string, number>;
}

export function initialStageState(
  hostId: ParticipantId | null, mode: SpeakerMode = 'automatic',
): StageState {
  return {
    mode, active: hostId, activeSince: 0, hostId,
    pinned: null, speakingSince: {}, lastHeard: {},
  };
}

export interface StageDecision {
  state: StageState;
  active: ParticipantId | null;
  /** Why, in a word — for the audit log and for explaining it on screen. */
  reason: 'pinned' | 'manual' | 'host' | 'took-floor' | 'held' | 'nobody';
  /** True on the reading where the stage actually moved. */
  changed: boolean;
}

/**
 * Decide who is on stage, given what the microphones just heard.
 *
 * Called once per reading — every 100ms or so in practice. `now` is a
 * millisecond clock the caller owns; the function never asks what time it is,
 * which is what lets a test play out ten seconds of an argument in a loop.
 */
export function decideStage(
  state: StageState, readings: VoiceReading[], now: number,
  policy: StagePolicy = DEFAULT_POLICY,
): StageDecision {
  const speakingSince = { ...state.speakingSince };
  const lastHeard = { ...state.lastHeard };

  /*
   * Who is speaking, and how strongly.
   *
   * Strength is energy ABOVE the room's own floor, so a participant in a
   * noisy kitchen is judged by how far they rise above their kitchen rather
   * than by the kitchen.
   */
  const strength = new Map<string, number>();
  for (const reading of readings) {
    const above = Math.max(0, reading.energy - (reading.noiseFloor ?? 0));
    const speaking = !reading.muted
      && above >= policy.energyThreshold
      && reading.speechConfidence >= policy.confidenceThreshold;
    if (speaking) {
      strength.set(reading.participantId, above * reading.speechConfidence);
      if (speakingSince[reading.participantId] === undefined) {
        speakingSince[reading.participantId] = now;
      }
      lastHeard[reading.participantId] = now;
    } else {
      // A gap between words is not the end of a turn, so the run is only
      // broken once the silence has outlasted the hold.
      const heard = lastHeard[reading.participantId];
      if (heard === undefined || now - heard > policy.holdAfterSilenceMs) {
        delete speakingSince[reading.participantId];
      }
    }
  }

  const next: StageState = { ...state, speakingSince, lastHeard };
  const settle = (active: ParticipantId | null, reason: StageDecision['reason']):
  StageDecision => {
    const changed = active !== state.active;
    return {
      state: { ...next, active, activeSince: changed ? now : state.activeSince },
      active, reason, changed,
    };
  };

  // A pin is a decision already made. Nothing below it gets a vote. [ROOM §3]
  if (state.pinned) return settle(state.pinned, 'pinned');
  if (state.mode === 'manual') return settle(state.active, 'manual');
  if (state.mode === 'host') return settle(state.hostId, 'host');

  /*
   * Candidates: speaking, and speaking for long enough to mean it.
   *
   * This line is the cough filter. Everything loud and brief never reaches
   * the comparison below.
   */
  const candidates = [...strength.entries()]
    .filter(([id]) => now - (speakingSince[id] ?? now) >= policy.minSpeakingMs)
    .sort((a, b) => b[1] - a[1]);

  const incumbent = state.active;
  const incumbentStrength = incumbent ? strength.get(incumbent) ?? 0 : 0;
  const incumbentSpeaking = incumbentStrength > 0;

  /*
   * The dwell. Having just switched, the stage does not move again yet —
   * unless the person it switched to has stopped talking altogether, in which
   * case holding on them is worse than moving.
   */
  if (incumbent && now - state.activeSince < policy.dwellMs && incumbentSpeaking) {
    return settle(incumbent, 'held');
  }

  const challenger = candidates.find(([id]) => id !== incumbent);

  /*
   * Incumbent priority plus hysteresis. The person with the floor keeps it
   * while they are still speaking, and a challenger takes it only by a clear
   * margin — not by a hair, which is what makes two people at the same volume
   * strobe.
   */
  if (incumbent && incumbentSpeaking) {
    if (!challenger || challenger[1] < incumbentStrength + policy.hysteresis) {
      return settle(incumbent, 'held');
    }
    return settle(challenger[0] as ParticipantId, 'took-floor');
  }

  if (challenger) return settle(challenger[0] as ParticipantId, 'took-floor');

  /*
   * Nobody has earned it. The incumbent keeps the stage through a pause —
   * cutting away the instant someone breathes is the other way to make a
   * conversation unwatchable.
   */
  if (incumbent) {
    const heard = lastHeard[incumbent];
    if (heard !== undefined && now - heard <= policy.holdAfterSilenceMs) {
      return settle(incumbent, 'held');
    }
  }

  /*
   * Silence, and it has gone on. In `conversation` the host takes the room
   * back, which is the shape of an interview; in plain `automatic` the last
   * speaker stays rather than the picture snapping to someone who is also
   * saying nothing.
   */
  if (state.mode === 'conversation' && state.hostId) return settle(state.hostId, 'host');
  if (incumbent) return settle(incumbent, 'held');
  return settle(state.hostId, state.hostId ? 'host' : 'nobody');
}

/** Pin someone. Manual control without leaving automatic behind. [ROOM §3] */
export function pin(state: StageState, participantId: ParticipantId): StageState {
  return { ...state, pinned: participantId };
}

/**
 * Resume automatic switching.
 *
 * The pin is released and the person who was pinned keeps the stage until
 * somebody EARNS it — which, if the host is already mid-sentence, is on the
 * very next reading. That is the correct reading of "resume automatic": go
 * back to following the voice. What it protects against is the other case —
 * a quiet room, where dropping the pinned speaker the instant the pin lifts
 * would undo the decision the host just made for no reason at all.
 */
export function resumeAutomatic(state: StageState, now: number): StageState {
  return {
    ...state,
    pinned: null,
    mode: state.mode === 'manual' ? 'automatic' : state.mode,
    active: state.pinned ?? state.active,
    activeSince: now,
  };
}

/** The host says who. Used by manual mode and by "bring Sarah in". [ROOM §8] */
export function selectSpeaker(
  state: StageState, participantId: ParticipantId | null, now: number,
): StageState {
  return { ...state, active: participantId, activeSince: now, pinned: null };
}
