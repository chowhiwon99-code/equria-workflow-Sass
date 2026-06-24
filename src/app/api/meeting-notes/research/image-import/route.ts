import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { safeHttpUrl } from "@/lib/safeFetch"

export const runtime = "nodejs"
export const maxDuration = 30

/**
 * 리서치 후보 이미지를 meeting-media(공개 버킷)로 다운로드·재업로드 후 공개 URL 반환 (Part 2 · 2b).
 * 핫링크 대신 우리 버킷에 영속화 — 외부 만료/핫링크 차단 방지. SSRF 가드·이미지만·SVG 차단·용량 제한.
 */
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const body = (await req.json().catch(() => null)) as { url?: unknown } | null
  const url = typeof body?.url === "string" ? safeHttpUrl(body.url) : null
  if (!url) return new Response("Bad Request", { status: 400 })

  try {
    const res = await fetch(url.href, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EQURIA-bot)" },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return new Response("fetch failed", { status: 502 })
    const ct = ((res.headers.get("content-type") ?? "").split(";")[0] ?? "").trim().toLowerCase()
    if (!ct.startsWith("image/") || ct.includes("svg")) return new Response("not a safe image", { status: 415 })
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.byteLength === 0 || buf.byteLength > 15 * 1024 * 1024) return new Response("bad size", { status: 413 })

    const ext = EXT[ct] ?? "jpg"
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`
    const admin = createAdminClient()
    const { error } = await admin.storage.from("meeting-media").upload(path, buf, { contentType: ct, upsert: false })
    if (error) return new Response("upload failed", { status: 500 })

    const { data } = admin.storage.from("meeting-media").getPublicUrl(path)
    return Response.json({ url: data.publicUrl })
  } catch {
    return new Response("error", { status: 500 })
  }
}
