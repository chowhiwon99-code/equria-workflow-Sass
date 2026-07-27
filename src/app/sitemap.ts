import type { MetadataRoute } from "next"

// 공개 페이지 사이트맵 — Search Console 제출용(구글 색인 촉진).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://complow.kr"
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/privacy`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/refund`, changeFrequency: "monthly", priority: 0.3 },
  ]
}
