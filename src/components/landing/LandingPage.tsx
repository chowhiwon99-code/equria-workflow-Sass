"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import {
  ArrowRight, Bot, LineChart, MessagesSquare, Stamp, Plug, ShieldCheck, Sparkles,
  LayoutDashboard, Calendar, FolderKanban, Receipt, CheckCircle2, Check,
  BookOpen, Wrench, Lock, Server, KeyRound, Network, Layers,
} from "lucide-react"
import { LandingHeader } from "./LandingHeader"
import { LandingFooter } from "./LandingFooter"
import { AuthModal } from "./AuthModal"
import { Reveal } from "./Reveal"
import { INK, CONTACT } from "./const"
import type { AuthMode } from "@/components/auth/AuthForm"
import { PLANS as PLAN_DEFS, type PlanDef } from "@/lib/plans"
import { formatKrw } from "@/lib/billing/orders"

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

/** "이런 분들에게 추천드려요" — 2026-08-13 대표 타겟 진술(소규모 팀·스타트업, "5~10명 팀에게
 *  필요한가"가 판단기준)을 방문자용 카피로 옮긴 것. 역할·업종이 아니라 규모·조직형태 기준. */
const TARGETS = [
  { icon: Network, t: "직원 각자 AI를 따로 쓰는 대신, 팀 전체가 하나로 씁니다", d: "구성원마다 ChatGPT를 따로 켜놓는 대신, 회사 지식을 아는 같은 에이전트를 다 같이 씁니다. 누가 얼마나 쓰는지도 회사 차원에서 보입니다." },
  { icon: Layers, t: "이것저것 따로 쓰던 도구를 하나로 합치고 싶은 초기 스타트업", d: "캘린더·채팅·회의노트·장부·결재를 앱 여러 개로 나눠 쓰는 대신, 하나로 합쳐서 씁니다." },
  { icon: Sparkles, t: "회사 업무 하나부터 AI에게 맡겨보고 싶은 조직", d: "기본 에이전트 3개로 오늘부터 시작하고, 손에 익으면 하나씩 늘려갑니다." },
]

const SECURITY = [
  { icon: Lock, t: "회사별 격리", d: "데이터베이스 단계에서 회사 간 데이터를 분리합니다." },
  { icon: KeyRound, t: "암호화 저장", d: "외부 연동 토큰 등 민감 정보는 암호화해 보관합니다." },
  { icon: ShieldCheck, t: "권한 관리", d: "대표·관리자·직원 역할별로 접근 범위를 나눕니다." },
  { icon: Server, t: "국내 리전", d: "데이터는 국내(서울) 리전에 저장됩니다." },
]

/** 3티어 요금 카드 (2026-07-29 대표 확정 — 워크스페이스 정액 + AI 사용량)
 *  ⚠️ AI는 "크레딧"이 아니라 **사용량**으로 표기한다. 구독료에 크레딧이 포함되면 환금성으로 분류돼
 *  PG 심사가 막힌다(KCP 거절 사유 ①, 2026-08-10). 별도 판매(추가 구매)도 하지 않는다.
 *  한도 구조는 lib/credits.ts UsageKind — 채팅은 공정 사용, 자동 실행만 한도. */
