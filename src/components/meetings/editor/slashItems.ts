import type { Editor, Range } from "@tiptap/core"
import {
  Type,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Info,
  Code,
  Minus,
  Table as TableIcon,
  Image as ImageIcon,
  Paperclip,
  Calendar,
  type LucideIcon,
} from "lucide-react"

export type SlashHandlers = { onImage: (editor: Editor) => void; onFile: (editor: Editor) => void }

export type SlashItem = {
  key: string
  title: string
  hint?: string
  section: string
  icon: LucideIcon
  keywords: string[]
  command: (p: { editor: Editor; range: Range }) => void
}

/** 슬래시 메뉴 항목 — 아이콘은 전부 lucide 한 세트로 통일. */
export function buildSlashItems(handlers: SlashHandlers): SlashItem[] {
  return [
    {
      key: "text",
      title: "텍스트",
      section: "기본 블록",
      icon: Type,
      keywords: ["text", "paragraph", "본문", "텍스트"],
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run(),
    },
    {
      key: "h1",
      title: "제목1",
      hint: "#",
      section: "기본 블록",
      icon: Heading1,
      keywords: ["heading", "제목", "h1", "title"],
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
    },
    {
      key: "h2",
      title: "제목2",
      hint: "##",
      section: "기본 블록",
      icon: Heading2,
      keywords: ["heading", "제목", "h2"],
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
    },
    {
      key: "h3",
      title: "제목3",
      hint: "###",
      section: "기본 블록",
      icon: Heading3,
      keywords: ["heading", "제목", "h3"],
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
    },
    {
      key: "h4",
      title: "제목4",
      hint: "####",
      section: "기본 블록",
      icon: Heading4,
      keywords: ["heading", "제목", "h4"],
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 4 }).run(),
    },
    {
      key: "bullet",
      title: "글머리 목록",
      hint: "-",
      section: "기본 블록",
      icon: List,
      keywords: ["bullet", "list", "글머리", "목록", "불릿"],
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      key: "ordered",
      title: "번호 매기기 목록",
      hint: "1.",
      section: "기본 블록",
      icon: ListOrdered,
      keywords: ["number", "ordered", "번호", "목록"],
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      key: "task",
      title: "할 일 목록",
      hint: "[ ]",
      section: "기본 블록",
      icon: ListChecks,
      keywords: ["todo", "task", "check", "할일", "체크", "목록"],
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
    },
    {
      key: "quote",
      title: "인용",
      hint: '"',
      section: "기본 블록",
      icon: Quote,
      keywords: ["quote", "인용", "blockquote"],
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      key: "callout",
      title: "콜아웃",
      section: "기본 블록",
      icon: Info,
      keywords: ["callout", "콜아웃", "강조", "박스"],
      command: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({ type: "callout", content: [{ type: "paragraph" }] })
          .run(),
    },
    {
      key: "code",
      title: "코드",
      hint: "```",
      section: "기본 블록",
      icon: Code,
      keywords: ["code", "코드"],
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
      key: "divider",
      title: "구분선",
      hint: "---",
      section: "기본 블록",
      icon: Minus,
      keywords: ["divider", "hr", "구분선", "선"],
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
    {
      key: "date",
      title: "날짜",
      hint: "오늘",
      section: "기본 블록",
      icon: Calendar,
      keywords: ["date", "날짜", "오늘", "today", "time"],
      command: ({ editor, range }) => {
        const today = new Date().toLocaleDateString("ko-KR", {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "short",
        })
        editor.chain().focus().deleteRange(range).insertContent(`${today} `).run()
      },
    },
    {
      key: "table",
      title: "표",
      section: "기본 블록",
      icon: TableIcon,
      keywords: ["table", "표"],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      key: "image",
      title: "이미지",
      section: "미디어",
      icon: ImageIcon,
      keywords: ["image", "이미지", "사진", "그림", "photo"],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run()
        handlers.onImage(editor)
      },
    },
    {
      key: "file",
      title: "파일",
      hint: "pdf·zip·xlsx·ppt",
      section: "미디어",
      icon: Paperclip,
      keywords: ["file", "파일", "pdf", "zip", "excel", "ppt", "doc", "첨부"],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run()
        handlers.onFile(editor)
      },
    },
  ]
}

/** 쿼리로 항목 필터(제목/키워드 부분일치). */
export function filterSlashItems(items: SlashItem[], query: string): SlashItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter(
    (it) => it.title.toLowerCase().includes(q) || it.keywords.some((k) => k.toLowerCase().includes(q))
  )
}
