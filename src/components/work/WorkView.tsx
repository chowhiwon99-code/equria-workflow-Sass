"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { AttendancePanel } from "./AttendancePanel"
import { ExpensePanel } from "./ExpensePanel"
import { LeavePanel } from "./LeavePanel"

const TABS = [
  { key: "attendance", label: "근태" },
  { key: "expense", label: "지출결의서" },
  { key: "leave", label: "휴가" },
] as const
type TabKey = (typeof TABS)[number]["key"]

export function WorkView() {
  const [tab, setTab] = useState<TabKey>("attendance")
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold">근태·결재</h1>
        <p className="text-sm text-muted-foreground">출퇴근·지출결의서·휴가를 한 곳에서 처리하세요.</p>
      </div>

      {/* 탭 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full px-3 py-1 text-sm transition-colors",
              tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "attendance" && <AttendancePanel />}
      {tab === "expense" && <ExpensePanel />}
      {tab === "leave" && <LeavePanel />}
    </div>
  )
}
