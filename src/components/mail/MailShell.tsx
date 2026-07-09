"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Mail,
  PenSquare,
  Inbox,
  Send,
  FileText,
  Trash2,
  Star,
  Reply,
  Archive,
  MailOpen,
  Paperclip,
  RefreshCw,
  Search,
} from "lucide-react"
import { toast } from "sonner"
import DOMPurify from "isomorphic-dompurify"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { Button } from "@/components/ui/button"
import MailCompose from "./MailCompose"
import { Loading } from "@/components/shared/States"
import { cn } from "@/lib/utils"
import type { MailThreadSummary, MailThreadDetail } from "@/lib/google/gmail"

const FOLDERS = [
  { id: "INBOX", label: "받은편지함", icon: Inbox },
  { id: "STARRED", label: "별표", icon: Star },
  { id: "SENT", label: "보낸편지함", icon: Send },
  { id: "DRAFT", label: "임시보관", icon: FileText },
  { id: "TRASH", label: "휴지통", icon: Trash2 },
]

type Compose = {
  open: boolean
  to: string
  cc: string
  subject: string
  body: string
  threadId?: string
  inReplyTo?: string
  references?: string
  sending: boolean
}
const EMPTY_COMPOSE: Compose = { open: false, to: "", cc: "", subject: "", body: "", sending: false }

// 라벨/검색별 스레드 목록 캐시(stale-while-revalidate) — 재방문 시 즉시 표시 후 백그라운드 갱신.
const threadCache = new Map<string, { threads: MailThreadSummary[]; nextPageToken: string | null }>()

function parseName(from: string): string {
  const m = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/)
  if (m) return (m[1].trim() || m[2].trim())
  return from.trim()
}
function parseEmail(from: string): string {
  const m = from.match(/<([^>]+)>/)
  return (m ? m[1] : from).trim()
}
function fmtDate(d: string | null): string {
  if (!d) return ""
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return ""
  const now = new Date()
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
}
function sanitize(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ["style"] })
}

