import { createClient } from "@/lib/supabase/client"

/**
 * 이미지를 지정 버킷의 본인 폴더({uid}/{uuid}.{ext})로 업로드하고 경로를 반환.
 * Storage RLS가 본인 폴더만 허용하므로 uid 프리픽스 필수.
 */
export async function uploadImage(bucket: string, file: File): Promise<string> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("로그인이 필요합니다.")

  const ext = file.name.split(".").pop() || "jpg"
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) throw error
  return path
}

/**
 * 임의 파일을 지정 버킷의 본인 폴더({uid}/{uuid}.{ext})로 업로드.
 * 이미지 전용 uploadImage와 달리 확장자/콘텐츠 타입을 보존한다.
 */
export async function uploadFile(
  bucket: string,
  file: File
): Promise<{ path: string; name: string; size: number; mimeType: string }> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("로그인이 필요합니다.")

  const ext = file.name.includes(".") ? file.name.split(".").pop() : ""
  const path = `${user.id}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`
  const mimeType = file.type || "application/octet-stream"
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: mimeType,
    upsert: false,
  })
  if (error) throw error
  return { path, name: file.name, size: file.size, mimeType }
}

// 공개 버킷에 활성 콘텐츠(SVG/HTML)가 올라가면 그 URL이 스크립트를 실행할 수 있어 차단한다.
const BLOCKED_MEDIA_MIME = /^(image\/svg|text\/html|application\/xhtml)/i
const BLOCKED_MEDIA_EXT = /\.(svg|html?|xhtml|mhtml|shtml)$/i

/**
 * 회의록 인라인 미디어(이미지/파일)를 공개 meeting-media 버킷에 올리고 공개 URL을 반환.
 * 공개 버킷이라 안정적인 URL을 본문(리치 HTML)에 그대로 임베드할 수 있다.
 * opts.download=true면 첨부 다운로드 disposition을 붙인다(파일 블록용 — 교차출처 download 속성 무시 보완).
 */
export async function uploadMeetingMedia(
  file: File,
  opts?: { download?: boolean }
): Promise<{ url: string; name: string; size: number; mimeType: string }> {
  if (BLOCKED_MEDIA_MIME.test(file.type) || BLOCKED_MEDIA_EXT.test(file.name)) {
    throw new Error("SVG·HTML 형식은 보안상 올릴 수 없어요.")
  }
  const supabase = createClient()
  const up = await uploadFile("meeting-media", file)
  const { data } = supabase.storage
    .from("meeting-media")
    .getPublicUrl(up.path, opts?.download ? { download: up.name } : undefined)
  return { url: data.publicUrl, name: up.name, size: up.size, mimeType: up.mimeType }
}
