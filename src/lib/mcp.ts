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
  /**
   * oauth 커넥터 중 DCR(동적 클라이언트 등록) 미지원 서비스 — 대표가 OAuth 앱을 등록해
   * client_id/secret을 설정(mcp_oauth_clients)해야만 직원이 연결할 수 있다(구글·Slack·PayPal).
   * true인데 크리덴셜 미설정이면 UI가 "관리자 설정 필요"로 표시(연결 버튼 비활성).
   */
  requiresAppCredential?: boolean
  /** mcp_oauth_clients 조회 키(기본=id). 구글 3형제(Gmail·Cal·Drive)가 하나의 "google" 크리덴셜을 공유하도록. */
  credentialKey?: string
  /** OAuth 인가 스코프(space-separated). 구글처럼 스코프 자동발견이 안 되는 서비스에 명시. */
  oauthScope?: string
  /** 인가 URL에 덧붙일 추가 파라미터. 구글: access_type=offline·prompt=consent(refresh_token 발급). */
  authorizationParams?: Record<string, string>
  /** 사용자가 접속 URL을 직접 입력하는 커넥터(예: Zapier 계정별 MCP URL). preset.url은 폴백/미사용. */
  customUrl?: boolean
}

/** 커넥터의 크리덴셜 조회 키 — mcp_oauth_clients 행 키(공유 크리덴셜 그룹). 기본은 커넥터 id. */
export function credentialKeyFor(connector: Pick<Connector, "id" | "credentialKey">): string {
  return connector.credentialKey ?? connector.id
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
  // 🆕 구글 워크스페이스 — 공식 원격 MCP(Gmail·Cal·Drive). DCR 미지원 → 대표가 Google Cloud에 OAuth 앱 등록해
  //    client_id/secret을 설정(mcp_oauth_clients)해야 연결됨. 3형제가 OAuth 앱 하나(credentialKey="google") 공유.
  //    refresh_token 발급 위해 access_type=offline·prompt=consent 필요(연결 라우트에서 주입). 엔드포인트/스코프 실검증 2026-07-24.
  { id: "google-gmail", name: "Gmail", description: "메일 검색·읽기·초안 작성 (내 계정, 대표 앱 등록)", emoji: "📧", domain: "gmail.com", category: "커뮤니케이션", featured: true, status: "available", scope: "user", requiresAppCredential: true, credentialKey: "google", oauthScope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose", authorizationParams: { access_type: "offline", prompt: "consent" }, preset: { type: "http", url: "https://gmailmcp.googleapis.com/mcp/v1", auth: "oauth" } },
  { id: "google-calendar", name: "Google 캘린더", description: "일정 조회 (내 계정, 대표 앱 등록)", emoji: "📅", domain: "calendar.google.com", category: "생산성", status: "available", scope: "user", requiresAppCredential: true, credentialKey: "google", oauthScope: "https://www.googleapis.com/auth/calendar.events.readonly", authorizationParams: { access_type: "offline", prompt: "consent" }, preset: { type: "http", url: "https://calendarmcp.googleapis.com/mcp/v1", auth: "oauth" } },
  { id: "google-drive", name: "Google 드라이브", description: "파일 검색·읽기 (내 계정, 대표 앱 등록)", emoji: "📁", domain: "drive.google.com", category: "문서", status: "available", scope: "user", requiresAppCredential: true, credentialKey: "google", oauthScope: "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file", authorizationParams: { access_type: "offline", prompt: "consent" }, preset: { type: "http", url: "https://drivemcp.googleapis.com/mcp/v1", auth: "oauth" } },
  // 🆕 Slack·PayPal — 공식 원격 MCP·DCR 미지원 → 대표 앱 등록(client_id/secret) 후 연결. 엔드포인트 실검증 2026-07-24.
  { id: "slack", name: "Slack", description: "메시지·채널 조회·전송 (내 계정, 대표 앱 등록)", emoji: "💬", domain: "slack.com", category: "커뮤니케이션", status: "available", scope: "user", requiresAppCredential: true, credentialKey: "slack", authorizationParams: { prompt: "consent" }, preset: { type: "http", url: "https://mcp.slack.com/mcp", auth: "oauth" } },
  { id: "paypal", name: "PayPal", description: "결제·거래 조회 (내 계정, 대표 앱 등록)", emoji: "🅿️", domain: "paypal.com", category: "데이터", status: "available", scope: "user", requiresAppCredential: true, credentialKey: "paypal", preset: { type: "http", url: "https://mcp.paypal.com/mcp", auth: "oauth" } },
  // Zapier — 계정별 전용 MCP URL(사용자가 붙여넣기). URL 자체에 시크릿 포함 → 저장 스키마 별도 조정 필요(fast-follow). 지금은 카드만.
  { id: "zapier", name: "Zapier", description: "6천+ 앱 자동화 (내 전용 MCP URL 붙여넣기 — 준비 중)", emoji: "⚡", domain: "zapier.com", category: "생산성", status: "coming_soon", scope: "user", customUrl: true },
  // Exa — 개인 API 키(bearer). 대표 액션 0.
  { id: "exa", name: "Exa", description: "AI 웹 검색 (내 API 키)", emoji: "🔎", domain: "exa.ai", category: "데이터", status: "available", scope: "user", preset: { type: "http", url: "https://mcp.exa.ai/mcp", auth: "bearer", tokenHelpUrl: "https://dashboard.exa.ai/api-keys" } },
  // 준비 중 — 화이트리스트 게이트(승인된 client_name만) / 사실상 막힘. 무리한 연결 대신 카드만 노출.
  { id: "figma", name: "Figma", description: "디자인 파일·코드 커넥트 (OAuth·승인된 클라이언트 전용)", emoji: "🎨", domain: "figma.com", category: "디자인", status: "coming_soon", scope: "user" },
  { id: "vercel", name: "Vercel", description: "배포·프로젝트 관리 (OAuth·승인된 클라이언트 전용)", emoji: "▲", domain: "vercel.com", category: "개발", status: "coming_soon", scope: "user" },
]

/** 대표가 OAuth 앱을 등록해 client_id/secret을 넣어야 연결되는 크리덴셜 그룹(설정 화면 SSOT).
 *  여러 커넥터가 한 앱을 공유(구글 3형제 = 하나의 "google" 앱). requiresAppCredential 커넥터를 credentialKey로 묶는다. */
export type AppCredentialGroup = {
  key: string
  label: string
  /** 개발자 콘솔 링크(대표가 앱 등록하러 가는 곳) */
  setupUrl: string
  /** 무엇을 등록하는지 짧은 안내(스코프·주의) */
  help: string
  connectorIds: string[]
}

const APP_CREDENTIAL_META: Record<string, { label: string; setupUrl: string; help: string }> = {
  google: {
    label: "Google Workspace (Gmail·캘린더·드라이브)",
    setupUrl: "https://console.cloud.google.com/apis/credentials",
    help: "Google Cloud → OAuth 동의화면 구성 → '웹 애플리케이션' OAuth 클라이언트 ID 생성. 아래 리디렉션 URI 3개와 각 커넥터의 스코프를 동의화면에 등록하세요. 앱이 '테스트' 모드면 refresh 토큰이 7일 만에 만료되니 '게시(프로덕션)'로 전환하세요.",
  },
  slack: {
    label: "Slack",
    setupUrl: "https://api.slack.com/apps",
    help: "api.slack.com에서 앱을 만들고, 아래 리디렉션 URI를 OAuth Redirect URLs에 등록한 뒤 client_id/secret을 넣으세요.",
  },
  paypal: {
    label: "PayPal",
    setupUrl: "https://developer.paypal.com/dashboard/applications",
    help: "developer.paypal.com에서 앱을 만들고 아래 리디렉션 URI를 등록한 뒤 client_id/secret을 넣으세요.",
  },
}

/** requiresAppCredential 커넥터를 credentialKey로 묶어 크리덴셜 그룹 목록을 만든다(설정·게이팅 공용). */
export function appCredentialGroups(): AppCredentialGroup[] {
  const byKey = new Map<string, string[]>()
  for (const c of MCP_CONNECTORS) {
    if (!c.requiresAppCredential) continue
    const k = credentialKeyFor(c)
    byKey.set(k, [...(byKey.get(k) ?? []), c.id])
  }
  const groups: AppCredentialGroup[] = []
  for (const [key, connectorIds] of byKey) {
    const meta = APP_CREDENTIAL_META[key]
    if (!meta) continue
    groups.push({ key, label: meta.label, setupUrl: meta.setupUrl, help: meta.help, connectorIds })
  }
  return groups
}
