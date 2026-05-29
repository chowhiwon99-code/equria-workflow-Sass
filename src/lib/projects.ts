import type { ProjectStatus } from "@/types"

/** projects.status 값 → 한국어 라벨 + 색상 (배지/칩 표시용) */
export const PROJECT_STATUS: Record<
  ProjectStatus,
  { label: string; dot: string; badge: string }
> = {
  planned: { label: "진행 예정", dot: "#94A3B8", badge: "bg-slate-100 text-slate-700" },
  in_progress: { label: "진행 중", dot: "#3B82F6", badge: "bg-blue-100 text-blue-700" },
  on_hold: { label: "보류", dot: "#F59E0B", badge: "bg-amber-100 text-amber-700" },
  done: { label: "완료", dot: "#10B981", badge: "bg-emerald-100 text-emerald-700" },
  canceled: { label: "취소", dot: "#EF4444", badge: "bg-red-100 text-red-700" },
}

/** 목록/필터에서 사용하는 상태 순서 */
export const PROJECT_STATUS_ORDER: ProjectStatus[] = [
  "in_progress",
  "planned",
  "on_hold",
  "done",
  "canceled",
]
