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
import { CAPTION_FLOOR_FRACTION, type CaptionStyle } from '../domain/presentation.js';
import { annotationEvents } from './annotations.js';
import { HOUSE_FPS, type Frames } from '../domain/time.js';

/**
 * WHICH SIDE of the conversation, not which person.  [U-20, ROOM §4]
 *
 * The primary distinction a viewer needs is the source's words against the
 * answer to them, and this product carries that by shape and position as well
 * as colour so it survives greyscale. That stays two-valued however many
 * people answer — a three-way discussion is still an argument with a source
 * on one side of it.
 *
 * WHO among the answerers is a separate field, because it is a separate
 * question and it degrades differently: a caption file read with no picture
 * needs the name, and a caption burned into a video where only one person
 * ever speaks does not.
 */
export type Speaker = 'source' | 'user';

export interface CueWord {
  text: string;
  /** t_output, like the cue's own frames. */
  startFrame: Frames;
  endFrame: Frames;
}

export interface Cue {
  /** t_output. Captions are timed in the final video's clock. [U-08] */
  startFrame: Frames;
  endFrame: Frames;
  speaker: Speaker;
  /**
   * The name of the person answering, when naming them tells the viewer
   * something.  [ROOM §4, §9]
   *
   * Set by `buildCues` from the conversation, and only where the conversation
   * has more than one voice in it — the same question the lower third asks,
   * asked once in the domain rather than twice in two renderers. Absent on a
   * source cue, which is the source, and on a solo conversation, where a name
   * on every line is noise.
   */
  speakerName?: string;
  text: string;
  /**
   * The same line, word by word, where the engine timed it.
   *
   * Carried on the cue rather than looked up at draw time because a cue has
   * already been clipped to its shot and shifted onto the output clock, and
   * doing that arithmetic twice in two places is how the highlight ends up a
   * few frames behind the voice. Absent when the engine gives no word timing,
   * which is a thing the renderer must cope with rather than require. [U-08]
   */
  words?: CueWord[];
}

const FONT = 'DejaVu Sans';
/**
 * The one alternative face, for the Editorial look.
 *
 * Two faces, not a font menu. A serif at caption size over moving footage is
 * harder to read, so it is offered where the footage is calm and the register
 * matters — an essay, a lecture — and nothing falls back to it. [U-19 §2]
 */
const SERIF_FONT = 'DejaVu Serif';

/**
 * The colour the word being spoken is lit in.
 *
 * A bright amber against the caption's white, on the same box, so both states
 * clear the contrast floor. It is an addition rather than a subtraction on
 * purpose: the version of this effect that dims the words not yet said puts
 * most of every line under the floor for most of its life. [D-04]
 */
