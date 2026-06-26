"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Inbox, FileText, Eye } from "lucide-react"
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
