#!/usr/bin/env bash
#
# Conformance under workerd.
#
# A Worker does not run from the command line: it is served. So this script does
# what no `package.json` line does legibly — start the runtime, wait for it to
# answer, query it, stop it whatever happens.
#
# `--fail` is what carries the verdict: `worker.ts` answers 500 as soon as a case
# fails, and curl turns that 500 into a non-zero exit code.
set -euo pipefail

PORT="${PORT:-8799}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="$(mktemp)"

# Wrangler resolves the entry from the project root it infers, not from the
# current directory: the absolute path is not a matter of style.
npx --yes wrangler@4 dev "$HERE/worker.ts" \
  --port "$PORT" \
  --compatibility-date 2026-08-16 \
  --compatibility-flags nodejs_compat \
  >"$LOG" 2>&1 &
WRANGLER_PID=$!

cleanup() {
  kill "$WRANGLER_PID" 2>/dev/null || true
  wait "$WRANGLER_PID" 2>/dev/null || true
  rm -f "$LOG"
}
trap cleanup EXIT

# Polling rather than a fixed `sleep`: the first start downloads wrangler and
# later ones do not — the gap runs from a few seconds to a minute.
for _ in $(seq 1 90); do
  if curl -fsS -m 5 -o /dev/null "http://127.0.0.1:$PORT/" 2>/dev/null; then break; fi
  if ! kill -0 "$WRANGLER_PID" 2>/dev/null; then
    echo "[conformance] wrangler exited before it was ready:" >&2
    cat "$LOG" >&2
    exit 1
  fi
  sleep 2
done

if ! curl -fsS -m 30 "http://127.0.0.1:$PORT/"; then
  echo "[conformance] failed under workerd (see the response body above)" >&2
  exit 1
fi
