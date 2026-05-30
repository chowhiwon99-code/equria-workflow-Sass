# HANDOFF — EQURIA Workspace

> 다음 세션 시작 시 이 파일 + `CLAUDE.md` + `.claude/skills/latest-stack.md`를 **순서대로** 먼저 읽어주세요.
> 최종 업데이트: 2026-05-30 (세션 3 — 코드리뷰 15건 수정 + Phase 3a 빌더 완료)

---

## 🎯 한 줄 요약

**Phase 1 + 자체기능 5종 + 에이전트 허브 운영 중. 세션3(05-30 저녁)에 ① Phase 3a 커스텀 에이전트 빌더 + 위젯 핀(마이그레이션 `014`) 완료 ② 코드리뷰(xhigh)로 발견한 15건을 병렬 워크플로우로 일괄 수정**(재무 soft-delete 누락 H2/H3, DM 에러 UI붕괴 H1, undo 에러삼킴 M4, 캘린더 멀티데이 lane M8 등).** `tsc` 0 에러 / 적대적 리뷰 15/15 / dev 라우트 컴파일 OK / **DB drift 없음(마이그레이션 15↔15 1:1)**. **⚠️ 미푸시 10커밋 = 로컬 보관. push 시 운영 자동배포.** **⏳ 코드리뷰 15건 사용자 E2E 미완 → 다음 세션 첫 작업.** 남은 일: E2E→push 결정, service_role rotation(3-B), 휴지통 purge(후속). 운영 `https://equria-workflow-sass.vercel.app`.

---

## 🆕 세션3 (2026-05-30 저녁) 작업 — Phase 3a + 코드리뷰 15건, 로컬 커밋(미푸시)

> 핵심: ① **Phase 3a 빌더**(커밋 `1c75000`) ② **코드리뷰 15건 병렬 수정**(커밋 `58b17bd`). 전부 검증(tsc 0 / 리뷰 15/15 / dev 컴파일). **E2E(사용자 수동)는 미완 → 다음 세션 첫 작업.**

### A. Phase 3a 커스텀 에이전트 빌더 + 위젯 핀 (커밋 `1c75000`)
- `/agents` 목록(내것/기본/공유 3섹션) + `/agents/new` + `/agents/[id]`(공용 `AgentBuilderForm`) + 버전 이력.
- 마이그레이션 `014`: `agents_select`/`av_select` RLS 조이기(비공개=진짜 비공개) + `user_agent_pins` 테이블(위젯에 띄울 에이전트 선택).
- 위젯(`AgentChatContext`)은 **내 핀 기준 로드**(핀 0개면 공개 기본 폴백) + `equria:agents-changed` 이벤트로 갱신.

### B. 코드리뷰 15건 수정 (커밋 `58b17bd`) — 병렬 워크플로우(11 file-agent → tsc+리뷰 verify)
| 등급 | 수정 |
|------|------|
| 🔴 H1 | DM 수정/삭제/전송/첨부 실패 → `toast`(대화창 전체 붕괴 제거), fatal은 "대화 못 엶"만 |
| 🔴 H2/H3 | tax-invoice·ProjectDetail finance 조회에 `.is("deleted_at", null)`(휴지통 누출 차단) |
| 🟠 M4 | undo/redo 클로저 supabase 에러를 **`mustOk()`**로 throw(실패한 되돌리기가 성공처럼 보이던 문제) → 신규 `src/lib/supabase/mustOk.ts` + importer 7파일 |
| 🟠 M5 | 핀 토글 에러처리(실패 시 resync+toast, 성공시에만 dispatch) |
| 🟠 M6 | 생성 undo/redo에 `equria:agents-changed` dispatch(위젯 갱신) |
| 🟠 M7/M8/L9 | 캘린더 멀티데이: **overlap 조회**(start_time만→구간겹침) + **고정 lane**(eventId→lane useMemo, 연속막대) + lane기준 표시 |
| 🟡 L10~L15 | 명함삭제 toast / ⌘Z 연타 큐 직렬화 / `010` 멱등화 / 이모지 grapheme(Intl.Segmenter) / 버전 23505 재시도 |

