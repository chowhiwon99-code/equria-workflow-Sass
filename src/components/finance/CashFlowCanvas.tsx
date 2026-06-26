"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { money } from "@/lib/finance"
import { kindIcon } from "@/lib/cashAccounts"
import { tagBg } from "@/lib/meetingMeta"
import type { CashNode, CashEdge } from "@/lib/cashflowGraph"

const NODE_W = 136
const NODE_H = 60

type Drag =
  | { kind: "node"; id: string; ox: number; oy: number; moved: boolean }
  | { kind: "wire"; source: string; x: number; y: number }
  | { kind: "pan"; sx: number; sy: number; tx0: number; ty0: number }
  | null

/**
 * 현금 흐름도 — WorkflowCanvas 포크. 노드=계좌(잔액 보유) + 합성 카테고리(매출처/지출처).
 * 엣지=돈의 이동(금액 라벨·방향 화살표·종류 색). 출력 포트를 끌어 다른 계좌에 놓으면 이체 생성.
 * ⌘/Ctrl+휠 줌, 배경 드래그 팬, 노드 호버 시 in/out 엣지 강조.
 */
export function CashFlowCanvas({
  nodes,
  edges,
  onMoveAccount,
  onCreateTransfer,
}: {
  nodes: CashNode[]
  edges: CashEdge[]
  onMoveAccount: (id: string, x: number, y: number) => void
  onCreateTransfer: (fromId: string, toId: string) => void
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

  const nodeAtPoint = (clientX: number, clientY: number): string | null => {
    const el = document.elementFromPoint(clientX, clientY)
    const host = el?.closest("[data-node-id]") as HTMLElement | null
    return host?.dataset.nodeId ?? null
  }

  // 드래그(노드 이동 / 이체 끈 / 팬)
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
      } else if (d.kind === "wire") {
        const w = toWorld(e.clientX, e.clientY)
        setDrag({ ...d, x: w.x, y: w.y })
      } else if (d.kind === "pan") {
        setView((v) => ({ ...v, tx: d.tx0 + (e.clientX - d.sx), ty: d.ty0 + (e.clientY - d.sy) }))
      }
    }
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current
      if (d?.kind === "node" && d.moved) {
        const lp = localPosRef.current[d.id]
        if (lp) onMoveAccount(d.id, Math.round(lp.x), Math.round(lp.y))
      } else if (d?.kind === "wire") {
        const targetId = nodeAtPoint(e.clientX, e.clientY)
        const src = nodeById.get(d.source)
        const tgt = targetId ? nodeById.get(targetId) : null
        if (tgt && targetId !== d.source && src && !src.synthetic && !tgt.synthetic) {
          onCreateTransfer(d.source, targetId as string)
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

  // ⌘/Ctrl + 휠 = 줌(커서 기준). 네이티브 리스너(passive:false)로 preventDefault.
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

  const edgeStroke = (k: CashEdge["kind"]) =>
    k === "revenue" ? "#10b981" : k === "expense" ? "#f43f5e" : "#3b82f6"

  const dim = (id: string) => neighbors != null && !neighbors.has(id)

  return (
    <div
      ref={wrapRef}
      onPointerDown={(e) => setDrag({ kind: "pan", sx: e.clientX, sy: e.clientY, tx0: view.tx, ty0: view.ty })}
      className={cn(
        "relative h-[420px] w-full select-none overflow-hidden rounded-xl border bg-muted/20",
        "[background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:18px_18px]",
        drag?.kind === "wire" ? "cursor-crosshair" : drag?.kind === "pan" ? "cursor-grabbing" : "cursor-grab"
      )}
    >
      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center">
          <p className="text-sm text-muted-foreground">계좌를 추가하면 노드로 나타나요. 노드를 드래그해 배치하고, 오른쪽 점을 끌어 다른 계좌로 이체하세요.</p>
        </div>
      )}
      <div className="absolute right-2 top-2 z-10 rounded-md bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground">⌘/Ctrl+휠 확대 · 배경 드래그 이동</div>

      {/* 변환 래퍼(줌/팬) — SVG 엣지 + 노드 함께 */}
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
                <path d={bezier(a, b)} fill="none" stroke={edgeStroke(edge.kind)} strokeWidth={1.5 + Math.min(4, Math.log10(Math.max(10, edge.amount)))} markerEnd="url(#cf-arrow)" className="opacity-70" />
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
          {drag?.kind === "wire" &&
            (() => {
              const a = portPos(drag.source, "out")
              return <path d={bezier(a, { x: drag.x, y: drag.y })} fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeDasharray="4 4" />
            })()}
        </svg>

        {/* 노드 */}
        {nodes.map((n) => {
          const p = posOf(n)
          const Icon = kindIcon(n.kind)
          const faded = dim(n.id)
          return (
            <div
              key={n.id}
              data-node-id={n.id}
              style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H, opacity: faded ? 0.25 : 1, transition: drag ? "none" : "opacity 0.15s" }}
              onPointerEnter={() => setHover(n.id)}
              onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
              onPointerDown={(e) => {
                e.stopPropagation()
                if (n.synthetic) return
                const w = toWorld(e.clientX, e.clientY)
                setDrag({ kind: "node", id: n.id, ox: w.x - p.x, oy: w.y - p.y, moved: false })
              }}
              className={cn(
                "absolute flex touch-none flex-col justify-center rounded-lg border px-2.5 shadow-sm",
                n.synthetic ? "border-dashed bg-muted/40 text-muted-foreground" : "cursor-grab bg-card active:cursor-grabbing"
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="grid size-4 shrink-0 place-items-center rounded" style={{ backgroundColor: tagBg(n.color, 40) }}>
                  <Icon className="size-3" />
                </span>
                <span className="truncate text-xs font-semibold">{n.label}</span>
              </div>
              {!n.synthetic && <span className="mt-0.5 truncate text-[11px] tabular-nums text-muted-foreground">{money(n.balance, n.currency)}</span>}

              {/* 입력 포트 */}
              {!n.synthetic && <span className="absolute -left-1.5 top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-background bg-muted-foreground/40" aria-hidden />}
              {/* 출력 포트 — 끌어 이체 */}
              {!n.synthetic && (
                <span
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    const w = toWorld(e.clientX, e.clientY)
                    setDrag({ kind: "wire", source: n.id, x: w.x, y: w.y })
                  }}
                  title="끌어서 다른 계좌로 이체"
                  className="absolute -right-1.5 top-1/2 size-3.5 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-background bg-primary hover:scale-125"
                />
              )}
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
