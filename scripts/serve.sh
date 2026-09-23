#!/usr/bin/env bash
#
# The container entrypoint.  [Doctrine U-23, D-07]
#
# ROLE=all     the web tier and the worker, side by side  (default)
# ROLE=web     the web tier only
# ROLE=worker  the worker only
#
# They are separate processes in every case. U-23's rule is that the web tier
# never invokes ffmpeg, and that holds whether the worker is beside it or on
# another machine — so scaling them apart later is a ROLE change, not a code
# change.
#
# If either process dies, this exits. That is deliberate: a container running a
# web tier with no worker looks healthy and quietly accepts recordings it will
# never render. Better to fall over and let the platform restart, which is also
# safe — an unfinished job is re-claimable and the shot cache (U-16) means a
# re-run resumes rather than restarts.

set -uo pipefail

ROLE="${ROLE:-all}"
PORT="${PORT:-3000}"

pids=()

# ---------------------------------------------------------------- models
# The speech models live on the DATA volume, not in the image. They are
# identical in every deployment and ~600 MB unpacked, so baking them in means
# a host that keeps images for rollback stores the same 600 MB once per
# deploy — which is how a disk fills up without anyone doing anything wrong.
#
# Fetched once, on first boot, into the volume. Absent models are a degraded
# conversation, never a broken one, so a failure here logs and carries on.
ensure_models() {
  local root="${BALANCEVID_MODELS:-/data/models}"
  if [ -f "$root/silero_vad.onnx" ]; then return 0; fi
  if [ -d /models ] && [ -f /models/silero_vad.onnx ]; then
    echo "serve: copying the speech models onto the volume"
    mkdir -p "$root" && cp -r /models/. "$root/" && return 0
  fi
  echo "serve: fetching the speech models (once, onto the volume)"
  BALANCEVID_MODELS="$root" BALANCEVID_SKIP_PYTHON=1 \
    bash "$(dirname "${BASH_SOURCE[0]}")/fetch-models.sh" \
    || echo "serve: could not fetch the models — sources will not be transcribed"
}

# Pass the platform's stop signal on rather than dying and orphaning an ffmpeg
# that is halfway through someone's export (D-07).
shutdown() {
  trap '' TERM INT
  echo "serve: stopping (${#pids[@]} processes)"
  stop_all
  for pid in "${pids[@]}"; do wait "$pid" 2>/dev/null || true; done
  exit 0
}
trap shutdown TERM INT

# The binaries directly, not through npx: npx inserts a wrapper process
# between this script and the real one, and a stop signal then has one more
# hop to survive. Half-stopped is the worst outcome here — it is how an ffmpeg
# child outlives a redeploy.
BIN="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/node_modules/.bin"

# Each child leads its OWN process group, so a stop signal reaches its
# descendants too. This is not hypothetical: `next start` spawns a separate
# `next-server`, and signalling only the CLI leaves that grandchild running
# and the port held. With setsid the child's pid is also its group id, so
# `kill -TERM -$pid` reaches the whole tree.
start_web() {
  echo "serve: web tier on :${PORT}"
  setsid "$BIN/next" start -p "$PORT" &
  pids+=($!)
}

start_worker() {
  echo "serve: worker"
  setsid "$BIN/tsx" src/worker/index.ts &
  pids+=($!)
}

stop_all() {
  for pid in "${pids[@]}"; do
    kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  done
}

# Only the worker transcribes, so only the worker waits for models.
case "$ROLE" in
  web)    start_web ;;
  worker) ensure_models; start_worker ;;
  all)    ensure_models; start_worker; start_web ;;
  *) echo "serve: unknown ROLE '$ROLE' (want web, worker or all)" >&2; exit 64 ;;
esac

# Exit as soon as ANY of them does, carrying its status out.
wait -n
status=$?
echo "serve: a process exited with ${status}; stopping the rest"
stop_all
wait
exit "$status"
