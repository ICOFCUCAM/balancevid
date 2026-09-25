/**
 * The conversation as something you move around in.  [Doctrine D-16, U-14, INV-00]
 *
 * WHAT THIS IS. The article is the conversation read straight through, and
 * that is the right shape for citing it, printing it and indexing it. This is
 * the other thing a reader wants: the same argument as a set of exchanges you
 * can jump between, with the video seeking to whichever one you pick. A
 * forty-minute video answers "what did they say" only by being watched; this
 * answers it in the time it takes to read a list, and then plays the part you
 * chose.
 *
 * WHAT IT IS NOT. It is not a second article with different words, and it is
 * not an editor. Every string comes from the same places the article's do, and
 * the video it plays is THE PUBLISHED RENDER — one file, the one the
 * publication names (U-31), seeked rather than re-cut. There is no second
 * composition here, which is the whole reason it can be trusted to agree with
 * the video somebody else watched.
 *
 * WHY IT IS GENERATED RATHER THAN AN APP PAGE. The article is served as a
 * standalone document because what it is for is being read and cited
 * elsewhere. This is for being sent to somebody, so it has the same property:
 * one HTML file, no build, no session, carrying its own head and its own link
 * preview. And WITHOUT JAVASCRIPT IT IS STILL THE ARTICLE — every exchange is
 * there as text, with timecodes. The script only adds the seeking. [D-04]
 */

import { generateArticle, type ArticleInputs } from '../article/generate.js';
import type { Article, ArticleExchange } from '../article/types.js';
import type { Conversation } from '../domain/document.js';
import { HOUSE_FPS } from '../domain/time.js';

export const INTERACTIVE_VERSION = 1;

export interface InteractiveExchange extends ArticleExchange {
  /**
   * Where to seek to, in seconds, or absent when this exchange is not in the
   * finished video.
   *
   * Seconds rather than frames because that is what a `<video>` element takes.
   * The frame is the canonical number and stays on the exchange beside it; this
   * is the conversion done once, here, rather than in a script where nobody
   * can test it. [U-08]
   */
  seekSeconds?: number;
  /** How many marks the author put on the frame. Said, not drawn. [U-12, D-04] */
  marks: number;
}

export interface Interactive {
  version: number;
  conversationId: string;
  title: string;
  attribution: string;
  source: Article['source'];
  stats: Article['stats'];
  exchanges: InteractiveExchange[];
  provenance: Article['provenance'];
  /**
   * The published render, when there is one.
   *
   * Absent for a draft and for a conversation published before it had a
   * render — in which case the page is the article with an index, which is
   * still worth having. Nothing here falls back to "the newest render on
   * disk": that is the author's working material, not what was published.
   * [U-31, INV-15]
   */
  video?: { src: string; planHash: string; captions?: string };
  generatedAt: string;
}

export interface InteractiveInputs extends ArticleInputs {
  /**
   * Where the video and its captions live, relative to the page.
   *
   * Passed in rather than built here so this stays pure and so the page can be
   * served from more than one place — the route knows the origin, this does
   * not need to.
   */
  mediaBase?: string;
}

export function generateInteractive(inputs: InteractiveInputs): Interactive {
  const article = generateArticle(inputs);
  const conversation = inputs.conversation;

  const marksById = new Map(
    conversation.interventions.map((i) => [i.id, i.annotations?.length ?? 0]));

  const exchanges: InteractiveExchange[] = article.exchanges.map((exchange) => ({
    ...exchange,
    ...(exchange.outputStartFrame !== undefined
      ? { seekSeconds: round(exchange.outputStartFrame / HOUSE_FPS) }
      : {}),
    marks: marksById.get(exchange.interventionId as never) ?? 0,
  }));

  return {
    version: INTERACTIVE_VERSION,
    conversationId: article.conversationId,
    title: article.title,
    attribution: article.attribution,
    source: article.source,
    stats: article.stats,
    exchanges,
    provenance: article.provenance,
    ...(videoFor(conversation, inputs.mediaBase) ?? {}),
    generatedAt: article.generatedAt,
  };
}

/**
 * The one video this page may play.
 *
 * Only the render the publication NAMES. A page that played the newest render
 * on disk would be showing a reader the author's latest draft — including a
 * cut they made and thought better of — and every reader would see something
 * different from the one who was sent the link first.
 */
function videoFor(
  conversation: Conversation, mediaBase?: string,
): { video: Interactive['video'] } | undefined {
  const publication = conversation.publication;
  if (!publication || publication.unpublishedAt || !publication.planHash) return undefined;
  const base = `${mediaBase ?? `/api/conversations/${conversation.id}/renders`}`
    + `/${publication.planHash}/file`;
  return {
    video: {
      src: base,
      planHash: publication.planHash,
      // The captions ship with every export (INV-07), so the page that plays
      // the export offers them rather than leaving a reader to find them.
      captions: `${base}?kind=vtt`,
    },
  };
}

/** Three decimals is a millisecond at 30fps, and a shorter number in the page. */
function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

