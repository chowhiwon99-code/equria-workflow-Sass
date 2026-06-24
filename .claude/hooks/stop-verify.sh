#!/usr/bin/env bash
# EQURIA Stop 검증 — 이번 턴에 src/ 변경이 있으면 tsc 자동 검사(보고 전용, 차단 안 함).
# 타입에러일 때만 사용자에게 알림(통과면 조용히 종료 → 노이즈 0). 대화·문서 턴은 비용 0.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd)" 2>/dev/null || exit 0

# src/ 변경(미커밋/스테이지) 없으면 조용히 종료
if ! git status --porcelain -- src 2>/dev/null | grep -q .; then
  exit 0
fi

out=$(npx tsc --noEmit 2>&1); rc=$?
if [ "$rc" -ne 0 ]; then
  msg="⚠️ 자동검증(Stop): tsc 타입 에러 — 다음에 확인 필요:
$(printf '%s' "$out" | tail -12)"
  printf '{"systemMessage":%s,"suppressOutput":true}\n' "$(printf '%s' "$msg" | jq -Rs .)"
fi
exit 0  # 차단 안 함(통과면 출력도 없음)
