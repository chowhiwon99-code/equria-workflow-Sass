"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import {
  ArrowRight, Bot, LineChart, MessagesSquare, Stamp, Plug, ShieldCheck, Sparkles,
  LayoutDashboard, Calendar, FolderKanban, Receipt, CheckCircle2, Check,
  BookOpen, Wrench, Lock, Server, KeyRound,
} from "lucide-react"
import { LandingHeader } from "./LandingHeader"
import { LandingFooter } from "./LandingFooter"
import { AuthModal } from "./AuthModal"
import { INK, CONTACT } from "./const"
import type { AuthMode } from "@/components/auth/AuthForm"

/**
 * Complow 랜딩(마케팅) 페이지 — 공개(로그인 불필요).
 * 잔디식 콘텐츠 구성(대표 결정 2026-07-28): 히어로 → 숫자 스트립 → AI 심화 →
 * 기능 개요·심화 → 보안 → 가격(요금별 기능 비교) → FAQ → 마무리 → 다크 푸터.
 * 톤은 미니멀 모노(검정+회색) 유지. GNB·푸터는 별도 컴포넌트(완전 분리).
 * 로그인·가입 = 노션식 모달(AuthModal). CTA = 무료로 사용하기(구독제).
 */

const FEATURES = [
  { icon: Bot, t: "AI 에이전트", d: "회사 지식을 학습하고 기억하는 전용 AI" },
  { icon: LineChart, t: "손익·현금흐름", d: "영수증부터 손익까지 장부 하나로" },
  { icon: MessagesSquare, t: "팀 협업", d: "채팅·회의노트·캘린더·프로젝트" },
  { icon: Stamp, t: "전자결재·근태", d: "기안·결재선·출퇴근을 간단하게" },
  { icon: Plug, t: "외부 도구 연동", d: "구글·노션 등 쓰던 도구 그대로" },
  { icon: ShieldCheck, t: "보안·격리", d: "회사별 데이터 격리와 암호화" },
]

const STATS = [
  { n: "8종", l: "바로 쓰는 기본 AI 에이전트" },
  { n: "10+", l: "하나로 합친 업무 도구" },
  { n: "100%", l: "회사별 데이터 격리" },
]

const AI_BLOCKS = [
  { icon: BookOpen, t: "회사를 아는 AI", d: "회사 문서와 지식을 학습하고 대화를 기억합니다. 일반 챗봇이 아니라, 우리 회사 기준으로 답하는 AI입니다." },
  { icon: Wrench, t: "직접 만드는 에이전트", d: "개발자 없이 직원이 빌더로 에이전트를 만듭니다. 세금계산서·CS·번역 등 8종은 기본 제공." },
  { icon: Plug, t: "도구를 쓰는 AI", d: "구글 캘린더·메일 등 외부 도구를 AI가 직접 다룹니다. 에이전트를 이어 붙여 반복 업무를 자동화합니다." },
]

const SECURITY = [
  { icon: Lock, t: "회사별 격리", d: "데이터베이스 단계에서 회사 간 데이터를 분리합니다." },
  { icon: KeyRound, t: "암호화 저장", d: "외부 연동 토큰 등 민감 정보는 암호화해 보관합니다." },
  { icon: ShieldCheck, t: "권한 관리", d: "대표·관리자·직원 역할별로 접근 범위를 나눕니다." },
  { icon: Server, t: "국내 리전", d: "데이터는 국내(서울) 리전에 저장됩니다." },
]

/** 4티어 요금 카드 (2026-07-29 대표 확정 — 워크스페이스 정액 + 인원 추가 요금 + AI 사용량)
 *  ⚠️ AI는 "크레딧"이 아니라 **사용량**으로 표기한다. 구독료에 크레딧이 포함되면 환금성으로 분류돼
 *  PG 심사가 막힌다(KCP 거절 사유 ①, 2026-08-10). 별도 판매(추가 구매)도 하지 않는다.
 *  한도 구조는 lib/credits.ts UsageKind — 채팅은 공정 사용, 자동 실행만 한도. */
