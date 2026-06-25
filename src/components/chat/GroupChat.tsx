"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Users, Loader2, Pencil, Trash2, SmilePlus, X, ChevronDown, Paperclip, UserPlus, LogOut, ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { uploadImage } from "@/lib/upload"
import { cn } from "@/lib/utils"
import { fieldClass } from "@/components/shared/Modal"
import { useUndo } from "@/components/undo/UndoProvider"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { MessageBody } from "@/components/chat/MessageBody"
import { RichComposer, type ComposerPayload } from "@/components/chat/RichComposer"
import { AttachmentList, type AttachmentItem } from "@/components/chat/AttachmentList"
import { MemberPickerModal } from "@/components/chat/MemberPickerModal"
import { Loading, ErrorState } from "@/components/shared/States"
import type { Tables } from "@/lib/supabase/types"

type GMessage = Tables<"group_messages">
type Person = { name: string; position: string | null }

const MAX_FILE_BYTES = 50 * 1024 * 1024
const IMAGE_MIME_RE = /^image\//
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i
const REACTIONS = ["👍", "❤️", "😂", "🎉", "👀"]

function attIsImage(mime: string | null, name: string | null): boolean {
  return (!!mime && IMAGE_MIME_RE.test(mime)) || IMAGE_EXT_RE.test(name ?? "")
}
function attachmentSummary(files: File[]): string {
  return files.length === 1 ? files[0].name : `파일 ${files.length}개`
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })
}
function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" })
}

