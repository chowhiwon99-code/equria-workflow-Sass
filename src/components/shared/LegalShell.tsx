import Link from "next/link"
import type { ReactNode } from "react"

/** 공개 법적 문서(개인정보처리방침·이용약관) 공통 셸 — 로그인 불필요, 구글 브랜드 검증 요건 페이지. */
export function LegalShell({ title, effective, children }: { title: string; effective: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-12">
        <Link href="/login" className="text-sm font-semibold text-muted-foreground hover:text-foreground">
          ← Complow
        </Link>
        <h1 className="mt-6 text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">시행일: {effective}</p>
        <div className="mt-8 flex flex-col gap-6 text-[15px] leading-relaxed">{children}</div>
        <div className="mt-12 border-t pt-6 text-sm text-muted-foreground">
          <Link href="/terms" className="underline hover:text-foreground">이용약관</Link>
          {" · "}
          <Link href="/privacy" className="underline hover:text-foreground">개인정보처리방침</Link>
          {" · "}
          <span>문의: complow@complow.kr</span>
        </div>
      </div>
    </div>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="flex flex-col gap-2 text-muted-foreground [&_b]:text-foreground [&_strong]:text-foreground">{children}</div>
    </section>
  )
}

export function LegalTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2 align-top text-muted-foreground">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
