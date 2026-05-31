"use client"

import { useEffect, useState } from "react"
import { Mail, PenSquare, Inbox, Send, FileText, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

const FOLDERS = [
  { icon: Inbox, label: "받은편지함" },
  { icon: Send, label: "보낸편지함" },
  { icon: FileText, label: "임시보관" },
  { icon: Trash2, label: "휴지통" },
]

export function MailShell() {
  const supabase = createClient()
  const [connected, setConnected] = useState<boolean | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) {
        setConnected(false)
        return
      }
      const { data } = await supabase
        .from("google_connections")
        .select("is_active")
        .eq("user_id", auth.user.id)
        .maybeSingle()
      setConnected(!!data?.is_active)
    })()
  }, [supabase])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">메일</h1>
          <p className="text-sm text-muted-foreground">
            Gmail을 연결하면 받은 편지함을 여기서 확인할 수 있어요.
          </p>
        </div>
        <Button size="sm" disabled>
          <PenSquare /> 메일쓰기
        </Button>
      </div>

      <div className="relative">
        {/* 메일 UI 골격 (블러 처리된 더미) */}
        <div className="pointer-events-none grid grid-cols-[180px_1fr] gap-4 opacity-40 blur-[1px]">
          <div className="flex flex-col gap-1 rounded-xl border p-2">
            {FOLDERS.map((f) => (
              <div
                key={f.label}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground"
              >
                <f.icon className="size-4" /> {f.label}
              </div>
            ))}
          </div>
          <div className="flex flex-col divide-y rounded-xl border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5 px-4 py-3">
                <div className="h-3 w-1/3 rounded bg-muted" />
                <div className="h-3 w-2/3 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>

        {/* 연결 게이트 오버레이 */}
        {connected !== true && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border bg-background p-6 text-center shadow-sm">
              <div className="grid size-12 place-items-center rounded-full bg-muted">
                <Mail className="size-6" />
              </div>
              <p className="text-sm font-semibold">Gmail 연결이 필요합니다</p>
              <p className="text-xs text-muted-foreground">
                {connected === null
                  ? "연결 상태 확인 중…"
                  : "Gmail을 연결하면 메일을 여기서 읽고 보낼 수 있어요. (연동 준비 중)"}
              </p>
              <Button size="sm" variant="outline" disabled>
                Gmail 연결 (곧)
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
