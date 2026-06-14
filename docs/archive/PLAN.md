# EQURIA Workspace — 마스터 기획서 (비전 & 설계)

> 원본 v2.1(2026-05-26)에서 **중복·낡은 내용 제거**: 에이전트 프롬프트 전문 → `supabase/seed.sql`, AI SDK 예제코드 → `.claude/skills/latest-stack.md`.
> **이 문서 = 왜/무엇을(비전·구조·로드맵·비용).** 현재 진행상태는 `HANDOFF.md`, 작업 규칙·스택은 `CLAUDE.md`.

---

## 1. 왜 직접 만드는가 (Build vs Buy)

외부 SaaS 구독 대신 직접 구축:
- 범용 SaaS(Notion AI·Monday 등)는 이큐리아 업무에 맞춤화 불가 + **데이터가 외부 벤더 서버**(보안 리스크).
- 직접 구축 시 Anthropic API 월 $50~200 수준 → 구독료 대비 절감 + 100% 커스터마이징 + **데이터 소유권**(전부 이큐리아 Supabase).
- 업계 선례: 연 $60~70k SaaS를 수 주 만에 자체 대체(Blinkist 등). Retool 2026 — 35% 기업이 SaaS 1개+ 자체 대체 중.

**핵심 원칙:** Phase-first(작동하는 것부터) · 데이터 소유권 · **안전한 변경**(`safe-changes.md` — 추가는 자유/파괴는 검증 후/되돌림·재현 가능).

---

## 2. 시스템 구조

```
┌─────────────────────────────────────────────────────────────┐
│                  이큐리아 워크스페이스 (Next.js 16 App Router)  │
├──────────────┬──────────────┬──────────────┬────────────────┤
│  대시보드     │  에이전트 허브  │  팀 캘린더    │  워크플로우     │
│  (홈)        │  (우하단 위젯)  │  (일정 공유)  │  (자동화·예정)  │
└──────┬───────┴──────┬───────┴──────────────┴────────────────┘
       ▼              ▼
┌─────────────┐  ┌───────────────────────────────────────────┐
│  Supabase   │  │      Anthropic Claude API (서버 전용)        │
│ Auth·DB·    │  │  sonnet-4-6(기본) / opus-4-7(복잡)          │
│ Storage·    │  └───────────────────────────────────────────┘
│ Realtime    │              ▼
└─────────────┘   MCP/커넥터(예정): Google Workspace·Supabase·Higgsfield
```

자체 기능(SaaS 대체): 채팅/DM · 재무(영수증 OCR) · 명함(OCR) · 프로젝트 · 전역 ⌘Z Undo · 휴지통(soft-delete).

---

## 3. DB 스키마 (개념 — SSOT는 마이그레이션 파일)

> 스키마 본문 = `supabase/migrations/`(001~014, **단일 진실 소스**). 테이블 목록은 `CLAUDE.md §6`. 아래는 핵심 관계만.

```
profiles (auth.users 1:1)
  └─ agents ─ agent_versions(버전관리)
       └─ conversations ─ messages
calendar_events · workflows · mcp_servers · agent_usage(로그) · direct_*(DM) · finance_*·business_cards·projects(자체기능)
```

설계 포인트:
- 새 agent_version insert → 트리거 `handle_new_agent_version`가 이전 `is_current`를 자동 false.
- 신규 가입 → 트리거 `handle_new_user`가 `profiles` 자동 생성(security definer).
- 전 테이블 RLS. service_role(서버)만 우회, anon(클라)은 정책 적용. 데이터 삭제 = 휴지통(`deleted_at`).

---

## 4. 기본 에이전트 8개

> 로스터(이름·아이콘·카테고리·모델)는 `CLAUDE.md §8`, **systemPrompt 전문은 `supabase/seed.sql`이 SSOT.**
> 세금계산서·CS·Higgsfield프롬프트·SNS·번역·문서작성·데이터분석(이상 sonnet-4-6) + 법무검토(opus-4-7).
> 직원 커스텀 에이전트는 **빌더(`/agents`)로 생성·관리** + 위젯 핀으로 노출 선택 (Phase 3a 완료).

---

## 5. Claude API 패턴 (코드 = latest-stack.md)

> 실제 구현은 **AI SDK v6** — 검증된 패턴은 `.claude/skills/latest-stack.md` 필독. (원본의 v4 예제코드는 제거함)

원칙:
- 스트리밍 = **Vercel AI SDK 통일**(서버 `streamText` / 클라 `useChat`). 자작 SSE 파서 금지.
- 채팅 라우트 흐름: 인증 → `agent_versions(is_current)` 조회(system/model/max_tokens/temperature) → conversation 없으면 생성 → **최근 10개 슬라이딩 윈도우** → `streamText` → `toUIMessageStreamResponse()` → `onFinish`에서 `messages` + `agent_usage` 저장.
- `export const maxDuration = 60` / `runtime = 'nodejs'` 필수. **`ANTHROPIC_API_KEY` 서버 전용**(클라 노출 금지).

---

## 6. MCP / 커넥터 (Phase 3b+ — 설계만)

- 계획: Google Workspace · Supabase · **Higgsfield**(첫 파일럿, "호출→바로 제작") · Figma 등을 **커넥터 카탈로그**로 큐레이션.
- 스키마 자리 확보됨: `agent_versions.tools`(jsonb) / `agent_versions.mcp_servers`(text[]) + `mcp_servers` 테이블 → 3b는 **스키마 변경 0**으로 도구 추가 가능.
- 결정: 직원 자유 Supabase 조회는 위험 → **제외**. 커넥터는 큐레이션 카탈로그로만.

---

## 7. 개발 로드맵 (현황)

| Phase | 내용 | 상태 |
|-------|------|------|
| 1 기반 | Next.js·Supabase·Auth·레이아웃 | ✅ |
| 2 에이전트 허브 | 목록·채팅(streamText)·대화저장(우하단 위젯) | ✅ |
| 3a 빌더 | 커스텀 에이전트 생성/수정·버전 이력·위젯 핀(`014`) | ✅ |
| 3b 커넥터 | 도구/MCP 카탈로그(Higgsfield 먼저) | ⬜ 다음 |
| 4 캘린더 | 팀 일정(기간 드래그·멀티데이 연속막대) | ✅ |
| 5 MCP 연결 | 서버 연동·설정 UI | ⬜ |
| 6 워크플로우 | 에이전트 체이닝·자동화 | ⬜ |
| + 자체기능 | DM·재무(OCR)·명함·프로젝트·전역 Undo·휴지통 | ✅ |

> 상세 현재상태·다음 우선순위·미검증 항목은 **`HANDOFF.md`**.

---

## 8. 비용 (월 추정)

- **Anthropic**: 5명·일 50회 ≈ 2.25M tokens/월 → Sonnet 기준 **$15~30**. (법무 등 Opus 사용분 별도 고비용)
- **Supabase**: Free(500MB DB·1GB Storage) → 필요 시 Pro $25/월. **Vercel**: Hobby 무료 → Pro $20/월.
- **총 $15~75/월(약 2~10만원)** — 사용량·모델에 따라 변동. (외부 SaaS 월 수백만 원 대비 큰 절감)

---

> 📂 참조 분담: 에이전트 프롬프트 = `seed.sql` · SDK 패턴 = `latest-stack.md` · **현재상태 = `HANDOFF.md`** · 규칙·스택 = `CLAUDE.md`.
