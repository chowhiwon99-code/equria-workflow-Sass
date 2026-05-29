# EQURIA Workspace 시스템 — 마스터 기획서 v2.1

> Claude Code plan mode용 상세 기획 문서
> 작성일: 2026-05-26 (v2.1 교정: 브랜드명 EQURIA 통일, 모델 최신화, 스트리밍 AI SDK 통일)
> 최종 목표: 이큐리아 직원들이 매일 실제로 쓰는 내부 AI 워크스페이스 구축

---

## 목차

1. [전략적 배경 — 왜 만드는가](#1-전략적-배경)
2. [시스템 전체 구조](#2-시스템-전체-구조)
3. [Supabase DB 스키마 (완전판)](#3-db-스키마)
4. [에이전트 상세 설계 (8개)](#4-에이전트-상세-설계)
5. [Claude API 연동 패턴](#5-claude-api-연동)
6. [MCP 연결 설계](#6-mcp-연결)
7. [Phase별 개발 계획](#7-개발-phase)
8. [예상 이슈 & 해결책](#8-예상-이슈)
9. [비용 분석](#9-비용-분석)

> **브랜드 표기 규칙:** 영문 **EQURIA**, 한글 **이큐리아**로 통일.

---

## 1. 전략적 배경

### 왜 직접 만드는가 (Build vs Buy 근거)

외부 사례들이 이미 증명함:

| 기업/사례 | 기존 SaaS 비용 | 직접 구축 결과 |
|-----------|--------------|--------------|
| 스타트업 A (Cody Schneider 사례) | 연 $70,000 (→$170,000 인상 시도) | 3주 스프린트로 100% 대체 |
| Blinkist | 연 $60,000 | 며칠 만에 내부 툴 구축 |
| 업계 평균 (Retool 2026) | — | 35% 기업이 이미 SaaS 1개 이상 자체 대체 |

**이큐리아의 경우:**
- 범용 SaaS(Notion AI, Monday 등) → 이큐리아 업무에 맞춤화 불가
- 데이터가 외부 벤더 서버에 저장 (보안 리스크)
- 직접 구축 시 Anthropic API 비용 월 $50~200 수준

### 핵심 원칙
- **Phase-first 개발**: 작동하는 것부터 → 완성도 후기에 올리기
- **실수 최소화**: Claude Code가 이 문서를 먼저 읽고 코딩
- **데이터 소유권**: 모든 대화·업무 데이터는 Supabase(이큐리아 소유)에 저장

---

## 2. 시스템 전체 구조

```
┌─────────────────────────────────────────────────────────────┐
│                    이큐리아 워크스페이스                        │
│                    (Next.js 14 App Router)                   │
├──────────────┬──────────────┬──────────────┬────────────────┤
│  대시보드     │  에이전트 허브  │  팀 캘린더    │  워크플로우     │
│  (홈)        │  (AI 채팅)    │  (일정 공유)  │  (자동화)      │
└──────┬───────┴──────┬───────┴──────────────┴────────────────┘
       │              │
       ▼              ▼
┌─────────────┐  ┌───────────────────────────────────────────┐
│  Supabase   │  │           Anthropic Claude API             │
│  - Auth     │  │           (서버사이드 전용)                  │
│  - DB       │  │  claude-sonnet-4-6 (기본)                  │
│  - Storage  │  │  claude-opus-4-7 (복잡한 작업용)            │
│  - Realtime │  └───────────────────────────────────────────┘
└─────────────┘              │
                             ▼
                  ┌─────────────────────┐
                  │    MCP 서버들         │
                  │  - Google Workspace  │
                  │  - Supabase MCP      │
                  │  - Higgsfield API    │
                  │  - Custom Tools      │
                  └─────────────────────┘
```

### 인증 플로우
```
사용자 접속
    ↓
Supabase Auth (이메일/비밀번호)
    ↓
profiles 테이블에서 역할 확인 (admin/member)
    ↓
(app) 레이아웃 → 로그인 확인 → 리다이렉트 처리
```

---

## 3. DB 스키마

> 전체 SQL은 `supabase/migrations/001_initial_schema.sql`, 시드는 `supabase/seed.sql` 참고.
> 아래는 관계도 요약. (스키마 본문은 마이그레이션 파일이 단일 진실 소스(SSOT))

### 3.1 전체 테이블 관계도

```
auth.users (Supabase 내장)
    ↓ (1:1)
profiles ─────────────────┐
    ↓ (1:N)               │
agents ─────────┐         │
    ↓ (1:N)     │         │
agent_versions  │         │
                │         │
conversations ──┘ ────────┘
    ↓ (1:N)
messages

workflows (독립)
calendar_events (독립)
mcp_servers (독립)
agent_usage (로그)
```

### 3.2 핵심 설계 포인트
- `agent_versions.model` 기본값 = `claude-sonnet-4-6`, 법무 등 복잡 작업은 `claude-opus-4-7`.
- 새 버전 insert 시 트리거 `handle_new_agent_version`가 이전 `is_current`를 자동으로 false 처리.
- 신규 가입 시 트리거 `handle_new_user`가 `profiles` 자동 생성 (security definer → RLS 우회, 정상).
- 모든 테이블 RLS 활성화. service_role_key(서버)만 RLS 우회, anon_key(클라이언트)는 정책 적용.
- UUID는 PG13+ 내장 `gen_random_uuid()` 사용 (별도 확장 불필요).

---

## 4. 에이전트 상세 설계

> 모든 에이전트의 실제 systemPrompt 본문은 `supabase/seed.sql`의 `agent_versions` 시드와 동일하게 유지.

### Agent 1: 세금계산서 에이전트

```typescript
// src/lib/claude/agents/tax-invoice.ts
export const taxInvoiceAgent = {
  name: '세금계산서 에이전트',
  icon: '📄',
  category: 'tax',
  description: '세금계산서 작성, 검토, 발행 관련 모든 업무를 도와드립니다',
  systemPrompt: `당신은 이큐리아의 세금계산서 업무 전문 AI 어시스턴트입니다.

담당 업무:
- 세금계산서 작성 가이드 및 초안 작성
- 금액 계산 (공급가액, 부가세 10%, 합계 자동 계산)
- 전자세금계산서 발행 절차 안내
- 세금계산서 오류 검토 및 수정 가이드
- 매출/매입 세금계산서 관리 방법 안내

응답 형식:
- 금액 표시 시 원화(₩) 기호와 천 단위 콤마 사용
- 세금계산서 필수 기재사항 누락 시 반드시 알림
- 법적 리스크가 있는 경우 명확히 경고

주의: 최종 발행 전 반드시 담당 세무사 또는 경리팀 확인을 권고합니다.`,
  model: 'claude-sonnet-4-6',
  maxTokens: 4096,
}
```

### Agent 2: CS 응대 에이전트

```typescript
export const customerServiceAgent = {
  name: 'CS 응대 에이전트',
  icon: '💬',
  category: 'cs',
  description: '고객 문의, 불만, 문의 응대 초안을 작성해드립니다',
  systemPrompt: `당신은 이큐리아(EQURIA) K-뷰티 브랜드의 CS 응대 전문 AI입니다.

이큐리아 브랜드 정체성:
- 고급 K-뷰티 브랜드 — 프리미엄 스킨케어/뷰티 제품
- 고객 응대 톤: 따뜻하고 전문적, 친근하지만 격식 있게
- 주요 고객층: 20-40대 뷰티 관심 여성

응대 유형별 처리:
1. 제품 문의 → 성분, 효능, 사용법 안내
2. 배송 문의 → 정확한 상태 확인 후 안내 (모르면 "확인 후 연락" 명시)
3. 불만/반품 → 사과 + 해결방안 제시 + 재발 방지 약속
4. 교환/환불 → 정책 안내 + 절차 설명

출력 형식:
- 항상 인사로 시작
- 핵심 내용 → 해결방안 → 추가 문의 안내 순서
- 초안 제공 후 "수정이 필요한 부분이 있으신가요?" 확인`,
  model: 'claude-sonnet-4-6',
  maxTokens: 2048,
}
```

### Agent 3: Higgsfield 프롬프트 에이전트

```typescript
export const higgsfieldPromptAgent = {
  name: 'Higgsfield 프롬프트 에이전트',
  icon: '🎬',
  category: 'content',
  description: 'Higgsfield AI 이미지/영상 생성을 위한 최적화된 프롬프트를 작성합니다',
  systemPrompt: `당신은 Higgsfield AI 플랫폼 전문 프롬프트 엔지니어입니다.
이큐리아(EQURIA) K-뷰티 브랜드의 제품 이미지와 영상 콘텐츠 제작을 지원합니다.

프롬프트 구성 요소 (항상 이 순서로):
1. Subject: 메인 피사체 (제품명, 외관, 색상)
2. Setting: 배경/환경 (장소, 조명, 분위기)
3. Style: 촬영 스타일 (시네마틱, 미니멀, K-뷰티 에디토리얼 등)
4. Camera: 카메라 앵글/무브먼트 (클로즈업, 드리프트, 버즈아이 등)
5. Mood: 감성/색조 (럭셔리, 클린, 내추럴 등)
6. Technical: 기술 사양 (4K, 슬로모션, 황금빛 조명 등)

이큐리아 브랜드 무드:
- 청정하고 프리미엄한 K-뷰티 미학
- 피부 질감이 살아있는 클로즈업
- 파스텔 계열 + 크림/베이지/민트 팔레트
- 자연광 또는 소프트 스튜디오 조명

출력: 영문 프롬프트 + 한국어 설명`,
  model: 'claude-sonnet-4-6',
  maxTokens: 2048,
}
```

### Agent 4: SNS 콘텐츠 에이전트

```typescript
export const snsContentAgent = {
  name: 'SNS 콘텐츠 에이전트',
  icon: '📱',
  category: 'content',
  description: '인스타그램, 유튜브, 틱톡 등 SNS 채널별 최적화 콘텐츠를 작성합니다',
  systemPrompt: `당신은 이큐리아(EQURIA) K-뷰티 브랜드의 SNS 콘텐츠 전략가입니다.

채널별 특성:
- 인스타그램: 감각적 비주얼 중심, 해시태그 15-20개, CTA 포함
- 유튜브: 썸네일 제목 + 본문 설명 + 타임스탬프 구성
- 틱톡: 훅(첫 3초) + 간결한 스크립트 + 트렌드 반영
- 네이버 블로그: SEO 최적화 + 상세 정보 중심

이큐리아 브랜드 보이스:
- 자신감 있고 세련된 K-뷰티 전문가 톤
- 과장/허위 표현 금지 (화장품법 준수)
- 성분 효능 언급 시 식약처 허용 범위 내

출력 형식: 플랫폼 선택 → 캡션 초안 → 해시태그 → 수정 제안`,
  model: 'claude-sonnet-4-6',
  maxTokens: 2048,
}
```

### Agent 5: 번역 에이전트

```typescript
export const translationAgent = {
  name: '번역 에이전트',
  icon: '🌐',
  category: 'translation',
  description: '뷰티/코스메틱 전문 용어를 살린 한/영/중/일 번역',
  systemPrompt: `당신은 K-뷰티 뷰티 산업 전문 번역가입니다.

지원 언어: 한국어 ↔ 영어 ↔ 중국어(간체) ↔ 일본어

번역 원칙:
1. 브랜드명 "EQURIA" / "이큐리아"는 번역하지 않고 그대로 유지
2. 성분명은 INCI 명칭 기준 (예: 히알루론산 → Hyaluronic Acid)
3. 마케팅 문구는 현지 감성에 맞게 의역
4. 법적 효능 표현은 각국 화장품법 기준 준수

번역 요청 형식:
- 원문 → 대상 언어 명시
- 번역 목적(라벨, 광고, SNS, 이메일) 알려주면 더 정확한 번역 가능

출력: 번역문 + 주요 용어 대조표 + 현지화 참고사항`,
  model: 'claude-sonnet-4-6',
  maxTokens: 4096,
}
```

### Agent 6: 문서 작성 에이전트

```typescript
export const documentWritingAgent = {
  name: '문서 작성 에이전트',
  icon: '📝',
  category: 'document',
  description: '기획서, 보고서, 이메일, 제안서 등 업무 문서를 작성합니다',
  systemPrompt: `당신은 이큐리아의 비즈니스 문서 작성 전문 AI입니다.

지원 문서 유형:
- 사업 기획서 / 제안서
- 월간·분기 보고서
- 파트너사 제안 이메일
- 사내 공지 및 안내문
- 미팅 의제 / 회의록
- 계약 협의 초안

문서 작성 원칙:
1. 목적 → 배경 → 내용 → 결론 순서 구성
2. 읽는 대상(내부/외부, 직급) 고려한 톤 조절
3. 데이터/근거 제시 위치 표시 (직접 숫자는 제공 불가)
4. 한국어 문서는 존댓말 기본

요청 시 포함 정보:
- 문서 종류, 목적, 읽는 대상, 핵심 메시지`,
  model: 'claude-sonnet-4-6',
  maxTokens: 8192,
}
```

### Agent 7: 데이터 분석 에이전트

```typescript
export const dataAnalyticsAgent = {
  name: '데이터 분석 에이전트',
  icon: '📊',
  category: 'analytics',
  description: '판매, 마케팅, 재고 데이터를 분석하여 인사이트를 도출합니다',
  systemPrompt: `당신은 이큐리아의 데이터 분석 전문 AI입니다.

분석 가능 영역:
- 판매 데이터 트렌드 분석
- 마케팅 채널별 성과 비교
- 재고 현황 및 발주 타이밍 제안
- 고객 데이터 패턴 분석
- 경쟁사 공개 데이터 비교 분석

분석 방법:
1. 데이터를 텍스트/CSV 형태로 붙여넣기 → 분석 실행
2. 핵심 지표 요약 (평균, 증감율, 상위/하위 항목)
3. 인사이트 도출 (원인 가설 + 권장 행동)
4. 추가 분석이 필요한 데이터 포인트 제안

출력 형식: 요약 → 주요 발견 → 인사이트 → 권장 액션 순서`,
  model: 'claude-sonnet-4-6',
  maxTokens: 8192,
}
```

### Agent 8: 법무 검토 에이전트

```typescript
export const legalReviewAgent = {
  name: '법무 검토 에이전트',
  icon: '⚖️',
  category: 'legal',
  description: '계약서, 약관, 고지 사항의 리스크 포인트를 식별합니다',
  systemPrompt: `당신은 이큐리아의 법무 검토 지원 AI입니다.

⚠️ 중요 면책 고지:
이 에이전트의 검토 결과는 참고용이며, 법적 구속력이 없습니다.
중요 계약 체결 전 반드시 변호사 또는 법무 전문가의 확인을 받으세요.

검토 가능 영역:
- 공급·구매 계약서 주요 조항 분석
- 화장품 마케팅 광고 법규 준수 확인 (화장품법, 표시광고법)
- 개인정보처리방침 체크리스트
- NDA(비밀유지계약) 핵심 조항 확인
- 플랫폼 입점 약관 주요 리스크 포인트

검토 출력 형식:
🔴 고위험 조항 → 즉시 검토 필요
🟡 주의 조항 → 협의 필요
🟢 표준 조항 → 일반적 수준`,
  model: 'claude-opus-4-7',  // 복잡한 법무 검토는 Opus 사용
  maxTokens: 8192,
}
```

---

## 5. Claude API 연동 (Vercel AI SDK)

> ⚠️ **이 절의 코드는 AI SDK v4 기준의 개념 설명용이다. 실제 설치본은 v6이며 API가 다르다.**
> **구현 시 반드시 `.claude/skills/latest-stack.md`의 검증된 v6 패턴을 따른다**
> (`toUIMessageStreamResponse` / `convertToModelMessages` / `maxOutputTokens` / `@ai-sdk/react`의 `useChat` + `sendMessage`).
>
> 스트리밍은 **Vercel AI SDK로 통일**한다. 서버는 `streamText` + 스트림 응답,
> 클라이언트는 `useChat` 훅을 직접 사용한다. (자작 SSE 파서 사용 금지)

### 5.1 Anthropic Provider 초기화

```typescript
// src/lib/claude/client.ts
import { createAnthropic } from '@ai-sdk/anthropic'

export const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,  // 서버 전용
})
```

### 5.2 Claude API 채팅 Route (핵심)

```typescript
// src/app/api/agents/[id]/chat/route.ts
import { streamText, type CoreMessage } from 'ai'
import { anthropic } from '@/lib/claude/client'
import { createServerClient } from '@/lib/supabase/server'

// Vercel 함수 타임아웃 (스트리밍 중간 끊김 방지) + Node 런타임
export const maxDuration = 60
export const runtime = 'nodejs'

const HISTORY_WINDOW = 10 // 토큰 절약: 최근 N개 메시지만 모델에 전달

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()

  // 1. 인증 확인
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages, conversationId } = await request.json() as {
    messages: CoreMessage[]
    conversationId?: string
  }

  // 2. 에이전트의 현재 버전 설정 조회
  const { data: agentVersion } = await supabase
    .from('agent_versions')
    .select('system_prompt, model, max_tokens, temperature')
    .eq('agent_id', params.id)
    .eq('is_current', true)
    .single()

  if (!agentVersion) return new Response('Agent not found', { status: 404 })

  // 3. 대화 세션 생성 (없으면) + 제목 자동 설정
  let activeConversationId = conversationId
  if (!activeConversationId) {
    const firstUserMsg = [...messages].reverse()
      .find((m) => m.role === 'user')?.content ?? ''
    const title = String(firstUserMsg).slice(0, 20) || null
    const { data: conv } = await supabase
      .from('conversations')
      .insert({ agent_id: params.id, user_id: user.id, title })
      .select('id')
      .single()
    activeConversationId = conv?.id
  }

  const startTime = Date.now()
  const windowed = messages.slice(-HISTORY_WINDOW) // 슬라이딩 윈도우

  // 4. Claude 스트리밍 호출 (max_tokens + temperature 모두 전달)
  const result = streamText({
    model: anthropic(agentVersion.model),
    system: agentVersion.system_prompt,
    messages: windowed,
    maxTokens: agentVersion.max_tokens,
    temperature: Number(agentVersion.temperature),
    // 5. 완료 후 DB 저장
    async onFinish({ text, usage }) {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')
      await Promise.all([
        supabase.from('messages').insert([
          { conversation_id: activeConversationId, role: 'user', content: String(lastUser?.content ?? '') },
          { conversation_id: activeConversationId, role: 'assistant', content: text, tokens_used: usage.completionTokens, model: agentVersion.model },
        ]),
        supabase.from('agent_usage').insert({
          agent_id: params.id,
          user_id: user.id,
          conversation_id: activeConversationId,
          tokens_input: usage.promptTokens,
          tokens_output: usage.completionTokens,
          duration_ms: Date.now() - startTime,
          success: true,
        }),
      ])
    },
  })

  // 6. useChat가 파싱하는 data stream 응답 + conversationId 헤더 전달
  return result.toDataStreamResponse({
    headers: { 'X-Conversation-Id': activeConversationId ?? '' },
  })
}
```

### 5.3 클라이언트 채팅 (useChat)

```typescript
// src/components/agents/AgentChat.tsx
'use client'
import { useChat } from 'ai/react'
import { useState } from 'react'

export function AgentChat({ agentId }: { agentId: string }) {
  const [conversationId, setConversationId] = useState<string | null>(null)

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: `/api/agents/${agentId}/chat`,
    // conversationId를 매 요청 body에 포함
    body: { conversationId },
    // 응답 헤더에서 새 conversationId 회수
    onResponse(res) {
      const id = res.headers.get('X-Conversation-Id')
      if (id) setConversationId(id)
    },
  })

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id} data-role={m.role}>{m.content}</div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} disabled={isLoading} />
        <button type="submit" disabled={isLoading}>전송</button>
      </form>
    </div>
  )
}
```

> 기존 대화 히스토리는 `useChat({ initialMessages })`로 주입 (conversations + messages 조회).
> ※ AI SDK 메이저 버전에 따라 import 경로(`ai/react`)·옵션명이 다를 수 있으니 빌드 시 설치된 버전 문서 확인.

---

## 6. MCP 연결

### Phase 5에서 구현. 구조만 미리 설계.

```typescript
// src/lib/mcp/config.ts
export const defaultMcpServers = [
  {
    name: 'supabase',
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@supabase/mcp-server-supabase@latest',
           '--supabase-url', process.env.NEXT_PUBLIC_SUPABASE_URL!,
           '--supabase-key', process.env.SUPABASE_SERVICE_ROLE_KEY!],
  },
  {
    name: 'google-workspace',
    type: 'stdio' as const,
    // ※ 패키지명은 빌드 시 npm 레지스트리에서 실재 여부 확인 후 확정할 것
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-google-workspace'],
    envVars: {
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID!,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET!,
    }
  },
]
```

---

## 7. 개발 Phase (Claude Code용 체크리스트)

### ✅ Phase 1: 기반 인프라

```
□ 1-1. Next.js 14 프로젝트 생성 (pnpm + TypeScript + Tailwind + App Router)
□ 1-2. shadcn/ui 초기화 + 필수 컴포넌트 추가
□ 1-3. Supabase 프로젝트 생성 (대시보드에서)
□ 1-4. 001_initial_schema.sql 마이그레이션 실행
□ 1-5. .env.local 설정 (Supabase URL, anon key, service role)
□ 1-6. src/lib/supabase/client.ts + server.ts 작성
□ 1-7. Supabase 타입 생성 (npx supabase gen types --project-id <id>)
□ 1-8. (auth) 그룹 레이아웃 + 로그인 페이지
□ 1-9. (app) 그룹 레이아웃 + Sidebar + Header
□ 1-10. 미들웨어 (middleware.ts) — 인증 리다이렉트
□ 1-11. 대시보드 홈 페이지 (기본 UI만)
✅ 검증: 로그인 → 대시보드 이동 / 로그아웃 → 로그인 리다이렉트
```

### ✅ Phase 2: 에이전트 허브

```
□ 2-1. seed.sql로 8개 기본 에이전트 데이터 삽입
□ 2-2. /agents 페이지 — 에이전트 목록 그리드 UI
□ 2-3. AgentCard 컴포넌트 (아이콘, 이름, 설명, 카테고리 배지)
□ 2-4. ANTHROPIC_API_KEY를 .env.local에 추가
□ 2-5. src/lib/claude/client.ts (Anthropic provider) + /api/agents/[id]/chat/route.ts (streamText)
□ 2-6. /agents/[id] 페이지 — 채팅 UI (AgentChat + useChat)
□ 2-7. 대화 히스토리 로드 (conversations + messages → initialMessages)
□ 2-8. 카테고리 필터 (tax/cs/content 등)
✅ 검증: 세금계산서 에이전트 채팅 → Claude 응답 스트리밍 확인
```

### ✅ Phase 3: 에이전트 빌더

```
□ 3-1. /agents/new 페이지 — 에이전트 생성 폼
□ 3-2. 시스템 프롬프트 에디터 (textarea + 글자수)
□ 3-3. POST /api/agents — 에이전트 생성 API
□ 3-4. agent_versions 자동 생성 (version=1, is_current=true)
□ 3-5. 에이전트 수정 — 새 버전 생성 (트리거가 이전 is_current=false 처리)
□ 3-6. 버전 이력 조회 UI
□ 3-7. 에이전트 테스트 모드 (저장 전 프롬프트 테스트)
✅ 검증: 커스텀 에이전트 생성 → 채팅 → 프롬프트 수정 → 새 버전 확인
```

### ✅ Phase 4: 팀 캘린더

```
□ 4-1. FullCalendar 라이브러리 설치 및 설정
□ 4-2. /calendar 페이지 — 월간/주간 뷰
□ 4-3. 일정 추가 다이얼로그 (제목, 시간, 참석자)
□ 4-4. POST /api/calendar — 일정 생성 API
□ 4-5. 팀원 표시 (profiles에서 목록 조회)
□ 4-6. 일정 색상 구분 (개인/팀)
✅ 검증: 일정 생성 → 팀원 캘린더에 표시 확인
```

### ✅ Phase 5: MCP 연결

```
□ 5-1. mcp_servers 테이블에 기본 서버 설정 추가
□ 5-2. MCP 설정 UI (settings 페이지)
□ 5-3. Supabase MCP 서버 연동 테스트
□ 5-4. 에이전트-MCP 연결 (agent_versions.mcp_servers 배열)
✅ 검증: 에이전트가 Supabase 데이터 조회 가능한지 확인
```

### ✅ Phase 6: 워크플로우

```
□ 6-1. /workflows 페이지 — 워크플로우 목록
□ 6-2. 워크플로우 빌더 UI (드래그앤드롭 에이전트 체이닝)
□ 6-3. 워크플로우 실행 API (에이전트 순차 실행)
□ 6-4. 실행 결과 저장 및 표시
□ 6-5. 워크플로우 스케줄링 (선택)
✅ 검증: 번역 → CS응대 체이닝 워크플로우 실행 확인
```

---

## 8. 예상 이슈 & 해결책

| # | 이슈 | 증상 | 해결책 |
|---|------|------|--------|
| 1 | Supabase auth 세션 만료 | 갑자기 로그인 화면으로 | middleware.ts에서 `supabase.auth.getSession()` + `refreshSession()` |
| 2 | Claude 스트리밍 끊김 | 응답 중간에 멈춤 | Vercel 타임아웃 → 라우트에 `export const maxDuration = 60` |
| 3 | RLS 접근 거부 | 401/403 오류 | service_role_key는 서버만, anon_key는 클라이언트만 |
| 4 | 타입 오류 (Database) | supabase 타입 불일치 | `npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts` (로컬 스택 없으면 --local 사용 불가) |
| 5 | useChat 응답이 안 보임 | 메시지 비어 있음 | 서버가 `toDataStreamResponse()`를 반환하는지 / `ai/react` import 경로 확인 |
| 6 | 에이전트 버전 충돌 | 구버전 프롬프트 사용 | `is_current = true` 필터 항상 적용 (트리거가 이전 버전 false 처리) |
| 7 | CORS 오류 | 외부 API 호출 실패 | Next.js API route 통해서만 외부 API 호출 |
| 8 | 토큰 초과 | 긴 대화 응답 실패 | 라우트에서 `messages.slice(-10)` 슬라이딩 윈도우 적용 |
| 9 | 빌드 오류 (env) | 배포 시 undefined | Vercel에 환경변수 별도 등록 필수 |
| 10 | 대화 제목 없음 | conversations.title = null | 첫 user 메시지 앞 20자 자동으로 title 설정 (라우트 3단계) |

---

## 9. 비용 분석

### Anthropic API 예상 비용 (월간)

> 단가는 예시 추정치이며 실제 청구는 Anthropic 콘솔의 현행 요금을 따른다.

```
Claude Sonnet 4.6 기준 (예시 단가):
- Input:  $3 / 1M tokens
- Output: $15 / 1M tokens

이큐리아 팀 예상 사용량 (5명 기준):
- 하루 50회 에이전트 사용
- 평균 대화 1,000 input + 500 output tokens
- 월 1,500회 × 1,500 tokens = 2.25M tokens

예상 월 비용:
- Input: 1.5M × $3/1M = $4.5
- Output: 0.75M × $15/1M = $11.25
- 합계: 약 $15~30/월 (한화 약 2-4만원)

법무 검토 에이전트 (claude-opus-4-7): 사용 시 별도 고비용 발생 (Opus는 Sonnet 대비 단가 높음)
```

### Supabase 비용
```
Free Tier (충분): 500MB DB, 1GB Storage, 무제한 Auth
Pro Tier (필요 시): $25/월
```

### Vercel 비용
```
Hobby (개발용): 무료
Pro (팀 사용): $20/월
```

**총 예상 월 운영비: $15~75 (약 2-10만원, 사용량/모델에 따라 변동)**

---

> 이 문서는 Claude Code plan mode의 입력 컨텍스트로 사용됩니다.
> 개발 시작 전 Claude Code에 이 파일 전체를 참고시키세요.
