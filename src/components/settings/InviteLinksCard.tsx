"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Copy, Link2, XCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentWorkspaceId } from "@/components/workspace/WorkspaceProvider"
import { Button } from "@/components/ui/button"
import { fieldClass } from "@/components/shared/Modal"
import { cn } from "@/lib/utils"

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

const ROLE_LABEL: Record<string, string> = { member: "멤버", guest: "게스트", owner: "호스트" }

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
  const [role, setRole] = useState<"member" | "guest">("member")
  const [projectIds, setProjectIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!wsId) return
    const [{ data: inv }, { data: prj }] = await Promise.all([
      supabase
        .from("workspace_invites")
        .select("id, token, role, project_ids, expires_at, max_uses, use_count, revoked_at, created_at")
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: false }),
      supabase.from("projects").select("id, name").is("deleted_at", null).order("name"),
    ])
    setInvites((inv as Invite[]) ?? [])
    setProjects((prj as ProjectLite[]) ?? [])
  }, [supabase, wsId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 초대 현황 로드
    void load()
  }, [load])

  const active = useMemo(
    () => invites.filter((i) => !i.revoked_at && new Date(i.expires_at) > new Date() && (i.max_uses == null || i.use_count < i.max_uses)),
    [invites],
  )

  const createInvite = async () => {
    if (!wsId) return
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select value={role} onChange={(e) => { setRole(e.target.value as "member" | "guest"); setProjectIds([]) }} className={cn(fieldClass, "sm:w-40")}>
          <option value="member">멤버로 초대</option>
          <option value="guest">게스트로 초대</option>
        </select>
        <Button onClick={createInvite} disabled={busy || !wsId} className="sm:ml-auto">
          <Link2 className="size-4" /> {busy ? "발급 중…" : "초대 링크 만들기 (30일)"}
        </Button>
      </div>

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