//  🔴 인원 추가 요금(₩4,000/인) 표기 제거 — 2026-08-15 대표 결정 ⓑ.
//  파는 것과 되는 것이 달랐다: accept_workspace_invite가 plan_seat_limit(3·5·10) 도달 시
//  'seat limit reached'로 **6번째 멤버를 거부**한다(우회 경로 없음 — workspace_members RLS에
//  INSERT 정책 0개·앱 직접 insert 0건). PG 심사자가 보는 페이지라 불일치를 남겨둘 수 없다.
//  → 좌석 추가 구매는 정기결제(빌링키)가 필요해 결제 연동 때 구현하고, **그때 문구를 되살린다**.
//     되살릴 때는 lib/plans.ts의 시트 비례 포함량(+105크레딧/인)도 함께 붙일 것.
//  Premium 카드는 뺐다(2026-08-11 대표 결정) — 타겟이 중소 규모라 맞출 이유가 없다.
//  인원이 더 필요한 회사는 상위 요금제, 10명을 넘으면 표 아래 문의 경로로.
//  ⚠️ lib/plans.ts 의 premium 은 **유지**한다(자사 워크스페이스가 쓰는 내부 무제한 플랜).
//  ⚠️ 여기엔 **실제로 있는 것만** 적는다. 없던 것 제거: API·SSO, 이미지·영상 생성, Fable,
//     사이드바 전용 에이전트(미구현), 지식파일 용량 차등(전 플랜 동일 20MB).
//  🔴 가격·인원 숫자를 여기에 다시 적지 않는다 — **lib/plans.ts가 SSOT**다.
//     예전에는 이 파일에만 3중으로 하드코딩돼 있어서(가격 카드·비교표·FAQ) plans.ts를 고쳐도
//     랜딩만 옛 숫자로 남는 구조였다. PG 심사자가 보는 페이지라 불일치를 남길 수 없다.
//     ⚠️ 표시 문구(설명·CTA)는 마케팅 카피라 그대로 두고, **숫자만** 파생시킨다.
const P = { basic: PLAN_DEFS.free, std: PLAN_DEFS.standard, pro: PLAN_DEFS.pro }
/** "5명" · 무제한(협의가)이면 "무제한". plans.ts의 seats가 null일 때 "null명"이 찍히는 걸 막는다. */
const seatText = (p: PlanDef) => (p.seats == null ? "무제한" : `${p.seats}명`)
/** 표시 가격. plans.ts의 priceKrw는 **부가세 포함 총액**이다(환불 일할 계산과 같은 정의). */
const priceText = (p: PlanDef) => (p.priceKrw == null ? "문의" : formatKrw(p.priceKrw))

const PLANS: { name: string; price: string; unit: string; credits: string; highlight: boolean; cta: string; desc: string[] }[] = [
  { name: P.basic.label, price: priceText(P.basic), unit: `${seatText(P.basic)}까지 · 영구 무료`, credits: "AI 맛보기 · 매일 사용량 제공", highlight: false, cta: "무료로 시작", desc: ["팀 협업 (채팅·캘린더·프로젝트)", "AI 에이전트 맛보기", "회사별 데이터 격리"] },
  { name: P.std.label, price: priceText(P.std), unit: `/월 · ${seatText(P.std)}까지`, credits: "AI 채팅 넉넉히 · Sonnet", highlight: true, cta: "시작하기", desc: ["모든 업무 기능 (+결재·근태·회의·재무)", "AI 에이전트 전체 사용", `인원이 늘면 ${P.pro.label}로 · 이메일 지원`] },
  { name: P.pro.label, price: priceText(P.pro), unit: `/월 · ${seatText(P.pro)}까지`, credits: "AI 채팅 넉넉히 · +Opus", highlight: false, cta: "시작하기", desc: ["스탠다드 전체 + 워크플로우·MCP 연동", "고급 AI 모델(Opus) 사용", `${seatText(P.pro)}이 넘으면 도입 문의 · 우선 지원`] },
]

