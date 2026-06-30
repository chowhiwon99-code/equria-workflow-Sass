"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { GripVertical, Trash2, Plus, FolderPlus, CornerUpRight, ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { money } from "@/lib/finance"
import { tagBg } from "@/lib/meetingMeta"
import { POOL_ID, slotCategory, type CashSummary } from "@/lib/cashflowGraph"
import { SLOT_TYPES, slotLabel, fieldsOf } from "@/lib/cashAccounts"
import { InlineText, InlineNumber, InlinePercent } from "./inline"
import type { CashAccount, CashCalcType, CashCategory } from "@/types"

const NODE_W = 210
const GPAD = 8
const GTOP = 4 // 그룹 박스 상단 여백

type Drag =
  | { kind: "node"; id: string; ox: number; oy: number; moved: boolean; sx: number; sy: number }
  | { kind: "pan"; sx: number; sy: number; tx0: number; ty0: number }
  | null

/**
 * 편집 캔버스 + 그룹 — 카드/그룹을 ⠿그립으로 드래그. 박스를 그룹 위로 놓으면 합쳐지고(자동 세로 스택, flex), 밖으로 놓으면 빠짐.
 * 그룹 안 항목은 컨테이너의 flex 자식이라 들어가는 즉시 자연 높이로 정렬(겹침 없음). ⌘휠 줌·배경 팬. (연결선 없음.)
 */
