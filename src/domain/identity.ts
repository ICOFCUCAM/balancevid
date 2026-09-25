/**
 * The channel's identity, applied at the broadcast layer.
 * [Doctrine CHANNEL §13, D-16, D-18]
 *
 * "The station branding should be applied at the broadcast layer, not
 *  permanently burned into your source videos. That way you can change your
 *  channel identity later."
 *
 * THAT SENTENCE IS THE DESIGN AND IT IS THE REPRESENTATION RULE AGAIN (D-16).
 * A bug in the corner is a property of the CHANNEL, not of the film — burning
 * it into a render would make that render un-broadcastable anywhere else, and
 * would mean re-rendering a library to change a logo. So the identity is a
 * small table on the channel, the segment encoder draws it over whatever it
 * is putting on the wire, and changing it changes every future second without
 * touching a single stored file.
 *
 * It is also why the identity lives HERE rather than in `segment.ts`: what
 * the channel looks like is a decision about the channel, and the encoder is
 * a thing that draws what it is told. The one that knows how to draw must not
 * also be the one that decides what.
 */

import type { OnAir } from './channel.js';

/** Where a mark sits. The four corners, in the language a gallery uses. */
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface ChannelIdentity {
  /**
   * THE STATION BUG: the name in the corner, up the whole time.
   *
   * Text rather than an image by default, because a channel that has just
   * been created has a name and does not have a logo, and a bug that appears
   * only once somebody has made a PNG is a feature most channels never get.
   * An image may be named as well, and then it is used instead.
   */
  bug?: {
    text?: string;
    /** A library asset id, drawn instead of the text where it is set. */
    assetId?: string;
    corner: Corner;
    /** 0–1. Under about 0.5 a bug is decoration; over 0.9 it is a fault. */
    opacity: number;
  };
  /**
   * THE LIVE INDICATOR. Drawn only while the channel is actually live, which
   * is the whole point of it — a channel whose LIVE light is part of its logo
   * is a channel lying to its viewers.
   */
  liveLamp?: { corner: Corner; text: string };
  /**
   * LOWER THIRDS: what is on, and who is presenting it.
   *
   * `auto` follows the schedule — the programme's title, and "NEXT" from the
   * listing — so a channel gets correct lower thirds without anybody typing
   * one. A presenter's name is typed, because nothing knows it.
   */
  lowerThird?: {
    show: 'never' | 'at-start' | 'always';
    /** How long it stays up at the start of a programme. */
    holdMs: number;
    presenter?: string;
  };
  /** The colour the marks are drawn in, so a channel looks like itself. */
  ink?: string;
}

export const DEFAULT_IDENTITY: ChannelIdentity = {
  liveLamp: { corner: 'top-left', text: 'LIVE' },
  lowerThird: { show: 'at-start', holdMs: 8000 },
  ink: '#ffffff',
};

/**
 * WHAT TO DRAW OVER THIS SECOND OF BROADCAST.
 *
 * Derived from the identity and from what is on air, and returned as a plain
 * description — text, position, opacity — with no idea that ffmpeg exists.
 * The encoder turns it into filters. Keeping the two apart is what lets the
 * whole identity be unit-tested without producing a frame: "does a live
 * broadcast get a LIVE lamp" is a question about a table, and answering it
 * with a rendered picture would be answering it the expensive way.
 */
export interface Mark {
  kind: 'bug' | 'lamp' | 'lower-third' | 'next';
  text: string;
  corner: Corner;
  opacity: number;
  /** Points, against a 720-line frame. The encoder scales with the picture. */
  size: number;
  /** A filled plate behind the text, for the marks that need to be read. */
  plate?: boolean;
  ink: string;
}

export function marksFor(
  identity: ChannelIdentity | undefined,
  on: OnAir,
  /** How far into the current programme the channel is. */
  intoProgrammeMs: number,
  titleOf: (on: OnAir) => string,
  nextTitle?: string,
): Mark[] {
  if (!identity) return [];
  const ink = identity.ink ?? '#ffffff';
  const marks: Mark[] = [];

  if (identity.bug?.text) {
    marks.push({
      kind: 'bug',
      text: identity.bug.text,
      corner: identity.bug.corner,
      opacity: identity.bug.opacity,
      size: 22,
      ink,
    });
  }

  /*
   * ONLY WHEN IT IS TRUE. A LIVE lamp on a repeat is the one piece of station
   * branding that is a lie rather than a decoration, and it is the piece
   * every viewer checks.
   */
  if (identity.liveLamp && on.kind === 'live') {
    marks.push({
      kind: 'lamp',
      text: identity.liveLamp.text,
      corner: identity.liveLamp.corner,
      opacity: 1,
      size: 20,
      plate: true,
      ink: '#ffffff',
    });
  }

  const lower = identity.lowerThird;
  if (lower && lower.show !== 'never' && on.kind !== 'off') {
    const showing = lower.show === 'always' || intoProgrammeMs < lower.holdMs;
    if (showing) {
      const title = titleOf(on);
      marks.push({
        kind: 'lower-third',
        text: lower.presenter ? `${title}  ·  ${lower.presenter}` : title,
        corner: 'bottom-left',
        opacity: 1,
        size: 26,
        plate: true,
        ink,
      });
      /*
       * NEXT rides with the title rather than appearing on its own, because
       * the moment a viewer wants to know what is next is the moment they are
       * being told what this is.
       */
      if (nextTitle) {
        marks.push({
          kind: 'next',
          text: `NEXT  ${nextTitle}`,
          corner: 'bottom-left',
          opacity: 0.85,
          size: 18,
          plate: true,
          ink,
        });
      }
    }
  }

  return marks;
}
