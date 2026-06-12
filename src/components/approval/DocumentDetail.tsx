"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Check, X, Undo2, Loader2, Send, Pencil, RotateCcw } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Loading } from "@/components/shared/States"
import { DOC_STATUS_BADGE, STEP_STAMP } from "./status"
import { DOC_FIELDS, type DocType } from "./templates"
import { approvalSteps, currentStep, isMyTurn, type Doc, type Person } from "./lib"
import { NewDocumentModal, type EditDoc } from "./NewDocumentModal"

type Comment = { id: string; user_id: string; body: string; created_at: string }

export function DocumentDetail({ docId }: { docId: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [me, setMe] = useState<string | null>(null)
  const [doc, setDoc] = useState<Doc | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectText, setRejectText] = useState("")
  const [newComment, setNewComment] = useState("")
  const [editing, setEditing] = useState(false)

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return setLoading(false)
    setMe(auth.user.id)
    const [{ data: d }, { data: cs }, { data: ppl }] = await Promise.all([
      supabase.from("approval_documents").select("*, approval_steps(*)").eq("id", docId).maybeSingle(),
      supabase.from("approval_comments").select("id, user_id, body, created_at").eq("document_id", docId).order("created_at"),
      supabase.from("profiles").select("id, name, avatar_url"),
    ])
    setDoc((d as Doc) ?? null)
    setComments((cs as Comment[]) ?? [])
    setPeople((ppl as Person[]) ?? [])
    setLoading(false)
  }, [supabase, docId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

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

  const nameById = (id: string) => people.find((p) => p.id === id)?.name ?? "직원"

  if (loading) return <Loading rows={5} />
  if (!doc || !me)
    return (
      <div className="mx-auto max-w-2xl">
        <button onClick={() => router.push("/approval")} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> 목록
        </button>
        <p className="text-sm text-muted-foreground">문서를 찾을 수 없거나 권한이 없습니다.</p>
      </div>
    )

  const steps = approvalSteps(doc)
  const refs = (doc.approval_steps ?? []).filter((s) => s.role === "참조")
  const cur = currentStep(doc)
  const canAct = isMyTurn(doc, me)
  const canRecall = doc.drafter_id === me && doc.status === "진행중" && !steps.some((s) => s.status !== "대기")
  const body = (doc.body ?? {}) as Record<string, unknown>

  const act = (action: "승인" | "반려", comment?: string) =>
    run(async () => {
      const { error } = await supabase.rpc("act_on_approval", { p_document_id: doc.id, p_action: action, p_comment: comment ?? undefined })
      if (error) throw new Error(error.message)
      toast.success(action === "승인" ? "승인했어요." : "반려했어요.")
      setRejecting(false)
      setRejectText("")
    })

  const recall = () =>
    run(async () => {
      const { error } = await supabase.rpc("recall_document", { doc_id: doc.id })
      if (error) throw new Error(error.message)
      toast.success("회수했어요. 임시저장으로 돌아갔어요.")
    })

  const submitDraft = () =>
    run(async () => {
      const { error } = await supabase.rpc("submit_document", { doc_id: doc.id })
      if (error) throw new Error(error.message)
      toast.success("상신했어요.")
    })

  const deleteDraft = () => {
    if (!confirm("이 초안을 삭제할까요?")) return
    run(async () => {
      await mustOk(supabase.from("approval_documents").delete().eq("id", doc.id))
      toast.success("삭제했어요.")
      router.push("/approval")
    })
  }

  const isDraftOwner = doc.status === "임시저장" && doc.drafter_id === me
  const canRevise = doc.status === "반려" && doc.drafter_id === me
  // 편집 모달에 넘길 현재 문서 스냅샷(임시저장 소유자만 실제 수정 가능 — RLS가 강제)
  const editDoc: EditDoc = {
    id: doc.id,
    docType: doc.doc_type as DocType,
    title: doc.title ?? "",
    fields: Object.fromEntries(Object.entries(body).map(([k, v]) => [k, v == null ? "" : String(v)])),
    line: [...(doc.approval_steps ?? [])]
      .sort((a, b) => a.step_order - b.step_order)
      .map((s) => ({ approver_id: s.approver_id, role: s.role as "결재" | "참조" })),
  }

  // 반려 문서 재작성: 임시저장으로 되돌리고(RPC) 바로 편집 모달 열기
  const revise = async () => {
    setBusy(true)
    try {
      const { error } = await supabase.rpc("revise_document", { doc_id: doc.id })
      if (error) throw new Error(error.message)
      await load()
      setEditing(true)
      toast.success("임시저장으로 되돌렸어요. 수정 후 다시 상신하세요.")
    } catch {
      toast.error("처리에 실패했어요.")
    } finally {
      setBusy(false)
    }
  }

  const addComment = () => {
    if (!newComment.trim()) return
    run(async () => {
      await mustOk(supabase.from("approval_comments").insert({ document_id: doc.id, user_id: me, body: newComment.trim() }))
      setNewComment("")
    })
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <button onClick={() => router.push("/approval")} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> 목록
      </button>

      {/* 헤더 */}
      <div className="flex flex-col gap-2 rounded-xl border bg-card p-5 shadow-[var(--shadow-sm)]">
        <div className="flex items-center gap-2">
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{doc.doc_type}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", DOC_STATUS_BADGE[doc.status])}>{doc.status}</span>
          {doc.doc_no && <span className="text-[11px] text-muted-foreground">{doc.doc_no}</span>}
        </div>
        <h1 className="text-xl font-semibold">{doc.title || "(제목 없음)"}</h1>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Avatar className="size-5">
            <AvatarFallback className="text-[9px]">{nameById(doc.drafter_id).slice(0, 2)}</AvatarFallback>
          </Avatar>
          기안 {nameById(doc.drafter_id)}
          {doc.submitted_at && <span>· {doc.submitted_at.slice(0, 10)}</span>}
        </div>
      </div>

      {/* 결재선 진행 */}
      {steps.length > 0 && (
        <div className="rounded-xl border p-4">
          <p className="mb-3 text-xs font-medium text-muted-foreground">결재선</p>
          <div className="flex flex-wrap items-start gap-3">
            {steps.map((s, i) => {
              const isCurrent = cur?.id === s.id
              return (
                <div key={s.id} className="flex flex-col items-center gap-1.5">
                  <div className="relative">
                    <Avatar className={cn("size-10", isCurrent && "ring-2 ring-primary ring-offset-2 ring-offset-card")}>
                      <AvatarFallback className="text-xs">{nameById(s.approver_id).slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <span
                      className={cn(
                        "absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 bg-card px-1 text-[9px] font-bold",
                        STEP_STAMP[s.status]
                      )}
                    >
                      {s.status === "승인" ? "승인" : s.status === "반려" ? "반려" : i + 1}
                    </span>
                  </div>
                  <span className="max-w-16 truncate text-[11px]">{nameById(s.approver_id)}</span>
                  {s.comment && <span className="max-w-24 truncate text-[10px] text-muted-foreground">“{s.comment}”</span>}
                </div>
              )
            })}
          </div>
          {refs.length > 0 && (
            <div className="mt-3 flex items-center gap-1.5 border-t pt-2.5 text-[11px] text-muted-foreground">
              참조 {refs.map((r) => nameById(r.approver_id)).join(", ")}
            </div>
          )}
        </div>
      )}

      {/* 본문 */}
      <div className="rounded-xl border p-5">
        <div className="flex flex-col gap-2.5">
          {DOC_FIELDS[doc.doc_type as DocType].map((f) => {
            const v = body[f.key]
            if (v == null || v === "") return null
            return (
              <div key={f.key} className="flex flex-col gap-0.5">
                <span className="text-[11px] text-muted-foreground">{f.label}</span>
                <span className="whitespace-pre-wrap break-words text-sm">
                  {f.key === "amount" ? `₩${Number(v).toLocaleString()}` : String(v)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 초안 액션(임시저장·회수·반려 재작성 후) */}
      {isDraftOwner && (
        <div className="flex gap-2">
          <Button size="sm" onClick={submitDraft} disabled={busy} className="flex-1">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} 상신
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={busy}>
            <Pencil className="size-3.5" /> 편집
          </Button>
          <Button size="sm" variant="ghost" onClick={deleteDraft} disabled={busy} className="text-destructive">
            <X className="size-3.5" /> 삭제
          </Button>
        </div>
      )}

      {/* 반려 문서: 기안자가 재작성(→임시저장으로 되돌려 수정·재상신) */}
      {canRevise && (
        <Button size="sm" variant="outline" onClick={revise} disabled={busy} className="w-fit">
          <RotateCcw className="size-3.5" /> 재작성
        </Button>
      )}

      {/* 액션 */}
      {(canAct || canRecall) && (
        <div className="flex flex-col gap-2">
          {rejecting ? (
            <div className="flex flex-col gap-2 rounded-xl border bg-rose-50/50 p-3">
              <textarea
                className="h-16 w-full resize-none rounded-lg border bg-card px-2.5 py-1.5 text-sm outline-none"
                placeholder="반려 사유(필수)"
                value={rejectText}
                onChange={(e) => setRejectText(e.target.value)}
              />
              <div className="flex justify-end gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
                  취소
                </Button>
                <Button size="sm" variant="destructive" onClick={() => act("반려", rejectText.trim())} disabled={busy || !rejectText.trim()}>
                  반려 확정
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              {canAct && (
                <>
                  <Button size="sm" onClick={() => act("승인")} disabled={busy} className="flex-1">
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} 승인
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRejecting(true)} disabled={busy} className="flex-1 text-destructive">
                    <X className="size-3.5" /> 반려
                  </Button>
                </>
              )}
              {canRecall && (
                <Button size="sm" variant="ghost" onClick={recall} disabled={busy} className="text-muted-foreground">
                  <Undo2 className="size-3.5" /> 회수
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 의견 */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">의견</p>
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2">
            <Avatar className="size-6 shrink-0">
              <AvatarFallback className="text-[10px]">{nameById(c.user_id).slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col rounded-lg bg-muted/40 px-2.5 py-1.5">
              <span className="text-[11px] text-muted-foreground">{nameById(c.user_id)}</span>
              <span className="whitespace-pre-wrap break-words text-sm">{c.body}</span>
            </div>
          </div>
        ))}
        <div className="flex gap-1.5">
          <input
            className="h-8 flex-1 rounded-lg border bg-card px-2.5 text-sm outline-none"
            placeholder="의견 입력…"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) addComment()
            }}
          />
          <Button size="sm" variant="outline" onClick={addComment} disabled={busy || !newComment.trim()}>
            <Send className="size-3.5" />
          </Button>
        </div>
      </div>

      {editing && (
        <NewDocumentModal
          me={me}
          ownerId={null}
          people={people}
          editDoc={editDoc}
          onClose={() => setEditing(false)}
          onDone={() => {
            setEditing(false)
            load()
          }}
        />
      )}
    </div>
  )
}
