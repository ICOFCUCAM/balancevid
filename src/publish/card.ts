/**
 * The share card.  [Doctrine U-30, U-31, D-16, INV-05]
 *
 * WHAT THIS IS FOR. A published conversation is a link somebody sends to
 * somebody else — in a message, in a post, in an email. Until now that link
 * arrived as a bare URL: no title, no subject, no picture, nothing to say what
 * it was. "The composition step is the distribution engine" (§52), and an
 * engine whose output cannot describe itself is one people do not pass on.
 *
 * WHAT IT IS NOT. It is not a social-media feature, and the distinction
 * matters because the doctrine draws it: the platforms do not get to shape
 * the product. Nothing here is a new authored field, a new export profile, or
 * a new place for text to live. This is the published page ANSWERING A
 * QUESTION ABOUT ITSELF, in facts it already holds.
 *
 * THE HONESTY RULE, WHICH IS THE WHOLE POINT. This product exists to argue
 * against work that promises what it does not contain, so a card that
 * overstated the conversation would be the one unforgivable feature. Two
 * consequences, both enforced below and both tested:
 *
 *   ONLY WHAT WAS BOUND IS QUOTED. A statement appears in quotation marks
 *   only when the author bound it — which means it hashes to what the source
 *   actually said (INV-05). A sentence merely inferred from the transcript is
 *   good enough to open a clip on, because a clip then plays it; it is not
 *   good enough to put in quotation marks on a picture that plays nothing.
 *
 *   NOTHING IS WRITTEN HERE THAT LIVES NOWHERE ELSE. D-16 names "a clip has a
 *   title that exists nowhere else" as a forbidden shape. Every string this
 *   produces is the conversation's own title, its source's own title, a bound
 *   quote, or the generated attribution.
 *
 * WHY IT IS A REPRESENTATION AND NOT AN IMAGE. The card is registered as
 * `share-card.json` and the picture is drawn FROM it. So the words in the
 * picture and the words in the page's own metadata come from one generator and
 * cannot drift apart — which is the failure mode of every hand-made OpenGraph
 * tag that has ever gone stale.
 */

import {
  type Conversation, orderedInterventions, selectedTake, takeUsableFrames,
} from '../domain/document.js';
import { formatTimecode, type Frames } from '../domain/time.js';

/**
 * The canvas every link preview is read on.
 *
 * 1200×630 is not an export profile and deliberately does not become one:
 * export profiles are shapes the CONVERSATION is composed into, chosen by the
 * author, and this is the shape a chat window draws a link in. Putting it in
 * `presentation.ts` would be letting the wrapper into the product.
 */
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

/** Past this the hero stops being read and starts being skipped. */
const HERO_LIMIT = 150;
/** What a preview actually shows before it cuts the description off. */
const DESCRIPTION_LIMIT = 190;

export interface ShareCard {
  /** For og:title, and the tab it opens in. */
  title: string;
  /** For og:description: one line, in facts. */
  description: string;
  /** The line the card is built around. */
  hero: {
    text: string;
    /**
     * May it be shown in quotation marks?
     *
     * True only for a statement the author BOUND, which carries a hash of
     * what was said. See the honesty rule above.
     */
    quoted: boolean;
  };
  /** Context, above the hero: what is being answered, and by whom. */
  eyebrow: string;
  /** Under it: the generated attribution, never omitted. [U-21, INV-07] */
  attribution: string;
  /** How much there is, in the two numbers a reader weighs a link by. */
  scale: string;
  image: { width: number; height: number; alt: string };
}

export interface ShareCardInputs {
  conversation: Conversation;
  /** The generated attribution chain, passed in so this stays pure. */
  attribution: string;
  /** The finished runtime, when a render has established one. */
  totalOutputFrames?: Frames;
}

export function buildShareCard(inputs: ShareCardInputs): ShareCard {
  const { conversation, attribution } = inputs;
  const source = conversation.source;
  const responses = orderedInterventions(conversation)
    .filter((intervention) => {
      const take = selectedTake(intervention);
      return take && takeUsableFrames(take) > 0;
    });

  /*
   * The strongest bound statement, which is the first one the author chose to
   * quote rather than the first one they happened to stop at. Unbound
   * responses are skipped entirely rather than falling back to an inferred
   * sentence: see the honesty rule.
   */
  const bound = responses.find((intervention) => Boolean(intervention.anchor.quote));
  const hero = bound?.anchor.quote
    ? { text: truncate(bound.anchor.quote, HERO_LIMIT), quoted: true }
    : { text: truncate(conversation.title, HERO_LIMIT), quoted: false };

  /*
   * What is being answered, and nothing else.
   *
   * The creator is not repeated here: the attribution below already says "by
   * whom", and a card that credits the same channel twice in six centimetres
   * reads as a template rather than as a considered thing. The quotation
   * marks are load-bearing — "Answering The History of Europe" parses as a
   * sentence about Europe, not as a title.
   */
  const eyebrow = `Answering \u201C${source.title}\u201D`;

  const count = responses.length === 1 ? '1 response' : `${responses.length} responses`;
  const runtime = inputs.totalOutputFrames && inputs.totalOutputFrames > 0
    ? formatTimecode(inputs.totalOutputFrames).slice(0, 8).replace(/^00:/, '')
    : undefined;
  const scale = runtime ? `${count} · ${runtime}` : count;

  /*
   * The description is the card said in one line, for the places that show
   * text and no picture. Same facts, same order — a preview that disagreed
   * with its own image would be the drift this module exists to prevent.
   */
  const description = truncate(
    hero.quoted
      ? `${eyebrow}: \u201C${hero.text}\u201D. ${scale}.`
      : `${eyebrow}. ${scale}.`,
    DESCRIPTION_LIMIT,
  );

  return {
    title: conversation.title,
    description,
    hero,
    eyebrow,
    attribution,
    scale,
    image: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      // Said in words, because a picture that is only a picture is missing
      // from a screen reader's account of the link. [D-04]
      alt: hero.quoted
        ? `${conversation.title} — a response to the statement “${hero.text}”`
        : conversation.title,
    },
  };
}

/**
 * Cut at a word, and say that it was cut.
 *
 * Mid-word truncation reads as a bug in the sender's tooling, which is not
 * the impression a shared link should make.
 */
function truncate(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.—-]+$/, '')}…`;
}
