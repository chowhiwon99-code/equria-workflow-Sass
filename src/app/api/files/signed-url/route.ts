import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

/**
 * 파일 미리보기/다운로드용 서명 URL(120초).
 * files 버킷은 '본인 폴더만' 읽기(015)지만 files 행은 공개범위(044)로 공유될 수 있다.
 * → 클라가 남의 공유 파일을 미리보려면:
 *   ① user 클라이언트로 files를 RLS 조회(공개/부서/본인만 보임 = 인가) →
 *   ② admin 클라이언트로 그 파일의 storage_path를 서명.
 * 버킷은 'files' 고정 + 경로는 그 파일 자신의 metadata에서만 → 교차 노출 없음.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const body = (await req.json().catch(() => null)) as { fileId?: unknown } | null
  const fileId = typeof body?.fileId === "string" ? body.fileId : ""
  if (!fileId) return new Response("Bad Request", { status: 400 })

  // RLS로 인가: 볼 수 있는(본인/공개/같은 부서) 파일만 조회된다.
  const { data: file } = await supabase
    .from("files")
    .select("metadata")
    .eq("id", fileId)
    .is("deleted_at", null)
    .maybeSingle()

  const path = (file?.metadata as { storage_path?: string } | null)?.storage_path
  if (!path) return new Response("Not Found", { status: 404 })

  const admin = createAdminClient()
  const { data, error } = await admin.storage.from("files").createSignedUrl(path, 120)
  if (error || !data) return new Response("Sign failed", { status: 500 })

  return Response.json({ url: data.signedUrl })
}
