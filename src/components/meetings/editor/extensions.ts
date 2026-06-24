import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import Image from "@tiptap/extension-image"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import Highlight from "@tiptap/extension-highlight"
import { Table } from "@tiptap/extension-table"
import TableRow from "@tiptap/extension-table-row"
import TableHeader from "@tiptap/extension-table-header"
import TableCell from "@tiptap/extension-table-cell"
import { Extension, type Editor, type Range } from "@tiptap/core"
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from "@tiptap/suggestion"
import { ReactRenderer, ReactNodeViewRenderer, type Extensions } from "@tiptap/react"
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight"
import { createLowlight } from "lowlight"
import javascript from "highlight.js/lib/languages/javascript"
import typescript from "highlight.js/lib/languages/typescript"
import python from "highlight.js/lib/languages/python"
import json from "highlight.js/lib/languages/json"
import bash from "highlight.js/lib/languages/bash"
import sql from "highlight.js/lib/languages/sql"
import xml from "highlight.js/lib/languages/xml"
import css from "highlight.js/lib/languages/css"
import { FileBlock } from "./FileBlock"
import { Callout } from "./Callout"
import { CodeBlockView } from "./CodeBlockView"
import { SlashMenu, type SlashMenuRef } from "./SlashMenu"
import { buildSlashItems, filterSlashItems, type SlashHandlers, type SlashItem } from "./slashItems"

// 코드 하이라이트 — 필요 언어만 등록(번들 최소). html=xml.
const lowlight = createLowlight()
lowlight.register({ javascript, typescript, python, json, bash, sql, xml, css })
const CodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  },
}).configure({ lowlight })

type SlashCmd = (p: { editor: Editor; range: Range }) => void

/** suggestion 렌더 — 캐럿 아래에 메뉴를 띄우고, 화면 하단에 가까우면 위로 뒤집는다. */
function makeSlashRender() {
  return () => {
    let component: ReactRenderer<SlashMenuRef> | null = null
    let el: HTMLDivElement | null = null

    const reposition = (rect: DOMRect | null | undefined) => {
      if (!el || !rect) return
      const MENU_W = 288
      const GAP = 6
      const menuH = el.offsetHeight || 320
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_W - 8))
      // 기본은 캐럿 아래, 아래 공간이 부족하고 위가 더 넓으면 위로. 어느 쪽이든 뷰포트 안으로 클램프.
      let top = rect.bottom + GAP
      if (top + menuH > window.innerHeight - 8 && rect.top - GAP - menuH > rect.bottom - menuH) {
        top = rect.top - GAP - menuH
      }
      top = Math.max(8, Math.min(top, window.innerHeight - menuH - 8))
      el.style.left = `${left}px`
      el.style.top = `${top}px`
      el.style.transform = "none"
    }

    return {
      onStart: (props: SuggestionProps<SlashItem>) => {
        component = new ReactRenderer(SlashMenu, {
          props: { items: props.items, command: props.command },
          editor: props.editor,
        })
        el = document.createElement("div")
        el.style.position = "fixed"
        el.style.zIndex = "50"
        el.appendChild(component.element)
        document.body.appendChild(el)
        reposition(props.clientRect?.())
      },
      onUpdate: (props: SuggestionProps<SlashItem>) => {
        component?.updateProps({ items: props.items, command: props.command })
        reposition(props.clientRect?.())
      },
      onKeyDown: (props: SuggestionKeyDownProps) => {
        // 한글 IME 조합 중에는 메뉴 키 가로채지 않음(Enter=조합확정).
        if (props.event.isComposing) return false
        // Escape는 suggestion이 닫고 '/'는 리터럴로 남긴다(노션 동작).
        if (props.event.key === "Escape") return false
        return component?.ref?.onKeyDown(props.event) ?? false
      },
      onExit: () => {
        el?.remove()
        component?.destroy()
        component = null
        el = null
      },
    }
  }
}

// 이미지 src도 http(s)만 허용(저장형 XSS 방어심화 — img javascript:는 실행 안 되지만 일관 차단).
const SafeImage = Image.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      src: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const v = el.getAttribute("src")
          return v && /^https?:\/\//i.test(v) ? v : null
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          const s = attrs.src
          return typeof s === "string" && s ? { src: s } : {}
        },
      },
      align: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-align"),
        renderHTML: (attrs: Record<string, unknown>) => {
          const a = attrs.align
          return a === "left" || a === "center" || a === "right" ? { "data-align": a } : {}
        },
      },
    }
  },
})

const SlashCommand = Extension.create<{ handlers: SlashHandlers }>({
  name: "slashCommand",
  addOptions() {
    return { handlers: { onImage: () => {}, onFile: () => {} } }
  },
  addProseMirrorPlugins() {
    const handlers = this.options.handlers
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        startOfLine: false,
        items: ({ query }) => filterSlashItems(buildSlashItems(handlers), query),
        command: ({ editor, range, props }) => (props.command as SlashCmd)({ editor, range }),
        render: makeSlashRender(),
      }),
    ]
  },
})

/** 회의록 블록 에디터 확장 SSOT. handlers는 이미지/파일 업로드 트리거(슬래시 메뉴에서 호출). */
export function buildMeetingExtensions(opts: { placeholder: string; handlers: SlashHandlers }): Extensions {
  return [
    StarterKit.configure({
      codeBlock: false, // CodeBlockLowlight(문법 하이라이트)로 대체
      heading: { levels: [1, 2, 3, 4] },
      link: {
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight,
    SafeImage.configure({ inline: false, allowBase64: false }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    FileBlock,
    Callout,
    CodeBlock,
    SlashCommand.configure({ handlers: opts.handlers }),
    Placeholder.configure({
      includeChildren: false,
      placeholder: ({ node }) => (node.type.name === "heading" ? "제목" : opts.placeholder),
    }),
  ]
}
