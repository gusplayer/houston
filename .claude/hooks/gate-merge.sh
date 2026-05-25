#!/usr/bin/env bash
# .claude/hooks/gate-merge.sh
# Bloquea merges/pushes a <rama-destino> salvo que exista marca de aprobación
# generada por el integrador (.claude/.merge-approved, marca de un solo uso).
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
CONFIG="${ROOT}/.claude/method.config"
# shellcheck disable=SC1090
[[ -f "$CONFIG" ]] && source "$CONFIG"
TARGET_BRANCH="${TARGET_BRANCH:-main}"

# Parsea el comando del JSON del hook con jq (NO sed: el regex revienta con
# quotes escapadas o JSON multilínea).
INPUT="$(cat)"
CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"
[[ -z "$CMD" ]] && exit 0

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
is_target_op=0

# Caso 1: git merge tocando la rama destino (por argumento o por estar parado en ella).
if printf '%s' "$CMD" | grep -Eq '(^|[[:space:];&|])git[[:space:]]+merge([[:space:]]|$)'; then
  [[ "$CURRENT_BRANCH" == "$TARGET_BRANCH" ]] && is_target_op=1
  printf '%s' "$CMD" | grep -Eq "(^|[[:space:]])${TARGET_BRANCH}(\$|[[:space:]])" && is_target_op=1
fi

# Caso 2: git push origin <ref>:<TARGET_BRANCH> o git push origin <TARGET_BRANCH>
if printf '%s' "$CMD" | grep -Eq "git[[:space:]]+push.*(\\b|:)${TARGET_BRANCH}(\\b|\\s|$)"; then
  is_target_op=1
fi

# Caso 3: gh pr merge — bloqueamos por defecto (no inferimos base sin API call).
if printf '%s' "$CMD" | grep -Eq 'gh[[:space:]]+pr[[:space:]]+merge'; then
  is_target_op=1
fi

[[ $is_target_op -eq 0 ]] && exit 0

# Marca per-worktree (no compartida via .git common-dir).
APPROVAL="${ROOT}/.claude/.merge-approved"
if [[ -f "$APPROVAL" ]]; then
  rm -f "$APPROVAL"
  echo "Merge aprobado (marca consumida)." >&2
  exit 0
fi

echo "MERGE BLOQUEADO sobre ${TARGET_BRANCH}. Usa /integrate <rama> primero." >&2
exit 2
