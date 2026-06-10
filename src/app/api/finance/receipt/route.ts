import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

/**
 * 비용/매출 영수증(이미지·PDF) 열람 — 60초 서명 URL 발급.
 * receipts 버킷은 비공개(업로더 본인 폴더만 읽기)지만 finance_entries는 워크스페이스 공유다.
 * ① user 클라이언트로 finance_entries를 조회(RLS=워크스페이스 멤버만 보임 → 인가) →
 * ② admin 클라이언트로 receipt_url을 서명한다. 버킷은 'receipts'로 고정이라 다른 버킷 노출 불가.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const body = (await req.json().catch(() => null)) as { entryId?: unknown } | null
  const entryId = typeof body?.entryId === "string" ? body.entryId : ""
  if (!entryId) return new Response("Bad Request", { status: 400 })

  // RLS로 인가: 워크스페이스 멤버만 이 항목이 조회된다.
  const { data: entry } = await supabase
    .from("finance_entries")
    .select("receipt_url")
    .eq("id", entryId)
    .maybeSingle()

  if (!entry || !entry.receipt_url) return new Response("Not Found", { status: 404 })

  const admin = createAdminClient()
  const { data, error } = await admin.storage.from("receipts").createSignedUrl(entry.receipt_url, 60)
  if (error || !data) return new Response("Sign failed", { status: 500 })

  return Response.json({ url: data.signedUrl })
}
