/**
 * Thumbnail candidates, as actual images.  [Doctrine U-30, §39]
 *
 * The bundle names the candidates; this renders them. Three kinds, and the
 * constraint on all three is the same one the product is built on: a thumbnail
 * may only promise what the video contains. So a frame candidate is a frame of
 * the video, unretouched, and a quote card sets a sentence that was actually
 * said — nothing here composites a face onto a scene that never happened.
 *
 * Worker-only. Nothing in the web tier invokes ffmpeg. [U-23]
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { ExportProfile } from '../domain/presentation.js';
import { HOUSE_FPS, type Frames } from '../domain/time.js';
import type { ThumbnailCandidate } from '../publish/bundle.js';
import { CARD_HEIGHT, CARD_WIDTH, type ShareCard } from '../publish/card.js';
import { ffmpeg, type RunOptions } from './ffmpeg.js';
import { assColor, escapeAss } from './subtitles.js';

/** A quote card is typography on a field, not a screenshot of a slide. */
const CARD_BACKGROUND = '#101418';
const CARD_INK = '#F5F5F5';
const CARD_RULE = '#C8A24A';
const FONT = 'DejaVu Sans';

export interface ThumbnailRenderInputs {
  candidate: ThumbnailCandidate;
  profile: ExportProfile;
  /** The file a frame candidate is grabbed from. Absent for a quote card. */
  mediaPath?: string;
  /** Where the PNG lands. */
  outPath: string;
  /** Where the transient .ass for a quote card may be written. */
  scratchDir: string;
  attribution?: string;
  run?: RunOptions;
}

export async function renderThumbnail(inputs: ThumbnailRenderInputs): Promise<string> {
  const { candidate, outPath } = inputs;
  await mkdir(dirname(outPath), { recursive: true });

  if (candidate.kind === 'quote') {
    await renderQuoteCard(inputs);
    return outPath;
  }

  const frame = candidate.kind === 'take' ? candidate.takeFrame : candidate.sourceFrame;
  if (!inputs.mediaPath || frame === undefined) {
    throw new Error(`thumbnail ${candidate.id} has no media to grab from`);
  }
  await grabFrame(inputs.mediaPath, frame, inputs.profile, outPath, inputs.run);
  return outPath;
}

/**
 * One exact frame.
 *
 * `-ss` does not land ON a time; it outputs the first frame at or after it. So
 * the seek goes half a frame BEFORE frame N's presentation time, which puts
 * the target anywhere inside frame N-1's interval and makes frame N the first
 * one at or after it. Seeking to the middle of frame N — the obvious thing —
 * silently yields frame N+1, and a thumbnail one frame off the anchor is a
 * thumbnail of a moment the author did not choose. [U-07, INV-02]
 */
async function grabFrame(
  mediaPath: string,
  frame: Frames,
  profile: ExportProfile,
  outPath: string,
  run?: RunOptions,
): Promise<void> {
  const seconds = (Math.max(0, frame - 0.5) / HOUSE_FPS).toFixed(6);
  await ffmpeg([
    '-y',
    // Input seeking, then an exact trim: fast, and still on the right frame.
    '-ss', seconds,
    '-i', mediaPath,
    '-frames:v', '1',
    '-vf', `scale=${profile.width}:${profile.height}:force_original_aspect_ratio=increase,` +
      `crop=${profile.width}:${profile.height}`,
    outPath,
  ], run);
}

/**
 * The claim, as typography.  [Doctrine U-10]
 *
 * libass rather than drawtext: it wraps, it measures, and it is already the
 * text engine for every other word this product burns into a frame, so a
 * quote card looks like the claim cards in the video rather than like a
 * different product's export.
 */
