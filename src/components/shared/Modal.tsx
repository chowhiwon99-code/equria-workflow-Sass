"use client"

import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** 가벼운 공용 모달 (외부 dialog 라이브러리 없이 자작). 배경 클릭 시 닫힘. */
export function Modal({
  title,
  onClose,
  children,
  className,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={cn("glass w-full max-w-md rounded-xl p-5", className)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X />
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** 모달/폼 공용 인풋 클래스 */
export const fieldClass =
  "h-8 w-full rounded-lg border border-border bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
