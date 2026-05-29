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
