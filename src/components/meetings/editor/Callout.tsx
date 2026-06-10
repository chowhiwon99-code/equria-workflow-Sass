"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from "@tiptap/react"
import { Info } from "lucide-react"

/**
 * 콜아웃 블록 — 강조용 박스(아이콘 + 본문). 안에 문단을 담는다.
 */
function CalloutView() {
  return (
    <NodeViewWrapper className="my-1.5 flex gap-2.5 rounded-lg border bg-muted/40 p-3">
      <span contentEditable={false} className="mt-0.5 shrink-0 select-none">
        <Info className="size-4 text-muted-foreground" />
      </span>
      <NodeViewContent className="flex-1 [&>p]:my-0" />
    </NodeViewWrapper>
  )
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "paragraph+",
  defining: true,
  parseHTML() {
    return [{ tag: "div[data-callout]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-callout": "" }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView)
  },
})
