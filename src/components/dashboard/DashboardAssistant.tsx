"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { ArrowUp, Sparkles, Loader2, Plus, Paperclip, Globe, Plug, X, SquarePen, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

type Convo = { id: string; title: string | null; updated_at: string }

function messageText(m: UIMessage): string {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")
}

/** 대시보드 메인 — 좌측 대화 사이드바 + 우측 범용 Claude 채팅(대화 영속화). */
export function DashboardAssistant() {
  const conversationIdRef = useRef<string | null>(null)
  const [conversationId, setConvId] = useState<string | null>(null)
  const setConversation = useCallback((id: string | null) => {
    conversationIdRef.current = id
    setConvId(id)
  }, [])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/assistant",
        body: () => ({ conversationId: conversationIdRef.current }),
        fetch: async (url, options) => {
          const res = await fetch(url, options)
          const cid = res.headers.get("X-Conversation-Id")
          if (cid) setConversation(cid)
          return res
        },
      }),
    [setConversation]
  )
  const { messages, sendMessage, status, error, setMessages } = useChat({ transport })

  const [input, setInput] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [convos, setConvos] = useState<Convo[]>([])
  // 대화 사이드바 폭 — 경계 드래그로 조절(세션41), 기기별 기억
  const [sidebarW, setSidebarW] = useState(240)
  const [sidebarResizing, setSidebarResizing] = useState(false)
  useEffect(() => {
    const saved = Number(localStorage.getItem("equria:assistant-sidebar-w"))
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 저장 폭 복원(SSR 240과 하이드레이션 정합)
    if (saved >= 160 && saved <= 420) setSidebarW(saved)
  }, [])
  const SIDEBAR_MIN = 160
  const SIDEBAR_MAX = 420
  const clampSidebar = (n: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, n))
  // 경계 밖으로 끌면 고무줄처럼 저항만 주고(초과분의 1/4만 반영), 손을 떼면 clampSidebar 값으로 튕겨 돌아온다 —
  // 드래그를 반대로 되돌릴 때 "끼인" 것처럼 안 움직이던 느낌 방지(대표 지적).
  const elasticSidebar = (n: number) => {
    if (n < SIDEBAR_MIN) return SIDEBAR_MIN - (SIDEBAR_MIN - n) * 0.25
    if (n > SIDEBAR_MAX) return SIDEBAR_MAX + (n - SIDEBAR_MAX) * 0.25
    return n
  }
  const startSidebarResize = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = sidebarW
    setSidebarResizing(true)
    const onMove = (ev: PointerEvent) => setSidebarW(elasticSidebar(startW + (ev.clientX - startX)))
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      const clamped = clampSidebar(startW + (ev.clientX - startX))
      setSidebarResizing(false) // 다음 렌더의 transition을 켜서 아래 setSidebarW가 스냅백 애니메이션을 타게 한다
      setSidebarW(clamped)
      localStorage.setItem("equria:assistant-sidebar-w", String(clamped))
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp) // 리뷰 F5: cancel 시 리스너 정리(리사이즈는 값 커밋 무해)
  }
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const hasChat = messages.length > 0

  const loadConvos = useCallback(async () => {
    const res = await fetch("/api/assistant/conversations")
    if (res.ok) setConvos((await res.json()).conversations ?? [])
  }, [])

  useEffect(() => {
    loadConvos()
  }, [loadConvos])

  // 진입·대화 전환 시엔 즉시(auto) 하단으로 점프(긴 히스토리를 smooth로 훑지 않게). 스트리밍 중 추가 메시지는 smooth.
  const jumpToBottom = useRef(true)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const behavior: ScrollBehavior = jumpToBottom.current ? "auto" : "smooth"
    jumpToBottom.current = false
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [messages, status])

  // 턴 완료 시 목록 갱신(새 대화방·제목 반영)
  useEffect(() => {
    if (status === "ready" && messages.length > 0) void loadConvos()
  }, [status, messages.length, loadConvos])

  const submit = () => {
    const t = input.trim()
    if ((!t && files.length === 0) || status !== "ready") return
    sendMessage({ text: t, files: files.length > 0 ? toFileList(files) : undefined })
    setInput("")
    setFiles([])
    if (fileRef.current) fileRef.current.value = ""
  }

  const newChat = () => {
    setConversation(null)
    setMessages([])
    setInput("")
    setFiles([])
  }

  const openConvo = async (id: string) => {
    setConversation(id)
    const res = await fetch(`/api/assistant/conversations/${id}`)
    if (!res.ok) return
    const j = (await res.json()) as { messages: { id: string; role: string; content: string }[] }
    jumpToBottom.current = true // 대화 전환 = 즉시 하단으로
    setMessages(
      j.messages.map((m) => ({
        id: m.id,
        role: m.role === "user" ? "user" : "assistant",
        parts: [{ type: "text", text: m.content }],
      }))
    )
  }

  const deleteConvo = async (id: string) => {
    await fetch(`/api/assistant/conversations/${id}`, { method: "DELETE" })
    if (conversationIdRef.current === id) newChat()
    loadConvos()
  }

  return (
    <div className="flex h-full">
      {/* 좌측: 대화 사이드바 — 폭 드래그 조절(세션41 대표 요청·기기별 기억) */}
      <aside
        className="hidden shrink-0 flex-col border-r bg-muted/20 md:flex"
        style={{
          width: sidebarW,
          transition: sidebarResizing ? "none" : "width 220ms cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        <div className="p-2">
          <button
            onClick={newChat}
            className="flex h-8 w-full items-center gap-1.5 rounded-lg border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <SquarePen className="size-3.5" /> 새 대화
          </button>
        </div>
        <p className="px-3 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
          Recents
        </p>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2 [scrollbar-width:thin]">
          {convos.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">아직 대화가 없어요.</p>
          ) : (
            convos.map((c) => {
              const active = c.id === conversationId
              return (
                <div
                  key={c.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-lg px-2 py-1.5",
                    active ? "bg-muted" : "hover:bg-muted/60"
                  )}
                >
                  <button
                    onClick={() => openConvo(c.id)}
                    className="min-w-0 flex-1 truncate text-left text-sm"
                    title={c.title ?? "새 대화"}
                  >
                    {c.title || "새 대화"}
                  </button>
                  <button
                    onClick={() => deleteConvo(c.id)}
                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    aria-label="삭제"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </aside>
      {/* 사이드바↔채팅 경계 — 커서 대면 폭 조절(보이는 핸들 없음) */}
      <div onPointerDown={startSidebarResize} className="-mx-1 hidden w-2 shrink-0 cursor-ew-resize touch-none md:block" title="드래그해서 사이드바 폭 조절" />

      {/* 우측: 채팅 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 모바일 새 대화(사이드바 숨김 시) */}
        <div className="flex items-center justify-end border-b px-3 py-1.5 md:hidden">
          <button onClick={newChat} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <SquarePen className="size-3.5" /> 새 대화
          </button>
        </div>

        {!hasChat ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="grid size-9 place-items-center rounded-xl bg-primary/8 text-primary shadow-[var(--shadow-sm)]">
              <Sparkles className="size-4" />
            </div>
            <p className="mt-2.5 break-keep text-sm font-semibold tracking-tight">안녕하세요, 컴피예요</p>
            <p className="mt-1 max-w-60 break-keep text-xs leading-relaxed text-muted-foreground">
              워크스페이스를 다 아는 개인 비서예요. 물어보거나, 초안 작성을 시켜보세요.
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {/* 🔴 예시는 반드시 **생성형**이어야 한다.
                  예전엔 조회형 3개("연차 몇 개 남았어?"·"진행 중인 프로젝트"·"오늘 일정")였는데,
                  컴피의 툴은 전부 조회(agentTools.ts: 구성원·프로젝트·일정·오늘할일)라서
                  **가입 첫날처럼 데이터가 0건이면 "없어요"만 답한다** = 첫 AI 경험이 실패한다.
                  생성형은 데이터가 없어도 결과물이 나오므로 첫날에도 가치가 남는다.
                  (조회 기능 자체는 그대로다 — 사용자가 직접 물으면 툴이 돈다.) */}
              {[
                "우리 팀 첫 공지 초안 써줘",
                "이번 주 업무 계획을 표로 정리해줘",
                "거래처에 보낼 정중한 미팅 요청 메일 써줘",
              ].map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setInput(ex)}
                  className="rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 [scrollbar-gutter:stable] [scrollbar-width:thin]">
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground shadow-sm">
                      {messageText(m)}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex items-start gap-2.5">
                    <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <Sparkles className="size-3.5" />
                    </div>
                    <div className="max-w-[82%] whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5 text-sm leading-relaxed">
                      {messageText(m) || <span className="text-muted-foreground">생각 중…</span>}
                    </div>
                  </div>
                )
              )}
              {error && <p className="pl-9 text-xs text-destructive">오류: {error.message}</p>}
            </div>
          </div>
        )}

        {/* 입력 영역 */}
        <div className="px-4 pb-4 pt-2">
          <div className="mx-auto max-w-3xl">
            {files.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <span key={`${f.name}-${i}`} className="flex items-center gap-1.5 rounded-lg border bg-card px-2 py-1 text-xs">
                    <Paperclip className="size-3 text-muted-foreground" />
                    <span className="max-w-[160px] truncate">{f.name}</span>
                    <button
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="첨부 제거"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* 컴포저 — 좁은 대시보드 컬럼에 맞춘 컴팩트 사이즈(세션41 대표 피드백) */}
            <div className="flex items-center gap-1.5 rounded-xl border bg-card px-2 py-1.5 shadow-md shadow-primary/5 transition-all focus-within:border-ring focus-within:shadow-primary/10 focus-within:ring-2 focus-within:ring-ring/15">
              <div className="relative shrink-0">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-label="추가"
                  className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Plus className="size-4" />
                </button>
                {menuOpen && (
                  <>
                    <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setMenuOpen(false)} />
                    <div className="absolute bottom-full left-0 z-20 mb-2 w-56 overflow-hidden rounded-xl border bg-popover p-1 shadow-lg">
                      <MenuItem
                        icon={<Paperclip className="size-4" />}
                        label="파일·사진 첨부"
                        onClick={() => {
                          setMenuOpen(false)
                          fileRef.current?.click()
                        }}
                      />
                      <div className="my-1 h-px bg-border" />
                      <MenuItem icon={<Globe className="size-4" />} label="웹 검색" soon />
                      <MenuItem icon={<Plug className="size-4" />} label="MCP 도구" soon />
                    </div>
                  </>
                )}
              </div>

              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,application/pdf,.txt,.md,.csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) setFiles((prev) => [...prev, ...Array.from(e.target.files!)])
                }}
              />

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // 한글 등 IME 조합 중 Enter는 무시(마지막 글자 잔류 버그 방지)
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    submit()
                  }
                }}
                placeholder="컴피에게 물어보세요…"
                rows={1}
                className="max-h-40 flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
              />

              <button
                onClick={submit}
                disabled={status !== "ready" || (!input.trim() && files.length === 0)}
                aria-label="전송"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
              >
                {status === "streaming" ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  soon,
}: {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  soon?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={soon}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1">{label}</span>
      {soon && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">곧</span>}
    </button>
  )
}

/** File[] → FileList (useChat sendMessage files 인자용). */
function toFileList(files: File[]): FileList {
  const dt = new DataTransfer()
  for (const f of files) dt.items.add(f)
  return dt.files
}
