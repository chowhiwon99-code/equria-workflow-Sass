// 회의록 본문 변환·인쇄 유틸 — MeetingEditor 분해(P0)로 추출된 순수 함수 모음.
// AI 결과(평문/마크다운) → Tiptap 노드 변환과 PDF 인쇄 스타일. 도메인 상태 없음.
import type { JSONContent } from "@tiptap/core"

export type GraphData = {
  nodes: { id: string; label: string; group: string }[]
  links: { source: string; target: string; rel?: string }[]
}

/** AI 평문 결과를 문단 노드로 — 본문(Tiptap)에 삽입/교체용. */
export function linesToContent(text: string): JSONContent[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => (l.trim() ? { type: "paragraph", content: [{ type: "text", text: l }] } : { type: "paragraph" }))
}

/** 마크다운(리서치 결과)을 Tiptap 노드로 — 헤딩(##)·불릿(-)·문단. 인라인(**·링크)은 텍스트로(MVP). */
export function mdToContent(text: string): JSONContent[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const out: JSONContent[] = []
  let bullets: JSONContent[] = []
  const flush = () => {
    if (bullets.length) {
      out.push({ type: "bulletList", content: bullets })
      bullets = []
    }
  }
  for (const raw of lines) {
    const l = raw.trim().replace(/\*\*/g, "")
    const h = l.match(/^(#{1,4})\s+(.*)$/)
    const b = l.match(/^[-*]\s+(.*)$/)
    if (h) {
      flush()
      out.push({ type: "heading", attrs: { level: Math.min(h[1].length, 4) }, content: [{ type: "text", text: h[2] }] })
    } else if (b) {
      bullets.push({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: b[1] }] }] })
    } else if (l) {
      flush()
      out.push({ type: "paragraph", content: [{ type: "text", text: l }] })
    } else {
      flush()
    }
  }
  flush()
  return out.length ? out : [{ type: "paragraph" }]
}

export const PRINT_CSS = `
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.doc { max-width: 720px; margin: 0 auto; padding: 40px 32px; }
.doc-title { font-size: 26px; font-weight: 800; margin: 0 0 6px; }
.doc-meta { color: #666; font-size: 13px; margin: 0 0 24px; }
.meeting-doc { font-size: 14px; line-height: 1.7; }
.meeting-doc h1 { font-size: 22px; font-weight: 700; margin: 22px 0 10px; }
.meeting-doc h2 { font-size: 18px; font-weight: 700; margin: 20px 0 8px; }
.meeting-doc h3 { font-size: 15px; font-weight: 700; margin: 16px 0 6px; }
.meeting-doc p { margin: 8px 0; }
.meeting-doc ul, .meeting-doc ol { margin: 8px 0; padding-left: 22px; }
.meeting-doc li { margin: 3px 0; }
.meeting-doc img { max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0; display: block; }
.meeting-doc img[data-align="center"] { margin-left: auto; margin-right: auto; }
.meeting-doc img[data-align="right"] { margin-left: auto; }
.meeting-doc table { border-collapse: collapse; width: 100%; margin: 12px 0; }
.meeting-doc th, .meeting-doc td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; font-size: 13px; }
.meeting-doc th { background: #f5f5f5; font-weight: 600; }
.meeting-doc pre { background: #f5f5f5; padding: 12px; border-radius: 8px; overflow: auto; font-size: 12px; }
.meeting-doc code { font-family: ui-monospace, monospace; }
.meeting-doc blockquote { border-left: 3px solid #ddd; margin: 10px 0; padding: 2px 14px; color: #555; }
.meeting-doc a { color: #2563eb; text-decoration: underline; }
.meeting-doc mark { background: #fff3a3; padding: 0 2px; }
.meeting-doc hr { border: none; border-top: 1px solid #e5e5e5; margin: 18px 0; }
@page { margin: 16mm; }
`

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c)
