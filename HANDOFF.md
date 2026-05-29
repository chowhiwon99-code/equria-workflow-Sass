# HANDOFF — EQURIA Workspace

> 다음 세션 시작 시 이 파일 + `CLAUDE.md` + `.claude/skills/latest-stack.md`를 **순서대로** 먼저 읽어주세요.
> 최종 업데이트: 2026-05-29

---

## 🎯 한 줄 요약

**Phase 1 + 자체기능 5종 + 에이전트 허브(우하단 플로팅 위젯, 드래그 이동) + DM Realtime fix까지 GitHub `main`에 커밋 완료. Vercel은 GitHub 자동 빌드 파이프라인 가동 중.** `tsc` 0 에러, `pnpm build` 통과. 운영 사이트 `https://equria-workflow-sass.vercel.app` 정상 작동(가입/로그인 검증). 단 **최근 커밋(`0a199a5`) 4개 기능은 실동작 미검증** — 다음 세션 첫 작업으로 검증 권장.

---

## 🚀 다음 세션 즉시 알아야 할 것

### 환경
- **GitHub**: `https://github.com/chowhiwon99-code/equria-workflow-Sass` (main 단일, 자동 배포)
- **Vercel**: `equria-workflow-sass.vercel.app` (Production). Hobby 플랜.
- **DB**: Supabase `dutovtfdckhayyvhtuxu` (ap-northeast-2 서울). **19 테이블** 운영 중 (마이그레이션 001~007).
- **로컬 `.env.local`**: 키 4종 + `WORKSPACE_PASSWORD=4321`(테스트값, 배포는 별도 강한 값).
- **Vercel 환경변수 6종 등록 완료** — `NEXT_PUBLIC_APP_URL`만 placeholder 상태(진짜 도메인으로 교체 필요).
- **테스트 계정 3명**: `조휘원`(로컬 4321) / `이동규`(Vercel 비번) / `김건` — DM 검증 가능.

### 코드 상태
- ✅ `tsc --noEmit` 0 에러
- ✅ `pnpm build` 통과 (직전 검증)
- ✅ Supabase advisor: ERROR 0, WARN 22건(search_path/security definer execute — 운영 직전 일괄 하드닝 권장)
- ✅ 최신 commit: `0a199a5` (위젯 드래그 + Realtime fix + ChatList + Finance 행삭제)
- ⚠️ 위 commit의 4개 기능은 **사용자 실동작 미검증**

### 작업 룰 (합의됨)
1. AI/Supabase 코드 작성·수정 전 **`.claude/skills/latest-stack.md` 반드시 확인** (AI SDK v6).
2. 모델: 기본 `claude-sonnet-4-6`, 복잡 `claude-opus-4-7`.
3. **유지보수성 최우선** — SSOT(`lib/config/features.ts`, `lib/projects.ts`, `lib/finance.ts`), 공용 컴포넌트 재사용.
4. **객관적 보고** — 검증된 것과 미검증을 분리.
5. **코드 변경 후 매번 `tsc`** + 필요 시 `pnpm build`.
6. `!` prefix는 Claude Code 입력창에서만, 인터랙티브 prompt는 별도 Terminal.app.

---

## 📦 구현 완료 기능

### 자체기능 5종 (모두 `status: 'ready'`)
| 라우트 | 기능 |
|--------|------|
| `/calendar` | 자체 월간 캘린더(JS Date + CSS Grid), 일정 CRUD, 색상 6종 |
| `/projects` | 검색·상태 필터·페이지네이션 + 상세(멤버/상태/파일·Figma) |
| `/chat`, `/chat/[userId]` | 1:1 DM + 나와의 채팅 + 안읽음 + 파일 첨부 |
| `/finance` | 비용·매출 — OCR(이미지/PDF) + 세금계산서 초안 + CSV + 다중·**행별 삭제** |
| `/cards` | 명함 — OCR + CSV + 단건 삭제 |

### AI 에이전트 허브 (Phase 2)
- **우하단 플로팅 위젯**, 둥둥 모션, **드래그 이동**(닫힌 위젯/펼친 패널 헤더), 더블클릭 우하단 리셋, localStorage 영속
- ⌘K 열기·닫기, ESC 닫기, 360×540 / 풀스크린 토글
- **8개 시드 에이전트 가로 칩** — 즉시 전환 + 자동 새 대화 + ChatBody key remount로 메시지 초기화
- AI SDK v6: `streamText` + `convertToModelMessages` + `toUIMessageStreamResponse` + 슬라이딩 윈도우 10개
- 마크다운 렌더링(react-markdown + remark-gfm), 메시지 hover 복사
- `onFinish` → `messages` + `agent_usage`(토큰·duration) 자동 저장
- 사이드바 `/agents` → Phase 3(빌더/관리) placeholder

