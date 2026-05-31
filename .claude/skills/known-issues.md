---
name: known-issues
description: EQURIA Workspace의 알려진 이슈·기술부채 백로그. 다음 세션에서 해결할 항목과 위험도. 새 기능 작업 전, 관련 영역의 이슈가 있는지 여기서 먼저 확인.
---

# 알려진 이슈 / 기술부채 백로그

> 지금 당장 안 깨지지만 **나중에 해결해야 하는** 것들. 위험도순. 해결하면 이 파일에서 제거.
> 최종 정리: 2026-05-31 (세션 4)

## 🔴 우선 (다음 세션 후보)

### I1. `next build` eslint 미검증 — 운영 빌드 막힐 위험
- tsc·dev는 통과하지만 로컬에서 `next build`(=Vercel과 동일 빌드)를 **한 번도 안 돌려봄**.
- 세션4 신규 컴포넌트 8개(`components/{workflows,files,settings,mypage,mcp,mail}`)가 기존 `react-hooks/set-state-in-effect` lint 부채 패턴(`useEffect` 안 `load()`)과 동일.
- **현재 안전장치**: `next.config.ts`에 `ignoreBuildErrors`/`ignoreDuringBuilds` **없음** → 빌드 실패 시 Vercel이 **이전 정상배포 유지**(운영은 안 깨짐). 하지만 새 배포가 계속 실패할 수 있음.
- **할 일**: `pnpm build` 한 번 돌려 eslint가 막는지 확인. 막으면 (a) `eslint-disable-next-line react-hooks/set-state-in-effect` 일괄 추가 또는 (b) `next.config.ts`에 `eslint.ignoreDuringBuilds: true`(전역, 부채 인정) 중 택1.
- ⚠️ **세션4 푸시들이 실제로 Vercel 빌드에 성공했는지 대시보드에서 확인**(MCP는 토큰 403). 단, 신규 라우트(`/mypage`·`/api/workflows/[id]/run`)가 운영에서 404 아닌 307 응답 = **빌드 성공 정황 확인됨**.

### I2. 워크플로우 실행 60초 타임아웃
- `/api/workflows/[id]/run`은 노드를 **순차** generateText 호출. Vercel Hobby `maxDuration=60s` 한계.
- 방어: `MAX_RUN_NODES=6`(workflowTools.ts). 그래도 opus 노드 여럿·max_tokens 큰 경우 60초 초과 가능 → 중간 노드에서 끊김.
- **할 일**: Vercel Pro(300초)면 한도 상향 / 또는 노드별 토큰·모델 가드 / 또는 백그라운드 잡 큐로 전환(고도화).

## 🟡 중간

### I3. 016 마이그레이션 = 죽은 정책(혼란)
- `016_workflows_team_editable`(wf_update를 누구나로 완화)을 만든 직후 사용자 의도와 반대임을 알고 `017_workflows_ownership_share`로 정정(소유자만). 원격엔 017만 유효.
- 신규 환경에서 016→017 순서 적용 시 결과 동일(017이 덮음). 단 016 파일은 의미 없음.
- **할 일**: (선택) 016 내용을 주석/no-op로 비우거나 그대로 둠(히스토리 보존). 급하지 않음.

### I4. 레거시 steps 변환이 저장 전까지 미반영
- 옛 배열형 `workflows.steps`는 편집기에서 열 때 `normalizeGraph`로 그래프 변환되지만, **저장 전까진 DB는 옛 형태**. 실행도 변환본으로 정상 동작.
- **할 일**: 없음(설계상 정상). 한 번 저장하면 `{nodes,edges}`로 영구 변환.

## 🟢 낮음 / 비차단

- **I5. 웹훅 응답 본문 미검증**: run 라우트가 webhook POST 후 status code만 봄(외부 처리 성공 여부 모름 — 웹훅 특성상 정상).
- **I6. DB drift 미확인**: 디스크 마이그 001~017 ↔ 원격. 세션4에서 015·016·017 apply했으나 `list_migrations`로 1:1 대조는 안 함. 다음 세션 확인 권장.
- **I7. 기존 부채(세션3부터)**: `agent_usage` onError 누락(성공 시만 기록) · Anthropic transient 500 재시도 없음 · `.or()` 특수문자 escape 부재 · NotificationBell UPDATE 미구독 · 그룹채팅/위젯 모바일/md 다크모드 미대응.
- **I8. 핀 교체 비원자성**: delete→insert 사이 실패 시 빈 핀(에러표시+resync로 방어, 완전방지엔 upsert RPC).

## ✅ 세션4 신규 기능의 미검증(E2E) — 코드/빌드는 통과, 화면 동작만 미확인
- **워크플로우 실행을 실제로 한 번도 안 돌려봄**(인증 필요). 실제 Claude가 순서대로 도는지 사용자 확인 필요 = **다음 세션 최우선**.
- 6개 섹션·캔버스 드래그/끈 연결·다크모드·설정 저장·파일 업로드 = 브라우저 E2E 미확인.
- 세션3 코드리뷰 15건 E2E(계속 이월): 캘린더 멀티데이 lane·재무삭제→프로젝트합계·⌘Z연타·이모지.
