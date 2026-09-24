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
import { CAPTION_FLOOR_FRACTION } from '../domain/presentation.js';
import { annotationEvents } from './annotations.js';
import { HOUSE_FPS, type Frames } from '../domain/time.js';

export type Speaker = 'source' | 'user';

export interface Cue {
  /** t_output. Captions are timed in the final video's clock. [U-08] */
  startFrame: Frames;
  endFrame: Frames;
  speaker: Speaker;
  text: string;
}

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

/** Exported so every burned-in text in the product escapes identically. */
export function escapeAss(text: string): string {
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
  /** What each shown document is, while it is on screen. [U-33 §4] */
  evidenceLabels?: boolean;
  /** Marks over the frozen source frame. [U-12] */
  annotations?: boolean;
}

export function buildAss(plan: RenderPlan, options: AssOptions = {}): string {
  const { width, height, fps } = plan.exportProfile;
  /**
   * Type is sized from the NARROWER dimension, not the height.
   *
   * Legibility is about how much of the frame's width a line occupies. Sizing
   * from height gives a 9:16 clip type twice as large as the same caption on a
   * 16:9 export, on a canvas half as wide — which is how a caption ends up
   * wider than the picture. [U-19 §2]
   */
  const base = Math.min(width, height);
  /*
   * The look the PLAN chose. Not decided here: a renderer that picked its own
   * caption size would be a second opinion about the export, and the point of
   * the plan is that there is only one. [U-18]
   *
   * The floor is applied anyway, and that is deliberate belt-and-braces: it
   * is the one property captions must have, and the cost of asserting it
   * twice is nothing next to shipping an export nobody can read. [D-04]
   */
  const captionStyle = plan.captions.style;
  const captionSize = Math.round(
    base * Math.max(captionStyle.fontFraction, CAPTION_FLOOR_FRACTION));
  const captionMargin = Math.round(height * captionStyle.marginFraction);
  const boxed = captionStyle.scrim === 'box';
  const lowerSize = Math.round(base * 0.032);
  const attrSize = Math.round(base * 0.026);
  const margin = Math.round(height * 0.06);

  const lines: string[] = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    // 0 is smart wrapping. 2 means "only break where I put \\N", which on a
    // narrow canvas means a long caption simply runs off the side.
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Speaker identity carried by more than colour, so it survives greyscale
    // and colour-blindness (U-20): the source is plain, the responder is bold.
    style('SourceCap', captionSize, '#FFFFFF', '#000000', 0, captionMargin, 2, boxed),
    style('UserCap', captionSize, '#FFFFFF', '#000000', 1, captionMargin, 2, boxed),
    style('Lower', lowerSize, '#FFFFFF', '#000000', 1, Math.round(height * 0.14), 1),
    // The claim being answered, as typography. This is what makes a response
    // legible to someone who did not watch the source. [U-10 §3]
    style('Claim', Math.round(base * 0.040), '#F2F2F2', '#000000', 0, Math.round(height * 0.07), 8),
    // The citation on screen: what this document is, while it is being shown.
    style('Evidence', Math.round(base * 0.026), '#E8E8E8', '#000000', 0, Math.round(height * 0.035), 1),
    // Drawing events carry all their own styling; this style only has to be
    // positionless and unmargined so \pos and \p1 behave.
    `Style: Annotation,${FONT},${Math.round(base * 0.035)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
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

  // The opening card: the statement the clip answers, held before anything
  // moves, so the clip reads with the sound off. [U-22 §2]
  if (plan.openingClaim && options.claimCards !== false) {
    const opening = plan.openingClaim;
    const hold = Math.max(1, Math.round(opening.seconds * fps));
    /*
     * Quotation marks only where they were earned. The source's own sentence
     * gets them, because the clip plays it a moment later and the viewer can
     * hear whether the quotation was fair. The author's own hook does not:
     * quoted, it would read as something the source said, over the source's
     * own picture. [INV-05]
     */
    const text = opening.quoted
      ? `\u201C${escapeAss(opening.text)}\u201D`
      : escapeAss(opening.text);
    lines.push(event(0, hold, 'Claim', text, fps, true));
  }

  if (options.claimCards !== false) {
    for (const shot of plan.shots) {
      if (shot.kind !== 'response' || !shot.quote) continue;
      // Already shown as the opening card; showing it again would be noise.
      if (plan.openingClaim?.text === shot.quote) continue;
      const start = shot.outputStartFrame;
      const end = Math.min(
        start + Math.round(4 * fps), shot.outputStartFrame + shot.durationFrames);
      if (end <= start) continue;
      // Bound to quote_hash upstream (INV-05): what appears here is what the
      // source said, not a paraphrase of it.
      lines.push(event(start, end, 'Claim', `\u201C${escapeAss(shot.quote)}\u201D`, fps, true));
    }
  }

  if (options.evidenceLabels !== false) {
    for (const shot of plan.shots) {
      if (shot.kind !== 'response') continue;
      for (const cue of shot.evidence ?? []) {
        const start = shot.outputStartFrame + cue.startFrame;
        const end = shot.outputStartFrame + cue.endFrame;
        if (end <= start) continue;
        lines.push(event(start, end, 'Evidence', escapeAss(cue.title), fps, true));
      }
    }
  }

  if (options.annotations !== false) {
    for (const shot of plan.shots) {
      if (shot.kind !== 'response' || !shot.annotations?.length) continue;
      lines.push(...annotationEvents(
        shot.annotations, plan.exportProfile, shot.outputStartFrame, assTime));
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
  bold: 0 | 1, marginV: number, alignment = 2, boxed?: boolean,
): string {
  /*
   * BorderStyle 3 = an opaque box behind the text, which guarantees the 4.5:1
   * contrast floor whatever is behind it; 1 = an outline, which depends on
   * the picture. Lower-thirds (alignment 1) are always boxed because they sit
   * over whatever the layout put in that corner; captions follow the look the
   * author chose. [U-19 §2, D-04]
   */
  const box = boxed ?? alignment === 1;
  return [
    `Style: ${name}`, FONT, String(size),
    assColor(primary), assColor(primary), assColor(outline), assColor('#000000', 0x80),
    String(bold), '0', '0', '0', '100', '100', '0', '0',
    box ? '3' : '1',
    box ? '6' : '3', '0',
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
