import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Bot, LineChart, MessagesSquare, Stamp, Plug, ShieldCheck } from "lucide-react"

/**
 * Complow 랜딩(마케팅) 페이지 — 공개(로그인 불필요).
 * 미니멀리즘(대표 결정 2026-07-27): 타이포 중심·여백·모노톤(검정+회색), 목업/카드/컬러 밴드 제거.
 * CTA = 도입 문의(영업주도). 앱과 분리된 마케팅 표면.
 */

const INK = "#111111"
const CONTACT = "mailto:complow@complow.kr?subject=Complow 도입 문의"

// 가로형 로고(심볼+워드마크 포함) — 대표 제공 브랜드 로고(2026-07-27)
function Logo({ className = "" }: { className?: string }) {
  return <Image src="/brand/logo-horizontal.png" alt="Complow" width={1046} height={256} className={`h-6 w-auto ${className}`} priority />
}

const FEATURES = [
  { icon: Bot, t: "AI 에이전트", d: "회사 지식을 학습하고 기억하는 전용 AI" },
  { icon: LineChart, t: "손익·현금흐름", d: "영수증부터 손익까지 장부 하나로" },
  { icon: MessagesSquare, t: "팀 협업", d: "채팅·회의노트·캘린더·프로젝트" },
  { icon: Stamp, t: "전자결재·근태", d: "기안·결재선·출퇴근을 간단하게" },
  { icon: Plug, t: "외부 도구 연동", d: "구글·노션 등 쓰던 도구 그대로" },
  { icon: ShieldCheck, t: "보안·격리", d: "회사별 데이터 격리와 암호화" },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white" style={{ color: INK }}>
      {/* ── 헤더 ── */}
      <header className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
        <Logo />
        <div className="flex items-center gap-5">
          <Link href="/login" className="text-sm font-medium text-black/50 transition-colors hover:text-black">
            로그인
          </Link>
          <a href={CONTACT} className="rounded-full px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-80" style={{ background: INK }}>
            도입 문의
          </a>
        </div>
      </header>

      {/* ── 히어로 — 타이포가 주인공 ── */}
      <section className="mx-auto max-w-4xl px-6 pb-28 pt-28 text-center sm:pt-36">
        <h1 className="text-[clamp(2.4rem,7vw,4.2rem)] font-extrabold leading-[1.08] tracking-[-0.035em]">
          회사의 모든 일을,
          <br />
          하나의 워크스페이스로.
        </h1>
        <p className="mx-auto mt-6 max-w-md text-[17px] leading-relaxed text-black/45">
          AI 에이전트부터 손익 관리까지 — 회사에 맞게 커스터마이징되는 업무 플랫폼.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4">
          <a
            href={CONTACT}
            className="inline-flex items-center gap-2 rounded-full px-7 py-4 text-[15px] font-bold text-white transition-opacity hover:opacity-80"
            style={{ background: INK }}
          >
            도입 문의하기 <ArrowRight className="size-4" />
          </a>
          <span className="text-[13px] text-black/35">문의 후 1영업일 내 회신 · 도입부터 세팅까지 함께합니다</span>
        </div>
      </section>

      {/* ── 기능 — 선 없는 그리드 ── */}
      <section className="mx-auto max-w-4xl border-t border-black/[0.06] px-6 py-24">
        <div className="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.t}>
              <f.icon className="size-5" strokeWidth={1.75} />
              <h3 className="mt-3.5 text-[15px] font-semibold">{f.t}</h3>
              <p className="mt-1 text-[14px] leading-relaxed text-black/45">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 마무리 ── */}
      <section className="mx-auto max-w-4xl border-t border-black/[0.06] px-6 py-24 text-center">
        <h2 className="text-[clamp(1.6rem,4vw,2.2rem)] font-extrabold tracking-[-0.02em]">지금, 회사의 일을 흐르게.</h2>
        <div className="mt-8 flex justify-center">
          <a href={CONTACT} className="inline-flex items-center gap-2 rounded-full px-7 py-4 text-[15px] font-bold text-white transition-opacity hover:opacity-80" style={{ background: INK }}>
            도입 문의하기 <ArrowRight className="size-4" />
          </a>
        </div>
      </section>

      {/* ── 푸터 ── */}
      <footer className="border-t border-black/[0.06]">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 px-6 py-10 sm:flex-row">
          <Logo className="h-5 opacity-60" />
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-black/40">
            <Link href="/login" className="hover:text-black">로그인</Link>
            <Link href="/terms" className="hover:text-black">이용약관</Link>
            <Link href="/privacy" className="hover:text-black">개인정보처리방침</Link>
            <Link href="/refund" className="hover:text-black">환불정책</Link>
            <a href={CONTACT} className="hover:text-black">도입 문의</a>
          </nav>
          <span className="text-[13px] text-black/30">© 2026 Complow</span>
        </div>
      </footer>
    </div>
  )
}
