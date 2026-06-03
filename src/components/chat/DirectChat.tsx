"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Send, Paperclip, NotebookPen, FileText, Loader2, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { uploadImage } from "@/lib/upload"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { fieldClass } from "@/components/shared/Modal"
import { useUndo } from "@/components/undo/UndoProvider"
import { StatusDot } from "@/components/chat/StatusDot"
import { useOnlineUsers } from "@/hooks/usePresence"
import type { DirectMessage } from "@/types"

const URL_SPLIT_RE = /(https?:\/\/[^\s]+)/g
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)$/i

/** 첨부 파일명이 이미지 확장자인지 */
function isImageAttachment(name: string | null | undefined): boolean {
  return !!name && IMAGE_EXT_RE.test(name)
}

/** 메시지 본문 안의 URL을 클릭 가능한 링크로 렌더 */
function renderContent(text: string, mine: boolean) {
  const parts = text.split(URL_SPLIT_RE)
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className={cn("underline underline-offset-2", mine ? "text-primary-foreground" : "text-primary")}
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

export function DirectChat({ otherUserId }: { otherUserId: string }) {
  const supabase = createClient()
  const { push } = useUndo()
  const [meId, setMeId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [otherName, setOtherName] = useState("")
  const [otherStatus, setOtherStatus] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({})
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const isSelf = meId != null && otherUserId === meId
  const online = useOnlineUsers(meId)

  // 첨부 메시지의 서명 URL 생성 (본인 파일 + 대화 참여자가 받은 파일 모두 — chat-files RLS 010)
  const resolveAttachments = useCallback(
    async (msgs: DirectMessage[]) => {
      const targets = msgs.filter((m) => m.attachment_url && !fileUrls[m.id])
      if (targets.length === 0) return
      const entries = await Promise.all(
        targets.map(async (m) => {
          const { data } = await supabase.storage.from("chat-files").createSignedUrl(m.attachment_url!, 3600)
          return [m.id, data?.signedUrl] as const
        })
      )
      // 성공한 것만 캐시 — 실패(undefined)는 남겨 두어 다음 기회에 재시도 가능
      const resolved = Object.fromEntries(entries.filter(([, url]) => url)) as Record<string, string>
      if (Object.keys(resolved).length > 0) setFileUrls((prev) => ({ ...prev, ...resolved }))
    },
    [supabase, fileUrls]
  )

  // 초기화
  useEffect(() => {
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      const me = auth.user?.id ?? null
      setMeId(me)

      const { data: other } = await supabase
        .from("profiles")
        .select("name, status_manual")
        .eq("id", otherUserId)
        .single()
      setOtherName(me === otherUserId ? "나와의 채팅" : other?.name ?? "직원")
      setOtherStatus(other?.status_manual ?? null)

      const { data: convId, error: rpcErr } = await supabase.rpc("get_or_create_direct_conversation", {
        other_user: otherUserId,
      })
      if (rpcErr || !convId) {
        setError(rpcErr?.message ?? "대화를 열 수 없습니다.")
        return
      }
      setConversationId(convId)

      const { data: msgs } = await supabase
        .from("direct_messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true })
      const list = msgs ?? []
      setMessages(list)
      void resolveAttachments(list)

      // 나와의 채팅이 아니면 상대 메시지 + 관련 알림을 읽음 처리.
      // SECURITY DEFINER RPC 로 처리해 RLS/세션 변수를 배제하고 한 번에 갱신한다.
      if (me && me !== otherUserId) {
        const { error: readErr } = await supabase.rpc("mark_dm_read", { conv_id: convId })
        if (readErr) console.error("mark_dm_read 실패:", readErr.message)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, otherUserId])

  // 실시간 구독
  useEffect(() => {
    if (!conversationId || !meId) return
    const channel = supabase
      .channel(`dm-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const next = payload.new as DirectMessage
          setMessages((prev) => (prev.some((m) => m.id === next.id) ? prev : [...prev, next]))
          void resolveAttachments([next])
          // 상대 메시지면 즉시 읽음 처리 (RPC — .then 으로 실제 요청 전송)
          if (next.sender_id !== meId) {
            void supabase.rpc("mark_dm_read", { conv_id: conversationId }).then(() => {})
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "direct_messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const updated = payload.new as DirectMessage
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, conversationId, meId])

  // 탭 복귀/포커스 시 읽음상태·새 메시지 재동기화 (Realtime 누락 대비 — 카톡식 즉시성 보강)
  useEffect(() => {
    if (!conversationId || !meId) return
    const sync = async () => {
      if (document.visibilityState !== "visible") return
      const { data: msgs } = await supabase
        .from("direct_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
      const list = msgs ?? []
      setMessages(list)
      void resolveAttachments(list)
      if (meId !== otherUserId) {
        void supabase.rpc("mark_dm_read", { conv_id: conversationId }).then(() => {})
      }
    }
    window.addEventListener("focus", sync)
    document.addEventListener("visibilitychange", sync)
    return () => {
      window.removeEventListener("focus", sync)
      document.removeEventListener("visibilitychange", sync)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, conversationId, meId, otherUserId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || !conversationId || !meId) return
    setSending(true)
    setInput("")
    const { error: insErr } = await supabase
      .from("direct_messages")
      .insert({ conversation_id: conversationId, sender_id: meId, content: text })
    setSending(false)
    if (insErr) {
      toast.error(insErr.message)
      setInput(text)
    }
  }, [input, conversationId, meId, supabase])

  const onAttach = async (file: File) => {
    if (!conversationId || !meId) return
    setUploading(true)
    try {
      const path = await uploadImage("chat-files", file)
      const { error: insErr } = await supabase.from("direct_messages").insert({
        conversation_id: conversationId,
        sender_id: meId,
        content: file.name,
        attachment_url: path,
        attachment_name: file.name,
      })
      if (insErr) throw insErr
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "첨부 실패")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  // 본인 메시지 수정 (텍스트만) — 변경은 Realtime UPDATE 로 양쪽에 반영
  const startEdit = (m: DirectMessage) => {
    setEditingId(m.id)
    setEditText(m.content)
  }
  const cancelEdit = () => {
    setEditingId(null)
    setEditText("")
  }
  const saveEdit = async (m: DirectMessage) => {
    const text = editText.trim()
    if (!text || text === m.content) return cancelEdit()
    const prevContent = m.content
    const prevEdited = m.edited_at
    const { error: e } = await supabase
      .from("direct_messages")
      .update({ content: text, edited_at: new Date().toISOString() })
      .eq("id", m.id)
    if (e) {
      toast.error(e.message)
      return
    }
    cancelEdit()
    push({
      label: "메시지 수정",
      undo: async () => {
        await mustOk(supabase.from("direct_messages").update({ content: prevContent, edited_at: prevEdited }).eq("id", m.id))
      },
      redo: async () => {
        await mustOk(supabase.from("direct_messages").update({ content: text, edited_at: new Date().toISOString() }).eq("id", m.id))
      },
    })
  }
  // 본인 메시지 삭제 = soft-delete (deleted_at 마킹 → "삭제된 메시지" placeholder, Undo 복구)
  const deleteMessage = async (m: DirectMessage) => {
    if (!confirm("이 메시지를 삭제할까요?")) return
    const { error: e } = await supabase
      .from("direct_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", m.id)
    if (e) {
      toast.error(e.message)
      return
    }
    push({
      label: "메시지 삭제",
      undo: async () => {
        await mustOk(supabase.from("direct_messages").update({ deleted_at: null }).eq("id", m.id))
      },
      redo: async () => {
        await mustOk(supabase.from("direct_messages").update({ deleted_at: new Date().toISOString() }).eq("id", m.id))
      },
    })
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2 border-b pb-3">
        <Link href="/chat" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
        {isSelf && <NotebookPen className="size-4 text-primary" />}
        <span className="text-sm font-semibold">{otherName}</span>
        {!isSelf && <StatusDot online={online.has(otherUserId)} manual={otherStatus} />}
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto py-2">
        {messages.length === 0 && (
          <p className="my-auto text-center text-sm text-muted-foreground">
            {isSelf ? "메모나 링크, 파일을 남겨보세요." : "첫 메시지를 보내보세요."}
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === meId
          const url = m.attachment_url ? fileUrls[m.id] : undefined

          // 삭제된 메시지 → placeholder (양쪽 모두)
          if (m.deleted_at) {
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <span className="max-w-[70%] rounded-2xl border border-dashed px-3 py-1.5 text-sm italic text-muted-foreground">
                  삭제된 메시지입니다
                </span>
              </div>
            )
          }

          // 편집 중 → 인라인 입력 (Enter 저장 / Esc 취소)
          if (editingId === m.id) {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="flex w-[70%] flex-col gap-1">
                  <textarea
                    autoFocus
                    className={cn(fieldClass, "min-h-[60px] resize-none")}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        void saveEdit(m)
                      }
                      if (e.key === "Escape") cancelEdit()
                    }}
                  />
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>취소</Button>
                    <Button size="sm" onClick={() => saveEdit(m)}>저장</Button>
                  </div>
                </div>
              </div>
            )
          }

          return (
            <div key={m.id} className={cn("group flex items-end gap-1", mine ? "justify-end" : "justify-start")}>
              {/* 본인 메시지 호버 액션 (텍스트만 수정 가능, 삭제는 모두) */}
              {mine && (
                <div className="flex items-center gap-0.5 self-center opacity-0 transition-opacity group-hover:opacity-100">
                  {!m.attachment_url && (
                    <button onClick={() => startEdit(m)} className="text-muted-foreground hover:text-foreground" aria-label="메시지 수정">
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                  <button onClick={() => deleteMessage(m)} className="text-muted-foreground hover:text-red-600" aria-label="메시지 삭제">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
              {mine && !isSelf && m.read_at === null && <span className="mb-0.5 shrink-0 text-[10px] text-amber-500">1</span>}
              {m.attachment_url && isImageAttachment(m.attachment_name) ? (
                // 이미지 첨부 — 파일명 대신 썸네일을 바로 렌더 (클릭 시 원본 새 탭)
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn("block max-w-[70%] overflow-hidden rounded-2xl", !url && "pointer-events-none")}
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt={m.attachment_name ?? "이미지"}
                      className="max-h-64 w-auto rounded-2xl object-cover"
                    />
                  ) : (
                    <div className="flex h-32 w-32 items-center justify-center bg-muted text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                    </div>
                  )}
                </a>
              ) : (
                <div
                  className={cn(
                    "max-w-[70%] rounded-2xl px-3 py-1.5 text-sm break-words",
                    mine ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}
                >
                  {m.attachment_url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn("inline-flex items-center gap-1.5 underline-offset-2 hover:underline", !url && "pointer-events-none opacity-60")}
                    >
                      <FileText className="size-3.5 shrink-0" />
                      {m.attachment_name ?? "첨부파일"}
                    </a>
                  ) : (
                    <span className="whitespace-pre-wrap">
                      {renderContent(m.content, mine)}
                      {m.edited_at && (
                        <span className={cn("ml-1 align-baseline text-[10px]", mine ? "text-primary-foreground/60" : "text-muted-foreground")}>
                          수정됨
                        </span>
                      )}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
        className="flex items-center gap-2 border-t pt-3"
      >
        <input ref={fileRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && onAttach(e.target.files[0])} />
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => fileRef.current?.click()} disabled={!conversationId || uploading}>
          {uploading ? <Loader2 className="animate-spin" /> : <Paperclip />}
        </Button>
        <input
          className={fieldClass}
          placeholder="메시지 입력…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!conversationId}
        />
        <Button type="submit" size="icon-sm" disabled={sending || !input.trim()}>
          <Send />
        </Button>
      </form>
    </div>
  )
}
