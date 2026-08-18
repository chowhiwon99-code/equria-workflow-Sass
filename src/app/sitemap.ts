import type { MetadataRoute } from "next"

// 공개 페이지 사이트맵 — Search Console 제출용(구글 색인 촉진).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://complow.kr"
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/privacy`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/refund`, changeFrequency: "monthly", priority: 0.3 },
    // 자동결제 약관 — 이용약관과 별도 문서(나이스페이 계약 제22조 ③). 항상 공개 도달 가능해야 한다.
    { url: `${base}/terms/billing`, changeFrequency: "monthly", priority: 0.3 },
  ]
}