### 알림 + Realtime
- Header 알림 벨(`notifications` Realtime INSERT 구독)
- 자동 트리거 3종: DM/일정완료/프로젝트 배정
- pg_cron 04:00 KST 30일 자동정리
- **DM Realtime UPDATE 도달 fix**(마이그레이션 007): `direct_messages`/`notifications` REPLICA IDENTITY FULL

### ChatList Realtime (방금 추가)
- 마운트 시 fetch + Realtime INSERT/UPDATE 구독 → 다른 곳에서 메시지 변경 시 목록 자동 reload
- unread 배지 즉시 갱신

### 인프라
- 인증: 이름+공용비번 → `nameToEmail()` → admin API(`email_confirm:true`)
- 라우팅 SSOT: `lib/config/features.ts`
- 가드: `src/proxy.ts` (Next 16 신컨벤션)
- 공용: Modal, BackLink, `hover-grow`, Button scale 1.03

---

## 🗄 DB 마이그레이션 이력

| # | 파일 | 핵심 |
|---|------|------|
| 001 | `001_initial_schema.sql` | 9테이블 + RLS + 트리거 + 시드 8개 에이전트 |
| — | **(파일 없음, MCP 직접 적용)** | `direct_conversations`/`direct_messages` + `get_or_create_direct_conversation` RPC + Realtime ⚠️ **파일로 떨어뜨려 코드에 추가 필요** |
| 002 | `002_features.sql` | 8테이블 추가(projects, notifications, finance, cards 등) + 알림 트리거 + 인덱스 + Storage 버킷 |
| 003 | `003_finance_qty.sql` | quantity/unit_price/fee_amount |
| 004 | `004_files_source_link_figma.sql` | files.source 확장 |
| 005 | `005_self_chat.sql` | 셀프대화 허용 + chat-files 버킷 |
| 006 | `006_storage_cascade_and_notif_cleanup.sql` | BEFORE DELETE 트리거 3종 + pg_cron 30일 알림 자동정리 |
| 007 | `007_replica_identity_full.sql` 🆕 | `direct_messages`/`notifications` REPLICA IDENTITY FULL — Realtime UPDATE 도달 보장 |

**Storage 버킷**: `receipts` / `business-cards` / `chat-files`
**Realtime publication**: `direct_messages`, `notifications`

---

## 🛠 핵심 파일

```
src/
├── proxy.ts                              ← 인증 가드
├── app/
│   ├── (auth)/{layout, login, signup, actions}.ts(x)
│   ├── (app)/
│   │   ├── layout.tsx                    ← Sidebar/Header + AgentChatProvider + FloatingAgentChat
│   │   ├── dashboard, calendar, projects/, chat/, finance/, cards/ ...
│   │   ├── agents/{page,new,[id]}/...    ← Phase 3 placeholder
│   │   └── ...
│   └── api/
│       ├── agents/[id]/chat/route.ts     ← AI SDK v6 streamText
│       ├── finance/{ocr, tax-invoice}/route.ts
│       └── cards/ocr/route.ts
├── components/
│   ├── agent-chat/                       ← Phase 2
│   │   ├── AgentChatContext.tsx          (전역 상태 + position + chatVersion)
│   │   └── FloatingAgentChat.tsx         (위젯 + 패널 + ChatBody + useDragWidget 훅)
│   ├── chat/{ChatList, DirectChat}.tsx   ← DM + Realtime
│   ├── finance/FinanceView.tsx           ← OCR + 다중삭제 + 행별 삭제
│   ├── cards/{CardsView, CardDetail}.tsx
│   ├── calendar/CalendarView.tsx
│   ├── projects/{ProjectsView, ProjectDetail}.tsx
│   ├── layout/{Sidebar, Header, NotificationBell}.tsx
│   └── shared/{Modal, BackLink, PagePlaceholder}.tsx
├── lib/
│   ├── config/features.ts                ⭐ SSOT
│   ├── claude/{client, schemas}.ts
│   ├── supabase/{client, server, admin, types}.ts
│   ├── auth.ts, calendar.ts, projects.ts, finance.ts, figma.ts, csv.ts, upload.ts
│   └── utils.ts
└── types/index.ts

supabase/migrations/001~007
.claude/skills/latest-stack.md            ← AI SDK v6 검증 패턴 (필독)
```

