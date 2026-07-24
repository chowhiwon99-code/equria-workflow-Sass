"use client"

import { useEffect, useState } from "react"
import { ArrowLeft, Brain, Plus, Trash2, Sparkles, Loader2, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { MEMORY_KINDS, MEMORY_KIND_LABEL, type AgentMemoryKind } from "@/lib/agentMemory"

type Memory = { id: string; kind: string; content: string; importance: number; created_at: string }
type Proposed = { kind: string; content: string; importance: number }

// 중요도(1~3) → 배지 라벨·색. 높을수록 눈에 띄게(핵심 규칙 우선 인지).
const IMPORTANCE: Record<number, { label: string; cls: string }> = {
  3: { label: "높음", cls: "bg-primary/15 text-primary" },
  2: { label: "보통", cls: "bg-muted text-muted-foreground" },
  1: { label: "낮음", cls: "bg-muted/40 text-muted-foreground/70" },
}
const imp = (n: number) => IMPORTANCE[n] ?? IMPORTANCE[2]

// 위젯 채팅 안의 "기억 관리" 화면 — 이 에이전트가 나에 대해 기억하는 것(개인용).
// 종류별로 묶고 중요도순 정렬. 'AI로 정리'로 병합·중복제거·재분류·우선순위를 미리보기 후 적용(조용히 안 지움).
export function AgentMemoryPanel({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const [items, setItems] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState("")
  const [saving, setSaving] = useState(false)
  const [organizing, setOrganizing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [preview, setPreview] = useState<{ current: Memory[]; proposed: Proposed[] } | null>(null)

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
        setItems((p) => [{ ...memory, importance: memory.importance ?? 2 }, ...p])
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

  // AI 정리 미리보기 요청.
  const organize = async () => {
    if (organizing || items.length === 0) return
    setOrganizing(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/memory/organize`, { method: "POST" })
      if (res.ok) {
        const j = (await res.json()) as { current: Memory[]; proposed: Proposed[] }
        setPreview({ current: j.current ?? [], proposed: j.proposed ?? [] })
      }
    } finally {
      setOrganizing(false)
    }
  }

  // 미리보기 적용 → 서버가 새 목록 insert + 기존 soft-delete 후 정리된 목록 반환.
  const applyOrganize = async () => {
    if (!preview || applying) return
    setApplying(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/memory/organize/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memories: preview.proposed, replaceIds: preview.current.map((m) => m.id) }),
      })
      if (res.ok) {
        const { memories } = (await res.json()) as { memories: Memory[] }
        setItems(memories ?? [])
        setPreview(null)
      }
    } finally {
      setApplying(false)
    }
  }

  // 종류별 그룹(빈 그룹 제외). 각 그룹은 GET이 이미 중요도순 정렬.
  const grouped = MEMORY_KINDS.map((k) => ({
    kind: k,
    label: MEMORY_KIND_LABEL[k],
    list: items.filter((m) => m.kind === k),
  })).filter((g) => g.list.length > 0)

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
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Brain className="size-4" /> 이 에이전트가 나에 대해 기억하는 것
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">다음 대화부터 반영돼요. 내 것만 보이고, 언제든 지울 수 있어요.</p>
        </div>
        {!preview && items.length > 1 && (
          <button
            onClick={organize}
            disabled={organizing}
            className="flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            title="AI가 병합·중복제거·우선순위 정리 (확인 후 적용)"
          >
            {organizing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-primary" />}
            AI로 정리
          </button>
        )}
      </div>

      {/* 본문 — 미리보기 or 목록 */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">
        {preview ? (
          <div className="space-y-2.5">
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-2 text-xs">
              <p className="flex items-center gap-1.5 font-medium">
                <Sparkles className="size-3.5 text-primary" /> AI 정리 미리보기
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {preview.current.length}개 → <b className="text-foreground">{preview.proposed.length}개</b>로 정리했어요. 확인 후 적용하세요. (이전 것은 휴지통에 남아요)
              </p>
            </div>
            {preview.proposed.length === 0 ? (
              <p className="text-xs text-muted-foreground">정리 결과가 비어 있어요(남길 만한 기억이 없다고 판단). 적용하면 현재 목록이 모두 정리됩니다.</p>
            ) : (
              preview.proposed.map((m, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border bg-card px-2.5 py-1.5">
                  <span className="mt-0.5 shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    {MEMORY_KIND_LABEL[m.kind as AgentMemoryKind] ?? "메모"}
                  </span>
                  <span className={cn("mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium", imp(m.importance).cls)}>
                    {imp(m.importance).label}
                  </span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs">{m.content}</span>
                </div>
              ))
            )}
            <div className="flex justify-end gap-1.5 pt-1">
              <button
                onClick={() => setPreview(null)}
                className="rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                취소
              </button>
              <button
                onClick={applyOrganize}
                disabled={applying}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {applying ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} 적용
              </button>
            </div>
          </div>
        ) : loading ? (
          <p className="text-xs text-muted-foreground">불러오는 중…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            아직 기억이 없어요. 아래에 &quot;보고서는 항상 표로&quot; 같은 걸 적어보세요.
          </p>
        ) : (
          <div className="space-y-3">
            {grouped.map((g) => (
              <div key={g.kind} className="space-y-1.5">
                <p className="px-0.5 text-[11px] font-medium text-muted-foreground">{g.label}</p>
                {g.list.map((m) => (
                  <div key={m.id} className="group flex items-start gap-2 rounded-lg border bg-muted/30 px-2.5 py-1.5">
                    <span className={cn("mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium", imp(m.importance).cls)}>
                      {imp(m.importance).label}
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
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 추가 입력 — 미리보기 중엔 숨김 */}
      {!preview && (
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
      )}
    </div>
  )
}
