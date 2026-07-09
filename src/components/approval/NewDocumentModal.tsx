"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Plus, X, ChevronUp, ChevronDown, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Modal, fieldClass } from "@/components/shared/Modal"
import { Select } from "@/components/shared/Select"
import { DOC_TYPES, DOC_FIELDS, type DocType } from "./templates"
import type { Person } from "./lib"

type LineEntry = { approver_id: string; role: "결재" | "참조" }
// 편집 대상(임시저장/회수/반려 후 임시저장 문서) — 있으면 생성 대신 수정 모드.
export type EditDoc = { id: string; docType: DocType; title: string; fields: Record<string, string>; line: LineEntry[] }

export function NewDocumentModal({
  me,
  ownerId,
  people,
  editDoc,
  onClose,
  onDone,
}: {
  me: string
  ownerId: string | null
  people: Person[]
  editDoc?: EditDoc | null
  onClose: () => void
  onDone: (newId?: string) => void
}) {
  const supabase = createClient()
  const [docType, setDocType] = useState<DocType>(editDoc?.docType ?? "일반기안")
  const [title, setTitle] = useState(editDoc?.title ?? "")
  const [fields, setFields] = useState<Record<string, string>>(editDoc?.fields ?? {})
  // 편집이면 기존 결재선, 아니면 기본(대표가 본인이 아니면 1명 자동)
  const [line, setLine] = useState<LineEntry[]>(
    editDoc?.line ?? (ownerId && ownerId !== me ? [{ approver_id: ownerId, role: "결재" }] : [])
  )
  const [pick, setPick] = useState("")
  const [busy, setBusy] = useState(false)

  const nameById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.name])), [people])
  const posById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.position])), [people])
  // 결재선에 추가 가능한 사람: 본인(기안자) 제외 + 이미 추가된 사람 제외
  const addable = people.filter((p) => p.id !== me && !line.some((l) => l.approver_id === p.id))
  const setField = (k: string, v: string) => setFields((f) => ({ ...f, [k]: v }))

  const addLine = () => {
    if (!pick) return
    setLine((l) => [...l, { approver_id: pick, role: "결재" }])
    setPick("")
  }
  const move = (i: number, dir: -1 | 1) =>
    setLine((l) => {
      const j = i + dir
      if (j < 0 || j >= l.length) return l
      const next = [...l]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  const toggleRole = (i: number) =>
    setLine((l) => l.map((e, k) => (k === i ? { ...e, role: e.role === "결재" ? "참조" : "결재" } : e)))
  const removeLine = (i: number) => setLine((l) => l.filter((_, k) => k !== i))

  const save = async (submit: boolean) => {
    if (!title.trim()) {
      toast.error("제목을 입력해 주세요.")
      return
    }
    if (submit && !line.some((l) => l.role === "결재")) {
      toast.error("결재자를 최소 1명 지정해 주세요.")
      return
    }
    setBusy(true)

    // ── 편집 모드: 기존 임시저장 문서 UPDATE + 결재선 통째 교체(RLS상 임시저장 소유자 허용) ──
    if (editDoc) {
      try {
        await mustOk(
          supabase
            .from("approval_documents")
            .update({ doc_type: docType, title: title.trim(), body: fields, updated_at: new Date().toISOString() })
            .eq("id", editDoc.id)
        )
        await mustOk(supabase.from("approval_steps").delete().eq("document_id", editDoc.id))
        if (line.length > 0) {
          await mustOk(
            supabase.from("approval_steps").insert(
              line.map((l, i) => ({ document_id: editDoc.id, step_order: i + 1, approver_id: l.approver_id, role: l.role }))
            )
          )
        }
        if (submit) {
          const { error } = await supabase.rpc("submit_document", { doc_id: editDoc.id })
          if (error) throw new Error(error.message)
          toast.success("상신했어요.")
        } else {
          toast.success("저장했어요.")
        }
        onDone(editDoc.id)
      } catch {
        toast.error("저장에 실패했어요.")
      } finally {
        setBusy(false)
      }
      return
    }

    // ── 생성 모드 ──
    let docId: string | null = null
    try {
      const { data: doc } = await mustOk(
        supabase
          .from("approval_documents")
          .insert({ drafter_id: me, doc_type: docType, title: title.trim(), body: fields })
          .select()
          .single()
      )
      const id = (doc as { id: string }).id
      docId = id
      if (line.length > 0) {
        await mustOk(
          supabase.from("approval_steps").insert(
            line.map((l, i) => ({ document_id: id, step_order: i + 1, approver_id: l.approver_id, role: l.role }))
          )
        )
      }
      if (submit) {
        const { error } = await supabase.rpc("submit_document", { doc_id: id })
        if (error) throw new Error(error.message)
        toast.success("상신했어요.")
      } else {
        toast.success("임시저장했어요.")
      }
      onDone(id)
    } catch {
      // 초안은 생성됐고 상신만 실패했을 수 있음 → 초안으로 이동해 재시도/삭제 가능.
      if (docId) {
        toast.error("상신에 실패했어요. 임시저장 상태로 남겨뒀어요.")
        onDone(docId)
      } else {
        toast.error("처리에 실패했어요.")
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={editDoc ? "기안 수정" : "새 기안"} onClose={onClose} className="max-w-lg">
      <div className="flex flex-col gap-3">
        {/* 양식 + 제목 */}
        <div className="flex gap-2">
          <Select
            value={docType}
            onChange={(v) => {
              setDocType(v as DocType)
              setFields({})
            }}
            options={DOC_TYPES.map((t) => ({ value: t, label: t }))}
            className="h-9 w-36"
          />
          <input className={fieldClass} placeholder="제목" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        {/* 양식 필드 */}
        {DOC_FIELDS[docType].map((f) => (
          <label key={f.key} className="text-xs text-muted-foreground">
            {f.label}
            {f.type === "textarea" ? (
              <textarea
                className={cn(fieldClass, "mt-0.5 h-16 resize-none py-1.5")}
                placeholder={f.placeholder}
                value={fields[f.key] ?? ""}
                onChange={(e) => setField(f.key, e.target.value)}
              />
            ) : f.type === "select" ? (
              <div className="mt-0.5">
                <Select
                  value={fields[f.key] ?? f.options?.[0] ?? ""}
                  onChange={(v) => setField(f.key, v)}
                  options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
                  className="h-9"
                />
              </div>
            ) : (
              <input
                type={f.type}
                className={cn(fieldClass, "mt-0.5")}
                placeholder={f.placeholder}
                value={fields[f.key] ?? ""}
                onChange={(e) => setField(f.key, e.target.value)}
              />
            )}
          </label>
        ))}

        {/* 결재선 */}
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">결재선</p>
          <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground/70">
            승인할 사람을 순서대로 추가하세요. 위에서부터 차례로 결재가 넘어가요. 각 사람의 <b className="font-medium">결재</b>(승인 권한) ↔ <b className="font-medium">참조</b>(열람만)는 배지를 눌러 바꿔요.
          </p>
          {line.length === 0 ? (
            <p className="mb-2 text-xs text-muted-foreground/70">결재자를 추가해 주세요.</p>
          ) : (
            <div className="mb-2 flex flex-col gap-1.5">
              {line.map((e, i) => (
                <div key={e.approver_id} className="flex items-center gap-2 rounded-md bg-card px-2 py-1.5">
                  <span className="w-4 text-center text-[11px] text-muted-foreground">{i + 1}</span>
                  <Avatar className="size-6">
                    <AvatarFallback className="text-[10px]">{(nameById[e.approver_id] ?? "??").slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate text-sm">
                    {nameById[e.approver_id] ?? "직원"}
                    {posById[e.approver_id] && <span className="text-muted-foreground"> · {posById[e.approver_id]}</span>}
                  </span>
                  <button
                    onClick={() => toggleRole(i)}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      e.role === "결재" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {e.role}
                  </button>
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                    <ChevronUp className="size-3.5" />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === line.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                    <ChevronDown className="size-3.5" />
                  </button>
                  <button onClick={() => removeLine(i)} className="text-muted-foreground hover:text-destructive">
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {addable.length > 0 && (
            <div className="flex gap-1.5">
              <Select
                value={pick}
                onChange={setPick}
                options={addable.map((p) => ({ value: p.id, label: `${p.name}${p.position ? " · " + p.position : ""}` }))}
                placeholder="결재자 선택"
                className="h-8 flex-1"
              />
              <Button size="sm" variant="outline" onClick={addLine} disabled={!pick}>
                <Plus className="size-3.5" /> 추가
              </Button>
            </div>
          )}
        </div>

        {/* 액션 */}
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => save(false)} disabled={busy}>
            임시저장
          </Button>
          <Button size="sm" onClick={() => save(true)} disabled={busy}>
            {busy && <Loader2 className="size-3.5 animate-spin" />} 상신
          </Button>
        </div>
      </div>
    </Modal>
  )
}
