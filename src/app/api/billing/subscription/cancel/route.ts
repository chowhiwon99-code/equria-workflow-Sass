// 구독 해지 신청 / 해지 철회 — 법적 의무③ (24시간 해지 채널)
//
// 나이스페이 계약 제22조 ④-2 · 여신전문금융업법 시행령:
//   "정기결제 고객사는 **정규 영업시간 외에도** 이용자가 정기결제 철회·취소·해지 등을
//    신청할 수 있도록 채널을 운영하여야 한다."
// → 앱에서 언제나 누를 수 있어야 한다. 이메일 문의만으로는 요건 미달이다.
//
// ⚠️ 해지는 **즉시 종료가 아니다.** /refund 제2조 1항이 "해지 시 다음 결제일부터 중단,
//    이미 결제된 기간은 만료일까지 이용"이라고 이미 공표돼 있다. RPC가 cancel_effective_at을
//    current_period_end로 잡고, 만료 도래는 billing_expire_due() 크론이 처리한다.
//
// ⚠️ 마이그140의 billing_* RPC는 **service_role 전용**이다(revoke from authenticated).
//    따라서 클라이언트에서 supabase.rpc()로 직접 못 부르고 반드시 이 라우트를 거친다.
//    인증·인가는 여기서, 원자성은 DB가 맡는 분담이다.
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

/**
 * 요청자의 워크스페이스를 **서버가 판정**한다. 클라가 보낸 workspace_id는 믿지 않는다.
 *
 * guest 제외 + created_at 오름차순 명시는 이 코드베이스의 필수 관례다(budget.ts:42-49).
 * 비결정 limit(1)을 쓰면 멀티 멤버십일 때 엉뚱한 워크스페이스의 구독을 해지할 수 있다.
 */
async function resolveOwnedWorkspace(userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data: mem } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .neq("role", "guest")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  const wsId = mem?.workspace_id
  if (!wsId) return null

  // 해지는 오너만. (구독 조회는 멤버도 되지만 돈을 끊는 건 오너 권한이다.)
  const { data: ws } = await admin.from("workspaces").select("owner_id").eq("id", wsId).maybeSingle()
  return ws?.owner_id === userId ? wsId : null
}

/** 해지 신청 — cancel_effective_at(= 현재 기간 만료일)을 돌려준다. */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("로그인이 필요해요.", { status: 401 })

  const wsId = await resolveOwnedWorkspace(user.id)
  if (!wsId) return new Response("관리자(대표)만 해지할 수 있어요.", { status: 403 })

  const body = (await req.json().catch(() => ({}))) as { reason?: string }
  // 사유는 선택 입력이다. 길면 잘라서 저장한다(사용자가 막는 게 아니라 서버가 정리).
  // 생성된 RPC 타입이 `p_reason?: string`이라 빈 값은 null이 아니라 undefined로 넘긴다.
  const reason = body.reason?.trim().slice(0, 200) || undefined

  const admin = createAdminClient()
  const { data, error } = await admin.rpc("billing_request_cancel", {
    p_workspace_id: wsId,
    p_user_id: user.id,
    p_reason: reason,
  })

  if (error) {
    // RPC는 활성 구독이 없으면 'no active subscription'으로 예외를 던진다.
    if (error.message.includes("no active subscription")) {
      return new Response("해지할 구독이 없어요.", { status: 409 })
    }
    return new Response("해지 처리에 실패했어요. 잠시 후 다시 시도해 주세요.", { status: 500 })
  }

  return Response.json({ ok: true, effectiveAt: data })
}

/** 해지 철회 — 마음이 바뀐 경우. 기간 만료 전이면 언제든 되돌릴 수 있다. */
export async function DELETE() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("로그인이 필요해요.", { status: 401 })

  const wsId = await resolveOwnedWorkspace(user.id)
  if (!wsId) return new Response("관리자(대표)만 변경할 수 있어요.", { status: 403 })

  const admin = createAdminClient()
  const { error } = await admin.rpc("billing_revoke_cancel", {
    p_workspace_id: wsId,
    p_user_id: user.id,
  })
  if (error) return new Response("처리에 실패했어요. 잠시 후 다시 시도해 주세요.", { status: 500 })

  return Response.json({ ok: true })
}
