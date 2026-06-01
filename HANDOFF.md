# HANDOFF — EQURIA Workspace

> 다음 세션 시작: 이 파일 → `CLAUDE.md` → `.claude/skills/latest-stack.md` → `.claude/skills/known-issues.md` 순으로 읽기.
> 최종 업데이트: 2026-05-31 (세션 4)
> 과거 세션 상세 로그는 **git 커밋 메시지**에 있음 — 이 파일은 "현재 상태 + 다음 할 일"만 유지.

---

## 🎯 지금 상태 (한눈에)

- **운영 중**: Phase 1 + 자체기능(채팅·DM·캘린더·재무·명함·프로젝트) + 에이전트 허브 + **6개 섹션 틀**(설정·마이페이지·워크플로우·파일·메일·MCP). 전역 ⌘Z Undo · 휴지통(soft-delete).
- **✅ 전부 푸시·배포 완료**: origin/main 동기(`9878bc2`), 워킹트리 깨끗. 신규 라우트(`/mypage`·`/api/workflows/[id]/run`)가 운영에서 307 응답 = **Vercel 빌드 성공 정황 확인**.
- **검증**: tsc 0 · dev 컴파일 OK · `get_advisors` 신규이슈 0 · ✅**세션5: `next build` exit 0 통과**(Next16 빌드는 eslint 비게이트 → 린트 23에러 있어도 배포 안 막힘) · ✅**DB drift 없음**(디스크18=원격18 1:1). ⚠️ **브라우저 E2E·실제 워크플로우 실행은 여전히 미검증** → `known-issues.md` 참조.
- 운영: `https://equria-workflow-sass.vercel.app`

### 세션4 작업 요약 (이번 세션)
- **4-A 에이전트 빌더 개편**: 가이드 위저드(`/api/agents/generate-prompt`가 skill.md 자동생성)·창의성 프리셋(정확/균형/창의)·핀 폴백 제거(0개=빈 위젯+CTA)·생성 시 자동핀·**회전초밥 캐러셀**(`IconPicker`+`MarqueeRail`, 멈춤 없이 계속 회전).
- **4-B 6개 섹션 틀**: 사이드바 **그룹화**(업무/AI/연동/계정)·**다크모드**(next-themes `ThemeProvider`). 설정(프로필·테마·로그아웃)·마이페이지(프로필·사용량·내 에이전트)·파일(로컬 업로드, Drive 게이트)=기능 / 메일(Gmail 게이트 셸)·MCP(커넥터 카탈로그+admin 서버읽기)=셸. 마이그 `015`(files 버킷+`deleted_at`).
- **4-C 워크플로우 = n8n 캔버스 + 실행 엔진**: 원형 노드·드래그·끈(베지어) 연결·도구배지. **실제 순차 실행**(`/api/workflows/[id]/run`: 끈 위상정렬→generateText 순차→앞 결과를 뒤 입력으로 체이닝→NDJSON 스트리밍, 노드 상태 색링). **도구 골격+웹훅**(HTTP POST, SSRF 가드). `is_public` 토글(비공개 기본). 마이그 `016`(폐기)·`017`(소유권 RLS).

---

## 🔴 다음 세션 우선순위

1. **워크플로우 실행 실제 검증**(최우선) — 로그인 후 노드 2~3개 연결 → "워크플로우 실행" → Claude가 순서대로 돌고 앞 결과가 뒤로 넘어가는지 확인. (제가 인증 못 해 미실행)
2. ~~`next build` eslint 통과 확인~~ → ✅ **세션5 완료**(exit 0, 배포 안전 확정). 남은 린트 부채 23건은 비차단 → `known-issues.md` I1b.
3. **6개 섹션 + 캔버스 브라우저 E2E**: 다크모드 전환·설정 저장→Header 반영·파일 업로드/다운로드·노드 드래그/끈 연결·is_public 공유.
4. **세션3 코드리뷰 15건 E2E**(이월): 캘린더 멀티데이 lane·재무삭제→프로젝트합계·⌘Z연타·이모지.
5. (사용자 직접) **service_role 키 rotation** — 레거시 키 노출. 새 키→`.env.local`+Vercel→redeploy→레거시 disable(**시크릿 채팅 금지**).

> 그 외 기술부채·잠재 이슈 전체는 **`.claude/skills/known-issues.md`** 참조.

---

## 🚀 환경 / 접근

- **GitHub** `chowhiwon99-code/equria-workflow-Sass` (main 단일, push→자동배포)
- **Vercel** `equria-workflow-sass.vercel.app` (Prod, Hobby) · MCP는 토큰 403(빌드결과 대시보드 확인) · `NEXT_PUBLIC_APP_URL` placeholder
- **Supabase** `dutovtfdckhayyvhtuxu` (ap-northeast-2 서울) · 마이그 **001~017 적용**(drift 다음 세션 재확인)
- **.env.local** 키 4종 + `WORKSPACE_PASSWORD=4321`(테스트). ANTHROPIC 정상. 기본 모델 `claude-sonnet-4-6`.
- **테스트 계정**: 조휘원(c6817c63…) / 이동규(cacf302d…) / 김건(fc468e85…)

---

## 📐 작업 룰 (`safe-changes.md` 최우선)

