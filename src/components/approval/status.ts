// 전자결재 상태 배지 색.
export const DOC_STATUS_BADGE: Record<string, string> = {
  임시저장: "bg-slate-100 text-slate-600",
  진행중: "bg-blue-100 text-blue-700",
  승인완료: "bg-emerald-100 text-emerald-700",
  반려: "bg-rose-100 text-rose-700",
  회수: "bg-slate-100 text-slate-500",
}

// 결재선 단계 도장 색(대기/승인/반려).
export const STEP_STAMP: Record<string, string> = {
  대기: "border-muted-foreground/30 text-muted-foreground",
  승인: "border-emerald-500 text-emerald-600",
  반려: "border-rose-500 text-rose-600",
}
