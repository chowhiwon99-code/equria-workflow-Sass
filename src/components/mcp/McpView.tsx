"use client"

import { useCallback, useEffect, useState } from "react"
import { Plug, Plus, RefreshCw, Trash2, ChevronDown, Loader2, Wrench } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { Button } from "@/components/ui/button"
import { Modal, fieldClass } from "@/components/shared/Modal"
import { Loading, ErrorState } from "@/components/shared/States"
import { cn } from "@/lib/utils"
import { MCP_CONNECTORS, type Connector } from "@/lib/mcp"

type Server = {
  id: string
  name: string
  type: string
  url: string | null
  is_active: boolean
  auth_type: string
  last_tested_at: string | null
  last_test_ok: boolean | null
  last_test_error: string | null
}
type Tool = { name: string; description: string | null }

/** 베어러 토큰 env 키 미리보기(서버 connect.ts와 동일 규칙). 표시용. */
function envKeyPreview(name: string): string {
  return "MCP_" + name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "") + "_TOKEN"
}

/** 커넥터 로고 — 도메인 파비콘(64px). 실패 시 emoji 폴백. */
function ConnectorLogo({ domain, emoji }: { domain?: string; emoji: string }) {
  const [failed, setFailed] = useState(false)
  if (!domain || failed) return <span className="text-lg">{emoji}</span>
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
      alt=""
      className="size-6"
      onError={() => setFailed(true)}
    />
  )
}

