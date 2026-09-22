#!/usr/bin/env bash
#
# Fetch the local speech-recognition models.
#
# Transcription runs on this machine, not in someone else's cloud: a product
# whose users record unpublished opinions should not have to ship every take to
# a third party to get a transcript (Doctrine D-03).
#
# The engine sits behind the Transcriber interface (D-14), so replacing it with
# a cloud service is registering a different implementation -- nothing that
# consumes a transcript changes.
#
#   ./scripts/fetch-models.sh        ~320 MB, once
#
# BALANCEVID_SKIP_PYTHON=1 fetches the model files only. The container build
# uses that to download models in a layer of their own, so a code change does
# not re-download 320 MB.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODELS="${BALANCEVID_MODELS:-$ROOT/var/models}"
ASR="sherpa-onnx-zipformer-en-2023-06-26"
BASE="https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models"

mkdir -p "$MODELS"

if [ -f "$MODELS/$ASR/tokens.txt" ]; then
  echo "acoustic model already present: $MODELS/$ASR"
else
  echo "fetching $ASR (~307 MB)…"
  curl -fL --retry 3 -o "$MODELS/$ASR.tar.bz2" "$BASE/$ASR.tar.bz2"
  tar xjf "$MODELS/$ASR.tar.bz2" -C "$MODELS"
  rm -f "$MODELS/$ASR.tar.bz2"
fi

if [ -f "$MODELS/silero_vad.onnx" ]; then
  echo "voice-activity model already present"
else
  echo "fetching silero_vad.onnx…"
  curl -fL --retry 3 -o "$MODELS/silero_vad.onnx" "$BASE/silero_vad.onnx"
fi

if [ "${BALANCEVID_SKIP_PYTHON:-0}" = "1" ]; then
  echo "models fetched; skipping the python environment as asked"
  exit 0
fi

if [ ! -x "$ROOT/.venv/bin/python" ]; then
  echo "creating python environment…"
  python3 -m venv "$ROOT/.venv"
fi
"$ROOT/.venv/bin/pip" install -q --upgrade pip
"$ROOT/.venv/bin/pip" install -q sherpa-onnx numpy

echo
echo "ready. the worker will transcribe new sources automatically."
