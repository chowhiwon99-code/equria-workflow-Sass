# HANDOFF — EQURIA Workspace

> 다음 세션 시작: 이 파일 → `CLAUDE.md` → `.claude/skills/latest-stack.md` 순서로 먼저 읽기.
> 최종 업데이트: 2026-05-31 (세션 4)
>
> 과거 세션의 상세 작업 로그는 **git 커밋 메시지**에 있음 — 이 파일은 "현재 상태 + 다음 할 일"만 유지.

---

## 🎯 지금 상태 (한눈에)

- **Phase 1 + 자체기능(채팅·DM·캘린더·재무·명함·프로젝트) + 에이전트 허브 운영 중.** 전역 ⌘Z Undo · 휴지통(soft-delete) 적용.
- **세션4**: 에이전트 빌더 대개편 — 가이드 위저드(`/api/agents/generate-prompt`가 skill.md 자동생성)·창의성 프리셋·핀 폴백 제거(0개면 빈 위젯+CTA)·생성 시 자동핀·**회전초밥 캐러셀**(IconPicker + 허브 카드 MarqueeRail). DB 변경 없음(기존 `user_agent_pins` 재사용).
- **세션3**: Phase 3a 커스텀 에이전트 빌더 + 위젯 핀(`014`) / 코드리뷰(xhigh) 15건 수정.
- **검증**: tsc 0 · dev 컴파일 OK · Vercel 프로덕션 빌드 READY(`next build` 통과). DB drift 없음(마이그레이션 15↔15).
- **✅ 전부 푸시 완료**: origin/main = `c40f4d9`, ahead 0 (세션3 미푸시 13커밋 + 세션4 분 모두 반영). push=운영 자동배포, 워킹트리 깨끗.
- **⏳ 사용자 E2E 진행 중**: 위저드 생성품질·회전초밥 UI·핀 시나리오 + (세션3) 코드리뷰 15건 → 다음 세션 확인.
- 운영: `https://equria-workflow-sass.vercel.app`

---

## 🔴 다음 세션 우선순위

1. **세션4 빌더 E2E 검증**(최우선) — 운영/Dia에서:
   - 가이드 위저드: 입력→AI 생성(스트리밍)→편집→저장, "직접 작성" 전환, 생성품질
   - 회전초밥: 아이콘 피커 + `/agents` 허브 카드 레일(hover 정지·클릭 가능, reduced-motion 폴백)
   - 핀: 다 빼면 빈 위젯+CTA(재충전 안 됨) · 생성 시 자동핀으로 위젯 등장
   - 창의성 프리셋(정확/균형/창의적) 이해도
2. **세션3 코드리뷰 15건 E2E**(이월) — 캘린더 멀티데이 lane(M7/M8/L9/L12) · 재무 삭제→프로젝트 합계(H3) · ⌘Z 연타(L11) · 이모지(L14). ※코드·빌드는 통과, 화면 확인만 남음.
3. **3-B service_role rotation** (사용자 직접) — 레거시 키(`eyJ...`) 노출. 새 키 → `.env.local`+Vercel 갱신(**시크릿 채팅에 붙이지 말 것**) → redeploy → 레거시 disable.
4. **휴지통 purge** (후속) — `deleted_at` 경과분 영구삭제. Edge Function(service_role)으로 행+Storage 동시삭제.
5. (선택) 핀 교체 원자성 upsert RPC / lint 부채 `set-state-in-effect` / 위젯 드래그 UI 검증.

---

## ⏳ 미검증 / 잔여 노트

- **E2E 미검증**: 코드리뷰 15건(위 1번) · 위젯 드래그 이동 · Finance 삭제 UI(데이터 0건).
- **잔여 노트(비차단)**: ① 핀 교체 delete→insert 비원자성(에러표시+resync로 안전, 완전방지엔 upsert RPC) ② `UndoCtx` 타입 `()=>void`인데 실제 async(tsc 통과) ③ 캘린더 blur-취소가 devtools 포커스에도 동작(보수적).
- **lint 부채**: `react-hooks/set-state-in-effect`(기존 `useEffect`내 load() 패턴, 앱 전반). tsc/dev 무관, `next build` eslint 막힐 수 있음.

---

## 🚀 환경 / 접근

- **GitHub** `chowhiwon99-code/equria-workflow-Sass` (main 단일, push→자동배포)
- **Vercel** `equria-workflow-sass.vercel.app` (Prod, Hobby) · `NEXT_PUBLIC_APP_URL` 아직 placeholder
- **Supabase** `dutovtfdckhayyvhtuxu` (ap-northeast-2 서울) · 마이그레이션 **001~014 전부 적용**(15↔15, drift 0)
- **.env.local** 키 4종 + `WORKSPACE_PASSWORD=4321`(테스트값). ANTHROPIC 정상. 기본 모델 `claude-sonnet-4-6`.
- **테스트 계정**: 조휘원(c6817c63…) / 이동규(cacf302d…) / 김건(fc468e85…) — DM·권한·RLS 시뮬용.

---

## 📐 작업 룰 (`safe-changes.md` 최우선)

