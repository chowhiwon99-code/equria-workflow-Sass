"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Copy, Link2, XCircle, ArrowUpCircle, UserCog, User, ChevronDown, Check } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentWorkspaceId } from "@/components/workspace/WorkspaceProvider"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { planOf, nextPlan, seatsFull } from "@/lib/plans"
import { SeatMeter } from "@/components/workspace/SeatMeter"

type Invite = {
  id: string
  token: string
  role: string
  project_ids: string[]
  expires_at: string
  max_uses: number | null
  use_count: number
  revoked_at: string | null
  created_at: string
}
type ProjectLite = { id: string; name: string }
type InviteRole = "owner" | "member" | "guest"

const ROLE_LABEL: Record<string, string> = { member: "멤버", guest: "게스트", owner: "호스트" }

// 노션식 역할 정의 — 아이콘·이름·설명 + 시트 소비 여부(무료 초과 시 '플러스' 게이팅)
const ROLES: { value: InviteRole; Icon: typeof User; label: string; desc: string; seat: boolean }[] = [
  { value: "owner", Icon: UserCog, label: "워크스페이스 소유자", desc: "워크스페이스 설정 변경 및 신규 멤버 초대 허용", seat: true },
  { value: "member", Icon: User, label: "멤버", desc: "워크스페이스 콘텐츠를 보고 만들 수 있어요", seat: true },
  { value: "guest", Icon: User, label: "제한된 멤버", desc: "본인이 만들었거나 공유받은 프로젝트만 보고 편집할 수 있어요", seat: false },
]

/**
 * B2 — 노션식 초대 링크 관리(오너/관리자 전용 — RLS wsi_select가 게이팅).
 * 링크 발급(멤버/게스트·게스트는 프로젝트 선택) → 복사 → 회수. 이메일 발송 없이 URL 공유.
 * 구 '구글 이메일 사전등록' 방식(/api/members/invite)을 대체.
 */
