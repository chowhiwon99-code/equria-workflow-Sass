import type { MetadataRoute } from "next"

// 검색엔진 크롤링 규칙 — 공개 표면(랜딩·법적 문서)만 색인 대상, 앱·API는 제외.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/privacy", "/terms", "/refund"],
        disallow: ["/api/", "/dashboard", "/agents", "/calendar", "/settings", "/mypage", "/chat", "/files", "/finance", "/cards", "/mail", "/mcp", "/projects"],
      },
    ],
    sitemap: "https://complow.kr/sitemap.xml",
  }
}
