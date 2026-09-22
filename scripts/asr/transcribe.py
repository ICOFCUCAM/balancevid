"""
Offline speech recognition with word-level timing.

  [Doctrine U-03] "Word-level timing is what makes §12 (highlight a fragment),
  §24 (word-synchronised captions), §43 (research search with exact jump
  points), and §39 (chapters) possible. It costs nothing extra at transcription
  time and it is expensive to add afterwards. Capture it now."

This is the local engine. It sits behind the Transcriber interface (D-14,
"pluggable ASR behind one interface; no engine lock-in"), so a cloud engine can
replace it without anything upstream changing.

Speech is located with a VAD before recognition rather than being chopped into
fixed windows: fixed windows cut words in half at every boundary, and the
silence the VAD finds is also the most reliable evidence of where one sentence
ends and the next begins.

Reads 16 kHz mono PCM WAV. Writes JSON to stdout.
"""

import argparse
import json
import sys
import wave

import numpy as np
import sherpa_onnx


def read_wav(path):
    with wave.open(path) as w:
        if w.getnchannels() != 1 or w.getframerate() != 16000 or w.getsampwidth() != 2:
            raise SystemExit(
                f"expected 16 kHz mono 16-bit PCM, got {w.getframerate()} Hz "
                f"{w.getnchannels()}ch {w.getsampwidth() * 8}-bit"
            )
        frames = w.readframes(w.getnframes())
    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0


def build_recognizer(model_dir, threads):
    return sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=f"{model_dir}/encoder-epoch-99-avg-1.int8.onnx",
        decoder=f"{model_dir}/decoder-epoch-99-avg-1.onnx",
        joiner=f"{model_dir}/joiner-epoch-99-avg-1.int8.onnx",
        tokens=f"{model_dir}/tokens.txt",
        num_threads=threads,
        sample_rate=16000,
        feature_dim=80,
        decoding_method="greedy_search",
    )


def speech_segments(audio, vad_model, sample_rate=16000):
    """Locate speech. Returns [(start_sample, samples)], in order."""
    config = sherpa_onnx.VadModelConfig()
    config.silero_vad.model = vad_model
    config.silero_vad.threshold = 0.5
    config.silero_vad.min_silence_duration = 0.35
    config.silero_vad.min_speech_duration = 0.1
    # A cap on segment length: without it a continuous talker produces one
    # enormous segment and the recogniser's memory grows with it.
    config.silero_vad.max_speech_duration = 20.0
    config.sample_rate = sample_rate

    vad = sherpa_onnx.VoiceActivityDetector(config, buffer_size_in_seconds=60)
    window = 512
    out = []

    for offset in range(0, len(audio), window):
        vad.accept_waveform(audio[offset : offset + window])
        while not vad.empty():
            out.append((vad.front.start, np.array(vad.front.samples, dtype=np.float32)))
            vad.pop()

    vad.flush()
    while not vad.empty():
        out.append((vad.front.start, np.array(vad.front.samples, dtype=np.float32)))
        vad.pop()

    return out


def tokens_to_words(tokens, timestamps, offset_seconds, segment_end_seconds):
    """
    Merge BPE pieces into words.

    A transducer reports the onset of each token, not its end, so a word's end
    is taken as the onset of the next word -- and the last word of a segment
    ends where the VAD says speech stopped. This is derived timing, and it is
    marked as such rather than presented as measured.
    """
    words = []
    for token, time in zip(tokens, timestamps):
        start = offset_seconds + float(time)
        if token.startswith(" ") or not words:
            words.append({"text": token.strip(), "start": start, "end": None})
        else:
            words[-1]["text"] += token
    for index, word in enumerate(words):
        word["end"] = words[index + 1]["start"] if index + 1 < len(words) else segment_end_seconds
        if word["end"] <= word["start"]:
            word["end"] = word["start"] + 0.06
    return [w for w in words if w["text"]]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--wav", required=True)
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--vad-model", required=True)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--language", default="en")
    args = parser.parse_args()

    audio = read_wav(args.wav)
    duration = len(audio) / 16000.0
    recognizer = build_recognizer(args.model_dir, args.threads)

    words = []
    segments = []
    for start_sample, samples in speech_segments(audio, args.vad_model):
        start_seconds = start_sample / 16000.0
        end_seconds = start_seconds + len(samples) / 16000.0
        segments.append({"start": start_seconds, "end": end_seconds})

        stream = recognizer.create_stream()
        stream.accept_waveform(16000, samples)
        recognizer.decode_stream(stream)
        result = stream.result
        if not result.text.strip():
            continue
        words.extend(
            tokens_to_words(result.tokens, result.timestamps, start_seconds, end_seconds)
        )

    json.dump(
        {
            "engine": "sherpa-onnx",
            "model": args.model_dir.rsplit("/", 1)[-1],
            "language": args.language,
            "durationSeconds": duration,
            "words": words,
            "speechSegments": segments,
        },
        sys.stdout,
    )


if __name__ == "__main__":
    main()