export function InviteLinksCard() {
  const supabase = createClient()
  const wsId = useCurrentWorkspaceId()
  const [invites, setInvites] = useState<Invite[]>([])
  const [projects, setProjects] = useState<ProjectLite[]>([])
  const [role, setRole] = useState<InviteRole>("member")
  const [roleOpen, setRoleOpen] = useState(false)
  const [projectIds, setProjectIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [plan, setPlan] = useState<string>("free") // 워크스페이스 요금제(시트 게이팅)
  const [seatsUsed, setSeatsUsed] = useState(0) // 비게스트 멤버 수(오너 포함)

  const load = useCallback(async () => {
    if (!wsId) return
    const [{ data: inv }, { data: prj }, { data: ws }, { count }] = await Promise.all([
      supabase
        .from("workspace_invites")
        .select("id, token, role, project_ids, expires_at, max_uses, use_count, revoked_at, created_at")
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: false }),
      supabase.from("projects").select("id, name").is("deleted_at", null).order("name"),
      supabase.from("workspaces").select("plan").eq("id", wsId).maybeSingle(),
      supabase.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", wsId).neq("role", "guest"),
    ])
    setInvites((inv as Invite[]) ?? [])
    setProjects((prj as ProjectLite[]) ?? [])
    setPlan(ws?.plan ?? "free")
    setSeatsUsed(count ?? 0)
  }, [supabase, wsId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 초대 현황 로드
    void load()
  }, [load])

  const active = useMemo(
    () => invites.filter((i) => !i.revoked_at && new Date(i.expires_at) > new Date() && (i.max_uses == null || i.use_count < i.max_uses)),
    [invites],
  )

  const planDef = planOf(plan)
  const next = nextPlan(plan)
  const full = seatsFull(plan, seatsUsed) // 시트 소진(게스트는 무관)
  const roleDef = ROLES.find((r) => r.value === role) ?? ROLES[1]
  const memberBlocked = roleDef.seat && full // 시트 소비 역할(소유자·멤버)은 초과 시 잠금
  const gated = (r: (typeof ROLES)[number]) => r.seat && full // 노션 '플러스' 배지 조건

  const createInvite = async () => {
    if (!wsId) return
    if (memberBlocked) return // 게이팅 — 버튼 자체가 비활성
    if (role === "guest" && projectIds.length === 0) return toast.error("게스트 링크는 접근할 프로젝트를 골라 주세요.")
    setBusy(true)
    const { data, error } = await supabase.rpc("create_workspace_invite", {
      p_workspace: wsId,
      p_role: role,
      p_project_ids: role === "guest" ? projectIds : [],
      p_expires_days: 30,
    })
    setBusy(false)
    if (error || !data) return toast.error("링크 발급에 실패했어요.")
    await load()
    await copyLink((data as Invite).token)
  }

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/join/${token}`)
      toast.success("초대 링크를 복사했어요 — 카톡·메일로 공유하세요.")
    } catch {
      toast.error("복사에 실패했어요. 링크를 직접 선택해 복사해 주세요.")
    }
  }

  const revoke = async (id: string) => {
    const { error } = await supabase.rpc("revoke_workspace_invite", { p_invite: id })
    if (error) return toast.error("회수에 실패했어요.")
    toast.success("초대 링크를 회수했어요.")
    await load()
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 시트 사용량 — 무료 3석 등(게스트 제외). 사이드바 '팀 초대'와 같은 컴포넌트를 쓴다. */}
      <SeatMeter plan={plan} used={seatsUsed} />

      {/* 역할 선택 — 노션식 리치 드롭다운(역할별 설명 + 플러스 배지) */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">역할 선택</p>
        <div className="relative">
          <button
            type="button"
            onClick={() => setRoleOpen((v) => !v)}
            className="flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
          >
            <roleDef.Icon className="size-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{roleDef.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{roleDef.desc}</span>
            </span>
            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", roleOpen && "rotate-180")} />
          </button>
          {roleOpen && (
            <>
              <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setRoleOpen(false)} />
              <div className="absolute left-0 right-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl border bg-popover p-1 shadow-lg">
                {ROLES.map((r) => {
                  const on = r.value === role
                  return (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => {
                        setRole(r.value)
                        if (r.value !== "guest") setProjectIds([])
                        setRoleOpen(false)
                      }}
                      className={cn("flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted", on && "bg-muted/60")}
                    >
                      <r.Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          {r.label}
                          {gated(r) && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-info-bg px-1.5 py-0.5 text-[10px] font-semibold text-info">
                              <ArrowUpCircle className="size-3" /> 플러스
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground">{r.desc}</span>
                      </span>
                      {on && <Check className="mt-0.5 size-4 shrink-0 text-primary" />}
                    </button>
                  )
                })}
                <Link href="/#pricing" className="block border-t px-2.5 py-2 text-xs text-muted-foreground hover:text-foreground">
                  각 역할·요금제에 대해 자세히 알아보기
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 시트 초과 업그레이드 유도(노션식) — 시트 소비 역할만, 게스트는 무관 */}
      {memberBlocked && (
        <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center">
          <ArrowUpCircle className="size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">{planDef.label} 요금제는 최대 {planDef.seats}명까지예요.</p>
            <p className="text-xs text-muted-foreground">
              {next ? `${next.label}로 업그레이드하면 ${next.seats != null ? `${next.seats}명까지` : "더 많이"} 초대할 수 있어요.` : "더 많은 인원은 문의해 주세요."} 제한된 멤버(게스트)는 지금도 초대할 수 있어요.
            </p>
          </div>
          <Link
            href="/#pricing"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <ArrowUpCircle className="size-4" /> 업그레이드
          </Link>
        </div>
      )}

      <Button onClick={createInvite} disabled={busy || !wsId || memberBlocked} className="w-full">
        <Link2 className="size-4" /> {busy ? "발급 중…" : "초대 링크 만들기 (30일)"}
      </Button>

      {role === "guest" && (
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-xs text-muted-foreground">게스트가 접근할 프로젝트 (필수 · 다중 선택)</p>
          {projects.length === 0 ? (
            <p className="text-xs text-muted-foreground">프로젝트가 없어요 — 먼저 프로젝트를 만들어 주세요.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {projects.map((p) => {
                const on = projectIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProjectIds((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]))}
                    className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", on ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {active.length > 0 && (
        <div className="flex flex-col divide-y overflow-hidden rounded-xl border">
          {active.map((i) => (
            <div key={i.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{ROLE_LABEL[i.role] ?? i.role}</span>
              <span className="truncate font-mono text-xs text-muted-foreground">/join/{i.token.slice(0, 10)}…</span>
              <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                ~{new Date(i.expires_at).toLocaleDateString("ko-KR")}
                {i.max_uses != null && ` · ${i.use_count}/${i.max_uses}회`}
              </span>
              <button type="button" onClick={() => copyLink(i.token)} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="복사">
                <Copy className="size-4" />
              </button>
              <button type="button" onClick={() => revoke(i.id)} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label="회수">
                <XCircle className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
