# 빌드 스펙 — 워크플로우 손보기

> 전용 전략문서 없음 → 이 스펙에 설계 포함. 참조: `PRODUCTIZATION.md` H1(비용).

## 목표
워크플로우를 "에이전트 6개 순차 실행"에서 → **쓸 만한 자동화**로. (1차: 도구 정리 + MCP 노드 + 상태 UI. 분기/스케줄/루프는 2차·후순위.)

## 현재 상태
- ✅ 노드 에디터·베지어 연결·DAG 위상정렬·순차실행·**NDJSON 스트리밍**·실행이력(`workflow_runs`): `src/lib/workflows.ts`, `src/components/workflows/WorkflowEditor.tsx`, `src/app/api/workflows/[id]/run/route.ts`
- ✅ 노드 후처리 도구: `webhook`(https·SSRF·15s)·`save_file`·`notify` (`src/lib/workflowTools.ts`)
- ⚠️ 도구 카탈로그에 YouTube·Higgsfield·Figma = **`enabled:false`**(껍데기)
- ❌ MCP 노드 미구현(마이그 020 'mcp' placeholder만)
- ❌ 분기/조건·루프·스케줄·병렬·재시도 없음 (항상 선형·최대 6노드·60s)

## 결정 필요 (범위)
- **가벼움(권장 1차)**: 안 쓸 도구 정리 + 실연결할 것만 켜기 + **MCP 노드** + 노드 상태/에러 UI 개선.
- **무거움(2차)**: 조건 분기(if/else edge)·스케줄(cron/webhook 트리거)·루프·재시도. → 별도 스펙·후순위.

## 작업 (1차, 순서)
1. **도구 카탈로그 정리** (`workflowTools.ts`) — 실제 붙일 도구만 `enabled:true`, 나머지 제거 or 명확히 "준비 중" 유지. (막연한 placeholder 줄이기)
2. **MCP 노드 타입** — run 라우트(`api/workflows/[id]/run`)에 노드가 특정 MCP 도구를 호출하는 경로 추가. `mcp.md` #3(도구명 프리픽스)·`connectMcp` 재사용. (단일 워크스페이스 전제)
3. **실행 UX 개선** (`WorkflowEditor`) — 노드별 실행중/완료/에러 상태 표시, 출력 인라인 프리뷰, 에러 메시지 노출.
4. **(선택) 입력/변환 노드** — "필드 추출/JSON 파싱" 같은 경량 변환 노드(에이전트 아닌 순수 함수).

## 재사용
`workflows.ts`(그래프·위상정렬) · `workflowTools.ts` · `safeHttpUrl`(SSRF) · `connectMcp` · NDJSON 스트리밍 패턴.

## 🔴 주의
- **비용(H1)**: 1 run × 6노드 × 긴 출력 = 큰 비용. `PRODUCTIZATION §B3`의 rate limit·예산과 연결(후속). 스펙엔 "실행 전 비용 경고" 정도 고려.
- Vercel 60s: 노드 수·도구 라운드트립 합산 주의(현행 6노드 캡 유지).
- B1-b 무관(단일 워크스페이스 기준). 멀티테넌트는 run 라우트 workspace_id 배선(B1-b).

## 검증 (E2E)
tsc0·lint30/0·build0 → 에이전트 2~3노드 워크플로우 실행(NDJSON 진행·이력 저장) → MCP 노드가 도구 호출 → 노드 에러 시 UI 표시 → 도구 정리 후 사이드 이펙트 없음 확인.
