import type {
  Conversation, Intervention, InterventionType, Take,
} from '../../src/domain/document.js';
import { SCHEMA_VERSION } from '../../src/domain/document.js';
import { newId, quoteHash } from '../../src/domain/ids.js';
import { HOUSE_FPS, PREROLL_FRAMES, type Frames } from '../../src/domain/time.js';

export const S = (seconds: number): Frames => Math.round(seconds * HOUSE_FPS);

export function makeTake(speechFrames: Frames, opts: Partial<Take> = {}): Take {
  const durationFrames = PREROLL_FRAMES + speechFrames;
  return {
    id: newId('take'),
    assetId: newId('asset'),
    createdAt: '2026-09-22T10:00:00.000Z',
    durationFrames,
    prerollFrames: PREROLL_FRAMES,
    mediaInFrame: PREROLL_FRAMES,
    mediaOutFrame: durationFrames,
    ...opts,
  };
}

export function makeIntervention(
  atFrame: Frames,
  speechFrames: Frames,
  opts: { type?: InterventionType; quote?: string; createdAt?: string } = {},
): Intervention {
  const take = makeTake(speechFrames);
  return {
    id: newId('ivn'),
    anchor: {
      tSourceFrame: atFrame,
      ...(opts.quote ? { quote: opts.quote, quoteHash: quoteHash(opts.quote) } : {}),
    },
    type: opts.type ?? 'critique',
    takes: [take],
    selectedTakeId: take.id,
    createdAt: opts.createdAt ?? '2026-09-22T10:00:00.000Z',
  };
}

export function makeConversation(
  durationFrames: Frames,
  interventions: Intervention[] = [],
  opts: Partial<Conversation['source']> = {},
): Conversation {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('conv'),
    title: 'My Response to "The History of Europe"',
    source: {
      id: newId('src'),
      class: 'A',
      title: 'The History of Europe',
      creator: 'Example Channel',
      url: 'https://example.org/video',
      mezzanineAssetId: newId('asset'),
      originalAssetId: newId('asset'),
      durationFrames,
      ...opts,
    },
    interventions,
    layoutProfileId: 'default',
    createdAt: '2026-09-22T09:00:00.000Z',
    updatedAt: '2026-09-22T10:00:00.000Z',
  };
}
