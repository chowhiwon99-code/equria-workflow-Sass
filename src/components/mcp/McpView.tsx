"use client"

import { useCallback, useEffect, useState } from "react"
import { Plug, Plus, RefreshCw, Trash2, ChevronDown, Loader2, Wrench } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Modal, fieldClass } from "@/components/shared/Modal"
import { Loading, EmptyState, ErrorState } from "@/components/shared/States"
import { cn } from "@/lib/utils"

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

export function McpView() {
  const supabase = createClient()
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
      const { data: auth } = await supabase.auth.getUser()
      if (auth.user) {
        const { data: prof } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle()
        setIsAdmin(prof?.role === "admin")
      }
    })()
    load()
  }, [supabase, load])

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

      {loading ? (
        <Loading rows={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => { setError(null); load() }} />
      ) : servers.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="연결된 MCP 서버가 없어요"
          description={isAdmin ? "‘서버 추가’로 원격 MCP(HTTP) 서버를 등록하세요." : "관리자가 서버를 등록하면 여기에 표시돼요."}
        />
      ) : (
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
      )}

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
