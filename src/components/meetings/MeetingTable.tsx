"use client"

import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Plus, Trash2, Settings2, Check } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { fieldClass } from "@/components/shared/Modal"
import type { Tables } from "@/lib/supabase/types"
import { IMPORTANCE, importanceLabel, importanceColor, CATEGORY_COLORS, tagBg, swatch } from "@/lib/meetingMeta"

type Note = Tables<"meeting_notes">
type Category = Tables<"meeting_categories">
type MetaPatch = Partial<Pick<Note, "category_id" | "importance" | "meeting_date" | "meeting_time">>

/** 클릭으로 열리는 작은 드롭다운(백드롭으로 바깥 클릭 닫힘). */
function Picker({ trigger, children }: { trigger: ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative inline-block">
      <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex max-w-full items-center">
        {trigger}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-50 mt-1 max-h-64 min-w-[9rem] overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-[var(--shadow-lg)]">
            {children(() => setOpen(false))}
          </div>
        </>
      )}
    </div>
  )
}

function Tag({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-block max-w-full truncate rounded px-1.5 py-0.5 text-xs font-medium" style={{ backgroundColor: tagBg(color) }}>
      {name}
    </span>
  )
}

const menuItem = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-muted"

/** 회의 DB(노션 데이터베이스식) — 제목·일시·분류·중요도 + 인라인 편집·정렬·필터·분류 관리. */
export function MeetingTable({
  notes,
  categories,
  onOpen,
  onReload,
}: {
  notes: Note[]
  categories: Category[]
  onOpen: (n: Note) => void
  onReload: () => void
}) {
  const supabase = createClient()
  const [sort, setSort] = useState<"date" | "importance">("date")
  const [manage, setManage] = useState(false)
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState<string>("blue")
  const catById = new Map(categories.map((c) => [c.id, c]))

  const setMeta = async (n: Note, patch: MetaPatch) => {
    const next = { ...n, ...patch }
    const { error } = await supabase.rpc("set_meeting_meta", {
      p_note: n.id,
      p_category: next.category_id,
      p_importance: next.importance,
      p_date: next.meeting_date,
      p_time: next.meeting_time,
    })
    if (error) return toast.error(error.message)
    onReload()
  }

  const addCategory = async () => {
    const name = newName.trim()
    if (!name) return
    const { data: auth } = await supabase.auth.getUser()
    const { error } = await supabase
      .from("meeting_categories")
      .insert({ name, color: newColor, created_by: auth.user?.id ?? null, sort_order: categories.length })
    if (error) return toast.error(error.message)
    setNewName("")
    onReload()
  }

  const delCategory = async (id: string) => {
    if (!confirm("이 분류를 삭제할까요? (회의의 분류만 해제됩니다)")) return
    const { error } = await supabase.from("meeting_categories").delete().eq("id", id)
    if (error) return toast.error(error.message)
    onReload()
  }

  const rows = [...notes]
    .sort((a, b) =>
      sort === "importance"
        ? b.importance - a.importance
        : (b.meeting_date ?? b.created_at).localeCompare(a.meeting_date ?? a.created_at)
    )

  const sortBtn = (key: "date" | "importance", label: string) => (
    <button
      onClick={() => setSort(key)}
      className={cn("rounded-lg px-2 py-1 transition-colors", sort === key ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted/50")}
    >
      {label}
    </button>
  )

  return (
    <div className="flex flex-col gap-3">
      {/* 툴바 */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">정렬</span>
        {sortBtn("date", "날짜")}
        {sortBtn("importance", "중요도")}
        <button onClick={() => setManage((m) => !m)} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground">
          <Settings2 className="size-3.5" /> 분류 관리
        </button>
      </div>

      {/* 분류 관리 패널 */}
      {manage && (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className={cn(fieldClass, "h-8 w-40")}
              placeholder="새 분류 이름"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
            />
            <div className="flex items-center gap-1">
              {CATEGORY_COLORS.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setNewColor(col)}
                  className={cn("flex size-5 items-center justify-center rounded-full border border-border", newColor === col && "ring-2 ring-primary")}
                  style={{ backgroundColor: swatch(col) }}
                  title={col}
                >
                  {newColor === col && <Check className="size-3 text-white" />}
                </button>
              ))}
            </div>
            <button onClick={addCategory} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">
              <Plus className="size-3.5" /> 추가
            </button>
          </div>
          {categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {categories.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1">
                  <Tag name={c.name} color={c.color} />
                  <button onClick={() => delCategory(c.id)} className="text-muted-foreground hover:text-destructive" title="분류 삭제">
                    <Trash2 className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">제목</th>
              <th className="px-3 py-2 font-medium">날짜</th>
              <th className="px-3 py-2 font-medium">시간</th>
              <th className="px-3 py-2 font-medium">분류</th>
              <th className="px-3 py-2 font-medium">중요도</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => {
              const cat = n.category_id ? catById.get(n.category_id) : null
              return (
                <tr key={n.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">
                    <button onClick={() => onOpen(n)} className="text-left hover:text-primary hover:underline">
                      {n.title || "(제목 없음)"}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      defaultValue={n.meeting_date ?? ""}
                      onChange={(e) => setMeta(n, { meeting_date: e.target.value || null })}
                      className="rounded border-none bg-transparent text-xs text-muted-foreground outline-none hover:bg-muted/50"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      defaultValue={n.meeting_time ?? ""}
                      placeholder="예: 10:00~12:00"
                      onBlur={(e) => {
                        const v = e.target.value.trim() || null
                        if (v !== (n.meeting_time ?? null)) setMeta(n, { meeting_time: v })
                      }}
                      className="w-28 rounded border-none bg-transparent text-xs text-muted-foreground outline-none hover:bg-muted/50"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Picker trigger={cat ? <Tag name={cat.name} color={cat.color} /> : <span className="text-xs text-muted-foreground hover:text-foreground">+ 분류</span>}>
                      {(close) => (
                        <>
                          <button className={cn(menuItem, "text-muted-foreground")} onClick={() => { setMeta(n, { category_id: null }); close() }}>
                            분류 없음
                          </button>
                          {categories.map((c) => (
                            <button key={c.id} className={menuItem} onClick={() => { setMeta(n, { category_id: c.id }); close() }}>
                              <Tag name={c.name} color={c.color} />
                            </button>
                          ))}
                        </>
                      )}
                    </Picker>
                  </td>
                  <td className="px-3 py-2">
                    <Picker
                      trigger={
                        n.importance > 0 ? (
                          <Tag name={importanceLabel(n.importance)} color={importanceColor(n.importance)} />
                        ) : (
                          <span className="text-xs text-muted-foreground hover:text-foreground">—</span>
                        )
                      }
                    >
                      {(close) =>
                        IMPORTANCE.map((lv) => (
                          <button key={lv.value} className={menuItem} onClick={() => { setMeta(n, { importance: lv.value }); close() }}>
                            {lv.value > 0 ? <Tag name={lv.label} color={importanceColor(lv.value)} /> : <span className="text-xs text-muted-foreground">없음</span>}
                          </button>
                        ))
                      }
                    </Picker>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">표시할 회의가 없어요.</p>}
    </div>
  )
}
