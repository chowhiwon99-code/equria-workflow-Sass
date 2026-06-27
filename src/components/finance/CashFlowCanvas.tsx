"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { money } from "@/lib/finance"
import { tagBg } from "@/lib/meetingMeta"
import { POOL_ID, type CashNode, type CashEdge } from "@/lib/cashflowGraph"

const NODE_W = 140
const NODE_H = 58

type Drag =
  | { kind: "node"; id: string; ox: number; oy: number; moved: boolean }
  | { kind: "pan"; sx: number; sy: number; tx0: number; ty0: number }
  | null

/**
 * 현금 흐름도 — 슬롯(돈 항목) 노드 + 회사 허브. 매출→회사→비용/보유금.
 * 그리드에서 금액을 바꾸면 부모가 다시 그려 즉시 반영. 노드 드래그 재배치·호버 강조·⌘휠 줌·배경 팬.
 */
export function CashFlowCanvas({
  nodes,
  edges,
  onMoveAccount,
}: {
  nodes: CashNode[]
  edges: CashEdge[]
  onMoveAccount: (id: string, x: number, y: number) => void
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
  const [hover, setHover] = useState<string | null>(null)
  const [localPos, setLocalPos] = useState<Record<string, { x: number; y: number }>>({})
  const localPosRef = useRef(localPos)
  useEffect(() => {
    localPosRef.current = localPos
  }, [localPos])

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const posOf = (n: CashNode) => localPos[n.id] ?? { x: n.x ?? 0, y: n.y ?? 0 }

  const neighbors = useMemo(() => {
    if (!hover) return null
    const s = new Set<string>([hover])
    for (const e of edges) {
      if (e.source === hover) s.add(e.target)
      if (e.target === hover) s.add(e.source)
    }
    return s
  }, [hover, edges])

  // 슬롯 id → flow(매출/비용/보유) — 호버 툴팁용
  const flowByNode = useMemo(() => {
    const m = new Map<string, CashEdge["kind"]>()
    for (const e of edges) m.set(e.source === POOL_ID ? e.target : e.source, e.kind)
    return m
  }, [edges])
  const available = nodeById.get(POOL_ID)?.balance ?? 0

  const toWorld = (clientX: number, clientY: number) => {
    const r = wrapRef.current?.getBoundingClientRect()
    const sx = clientX - (r?.left ?? 0)
    const sy = clientY - (r?.top ?? 0)
    const v = viewRef.current
    return { x: (sx - v.tx) / v.scale, y: (sy - v.ty) / v.scale }
  }

  const portPos = (id: string, side: "in" | "out") => {
    const n = nodeById.get(id)
    if (!n) return { x: 0, y: 0 }
    const p = posOf(n)
    return { x: p.x + (side === "out" ? NODE_W : 0), y: p.y + NODE_H / 2 }
  }

  // 드래그(노드 재배치 / 배경 팬)
  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      if (d.kind === "node") {
        const w = toWorld(e.clientX, e.clientY)
        const nx = Math.max(0, w.x - d.ox)
        const ny = Math.max(0, w.y - d.oy)
        if (!d.moved) setDrag({ ...d, moved: true })
        setLocalPos((prev) => ({ ...prev, [d.id]: { x: nx, y: ny } }))
      } else if (d.kind === "pan") {
        setView((v) => ({ ...v, tx: d.tx0 + (e.clientX - d.sx), ty: d.ty0 + (e.clientY - d.sy) }))
      }
    }
    const onUp = () => {
      const d = dragRef.current
      if (d?.kind === "node" && d.moved) {
        const lp = localPosRef.current[d.id]
        if (lp) onMoveAccount(d.id, Math.round(lp.x), Math.round(lp.y))
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

  // ⌘/Ctrl + 휠 = 줌(커서 기준). 네이티브 리스너(passive:false).
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

  const edgeStroke = (k: CashEdge["kind"]) => (k === "revenue" ? "#10b981" : k === "expense" ? "#f43f5e" : "#3b82f6")
  const dim = (id: string) => neighbors != null && !neighbors.has(id)

  return (
    <div
      ref={wrapRef}
      onPointerDown={(e) => setDrag({ kind: "pan", sx: e.clientX, sy: e.clientY, tx0: view.tx, ty0: view.ty })}
      className={cn(
        "relative h-[440px] w-full select-none overflow-hidden rounded-xl border bg-muted/20",
        "[background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:18px_18px]",
        drag?.kind === "pan" ? "cursor-grabbing" : "cursor-grab"
      )}
    >
      {nodes.length <= 1 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center">
          <p className="text-sm text-muted-foreground">아래 표에서 항목을 추가하고 금액을 입력하면 흐름이 그려져요. 매출은 왼쪽, 비용·보유금은 오른쪽.</p>
        </div>
      )}
      <div className="absolute right-2 top-2 z-10 rounded-md bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground">⌘/Ctrl+휠 확대 · 배경 드래그 이동</div>

      {/* 변환 래퍼(줌/팬) */}
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}>
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}>
          <defs>
            <marker id="cf-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" className="fill-muted-foreground" />
            </marker>
          </defs>
          {edges.map((edge) => {
            const a = portPos(edge.source, "out")
            const b = portPos(edge.target, "in")
            const mx = (a.x + b.x) / 2
            const my = (a.y + b.y) / 2
            const faded = dim(edge.source) && dim(edge.target)
            return (
              <g key={edge.id} style={{ opacity: faded ? 0.15 : 1 }}>
                <path
                  d={bezier(a, b)}
                  fill="none"
                  stroke={edgeStroke(edge.kind)}
                  strokeWidth={1.5 + Math.min(4, Math.log10(Math.max(10, edge.amount)))}
                  markerEnd="url(#cf-arrow)"
                  className="opacity-70"
                />
                <text
                  x={mx}
                  y={my - 4}
                  textAnchor="middle"
                  className="fill-foreground text-[10px] font-medium"
                  style={{ paintOrder: "stroke", stroke: "var(--color-background)", strokeWidth: 3 }}
                >
                  {money(edge.amount, edge.currency)}
                </text>
              </g>
            )
          })}
        </svg>

        {/* 노드 */}
        {nodes.map((node) => {
          const p = posOf(node)
          const faded = dim(node.id)

          // 가운데 풀 — 가용현금 + 분해(시작/매출/비용/보유/순이익)
          if (node.kind === "pool") {
            const negative = node.balance < 0
            return (
              <div
                key={node.id}
                data-node-id={node.id}
                style={{ left: p.x, top: p.y, width: 190, opacity: faded ? 0.3 : 1, transition: drag ? "none" : "opacity 0.15s" }}
                onPointerEnter={() => setHover(node.id)}
                onPointerLeave={() => setHover((h) => (h === node.id ? null : h))}
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute flex flex-col gap-0.5 rounded-2xl border border-primary/40 bg-primary/10 px-3.5 py-3 shadow-md ring-1 ring-primary/20"
              >
                <span className="text-[11px] font-medium text-muted-foreground">{node.label}</span>
                <span className={cn("text-base font-bold tabular-nums", negative ? "text-rose-600" : "text-foreground")}>{money(node.balance, node.currency)}</span>
                <div className="mt-1 space-y-0.5 border-t pt-1 text-[10px] tabular-nums text-muted-foreground">
                  <PoolLine label="시작 보유" v={money(node.opening ?? 0, node.currency)} />
                  <PoolLine label="+ 매출" v={money(node.revenue ?? 0, node.currency)} cls="text-emerald-600" />
                  <PoolLine label="− 비용" v={money(node.expense ?? 0, node.currency)} cls="text-rose-600" />
                  {(node.reserve ?? 0) > 0 && <PoolLine label="− 보유" v={money(node.reserve ?? 0, node.currency)} cls="text-blue-600" />}
                  <PoolLine label="순이익" v={money(node.netProfit ?? 0, node.currency)} cls={cn("font-semibold", (node.netProfit ?? 0) < 0 ? "text-rose-600" : "text-foreground")} />
                </div>
              </div>
            )
          }

          // 슬롯 — 호버 시 효과 툴팁("이 비용이 없으면 가용 ₩X")
          const flow = flowByNode.get(node.id)
          const tip =
            flow === "revenue"
              ? `이 매출이 가용현금을 ${money(node.balance, node.currency)} 늘려요`
              : flow === "reserve"
                ? `보유/적립 ${money(node.balance, node.currency)} — 가용현금에서 빠져 자산으로 쌓여요`
                : `이 비용이 없으면 가용현금이 ${money(available + node.balance, node.currency)} 였을 거예요`
          return (
            <div
              key={node.id}
              data-node-id={node.id}
              title={tip}
              style={{ left: p.x, top: p.y, width: NODE_W, minHeight: NODE_H, opacity: faded ? 0.25 : 1, transition: drag ? "none" : "opacity 0.15s" }}
              onPointerEnter={() => setHover(node.id)}
              onPointerLeave={() => setHover((h) => (h === node.id ? null : h))}
              onPointerDown={(e) => {
                e.stopPropagation()
                const w = toWorld(e.clientX, e.clientY)
                setDrag({ kind: "node", id: node.id, ox: w.x - p.x, oy: w.y - p.y, moved: false })
              }}
              className="absolute flex cursor-grab touch-none flex-col justify-center rounded-xl border bg-card px-3 py-2 shadow-sm active:cursor-grabbing"
            >
              <div className="flex items-center gap-1.5">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tagBg(node.color, 90) }} />
                <span className="truncate text-xs font-semibold">{node.label}</span>
              </div>
              <span className="mt-0.5 truncate text-[11px] tabular-nums text-muted-foreground">{money(node.balance, node.currency)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function bezier(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5)
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
}

function PoolLine({ label, v, cls }: { label: string; v: string; cls?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{label}</span>
      <span className={cls}>{v}</span>
    </div>
  )
}
