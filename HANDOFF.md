# HANDOFF — EQURIA Workspace

> 다음 세션 시작 시 이 파일 + `CLAUDE.md` + `.claude/skills/latest-stack.md`를 **순서대로** 먼저 읽어주세요.
> 최종 업데이트: 2026-05-29

---

## 🎯 한 줄 요약

**Phase 1(인프라·인증·레이아웃) + 자체기능 5종 + 에이전트 허브(우하단 플로팅 위젯) 구현 완료. Vercel에 GitHub 자동 배포 파이프라인 가동 중**(`https://equria-workflow-sass.vercel.app`). 가입·로그인 실동작 확인. `pnpm build` + `tsc` 전 영역 통과 (23 페이지 + chat API).

---

## 🚀 다음 세션 즉시 알아야 할 것 (5분 안에)

### 환경
- **GitHub**: `https://github.com/chowhiwon99-code/equria-workflow-Sass` (main 단일 브랜치, 자동 배포)
- **Vercel**: `equria-workflow-sass.vercel.app` (Production). Hobby 플랜.
- **DB**: Supabase `dutovtfdckhayyvhtuxu` (ap-northeast-2 서울). **19 테이블** 운영 중 (마이그레이션 001~006).
- **로컬 `.env.local`**: 키 4종 + `WORKSPACE_PASSWORD=4321` (배포는 다른 강한 값).
- **Vercel 환경변수 6종 등록 완료**: `ANTHROPIC_API_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `WORKSPACE_PASSWORD`(강한 값) / `NEXT_PUBLIC_APP_URL`(아직 placeholder — 진짜 도메인으로 교체 필요).
- **계정**: 테스트 계정 2명 (`조휘원` 로컬 4321 / `이동규` Vercel 강한 비번). 본인 직원도 추가 가능.

### 코드 상태
- ✅ `tsc --noEmit` 0 에러 / `pnpm build` 통과
- ✅ Vercel 빌드 + Production 배포 정상 (가입·로그인 검증)
- ✅ Supabase advisor: ERROR 0, WARN 22건 (function search_path / security definer execute — 모두 알려진 경량 이슈, 운영 직전 일괄 하드닝 권장)
- ⚠️ `NEXT_PUBLIC_APP_URL`이 placeholder 상태 — Vercel 도메인 확정됐으니 교체 후 Redeploy 필요

### 작업 룰 (이 프로젝트에서 합의됨)
1. **AI/Supabase 코드 작성·수정 전 `.claude/skills/latest-stack.md` 반드시 확인** (AI SDK v6 패턴).
2. 모델: 기본 `claude-sonnet-4-6`, 복잡 `claude-opus-4-7`.
3. **유지보수성 최우선** — 설정/상수는 SSOT 한 곳(`lib/config/features.ts`, `lib/projects.ts`, `lib/finance.ts` 등), 공용 컴포넌트 재사용(`shared/Modal.tsx`, `shared/BackLink.tsx`).
4. **객관적 보고** — 검증된 것과 미검증을 분명히 구분. 빌드 통과 ≠ 실동작 확인.
5. **코드 변경 후 매번 `tsc` + 필요시 `pnpm build`** 로 검증.
6. **`!` prefix는 Claude Code 입력창에서만 작동** — 인터랙티브 prompt는 별도 Terminal.app에서.

---

## 📦 구현 완료 기능 (전체 목록)

### 자체기능 5종 (모두 `status: 'ready'`)
| 라우트 | 기능 | 핵심 파일 |
|--------|------|-----------|
| `/calendar` | 자체 월간 캘린더 (순수 JS Date + CSS Grid). 일정 추가/완료/삭제 모달, 색상 6종 | `lib/calendar.ts`, `components/calendar/CalendarView.tsx` |
| `/projects`, `/projects/[id]` | 프로젝트 목록(검색·상태 필터·페이지네이션) + 상세(멤버/상태/일정·비용 요약/파일·Figma 링크) | `lib/projects.ts`, `lib/figma.ts`, `components/projects/{ProjectsView,ProjectDetail}.tsx` |
| `/chat`, `/chat/[userId]` | 직원 1:1 DM + 나와의 채팅 + 안읽음 배지 + 파일 첨부 | `components/chat/{ChatList,DirectChat}.tsx` |
| `/finance` | 비용·매출 — OCR(이미지/PDF) + 세금계산서 초안 + CSV 엑셀 + **다중 선택 삭제** | `lib/finance.ts`, `components/finance/FinanceView.tsx` |
| `/cards`, `/cards/[id]` | 명함 — OCR(이미지/PDF), 검색·페이지네이션, CSV, 단건 삭제 | `components/cards/{CardsView,CardDetail}.tsx` |

### AI 에이전트 허브 (Phase 2 완료) 🆕
- **우하단 플로팅 위젯** (둥둥 뛰는 모션). 클릭/⌘K로 펼침/접힘, ESC로 닫기. 360×540 / 풀스크린 토글.
- **8개 시드 에이전트 가로 칩**(📄💬🎬📱🌐📝📊⚖️). 클릭하면 즉시 전환 + 자동 새 대화.
- **AI SDK v6 스트리밍** (`streamText` + `convertToModelMessages` + `toUIMessageStreamResponse`). 슬라이딩 윈도우 10개.
- **DB 저장**: 매 응답마다 `messages` + `agent_usage` (토큰 수, duration) 자동 저장.
- **마크다운 렌더링** (react-markdown + remark-gfm). 메시지 hover 시 복사 버튼.
- **사이드바 `/agents`** → 빌더용 placeholder (Phase 3 todo).
- 핵심 파일: `src/app/api/agents/[id]/chat/route.ts` / `components/agent-chat/{AgentChatContext, FloatingAgentChat}.tsx` / `app/globals.css`(둥둥 모션 keyframes)

### 알림 시스템
- Header 우상단 알림 벨, Realtime INSERT 구독, is_read 처리.
- 자동 트리거 3종: DM / 일정완료 / 프로젝트 배정.
- pg_cron `cleanup-read-notifications` 매일 04:00 KST 30일 자동정리.

### 데이터 누적 대응
- Storage cascade BEFORE DELETE 트리거 3종 (receipts/business-cards/chat-files 원본 자동 제거).
- CSV 엑셀 내보내기 (한글 헤더 + UTF-8 BOM).
- 검색·필터·페이지네이션 50건씩 + "더 보기".

### 인프라 / 패턴
- 인증: 이름+공용비밀번호 → `nameToEmail()` → admin API 가입(email_confirm:true).
- 라우팅 SSOT: `lib/config/features.ts`.
- 인증 가드: `src/proxy.ts` (Next 16 신컨벤션).
- 공용 모달/뒤로가기/Hover 확대 (`hover-grow`, Button cva 1.03 scale).

---

## 🗄 DB 마이그레이션 이력

| # | 파일 | 핵심 내용 |
|---|------|-----------|
| 001 | `001_initial_schema.sql` | profiles/agents/agent_versions/conversations/messages/workflows/calendar_events/mcp_servers/agent_usage (9테이블) + RLS + 트리거 + 시드 8개 에이전트 |
| — | **(로컬 파일 없음, MCP 직접 적용)** | `direct_conversations`/`direct_messages` + `get_or_create_direct_conversation` RPC + Realtime publication(direct_messages) ⚠️ **다음 세션에서 파일로 떨어뜨려 코드 저장소에 추가 필요** |
| 002 | `002_features.sql` | projects/project_members/notifications/finance_entries/tax_invoices/business_cards/google_connections/files (8테이블) + 알림 트리거 3종 + RLS + 인덱스 + Storage 버킷 + Realtime |
| 003 | `003_finance_qty.sql` | finance_entries.quantity/unit_price/fee_amount 추가 |
| 004 | `004_files_source_link_figma.sql` | files.source check 확장 ('gdrive','local','link','figma') |
| 005 | `005_self_chat.sql` | 셀프대화 허용 + chat-files 버킷 |
| 006 | `006_storage_cascade_and_notif_cleanup.sql` | BEFORE DELETE 트리거 3종 + pg_cron 30일 알림 자동정리 |

**Storage 버킷 (모두 비공개)**: `receipts` / `business-cards` / `chat-files`
**Realtime publication**: `direct_messages`, `notifications`

---

## 🛠 핵심 파일 지도

```
src/
├── proxy.ts                              ← 인증 가드 (Next16 proxy)
├── app/
│   ├── (auth)/{layout,login,signup,actions}.ts(x)
│   ├── (app)/
│   │   ├── layout.tsx                    ← Sidebar/Header + AgentChatProvider + FloatingAgentChat 마운트
│   │   ├── dashboard/page.tsx            ← 기능 카드 그리드
│   │   ├── calendar/page.tsx, projects/, chat/, finance/, cards/  ← 구현됨
│   │   ├── agents/{page,new,[id]}/...    ← placeholder (Phase 3 — 빌더)
│   │   ├── files, mail, workflows, mcp, settings  ← placeholder
│   │   └── ...
│   └── api/
│       ├── agents/[id]/chat/route.ts     🆕 AI SDK v6 streamText 라우트
│       ├── finance/ocr/route.ts          ← 영수증 OCR
│       ├── finance/tax-invoice/route.ts  ← 세금계산서 초안
│       └── cards/ocr/route.ts            ← 명함 OCR
├── components/
│   ├── ui/                               ← shadcn (수정 지양)
│   ├── layout/{Sidebar, Header, NotificationBell}.tsx
│   ├── shared/{Modal, PagePlaceholder, BackLink}.tsx
│   ├── agent-chat/                       🆕
│   │   ├── AgentChatContext.tsx          ← 전역 상태 (selectedAgent, conversationIdByAgent, chatVersionByAgent, isOpen, isExpanded, unread)
│   │   └── FloatingAgentChat.tsx         ← 위젯 본체 (FloatingButton + ChatPanel + ChatBody + Bubble)
│   ├── calendar/CalendarView.tsx
│   ├── projects/{ProjectsView, ProjectDetail}.tsx
│   ├── chat/{ChatList, DirectChat}.tsx
│   ├── finance/FinanceView.tsx
│   └── cards/{CardsView, CardDetail}.tsx
├── lib/
│   ├── auth.ts                           ← nameToEmail()
│   ├── config/features.ts                ← ⭐ 라우팅/네비 SSOT
│   ├── calendar.ts, projects.ts, finance.ts, figma.ts, csv.ts, upload.ts
│   ├── claude/{client, schemas}.ts       ← Anthropic provider + zod 스키마
│   └── supabase/{client, server, admin, types}.ts
└── types/index.ts

