/**
 * Parsing and matching a query.  [Doctrine §43, D-12]
 *
 * Two shapes, because they are the two people actually type: bare words,
 * which must all appear somewhere, and "a quoted phrase", which must appear
 * together and in order.
 *
 * Matching folds case and diacritics. That is a judgement call rather than an
 * obvious one — å and a are distinct letters in Swedish, and folding them
 * makes a Swedish search slightly wronger. It also means someone typing
 * "cafe" finds "café", and a search box that misses the thing you are looking
 * at on screen is the one nobody uses twice. Exact matches are ranked above
 * folded ones so the distinction survives where it matters. [D-12]
 */

import type { Query } from './types.js';

/**
 * The comparable form of a string.
 *
 * NFKC first so composed and decomposed forms agree, then NFD to separate the
 * marks, then strip them. Done in that order because stripping marks from a
 * composed character does nothing.
 */
export function fold(text: string): string {
  return text
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .toLocaleLowerCase();
}

/** Case- and diacritic-preserving, for ranking an exact hit above a folded one. */
export function normaliseOnly(text: string): string {
  return text.normalize('NFKC');
}

export function parseQuery(raw: string): Query {
  const phrases: string[] = [];
  // Pull out "quoted phrases" first so their spaces are not split into terms.
  const withoutPhrases = raw.replace(/"([^"]+)"/g, (_, phrase: string) => {
    const trimmed = String(phrase).trim();
    if (trimmed) phrases.push(trimmed);
    return ' ';
  });

  const terms = withoutPhrases
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  return { terms, phrases, empty: terms.length === 0 && phrases.length === 0 };
}

export interface Match {
  highlights: { start: number; end: number }[];
  /** True when every term and phrase appeared. */
  complete: boolean;
  /** How many matches were exact rather than only folded. */
  exact: number;
}

/**
 * Find a query inside one line of text.
 *
 * Folded text and original text are kept index-aligned: folding here only ever
 * replaces a character with one character or removes a combining mark, so a
 * position in the folded string maps back by walking the original. Rather than
 * assume that holds for every input, the mapping is built explicitly.
 */
export function matchLine(text: string, query: Query): Match | null {
  if (query.empty) return null;

  const { folded, map } = foldWithMap(text);
  const highlights: { start: number; end: number }[] = [];
  let exact = 0;
  let complete = true;

  const findAll = (needleRaw: string, wholeWord: boolean) => {
    const needle = fold(needleRaw);
    if (!needle) return false;
    let found = false;
    let from = 0;
    for (;;) {
      const at = folded.indexOf(needle, from);
      if (at < 0) break;
      const endsAt = at + needle.length;
      if (!wholeWord || isWordBounded(folded, at, endsAt)) {
        const start = map[at] ?? 0;
        const end = map[endsAt] ?? text.length;
        highlights.push({ start, end });
        if (text.slice(start, end).normalize('NFKC') === normaliseOnly(needleRaw)) exact += 1;
        found = true;
      }
      from = at + 1;
    }
    return found;
  };

  // A phrase is matched as written, including its spaces.
  for (const phrase of query.phrases) {
    if (!findAll(phrase, false)) complete = false;
  }
  /*
   * A bare term matches on word boundaries. Without that, searching "art"
   * lights up "start", "particular" and "heart", and a result list where most
   * rows are noise is one nobody reads to the bottom of.
   */
  for (const term of query.terms) {
    if (!findAll(term, true)) complete = false;
  }

  if (highlights.length === 0) return null;
  return { highlights: mergeRanges(highlights), complete, exact };
}

function isWordBounded(text: string, start: number, end: number): boolean {
  const before = start === 0 ? '' : text[start - 1]!;
  const after = end >= text.length ? '' : text[end]!;
  const isWord = (c: string) => c !== '' && /[\p{L}\p{N}]/u.test(c);
  return !isWord(before) && !isWord(after);
}

/** Folded text, plus the index in the original each folded index came from. */
function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const piece = fold(text[i]!);
    for (const char of piece) {
      folded += char;
      map.push(i);
    }
  }
  map.push(text.length);
  return { folded, map };
}

/** Overlapping highlights render as a mess; merge them. */
function mergeRanges(ranges: { start: number; end: number }[]) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: { start: number; end: number }[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}
