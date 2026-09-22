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
import { buildRenderPlan, canonicalJson } from '../domain/plan.js';
import { projectTimeline } from '../domain/timeline.js';
import { generateArticle } from '../article/generate.js';
import { renderHtml } from '../article/html.js';
import { renderMarkdown } from '../article/markdown.js';
import { buildCues } from '../render/cues.js';
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
