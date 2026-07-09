"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Plug, Plus, RefreshCw, Trash2, ChevronDown, Loader2, Wrench, Search, ExternalLink, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { Button } from "@/components/ui/button"
import { Modal, fieldClass } from "@/components/shared/Modal"
import { Loading, ErrorState } from "@/components/shared/States"
import { cn } from "@/lib/utils"
import { Select } from "@/components/shared/Select"
import { MCP_CONNECTORS, CONNECTOR_CATEGORIES, MCP_TOOL_KO, type Connector } from "@/lib/mcp"

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
// 내(직원) 개인 연결 — 회사 공용 Server와 별개(RLS로 본인 것만 옴).
type UserConnection = {
  id: string
  connector_id: string
  last_tested_at: string | null
  last_test_ok: boolean | null
  last_test_error: string | null
  tools: Tool[]
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
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isAdmin, setIsAdmin] = useState(false)
  const [servers, setServers] = useState<Server[]>([])
  const [tools, setTools] = useState<Record<string, Tool[]>>({})
  const [userConnections, setUserConnections] = useState<UserConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [userTesting, setUserTesting] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [expandedConn, setExpandedConn] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: "", type: "http", url: "", auth_type: "none", token: "" })
  const [connectingId, setConnectingId] = useState<string | null>(null)
  // 커넥터 카드 "연결"(bearer) 전용 간편 모달 — 이름/URL/전송방식 숨기고 토큰 입력만
  const [tokenModal, setTokenModal] = useState<Connector | null>(null)
  const [tokenInput, setTokenInput] = useState("")
  const [tokenSaving, setTokenSaving] = useState(false)
  const [q, setQ] = useState("")
  const [category, setCategory] = useState("")
  const [sort, setSort] = useState<"featured" | "name">("featured")

  const load = useCallback(async () => {
    try {
      const [srvRes, connRes] = await Promise.all([
        fetch("/api/mcp/servers"),
        fetch("/api/mcp/user-connections"),
      ])
      if (!srvRes.ok) throw new Error("MCP 서버 목록을 불러오지 못했어요.")
      const srvJson = await srvRes.json()
      setServers(srvJson.servers ?? [])
      setTools(srvJson.tools ?? {})
      if (connRes.ok) {
        const connJson = await connRes.json()
        setUserConnections(connJson.connections ?? [])
      }
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 목록 로드
    load()
  }, [supabase, load, me])

  // OAuth 콜백 복귀(/mcp?oauth=connected&connector=...) — 안내 후 쿼리 정리.
  useEffect(() => {
    const oauth = searchParams.get("oauth")
    if (!oauth) return
    if (oauth === "connected") {
      const connectorId = searchParams.get("connector")
      const name = MCP_CONNECTORS.find((c) => c.id === connectorId)?.name ?? "커넥터"
      toast.success(`${name} 연결됨`)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- OAuth 콜백 리다이렉트 복귀(외부 상태 변화) 직후 1회 새로고침
      load()
    } else if (oauth === "error") {
      toast.error("연결에 실패했어요. 다시 시도해주세요.")
    }
    router.replace("/mcp")
  }, [searchParams, load, router])

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
      // 등록 직후 자동 테스트 — 토큰/URL이 맞는지 바로 확인(연결 성공·도구 개수 또는 실패 사유)
      if (j.id) {
        const t = await fetch(`/api/mcp/servers/${j.id}/test`, { method: "POST" }).then((r) => r.json()).catch(() => null)
        if (t?.ok) toast.success(`등록·연결됨 — 도구 ${t.tools?.length ?? 0}개`)
        else toast.error(`등록됐지만 연결 실패: ${t?.error ?? "테스트에서 확인하세요"}`)
      } else {
        toast.success("MCP 서버를 등록했어요.")
      }
      setAddOpen(false)
      setForm({ name: "", type: "http", url: "", auth_type: "none", token: "" })
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

  // 개인 연결 재테스트/해제 — 본인 것만(RLS), 관리자 게이트 없음.
  const testUserConn = async (connectorId: string) => {
    setUserTesting(connectorId)
    try {
      const res = await fetch(`/api/mcp/user-connections/${connectorId}/test`, { method: "POST" })
      const j = await res.json()
      if (j.ok) {
        toast.success(`연결 성공 — 도구 ${j.tools?.length ?? 0}개 발견`)
        setExpandedConn(connectorId)
      } else {
        toast.error(`연결 실패: ${j.error ?? ""}`)
      }
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "오류")
    } finally {
      setUserTesting(null)
    }
  }
  const removeUserConn = async (connectorId: string) => {
    await fetch(`/api/mcp/user-connections/${connectorId}`, { method: "DELETE" })
    toast.success("연결을 해제했어요.")
    if (expandedConn === connectorId) setExpandedConn(null)
    load()
  }

  const isConnected = (c: Connector) =>
    c.scope === "user"
      ? userConnections.some((uc) => uc.connector_id === c.id)
      : Boolean(c.preset && servers.some((s) => s.url === c.preset!.url))

  // 프리셋 커넥터 연결. user 범위 bearer = 전용 간편 모달(내 토큰), workspace 범위 none = 원클릭 등록+자동 테스트.
  const connectPreset = async (c: Connector) => {
    if (!c.preset || isConnected(c)) return
    if (c.preset.auth === "oauth") {
      // 실제 브라우저 리다이렉트(인가 서버 동의화면)이라 fetch가 아니라 페이지 이동.
      window.location.href = `/api/mcp/oauth/${c.id}/connect`
      return
    }
    if (c.preset.auth === "bearer") {
      setTokenInput("")
      setTokenModal(c)
      return
    }
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

  // 간편 모달 제출 — 토큰만 받아 등록+자동 테스트. scope=user는 개인 연결 API, workspace는 회사 공용 API.
  const submitTokenConnect = async () => {
    if (!tokenModal?.preset || !tokenInput.trim()) {
      toast.error("토큰을 입력하세요.")
      return
    }
    setTokenSaving(true)
    try {
      if (tokenModal.scope === "user") {
        const res = await fetch("/api/mcp/user-connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connector_id: tokenModal.id, token: tokenInput.trim() }),
        })
        const j = await res.json()
        if (!res.ok) throw new Error(j.error ?? "등록에 실패했어요.")
        if (j.ok) toast.success(`${tokenModal.name} 연결됨 — 도구 ${j.tools?.length ?? 0}개`)
        else toast.error(`등록됐지만 연결 실패: ${j.error ?? "토큰을 확인해주세요"}`)
      } else {
        const res = await fetch("/api/mcp/servers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: tokenModal.name,
            type: tokenModal.preset.type,
            url: tokenModal.preset.url,
            auth_type: "bearer",
            token: tokenInput.trim(),
          }),
        })
        const j = await res.json()
        if (!res.ok) throw new Error(j.error ?? "등록에 실패했어요.")
        const t = j.id
          ? await fetch(`/api/mcp/servers/${j.id}/test`, { method: "POST" }).then((r) => r.json()).catch(() => null)
          : null
        if (t?.ok) toast.success(`${tokenModal.name} 연결됨 — 도구 ${t.tools?.length ?? 0}개`)
        else toast.error(`등록됐지만 연결 실패: ${t?.error ?? "토큰을 확인해주세요"}`)
      }
      setTokenModal(null)
      setTokenInput("")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "오류")
    } finally {
      setTokenSaving(false)
    }
  }

  // 검색·카테고리 필터 + 정렬(추천순=featured 먼저 / 이름순).
  const visibleConnectors = MCP_CONNECTORS.filter((c) => {
    if (category && c.category !== category) return false
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      if (!c.name.toLowerCase().includes(s) && !c.description.toLowerCase().includes(s)) return false
    }
    return true
  }).sort((a, b) =>
    sort === "name"
      ? a.name.localeCompare(b.name)
      : (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || a.name.localeCompare(b.name)
  )

  const renderCard = (c: Connector) => {
    const connected = isConnected(c)
    return (
      <div key={c.id} className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted/40">
            <ConnectorLogo domain={c.domain} emoji={c.emoji} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold">{c.name}</span>
            <span className="text-[10px] text-muted-foreground">{c.category}</span>
          </div>
          {connected ? (
            <span className="shrink-0 text-[11px] font-medium text-success">연결됨 ✓</span>
          ) : c.status === "coming_soon" ? (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">준비 중</span>
          ) : c.scope === "user" || isAdmin ? (
            /* 개인 연결(scope=user)은 누구나 — 회사 공용은 관리자만. 연결은 폰에서 숨김(보기 전용, 대표 확정) */
            <Button
              size="sm"
              variant="outline"
              className="hidden shrink-0 md:inline-flex"
              onClick={() => connectPreset(c)}
              disabled={connectingId === c.id}
            >
              {connectingId === c.id ? <Loader2 className="size-3.5 animate-spin" /> : "연결"}
            </Button>
          ) : (
            <span className="shrink-0 text-[11px] text-muted-foreground">관리자 연결</span>
          )}
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
        {c.scope === "user" && !connected && c.status === "available" && (
          <span className="text-[10px] text-muted-foreground/70">🔒 내 계정으로 연결 — 나만 보고 관리해요</span>
        )}
      </div>
    )
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
            <Button
              size="sm"
              onClick={() => {
                // 빈 폼으로 초기화(bearer 프리셋 프리필 잔류 방지)
                setForm({ name: "", type: "http", url: "", auth_type: "none", token: "" })
                setAddOpen(true)
              }}
              className="hidden md:inline-flex"
            >
              <Plus /> 서버 추가
            </Button>
          )}
        </div>
      </div>

      {/* 사용법 — 커넥터는 연결만으로 끝이 아니라 "에이전트에 붙여야" 실제로 쓰인다 */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">사용법</span>
        <span>① 커넥터 연결</span>
        <span aria-hidden>→</span>
        <span>
          ② 회사 공용 서버는 <b className="text-foreground">에이전트 만들기</b>로 붙이기 · 내 개인 연결은 자동 사용
        </span>
        <span aria-hidden>→</span>
        <span>③ 채팅하면 도구를 자동으로 써요</span>
      </div>
      {/* 개인 vs 공용 구분 — GitHub 등은 회사 대표 토큰 공유가 아니라 "각자 자기 계정으로" (요청 반영) */}
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1 rounded-xl border border-dashed px-3.5 py-2.5 text-xs text-muted-foreground">
        <span aria-hidden>🔒</span>
        <span>
          <b className="text-foreground">GitHub·Supabase·Stripe 같은 개인 계정 성격의 커넥터는 직원 각자 자기 토큰으로 연결</b>해요.
          회사 전체가 토큰 하나를 공유하지 않아 — 누가 뭘 했는지 구분되고, 본인만 조회·해제할 수 있고, 나중에 개별 회수도 쉬워요.
          Context7·DeepWiki처럼 무인증·읽기전용 커넥터만 회사 전체가 공용으로 씁니다.
        </span>
      </div>

      {/* 커넥터 디렉터리 — 검색·필터·정렬·추천·전체 그리드 */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="커넥터 검색…"
              className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <Select
            value={category}
            onChange={setCategory}
            align="end"
            options={[{ value: "", label: "카테고리: 전체" }, ...CONNECTOR_CATEGORIES.map((c) => ({ value: c, label: c }))]}
          />
          <Select
            value={sort}
            onChange={(v) => setSort(v as "featured" | "name")}
            align="end"
            options={[
              { value: "featured", label: "추천순" },
              { value: "name", label: "이름순" },
            ]}
          />
        </div>

        {/* 추천 — 검색·필터 없을 때만 */}
        {!q.trim() && !category && (
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold text-muted-foreground">추천</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {MCP_CONNECTORS.filter((c) => c.featured).map(renderCard)}
            </div>
          </div>
        )}

        {/* 전체 커넥터 */}
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold text-muted-foreground">{q.trim() || category ? "검색 결과" : "전체 커넥터"}</h2>
          {visibleConnectors.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">검색 결과가 없어요.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleConnectors.map(renderCard)}</div>
          )}
        </div>
      </div>

      {/* 연결된 서버 상세 — 도구 목록·테스트·삭제 */}
      {loading ? (
        <Loading rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => { setError(null); load() }} />
      ) : servers.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">회사 전체 연결 · 도구</h2>
          <div className="flex flex-col divide-y rounded-xl border">
          {servers.map((s) => {
            const t = tools[s.id] ?? []
            const open = expanded === s.id
            return (
              <div key={s.id} className="flex flex-col">
                {/* 모바일: 정보 줄(basis-full)과 버튼 줄로 자동 줄바꿈 · sm+: 기존 한 줄 */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <Plug className="size-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 basis-full flex-col sm:basis-0">
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

                  {/* 이 커넥터가 미리 연결된 에이전트 만들기 (전 직원) */}
                  <Link
                    href={`/agents/new?mcp=${s.id}`}
                    className="shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    에이전트 만들기
                  </Link>

                  {isAdmin && (
                    <>
                      {/* 관리 액션(테스트·삭제)은 폰에서 숨김 — 보기 전용 */}
                      <Button size="sm" variant="outline" onClick={() => test(s.id)} disabled={testing === s.id} className="hidden md:inline-flex">
                        {testing === s.id ? <Loader2 className="size-3.5 animate-spin" /> : "테스트"}
                      </Button>
                      <button
                        onClick={() => remove(s.id)}
                        className="hidden text-muted-foreground hover:text-destructive md:block"
                        title="삭제"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </>
                  )}
                </div>

                {open && t.length > 0 && (
                  <div className="flex flex-col gap-1.5 border-t bg-muted/20 px-4 py-2.5">
                    {t.map((tool) => (
                      // 알려진 도구는 한국어 설명(원문은 호버 title), 모르는 도구는 서버 원문 그대로.
                      <div key={tool.name} className="flex flex-col gap-0.5 rounded-lg border bg-card px-2.5 py-1.5">
                        <span className="font-mono text-xs font-medium">{tool.name}</span>
                        <span className="text-[11px] text-muted-foreground" title={tool.description ?? undefined}>
                          {MCP_TOOL_KO[tool.name] ?? tool.description ?? "설명 없음"}
                        </span>
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

      {/* 내 개인 연결 — 관리자 게이트 없음(본인 것만 RLS), 폰에선 관리 액션 숨김(보기 전용, 위와 동일 정책) */}
      {!loading && userConnections.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">내 연결</h2>
          <div className="flex flex-col divide-y rounded-xl border">
            {userConnections.map((uc) => {
              const connector = MCP_CONNECTORS.find((c) => c.id === uc.connector_id)
              const open = expandedConn === uc.connector_id
              return (
                <div key={uc.id} className="flex flex-col">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                    <span className="grid size-6 shrink-0 place-items-center">
                      {connector ? (
                        <ConnectorLogo domain={connector.domain} emoji={connector.emoji} />
                      ) : (
                        <Plug className="size-4 text-muted-foreground" />
                      )}
                    </span>
                    <div className="flex min-w-0 flex-1 basis-full flex-col sm:basis-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{connector?.name ?? uc.connector_id}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">내 계정</span>
                        {uc.last_test_ok === true ? (
                          <span className="text-[11px] text-success">● 연결됨</span>
                        ) : uc.last_test_ok === false ? (
                          <span className="text-[11px] text-destructive" title={uc.last_test_error ?? ""}>
                            ● 실패
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">○ 미테스트</span>
                        )}
                      </div>
                    </div>

                    {uc.tools.length > 0 && (
                      <button
                        onClick={() => setExpandedConn(open ? null : uc.connector_id)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Wrench className="size-3.5" /> {uc.tools.length}
                        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
                      </button>
                    )}

                    {/* 관리 액션(테스트·해제)은 폰에서 숨김 — 보기 전용(위 회사 연결과 동일 정책) */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => testUserConn(uc.connector_id)}
                      disabled={userTesting === uc.connector_id}
                      className="hidden md:inline-flex"
                    >
                      {userTesting === uc.connector_id ? <Loader2 className="size-3.5 animate-spin" /> : "테스트"}
                    </Button>
                    <button
                      onClick={() => removeUserConn(uc.connector_id)}
                      className="hidden text-muted-foreground hover:text-destructive md:block"
                      title="연결 해제"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>

                  {open && uc.tools.length > 0 && (
                    <div className="flex flex-col gap-1.5 border-t bg-muted/20 px-4 py-2.5">
                      {uc.tools.map((tool) => (
                        <div key={tool.name} className="flex flex-col gap-0.5 rounded-lg border bg-card px-2.5 py-1.5">
                          <span className="font-mono text-xs font-medium">{tool.name}</span>
                          <span className="text-[11px] text-muted-foreground" title={tool.description ?? undefined}>
                            {MCP_TOOL_KO[tool.name] ?? tool.description ?? "설명 없음"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {uc.last_test_ok === false && uc.last_test_error && (
                    <p className="border-t bg-destructive/5 px-4 py-1.5 text-[11px] text-destructive">{uc.last_test_error}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 커넥터 연결 간편 모달(bearer) — 이름·URL·전송방식은 숨기고 토큰 입력만 노출 */}
      {tokenModal?.preset && (
        <Modal title={`${tokenModal.name} 연결`} onClose={() => setTokenModal(null)}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5 rounded-lg bg-muted/40 p-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-card">
                <ConnectorLogo domain={tokenModal.domain} emoji={tokenModal.emoji} />
              </span>
              <p className="text-xs text-muted-foreground">
                {tokenModal.name}에서 발급받은 토큰을 붙여넣으면 바로 연결돼요.
              </p>
            </div>

            {tokenModal.preset.tokenHelpUrl && (
              <a
                href={tokenModal.preset.tokenHelpUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline"
              >
                토큰 발급받으러 가기 <ExternalLink className="size-3" />
              </a>
            )}

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              토큰
              <input
                autoFocus
                type="password"
                className={fieldClass}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !tokenSaving) submitTokenConnect()
                }}
                placeholder="여기에 토큰을 붙여넣으세요"
                autoComplete="off"
              />
            </label>

            <div className="flex items-start gap-1.5 rounded-lg bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              <span>
                암호화해 저장하고 화면엔 다시 표시하지 않아요. 가능하면 <b className="text-foreground">읽기 전용(최소 권한)</b> 토큰을
                발급해서 넣어주세요.
              </span>
            </div>

            <div className="mt-1 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setTokenModal(null)}>
                취소
              </Button>
              <Button size="sm" onClick={submitTokenConnect} disabled={tokenSaving}>
                {tokenSaving ? <Loader2 className="animate-spin" /> : <Plug />}
                연결
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 서버 추가 모달 (관리자, 고급: 직접 URL·인증 지정) */}
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
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Bearer 토큰
                <input
                  type="password"
                  className={fieldClass}
                  value={form.token}
                  onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
                  placeholder="토큰 붙여넣기"
                  autoComplete="off"
                />
                <span className="text-[10px] text-muted-foreground/70">
                  DB에 AES-256 암호화 저장돼요(평문 X). 저장 후엔 다시 표시되지 않아요.
                </span>
              </label>
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
