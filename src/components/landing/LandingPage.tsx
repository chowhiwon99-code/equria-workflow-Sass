import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Bot, LineChart, MessagesSquare, Stamp, Plug, ShieldCheck, Sparkles, LayoutDashboard, Calendar, FolderKanban, Receipt, CheckCircle2 } from "lucide-react"

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

      {/* ── 히어로 — 타이포 중심 + 잔디식 플로팅 AI 말풍선 ── */}
      <section className="relative mx-auto max-w-5xl px-6 pt-28 text-center sm:pt-36">
        {/* 떠다니는 AI 프롬프트 칩(장식) — 데스크톱만, 각기 다른 딜레이로 둥둥 */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
          <span className="animate-float absolute left-2 top-24 inline-flex items-center gap-1.5 rounded-full border border-black/[0.07] bg-white px-3.5 py-2 text-[13px] font-medium text-black/60 shadow-[0_8px_24px_rgba(0,0,0,0.07)]">
            <Sparkles className="size-3.5" /> 회사 톤으로 메일 써줘
          </span>
          <span className="animate-float absolute right-0 top-40 inline-flex items-center gap-1.5 rounded-full border border-black/[0.07] bg-white px-3.5 py-2 text-[13px] font-medium text-black/60 shadow-[0_8px_24px_rgba(0,0,0,0.07)]" style={{ animationDelay: "0.7s" }}>
            <Bot className="size-3.5" /> 이번 달 손익 요약해줘
          </span>
          <span className="animate-float absolute left-16 top-[19rem] inline-flex items-center gap-1.5 rounded-full border border-black/[0.07] bg-white px-3.5 py-2 text-[13px] font-medium text-black/60 shadow-[0_8px_24px_rgba(0,0,0,0.07)]" style={{ animationDelay: "1.3s" }}>
            <CheckCircle2 className="size-3.5" /> 회의록 액션아이템 뽑아줘
          </span>
        </div>

        <h1 className="animate-fade-up text-[clamp(2.4rem,7vw,4.2rem)] font-extrabold leading-[1.08] tracking-[-0.035em]">
          회사의 모든 일을,
          <br />
          하나의 워크스페이스로.
        </h1>
        <p className="animate-fade-up mx-auto mt-6 max-w-md text-[17px] leading-relaxed text-black/45" style={{ animationDelay: "0.1s" }}>
          AI 에이전트부터 손익 관리까지 — 회사에 맞게 커스터마이징되는 업무 플랫폼.
        </p>
        <div className="animate-fade-up mt-10 flex flex-col items-center gap-4" style={{ animationDelay: "0.2s" }}>
          <a
            href={CONTACT}
            className="inline-flex items-center gap-2 rounded-full px-7 py-4 text-[15px] font-bold text-white transition-opacity hover:opacity-80"
            style={{ background: INK }}
          >
            도입 문의하기 <ArrowRight className="size-4" />
          </a>
          <span className="text-[13px] text-black/35">문의 후 1영업일 내 회신 · 도입부터 세팅까지 함께합니다</span>
        </div>

        {/* ── 제품 화면(실제 디자인 재현·데모 숫자) — 스르륵 등장 ── */}
        <div className="animate-fade-up relative mx-auto mt-16 max-w-4xl pb-24 text-left" style={{ animationDelay: "0.35s" }}>
          <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-[0_24px_60px_rgba(0,0,0,0.10)]">
            {/* 브라우저 바 */}
            <div className="flex items-center gap-2 border-b border-black/[0.06] bg-[#fafafa] px-4 py-2.5">
              <span className="size-2.5 rounded-full bg-[#ff5f57]" />
              <span className="size-2.5 rounded-full bg-[#febc2e]" />
              <span className="size-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-3 rounded-md bg-white px-3 py-1 text-[11px] font-medium text-black/40 shadow-sm">complow.kr</span>
            </div>
            <div className="flex h-[360px]">
              {/* 사이드바 — 실제 메뉴 구성 */}
              <aside className="hidden w-44 shrink-0 border-r border-black/[0.05] bg-[#fbfbfc] px-2.5 py-3 sm:block">
                <Image src="/brand/logo-horizontal.png" alt="" width={1046} height={256} className="mb-4 ml-1.5 h-4 w-auto" />
                {[
                  { icon: LayoutDashboard, l: "대시보드", on: true },
                  { icon: Calendar, l: "팀 캘린더" },
                  { icon: FolderKanban, l: "프로젝트" },
                  { icon: MessagesSquare, l: "직원 채팅" },
                  { icon: Receipt, l: "비용·매출" },
                  { icon: Bot, l: "AI 에이전트" },
                  { icon: Stamp, l: "전자결재" },
                ].map((m) => (
                  <div key={m.l} className={`mb-0.5 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-medium ${m.on ? "bg-black/[0.05] text-black" : "text-black/45"}`}>
                    <m.icon className="size-3.5" strokeWidth={1.75} /> {m.l}
                  </div>
                ))}
              </aside>
              {/* 본문 — 손익 요약(데모 숫자) */}
              <div className="min-w-0 flex-1 bg-[#f7f8fa] p-5">
                <p className="text-[13px] font-semibold">손익 요약</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600">매출 ₩128,400,000</span>
                  <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-500">비용 ₩41,200,000</span>
                  <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold text-blue-600">순이익 ₩87,200,000</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-black/[0.05] bg-white p-3.5 shadow-sm">
                    <p className="text-[11px] font-semibold text-black/40">오늘 할 일</p>
                    {["신제품 발주서 확정", "11월 정산 기록", "채용 면접 2시"].map((t, i) => (
                      <div key={t} className="mt-2 flex items-center gap-2 text-[12px] text-black/70">
                        <CheckCircle2 className={`size-3.5 ${i === 0 ? "text-emerald-500" : "text-black/20"}`} /> {t}
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border border-black/[0.05] bg-white p-3.5 shadow-sm">
                    <p className="text-[11px] font-semibold text-black/40">최근 기록</p>
                    {[["네이버 정산", "+₩42,300,000"], ["물류비", "−₩3,120,000"], ["마케팅비", "−₩1,800,000"]].map(([l, v]) => (
                      <div key={l} className="mt-2 flex items-center justify-between text-[12px]">
                        <span className="text-black/70">{l}</span>
                        <span className={`tabular-nums ${v.startsWith("+") ? "text-emerald-600" : "text-black/50"}`}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 에이전트 채팅 오버레이 — 둥둥 */}
          <div className="animate-float absolute -bottom-8 right-2 w-72 rounded-2xl border border-black/[0.07] bg-white p-3.5 shadow-[0_16px_48px_rgba(0,0,0,0.14)] sm:right-6" style={{ animationDelay: "0.5s" }}>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-black/40">
              <Bot className="size-3.5" /> AI 에이전트
            </div>
            <div className="mt-2 ml-auto w-fit rounded-2xl rounded-br-sm px-3 py-1.5 text-[12px] font-medium text-white" style={{ background: INK }}>
              이번 달 손익 요약해줘
            </div>
            <div className="mt-1.5 w-fit rounded-2xl rounded-bl-sm bg-black/[0.05] px-3 py-1.5 text-[12px] leading-relaxed text-black/70">
              10월 매출 ₩128,400,000 · 순이익 ₩87,200,000 — 전월 대비 12% 늘었어요.
            </div>
          </div>
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

      {/* ── 구독제 — UX 틀(가격은 토큰 원가 측정 후 확정, 프로모션 자리만 선반영) ── */}
      <section className="mx-auto max-w-4xl border-t border-black/[0.06] px-6 py-24">
        <div className="text-center">
          <h2 className="text-[clamp(1.6rem,4vw,2.2rem)] font-extrabold tracking-[-0.02em]">간단한 구독제</h2>
          <p className="mt-3 text-[15px] text-black/45">회사 단위로 시작하고, 인원만큼만 내세요. 14일 무료 체험.</p>
          {/* 얼리버드 스트립(프로모션 틀) */}
          <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-black/[0.03] px-3.5 py-1.5 text-[12px] font-semibold text-black/60">
            <Sparkles className="size-3.5" /> 얼리버드 — 사전 신청 회사 한정 할인 예정
          </span>
        </div>
        <div className="mx-auto mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
          {/* 스탠다드 */}
          <div className="rounded-2xl border p-7" style={{ borderColor: INK }}>
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-bold">스탠다드</span>
              <span className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ background: INK }}>추천</span>
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-extrabold tracking-tight">₩ —</span>
              <span className="text-[13px] text-black/40">/인/월 · 가격 공개 예정</span>
            </div>
            <ul className="mt-5 space-y-2 text-[14px] text-black/60">
              <li>모든 기능 (AI 에이전트·손익·협업·결재)</li>
              <li>AI 표준 사용량 포함</li>
              <li>이메일 지원</li>
            </ul>
            <a href={CONTACT} className="mt-7 block rounded-full py-3 text-center text-[14px] font-bold text-white transition-opacity hover:opacity-80" style={{ background: INK }}>
              도입 문의하기
            </a>
          </div>
          {/* 프로 */}
          <div className="rounded-2xl border border-black/[0.08] p-7">
            <span className="text-[15px] font-bold">프로</span>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-extrabold tracking-tight text-black/70">₩ —</span>
              <span className="text-[13px] text-black/40">/인/월 · 준비 중</span>
            </div>
            <ul className="mt-5 space-y-2 text-[14px] text-black/60">
              <li>스탠다드 전체 포함</li>
              <li>AI 사용량 한도 상향</li>
              <li>우선 지원·도입 컨설팅</li>
            </ul>
            <span className="mt-7 block rounded-full border border-black/15 py-3 text-center text-[14px] font-bold text-black/35">준비 중</span>
          </div>
        </div>
        {/* 프로모션 틀 — 연간·리퍼럴 자리 */}
        <p className="mt-6 text-center text-[13px] text-black/40">연간 결제 시 2개월 무료 · 추천한 회사가 시작하면 양쪽 모두 1개월 무료</p>
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
