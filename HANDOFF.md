# HANDOFF — EQURIA Workspace

> 다음 세션 시작 시 이 파일 + `CLAUDE.md` + `.claude/skills/latest-stack.md`를 **순서대로** 먼저 읽어주세요.
> 최종 업데이트: 2026-05-28

---

## 🎯 한 줄 요약

**Phase 1(인프라·인증·레이아웃) + 자체기능 5종(캘린더 / 프로젝트(+파일·Figma) / 알림+DM(+나와의 채팅) / 비용·매출(+세금계산서·OCR) / 명함(+OCR)) 구현 완료.** 데이터 누적 대비(cascade 삭제, 알림 자동정리, CSV 내보내기, 검색·필터·페이지네이션)까지 적용. **`pnpm build` 전체 통과** (22 페이지 정적 생성).

**Google 연동(파일/메일)**: DB·화면 골격만 (PagePlaceholder + OAuth 준비 todo).
**에이전트 허브(Phase 2)**: 사용자 요청으로 **보류 중** — 자체기능 안정화 후 진행 예정. 다음 세션의 1순위 후보.

---

## 🚀 다음 세션 즉시 알아야 할 것 (5분 안에)

### 환경
- **DB**: Supabase `dutovtfdckhayyvhtuxu` (ap-northeast-2 서울). 11 → **19 테이블** 운영 중 (마이그레이션 001~006).
- **`.env.local`**: 키 4개 전부 실값 + 검증 완료 (ANTHROPIC_API_KEY / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL·ANON_KEY). `WORKSPACE_PASSWORD = "4321"` (테스트값 — 배포 전 강화 필수).
- **계정**: 테스트 계정 1개 (`조휘원`, id `c6817c63-943f-4257-8500-f9840ad39bde`).
- **dev 서버**: 이전 세션 백그라운드 ID `bbj8v1a2g`. 새 세션에선 다시 `pnpm dev` 실행하면 됨.

### 코드 상태
- ✅ `tsc --noEmit` 0 에러 / `pnpm build` 통과
- ✅ Supabase advisor: 모두 WARN(security definer search_path), ERROR 없음
- ⚠️ dev 로그에 옛 "Bookmark is not defined" 잔여 — 풀리로드 시 사라짐(현재 코드엔 없음)

### 작업 룰 (이 프로젝트에서 합의됨)
1. **AI/Supabase 코드 작성·수정 전 `.claude/skills/latest-stack.md` 반드시 확인** (AI SDK v6 패턴, 옛 v3/v4와 혼동 금지).
2. 모델: 기본 `claude-sonnet-4-6`, 복잡 `claude-opus-4-7`.
3. **유지보수성 최우선** — 사용자가 반복 강조. 설정/상수는 SSOT 한 곳에(`lib/config/features.ts`, `lib/projects.ts`, `lib/finance.ts` 등), 컴포넌트 재사용 우선(`shared/Modal.tsx`, `shared/BackLink.tsx`).
4. **객관적 보고** — 검증된 것과 미검증을 분명히 구분. 빌드 통과 ≠ 실동작 확인.
5. **코드 변경 후 매번 `tsc` + 필요시 `pnpm build`** 로 검증. 중간에 안 꼬이게.

---

## 📦 구현 완료 기능 (전체 목록)

### 자체기능 5종 (모두 `status: 'ready'`)
| 라우트 | 기능 | 핵심 파일 |
|--------|------|-----------|
| `/calendar` | 자체 월간 캘린더 (순수 JS Date + CSS Grid) — FullCalendar 미사용. 어제/오늘/내일 segmented 네비, 일정 추가/완료/삭제 모달, 색상 6종 | `lib/calendar.ts`, `components/calendar/CalendarView.tsx` |
| `/projects`, `/projects/[id]` | 프로젝트 목록(검색·상태 필터·페이지네이션) + 상세(멤버/상태/일정·비용 요약/파일·Figma 링크) | `lib/projects.ts`, `lib/figma.ts`, `components/projects/{ProjectsView,ProjectDetail}.tsx` |
| `/chat`, `/chat/[userId]` | 직원 1:1 DM + 최근 대화방 목록 + 안읽음 표시 + 읽음 처리 + **나와의 채팅**(셀프 DM, 파일/링크 저장소) + 파일 첨부 | `components/chat/{ChatList,DirectChat}.tsx` |
| `/finance` | 비용·매출 장부 — 직접입력/수정 + 갯수×단가 자동계산 + OCR(이미지/PDF) + 세금계산서 초안 + 카테고리·검색 필터 + 페이지네이션 + CSV 엑셀 내보내기 | `lib/finance.ts`, `components/finance/FinanceView.tsx`, `app/api/finance/{ocr,tax-invoice}/route.ts` |
| `/cards`, `/cards/[id]` | 명함 관리 — OCR(이미지/PDF), 등록자 표시, 검색·페이지네이션, CSV 내보내기 | `components/cards/{CardsView,CardDetail}.tsx`, `app/api/cards/ocr/route.ts` |

