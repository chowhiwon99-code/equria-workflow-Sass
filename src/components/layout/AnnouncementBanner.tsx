"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Megaphone, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

const DISMISS_KEY = "equria:announcement-dismissed"

function dismissedIds(): string[] {
  try {
    const arr = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]")
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

/**
 * 전 페이지 상단 공지 배너 — 최신 공지(고정 우선)를 띄우고, 본 사람은 X로 닫는다(이 기기에 영속).
 * 새 공지가 올라오면(실시간) 다시 나타난다. 공지가 없거나 닫았으면 렌더 안 함.
 */
export function AnnouncementBanner() {
  const supabase = createClient()
  const [ann, setAnn] = useState<{ id: string; title: string; content: string } | null>(null)
  const [meId, setMeId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    setMeId(auth.user.id)
    const { data } = await supabase
      .from("announcements")
      .select("id, title, content")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    setAnn(data && !dismissedIds().includes(data.id) ? data : null)
  }, [supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    if (!meId) return
    const ch = supabase
      .channel("announcement-banner")
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [supabase, meId, load])

  if (!ann) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify([...new Set([...dismissedIds(), ann.id])]))
    } catch {
      /* 저장 실패해도 화면은 닫힘 */
    }
    setAnn(null)
  }

  return (
    <div className="flex items-center gap-2 border-b bg-primary/5 px-4 py-2 text-sm">
      <Megaphone className="size-4 shrink-0 text-primary" />
      <Link href="/dashboard" className="min-w-0 flex-1 truncate hover:underline">
        {ann.title && <span className="font-medium">{ann.title}</span>}
        {ann.content && <span className="text-muted-foreground">{ann.title ? " — " : ""}{ann.content}</span>}
      </Link>
      <button
        onClick={dismiss}
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="공지 닫기"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
