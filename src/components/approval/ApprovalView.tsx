"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Inbox, FileText, Eye, Lightbulb, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Loading } from "@/components/shared/States"
import { DocumentList } from "./DocumentList"
import { NewDocumentModal } from "./NewDocumentModal"
import { inBox, type Doc, type Person, type Box } from "./lib"

const BOXES: { key: Box; label: string; icon: typeof Inbox; empty: string }[] = [
  { key: "inbox", label: "결재할 문서", icon: Inbox, empty: "결재할 문서가 없어요." },
  { key: "drafts", label: "기안함", icon: FileText, empty: "기안한 문서가 없어요." },
  { key: "refs", label: "참조함", icon: Eye, empty: "참조 문서가 없어요." },
]

const GUIDE_KEY = "equria:approval-guide-collapsed"

const GUIDE_STEPS = [
  { n: 1, title: "새 기안 작성", body: "오른쪽 위 ‘새 기안’에서 양식(지출결의서·휴가신청 등)을 고르고 내용을 채워요." },
  { n: 2, title: "결재선 지정 → 상신", body: "승인할 사람을 순서대로 추가하고(참조자도 지정 가능), ‘상신’을 누르면 첫 결재자에게 전달돼요." },
  { n: 3, title: "결재 / 반려", body: "내 차례가 오면 ‘결재할 문서’에 빨간 숫자가 떠요. 열어서 승인하거나 사유와 함께 반려하면 다음 사람에게 넘어가요." },
]

/** 전자결재 사용법 안내 — 대표 온보딩용. 접으면 localStorage로 유지(로직 변경 없음). */
function HowToBanner() {
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    // SSR 하이드레이션 불일치 방지 위해 mount 후 localStorage 읽음(기존 코드 패턴).
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(GUIDE_KEY) === "1")
    } catch {
      /* localStorage 접근 불가 시 펼침 유지 */
    }
  }, [])
  const setAndStore = (v: boolean) => {
    setCollapsed(v)
    try {
      localStorage.setItem(GUIDE_KEY, v ? "1" : "0")
    } catch {
      /* 무시 */
    }
  }

  if (collapsed) {
    return (
      <button
        onClick={() => setAndStore(false)}
        className="inline-flex w-fit items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground shadow-[var(--shadow-sm)] hover:text-foreground"
      >
        <Lightbulb className="size-3.5 text-primary" /> 전자결재 사용법 보기
      </button>
    )
  }

  return (
    <div className="rounded-xl glass p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <Lightbulb className="size-4 text-primary" /> 전자결재 이렇게 써요
        </h2>
        <button
          onClick={() => setAndStore(true)}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="접기"
          aria-label="사용법 접기"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-3">
        {GUIDE_STEPS.map((s) => (
          <div key={s.n} className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-1 flex items-center gap-1.5">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground tabular-nums">
                {s.n}
              </span>
              <span className="text-sm font-medium">{s.title}</span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ApprovalView() {
  const supabase = createClient()
  const me = useCurrentUserId()
  const router = useRouter()
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [box, setBox] = useState<Box>("inbox")
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    if (!me) return setLoading(false)
    const [{ data: ws }, { data: list }, { data: ppl }] = await Promise.all([
      supabase.from("workspaces").select("owner_id").limit(1).maybeSingle(),
      supabase.from("approval_documents").select("*, approval_steps(*)").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, name, avatar_url, position").order("name"),
    ])
    setOwnerId(ws?.owner_id ?? null)
    setDocs((list as Doc[]) ?? [])
    setPeople((ppl as Person[]) ?? [])
    setLoading(false)
  }, [supabase, me])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    if (!me) return
    const ch = supabase
      .channel("approval-view")
      .on("postgres_changes", { event: "*", schema: "public", table: "approval_documents" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "approval_steps" }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [supabase, me, load])

  const nameById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.name])), [people])
  const posById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.position])), [people])
  const inboxCount = me ? docs.filter((d) => inBox(d, me, "inbox")).length : 0
  const shown = me ? docs.filter((d) => inBox(d, me, box)) : []

  if (loading) return <Loading rows={5} />

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">전자결재</h1>
          <p className="text-sm text-muted-foreground">기안·결재선·승인/반려를 한 곳에서.</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-3.5" /> 새 기안
        </Button>
      </div>

      <HowToBanner />

      <div className="flex flex-wrap items-center gap-1.5">
        {BOXES.map((b) => {
          const Icon = b.icon
          const count = b.key === "inbox" ? inboxCount : 0
          return (
            <button
              key={b.key}
              onClick={() => setBox(b.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors",
                box === b.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              <Icon className="size-3.5" /> {b.label}
              {count > 0 && (
                <span className="ml-0.5 rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-white">{count}</span>
              )}
            </button>
          )
        })}
      </div>

      <DocumentList
        docs={shown}
        me={me ?? ""}
        nameById={nameById}
        posById={posById}
        emptyLabel={BOXES.find((b) => b.key === box)?.empty ?? ""}
        onOpen={(id) => router.push(`/approval/${id}`)}
        onNew={box === "refs" ? undefined : () => setCreating(true)}
      />

      {creating && me && (
        <NewDocumentModal
          me={me}
          ownerId={ownerId}
          people={people}
          onClose={() => setCreating(false)}
          onDone={(id) => {
            setCreating(false)
            load()
            if (id) router.push(`/approval/${id}`)
          }}
        />
      )}
    </div>
  )
}
