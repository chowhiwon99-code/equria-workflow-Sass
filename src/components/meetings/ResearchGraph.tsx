"use client"

import { useEffect, useRef, useState } from "react"
import { X, Maximize2, Minimize2 } from "lucide-react"
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

type GNode = SimulationNodeDatum & { id: string; label: string; group: string; deg?: number }
type GLink = SimulationLinkDatum<GNode> & { rel?: string; off?: number }

const PALETTE = ["blue", "green", "orange", "purple", "red", "yellow", "gray"]

/**
 * 리서치 지식 그래프 — d3-force 물리 + 캔버스 2.5D 렌더(보기 전용 오버레이).
 * 입체감: 구체 그라데이션·그림자·연속 미세 모션·곡선 링크 + 흐르는 입자·허브 크기·호버 글로우.
 * 조작: 노드 드래그 / 휠 줌 / 배경 드래그 팬 / 호버 강조.
 */
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
  const [fullscreen, setFullscreen] = useState(false)

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

    const gNodes: GNode[] = nodes.map((n, i) => {
      const a = (i / Math.max(nodes.length, 1)) * Math.PI * 2
      return { ...n, x: w / 2 + Math.cos(a) * 90, y: h / 2 + Math.sin(a) * 90 }
    })
    const byId = new Map(gNodes.map((n) => [n.id, n]))
    const gLinks: GLink[] = links.map((l, i) => ({ source: l.source, target: l.target, rel: l.rel, off: i * 0.137 }))
    // 차수(degree) — 허브일수록 크게
    for (const n of gNodes) n.deg = 0
    for (const l of gLinks) {
      const s = byId.get(l.source as string)
      const t = byId.get(l.target as string)
      if (s) s.deg = (s.deg ?? 0) + 1
      if (t) t.deg = (t.deg ?? 0) + 1
    }
    const radOf = (n: GNode) => 5 + Math.min(n.deg ?? 0, 8) * 1.3

    const sim = forceSimulation<GNode>(gNodes)
      .force("charge", forceManyBody().strength(-260))
      .force(
        "link",
        forceLink<GNode, GLink>(gLinks)
          .id((d) => d.id)
          .distance(90)
          .strength(0.5)
      )
      .force("collide", forceCollide((n) => radOf(n as GNode) + 16))
      .force("center", forceCenter(w / 2, h / 2))
      .alphaTarget(0.012) // 연속 미세 모션(살아있는 망)
      .restart()

    // 뷰 변환(줌/팬)
    let scale = 1
    let tx = 0
    let ty = 0
    let frame = 0

    const sphere = (n: GNode) => {
      const r = radOf(n)
      const base = colorOf(n.group)
      const focused = hover != null && (n.id === hover.id || neighbors.has(n.id))
      const dim = hover != null && !focused
      ctx.globalAlpha = dim ? 0.28 : 1
      // 그림자/글로우
      ctx.save()
      ctx.shadowColor = hover != null && n.id === hover.id ? base : "rgba(0,0,0,0.25)"
      ctx.shadowBlur = hover != null && n.id === hover.id ? 18 : 6
      ctx.shadowOffsetY = 2
      const g = ctx.createRadialGradient(n.x! - r * 0.35, n.y! - r * 0.4, r * 0.2, n.x!, n.y!, r)
      g.addColorStop(0, `color-mix(in oklch, ${base} 45%, white)`)
      g.addColorStop(0.55, base)
      g.addColorStop(1, `color-mix(in oklch, ${base} 78%, black)`)
      ctx.beginPath()
      ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2)
      ctx.fillStyle = g
      ctx.fill()
      ctx.restore()
      ctx.globalAlpha = dim ? 0.28 : 1
      // 라벨
      ctx.fillStyle = labelColor
      ctx.font = `${hover != null && n.id === hover.id ? "600 " : ""}11px sans-serif`
      ctx.textAlign = "center"
      ctx.fillText(n.label, n.x!, n.y! - r - 4)
    }

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
      frame++
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * tx, dpr * ty)

      // 링크(곡선) + 흐르는 입자
      for (const l of gLinks) {
        const s = l.source as GNode
        const t = l.target as GNode
        if (s.x == null || t.x == null) continue
        const active = hover != null && (s.id === hover.id || t.id === hover.id)
        const mx = (s.x + t.x!) / 2
        const my = (s.y! + t.y!) / 2
        const dx = t.x! - s.x
        const dy = t.y! - s.y!
        const len = Math.hypot(dx, dy) || 1
        const cx = mx - (dy / len) * len * 0.12 // 수직 오프셋 → 살짝 곡선
        const cy = my + (dx / len) * len * 0.12
        ctx.strokeStyle = active ? "rgba(110,110,210,0.65)" : "rgba(140,140,160,0.16)"
        ctx.lineWidth = active ? 1.6 / scale : 1 / scale
        ctx.beginPath()
        ctx.moveTo(s.x, s.y!)
        ctx.quadraticCurveTo(cx, cy, t.x!, t.y!)
        ctx.stroke()
        // 흐르는 입자(이차베지어 위)
        const p = ((frame * 0.004 + (l.off ?? 0)) % 1)
        const u = 1 - p
        const px = u * u * s.x + 2 * u * p * cx + p * p * t.x!
        const py = u * u * s.y! + 2 * u * p * cy + p * p * t.y!
        ctx.globalAlpha = active ? 0.9 : 0.4
        ctx.beginPath()
        ctx.arc(px, py, active ? 2.2 / scale : 1.5 / scale, 0, Math.PI * 2)
        ctx.fillStyle = active ? "rgb(120,120,220)" : "rgba(150,150,170,0.9)"
        ctx.fill()
        ctx.globalAlpha = 1
      }
      // 노드(구체)
      for (const n of gNodes) {
        if (n.x == null || n.y == null) continue
        sphere(n)
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
      labelColor = getComputedStyle(wrap).color
      sim.force("center", forceCenter(w / 2, h / 2))
      sim.alpha(0.4).restart()
    }

    // 화면→월드 좌표
    const toWorld = (e: MouseEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect()
      return [(e.clientX - r.left - tx) / scale, (e.clientY - r.top - ty) / scale] as const
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

    let dragging: GNode | null = null
    let panning: { x: number; y: number } | null = null
    const onDown = (e: MouseEvent) => {
      const [x, y] = toWorld(e)
      const n = nodeAt(x, y)
      if (n) {
        dragging = n
        n.fx = x
        n.fy = y
        sim.alphaTarget(0.3).restart()
      } else {
        panning = { x: e.clientX - tx, y: e.clientY - ty }
        canvas.style.cursor = "grabbing"
      }
    }
    const onMove = (e: MouseEvent) => {
      if (dragging) {
        const [x, y] = toWorld(e)
        dragging.fx = x
        dragging.fy = y
        return
      }
      if (panning) {
        tx = e.clientX - panning.x
        ty = e.clientY - panning.y
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
        dragging.fx = null
        dragging.fy = null
        dragging = null
        sim.alphaTarget(0.012)
      }
      panning = null
      canvas.style.cursor = "grab"
    }
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return // 페이지 스크롤 보존 — ⌘/Ctrl+휠로만 줌
      e.preventDefault()
      const [wx, wy] = toWorld(e)
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const next = Math.max(0.3, Math.min(3, scale * factor))
      const r = canvas.getBoundingClientRect()
      tx = e.clientX - r.left - wx * next
      ty = e.clientY - r.top - wy * next
      scale = next
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
    }
  }, [nodes, links])

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm"
          : "mt-2 flex flex-col overflow-hidden rounded-xl border bg-muted/20"
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
      </div>
      <div className="border-t px-3 py-1 text-center text-[10px] text-muted-foreground">노드 드래그 · ⌘/Ctrl+휠 줌 · 배경 드래그 이동 · 호버 강조</div>
    </div>
  )
}
