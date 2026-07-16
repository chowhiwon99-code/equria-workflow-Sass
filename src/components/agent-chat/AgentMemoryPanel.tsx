"use client"

import { useEffect, useState } from "react"
import { ArrowLeft, Brain, Plus, Trash2 } from "lucide-react"
import { MEMORY_KIND_LABEL, type AgentMemoryKind } from "@/lib/agentMemory"

type Memory = { id: string; kind: string; content: string; created_at: string }

// 위젯 채팅 안의 "기억 관리" 화면 — 이 에이전트가 나에 대해 기억하는 것(개인용).
// 저장은 다 남기고, 다음 대화부터 반영. 내 것만 보이고(RLS), 언제든 삭제.
export function AgentMemoryPanel({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const [items, setItems] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState("")
  const [saving, setSaving] = useState(false)

  // 마운트 시 목록 로드 — setState는 비동기(.then) 안에서만(동기 set-state-in-effect 회피).
  useEffect(() => {
    let alive = true
    fetch(`/api/agents/${agentId}/memory`)
      .then((res) => (res.ok ? res.json() : { memories: [] }))
      .then((j) => {
        if (!alive) return
        setItems(j.memories ?? [])
        setLoading(false)
      })
      .catch(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [agentId])

  const add = async () => {
    const content = text.trim()
    if (!content || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
      if (res.ok) {
        const { memory } = (await res.json()) as { memory: Memory }
        setItems((p) => [memory, ...p])
        setText("")
      }
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    setItems((p) => p.filter((m) => m.id !== id)) // 낙관적 제거
    await fetch(`/api/agents/${agentId}/memory/${id}`, { method: "DELETE" })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <button
          onClick={onClose}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="대화로 돌아가기"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Brain className="size-4" /> 이 에이전트가 나에 대해 기억하는 것
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">여기 적은 걸 다음 대화부터 반영해요. 내 것만 보이고, 언제든 지울 수 있어요.</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3 [scrollbar-width:thin]">
        {loading ? (
          <p className="text-xs text-muted-foreground">불러오는 중…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            아직 기억이 없어요. 아래에 &quot;보고서는 항상 표로&quot; 같은 걸 적어보세요.
          </p>
        ) : (
          items.map((m) => (
            <div key={m.id} className="group flex items-start gap-2 rounded-lg border bg-muted/30 px-2.5 py-1.5">
              <span className="mt-0.5 shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {MEMORY_KIND_LABEL[m.kind as AgentMemoryKind] ?? "메모"}
              </span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs">{m.content}</span>
              <button
                onClick={() => remove(m.id)}
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                aria-label="이 기억 삭제"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="border-t bg-card p-3">
        <div className="flex items-end gap-1.5 rounded-2xl border bg-muted/40 py-1.5 pl-3 pr-1.5 focus-within:border-ring focus-within:bg-card">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void add()
              }
            }}
            placeholder="기억시킬 내용 (예: 보고서는 항상 표로 정리)"
            rows={1}
            className="max-h-24 flex-1 resize-none self-center bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={() => void add()}
            disabled={!text.trim() || saving}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
            aria-label="기억 추가"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
