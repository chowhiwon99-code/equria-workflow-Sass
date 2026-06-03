import { Fragment, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { JSONContent } from "@/lib/tiptap"

const URL_SPLIT_RE = /(https?:\/\/[^\s]+)/g

/** plain content 안의 URL을 클릭 가능한 링크로 (body_json 없는 구 메시지·편집된 메시지 폴백). */
function renderPlain(text: string, mine: boolean): ReactNode {
  return text.split(URL_SPLIT_RE).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className={cn("underline underline-offset-2", mine ? "text-primary-foreground" : "text-primary")}
      >
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  )
}

/** text 노드의 marks를 안쪽부터 감싼다. (CHAT_EXTENSIONS에서 켠 마크와 1:1) */
function applyMarks(text: string, marks: JSONContent["marks"], mine: boolean): ReactNode {
  let node: ReactNode = text
  for (const m of marks ?? []) {
    switch (m.type) {
      case "bold":
        node = <strong>{node}</strong>
        break
      case "italic":
        node = <em>{node}</em>
        break
      case "strike":
        node = <s>{node}</s>
        break
      case "underline":
        node = <u>{node}</u>
        break
      case "code":
        node = (
          <code className={cn("rounded px-1 py-0.5 text-[0.85em]", mine ? "bg-primary-foreground/15" : "bg-foreground/10")}>
            {node}
          </code>
        )
        break
      case "link": {
        // href 스킴 화이트리스트 — javascript:/data: 등 주입 차단(안전한 URL만 링크화, 아니면 텍스트로)
        const raw = typeof m.attrs?.href === "string" ? m.attrs.href : ""
        const safe = /^(https?:|mailto:)/i.test(raw) ? raw : undefined
        if (safe) {
          node = (
            <a
              href={safe}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("underline underline-offset-2", mine ? "text-primary-foreground" : "text-primary")}
            >
              {node}
            </a>
          )
        }
        break
      }
    }
  }
  return node
}

/** Tiptap JSON 노드 → React. 켠 노드 종류만 처리, 미지원 노드는 자식 텍스트로 그레이스풀 폴백. */
function renderNode(node: JSONContent, key: number, mine: boolean): ReactNode {
  const kids = node.content?.map((n, i) => renderNode(n, i, mine))
  switch (node.type) {
    case "doc":
      return <Fragment key={key}>{kids}</Fragment>
    case "paragraph":
      return (
        <p key={key} className="whitespace-pre-wrap break-words">
          {node.content?.length ? kids : <br />}
        </p>
      )
    case "text":
      return <Fragment key={key}>{applyMarks(node.text ?? "", node.marks, mine)}</Fragment>
    case "bulletList":
      return (
        <ul key={key} className="list-disc pl-5">
          {kids}
        </ul>
      )
    case "orderedList":
      return (
        <ol key={key} className="list-decimal pl-5">
          {kids}
        </ol>
      )
    case "listItem":
      return <li key={key}>{kids}</li>
    case "hardBreak":
      return <br key={key} />
    default:
      return node.content ? <Fragment key={key}>{kids}</Fragment> : <Fragment key={key}>{node.text ?? ""}</Fragment>
  }
}

/**
 * 메시지 본문 렌더 — body_json(리치)이 있으면 안전 렌더, 없으면 plain content(URL 링크화) 폴백.
 * content는 항상 plain SSOT라 미리보기/알림/검색은 별도로 content만 쓰면 된다.
 */
export function MessageBody({
  bodyJson,
  content,
  mine,
}: {
  bodyJson: unknown // DB의 Json|null 을 그대로 받아 내부에서 가드 (호출부 캐스트 불필요)
  content: string
  mine: boolean
}) {
  if (bodyJson && typeof bodyJson === "object" && "type" in bodyJson) {
    return <div className="space-y-1 text-sm [&_a]:break-all">{renderNode(bodyJson as JSONContent, 0, mine)}</div>
  }
  return <span className="whitespace-pre-wrap break-words text-sm">{renderPlain(content, mine)}</span>
}
