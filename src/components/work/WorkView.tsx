"use client"

import { AttendancePanel } from "./AttendancePanel"
import { AttendanceAdmin } from "./AttendanceAdmin"

// 근태 전용. 결재(지출결의서·휴가 등)는 전자결재(/approval)로 이관됨.
export function WorkView() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold">근태</h1>
        <p className="text-sm text-muted-foreground">출퇴근을 기록하고 최근 근태를 확인하세요. 지출·휴가 결재는 전자결재에서.</p>
      </div>
      <AttendancePanel />
      {/* 대표·위임자에게만 보이는 팀 근태 현황 + 권한 위임(비위임 직원에겐 자동 숨김) */}
      <AttendanceAdmin />
    </div>
  )
}