### 알림 시스템
- **Header 우상단 알림 벨** (`NotificationBell.tsx`) — Realtime INSERT 구독, 미읽음 배지, 클릭 시 link 이동 + is_read=true.
- **자동 알림 트리거 3종**:
  - `handle_new_dm` — direct_messages 새 메시지 → 상대방 알림(셀프는 skip)
  - `handle_event_done` — calendar_events status='done' → attendees 알림
  - `handle_project_assigned` — project_members 추가 → 해당 멤버 알림
- **30일 후 자동정리** — pg_cron `cleanup-read-notifications` 매일 04:00 KST 실행.

### 데이터 누적 대응 (방금 적용)
- **Storage cascade 삭제 트리거 3종** (마이그레이션 006) — finance_entries/business_cards/direct_messages 행 삭제 시 Storage 원본 자동 제거. 어디서 삭제되든(SQL/API/클라) 동작.
- **CSV 엑셀 내보내기** — finance/cards에 "엑셀" 버튼. 한글 헤더 + UTF-8 BOM(Excel 한글 깨짐 방지). **필터된 전체** 내보내기(페이지네이션 무시).
- **검색·필터·페이지네이션** — finance/cards/projects 모두 50건씩 + "더 보기 (N/총)" 패턴. 합계는 필터된 전체 기준 별도 쿼리.

### Google 연동 (설계만)
- DB 골격: `google_connections`(토큰), `files`(Drive 메타) 테이블 (마이그레이션 002).
- 화면: `/files`(Drive), `/mail`(Gmail) → `PagePlaceholder` + OAuth 준비 체크리스트.
- **실구현은 보류**: Google Cloud OAuth 클라이언트 발급·consent screen 등 사전준비 필요.

### 인프라 / 패턴
- 인증: 이름+공용비밀번호 → `nameToEmail()`로 결정적 이메일 변환. 가입은 서버 액션(`service_role` admin API).
- 라우팅 SSOT: `lib/config/features.ts` — 추가/수정은 여기 한 곳만.
- 인증 가드: `src/proxy.ts` (Next 16 신컨벤션).
- 로고: `public/equria-logo.png` + 다크용 `-white.png` (Sidebar 좌상단, 구분선 + "워크스페이스" 라벨).
- 공용 모달: `components/shared/Modal.tsx` + `fieldClass`.
- 공용 뒤로가기: `components/shared/BackLink.tsx`.
- Hover 확대 모션: 전역 `.hover-grow` 유틸 + Button cva에 `hover:scale-[1.03]` (`globals.css`).

---

## 🗄 DB 마이그레이션 이력

| # | 파일 | 핵심 내용 |
|---|------|-----------|
| 001 | `001_initial_schema.sql` | profiles/agents/agent_versions/conversations/messages/workflows/calendar_events/mcp_servers/agent_usage (9테이블) + RLS + 트리거 + 시드 8개 에이전트 |
| — | (로컬 파일 없음, MCP 직접 적용) | `direct_conversations`/`direct_messages` + `get_or_create_direct_conversation` RPC + Realtime publication(direct_messages) |
| 002 | `002_features.sql` | projects/project_members/notifications/finance_entries/tax_invoices/business_cards/google_connections/files (8테이블) + calendar_events 확장(status, project_id) + 알림 트리거 3종 + RLS + 인덱스 + Storage 버킷 receipts/business-cards + Realtime(notifications) |
| 003 | `003_finance_qty.sql` | finance_entries에 quantity/unit_price/fee_amount 추가 (엑셀 계산기 구조 반영) |
| 004 | `004_files_source_link_figma.sql` | files.source check 확장: 'gdrive','local','link','figma' |
| 005 | `005_self_chat.sql` | dc_ordered `<` → `<=`(셀프대화 허용), RPC 셀프 허용, handle_new_dm 자기알림 skip, direct_messages에 attachment_url/name, chat-files 버킷 + 본인폴더 정책 |
| 006 | `006_storage_cascade_and_notif_cleanup.sql` | BEFORE DELETE 트리거 3종(Storage 원본 자동제거), pg_cron 확장 + 30일 알림 자동정리 잡 |

