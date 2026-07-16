"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Paperclip, Upload, NotebookPen, FileText, Loader2, Pencil, Trash2, SmilePlus, CornerUpLeft, X, ChevronDown } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { mustOk } from "@/lib/supabase/mustOk"
import { uploadImage } from "@/lib/upload"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { fieldClass } from "@/components/shared/Modal"
import { useUndo } from "@/components/undo/UndoProvider"
import { StatusDot } from "@/components/chat/StatusDot"
import { MessageBody } from "@/components/chat/MessageBody"
import { RichComposer, type ComposerPayload } from "@/components/chat/RichComposer"
import { AttachmentList, type AttachmentItem } from "@/components/chat/AttachmentList"
import { useOnlineUsers } from "@/hooks/usePresence"
import { emitChat, onChat } from "@/lib/chatBus"
import type { DirectMessage } from "@/types"

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)$/i

// 첨부 파일 1개당 용량 상한(초과 시 토스트로 안내·제외). 대용량의 '조용한 실패' 방지.
const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50MB

/** 첨부 파일명이 이미지 확장자인지 (레거시 단일 첨부 렌더용) */
function isImageAttachment(name: string | null | undefined): boolean {
  return !!name && IMAGE_EXT_RE.test(name)
}

const IMAGE_MIME_RE = /^image\//
/** 다중첨부 이미지 판별(mime 우선·파일명 보조) — 서명 시 이미지=뷰/파일=다운로드 분기. */
function attIsImage(mime: string | null, name: string | null): boolean {
  return (!!mime && IMAGE_MIME_RE.test(mime)) || IMAGE_EXT_RE.test(name ?? "")
}

/** 첨부만 보낼 때 content(plain SSOT) 자동 요약 — ChatList 미리보기·답장 인용에 쓰임 */
function attachmentSummary(files: File[]): string {
  return files.length === 1 ? files[0].name : `파일 ${files.length}개`
}

/** 답장 인용·배너에 쓸 한 줄 요약 (삭제/첨부/본문 순). content는 항상 plain SSOT라 리치여도 안전. */
function quoteSnippet(m: DirectMessage): string {
  if (m.deleted_at) return "삭제된 메시지"
  if (m.attachment_url) return m.attachment_name ?? "첨부파일"
  return m.content
}

/** 메시지 시각 — "오후 2:30" (카톡식 짧은 시각). */
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })
}

