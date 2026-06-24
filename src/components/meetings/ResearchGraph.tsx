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
type GLink = SimulationLinkDatum<GNode> & { rel?: string }

const PALETTE = ["blue", "green", "orange", "purple", "red", "yellow", "gray"]

/**
 * 리서치 지식 그래프 — d3-force 물리 + 캔버스(보기 전용).
 * 미니멀 조형: 매트 구체 + 소프트 드롭섀도 + 얇은 직선 + 크기 변화. 색으로만 그룹 구분.
 * 라벨은 허브/호버만(클린 유지). 조작: 노드 드래그 / ⌘+휠 줌 / 배경 드래그 팬 / 호버 강조.
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
    let h = r0.height || 420

    const gNodes: GNode[] = nodes.map((n, i) => {
      const a = (i / Math.max(nodes.length, 1)) * Math.PI * 2
      return { ...n, x: w / 2 + Math.cos(a) * 90, y: h / 2 + Math.sin(a) * 90 }
    })
    const byId = new Map(gNodes.map((n) => [n.id, n]))
    const gLinks: GLink[] = links.map((l) => ({ source: l.source, target: l.target, rel: l.rel }))
    for (const n of gNodes) n.deg = 0
    for (const l of gLinks) {
      const s = byId.get(l.source as string)
      const t = byId.get(l.target as string)
      if (s) s.deg = (s.deg ?? 0) + 1
      if (t) t.deg = (t.deg ?? 0) + 1
    }
    // 크기 변화(허브 큼·잎 작음)
    const radOf = (n: GNode) => 4 + Math.sqrt(n.deg ?? 0) * 3.6

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

    let scale = 1
    let tx = 0
    let ty = 0
    let dpr = 1

    const sim = forceSimulation<GNode>(gNodes)
      .force("charge", forceManyBody().strength(-300))
      .force(
        "link",
        forceLink<GNode, GLink>(gLinks)
          .id((d) => d.id)
          .distance(95)
          .strength(0.45)
      )
      .force("collide", forceCollide((n) => radOf(n as GNode) + 14))
      .force("center", forceCenter(w / 2, h / 2))
      .alphaTarget(0.008) // 아주 은은한 연속 모션
      .restart()

    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * tx, dpr * ty)

      // 링크 — 얇은 직선
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

      // 노드 — 매트 구체 + 소프트 드롭섀도
      for (const n of gNodes) {
        if (n.x == null || n.y == null) continue
        const r = radOf(n)
        const base = colorOf(n.group)
        const dim = hover != null && n.id !== hover.id && !neighbors.has(n.id)
        ctx.globalAlpha = dim ? 0.3 : 1
        ctx.save()
        ctx.shadowColor = "rgba(0,0,0,0.22)"
        ctx.shadowBlur = r * 0.85
        ctx.shadowOffsetY = r * 0.5
        const g = ctx.createRadialGradient(n.x - r * 0.4, n.y - r * 0.45, r * 0.1, n.x, n.y, r)
        g.addColorStop(0, `color-mix(in oklch, ${base} 68%, white)`)
        g.addColorStop(0.65, base)
        g.addColorStop(1, `color-mix(in oklch, ${base} 88%, black)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      // 라벨 — 허브(연결 많음) 항상 + 호버 시 해당+이웃
      ctx.globalAlpha = 1
      ctx.fillStyle = labelColor
      ctx.textAlign = "center"
      for (const n of gNodes) {
        if (n.x == null || n.y == null) continue
        const isHub = (n.deg ?? 0) >= 3
        const onHover = hover != null && (n.id === hover.id || neighbors.has(n.id))
        if (!isHub && !onHover) continue
        if (hover != null && !onHover) continue // 호버 중엔 관련 노드만
        ctx.globalAlpha = onHover ? 1 : 0.75
        ctx.font = `${onHover ? "600 " : ""}11px sans-serif`
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
      sim.force("center", forceCenter(w / 2, h / 2))
      sim.alpha(0.4).restart()
    }

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
        sim.alphaTarget(0.008)
      }
      panning = null
      canvas.style.cursor = "grab"
    }
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return // 페이지 스크롤 보존 — ⌘/Ctrl+휠로만 줌
      e.preventDefault()
      const [wx, wy] = toWorld(e)
      const next = Math.max(0.3, Math.min(3, scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
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
      </div>
      <div className="border-t px-3 py-1 text-center text-[10px] text-muted-foreground">노드 드래그 · ⌘/Ctrl+휠 줌 · 배경 드래그 이동 · 호버 강조</div>
    </div>
  )
}
