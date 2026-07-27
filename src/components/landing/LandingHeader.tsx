"use client"

import Link from "next/link"
import Image from "next/image"
import { INK, CONTACT } from "./const"

/**
 * 랜딩 GNB — 본문 콘텐츠와 완전 분리(노션식, 2026-07-28).
 * 화면 전체 폭: 로고 왼쪽 끝 / 메뉴 중앙 / 로그인·무료 CTA 오른쪽 끝.
 * 로그인·가입은 페이지 이동 없이 모달로 연다(onLogin·onSignup).
 */
export function LandingHeader({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-black/[0.05] bg-white/90 backdrop-blur-md">
      <div className="relative flex h-[60px] w-full items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Complow 홈">
          <Image src="/brand/logo-horizontal.png" alt="Complow" width={1046} height={256} className="h-5 w-auto" priority />
        </Link>
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 text-[14px] font-medium text-black/70 md:flex">
          <a href="#features" className="transition-colors hover:text-black">기능</a>
          <a href="#pricing" className="transition-colors hover:text-black">가격</a>
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
