"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Send, Paperclip, NotebookPen, FileText, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { uploadImage } from "@/lib/upload"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { fieldClass } from "@/components/shared/Modal"
import type { DirectMessage } from "@/types"

const URL_SPLIT_RE = /(https?:\/\/[^\s]+)/g

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
  const [meId, setMeId] = useState<string | null>(null)
  const [otherName, setOtherName] = useState("")
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

  // 첨부 메시지의 서명 URL 생성 (본인 폴더 파일만 접근 가능 — 나와의 채팅에 최적)
  const resolveAttachments = useCallback(
    async (msgs: DirectMessage[]) => {
      const targets = msgs.filter((m) => m.attachment_url && !fileUrls[m.id])
      if (targets.length === 0) return
      const entries = await Promise.all(
        targets.map(async (m) => {
          const { data } = await supabase.storage.from("chat-files").createSignedUrl(m.attachment_url!, 3600)
          return [m.id, data?.signedUrl ?? ""] as const
        })
      )
      setFileUrls((prev) => ({ ...prev, ...Object.fromEntries(entries) }))
    },
    [supabase, fileUrls]
  )

  // 초기화
  useEffect(() => {
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      const me = auth.user?.id ?? null
      setMeId(me)

      const { data: other } = await supabase.from("profiles").select("name").eq("id", otherUserId).single()
      setOtherName(me === otherUserId ? "나와의 채팅" : other?.name ?? "직원")

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

      // 나와의 채팅이 아니면 상대가 보낸 안 읽은 메시지를 읽음 처리
      if (me && me !== otherUserId) {
        void supabase
          .from("direct_messages")
          .update({ read_at: new Date().toISOString() })
          .eq("conversation_id", convId)
          .neq("sender_id", me)
          .is("read_at", null)
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
          if (next.sender_id !== meId) {
            void supabase.from("direct_messages").update({ read_at: new Date().toISOString() }).eq("id", next.id).is("read_at", null)
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
      setError(insErr.message)
      setInput(text)
    }
  }, [input, conversationId, meId, supabase])

  const onAttach = async (file: File) => {
    if (!conversationId || !meId) return
    setUploading(true)
    setError(null)
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
      setError(e instanceof Error ? e.message : "첨부 실패")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
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
          return (
            <div key={m.id} className={cn("flex items-end gap-1", mine ? "justify-end" : "justify-start")}>
              {mine && !isSelf && m.read_at === null && <span className="mb-0.5 shrink-0 text-[10px] text-amber-500">1</span>}
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
                  <span className="whitespace-pre-wrap">{renderContent(m.content, mine)}</span>
                )}
              </div>
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
