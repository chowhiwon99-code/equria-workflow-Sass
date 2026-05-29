"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { MessagesSquare, NotebookPen } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import type { Profile } from "@/types"

type Colleague = Pick<Profile, "id" | "name" | "department">

type RoomSummary = {
  otherId: string
  otherName: string
  lastMessage: string
  lastAt: string | null
  unread: number
}

export function ChatList() {
  const supabase = createClient()
  const router = useRouter()
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [colleagues, setColleagues] = useState<Colleague[]>([])
  const [meId, setMeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser()
    const me = auth.user?.id
    if (!me) {
      setLoading(false)
      return
    }
    setMeId(me)

    const [{ data: convs }, { data: profs }] = await Promise.all([
      supabase
        .from("direct_conversations")
        .select("*")
        .order("last_message_at", { ascending: false, nullsFirst: false }),
      supabase.from("profiles").select("id, name, department").neq("id", me).order("name"),
    ])

    const nameById = new Map((profs ?? []).map((p) => [p.id, p.name]))
    setColleagues(profs ?? [])

    const convList = convs ?? []
    const convIds = convList.map((c) => c.id)
    let msgs: { conversation_id: string; sender_id: string; content: string; created_at: string; read_at: string | null }[] = []
    if (convIds.length > 0) {
      const { data } = await supabase
        .from("direct_messages")
        .select("conversation_id, sender_id, content, created_at, read_at")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
      msgs = data ?? []
    }

    const summaries: RoomSummary[] = convList
      .map((c) => {
        const otherId = c.user_a === me ? c.user_b : c.user_a
        const convMsgs = msgs.filter((m) => m.conversation_id === c.id)
        const last = convMsgs[0]
        const unread = convMsgs.filter((m) => m.sender_id !== me && m.read_at === null).length
        return {
          otherId,
          otherName: nameById.get(otherId) ?? "직원",
          lastMessage: last?.content ?? "",
          lastAt: last?.created_at ?? null,
          unread,
        }
      })
      .filter((r) => r.lastMessage !== "" && r.otherId !== me) // 빈 방·셀프방 제외(셀프는 별도 표시)

    setRooms(summaries)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  const startedIds = new Set(rooms.map((r) => r.otherId))
  const newContacts = colleagues.filter((c) => !startedIds.has(c.id))

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold">직원 채팅</h1>

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : (
        <>
          {/* 나와의 채팅 (개인 메모·파일·링크 저장) */}
          {meId && (
            <button
              onClick={() => router.push(`/chat/${meId}`)}
              className="hover-grow flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
            >
              <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <NotebookPen className="size-4" />
              </div>
              <span className="text-sm font-medium">나와의 채팅</span>
            </button>
          )}

          {/* 최근 대화방 */}
          {rooms.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-xs font-medium text-muted-foreground">최근 대화</h2>
              <div className="flex flex-col divide-y rounded-lg border">
                {rooms.map((r) => (
                  <button
                    key={r.otherId}
                    onClick={() => router.push(`/chat/${r.otherId}`)}
                    className="flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                  >
                    <Avatar className="size-9">
                      <AvatarFallback className="text-xs">{r.otherName.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium">{r.otherName}</span>
                      <span className="truncate text-xs text-muted-foreground">{r.lastMessage}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {r.lastAt && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(r.lastAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                        </span>
                      )}
                      {r.unread > 0 && (
                        <span className="flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-white">
                          {r.unread > 99 ? "99+" : r.unread}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 새 대화 시작 */}
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-medium text-muted-foreground">
              {rooms.length > 0 ? "새 대화 시작" : "직원 목록"}
            </h2>
            {newContacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {colleagues.length === 0 ? "대화할 다른 직원이 아직 없습니다." : "모든 직원과 대화를 시작했습니다."}
              </p>
            ) : (
              <div className="flex flex-col divide-y rounded-lg border">
                {newContacts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => router.push(`/chat/${c.id}`)}
                    className={cn("flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40")}
                  >
                    <Avatar className="size-8">
                      <AvatarFallback className="text-xs">{c.name.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{c.name}</span>
                      {c.department && <span className="text-xs text-muted-foreground">{c.department}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {rooms.length === 0 && colleagues.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
              <MessagesSquare className="size-8" />
              <p className="text-sm">대화할 다른 직원이 아직 없습니다.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
