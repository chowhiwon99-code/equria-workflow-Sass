"use client"

import { useEffect, useState } from "react"
import { X, Check, Search, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { fieldClass } from "@/components/shared/Modal"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"

type Person = { id: string; name: string; position: string | null; department: string | null }

/**
 * 멤버 선택 모달 — 그룹방 생성(이름+멤버) / 멤버 초대 공용.
 * excludeIds: 이미 방에 있는 멤버는 숨김. withName: 방 이름 입력칸 표시(생성 시).
 */
export function MemberPickerModal({
  title,
  confirmLabel,
  withName,
  excludeIds = [],
  busy,
  onConfirm,
  onClose,
}: {
  title: string
  confirmLabel: string
  withName?: boolean
  excludeIds?: string[]
  busy?: boolean
  onConfirm: (memberIds: string[], name: string) => void
  onClose: () => void
}) {
  const supabase = createClient()
  const [people, setPeople] = useState<Person[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [name, setName] = useState("")
  const [q, setQ] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      const me = auth.user?.id
      const { data } = await supabase.from("profiles").select("id, name, position, department").order("name")
      const ex = new Set([...(me ? [me] : []), ...excludeIds])
      setPeople((data ?? []).filter((p) => !ex.has(p.id)))
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const filtered = people.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border bg-popover shadow-[var(--shadow-lg)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">{title}</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="닫기">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-2 px-4 py-3">
          {withName && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="방 이름 (선택 — 비우면 참여자 이름으로)"
              className={cn(fieldClass, "w-full")}
            />
          )}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 검색" className={cn(fieldClass, "w-full pl-8")} />
          </div>
          {selected.size > 0 && <span className="text-[11px] text-muted-foreground">{selected.size}명 선택됨</span>}
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {loading ? (
            <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">선택할 직원이 없어요.</p>
          ) : (
            filtered.map((p) => {
              const on = selected.has(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className={cn("flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors", on ? "bg-primary/10" : "hover:bg-muted/50")}
                >
                  <Avatar className="size-8"><AvatarFallback className="text-[10px]">{p.name.slice(0, 2)}</AvatarFallback></Avatar>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{p.name}</span>
                    {(p.position || p.department) && (
                      <span className="truncate text-[11px] text-muted-foreground">{[p.position, p.department].filter(Boolean).join(" · ")}</span>
                    )}
                  </div>
                  <span className={cn("flex size-5 items-center justify-center rounded-full border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                    {on && <Check className="size-3" />}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="ghost" size="sm" onClick={onClose}>취소</Button>
          <Button size="sm" onClick={() => onConfirm([...selected], name)} disabled={busy || selected.size === 0}>
            {busy && <Loader2 className="size-3.5 animate-spin" />} {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
