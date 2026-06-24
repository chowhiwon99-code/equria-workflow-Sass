#!/usr/bin/env bash
# EQURIA 배포 게이트 — git push 전 tsc(필수)+lint(회귀) 검증. 실패 시 push 차단(deny).
# settings.json의 `if: "Bash(git push*)"`로 git push일 때만 호출됨 → 다른 Bash 명령엔 영향 0.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd)" 2>/dev/null || exit 0

deny() {  # $1 = 사유 텍스트 → PreToolUse deny JSON
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":%s}}\n' \
    "$(printf '%s' "$1" | jq -Rs .)"
  exit 0
}

# 1) tsc — 무조건 0 (타입에러면 배포 차단)
tsc_out=$(npx tsc --noEmit 2>&1); tsc_rc=$?
if [ "$tsc_rc" -ne 0 ]; then
  deny "🚫 배포 차단 — tsc 타입 에러. 고치고 다시 push:
$(printf '%s' "$tsc_out" | tail -15)"
fi

# 2) lint — 베이스라인 30 errors / 0 warnings. 회귀(에러>30 또는 경고>0)면 차단.
#    파싱 실패 시엔 차단하지 않음(안전 우선 — 영구 차단 방지).
lint_out=$(pnpm lint 2>&1)
counts=$(printf '%s' "$lint_out" | grep -oE '[0-9]+ errors?, [0-9]+ warnings?' | tail -1)
if [ -n "$counts" ]; then
  errs=$(printf '%s' "$counts" | grep -oE '^[0-9]+')
  warns=$(printf '%s' "$counts" | grep -oE '[0-9]+ warnings?' | grep -oE '^[0-9]+')
  if [ "${errs:-0}" -gt 30 ] || [ "${warns:-0}" -gt 0 ]; then
    deny "🚫 배포 차단 — lint 회귀(에러 ${errs}/경고 ${warns}, 베이스라인 30/0). 신규 lint를 고치고 다시 push."
  fi
fi

exit 0  # 통과 → 출력 없음 = 허용
