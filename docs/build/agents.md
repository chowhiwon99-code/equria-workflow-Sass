# 빌드 스펙 — 에이전트 빌더 고도화

> 참조 전략: `AGENTS-MCP-STRATEGY.md`(7섹션 백본·회사 커스터마이징·피드백 루프).

## 목표
에이전트 빌더를 "생성 위저드"에서 → **도구 붙이고·아이콘 넣고·미리 테스트하는** 완성형으로.

## 현재 상태
- ✅ CRUD·버전(`agent_versions`, 트리거 auto is_current)·채팅·비용기록: `src/lib/agents.ts`, `src/app/api/agents/*`
- ✅ **skill.md 메타프롬프트 우수** — `SKILL_MD_SYSTEM`(`src/lib/agentBuilder.ts`) 11필드 위저드 → 7섹션 백본 프롬프트 생성(`/api/agents/generate-prompt` 스트리밍)
- ✅ 모델·온도 프리셋(`AGENT_MODELS`·`TEMPERATURE_PRESETS`), 시드 8개 품질·온도 개선 완료(마이그 067·068)
- ✅ Lucide 아이콘 21종(`IconPicker.tsx`, `renderAgentIcon`)
- ❌ 커스텀 이미지 아이콘: `AgentIcon.image?` 필드 있음 — **업로드 UI 없음**
- ❌ MCP/도구 붙이는 UI 없음 (→ `mcp.md` #1과 동일 작업)
- ❌ 프롬프트 프리뷰/드라이런 없음(대화해야만 테스트) · 편집모드 프리필 약함

## 작업 (순서)
1. **MCP-attach 패널** — `AgentBuilderForm`에 워크스페이스 MCP 서버 선택(체크박스) → `agent_versions.mcp_servers[]`. (**`mcp.md` #1과 같은 작업 — 한 번만**)
2. **커스텀 아이콘 업로드** — IconPicker에 "이미지 업로드" 옵션 → `uploadImage`(lib/upload.ts, 기존)로 스토리지 저장 → `agents.icon = "image:<path>"` 또는 `AgentIcon.image`. `renderAgentIcon` 이미지 분기 구현.
3. **프롬프트 프리뷰/드라이런** — 저장 전 "미리보기": 생성된 시스템프롬프트 전문 + 선택 모델·온도 + **토큰 추정**(count_tokens 또는 근사) 표시. (옵션) 샘플 입력 1회 실행.
4. **편집모드 프리필** — 기존 에이전트 열면 위저드 필드/프롬프트가 채워진 상태로 로드(현재 약함).
5. **(선택) 피드백 루프** — 대화에 👍/👎 → 다음 버전 태그(전략문서 제안).

## 재사용
`SKILL_MD_SYSTEM`·위저드 필드(agentBuilder.ts) · `renderAgentIcon`·`IconPicker`(agents.ts) · `uploadImage`(upload.ts) · `computeCostUsd`(pricing.ts) · 버전 트리거(마이그).

## 🔴 주의
- 아이콘 이미지 = `files`/이미지 버킷 RLS 경로(`{uid}/`) 규칙 준수.
- MCP-attach는 `mcp.md`와 **중복 작업이므로 둘 중 한 세션에서만** 구현(다른 스펙은 참조).
- B1-b 무관(단일 워크스페이스). 회사별 프리셋 복제 전략은 `AGENTS-MCP-STRATEGY §타임밤`(B2).

## 검증 (E2E)
tsc0·lint30/0·build0 → 위저드로 에이전트 생성→프리뷰에서 프롬프트·토큰 확인→커스텀 이미지 아이콘 업로드·표시→MCP 서버 붙여 채팅에서 도구 사용→편집모드 재진입 시 프리필 확인.
