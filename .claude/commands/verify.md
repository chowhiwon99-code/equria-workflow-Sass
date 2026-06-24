---
description: 검증 게이트 — tsc 0 · lint 30/0 베이스라인 확인 후 결과 보고
---

EQURIA 검증 게이트를 돌리고 결과만 간결히 보고해줘:

1. `npx tsc --noEmit` — **0 에러**여야 함(any 금지).
2. `pnpm lint` — 베이스라인 **30 errors / 0 warnings**. 신규 0이어야 함. 신규 에러/경고나 새 lint 카테고리가 생기면 **중단하고 어디서 났는지 보고**(known-issues의 30/0 부채는 기존 baseline).

둘 다 통과면 "✅ tsc 0 · lint 30/0", 실패면 어느 파일/줄에서 깨졌는지 + 고칠 지점을 제시.
배포까지 필요하면 `/deploy`를 안내.