export function MailShell() {
  const supabase = createClient()
  const me = useCurrentUserId()
  const [connected, setConnected] = useState<boolean | null>(null)
  const [googleEmail, setGoogleEmail] = useState<string | null>(null)

  const [activeLabel, setActiveLabel] = useState("INBOX")
  const [queryInput, setQueryInput] = useState("")
  const [appliedQ, setAppliedQ] = useState("")

  const [threads, setThreads] = useState<MailThreadSummary[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [loadingList, setLoadingList] = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<MailThreadDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [compose, setCompose] = useState<Compose>(EMPTY_COMPOSE)

  const checkConnection = useCallback(async () => {
    if (!me) {
      setConnected(false)
      return
    }
    const { data } = await supabase
      .from("google_connections")
      .select("is_active, google_email")
      .eq("user_id", me)
      .maybeSingle()
    setConnected(!!data?.is_active)
    setGoogleEmail(data?.google_email ?? null)
  }, [supabase, me])

  useEffect(() => {
    checkConnection()
  }, [checkConnection])

  // 연결 콜백 결과 토스트
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("google")
    if (!p) return
    if (p === "connected") toast.success("Gmail이 연결되었어요.")
    else if (p === "error") toast.error("Gmail 연결에 실패했어요. 다시 시도해 주세요.")
    else if (p === "not_configured") toast.error("Google 연동이 아직 설정되지 않았어요(관리자).")
    window.history.replaceState({}, "", window.location.pathname)
  }, [])

  const loadThreads = useCallback(
    async (label: string, q: string, pageToken?: string) => {
      const key = `${label}::${q}`
      const cached = pageToken ? undefined : threadCache.get(key)
      if (cached) {
        setThreads(cached.threads) // 캐시 즉시 표시(뒤에서 갱신)
        setNextPageToken(cached.nextPageToken)
        setLoadingList(false)
      } else {
        setLoadingList(true)
      }
      try {
        const params = new URLSearchParams({ label })
        if (q) params.set("q", q)
        if (pageToken) params.set("pageToken", pageToken)
        const res = await fetch(`/api/google/gmail/threads?${params.toString()}`)
        if (res.status === 412) {
          setConnected(false)
          return
        }
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? "목록을 불러오지 못했어요.")
        if (pageToken) {
          setThreads((prev) => [...prev, ...json.threads])
        } else {
          setThreads(json.threads)
          threadCache.set(key, { threads: json.threads, nextPageToken: json.nextPageToken ?? null })
        }
        setNextPageToken(json.nextPageToken ?? null)
      } catch (e) {
        if (!cached) toast.error(e instanceof Error ? e.message : "목록 오류")
      } finally {
        setLoadingList(false)
      }
    },
    []
  )

  // 연결됨 + 라벨/검색 변경 시 목록 로드
  useEffect(() => {
    if (connected) {
      setSelectedId(null)
      setDetail(null)
      loadThreads(activeLabel, appliedQ)
    }
  }, [connected, activeLabel, appliedQ, loadThreads])

  const selectThread = useCallback(async (id: string) => {
    setSelectedId(id)
    setLoadingDetail(true)
    setDetail(null)
    try {
      const res = await fetch(`/api/google/gmail/threads/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "메일을 불러오지 못했어요.")
      setDetail(json)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "상세 오류")
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  const modify = async (
    id: string,
    add: string[],
    remove: string[],
    opts?: { dropFromList?: boolean }
  ) => {
    try {
      const res = await fetch(`/api/google/gmail/threads/${id}/modify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ add, remove }),
      })
      if (!res.ok) throw new Error("변경에 실패했어요.")
      threadCache.clear() // 라벨/읽음/보관/삭제 변경 → 캐시 무효화(다음 방문 시 최신 재조회)
      if (opts?.dropFromList) {
        setThreads((prev) => prev.filter((t) => t.id !== id))
        setSelectedId(null)
        setDetail(null)
      } else {
        await Promise.all([loadThreads(activeLabel, appliedQ), selectThread(id)])
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "변경 오류")
    }
  }

  const openReply = () => {
    if (!detail) return
    const last = detail.messages[detail.messages.length - 1]
    setCompose({
      ...EMPTY_COMPOSE,
      open: true,
      to: parseEmail(last.from),
      subject: detail.subject.startsWith("Re:") ? detail.subject : `Re: ${detail.subject}`,
      threadId: detail.id,
      inReplyTo: last.rfcMessageId ?? undefined,
      references: last.rfcMessageId ?? undefined,
    })
  }

  const disconnect = async () => {
    await fetch("/api/google/disconnect", { method: "POST" })
    setConnected(false)
    setGoogleEmail(null)
    setThreads([])
    setDetail(null)
    setSelectedId(null)
    toast.success("Gmail 연결을 끊었어요.")
  }

  // ---- 미연결 게이트 ----
  if (connected !== true) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-lg font-semibold">메일</h1>
          <p className="text-sm text-muted-foreground">
            각자 본인 Gmail 계정을 연결하면 받은 편지함을 여기서 확인하고 보낼 수 있어요.
          </p>
        </div>
        <div className="grid place-items-center rounded-2xl border border-dashed py-16">
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-muted">
              <Mail className="size-6" />
            </div>
            <p className="text-sm font-semibold">Gmail 연결이 필요합니다</p>
            <p className="text-xs text-muted-foreground">
              {connected === null ? "연결 상태 확인 중…" : "내 Gmail을 연결하면 메일을 우리 화면에서 읽고 보낼 수 있어요."}
            </p>
            <Button
              size="sm"
              disabled={connected === null}
              onClick={() => {
                window.location.href = "/api/google/connect"
              }}
            >
              내 Gmail 연결
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const isStarred = detail?.messages.some((m) => m.labelIds.includes("STARRED")) ?? false
  const isUnread = detail?.messages.some((m) => m.labelIds.includes("UNREAD")) ?? false

  // ---- 연결됨: 3분할 ----
  return (
    <div className="flex h-[calc(100dvh-9rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">메일</h1>
          <p className="text-xs text-muted-foreground">{googleEmail ? `${googleEmail} 연결됨` : "연결됨"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => loadThreads(activeLabel, appliedQ)}>
            <RefreshCw className={cn("size-4", loadingList && "animate-spin")} />
          </Button>
          <Button size="sm" variant="ghost" onClick={disconnect} className="text-muted-foreground">
            연결 끊기
          </Button>
          <Button size="sm" onClick={() => setCompose({ ...EMPTY_COMPOSE, open: true })}>
            <PenSquare /> 메일쓰기
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[160px_minmax(260px,340px)_1fr] gap-3">
        {/* 좌측 폴더 */}
        <div className="flex flex-col gap-1 overflow-y-auto rounded-xl border p-2">
          {FOLDERS.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setActiveLabel(f.id)
                setQueryInput("")
                setAppliedQ("")
              }}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm",
                activeLabel === f.id ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
              )}
            >
              <f.icon className="size-4 shrink-0" /> {f.label}
            </button>
          ))}
        </div>

        {/* 중앙 목록 */}
        <div className="flex min-h-0 flex-col rounded-xl border">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setAppliedQ(queryInput.trim())
            }}
            className="flex items-center gap-1.5 border-b p-2"
          >
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="메일 검색 (Gmail 문법)"
              className="h-7 w-full bg-transparent text-sm outline-none"
            />
          </form>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingList && threads.length === 0 ? (
              <Loading rows={6} />
            ) : threads.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">메일이 없어요.</p>
            ) : (
              <div className="flex flex-col divide-y">
                {threads.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => selectThread(t.id)}
                    className={cn(
                      "flex flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-muted/40",
                      selectedId === t.id && "bg-muted/60",
                      t.unread && "bg-primary/[0.03]"
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={cn("min-w-0 flex-1 truncate text-sm", t.unread && "font-semibold")}>
                        {parseName(t.from) || "(보낸이 없음)"}
                      </span>
                      {t.hasAttachment && <Paperclip className="size-3 shrink-0 text-muted-foreground" />}
                      <span className="shrink-0 text-[10px] text-muted-foreground">{fmtDate(t.date)}</span>
                    </div>
                    <span className={cn("truncate text-xs", t.unread ? "font-medium" : "text-muted-foreground")}>
                      {t.subject}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground/70">{t.snippet}</span>
                  </button>
                ))}
                {nextPageToken && (
                  <button
                    onClick={() => loadThreads(activeLabel, appliedQ, nextPageToken)}
                    disabled={loadingList}
                    className="px-3 py-2 text-center text-xs text-muted-foreground hover:bg-muted/40"
                  >
                    {loadingList ? "불러오는 중…" : "더 보기"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 우측 상세 */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border">
          {!selectedId ? (
            <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
              메일을 선택하세요.
            </div>
          ) : loadingDetail || !detail ? (
            <Loading rows={4} />
          ) : (
            <>
              <div className="flex items-center gap-1 border-b p-2.5">
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{detail.subject}</h2>
                <Button size="icon-sm" variant="ghost" title="답장" onClick={openReply}>
                  <Reply className="size-4" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title={isStarred ? "별표 해제" : "별표"}
                  onClick={() => modify(detail.id, isStarred ? [] : ["STARRED"], isStarred ? ["STARRED"] : [])}
                >
                  <Star className={cn("size-4", isStarred && "fill-warning text-warning")} />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title={isUnread ? "읽음으로" : "안읽음으로"}
                  onClick={() => modify(detail.id, isUnread ? [] : ["UNREAD"], isUnread ? ["UNREAD"] : [])}
                >
                  <MailOpen className="size-4" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title="보관"
                  onClick={() => modify(detail.id, [], ["INBOX"], { dropFromList: activeLabel === "INBOX" })}
                >
                  <Archive className="size-4" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title="휴지통"
                  onClick={() => modify(detail.id, ["TRASH"], [], { dropFromList: true })}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                {detail.messages.map((m) => (
                  <div key={m.id} className="rounded-lg border">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b px-3 py-2 text-xs">
                      <span className="font-medium">{parseName(m.from)}</span>
                      <span className="text-muted-foreground">{parseEmail(m.from)}</span>
                      <span className="ml-auto text-muted-foreground">{fmtDate(m.date)}</span>
                    </div>
                    <div className="px-3 py-2.5">
                      {m.html ? (
                        <div
                          className="prose prose-sm max-w-none text-sm [&_a]:text-primary [&_img]:max-w-full"
                          dangerouslySetInnerHTML={{ __html: sanitize(m.html) }}
                        />
                      ) : (
                        <pre className="whitespace-pre-wrap font-sans text-sm">{m.text || "(내용 없음)"}</pre>
                      )}
                      {m.attachments.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2 border-t pt-2.5">
                          {m.attachments.map((a) => (
                            <a
                              key={a.attachmentId}
                              href={`/api/google/gmail/attachments/${m.id}/${a.attachmentId}?name=${encodeURIComponent(a.filename)}&mime=${encodeURIComponent(a.mimeType)}`}
                              className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted/40"
                            >
                              <Paperclip className="size-3" /> {a.filename}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 작성/답장 모달 */}
      {compose.open && (
        <MailCompose
          initial={{
            to: compose.to,
            cc: compose.cc,
            subject: compose.subject,
            threadId: compose.threadId,
            inReplyTo: compose.inReplyTo,
            references: compose.references,
          }}
          onClose={() => setCompose(EMPTY_COMPOSE)}
          onSent={() => {
            setCompose(EMPTY_COMPOSE)
            threadCache.clear() // 발송 → 보낸편지함/스레드 갱신 위해 캐시 무효화
            if (activeLabel === "SENT") loadThreads(activeLabel, appliedQ)
          }}
        />
      )}
    </div>
  )
}