export function McpView() {
  const supabase = createClient()
  const me = useCurrentUserId()
  const [isAdmin, setIsAdmin] = useState(false)
  const [servers, setServers] = useState<Server[]>([])
  const [tools, setTools] = useState<Record<string, Tool[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: "", type: "http", url: "", auth_type: "none" })
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "connected" | "disconnected">("all")

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp/servers")
      if (!res.ok) throw new Error("MCP 서버 목록을 불러오지 못했어요.")
      const j = await res.json()
      setServers(j.servers ?? [])
      setTools(j.tools ?? {})
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "MCP 서버 목록을 불러오지 못했어요.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      if (me) {
        const { data: prof } = await supabase.from("profiles").select("role").eq("id", me).maybeSingle()
        setIsAdmin(prof?.role === "admin")
      }
    })()
    load()
  }, [supabase, load, me])

  const add = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      toast.error("이름과 URL을 입력하세요.")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/mcp/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? "등록에 실패했어요.")
      toast.success("MCP 서버를 등록했어요.")
      setAddOpen(false)
      setForm({ name: "", type: "http", url: "", auth_type: "none" })
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "오류")
    } finally {
      setSaving(false)
    }
  }

  const test = async (id: string) => {
    setTesting(id)
    try {
      const res = await fetch(`/api/mcp/servers/${id}/test`, { method: "POST" })
      const j = await res.json()
      if (j.ok) {
        toast.success(`연결 성공 — 도구 ${j.tools?.length ?? 0}개 발견`)
        setExpanded(id)
      } else {
        toast.error(`연결 실패: ${j.error ?? ""}`)
      }
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "오류")
    } finally {
      setTesting(null)
    }
  }

  const remove = async (id: string) => {
    await fetch(`/api/mcp/servers/${id}`, { method: "DELETE" })
    toast.success("삭제했어요.")
    if (expanded === id) setExpanded(null)
    load()
  }

  const isConnected = (c: Connector) => Boolean(c.preset && servers.some((s) => s.url === c.preset!.url))

  // 프리셋 커넥터 원클릭 연결 = mcp_servers 등록 + 자동 테스트(도구 발견).
  const connectPreset = async (c: Connector) => {
    if (!c.preset || isConnected(c)) return
    setConnectingId(c.id)
    try {
      const res = await fetch("/api/mcp/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: c.name, type: c.preset.type, url: c.preset.url, auth_type: c.preset.auth }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? "연결에 실패했어요.")
      if (j.id) await fetch(`/api/mcp/servers/${j.id}/test`, { method: "POST" }) // 자동 테스트
      toast.success(`${c.name} 연결됨`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "연결 오류")
    } finally {
      setConnectingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">MCP 연결</h1>
          <p className="text-sm text-muted-foreground">
            원격 MCP 서버(Streamable HTTP)를 연결하면 에이전트가 그 도구를 쓸 수 있어요.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={load}>
            <RefreshCw className="size-4" />
          </Button>
          {isAdmin && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus /> 서버 추가
            </Button>
          )}
        </div>
      </div>

      {/* 커넥터 갤러리 — 큐레이션 카탈로그 + 원클릭 연결 */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1 text-sm">
          {([["all", "전체"], ["connected", "연결됨"], ["disconnected", "연결 안됨"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-lg px-2.5 py-1 font-medium transition-colors",
                filter === key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MCP_CONNECTORS.filter((c) =>
            filter === "all" ? true : filter === "connected" ? isConnected(c) : !isConnected(c)
          ).map((c) => {
            const connected = isConnected(c)
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border p-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted/40">
                  <ConnectorLogo domain={c.domain} emoji={c.emoji} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{c.name}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{c.description}</span>
                </div>
                {connected ? (
                  <span className="shrink-0 text-[11px] font-medium text-success">연결됨 ✓</span>
                ) : c.status === "coming_soon" ? (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">준비 중</span>
                ) : isAdmin ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => connectPreset(c)}
                    disabled={connectingId === c.id}
                  >
                    {connectingId === c.id ? <Loader2 className="size-3.5 animate-spin" /> : "연결"}
                  </Button>
                ) : (
                  <span className="shrink-0 text-[11px] text-muted-foreground">관리자 연결</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 연결된 서버 상세 — 도구 목록·테스트·삭제 */}
      {loading ? (
        <Loading rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => { setError(null); load() }} />
      ) : servers.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">연결된 서버 · 도구</h2>
          <div className="flex flex-col divide-y rounded-xl border">
          {servers.map((s) => {
            const t = tools[s.id] ?? []
            const open = expanded === s.id
            return (
              <div key={s.id} className="flex flex-col">
                <div className="flex items-center gap-3 px-4 py-3">
                  <Plug className="size-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{s.name}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {s.type}
                      </span>
                      {s.last_test_ok === true ? (
                        <span className="text-[11px] text-success">● 연결됨</span>
                      ) : s.last_test_ok === false ? (
                        <span className="text-[11px] text-destructive" title={s.last_test_error ?? ""}>
                          ● 실패
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">○ 미테스트</span>
                      )}
                    </div>
                    <span className="truncate text-[11px] text-muted-foreground/70">{s.url}</span>
                  </div>

                  {t.length > 0 && (
                    <button
                      onClick={() => setExpanded(open ? null : s.id)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Wrench className="size-3.5" /> {t.length}
                      <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
                    </button>
                  )}

                  {isAdmin && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => test(s.id)} disabled={testing === s.id}>
                        {testing === s.id ? <Loader2 className="size-3.5 animate-spin" /> : "테스트"}
                      </Button>
                      <button
                        onClick={() => remove(s.id)}
                        className="text-muted-foreground hover:text-destructive"
                        title="삭제"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </>
                  )}
                </div>

                {open && t.length > 0 && (
                  <div className="flex flex-col gap-1 border-t bg-muted/20 px-4 py-2">
                    {t.map((tool) => (
                      <div key={tool.name} className="flex flex-col">
                        <span className="text-xs font-medium">{tool.name}</span>
                        {tool.description && (
                          <span className="text-[11px] text-muted-foreground">{tool.description}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {s.last_test_ok === false && s.last_test_error && (
                  <p className="border-t bg-destructive/5 px-4 py-1.5 text-[11px] text-destructive">
                    {s.last_test_error}
                  </p>
                )}
              </div>
            )
          })}
          </div>
        </div>
      ) : null}

      {/* 서버 추가 모달 (관리자) */}
      {addOpen && (
        <Modal title="MCP 서버 추가" onClose={() => setAddOpen(false)}>
          <div className="flex flex-col gap-2.5">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              이름
              <input
                className={fieldClass}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="예: Notion MCP"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              전송 방식
              <select
                className={fieldClass}
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="http">Streamable HTTP (권장)</option>
                <option value="sse">SSE (레거시)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              서버 URL (https)
              <input
                className={fieldClass}
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://example.com/mcp"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              인증
              <select
                className={fieldClass}
                value={form.auth_type}
                onChange={(e) => setForm((f) => ({ ...f, auth_type: e.target.value }))}
              >
                <option value="none">없음 (공개)</option>
                <option value="bearer">Bearer 토큰</option>
              </select>
            </label>
            {form.auth_type === "bearer" && (
              <p className="rounded-md bg-muted/40 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
                토큰은 보안을 위해 DB가 아니라 환경변수에 저장합니다. 아래 키로 Vercel/.env에 넣어주세요:
                <br />
                <code className="text-[10px] text-foreground">{envKeyPreview(form.name || "서버이름")}</code>
              </p>
            )}
            <div className="mt-1 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAddOpen(false)}>
                취소
              </Button>
              <Button size="sm" onClick={add} disabled={saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Plus />}
                추가
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
