/**
 * Publishing, consent, and lineage.  [Doctrine U-31, §40]
 *
 * "Response chains form without any collaboration feature being built: A
 *  responds to a video, B responds to A, A responds to B. §40's multi-person
 *  conversation emerges from the existing primitives."
 *
 * The primitives are already here. All this adds is the two rules U-31 says
 * must be set now because they cannot be added cheaply later: the publisher
 * decides whether their conversation may be answered, and every response
 * records what it is answering.
 */

import {
  type Conversation, type Lineage, type LineageEntry, type Publication,
  isRespondable, lineageDepth,
} from './document.js';
import { EditError } from './edit.js';

/**
 * How far a chain may run.
 *
 * Not a technical limit — the document would happily nest forever. It is an
 * editorial one: past a point nobody can follow what is being answered, and a
 * response to a response to a response is a different format that deserves its
 * own design rather than an accident of recursion.
 */
export const MAX_CHAIN_DEPTH = 8;

export interface PublishOptions {
  planHash: string;
  /** The publisher's decision, stated rather than assumed. [U-31] */
  respondable: boolean;
  author?: string;
  publishedAt: string;
}

export function publish(conversation: Conversation, options: PublishOptions): void {
  if (conversation.interventions.length === 0) {
    throw new EditError('there is nothing here to publish yet');
  }
  const publication: Publication = {
    publishedAt: options.publishedAt,
    respondable: options.respondable,
    planHash: options.planHash,
    ...(options.author?.trim() ? { author: options.author.trim() } : {}),
  };
  conversation.publication = publication;
}

/**
 * Withdraw a conversation.
 *
 * Existing responses are untouched. They answered a version of this that
 * existed and was consented to; withdrawing now cannot unmake that, and
 * silently breaking other people's work would be worse than leaving it.
 */
export function unpublish(conversation: Conversation, at: string): void {
  if (!conversation.publication) throw new EditError('this is not published');
  conversation.publication.unpublishedAt = at;
}

export function republish(conversation: Conversation, options: PublishOptions): void {
  publish(conversation, options);
}

/**
 * The lineage a response to `parent` should carry.
 *
 * The chain is copied from the parent and extended, rather than looked up
 * later: the parent may be edited, re-rendered, withdrawn or deleted, and a
 * response must still be able to say what it was answering.
 */
export function lineageFor(parent: Conversation): Lineage {
  const entry: LineageEntry = {
    conversationId: parent.id,
    title: parent.title,
    ...(parent.publication?.author ? { author: parent.publication.author } : {}),
    ...(parent.publication?.publishedAt ? { publishedAt: parent.publication.publishedAt } : {}),
    sourceTitle: parent.source.title,
    ...(parent.source.url ? { sourceUrl: parent.source.url } : {}),
  };
  return {
    parentConversationId: parent.id,
    chain: [...(parent.lineage?.chain ?? []), entry],
  };
}

export class ConsentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConsentError';
  }
}

/**
 * May this conversation be answered?
 *
 * Consent is checked here, once, and the reasons are separate because they
 * mean different things to the person asking: "not published yet" is a
 * timing problem, "not respondable" is an answer.
 */
export function assertRespondable(parent: Conversation): void {
  if (!parent.publication || parent.publication.unpublishedAt) {
    throw new ConsentError('that conversation is not published');
  }
  if (!isRespondable(parent)) {
    throw new ConsentError('its author has not allowed responses to it');
  }
  if (lineageDepth(parent) + 1 > MAX_CHAIN_DEPTH) {
    throw new ConsentError(
      `this chain is already ${MAX_CHAIN_DEPTH} deep — start a new conversation instead`,
    );
  }
}

/**
 * The attribution a response carries.  [Doctrine U-21, U-31]
 *
 * Generated, non-removable, and it credits the whole chain: the conversation
 * being answered, its author, and the original media at the root. Someone who
 * responds to a response is still using the original creator's work, and the
 * attribution says so without being asked.
 */
export function chainAttribution(conversation: Conversation, accessedAt: string): string {
  const chain = conversation.lineage?.chain ?? [];
  const parts: string[] = [];

  const parent = chain.at(-1);
  if (parent) {
    parts.push(`Responding to "${parent.title}"${parent.author ? ` by ${parent.author}` : ''}`);
  }

  const root = chain[0];
  const rootSourceTitle = root?.sourceTitle ?? conversation.source.title;
  const rootSourceUrl = root?.sourceUrl ?? conversation.source.url;
  parts.push(`Original source: "${rootSourceTitle}"`);
  if (rootSourceUrl) parts.push(rootSourceUrl);
  if (chain.length > 1) parts.push(`${chain.length} responses deep`);
  parts.push(`Accessed ${accessedAt.slice(0, 10)}`);

  return parts.join(' · ');
}
