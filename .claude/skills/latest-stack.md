---
name: latest-stack
description: EQURIA Workspace의 설치된 최신 스택(AI SDK v6, Next 16, React 19, Supabase SSR)으로 코드를 작성하기 위한 검증된 패턴. AI 채팅/스트리밍/Supabase 코드를 쓰기 전 반드시 참고.
---

# Latest Stack Reference (검증된 최신 패턴)

> 이 파일은 **실제 설치된 패키지에서 검증한** API만 담는다. PLAN.md §5의 옛 코드(v3/v4)보다 **이 파일이 우선**한다.
> 라이브러리 API가 불확실하면: **context7 MCP**(resolve-library-id → get-library-docs) 또는 내장 **claude-api 스킬**을 사용해 최신 문서를 확인할 것.

## 설치된 버전 (2026-05 기준, package.json 확인)
- next **16.x** / react **19.x** / tailwindcss **v4** (config-less, `@import "tailwindcss"`)
- ai **v6** / @ai-sdk/react **v3** / @ai-sdk/anthropic **v3**
- @supabase/ssr **0.10** / @supabase/supabase-js **2.x**
- @anthropic-ai/sdk **0.98+**

## Claude 모델
- 기본 `claude-sonnet-4-6` / 복잡 작업 `claude-opus-4-7`. (옛 4-5 금지)

## ⚠️ AI SDK v6 — 옛 패턴 → 현재 패턴 (절대 혼동 금지)
| 옛(v3/v4) ❌ | 현재(v6) ✅ |
|---|---|
| `import { useChat } from 'ai/react'` | `import { useChat } from '@ai-sdk/react'` |
| `CoreMessage` | `ModelMessage` (서버) / `UIMessage` (클라이언트·전송) |
| `result.toDataStreamResponse()` | `result.toUIMessageStreamResponse()` |
| `maxTokens` | `maxOutputTokens` |
| `usage.promptTokens` / `completionTokens` | `usage.inputTokens` / `usage.outputTokens` |
| 훅의 `input/handleInputChange/handleSubmit` | `sendMessage()` + `messages[].parts` |
| messages 그대로 streamText 전달 | `convertToModelMessages(messages)` 로 변환 |

## 서버 라우트 패턴 (verified)
```typescript
// src/app/api/agents/[id]/chat/route.ts
import { streamText, convertToModelMessages, type UIMessage } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'

export const maxDuration = 60          // Vercel 스트리밍 타임아웃
export const runtime = 'nodejs'

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const HISTORY_WINDOW = 10

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { messages, conversationId } = await req.json() as {
    messages: UIMessage[]; conversationId?: string
  }
  // ... 인증 + agent_versions(is_current) 조회 + conversation 생성 ...

  const result = streamText({
    model: anthropic(agentVersion.model),          // 'claude-sonnet-4-6' 등
    system: agentVersion.system_prompt,
    messages: convertToModelMessages(messages.slice(-HISTORY_WINDOW)),
    maxOutputTokens: agentVersion.max_tokens,       // ✅ maxOutputTokens
    temperature: Number(agentVersion.temperature),
    async onFinish({ text, usage }) {
      // ✅ usage.inputTokens / usage.outputTokens 로 messages + agent_usage 저장
    },
  })

  return result.toUIMessageStreamResponse({         // ✅ UIMessage 스트림
    headers: { 'X-Conversation-Id': activeConversationId ?? '' },
  })
}
```

## 클라이언트 패턴 (verified)
```typescript
'use client'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useState } from 'react'

export function AgentChat({ agentId }: { agentId: string }) {
  const [input, setInput] = useState('')
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: `/api/agents/${agentId}/chat` }),
  })

  return (
    <>
      {messages.map((m) => (
        <div key={m.id} data-role={m.role}>
          {m.parts.map((p, i) => (p.type === 'text' ? <span key={i}>{p.text}</span> : null))}
        </div>
      ))}
      <form onSubmit={(e) => { e.preventDefault(); sendMessage({ text: input }); setInput('') }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} disabled={status !== 'ready'} />
      </form>
    </>
  )
}
```
> v6 메시지는 `content` 문자열이 아니라 `parts[]` 구조다. 렌더링은 `m.parts`를 순회한다.

## Supabase (@supabase/ssr 0.10) 패턴
- 서버: `createServerClient(url, anonKey, { cookies: { getAll, setAll } })` — `next/headers`의 cookies 사용.
- 브라우저: `createBrowserClient(url, anonKey)`.
- 미들웨어에서 세션 갱신: `supabase.auth.getUser()` 호출 + 쿠키 재설정.
- 옛 `createServerComponentClient`/`createMiddlewareClient`(auth-helpers) ❌ — deprecated.

## 작업 규칙
1. AI 채팅/스트리밍 코드 작성·수정 전 이 파일을 먼저 확인한다.
2. 표에 없는 API가 필요하면 context7로 해당 라이브러리 최신 문서를 조회 후 작성한다.
3. Claude API(Anthropic SDK) 관련은 내장 `claude-api` 스킬을 활용한다.
