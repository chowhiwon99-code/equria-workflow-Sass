"use client"

import { useState } from "react"
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/react"
import { Check, Copy } from "lucide-react"

const LANGS = ["", "javascript", "typescript", "python", "json", "bash", "sql", "xml", "css"] as const
const LABEL: Record<string, string> = {
  "": "텍스트",
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  json: "JSON",
  bash: "Bash",
  sql: "SQL",
  xml: "HTML/XML",
  css: "CSS",
}

/** 코드블록 NodeView — 언어 선택 드롭다운 + 복사 버튼. 본문은 NodeViewContent(편집 가능). */
export function CodeBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const [copied, setCopied] = useState(false)
  const lang = (node.attrs.language as string | null) ?? ""

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(node.textContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* 클립보드 거부 시 무시 */
    }
  }

  return (
    <NodeViewWrapper className="code-block relative my-3">
      {editor.isEditable && (
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1" contentEditable={false}>
          <select
            value={lang}
            onChange={(e) => updateAttributes({ language: e.target.value || null })}
            className="rounded border bg-popover px-1.5 py-0.5 text-[11px] text-muted-foreground outline-none"
            aria-label="코드 언어"
          >
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {LABEL[l] ?? l}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={copy}
            title="코드 복사"
            className="rounded border bg-popover p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          </button>
        </div>
      )}
      <pre>
        <NodeViewContent as={"code" as unknown as "div"} />
      </pre>
    </NodeViewWrapper>
  )
}
