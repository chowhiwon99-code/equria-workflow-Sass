import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Bot, LineChart, MessagesSquare, Stamp, Plug, ShieldCheck } from "lucide-react"

const CONTACT = "mailto:complow@complow.kr?subject=Complow 도입 문의"

/**
 * Complow 랜딩(마케팅) 페이지 — 공개(로그인 불필요).
 * 포인트 컬러: 제트블랙 #202020 · 스틸블루 #b8c8d7 — 모노톤(새 로고 정합, 토마토레드 제거 2026-07-27).
 * 앱과 분리된 마케팅 표면. "앱 열기/시작하기"로 로그인 → 워크스페이스 진입.
 */

const INK = "#202020"

// 가로형 로고(심볼+워드마크 포함) — 대표 제공 브랜드 로고(2026-07-27)
function Logo({ className = "" }: { className?: string }) {
  return <Image src="/brand/logo-horizontal.png" alt="Complow" width={1044} height={256} className={`h-7 w-auto ${className}`} priority />
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white" style={{ color: INK }}>
      {/* ── 헤더 ── */}
      <header className="sticky top-0 z-30 border-b border-black/[0.06] bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo />
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg px-3.5 py-2 text-sm font-semibold text-black/70 transition-colors hover:bg-black/[0.04]">
              로그인
            </Link>
            <a
              href={CONTACT}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.03]"
              style={{ background: INK }}
            >
              도입 문의
            </a>
          </div>
        </div>
      </header>

      {/* ── 히어로 ── */}
      <section className="relative overflow-hidden">
        <div className="relative mx-auto max-w-3xl px-5 pt-24 pb-10 text-center">
          <h1 className="text-[clamp(2.2rem,6vw,3.6rem)] font-extrabold leading-[1.1] tracking-[-0.03em]">
            회사의 모든 일을,<br />
            하나의 워크스페이스로.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-black/55">
            AI 에이전트·팀 협업·손익 관리까지 — 흩어진 업무 도구를
            <br className="hidden sm:block" /> <b style={{ color: INK }}>Complow</b> 하나로 모으고, 회사에 맞게 커스터마이징하세요.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={CONTACT}
              className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-[15px] font-bold text-white shadow-lg transition-transform hover:scale-[1.03]"
              style={{ background: INK }}
            >
              도입 문의하기 <ArrowRight className="size-4" />
            </a>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl border-2 px-6 py-3.5 text-[15px] font-bold transition-colors hover:bg-black/[0.03]"
              style={{ borderColor: INK, color: INK }}
            >
              로그인
            </Link>
          </div>
          <p className="mt-4 text-[13px] text-black/40">도입부터 세팅까지 함께합니다 · 문의 후 1영업일 내 회신</p>
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
                    <span className="size-2 rounded-full" style={{ background: i === 0 ? INK : "#b8c8d7" }} />
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
                      <div className="mb-3 size-8 rounded-lg" style={{ background: i % 3 === 0 ? INK : "#b8c8d7", opacity: i % 3 === 0 ? 1 : 0.6 }} />
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

      {/* ── 핵심 기능 ── */}
      <section className="pt-40 pb-16">
        <div className="mx-auto max-w-5xl px-5">
          <h2 className="text-center text-[clamp(1.8rem,4vw,2.4rem)] font-extrabold tracking-[-0.02em]">
            회사 운영에 필요한 전부, 한 곳에
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Bot, t: "AI 에이전트", d: "회사 지식을 학습하고 기억하는 우리 회사 전용 AI. 메일·문서·번역까지 회사 톤으로." },
              { icon: LineChart, t: "손익·현금흐름", d: "영수증 올리면 장부·손익·추세가 하나로. 급여·수식 계산까지 자동." },
              { icon: MessagesSquare, t: "팀 협업", d: "채팅·회의노트·캘린더·프로젝트 — 팀의 하루가 한 화면에서 돌아갑니다." },
              { icon: Stamp, t: "전자결재·근태", d: "기안·결재선·승인과 출퇴근 기록을 카카오워크처럼 간단하게." },
              { icon: Plug, t: "외부 도구 연동", d: "구글·노션·깃허브 등 쓰던 도구를 그대로 연결해 AI가 활용합니다." },
              { icon: ShieldCheck, t: "보안·격리", d: "회사별 데이터 완전 격리(RLS)와 토큰 암호화. 내 대화는 나만 봅니다." },
            ].map((f) => (
              <div key={f.t} className="rounded-2xl border border-black/[0.07] bg-white p-6 shadow-sm">
                <f.icon className="size-6" style={{ color: INK }} />
                <h3 className="mt-3 text-[15px] font-bold">{f.t}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-black/55">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA 밴드 ── */}
      <section className="px-5 py-8">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl px-8 py-16 text-center" style={{ background: INK }}>
          <h2 className="text-[clamp(1.8rem,4vw,2.6rem)] font-extrabold tracking-[-0.02em] text-white">
            지금, 회사의 일을 <span style={{ color: "#b8c8d7" }}>흐르게.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[16px] text-white/60">회사에 맞춘 세팅부터 정착까지, 도입 전 과정을 함께합니다.</p>
          <div className="mt-8 flex justify-center">
            {/* 잉크 밴드 위라 반전(흰 버튼) — 모노톤 전환 시 검정 위 검정 방지 */}
            <a href={CONTACT} className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-[15px] font-bold shadow-lg transition-transform hover:scale-[1.03]" style={{ color: INK }}>
              도입 문의하기 <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ── 푸터 ── */}
      <footer className="border-t border-black/[0.06] py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-5 sm:flex-row">
          <Logo />
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] font-medium text-black/50">
            <Link href="/login" className="hover:text-black">로그인</Link>
            <Link href="/terms" className="hover:text-black">이용약관</Link>
            <Link href="/privacy" className="hover:text-black">개인정보처리방침</Link>
            <Link href="/refund" className="hover:text-black">환불정책</Link>
            <a href={CONTACT} className="hover:text-black">도입 문의</a>
          </nav>
          <span className="text-[13px] text-black/40">© 2026 Complow</span>
        </div>
      </footer>
    </div>
  )
}
