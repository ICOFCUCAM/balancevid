#!/usr/bin/env bash
#
# The container entrypoint.  [Doctrine U-23, D-07]
#
# ROLE=all      the web tier, the worker and the playout engine  (default)
# ROLE=web      the web tier only
# ROLE=worker   the worker only
# ROLE=playout  the broadcast encoder only
#
# They are separate processes in every case. U-23's rule is that the web tier
# never invokes ffmpeg, and that holds whether the others are beside it or on
# another machine — so scaling them apart later is a ROLE change, not a code
# change. D-20 names the broadcast encoder as one of the seams that must not
# be welded shut; `ROLE=playout` is that seam, usable today.
#
# THE PLAYOUT ENGINE WAS MISSING FROM HERE, and Online TV therefore never
# transmitted a segment in any deployment. Everything upstream of it worked:
# the schedule resolved, the control room was correct, the playlist named the
# segments. Nothing wrote them. A channel is the one thing in this product
# that is supposed to run while nobody is looking, and the process that makes
# that true was the one the container did not start.
#
# If ANY of them dies, this exits. That is deliberate: a container running a
# web tier with no worker looks healthy and quietly accepts recordings it will
# never render, and one with no playout looks healthy and transmits nothing.
# Better to fall over and let the platform restart, which is also safe — an
# unfinished job is re-claimable, the shot cache (U-16) means a re-run resumes
# rather than restarts, and the playout engine holds no state at all: it picks
# up where the clock is, not where it left off.

set -uo pipefail

# EXPORTED, SO THE PROCESSES IT STARTS KNOW WHAT THEY ARE.
#
# This was a plain shell variable, which meant a `ROLE=web` container told
# the web tier nothing: the variable the PLATFORM set was exported and
# visible, but the default was not, so the one process that can show an
# operator anything could not tell "nobody set a role" from "somebody set
# web" — and the control room's advice was therefore to go and check a
# thing the process was sitting on. [health.ts, engineExpected]
export ROLE="${ROLE:-all}"
PORT="${PORT:-3000}"

# ------------------------------------------------------------------ ffmpeg
# WHICH BINARY DRAWS THE CHANNEL'S OWN NAME, AND PUSHES IT ANYWHERE.
# [CHANNEL C-24, C-35]
#
# The pinned `ffmpeg-static` is built without freetype and so has no
# `drawtext`. A filtergraph naming a filter that is not there is rejected
# WHOLE, so the station bug did not quietly fail to appear — it took every
# segment with it, and the fallback put black on the wire for as long as the
# channel had an identity.
#
# `WITH_TEXT=1` puts a capable ffmpeg on the image. This points at it, and
# ONLY if the file is really there: a Dockerfile cannot branch on a build
# argument inside an ENV, and the obvious attempt pointed every render at a
# binary that had not been installed. Looking for the file is correct in both
# directions and needs nobody to keep two settings in step.
#
# THE SECOND REASON, FOUND TWO STAGES AFTER THE FIRST: that same pinned
# binary segfaults READING mpegts, including a file it has just written. The
# RTMP sender is a remux of the engine's own segments, so on the default
# build every destination is unreachable. It is refused with the reason
# rather than restarted for ever, and this line is what fixes it. [C-35]
#
# An operator who sets BALANCEVID_FFMPEG themselves is not overruled.
if [ -z "${BALANCEVID_FFMPEG:-}" ] && [ -x /usr/bin/ffmpeg ]; then
  export BALANCEVID_FFMPEG=/usr/bin/ffmpeg
fi

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

# The broadcast encoder.  [CHANNEL §11, §18, D-20]
#
# A PROCESS, NOT A JOB: a broadcast does not finish, so it cannot live in the
# queue without either holding the single consumer for ever or becoming nine
# hundred jobs an hour whose only purpose is to not be that.
#
# It costs nothing on an instance with no channels — a pass over an empty list
# makes no segments and sleeps — and on an instance with a channel it costs
# exactly the encoding that channel asked for by being scheduled.
start_playout() {
  echo "serve: playout engine"
  setsid "$BIN/tsx" src/playout/index.ts &
  pids+=($!)
}

# THE VOLUME IS MADE READY BEFORE ANY OF THEM EXISTS.  [U-25, D-06]
#
# Not inside the processes: they start together, the playout engine never
# calls `ensureDirs` at all (it goes straight to what is on air), and a
# layout migration racing three readers is a way to be off air with the
# recordings apparently gone. Once, first, in front — and if it fails the
# container does not come up, which is the correct outcome for "the storage
# could not be prepared".
prepare_storage() {
  "$BIN/tsx" scripts/prepare-storage.ts
}

stop_all() {
  for pid in "${pids[@]}"; do
    kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  done
}

# ONLY THE WORKER WAITS FOR MODELS, and in `all` it waits LAST.
#
# `ensure_models` fetches ~600 MB on first boot. Written the obvious way —
# models, then the processes — it holds the channel off air and the web tier
# unreachable for the length of a download that neither of them needs. A
# channel is the one thing here that is supposed to be running while nobody
# is looking, so it goes up first and the transcriber catches up.
prepare_storage

case "$ROLE" in
  web)     start_web ;;
  worker)  ensure_models; start_worker ;;
  playout) start_playout ;;
  all)     start_playout; start_web; ensure_models; start_worker ;;
  *) echo "serve: unknown ROLE '$ROLE' (want web, worker, playout or all)" >&2
     exit 64 ;;
esac

# Exit as soon as ANY of them does, carrying its status out.
wait -n
status=$?
echo "serve: a process exited with ${status}; stopping the rest"
stop_all
wait
exit "$status"
