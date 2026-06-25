"use client"

import { useEffect, useRef, useState } from "react"
import { X, Maximize2, Minimize2, Loader2, Plus, Network, ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force"
import { swatch } from "@/lib/meetingMeta"

type GNode = SimulationNodeDatum & { id: string; label: string; group: string; deg?: number }
type GLink = SimulationLinkDatum<GNode> & { rel?: string }
type Related = { label: string; rel?: string }
type Card = {
  label: string
  x: number
  y: number
  loading: boolean
  explanation: string
  followups: string[]
  related: Related[]
  history: string[]
}

const PALETTE = ["blue", "green", "orange", "purple", "red", "yellow", "gray"]
const linkId = (e: string | number | GNode) => (typeof e === "object" ? e.id : String(e))

/**
 * 리서치 지식 그래프 — d3-force + 캔버스. 미니멀 조형(매트 구체·얇은 직선·색 그룹).
 * 꼬리물기: 노드 클릭 → 옆 팝오버 카드(AI 설명 + 꼬리질문 + 망 확장). 칩 클릭 → 더 깊이 + 망 성장.
 * 조작: 노드 드래그 / ⌘+휠 줌 / 배경 드래그 팬 / 호버 강조.
 */
export function ResearchGraph({
  nodes,
  links,
  topic,
  material,
  onInsert,
  onClose,
}: {
  nodes: { id: string; label: string; group: string }[]
  links: { source: string; target: string; rel?: string }[]
  topic: string
  material: string
  onInsert: (text: string) => void
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [card, setCard] = useState<Card | null>(null)
  const [wrapSize, setWrapSize] = useState({ w: 600, h: 420 })

  // 그래프↔카드 브리지(refs — 렌더 사이 안정)
  const viewRef = useRef({ scale: 1, tx: 0, ty: 0 })
  const selectedRef = useRef<GNode | null>(null)
  const apiRef = useRef<{ addNodes: (parentLabel: string, items: Related[]) => void } | null>(null)
  const openRef = useRef<((label: string, x: number, y: number) => void) | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const groups = [...new Set(nodes.map((n) => n.group))]
    const colorOf = (g: string) => swatch(PALETTE[groups.indexOf(g) % PALETTE.length] ?? "gray")
    let labelColor = getComputedStyle(wrap).color

    const r0 = wrap.getBoundingClientRect()
    let w = r0.width || 600
    let h = r0.height || 420

    const gNodes: GNode[] = nodes.map((n, i) => {
      const a = (i / Math.max(nodes.length, 1)) * Math.PI * 2
      return { ...n, x: w / 2 + Math.cos(a) * 90, y: h / 2 + Math.sin(a) * 90 }
    })
    const gLinks: GLink[] = links.map((l) => ({ source: l.source, target: l.target, rel: l.rel }))
    const recomputeDeg = () => {
      for (const n of gNodes) n.deg = 0
      for (const l of gLinks) {
        const s = gNodes.find((n) => n.id === linkId(l.source as string | GNode))
        const t = gNodes.find((n) => n.id === linkId(l.target as string | GNode))
        if (s) s.deg = (s.deg ?? 0) + 1
        if (t) t.deg = (t.deg ?? 0) + 1
      }
    }
    recomputeDeg()
    const radOf = (n: GNode) => 4 + Math.sqrt(n.deg ?? 0) * 3.6

    let hover: GNode | null = null
    const neighbors = new Set<string>()
    const computeNeighbors = (n: GNode | null) => {
      neighbors.clear()
      if (!n) return
      for (const l of gLinks) {
        const s = linkId(l.source as string | GNode)
        const t = linkId(l.target as string | GNode)
        if (s === n.id) neighbors.add(t)
        if (t === n.id) neighbors.add(s)
      }
    }

    let dpr = 1
    const linkForce = forceLink<GNode, GLink>(gLinks)
      .id((d) => d.id)
      .distance(95)
      .strength(0.45)
    const sim: Simulation<GNode, GLink> = forceSimulation<GNode>(gNodes)
      .force("charge", forceManyBody().strength(-300))
      .force("link", linkForce)
      .force("collide", forceCollide((n) => radOf(n as GNode) + 14))
      .force("center", forceCenter(w / 2, h / 2))
      .alphaTarget(0.008)
      .restart()

    const draw = () => {
      const { scale, tx, ty } = viewRef.current
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * tx, dpr * ty)

      for (const l of gLinks) {
        const s = l.source as GNode
        const t = l.target as GNode
        if (s.x == null || t.x == null) continue
        const active = hover != null && (s.id === hover.id || t.id === hover.id)
        ctx.strokeStyle = active ? "rgba(80,80,95,0.5)" : "rgba(120,120,140,0.22)"
        ctx.lineWidth = (active ? 1 : 0.7) / scale
        ctx.beginPath()
        ctx.moveTo(s.x, s.y!)
        ctx.lineTo(t.x!, t.y!)
        ctx.stroke()
      }

      for (const n of gNodes) {
        if (n.x == null || n.y == null) continue
        const r = radOf(n)
        const base = colorOf(n.group)
        const sel = selectedRef.current?.id === n.id
        const focus = hover != null && (n.id === hover.id || neighbors.has(n.id))
        const dim = hover != null && !focus && !sel
        ctx.globalAlpha = dim ? 0.3 : 1
        // 플랫 단색 + 발광 글로우(InfraNodus 스타일) — 그라데이션·드롭섀도 없음
        ctx.save()
        if (sel || focus) {
          ctx.shadowColor = base
          ctx.shadowBlur = sel ? 16 : 10
        }
        ctx.fillStyle = base
        ctx.beginPath()
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      ctx.globalAlpha = 1
      ctx.fillStyle = labelColor
      ctx.textAlign = "center"
      for (const n of gNodes) {
        if (n.x == null || n.y == null) continue
        const isHub = (n.deg ?? 0) >= 3
        const onHover = hover != null && (n.id === hover.id || neighbors.has(n.id))
        const sel = selectedRef.current?.id === n.id
        if (!isHub && !onHover && !sel) continue
        if (hover != null && !onHover && !sel) continue
        ctx.globalAlpha = onHover || sel ? 1 : 0.75
        ctx.font = `${onHover || sel ? "600 " : ""}11px sans-serif`
        ctx.fillText(n.label, n.x, n.y - radOf(n) - 5)
      }
      ctx.globalAlpha = 1
    }
    sim.on("tick", draw)

    const resize = () => {
      const r = wrap.getBoundingClientRect()
      w = r.width
      h = r.height
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      labelColor = getComputedStyle(wrap).color
      setWrapSize({ w, h })
      sim.force("center", forceCenter(w / 2, h / 2))
      sim.alpha(0.4).restart()
    }

    const toWorld = (e: MouseEvent | WheelEvent) => {
      const { scale, tx, ty } = viewRef.current
      const r = canvas.getBoundingClientRect()
      return [(e.clientX - r.left - tx) / scale, (e.clientY - r.top - ty) / scale] as const
    }
    const screenPos = (n: GNode) => {
      const { scale, tx, ty } = viewRef.current
      return [scale * (n.x ?? 0) + tx, scale * (n.y ?? 0) + ty] as const
    }
    const nodeAt = (px: number, py: number): GNode | null => {
      let best: GNode | null = null
      let bd = Infinity
      for (const n of gNodes) {
        if (n.x == null || n.y == null) continue
        const rr = radOf(n) + 6
        const dx = n.x - px
        const dy = n.y - py
        const d2 = dx * dx + dy * dy
        if (d2 < rr * rr && d2 < bd) {
          bd = d2
          best = n
        }
      }
      return best
    }
    const syncCardPos = () => {
      const n = selectedRef.current
      if (!n) return
      const [sx, sy] = screenPos(n)
      setCard((c) => (c ? { ...c, x: sx, y: sy } : c))
    }

    // 망 성장 — 부모 노드에 연관 노드를 추가(중복 라벨은 링크만)
    apiRef.current = {
      addNodes: (parentLabel, items) => {
        const parent = gNodes.find((n) => n.label === parentLabel)
        if (!parent) return
        let changed = false
        for (const it of items) {
          if (!it.label?.trim()) continue
          const existing = gNodes.find((n) => n.label === it.label)
          if (existing) {
            const dup = gLinks.some(
              (l) =>
                (linkId(l.source as string | GNode) === parent.id && linkId(l.target as string | GNode) === existing.id) ||
                (linkId(l.source as string | GNode) === existing.id && linkId(l.target as string | GNode) === parent.id)
            )
            if (!dup && existing.id !== parent.id) {
              gLinks.push({ source: parent.id, target: existing.id, rel: it.rel })
              changed = true
            }
            continue
          }
          const nn: GNode = {
            id: crypto.randomUUID(),
            label: it.label,
            group: parent.group,
            x: (parent.x ?? w / 2) + (Math.random() - 0.5) * 50,
            y: (parent.y ?? h / 2) + (Math.random() - 0.5) * 50,
            deg: 0,
          }
          gNodes.push(nn)
          gLinks.push({ source: parent.id, target: nn.id, rel: it.rel })
          changed = true
        }
        if (changed) {
          recomputeDeg()
          sim.nodes(gNodes)
          linkForce.links(gLinks)
          sim.alpha(0.7).restart()
        }
      },
    }

    let dragging: GNode | null = null
    let panning: { x: number; y: number } | null = null
    let downNode: GNode | null = null
    let moved = false
    const onDown = (e: MouseEvent) => {
      const [x, y] = toWorld(e)
      const n = nodeAt(x, y)
      moved = false
      if (n) {
        downNode = n
        dragging = n
        n.fx = x
        n.fy = y
        sim.alphaTarget(0.3).restart()
      } else {
        panning = { x: e.clientX - viewRef.current.tx, y: e.clientY - viewRef.current.ty }
        canvas.style.cursor = "grabbing"
      }
    }
    const onMove = (e: MouseEvent) => {
      if (dragging) {
        const [x, y] = toWorld(e)
        if (Math.hypot((dragging.x ?? x) - x, (dragging.y ?? y) - y) > 3) moved = true
        dragging.fx = x
        dragging.fy = y
        if (selectedRef.current?.id === dragging.id) syncCardPos()
        return
      }
      if (panning) {
        viewRef.current.tx = e.clientX - panning.x
        viewRef.current.ty = e.clientY - panning.y
        syncCardPos()
        return
      }
      const [x, y] = toWorld(e)
      const n = nodeAt(x, y)
      if (n !== hover) {
        hover = n
        computeNeighbors(n)
        canvas.style.cursor = n ? "pointer" : "grab"
      }
    }
    const onUp = () => {
      if (dragging) {
        if (!moved && downNode && dragging.id === downNode.id) {
          // 클릭 = 카드 열기(노드 고정 유지)
          const prev = selectedRef.current
          if (prev && prev.id !== dragging.id) {
            prev.fx = null
            prev.fy = null
          }
          selectedRef.current = dragging
          const [sx, sy] = screenPos(dragging)
          openRef.current?.(dragging.label, sx, sy)
        } else {
          dragging.fx = null
          dragging.fy = null
        }
        dragging = null
        sim.alphaTarget(0.008)
      }
      panning = null
      downNode = null
      canvas.style.cursor = "grab"
    }
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const [wx, wy] = toWorld(e)
      const v = viewRef.current
      const next = Math.max(0.3, Math.min(3, v.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
      const r = canvas.getBoundingClientRect()
      v.tx = e.clientX - r.left - wx * next
      v.ty = e.clientY - r.top - wy * next
      v.scale = next
      syncCardPos()
    }
    canvas.addEventListener("mousedown", onDown)
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    canvas.addEventListener("wheel", onWheel, { passive: false })

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    return () => {
      sim.stop()
      ro.disconnect()
      canvas.removeEventListener("mousedown", onDown)
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      canvas.removeEventListener("wheel", onWheel)
      apiRef.current = null
    }
  }, [nodes, links])

  // 노드 탐색(꼬리물기) — AI 설명 + 꼬리질문 + 연관 노드. grow=true면 망에 노드 추가.
  const explore = async (label: string, question: string, grow: boolean) => {
    try {
      const res = await fetch("/api/meeting-notes/research/node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, node: label, question, context: material }),
      })
      if (!res.ok) throw new Error("탐색에 실패했어요.")
      const data = (await res.json()) as { explanation: string; followups: string[]; related: Related[] }
      setCard((c) =>
        c ? { ...c, loading: false, explanation: data.explanation, followups: data.followups ?? [], related: data.related ?? [] } : c
      )
      if (grow && data.related?.length) apiRef.current?.addNodes(label, data.related)
    } catch (e) {
      setCard((c) => (c ? { ...c, loading: false } : c))
      toast.error(e instanceof Error ? e.message : "탐색에 실패했어요.")
    }
  }

  // 노드 클릭 시 카드 오픈(설명 로드) — 최신 클로저를 ref에 보관(그래프 effect가 호출)
  useEffect(() => {
    openRef.current = (label, x, y) => {
      setCard((prev) => ({
        label,
        x,
        y,
        loading: true,
        explanation: "",
        followups: [],
        related: [],
        history: prev ? [...prev.history, prev.label] : [],
      }))
      void explore(label, "", false)
    }
  })

  // 꼬리질문 — 더 깊이 + 망 성장
  const onChip = (q: string) => {
    if (!card) return
    setCard({ ...card, loading: true })
    void explore(card.label, q, true)
  }
  const closeCard = () => {
    if (selectedRef.current) {
      selectedRef.current.fx = null
      selectedRef.current.fy = null
      selectedRef.current = null
    }
    setCard(null)
  }
  const insertCard = () => {
    if (!card?.explanation) return
    onInsert(`## ${card.label}\n${card.explanation}`)
    toast.success("본문에 추가했어요.")
  }

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm"
          : "mt-2 flex flex-col overflow-hidden rounded-xl border bg-background"
      }
    >
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="truncate text-xs font-medium">지식 그래프 · {topic}</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setFullscreen((f) => !f)}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={fullscreen ? "축소" : "전체화면"}
          >
            {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="닫기">
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      <div ref={wrapRef} className={fullscreen ? "relative flex-1 text-foreground" : "relative h-[420px] text-foreground"}>
        <canvas ref={canvasRef} className="block size-full cursor-grab" />

        {card && (
          <div
            className="absolute z-10 w-64 rounded-xl border bg-popover p-3 shadow-[var(--shadow-lg)]"
            style={{
              left: Math.max(8, Math.min(card.x + 12, wrapSize.w - 264)),
              top: Math.max(8, Math.min(card.y + 12, wrapSize.h - 8)),
            }}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1">
                {card.history.length > 0 && (
                  <button
                    onClick={() => {
                      const prevLabel = card.history[card.history.length - 1]
                      setCard({ ...card, label: prevLabel, loading: true, history: card.history.slice(0, -1) })
                      void explore(prevLabel, "", false)
                    }}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="이전"
                  >
                    <ArrowLeft className="size-3.5" />
                  </button>
                )}
                <span className="truncate text-sm font-semibold">{card.label}</span>
              </div>
              <button onClick={closeCard} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="닫기">
                <X className="size-3.5" />
              </button>
            </div>

            {card.loading ? (
              <div className="flex items-center gap-1.5 py-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> 살펴보는 중…
              </div>
            ) : (
              <>
                <p className="text-xs leading-relaxed text-foreground/90">{card.explanation}</p>
                {card.followups.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {card.followups.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => onChip(q)}
                        className="rounded-full border border-primary/40 px-2 py-0.5 text-[11px] text-primary transition-colors hover:bg-primary/10"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-2.5 flex items-center gap-1.5 border-t pt-2">
                  <button
                    onClick={insertCard}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90"
                  >
                    <Plus className="size-3" /> 본문에 추가
                  </button>
                  {card.related.length > 0 && (
                    <button
                      onClick={() => apiRef.current?.addNodes(card.label, card.related)}
                      className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Network className="size-3" /> 망 확장
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <div className="border-t px-3 py-1 text-center text-[10px] text-muted-foreground">
        노드 클릭 → 설명·꼬리질문 · 드래그 이동 · ⌘/Ctrl+휠 줌
      </div>
    </div>
  )
}
