import type { LucideIcon } from "lucide-react"

/**
 * 스켈레톤 단계의 빈 페이지용 공통 플레이스홀더.
 * 각 기능 페이지는 이 컴포넌트로 "무엇을 만들 자리인지"를 보여주고,
 * 구현이 시작되면 실제 UI로 교체한다.
 */
export function PagePlaceholder({
  icon: Icon,
  title,
  description,
  phase,
  todo,
}: {
  icon?: LucideIcon
  title: string
  description: string
  phase?: number
  todo?: string[]
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-4 py-20 text-center">
      {Icon && (
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <Icon className="size-7 text-muted-foreground" />
        </div>
      )}
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
        준비 중{phase ? ` · Phase ${phase}` : ""}
      </span>
      {todo && todo.length > 0 && (
        <ul className="mt-2 space-y-1 text-left text-sm text-muted-foreground">
          {todo.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-muted-foreground/50">•</span>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
