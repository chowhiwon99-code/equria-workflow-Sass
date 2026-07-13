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
  /**
   * "workspace" = 회사 전체가 공유하는 자원(관리자가 1회 연결, 전 직원이 그 도구를 씀).
   * "user" = 개인 계정 성격(직원 각자 자기 토큰으로 연결 — 회사 대신 "나"로 접근·감사·회수 가능해야 함).
   * 무인증(auth:"none")은 개인 식별 개념이 없어 workspace, 그 외(bearer/oauth)는 원칙적으로 user.
   */
  scope: "workspace" | "user"
  /** available 프리셋 — "연결" 원클릭 등록에 쓰는 접속 정보. */
  preset?: {
    type: "http" | "sse"
    url: string
    auth: "none" | "bearer" | "oauth"
    /** bearer일 때 "토큰 발급받기" 링크 — 해당 서비스의 토큰 발급 페이지로 안내(연결 모달에 노출) */
    tokenHelpUrl?: string
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
    scope: "workspace",
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
    scope: "workspace",
    preset: { type: "http", url: "https://mcp.deepwiki.com/mcp", auth: "none" },
  },
  // 개인 계정 연결(Bearer) — 직원 각자 자기 토큰으로. "연결"은 누구나(관리자 게이트 없음), 나만 보고 나만 지움.
  { id: "github", name: "GitHub", description: "이슈·PR·코드 검색 (내 PAT 토큰)", emoji: "🐙", domain: "github.com", category: "개발", featured: true, status: "available", scope: "user", preset: { type: "http", url: "https://api.githubcopilot.com/mcp/", auth: "bearer", tokenHelpUrl: "https://github.com/settings/personal-access-tokens/new" } },
  { id: "supabase", name: "Supabase", description: "데이터·스키마 조회 (내 PAT 토큰)", emoji: "🟢", domain: "supabase.com", category: "데이터", status: "available", scope: "user", preset: { type: "http", url: "https://mcp.supabase.com/mcp", auth: "bearer", tokenHelpUrl: "https://supabase.com/dashboard/account/tokens" } },
  { id: "stripe", name: "Stripe", description: "결제·고객 데이터 조회 (내 API 키)", emoji: "💳", domain: "stripe.com", category: "데이터", status: "available", scope: "user", preset: { type: "http", url: "https://mcp.stripe.com", auth: "bearer", tokenHelpUrl: "https://dashboard.stripe.com/apikeys" } },
  // 무인증 읽기 전용 — 원클릭 연결(토큰 없이 익명 접근, 개인 식별 없음 → 회사 공용)
  { id: "huggingface", name: "Hugging Face", description: "모델·데이터셋 검색 (읽기 전용·무인증)", emoji: "🤗", domain: "huggingface.co", category: "개발", status: "available", scope: "workspace", preset: { type: "http", url: "https://huggingface.co/mcp", auth: "none" } },
  // OAuth(DCR) — 사전등록 없이 "연결" 클릭만으로 인가·토큰 발급까지 자동(직원 개인 계정). 조사 확인(2026-07-09).
  { id: "notion", name: "Notion", description: "페이지·데이터베이스 검색·수정 (내 계정, OAuth)", emoji: "📝", domain: "notion.so", category: "생산성", featured: true, status: "available", scope: "user", preset: { type: "http", url: "https://mcp.notion.com/mcp", auth: "oauth" } },
  { id: "linear", name: "Linear", description: "이슈·프로젝트 관리 (내 계정, OAuth)", emoji: "📐", domain: "linear.app", category: "개발", status: "available", scope: "user", preset: { type: "http", url: "https://mcp.linear.app/mcp", auth: "oauth" } },
  { id: "sentry", name: "Sentry", description: "에러·이슈 모니터링 (내 계정, OAuth)", emoji: "🛡️", domain: "sentry.io", category: "개발", status: "available", scope: "user", preset: { type: "http", url: "https://mcp.sentry.dev/mcp", auth: "oauth" } },
  // 🆕 무인증 읽기 전용 추가(원클릭·회사 공용) — 공식 문서 검증 2026-07-13
  { id: "cloudflare", name: "Cloudflare Docs", description: "Cloudflare 공식 문서 검색 (읽기 전용·무인증)", emoji: "☁️", domain: "cloudflare.com", category: "개발", status: "available", scope: "workspace", preset: { type: "http", url: "https://docs.mcp.cloudflare.com/mcp", auth: "none" } },
  { id: "globalping", name: "Globalping", description: "전 세계 노드에서 ping·traceroute·DNS 측정 (무인증)", emoji: "🌐", domain: "globalping.io", category: "개발", status: "available", scope: "workspace", preset: { type: "http", url: "https://mcp.globalping.dev/mcp", auth: "none" } },
  // 🆕 OAuth(DCR 개방) 추가 — 원클릭 자동 인가(직원 개인 계정). 공식 문서 검증 2026-07-13
  { id: "neon", name: "Neon", description: "서버리스 Postgres 조회·관리 (내 계정, OAuth)", emoji: "🐘", domain: "neon.tech", category: "데이터", status: "available", scope: "user", preset: { type: "http", url: "https://mcp.neon.tech/mcp", auth: "oauth" } },
  { id: "asana", name: "Asana", description: "업무·프로젝트 관리 (내 계정, OAuth)", emoji: "🅰️", domain: "asana.com", category: "생산성", featured: true, status: "available", scope: "user", preset: { type: "http", url: "https://mcp.asana.com/v2/mcp", auth: "oauth" } },
  { id: "atlassian", name: "Atlassian", description: "Jira·Confluence 이슈·문서 (내 계정, OAuth)", emoji: "🧩", domain: "atlassian.com", category: "개발", status: "available", scope: "user", preset: { type: "http", url: "https://mcp.atlassian.com/v1/mcp", auth: "oauth" } },
  { id: "intercom", name: "Intercom", description: "고객 대화·헬프데스크 (내 계정, OAuth·US 워크스페이스)", emoji: "🎧", domain: "intercom.com", category: "커뮤니케이션", status: "available", scope: "user", preset: { type: "http", url: "https://mcp.intercom.com/mcp", auth: "oauth" } },
  { id: "square", name: "Square", description: "결제·주문·고객 데이터 (내 계정, OAuth)", emoji: "⬛", domain: "squareup.com", category: "데이터", status: "available", scope: "user", preset: { type: "sse", url: "https://mcp.squareup.com/sse", auth: "oauth" } },
  { id: "webflow", name: "Webflow", description: "사이트·CMS 콘텐츠 관리 (내 계정, OAuth)", emoji: "🌊", domain: "webflow.com", category: "디자인", status: "available", scope: "user", preset: { type: "http", url: "https://mcp.webflow.com/mcp", auth: "oauth" } },
  { id: "wix", name: "Wix", description: "사이트·비즈니스 데이터 관리 (내 계정, OAuth)", emoji: "🔷", domain: "wix.com", category: "디자인", status: "available", scope: "user", preset: { type: "http", url: "https://mcp.wix.com/mcp", auth: "oauth" } },
  { id: "canva", name: "Canva", description: "디자인 검색·생성·내보내기 (내 계정, OAuth)", emoji: "🖼️", domain: "canva.com", category: "디자인", featured: true, status: "available", scope: "user", preset: { type: "http", url: "https://mcp.canva.com/mcp", auth: "oauth" } },
  { id: "prisma", name: "Prisma", description: "Prisma Postgres 데이터·스키마 (내 계정, OAuth)", emoji: "△", domain: "prisma.io", category: "데이터", status: "available", scope: "user", preset: { type: "http", url: "https://mcp.prisma.io/mcp", auth: "oauth" } },
  // 준비 중 — DCR 미지원(대표가 개발자앱 등록) / 화이트리스트 게이트 / 인증 방식이 프리셋과 불일치. 무리한 연결 대신 카드만 노출.
  { id: "slack", name: "Slack", description: "메시지·채널 조회·전송 (OAuth·앱 사전등록 필요)", emoji: "💬", domain: "slack.com", category: "커뮤니케이션", status: "coming_soon", scope: "user" },
  { id: "figma", name: "Figma", description: "디자인 파일·코드 커넥트 (OAuth·승인된 클라이언트 전용)", emoji: "🎨", domain: "figma.com", category: "디자인", status: "coming_soon", scope: "user" },
  { id: "vercel", name: "Vercel", description: "배포·프로젝트 관리 (OAuth·승인된 클라이언트 전용)", emoji: "▲", domain: "vercel.com", category: "개발", status: "coming_soon", scope: "user" },
  { id: "exa", name: "Exa", description: "AI 웹 검색 (API 키 헤더 방식이 프리셋과 상이)", emoji: "🔎", domain: "exa.ai", category: "데이터", status: "coming_soon", scope: "user" },
  { id: "zapier", name: "Zapier", description: "6천+ 앱 자동화 (계정별 전용 URL 필요)", emoji: "⚡", domain: "zapier.com", category: "생산성", status: "coming_soon", scope: "user" },
  { id: "paypal", name: "PayPal", description: "결제·거래 조회 (OAuth·DCR 미확인)", emoji: "🅿️", domain: "paypal.com", category: "데이터", status: "coming_soon", scope: "user" },
]