/** 그룹 채팅방. DM과 별개 테이블(group_*). 전체방(default)·커스텀방(초대) 공용. roomId 없으면 전체방. */
export function GroupChat({ roomId: roomIdProp }: { roomId?: string }) {
  const supabase = createClient()
  const router = useRouter()
  const { push } = useUndo()
  const [meId, setMeId] = useState<string | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [roomName, setRoomName] = useState("전체 채팅")
  const [isDefault, setIsDefault] = useState(true)
  const [memberIds, setMemberIds] = useState<string[]>([]) // 커스텀방 멤버(전체방은 빈 배열=전원)
  const [inviting, setInviting] = useState(false)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [people, setPeople] = useState<Record<string, Person>>({})
  const [messages, setMessages] = useState<GMessage[]>([])
  const [reactions, setReactions] = useState<{ id: string; message_id: string; emoji: string; user_id: string }[]>([])
  const [attachments, setAttachments] = useState<(AttachmentItem & { message_id: string })[]>([])
  const attachmentsRef = useRef<(AttachmentItem & { message_id: string })[]>([])
  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [reactingId, setReactingId] = useState<string | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const didInitialScroll = useRef(false)

  // 다중첨부 로드 + 증분 서명(이미지=뷰 / 파일=다운로드).
  const loadAttachments = useCallback(
    async (rid: string) => {
      const { data } = await supabase
        .from("group_message_attachments")
        .select("id, message_id, storage_path, name, mime_type, group_messages!inner(room_id)")
        .eq("group_messages.room_id", rid)
      const rows = data ?? []
      const cached = new Map(attachmentsRef.current.map((c) => [c.id, c.url]))
      const toSign = rows.filter((a) => !cached.get(a.id))
      const signed = await Promise.all(
        toSign.map(async (a) => {
          const opts = attIsImage(a.mime_type, a.name) ? undefined : { download: a.name ?? true }
          const { data: s } = await supabase.storage.from("chat-files").createSignedUrl(a.storage_path, 3600, opts)
          return [a.id, s?.signedUrl ?? null] as const
        })
      )
      const signedUrl = new Map(signed)
      setAttachments(
        rows.map((a) => ({
          id: a.id,
          message_id: a.message_id,
          name: a.name,
          mime_type: a.mime_type,
          url: signedUrl.get(a.id) ?? cached.get(a.id) ?? null,
        }))
      )
    },
    [supabase]
  )
  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  const loadReactions = useCallback(
    async (rid: string) => {
      const { data } = await supabase
        .from("group_message_reactions")
        .select("id, message_id, emoji, user_id, group_messages!inner(room_id)")
        .eq("group_messages.room_id", rid)
      setReactions((data ?? []).map((r) => ({ id: r.id, message_id: r.message_id, emoji: r.emoji, user_id: r.user_id })))
    },
    [supabase]
  )

  // 초기화 — 기본방 조회 + 멤버 이름맵 + 메시지/반응/첨부 + 읽음.
  useEffect(() => {
    ;(async () => {
      try {
        const { data: auth } = await supabase.auth.getUser()
        const me = auth.user?.id ?? null
        setMeId(me)
        const roomQuery = roomIdProp
          ? supabase.from("group_rooms").select("id, name, is_default").eq("id", roomIdProp).limit(1).single()
          : supabase.from("group_rooms").select("id, name, is_default").eq("is_default", true).limit(1).single()
        const [{ data: room, error: roomErr }, { data: profs }] = await Promise.all([
          roomQuery,
          supabase.from("profiles").select("id, name, position"),
        ])
        if (roomErr || !room) {
          setError("채팅방을 찾을 수 없습니다.")
          setLoading(false)
          return
        }
        setRoomId(room.id)
        setIsDefault(room.is_default)
        setPeople(Object.fromEntries((profs ?? []).map((p) => [p.id, { name: p.name, position: p.position }])))
        // 커스텀방: 멤버 목록 로드 + 이름 미지정 시 참여자 이름으로 표시
        if (!room.is_default) {
          const { data: rm } = await supabase.from("room_members").select("user_id").eq("room_id", room.id)
          const ids = (rm ?? []).map((r) => r.user_id)
          setMemberIds(ids)
          const nameOf = (id: string) => (profs ?? []).find((p) => p.id === id)?.name ?? "직원"
          const others = ids.filter((id) => id !== me)
          setRoomName(room.name && room.name !== "그룹 채팅" ? room.name : others.map(nameOf).join(", ") || room.name)
        } else {
          setRoomName(room.name)
        }
        const { data: msgs } = await supabase
          .from("group_messages")
          .select("*")
          .eq("room_id", room.id)
          .order("created_at", { ascending: true })
        setMessages(msgs ?? [])
        void loadReactions(room.id)
        void loadAttachments(room.id)
        if (me) void supabase.rpc("mark_room_read", { p_room: room.id }).then(() => {})
        setLoading(false)
      } catch {
        setError("채팅을 불러오지 못했습니다.")
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, roomIdProp])

  // 실시간 — 방 필터.
  useEffect(() => {
    if (!roomId || !meId) return
    const channel = supabase
      .channel(`group-${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_messages", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const next = payload.new as GMessage
          setMessages((prev) => (prev.some((m) => m.id === next.id) ? prev : [...prev, next]))
          if (next.sender_id !== meId) void supabase.rpc("mark_room_read", { p_room: roomId }).then(() => {})
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "group_messages", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const up = payload.new as GMessage
          setMessages((prev) => prev.map((m) => (m.id === up.id ? up : m)))
        }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "group_message_reactions" }, () => void loadReactions(roomId))
      .on("postgres_changes", { event: "*", schema: "public", table: "group_message_attachments" }, () => void loadAttachments(roomId))
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, roomId, meId, loadReactions, loadAttachments])

  // 스크롤
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])
  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight <= 80
    atBottomRef.current = near
    setAtBottom(near)
  }
  useEffect(() => {
    if (messages.length === 0) return
    if (!didInitialScroll.current) {
      didInitialScroll.current = true
      scrollToBottom("auto")
    } else if (atBottomRef.current) {
      scrollToBottom("smooth")
    }
  }, [messages, scrollToBottom])

  // 전송 — 낙관적 + 첨부.
  const send = useCallback(
    async ({ text, bodyJson }: ComposerPayload) => {
      const trimmed = text.trim()
      if (!roomId || !meId) return
      if (!trimmed && stagedFiles.length === 0) return
      const files = stagedFiles
      setStagedFiles([])
      const id = crypto.randomUUID()
      const content = trimmed || attachmentSummary(files)
      const bodyJ = trimmed ? (bodyJson as unknown as GMessage["body_json"]) : null
      const optimistic: GMessage = {
        id,
        room_id: roomId,
        sender_id: meId,
        content,
        body_json: bodyJ,
        parent_id: null,
        root_id: null,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        workspace_id: "",
      }
      setMessages((prev) => [...prev, optimistic])
      if (files.length) setUploading(true)
      try {
        const uploaded = await Promise.all(
          files.map(async (f) => ({ path: await uploadImage("chat-files", f), name: f.name, type: f.type, size: f.size }))
        )
        const { data: msg, error: insErr } = await supabase
          .from("group_messages")
          .insert({ id, room_id: roomId, sender_id: meId, content, body_json: bodyJ })
          .select("*")
          .single()
        if (insErr || !msg) throw insErr ?? new Error("전송에 실패했어요.")
        setMessages((prev) => prev.map((mm) => (mm.id === id ? (msg as GMessage) : mm)))
        if (uploaded.length) {
          const { error: attErr } = await supabase.from("group_message_attachments").insert(
            uploaded.map((u) => ({ message_id: msg.id, storage_path: u.path, name: u.name, mime_type: u.type || null, size: u.size }))
          )
          if (attErr) throw attErr
          void loadAttachments(roomId)
        }
      } catch (e) {
        setMessages((prev) => prev.filter((mm) => mm.id !== id))
        toast.error(e instanceof Error ? e.message : "전송 실패")
        setStagedFiles(files)
        throw e
      } finally {
        setUploading(false)
      }
    },
    [roomId, meId, supabase, stagedFiles, loadAttachments]
  )

  const addStagedFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    const ok: File[] = []
    const tooBig: string[] = []
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE_BYTES) tooBig.push(f.name)
      else ok.push(f)
    }
    if (tooBig.length > 0) toast.error(`50MB를 넘는 파일은 첨부할 수 없어요: ${tooBig.join(", ")}`)
    if (ok.length === 0) return
    setStagedFiles((prev) => [...prev, ...ok])
  }, [])

  // 멤버 초대(커스텀방)
  const inviteMembers = async (ids: string[]) => {
    if (!roomId || ids.length === 0) return
    setInviteBusy(true)
    const { error: e } = await supabase.rpc("add_room_members", { p_room: roomId, p_members: ids })
    setInviteBusy(false)
    setInviting(false)
    if (e) return toast.error(e.message)
    toast.success(`${ids.length}명을 초대했어요.`)
    const { data: rm } = await supabase.from("room_members").select("user_id").eq("room_id", roomId)
    setMemberIds((rm ?? []).map((r) => r.user_id))
  }
  // 방 나가기(커스텀방)
  const leaveRoom = async () => {
    if (!roomId || isDefault) return
    if (!confirm("이 채팅방에서 나갈까요?")) return
    const { error: e } = await supabase.rpc("leave_group_room", { p_room: roomId })
    if (e) return toast.error(e.message)
    toast.success("채팅방에서 나갔어요.")
    router.push("/chat")
  }

  // 반응 토글
  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!meId || !roomId) return
    setReactingId(null)
    const existing = reactions.find((r) => r.message_id === messageId && r.user_id === meId && r.emoji === emoji)
    if (existing) await supabase.from("group_message_reactions").delete().eq("id", existing.id)
    else await supabase.from("group_message_reactions").insert({ message_id: messageId, user_id: meId, emoji })
    void loadReactions(roomId)
  }

  // 수정 / 삭제(soft) — 본인 메시지만
  const saveEdit = async (m: GMessage) => {
    const t = editText.trim()
    setEditingId(null)
    if (!t || t === m.content) return
    await supabase.from("group_messages").update({ content: t, body_json: null, edited_at: new Date().toISOString() }).eq("id", m.id)
  }
  const removeMessage = async (m: GMessage) => {
    await supabase.from("group_messages").update({ deleted_at: new Date().toISOString() }).eq("id", m.id)
    push({
      label: "메시지를 삭제했어요.",
      undo: async () => {
        await supabase.from("group_messages").update({ deleted_at: null }).eq("id", m.id)
      },
      redo: async () => {
        await supabase.from("group_messages").update({ deleted_at: new Date().toISOString() }).eq("id", m.id)
      },
    })
  }

  if (loading) return <Loading rows={6} />
  if (error) return <ErrorState message={error} />

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col">
      {/* 헤더 */}
      <div className="flex items-center gap-2 border-b pb-3">
        <button onClick={() => router.push("/chat")} className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="목록">
          <ArrowLeft className="size-4" />
        </button>
        <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Users className="size-4" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">{roomName}</span>
          <span className="text-[11px] text-muted-foreground">
            {isDefault ? `팀 전원 · ${Object.keys(people).length}명` : `${memberIds.length}명`}
          </span>
        </div>
        {!isDefault && (
          <>
            <button onClick={() => setInviting(true)} className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="멤버 초대">
              <UserPlus className="size-4" />
            </button>
            <button onClick={leaveRoom} className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive-bg hover:text-destructive" title="방 나가기">
              <LogOut className="size-4" />
            </button>
          </>
        )}
      </div>

      {inviting && (
        <MemberPickerModal
          title="멤버 초대"
          confirmLabel="초대"
          excludeIds={memberIds}
          busy={inviteBusy}
          onConfirm={(ids) => inviteMembers(ids)}
          onClose={() => setInviting(false)}
        />
      )}

      {/* 메시지 */}
      <div ref={scrollRef} onScroll={onScroll} className="relative flex-1 overflow-y-auto py-4">
        {messages.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">아직 메시지가 없어요. 첫 메시지를 남겨보세요.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {messages.map((m, i) => {
              const mine = m.sender_id === meId
              const person = people[m.sender_id]
              const prev = messages[i - 1]
              const grouped = prev && prev.sender_id === m.sender_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000
              const day = dayLabel(m.created_at)
              const showDay = i === 0 || dayLabel(prev.created_at) !== day
              const msgReactions = reactions.filter((r) => r.message_id === m.id)
              const msgAtts = attachments.filter((a) => a.message_id === m.id)
              const grouped2 = grouped && !showDay
              return (
                <div key={m.id}>
                  {showDay && (
                    <div className="my-3 flex justify-center">
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] text-muted-foreground">{day}</span>
                    </div>
                  )}
                  <div className={cn("group flex gap-2 px-1", mine ? "flex-row-reverse" : "flex-row", grouped2 ? "mt-0.5" : "mt-2")}>
                    {/* 아바타(상대·그룹 시작만) */}
                    {!mine &&
                      (grouped2 ? (
                        <div className="w-7 shrink-0" />
                      ) : (
                        <Avatar className="mt-0.5 size-7 shrink-0">
                          <AvatarFallback className="text-[10px]">{(person?.name ?? "직원").slice(0, 2)}</AvatarFallback>
                        </Avatar>
                      ))}
                    <div className={cn("flex max-w-[78%] flex-col", mine ? "items-end" : "items-start")}>
                      {!mine && !grouped2 && (
                        <span className="mb-0.5 px-1 text-[11px] text-muted-foreground">
                          {person?.name ?? "직원"}
                          {person?.position && <span className="ml-1">{person.position}</span>}
                        </span>
                      )}
                      <div className={cn("flex items-end gap-1", mine ? "flex-row-reverse" : "flex-row")}>
                        {/* 말풍선 */}
                        {m.deleted_at ? (
                          <div className="rounded-2xl bg-muted/50 px-3 py-1.5 text-xs italic text-muted-foreground">삭제된 메시지입니다</div>
                        ) : editingId === m.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit(m)
                                if (e.key === "Escape") setEditingId(null)
                              }}
                              className={cn(fieldClass, "h-8 w-56")}
                            />
                            <button onClick={() => saveEdit(m)} className="text-xs text-primary">저장</button>
                            <button onClick={() => setEditingId(null)} className="text-xs text-muted-foreground">취소</button>
                          </div>
                        ) : (
                          <div className={cn("rounded-2xl px-3 py-1.5", mine ? "bg-primary text-primary-foreground" : "bg-muted")}>
                            <MessageBody bodyJson={m.body_json} content={m.content} mine={mine} />
                            {msgAtts.length > 0 && <AttachmentList items={msgAtts} className="mt-1" />}
                            {m.edited_at && <span className="ml-1 text-[9px] opacity-60">(수정됨)</span>}
                          </div>
                        )}
                        {/* 시각 + 액션 */}
                        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <span className="text-[9px] text-muted-foreground">{fmtTime(m.created_at)}</span>
                          {!m.deleted_at && (
                            <div className="relative">
                              <button onClick={() => setReactingId(reactingId === m.id ? null : m.id)} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="반응">
                                <SmilePlus className="size-3" />
                              </button>
                              {reactingId === m.id && (
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setReactingId(null)} />
                                  <div className={cn("absolute z-50 mt-1 flex gap-0.5 rounded-full border bg-popover p-1 shadow-[var(--shadow-lg)]", mine ? "right-0" : "left-0")}>
                                    {REACTIONS.map((e) => (
                                      <button key={e} onClick={() => toggleReaction(m.id, e)} className="rounded px-1 text-sm transition-transform hover:scale-125">
                                        {e}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                          {mine && !m.deleted_at && (
                            <>
                              <button onClick={() => { setEditingId(m.id); setEditText(m.content) }} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="수정">
                                <Pencil className="size-3" />
                              </button>
                              <button onClick={() => removeMessage(m)} className="rounded p-0.5 text-muted-foreground hover:bg-destructive-bg hover:text-destructive" title="삭제">
                                <Trash2 className="size-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      {/* 반응 칩 */}
                      {msgReactions.length > 0 && (
                        <div className={cn("mt-0.5 flex flex-wrap gap-0.5", mine ? "justify-end" : "justify-start")}>
                          {REACTIONS.filter((e) => msgReactions.some((r) => r.emoji === e)).map((e) => {
                            const list = msgReactions.filter((r) => r.emoji === e)
                            const mineR = list.some((r) => r.user_id === meId)
                            return (
                              <button
                                key={e}
                                onClick={() => toggleReaction(m.id, e)}
                                className={cn("flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px]", mineR ? "border-primary bg-primary/10" : "bg-background")}
                              >
                                <span>{e}</span>
                                <span className="text-muted-foreground">{list.length}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {!atBottom && (
          <button
            onClick={() => scrollToBottom()}
            className="sticky bottom-2 left-1/2 ml-[-1rem] flex size-8 items-center justify-center rounded-full border bg-popover shadow-[var(--shadow-lg)]"
            aria-label="맨 아래로"
          >
            <ChevronDown className="size-4" />
          </button>
        )}
      </div>

      {/* 스테이징 첨부 */}
      {stagedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t px-1 pt-2">
          {stagedFiles.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-lg border bg-muted/40 px-2 py-1 text-xs">
              <Paperclip className="size-3" /> <span className="max-w-32 truncate">{f.name}</span>
              <button onClick={() => setStagedFiles((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 입력 */}
      <div className="border-t pt-3">
        <RichComposer
          onSend={send}
          disabled={uploading}
          canSendEmpty={stagedFiles.length > 0}
          placeholder="전체 채팅에 메시지 보내기…"
          onPasteFiles={addStagedFiles}
          leftSlot={
            <label className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="파일 첨부">
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
              <input type="file" multiple className="hidden" onChange={(e) => addStagedFiles(e.target.files)} />
            </label>
          }
        />
      </div>
    </div>
  )
}
