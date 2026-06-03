import type { createClient } from "@/lib/supabase/server"

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

/**
 * OCR용: storage 경로 → Claude 메시지 filePart 변환.
 * 임시 서명 URL을 만들어 PDF는 `file`, 그 외는 `image` 파트로 반환한다. 서명 실패 시 throw.
 * (cards/ocr · finance/ocr 공용 — TTL·PDF 판정 로직을 한 곳에서 관리)
 */
export async function buildOcrFilePart(
  supabase: ServerSupabase,
  bucket: string,
  path: string,
  ttlSeconds = 120
) {
  const { data: signed, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttlSeconds)
  if (error || !signed) throw new Error("이미지 URL 생성 실패")
  const url = new URL(signed.signedUrl)
  return path.toLowerCase().endsWith(".pdf")
    ? ({ type: "file" as const, data: url, mediaType: "application/pdf" })
    : ({ type: "image" as const, image: url })
}