- **꼬임 리스크 감사 완료**(세션 마무리): 마이그레이션 15↔15 1:1(drift 0), **이 배치 DB변경 없음**(`010` 파일만 멱등화·재적용 불필요), mustOk+importer 원자적 커밋, 디버그잔재 0.
- **잔여 노트(비차단)**: ① 핀 교체 delete→insert **비원자성**(에러표시+resync로 안전처리, 완전방지엔 upsert RPC) ② `UndoCtx` 타입 `() => void`인데 실제 async(tsc 통과) ③ L12 blur 취소가 devtools 포커스에도 동작(보수적).

---

## 🆕 세션2 (2026-05-30 오후) 작업 — 코드+DB 반영 완료, 로컬 커밋(미푸시)

> 작업 원칙 신설: **`.claude/skills/safe-changes.md`** (꼬임 방지 — 추가는 자유/파괴는 검증 후/모든 변경 되돌림·재현 가능). CLAUDE.md 상단에서 최우선 참조. 사용자 지정.

1. **DM 상대 이미지 무한로딩 수정** ✅검증 — `chat-files` SELECT RLS가 본인폴더 only라 수신자가 서명URL 미발급 → "대화 참여자 허용" 정책 추가(`010`). 실패 서명URL 빈문자 캐시 제거 + 포커스/visibility 재동기화. DB 시뮬+UI 확인.
2. **DM 읽음 "1"** ✅검증 — 백엔드 정상(mark_dm_read·publication·RLS) 확인. 라이브 트리거로 "1" 즉시 제거 확인. 탭복귀 재동기화 보강.
3. **휴지통(soft-delete) 도입**(`011`) ✅검증 — finance_entries/business_cards에 `deleted_at`. 삭제=마킹, 목록·합계·CSV에 `deleted_at is null` 필터, Undo=토글. **명함 삭제 차단 버그(1-B) 동시 해결**(하드삭제 트리거 `before_delete_business_cards`/`cleanup_card_storage` 제거). RLS 시뮬 검증.
4. **마이그레이션 SSOT 복구**(`001a`) — direct_conversations/direct_messages 기반 DDL을 라이브 introspection으로 파일화(원래 MCP직접적용분). 002보다 먼저 정렬되게 `001a` 네이밍. begin/rollback 문법검증(라이브 무변경).
5. **보안 하드닝**(`012`) ✅검증 — 함수 7종 `search_path=''` 고정 + 트리거함수 execute 회수 + 정상 RPC anon차단/authenticated만. 롤백 트랜잭션으로 트리거 정상동작 확인. advisor WARN ~25→3(남은 3 = 정상 RPC 2 + leaked password).
6. **DM 메시지 수정/삭제 신기능**(`013`) ✅검증 — 본인 메시지 호버 수정(텍스트, Enter저장/Esc취소, "수정됨")·삭제(soft-delete, "삭제된 메시지입니다"). `dm_update` RLS를 sender 전용으로. ChatList 미리보기/안읽음 반영. Undo 연동. RLS 시뮬+UI 확인.

---

## 📋 세션1 후반(2026-05-30) 작업 — 코드+DB 반영, 커밋 완료(미푸시)

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
- ✅ **커밋 완료**(세션3에서 정리) — 위 작업들은 커밋 `00929d2`~`1c75000`로 반영됨(미푸시). 워킹트리 깨끗.
- 남은 lint 경고(`useEffect` 안 `load()`/`setPageCount` = 신규 `react-hooks/set-state-in-effect` 규칙)는 **기존 코드 전반의 패턴**이라 이번 세션 미수정. tsc·dev엔 영향 없음. `next build`에서 eslint 막힐 수 있어 운영 빌드 전 확인 필요.

---

## 🚀 환경 / 룰

