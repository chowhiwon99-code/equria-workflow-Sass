"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Megaphone, Pin, PinOff, Plus, Trash2, Loader2, ChevronDown } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { fieldClass } from "@/components/shared/Modal"
import { Surface } from "@/components/shared/Surface"
import type { Tables } from "@/lib/supabase/types"

type Ann = Tables<"announcements">

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })
}

/**
 * 대시보드 상단 공지사항 — 전 직원 열람, **오너(workspaces.owner_id)만** 작성/고정/삭제.
 * 공지가 없고 오너도 아니면 렌더하지 않아 대시보드를 깔끔히 유지한다.
 */
export function AnnouncementsBoard() {
  const supabase = createClient()
  const me = useCurrentUserId()
  const [isOwner, setIsOwner] = useState(false)
  const [names, setNames] = useState<Record<string, string>>({})
  const [positions, setPositions] = useState<Record<string, string | null>>({})
  const [list, setList] = useState<Ann[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [composing, setComposing] = useState(false)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [pin, setPin] = useState(false)

  const load = useCallback(async () => {
    if (!me) return setLoading(false)
    const [{ data: ws }, { data: anns }, { data: ppl }] = await Promise.all([
      supabase.from("workspaces").select("owner_id").limit(1).maybeSingle(),
      supabase
        .from("announcements")
        .select("*")
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, name, position"),
    ])
    setIsOwner(!!ws && ws.owner_id === me)
    setList((anns as Ann[]) ?? [])
    setNames(Object.fromEntries((ppl ?? []).map((p) => [p.id, p.name])))
    setPositions(Object.fromEntries((ppl ?? []).map((p) => [p.id, p.position])))
    setLoading(false)
  }, [supabase, me])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    if (!me) return
    const ch = supabase
      .channel("announcements-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [supabase, me, load])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
      await load()
    } catch {
      toast.error("처리에 실패했어요.")
    } finally {
      setBusy(false)
    }
  }

  const post = () => {
    if (!me) return
    if (!title.trim() && !content.trim()) {
      toast.error("공지 내용을 입력해 주세요.")
      return
    }
    run(async () => {
      await mustOk(
        supabase.from("announcements").insert({ user_id: me, title: title.trim(), content: content.trim(), pinned: pin })
      )
      setTitle("")
      setContent("")
      setPin(false)
      setComposing(false)
      toast.success("공지를 올렸어요.")
    })
  }

  const togglePin = (a: Ann) =>
    run(async () => {
      await mustOk(
        supabase.from("announcements").update({ pinned: !a.pinned, updated_at: new Date().toISOString() }).eq("id", a.id)
      )
    })

  const remove = (id: string) => {
    if (!confirm("이 공지를 삭제할까요?")) return
    run(async () => {
      await mustOk(supabase.from("announcements").delete().eq("id", id))
    })
  }

  if (loading) return null
  if (list.length === 0 && !isOwner) return null

  const shown = expanded ? list : list.slice(0, 2)

  return (
    <Surface variant="glass" padding="sm" className="shrink-0 rounded-xl">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <Megaphone className="size-4 text-primary" /> 공지사항
        </h2>
        {isOwner && !composing && (
          <Button size="sm" variant="outline" onClick={() => setComposing(true)}>
            <Plus className="size-3.5" /> 공지 작성
          </Button>
        )}
      </div>

      {/* 작성 폼 (오너만) */}
      {isOwner && composing && (
        <div className="mb-3 flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
          <input className={fieldClass} placeholder="공지 제목" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            className={cn(fieldClass, "h-20 resize-none py-2")}
            placeholder="공지 내용"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} className="size-3.5" />
              <Pin className="size-3.5" /> 상단 고정
            </label>
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setComposing(false)} disabled={busy}>
                취소
              </Button>
              <Button size="sm" onClick={post} disabled={busy}>
                {busy && <Loader2 className="size-3.5 animate-spin" />} 게시
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 목록 */}
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 공지가 없어요. {isOwner && "첫 공지를 올려보세요."}</p>
      ) : (
        <div className={cn("flex flex-col divide-y", expanded && "max-h-72 overflow-y-auto")}>
          {shown.map((a) => (
            <div key={a.id} className="flex items-start gap-2 py-2.5 first:pt-0">
              {a.pinned && <Pin className="mt-0.5 size-3.5 shrink-0 text-primary" />}
              <div className="min-w-0 flex-1">
                {a.title && <p className="truncate text-sm font-medium">{a.title}</p>}
                {a.content && <p className={cn("whitespace-pre-wrap break-words text-sm text-muted-foreground", !expanded && "line-clamp-2")}>{a.content}</p>}
                <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                  {[names[a.user_id] ?? "오너", positions[a.user_id]].filter(Boolean).join(" · ")} · {fmtDate(a.created_at)}
                </p>
              </div>
              {isOwner && (
                <div className="flex shrink-0 gap-0.5">
                  <button
                    onClick={() => togglePin(a)}
                    disabled={busy}
                    title={a.pinned ? "고정 해제" : "상단 고정"}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {a.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                  </button>
                  <button
                    onClick={() => remove(a.id)}
                    disabled={busy}
                    title="삭제"
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {list.length > 2 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
          {expanded ? "접기" : `전체 ${list.length}개 보기`}
        </button>
      )}
    </Surface>
  )
}
