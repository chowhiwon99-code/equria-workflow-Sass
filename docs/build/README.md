# docs/build — 핵심 AI 기능 빌드 스펙

> **한 세션 = 한 스펙.** 새 세션에서 아래 스펙 하나를 골라 그 문서만 보고 제작하면 됩니다.
> 스펙은 "무엇을·어떤 파일을·어떻게 검증"만 담습니다. **왜(전략·설계)는 아래 SSOT 문서 참조.**

## 전략 SSOT (여기서 새로 쓰지 말 것 — 참조만)
- **`GOOGLE-MCP-ARCHITECTURE.md`** — Google(OAuth/Gmail/Drive) + MCP 런타임 5단계 설계·마이그·E2E·오픈결정
- **`AGENTS-MCP-STRATEGY.md`** — 에이전트 프롬프트 백본·회사 커스터마이징·MCP 멀티테넌트 타임밤
- **`PRODUCTIZATION.md`** / **`HANDOFF.md`** — B1~B6 로드맵·현재 상태

## 스펙 목록 & 추천 순서
| # | 스펙 | 요약 | B1-b 의존 |
|---|---|---|---|
| 1 | [`google-drive.md`](./google-drive.md) | ✅ **완료(커밋 `4c5754b`)** — Files에 Google Drive 탭(목록·폴더·검색·다운로드) | ❌ 무관 |
| 2 | [`mcp.md`](./mcp.md) | ✅ **대부분 완료(세션28)** — 디렉터리·토큰 암호화·바인딩·실연결(Context7/DeepWiki)·사용 흐름. 남음: 커넥터별 실연동(GitHub 토큰=Phase B·OAuth=Phase C) | ⚠️ 회사별 시크릿은 B1-b 후 |
| 3 | [`workflows.md`](./workflows.md) | ✅ **대부분 완료(세션28 `75d5944`)** — MCP 노드 UI·에이전트 노드 MCP 사용. 남음: 자동 트리거(스케줄·웹훅)=C | ❌ 무관 |
| 4 | [`agents.md`](./agents.md) | 빌더 고도화(커스텀 아이콘·프리뷰 — MCP-attach는 완료) | ❌ 무관 |
| 5 | [`mail.md`](./mail.md) | ✅ **완료(세션27)** — 리치 작성창·AI 다듬기·배치 최적화 | ❌ 무관 |
| 6 | [`mobile-responsive.md`](./mobile-responsive.md) | 🔴 **다음 세션 최우선** — 모바일 전 화면 안 깨지게(1차 사이드바 드로어 골격) | ❌ 무관 |

**추천 순서(현재): 6 모바일 골격 → C 자동 트리거(workflows 잔여) → MCP Phase B(GitHub 실연동) → 4 Agents 잔여.**

## 공통 전제 (모든 스펙)
- **멀티테넌트 강화**(등록 시 workspace_id·회사별 시크릿·채팅 워크스페이스 검증)의 **완전판은 B1-b(쓰기 격리) 선행.** 지금은 **단일 워크스페이스(equria) 기준**으로 만들고, B1-b 시 격리 강화. 각 스펙의 "🔴 블로커" 참고.
- **검증 게이트(공통)**: `npx tsc --noEmit` 0 · `pnpm lint` 30/0(신규 0) · `pnpm build` 0 · dev(localhost:3000) E2E.
- **안전 원칙**: `.claude/skills/safe-changes.md` — 추가는 자유, 파괴는 검증 후, 되돌릴 수 있고 재현 가능하게. DB 변경은 `supabase/migrations/`에 새 파일(기존 수정 금지).
