# HANDOFF — EQURIA Workspace

> 다음 세션 시작 시 이 파일 + `CLAUDE.md` + `.claude/skills/latest-stack.md`를 **순서대로** 먼저 읽어주세요.
> 최종 업데이트: 2026-05-30

---

## 🎯 한 줄 요약

**Phase 1 + 자체기능 5종 + 에이전트 허브(플로팅 위젯) 운영 중. 이번 세션(05-30)에 사용자 보고 버그 4종을 근본 원인까지 규명해 수정하고, 신규로 ⌘Z/⌘⇧Z 전역 Undo/Redo 시스템을 데이터 기능 전반에 구축.** `tsc` 0 에러, dev 정상 컴파일. DB 마이그레이션 008·009 원격 적용 완료. **⚠️ 이번 세션 변경분은 아직 git 미커밋(working tree)** — 커밋 권장. 운영 사이트 `https://equria-workflow-sass.vercel.app`.

---

## 🆕 이번 세션(2026-05-30) 작업 — 전부 코드+DB 반영 완료, git 미커밋

### 1. 채팅 이미지 인라인 표시 ✅
- `DirectChat.tsx`: 첨부 파일명이 이미지 확장자(png/jpg/gif/webp/bmp/svg/avif/heic)면 **파일명 링크 대신 썸네일(`<img>`) 직접 렌더**(클릭 시 원본 새 탭). 비이미지 첨부는 기존 `FileText`+파일명 유지.
- 헬퍼 `isImageAttachment()` 추가.

### 2. DM 읽음 처리("빨간 unread 배지" 안 사라짐) ✅ 근본 수정
- **원인**: 입장 시 읽음 처리가 `void supabase.from('direct_messages').update(...)`로 호출 → Supabase 쿼리 빌더는 **lazy thenable**이라 `await`/`.then` 없으면 HTTP 요청이 **전송조차 안 됨** → `read_at` 영구 null. (DB로 확인: 수신 메시지 read_at 전부 null인데 RLS는 UPDATE 허용)
- **수정**: `await`로 1차 수정 후에도 잔존 우려가 있어, **SECURITY DEFINER RPC `mark_dm_read(conv_id)`**(마이그레이션 009)로 일원화. RLS/세션 변수 배제. 메시지 read_at + 관련 DM 알림(`notifications.is_read`)을 한 번에 처리.
- DirectChat은 입장 시(await) + 실시간 도착 시(`.then`) RPC 호출.
- **DB 검증 완료**: 조휘원으로 호출 시 이동규 대화 4건·김건 대화 1건 정상 처리.
- **⏳ 사용자 UI 검증 대기**: Dia에서 대화 한 번 열었다 나오면 배지 사라지는지 확인 필요. (현재 DB에 미읽음 잔존 → 첫 진입 전엔 배지 보이는 게 정상)

### 3. 비용·매출 행 삭제 안 됨 ✅ 근본 수정
- **원인**: `BEFORE DELETE` 트리거 `cleanup_finance_storage`가 `delete from storage.objects`를 **직접 실행** → Supabase가 차단(`Direct deletion from storage tables is not allowed`) → 삭제 트랜잭션 전체 실패. (동일 문제의 채팅 첨부 트리거 `cleanup_chat_attachment`도 함께)
- **수정(마이그레이션 008)**: 두 storage-삭제 트리거/함수 제거. 추가로 공유 재무 원장이므로 `finance_entries` **update/delete RLS를 `auth.uid() is not null`로 완화**(기존 작성자 한정 → OCR 등 타인 생성 항목 삭제 불가 문제 해소).
- **DB 검증 완료**: 비작성자(이동규)로도 OCR 3건 삭제 가능 확인.
- ⚠️ 트리거 제거로 **삭제 시 Storage 영수증/첨부 파일이 자동삭제되지 않음** → 고아 파일 누적(아래 운영 항목 ⑧ 참고). Undo 손실 방지를 위해 클라이언트 즉시 삭제도 의도적으로 제거함.

