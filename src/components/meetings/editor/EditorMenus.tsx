"use client"

import { BubbleMenu } from "@tiptap/react/menus"
import type { Editor } from "@tiptap/react"
import { Plus, Minus, Trash2, Bold, Italic, Strikethrough, Code, Highlighter, Link as LinkIcon, AlignLeft, AlignCenter, AlignRight } from "lucide-react"
import { cn } from "@/lib/utils"

const bar = "flex items-center gap-0.5 rounded-lg border bg-popover p-1 text-xs shadow-[var(--shadow-lg)]"
const btn = "inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
const sep = "mx-0.5 h-4 w-px bg-border"

/** 표 안에 커서가 있을 때 뜨는 플로팅 컨트롤 — 행/열 추가·삭제·헤더·병합·표삭제. */
export function TableMenu({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu editor={editor} pluginKey="tableMenu" shouldShow={({ editor }) => editor.isActive("table")}>
      <div className={bar}>
        <button className={btn} title="아래에 행 추가" onClick={() => editor.chain().focus().addRowAfter().run()}>
          행<Plus className="size-3" />
        </button>
        <button className={btn} title="행 삭제" onClick={() => editor.chain().focus().deleteRow().run()}>
          행<Minus className="size-3" />
        </button>
        <div className={sep} />
        <button className={btn} title="오른쪽에 열 추가" onClick={() => editor.chain().focus().addColumnAfter().run()}>
          열<Plus className="size-3" />
        </button>
        <button className={btn} title="열 삭제" onClick={() => editor.chain().focus().deleteColumn().run()}>
          열<Minus className="size-3" />
        </button>
        <div className={sep} />
        <button className={btn} title="헤더 행 토글" onClick={() => editor.chain().focus().toggleHeaderRow().run()}>
          헤더
        </button>
        <button className={btn} title="셀 병합 / 분할" onClick={() => editor.chain().focus().mergeOrSplit().run()}>
          병합
        </button>
        <div className={sep} />
        <button
          className="inline-flex items-center rounded p-1 text-muted-foreground transition-colors hover:bg-destructive-bg hover:text-destructive"
          title="표 삭제"
          onClick={() => editor.chain().focus().deleteTable().run()}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </BubbleMenu>
  )
}

const mbtn = "rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"

/** 텍스트 선택 시 뜨는 인라인 서식 툴바 — 굵게·기울임·취소선·코드·형광펜·링크. (표/코드블록 안에선 숨김) */
export function TextMenu({ editor }: { editor: Editor }) {
  const item = (active: boolean) => cn(mbtn, active && "bg-muted text-foreground")
  const toggleLink = () => {
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run()
      return
    }
    const prev = (editor.getAttributes("link").href as string | undefined) ?? "https://"
    const url = window.prompt("링크 URL", prev)
    if (url === null) return
    if (url.trim() === "") {
      editor.chain().focus().unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run()
  }
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="textMenu"
      shouldShow={({ editor, state }) =>
        !state.selection.empty && !editor.isActive("table") && !editor.isActive("codeBlock")
      }
    >
      <div className={bar}>
        <button className={item(editor.isActive("bold"))} title="굵게 (⌘B)" onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="size-3.5" />
        </button>
        <button className={item(editor.isActive("italic"))} title="기울임 (⌘I)" onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="size-3.5" />
        </button>
        <button className={item(editor.isActive("strike"))} title="취소선" onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="size-3.5" />
        </button>
        <button className={item(editor.isActive("code"))} title="인라인 코드" onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code className="size-3.5" />
        </button>
        <button className={item(editor.isActive("highlight"))} title="형광펜" onClick={() => editor.chain().focus().toggleHighlight().run()}>
          <Highlighter className="size-3.5" />
        </button>
        <div className={sep} />
        <button className={item(editor.isActive("link"))} title="링크" onClick={toggleLink}>
          <LinkIcon className="size-3.5" />
        </button>
      </div>
    </BubbleMenu>
  )
}

/** 이미지 선택 시 — 정렬(좌/중/우) + 설명(alt) 편집. */
export function ImageMenu({ editor }: { editor: Editor }) {
  const isAlign = (a: string) => editor.getAttributes("image").align === a
  const setAlign = (align: "left" | "center" | "right") =>
    editor.chain().focus().updateAttributes("image", { align }).run()
  const editAlt = () => {
    const prev = (editor.getAttributes("image").alt as string | undefined) ?? ""
    const alt = window.prompt("이미지 설명(alt)", prev)
    if (alt !== null) editor.chain().focus().updateAttributes("image", { alt }).run()
  }
  return (
    <BubbleMenu editor={editor} pluginKey="imageMenu" shouldShow={({ editor }) => editor.isActive("image")}>
      <div className={bar}>
        <button className={cn(mbtn, isAlign("left") && "bg-muted text-foreground")} title="왼쪽 정렬" onClick={() => setAlign("left")}>
          <AlignLeft className="size-3.5" />
        </button>
        <button className={cn(mbtn, isAlign("center") && "bg-muted text-foreground")} title="가운데 정렬" onClick={() => setAlign("center")}>
          <AlignCenter className="size-3.5" />
        </button>
        <button className={cn(mbtn, isAlign("right") && "bg-muted text-foreground")} title="오른쪽 정렬" onClick={() => setAlign("right")}>
          <AlignRight className="size-3.5" />
        </button>
        <div className={sep} />
        <button className={mbtn} title="이미지 설명(alt)" onClick={editAlt}>
          alt
        </button>
      </div>
    </BubbleMenu>
  )
}
