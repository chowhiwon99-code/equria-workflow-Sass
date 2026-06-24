import { createClient } from "@/lib/supabase/server"
import { safeHttpUrl } from "@/lib/safeFetch"

export const runtime = "nodejs"
export const maxDuration = 30

/**
 * 리서치 출처 페이지에서 대표 이미지 추출 (Part 2 · 2b).
 * og:image / twitter:image 메타를 정규식으로 뽑아 후보를 반환(SSRF 가드·HTML만·타임아웃).
 * 실제 삽입은 image-import 라우트가 meeting-media로 다운로드·재업로드한다.
 */
type Candidate = { image: string; source: string; title?: string }

function metaContent(html: string, prop: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i")
  const m = html.match(re)
  if (m?.[1]) return m[1]
  // content가 property 앞에 오는 경우도 처리
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i")
  return html.match(re2)?.[1]
}

function extractImages(html: string, base: URL): string[] {
  const out: string[] = []
  for (const prop of ["og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"]) {
    const v = metaContent(html, prop)
    if (!v) continue
    try {
      const u = new URL(v, base)
      if (u.protocol === "https:" || u.protocol === "http:") out.push(u.href)
    } catch {
      /* 무효 URL 무시 */
    }
  }
  return [...new Set(out)]
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const body = (await req.json().catch(() => null)) as { urls?: unknown } | null
  const urls = Array.isArray(body?.urls) ? body.urls.filter((u): u is string => typeof u === "string").slice(0, 8) : []
  if (urls.length === 0) return Response.json({ images: [] })

  const results = await Promise.all(
    urls.map(async (raw): Promise<Candidate[]> => {
      const url = safeHttpUrl(raw)
      if (!url) return []
      try {
        const res = await fetch(url.href, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; EQURIA-bot)" },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/html")) return []
        const html = (await res.text()).slice(0, 600000)
        const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim()
        return extractImages(html, url).map((image) => ({ image, source: url.href, title }))
      } catch {
        return []
      }
    })
  )

  const seen = new Set<string>()
  const images = results
    .flat()
    .filter((c) => (seen.has(c.image) ? false : (seen.add(c.image), true)))
    .slice(0, 24)
  return Response.json({ images })
}
