"use client"

import { useEffect } from "react"
import Image from "next/image"
import { X } from "lucide-react"
import { AuthForm, type AuthMode } from "@/components/auth/AuthForm"

/**
 * 랜딩 로그인·가입 모달 — 노션식(2026-07-28): 랜딩 위에 배경 블러 + 흰 카드.
 * 페이지 이동 없이 열리고, 모달 안에서 로그인↔가입 전환. ESC·배경 클릭·✕로 닫기.
 */
export function AuthModal({ mode, onClose, onSwitchMode }: { mode: AuthMode; onClose: () => void; onSwitchMode: (m: AuthMode) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === "login" ? "로그인" : "가입"}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-white/50 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[440px] rounded-2xl border border-black/[0.06] bg-white px-7 py-9 shadow-[0_24px_80px_rgba(0,0,0,0.18)] sm:px-10"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} aria-label="닫기" className="absolute right-4 top-4 rounded-md p-1.5 text-black/35 transition-colors hover:bg-black/[0.05] hover:text-black">
          <X className="size-5" />
        </button>
        <div className="mb-7 text-center">
          <Image src="/brand/logo-mark.png" alt="Complow" width={512} height={512} className="mx-auto h-10 w-10" />
          <h2 className="mt-4 text-[19px] font-bold leading-snug tracking-tight text-[#111111]">
            Complow — 나만의 AI 워크스페이스
          </h2>
          <p className="mt-1 text-[15px] text-black/45">{mode === "login" ? "계정에 로그인" : "이름으로 가입"}</p>
        </div>
        <AuthForm mode={mode} onSwitchMode={onSwitchMode} />
      </div>
    </div>
  )
}
