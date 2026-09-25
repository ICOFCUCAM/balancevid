/**
 * The representation registry.  [Doctrine INV-00, D-16]
 *
 * "Every representation declares itself." D-16 asks each one to register three
 * things -- a pure generator, exactly which fields of the Conversation it
 * reads, and a way to rebuild it from scratch -- so that the rebuild test can
 * delete every representation, regenerate it, and prove nothing lived only in
 * the copy.
 *
 * This is the enforcement mechanism for the master invariant. Without it,
 * INV-00 is a sentence people agree with and then quietly violate: the article
 * grows an edited paragraph, the manifest stores its own cut points, captions
 * get corrected in the caption file. Each of those is the same mistake --
 * editing the shadow instead of the object -- and each of them fails here.
 */

import type { Conversation } from '../domain/document.js';
import { buildAttribution, buildRenderPlan, canonicalJson } from '../domain/plan.js';
import { projectTimeline } from '../domain/timeline.js';
import { generateArticle } from '../article/generate.js';
import { renderHtml } from '../article/html.js';
import { renderMarkdown } from '../article/markdown.js';
import { buildCues } from '../render/cues.js';
import { buildManifest } from '../manifest/build.js';
import { buildBundle } from '../publish/bundle.js';
import { buildShareCard } from '../publish/card.js';
import { buildClaimCards } from '../publish/claimCard.js';
import { generateInteractive } from '../interactive/generate.js';
import { generatePresentation } from '../present/generate.js';
import { renderInteractive } from '../interactive/html.js';
import { buildSrt, buildVtt } from '../render/subtitles.js';
import type { Transcript } from '../transcribe/types.js';

export interface RepresentationContext {
  conversation: Conversation;
  sourceTranscript?: Transcript | null;
  transcriptVersion?: number;
  takeTranscripts?: Map<string, Transcript>;
  /** Injected so generation is reproducible from its inputs alone. [U-16 §2] */
  generatedAt: string;
}

export interface Representation {
  id: string;
  label: string;
  mediaType: string;
  /**
   * Which parts of the Conversation this reads.
   *
   * D-16's reviewer's question: "does this field belong to the Conversation,
   * or to a representation?" If a generator needs something not listed here,
   * the Conversation gains a place for it -- the representation does not.
   */
  inputs: string[];
  /** Pure. Same context in, same bytes out. */
  generate(context: RepresentationContext): string;
  /** False when the Conversation cannot yet produce this one. */
  available(context: RepresentationContext): boolean;
}

const article = (context: RepresentationContext) => generateArticle({
  conversation: context.conversation,
  sourceTranscript: context.sourceTranscript ?? null,
  ...(context.transcriptVersion ? { transcriptVersion: context.transcriptVersion } : {}),
  ...(context.takeTranscripts ? { takeTranscripts: context.takeTranscripts } : {}),
  generatedAt: context.generatedAt,
});

const cues = (context: RepresentationContext) => buildCues(
  context.conversation,
  projectTimeline(context.conversation),
  {
    source: context.sourceTranscript ?? null,
    ...(context.takeTranscripts ? { takes: context.takeTranscripts } : {}),
  },
);

const shareCard = (context: RepresentationContext) => {
  /*
   * The runtime, where the conversation has one. A projection rather than a
   * render: the card is asked for on every page load and must not depend on
   * anything having been exported. A conversation too early to have a
   * timeline simply says how many responses it has and not how long it runs.
   */
  let totalOutputFrames: number | undefined;
  try { totalOutputFrames = projectTimeline(context.conversation).totalOutputFrames; }
  catch { totalOutputFrames = undefined; }

  return buildShareCard({
    conversation: context.conversation,
    attribution: buildAttribution(context.conversation, context.generatedAt).text,
    ...(totalOutputFrames ? { totalOutputFrames } : {}),
  });
};

const bundle = (context: RepresentationContext) => buildBundle({
  conversation: context.conversation,
  sourceTranscript: context.sourceTranscript ?? null,
  generatedAt: context.generatedAt,
  attribution: buildAttribution(context.conversation, context.generatedAt).text,
});