async function renderQuoteCard(inputs: ThumbnailRenderInputs): Promise<void> {
  const { candidate, profile, outPath, scratchDir, run } = inputs;
  const text = (candidate.text ?? '').trim();
  if (!text) throw new Error(`quote thumbnail ${candidate.id} has no text`);

  const assPath = join(scratchDir, `${candidate.id}.ass`);
  await mkdir(scratchDir, { recursive: true });
  await writeFile(assPath, quoteCardAss(text, profile, inputs.attribution), 'utf8');

  await ffmpeg([
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=${CARD_BACKGROUND.replace('#', '0x')}:s=${profile.width}x${profile.height}:d=1`,
    '-vf', `ass=${escapeFilterPath(assPath)}`,
    '-frames:v', '1',
    outPath,
  ], run);
}

/**
 * A response's own still, for the conversation timeline.
 *
 * Small and cheap: this is a 160-wide chip on a timeline, not a thumbnail
 * anyone will publish. Grabbed a second past the trim-in for the same reason
 * the publication thumbnails are — the first kept frame is reliably the worst
 * one in the take.
 */
export async function renderTakePoster(
  mediaPath: string, outPath: string, atFrame: Frames, run?: RunOptions,
): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true });
  const seconds = (Math.max(0, atFrame - 0.5) / HOUSE_FPS).toFixed(6);
  await ffmpeg([
    '-y', '-ss', seconds, '-i', mediaPath,
    '-frames:v', '1',
    '-vf', 'scale=160:-2',
    '-q:v', '5',
    outPath,
  ], run);
}

export function quoteCardAss(
  text: string, profile: ExportProfile, attribution?: string,
): string {
  const { width, height } = profile;
  // Sized from the narrower dimension, for the same reason captions are: a
  // 9:16 card is half as wide and must not get type twice as large. [U-19 §2]
  const base = Math.min(width, height);
  const quoteSize = Math.round(base * 0.075);
  const attrSize = Math.round(base * 0.026);
  const side = Math.round(width * 0.10);

  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Quote,${FONT},${quoteSize},${assColor(CARD_INK)},${assColor(CARD_INK)},` +
      `${assColor('#000000')},${assColor('#000000')},1,0,0,0,100,100,0,0,1,0,0,5,` +
      `${side},${side},0,1`,
    `Style: Attr,${FONT},${attrSize},${assColor('#B8BEC6')},${assColor('#B8BEC6')},` +
      `${assColor('#000000')},${assColor('#000000')},0,0,0,0,100,100,0,0,1,0,0,2,` +
      `${side},${side},${Math.round(height * 0.055)},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    // A rule above the quote, so the card reads as a pull-quote rather than as
    // a caption that lost its picture.
    `Dialogue: 0,0:00:00.00,0:00:10.00,Quote,,0,0,0,,{\\pos(${Math.round(width / 2)},${Math.round(height * 0.30)})\\c${assColor(CARD_RULE).slice(2)}\\p1}m 0 0 l ${Math.round(base * 0.12)} 0 l ${Math.round(base * 0.12)} ${Math.max(2, Math.round(base * 0.006))} l 0 ${Math.max(2, Math.round(base * 0.006))}{\\p0}`,
    `Dialogue: 0,0:00:00.00,0:00:10.00,Quote,,0,0,0,,${escapeAss(`\u201C${text}\u201D`)}`,
  ];
  if (attribution) {
    lines.push(`Dialogue: 0,0:00:00.00,0:00:10.00,Attr,,0,0,0,,${escapeAss(attribution)}`);
  }
  return `${lines.join('\n')}\n`;
}

function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/**
 * The share card, drawn.  [Doctrine U-30, U-31, D-04]
 *
 * The words are not decided here — `buildShareCard` decided them, and this
 * sets them. That split is why the picture and the page's own metadata cannot
 * disagree: there is one generator and two renderings of it.
 *
 * It lives in this file, beside the quote card, because the two are the same
 * craft and a second card renderer would drift from the first within a
 * release. Same font, same ink, same gold rule, so a link preview looks like
 * the video it points at rather than like a different product.
 */
export async function renderShareCard(
  card: ShareCard, outPath: string, scratchDir: string, run?: RunOptions,
): Promise<string> {
  await mkdir(dirname(outPath), { recursive: true });
  await mkdir(scratchDir, { recursive: true });
  const assPath = join(scratchDir, 'share-card.ass');
  await writeFile(assPath, shareCardAss(card), 'utf8');

  await ffmpeg([
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=${CARD_BACKGROUND.replace('#', '0x')}:s=${CARD_WIDTH}x${CARD_HEIGHT}:d=1`,
    '-vf', `ass=${escapeFilterPath(assPath)}`,
    '-frames:v', '1',
    outPath,
  ], run);
  return outPath;
}

/**
 * Three sizes and nothing else.
 *
 * A link preview is read at about a third of this width, in a message list,
 * in a second and a half. So the card is built as a poster is: one line of
 * context, one line that carries it, one line of provenance. Anything more is
 * a paragraph nobody standing at a bus stop reads.
 */
export function shareCardAss(card: ShareCard): string {
  const width = CARD_WIDTH;
  const height = CARD_HEIGHT;
  const side = Math.round(width * 0.075);
  // The hero shrinks as it lengthens, so a long statement stays on the card
  // instead of running off it. Measured in characters because libass wraps
  // for us and the alternative is measuring text ourselves.
  const heroSize = card.hero.text.length > 110 ? 46
    : card.hero.text.length > 70 ? 56
      : card.hero.text.length > 40 ? 66 : 76;

  const style = (
    name: string, size: number, colour: string, alignment: number,
    marginV: number, bold: 0 | 1,
  ) => `Style: ${name},${FONT},${size},${assColor(colour)},${assColor(colour)},`
    + `${assColor('#000000')},${assColor('#000000')},${bold},0,0,0,100,100,0,0,1,0,0,`
    + `${alignment},${side},${side},${marginV},1`;

  const text = card.hero.quoted
    ? `\u201C${card.hero.text}\u201D`
    : card.hero.text;

  return `${[
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // 7 = top left, 4 = middle left, 1 = bottom left. Ranged down the card.
    style('Eyebrow', 26, '#B8BEC6', 7, Math.round(height * 0.11), 0),
    style('Hero', heroSize, CARD_INK, 4, 0, 1),
    style('Foot', 24, '#8F97A1', 1, Math.round(height * 0.085), 0),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    // The rule, which is the only ornament and the one thing carried over
    // from the video's own claim cards.
    `Dialogue: 0,0:00:00.00,0:00:10.00,Eyebrow,,0,0,0,,{\\pos(${side},${Math.round(height * 0.085)})\\c${assColor(CARD_RULE).slice(2)}\\p1}m 0 0 l 96 0 l 96 5 l 0 5{\\p0}`,
    `Dialogue: 0,0:00:00.00,0:00:10.00,Eyebrow,,0,0,0,,${escapeAss(card.eyebrow)}`,
    `Dialogue: 0,0:00:00.00,0:00:10.00,Hero,,0,0,0,,${escapeAss(text)}`,
    `Dialogue: 0,0:00:00.00,0:00:10.00,Foot,,0,0,0,,${escapeAss(`${card.scale}  ·  ${card.attribution}`)}`,
  ].join('\n')}\n`;
}