export function DirectChat({ otherUserId }: { otherUserId: string }) {
  const supabase = createClient()
  const meId = useCurrentUserId()
  const { push } = useUndo()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [otherName, setOtherName] = useState("")
  const [otherStatus, setOtherStatus] = useState<string | null>(null)
  const [otherPosition, setOtherPosition] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [reactions, setReactions] = useState<{ id: string; message_id: string; emoji: string; user_id: string }[]>([])
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({})
  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const [attachments, setAttachments] = useState<(AttachmentItem & { message_id: string })[]>([])
  const attachmentsRef = useRef<(AttachmentItem & { message_id: string })[]>([])
  const [uploading, setUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [atBottom, setAtBottom] = useState(true) // 맨 아래 근처 여부(아래로 버튼 표시·자동 따라가기 판단)
  const [otherTyping, setOtherTyping] = useState(false) // 상대가 작성 중(브로드캐스트로 수신)
  const scrollRef = useRef<HTMLDivElement>(null) // 메시지 스크롤 컨테이너
  const contentRef = useRef<HTMLDivElement>(null) // 메시지 콘텐츠 래퍼(높이 변화 관찰 대상)
  const atBottomRef = useRef(true) // onScroll 로직에서 최신값을 deps 없이 읽기 위한 미러
  const didInitialScroll = useRef(false) // 첫 로드 1회 즉시 하단 고정 여부
  const fileRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0) // 드롭존 자식 위를 지날 때 enter/leave 플리커 방지용 깊이 카운터
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const highlightTimer = useRef<number | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null) // '작성 중' 브로드캐스트 발신용
  const typingClearTimer = useRef<number | null>(null) // 상대 타이핑 표시 자동 해제 타이머
  const lastTypingSent = useRef(0) // 내 타이핑 브로드캐스트 throttle 기준 시각(ms)

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

  // 이 대화의 모든 메시지 반응을 한 번에 로드(inner join 필터).
  const loadReactions = useCallback(
    async (convId: string) => {
      const { data } = await supabase
        .from("message_reactions")
        .select("id, message_id, emoji, user_id, direct_messages!inner(conversation_id)")
        .eq("direct_messages.conversation_id", convId)
      setReactions(
        (data ?? []).map((r) => ({ id: r.id, message_id: r.message_id, emoji: r.emoji, user_id: r.user_id }))
      )
    },
    [supabase]
  )

  // 이 대화의 다중첨부 로드 + 서명 URL. 증분(이미 서명된 건 재사용)으로 깜빡임·서명폭풍 방지.
  // 파일(비이미지)은 download 옵션으로 서명 → 새 탭(target=_blank) 없이 그 자리 다운로드(about:blank 방지).
  const loadAttachments = useCallback(
    async (convId: string) => {
      const { data } = await supabase
        .from("message_attachments")
        .select("id, message_id, storage_path, name, mime_type, direct_messages!inner(conversation_id)")
        .eq("direct_messages.conversation_id", convId)
      const rows = data ?? []
      const cachedUrl = new Map(attachmentsRef.current.map((c) => [c.id, c.url]))
      const toSign = rows.filter((a) => !cachedUrl.get(a.id))
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
          url: signedUrl.get(a.id) ?? cachedUrl.get(a.id) ?? null,
        }))
      )
    },
    [supabase]
  )

  // attachments 최신값을 ref로 추적(증분 서명 캐시 비교용 — setState 아님이라 베이스라인 무관).
  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  // 반응 토글 — 내 같은 이모지 있으면 삭제, 없으면 추가. (RLS: 본인만)
  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!meId || !conversationId) return
      const existing = reactions.find(
        (r) => r.message_id === messageId && r.user_id === meId && r.emoji === emoji
      )
      if (existing) {
        await supabase.from("message_reactions").delete().eq("id", existing.id)
      } else {
        await supabase.from("message_reactions").insert({ message_id: messageId, user_id: meId, emoji })
      }
      void loadReactions(conversationId)
      emitChat(conversationId)
    },
    [supabase, meId, conversationId, reactions, loadReactions]
  )

  // 초기화
  useEffect(() => {
    ;(async () => {
      const { data: other } = await supabase
        .from("profiles")
        .select("name, status_manual, position")
        .eq("id", otherUserId)
        .single()
      setOtherName(meId === otherUserId ? "나와의 채팅" : other?.name ?? "직원")
      setOtherStatus(other?.status_manual ?? null)
      setOtherPosition(other?.position ?? null)

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
      void loadReactions(convId)
      void loadAttachments(convId)

      // 나와의 채팅이 아니면 상대 메시지 + 관련 알림을 읽음 처리.
      // SECURITY DEFINER RPC 로 처리해 RLS/세션 변수를 배제하고 한 번에 갱신한다.
      if (meId && meId !== otherUserId) {
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
      .channel(`dm-${conversationId}`, { config: { broadcast: { self: false } } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const next = payload.new as DirectMessage
          setMessages((prev) => (prev.some((m) => m.id === next.id) ? prev : [...prev, next]))
          void resolveAttachments([next])
          // 상대 메시지면: '작성 중' 표시 해제 + 즉시 읽음 처리 (RPC)
          if (next.sender_id !== meId) {
            setOtherTyping(false)
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        () => void loadReactions(conversationId)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_attachments" },
        () => void loadAttachments(conversationId)
      )
      .on("broadcast", { event: "typing" }, (msg) => {
        // 상대가 입력 중 — 표시 켜고, 일정 시간 신호 없으면 자동 해제(self:false라 내 신호는 안 옴)
        const uid = (msg.payload as { user_id?: string } | undefined)?.user_id
        if (!uid || uid === meId) return
        setOtherTyping(true)
        if (typingClearTimer.current) window.clearTimeout(typingClearTimer.current)
        typingClearTimer.current = window.setTimeout(() => setOtherTyping(false), 3500)
      })
      .subscribe()
    channelRef.current = channel
    return () => {
      if (typingClearTimer.current) window.clearTimeout(typingClearTimer.current)
      channelRef.current = null
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, conversationId, meId])

  // 입력 중 '작성 중' 브로드캐스트(throttle 1.5s). 나와의 채팅·채널 미준비 시엔 보내지 않음.
  const notifyTyping = useCallback(() => {
    if (isSelf || !meId) return
    const ch = channelRef.current
    if (!ch) return
    const now = Date.now()
    if (now - lastTypingSent.current < 1500) return
    lastTypingSent.current = now
    void ch.send({ type: "broadcast", event: "typing", payload: { user_id: meId } })
  }, [isSelf, meId])

  // 메시지·반응·읽음 재동기화 — 포커스 복귀 + 다른 창 신호 공용. 메시지는 항상 갱신, 읽음은 보일 때만.
  const resync = useCallback(async () => {
    if (!conversationId) return
    const { data: msgs } = await supabase
      .from("direct_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
    const list = msgs ?? []
    setMessages(list)
    void resolveAttachments(list)
    void loadReactions(conversationId)
    void loadAttachments(conversationId)
    if (meId && meId !== otherUserId && document.visibilityState === "visible") {
      void supabase.rpc("mark_dm_read", { conv_id: conversationId }).then(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, conversationId, meId, otherUserId])

  // 탭 복귀/포커스 시 재동기화 (Realtime 누락 대비 — 카톡식 즉시성 보강)
  useEffect(() => {
    if (!conversationId || !meId) return
    const onVis = () => {
      if (document.visibilityState === "visible") void resync()
    }
    window.addEventListener("focus", onVis)
    document.addEventListener("visibilitychange", onVis)
    return () => {
      window.removeEventListener("focus", onVis)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [conversationId, meId, resync])

  // 다른 창/탭에서 채팅이 바뀌면(BroadcastChannel) 이 대화방이면 즉시 재동기화
  useEffect(() => {
    if (!conversationId) return
    return onChat((cid) => {
      if (!cid || cid === conversationId) void resync()
    })
  }, [conversationId, resync])

  // 스크롤 컨테이너를 맨 아래로
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  // 스크롤 위치 추적 — 맨 아래 근처면 atBottom(버튼 숨김·자동 따라가기). ref도 같이 갱신(로직용).
  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight <= 80
    atBottomRef.current = near
    setAtBottom(near)
  }

  // 메시지 변화: 첫 로드는 즉시(애니 없이) 하단 고정 → 새로고침해도 중앙이 아닌 맨 밑. 이후엔 맨 밑이었을 때만 따라감.
  useEffect(() => {
    if (messages.length === 0) return
    if (!didInitialScroll.current) {
      didInitialScroll.current = true
      scrollToBottom("auto")
    } else if (atBottomRef.current) {
      scrollToBottom("smooth")
    }
  }, [messages, scrollToBottom])

  // 첨부 이미지가 늦게 로드되며 높이가 커져도 맨 밑이었으면 다시 핀(새로고침 후 중앙에 머무는 근본 원인 차단)
  useEffect(() => {
    const content = contentRef.current
    const scroller = scrollRef.current
    if (!content || !scroller) return
    const ro = new ResizeObserver(() => {
      if (atBottomRef.current) scroller.scrollTo({ top: scroller.scrollHeight })
    })
    ro.observe(content)
    return () => ro.disconnect()
  }, [])

  // 인용 클릭 → 원본 메시지로 스크롤 + 잠시 하이라이트 (타이머는 ref로 관리: 재클릭 리셋·언마운트 정리)
  const scrollToMessage = useCallback((id: string) => {
    const el = messageRefs.current[id]
    if (!el) return
    // 위로 점프하는 동안엔 '맨 아래' 아님으로 표시 → 이미지 지연 로드의 RO 재핀이 점프를 가로채지 않게.
    atBottomRef.current = false
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    setHighlightId(id)
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current)
    highlightTimer.current = window.setTimeout(() => setHighlightId(null), 1600)
  }, [])

  // 언마운트 시 하이라이트 타이머 정리
  useEffect(() => () => { if (highlightTimer.current) window.clearTimeout(highlightTimer.current) }, [])

  // RichComposer가 { text(plain SSOT), bodyJson(리치) }를 올려보낸다. 스테이징된 파일이 있으면 함께 전송.
  // 실패 시 throw → 컴포저가 텍스트 보존(여기선 첨부·답장도 복원).
  const send = useCallback(
    async ({ text, bodyJson }: ComposerPayload) => {
      const trimmed = text.trim()
      if (!conversationId || !meId) return
      if (!trimmed && stagedFiles.length === 0) return
      const files = stagedFiles
      const replyParent = replyTo
      setStagedFiles([])
      setReplyTo(null)
      // 클라 생성 id — 낙관적 말풍선과 실제 행이 같은 id를 공유(에코 INSERT 중복·레이스 방지).
      const id = crypto.randomUUID()
      const content = trimmed || attachmentSummary(files) // plain SSOT(첨부만이면 요약)
      const bodyJ = trimmed ? (bodyJson as unknown as DirectMessage["body_json"]) : null
      const parentId = replyParent?.id ?? null
      const rootId = replyParent ? replyParent.root_id ?? replyParent.id : null
      // 낙관적 반영 — 누르는 즉시 말풍선 표시(서버 왕복·업로드 안 기다림). 실패 시 catch에서 제거.
      const optimistic: DirectMessage = {
        id,
        conversation_id: conversationId,
        sender_id: meId,
        content,
        body_json: bodyJ,
        parent_id: parentId,
        root_id: rootId,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        read_at: null,
        attachment_url: null,
        attachment_name: null,
        workspace_id: "",
      }
      setMessages((prev) => [...prev, optimistic])
      emitChat(conversationId) // 다른 창/탭 즉시 동기화
      if (files.length) setUploading(true)
      try {
        const uploaded = await Promise.all(
          files.map(async (f) => ({ path: await uploadImage("chat-files", f), name: f.name, type: f.type, size: f.size }))
        )
        const { data: msg, error: insErr } = await supabase
          .from("direct_messages")
          .insert({ id, conversation_id: conversationId, sender_id: meId, content, body_json: bodyJ, parent_id: parentId, root_id: rootId })
          .select("*")
          .single()
        if (insErr || !msg) throw insErr ?? new Error("전송에 실패했어요.")
        // 실제 행으로 교체(서버 타임스탬프·workspace_id 반영). 에코 INSERT는 같은 id라 무시됨.
        setMessages((prev) => prev.map((mm) => (mm.id === id ? (msg as DirectMessage) : mm)))
        if (uploaded.length) {
          const { error: attErr } = await supabase.from("message_attachments").insert(
            uploaded.map((u) => ({
              message_id: msg.id,
              storage_path: u.path,
              name: u.name,
              mime_type: u.type || null,
              size: u.size,
            }))
          )
          if (attErr) throw attErr
          void loadAttachments(conversationId)
        }
      } catch (e) {
        setMessages((prev) => prev.filter((mm) => mm.id !== id)) // 낙관적 메시지 제거
        toast.error(e instanceof Error ? e.message : "전송 실패")
        setStagedFiles(files) // 첨부 복원
        setReplyTo(replyParent)
        throw e // 컴포저가 텍스트 보존
      } finally {
        setUploading(false)
      }
    },
    [conversationId, meId, supabase, replyTo, stagedFiles, loadAttachments]
  )

  // 파일 스테이징(즉시 업로드 X — 전송 시 일괄). 여러 개 누적. 모든 형식 허용, 50MB 초과만 제외.
  // useCallback: onPasteFiles로 RichComposer에 넘기므로 참조 안정화(자식 effect 불필요 재실행 방지).
  const addStagedFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    const ok: File[] = []
    const tooBig: string[] = []
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE_BYTES) tooBig.push(f.name)
      else ok.push(f)
    }
    if (tooBig.length > 0) {
      toast.error(`50MB를 넘는 파일은 첨부할 수 없어요: ${tooBig.join(", ")}`)
    }
    if (ok.length === 0) return // 전부 제외되면 스테이징·입력 리셋 모두 생략
    setStagedFiles((prev) => [...prev, ...ok])
    if (fileRef.current) fileRef.current.value = "" // 같은 파일 재선택 허용(클릭 경로)
  }, [])
  const removeStagedFile = (idx: number) => setStagedFiles((prev) => prev.filter((_, i) => i !== idx))

  // 드래그&드롭 / 붙여넣기로 첨부 — 클릭 첨부와 동일한 스테이징 파이프라인으로 흘려보낸다(추가만, 기존 경로 무변경).
  const canAttach = !!conversationId && !uploading
  const dragHasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files")
  // dragover/drop은 항상 preventDefault — 안 하면 브라우저가 파일을 새 탭으로 열어 대화를 이탈한다.
  const onDragEnter = (e: React.DragEvent) => {
    if (!dragHasFiles(e)) return
    e.preventDefault()
    dragDepth.current += 1
    setIsDragging(true) // 표시 가부는 렌더에서 canAttach로 게이팅(드래그 중 상태 뒤집힘에도 동기)
  }
  const onDragOver = (e: React.DragEvent) => {
    if (!dragHasFiles(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = canAttach ? "copy" : "none"
  }
  const onDragLeave = (e: React.DragEvent) => {
    if (!dragHasFiles(e)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setIsDragging(false)
  }
  const onDrop = (e: React.DragEvent) => {
    if (!dragHasFiles(e)) return
    e.preventDefault()
    dragDepth.current = 0
    setIsDragging(false)
    if (canAttach) addStagedFiles(e.dataTransfer.files)
  }
  // 드래그가 컴포저 밖에서 끝나거나 취소(ESC)돼도 오버레이가 남지 않도록 전역에서 강제 해제(깊이 카운터 보조)
  useEffect(() => {
    const reset = () => {
      dragDepth.current = 0
      setIsDragging(false)
    }
    window.addEventListener("drop", reset)
    window.addEventListener("dragend", reset)
    return () => {
      window.removeEventListener("drop", reset)
      window.removeEventListener("dragend", reset)
    }
  }, [])

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
    const prevBody = m.body_json
    const now = new Date().toISOString()
    // 편집은 plain 텍스트이므로 body_json을 비워 리치 잔류를 막는다(편집본은 plain 렌더)
    const { error: e } = await supabase
      .from("direct_messages")
      .update({ content: text, body_json: null, edited_at: now })
      .eq("id", m.id)
    if (e) {
      toast.error(e.message)
      return
    }
    cancelEdit()
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, content: text, body_json: null, edited_at: now } : x)))
    emitChat(conversationId)
    push({
      label: "메시지 수정",
      undo: async () => {
        await mustOk(supabase.from("direct_messages").update({ content: prevContent, body_json: prevBody, edited_at: prevEdited }).eq("id", m.id))
        emitChat(conversationId)
      },
      redo: async () => {
        await mustOk(supabase.from("direct_messages").update({ content: text, body_json: null, edited_at: now }).eq("id", m.id))
        emitChat(conversationId)
      },
    })
  }
  // 본인 메시지 삭제 = soft-delete (deleted_at 마킹 → "삭제된 메시지" placeholder, Undo 복구)
  const deleteMessage = async (m: DirectMessage) => {
    if (!confirm("이 메시지를 삭제할까요?")) return
    const now = new Date().toISOString()
    const { error: e } = await supabase
      .from("direct_messages")
      .update({ deleted_at: now })
      .eq("id", m.id)
    if (e) {
      toast.error(e.message)
      return
    }
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, deleted_at: now } : x)))
    emitChat(conversationId)
    push({
      label: "메시지 삭제",
      undo: async () => {
        await mustOk(supabase.from("direct_messages").update({ deleted_at: null }).eq("id", m.id))
        emitChat(conversationId)
      },
      redo: async () => {
        await mustOk(supabase.from("direct_messages").update({ deleted_at: now }).eq("id", m.id))
        emitChat(conversationId)
      },
    })
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>

  const reactionsByMsg = new Map<string, { emoji: string; user_id: string }[]>()
  for (const r of reactions) {
    const arr = reactionsByMsg.get(r.message_id) ?? []
    arr.push({ emoji: r.emoji, user_id: r.user_id })
    reactionsByMsg.set(r.message_id, arr)
  }
  const messagesById = new Map(messages.map((m) => [m.id, m]))
  const attachmentsByMsg = new Map<string, AttachmentItem[]>()
  for (const a of attachments) {
    const arr = attachmentsByMsg.get(a.message_id) ?? []
    arr.push(a)
    attachmentsByMsg.set(a.message_id, arr)
  }

  return (
    // 높이를 명시적으로 고정(h-full은 PageTransition 래퍼가 auto-height라 사슬이 끊겨 내부 스크롤이 안 잡힘 →
    // 대신 --app-content-height로 bounded 컨테이너 확보 = 내부 스크롤러가 하단 고정되도록). 대시보드/그룹챗과 동일 관례.
    <div className="flex h-[var(--app-content-height)] flex-col">
      <div className="mb-3 flex items-center gap-2 border-b pb-3">
        <Link href="/chat" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
        {isSelf && <NotebookPen className="size-4 text-primary" />}
        <span className="text-sm font-semibold">{otherName}</span>
        {!isSelf && otherPosition && <span className="text-xs text-muted-foreground">{otherPosition}</span>}
        {!isSelf && <StatusDot online={online.has(otherUserId)} manual={otherStatus} />}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} onScroll={onScroll} className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2 pr-4">
        {messages.length === 0 && (
          <p className="my-auto text-center text-sm text-muted-foreground">
            {isSelf ? "메모나 링크, 파일을 남겨보세요." : "첫 메시지를 보내보세요."}
          </p>
        )}
        <div ref={contentRef} className="flex flex-col gap-1">
        {messages.map((m, i) => {
          const mine = m.sender_id === meId
          const url = m.attachment_url ? fileUrls[m.id] : undefined
          const parent = m.parent_id ? messagesById.get(m.parent_id) : undefined
          const parentClickable = !!parent && !parent.deleted_at // 삭제·미발견 부모는 스크롤 불가
          // 카톡식 시간: 같은 사람·같은 분(分) 연속이면 마지막 메시지에만 시각을 보인다(노이즈 압축).
          const nextMsg = messages[i + 1]
          const showTime =
            !nextMsg ||
            nextMsg.sender_id !== m.sender_id ||
            nextMsg.deleted_at != null ||
            fmtTime(nextMsg.created_at) !== fmtTime(m.created_at)

          // 삭제된 메시지 → placeholder (양쪽 모두)
          if (m.deleted_at) {
            return (
              <div
                key={m.id}
                ref={(el) => { messageRefs.current[m.id] = el }}
                className={cn(
                  "flex rounded-xl transition-colors",
                  mine ? "justify-end" : "justify-start",
                  highlightId === m.id && "bg-primary/10"
                )}
              >
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
            <div
              key={m.id}
              ref={(el) => { messageRefs.current[m.id] = el }}
              className={cn(
                "group flex w-full flex-col gap-0.5 rounded-xl transition-colors",
                mine ? "items-end" : "items-start",
                highlightId === m.id && "bg-primary/10"
              )}
            >
              {/* 답장 인용 미리보기 — 클릭 시 원본으로 스크롤 */}
              {m.parent_id && (
                <button
                  onClick={() => { if (parentClickable && parent) scrollToMessage(parent.id) }}
                  className={cn(
                    "flex max-w-[70%] items-center gap-1.5 rounded-lg border-l-2 border-primary/50 bg-muted/50 px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted",
                    !parentClickable && "pointer-events-none opacity-60"
                  )}
                >
                  <CornerUpLeft className="size-3 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{parent ? (parent.sender_id === meId ? "나" : otherName) : "원본"}</span>{" "}
                    {parent ? quoteSnippet(parent) : "원본 메시지를 찾을 수 없어요"}
                  </span>
                </button>
              )}
              <div className={cn("flex w-full items-end gap-1", mine ? "justify-end" : "justify-start")}>
              {/* 본인 메시지 호버 액션 (답장·이모지·텍스트 수정·삭제) — 버블 옆 인라인, 세로 중앙 */}
              {mine && (
                <div className="flex items-center gap-0.5 self-center opacity-0 transition-opacity group-hover:opacity-100 has-[[data-emoji-open]]:opacity-100">
                  <button onClick={() => setReplyTo(m)} className="text-muted-foreground hover:text-foreground" aria-label="답장">
                    <CornerUpLeft className="size-3.5" />
                  </button>
                  <EmojiAddButton align="right" onPick={(e) => toggleReaction(m.id, e)} />
                  {!m.attachment_url && (
                    <button onClick={() => startEdit(m)} className="text-muted-foreground hover:text-foreground" aria-label="메시지 수정">
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                  <button onClick={() => deleteMessage(m)} className="text-muted-foreground hover:text-destructive" aria-label="메시지 삭제">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
              {mine && ((!isSelf && m.read_at === null) || showTime) && (
                <div className="flex shrink-0 flex-col items-end justify-center gap-0.5 self-center mr-1 text-[10px] leading-none text-muted-foreground">
                  {!isSelf && m.read_at === null && <span className="text-warning">1</span>}
                  {showTime && <span>{fmtTime(m.created_at)}</span>}
                </div>
              )}
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
                    "max-w-[min(78%,44rem)] rounded-2xl px-3 py-1.5 text-sm break-words",
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
                    <>
                      <MessageBody bodyJson={m.body_json} content={m.content} mine={mine} />
                      {m.edited_at && (
                        <span className={cn("ml-1 align-baseline text-[10px]", mine ? "text-primary-foreground/60" : "text-muted-foreground")}>
                          수정됨
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
              {!mine && showTime && (
                <span className="shrink-0 self-center ml-1 text-[10px] leading-none text-muted-foreground">{fmtTime(m.created_at)}</span>
              )}
              {!mine && (
                <div className="flex items-center gap-0.5 self-center opacity-0 transition-opacity group-hover:opacity-100 has-[[data-emoji-open]]:opacity-100">
                  <button onClick={() => setReplyTo(m)} className="text-muted-foreground hover:text-foreground" aria-label="답장">
                    <CornerUpLeft className="size-3.5" />
                  </button>
                  <EmojiAddButton align="left" onPick={(e) => toggleReaction(m.id, e)} />
                </div>
              )}
              </div>
              <AttachmentList items={attachmentsByMsg.get(m.id) ?? []} />
              {/* 반응 칩 — 실제 반응이 있을 때만 버블 아래 작게(없으면 빈 행 미생성 → 간격 압축) */}
              <ReactionChips
                reactions={reactionsByMsg.get(m.id) ?? []}
                meId={meId}
                mine={mine}
                onToggle={(emoji) => toggleReaction(m.id, emoji)}
              />
            </div>
          )
        })}
        {/* 상대 '작성 중…' — 카톡식 점 3개 물결 애니메이션 */}
        {otherTyping && !isSelf && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl bg-muted px-3.5 py-2.5">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="size-1.5 rounded-full bg-muted-foreground/60 motion-safe:animate-[equria-typing_1.2s_ease-in-out_infinite]"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </div>
          </div>
        )}
        </div>
        </div>
        {!atBottom && (
          <button
            type="button"
            onClick={() => scrollToBottom("smooth")}
            aria-label="맨 아래로"
            className="absolute bottom-3 right-3 z-10 grid size-9 place-items-center rounded-full border bg-card/90 text-foreground shadow-[var(--shadow-lg)] backdrop-blur-sm transition-colors hover:bg-muted motion-safe:animate-[equria-fade-up_0.18s_ease-out]"
          >
            <ChevronDown className="size-5" />
          </button>
        )}
      </div>

      {replyTo && (
        <div className="flex items-center gap-2 border-t bg-muted/30 px-3 py-2 text-xs">
          <CornerUpLeft className="size-3.5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{replyTo.sender_id === meId ? "나" : otherName}에게 답장</p>
            <p className="truncate text-muted-foreground">{quoteSnippet(replyTo)}</p>
          </div>
          <button onClick={() => setReplyTo(null)} aria-label="답장 취소" className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      )}
      <div
        className={cn("relative flex flex-col gap-1.5 pt-3", !replyTo && "border-t")}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {/* 드래그 오버 시 드롭존 오버레이 — pointer-events-none이라 아래 래퍼가 드롭 이벤트를 그대로 받는다.
            canAttach 게이팅: 업로드 중·대화 미준비로 드롭 불가일 땐 '놓으세요' 오해를 주지 않음. */}
        {isDragging && canAttach && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-primary bg-card/85 backdrop-blur-sm motion-safe:animate-[equria-fade-up_0.18s_ease-out]">
            <Upload className="size-6 text-primary" />
            <p className="text-sm font-medium text-foreground">여기에 파일을 놓으세요</p>
            <p className="text-xs text-muted-foreground">모든 형식 · 최대 50MB</p>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => addStagedFiles(e.target.files)}
        />
        {/* 스테이징된 첨부 미리보기 칩 (전송 전 제거 가능) */}
        {stagedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {stagedFiles.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="inline-flex items-center gap-1 rounded-lg border bg-muted/40 px-2 py-1 text-xs"
              >
                <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                <span className="max-w-[12rem] truncate">{f.name}</span>
                <button
                  onClick={() => removeStagedFile(i)}
                  aria-label="첨부 제거"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <RichComposer
          onSend={send}
          disabled={!conversationId}
          canSendEmpty={stagedFiles.length > 0}
          onPasteFiles={addStagedFiles}
          onTyping={notifyTyping}
          leftSlot={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => fileRef.current?.click()}
              disabled={!conversationId || uploading}
            >
              {uploading ? <Loader2 className="animate-spin" /> : <Paperclip />}
            </Button>
          }
        />
      </div>
    </div>
  )
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "✅"]

// 반응 표시 = 실제 이모지(DM·그룹 동일). 호출부 아이콘 크기 클래스를 글자 크기로 환산.
function renderReaction(emoji: string, sizeClass: string) {
  return <span className={cn("leading-none", sizeClass === "size-4" ? "text-base" : "text-sm")}>{emoji}</span>
}

/** 버블 옆 인라인 "반응 추가" 트리거 — 클릭 시 빠른 이모지 팝오버. data-emoji-open으로 부모 호버클러스터를 열려있는 동안 유지. */
function EmojiAddButton({ onPick, align = "left" }: { onPick: (emoji: string) => void; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex" {...(open ? { "data-emoji-open": "" } : {})}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="반응 추가"
        className="text-muted-foreground hover:text-foreground"
      >
        <SmilePlus className="size-3.5" />
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setOpen(false)} />
          {/* 메시지 좌/우에 따라 화면 안쪽으로 펼쳐 잘림 방지(좌측 메시지=오른쪽으로, 우측 메시지=왼쪽으로) */}
          <div
            className={cn(
              "absolute bottom-full z-20 mb-1 flex gap-0.5 rounded-full border bg-popover p-1 shadow-lg",
              align === "right" ? "right-0" : "left-0"
            )}
          >
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  onPick(e)
                  setOpen(false)
                }}
                className="grid size-7 place-items-center rounded-full transition-colors hover:bg-muted"
              >
                {renderReaction(e, "size-4")}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** 버블 아래 반응 칩 — 실제 반응이 있을 때만 렌더(없으면 null → 빈 행 미생성). 칩 클릭=토글. */
function ReactionChips({
  reactions,
  meId,
  mine,
  onToggle,
}: {
  reactions: { emoji: string; user_id: string }[]
  meId: string | null
  mine: boolean
  onToggle: (emoji: string) => void
}) {
  const groups: Record<string, string[]> = {}
  for (const r of reactions) (groups[r.emoji] ??= []).push(r.user_id)
  const entries = Object.entries(groups)
  if (entries.length === 0) return null

  return (
    <div className={cn("flex flex-wrap items-center gap-1", mine && "flex-row-reverse")}>
      {entries.map(([emoji, users]) => {
        const reacted = meId != null && users.includes(meId)
        return (
          <button
            key={emoji}
            onClick={() => onToggle(emoji)}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
              reacted ? "border-primary bg-primary/10 text-primary" : "bg-card text-foreground hover:bg-muted"
            )}
          >
            {renderReaction(emoji, "size-3.5")}
            <span className="text-[10px] text-muted-foreground">{users.length}</span>
          </button>
        )
      })}
    </div>
  )
}
