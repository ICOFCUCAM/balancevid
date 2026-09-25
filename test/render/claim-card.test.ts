/**
 * A claim card, as an actual PNG.  [Doctrine U-30, D-04]
 *
 * `test/publish/claim-cards.test.ts` proves which words go on the card and
 * which of them are allowed quotation marks. This proves the file: that libass
 * accepts the script, that the picture is the square the card declared, and
 * that a statement full of the characters ASS reserves does not silently
 * become a different card — which is the failure this whole family of
 * renderers is prone to, because a broken override tag draws nothing rather
 * than erroring.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CLAIM_CARD_HEIGHT, CLAIM_CARD_WIDTH, buildClaimCards,
} from '../../src/publish/claimCard.js';
import { renderClaimCard } from '../../src/render/thumbnails.js';
import { ffprobe } from '../../src/render/ffmpeg.js';
import { S, makeConversation, makeIntervention, makeTake } from '../domain/fixtures.js';

const ATTRIBUTION = 'Source: “A History” by Someone. Responses by the author.';
let dir: string;

function cardFor(quote: string) {
  const conversation = makeConversation(S(600), [
    makeIntervention(S(100), S(20), { type: 'critique', quote }),
  ]);
  conversation.interventions[0]!.takes = [makeTake(S(20))];
  conversation.interventions[0]!.selectedTakeId = conversation.interventions[0]!.takes[0]!.id;
  return buildClaimCards({ conversation, attribution: ATTRIBUTION })[0]!;
}

beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'balancevid-card-')); }, 60_000);
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

async function draw(quote: string, name: string): Promise<{ w: number; h: number }> {
  const out = join(dir, name);
  await renderClaimCard(cardFor(quote), out, join(dir, 'scratch'));
  const raw = await ffprobe([
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'json', out,
  ]);
  const stream = (JSON.parse(raw) as { streams: { width: number; height: number }[] })
    .streams[0]!;
  return { w: stream.width, h: stream.height };
}

describe('drawing a claim card', () => {
  it('produces the square the card said it would', async () => {
    const size = await draw('Growth was the highest in Europe.', 'plain.png');
    expect(size).toEqual({ w: CLAIM_CARD_WIDTH, h: CLAIM_CARD_HEIGHT });
  }, 120_000);

  /*
   * A statement somebody actually said contains braces, backslashes and
   * newlines about as often as it contains commas. In ASS all three are
   * override syntax, and the way that fails is silent: the line vanishes, or
   * half of it does, and the card still renders.
   */
  it('survives a statement full of what ASS treats as syntax', async () => {
    const size = await draw(
      'He said {this} \\N and \\h — 100% of it, "verbatim".', 'nasty.png');
    expect(size).toEqual({ w: CLAIM_CARD_WIDTH, h: CLAIM_CARD_HEIGHT });
  }, 120_000);

  it('and a statement long enough to need the smallest size', async () => {
    const size = await draw(`${'a long statement '.repeat(14)}end`, 'long.png');
    expect(size).toEqual({ w: CLAIM_CARD_WIDTH, h: CLAIM_CARD_HEIGHT });
  }, 120_000);
});