1. **모든 변경**: 추가는 자유 / 파괴는 검증 후 / 되돌림·재현 가능. soft-delete(하드삭제 금지). 커밋 분리.
2. **DB**: MCP `apply_migration` 적용 + **반드시 `supabase/migrations/`에 파일로도**(SSOT). 멱등 작성(`drop ... if exists`).
3. **Supabase 쿼리는 반드시 `await`/`.then`**(lazy thenable — `void` 단독은 미전송). RLS 막히면 SECURITY DEFINER RPC.
4. **변경 후 매번 `npx tsc --noEmit`** + 마이그레이션 후 `get_advisors`. RLS는 begin/rollback 시뮬. `next build`는 eslint 주의.
5. AI/Supabase 코드 전 `latest-stack.md` 확인(AI SDK v6). 모델 기본 sonnet-4-6 / 복잡 opus-4-7.
6. 유지보수성 최우선 — SSOT(`lib/config/features.ts`·`projects.ts`·`finance.ts`) 재사용. 검증/미검증 분리 보고.

---

## 🗄 마이그레이션 (001~014 적용) — 핵심만

- **`008`** storage-삭제 트리거 제거(직접 DELETE 차단 회피) → **⚠️ 행 삭제 시 Storage 파일 자동삭제 안 됨**(고아 누적, purge 후속). finance RLS authenticated 완화.
- `009` `mark_dm_read` RPC · `010` chat-files 참여자 read(상대 이미지) · `011` 휴지통 `deleted_at` · `012` 보안 하드닝(search_path 고정) · `013` DM 수정/삭제 · `014` 에이전트 빌더 RLS + `user_agent_pins`.
- ※ `010`은 세션3에서 멱등화(`drop policy if exists`) — 파일만, 재적용 안 함.
- **Storage 버킷** `receipts`/`business-cards`/`chat-files`(cascade 삭제 안 됨) · **Realtime** `direct_messages`·`notifications`.

---

## 🛠 핵심 파일

```
src/
├── proxy.ts                          ← 인증 가드(Next 16)
├── app/(app)/layout.tsx              ← UndoProvider > AgentChatProvider > Sidebar/Header + FloatingAgentChat + Toaster
├── app/(app)/{dashboard,calendar,projects,chat/[userId],finance,cards,agents/{page,new,[id]}}
├── app/api/{agents/[id]/chat(streamText), finance/{ocr,tax-invoice}, cards/ocr}/route.ts
├── components/
│   ├── undo/UndoProvider.tsx         ⭐ 전역 ⌘Z (useUndo + equria:reload 이벤트)
│   ├── agent-chat/{AgentChatContext, FloatingAgentChat}  ← 위젯(핀 기준 로드, equria:agents-changed)
│   ├── agents/AgentBuilderForm.tsx   ← 생성/수정 공용 폼
│   ├── chat/{ChatList, DirectChat}   ← DM + 이미지인라인 + mark_dm_read + Realtime
│   ├── calendar/CalendarView.tsx     ← 드래그생성 + 멀티데이 lane 연속막대
│   ├── finance/FinanceView · cards/{CardsView,CardDetail} · projects/{ProjectsView,ProjectDetail}  ← undo + reload 리스너
│   └── shared/{Modal, BackLink}
└── lib/
    ├── config/features.ts            ⭐ SSOT
    ├── supabase/{client,server,admin,types,mustOk}  ← mustOk = undo 에러 throw 헬퍼
    └── {agents, calendar, projects, finance, figma, csv, upload}.ts
```

---

## ⚠️ 알려진 이슈 / 주의

| 항목 | 비고 |
|------|------|
| Vercel `maxDuration=60s` | Opus+8192 끊김 가능(Pro 시 300초) |
| `agent_usage` onError 누락 | onFinish 성공 시만 기록 |
| Anthropic transient 500 | error.message 그대로 노출 + 재시도 없음 → 라우트 wrapping 권장 |
| DM cross-user 파일 | chat-files 서명URL 본인것만(010이 SELECT는 풀어줌) |
| `.or()` 특수문자 escape 부재 | 검색 sanitize 필요 |
| OCR 카테고리 enum 이탈 가능 | zod enum 강제 |
| 업로드 사이즈 제한 없음 | 클라 10MB 사전차단 |
| NotificationBell UPDATE 미구독 | 읽음은 재마운트 시 반영 |
| 그룹채팅·위젯 모바일·md 다크모드 | 미구현/미대응 |

---

## 💡 합의된 정책

- 데이터 삭제 = **휴지통(soft-delete)**, 하드삭제 안 함. 목록 `deleted_at is null` 필터. Storage 파일 보존(고아 방지), 영구삭제는 후속 purge.
- ⌘Z Undo = 데이터 기능 전반, 무음(실패 시만 토스트).
- 에이전트 사용 = 우하단 위젯 only(`/agents`는 빌더/관리). 비공개 기본 + 공유 토글. 위젯 = 내 핀 기준.
- 나와의 채팅 = 개인 메모/파일. 세금계산서 = 작성·정리만(발행 X). 캘린더 = 네이티브 Date 자체구현. Google = 설계만. 알림 30일 자동정리(pg_cron).

---

## 🔜 백로그

대시보드 실데이터 위젯 · `agent_usage` 통계 페이지 · Google OAuth 실구현 · 워크플로우(에이전트 체이닝, Phase 6) · Undo 확장(OCR 생성) · Supabase Pro/Sentry/Staging 검토.

---

## 📝 참고

- GitHub: https://github.com/chowhiwon99-code/equria-workflow-Sass
- Vercel: https://vercel.com/chowhiwon99-2151s-projects/equria-workflow-sass
- Supabase: https://supabase.com/dashboard/project/dutovtfdckhayyvhtuxu
- 메모리: `~/.claude/projects/-Users-johwiwon-equria-workspace/memory/`
