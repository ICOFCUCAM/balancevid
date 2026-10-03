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
  }>();

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

  /** Let go of everything. A context left open is a device held. */
  close(): void {
    for (const id of [...this.taps.keys()]) this.forget(id);
    void this.context?.close().catch(() => undefined);
    this.context = null;
  }
}