/** 요금별 기능 비교 (3티어) — false=미포함(—), true=체크, 문자열=값 표기 */
const PLAN_ROWS: { f: string; basic: string | boolean; std: string | boolean; pro: string | boolean }[] = [
  { f: "팀 협업 (채팅·캘린더·프로젝트·구성원·파일)", basic: true, std: true, pro: true },
  { f: "전자결재·근태", basic: false, std: true, pro: true },
  { f: "회의노트(AI 요약)·명함(OCR)·비용·매출", basic: false, std: true, pro: true },
  { f: "AI 에이전트 (직접 제작 + 지식파일 첨부)", basic: "맛보기", std: true, pro: true },
  { f: "AI 채팅·보조 (공정 사용)", basic: "맛보기", std: true, pro: true },
  // ⚠️ 워크플로우는 아래 별도 행에서 Pro 전용이다 → 이 행 이름에 워크플로우를 넣으면
  //    Basic/Standard에 없는 기능의 한도를 적어놓는 모순이 된다. 전 플랜에 있는 것만 예시로.
  { f: "자동 실행 사용량 (리서치·작업 제안)", basic: "맛보기", std: "포함", pro: "2배 이상" },
  { f: "AI 모델", basic: "Sonnet", std: "Sonnet", pro: "+Opus" },
  { f: "워크플로우·MCP 연동", basic: false, std: false, pro: true },
  // "시트"는 업계 용어라 처음 보는 사람에게 안 통한다(대표도 물어봤다) → 인원수로 직접 쓴다.
  // ⚠️ 이 숫자는 lib/plans.ts PLANS.seats · DB plan_seat_limit()과 **같은 값**이어야 한다.
  //    셋이 어긋나면 "파는 인원"과 "실제로 들어가지는 인원"이 달라진다(2026-08-15 사고 원인).
  { f: "이용 인원 (초과 시 상위 요금제)", basic: seatText(P.basic), std: seatText(P.std), pro: seatText(P.pro) },
]