### 4. 캘린더 — 기간 드래그 + 연속 막대 + 날짜 입력 디자인 ✅
- **드래그 생성**: 셀 `onMouseDown→onMouseEnter→window mouseup`으로 며칠~며칠 드래그 → 시작/종료 채워진 모달. 드래그 중 `bg-primary/15` + `transition-colors duration-150 ease-out`로 부드럽게.
- **연속 막대**: 멀티데이 일정을 시작~종료 모든 날에 렌더하되 시작/끝(과 주 경계)에만 둥근 모서리, 연결 쪽은 음수 마진(`-7px`=패딩6+그리드1)으로 칸 사이를 메워 **하나로 이어지게**. 라벨은 시작/주 시작에만.
- **날짜 입력 개편**: 못생긴 네이티브 `MM/DD/YYYY` 대신 상단에 한국어 요약(`2026년 5월 12일 → 5월 15일` + `N일간` 배지) 강조 + 정돈된 2×2 입력 그리드. `eventsOn()`이 기간 포함하도록 변경, `EventDetailModal`도 기간 표시.

### 5. ⌘Z / ⌘⇧Z 전역 Undo/Redo 시스템 🆕 (사용자 요청: "데이터 기능 전체")
- **공통 `UndoProvider`** (`src/components/undo/UndoProvider.tsx`): past/future 스택(최대 50), 전역 키 핸들러(텍스트 입력 중엔 브라우저 기본 undo 양보), `useUndo()` 훅, undo/redo 후 `equria:reload` window 이벤트 dispatch. **토스트는 사용자 요청으로 제거**(성공 시 무음, 실패 시에만 에러 토스트).
- `(app)/layout.tsx`에 `UndoProvider` + `<Toaster/>`(sonner) 마운트.
- **연결된 작업**(각 작업이 inverse를 DB에 적용 → 되돌리기/다시실행):
  | 기능 | 대상 |
  |------|------|
  | 캘린더 | 일정 생성/삭제/완료토글 |
  | 비용·매출 | 생성/수정/단건·다건 삭제/확정 처리 |
  | 명함 | 삭제 (이미지 보존 → 복구 가능) |
  | 프로젝트 | 생성/상태변경 |
  | 프로젝트 멤버 | 추가/제거 |
  | 프로젝트 파일·링크 | 추가/삭제 |
- 패턴: 생성=`insert().select().single()`로 행 확보→undo는 delete, redo는 동일 행 재insert(같은 id). 삭제=삭제 전 행 확보→undo는 재insert. 상태=이전값 보존→undo는 원복.
- 상세→목록 등 교차 컴포넌트는 `equria:reload` 이벤트로 목록 뷰(CardsView/ProjectsView)가 자동 새로고침(리스너 추가됨).

### 미반영/주의
- **git 미커밋**: 아래 변경 파일들이 working tree에만 있음. 다음 세션 이어가긴 가능하나 **커밋 권장**.
  - M: `(app)/layout.tsx`, `calendar/CalendarView.tsx`, `cards/CardDetail.tsx`, `cards/CardsView.tsx`, `chat/DirectChat.tsx`, `finance/FinanceView.tsx`, `projects/ProjectDetail.tsx`, `projects/ProjectsView.tsx`, `lib/supabase/types.ts`
  - 신규: `components/undo/UndoProvider.tsx`, `supabase/migrations/008_…sql`, `supabase/migrations/009_…sql`
- 남은 lint 경고(`useEffect` 안 `load()`/`setPageCount` = 신규 `react-hooks/set-state-in-effect` 규칙)는 **기존 코드 전반의 패턴**이라 이번 세션 미수정. tsc·dev엔 영향 없음. `next build`에서 eslint 막힐 수 있어 운영 빌드 전 확인 필요.

---

## 🚀 환경 / 룰

### 환경
- **GitHub**: `https://github.com/chowhiwon99-code/equria-workflow-Sass` (main 단일, 자동 배포)
- **Vercel**: `equria-workflow-sass.vercel.app` (Production, Hobby). `NEXT_PUBLIC_APP_URL` 아직 placeholder.
- **DB**: Supabase `dutovtfdckhayyvhtuxu` (ap-northeast-2 서울). 마이그레이션 001~009 적용.
- **로컬 `.env.local`**: 키 4종 + `WORKSPACE_PASSWORD=4321`(테스트값). ANTHROPIC 키 정상(이번 세션 직접 호출 확인). 기본 모델 `claude-sonnet-4-6` 유효.
- **테스트 계정 3명**: `조휘원`(c6817c63…) / `이동규`(cacf302d…) / `김건`(fc468e85…) — DM·권한 검증 가능.
- **로컬 dev 로그**: `/private/tmp/claude-501/-Users-johwiwon-equria-workspace/<id>/tasks/<taskid>.output` (실행 시점마다 경로 달라짐).

