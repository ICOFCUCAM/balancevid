/**
 * A card per claim, not one per conversation.  [Doctrine U-30, U-31, D-16, INV-05]
 *
 * WHAT THIS IS FOR. `card.ts` makes the picture a LINK shows: one card, for
 * the conversation, answering "what is at the other end of this URL". This is
 * a different thing with the same craft — one card per exchange, made to be
 * posted rather than to preview something. A claim and what was said back is
 * the smallest complete unit this product has; it is the unit people quote,
 * and until now they had to screenshot it.
 *
 * WHY IT IS NOT A NEW FEATURE SO MUCH AS A NEW SHAPE. Every string here is
 * already in the Conversation: the bound statement, the transcribed response,
 * the type label, the generated attribution. D-16 names "a clip has a title
 * that exists nowhere else" as a forbidden shape, and a card with its own
 * copywriting would be exactly that.
 *
 * THE HONESTY RULES, inherited from `card.ts` and extended by one:
 *
 *   ONLY A BOUND STATEMENT IS IN QUOTATION MARKS. A statement the author bound
 *   hashes to what the source actually said (INV-05). One merely inferred from
 *   the transcript is good enough to open a clip on, because the clip then
 *   plays it; it is not good enough for quotation marks on a picture that
 *   plays nothing and travels without its source.
 *
 *   AND THE RESPONSE IS NEVER IN THEM EITHER. The author's words come from
 *   their take's transcript, which is machine-derived and which nobody
 *   accepted (INV-06). The article already prints exactly this text as prose,
 *   so the precedent is set: it is set as the body, unquoted, the way a
 *   paraphrase is. Quotation marks on a line no human checked would be this
 *   product doing the thing it exists to argue against.
 *
 *   WHERE THERE IS NO TRANSCRIPT, THE CARD SAYS WHAT KIND OF ANSWER IT WAS AND
 *   HOW LONG. It never invents a line, and it never silently omits the
 *   response and leaves a card that is only the claim — which would read as
 *   agreement with it.
 */

import {
  type Conversation, type Intervention, orderedInterventions, selectedTake,
  takeUsableFrames, type Take,
} from '../domain/document.js';
import { TYPE_PRESENTATION } from '../domain/presentation.js';
import { formatTimecode, HOUSE_FPS } from '../domain/time.js';
import { forDisplay, type Transcript } from '../transcribe/types.js';

/**
 * Square, and deliberately not an export profile.
 *
 * `presentation.ts` holds the shapes the CONVERSATION is composed into, chosen
 * by the author. This is the shape a still image is read at in a feed, which
 * is a fact about feeds. Square because it is the one shape no platform crops:
 * a card exists to survive being passed on, and a card that arrives with its
 * attribution cut off has failed at the only job it has. [U-30, INV-07]
 */
export const CLAIM_CARD_WIDTH = 1080;
export const CLAIM_CARD_HEIGHT = 1080;

/** Past this a claim stops being read on a card and starts being scrolled. */
const CLAIM_LIMIT = 180;
/** The response gets less room than the claim: the card is about the answer
 *  to something, and the something has to be legible for the answer to land. */
const RESPONSE_LIMIT = 220;

export interface ClaimCard {
  /** 1-based, and the card's own name: `claim-01.png`. */
  index: number;
  interventionId: string;
  /** Context, above the claim: what is being answered, and when. */
  eyebrow: string;
  claim: {
    text: string;
    /** May it be shown in quotation marks? Only a bound statement may. */
    quoted: boolean;
  };
  /** The move, in the product's own language: CRITIQUE, CORRECTION… [U-11] */
  label: string;
  response: {
    text: string;
    /**
     * `spoken` — transcribed from the author's own take, set as prose.
     * `unheard` — no transcript, so the card states the shape of the answer
     * rather than guessing at its content.
     */
    kind: 'spoken' | 'unheard';
  };
  /** Never omitted, on any card, for any reason. [U-21, INV-07] */
  attribution: string;
  /** What a screen reader is told, because a picture alone is not content. [D-04] */
  alt: string;
  image: { width: number; height: number };
}

