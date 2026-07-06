# 빌드 스펙 — MCP 실사용 완성

> 참조 전략: `GOOGLE-MCP-ARCHITECTURE.md` §Phase D·E, `AGENTS-MCP-STRATEGY.md` §MCP 타임밤.

## 목표
MCP를 "등록만 되는 admin 기능" → **에이전트에 실제로 붙여 쓰는 기능**으로. 에이전트 빌더에서 MCP 서버를 골라 연결하고, 채팅에서 그 도구를 안전하게 사용.

## 현재 상태
- ✅ 등록/테스트/도구발견/런타임연결 동작: `src/lib/mcp.ts`(MCP_CONNECTORS 카탈로그, 전부 coming_soon), `src/lib/mcp/connect.ts`(`connectMcp`, @ai-sdk/mcp v6 Streamable HTTP, SSRF·stdio차단), `src/components/mcp/McpView.tsx`, `/api/mcp/servers[/[id][/test]]`
- ✅ 채팅이 MCP 로드: `src/app/api/agents/[id]/chat/route.ts` — `agent_versions.mcp_servers[]`(text[]) → connect → merge → `streamText(stopWhen=5)`
- ✅ `agent_mcp_servers` 정션 테이블 존재(마이그 020) — **코드에서 미사용**
- ⚠️ 바인딩이 `text[]` 뿐 → 빌더 UI 없음, FK/RLS 강제 없음
- 🔴 채팅 MCP 로드에 **워크스페이스 필터 없음**(RLS만 의존) · 등록 시 workspace_id 미설정 · 회사별 시크릿 없음(전역 env)

## 결정 필요
- **첫 실연결 커넥터**: Supabase / GitHub / 자체 MCP 중 하나 (auth none/Bearer). 권장: 우리가 통제 가능한 것부터.

## 작업 (순서)
1. **에이전트↔MCP 바인딩 UI** — `AgentBuilderForm`에 "도구/MCP" 패널: 워크스페이스 MCP 서버 목록 체크박스 → 저장 시 `agent_versions.mcp_servers[]`(현행 유지) + 가능하면 `agent_mcp_servers` 정션도 기록.
2. **채팅 로드 하드닝** (`api/agents/[id]/chat`) — MCP 서버 쿼리에 `.eq("workspace_id", <현재 워크스페이스>)` 추가(현재 단일 equria). 로드 실패 도구는 **사용자에게 에러 스트리밍**(지금은 silent skip).
3. **도구명 충돌 방지** — 여러 서버 merge 전 `{serverId}_{toolName}` 프리픽스(설계 문서 언급, 미구현).
4. **첫 커넥터 실연결** — 결정한 커넥터를 실제 등록·테스트·에이전트에 붙여 대화로 도구 호출 확인.
5. **워크플로우 'mcp' 노드**(마이그 020 placeholder) — → `workflows.md`와 연동(그쪽에서).

## 재사용
`connectMcp`(mcp/connect.ts) · `MCP_CONNECTORS`(mcp.ts) · 기존 test 라우트 도구발견 · `agent_mcp_servers`(마이그 020).

## 🔴 블로커 (B1-b 후)
- **회사별 MCP 시크릿**: 지금 Bearer 토큰이 전역 env(`MCP_<NAME>_TOKEN`). 멀티테넌트는 **회사별 DB AES-256 암호화**(`google/crypto.ts` 패턴 재사용)로. → **B1-b 전엔 단일 워크스페이스 전제로만** 진행.
- 등록 시 workspace_id 명시도 B1-b 배선과 함께.
→ 지금 스펙 범위: **단일 워크스페이스에서 바인딩·사용까지.** 격리 강화는 B1-b 트랙에 표시.

## 검증 (E2E)
tsc0·lint30/0·build0 → 빌더에서 MCP 서버 체크→저장→에이전트 채팅에서 해당 도구 호출 성공 → 로드 실패 시 에러 노출 확인 → 도구명 충돌(같은 이름 2서버) 스팟체크.