### 작업 룰 (합의됨)
1. AI/Supabase 코드 작성·수정 전 **`.claude/skills/latest-stack.md` 확인** (AI SDK v6).
2. 모델: 기본 `claude-sonnet-4-6`, 복잡 `claude-opus-4-7`.
3. **유지보수성 최우선** — SSOT(`lib/config/features.ts`, `lib/projects.ts`, `lib/finance.ts`), 공용 컴포넌트 재사용.
4. **객관적 보고** — 검증된 것/미검증 분리해서 명시.
5. **코드 변경 후 매번 `npx tsc --noEmit`** + 필요 시 `pnpm build`.
6. Supabase 쿼리는 반드시 `await`/`.then`으로 실행 (lazy thenable — `void` 단독은 미전송). RLS로 막힐 땐 SECURITY DEFINER RPC 고려.
7. **DB는 MCP `apply_migration`으로 적용하되, 반드시 동일 SQL을 `supabase/migrations/`에 파일로도 남길 것**(SSOT).

---

## 🗄 DB 마이그레이션 이력

| # | 파일 | 핵심 |
|---|------|------|
| 001 | `001_initial_schema.sql` | 9테이블 + RLS + 트리거 + 시드 8 에이전트 |
| — | **(파일 없음, MCP 직접 적용)** ⚠️ | `direct_conversations`/`direct_messages` + `get_or_create_direct_conversation` RPC + Realtime. **여전히 파일 미작성 — 신규 환경 셋업 위해 파일화 필요** |
| 002 | `002_features.sql` | 8테이블 추가 + 알림 트리거 + 인덱스 + Storage 버킷 |
| 003 | `003_finance_qty.sql` | quantity/unit_price/fee_amount |
| 004 | `004_files_source_link_figma.sql` | files.source 확장 |
| 005 | `005_self_chat.sql` | 셀프대화 + chat-files 버킷 |
| 006 | `006_storage_cascade_and_notif_cleanup.sql` | BEFORE DELETE 트리거 + pg_cron 30일 알림 정리 ※일부 트리거는 008에서 제거됨 |
| 007 | `007_replica_identity_full.sql` | `direct_messages`/`notifications` REPLICA IDENTITY FULL |
| 008 | `008_drop_storage_delete_triggers.sql` 🆕 | `cleanup_finance_storage`/`cleanup_chat_attachment` 트리거·함수 제거(storage 직접 DELETE 차단 회피) + `finance_entries` update/delete RLS를 authenticated 전체로 완화 |
| 009 | `009_mark_dm_read_rpc.sql` 🆕 | DM 읽음 처리 RPC `mark_dm_read(conv_id)` (SECURITY DEFINER) |

**Storage 버킷**: `receipts` / `business-cards` / `chat-files` (※ 행 삭제 시 자동 cascade 안 됨 — 008로 트리거 제거됨)
**Realtime publication**: `direct_messages`, `notifications`

---

## 🛠 핵심 파일

```
src/
├── proxy.ts                              ← 인증 가드(Next 16)
├── app/
│   ├── (auth)/{layout, login, signup, actions}
│   ├── (app)/
│   │   ├── layout.tsx                    ← UndoProvider > AgentChatProvider > Sidebar/Header + FloatingAgentChat + Toaster
│   │   ├── dashboard, calendar, projects/, chat/[userId], finance/, cards/ ...
│   │   └── agents/{page,new,[id]}        ← Phase 3 placeholder
│   └── api/
│       ├── agents/[id]/chat/route.ts     ← AI SDK v6 streamText (슬라이딩 윈도우 10)
│       ├── finance/{ocr, tax-invoice}/route.ts
│       └── cards/ocr/route.ts
├── components/
│   ├── undo/UndoProvider.tsx             ⭐🆕 전역 Undo/Redo (useUndo 훅 + equria:reload 이벤트)
│   ├── agent-chat/{AgentChatContext, FloatingAgentChat}.tsx
│   ├── chat/{ChatList, DirectChat}.tsx   ← DM + 이미지 인라인 + mark_dm_read RPC + Realtime
│   ├── finance/FinanceView.tsx           ← OCR + 삭제(undo) + 수정/상태(undo)
│   ├── cards/{CardsView, CardDetail}.tsx ← 삭제 undo + reload 리스너
│   ├── calendar/CalendarView.tsx         ← 기간 드래그 + 연속 막대 + 날짜 모달 개편 + undo
│   ├── projects/{ProjectsView, ProjectDetail}.tsx ← 생성/상태/멤버/파일 undo + reload 리스너
│   ├── layout/{Sidebar, Header, NotificationBell}.tsx
│   └── shared/{Modal, BackLink, PagePlaceholder}.tsx
├── lib/
│   ├── config/features.ts                ⭐ SSOT
│   ├── supabase/{client, server, admin, types}.ts  ← types.ts에 mark_dm_read 반영됨
│   └── auth.ts, calendar.ts, projects.ts, finance.ts, figma.ts, csv.ts, upload.ts, utils.ts
└── types/index.ts

supabase/migrations/001~009
.claude/skills/latest-stack.md            ← AI SDK v6 검증 패턴 (필독)
```