export function CashFlowCanvas({
  slots,
  groups,
  pool,
  poolPos,
  calcTypes,
  onUpdateSlot,
  onDeleteSlot,
  onAddSlot,
  onAddGroup,
  onMoveGroup,
  onUpdateGroup,
  onDeleteGroup,
  onMoveAccount,
  onMovePool,
}: {
  slots: CashAccount[]
  groups: CashCategory[]
  pool: CashSummary
  poolPos: { x: number; y: number } | null
  calcTypes: CashCalcType[]
  onUpdateSlot: (id: string, patch: Partial<CashAccount>) => void
  onDeleteSlot: (slot: CashAccount) => void
  onAddSlot: (kind: string, color: string) => void
  onAddGroup: () => void
  onMoveGroup: (id: string, x: number, y: number) => void
  onUpdateGroup: (id: string, patch: Partial<CashCategory>) => void
  onDeleteGroup: (id: string) => void
  onMoveAccount: (id: string, x: number, y: number) => void
  onMovePool: (x: number, y: number) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag>(null)
  const dragRef = useRef<Drag>(null)
  useEffect(() => {
    dragRef.current = drag
  }, [drag])
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 })
  const [localPos, setLocalPos] = useState<Record<string, { x: number; y: number }>>({})
  const [justGrouped, setJustGrouped] = useState<string | null>(null) // 방금 그룹에 들어간 카드 → 비눗방울 등장
  const viewRef = useRef(view)
  const localPosRef = useRef(localPos)
  useEffect(() => {
    viewRef.current = view
  }, [view])
  useEffect(() => {
    localPosRef.current = localPos
  }, [localPos])

  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots])
  const groupIdSet = useMemo(() => new Set(groups.map((g) => g.id)), [groups])
  const itemsByGroup = useMemo(() => {
    const m = new Map<string, CashAccount[]>()
    for (const s of slots) if (s.category_id) (m.get(s.category_id) ?? m.set(s.category_id, []).get(s.category_id)!).push(s)
    return m
  }, [slots])
  const freeSlots = useMemo(() => slots.filter((s) => !s.category_id), [slots])

  const groupPos = (g: CashCategory) => localPos[g.id] ?? { x: g.x != null ? Number(g.x) : 60, y: g.y != null ? Number(g.y) : 60 }
  const slotPos = (s: CashAccount): { x: number; y: number } => {
    if (localPos[s.id]) return localPos[s.id]
    const i = freeSlots.findIndex((x) => x.id === s.id)
    return { x: s.x != null ? Number(s.x) : 480 + (i % 3) * 232, y: s.y != null ? Number(s.y) : 90 + Math.floor(i / 3) * 150 }
  }

  const toWorld = (clientX: number, clientY: number) => {
    const r = wrapRef.current?.getBoundingClientRect()
    const sx = clientX - (r?.left ?? 0)
    const sy = clientY - (r?.top ?? 0)
    const v = viewRef.current
    return { x: (sx - v.tx) / v.scale, y: (sy - v.ty) / v.scale }
  }

  // onUp은 window 리스너라 [drag] 시점 클로저를 잡음 → 드래그 중 slots/groups가 바뀌어도 최신값을 읽도록 ref 미러.
  const liveRef = useRef({ slotById, groupIdSet })
  useEffect(() => {
    liveRef.current = { slotById, groupIdSet }
  })

  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      if (d.kind === "node") {
        const moved = d.moved || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4
        if (!moved) return
        if (!d.moved) setDrag({ ...d, moved: true })
        const w = toWorld(e.clientX, e.clientY)
        setLocalPos((prev) => ({ ...prev, [d.id]: { x: Math.max(0, w.x - d.ox), y: Math.max(0, w.y - d.oy) } }))
      } else if (d.kind === "pan") {
        setView((v) => ({ ...v, tx: d.tx0 + (e.clientX - d.sx), ty: d.ty0 + (e.clientY - d.sy) }))
      }
    }
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current
      const live = liveRef.current
      const clear = (id: string) =>
        setLocalPos((prev) => {
          const n = { ...prev }
          delete n[id]
          return n
        })
      if (d?.kind === "node" && d.moved) {
        const lp = localPosRef.current[d.id]
        if (lp) {
          const x = Math.round(lp.x)
          const y = Math.round(lp.y)
          if (d.id === POOL_ID) onMovePool(x, y)
          else if (live.groupIdSet.has(d.id)) onMoveGroup(d.id, x, y)
          else {
            // 그룹 항목은 컨테이너의 자식 → 드롭 지점 아래 [data-group-id]를 찾음(드래그 카드는 pointer-events:none).
            const el = document.elementFromPoint(e.clientX, e.clientY)
            const gid = (el?.closest("[data-group-id]") as HTMLElement | null)?.dataset.groupId ?? null
            const cur = live.slotById.get(d.id)?.category_id ?? null
            if (gid !== cur) {
              onUpdateSlot(d.id, gid ? { category_id: gid } : { category_id: null, x, y })
              clear(d.id) // 계산 위치(스택/자유)로 복귀
              if (gid) {
                setJustGrouped(d.id)
                setTimeout(() => setJustGrouped((p) => (p === d.id ? null : p)), 1000)
              }
            } else if (!gid) {
              onMoveAccount(d.id, x, y) // 자유 이동 → localPos 유지(reload 없음)
            } else {
              clear(d.id) // 같은 그룹에 도로 → flex 스택으로 복귀
            }
          }
        }
      }
      setDrag(null)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag])

  // ⌘/Ctrl + 휠 = 줌(커서 기준)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const cx = e.clientX - r.left
      const cy = e.clientY - r.top
      setView((v) => {
        const scale = Math.min(2.5, Math.max(0.3, v.scale * (e.deltaY < 0 ? 1.1 : 0.9)))
        const k = scale / v.scale
        return { scale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k }
      })
    }
    el.addEventListener("wheel", handler, { passive: false })
    return () => el.removeEventListener("wheel", handler)
  }, [])

  // 위치를 아는 노드(자유 슬롯·pool·그룹) 드래그 시작 — localPos 시드해 즉시 그 자리에서 뜸.
  const startDrag = (e: React.PointerEvent, id: string, p: { x: number; y: number }) => {
    e.stopPropagation()
    const w = toWorld(e.clientX, e.clientY)
    setDrag({ kind: "node", id, ox: w.x - p.x, oy: w.y - p.y, moved: false, sx: e.clientX, sy: e.clientY })
    setLocalPos((prev) => ({ ...prev, [id]: p }))
  }
  // 그룹 안 flex 카드 드래그 시작 — DOM에서 현재 월드 위치를 재서 리프트.
  const startFlexDrag = (e: React.PointerEvent, id: string) => {
    e.stopPropagation()
    const card = (e.currentTarget as HTMLElement).closest("[data-node-id]") as HTMLElement | null
    const rect = card?.getBoundingClientRect()
    const cw = rect ? toWorld(rect.left, rect.top) : slotPos(slotById.get(id)!)
    const w = toWorld(e.clientX, e.clientY)
    setDrag({ kind: "node", id, ox: w.x - cw.x, oy: w.y - cw.y, moved: false, sx: e.clientX, sy: e.clientY })
    setLocalPos((prev) => ({ ...prev, [id]: cw }))
  }
  const dragging = (id: string) => drag?.kind === "node" && drag.id === id
  const groupNet = (items: CashAccount[]) => items.reduce((a, s) => a + (slotCategory(s.kind) === "income" ? Number(s.amount) : -Number(s.amount)), 0)
  const pp = localPos[POOL_ID] ?? poolPos ?? { x: 380, y: 190 }
  const draggedSlot = drag?.kind === "node" ? slotById.get(drag.id) : undefined
  const liftedGrouped = draggedSlot && draggedSlot.category_id && localPos[draggedSlot.id] ? draggedSlot : null // 그룹에서 들린 카드(별도 절대배치)

  const slotCardProps = (s: CashAccount) => ({
    slot: s,
    calcTypes,
    onUpdateSlot,
    onDeleteSlot,
    onUngroup: s.category_id ? () => onUpdateSlot(s.id, { category_id: null, x: Math.round((localPos[s.id]?.x ?? 0) + 240) || 480, y: Math.round(localPos[s.id]?.y ?? 0) || 120 }) : undefined,
  })

  return (
    <div
      ref={wrapRef}
      onPointerDown={(e) => setDrag({ kind: "pan", sx: e.clientX, sy: e.clientY, tx0: view.tx, ty0: view.ty })}
      className={cn(
        "relative h-[600px] w-full select-none overflow-hidden rounded-2xl border bg-muted/15",
        "[background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:20px_20px]",
        drag?.kind === "pan" ? "cursor-grabbing" : "cursor-grab"
      )}
    >
      <div className="absolute left-2 top-2 z-10 flex gap-1.5">
        <button onClick={() => onAddSlot("revenue_src", "green")} className="inline-flex items-center gap-1 rounded-lg border bg-background/90 px-2 py-1 text-xs font-medium text-emerald-600 shadow-sm hover:bg-background">
          <Plus className="size-3" /> 매출
        </button>
        <button onClick={() => onAddSlot("expense_dst", "red")} className="inline-flex items-center gap-1 rounded-lg border bg-background/90 px-2 py-1 text-xs font-medium text-rose-600 shadow-sm hover:bg-background">
          <Plus className="size-3" /> 비용
        </button>
        <button onClick={onAddGroup} className="inline-flex items-center gap-1 rounded-lg border bg-background/90 px-2 py-1 text-xs font-medium text-muted-foreground shadow-sm hover:bg-background">
          <FolderPlus className="size-3" /> 그룹
        </button>
      </div>
      <div className="absolute right-2 top-2 z-10 rounded-md bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground">⌘/Ctrl+휠 확대 · 배경 드래그 이동 · 카드 ⠿ 손잡이로 이동·그룹</div>

      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}>
        {/* 그룹 컨테이너 — flex 세로 스택(자동 높이) */}
        {groups.map((g) => {
          const gp = groupPos(g)
          const items = (itemsByGroup.get(g.id) ?? []).filter((s) => !dragging(s.id))
          const allItems = itemsByGroup.get(g.id) ?? []
          return (
            <div key={g.id} data-group-id={g.id} style={{ left: gp.x - GPAD, top: gp.y - GTOP, width: NODE_W + GPAD * 2, zIndex: dragging(g.id) ? 40 : 1 }} className="absolute rounded-[20px] border border-border/70 bg-muted/25 shadow-sm">
              <div className="flex h-9 cursor-grab touch-none items-center gap-1.5 rounded-t-[20px] px-2.5 active:cursor-grabbing" onPointerDown={(e) => startDrag(e, g.id, gp)}>
                <button onPointerDown={(e) => e.stopPropagation()} onClick={() => onUpdateGroup(g.id, { collapsed: !g.collapsed })} className="shrink-0 text-muted-foreground/50 hover:text-foreground">
                  {g.collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                </button>
                <div className="min-w-0 flex-1" onPointerDown={(e) => e.stopPropagation()}>
                  <InlineText value={g.name} onCommit={(v) => onUpdateGroup(g.id, { name: v })} className="w-full text-[13px] font-bold" placeholder="그룹 이름" />
                </div>
                <span className="shrink-0 rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{allItems.length}</span>
                <button onPointerDown={(e) => e.stopPropagation()} onClick={() => onDeleteGroup(g.id)} title="그룹 해제(항목은 유지)" className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive">해제</button>
              </div>
              {!g.collapsed && items.length > 0 && (
                <div className="flex flex-col gap-1.5 px-1.5">
                  {items.map((s) => (
                    <SlotCard key={s.id} {...slotCardProps(s)} mode="flex" inGroup entering={justGrouped === s.id} onGrip={(e) => startFlexDrag(e, s.id)} />
                  ))}
                </div>
              )}
              {!g.collapsed && allItems.length === 0 && <div className="mx-1.5 rounded-xl border border-dashed border-border/60 px-2 py-4 text-center text-[10px] text-muted-foreground/50">여기로 박스를 끌어다 넣기</div>}
              <div className="mt-1.5 flex items-center justify-between gap-1 rounded-b-[20px] border-t border-border/50 bg-background/40 px-2.5 py-1.5 text-[11px] tabular-nums">
                <span className="text-muted-foreground">소계</span>
                <b className={groupNet(allItems) < 0 ? "text-rose-600" : "text-emerald-600"}>{money(groupNet(allItems), pool.currency)}</b>
              </div>
            </div>
          )
        })}

        {/* pool */}
        <div data-node-id={POOL_ID} style={{ left: pp.x, top: pp.y, width: NODE_W, pointerEvents: dragging(POOL_ID) ? "none" : undefined, zIndex: dragging(POOL_ID) ? 50 : 2 }} className="absolute overflow-hidden rounded-2xl border border-primary/40 bg-primary/[0.06] shadow-md ring-1 ring-primary/15">
          <div className="flex h-5 cursor-grab touch-none items-center bg-primary/10 px-1.5 active:cursor-grabbing" onPointerDown={(e) => startDrag(e, POOL_ID, pp)}>
            <GripVertical className="size-3 text-muted-foreground/60" />
          </div>
          <div className="px-3.5 pb-3 pt-1" onPointerDown={(e) => e.stopPropagation()}>
            <p className="text-[11px] font-medium uppercase tracking-wide text-primary/70">회사 가용 현금</p>
            <p className={cn("text-[20px] font-bold leading-tight tabular-nums", pool.available < 0 ? "text-rose-600" : "text-foreground")}>{money(pool.available, pool.currency)}</p>
            <div className="mt-1.5 space-y-0.5 border-t border-primary/15 pt-1.5 text-[10px] tabular-nums text-muted-foreground">
              <Line label="시작 보유" v={money(pool.opening, pool.currency)} />
              <Line label="+ 매출" v={money(pool.revenue, pool.currency)} cls="text-emerald-600" />
              <Line label="− 비용" v={money(pool.expense, pool.currency)} cls="text-rose-600" />
              <Line label="순이익" v={money(pool.netProfit, pool.currency)} cls={cn("font-semibold", pool.netProfit < 0 ? "text-rose-600" : "text-foreground")} />
            </div>
          </div>
        </div>

        {/* 자유 슬롯(절대배치) */}
        {freeSlots.map((s) => (
          <SlotCard key={s.id} {...slotCardProps(s)} mode="absolute" pos={slotPos(s)} dragging={dragging(s.id)} inGroup={false} onGrip={(e) => startDrag(e, s.id, slotPos(s))} />
        ))}

        {/* 그룹에서 들어올린 카드(드래그 중) — 컨테이너 밖, 맨 위 */}
        {liftedGrouped && <SlotCard {...slotCardProps(liftedGrouped)} mode="absolute" pos={localPos[liftedGrouped.id]} dragging inGroup onGrip={(e) => startFlexDrag(e, liftedGrouped.id)} />}
      </div>
    </div>
  )
}