const HIGHLIGHT_INK = '#F2C14E';

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
  const face = {
    ...(captionStyle.serif ? { serif: true } : {}),
    ...(captionStyle.highlightWords ? { secondary: HIGHLIGHT_INK } : {}),
  };
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
    style('SourceCap', captionSize, '#FFFFFF', '#000000', 0, captionMargin, 2, boxed, face),
    style('UserCap', captionSize, '#FFFFFF', '#000000', 1, captionMargin, 2, boxed, face),
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
    const styleName = cue.speaker === 'user' ? 'UserCap' : 'SourceCap';
    /*
     * The look may emit override tags, so the text is already ASS and must not
     * be escaped again. Everything that came from a person went through
     * `escapeAss` on the way in.
     */
    for (const drawn of captionEvents(cue, captionStyle)) {
      lines.push(event(drawn.startFrame, drawn.endFrame, styleName, drawn.text, fps, true));
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * One cue, as the chosen look draws it — usually one event, sometimes many.
 * [U-19 §2, U-20, D-16, INV-00]
 *
 * THE LOOK NEVER CHANGES WHICH WORDS ARE THERE. Everything below adds marks, a
 * prefix, a colour or a split to the same text `buildCues` produced from the
 * canonical transcript. No branch here can drop a line or write one, which is
 * the property that lets six looks exist without six versions of what was
 * said — and it is what keeps a vertical clip from saying something the long
 * version does not.
 */
function captionEvents(
  cue: Cue, style: CaptionStyle,
): { startFrame: Frames; endFrame: Frames; text: string }[] {
  const lit = style.highlightWords ? litWords(cue) : null;
  if (!lit) {
    return [{
      startFrame: cue.startFrame,
      endFrame: cue.endFrame,
      text: decorate(escapeAss(cue.text), cue, style),
    }];
  }
  return lit;

  /**
   * One event per word, each drawing the WHOLE line with one word coloured.
   *
   * The obvious implementation is ASS karaoke — one event, `\\kf` per word —
   * and it is wrong for what this look is called. Karaoke fills from the
   * secondary colour to the primary, which colours the words NOT YET SAID and
   * turns them plain as they arrive. "Each word lights as it is said" is the
   * opposite, and it is the one people mean: the line sits in its ordinary
   * ink and the word being spoken is lit.
   *
   * So the line is redrawn once per word. More events, and worth it: the
   * effect is the one the name promises, the unlit words never leave the
   * caption's own ink, and nothing is dimmed — the version that dims what has
   * not been said yet puts most of every line under the contrast floor for
   * most of its life. [D-04]
   */
  function litWords(source: Cue): { startFrame: Frames; endFrame: Frames; text: string }[] | null {
    const words = source.words;
    if (!words?.length) return null;
    /*
     * AND ONLY WHEN THE WORDS ARE THE LINE. Words are clipped to their shot,
     * so a sentence straddling a cut keeps its text and loses the words that
     * fell outside. Drawing the line from those would silently publish a
     * shorter sentence than the sidecar carries, which is exactly the drift
     * this whole family of looks is forbidden to cause. Checked rather than
     * assumed, and a mismatch falls back to the plain line. [D-16]
     */
    const joined = words.map((word) => word.text).join(' ').replace(/\s+/g, ' ').trim();
    if (joined !== source.text.replace(/\s+/g, ' ').trim()) return null;

    return words.map((word, index) => {
      const next = words[index + 1];
      const body = words.map((other, position) => {
        const text = escapeAss(other.text);
        return position === index
          ? `{\\c${assColor(HIGHLIGHT_INK)}}${text}{\\c${assColor('#FFFFFF')}}`
          : text;
      }).join(' ');
      return {
        startFrame: index === 0 ? source.startFrame : word.startFrame,
        // Held until the next word starts, so the lit word never blinks out
        // into an unlit line during a pause between two words.
        endFrame: next ? next.startFrame : source.endFrame,
        text: decorate(body, source, style),
      };
    }).filter((drawn) => drawn.endFrame > drawn.startFrame);
  }
}

/**
 * The marks and the prefix, applied to a line however it was built.
 *
 * Separate from building it so the plain line and each of a highlighted
 * line's frames get exactly the same treatment — a quoted highlight keeps its
 * quotation marks on every frame, which is the sort of thing that goes wrong
 * when two paths decorate independently.
 */
function decorate(body: string, cue: Cue, style: CaptionStyle): string {
  /*
   * The source's words as quotation, where the look asks for it. Only the
   * source's: the author's own words are not a quotation of anybody, and
   * marks around them would say they were. [INV-05]
   */
  const wrapped = style.quoteSource && cue.speaker === 'source'
    ? `{\\i1}\u201C${body}\u201D{\\i0}`
    : body;

  if (!style.speakerPrefix) return wrapped;
  /*
   * WHO IS SPEAKING, in the one visual language (U-20): carried by the label
   * and its weight rather than by colour, so it survives greyscale like
   * everything else in that language does.
   */
  /*
   * Their name where there is one to give, and "YOU" where the conversation
   * has one voice. A two-person discussion captioned "YOU" twice tells the
   * viewer nothing; a solo one captioned with the author's own name on every
   * line reads as a transcript of somebody else.
   */
  const who = cue.speaker === 'user'
    ? (cue.speakerName ? cue.speakerName.toUpperCase() : 'YOU')
    : 'SOURCE';
  return `{\\b1}${who}:{\\b0} ${wrapped}`;
}

function style(
  name: string, size: number, primary: string, outline: string,
  bold: 0 | 1, marginV: number, alignment = 2, boxed?: boolean,
  face?: { serif?: boolean; secondary?: string },
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
    `Style: ${name}`, face?.serif ? SERIF_FONT : FONT, String(size),
    // Primary is the word as spoken; secondary is what karaoke fills FROM, so
    // a look without a highlight sets both the same and nothing appears to
    // change. [U-19 §2]
    assColor(primary), assColor(face?.secondary ?? primary),
    assColor(outline), assColor('#000000', 0x80),
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

/**
 * Who said it, for a caption FILE.
 *
 * Always named where a name exists, unlike the burned-in version: a sidecar
 * is read by a screen reader and by anyone with the sound off and no picture,
 * and "You" in a file that will outlive the page it was downloaded from names
 * nobody at all. [D-04, U-19]
 */
function speakerLabel(cue: Cue): string {
  if (cue.speaker !== 'user') return 'Source';
  return cue.speakerName ?? 'You';
}

/** INV-07 — sidecars ship with every export, whatever the burn-in setting. */
export function buildSrt(cues: Cue[], fps: number = HOUSE_FPS): string {
  return cues.map((cue, i) => [
    String(i + 1),
    `${srtTime(cue.startFrame, fps)} --> ${srtTime(cue.endFrame, fps)}`,
    `${speakerLabel(cue).toUpperCase()}: ${cue.text}`,
    '',
  ].join('\n')).join('\n');
}

export function buildVtt(cues: Cue[], fps: number = HOUSE_FPS): string {
  const body = cues.map((cue) =>
    `${srtTime(cue.startFrame, fps).replace(',', '.')} --> ${srtTime(cue.endFrame, fps).replace(',', '.')}\n` +
    `<v ${speakerLabel(cue)}>${cue.text}`,
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
