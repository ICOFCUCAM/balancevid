/**
 * One programme, many audiences.  [Doctrine CHANNEL §15, D-21, U-22, D-16]
 *
 *                        ON AIR
 *                           │
 *              ┌────────────┼────────────┐
 *             TV          TikTok       YouTube
 *            16:9          9:16         16:9
 *
 * "The key is that Online TV creates one master broadcast output, and
 *  destinations receive that output... One live programme → multiple outputs."
 *
 * WHAT THIS IS NOT. It is not "send RTMP to TikTok". Every destination is a
 * CONNECTOR behind one interface, so a platform that changes its rules — and
 * TikTok's Live products are behind an app review whose terms are theirs to
 * change — changes one file. The architecture is here from the beginning and
 * the first implementation activates exactly one destination: the channel's
 * own. That is deliberate: a connector that cannot be tested is a connector
 * that is wrong, and the only one that can be tested today is ours.
 *
 * AND IT IS NOT A CROP. "Don't merely crop the television channel." Each
 * destination carries its own SHAPE and its own LAYOUT, so the vertical
 * output is a vertical composition — presenter above, content below, station
 * name at the foot — and not a 16:9 programme with its sides cut off. This is
 * U-22 ("vertical is a different edit") arriving at the broadcast layer, and
 * it is why a destination names a layout rather than a crop rectangle.
 *
 * THE SAME CLOCK DRIVES ALL OF THEM. A destination does not choose what is on
 * air: `whatIsOn` decides that once, and every output composes the same
 * moment its own way. Switching from Take 1 to Take 3 moves every output,
 * because there is one edit and several pictures of it.
 */

import type { Id } from './ids.js';

export type DestinationId = Id<'dest'>;

/**
 * Where an output goes.
 *
 * `own` is this product's own channel — the HLS the playout engine already
 * writes, and the one destination that needs no permission from anybody.
 * The rest are platforms, and each is a connector.
 */
export type DestinationKind =
  | 'own'
  | 'tiktok'
  | 'youtube'
  | 'facebook'
  | 'x'
  /** Anything that takes an RTMP URL and a key, which is most things. */
  | 'rtmp';

/** What a destination can be doing. */
export type DestinationState =
  /** Declared, not switched on. */
  | 'off'
  /** Switched on and the connector has what it needs. */
  | 'ready'
  /** Sending. */
  | 'on'
  /** Switched on and unable to send — the connector says why. */
  | 'blocked';

export interface Destination {
  id: DestinationId;
  kind: DestinationKind;
  label: string;
  enabled: boolean;
  /**
   * THE SHAPE THIS AUDIENCE WATCHES IN.
   *
   * Named as a ratio rather than a resolution because the resolution follows
   * from it and the ratio is the decision: a channel is 16:9, TikTok is 9:16,
   * and an author choosing between them is choosing between television and a
   * phone, not between two numbers.
   */
  shape: '16:9' | '9:16' | '1:1' | '4:5';
  /**
   * How this destination composes the moment.
   *
   * A layout id from the same table everything else uses (U-18). Absent means
   * "the shape's default", which for 16:9 is the programme as it is and for
   * 9:16 is the vertical arrangement — because a destination that had to be
   * told its own obvious answer is a destination most people set up wrong.
   */
  layoutId?: string;
  videoBitrate?: string;
  /**
   * What the connector needs, if anything.
   *
   * Deliberately opaque here: an RTMP URL and a stream key for one platform,
   * an OAuth grant for another. The domain knows a destination has settings;
   * only its connector knows what they mean. Secrets are never stored in the
   * document — see `D-21` — so this holds references, not keys.
   */
  settingsRef?: string;
  /** Why it is blocked, in the connector's words. */
  note?: string;
  createdAt: string;
}

/** The shape's pixels, at the house height. */
export function sizeOf(shape: Destination['shape']): { width: number; height: number } {
  switch (shape) {
    case '9:16': return { width: 1080, height: 1920 };
    case '1:1': return { width: 1080, height: 1080 };
    case '4:5': return { width: 1080, height: 1350 };
    default: return { width: 1280, height: 720 };
  }
}

/**
 * What a destination draws, when it has not been told.
 *
 * The vertical default is the brief's picture — presenter above, content
 * below, the station's name at the foot — and it is a LAYOUT, from the table,
 * so it reframes and renders exactly as every other layout does.
 */
export function defaultLayoutFor(shape: Destination['shape']): string {
  return shape === '16:9' ? 'performance_full' : 'broadcast_vertical';
}

export function layoutFor(destination: Destination): string {
  return destination.layoutId ?? defaultLayoutFor(destination.shape);
}

/**
 * The destinations that should actually be receiving the programme.
 *
 * `enabled` is the operator's switch; `state` is the connector's answer. A
 * destination that is switched on and blocked is not sending, and the control
 * room has to show both facts rather than one — "on" with nothing arriving is
 * the screen that loses a broadcast.
 */
export function sending(
  destinations: readonly Destination[],
  stateOf: (destination: Destination) => DestinationState,
): Destination[] {
  return destinations.filter(
    (destination) => destination.enabled && stateOf(destination) === 'on');
}

/**
 * What each platform is called and what it wants, for the control room.
 *
 * A table rather than branches, for the reason every other table in this
 * codebase is one: a new platform is a row. The `needsReview` flag is not
 * decoration — it is the difference between a connector somebody can switch
 * on this afternoon and one that waits on an app review, and a product that
 * showed them identically would be promising something it cannot deliver.
 */
export const PLATFORMS: Record<DestinationKind, {
  label: string;
  shape: Destination['shape'];
  /** The platform reviews apps before they may broadcast. */
  needsReview: boolean;
  hint: string;
}> = {
  own: {
    label: 'Prof Class TV',
    shape: '16:9',
    needsReview: false,
    hint: 'Your own channel. Always available, and the one that needs nobody’s permission.',
  },
  tiktok: {
    label: 'TikTok LIVE',
    shape: '9:16',
    needsReview: true,
    hint: 'TikTok reviews apps that integrate with its Live products. The connector '
      + 'has to be approved for your account and region before it can send.',
  },
  youtube: {
    label: 'YouTube LIVE',
    shape: '16:9',
    needsReview: true,
    hint: 'Needs a YouTube account with live streaming enabled and an authorised app.',
  },
  facebook: {
    label: 'Facebook LIVE',
    shape: '16:9',
    needsReview: true,
    hint: 'Needs a Page and an authorised app.',
  },
  x: {
    label: 'X LIVE',
    shape: '16:9',
    needsReview: true,
    hint: 'Needs an authorised app.',
  },
  rtmp: {
    label: 'RTMP',
    shape: '16:9',
    needsReview: false,
    hint: 'Anything that takes a server URL and a stream key.',
  },
};
