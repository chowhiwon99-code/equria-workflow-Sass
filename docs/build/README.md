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
| 2 | [`mcp.md`](./mcp.md) | 에이전트↔MCP 바인딩 UI + 채팅 검증 + 첫 커넥터 실연결 | ⚠️ 일부(회사별 시크릿)는 B1-b 후 |
| 3 | [`workflows.md`](./workflows.md) | 도구 정리 + MCP 노드 + 상태 UI | ❌ 무관 |
| 4 | [`agents.md`](./agents.md) | 빌더 고도화(MCP-attach·커스텀 아이콘·프리뷰) | ❌ 무관 |
| 5 | [`mail.md`](./mail.md) | 메일 작성창을 Gmail 수준으로(참조/숨은참조·리치본문·첨부·전송) | ❌ 무관 |

**추천 순서: 1 Drive → 4 Agents(빌더) → 2 MCP → 3 Workflows.**
(2·3은 4의 MCP-attach UI가 있으면 더 매끄러움. Drive는 완전 독립이라 먼저 눈에 보이는 성과.)

## 공통 전제 (모든 스펙)
- **멀티테넌트 강화**(등록 시 workspace_id·회사별 시크릿·채팅 워크스페이스 검증)의 **완전판은 B1-b(쓰기 격리) 선행.** 지금은 **단일 워크스페이스(equria) 기준**으로 만들고, B1-b 시 격리 강화. 각 스펙의 "🔴 블로커" 참고.
- **검증 게이트(공통)**: `npx tsc --noEmit` 0 · `pnpm lint` 30/0(신규 0) · `pnpm build` 0 · dev(localhost:3000) E2E.
- **안전 원칙**: `.claude/skills/safe-changes.md` — 추가는 자유, 파괴는 검증 후, 되돌릴 수 있고 재현 가능하게. DB 변경은 `supabase/migrations/`에 새 파일(기존 수정 금지).