export interface ClaimCardInputs {
  conversation: Conversation;
  /** The generated attribution chain, passed in so this stays pure. */
  attribution: string;
  takeTranscripts?: Map<string, Transcript>;
}

/**
 * One card per recorded response, in the order they happen.
 *
 * A response with no usable take is not a card: there is nothing to have said
 * back, and a card of a claim with no answer is a poster for the claim.
 */
export function buildClaimCards(inputs: ClaimCardInputs): ClaimCard[] {
  const { conversation, attribution, takeTranscripts } = inputs;
  const source = conversation.source;

  const answered = orderedInterventions(conversation).filter((intervention) => {
    const take = selectedTake(intervention);
    return take && takeUsableFrames(take) > 0;
  });

  return answered.map((intervention, position) => {
    const take = selectedTake(intervention)!;
    const spoken = responseText(take, takeTranscripts?.get(take.id));
    const quote = intervention.anchor.quote;
    const stamp = formatTimecode(intervention.anchor.tSourceFrame).slice(0, 8).replace(/^00:/, '');

    /*
     * The claim, or the moment. An unbound anchor has no verbatim sentence
     * that hashes to anything, so the card names the source and the time
     * instead of putting an approximation in quotation marks.
     */
    const claim = quote
      ? { text: truncate(quote, CLAIM_LIMIT), quoted: true }
      : { text: `${source.title}, at ${stamp}`, quoted: false };

    const label = TYPE_PRESENTATION[intervention.type].lowerThird;
    const response = spoken
      ? { text: truncate(spoken, RESPONSE_LIMIT), kind: 'spoken' as const }
      : { text: unheard(label, take), kind: 'unheard' as const };

    return {
      index: position + 1,
      interventionId: intervention.id,
      eyebrow: `Answering “${source.title}”  ·  ${stamp}`,
      claim,
      label: titleCase(label),
      response,
      attribution,
      alt: altText(claim, label, response, source.title),
      image: { width: CLAIM_CARD_WIDTH, height: CLAIM_CARD_HEIGHT },
    };
  });
}

/**
 * What the card says when the answer was not transcribed.
 *
 * The length is the honest fact available: it says there IS an answer and
 * roughly how much of one, which is what the omission would otherwise hide.
 */
function unheard(label: string, take: Take): string {
  const seconds = Math.max(1, Math.round(takeUsableFrames(take) / HOUSE_FPS));
  return `${seconds} seconds of ${label.toLowerCase()}, not transcribed.`;
}

/**
 * The card in words.  [D-04]
 *
 * A card is an image, and an image is absent from a screen reader's account of
 * a post unless somebody wrote it down. This is written from the same fields
 * the picture is drawn from, so the two cannot describe different cards.
 */
function altText(
  claim: { text: string; quoted: boolean },
  label: string,
  response: { text: string; kind: 'spoken' | 'unheard' },
  sourceTitle: string,
): string {
  const head = claim.quoted
    ? `“${sourceTitle}” said: “${claim.text}”.`
    : `A moment in “${sourceTitle}”: ${claim.text}.`;
  const tail = response.kind === 'spoken'
    ? ` ${titleCase(label)}, in reply: ${response.text}`
    : ` ${response.text}`;
  return `${head}${tail}`;
}

/** The author's own words, trimmed to what they kept. Same rule as the article. */
function responseText(take: Take, transcript?: Transcript): string | null {
  if (!transcript) return null;
  const kept = transcript.sentences.filter(
    (sentence) => sentence.endFrame > take.mediaInFrame
      && sentence.startFrame < take.mediaOutFrame);
  const text = kept
    .map((sentence) => forDisplay(sentence.text, transcript.characteristics))
    .join(' ')
    .trim();
  return text || null;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

/** Cut at a word, and say that it was cut. Mid-word truncation reads as a bug. */
function truncate(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.—-]+$/, '')}…`;
}

/** The file a given card is drawn to, beside its siblings. */
export function claimCardName(index: number): string {
  return `claim-${String(index).padStart(2, '0')}.png`;
}