---

## ✅ 이전 "미검증 4종" 현재 상태

| 항목 | 상태 |
|------|------|
| ① DM unread "빨간 숫자" 사라짐 | **근본 수정**(mark_dm_read RPC). DB 검증 완료. **사용자 UI 검증만 남음** — 대화 열었다 나오면 배지 사라지는지 |
| ② ChatList unread 배지 갱신 | ①과 동일 메커니즘. read_at 정상 갱신되면 목록 재마운트 시 반영 |
| ③ 우하단 위젯 드래그 이동 | **이번 세션 미작업 → 여전히 미검증**. 드래그/클릭 분리, 헤더 드래그, 더블클릭 리셋, localStorage 위치 유지 동작 확인 필요 |
| ④ Finance 행 삭제 | **근본 수정 완료**(트리거 제거 + RLS 완화). DB 검증 완료 |

---

## 🔴 다음 세션 우선순위

1. **이번 세션 변경분 git 커밋** (위 미커밋 목록). 메시지 예: `feat: 채팅 이미지 인라인 + DM 읽음 RPC + Finance 삭제 트리거 fix + 캘린더 기간드래그/연속막대 + 전역 Undo/Redo`
2. **UI 검증** (Dia 새로고침 후):
   - DM: 이동규/김건 대화 각각 열었다 나오기 → 빨간 배지 사라짐
   - Finance: 행 단건/다건 삭제 → 즉시 사라짐
   - 캘린더: 며칠 드래그 → 연속 막대 + 한국어 날짜 모달
   - 위젯 드래그(③, 미검증 이월)
   - Undo: 각 기능 생성/삭제 후 ⌘Z(무음 복구) / ⌘⇧Z
3. 검증 실패 시: 브라우저 콘솔 + Supabase Logs 확인. DM은 `mark_dm_read 실패` 콘솔 로그 확인.

---

## 🟠 운영 안정화 (검증 후)

| # | 항목 | 비고 |
|---|------|------|
| ⑤ | **service_role_key Rotation** ⚠️ | transcript 노출. Dashboard→Settings→API→Reset → Vercel/로컬 .env update → Redeploy |
| ⑥ | 마이그레이션 SSOT 정리 | DB만 있는 `direct_messages` DDL 파일화(위 표 — 참조) |
| ⑦ | Security Advisor WARN 하드닝 | 함수 `set search_path`, trigger 함수 `revoke execute`. ※008·009 신규 함수도 점검 |
| ⑧ | **Storage 고아 파일 정리** (중요도↑) | 008로 삭제 cascade 트리거 제거됨 → 영수증/명함/첨부 파일이 행 삭제 후 잔존. 정책 결정 필요: (a)Undo 만료 후 정리 cron, (b)휴지통, (c)방치. OCR 실패 고아도 동일 |
| ⑨ | `NEXT_PUBLIC_APP_URL` 교체 | placeholder → 실도메인 + Redeploy |
| ⑩ | 토큰 사용량 모니터링 | `agent_usage` 집계 + 임계 알림 |

---

## 🟡 운영 중 점진 대응

| # | 항목 |
|---|------|
| 11 | 대화 데이터 누적 정책(아카이브) |
| 12 | 인덱스 튜닝(Performance Advisor 실측) |
| 13 | Supabase Pro 검토($25/월, 백업·용량) |
| 14 | Auth leaked password protection |
| 15 | Sentry 에러 모니터링 |
| 16 | Staging 환경(Supabase + Vercel Preview) |

---

## 🔜 기능 백로그 (검증·운영 후)

