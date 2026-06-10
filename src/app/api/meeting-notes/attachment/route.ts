import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { FILES_BUCKET } from "@/lib/files"

export const runtime = "nodejs"

/**
 * 회의록 첨부 다운로드 — 60초 서명 URL 발급.
 * files 스토리지 정책은 업로더 본인 폴더만 읽기 허용이라, 팀 공유 첨부는 클라이언트가
 * 직접 서명할 수 없다. 그래서 ① user 클라이언트로 meeting_notes를 조회(RLS=워크스페이스
 * 멤버만 노트가 보임 → 인가) → ② admin 클라이언트로 서명 URL을 만든다.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const body = (await req.json().catch(() => null)) as { noteId?: unknown } | null
  const noteId = typeof body?.noteId === "string" ? body.noteId : ""
  if (!noteId) return new Response("Bad Request", { status: 400 })

  // RLS로 인가: 워크스페이스 멤버만 이 노트가 조회된다.
  const { data: note } = await supabase
    .from("meeting_notes")
    .select("attachment_path, attachment_name, user_id")
    .eq("id", noteId)
    .maybeSingle()

  if (!note || !note.attachment_path) return new Response("Not Found", { status: 404 })

  // 이중 방어(DB CHECK 047과 별개): 첨부 경로가 작성자 본인 폴더 소속일 때만 서명.
  // admin 서명은 RLS를 우회하므로, 위조된 타인 경로를 절대 서명하지 않도록 막는다.
  if (!note.attachment_path.startsWith(`${note.user_id}/`)) {
    return new Response("Forbidden", { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(FILES_BUCKET).createSignedUrl(note.attachment_path, 60, {
    download: note.attachment_name ?? undefined,
  })
  if (error || !data) return new Response("Sign failed", { status: 500 })

  return Response.json({ url: data.signedUrl })
}
