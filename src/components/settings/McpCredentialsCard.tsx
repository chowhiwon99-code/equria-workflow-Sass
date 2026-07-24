"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { ExternalLink, Copy, Check, Loader2, Trash2, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fieldClass } from "@/components/shared/Modal"

type Group = {
  key: string
  label: string
  help: string
  setupUrl: string
  connectorNames: string[]
  redirectUris: string[]
  configured: boolean
  clientId?: string | null
  hasSecret?: boolean
}
type Input = { clientId: string; secret: string }

/**
 * 오너 전용 — MCP 앱 크리덴셜(구글·Slack·PayPal) 등록 화면.
 * 이 서비스들의 원격 MCP는 DCR 미지원 → 대표가 개발자 콘솔에 OAuth 앱을 등록해 받은 client_id/secret을 넣어야
 * 직원들이 각자 자기 계정으로 연결할 수 있다. 여기서 넣은 값은 mcp_oauth_clients에 is_static=true로 저장된다.
 */
export function McpCredentialsCard() {
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [inputs, setInputs] = useState<Record<string, Input>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp/oauth-clients")
      if (!res.ok) return
      const j = (await res.json()) as { groups?: Group[] }
      const gs = j.groups ?? []
      setGroups(gs)
      setInputs((prev) =>
        Object.fromEntries(gs.map((g) => [g.key, prev[g.key] ?? { clientId: g.clientId ?? "", secret: "" }]))
      )
    } catch {
      /* 무시 — 크리덴셜 카드 로드 실패는 설정 전체를 막지 않음 */
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 크리덴셜 현황 로드
    load()
  }, [load])

  const setInput = (key: string, patch: Partial<Input>) =>
    setInputs((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { clientId: "", secret: "" }), ...patch } }))

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(text)
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 1200)
    } catch {
      toast.error("복사에 실패했어요.")
    }
  }

  const save = async (g: Group) => {
    const inp = inputs[g.key] ?? { clientId: "", secret: "" }
    if (!inp.clientId.trim()) {
      toast.error("client_id를 입력하세요.")
      return
    }
    if (!g.configured && !inp.secret.trim()) {
      toast.error("처음 등록할 때는 client_secret도 넣어주세요.")
      return
    }
    setSavingKey(g.key)
    try {
      const res = await fetch("/api/mcp/oauth-clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // secret은 입력했을 때만 전송(빈칸이면 기존 값 유지).
        body: JSON.stringify({
          credentialKey: g.key,
          client_id: inp.clientId.trim(),
          ...(inp.secret.trim() ? { client_secret: inp.secret.trim() } : {}),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? "저장에 실패했어요.")
      toast.success(`${g.label} 크리덴셜을 저장했어요.`)
      setInput(g.key, { secret: "" })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "오류")
    } finally {
      setSavingKey(null)
    }
  }

  const remove = async (g: Group) => {
    setSavingKey(g.key)
    try {
      const res = await fetch(`/api/mcp/oauth-clients?credentialKey=${encodeURIComponent(g.key)}`, { method: "DELETE" })
      if (!res.ok) throw new Error("삭제에 실패했어요.")
      toast.success(`${g.label} 크리덴셜을 삭제했어요.`)
      setInput(g.key, { clientId: "", secret: "" })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "오류")
    } finally {
      setSavingKey(null)
    }
  }

  if (!groups || groups.length === 0) return null

  return (
    <section className="flex flex-col gap-4 rounded-2xl glass p-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="flex items-center gap-1.5 text-base font-semibold">
          <KeyRound className="size-4" /> MCP 앱 크리덴셜
        </h2>
        <p className="text-xs text-muted-foreground">
          구글·Slack·PayPal은 각 서비스에 앱을 등록해야 직원이 연결할 수 있어요. 대표가 개발자 콘솔에서 받은
          client_id·client_secret을 여기에 넣으면, 직원들은 MCP 화면에서 자기 계정으로 바로 연결돼요.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {groups.map((g) => {
          const inp = inputs[g.key] ?? { clientId: "", secret: "" }
          const busy = savingKey === g.key
          return (
            <div key={g.key} className="flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{g.label}</span>
                {g.configured ? (
                  <span className="rounded bg-success/10 px-1.5 py-0.5 text-[11px] font-medium text-success">설정됨 ✓</span>
                ) : (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">미설정</span>
                )}
                <span className="text-[11px] text-muted-foreground">· 커넥터: {g.connectorNames.join(" · ")}</span>
                <a
                  href={g.setupUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  개발자 콘솔 열기 <ExternalLink className="size-3" />
                </a>
              </div>

              <p className="text-[11px] leading-relaxed text-muted-foreground">{g.help}</p>

              {/* 콘솔에 등록해야 할 리디렉션 URI */}
              <div className="flex flex-col gap-1 rounded-lg bg-muted/30 p-2.5">
                <span className="text-[11px] font-medium text-foreground">콘솔에 등록할 리디렉션 URI (아래를 그대로 복사)</span>
                {g.redirectUris.map((uri) => (
                  <button
                    key={uri}
                    onClick={() => copy(uri)}
                    className="flex items-center gap-1.5 text-left font-mono text-[11px] text-muted-foreground hover:text-foreground"
                    title="클릭해서 복사"
                  >
                    {copied === uri ? <Check className="size-3 shrink-0 text-success" /> : <Copy className="size-3 shrink-0" />}
                    <span className="truncate">{uri}</span>
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
                  client_id
                  <input
                    className={fieldClass}
                    value={inp.clientId}
                    onChange={(e) => setInput(g.key, { clientId: e.target.value })}
                    placeholder="예: 1234-abcd.apps.googleusercontent.com"
                    autoComplete="off"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
                  client_secret
                  <input
                    type="password"
                    className={fieldClass}
                    value={inp.secret}
                    onChange={(e) => setInput(g.key, { secret: e.target.value })}
                    placeholder={g.hasSecret ? "저장됨 — 바꿀 때만 입력" : "여기에 붙여넣기"}
                    autoComplete="off"
                  />
                </label>
              </div>

              <div className="flex items-center justify-end gap-2">
                {g.configured && (
                  <Button size="sm" variant="ghost" onClick={() => remove(g)} disabled={busy} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="size-3.5" /> 삭제
                  </Button>
                )}
                <Button size="sm" onClick={() => save(g)} disabled={busy}>
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : null} 저장
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      <p className="rounded-lg bg-muted/30 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
        🔒 client_secret은 저장 후 화면에 다시 표시하지 않아요. 값을 바꿀 때만 다시 입력하면 돼요.
        구글은 세 커넥터(Gmail·캘린더·드라이브)가 OAuth 앱 하나를 공유하니, 콘솔에 리디렉션 URI 3개를 모두 등록하세요.
      </p>
    </section>
  )
}
