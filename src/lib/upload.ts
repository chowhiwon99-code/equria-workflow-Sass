import { createClient } from "@/lib/supabase/client"

// 버킷별 파일당 크기 상한(바이트) — Supabase Free 스토리지 1GB를 파일 하나가 독식하지 못하게 막는 방어선.
// 진짜 강제는 storage.buckets.file_size_limit(마이그144, 서버측·API 직접호출도 우회 불가)이 한다.
// 여기 값은 그와 반드시 같게 유지 — 네트워크 왕복 전에 즉시 에러를 보여주는 UX용 사전 체크일 뿐.
const BUCKET_MAX_BYTES: Record<string, number> = {
  files: 50 * 1024 * 1024,
  "chat-files": 50 * 1024 * 1024,
  receipts: 50 * 1024 * 1024,
  "business-cards": 50 * 1024 * 1024,
  "calendar-files": 50 * 1024 * 1024,
  "meeting-media": 50 * 1024 * 1024, // 마이그049에서 이미 서버측 적용됨
}

function assertUnderBucketLimit(bucket: string, file: File) {
  const max = BUCKET_MAX_BYTES[bucket]
  if (max && file.size > max) {
    throw new Error(`파일이 너무 커요(최대 ${Math.round(max / 1024 / 1024)}MB까지 업로드할 수 있어요).`)
  }
}

/**
 * 이미지를 지정 버킷의 본인 폴더({uid}/{uuid}.{ext})로 업로드하고 경로를 반환.
 * Storage RLS가 본인 폴더만 허용하므로 uid 프리픽스 필수.
 */
export async function uploadImage(bucket: string, file: File): Promise<string> {
  assertUnderBucketLimit(bucket, file)
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
  assertUnderBucketLimit(bucket, file)
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