function SlotCard({
  slot: s,
  calcTypes,
  mode,
  pos,
  dragging,
  inGroup,
  entering,
  onGrip,
  onUpdateSlot,
  onDeleteSlot,
  onUngroup,
}: {
  slot: CashAccount
  calcTypes: CashCalcType[]
  mode: "flex" | "absolute"
  pos?: { x: number; y: number }
  dragging?: boolean
  inGroup: boolean
  entering?: boolean
  onGrip: (e: React.PointerEvent) => void
  onUpdateSlot: (id: string, patch: Partial<CashAccount>) => void
  onDeleteSlot: (slot: CashAccount) => void
  onUngroup?: () => void
}) {
  const isCustom = !!s.calc_type_id
  const calc = isCustom || s.item_type === "qty" || s.item_type === "channel"
  const { fields, getVal, setVal } = fieldsOf(s, calcTypes, onUpdateSlot)
  const style = mode === "absolute" ? { left: pos?.x, top: pos?.y, width: NODE_W, pointerEvents: dragging ? ("none" as const) : undefined, zIndex: dragging ? 50 : 3 } : { width: NODE_W }
  return (
    <div data-node-id={s.id} style={style} className={cn("group/card overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md", mode === "absolute" && "absolute", entering && "cf-bubble-in")}>
      <div className="flex h-6 cursor-grab touch-none items-center gap-1 px-2 hover:bg-muted/30 active:cursor-grabbing" onPointerDown={onGrip}>
        <GripVertical className="size-3 text-muted-foreground/40" />
        <span className="size-2 rounded-full" style={{ backgroundColor: tagBg(s.color, 90) }} />
        <span className="flex-1" />
        {inGroup && onUngroup && (
          <button onPointerDown={(e) => e.stopPropagation()} onClick={onUngroup} title="그룹에서 빼기" className="text-muted-foreground/40 opacity-0 transition-opacity hover:text-foreground group-hover/card:opacity-100">
            <CornerUpRight className="size-3" />
          </button>
        )}
        <button onPointerDown={(e) => e.stopPropagation()} onClick={() => onDeleteSlot(s)} title="삭제" className="text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover/card:opacity-100">
          <Trash2 className="size-3" />
        </button>
      </div>
      <div className="flex flex-col gap-1 px-2.5 pb-2 pt-1" onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5">
          {isCustom ? (
            <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: tagBg(s.color, 22) }}>{slotLabel(s.kind)}</span>
          ) : (
            <select value={s.kind} onChange={(e) => onUpdateSlot(s.id, { kind: e.target.value })} style={{ backgroundColor: tagBg(s.color, 22) }} className="shrink-0 cursor-pointer rounded-full border-0 px-1.5 py-0.5 text-[10px] font-medium outline-none focus:ring-1 focus:ring-ring">
              {SLOT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          )}
          <div className="min-w-0 flex-1">
            <InlineText value={s.name} onCommit={(v) => onUpdateSlot(s.id, { name: v })} className="w-full text-sm font-semibold" />
          </div>
        </div>
        {calc ? (
          <>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {fields.map((fld) => (
                <label key={fld.key} className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  {fld.label}
                  {fld.kind === "percent" ? <InlinePercent value={getVal(fld.key)} onCommit={(v) => setVal(fld.key, v)} /> : <InlineNumber value={getVal(fld.key)} onCommit={(v) => setVal(fld.key, v)} width="w-14" />}
                </label>
              ))}
            </div>
            <p className="text-right text-sm font-bold tabular-nums">{money(Number(s.amount), s.currency)}</p>
          </>
        ) : (
          <div className="text-right">
            <InlineNumber value={Number(s.amount)} onCommit={(v) => onUpdateSlot(s.id, { amount: v })} width="w-full" />
          </div>
        )}
        <InlineText value={s.note ?? ""} onCommit={(v) => onUpdateSlot(s.id, { note: v })} className="w-full text-[11px] text-muted-foreground" placeholder="설명" />
      </div>
    </div>
  )
}

function Line({ label, v, cls }: { label: string; v: string; cls?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{label}</span>
      <span className={cls}>{v}</span>
    </div>
  )
}