const claimCards = (context: RepresentationContext) => buildClaimCards({
  conversation: context.conversation,
  attribution: buildAttribution(context.conversation, context.generatedAt).text,
  ...(context.takeTranscripts ? { takeTranscripts: context.takeTranscripts } : {}),
});

export const REPRESENTATIONS: Representation[] = [
  {
    id: 'article.json',
    label: 'Article (structured)',
    mediaType: 'application/json',
    inputs: ['source', 'interventions', 'anchors', 'takes', 'transcripts'],
    generate: (c) => JSON.stringify(article(c), null, 2),
    available: () => true,
  },
  {
    id: 'article.md',
    label: 'Article (Markdown)',
    mediaType: 'text/markdown; charset=utf-8',
    inputs: ['source', 'interventions', 'anchors', 'takes', 'transcripts'],
    generate: (c) => renderMarkdown(article(c)),
    available: () => true,
  },
  {
    id: 'article.html',
    label: 'Article (HTML)',
    mediaType: 'text/html; charset=utf-8',
    inputs: ['source', 'interventions', 'anchors', 'takes', 'transcripts'],
    generate: (c) => renderHtml(article(c)),
    available: () => true,
  },
  {
    id: 'captions.srt',
    label: 'Captions (SubRip)',
    mediaType: 'application/x-subrip',
    inputs: ['source', 'interventions', 'takes', 'transcripts'],
    generate: (c) => buildSrt(cues(c)),
    available: () => true,
  },
  {
    id: 'captions.vtt',
    label: 'Captions (WebVTT)',
    mediaType: 'text/vtt; charset=utf-8',
    inputs: ['source', 'interventions', 'takes', 'transcripts'],
    generate: (c) => buildVtt(cues(c)),
    available: () => true,
  },
  {
    id: 'manifest.json',
    label: 'Conversation manifest',
    mediaType: 'application/json',
    inputs: ['source', 'interventions', 'anchors', 'takes', 'transcripts'],
    generate: (c) => JSON.stringify(buildManifest({
      conversation: c.conversation,
      sourceTranscript: c.sourceTranscript ?? null,
      ...(c.takeTranscripts ? { takeTranscripts: c.takeTranscripts } : {}),
      generatedAt: c.generatedAt,
    }), null, 2),
    // Every conversation has one. For Class B it is the export; for Class A it
    // is the companion experience alongside the composed video. [U-01, D-08]
    available: () => true,
  },
  {
    id: 'timeline.json',
    label: 'Timeline projection',
    mediaType: 'application/json',
    inputs: ['source', 'interventions', 'anchors', 'takes'],
    generate: (c) => canonicalJson(projectTimeline(c.conversation)),
    available: () => true,
  },
  {
    id: 'render-plan.json',
    label: 'Render plan',
    mediaType: 'application/json',
    inputs: ['source', 'interventions', 'anchors', 'takes', 'layouts', 'export profile'],
    generate: (c) => canonicalJson(buildRenderPlan(c.conversation)),
    // A Class B source has no composable plan (INV-01), and a source still
    // being normalised has no mezzanine (INV-04). Neither is an error here.
    available: (c) =>
      c.conversation.source.class === 'A' && Boolean(c.conversation.source.mezzanineAssetId),
  },
  {
    id: 'bundle.json',
    label: 'Publication bundle',
    mediaType: 'application/json',
    inputs: ['source', 'interventions', 'anchors', 'takes', 'transcripts', 'lineage'],
    generate: (c) => JSON.stringify(bundle(c), null, 2),
    // A Class B conversation publishes too, and its author needs a
    // description and an attribution block as much as anyone. [U-01, INV-07]
    available: () => true,
  },
  {
    id: 'share-card.json',
    label: 'Share card',
    mediaType: 'application/json',
    inputs: ['title', 'source', 'interventions', 'anchors', 'takes', 'lineage'],
    /*
     * What a link to this conversation says about itself. Registered rather
     * than assembled in the page, so the words in the picture and the words
     * in the metadata come from one generator and cannot drift apart.
     */
    generate: (c) => JSON.stringify(shareCard(c), null, 2),
    // Every conversation has a title, a source and an attribution, which is
    // the whole of what a card needs. Class B included: a conversation that
    // cannot export a video can still be read, and its link still travels.
    available: () => true,
  },
  {
    id: 'claim-cards.json',
    label: 'Share cards (one per exchange)',
    mediaType: 'application/json',
    inputs: ['source', 'interventions', 'anchors', 'takes', 'transcripts', 'lineage'],
    /*
     * The WORDS of every card. The pictures are drawn from these by the
     * worker, which is the same split that keeps `share-card.json` and its
     * image from drifting: one generator, two renderings, and the alt text
     * comes from the same place as the ink. [U-30, D-04]
     */
    generate: (c) => JSON.stringify(claimCards(c), null, 2),
    // A conversation with no recorded response has no exchange to make a card
    // of, and a card of a claim with no answer is a poster for the claim.
    available: (c) => claimCards(c).length > 0,
  },
  {
    id: 'interactive.html',
    label: 'Interactive (HTML)',
    mediaType: 'text/html; charset=utf-8',
    inputs: ['source', 'interventions', 'anchors', 'takes', 'transcripts', 'publication'],
    /*
     * The article, arranged to be moved around in: an index of the exchanges
     * over the published video, each one a seek. Registered rather than only
     * served, so the rebuild test asserts that it survives deletion like every
     * other representation — and so that it cannot quietly acquire a field the
     * Conversation does not have. [D-16]
     */
    generate: (c) => renderInteractive(generateInteractive({
      conversation: c.conversation,
      sourceTranscript: c.sourceTranscript ?? null,
      ...(c.transcriptVersion ? { transcriptVersion: c.transcriptVersion } : {}),
      ...(c.takeTranscripts ? { takeTranscripts: c.takeTranscripts } : {}),
      generatedAt: c.generatedAt,
    })),
    available: () => true,
  },
  {
    id: 'presentation.json',
    label: 'Presentation (stops and prompts)',
    mediaType: 'application/json',
    inputs: ['source', 'interventions', 'anchors', 'takes', 'transcripts', 'evidence'],
    /*
     * Where the source stops, and what the presenter is reminded of at each
     * stop. Registered rather than only served so the rebuild test asserts it
     * survives deletion, and so it cannot quietly grow a field the
     * Conversation does not have — a presentation is a score, and a score
     * with its own notes would be a second document. [D-16, INV-00]
     */
    generate: (c) => JSON.stringify(generatePresentation({
      conversation: c.conversation,
      sourceTranscript: c.sourceTranscript ?? null,
      ...(c.takeTranscripts ? { takeTranscripts: c.takeTranscripts } : {}),
      generatedAt: c.generatedAt,
    }), null, 2),
    // A conversation with no interruptions has nothing to stop for, and a
    // presentation of it is just the source playing.
    available: (c) => c.conversation.interventions.length > 0,
  },
  {
    id: 'description.txt',
    label: 'Video description',
    mediaType: 'text/plain; charset=utf-8',
    inputs: ['source', 'interventions', 'anchors', 'takes', 'transcripts', 'lineage'],
    generate: (c) => bundle(c).description,
    available: () => true,
  },
  {
    id: 'chapters.txt',
    label: 'Chapter markers',
    mediaType: 'text/plain; charset=utf-8',
    inputs: ['source', 'interventions', 'anchors', 'takes', 'transcripts'],
    // Exactly the lines a platform accepts, and nothing else: the author
    // pastes this whole file without editing it.
    generate: (c) => {
      const b = bundle(c);
      return b.chapters.map((ch) => `${ch.timecode.slice(0, 8)} ${ch.title}`).join('\n');
    },
    // An ignored chapter list is worse than none, so this one is honestly
    // unavailable when the conversation cannot make a list platforms accept.
    available: (c) => bundle(c).chapters.length > 0,
  },
];

export function findRepresentation(id: string): Representation | undefined {
  return REPRESENTATIONS.find((r) => r.id === id);
}

/**
 * Regenerate everything the Conversation can currently produce.
 *
 * This is D-16's rebuild: delete every representation, build them again, and
 * nothing is lost. The test asserts it byte-for-byte.
 */
export function rebuildAll(context: RepresentationContext): Map<string, string> {
  const out = new Map<string, string>();
  for (const representation of REPRESENTATIONS) {
    if (!representation.available(context)) continue;
    out.set(representation.id, representation.generate(context));
  }
  return out;
}
