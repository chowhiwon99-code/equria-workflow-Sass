import type { ProjectStatus } from "@/types"
import { CircleDashed, CircleDot, CirclePause, CircleCheck, CircleX, type LucideIcon } from "lucide-react"

/** projects.status 값 → 한국어 라벨 + 색상 + 상태 아이콘 (배지/칩 표시용) */
export const PROJECT_STATUS: Record<
  ProjectStatus,
  { label: string; dot: string; badge: string; icon: LucideIcon }
> = {
  planned: { label: "진행 예정", dot: "#94A3B8", badge: "bg-slate-100 text-slate-700", icon: CircleDashed },
  in_progress: { label: "진행 중", dot: "#3B82F6", badge: "bg-blue-100 text-blue-700", icon: CircleDot },
  on_hold: { label: "보류", dot: "#F59E0B", badge: "bg-amber-100 text-amber-700", icon: CirclePause },
  done: { label: "완료", dot: "#10B981", badge: "bg-emerald-100 text-emerald-700", icon: CircleCheck },
  canceled: { label: "취소", dot: "#EF4444", badge: "bg-red-100 text-red-700", icon: CircleX },
}

/** 목록/필터에서 사용하는 상태 순서 */
export const PROJECT_STATUS_ORDER: ProjectStatus[] = [
  "in_progress",
  "planned",
  "on_hold",
  "done",
  "canceled",
]
