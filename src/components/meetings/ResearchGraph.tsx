"use client"

import { useEffect, useRef } from "react"
import { X } from "lucide-react"
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force"
import { swatch } from "@/lib/meetingMeta"

type GNode = SimulationNodeDatum & { id: string; label: string; group: string }
type GLink = SimulationLinkDatum<GNode> & { rel?: string }

const PALETTE = ["blue", "green", "orange", "purple", "red", "yellow", "gray"]

/** 리서치 지식 그래프 — d3-force 물리로 움직이는 노드-링크 망(드래그·호버 강조). 보기 전용 오버레이. */
export function ResearchGraph({
  nodes,
  links,
  topic,
  onClose,
}: {
  nodes: { id: string; label: string; group: string }[]
  links: { source: string; target: string; rel?: string }[]
  topic: string
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

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
    let h = r0.height || 400

    // 초기 위치를 중앙 원형으로(코너 플래시 방지)
    const gNodes: GNode[] = nodes.map((n, i) => {
      const a = (i / Math.max(nodes.length, 1)) * Math.PI * 2
      return { ...n, x: w / 2 + Math.cos(a) * 90, y: h / 2 + Math.sin(a) * 90 }
    })
    const gLinks: GLink[] = links.map((l) => ({ source: l.source, target: l.target, rel: l.rel }))

    const sim = forceSimulation<GNode>(gNodes)
      .force("charge", forceManyBody().strength(-240))
      .force(
        "link",
        forceLink<GNode, GLink>(gLinks)
          .id((d) => d.id)
          .distance(85)
          .strength(0.55)
      )
      .force("collide", forceCollide(26))
      .force("center", forceCenter(w / 2, h / 2))

    let hover: GNode | null = null
    const neighbors = new Set<string>()
    const computeNeighbors = (n: GNode | null) => {
      neighbors.clear()
      if (!n) return
      for (const l of gLinks) {
        const s = l.source as GNode
        const t = l.target as GNode
        if (s.id === n.id) neighbors.add(t.id)
        if (t.id === n.id) neighbors.add(s.id)
      }
    }

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      for (const l of gLinks) {
        const s = l.source as GNode
        const t = l.target as GNode
        if (s.x == null || t.x == null) continue
        const active = hover != null && (s.id === hover.id || t.id === hover.id)
        ctx.strokeStyle = active ? "rgba(110,110,210,0.7)" : "rgba(140,140,160,0.18)"
        ctx.lineWidth = active ? 1.6 : 1
        ctx.beginPath()
        ctx.moveTo(s.x, s.y ?? 0)
        ctx.lineTo(t.x ?? 0, t.y ?? 0)
        ctx.stroke()
      }
      for (const n of gNodes) {
        if (n.x == null || n.y == null) continue
        const dim = hover != null && n.id !== hover.id && !neighbors.has(n.id)
        ctx.globalAlpha = dim ? 0.3 : 1
        const rad = hover != null && n.id === hover.id ? 9 : 6
        ctx.beginPath()
        ctx.arc(n.x, n.y, rad, 0, Math.PI * 2)
        ctx.fillStyle = colorOf(n.group)
        ctx.fill()
        ctx.lineWidth = 1.5
        ctx.strokeStyle = "rgba(255,255,255,0.55)"
        ctx.stroke()
        ctx.fillStyle = labelColor
        ctx.font = "11px sans-serif"
        ctx.textAlign = "center"
        ctx.fillText(n.label, n.x, n.y - 11)
      }
      ctx.globalAlpha = 1
    }
    sim.on("tick", draw)

    let dpr = 1
    const resize = () => {
      const r = wrap.getBoundingClientRect()
      w = r.width
      h = r.height
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      labelColor = getComputedStyle(wrap).color
      sim.force("center", forceCenter(w / 2, h / 2))
      sim.alpha(0.4).restart()
    }

    const nodeAt = (px: number, py: number): GNode | null => {
      let best: GNode | null = null
      let bd = 18 * 18
      for (const n of gNodes) {
        if (n.x == null || n.y == null) continue
        const dx = n.x - px
        const dy = n.y - py
        const d2 = dx * dx + dy * dy
        if (d2 < bd) {
          bd = d2
          best = n
        }
      }
      return best
    }
    const pos = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top] as const
    }
    let dragging: GNode | null = null
    const onDown = (e: MouseEvent) => {
      const [x, y] = pos(e)
      const n = nodeAt(x, y)
      if (n) {
        dragging = n
        n.fx = x
        n.fy = y
        sim.alphaTarget(0.3).restart()
      }
    }
    const onMove = (e: MouseEvent) => {
      const [x, y] = pos(e)
      if (dragging) {
        dragging.fx = x
        dragging.fy = y
        return
      }
      const n = nodeAt(x, y)
      if (n !== hover) {
        hover = n
        computeNeighbors(n)
        canvas.style.cursor = n ? "pointer" : "default"
        if (sim.alpha() < 0.02) draw()
      }
    }
    const onUp = () => {
      if (dragging) {
        dragging.fx = null
        dragging.fy = null
        dragging = null
        sim.alphaTarget(0)
      }
    }
    canvas.addEventListener("mousedown", onDown)
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    return () => {
      sim.stop()
      ro.disconnect()
      canvas.removeEventListener("mousedown", onDown)
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [nodes, links])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="truncate text-sm font-medium">지식 그래프 · {topic}</span>
        <button onClick={onClose} className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="닫기">
          <X className="size-4" />
        </button>
      </div>
      <div ref={wrapRef} className="relative flex-1 text-foreground">
        <canvas ref={canvasRef} className="block size-full" />
      </div>
      <div className="border-t px-4 py-1.5 text-center text-[11px] text-muted-foreground">노드를 끌어 옮기고, 호버하면 연결이 강조돼요</div>
    </div>
  )
}
