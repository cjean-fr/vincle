#!/usr/bin/env bash
#
# Conformité sous workerd.
#
# Un Worker ne s'exécute pas en ligne de commande : il se sert. Ce script fait
# donc ce qu'aucune ligne de `package.json` ne fait lisiblement — démarrer le
# runtime, attendre qu'il réponde, l'interroger, l'arrêter quoi qu'il arrive.
#
# `--fail` est ce qui transporte le verdict : `worker.ts` répond 500 dès qu'un
# cas échoue, et curl transforme ce 500 en code de sortie non nul.
set -euo pipefail

PORT="${PORT:-8799}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="$(mktemp)"

# Wrangler résout l'entrée depuis la racine de projet qu'il déduit, pas depuis
# le répertoire courant : le chemin absolu n'est pas une précaution de style.
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

# Attente active plutôt qu'un `sleep` fixe : le premier démarrage télécharge
# wrangler, les suivants non — l'écart va de quelques secondes à une minute.
for _ in $(seq 1 90); do
  if curl -fsS -m 5 -o /dev/null "http://127.0.0.1:$PORT/" 2>/dev/null; then break; fi
  if ! kill -0 "$WRANGLER_PID" 2>/dev/null; then
    echo "[conformance] wrangler s'est arrêté avant d'être prêt :" >&2
    cat "$LOG" >&2
    exit 1
  fi
  sleep 2
done

if ! curl -fsS -m 30 "http://127.0.0.1:$PORT/"; then
  echo "[conformance] échec sous workerd (voir le corps de la réponse ci-dessus)" >&2
  exit 1
fi
