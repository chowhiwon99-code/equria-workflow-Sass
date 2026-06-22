# EQURIA Workspace — Claude Code 프로젝트 매니페스트

> 이 파일은 Claude Code가 프로젝트 세션마다 가장 먼저 읽는 핵심 컨텍스트입니다.
> 코드 작성 전 반드시 이 파일 전체를 참고하세요.
>
> ⚠️ **모든 코드/DB 변경 전 `.claude/skills/safe-changes.md`(꼬임 방지 설계 원칙 — 최우선)를 따른다.** 추가는 자유, 파괴는 검증 후, 모든 변경은 되돌릴 수 있고 재현 가능해야 한다.
> ⚠️ **AI 채팅/스트리밍/Supabase 코드 작성 전 `.claude/skills/latest-stack.md`를 먼저 확인.**
> 실제 설치된 AI SDK v6 등 최신 패턴이 검증돼 있으며, 라이브러리 API가 불확실하면 **context7 MCP**로 최신 문서를 조회한다.

---

## 1. 프로젝트 정체성

> ⚠️ **브랜드 규칙은 `HANDOFF.md` §합의된 정책이 최신(이 절을 대체).** 제품 **브랜드명 미정** · `EQURIA`/`이큐리아`/`K-뷰티`는 **첫 사내 고객 흔적**(제품명·도메인 아님) · 철학 = **회사별 커스터마이징**(도메인/브랜드는 고정값 아닌 슬롯/설정으로). 아래 서술은 *첫 고객(우리 회사)* 맥락의 원본 기록.

**무엇을 만드는가:** 이큐리아(EQURIA) K-뷰티 브랜드 내부 직원 전용 워크스페이스 플랫폼 (사내 SaaS)
**왜 만드는가:** 외부 SaaS 구독 대신 직접 구축 — 월 수백만 원 절감 + 100% 커스터마이징
**누가 사용하는가:** 이큐리아 내부 직원 (판매/외부 공개 아님)

> 브랜드 표기 규칙: 영문은 **EQURIA**, 한글은 **이큐리아**로 통일한다. (Icuria 표기 금지)

**핵심 기능:**
- AI 에이전트 허브 (Claude 기반, 8개 기본 + 커스텀 등록)
- 팀 캘린더 (일정 공유)
- 에이전트 빌더 (직원이 직접 에이전트 생성/등록)
- 워크플로우 자동화 (에이전트 체이닝)
- MCP 연결 (Google Workspace, Supabase, Higgsfield 등)

---

## 2. 절대 원칙 (이것만은 절대 어기지 않기)

```
1. TypeScript strict mode — 타입 any 금지
2. ANTHROPIC_API_KEY는 서버사이드 전용 — 클라이언트에 절대 노출 금지
3. 모든 DB 쿼리는 Supabase RLS 통과 필수 — service_role_key는 서버 전용
4. 모든 대화는 도메인별 메시지 테이블에 저장 (에이전트=conversations/messages · 어시스턴트=assistant_conversations/assistant_messages · 팀 DM=direct_conversations/direct_messages)
5. Claude API 스트리밍 응답 사용 (Vercel AI SDK — useChat 훅 + streamText)
6. 컴포넌트 파일명: PascalCase / 유틸리티: camelCase / 상수: UPPER_SNAKE_CASE
7. 한국어 UI 텍스트 / 영어 코드 & 주석
```

---

## 3. 기술 스택

