import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"

/**
 * 공용 마크다운 렌더러 — AI 출력(표·제목·목록·코드·링크)을 앱 톤으로 표시(세션41).
 * 워크플로우 실행 결과·에이전트 답변 등에서 재사용. GFM 표 지원, 링크는 새 탭.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none break-words text-foreground",
        "[&_*]:my-1 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-[0.85em] [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-2",
        "[&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
        // GFM 표 — 얇은 보더·헤더 배경(앱 카드 톤)
        "[&_table]:w-full [&_table]:border-collapse [&_table]:text-[0.9em] [&_th]:border [&_th]:bg-muted/50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border-border [&_td]:border-border",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ ...props }) => <a target="_blank" rel="noopener noreferrer" {...props} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