1. **추가는 자유 / 파괴는 검증 후 / 되돌림·재현 가능.** soft-delete(하드삭제 금지). 커밋 분리.
2. **DB**: MCP `apply_migration`(반드시 `project_id` 인자!) + `supabase/migrations/`에 파일로도(SSOT). 멱등(`drop ... if exists`).
3. **Supabase 쿼리는 반드시 `await`**. RLS 막히면 SECURITY DEFINER RPC. 새 테이블/컬럼 추가 시 `types.ts`도 손으로 맞추기(MCP generate types는 project_id 필요).
4. **커밋·푸시 전 반드시 `npx tsc --noEmit` 결과(EXIT=0)를 눈으로 확인하고 나서 진행** — 세션4에서 깨진 빌드 푸시 사고(243c143→핫픽스 9878bc2) 재발 방지. 마이그 후 `get_advisors`.
5. AI/Supabase 코드 전 `latest-stack.md` 확인(AI SDK v6). 모델 기본 sonnet-4-6 / 복잡 opus-4-7.
6. SSOT 재사용: `lib/config/features.ts`·`lib/{agents,workflows,workflowTools,files,mcp,finance,projects}.ts`. 검증/미검증 분리 보고.

---

## 🛠 핵심 파일 (세션4 추가분 ⭐)

```
src/
├── proxy.ts                          ← 인증 가드(모든 /api·/app 자동 보호)
├── app/(app)/layout.tsx              ← UndoProvider > AgentChatProvider > Sidebar/Header + FloatingAgentChat
├── app/layout.tsx                    ⭐ ThemeProvider(next-themes) 루트 배선
├── app/(app)/{dashboard,calendar,projects,chat,finance,cards,agents,
│              workflows,files,mail,mcp,settings,mypage}/  ⭐ 6섹션
├── app/api/
│   ├── agents/[id]/chat(streamText) · agents/generate-prompt ⭐(skill.md 생성)
│   ├── workflows/[id]/run ⭐(순차 실행 엔진, NDJSON 스트리밍)
│   └── finance/{ocr,tax-invoice} · cards/ocr
├── components/
│   ├── undo/UndoProvider.tsx         ⭐ 전역 ⌘Z (equria:reload 이벤트)
│   ├── agent-chat/{AgentChatContext, FloatingAgentChat}  ← 위젯(핀 기준, 0개=빈)
│   ├── agents/{AgentBuilderForm, AgentWizard, IconPicker} ⭐ 빌더+위저드+회전아이콘
│   ├── workflows/{WorkflowsView, WorkflowEditor, WorkflowCanvas} ⭐ n8n 캔버스
│   ├── {settings,mypage,files,mail,mcp}/*View ⭐ 6섹션 뷰
│   ├── theme/ThemeProvider ⭐ · shared/{Modal, BackLink, MarqueeRail⭐}
│   └── chat/{ChatList,DirectChat} · calendar/CalendarView · finance·cards·projects
└── lib/
    ├── config/features.ts            ⭐ SSOT(group 필드+FEATURE_GROUPS)
    ├── {workflows,workflowTools,files,mcp}.ts ⭐ 세션4 SSOT
    ├── supabase/{client,server,admin,types,mustOk}
    └── {agents,agentBuilder,calendar,projects,finance,figma,csv,upload}.ts
```

---

## 💡 합의된 정책

- 데이터 삭제 = **휴지통(soft-delete)**. 목록 `deleted_at is null` 또는 `is_active` 필터. Storage 파일 보존(고아 방지), 영구삭제는 후속 purge.
- ⌘Z Undo = 데이터 기능 전반, 무음(실패 시만 토스트).
- 에이전트 사용 = 우하단 위젯 only(`/agents`=빌더/관리). 비공개 기본 + 공유 토글. 위젯 = 내 핀 기준(0개면 빈 위젯).
- **워크플로우** = n8n 캔버스(원형 노드·끈). 비공개 기본 + `is_public` 공유 토글. 수정은 소유자만, 공유받은 사람은 보기/실행만. 실행은 끈 위상정렬 순서.
- 마이=나(프로필·통계·내 에이전트) / 설정=환경(프로필 편집·테마·로그아웃).
- 세금계산서=작성·정리만(발행X). 캘린더=네이티브 Date 자체구현. Google/유튜브/Figma/Higgsfield=미연동(게이트 또는 웹훅 우회).

---

## 🔜 백로그 (고도화)

- **워크플로우 도구 확장**: 유튜브 업로드(Google OAuth)·Higgsfield 제작·Figma·Gmail 도구를 `workflowTools.ts` + run 라우트에 추가(현재 웹훅만 실작동).
- 대시보드 실데이터 위젯 · `agent_usage` 통계 페이지 · Google OAuth 실구현(메일·Drive) · 아바타 업로드 · 휴지통 purge(Edge Function) · Supabase Pro/Sentry/Staging.

---

## 📝 참고

- GitHub: https://github.com/chowhiwon99-code/equria-workflow-Sass
- Vercel: https://vercel.com/chowhiwon99-2151s-projects/equria-workflow-sass
- Supabase: https://supabase.com/dashboard/project/dutovtfdckhayyvhtuxu
- 메모리: `~/.claude/projects/-Users-johwiwon-equria-workspace/memory/`
