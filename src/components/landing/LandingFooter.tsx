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
    // PWA로 실제 설치 가능해짐(2026-08) — 설치 파일 배포가 아니라 브라우저 설치라 안내 페이지로 보낸다.
    title: "다운로드",
    links: [
      { l: "iOS & Android", href: "/download" },
      { l: "Mac & Windows", href: "/download" },
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
          <div className="grid grid-cols-2 gap-x-10 gap-y-10 sm:grid-cols-5 lg:gap-x-16">
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

        {/* 회사 정보(통신판매업자 표시 — 전자상거래법 §10·PG 심사 요건). 통신판매업신고번호는 신고 후 추가. */}
        <div className="mt-16 text-[13px] leading-relaxed text-white/40">
          <p>컴플로우(Complow) · 대표 조휘원 · 사업자등록번호 592-58-00892 · 주소 인천광역시 계양구 형제봉길 1, 301동 1103호(귤현동, 계양센트레빌3단지)</p>
          <p className="mt-1">전화 010-4163-1974 · 이메일 complow@complow.kr</p>
        </div>

        <div className="mt-6 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-white/40">
            <span>© 2026 Complow</span>
            <Link href="/privacy" className="font-semibold text-white/70 transition-colors hover:text-white">개인정보처리방침</Link>
            <Link href="/terms" className="transition-colors hover:text-white">이용약관</Link>
            <Link href="/refund" className="transition-colors hover:text-white">환불정책</Link>
          </div>
          {/* 소셜 — 인스타·X 실제 계정 연결됨 */}
          <div className="flex items-center gap-5">
            <a href={CONTACT} aria-label="이메일 문의" className="text-white/40 transition-colors hover:text-white">
              <Mail className="size-5" />
            </a>
            <a href="https://www.instagram.com/complow/" target="_blank" rel="noreferrer" aria-label="인스타그램" className="text-white/40 transition-colors hover:text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
                <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
              </svg>
            </a>
            <a href="https://x.com/Complowkr" target="_blank" rel="noreferrer" aria-label="X" className="text-white/40 transition-colors hover:text-white">
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-[18px]" aria-hidden>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
