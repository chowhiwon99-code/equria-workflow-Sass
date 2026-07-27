import Link from "next/link"
import Image from "next/image"
import { Mail } from "lucide-react"
import { CONTACT } from "./const"

const INTRO_MAIL = `${CONTACT.split("?")[0]}?subject=Complow 소개자료 요청`

/** 컬럼 링크 — href 없으면 "준비 중"(하위 페이지 추후 제작) */
type FootLink = { l: string; href?: string; mail?: boolean }

const COLUMNS: { title: string; links: FootLink[] }[] = [
  {
    title: "Complow",
    links: [
      { l: "기능", href: "#features" },
      { l: "AI", href: "#ai" },
      { l: "요금안내", href: "#pricing" },
      { l: "도입 문의", href: CONTACT, mail: true },
    ],
  },
  {
    title: "기능",
    links: [
      { l: "AI 에이전트", href: "#ai" },
      { l: "손익·현금흐름", href: "#features" },
      { l: "팀 협업", href: "#features" },
      { l: "전자결재·근태", href: "#features" },
      { l: "외부 도구 연동", href: "#features" },
    ],
  },
  {
    title: "리소스",
    links: [
      { l: "소개자료 받기", href: INTRO_MAIL, mail: true },
      { l: "협업툴 비교 자료" },
      { l: "헬프센터" },
    ],
  },
  {
    title: "회사",
    links: [
      { l: "회사소개" },
      { l: "블로그" },
      { l: "로그인", href: "/login" },
    ],
  },
]

/**
 * 랜딩 푸터 — 잔디식 다크 멀티 컬럼(2026-07-28): 로고 좌 / 링크 4컬럼 우,
 * 회사 정보 줄 + 법적 링크 바. 하위 페이지 없는 항목은 "준비 중" 비활성.
 */
export function LandingFooter() {
  return (
    <footer className="bg-[#111111] text-white">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="flex flex-col gap-12 lg:flex-row lg:justify-between">
          <Image src="/brand/logo-horizontal.png" alt="Complow" width={1046} height={256} className="h-5 w-auto self-start brightness-0 invert" />
          <div className="grid grid-cols-2 gap-x-10 gap-y-10 sm:grid-cols-4 lg:gap-x-16">
            {COLUMNS.map((c) => (
              <div key={c.title}>
                <p className="text-[13px] text-white/40">{c.title}</p>
                <ul className="mt-4 space-y-3">
                  {c.links.map((k) => (
                    <li key={k.l}>
                      {k.href ? (
                        k.href.startsWith("/") ? (
                          <Link href={k.href} className="text-[14px] font-semibold text-white/85 transition-colors hover:text-white">{k.l}</Link>
                        ) : (
                          <a href={k.href} className="text-[14px] font-semibold text-white/85 transition-colors hover:text-white">{k.l}</a>
                        )
                      ) : (
                        <span className="text-[14px] font-semibold text-white/30">
                          {k.l} <span className="ml-1 text-[11px] font-medium text-white/25">준비 중</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* 회사 정보 — 사업자등록번호·통신판매업신고번호·주소는 대표 확인 후 기재(PG 심사 요건) */}
        <div className="mt-16 text-[13px] leading-relaxed text-white/40">
          <p>Complow(컴플로우) · 대표: 조휘원 · 이메일: complow@complow.kr</p>
        </div>

        <div className="mt-6 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-white/40">
            <span>© 2026 Complow</span>
            <Link href="/privacy" className="font-semibold text-white/70 transition-colors hover:text-white">개인정보처리방침</Link>
            <Link href="/terms" className="transition-colors hover:text-white">이용약관</Link>
            <Link href="/refund" className="transition-colors hover:text-white">환불정책</Link>
          </div>
          <a href={CONTACT} aria-label="이메일 문의" className="text-white/40 transition-colors hover:text-white">
            <Mail className="size-5" />
          </a>
        </div>
      </div>
    </footer>
  )
}