const FAQS = [
  { q: "정말 무료로 시작할 수 있나요?", a: "네. Basic 플랜은 별도 카드 등록 없이 영구 무료입니다. 팀 협업 기능과 AI 맛보기가 포함되고, AI 사용량은 매일 조금씩 다시 채워집니다. 더 쓰려면 유료 플랜으로 올리면 됩니다." },
  { q: "요금은 어떻게 되나요?", a: `회사 단위 정액입니다(${P.basic.label} 무료 · ${P.std.label} ${priceText(P.std)} · ${P.pro.label} ${priceText(P.pro)}). 요금제마다 이용 인원이 정해져 있고(${seatText(P.basic)}·${seatText(P.std)}·${seatText(P.pro)}), 인원이 늘면 상위 요금제로 올리시면 됩니다. ${seatText(P.pro)}이 넘는 팀은 도입 문의를 남겨주세요. AI도 요금제에 포함된 사용량 안에서 쓰고, 더 필요하면 같은 방식으로 올리면 됩니다.` },
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
        {/* 은은한 배경 글로우 — 목업 뒤에서 있어보이게. w-[min(...)]로 좁은 화면에서 가로 스크롤 방지, -z-10으로 실제로 콘텐츠 뒤에 그려지게 */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[120px] -z-10 h-[560px] w-[min(900px,92vw)] -translate-x-1/2"
          style={{ background: "radial-gradient(ellipse at center, rgba(17,17,17,0.055) 0%, rgba(17,17,17,0) 68%)" }}
        />
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
          <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-[0_2px_4px_rgba(17,17,17,0.04),0_18px_40px_rgba(17,17,17,0.08),0_50px_90px_rgba(17,17,17,0.10)]">
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
                <div className="mt-4 flex h-11 items-end gap-1.5" aria-hidden>
                  {[38, 52, 46, 70, 64, 88, 80].map((h, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-t ${i === 5 ? "bg-black" : "bg-emerald-500/80"}`}
                      style={{ height: `${h}%` }}
                    />
                  ))}
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
          {STATS.map((s, i) => (
            <Reveal key={s.l} delay={i * 90}>
              <p className="text-4xl font-extrabold tracking-tight">{s.n}</p>
              <p className="mt-2 text-[14px] text-black/45">{s.l}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── AI — 심화 ── */}
      <section id="ai" className="mx-auto max-w-4xl scroll-mt-16 border-t border-black/[0.06] px-6 py-24">
        <Reveal>
          <h2 className="text-[clamp(1.6rem,4vw,2.2rem)] font-extrabold tracking-[-0.02em]">
            AI가 따로 있지 않고,
            <br />
            업무 흐름 안에 있습니다.
          </h2>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-black/45">
            메뉴 하나가 아니라 바탕입니다. 손익을 묻고, 문서를 쓰고, 일정을 잡는 모든 순간에 AI가 함께 움직입니다.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-3">
          {AI_BLOCKS.map((b, i) => (
            <Reveal key={b.t} delay={i * 90}>
              <b.icon className="size-5" strokeWidth={1.75} />
              <h3 className="mt-3.5 text-[15px] font-semibold">{b.t}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-black/45">{b.d}</p>
            </Reveal>
          ))}
        </div>

        {/* 실제 화면 1 — 컴피(대시보드 어시스턴트가 실제로 회의 공지 초안을 쓴 화면) */}
        <Reveal className="mt-20 grid items-stretch gap-10 sm:grid-cols-2">
          <div className="flex flex-col justify-center">
            <p className="text-[13px] font-bold text-black/40">AI 어시스턴트</p>
            <h3 className="mt-2 text-[22px] font-extrabold tracking-tight">물어보면, 컴피가 바로 처리합니다.</h3>
            <ul className="mt-4 space-y-2.5 text-[14px] leading-relaxed text-black/55">
              <li>회사 워크스페이스를 다 아는 개인 비서 — 프로젝트·캘린더·할 일을 알고 답합니다</li>
              <li>공지·이메일·요약 같은 글쓰기를 초안으로 바로 받아 고쳐 씁니다</li>
              <li>대화가 계속 저장돼, 지난 이야기를 이어서 물어볼 수 있습니다</li>
            </ul>
          </div>
          <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(17,17,17,0.03),0_20px_44px_rgba(17,17,17,0.055)]">
            <div className="flex items-center gap-2 border-b border-black/[0.06] bg-white px-4 py-3">
              <span className="grid size-6 place-items-center rounded-md bg-blue-500/10"><Sparkles className="size-3.5 text-blue-600" strokeWidth={1.75} /></span>
              <span className="text-[12.5px] font-bold text-black/55">컴피</span>
            </div>
            <Image src="/marketing/compi-panel.png" alt="컴피가 실제로 회의 공지 초안을 작성하는 화면" width={900} height={958} className="w-full" />
          </div>
        </Reveal>

        {/* 실제 화면 2 — 워크플로우(에이전트 3개를 실제로 연결한 캔버스). 스크린샷이 옆 텍스트보다 짧아 items-center로 세로 중앙정렬(stretch면 카드 하단에 빈 공간 생김) */}
        <Reveal className="mt-20 grid items-center gap-10 sm:grid-cols-2">
          <div className="order-last overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(17,17,17,0.03),0_20px_44px_rgba(17,17,17,0.055)] sm:order-first">
            <div className="flex items-center gap-2 border-b border-black/[0.06] bg-white px-4 py-3">
              <span className="grid size-6 place-items-center rounded-md bg-emerald-500/10"><Network className="size-3.5 text-emerald-600" strokeWidth={1.75} /></span>
              <span className="text-[12.5px] font-bold text-black/55">신규 문의 처리 자동화</span>
            </div>
            <Image src="/marketing/workflow-canvas.png" alt="에이전트 3개를 이어 붙인 워크플로우 캔버스" width={1000} height={396} className="w-full" />
          </div>
          <div className="flex flex-col justify-center">
            <p className="text-[13px] font-bold text-black/40">워크플로우 자동화</p>
            <h3 className="mt-2 text-[22px] font-extrabold tracking-tight">에이전트를 이어 붙이면, 일이 끝까지 갑니다.</h3>
            <p className="mt-4 text-[14px] leading-relaxed text-black/55">
              한 번 만들어두면 사람이 단계마다 넘겨줄 필요가 없습니다. 예를 들어 위 예시는 고객 문의 응대 초안을
              쓰고 → 관련 회의 내용을 정리하고 → 경리 마감까지, 실행 버튼 한 번으로 끝까지 이어집니다.
            </p>
            <ul className="mt-4 space-y-2.5 text-[14px] leading-relaxed text-black/55">
              <li>에이전트 여러 개를 순서대로 연결해 한 번에 실행합니다</li>
              <li>앞 단계 결과가 다음 단계로 자동으로 넘어갑니다</li>
              <li>직접 만든 에이전트도, 기본 제공 에이전트도 그대로 이어붙입니다</li>
            </ul>
          </div>
        </Reveal>
      </section>

      {/* ── 기능 — 개요 그리드 + 심화 블록 ── */}
      <section id="features" className="mx-auto max-w-4xl scroll-mt-16 border-t border-black/[0.06] px-6 py-24">
        <Reveal>
          <h2 className="text-[clamp(1.6rem,4vw,2.2rem)] font-extrabold tracking-[-0.02em]">일에 필요한 전부, 여기에.</h2>
          <p className="mt-3 text-[15px] text-black/45">흩어져 있던 도구를 하나로 합쳤습니다.</p>
        </Reveal>
        <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.t} delay={i * 90}>
              <f.icon className="size-5" strokeWidth={1.75} />
              <h3 className="mt-3.5 text-[15px] font-semibold">{f.t}</h3>
              <p className="mt-1 text-[14px] leading-relaxed text-black/45">{f.d}</p>
            </Reveal>
          ))}
        </div>

        {/* 심화 1 — 손익·현금흐름 */}
        <Reveal className="mt-24 grid items-center gap-10 sm:grid-cols-2">
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
        </Reveal>

        {/* 심화 2 — 팀 협업 */}
        <Reveal className="mt-20 grid items-center gap-10 sm:grid-cols-2">
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
        </Reveal>

        {/* 심화 3 — 전자결재·근태 */}
        <Reveal className="mt-20 grid items-center gap-10 sm:grid-cols-2">
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
        </Reveal>

        {/* 심화 4 — 외부 연동(실제 화면 — 에이전트가 문서 조회 도구를 두 단계로 실제 호출) */}
        <Reveal className="mt-20 grid items-stretch gap-10 sm:grid-cols-2">
          <div className="order-last overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(17,17,17,0.03),0_20px_44px_rgba(17,17,17,0.055)] sm:order-first">
            <div className="flex items-center gap-2 border-b border-black/[0.06] bg-white px-4 py-3">
              <span className="grid size-6 place-items-center rounded-md bg-black/[0.05]"><Plug className="size-3.5" strokeWidth={1.75} /></span>
              <span className="text-[12.5px] font-bold text-black/55">고객 응대 도우미</span>
            </div>
            <Image src="/marketing/agent-tool-chain.png" alt="에이전트가 문서 조회 도구를 두 단계로 실제 호출하는 화면" width={900} height={900} className="w-full" />
          </div>
          <div className="flex flex-col justify-center">
            <p className="text-[13px] font-bold text-black/40">외부 도구 연동</p>
            <h3 className="mt-2 text-[22px] font-extrabold tracking-tight">쓰던 도구는 버리지 않아도 됩니다.</h3>
            <ul className="mt-4 space-y-2.5 text-[14px] leading-relaxed text-black/55">
              <li>구글·노션 등 기존 도구를 계정 연결 한 번으로</li>
              <li>AI가 필요한 도구를 스스로 찾아 호출해, 답변에 바로 반영합니다</li>
              <li>회사가 허용한 도구만 연결되도록 관리자가 통제</li>
            </ul>
          </div>
        </Reveal>
      </section>

      {/* ── 보안 ── */}
      <section className="mx-auto max-w-4xl border-t border-black/[0.06] px-6 py-24">
        <Reveal>
          <h2 className="text-[clamp(1.6rem,4vw,2.2rem)] font-extrabold tracking-[-0.02em]">회사 데이터는 회사의 것.</h2>
          <p className="mt-3 text-[15px] text-black/45">보안은 기능이 아니라 기본값입니다.</p>
        </Reveal>
        <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {SECURITY.map((s, i) => (
            <Reveal key={s.t} delay={i * 90}>
              <s.icon className="size-5" strokeWidth={1.75} />
              <h3 className="mt-3 text-[15px] font-semibold">{s.t}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-black/45">{s.d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── 타겟 — 이런 분들에게 추천드려요 (2026-08-13 대표 타겟 진술을 방문자 카피로) ── */}
      <section className="mx-auto max-w-4xl border-t border-black/[0.06] px-6 py-24">
        <Reveal>
          <h2 className="text-[clamp(1.6rem,4vw,2.2rem)] font-extrabold tracking-[-0.02em]">이런 분들에게 추천드려요.</h2>
          <p className="mt-3 text-[15px] text-black/45">컴플로우는 대기업용 도구가 아닙니다. 작은 조직이 AI를 프로페셔널하게 쓰게 하는 도구입니다.</p>
        </Reveal>
        <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-3">
          {TARGETS.map((t, i) => (
            <Reveal key={t.t} delay={i * 90}>
              <t.icon className="size-5" strokeWidth={1.75} />
              <h3 className="mt-3.5 text-[15px] font-semibold">{t.t}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-black/45">{t.d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── 구독제 — 가격 카드 + 요금별 기능 비교(가격은 토큰 원가 측정 후 확정) ── */}
      <section id="pricing" className="mx-auto max-w-5xl scroll-mt-16 border-t border-black/[0.06] px-6 py-24">
        <div className="text-center">
          <h2 className="text-[clamp(1.6rem,4vw,2.2rem)] font-extrabold tracking-[-0.02em]">간단한 구독제</h2>
          <p className="mt-3 text-[15px] text-black/45">회사 단위로 시작하고, 팀 크기에 맞는 요금제만 고르세요. AI 채팅은 넉넉하게.</p>
          {/* 표시 가격의 부가세 포함 여부(대표 결정 2026-08-18 = 포함). 표기가 없으면 결제 때
              "29,000원이라며?" 분쟁이 나고 PG 심사자도 보는 항목이다. 카드 unit에 넣으면
              긴 문자열이 카드 폭을 넘겨 줄바꿈되므로(위 PLANS 주석) 여기 한 줄로 둔다.
              ⚠️ lib/plans.ts priceKrw · billing_payments.amount_krw · 환불 계산이 전부 이 정의를 따른다. */}
          <p className="mt-1.5 text-[13px] text-black/35">표시 가격은 부가세(VAT) 포함입니다.</p>
          {/* 얼리버드 스트립(프로모션 틀) */}
          <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-black/[0.03] px-3.5 py-1.5 text-[12px] font-semibold text-black/60">
            <Sparkles className="size-3.5" /> 얼리버드 — 사전 신청 회사 한정 할인 예정
          </span>
        </div>
        <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

        {/* 요금별 기능 비교 표 (3티어) */}
        <div className="mx-auto mt-12 max-w-3xl overflow-x-auto rounded-2xl border border-black/[0.07]">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-black/[0.06] bg-[#fbfbfc] text-black/45">
                <th className="px-4 py-3 font-semibold">기능</th>
                <th className="w-36 px-3 py-3 text-center font-semibold">Basic</th>
                <th className="w-36 px-3 py-3 text-center font-semibold">Standard</th>
                <th className="w-36 px-3 py-3 text-center font-semibold">Pro</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_ROWS.map((r) => (
                <tr key={r.f} className="border-b border-black/[0.04] last:border-0">
                  <td className="px-4 py-3 text-black/70">{r.f}</td>
                  {[r.basic, r.std, r.pro].map((v, i) => (
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
        {/* Premium 카드를 뺀 대신 남기는 문의 경로 — 인원이 많거나 별도 요건이 있는 회사용 */}
        <p className="mt-6 text-center text-[13px] text-black/45">
          인원이 더 많거나 별도 요건이 있나요?{" "}
          <a href={CONTACT} className="font-semibold text-black/70 underline underline-offset-2 hover:text-black">도입 문의</a>
        </p>
        {/* 프로모션 틀 — 리퍼럴 자리 (연간 프로모션 문구는 나이스페이 심사 요구로 제거, 2026-08-25) */}
        <p className="mt-2 text-center text-[13px] text-black/40">추천한 회사가 시작하면 양쪽 모두 1개월 무료</p>
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
