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

case "$ROLE" in
  web)    start_web ;;
  worker) start_worker ;;
  all)    start_worker; start_web ;;
  *) echo "serve: unknown ROLE '$ROLE' (want web, worker or all)" >&2; exit 64 ;;
esac

# Exit as soon as ANY of them does, carrying its status out.
wait -n
status=$?
echo "serve: a process exited with ${status}; stopping the rest"
stop_all
wait
exit "$status"
