"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { GripVertical, Trash2, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { money } from "@/lib/finance"
import { tagBg } from "@/lib/meetingMeta"
import { POOL_ID, type CashNode, type CashEdge, type CashSummary } from "@/lib/cashflowGraph"
import { SLOT_TYPES, slotLabel, fieldsOf } from "@/lib/cashAccounts"
import { InlineText, InlineNumber, InlinePercent } from "./inline"
import type { CashAccount, CashCalcType } from "@/types"

const NODE_W = 210
const PORT_Y = 34 // 카드 헤더 높이 ≈ 엣지 연결 y

type Drag =
  | { kind: "node"; id: string; ox: number; oy: number; moved: boolean; sx: number; sy: number }
  | { kind: "pan"; sx: number; sy: number; tx0: number; ty0: number }
  | null

/**
 * 편집 가능한 현금흐름 캔버스 — 카드 상단 그립으로 드래그(입력칸과 충돌 없음), 회사 가용현금(pool)도 드래그.
 * 박스 안에서 구분·이름·금액(또는 계산필드)·설명 편집. ⌘/Ctrl+휠 줌, 배경 드래그 팬. 엣지 두께=금액(화살촉 없음).
 */
export function CashFlowCanvas({
  nodes,
  edges,
  slots,
  calcTypes,
  pool,
  onUpdateSlot,
  onDeleteSlot,
  onAddSlot,
  onMoveAccount,
  onMovePool,
}: {
  nodes: CashNode[]
  edges: CashEdge[]
  slots: CashAccount[]
  calcTypes: CashCalcType[]
  pool: CashSummary
  onUpdateSlot: (id: string, patch: Partial<CashAccount>) => void
  onDeleteSlot: (slot: CashAccount) => void
  onAddSlot: (kind: string, color: string) => void
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
  const viewRef = useRef(view)
  useEffect(() => {
    viewRef.current = view
  }, [view])
  const [localPos, setLocalPos] = useState<Record<string, { x: number; y: number }>>({})
  const localPosRef = useRef(localPos)
  useEffect(() => {
    localPosRef.current = localPos
  }, [localPos])

  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots])
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const posOf = (n: CashNode) => localPos[n.id] ?? { x: n.x ?? 0, y: n.y ?? 0 }
  const posOfId = (id: string) => {
    const n = nodeById.get(id)
    return localPos[id] ?? { x: n?.x ?? 0, y: n?.y ?? 0 }
  }

  const toWorld = (clientX: number, clientY: number) => {
    const r = wrapRef.current?.getBoundingClientRect()
    const sx = clientX - (r?.left ?? 0)
    const sy = clientY - (r?.top ?? 0)
    const v = viewRef.current
    return { x: (sx - v.tx) / v.scale, y: (sy - v.ty) / v.scale }
  }
  const portPos = (id: string, side: "in" | "out") => {
    const p = posOfId(id)
    return { x: p.x + (side === "out" ? NODE_W : 0), y: p.y + PORT_Y }
  }

  // 드래그(그립=노드 / 배경=팬)
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
    const onUp = () => {
      const d = dragRef.current
      if (d?.kind === "node" && d.moved) {
        const lp = localPosRef.current[d.id]
        if (lp) {
          if (d.id === POOL_ID) onMovePool(Math.round(lp.x), Math.round(lp.y))
          else onMoveAccount(d.id, Math.round(lp.x), Math.round(lp.y))
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

  // ⌘/Ctrl + 휠 = 줌(커서 기준, 네이티브 passive:false)
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

  const startNodeDrag = (e: React.PointerEvent, id: string) => {
    e.stopPropagation()
    const w = toWorld(e.clientX, e.clientY)
    const p = posOfId(id)
    setDrag({ kind: "node", id, ox: w.x - p.x, oy: w.y - p.y, moved: false, sx: e.clientX, sy: e.clientY })
  }
  const edgeStroke = (k: CashEdge["kind"]) => (k === "revenue" ? "#10b981" : k === "expense" ? "#f43f5e" : "#3b82f6")
  const maxEdge = Math.max(1, ...edges.map((e) => e.amount))
  const ew = (a: number) => 2 + Math.min(12, Math.sqrt(a / maxEdge) * 12)

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
      {/* 툴바 */}
      <div className="absolute left-2 top-2 z-10 flex gap-1.5">
        <button onClick={() => onAddSlot("revenue_src", "green")} className="inline-flex items-center gap-1 rounded-lg border bg-background/90 px-2 py-1 text-xs font-medium text-emerald-600 shadow-sm hover:bg-background">
          <Plus className="size-3" /> 매출
        </button>
        <button onClick={() => onAddSlot("expense_dst", "red")} className="inline-flex items-center gap-1 rounded-lg border bg-background/90 px-2 py-1 text-xs font-medium text-rose-600 shadow-sm hover:bg-background">
          <Plus className="size-3" /> 비용
        </button>
      </div>
      <div className="absolute right-2 top-2 z-10 rounded-md bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground">⌘/Ctrl+휠 확대 · 배경 드래그 이동 · 카드 ⠿ 손잡이로 이동</div>

      {/* 변환 래퍼(줌/팬) */}
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}>
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}>
          {edges.map((edge) => {
            const a = portPos(edge.source, "out")
            const b = portPos(edge.target, "in")
            const mx = (a.x + b.x) / 2
            const my = (a.y + b.y) / 2
            return (
              <g key={edge.id}>
                <path d={bezier(a, b)} fill="none" stroke={edgeStroke(edge.kind)} strokeWidth={ew(edge.amount)} strokeLinecap="round" className="opacity-60" />
                <text x={mx} y={my - 5} textAnchor="middle" className="fill-foreground text-[10px] font-medium" style={{ paintOrder: "stroke", stroke: "var(--color-background)", strokeWidth: 3 }}>
                  {money(edge.amount, edge.currency)}
                </text>
              </g>
            )
          })}
        </svg>

        {nodes.map((node) => {
          const p = posOf(node)
          if (node.kind === "pool") {
            return (
              <div key={node.id} data-node-id={node.id} style={{ left: p.x, top: p.y, width: NODE_W }} className="absolute overflow-hidden rounded-2xl border border-primary/40 bg-primary/[0.06] shadow-md ring-1 ring-primary/15">
                <Grip onPointerDown={(e) => startNodeDrag(e, node.id)} tone="primary" />
                <div className="px-3.5 pb-3 pt-1" onPointerDown={(e) => e.stopPropagation()}>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-primary/70">회사 가용 현금</p>
                  <p className={cn("text-[20px] font-bold leading-tight tabular-nums", pool.available < 0 ? "text-rose-600" : "text-foreground")}>{money(pool.available, pool.currency)}</p>
                  <div className="mt-1.5 space-y-0.5 border-t border-primary/15 pt-1.5 text-[10px] tabular-nums text-muted-foreground">
                    <Line label="시작 보유" v={money(pool.opening, pool.currency)} />
                    <Line label="+ 매출" v={money(pool.revenue, pool.currency)} cls="text-emerald-600" />
                    <Line label="− 비용" v={money(pool.expense, pool.currency)} cls="text-rose-600" />
                    {pool.reserve > 0 && <Line label="− 보유" v={money(pool.reserve, pool.currency)} cls="text-blue-600" />}
                    <Line label="순이익" v={money(pool.netProfit, pool.currency)} cls={cn("font-semibold", pool.netProfit < 0 ? "text-rose-600" : "text-foreground")} />
                  </div>
                </div>
              </div>
            )
          }
          const s = slotById.get(node.id)
          if (!s) return null
          const isCustom = !!s.calc_type_id
          const calc = isCustom || s.item_type === "qty" || s.item_type === "channel"
          const { fields, getVal, setVal } = fieldsOf(s, calcTypes, onUpdateSlot)
          return (
            <div key={node.id} data-node-id={node.id} style={{ left: p.x, top: p.y, width: NODE_W }} className="absolute overflow-hidden rounded-2xl border bg-card shadow-sm">
              <Grip onPointerDown={(e) => startNodeDrag(e, node.id)} onDelete={() => onDeleteSlot(s)} color={s.color} />
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
                <InlineText value={s.note ?? ""} onCommit={(v) => onUpdateSlot(s.id, { note: v })} className="w-full text-[11px] text-muted-foreground" />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Grip({ onPointerDown, onDelete, color, tone }: { onPointerDown: (e: React.PointerEvent) => void; onDelete?: () => void; color?: string; tone?: "primary" }) {
  return (
    <div className={cn("flex h-5 cursor-grab touch-none items-center px-1.5 active:cursor-grabbing", tone === "primary" ? "bg-primary/10" : "bg-muted/60")} onPointerDown={onPointerDown}>
      <GripVertical className="size-3 text-muted-foreground/60" />
      {color && <span className="ml-1 size-2 rounded-full" style={{ backgroundColor: tagBg(color, 90) }} />}
      <span className="flex-1" />
      {onDelete && (
        <button onPointerDown={(e) => e.stopPropagation()} onClick={onDelete} className="text-muted-foreground/60 hover:text-destructive" title="삭제">
          <Trash2 className="size-3" />
        </button>
      )}
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

function bezier(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5)
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
}
