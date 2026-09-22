import { createHash, randomUUID } from 'node:crypto';

export type Id<T extends string> = `${T}_${string}`;

export function newId<T extends string>(prefix: T): Id<T> {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}` as Id<T>;
}

/** Stable content hash. Used for quote integrity (INV-05) and shot caching (U-16). */
export function sha256(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * A quote's identity is its normalised text.  [Doctrine U-10, INV-05]
 *
 * Normalisation makes the hash stable across whitespace and quotation-mark
 * variation, so re-transcription with a better model does not spuriously
 * invalidate an anchor — while any change to the WORDS still does, which is
 * exactly the property the integrity rule needs.
 */
export function quoteHash(text: string): string {
  return sha256(normaliseQuote(text));
}

export function normaliseQuote(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
