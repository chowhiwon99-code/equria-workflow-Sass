"use client"

import { useState } from "react"
import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/react"
import { ChevronRight } from "lucide-react"

/**
 * 토글(접기) 블록 — 제목 옆 셰브론을 눌러 본문을 펼치고 접는다(노션 토글 목록).
 * summary(제목)·open(펼침 여부)은 data-* 속성으로 직렬화하고, 본문은 안쪽 블록으로 그대로 보존한다.
 * 읽기 전용(editable=false)에서도 같은 확장으로 렌더되므로 셰브론 접기/펼치기가 로컬 상태로 동작한다.
 */
function ToggleView({ node, updateAttributes, editor }: NodeViewProps) {
  const attrs = node.attrs as { summary: string; open: boolean }
  const [open, setOpen] = useState(attrs.open)

  const flip = () => {
    const next = !open
    setOpen(next)
    if (editor.isEditable) updateAttributes({ open: next }) // 편집 중이면 기본 펼침 상태를 저장
  }

  return (
    <NodeViewWrapper className="my-1.5 rounded-lg border bg-muted/20">
      <div className="flex items-center gap-1 px-1.5 py-1.5">
        <button
          type="button"
          contentEditable={false}
          onClick={flip}
          aria-label={open ? "접기" : "펼치기"}
          className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className={`size-4 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        {editor.isEditable ? (
          <input
            value={attrs.summary}
            onChange={(e) => updateAttributes({ summary: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="토글 제목"
            contentEditable={false}
            className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
          />
        ) : (
          <span className="min-w-0 flex-1 text-sm font-medium">{attrs.summary || "토글"}</span>
        )}
      </div>
      {/* 접혀 있어도 DOM에는 남겨 ProseMirror가 본문을 계속 관리하도록 hidden으로만 숨긴다. */}
      <NodeViewContent className={`pb-2 pl-8 pr-3 [&>*]:my-1 ${open ? "" : "hidden"}`} />
    </NodeViewWrapper>
  )
}

export const Toggle = Node.create({
  name: "toggle",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      summary: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-summary") ?? "",
        renderHTML: (a: Record<string, unknown>) => ({ "data-summary": (a.summary as string) ?? "" }),
      },
      open: {
        default: true,
        // data-open="false"만 접힘으로 취급(속성 없으면 펼침 기본).
        parseHTML: (el: HTMLElement) => el.getAttribute("data-open") !== "false",
        renderHTML: (a: Record<string, unknown>) => ({ "data-open": a.open ? "true" : "false" }),
      },
    }
  },
  parseHTML() {
    return [{ tag: "div[data-toggle]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-toggle": "" }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(ToggleView)
  },
})