**Storage 버킷 (모두 비공개, 본인 폴더만 접근)**: `receipts` / `business-cards` / `chat-files`
**Realtime publication**: `direct_messages`, `notifications`

---

## 🛠 핵심 파일 지도

```
src/
├── proxy.ts                              ← 인증 가드 (Next16 proxy)
├── app/
│   ├── (auth)/{layout,login,signup,actions}.ts(x)
│   ├── (app)/
│   │   ├── layout.tsx                    ← 인증 체크 + userId/name 조회 + Sidebar/Header
│   │   ├── dashboard/page.tsx            ← 기능 카드 그리드 (FEATURES 참조)
│   │   ├── calendar/page.tsx             ← CalendarView 렌더 (구현됨)
│   │   ├── projects/page.tsx,
│   │   │   [id]/page.tsx                 ← ProjectsView, ProjectDetail (구현됨)
│   │   ├── chat/page.tsx,
│   │   │   [userId]/page.tsx             ← ChatList, DirectChat (구현됨)
│   │   ├── finance/page.tsx              ← FinanceView (구현됨)
│   │   ├── cards/page.tsx,
│   │   │   [id]/page.tsx                 ← CardsView, CardDetail (구현됨)
│   │   ├── files/page.tsx                ← PagePlaceholder (Drive 설계만)
│   │   ├── mail/page.tsx                 ← PagePlaceholder (Gmail 설계만)
│   │   ├── agents/{page,new,[id]}/...    ← 스텁 (Phase 2 미구현)
│   │   ├── workflows, mcp, settings/...  ← 스텁
│   │   └── ...
│   └── api/
│       ├── finance/ocr/route.ts          ← 영수증 OCR (이미지/PDF)
│       ├── finance/tax-invoice/route.ts  ← 세금계산서 초안 (deterministic, AI 미사용)
│       └── cards/ocr/route.ts            ← 명함 OCR (이미지/PDF)
├── components/
│   ├── ui/                               ← shadcn 12종 (수정 지양)
│   ├── layout/{Sidebar, Header, NotificationBell}.tsx
│   ├── shared/{Modal, PagePlaceholder, BackLink}.tsx
│   ├── calendar/CalendarView.tsx
│   ├── projects/{ProjectsView, ProjectDetail}.tsx
│   ├── chat/{ChatList, DirectChat}.tsx
│   ├── finance/FinanceView.tsx
│   └── cards/{CardsView, CardDetail}.tsx
├── lib/
│   ├── auth.ts                           ← nameToEmail()
│   ├── utils.ts                          ← cn()
│   ├── config/features.ts                ← ⭐ 라우팅/네비 SSOT
│   ├── calendar.ts                       ← 날짜 그리드 유틸 (순수 JS Date)
│   ├── projects.ts                       ← PROJECT_STATUS 설정 SSOT
│   ├── finance.ts                        ← EXPENSE_/REVENUE_CATEGORIES, computeAmounts, won
│   ├── figma.ts                          ← isFigmaUrl, toFigmaDesktopUrl(figma:// 딥링크)
│   ├── upload.ts                         ← uploadImage(bucket, file) — 모든 파일 타입 OK
│   ├── csv.ts                            ← downloadCsv (UTF-8 BOM, Excel 호환)
│   ├── claude/{client, schemas}.ts       ← Anthropic provider + zod 스키마(영수증/명함)
│   └── supabase/{client, server, admin, types}.ts
└── types/index.ts                        ← Tables<"X"> 재수출

supabase/migrations/                       ← 001~006 (위 표 참조)
public/                                    ← equria-logo.png(+white)
~/.claude/plans/gleaming-stargazing-frog.md ← 7기능 기획안 원본
```

---

## ⚠️ 알려진 이슈·제약 (우선순위 순, 객관적)