supabase/migrations/                       ← 001~006 (위 표 참조)
.claude/skills/latest-stack.md             ← AI SDK v6 검증 패턴 (필독)
public/                                    ← equria-logo.png(+white)
```

---

## 🔴 다음 세션 우선 처리 (우선순위 순)

### ① service_role_key Rotation ⚠️ 보안 (10분, 사용자 진행)
- 오늘 IDE 자동 첨부로 채팅 transcript에 service_role 키 노출됨 (Anthropic 내부 처리, 외부 공개 X)
- 보수적 권장: Supabase Dashboard → Settings → API → service_role **Reset/Rotate**
- 새 키로 ① Vercel 환경변수 update ② 로컬 `.env.local` update ③ Vercel Redeploy ④ 로컬 dev 재시작
- 진행 사이 1~2분 가입/관리자 API 다운타임 발생 (한산한 시간 권장)

### ② 마이그레이션 SSOT 정리 (15분)
- DB에 적용됐는데 코드 저장소엔 없는 마이그레이션 1개 (direct_conversations, direct_messages, RPC, Realtime publication) 존재
- `supabase/migrations/001b_direct_messages.sql` 같은 파일로 떨어뜨려 코드와 일치
- 신규 환경 셋업 시 누락 방지

### ③ 함수 보안 하드닝 (Security Advisor 22 WARN, 15분)
- 모든 trigger 함수에 `set search_path = public, pg_catalog` 추가
- trigger 함수는 `revoke execute on function X from anon, authenticated`
- 예외: `get_or_create_direct_conversation`은 의도적 RPC라 authenticated 권한 유지
- 마이그레이션 007로 일괄 처리

### ④ OCR Storage 고아 파일 정리 (20분)
- 흐름: Storage 업로드 → OCR 호출 → 성공 시 DB INSERT
- OCR 실패 시 Storage 파일은 남고 DB 행 없음 = 영영 고아
- 해결: API 라우트 catch에서 `storage.remove([path])` 또는 일 1회 cron 정리

### ⑤ `NEXT_PUBLIC_APP_URL` Vercel 값 교체 (3분, 사용자 진행)
- 현재 `https://placeholder.vercel.app` 등 임시값
- 진짜 도메인(`https://equria-workflow-sass.vercel.app`)으로 수정 → Redeploy

