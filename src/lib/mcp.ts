// MCP 커넥터 큐레이션 카탈로그 (SSOT). 디렉터리(둘러보기)에 카드로 노출.
// status "available" = 프리셋으로 원클릭 연결 가능. "coming_soon" = 인증(토큰/OAuth) 구현 필요, 준비 중.

export type ConnectorCategory = "문서" | "개발" | "생산성" | "디자인" | "커뮤니케이션" | "데이터"

export const CONNECTOR_CATEGORIES: ConnectorCategory[] = ["문서", "개발", "생산성", "디자인", "커뮤니케이션", "데이터"]

export type Connector = {
  id: string
  name: string
  description: string
  emoji: string
  /** 로고용 도메인(파비콘 서비스로 렌더). 없으면 emoji 폴백. */
  domain?: string
  category: ConnectorCategory
  /** 상단 "추천" 섹션 노출 */
  featured?: boolean
  status: "available" | "coming_soon"
  /** available 프리셋 — "연결" 원클릭 등록에 쓰는 접속 정보. */
  preset?: {
    type: "http" | "sse"
    url: string
    auth: "none" | "bearer"
  }
}

/** 알려진 MCP 도구의 한국어 설명(도구 이름 기준). 목록에 없으면 서버가 준 원문 설명을 그대로 노출. */
export const MCP_TOOL_KO: Record<string, string> = {
  // DeepWiki
  read_wiki_structure: "GitHub 저장소 문서의 목차(주제 목록)를 가져와요 · 인자: repoName(owner/repo)",
  read_wiki_contents: "GitHub 저장소의 문서 내용을 읽어와요 · 인자: repoName(owner/repo)",
  ask_question: "GitHub 저장소에 대해 질문하면 저장소 내용을 근거로 답해요 · 인자: repoName, question",
  // Context7
  "resolve-library-id": "라이브러리 이름으로 Context7 문서 ID를 찾아요 · 인자: libraryName",
  "get-library-docs": "라이브러리 최신 공식 문서에서 필요한 부분을 가져와요 · 인자: 라이브러리 ID, topic",
  "query-docs": "라이브러리 최신 문서에 질문해 관련 내용을 가져와요 · 인자: libraryId, query",
}

export const MCP_CONNECTORS: Connector[] = [
  // 읽기 전용·무인증 — 안전한 첫 커넥터(원클릭 연결)
  {
    id: "context7",
    name: "Context7",
    description: "라이브러리 최신 문서 조회 (읽기 전용·무인증)",
    emoji: "📚",
    domain: "context7.com",
    category: "문서",
    featured: true,
    status: "available",
    preset: { type: "http", url: "https://mcp.context7.com/mcp", auth: "none" },
  },
  {
    id: "deepwiki",
    name: "DeepWiki",
    description: "GitHub 저장소 질문·문서 (읽기 전용·무인증)",
    emoji: "📖",
    domain: "deepwiki.com",
    category: "개발",
    featured: true,
    status: "available",
    preset: { type: "http", url: "https://mcp.deepwiki.com/mcp", auth: "none" },
  },
  // Bearer 토큰 — "연결" 시 토큰 입력 모달(프리셋 URL·이름 프리필, AES 암호화 저장). PAT/API 키만 붙여넣으면 됨.
  { id: "github", name: "GitHub", description: "이슈·PR·코드 검색 (PAT 토큰)", emoji: "🐙", domain: "github.com", category: "개발", featured: true, status: "available", preset: { type: "http", url: "https://api.githubcopilot.com/mcp/", auth: "bearer" } },
  { id: "supabase", name: "Supabase", description: "데이터·스키마 조회 (PAT 토큰)", emoji: "🟢", domain: "supabase.com", category: "데이터", status: "available", preset: { type: "http", url: "https://mcp.supabase.com/mcp", auth: "bearer" } },
  { id: "stripe", name: "Stripe", description: "결제·고객 데이터 조회 (API 키)", emoji: "💳", domain: "stripe.com", category: "데이터", status: "available", preset: { type: "http", url: "https://mcp.stripe.com", auth: "bearer" } },
  // 무인증 읽기 전용 — 원클릭 연결(토큰 없이 익명 접근)
  { id: "huggingface", name: "Hugging Face", description: "모델·데이터셋 검색 (읽기 전용·무인증)", emoji: "🤗", domain: "huggingface.co", category: "개발", status: "available", preset: { type: "http", url: "https://huggingface.co/mcp", auth: "none" } },
  // OAuth 인가 플로우 구현 필요 — 준비 중(토큰만으론 연결 불가)
  { id: "notion", name: "Notion", description: "페이지·데이터베이스 검색·수정 (OAuth 필요)", emoji: "📝", domain: "notion.so", category: "생산성", featured: true, status: "coming_soon" },
  { id: "slack", name: "Slack", description: "메시지·채널 조회·전송 (OAuth 필요)", emoji: "💬", domain: "slack.com", category: "커뮤니케이션", status: "coming_soon" },
  { id: "linear", name: "Linear", description: "이슈·프로젝트 관리 (OAuth 필요)", emoji: "📐", domain: "linear.app", category: "개발", status: "coming_soon" },
  { id: "atlassian", name: "Atlassian", description: "Jira·Confluence 이슈·문서 (OAuth 필요)", emoji: "🧩", domain: "atlassian.com", category: "개발", status: "coming_soon" },
  { id: "sentry", name: "Sentry", description: "에러·이슈 모니터링 (OAuth 필요)", emoji: "🛡️", domain: "sentry.io", category: "개발", status: "coming_soon" },
  { id: "figma", name: "Figma", description: "디자인 파일·코드 커넥트 (OAuth 필요)", emoji: "🎨", domain: "figma.com", category: "디자인", status: "coming_soon" },
  { id: "canva", name: "Canva", description: "디자인 검색·생성·내보내기 (OAuth 필요)", emoji: "🖼️", domain: "canva.com", category: "디자인", status: "coming_soon" },
]
