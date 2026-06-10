"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { Download, File as FileIcon } from "lucide-react"
import { formatBytes } from "@/lib/files"

/** XSS 방어: http(s) URL만 허용(javascript:·data: 등 차단). */
function httpOnly(v: string | null): string | null {
  return v && /^https?:\/\//i.test(v) ? v : null
}

/**
 * 회의록 본문의 '파일' 블록 — pdf·zip·docs·excel·ppt 등 모든 형식 첨부.
 * src(공개 meeting-media URL)/name/size/mime를 data-* 속성으로 직렬화해 본문 HTML에 보존한다.
 */
function FileBlockView({ node }: NodeViewProps) {
  const { src, name, size } = node.attrs as { src: string | null; name: string; size: number; mime: string }
  const safe = httpOnly(src) // 렌더 시점 2차 가드
  return (
    <NodeViewWrapper className="my-1.5" data-drag-handle>
      <a
        href={safe ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        download={name || undefined}
        className="inline-flex max-w-full items-center gap-2.5 rounded-lg border bg-card px-3 py-2 text-sm no-underline transition-colors hover:bg-muted/50"
        contentEditable={false}
      >
        <FileIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 max-w-xs truncate font-medium text-foreground">{name || "파일"}</span>
        {size ? <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(size)}</span> : null}
        <Download className="size-3.5 shrink-0 text-muted-foreground" />
      </a>
    </NodeViewWrapper>
  )
}

export const FileBlock = Node.create({
  name: "fileBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: {
        default: null,
        // 저장된 HTML을 다시 파싱할 때 http(s)만 통과(저장형 XSS 차단).
        parseHTML: (el) => httpOnly(el.getAttribute("data-src")),
        renderHTML: (a) => (a.src ? { "data-src": a.src as string } : {}),
      },
      name: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-name") ?? "",
        renderHTML: (a) => ({ "data-name": (a.name as string) ?? "" }),
      },
      size: {
        default: 0,
        parseHTML: (el) => Number(el.getAttribute("data-size")) || 0,
        renderHTML: (a) => ({ "data-size": String(a.size ?? 0) }),
      },
      mime: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-mime") ?? "",
        renderHTML: (a) => ({ "data-mime": (a.mime as string) ?? "" }),
      },
    }
  },
  parseHTML() {
    return [{ tag: "div[data-file-block]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-file-block": "" })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(FileBlockView)
  },
})