### ⑥ 토큰 사용량 모니터링 (1시간)
- `agent_usage` 일별 집계 + 임계값 알림 (Slack/이메일)
- API rate limit (Upstash 또는 Vercel Edge Config)
- 위젯 사용량 폭주 방어

---

## 🟡 운영 중 점진 대응

### ⑦ 대화 데이터 누적 정책
- 1년 추정: `messages` 36만, `agent_usage` 18만, `direct_messages` 6만 행
- 1차: 6개월 이상된 conversation `status='archived'` 마킹 + UI 숨김
- 2차 (규모 보고): `*_archive` 별도 테이블 분리 또는 자동 삭제

### ⑧ 인덱스 튜닝
- 실측 후 Performance Advisor로 slow query 잡고 인덱스 추가
- 주요 패턴: `conversations(user_id, updated_at desc)`, `messages(conversation_id, created_at)`, `agent_usage(user_id, created_at)`, `notifications(user_id, is_read)`

### ⑨ Supabase Pro 업그레이드 검토 ($25/월)
- 백업 7일 → 30일
- DB 8GB, 100GB egress
- Free tier 500MB DB 압박 시점

### ⑩ Auth leaked password protection 활성화
- 공용 비번 → 개별 비번 정책 전환 시

### ⑪ Sentry 등 에러 모니터링
- DB 트랜잭션 실패, OCR 실패, 스트리밍 끊김 등 추적