### 🟠 영향 큼 — 다음 세션 시작 시 우선 검토
1. **`.or()` 검색에 특수문자(괄호·콤마·콜론) escape 안 됨**
   - 예: 검색어 `"(주)한국"` 입력 시 supabase-js의 `.or()` 문자열 파싱이 깨질 수 있음. 현재 발생 빈도 낮지만 사용자 입력이라 잠재 위험.
   - 적용 위치: `FinanceView`/`CardsView`/`ProjectsView` load 함수의 `.or(...)` 사용부.
   - 해결: `searchText.replace(/[,()*:\\]/g, '')` 정도의 sanitize 또는 `textSearch` 사용. ½시간 작업.

2. **OCR 카테고리가 EXPENSE_CATEGORIES 밖 값을 반환할 수 있음**
   - Claude가 "음식점" 같이 미리 정의된 8개 분류 밖 값을 자유롭게 채울 수 있어 분류 필터 드롭다운에서 안 잡힘.
   - 해결: zod 스키마에 `z.enum([...EXPENSE_CATEGORIES])` 강제 또는 OCR 후 매핑 함수.

3. **파일 업로드 사이즈 제한 없음**
   - Anthropic PDF 32MB 한도 초과 시 OCR 실패만 노출. 클라이언트에서 사전 차단 권장(10MB).

### 🟡 의도된 제약 (문서화됨)
4. **채팅 파일 첨부 cross-user 불가**: chat-files는 본인 폴더만 접근. 셀프채팅 = 개인 저장소 용도. 직원 간 공유는 링크 붙여넣기로.
5. **그룹 채팅 미구현** — 1:1만.
6. **멀티데이 캘린더 이벤트**: 시작일 셀에만 칩 표시(중간 일자엔 표시 X).
7. **합계 집계 쿼리가 필터된 전체 행을 fetch** — 1만 건 넘으면 무거움. 그땐 DB SQL aggregate 함수로 옮겨야 함.
8. **모바일 반응형 미흡** — 표 가로 스크롤. 모바일 본격 사용 시 카드 뷰 등 대응.
9. **에이전트 허브 미구현** — `/agents`는 PagePlaceholder. 사용자 요청으로 보류.
10. **Google 연동 미구현** — `/files`, `/mail`은 PagePlaceholder. OAuth 사전준비 후.

### 🟢 운영 준비(배포 직전 작업)
11. **WORKSPACE_PASSWORD = "4321"** — 강력 값으로 교체 필수.
12. **Supabase advisor WARN 22건** — security definer 함수의 search_path 미설정 / anon·authenticated가 트리거 함수를 RPC 호출 가능. 마이그레이션 한 번으로 일괄 하드닝(`set search_path = public` + `revoke execute from anon, authenticated`). 운영 직전.
13. **Auth 누설 비밀번호 보호 비활성** — 공용 비밀번호 방식이라 영향 제한적.
14. **에러 로깅/모니터링 부재** — 운영 시 Sentry 등 도입.
15. **Rate limit 없음** — OCR API 무제한 호출 가능(인증된 사용자라도 비용 위험).
16. **CSP/보안 헤더, 정기 백업, 도메인** — 미설정.

### 🔴 실검증 미완 (UI/사용자 흐름)
- **DM 실시간 송수신 (A→B)** — 직원 2명 필요. 현재 계정 1개라 코드/빌드만 검증.
- **알림 벨 배지 실시간 갱신** — 위와 동일.
- **캘린더 일정 완료 → attendees 알림** — 1명 attendee면 자기 알림 skip되어 표시 안 됨(의도). 2명 필요.
- **Vision OCR 정확도 측정** — 영수증 1건만 검증 (한국의약품수출입협회 PDF 정상 추출). 명함·다양한 영수증 미확인.
- **나와의 채팅 파일 업로드 + 다운로드 흐름** — 코드만 확인.
- **Figma 데스크탑 딥링크** — Figma 앱 설치 + 클릭 동작 미확인.
- **모바일에서 전 화면 동작** — 미확인.
- **페이지네이션 "더 보기"** — 50건 이상 쌓아야 활성 (현재 1건).

---

## 🔜 다음 세션 작업 후보 (우선순위)

