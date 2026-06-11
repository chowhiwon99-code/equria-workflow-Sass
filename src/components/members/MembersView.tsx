"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Users, MessageSquare, Mail, Phone, Smartphone, ChevronDown, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { fieldClass } from "@/components/shared/Modal"
import { StatusDot, statusLabel } from "@/components/chat/StatusDot"
import { useOnlineUsers } from "@/hooks/usePresence"
import { Loading, EmptyState, ErrorState } from "@/components/shared/States"
import type { Profile } from "@/types"

type Member = Pick<Profile, "id" | "name" | "department" | "position" | "status_manual"> & { role: string }
type Contact = { email: string | null; work_phone: string | null; mobile: string | null }

const UNDEPT = "부서 미지정"

// tel:/mailto: 링크는 특수문자 안전하게 — 전화는 숫자/+만, 이메일은 인코딩
const telHref = (v: string) => `tel:${v.replace(/[^\d+]/g, "")}`
const mailHref = (v: string) => `mailto:${encodeURIComponent(v)}`

export function MembersView() {
  const supabase = createClient()
  const router = useRouter()
  const [members, setMembers] = useState<Member[]>([])
  const [meId, setMeId] = useState<string | null>(null)
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [contacts, setContacts] = useState<Record<string, Contact>>({})
  const [query, setQuery] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const online = useOnlineUsers(meId)

  const load = useCallback(async () => {
    try {
      const { data: auth } = await supabase.auth.getUser()
      setMeId(auth.user?.id ?? null)
      // 목록은 비민감 필드만. 연락처(email/전화)는 펼칠 때 directory_contact RPC로 공개 항목만 가져온다.
      const [{ data, error: queryError }, { data: ws }] = await Promise.all([
        supabase.from("profiles").select("id, name, department, position, status_manual, role").order("name"),
        supabase.from("workspaces").select("owner_id").limit(1).maybeSingle(),
      ])
      if (queryError) throw queryError
      setMembers((data as Member[]) ?? [])
      setOwnerId(ws?.owner_id ?? null)
      setError(null)
    } catch {
      setError("구성원 목록을 불러오지 못했어요.")
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  // 행을 펼칠 때마다 공개 연락처를 RPC로 새로 로드(공개설정 변경 즉시 반영 — 캐시 stale 방지).
  // 비공개·미등록 항목은 null로 돌아온다.
  const reveal = useCallback(
    async (id: string) => {
      let opening = false
      setOpenId((cur) => {
        opening = cur !== id
        return cur === id ? null : id
      })
      if (!opening) return
      const { data, error } = await supabase.rpc("directory_contact", { target: id })
      if (error) {
        toast.error("연락처를 불러오지 못했어요.")
        return
      }
      const row = data?.[0]
      setContacts((prev) => ({
        ...prev,
        [id]: {
          email: row?.email ?? null,
          work_phone: row?.work_phone ?? null,
          mobile: row?.mobile ?? null,
        },
      }))
    },
    [supabase]
  )

  const isOwner = !!ownerId && ownerId === meId

  // 대표(오너)가 구성원 권한(admin/member) 토글 — set_member_role RPC.
  const toggleRole = async (m: Member) => {
    setBusyId(m.id)
    try {
      const { error } = await supabase.rpc("set_member_role", {
        target: m.id,
        new_role: m.role === "admin" ? "member" : "admin",
      })
      if (error) throw new Error(error.message)
      toast.success(m.role === "admin" ? "관리자 권한을 해제했어요." : "관리자로 지정했어요.")
      await load()
    } catch {
      toast.error("권한 변경에 실패했어요.")
    } finally {
      setBusyId(null)
    }
  }

  const q = query.trim().toLowerCase()
  const filtered = members.filter(
    (m) =>
      !q ||
      m.name.toLowerCase().includes(q) ||
      (m.department ?? "").toLowerCase().includes(q) ||
      (m.position ?? "").toLowerCase().includes(q)
  )

  // 부서별 그룹 (미지정은 맨 뒤)
  const groups = new Map<string, Member[]>()
  for (const m of filtered) {
    const dept = m.department?.trim() || UNDEPT
    const arr = groups.get(dept) ?? []
    arr.push(m)
    groups.set(dept, arr)
  }
  const sortedGroups = [...groups.entries()].sort(([a], [b]) =>
    a === UNDEPT ? 1 : b === UNDEPT ? -1 : a.localeCompare(b, "ko")
  )

  if (loading) return <Loading rows={5} />
  if (error)
    return <ErrorState message={error} onRetry={() => { setError(null); load() }} />

  return (
    <div className="flex flex-col gap-5">
      <input
        className={fieldClass}
        placeholder="이름·부서·직급 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {members.length === 0 ? (
        <EmptyState icon={Users} title="등록된 구성원이 없습니다." />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">검색 결과가 없습니다.</p>
      ) : (
        sortedGroups.map(([dept, list]) => (
          <section key={dept} className="flex flex-col gap-2">
            <h2 className="text-xs font-medium text-muted-foreground">
              {dept} · {list.length}
            </h2>
            <div className="flex flex-col divide-y rounded-lg border">
              {list.map((m) => {
                const isMe = m.id === meId
                const open = openId === m.id
                const c = contacts[m.id]
                const isOnline = online.has(m.id)
                return (
                  <div key={m.id} className="flex flex-col">
                    <button
                      onClick={() => reveal(m.id)}
                      className="flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                    >
                      <div className="relative shrink-0">
                        <Avatar className="size-9">
                          <AvatarFallback className="text-xs">{m.name.slice(0, 2)}</AvatarFallback>
                        </Avatar>
                        <StatusDot online={isOnline} manual={m.status_manual} className="absolute -bottom-0.5 -right-0.5" />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="inline-flex items-center gap-1 text-sm font-medium">
                          {m.name}
                          {isMe && <span className="text-xs text-muted-foreground">(나)</span>}
                          {m.id === ownerId ? (
                            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">대표</span>
                          ) : m.role === "admin" ? (
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">관리자</span>
                          ) : null}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {m.position || "직급 미지정"} · {statusLabel(isOnline, m.status_manual)}
                        </span>
                      </div>
                      <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
                    </button>

                    {open && (
                      <div className="flex flex-col gap-2 border-t bg-muted/30 px-3 py-3">
                        <ContactRow icon={Mail} label="이메일" value={c?.email} href={c?.email ? mailHref(c.email) : undefined} />
                        <ContactRow icon={Phone} label="사내 전화" value={c?.work_phone} href={c?.work_phone ? telHref(c.work_phone) : undefined} />
                        <ContactRow icon={Smartphone} label="휴대폰" value={c?.mobile} href={c?.mobile ? telHref(c.mobile) : undefined} />
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {!isMe && (
                            <button
                              onClick={() => router.push(`/chat/${m.id}`)}
                              className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                            >
                              <MessageSquare className="size-3.5" /> 메시지 보내기
                            </button>
                          )}
                          {/* 대표만: 구성원 권한 지정 */}
                          {isOwner && !isMe && m.id !== ownerId && (
                            <button
                              onClick={() => toggleRole(m)}
                              disabled={busyId === m.id}
                              className="inline-flex w-fit items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                            >
                              {m.role === "admin" ? "관리자 권한 해제" : "관리자로 지정"}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

/** 연락처 한 줄 — 값이 공개되면 링크, 아니면 '비공개/미등록' 흐림 표시. */
function ContactRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon
  label: string
  value: string | null | undefined
  href?: string
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      {value ? (
        href ? (
          <a href={href} className="truncate text-primary underline-offset-2 hover:underline">
            {value}
          </a>
        ) : (
          <span className="truncate">{value}</span>
        )
      ) : (
        <span className="text-xs text-muted-foreground/60">비공개 또는 미등록</span>
      )}
    </div>
  )
}
