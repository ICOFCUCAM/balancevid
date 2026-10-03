/**
 * What each camera on this machine is doing.
 *   [Doctrine D-19, U-19; CHANNEL §24, §29; TAKE-DESKTOP T-3]
 *
 *     ┌──────────┬──────────┐
 *     │ 1 FRONT  │ 2 WIDE   │
 *     ├──────────┼──────────┤
 *     │ 3 CLOSE  │ 4 ROOM   │
 *     └──────────┴──────────┘
 *
 * > *"Read `guestGrid.ts` and `SwitchingStage.tsx` first. Two
 * > multiviews exist and a third should not be invented."*
 *
 * BOTH WERE READ, AND THIS IS WHAT CAME BACK.
 *
 * `guestGrid.ts` is the right shape for this: a PURE reading that,
 * given what the tracks are doing, says what each tile shows. Its
 * words are taken whole — `Eye`, `Mic`, `Health`, and the rule
 * that the label over a picture is ONE word and the WORST one, in
 * the order an operator triages. A test asserts the two agree on
 * those words, so this is the same vocabulary rather than one that
 * merely resembles it.
 *
 * `SwitchingStage.tsx` is where the numbered monitor with a label
 * badge comes from, and where the rule that a tile is a thing you
 * press comes from.
 *
 * WHAT COULD NOT BE SHARED, AND WHY. `guestGrid` reads a
 * `RTCPeerConnectionState` and asks the Room's own thresholds
 * whether somebody is speaking. **There is no peer here and no
 * Room.** A camera is either plugged into this machine or it is
 * not, and the failure it has is `getUserMedia` refusing — a
 * different question with a different answer, and forcing one
 * function to serve both would mean a `link` that is always
 * undefined and a speaking threshold borrowed from a conversation
 * that is not happening.
 *
 * AND THE GRID IS N, NOT FOUR. *"No data model that assumes four.
 * N throughout, four in the UI."* `guestGrid` fixes four because
 * the Room's tile IS four quarters; a capture station has as many
 * cameras as somebody plugged in.
 *
 * WHAT IS KEPT FROM THAT FIXED COUNT IS THE REASON FOR IT — *"a
 * grid that changed shape when a guest dropped would be a grid
 * that moves under the operator's hand at the worst possible
 * moment."* So the grid is sized by the sources the operator
 * CHOSE, and a camera that stops delivering keeps its tile and
 * says so. The same lesson, on the right trigger.
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

/** Where a picture comes from. T-6 adds `ndi` and `rtsp`. */
export type SourceKind = 'camera' | 'capture';

/**
 * The microphone, as against the person.
 *
 * `guestGrid.Mic`, word for word.
 */
export type Mic = 'open' | 'muted' | 'none';

/**
 * The camera.
 *
 * `guestGrid.Eye`, word for word — including the distinction that
 * matters most here: `dark` is a track that EXISTS and is
 * delivering nothing. A camera whose lens cap is on, a capture
 * card with no cable in it, and a device another application has
 * taken all arrive as exactly that.
 */
export type Eye = 'live' | 'dark' | 'none';

/**
 * What the tile is, in one word, in the order an operator triages.
 *
 * `guestGrid.Health`, word for word. `connecting` is a device
 * being opened rather than a peer being reached, and `lost` is
 * `getUserMedia` refusing rather than ICE failing — the words
 * carry, the causes do not.
 */
export type Health = 'live' | 'connecting' | 'unstable' | 'lost' | 'empty';

/** One source, as the application can see it. */
export interface SourceFeed {
  /** The device id, which is what `getUserMedia` is asked for. */
  id: string;
  label?: string;
  kind: SourceKind;
  /** Being opened: `getUserMedia` is in flight. */
  opening?: boolean;
  /** Why it would not open, if it would not. */
  refused?: string;
  hasVideo: boolean;
  /** A video track that exists and is delivering nothing. */
  videoDark?: boolean;
  hasAudio: boolean;
  /** The microphone is off, or the track has stopped arriving. */
  audioDark?: boolean;
  /** 0–1, from the same measurement the meter draws. */
  energy?: number;
  /** What the track actually settled on, which is rarely what was asked. */
  width?: number;
  height?: number;
  frameRate?: number;
}

/** What one tile shows. */
export interface SourceReading {
  /** 1..N, and it does not move when a camera is unplugged. */
  slot: number;
  id: string | null;
  label: string;
  kind: SourceKind | null;
  mic: Mic;
  eye: Eye;
  health: Health;
  /** 0–1, for the meter. Zero when there is nothing to meter. */
  energy: number;
  /** `1920×1080 · 30 fps`, or nothing while there is no picture. */
  format: string;
  /**
   * The word laid over the picture, or empty when the picture is
   * the answer. A tile that is fine says nothing: four tiles each
   * shouting LIVE is four tiles saying nothing.
   */
  says: string;
}

function micOf(feed: SourceFeed): Mic {
  if (!feed.hasAudio) return 'none';
  return feed.audioDark ? 'muted' : 'open';
}

