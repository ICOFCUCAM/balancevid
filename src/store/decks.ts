/**
 * The deck store.  [Doctrine CHANNEL §20, §3, D-18]
 *
 * A deck is a JSON file naming library images in order. It holds no pixels:
 * the slides are ordinary library media, which is what lets a channel put
 * one on air with `roll-in` and lets two channels show the same talk
 * without a second copy of it.
 *
 * BESIDE THE LIBRARY, NOT INSIDE A CHANNEL. Deleting a channel takes its
 * schedule and nothing else (D-18); a deck that lived in one would vanish
 * with it, which is the wrong lifetime for a talk somebody gave.
 */

import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import type { Deck } from '../domain/deck.js';
import { paths, safe } from './paths.js';

export async function saveDeck(deck: Deck): Promise<void> {
  await mkdir(paths.decks(), { recursive: true });
  const target = paths.deck(deck.id);
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(deck, null, 2), 'utf8');
  await rename(temp, target);
}

export async function loadDeck(id: string): Promise<Deck> {
  return JSON.parse(await readFile(paths.deck(safe(id)), 'utf8')) as Deck;
}

/** Newest first, which is the order somebody wants their last upload in. */
export async function listDecks(): Promise<Deck[]> {
  let names: string[];
  try {
    names = await readdir(paths.decks());
  } catch {
    return [];
  }
  const decks: Deck[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      decks.push(JSON.parse(
        await readFile(`${paths.decks()}/${name}`, 'utf8')) as Deck);
    } catch { /* half-written or hand-edited: not a deck. */ }
  }
  return decks.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * Throw a deck away, and its slides with it.  [§19]
 *
 * Unlike every other deletion in this product, this one DOES remove media —
 * because the slides exist only as this deck's pages. They were not
 * uploaded one by one and there is nowhere else they belong. The caller has
 * already asked the channels whether any of them is on air.
 */
export async function deleteDeck(id: string): Promise<void> {
  const deck = await loadDeck(id).catch(() => null);
  for (const slide of deck?.slides ?? []) {
    await rm(paths.libraryMedia(slide.assetId, 'png'), { force: true });
    await rm(`${paths.library()}/${safe(slide.assetId)}.json`, { force: true });
  }
  await rm(paths.deck(safe(id)), { force: true });
}