---

## 🔴 다음 세션 첫 작업 — 미검증 4종 검증

### ① DM "1" 사라짐 (Realtime UPDATE)
1. Dia에서 조휘원으로 채팅 페이지 진입 → 본인 메시지 옆 "1" 확인
2. 시크릿 모드/다른 브라우저로 김건 또는 이동규 로그인
3. 조휘원과의 대화방 입장
4. **Dia(조휘원) 화면에서 "1"이 즉시 사라지면 ✅ Fix 성공**
5. 안 사라지면 → 추가 디버깅 필요 (브라우저 콘솔 에러 + Supabase Logs)

### ② ChatList unread 배지 자동 갱신
- 조휘원 `/chat` 페이지 열어둔 상태
- 다른 계정으로 새 메시지 보내면 → 목록에 빨간 unread 배지 즉시 표시
- 상대가 채팅창 입장하면 배지 즉시 사라짐

### ③ 위젯 드래그 이동
- 우하단 둥둥 위젯 잡고 드래그 → 마우스 따라 이동
- 짧은 클릭(5px 미만) → 펼침 (드래그 ≠ 클릭 분리)
- 펼친 패널 헤더의 빈 영역(이름·아이콘 쪽) 드래그 → 패널·위젯 같이 이동
- 풀스크린 모드(확대 버튼) → 헤더 드래그 비활성
- 위젯 더블클릭 → 우하단 리셋
- F5 새로고침 → 위치 유지 (localStorage)

### ④ Finance 행별 삭제
- `/finance` 행 우측에 연필(수정) + 휴지통(삭제) 두 아이콘
- 휴지통 클릭 → confirm(거래처/금액) → 삭제 + Storage 원본도 cascade 제거

---

## 🟠 운영 안정화 (검증 후 처리)

### ⑤ service_role_key Rotation ⚠️ 보안
- IDE가 채팅 transcript에 service_role 키 자동 첨부 노출됨
- Supabase Dashboard → Settings → API → service_role **Reset/Rotate**
- 새 키 → Vercel 환경변수 update → 로컬 `.env.local` update → Vercel Redeploy → 로컬 dev 재시작
- 진행 사이 1~2분 가입/관리자 API 다운타임

### ⑥ 마이그레이션 SSOT 정리
- DB에만 있고 코드 저장소엔 없는 `direct_messages` 마이그레이션 파일로 떨어뜨리기
- 신규 환경 셋업 시 누락 방지

### ⑦ Security Advisor 22 WARN 일괄 하드닝 (마이그레이션 008)
- 모든 trigger/RPC 함수에 `set search_path = public, pg_catalog`
- trigger 함수는 `revoke execute from anon, authenticated`
- 예외: `get_or_create_direct_conversation`은 RPC라 authenticated 권한 유지

### ⑧ OCR Storage 고아 파일 정리
- Storage 업로드 → OCR 실패 → DB 행 없이 파일만 남음
- API 라우트 catch에서 `storage.remove([path])` 또는 일 1회 cron

### ⑨ `NEXT_PUBLIC_APP_URL` Vercel 값 교체
- placeholder → `https://equria-workflow-sass.vercel.app`
- Redeploy

### ⑩ 토큰 사용량 모니터링
- `agent_usage` 일별 집계 + 임계값 Slack/이메일 알림
- Upstash Ratelimit 또는 Vercel Edge Config

---

## 🟡 운영 중 점진 대응

| # | 항목 | 비고 |
|---|------|------|
| 11 | 대화 데이터 누적 정책 | 6개월+ `status='archived'` → 1년+ archive 테이블 |
| 12 | 인덱스 튜닝 | 실측 후 Performance Advisor |
| 13 | Supabase Pro 업그레이드 검토 | $25/월, 백업 7→30일, DB 8GB |
| 14 | Auth leaked password protection | 개별 비번 전환 시 |
| 15 | Sentry 에러 모니터링 | OCR 실패, 스트리밍 끊김 |
| 16 | Staging 환경 | 별도 Supabase + Vercel Preview |