### 환경
- **GitHub**: `https://github.com/chowhiwon99-code/equria-workflow-Sass` (main 단일, 자동 배포)
- **Vercel**: `equria-workflow-sass.vercel.app` (Production, Hobby). `NEXT_PUBLIC_APP_URL` 아직 placeholder.
- **DB**: Supabase `dutovtfdckhayyvhtuxu` (ap-northeast-2 서울). 마이그레이션 **001~014 전부 원격 적용**(디스크 15개 ↔ 적용 15개 1:1, drift 없음).
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
| 001a | `001a_direct_messages_baseline.sql` 🆕 | `direct_conversations`/`direct_messages` 기반 DDL + RLS + touch 트리거 + realtime. 원래 MCP직접적용분 → **세션2에 파일화(SSOT 복구 완료)**. 002보다 먼저 정렬되게 `001a` 네이밍 |
| 002 | `002_features.sql` | 8테이블 추가 + 알림 트리거 + 인덱스 + Storage 버킷 |
| 003 | `003_finance_qty.sql` | quantity/unit_price/fee_amount |
| 004 | `004_files_source_link_figma.sql` | files.source 확장 |
| 005 | `005_self_chat.sql` | 셀프대화 + chat-files 버킷 |
| 006 | `006_storage_cascade_and_notif_cleanup.sql` | BEFORE DELETE 트리거 + pg_cron 30일 알림 정리 ※일부 트리거는 008에서 제거됨 |
| 007 | `007_replica_identity_full.sql` | `direct_messages`/`notifications` REPLICA IDENTITY FULL |
| 008 | `008_drop_storage_delete_triggers.sql` 🆕 | `cleanup_finance_storage`/`cleanup_chat_attachment` 트리거·함수 제거(storage 직접 DELETE 차단 회피) + `finance_entries` update/delete RLS를 authenticated 전체로 완화 |
| 009 | `009_mark_dm_read_rpc.sql` | DM 읽음 처리 RPC `mark_dm_read(conv_id)` (SECURITY DEFINER) |
| 010 | `010_chat_files_participant_read.sql` 🆕 | chat-files SELECT RLS를 대화 참여자 허용(상대 이미지 표시) + attachment_url 부분 인덱스 |
| 011 | `011_soft_delete_trash.sql` 🆕 | finance_entries/business_cards `deleted_at`(휴지통) + 명함 하드삭제 트리거 제거(1-B 해결) + 활성행 부분 인덱스 |
| 012 | `012_security_hardening.sql` 🆕 | 함수 7종 `search_path=''` 고정 + 트리거함수 execute 회수 + 정상 RPC anon차단/authenticated만 |
| 013 | `013_dm_edit_delete.sql` | direct_messages `edited_at`/`deleted_at` + `dm_update` RLS를 sender 전용으로 |
| 014 | `014_agent_builder.sql` 🆕 | `agents_select`/`av_select` RLS 조이기(비공개 진짜 비공개) + `user_agent_pins` 테이블(위젯 핀) |

> ※ 세션3에서 `010`에 `drop policy if exists` 추가(멱등화, L13) — **파일만 수정, 재적용 안 함**(라이브 정책 이미 존재, 동작 동일).

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
| ① DM unread "빨간 숫자(1)" 사라짐 | ✅ **UI 검증 완료**(세션2) — 라이브 읽음처리로 "1" 즉시 제거 확인 + 탭복귀 재동기화 보강 |
| ② ChatList unread 배지 갱신 | ✅ ①과 동일 메커니즘. read_at/realtime 정상 |
| ③ 우하단 위젯 드래그 이동 | ⬜ **여전히 미검증**(세션2 미작업). 드래그/클릭 분리·헤더 드래그·더블클릭 리셋·localStorage 확인 필요 |
| ④ Finance 행 삭제 | ✅ **soft-delete(휴지통) 전환 + DB 검증**(세션2). UI는 데이터 0건이라 미검증 — 데이터 생기면 단건/다건 삭제+⌘Z 확인 |
| (신규) DM 상대 이미지 / DM 수정·삭제 | ✅ **UI 검증 완료**(세션2) |

