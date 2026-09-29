/**
 * What to do about the room the take was recorded in.
 * [MASTER-EDIT §6, §8, §12 P2; Doctrine STUDIO-TWO §9, S-7, U-18, INV-03]
 *
 * §6 lists audio denoise, de-reverb and speech enhancement among
 * PowerDirector's professional capabilities, and §8 lists "audio cleanup"
 * among Studio Two's own. Of everything on that list this is the one that
 * changes what a finished video SOUNDS like rather than what it looks like,
 * and it is the one a phone microphone in a bedroom actually needs.
 *
 * FOUR ROWS, NOT SIXTEEN, and the reason is S-8's about transitions: "a
 * transition that works three times in five is worse than one the author
 * never had, because they only find out at the export." A denoiser that
 * leaves a swirling artefact behind the vocal is exactly that, so what is
 * here is what survives being wrong: a high-pass that cannot hurt, an FFT
 * denoiser that tracks the noise rather than being told about it, and a
 * levelling stage. Each row is a NAME an author chooses by what is wrong
 * with their recording, not a rack of parameters. [U-18]
 *
 * WHAT IS DELIBERATELY ABSENT, and said out loud rather than half-built:
 *
 *   DE-REVERB. There is no ffmpeg filter that removes a room. What exists
 *   is gating, which removes the reverb TAIL by silencing everything below
 *   a threshold — and on a sung phrase that is the end of every note. A
 *   feature called de-reverb that chops note endings is worse than no
 *   feature, because the author blames their singing.
 *
 *   `arnndn`, which is the good one. It is a recurrent network and needs a
 *   trained model file this product does not ship and cannot fetch at
 *   render time (the render layer has no network by design). When a model
 *   is vendored this becomes a fifth row and nothing else changes.
 *
 * IT NEVER TOUCHES THE SONG. Every row applies to a TAKE's own microphone.
 * The master is the author's music, mastered by whoever mastered it, and
 * running a denoiser over it is damage done on their behalf — which is the
 * same reason `mayShowMasterPicture` exists. The mixer enforces that, and a
 * test says so.
 *
 * AND NO ROW CHANGES THE LENGTH. Every filter named here is sample-count
 * preserving. One that were not would move every cut after it, which is
 * INV-02 broken by an audio setting — so the chain is asserted against the
 * list rather than trusted to stay that way.
 */

export interface Cleanup {
  id: string;
  label: string;
  /** What is wrong with the recording, said the way an author would say it. */
  hint: string;
  /**
   * The ffmpeg stages, in order, applied to this take's own sound.
   *
   * Written out rather than composed from flags, because a chain assembled
   * from five booleans has thirty-two behaviours and four of them have ever
   * been listened to.
   */
  stages: readonly string[];
}

/**
 * Below ninety hertz there is no voice and no guitar — there is handling,
 * traffic, a fan, and a desk being leant on. Every row starts here because
 * it is the one stage that cannot make a recording worse.
 */
const RUMBLE = 'highpass=f=90';

/**
 * `nt=w` tracks white-ish noise and adapts, rather than being handed a
 * profile the author would have to capture. `nr` is how hard, in dB.
 */
const denoise = (nr: number) => `afftdn=nr=${nr}:nf=-25:nt=w`;

export const CLEANUPS: Record<string, Cleanup> = {
  rumble: {
    id: 'rumble', label: 'Rumble',
    hint: 'Handling, traffic and a desk being leant on. The safe one.',
    stages: [RUMBLE],
  },
  room: {
    id: 'room', label: 'Room tone',
    hint: 'A fan, a fridge, the hiss of a cheap microphone.',
    stages: [RUMBLE, denoise(12)],
  },
  /*
   * LOUDER IS NOT THE SAME AS CLEARER, and this row is the one that can be
   * overdone, so it is the one with a limiter after it. `speechnorm` pulls
   * quiet syllables up towards the loud ones; without a ceiling above it,
   * the first shouted line clips. [INV-11]
   */
  voice: {
    id: 'voice', label: 'Voice',
    hint: 'A quiet, uneven vocal brought forward and levelled.',
    stages: [RUMBLE, denoise(12), 'speechnorm=e=6.25:r=0.0005:l=1',
      'alimiter=limit=0.95'],
  },
  /*
   * THE LOUD ONE, AND IT IS NAMED FOR WHAT IT COSTS. Twenty dB of FFT
   * denoise will take out a bad room and will put a faint swirl behind the
   * vocal doing it. An author who can hear the fan on playback will accept
   * that trade; an author who cannot should not be handed it by default,
   * which is why it is a separate row and not a slider on the one above.
   */
  heavy: {
    id: 'heavy', label: 'Heavy',
    hint: 'A bad room. Takes more out, and you may hear it working.',
    stages: [RUMBLE, denoise(20), 'speechnorm=e=6.25:r=0.0005:l=1',
      'alimiter=limit=0.95'],
  },
};

export const NO_CLEANUP = 'none';

export function cleanupFor(id: string | undefined): Cleanup | undefined {
  if (id === undefined || id === NO_CLEANUP) return undefined;
  return CLEANUPS[id];
}

export function isCleanup(id: string): boolean {
  return Object.hasOwn(CLEANUPS, id);
}

/**
 * Every filter name this module is allowed to emit.
 *
 * The guard behind "no row changes the length". A row added tomorrow with
 * `atempo` or `apad` in it would move every cut after it — INV-02 broken by
 * an audio setting, and it would present as a video that drifts out of sync
 * near the end, which is the hardest class of bug in this product to trace
 * back to its cause. So the allowed set is written down and a test walks
 * the table against it.
 */
export const LENGTH_PRESERVING: readonly string[] = [
  'highpass', 'lowpass', 'afftdn', 'anlmdn', 'adeclick', 'speechnorm',
  'acompressor', 'alimiter', 'equalizer', 'dynaudnorm',
];