### ① 에이전트 허브 — Phase 2 (사용자가 보류 풀면 1순위)
원래 메인 기능이고 자체기능 틀이 안정화됐으니 바로 착수 가능.
- `/agents` — 카드 그리드 (agents + current agent_version 조회, 카테고리 필터). 8개 시드 에이전트 활용.
- `/api/agents/[id]/chat` — Claude 스트리밍 라우트 (`.claude/skills/latest-stack.md`의 검증된 v6 패턴 — `streamText` + `convertToModelMessages` + `toUIMessageStreamResponse`).
- `/agents/[id]` — `useChat` 채팅 UI + conversations/messages 저장.
- `agent_usage` 토큰 집계 (onFinish 콜백 — `inputTokens`/`outputTokens`).
- `runtime = 'nodejs'`, `maxDuration = 60` 선언 필수.

### ② 잠재 이슈 정리 (위 🟠 1~3)
사용자 영향 가능. 작업량 적음. ½~1시간.

### ③ 실동작 검증 마무리
- 직원 2번째 계정 추가 → DM·알림·일정완료 알림 흐름 검증.
- 다양한 영수증·세금계산서 PDF / 명함 사진으로 OCR 정확도 측정.
- 나와의 채팅 파일 업로드 흐름.
- Figma 딥링크.

### ④ 대시보드 실데이터
현재 기능 카드 그리드만. 위젯 후보: 오늘의 일정, 안 읽은 알림 N건, 미확정 비용·매출, 진행중 프로젝트.

### ⑤ 설정 페이지
현재 PagePlaceholder. 프로필 수정(department, avatar_url 업로드), 관리자라면 WORKSPACE_PASSWORD 변경 UI.

### ⑥ 배포 준비
- WORKSPACE_PASSWORD 강화
- security advisor 하드닝
- Vercel 배포 + 환경변수 분리
- 도메인 + Supabase Auth redirect URL 등록

### ⑦ Google 연동 실구현
Google Cloud 사전준비(consent screen, OAuth client) 후. `google_connections` + Drive/Gmail API 연결.

### ⑧ 워크플로우 (Phase 6) / MCP (Phase 5)
원래 PLAN.md 단계. 에이전트 허브 안정화 후.

---

## 💡 이 세션에서 합의된 정책 (지키면 됨)

- **나와의 채팅 = 개인 메모/파일 저장소**. 직원 간 파일공유는 링크 붙여넣기.
- **세금계산서는 "작성·정리만"** — 실제 전자세금계산서 발행(홈택스/팝빌)은 안 함.
- **캘린더는 자체** — FullCalendar/date-fns/shadcn Calendar 미사용. 순수 JS Date + CSS Grid.
- **Google 연동은 설계만** — OAuth 사전준비 후 구현.
- **데이터 보관**: 항목 삭제 시 Storage 원본도 cascade 삭제. 알림은 30일 후 자동 정리.
- **OCR 입력**: PDF + 이미지 둘 다 지원(영수증·명함). Anthropic PDF 한도 32MB.
- **CSV 내보내기**: 필터된 전체 (페이지네이션 무시).
- **UI**: hover 확대 모션 전역 적용, 테이블 tabular-nums + align-middle, 뒤로가기는 BackLink 공용.

---

## 🧪 검증 방법 (다음 세션에서 변경 후)

매 변경 후:
1. `npx tsc --noEmit` → 에러 0
2. 필요시 `pnpm build` (전체 빌드 검증, 22 페이지)
3. dev 서버 로그(`/private/tmp/claude-501/.../bbj8v1a2g.output` 또는 새 ID)에서 runtime error 확인
4. 마이그레이션 후 Supabase MCP `get_advisors` 호출하여 새 ERROR 없는지 확인
5. UI 변경 시 Dia에서 ⌘+Shift+R 후 사용자에게 시각 확인 요청

trigger/RPC 로직 검증은 controlled DO 블록 + RAISE EXCEPTION으로 rollback 패턴 활용(이전 검증에서 성공).

---

## 📝 참고 자료

- 7기능 기획안 원본: `~/.claude/plans/gleaming-stargazing-frog.md`
- 최신 스택 패턴: `.claude/skills/latest-stack.md`
- 메모리 인덱스: `~/.claude/projects/-Users-johwiwon-equria-workspace/memory/`
- 사용자 엑셀 계산기(참고): `/Users/johwiwon/Desktop/cosmetic/계산기.xlsx`
- 로고 원본: `/Users/johwiwon/Desktop/이미지 파일's/EQURIA_V2(누끼) 1.png` (+ white version)