- **Phase 3 에이전트 빌더**: `/agents/new` 생성 폼, `POST /api/agents`(agents+버전), 리스트(시드8+커스텀), 버전 이력.
- **DM 메시지 수정/삭제** ⭐ 사용자 요청: 본인 메시지 호버 → 수정·삭제(텍스트만). soft/hard delete + RLS. ※주의: 메시지 삭제 시 첨부 storage는 이제 자동삭제 안 되므로 별도 처리.
- **Undo/Redo 확장**: 명함 OCR 생성(현재 미연결, OCR 라우트 응답으로 id 받아 push 가능), 채팅 등 추가 검토.
- **대시보드 실데이터 위젯**: 오늘 일정/안읽은 알림/미확정 비용매출/진행중 프로젝트.
- **사용량 통계 페이지**: agent_usage 집계.
- **Google 연동 실구현**: OAuth + google_connections + Drive/Gmail.
- **워크플로우(Phase 6)**: 에이전트 체이닝.

---

## 🟠 알려진 이슈

| # | 항목 | 비고 |
|---|------|------|
| A | Vercel `maxDuration=60s` | Opus+8192 토큰 끊김 가능. Pro 시 300초 |
| B | 위젯 모바일 미대응 | 고정 크기 |
| C | 에러 시 `agent_usage` 누락 | onFinish 성공 시만. onError 처리 필요 |
| D | error.message 그대로 노출 + 재시도 부재 | Anthropic이 드물게 **transient 500**(api_error) 반환 시 사용자에 그대로 노출. 채팅 라우트에 재시도/친화 메시지 wrapping 권장 |
| E | 마크다운 다크모드 가독성 | tailwindcss-typography 미설치 |
| F | DM cross-user 파일 공유 불가 | chat-files 본인 폴더 only(서명 URL은 본인 파일만). 상대가 보낸 이미지 썸네일이 안 뜰 수 있음 — 확인 필요 |
| G | 그룹 채팅 미구현 | 1:1만 |
| H | 멀티데이 캘린더 | ✅ 이번 세션 연속 막대로 해결. 단 같은 날 여러 일정 겹칠 때 막대 세로 정렬(lane) 정밀도는 단순(시작순) — 다중 겹침 많아지면 lane 배정 로직 필요 |
| I | `.or()` 검색 특수문자 escape 부재 | sanitize 또는 textSearch |
| J | OCR 카테고리 enum 밖 반환 가능 | zod enum 강제 |
| K | 파일 업로드 사이즈 제한 부재 | 클라이언트 10MB 사전 차단 |
| L | NotificationBell UPDATE 미구독 | INSERT만 구독 → 읽음 처리는 재마운트 시 반영(라이브 X). 필요 시 UPDATE 구독 추가 |

---

## 💡 합의된 정책

- 나와의 채팅 = 개인 메모/파일 저장소
- 세금계산서는 작성·정리만 (실제 발행은 홈택스/팝빌)
- 캘린더는 자체 구현 (FullCalendar/date-fns 미사용, 네이티브 Date)
- Google 연동은 설계만
- **항목 삭제 시 Storage 파일은 더 이상 자동삭제하지 않음**(008로 트리거 제거 — Supabase가 직접 DELETE 차단 + Undo 손실 방지). 고아 파일 정책은 운영 항목 ⑧.
- 알림은 30일 자동정리(pg_cron)
- OCR: PDF+이미지 (Anthropic PDF)
- CSV: 필터된 전체(페이지네이션 무시)
- 에이전트 사용 = 우하단 위젯 only (`/agents`는 빌더/관리)
- 에이전트 전환 = 자동 새 대화
- Undo/Redo = 데이터 기능 전반, 토스트 없이 무음 동작(실패 시만 알림)

---

## 🧪 검증 방법

매 변경 후:
1. `npx tsc --noEmit` → 에러 0
2. 필요 시 `pnpm build` (eslint 막힘 주의 — 기존 set-state-in-effect 경고)
3. dev 로그에서 runtime error 확인
4. 마이그레이션 후 `get_advisors`(Supabase MCP)로 새 ERROR 확인. RLS 검증은 `set local role authenticated; set local request.jwt.claims=...` 트랜잭션 후 rollback으로 시뮬레이션
5. UI 변경 시 Dia에서 ⌘+Shift+R 후 시각 확인
6. Vercel 배포 시 `get_runtime_logs`(Vercel MCP)

---

## 📝 참고 자료

- 최신 스택 패턴: `.claude/skills/latest-stack.md`
- 메모리 인덱스: `~/.claude/projects/-Users-johwiwon-equria-workspace/memory/`
- GitHub: https://github.com/chowhiwon99-code/equria-workflow-Sass
- Vercel: https://vercel.com/chowhiwon99-2151s-projects/equria-workflow-sass
- Supabase: https://supabase.com/dashboard/project/dutovtfdckhayyvhtuxu