const PLANS: { name: string; price: string; unit: string; credits: string; highlight: boolean; cta: string; desc: string[] }[] = [
  { name: "Basic", price: "₩0", unit: "3명 포함 · 영구 무료", credits: "AI 맛보기 · 매일 충전", highlight: false, cta: "무료로 시작", desc: ["팀 협업 (채팅·캘린더·프로젝트)", "AI 에이전트 맛보기", "회사별 데이터 격리"] },
  { name: "Standard", price: "₩29,000", unit: "/월 · 5명 포함", credits: "AI 채팅 넉넉히 · Sonnet", highlight: true, cta: "시작하기", desc: ["모든 업무 기능 (+결재·근태·회의·재무)", "AI 에이전트 전체 사용", "6명째부터 1인당 ₩4,000 · 이메일 지원"] },
  { name: "Pro", price: "₩49,000", unit: "/월 · 10명 포함", credits: "AI 채팅 넉넉히 · +Opus", highlight: false, cta: "시작하기", desc: ["스탠다드 전체 + 워크플로우·전용 에이전트", "고급 AI 모델(Opus)·대형 지식파일", "11명째부터 1인당 ₩4,000 · 우선 지원"] },
  { name: "Premium", price: "문의", unit: "무제한 인원 · 맞춤", credits: "AI 무제한 · Fable·미디어", highlight: false, cta: "도입 문의", desc: ["전 기능 + 이미지·영상 생성", "API·SSO·전용 온보딩/컨설팅", "맞춤 사용량·전용 셋업"] },
]

/** 요금별 기능 비교 (4티어) — false=미포함(—), true=체크, 문자열=값 표기 */
const PLAN_ROWS: { f: string; basic: string | boolean; std: string | boolean; pro: string | boolean; prem: string | boolean }[] = [
  { f: "팀 협업 (채팅·캘린더·프로젝트·구성원·파일)", basic: true, std: true, pro: true, prem: true },
  { f: "전자결재·근태", basic: false, std: true, pro: true, prem: true },
  { f: "회의노트(AI 요약)·명함(OCR)·비용·매출", basic: false, std: true, pro: true, prem: true },
  { f: "AI 에이전트 (기본 8종 + 직접 제작)", basic: "맛보기", std: true, pro: true, prem: true },
  { f: "AI 채팅·보조 (공정 사용)", basic: "맛보기", std: true, pro: true, prem: true },
  // ⚠️ 워크플로우는 아래 별도 행에서 Pro 전용이다 → 이 행 이름에 워크플로우를 넣으면
  //    Basic/Standard에 없는 기능의 한도를 적어놓는 모순이 된다. 전 플랜에 있는 것만 예시로.
  { f: "자동 실행 사용량 (리서치·작업 제안)", basic: "맛보기", std: "포함", pro: "2배 이상", prem: "맞춤" },
  { f: "AI 모델", basic: "Sonnet", std: "Sonnet", pro: "+Opus", prem: "+Fable" },
  { f: "지식파일 첨부", basic: "소형", std: "중형", pro: "대형", prem: "무제한" },
  { f: "워크플로우·MCP 연동", basic: false, std: false, pro: true, prem: true },
  { f: "사이드바 기능별 전용 에이전트", basic: false, std: false, pro: true, prem: true },
  { f: "미디어 생성 (이미지·영상)", basic: false, std: false, pro: false, prem: true },
  { f: "API·SSO·전용 온보딩", basic: false, std: false, pro: false, prem: true },
  // "시트"는 업계 용어라 처음 보는 사람에게 안 통한다(대표도 물어봤다) → 인원수로 직접 쓴다.
  { f: "포함 인원 / 추가 요금", basic: "3명", std: "5명 / 1인당 ₩4,000", pro: "10명 / 1인당 ₩4,000", prem: "무제한" },
]

const FAQS = [
  { q: "정말 무료로 시작할 수 있나요?", a: "네. Basic 플랜은 별도 카드 등록 없이 영구 무료입니다. 팀 협업 기능과 AI 맛보기가 포함되고, AI 사용량은 매일 조금씩 다시 채워집니다. 더 쓰려면 유료 플랜으로 올리면 됩니다." },
  { q: "요금은 어떻게 되나요?", a: "회사 단위 정액(Basic 무료 · Standard ₩29,000 · Pro ₩49,000)에 포함 인원을 넘으면 1인당 ₩4,000이 붙습니다. AI는 요금제에 포함된 사용량 안에서 쓰고, 더 필요하면 상위 플랜으로 올리면 됩니다. 연간 결제 시 2개월 무료." },
  { q: "AI를 쓰다가 갑자기 막히지 않나요?", a: "사람이 직접 쓰는 AI 채팅과 보조 기능은 공정 사용 범위에서 막지 않습니다. 사용량 한도는 리서치·작업 제안·워크플로우 자동 실행처럼 사람 없이 도는 작업에만 적용되고, 그마저도 매일(무료) 또는 매달(유료) 다시 채워집니다." },
  { q: "우리 회사 데이터는 안전한가요?", a: "회사별로 데이터가 격리되고, 민감 정보는 암호화해 국내 리전에 저장합니다. 데이터의 소유권은 회사에 있습니다." },
  { q: "우리 회사 방식에 맞출 수 있나요?", a: "그게 컴플로우(Complow)의 출발점입니다. 손익 계산 수식, AI 에이전트, 결재선까지 회사 방식대로 직접 구성할 수 있습니다." },
  { q: "도입은 어떻게 진행되나요?", a: "도입 문의를 남기면 세팅부터 온보딩까지 함께합니다. 쓰던 도구(구글·노션 등)는 연동으로 그대로 이어집니다." },
]

