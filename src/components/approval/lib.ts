import type { Tables } from "@/lib/supabase/types"

export type Step = Tables<"approval_steps">
export type Doc = Tables<"approval_documents"> & { approval_steps: Step[] }
export type Person = { id: string; name: string; avatar_url: string | null }
export type Box = "inbox" | "drafts" | "refs"

/** 결재 단계만 step_order 순(참조 제외). */
export function approvalSteps(doc: Doc): Step[] {
  return [...(doc.approval_steps ?? [])].filter((s) => s.role === "결재").sort((a, b) => a.step_order - b.step_order)
}

/** 현재 결재 단계(진행중일 때 current_step번째). 없으면 null. */
export function currentStep(doc: Doc): Step | null {
  if (doc.status !== "진행중") return null
  return approvalSteps(doc)[doc.current_step - 1] ?? null
}

/** 지금 내가 결재할 차례인가. */
export function isMyTurn(doc: Doc, me: string): boolean {
  const cur = currentStep(doc)
  return !!cur && cur.approver_id === me && cur.status === "대기"
}

/** 문서함 분류. */
export function inBox(doc: Doc, me: string, box: Box): boolean {
  if (box === "inbox") return isMyTurn(doc, me)
  if (box === "drafts") return doc.drafter_id === me
  return doc.drafter_id !== me && (doc.approval_steps ?? []).some((s) => s.role === "참조" && s.approver_id === me)
}
