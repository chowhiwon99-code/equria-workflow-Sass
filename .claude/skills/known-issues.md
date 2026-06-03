---
name: known-issues
description: EQURIA Workspace의 알려진 이슈·기술부채 백로그. 다음 세션에서 해결할 항목과 위험도. 새 기능 작업 전, 관련 영역의 이슈가 있는지 여기서 먼저 확인.
---

# 알려진 이슈 / 기술부채 백로그

> 지금 당장 안 깨지지만 **나중에 해결해야 하는** 것들. 위험도순. 해결하면 이 파일에서 제거.
> 최종 정리: 2026-05-31 (세션 4)

## 🔴 우선 (다음 세션 후보)

### I2. 워크플로우 실행 60초 타임아웃
- `/api/workflows/[id]/run`은 노드를 **순차** generateText 호출. Vercel Hobby `maxDuration=60s` 한계.
- 방어: `MAX_RUN_NODES=6`(workflowTools.ts). 그래도 opus 노드 여럿·max_tokens 큰 경우 60초 초과 가능 → 중간 노드에서 끊김.
- **할 일**: Vercel Pro(300초)면 한도 상향 / 또는 노드별 토큰·모델 가드 / 또는 백그라운드 잡 큐로 전환(고도화).

## 🟡 중간

### I1b. eslint 부채 23건 — 배포는 안 막지만 코드품질 부채 (세션5 확인)
- `next build`(=Vercel 빌드)는 **exit 0 통과**. **Next 16 Turbopack 빌드는 eslint를 게이트하지 않음** → 아래 에러들은 배포를 막지 않음(I1 "빌드 막힐 위험"은 해소).
- 하지만 `pnpm lint`는 **23 errors + 2 warnings**: `react-hooks/set-state-in-effect` ×20(전 컴포넌트 공통 `useEffect(()=>{load()},[load])` 패턴) · `react-hooks/refs` ×2(WorkflowCanvas) · `immutability` ×1 · `exhaustive-deps` ×1.
- **할 일(비차단)**: set-state-in-effect 20건은 데이터 로딩 패턴이라 진짜 수정은 위험(동작 변경). 일괄 처리 시 (a) 각 effect에 `eslint-disable-next-line` 또는 (b) `load()`를 effect 밖 패턴으로 리팩터(범위 큼). 급하지 않음 — 배포 안전 확인됨.

### I3. 016 마이그레이션 = 죽은 정책(혼란)
- `016_workflows_team_editable`(wf_update를 누구나로 완화)을 만든 직후 사용자 의도와 반대임을 알고 `017_workflows_ownership_share`로 정정(소유자만). 원격엔 017만 유효.
- 신규 환경에서 016→017 순서 적용 시 결과 동일(017이 덮음). 단 016 파일은 의미 없음.
- **할 일**: (선택) 016 내용을 주석/no-op로 비우거나 그대로 둠(히스토리 보존). 급하지 않음.

### I4. 레거시 steps 변환이 저장 전까지 미반영
- 옛 배열형 `workflows.steps`는 편집기에서 열 때 `normalizeGraph`로 그래프 변환되지만, **저장 전까진 DB는 옛 형태**. 실행도 변환본으로 정상 동작.
- **할 일**: 없음(설계상 정상). 한 번 저장하면 `{nodes,edges}`로 영구 변환.

## 🟢 낮음 / 비차단

- **I5. 웹훅 응답 본문 미검증**: run 라우트가 webhook POST 후 status code만 봄(외부 처리 성공 여부 모름 — 웹훅 특성상 정상).
- ~~**I6. DB drift 미확인**~~ → ✅ **세션5 해소**: `list_migrations` 대조 결과 디스크 18개 ↔ 원격 18개 **1:1 일치, drift 없음**(001~017 + 001a baseline).
- **I7. 기존 부채(세션3부터)**: `agent_usage` onError 누락(성공 시만 기록) · Anthropic transient 500 재시도 없음 · `.or()` 특수문자 escape 부재 · NotificationBell UPDATE 미구독 · 그룹채팅/위젯 모바일/md 다크모드 미대응.
- **I8. 핀 교체 비원자성**: delete→insert 사이 실패 시 빈 핀(에러표시+resync로 방어, 완전방지엔 upsert RPC).
- **I10. 워크플로우 노드 순서 UI 다듬기(세션5, 나중에)**: 노드 좌상단 번호를 편집 가능한 입력으로 만들어 순서 변경+끈 자동연결(`OrderBadge` 컴포넌트, `WorkflowCanvas.tsx`). 동작은 하지만 ①20px 원형 입력이 작아 클릭/타깃 작음 ②노드 1개일 땐 변경 불가(자연스러움) ③Tab `tabIndex=order`가 페이지 전역 탭순서에 영향. 후속에서 "선택 노드 사이드 패널의 큰 순서 컨트롤" 또는 "위/아래 버튼"으로 교체 고려. **코드가 `OrderBadge`로 분리돼 있어 교체 쉬움.**
- **I9. Supabase advisor 부채(세션5 점검, 전부 비차단)**: 보안 WARN 3(=`get_or_create_direct_conversation`·`mark_dm_read` SECURITY DEFINER 호출가능[설계상 의도] + leaked-password 보호 off[대시보드 토글]). 성능 96: `auth_rls_initplan` ×64(RLS에서 `auth.uid()`를 `(select auth.uid())`로 감싸면 해소) · `multiple_permissive_policies` ×5 · INFO(unindexed_fk ×16·unused_index ×11). 내부툴·소규모 데이터라 급하지 않음.

## ✅ 세션4 신규 기능의 미검증(E2E) — 코드/빌드는 통과, 화면 동작만 미확인
- **워크플로우 실행을 실제로 한 번도 안 돌려봄**(인증 필요). 실제 Claude가 순서대로 도는지 사용자 확인 필요 = **다음 세션 최우선**.
- 6개 섹션·캔버스 드래그/끈 연결·다크모드·설정 저장·파일 업로드 = 브라우저 E2E 미확인.
- 세션3 코드리뷰 15건 E2E(계속 이월): 캘린더 멀티데이 lane·재무삭제→프로젝트합계·⌘Z연타·이모지.
