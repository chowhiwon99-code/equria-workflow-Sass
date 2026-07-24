"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { ExternalLink, Copy, Check, Loader2, Trash2, KeyRound, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fieldClass } from "@/components/shared/Modal"
import { cn } from "@/lib/utils"

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
 * 오너 전용 — MCP 앱 크리덴셜(구글·Slack·PayPal) 등록.
 * 설정된 그룹은 한 줄로 접고, 펼치면 ①콘솔 ②리디렉션 URI ③값 입력의 3단계로 안내(대표 요청: 쉽게·글 적게).
 */
export function McpCredentialsCard() {
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [inputs, setInputs] = useState<Record<string, Input>>({})
  const [openKey, setOpenKey] = useState<string | null>(null)
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
      toast.success(`${g.label} 저장됨`)
      setInput(g.key, { secret: "" })
      setOpenKey(null)
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
      toast.success(`${g.label} 삭제됨`)
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
        <p className="text-xs text-muted-foreground">구글·Slack 등은 대표가 앱을 등록해야 직원이 연결할 수 있어요.</p>
      </div>

      <div className="flex flex-col divide-y overflow-hidden rounded-xl border">
        {groups.map((g) => {
          const inp = inputs[g.key] ?? { clientId: "", secret: "" }
          const busy = savingKey === g.key
          const open = openKey === g.key
          return (
            <div key={g.key} className="flex flex-col">
              {/* 접힌 한 줄 — 상태와 액션만 */}
              <div className="flex items-center gap-2.5 px-4 py-3">
                <span className="text-sm font-medium">{g.label}</span>
                {g.configured ? (
                  <span className="rounded bg-success/10 px-1.5 py-0.5 text-[11px] font-medium text-success">설정됨 ✓</span>
                ) : (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">미설정</span>
                )}
                <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">{g.connectorNames.join(" · ")}</span>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  {g.configured && (
                    <button
                      onClick={() => remove(g)}
                      disabled={busy}
                      className="rounded p-1.5 text-muted-foreground hover:text-destructive"
                      title="삭제"
                    >
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                    </button>
                  )}
                  <Button size="sm" variant={g.configured ? "ghost" : "outline"} className="h-7 text-xs" onClick={() => setOpenKey(open ? null : g.key)}>
                    {g.configured ? "수정" : "설정하기"}
                    <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
                  </Button>
                </div>
              </div>

              {/* 펼침 — 번호 3단계 */}
              {open && (
                <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3.5">
                  <div className="flex items-start gap-2 text-xs">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">1</span>
                    <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
                      <a href={g.setupUrl} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 font-medium text-primary hover:underline">
                        개발자 콘솔에서 앱 만들기 <ExternalLink className="size-3" />
                      </a>
                      <span className="text-muted-foreground">{g.help}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 text-xs">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">2</span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
                      <span className="font-medium">리디렉션 URI 등록 <span className="font-normal text-muted-foreground">(클릭해서 복사)</span></span>
                      {g.redirectUris.map((uri) => (
                        <button
                          key={uri}
                          onClick={() => copy(uri)}
                          className="flex items-center gap-1.5 text-left font-mono text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          {copied === uri ? <Check className="size-3 shrink-0 text-success" /> : <Copy className="size-3 shrink-0" />}
                          <span className="truncate">{uri}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-start gap-2 text-xs">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">3</span>
                    <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
                      <span className="font-medium">받은 값 붙여넣기</span>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          className={fieldClass}
                          value={inp.clientId}
                          onChange={(e) => setInput(g.key, { clientId: e.target.value })}
                          placeholder="client_id"
                          autoComplete="off"
                        />
                        <input
                          type="password"
                          className={fieldClass}
                          value={inp.secret}
                          onChange={(e) => setInput(g.key, { secret: e.target.value })}
                          placeholder={g.hasSecret ? "client_secret (저장됨 — 바꿀 때만)" : "client_secret"}
                          autoComplete="off"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground/70">🔒 secret은 저장 후 다시 표시되지 않아요.</span>
                        <Button size="sm" className="h-7" onClick={() => save(g)} disabled={busy}>
                          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null} 저장
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
