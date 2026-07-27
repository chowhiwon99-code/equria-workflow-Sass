"use client"

import Link from "next/link"
import Image from "next/image"
import { ChevronDown } from "lucide-react"
import { INK, CONTACT } from "./const"

/**
 * 랜딩 GNB — 본문 콘텐츠와 완전 분리(노션식, 2026-07-28).
 * 화면 전체 폭: 로고 왼쪽 끝 / 메뉴 중앙(기능·AI·가격·리소스·도입 문의) / 로그인·무료 CTA 오른쪽 끝.
 * 리소스는 호버 드롭다운(소개자료·협업툴 자료 — 하위 페이지는 추후 별도 제작).
 * 로그인·가입은 페이지 이동 없이 모달로 연다(onLogin·onSignup).
 */
export function LandingHeader({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-black/[0.05] bg-white/90 backdrop-blur-md">
      <div className="relative flex h-[60px] w-full items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Complow 홈">
          <Image src="/brand/logo-horizontal.png" alt="Complow" width={1046} height={256} className="h-5 w-auto" priority />
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-7 text-[14px] font-medium text-black/70 md:flex">
          <a href="#features" className="transition-colors hover:text-black">기능</a>
          <a href="#ai" className="transition-colors hover:text-black">AI</a>
          <a href="#pricing" className="transition-colors hover:text-black">가격</a>
          {/* 리소스 드롭다운 — CSS 호버(포커스 포함), JS 상태 불필요 */}
          <div className="group relative">
            <button type="button" className="flex items-center gap-1 transition-colors hover:text-black">
              리소스 <ChevronDown className="size-3.5 transition-transform group-hover:rotate-180" />
            </button>
            <div className="invisible absolute left-1/2 top-full -translate-x-1/2 pt-2 opacity-0 transition-all group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
              <div className="w-44 rounded-xl border border-black/[0.07] bg-white p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.10)]">
                <a href={`${CONTACT.split("?")[0]}?subject=Complow 소개자료 요청`} className="block rounded-lg px-3 py-2 text-[13px] font-medium text-black/70 transition-colors hover:bg-black/[0.04] hover:text-black">
                  소개자료 받기
                </a>
                <span className="flex items-center justify-between rounded-lg px-3 py-2 text-[13px] font-medium text-black/30">
                  협업툴 비교 자료 <span className="text-[11px]">준비 중</span>
                </span>
              </div>
            </div>
          </div>
          <a href={CONTACT} className="transition-colors hover:text-black">도입 문의</a>
        </nav>

        <div className="flex items-center gap-2.5">
          <button type="button" onClick={onLogin} className="rounded-lg px-3 py-1.5 text-[14px] font-medium transition-colors hover:bg-black/[0.05]">
            로그인
          </button>
          <button type="button" onClick={onSignup} className="rounded-lg px-4 py-2 text-[14px] font-semibold text-white transition-opacity hover:opacity-85" style={{ background: INK }}>
            Complow 무료로 사용하기
          </button>
        </div>
      </div>
    </header>
  )
}
