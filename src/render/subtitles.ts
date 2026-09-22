/**
 * Text rendering: captions, lower-thirds, attribution.  [Doctrine U-19, U-20, U-21]
 *
 * Everything on screen that is words goes through libass. One mechanism means
 * one visual language for speaker identity (U-20), correct shaping for
 * right-to-left and CJK scripts (D-12), and a burn-in that matches the sidecars
 * exactly -- because both are generated from the same cues.
 *
 * Captions are accessibility first, style second. The sidecars always ship
 * (INV-07); the burn-in is optional.
 */

import type { RenderPlan } from '../domain/plan.js';
import { HOUSE_FPS, type Frames } from '../domain/time.js';

export type Speaker = 'source' | 'user';

export interface Cue {
  /** t_output. Captions are timed in the final video's clock. [U-08] */
  startFrame: Frames;
  endFrame: Frames;
  speaker: Speaker;
  text: string;
}

/** The legibility floor. A user may choose the look; not an unreadable one. [U-19 §2] */
const CAPTION_FONT_FRACTION = 0.05;
const FONT = 'DejaVu Sans';

/** ASS colours are &HAABBGGRR — alpha first, then blue, green, red. */
export function assColor(hex: string, alpha = 0): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const rgb = m?.[1] ?? 'ffffff';
  const r = rgb.slice(0, 2), g = rgb.slice(2, 4), b = rgb.slice(4, 6);
  const a = alpha.toString(16).padStart(2, '0');
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

export function assTime(frames: Frames, fps: number = HOUSE_FPS): string {
  const totalCs = Math.round((frames / fps) * 100);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${h}:${p(m)}:${p(s)}.${p(cs)}`;
}

function escapeAss(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}')
    .replace(/\r?\n/g, '\\N');
}

export interface AssOptions {
  cues?: Cue[];
  /** Lower-thirds from the plan's response shots, with their type colours. */
  lowerThirds?: boolean;
  /** The generated attribution block, shown at the head. Non-removable. [U-21] */
  attribution?: boolean;
  attributionSeconds?: number;
  /** The quoted claim each response answers, shown as typography. [U-10] */
  claimCards?: boolean;
}

export function buildAss(plan: RenderPlan, options: AssOptions = {}): string {
  const { width, height, fps } = plan.exportProfile;
  const captionSize = Math.round(height * CAPTION_FONT_FRACTION);
  const lowerSize = Math.round(height * 0.032);
  const attrSize = Math.round(height * 0.026);
  const margin = Math.round(height * 0.06);

  const lines: string[] = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Speaker identity carried by more than colour, so it survives greyscale
    // and colour-blindness (U-20): the source is plain, the responder is bold.
    style('SourceCap', captionSize, '#FFFFFF', '#000000', 0, margin),
    style('UserCap', captionSize, '#FFFFFF', '#000000', 1, margin),
    style('Lower', lowerSize, '#FFFFFF', '#000000', 1, Math.round(height * 0.14), 1),
    // The claim being answered, as typography. This is what makes a response
    // legible to someone who did not watch the source. [U-10 §3]
    style('Claim', Math.round(height * 0.040), '#F2F2F2', '#000000', 0, Math.round(height * 0.07), 8),
    style('Attribution', attrSize, '#E8E8E8', '#000000', 0, margin, 3),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  if (options.attribution !== false) {
    const seconds = options.attributionSeconds ?? 6;
    lines.push(event(0, Math.round(seconds * fps), 'Attribution', plan.attribution.text, fps));
  }

  if (options.lowerThirds !== false) {
    for (const shot of plan.shots) {
      if (shot.kind !== 'response') continue;
      // Held briefly at the head of the response, then out of the way.
      const start = shot.outputStartFrame + shot.padHeadFrames;
      const end = Math.min(start + Math.round(2.5 * fps), shot.outputStartFrame + shot.durationFrames);
      if (end <= start) continue;
      const tinted = `{\\c${assColor(shot.accent)}}${escapeAss(shot.lowerThird)}`;
      lines.push(event(start, end, 'Lower', tinted, fps, true));
    }
  }

  if (options.claimCards !== false) {
    for (const shot of plan.shots) {
      if (shot.kind !== 'response' || !shot.quote) continue;
      const start = shot.outputStartFrame;
      const end = Math.min(
        start + Math.round(4 * fps), shot.outputStartFrame + shot.durationFrames);
      if (end <= start) continue;
      // Bound to quote_hash upstream (INV-05): what appears here is what the
      // source said, not a paraphrase of it.
      lines.push(event(start, end, 'Claim', `\u201C${escapeAss(shot.quote)}\u201D`, fps, true));
    }
  }

  for (const cue of options.cues ?? []) {
    lines.push(event(
      cue.startFrame, cue.endFrame,
      cue.speaker === 'user' ? 'UserCap' : 'SourceCap',
      escapeAss(cue.text), fps,
    ));
  }

  return lines.join('\n') + '\n';
}

function style(
  name: string, size: number, primary: string, outline: string,
  bold: 0 | 1, marginV: number, alignment = 2,
): string {
  return [
    `Style: ${name}`, FONT, String(size),
    assColor(primary), assColor(primary), assColor(outline), assColor('#000000', 0x80),
    String(bold), '0', '0', '0', '100', '100', '0', '0',
    // BorderStyle 3 = opaque box behind the text: the scrim that guarantees
    // the 4.5:1 contrast floor regardless of what is behind it. [U-19 §2]
    alignment === 1 ? '3' : '1',
    alignment === 1 ? '6' : '3', '0',
    String(alignment),
    String(Math.round(size * 1.6)), String(Math.round(size * 1.6)), String(marginV), '1',
  ].join(',');
}

function event(
  startFrame: Frames, endFrame: Frames, styleName: string,
  text: string, fps: number, raw = false,
): string {
  const body = raw ? text : text;
  return `Dialogue: 0,${assTime(startFrame, fps)},${assTime(endFrame, fps)},${styleName},,0,0,0,,${body}`;
}

/** INV-07 — sidecars ship with every export, whatever the burn-in setting. */
export function buildSrt(cues: Cue[], fps: number = HOUSE_FPS): string {
  return cues.map((cue, i) => [
    String(i + 1),
    `${srtTime(cue.startFrame, fps)} --> ${srtTime(cue.endFrame, fps)}`,
    `${cue.speaker === 'user' ? 'YOU' : 'SOURCE'}: ${cue.text}`,
    '',
  ].join('\n')).join('\n');
}

export function buildVtt(cues: Cue[], fps: number = HOUSE_FPS): string {
  const body = cues.map((cue) =>
    `${srtTime(cue.startFrame, fps).replace(',', '.')} --> ${srtTime(cue.endFrame, fps).replace(',', '.')}\n` +
    `<v ${cue.speaker === 'user' ? 'You' : 'Source'}>${cue.text}`,
  ).join('\n\n');
  return `WEBVTT\n\n${body}\n`;
}

function srtTime(frames: Frames, fps: number): string {
  const totalMs = Math.round((frames / fps) * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}