---

## 🔴 다음 세션 우선순위

1. **코드리뷰 15건 E2E 검증**(미완 — 세션3 수정분, **최우선**) — Dia에서: 캘린더 멀티데이 연속막대/겹침 lane(M7·M8·L9·L12), 에이전트 생성→위젯→⌘Z 사라짐(M6), 핀 토글(M5), 재무 삭제→프로젝트 합계 반영(H3), ⌘Z 연타(L11), 이모지 입력(L14). 이상 없으면 push 후보. (체크리스트는 세션3 대화 참고)
2. **미푸시 10커밋 push 여부 결정** — `9396b12`~`58b17bd`. push 시 운영 자동배포. DB(`001a`·010~014)는 이미 원격 적용 → 운영은 현재 "옛 코드 + 새 스키마"(안 깨짐, 신기능 미반영). push하면 정렬. **E2E 통과 후 권장.**
3. **트랙3-B service_role rotation** (사용자 직접) — 레거시 키(`eyJ...`) 노출 → 신규 secret/publishable로 이전 후 레거시 비활성화. 순서: 새 키 복사 → `.env.local`+Vercel 갱신(**시크릿은 채팅에 붙이지 말 것**) → redeploy → 검증 → 레거시 disable.
4. **트랙3-A part ii: 휴지통 purge** (후속) — `deleted_at` 경과분 영구삭제. pg_cron은 storage 직접삭제 불가 → Edge Function(service_role)으로 행+Storage 동시 삭제. 현재는 영구 보관(안전).
5. (선택) 핀 교체 원자성 → upsert RPC 격상 / 기존 lint 부채 `set-state-in-effect` 정리 / 위젯 드래그(③) UI 검증.

---

## 🟠 운영 안정화 (검증 후)

| # | 항목 | 비고 |
|---|------|------|
| ⑤ | **service_role_key Rotation** ⚠️ | transcript 노출. Dashboard→Settings→API→Reset → Vercel/로컬 .env update → Redeploy |
| ⑥ | 마이그레이션 SSOT 정리 | ✅ **완료**(세션2) — `001a_direct_messages_baseline.sql` 파일화 |
| ⑦ | Security Advisor WARN 하드닝 | ✅ **완료**(세션2 `012`) — search_path 고정 + revoke execute. WARN ~25→3(남은 3 = 정상 RPC 2 + leaked password protection ⑭) |
| ⑧ | **Storage 고아 파일 정리** | ✅ **정책 확정+1차 구현**(세션2) — 휴지통(soft-delete `deleted_at`)으로 행·파일 보존. **purge(영구삭제) 메커니즘은 후속**(우선순위 3). OCR 실패 고아도 동일 정책 |
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
| H | 멀티데이 캘린더 lane | ✅ **세션3에서 해결**(M8) — 고정 lane(eventId→lane useMemo, 그리디 interval coloring)로 겹침 시에도 막대가 같은 행 유지·연속. `LANE_CAP=3` 초과는 `+N개` 표시. **단 E2E 미검증** |
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
- **모든 변경은 `.claude/skills/safe-changes.md` 원칙 준수**(세션2 신설, 사용자 지정 최우선): 추가는 자유/파괴는 검증 후, SSOT(마이그레이션 파일+원격 동시), soft-delete, Undo 정합, tsc·advisor 검증, 커밋 분리.
- **사용자 데이터 삭제 = 휴지통(soft-delete `deleted_at`)** — 하드삭제 안 함(세션2). 목록은 `deleted_at is null` 필터. Storage 파일은 행과 함께 보존(고아 방지). 영구삭제는 후속 purge.
- **DM 메시지**: 본인 것만 수정(텍스트)/삭제(soft-delete). 첨부는 삭제만.
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
