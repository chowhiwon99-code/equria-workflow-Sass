// MCP 커넥터 큐레이션 카탈로그 (SSOT). 갤러리에 카드로 노출.
// status "available" = 프리셋으로 원클릭 연결 가능. "coming_soon" = 토큰/설정 필요, 준비 중.

export type Connector = {
  id: string
  name: string
  description: string
  emoji: string
  status: "available" | "coming_soon"
  /** available 프리셋 — "연결" 원클릭 등록에 쓰는 접속 정보. */
  preset?: {
    type: "http" | "sse"
    url: string
    auth: "none" | "bearer"
  }
}

export const MCP_CONNECTORS: Connector[] = [
  // 읽기 전용·무인증 — 안전한 첫 커넥터(원클릭 연결)
  {
    id: "context7",
    name: "Context7",
    description: "라이브러리 최신 문서 조회 (읽기 전용·무인증)",
    emoji: "📚",
    status: "available",
    preset: { type: "http", url: "https://mcp.context7.com/mcp", auth: "none" },
  },
  {
    id: "deepwiki",
    name: "DeepWiki",
    description: "GitHub 저장소 질문·문서 (읽기 전용·무인증)",
    emoji: "📖",
    status: "available",
    preset: { type: "http", url: "https://mcp.deepwiki.com/mcp", auth: "none" },
  },
  // 토큰/설정 필요 — 준비 중
  { id: "github", name: "GitHub", description: "이슈·PR·코드 (토큰 필요)", emoji: "🐙", status: "coming_soon" },
  { id: "notion", name: "Notion", description: "페이지·DB (토큰 필요)", emoji: "📝", status: "coming_soon" },
  { id: "supabase", name: "Supabase", description: "데이터 조회 (토큰 필요)", emoji: "🟢", status: "coming_soon" },
  { id: "figma", name: "Figma", description: "디자인 파일·코드 커넥트 (토큰 필요)", emoji: "🎨", status: "coming_soon" },
]