### ⑫ Staging 환경
- 별도 Supabase 프로젝트 + Vercel Preview 분리

---

## 🟠 알려진 클라이언트·운영 이슈

| # | 항목 | 비고 |
|---|------|------|
| A | Vercel `maxDuration=60s` 한계 | Opus + 8192 토큰 응답 시 끊김 가능. 끊기면 onFinish 미호출로 메시지 영구 손실. Pro 업그레이드 시 300초로 완화. |
| B | 위젯 모바일 미대응 | 380×540 고정. 모바일은 bottom sheet 형식 권장. |
| C | 에러 시 `agent_usage` 누락 | onFinish는 성공 시만 호출. error → success:false 기록 안 됨. onError 콜백에 별도 처리 필요. |
| D | error.message 그대로 노출 | Anthropic 내부 메시지 노출 가능. 사용자 친화 메시지로 wrapping 필요. |
| E | 마크다운 다크모드 가독성 | tailwindcss-typography 미설치. 필요 시 추가. |
| F | DM cross-user 파일 공유 불가 | chat-files 본인 폴더만 접근. 셀프채팅 = 개인 저장소. |
| G | 그룹 채팅 미구현 | 1:1만. |
| H | 멀티데이 캘린더 이벤트 | 시작일 셀에만 칩 표시. |
| I | `.or()` 검색 특수문자 escape 부재 | 사용자 입력 `"(주)한국"` 등 잠재 위험. sanitize 또는 textSearch 사용 권장. |
| J | OCR 카테고리가 EXPENSE_CATEGORIES 밖 값 반환 가능 | zod enum 강제 또는 매핑 함수 필요. |
| K | 파일 업로드 사이즈 제한 부재 | 클라이언트 사전 차단 권장 (10MB). |

