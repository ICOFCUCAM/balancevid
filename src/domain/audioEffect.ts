/**
 * What a sound can be made to sound like.  [TIMELINE B6j, B8]
 *
 * "Effects" is the last row of the brief's list of things the song
 * should accept, and it arrives with a warning attached two items
 * later: "don't turn Studio Two into Premiere Pro" [B9]. So this is a
 * SHORT NAMED LIST rather than a chain of parametric filters, and
 * every entry on it answers something an author making a performance
 * actually asks for — an intro that sounds like a radio, a verse heard
 * from the next room, a tail on a word.
 *
 * NAMED BY WHAT THEY SOUND LIKE, not by what they do. "Low-pass at 900
 * hertz" is a true description of `distant` and tells a musician
 * nothing they can act on; "as if from the next room" tells them
 * exactly when to reach for it. The frequencies are in the code, where
 * they belong.
 *
 * THE SAME LIST FOR THE SONG AND FOR A LAYER, because "make this
 * sound like a radio" is one idea and a studio with two of them is a
 * studio where the author has to remember which is which. [D-19]
 */

export type AudioEffectId = 'distant' | 'radio' | 'echo' | 'room';

export interface AudioEffect {
  id: AudioEffectId;
  /** What it is called. The author's word, not the filter's. */
  label: string;
  /** When to reach for it. */
  hint: string;
  /**
   * The ffmpeg stages, in order.
   *
   * A function rather than a string, because two of these need the
   * house rate and hard-coding 48000 in a table is how a rate change
   * becomes four silent bugs. [INV-14]
   */
  stages: () => string[];
}

export const AUDIO_EFFECTS: Record<AudioEffectId, AudioEffect> = {
  distant: {
    id: 'distant',
    label: 'From the next room',
    hint: 'muffled, as if through a wall — for an intro, or under a voice',
    /* A wall passes the low end and eats the top. Two poles rather
       than one: a single pole leaves enough sibilance to sound like a
       blanket over a speaker instead of a room away. */
    stages: () => ['lowpass=f=900:poles=2', 'volume=-3dB'],
  },
  radio: {
    id: 'radio',
    label: 'Like a radio',
    hint: 'thin and band-limited, the way a small speaker sounds',
    /* The telephone band, near enough: everything below 400 Hz and
       above 3.4 kHz gone, which is what makes the sound read as
       "reproduced" rather than "present". */
    stages: () => ['highpass=f=400', 'lowpass=f=3400', 'volume=2dB'],
  },
  echo: {
    id: 'echo',
    label: 'With an echo',
    hint: 'one clear repeat behind it — for a held word, or an outro',
    /* One repeat at 340 ms, quieter than the sound that made it. More
       than one repeat is a special effect; one is a room. */
    stages: () => ['aecho=0.8:0.85:340:0.4'],
  },
  room: {
    id: 'room',
    label: 'In a room',
    hint: 'a little space around it — for a voice recorded somewhere dead',
    /*
     * A HANDFUL OF EARLY REFLECTIONS, which is what a small room is
     * before it is a reverb tail: three close repeats, each quieter,
     * at intervals that do not divide into each other. Even spacing
     * would give a flutter, which is a corridor and not a room.
     *
     * `aecho` and not a convolution: an impulse response is a file to
     * ship, a licence to check and a second thing that can be
     * missing, for a difference nobody making a music video will
     * hear under a song.
     */
    stages: () => ['aecho=0.9:0.8:29|41|67:0.22|0.15|0.09'],
  },
};

/** The effect an id names, or nothing — an id from a document is data. */
export function audioEffect(id?: string | null): AudioEffect | undefined {
  return id ? AUDIO_EFFECTS[id as AudioEffectId] : undefined;
}

/** Every id, in the order they are offered. */
export const AUDIO_EFFECT_IDS = Object.keys(AUDIO_EFFECTS) as AudioEffectId[];