function eyeOf(feed: SourceFeed): Eye {
  if (!feed.hasVideo) return 'none';
  return feed.videoDark ? 'dark' : 'live';
}

function healthOf(feed: SourceFeed, eye: Eye, mic: Mic): Health {
  /*
   * REFUSED IS OVER, which is `lost` in `guestGrid`'s words. A
   * camera another application has taken does not recover by
   * being looked at again, and the operator's next move is to
   * close that application — a different job from waiting.
   */
  if (feed.refused) return 'lost';
  if (feed.opening) return 'connecting';
  /*
   * AND A SOURCE THAT IS OPEN WITH NOTHING ARRIVING IS NOT LIVE.
   * `guestGrid`'s own rule — *"a monitor that read LIVE while
   * showing black would be the one thing a multi-view must never
   * do"* — and here it is the commonest real fault there is: a
   * capture card with no cable in it opens perfectly and
   * delivers black for ever.
   */
  if (eye !== 'live') return mic === 'open' ? 'unstable' : 'lost';
  return 'live';
}

/**
 * What to say over the picture, if anything.
 *
 * ONE WORD, AND THE WORST ONE — `guestGrid`'s rule, and the same
 * ordering: what an operator can act on first.
 */
function saysFor(health: Health, eye: Eye): string {
  if (health === 'connecting') return 'OPENING';
  if (health === 'lost' && eye === 'none') return 'NO SIGNAL';
  if (eye === 'none' || eye === 'dark') return 'NO PICTURE';
  /*
   * THREE CLAUSES STOOD HERE AND TWO COULD NOT BE OBSERVED.
   *
   * `if (!present) return 'NO SOURCE'` — the empty slot returns
   * its own reading above and never reaches this function, so
   * the parameter existed to answer a question nobody asked.
   *
   * `if (health === 'unstable') return 'UNSTABLE'` — `unstable`
   * arises only from a source with no picture and an open
   * microphone, and the clause above catches every eye that is
   * not live. The health is real and is tested; the LABEL was
   * unreachable. `guestGrid` can reach its own UNSTABLE because
   * a peer's link can falter while the picture keeps arriving,
   * and nothing local does that.
   *
   * Both deleted. [the twenty-fourth and twenty-fifth]
   *
   * AND SILENCE IS NOT A FAULT WORTH A LABEL OVER THE PICTURE. A
   * camera with no microphone is an ordinary choice — one
   * microphone in a room and four cameras is the usual
   * arrangement — so it is said in the badge, not over the
   * picture. The meter says the rest.
   */
  return '';
}

/** `1920×1080 · 30 fps`, or nothing. */
export function formatSays(feed: SourceFeed): string {
  if (!feed.width || !feed.height) return '';
  const size = `${feed.width}×${feed.height}`;
  /*
   * ROUNDED, BECAUSE A TRACK REPORTS 29.97 AND 30.000001 AND
   * NEITHER IS WHAT AN OPERATOR WANTS TO READ. The unrounded
   * number matters to `prepare.ts`, which gets the number rather
   * than this string.
   */
  return feed.frameRate
    ? `${size} · ${Math.round(feed.frameRate)} fps` : size;
}

/**
 * The tiles, one per source the operator chose.
 *
 * `slots` is how many the grid was drawn for. A source that stops
 * delivering keeps its tile and says so; a slot with nothing in
 * it reads NO SOURCE rather than closing up.
 */
export function readSources(
  feeds: readonly SourceFeed[], slots = feeds.length,
): SourceReading[] {
  /*
   * NO FLOOR UNDER `slots`. `Math.max(0, slots)` was here and
   * could not be observed: `Array.from({ length: -3 })` is `[]`
   * in JavaScript rather than a throw, so the guard did nothing
   * for the one input it was written against. The contract is
   * asserted in the test instead, which is where it belongs.
   * [the twenty-sixth]
   */
  return Array.from({ length: slots }, (_unused, index) => {
    const feed = feeds[index];
    const slot = index + 1;
    if (!feed) {
      return {
        slot, id: null, label: `Source ${slot}`, kind: null,
        mic: 'none' as Mic, eye: 'none' as Eye, health: 'empty' as Health,
        energy: 0, format: '', says: 'NO SOURCE',
      };
    }
    const mic = micOf(feed);
    const eye = eyeOf(feed);
    const health = healthOf(feed, eye, mic);
    return {
      slot,
      id: feed.id,
      label: feed.label ?? `Source ${slot}`,
      kind: feed.kind,
      mic,
      eye,
      health,
      energy: mic === 'open' ? Math.min(1, Math.max(0, feed.energy ?? 0)) : 0,
      format: eye === 'live' ? formatSays(feed) : '',
      says: saysFor(health, eye),
    };
  });
}

/** How many sources are actually delivering a picture. */
export function livePictures(readings: readonly SourceReading[]): number {
  return readings.filter((one) => one.eye === 'live').length;
}
