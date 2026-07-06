import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Check } from "lucide-react"

/**
 * Complow 랜딩(마케팅) 페이지 — 공개(로그인 불필요).
 * 포인트 컬러: 토마토레드 #ff4628 · 제트블랙 #202020 · 스틸블루 #b8c8d7.
 * 앱과 분리된 마케팅 표면. "앱 열기/시작하기"로 로그인 → 워크스페이스 진입.
 */

const RED = "#ff4628"
const INK = "#202020"

function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Image src="/complow-logo.png" alt="Complow" width={215} height={120} className="h-[22px] w-auto" priority />
      <span className="text-[17px] font-extrabold tracking-tight" style={{ color: INK }}>
        Complow<span style={{ color: RED }}>.</span>
      </span>
    </span>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white" style={{ color: INK }}>
      {/* ── 헤더 ── */}
      <header className="sticky top-0 z-30 border-b border-black/[0.06] bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm font-medium text-black/60 md:flex">
            <a href="#pricing" className="transition-colors hover:text-black">가격</a>
            <a href="#download" className="transition-colors hover:text-black">다운로드</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg px-3.5 py-2 text-sm font-semibold text-black/70 transition-colors hover:bg-black/[0.04]">
              로그인
            </Link>
            <Link
              href="/signup"
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.03]"
              style={{ background: RED }}
            >
              무료로 시작하기
            </Link>
          </div>
        </div>
      </header>

      {/* ── 히어로 ── */}
      <section className="relative overflow-hidden">
        <div className="relative mx-auto max-w-3xl px-5 pt-24 pb-10 text-center">
          <h1 className="text-[clamp(2.2rem,6vw,3.6rem)] font-extrabold leading-[1.1] tracking-[-0.03em]">
            회사의 모든 일을,<br />
            하나의 <span style={{ color: RED }}>워크스페이스</span>로.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-black/55">
            AI 에이전트·팀 협업·현금흐름까지 — 흩어진 업무 도구를
            <br className="hidden sm:block" /> <b style={{ color: INK }}>Complow</b> 하나로 모으고, 일이 흐르게 만드세요.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-[15px] font-bold text-white shadow-lg transition-transform hover:scale-[1.03]"
              style={{ background: RED }}
            >
              무료로 시작하기 <ArrowRight className="size-4" />
            </Link>
            <a
              href="#download"
              className="inline-flex items-center gap-2 rounded-xl border-2 px-6 py-3.5 text-[15px] font-bold transition-colors hover:bg-black/[0.03]"
              style={{ borderColor: INK, color: INK }}
            >
              데스크톱 앱 다운로드
            </a>
          </div>
          <p className="mt-4 text-[13px] text-black/40">신용카드 없이 시작 · 팀 초대 무료</p>
        </div>

        {/* ── 앱 목업 ── */}
        <div className="relative mx-auto -mb-24 max-w-5xl px-5">
          <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-2xl">
            {/* 창 상단바 */}
            <div className="flex items-center gap-2 border-b border-black/[0.06] bg-[#f7f8fa] px-4 py-3">
              <span className="size-3 rounded-full bg-[#ff5f57]" />
              <span className="size-3 rounded-full bg-[#febc2e]" />
              <span className="size-3 rounded-full bg-[#28c840]" />
              <span className="ml-3 rounded-md bg-white px-3 py-1 text-xs font-medium text-black/50 shadow-sm">Complow · 대시보드</span>
            </div>
            <div className="flex h-[340px]">
              {/* 사이드바 */}
              <aside className="hidden w-52 shrink-0 border-r border-black/[0.06] bg-[#fbfbfc] p-3 sm:block">
                <div className="mb-4 px-2"><Logo /></div>
                {["대시보드", "AI 에이전트", "팀 채팅", "현금흐름", "회의노트", "명함"].map((it, i) => (
                  <div key={it} className={`mb-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium ${i === 0 ? "text-white" : "text-black/60"}`}
                       style={i === 0 ? { background: INK } : undefined}>
                    <span className="size-2 rounded-full" style={{ background: i === 0 ? RED : "#b8c8d7" }} />
                    {it}
                  </div>
                ))}
              </aside>
              {/* 본문 */}
              <div className="flex-1 p-6">
                <div className="mb-5 h-6 w-40 rounded-md bg-black/[0.08]" />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
                      <div className="mb-3 size-8 rounded-lg" style={{ background: i % 3 === 0 ? RED : "#b8c8d7", opacity: i % 3 === 0 ? 1 : 0.6 }} />
                      <div className="mb-2 h-3 w-4/5 rounded bg-black/[0.10]" />
                      <div className="h-3 w-3/5 rounded bg-black/[0.06]" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 가격(간단) ── */}
      <section id="pricing" className="pt-40 pb-24">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <h2 className="text-[clamp(1.8rem,4vw,2.4rem)] font-extrabold tracking-[-0.02em]">간단한 가격</h2>
          <p className="mt-3 text-[16px] text-black/55">회사 단위로 시작하고, 필요한 만큼 자리를 추가하세요.</p>
          <div className="mx-auto mt-10 grid max-w-2xl gap-5 sm:grid-cols-2">
            {[
              { name: "무료 체험", price: "₩0", items: ["소규모 팀", "핵심 협업 기능", "커뮤니티 지원"] },
              { name: "비즈니스", price: "문의", items: ["AI 에이전트·워크플로우", "현금흐름·회의노트 전체", "우선 지원"], hot: true },
            ].map((p) => (
              <div key={p.name} className={`rounded-2xl border p-7 text-left ${p.hot ? "shadow-xl" : "border-black/[0.08] shadow-sm"}`}
                   style={p.hot ? { borderColor: RED } : undefined}>
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-bold">{p.name}</span>
                  {p.hot && <span className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ background: RED }}>추천</span>}
                </div>
                <div className="mt-3 text-3xl font-extrabold tracking-tight">{p.price}</div>
                <ul className="mt-5 space-y-2.5">
                  {p.items.map((it) => (
                    <li key={it} className="flex items-center gap-2 text-[14px] text-black/70">
                      <Check className="size-4" style={{ color: RED }} /> {it}
                    </li>
                  ))}
                </ul>
                <Link href="/signup"
                      className={`mt-6 block rounded-xl py-3 text-center text-[14px] font-bold transition-transform hover:scale-[1.02] ${p.hot ? "text-white shadow-md" : "border-2"}`}
                      style={p.hot ? { background: RED } : { borderColor: INK, color: INK }}>
                  {p.hot ? "도입 문의하기" : "무료로 시작하기"}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA 밴드 ── */}
      <section id="download" className="px-5 py-8">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl px-8 py-16 text-center" style={{ background: INK }}>
          <h2 className="text-[clamp(1.8rem,4vw,2.6rem)] font-extrabold tracking-[-0.02em] text-white">
            지금, 회사의 일을 <span style={{ color: RED }}>흐르게.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[16px] text-white/60">몇 분 만에 팀을 초대하고 AI 워크스페이스를 시작하세요.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-[15px] font-bold text-white shadow-lg transition-transform hover:scale-[1.03]" style={{ background: RED }}>
              무료로 시작하기 <ArrowRight className="size-4" />
            </Link>
            <span className="inline-flex items-center gap-2 rounded-xl border-2 border-white/20 px-6 py-3.5 text-[15px] font-bold text-white/50">
              데스크톱 앱 (준비 중)
            </span>
          </div>
        </div>
      </section>

      {/* ── 푸터 ── */}
      <footer className="border-t border-black/[0.06] py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-5 sm:flex-row">
          <Logo />
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] font-medium text-black/50">
            <a href="#pricing" className="hover:text-black">가격</a>
            <Link href="/login" className="hover:text-black">로그인</Link>
            <span className="text-black/30">개인정보처리방침</span>
            <span className="text-black/30">이용약관</span>
          </nav>
          <span className="text-[13px] text-black/40">© 2026 Complow</span>
        </div>
      </footer>
    </div>
  )
}
