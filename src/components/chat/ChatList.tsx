"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { MessagesSquare, NotebookPen, Users, Plus } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { StatusDot } from "@/components/chat/StatusDot"
import { MemberPickerModal } from "@/components/chat/MemberPickerModal"
import { Loading, ErrorState } from "@/components/shared/States"
import { useOnlineUsers } from "@/hooks/usePresence"
import { onChat } from "@/lib/chatBus"
import type { Profile } from "@/types"

type Colleague = Pick<Profile, "id" | "name" | "department" | "status_manual" | "position">

type RoomSummary = {
  otherId: string
  otherName: string
  lastMessage: string
  lastAt: string | null
  unread: number
}

type GroupRoomSummary = {
  id: string
  name: string
  isDefault: boolean
  memberCount: number
  lastMessage: string
  lastAt: string | null
  unread: number
}

export function ChatList() {
  const supabase = createClient()
  const router = useRouter()
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [groupRooms, setGroupRooms] = useState<GroupRoomSummary[]>([])
  const [colleagues, setColleagues] = useState<Colleague[]>([])
  const [meId, setMeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const online = useOnlineUsers(meId)

  const load = useCallback(async () => {
    try {
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
        supabase.from("profiles").select("id, name, department, status_manual, position").neq("id", me).order("name"),
      ])

      const nameById = new Map((profs ?? []).map((p) => [p.id, p.name]))
      setColleagues(profs ?? [])

      const convList = convs ?? []
      const convIds = convList.map((c) => c.id)
      let msgs: { conversation_id: string; sender_id: string; content: string; created_at: string; read_at: string | null; deleted_at: string | null }[] = []
      if (convIds.length > 0) {
        const { data } = await supabase
          .from("direct_messages")
          .select("conversation_id, sender_id, content, created_at, read_at, deleted_at")
          .in("conversation_id", convIds)
          .order("created_at", { ascending: false })
        msgs = data ?? []
      }

      const summaries: RoomSummary[] = convList
        .map((c) => {
          const otherId = c.user_a === me ? c.user_b : c.user_a
          const convMsgs = msgs.filter((m) => m.conversation_id === c.id)
          const last = convMsgs[0]
          // 삭제된 메시지는 안읽음 카운트에서 제외 (작성자가 지우면 상대 배지도 사라짐)
          const unread = convMsgs.filter((m) => m.sender_id !== me && m.read_at === null && !m.deleted_at).length
          return {
            otherId,
            otherName: nameById.get(otherId) ?? "직원",
            lastMessage: last?.deleted_at ? "삭제된 메시지입니다" : last?.content ?? "",
            lastAt: last?.created_at ?? null,
            unread,
          }
        })
        .filter((r) => r.lastMessage !== "" && r.otherId !== me) // 빈 방·셀프방 제외(셀프는 별도 표시)

      setRooms(summaries)

      // 그룹방 — RLS가 내가 속한 방만 반환(전체방 + 내 커스텀방)
      const { data: grooms } = await supabase.from("group_rooms").select("*").order("last_message_at", { ascending: false, nullsFirst: false })
      const groomList = grooms ?? []
      const gids = groomList.map((g) => g.id)
      const [{ data: gmsgs }, { data: greads }, { data: rmembers }] = await Promise.all([
        gids.length
          ? supabase.from("group_messages").select("room_id, sender_id, content, created_at, deleted_at").in("room_id", gids).order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as { room_id: string; sender_id: string; content: string; created_at: string; deleted_at: string | null }[] }),
        supabase.from("group_read_state").select("room_id, last_read_at"),
        gids.length ? supabase.from("room_members").select("room_id, user_id").in("room_id", gids) : Promise.resolve({ data: [] as { room_id: string; user_id: string }[] }),
      ])
      const readMap = new Map((greads ?? []).map((r) => [r.room_id, r.last_read_at]))
      const memberCount = new Map<string, number>()
      const memberNames = new Map<string, string[]>()
      for (const rm of rmembers ?? []) {
        memberCount.set(rm.room_id, (memberCount.get(rm.room_id) ?? 0) + 1)
        if (rm.user_id !== me) {
          const arr = memberNames.get(rm.room_id) ?? []
          arr.push(nameById.get(rm.user_id) ?? "직원")
          memberNames.set(rm.room_id, arr)
        }
      }
      const gSummaries: GroupRoomSummary[] = groomList.map((g) => {
        const ms = (gmsgs ?? []).filter((m) => m.room_id === g.id)
        const last = ms[0]
        const lastRead = readMap.get(g.id)
        const unread = ms.filter((m) => m.sender_id !== me && (!lastRead || m.created_at > lastRead) && !m.deleted_at).length
        const name = g.is_default ? "전체 채팅" : g.name && g.name !== "그룹 채팅" ? g.name : memberNames.get(g.id)?.join(", ") || "그룹 채팅"
        return {
          id: g.id,
          name,
          isDefault: g.is_default,
          memberCount: g.is_default ? (profs ?? []).length + 1 : memberCount.get(g.id) ?? 0,
          lastMessage: last?.deleted_at ? "삭제된 메시지입니다" : last?.content ?? "",
          lastAt: last?.created_at ?? g.last_message_at,
          unread,
        }
      })
      setGroupRooms(gSummaries)
      setError(null)
    } catch {
      setError("채팅 목록을 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  // Realtime 구독: 다른 곳에서 메시지 INSERT/UPDATE가 발생하면 목록 다시 로드.
  // 새 메시지 도착 시 unread 카운트 증가, 상대가 읽으면 (UPDATE) 감소 즉시 반영.
  useEffect(() => {
    if (!meId) return
    const channel = supabase
      .channel("dm-list")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "direct_messages" },
        () => load()
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, meId, load])

  // 다른 창/탭에서 채팅이 바뀌면 목록 즉시 갱신(BroadcastChannel)
  useEffect(() => onChat(() => load()), [load])

  const createRoom = async (memberIds: string[], name: string) => {
    setCreateBusy(true)
    const { data, error: e } = await supabase.rpc("create_group_room", { p_name: name, p_members: memberIds })
    setCreateBusy(false)
    setCreating(false)
    if (e || !data) return
    router.push(`/chat/group/${data}`)
  }

  const startedIds = new Set(rooms.map((r) => r.otherId))
  const newContacts = colleagues.filter((c) => !startedIds.has(c.id))
  const statusById = new Map(colleagues.map((c) => [c.id, c.status_manual]))
  const posById = new Map(colleagues.map((c) => [c.id, c.position]))

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold">직원 채팅</h1>

      {loading ? (
        <Loading rows={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => { setError(null); load() }} />
      ) : (
        <>
          {/* 그룹 채팅 (전체방 + 초대형 커스텀방) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium text-muted-foreground">그룹 채팅</h2>
              <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <Plus className="size-3" /> 새 그룹 채팅
              </button>
            </div>
            <div className="flex flex-col divide-y rounded-lg border">
              {groupRooms.map((g) => (
                <button
                  key={g.id}
                  onClick={() => router.push(`/chat/group/${g.id}`)}
                  className={cn("flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40", g.isDefault && "bg-primary/5")}
                >
                  <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", g.isDefault ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                    <Users className="size-4" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {g.name}
                      <span className="ml-1 text-[11px] font-normal text-muted-foreground">{g.memberCount}</span>
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{g.lastMessage || (g.isDefault ? "팀 전원이 함께하는 그룹방" : "새 그룹방")}</span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {g.lastAt && (
                      <span className="text-[10px] text-muted-foreground">{new Date(g.lastAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}</span>
                    )}
                    {g.unread > 0 && (
                      <span className="flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-white">{g.unread > 99 ? "99+" : g.unread}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

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
                    <div className="relative shrink-0">
                      <Avatar className="size-9">
                        <AvatarFallback className="text-xs">{r.otherName.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <StatusDot
                        online={online.has(r.otherId)}
                        manual={statusById.get(r.otherId)}
                        className="absolute -bottom-0.5 -right-0.5"
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium">
                        {r.otherName}
                        {posById.get(r.otherId) && (
                          <span className="ml-1 text-[11px] font-normal text-muted-foreground">{posById.get(r.otherId)}</span>
                        )}
                      </span>
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
                    <div className="relative shrink-0">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-xs">{c.name.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <StatusDot
                        online={online.has(c.id)}
                        manual={c.status_manual}
                        className="absolute -bottom-0.5 -right-0.5"
                      />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{c.name}</span>
                      {(c.position || c.department) && (
                        <span className="text-xs text-muted-foreground">{[c.position, c.department].filter(Boolean).join(" · ")}</span>
                      )}
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

      {creating && (
        <MemberPickerModal
          title="새 그룹 채팅"
          confirmLabel="만들기"
          withName
          busy={createBusy}
          onConfirm={(ids, name) => createRoom(ids, name)}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  )
}
