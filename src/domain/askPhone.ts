import type { AssignmentKind } from './participation.js';

/**
 * Asking somebody's phone a question.  [TIMELINE B14d; TAKE-APP T12]
 *
 * "With Studio One, and Online TV, videos or audio or other questions
 * for a particular program could be forwarded to their phones."
 *
 * ONE SHAPE FOR THREE STUDIOS. A performance hands out a song to
 * perform against; a conversation and a channel hand out a question
 * to answer. The difference is what travels with the request, not
 * how the request works — so this is the part the two non-musical
 * studios share, rather than a second request system for them.
 * [D-19, D-25]
 */

/** What may be asked of a phone, and what it may send back. [T12] */
export const PHONE_ASKS: Record<string, {
  kind: AssignmentKind;
  /** What the participant may send. */
  video?: boolean;
  audio?: boolean;
  /** What the producer is told they are asking for. */
  label: string;
}> = {
  /* A recorded answer with a face: the thing a programme plays. */
  answer: { kind: 'response', video: true, label: 'A recorded answer' },
  /* A question with a spoken answer, for somebody with a bad camera
     or in a place they would rather not be seen. */
  voice: { kind: 'audio', audio: true, label: 'A spoken answer' },
  /* Something to be read out rather than played: no recording at all
     crosses, only the words. */
  written: { kind: 'question', label: 'A written answer' },
};

export type PhoneAsk = keyof typeof PHONE_ASKS;

/** The ask a name means, or nothing — a name from a request is data. */
export function phoneAsk(name?: string | null) {
  return name ? PHONE_ASKS[name] : undefined;
}

/**
 * How many answers one link may send.  [T12]
 *
 * THREE, LIKE A PERFORMANCE'S TAKES, and for the same reason: a
 * person who fluffs their first answer should not have to be sent a
 * second link. Bounded, because a link is handed to a stranger and
 * an unbounded one is somewhere to put anything.
 */
export const MOST_ANSWERS = 10;
export const ANSWERS_BY_DEFAULT = 3;

/** What a producer asked for, clamped to what a link may carry. */
export function answersAllowed(asked?: number): number {
  if (!Number.isFinite(asked)) return ANSWERS_BY_DEFAULT;
  return Math.max(1, Math.min(MOST_ANSWERS, Math.round(asked!)));
}
