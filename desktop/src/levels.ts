/**
 * How loud each microphone is.  [TAKE-DESKTOP T-3]
 *
 * > *"per-source signal, per-microphone level"*
 *
 * ONE AUDIO CONTEXT FOR EVERY SOURCE, not one each. A browser
 * allows a small number of them and a capture station with eight
 * cameras would exhaust that before the operator had finished
 * plugging in — and the limit is not a number anybody can look
 * up, so the design avoids needing to.
 *
 * READ ON A FRAME, NOT ON A TIMER. The meter is drawn by the
 * browser's own paint loop, so measuring on a different clock
 * would be measuring at moments nobody sees. `requestAnimationFrame`
 * also stops when the window is hidden, which is correct: a
 * capture station in the background is not metering.
 *
 * ROOT MEAN SQUARE, NOT PEAK. A peak meter on a quiet room reads
 * zero and then jumps to full on one door slam. RMS over the
 * analyser's window is what a person reads as "how loud is this",
 * and it is what the Room's own `measureVoice` reads too.
 */

/** How many samples the analyser averages. A frame at 48 kHz is ~800. */
const WINDOW = 1024;

export class Levels {
  private context: AudioContext | null = null;

  private readonly taps = new Map<string, {
    source: MediaStreamAudioSourceNode;
    analyser: AnalyserNode;
    /* `Float32Array<ArrayBuffer>`, not the default
       `ArrayBufferLike`: `getFloatTimeDomainData` will not take a
       view that might be over a `SharedArrayBuffer`. */
    buffer: Float32Array<ArrayBuffer>;
    /** The room, kept for the correlation check. [T-4] */
    kept: Float32Array<ArrayBuffer> | null;
    keptAt: number;
  }>();

  /**
   * How much room sound is kept per source, for the check.
   *
   * THE FIRST FEW SECONDS AND NO MORE. `align.ts` searches
   * ±0.75 s around a hint, so a few seconds either side of the
   * start is everything the correlation can use — and keeping
   * the whole recording in memory is how a capture station runs
   * out of it at minute forty.
   */
  static readonly KEEP_SECONDS = 4;

  /** Start metering this source's audio, if it has any. */
  listen(id: string, stream: MediaStream | null): void {
    if (this.taps.has(id)) return;
    if (!stream || stream.getAudioTracks().length === 0) return;
    try {
      this.context ??= new AudioContext();
      const analyser = this.context.createAnalyser();
      analyser.fftSize = WINDOW * 2;
      const source = this.context.createMediaStreamSource(stream);
      source.connect(analyser);
      /*
       * AND NOT CONNECTED TO THE OUTPUT. A capture station that
       * played every microphone back through the speakers in the
       * room it is recording would be a capture station that
       * howls. The analyser is a tap, not a path.
       */
      this.taps.set(id, {
        source, analyser, buffer: new Float32Array(new ArrayBuffer(WINDOW * 4)),
        kept: null, keptAt: 0,
      });
    } catch {
      /* No audio context here. The tile meters zero and says
         nothing, which is honest: nothing was measured. */
    }
  }

  forget(id: string): void {
    const tap = this.taps.get(id);
    if (!tap) return;
    try { tap.source.disconnect(); } catch { /* already gone */ }
    this.taps.delete(id);
  }

  /** 0–1 for this source, now. */
  read(id: string): number {
    const tap = this.taps.get(id);
    if (!tap) return 0;
    tap.analyser.getFloatTimeDomainData(tap.buffer);
    /* And into the kept room sound, while there is space. */
    if (tap.kept && tap.keptAt < tap.kept.length) {
      const room = Math.min(tap.buffer.length, tap.kept.length - tap.keptAt);
      tap.kept.set(tap.buffer.subarray(0, room), tap.keptAt);
      tap.keptAt += room;
    }
    let sum = 0;
    for (const sample of tap.buffer) sum += sample * sample;
    const rms = Math.sqrt(sum / tap.buffer.length);
    /*
     * SCALED SO A VOICE FILLS THE METER. RMS of ordinary speech
     * at a sensible gain is around 0.05–0.15, and a meter that
     * drew that as a tenth of its width would read as silence to
     * somebody checking a microphone is live — which is the one
     * thing it is for.
     */
    return Math.min(1, rms * 6);
  }

  /**
   * Start keeping the room sound, from now.
   *
   * SAMPLED ON THE SAME FRAME THE METER IS, which is not ideal
   * and is honest about what it is: the analyser hands back the
   * last `WINDOW` samples whenever it is asked, so a frame-rate
   * read leaves gaps where a frame was slow. That is why the
   * result is a CHECK and not a correction — a gappy envelope
   * can agree with the clock or fail to, and it is never the
   * better answer. [T-4]
   *
   * The alternative is an `AudioWorklet` per source, which is a
   * real-time thread per camera on a machine already running N
   * encoders. Not for a check.
   */
  keep(ids: readonly string[]): void {
    const rate = this.context?.sampleRate ?? 48_000;
    const room = Math.ceil(rate * Levels.KEEP_SECONDS);
    for (const id of ids) {
      const tap = this.taps.get(id);
      if (!tap) continue;
      tap.kept = new Float32Array(new ArrayBuffer(room * 4));
      tap.keptAt = 0;
    }
  }

  /** What was kept, and at what rate. */
  room(id: string): { samples: Float32Array; rate: number } | null {
    const tap = this.taps.get(id);
    if (!tap?.kept || tap.keptAt === 0) return null;
    return {
      samples: tap.kept.subarray(0, tap.keptAt),
      rate: this.context?.sampleRate ?? 48_000,
    };
  }

  /** Let go of everything. A context left open is a device held. */
  close(): void {
    for (const id of [...this.taps.keys()]) this.forget(id);
    void this.context?.close().catch(() => undefined);
    this.context = null;
  }
}