| 레이어 | 기술 | 버전 | 이유 |
|--------|------|------|------|
| 프레임워크 | Next.js | 16.2.6 (App Router, Turbopack) | 서버/클라이언트 분리, Vercel 배포 최적화 (React 19.2.4) |
| 스타일 | TailwindCSS + shadcn/ui | Tailwind 4 (globals.css `@theme`) | 빠른 UI 구성 |
| 인증/DB | Supabase | supabase-js ^2.106 / ssr ^0.10 | Auth + PostgreSQL + Realtime + Storage |
| AI 엔진 | Anthropic Claude API | claude-sonnet-4-6 (기본) / claude-opus-4-7 (복잡) | 성능/비용 균형 |
| AI SDK | Vercel AI SDK (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/react`) | ai ^6.0 / anthropic ^3.0 / react ^3.0 | 스트리밍 (streamText + useChat) |
| 외부 연동 | googleapis (Gmail) · MCP 클라이언트 | googleapis ^173 | OAuth 메일 · MCP 도구 런타임 |
| 테마 | next-themes | ^0.4 | 라이트/다크/시스템 (루트 layout의 ThemeProvider) |
| 배포 | Vercel | — | Next.js 최적화 |
| 패키지 | pnpm | — | 빠른 설치 |

---

## 4. 환경 변수 (.env.local)

```bash
# Anthropic (서버사이드 전용 — NEXT_PUBLIC_ 붙이지 말 것)
ANTHROPIC_API_KEY=sk-ant-api03-...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://[project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # 서버사이드 전용

# Google OAuth (서버 전용 — Gmail 연동, 직원 개인계정 로그인)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/google/callback
GOOGLE_TOKEN_ENC_KEY=...           # AES-256-GCM 토큰 암호화 키 (서버 전용)

# 워크스페이스 게이트 (사내 공용 진입 비밀번호 — 서버 전용, NEXT_PUBLIC_ 금지)
WORKSPACE_PASSWORD=...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=이큐리아 워크스페이스
```

---

## 5. 프로젝트 파일 구조 (전체)

> ⚠️ 이 트리는 대표 구조다(전수 아님). 실제 파일은 `find src -type f`로 확인하고, 트리 변경 시 이 절을 갱신한다.

```
equria-workspace/
├── CLAUDE.md  PLAN.md  HANDOFF.md      ← 매니페스트 · 기획 · 세션 인수인계
├── .env.local  .env.example
├── next.config.ts  tsconfig.json  package.json
├── .claude/skills/                     ← safe-changes · latest-stack · known-issues
├── supabase/
│   ├── migrations/                     ← 001_initial_schema … 061 (64개 파일, DB SSOT)
│   └── seed.sql                        ← 기본 에이전트 8개 시드
│
└── src/
    ├── app/
    │   ├── layout.tsx                  ← 루트(폰트·메타·ThemeProvider)
    │   ├── page.tsx                    ← / → 리다이렉트
    │   ├── (auth)/                     ← login · signup · 워크스페이스 게이트
    │   ├── (app)/                      ← 로그인 필요 (layout = Sidebar+Header+UndoProvider+AgentChatProvider)
    │   │   ├── dashboard  agents  calendar  workflows  settings  mypage
    │   │   └── chat  files  finance  cards  mail  mcp  projects   ← 세션4 섹션
    │   └── api/                        ← 서버 라우트
    │       ├── agents/[id]/chat        ← Claude 스트리밍 프록시 (streamText)
    │       ├── agents/generate-prompt  ← 에이전트 시스템프롬프트 생성
    │       ├── assistant + assistant/conversations[/[id]]  ← 대시보드 어시스턴트
    │       ├── workflows/[id]/run      ← 워크플로우 순차 실행(NDJSON)
    │       ├── cards/ocr  finance/ocr  finance/tax-invoice
    │       ├── google/{connect,callback,disconnect,gmail/*}   ← OAuth + Gmail BFF
    │       └── mcp/servers[/[id][/test]]                      ← MCP 서버 CRUD/테스트
    │
    ├── components/
    │   ├── ui/                         ← shadcn/ui (수정 금지)
    │   ├── layout/  shared/  theme/  undo/  agent-chat/
    │   ├── agents/  calendar/  workflows/  chat/  dashboard/
    │   └── files/ finance/ cards/ mail/ mcp/ projects/ settings/ mypage/
    │
    ├── lib/
    │   ├── supabase/                   ← client · server · admin · types · mustOk
    │   ├── claude/                     ← client(@ai-sdk/anthropic) · schemas
    │   ├── google/                     ← oauth · client · gmail · crypto(AES-256-GCM)
    │   ├── config/features.ts          ← 섹션/기능 SSOT
    │   ├── agents.ts  agentBuilder.ts  ← 에이전트 프리셋·빌더 위저드
    │   ├── workflows.ts  workflowTools.ts  mcp.ts  mcp/connect.ts
    │   ├── finance.ts  projects.ts  calendar.ts  files.ts  figma.ts
    │   └── upload.ts  csv.ts  auth.ts  utils.ts
    │
    ├── hooks/                          ← usePresence 등 (채팅은 useChat 직접 사용)
    └── types/index.ts                  ← 공통 타입 (Tables<> 파생)
```

---

## 6. DB 스키마 요약 (약 39개 테이블 · 마이그 001~066)

| 영역 | 테이블 |
|------|--------|
| 직원/인증 | `profiles` |
| 에이전트 | `agents` · `agent_versions` · `user_agent_pins` · `agent_usage` |
| 에이전트 대화 | `conversations` · `messages` |
| 어시스턴트(대시보드) | `assistant_conversations` · `assistant_messages` |
| 팀 채팅(DM) | `direct_conversations` · `direct_messages` · `message_attachments` · `message_reactions` |
| 워크플로우 | `workflows` · `workflow_runs` |
| 캘린더 | `calendar_events` |
| MCP | `mcp_servers` · `mcp_tools` |
| 파일/문서 | `files` · `business_cards` · `tax_invoices` |
| 재무 | `finance_entries` |
| 프로젝트 | `projects` · `project_members` |
| 알림 | `notifications` |
| 구글 연동 | `google_connections` |

> 전체 SQL: `supabase/migrations/` (001~066, 69파일). 원격 적용·drift 없음. **세부 진행상황·최신 변경은 HANDOFF.md가 SSOT.**
> 기본 에이전트 8개 시드: `supabase/seed.sql` 참고

---

## 7. API 라우트 설계

### Claude API 프록시 패턴 (핵심 — Vercel AI SDK)
```
POST /api/agents/[id]/chat
Body: { messages: UIMessage[], conversationId?: string }   ← useChat가 전송

서버에서:
1. 인증 확인 (supabase.auth.getUser)
2. agent_id로 agent_versions (is_current = true) 조회 → system_prompt, model, max_tokens, temperature
3. conversationId 없으면 conversations insert로 새 세션 생성
4. 토큰 절약: messages 최근 10개만 모델에 전달 (슬라이딩 윈도우)
5. streamText({ model: anthropic(model), system, messages, maxTokens, temperature })
6. result.toUIMessageStreamResponse() 반환  (useChat가 파싱) ※ AI SDK v6
7. onFinish 콜백에서 messages + agent_usage 테이블에 저장
주의: export const maxDuration = 60 / export const runtime = 'nodejs' 선언 필수
```

### 에이전트 CRUD
```
GET  /api/agents          → agents 목록 (current version 포함)
POST /api/agents          → 에이전트 생성 + 첫 버전 생성
GET  /api/agents/[id]     → 단일 에이전트
PUT  /api/agents/[id]     → 에이전트 업데이트 + 새 버전 생성
DEL  /api/agents/[id]     → is_active = false (소프트 삭제)
```

---

## 8. 기본 에이전트 8개

| # | 이름 | 아이콘 | 카테고리 | 모델 | 핵심 기능 |
|---|------|--------|----------|------|-----------|
| 1 | 세금계산서 에이전트 | 📄 | tax | sonnet-4-6 | 세금계산서 작성·검토·발행 가이드 |
| 2 | CS 응대 에이전트 | 💬 | cs | sonnet-4-6 | 고객 문의 응답 초안 작성 |
| 3 | Higgsfield 프롬프트 | 🎬 | content | sonnet-4-6 | 이미지/영상 AI 프롬프트 생성 |
| 4 | SNS 콘텐츠 에이전트 | 📱 | content | sonnet-4-6 | 인스타그램·유튜브 콘텐츠 작성 |
| 5 | 번역 에이전트 | 🌐 | translation | sonnet-4-6 | KO↔EN↔ZH↔JA 뷰티 전문 번역 |
| 6 | 문서 작성 에이전트 | 📝 | document | sonnet-4-6 | 기획서·보고서·이메일 작성 |
| 7 | 데이터 분석 에이전트 | 📊 | analytics | sonnet-4-6 | 판매·마케팅 데이터 인사이트 |
| 8 | 법무 검토 에이전트 | ⚖️ | legal | **opus-4-7** | 계약서·약관 리스크 포인트 식별 |

---

## 9. 개발 Phase (6단계)

```
Phase 1 [기반] — Next.js 설정, Supabase 연결, Auth, 기본 레이아웃
Phase 2 [에이전트 허브] — 에이전트 목록, 채팅 UI, Claude API 연동, 대화 저장
Phase 3 [에이전트 빌더] — 에이전트 생성/수정 폼, 버전 관리
Phase 4 [캘린더] — 팀 일정 관리
Phase 5 [MCP 연결] — Google Workspace, Supabase MCP
Phase 6 [워크플로우] — 에이전트 체이닝, 자동화
```

> 각 Phase 상세: `PLAN.md` 참고

---

## 10. 공통 실수 방지 체크리스트

코딩 시작 전 항상 확인:
- [ ] `ANTHROPIC_API_KEY`가 서버 코드에서만 쓰이는가?
- [ ] Supabase 쿼리에 `.from('테이블')` 후 적절한 RLS 정책이 있는가?
- [ ] `createServerClient`는 서버 컴포넌트/API route에서만, `createBrowserClient`는 클라이언트 컴포넌트에서만
- [ ] 스트리밍 응답은 `streamText` + `toUIMessageStreamResponse()` 사용 (클라이언트는 `@ai-sdk/react`의 `useChat`) — 상세는 latest-stack.md
- [ ] 에이전트 채팅 API에서 agent_versions의 `is_current = true` 필터 적용
- [ ] 새 에이전트 버전 생성 시 이전 버전 `is_current = false` 업데이트 (트리거가 자동 처리)
- [ ] 모델 호출에 `max_tokens`, `temperature`를 agent_versions 값으로 전달했는가?

---

## 11. 개발 시작 커맨드

```bash
# 1. 프로젝트 생성
pnpm create next-app@latest equria-workspace --typescript --tailwind --app

# 2. 의존성 설치
cd equria-workspace
pnpm add @supabase/supabase-js @supabase/ssr
pnpm add @anthropic-ai/sdk
pnpm add ai @ai-sdk/anthropic   # Vercel AI SDK + Anthropic provider
pnpm add @fullcalendar/react @fullcalendar/daygrid @fullcalendar/interaction

# 3. shadcn/ui 초기화
pnpm dlx shadcn@latest init

# 4. 필수 shadcn 컴포넌트 추가
pnpm dlx shadcn@latest add button card input textarea select dialog badge avatar

# 5. Supabase CLI로 마이그레이션 적용
supabase db push   # 또는 대시보드 SQL Editor에 001_initial_schema.sql + seed.sql 붙여넣기

# 6. Supabase 타입 생성 (원격 프로젝트 기준 — 로컬 스택 없음)
npx supabase gen types typescript --project-id <PROJECT_ID> > src/lib/supabase/types.ts
#  ※ supabase link가 되어 있으면 --linked 사용 가능

# 7. 개발 서버 실행
pnpm dev
```