export default function LandingPage() {
  const router = useRouter()
  // 로그인·가입 모달(노션식) — null이면 닫힘
  const [auth, setAuth] = useState<AuthMode | null>(null)
  // 로그인 상태 — 랜딩은 로그인해도 열람(2026-07-28), 상태에 따라 CTA만 앱 진입으로 전환
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => setLoggedIn(!!data.session))
  }, [])

  // 본문 CTA — 로그인 상태면 모달 대신 앱으로
  const startFree = () => (loggedIn ? router.push("/dashboard") : setAuth("signup"))

  return (
    <div className="min-h-screen bg-white" style={{ color: INK }}>
      <LandingHeader onLogin={() => setAuth("login")} onSignup={() => setAuth("signup")} loggedIn={loggedIn} />

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
          AI 에이전트부터 손익 관리까지 — 회사에 맞게 커스터마이징되는 업무 플랫폼, 컴플로우.
        </p>
        <div className="animate-fade-up mt-10 flex flex-col items-center gap-4" style={{ animationDelay: "0.2s" }}>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={startFree}
              className="inline-flex items-center gap-2 rounded-lg px-6 py-3.5 text-[15px] font-bold text-white transition-opacity hover:opacity-85"
              style={{ background: INK }}
            >
              Complow 무료로 사용하기 <ArrowRight className="size-4" />
            </button>
            <a href={CONTACT} className="inline-flex items-center rounded-lg bg-black/[0.05] px-6 py-3.5 text-[15px] font-bold text-black/70 transition-colors hover:bg-black/[0.08]">
              도입 문의하기
            </a>
          </div>
          <span className="text-[13px] text-black/35">별도 카드 없이 무료로 시작 · 도입부터 세팅까지 함께합니다</span>
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

      {/* ── 숫자 스트립 ── */}
      <section className="mx-auto max-w-4xl border-t border-black/[0.06] px-6 py-16">
        <div className="grid grid-cols-1 gap-10 text-center sm:grid-cols-3">
          {STATS.map((s) => (
            <div key={s.l}>
              <p className="text-4xl font-extrabold tracking-tight">{s.n}</p>
              <p className="mt-2 text-[14px] text-black/45">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── AI — 심화 ── */}
      <section id="ai" className="mx-auto max-w-4xl scroll-mt-16 border-t border-black/[0.06] px-6 py-24">
        <div className="text-center">
          <h2 className="text-[clamp(1.6rem,4vw,2.2rem)] font-extrabold tracking-[-0.02em]">
            AI가 따로 있지 않고,
            <br />
            업무 흐름 안에 있습니다.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-black/45">
            메뉴 하나가 아니라 바탕입니다. 손익을 묻고, 문서를 쓰고, 일정을 잡는 모든 순간에 AI가 함께 움직입니다.
          </p>
        </div>
        <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-3">
          {AI_BLOCKS.map((b) => (
            <div key={b.t}>
              <b.icon className="size-5" strokeWidth={1.75} />
              <h3 className="mt-3.5 text-[15px] font-semibold">{b.t}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-black/45">{b.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 기능 — 개요 그리드 + 심화 블록 ── */}
      <section id="features" className="mx-auto max-w-4xl scroll-mt-16 border-t border-black/[0.06] px-6 py-24">
        <div className="text-center">
          <h2 className="text-[clamp(1.6rem,4vw,2.2rem)] font-extrabold tracking-[-0.02em]">일에 필요한 전부, 여기에.</h2>
          <p className="mt-3 text-[15px] text-black/45">흩어져 있던 도구를 하나로 합쳤습니다.</p>
        </div>
        <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.t}>
              <f.icon className="size-5" strokeWidth={1.75} />
              <h3 className="mt-3.5 text-[15px] font-semibold">{f.t}</h3>
              <p className="mt-1 text-[14px] leading-relaxed text-black/45">{f.d}</p>
            </div>
          ))}
        </div>

        {/* 심화 1 — 손익·현금흐름 */}
        <div className="mt-24 grid items-center gap-10 sm:grid-cols-2">
          <div>
            <p className="text-[13px] font-bold text-black/40">손익·현금흐름</p>
            <h3 className="mt-2 text-[22px] font-extrabold tracking-tight">기록 한 번에, 장부 전체가 움직입니다.</h3>
            <ul className="mt-4 space-y-2.5 text-[14px] leading-relaxed text-black/55">
              <li>캔버스에서 기록하면 내역·추세·손익에 즉시 반영</li>
              <li>세금계산서를 확정하면 매출이 자동으로 잡힙니다</li>
              <li>급여·수수료는 회사 수식대로 자동 계산 (자연어로 수식 생성)</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-black/[0.06] bg-[#fbfbfc] p-5">
            <p className="text-[12px] font-semibold text-black/40">11월 손익</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] font-semibold">매출 ₩128,400,000</span>
              <span className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] font-semibold">비용 ₩41,200,000</span>
            </div>
            <div className="mt-3 rounded-xl border border-black/[0.05] bg-white p-3.5 text-[12px] shadow-sm">
              <div className="flex items-center justify-between font-medium">
                <span>정규직 월급 · 4명</span>
                <span className="tabular-nums text-black/60">₩11,080,000</span>
              </div>
              <p className="mt-1 text-[11px] text-black/35">월급 × (1 + 사업주 부담 10.8%) 자동 계산</p>
            </div>
          </div>
        </div>

        {/* 심화 2 — 팀 협업 */}
        <div className="mt-20 grid items-center gap-10 sm:grid-cols-2">
          <div className="order-last sm:order-first">
            <div className="rounded-2xl border border-black/[0.06] bg-[#fbfbfc] p-5">
              <p className="text-[12px] font-semibold text-black/40">전체방</p>
              <div className="mt-2.5 w-fit rounded-2xl rounded-bl-sm bg-white px-3 py-1.5 text-[12px] text-black/70 shadow-sm">오늘 회의록 정리해서 올렸어요</div>
              <div className="ml-auto mt-1.5 w-fit rounded-2xl rounded-br-sm px-3 py-1.5 text-[12px] font-medium text-white" style={{ background: INK }}>확인! 액션아이템은 프로젝트에 넣을게요</div>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-black/[0.05] bg-white p-2.5 text-[12px] text-black/60 shadow-sm">
                <Calendar className="size-3.5" /> 내일 10:00 — 신제품 킥오프 (팀 캘린더)
              </div>
            </div>
          </div>
          <div>
            <p className="text-[13px] font-bold text-black/40">팀 협업</p>
            <h3 className="mt-2 text-[22px] font-extrabold tracking-tight">말한 것이 일정이 되고, 일이 됩니다.</h3>
            <ul className="mt-4 space-y-2.5 text-[14px] leading-relaxed text-black/55">
              <li>전체방·개인 채팅으로 팀 대화를 한곳에</li>
              <li>회의노트는 분류·중요도로 정리, AI가 요약</li>
              <li>팀 캘린더와 프로젝트로 일정·할 일을 공유</li>
            </ul>
          </div>
        </div>

        {/* 심화 3 — 전자결재·근태 */}
        <div className="mt-20 grid items-center gap-10 sm:grid-cols-2">
          <div>
            <p className="text-[13px] font-bold text-black/40">전자결재·근태</p>
            <h3 className="mt-2 text-[22px] font-extrabold tracking-tight">종이 없이, 기다림 없이 승인.</h3>
            <ul className="mt-4 space-y-2.5 text-[14px] leading-relaxed text-black/55">
              <li>직원이 기안하면 결재선을 따라 관리자·대표가 승인</li>
              <li>휴가·지출·구매 등 회사에 필요한 양식대로</li>
              <li>출퇴근 기록까지 한 화면에서</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-black/[0.06] bg-[#fbfbfc] p-5">
            <p className="text-[12px] font-semibold text-black/40">지출 결의 — 마케팅비</p>
            <div className="mt-3 space-y-2">
              {[
                { l: "기안 — 김민지", done: true },
                { l: "검토 — 팀장", done: true },
                { l: "승인 — 대표", done: false },
              ].map((s) => (
                <div key={s.l} className="flex items-center gap-2.5 rounded-xl border border-black/[0.05] bg-white p-2.5 text-[12px] shadow-sm">
                  <CheckCircle2 className={`size-4 ${s.done ? "text-emerald-500" : "text-black/20"}`} />
                  <span className={s.done ? "text-black/70" : "font-semibold"}>{s.l}</span>
                  {!s.done && <span className="ml-auto rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-semibold text-black/50">대기 중</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 심화 4 — 외부 연동 */}
        <div className="mt-20 grid items-center gap-10 sm:grid-cols-2">
          <div className="order-last sm:order-first">
            <div className="rounded-2xl border border-black/[0.06] bg-[#fbfbfc] p-5">
              <p className="text-[12px] font-semibold text-black/40">연결된 도구</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {["구글 캘린더", "Gmail", "Notion", "Slack", "환율·세금계산서"].map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.07] bg-white px-3 py-1.5 text-[12px] font-medium text-black/60 shadow-sm">
                    <Plug className="size-3" /> {t}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-black/35">연결하면 AI 에이전트가 도구를 직접 사용합니다.</p>
            </div>
          </div>
          <div>
            <p className="text-[13px] font-bold text-black/40">외부 도구 연동</p>
            <h3 className="mt-2 text-[22px] font-extrabold tracking-tight">쓰던 도구는 버리지 않아도 됩니다.</h3>
            <ul className="mt-4 space-y-2.5 text-[14px] leading-relaxed text-black/55">
              <li>구글·노션 등 기존 도구를 계정 연결 한 번으로</li>
              <li>AI가 일정을 읽고, 메일 초안을 쓰고, 문서를 찾습니다</li>
              <li>회사가 허용한 도구만 연결되도록 관리자가 통제</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── 보안 ── */}
      <section className="mx-auto max-w-4xl border-t border-black/[0.06] px-6 py-24">
        <div className="text-center">
          <h2 className="text-[clamp(1.6rem,4vw,2.2rem)] font-extrabold tracking-[-0.02em]">회사 데이터는 회사의 것.</h2>
          <p className="mt-3 text-[15px] text-black/45">보안은 기능이 아니라 기본값입니다.</p>
        </div>
        <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {SECURITY.map((s) => (
            <div key={s.t}>
              <s.icon className="size-5" strokeWidth={1.75} />
              <h3 className="mt-3 text-[15px] font-semibold">{s.t}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-black/45">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 구독제 — 가격 카드 + 요금별 기능 비교(가격은 토큰 원가 측정 후 확정) ── */}
      <section id="pricing" className="mx-auto max-w-5xl scroll-mt-16 border-t border-black/[0.06] px-6 py-24">
        <div className="text-center">
          <h2 className="text-[clamp(1.6rem,4vw,2.2rem)] font-extrabold tracking-[-0.02em]">간단한 구독제</h2>
          <p className="mt-3 text-[15px] text-black/45">회사 단위로 시작하고, 인원만큼만 내세요. AI 채팅은 넉넉하게.</p>
          {/* 얼리버드 스트립(프로모션 틀) */}
          <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-black/[0.03] px-3.5 py-1.5 text-[12px] font-semibold text-black/60">
            <Sparkles className="size-3.5" /> 얼리버드 — 사전 신청 회사 한정 할인 예정
          </span>
        </div>
        <div className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p) => (
            <div key={p.name} className={`flex flex-col rounded-2xl border p-6 ${p.highlight ? "" : "border-black/[0.08]"}`} style={p.highlight ? { borderColor: INK } : undefined}>
              {/* min-h: '추천' 배지가 있는 카드만 헤더가 몇 px 높아져 아래 줄이 어긋나는 것을 막는다 */}
              <div className="flex min-h-[26px] items-center justify-between">
                <span className="text-[15px] font-bold">{p.name}</span>
                {p.highlight && <span className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ background: INK }}>추천</span>}
              </div>
              {/* 가격·단위·AI설명을 각각 한 줄로 고정한다.
                  같은 줄에 두면 긴 단위(Pro '/월 · 10명 포함')가 카드 폭을 넘겨 줄바꿈되고,
                  그 카드만 아래 내용이 통째로 밀려 4장의 줄이 어긋난다. */}
              <div className="mt-3 text-[26px] font-extrabold leading-none tracking-tight">{p.price}</div>
              <p className="mt-1.5 text-[12px] leading-snug text-black/40">{p.unit}</p>
              <p className="mt-2 text-[12px] font-semibold leading-snug text-black/55">{p.credits}</p>
              <ul className="mt-4 flex-1 space-y-2 text-[13px] leading-relaxed text-black/55">
                {p.desc.map((d) => (
                  <li key={d} className="flex gap-1.5">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-black/40" strokeWidth={2.25} /> {d}
                  </li>
                ))}
              </ul>
              {p.cta === "도입 문의" ? (
                <a href={CONTACT} className="mt-6 block rounded-lg border border-black/15 py-2.5 text-center text-[13px] font-bold text-black/70 transition-colors hover:bg-black/[0.04]">{p.cta}</a>
              ) : (
                <button
                  type="button"
                  onClick={startFree}
                  className={`mt-6 block w-full rounded-lg py-2.5 text-center text-[13px] font-bold transition-opacity hover:opacity-85 ${p.highlight ? "text-white" : "border border-black/15 text-black/70"}`}
                  style={p.highlight ? { background: INK } : undefined}
                >
                  {p.cta}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* 요금별 기능 비교 표 (4티어) */}
        <div className="mx-auto mt-12 max-w-3xl overflow-x-auto rounded-2xl border border-black/[0.07]">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-black/[0.06] bg-[#fbfbfc] text-black/45">
                <th className="px-4 py-3 font-semibold">기능</th>
                <th className="w-24 px-3 py-3 text-center font-semibold">Basic</th>
                <th className="w-28 px-3 py-3 text-center font-semibold">Standard</th>
                <th className="w-24 px-3 py-3 text-center font-semibold">Pro</th>
                <th className="w-28 px-3 py-3 text-center font-semibold">Premium</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_ROWS.map((r) => (
                <tr key={r.f} className="border-b border-black/[0.04] last:border-0">
                  <td className="px-4 py-3 text-black/70">{r.f}</td>
                  {[r.basic, r.std, r.pro, r.prem].map((v, i) => (
                    <td key={i} className="px-3 py-3 text-center">
                      {v === true ? (
                        <Check className="mx-auto size-4" strokeWidth={2.25} />
                      ) : v === false ? (
                        <span className="text-black/20">—</span>
                      ) : (
                        <span className="text-black/55">{v}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* 프로모션 틀 — 연간·리퍼럴 자리 */}
        <p className="mt-6 text-center text-[13px] text-black/40">연간 결제 시 2개월 무료 · 추천한 회사가 시작하면 양쪽 모두 1개월 무료</p>
      </section>

      {/* ── FAQ ── */}
      <section className="mx-auto max-w-2xl border-t border-black/[0.06] px-6 py-24">
        <h2 className="text-center text-[clamp(1.6rem,4vw,2.2rem)] font-extrabold tracking-[-0.02em]">자주 묻는 질문</h2>
        <div className="mt-10 divide-y divide-black/[0.06] border-y border-black/[0.06]">
          {FAQS.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
                {f.q}
                <ArrowRight className="size-4 shrink-0 text-black/30 transition-transform group-open:rotate-90" />
              </summary>
              <p className="mt-3 text-[14px] leading-relaxed text-black/50">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-center text-[13px] text-black/40">
          더 궁금한 점은 <a href={CONTACT} className="font-semibold text-black/70 underline">이메일로 물어보세요</a>.
        </p>
      </section>

      {/* ── 마무리 ── */}
      <section className="mx-auto max-w-4xl border-t border-black/[0.06] px-6 py-24 text-center">
        <h2 className="text-[clamp(1.6rem,4vw,2.2rem)] font-extrabold tracking-[-0.02em]">지금, 회사의 일을 흐르게.</h2>
        <div className="mt-8 flex justify-center">
          <button type="button" onClick={startFree} className="inline-flex items-center gap-2 rounded-lg px-6 py-3.5 text-[15px] font-bold text-white transition-opacity hover:opacity-85" style={{ background: INK }}>
            Complow 무료로 사용하기 <ArrowRight className="size-4" />
          </button>
        </div>
      </section>

      <LandingFooter />

      {/* ── 로그인·가입 모달(노션식) — 랜딩 위 블러 오버레이 ── */}
      {auth && <AuthModal mode={auth} onClose={() => setAuth(null)} onSwitchMode={setAuth} />}
    </div>
  )
}
