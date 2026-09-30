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
import type { Rect } from './presentation.js';
import { setById } from './virtualSet.js';

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
  /**
   * THE VIRTUAL SET the live studio composes its people against.  [§6, U-18]
   *
   * A space id from `SPACES` — Studio Two's own table of measured rooms, not
   * a second one. A channel picking "Concert Stage" is picking the same
   * thing a performance picks, drawn by the same renderer, which is why it is
   * an id here and not a colour: a set that was a hex value in the channel
   * document would be a set the renderer could not light. [D-19, INV-16]
   *
   * It lives on the identity rather than on the session because it is how the
   * CHANNEL looks, not how one broadcast looked: a station does not repaint
   * its studio between programmes.
   */
  spaceId?: string;
  /**
   * THE STATION'S STUDIO, which is not the same thing as a background.
   * [§27]
   *
   * *"Background simply replaces what's behind a person. Virtual Set is
   * a complete production scene."* A set id from `VIRTUAL_SETS`: a
   * room, an arrangement, the furniture in it, where the logo belongs
   * and which strip the lower third owns.
   *
   * IT LIVES BESIDE `spaceId` AND OUTRANKS IT. A channel with a set has
   * chosen its whole studio, and the house background is what people
   * are composited into when it has not. Both are on the identity for
   * the same reason: a station does not repaint its studio between
   * programmes. [§13]
   */
  setId?: string;
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
  /**
   * WHERE, WHEN THE SCENE SAYS WHERE.  [CHANNEL §27, C-18, C-20]
   *
   * A corner is the right answer for a channel composited into
   * somebody's own room: there is nothing in the picture the caption
   * can land on top of. It is the wrong answer for a set with a desk
   * in it — bottom-left is the desk's front edge, and a name written
   * across it is a name nobody can read.
   *
   * SO A SET MAY NAME THE REGION and the identity honours it.
   * `VirtualSet.logo` and `VirtualSet.lowerThird` have carried these
   * rectangles since the sets were drawn, tested to clear the
   * furniture, and been read by nothing. Fractions of the frame, like
   * every other rectangle in the product, so the same set places the
   * same caption at any output size. [D-06]
   *
   * Absent for a channel with no set, which is every channel that has
   * not chosen one — and then the corner decides, exactly as before.
   */
  at?: Rect;
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
  /*
   * THE SCENE, IF THERE IS ONE. A set is a room with furniture in it,
   * and the two regions it draws — where the station's mark belongs,
   * and the strip the lower third owns — are the set saying where its
   * own furniture is not. Null for a channel that has not chosen one,
   * and then every mark falls back to its corner. [§27, C-18, C-20]
   */
  const scene = setById(identity.setId);

  if (identity.bug?.text) {
    marks.push({
      kind: 'bug',
      text: identity.bug.text,
      corner: identity.bug.corner,
      opacity: identity.bug.opacity,
      size: 22,
      ink,
      ...(scene ? { at: scene.logo } : {}),
    });
  }

  /*
   * ONLY WHEN IT IS TRUE. A LIVE lamp on a repeat is the one piece of station
   * branding that is a lie rather than a decoration, and it is the piece
   * every viewer checks.
   */
  /*
   * AND THE LAMP KEEPS ITS CORNER, set or no set. It is not part of
   * the scene's design — it is the one mark that is a statement of
   * fact about the transmission, and a viewer checking whether this
   * is live should find it in the same place on every channel they
   * watch rather than wherever this room's furniture allowed. [§13]
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

  /*
   * SOMEBODY BEING CITED WINS OVER THE PROGRAMME'S NAME.
   *   [TIMELINE B14e; D-25]
   *
   * A viewer's answer is playing, and a lower third that still said
   * the show's title over their face would be the station taking
   * credit for what somebody sent in. It replaces the title rather
   * than joining it, because two plates in one corner is one plate
   * nobody can read — and it ignores `show` and `holdMs` entirely,
   * which are a statement about how the CHANNEL captions itself and
   * not about whether a named contributor is named.
   */
  const citing = on.kind === 'live' ? on.session.citing : undefined;
  if (citing) {
    marks.push({
      kind: 'lower-third',
      text: citing.name ? `${citing.name}  \u00b7  ${citing.asks}` : citing.asks,
      corner: 'bottom-left',
      opacity: 1,
      size: 26,
      plate: true,
      ink,
      ...(scene ? { at: scene.lowerThird } : {}),
    });
  }

  const lower = identity.lowerThird;
  if (!citing && lower && lower.show !== 'never' && on.kind !== 'off') {
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
        ...(scene ? { at: scene.lowerThird } : {}),
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
          ...(scene ? { at: scene.lowerThird } : {}),
        });
      }
    }
  }

  return marks;
}
