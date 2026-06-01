"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type { WorkflowNode, WorkflowEdge, WorkflowGraph } from "@/lib/workflows"
import { genId } from "@/lib/workflows"
import { toolEmoji } from "@/lib/workflowTools"

const NODE = 72 // 원 지름
const LABEL_W = 132 // 노드 아래 라벨 폭

export type NodeRunState = "idle" | "running" | "done" | "error"

type DragState =
  | { kind: "node"; nodeId: string; offsetX: number; offsetY: number; moved: boolean }
  | { kind: "wire"; source: string; x: number; y: number }
  | null

/** n8n 스타일 캔버스 — 원형 노드 드래그 이동 + 포트를 끌어 끈(베지어) 연결. */
export function WorkflowCanvas({
  graph,
  onChange,
  selectedId,
  onSelect,
  runStates,
  readOnly = false,
}: {
  graph: WorkflowGraph
  onChange: (g: WorkflowGraph) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  runStates?: Record<string, NodeRunState>
  readOnly?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState>(null)
  const dragRef = useRef<DragState>(null)
  // 렌더 중 ref 쓰기 금지(react-hooks/refs) — effect에서 최신 drag를 미러링
  useEffect(() => {
    dragRef.current = drag
  }, [drag])

  const { nodes, edges } = graph

  // 포트 중심(원 기준). out = 오른쪽, in = 왼쪽. 노드 중심 y = top + NODE/2.
  const portPos = useCallback(
    (nodeId: string, side: "in" | "out") => {
      const n = nodes.find((x) => x.id === nodeId)
      if (!n) return { x: 0, y: 0 }
      return { x: n.x + (side === "out" ? NODE : 0), y: n.y + NODE / 2 }
    },
    [nodes]
  )

  const toCanvas = (clientX: number, clientY: number) => {
    const r = wrapRef.current?.getBoundingClientRect()
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) }
  }

  const onNodePointerDown = (e: React.PointerEvent, n: WorkflowNode) => {
    e.stopPropagation()
    onSelect(n.id)
    if (readOnly) return
    const p = toCanvas(e.clientX, e.clientY)
    setDrag({ kind: "node", nodeId: n.id, offsetX: p.x - n.x, offsetY: p.y - n.y, moved: false })
  }

  const onPortPointerDown = (e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation()
    if (readOnly) return
    const p = toCanvas(e.clientX, e.clientY)
    setDrag({ kind: "wire", source: nodeId, x: p.x, y: p.y })
  }

  // 포인터 위치의 노드 id(끈 연결 대상 판정). 반응형 의존성 없음 → 안정 참조.
  const nodeAtPoint = useCallback((clientX: number, clientY: number): string | null => {
    const el = document.elementFromPoint(clientX, clientY)
    const host = el?.closest("[data-node-id]") as HTMLElement | null
    return host?.dataset.nodeId ?? null
  }, [])

  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => {
      const p = toCanvas(e.clientX, e.clientY)
      const d = dragRef.current
      if (!d) return
      if (d.kind === "node") {
        const nx = Math.max(0, p.x - d.offsetX)
        const ny = Math.max(0, p.y - d.offsetY)
        if (!d.moved) setDrag({ ...d, moved: true })
        onChange({
          edges,
          nodes: nodes.map((n) => (n.id === d.nodeId ? { ...n, x: nx, y: ny } : n)),
        })
      } else if (d.kind === "wire") {
        setDrag({ ...d, x: p.x, y: p.y })
      }
    }
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current
      if (d?.kind === "wire") {
        const target = nodeAtPoint(e.clientX, e.clientY)
        if (target && target !== d.source) {
          const exists = edges.some((x) => x.source === d.source && x.target === target)
          if (!exists) {
            onChange({ nodes, edges: [...edges, { id: genId("e"), source: d.source, target }] })
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
  }, [drag, nodes, edges, onChange])

  const removeEdge = (id: string) => {
    if (readOnly) return
    onChange({ nodes, edges: edges.filter((e) => e.id !== id) })
  }

  const stateRing: Record<NodeRunState, string> = {
    idle: "",
    running: "ring-4 ring-primary/40 animate-pulse",
    done: "ring-4 ring-green-500/50",
    error: "ring-4 ring-destructive/50",
  }

  return (
    <div
      ref={wrapRef}
      onPointerDown={() => onSelect(null)}
      className={cn(
        "relative h-[480px] w-full overflow-auto rounded-xl border bg-muted/20",
        "[background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:18px_18px]",
        drag?.kind === "wire" && "cursor-crosshair"
      )}
    >
      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center">
          <p className="text-sm text-muted-foreground">
            아래에서 에이전트를 추가하면 동그라미 노드로 나타나요. 노드를 드래그해 배치하고, 오른쪽 점을 끌어 다음 노드와 연결하세요.
          </p>
        </div>
      )}

      {/* 끈(베지어) 레이어 */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        <defs>
          <marker id="wf-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" className="fill-muted-foreground/60" />
          </marker>
        </defs>
        {edges.map((edge) => {
          const a = portPos(edge.source, "out")
          const b = portPos(edge.target, "in")
          const mx = (a.x + b.x) / 2
          const my = (a.y + b.y) / 2
          return (
            <g key={edge.id} className="pointer-events-auto">
              <path
                d={bezier(a, b)}
                fill="none"
                stroke="var(--color-muted-foreground)"
                strokeWidth={2}
                markerEnd="url(#wf-arrow)"
                className="opacity-60"
              />
              {!readOnly && (
                <>
                  <circle
                    cx={mx}
                    cy={my}
                    r={8}
                    className="cursor-pointer fill-background stroke-border hover:fill-destructive/10"
                    onClick={() => removeEdge(edge.id)}
                  />
                  <text
                    x={mx}
                    y={my + 3}
                    textAnchor="middle"
                    className="pointer-events-none select-none fill-muted-foreground text-[10px]"
                  >
                    ✕
                  </text>
                </>
              )}
            </g>
          )
        })}
        {drag?.kind === "wire" &&
          (() => {
            const a = portPos(drag.source, "out")
            return (
              <path
                d={bezier(a, { x: drag.x, y: drag.y })}
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth={2}
                strokeDasharray="4 4"
              />
            )
          })()}
      </svg>

      {/* 노드 레이어 — 원형 + 아래 라벨(이름·하는 일) */}
      {nodes.map((n, idx) => {
        const selected = n.id === selectedId
        const st = runStates?.[n.id] ?? "idle"
        const subtitle = n.note?.trim() || n.agent_desc?.trim() || "역할 미설정"
        return (
          <div
            key={n.id}
            data-node-id={n.id}
            style={{ left: n.x + NODE / 2 - LABEL_W / 2, top: n.y, width: LABEL_W }}
            className="absolute flex flex-col items-center"
          >
            {/* 원형 노드 */}
            <div
              onPointerDown={(e) => onNodePointerDown(e, n)}
              style={{ width: NODE, height: NODE }}
              className={cn(
                "relative grid touch-none place-items-center rounded-full border bg-card shadow-sm",
                readOnly ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
                selected ? "border-primary ring-2 ring-primary/30" : "hover:border-foreground/30",
                stateRing[st]
              )}
            >
              {/* 순서 배지 */}
              <span className="absolute -left-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-foreground text-[10px] font-semibold text-background">
                {idx + 1}
              </span>
              {/* 도구 배지 — 완료 후 행동이 있으면 표시 */}
              {n.tool?.type === "webhook" && (
                <span
                  title="완료 후 웹훅 전송"
                  className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border border-background bg-card text-[11px] shadow-sm"
                >
                  {toolEmoji(n.tool.type)}
                </span>
              )}
              <span className="text-2xl">{n.agent_icon || "🤖"}</span>

              {/* 입력 포트 */}
              <span
                className="absolute -left-1.5 top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-background bg-muted-foreground/40"
                aria-hidden
              />
              {/* 출력 포트 — 끌어서 연결 */}
              {!readOnly && (
                <span
                  onPointerDown={(e) => onPortPointerDown(e, n.id)}
                  title="끌어서 다음 노드와 연결"
                  className="absolute -right-1.5 top-1/2 size-3.5 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-background bg-primary hover:scale-125"
                />
              )}
            </div>

            {/* 라벨: 이름 + 하는 일 */}
            <div className="mt-1.5 w-full text-center">
              <p className="truncate text-xs font-semibold">{n.agent_name || "에이전트"}</p>
              <p className="line-clamp-2 text-[10px] leading-tight text-muted-foreground">{subtitle}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function bezier(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5)
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
}

export type { WorkflowNode, WorkflowEdge, WorkflowGraph }