---

## 🔜 다음 세션 작업 후보 (우선순위)

### ① 운영 안정화 (위 🔴 #1~5)
service_role rotation + 마이그레이션 정리 + 보안 하드닝 + Storage 정리 + APP_URL 교체. 한 세션에 가능.

### ② Phase 3 에이전트 빌더
- `/agents/new` 폼 — 커스텀 에이전트 생성
- 시스템 프롬프트 textarea, model select, max_tokens slider
- `POST /api/agents` — 에이전트 + 첫 agent_version 생성
- `/agents` 리스트 페이지 (시드 8개 + 내가 만든 것)
- 시스템 프롬프트 수정 → 새 버전 생성 (트리거가 이전 is_current=false)
- 버전 이력 조회 UI

### ③ 대시보드 실데이터 위젯
오늘 일정 / 안 읽은 알림 N건 / 미확정 비용·매출 / 진행중 프로젝트.

### ④ 사용량 통계 페이지
agent_usage 집계 — 누가 어떤 에이전트를 얼마나 썼는지, 토큰·비용.

### ⑤ Google 연동 실구현
Google Cloud OAuth 사전준비 후. `google_connections` + Drive/Gmail API 연결.

### ⑥ 워크플로우 (Phase 6)
에이전트 체이닝 (예: 번역 → CS응대 자동 흐름).

### ⑦ 실동작 검증 마무리
- 직원 3번째 계정 추가 → DM·알림 E2E
- 다양한 영수증·세금계산서·명함 OCR 정확도
- 위젯 모든 8개 에이전트 동작 검증
- Figma 딥링크 (Figma 앱 설치 필요)

---

## 💡 합의된 정책

- **나와의 채팅 = 개인 메모/파일 저장소**. 직원 간 파일 공유는 링크로.
- **세금계산서는 작성·정리만**. 실제 발행은 홈택스/팝빌.
- **캘린더는 자체**. FullCalendar/date-fns/shadcn Calendar 미사용.
- **Google 연동은 설계만**.
- **항목 삭제 시 Storage cascade 삭제**. 알림은 30일 후 자동 정리.
- **OCR 입력**: PDF + 이미지 (Anthropic PDF 32MB).
- **CSV 내보내기**: 필터된 전체 (페이지네이션 무시).
- **UI**: hover 확대 모션 전역, 테이블 tabular-nums + align-middle, BackLink 공용.
- **에이전트 사용 = 우하단 위젯 only**. `/agents` 페이지는 빌더/관리용.
- **에이전트 전환 = 자동 새 대화**. (시스템 프롬프트 다르니까)

---

## 🧪 검증 방법

매 변경 후:
1. `npx tsc --noEmit` → 에러 0
2. 필요시 `pnpm build` (전체 23 페이지 + chat API)
3. dev 로그(`/private/tmp/claude-501/.../bmh3ar0x1.output`)에서 runtime error 확인
4. 마이그레이션 후 Supabase MCP `get_advisors` 호출하여 새 ERROR 없는지 확인
5. UI 변경 시 Dia에서 ⌘+Shift+R 후 시각 확인
6. Vercel 배포 시 `get_runtime_logs` (Vercel MCP)로 production 에러 확인

---

## 📝 참고 자료

- 7기능 기획안 원본: `~/.claude/plans/gleaming-stargazing-frog.md`
- 최신 스택 패턴: `.claude/skills/latest-stack.md`
- 메모리 인덱스: `~/.claude/projects/-Users-johwiwon-equria-workspace/memory/`
- 로고 원본: `/Users/johwiwon/Desktop/이미지 파일's/EQURIA_V2(누끼) 1.png` (+ white)
- Vercel 프로젝트: https://vercel.com/chowhiwon99-2151s-projects/equria-workflow-sass
- GitHub repo: https://github.com/chowhiwon99-code/equria-workflow-Sass
- Supabase 프로젝트: https://supabase.com/dashboard/project/dutovtfdckhayyvhtuxu