---

## 🔜 다음 세션 작업 후보 (검증·운영 후)

### Phase 3 — 에이전트 빌더
- `/agents/new` 생성 폼 (시스템 프롬프트 textarea, model select, max_tokens)
- `POST /api/agents` (agents + agent_version 생성, 트리거가 이전 is_current=false)
- `/agents` 리스트 (시드 8개 + 커스텀)
- 버전 이력 조회

### DM 메시지 수정/삭제 ⭐ 사용자 요청 (백로그)
- 본인 메시지 호버 → 수정·삭제 버튼 (텍스트만, 첨부는 비활성)
- soft delete or hard delete + RLS

### 캘린더 멀티데이 ⭐ 사용자 요청 (백로그)
- 셀 드래그로 시작~끝 날짜 한 번에 생성
- 가로로 이어지는 막대 표시
- ⚠️ "색상 흐리게" 의도 확인: 과거 일자 / 진행중 / 전체 중 어느 것?

### 대시보드 실데이터 위젯
오늘 일정 / 안 읽은 알림 / 미확정 비용·매출 / 진행중 프로젝트

### 사용량 통계 페이지
agent_usage 집계 — 누가 어떤 에이전트, 토큰/비용

### Google 연동 실구현
OAuth 사전준비 후 `google_connections` + Drive/Gmail

### 워크플로우 (Phase 6)
에이전트 체이닝

---

## 🟠 알려진 클라이언트·운영 이슈

| # | 항목 | 비고 |
|---|------|------|
| A | Vercel `maxDuration=60s` | Opus + 8192 토큰 시 끊김 → onFinish 미호출로 메시지 손실 가능. Pro 시 300초 |
| B | 위젯 모바일 미대응 | 380×540 고정, bottom sheet 권장 |
| C | 에러 시 `agent_usage` 누락 | onFinish 성공 시만 호출, onError 처리 필요 |
| D | error.message 그대로 노출 | Anthropic 내부 메시지 사용자 친화로 wrapping |
| E | 마크다운 다크모드 가독성 | tailwindcss-typography 미설치 |
| F | DM cross-user 파일 공유 불가 | chat-files 본인 폴더 only (의도) |
| G | 그룹 채팅 미구현 | 1:1만 |
| H | 멀티데이 캘린더 시작일 셀만 | 위 백로그에 개선 |
| I | `.or()` 검색 특수문자 escape 부재 | sanitize 또는 textSearch |
| J | OCR 카테고리가 EXPENSE_CATEGORIES 밖 반환 | zod enum 강제 |
| K | 파일 업로드 사이즈 제한 부재 | 클라이언트 사전 차단 10MB |

---

## 💡 합의된 정책

- 나와의 채팅 = 개인 메모/파일 저장소
- 세금계산서는 작성·정리만 (실제 발행은 홈택스/팝빌)
- 캘린더는 자체 (FullCalendar/date-fns 미사용)
- Google 연동은 설계만
- 항목 삭제 시 Storage cascade, 알림은 30일 자동정리
- OCR: PDF+이미지 (Anthropic PDF 32MB)
- CSV: 필터된 전체 (페이지네이션 무시)
- 에이전트 사용 = 우하단 위젯 only (`/agents`는 빌더/관리)
- 에이전트 전환 = 자동 새 대화

---

## 🧪 검증 방법

매 변경 후:
1. `npx tsc --noEmit` → 에러 0
2. 필요 시 `pnpm build`
3. dev 로그(`/private/tmp/claude-501/.../bmh3ar0x1.output`)에서 runtime error 확인
4. 마이그레이션 후 `get_advisors` (Supabase MCP)로 새 ERROR 확인
5. UI 변경 시 Dia에서 ⌘+Shift+R 후 시각 확인
6. Vercel 배포 시 `get_runtime_logs` (Vercel MCP)로 production 에러 확인

---

## 📝 참고 자료

- 최신 스택 패턴: `.claude/skills/latest-stack.md`
- 메모리 인덱스: `~/.claude/projects/-Users-johwiwon-equria-workspace/memory/`
- GitHub: https://github.com/chowhiwon99-code/equria-workflow-Sass
- Vercel: https://vercel.com/chowhiwon99-2151s-projects/equria-workflow-sass
- Supabase: https://supabase.com/dashboard/project/dutovtfdckhayyvhtuxu
