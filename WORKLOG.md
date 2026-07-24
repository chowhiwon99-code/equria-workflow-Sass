# WORKLOG — 작업 로그 (최신이 위)

> 매 작업마다 **무엇을·왜·쪼갠 내용·예상이슈 체크**를 기록한다(대표 리뷰용). 현재 상태/정책은 `HANDOFF.md`.
> 작업 방식(합의): ① 단계별로 잘게 진행(한 번에 큰 배치 금지, 코드 안 꼬이게) ② 매 작업 후 예상이슈 점검 ③ 쪼개서 설명 ④ 이 파일 갱신 ⑤ 기존 디자인 유지 · 사용자 편의 최우선.

---

## 2026-07-24 · 세션38 — 트랙1: MCP 정적 OAuth 클라이언트 인프라 (구글·Slack·PayPal 연결)

**무엇/왜:** 세션37 분석의 트랙1 실행. 구글(Gmail·Cal·Drive)·Slack·PayPal의 원격 MCP는 **DCR 미지원** → 대표가 각 서비스에 OAuth 앱을 등록해 받은 client_id/secret을 넣어야 직원이 자기 계정으로 연결 가능. 마이그107 1개(추가형). tsc0·lint29/0(신규0)·build0·main-first. **배포 `a8b832f`·롤백 `9b17bff`.** ⚠️ 대표 OAuth 앱 등록 선행 필요(아래 액션) · 실사용 육안 미검증.

- **핵심 근거(@ai-sdk/mcp 1.0.45 소스 직접 검증)**: `auth()`는 `clientInformation()`이 값을 반환하면 **DCR(동적 등록)을 건너뛴다**(index.js ~1021) → 정적 client를 seed하면 DCR 재등록이 아예 안 일어나 정적값이 안 덮임. 토큰 교환 auth 메서드는 우리 `clientMetadata`가 아니라 **secret 유무로 자동 결정**(`selectClientAuthMethod` ~748, secret 있으면 `client_secret_post`) → **구글 confidential 클라이언트도 코어 수정 없이 작동**. 스코프는 `provider.clientMetadata.scope`에서 옴(~1094). 구글식 `access_type=offline`은 SDK가 안 붙임(`offline_access`만 처리) → 연결 라우트에서 주입.
- **엔진(커밋 `0f3a0b9`)**: 마이그107(`mcp_oauth_clients.is_static` + `mcp_user_connections.custom_url`, 추가형·멱등, Supabase MCP 적용·drift0) · `oauth.ts` 가드: is_static이면 redirect_uri 자가치유(마이그102) 건너뛰어 정적값 무효화 방지 + `persistClientInformation`이 정적 행을 DCR 결과로 안 덮음 + `credKey()`로 credentialKey 해석(구글 3형제=한 앱 공유) + `clientMetadataFor`에 커넥터별 `oauthScope` · connect 라우트가 인가 URL에 커넥터별 `authorizationParams`(구글 `access_type=offline·prompt=consent`=refresh_token) 주입 · `lib/mcp.ts` Connector 타입 확장(requiresAppCredential·credentialKey·oauthScope·authorizationParams·customUrl)+`credentialKeyFor()`.
- **오너 크리덴셜(커밋 `8e6ed14`)**: 신규 `/api/mcp/oauth-clients`(오너 게이트, `workspaces.owner_id`) GET(그룹 현황·`configured`는 전 로그인유저=McpView 게이팅용, client_id 유무는 오너만·**secret 값 절대 미반환**)·POST(등록·secret 미입력 시 기존값 보존, `is_static=true` 저장)·DELETE · 자체 완결 `McpCredentialsCard`(그룹별 client_id/secret 입력 + **콘솔에 등록할 리디렉션 URI 복사** + 콘솔 링크·스코프 안내) · SettingsView 오너일 때만 렌더.
- **카탈로그+게이팅(커밋 `a8b832f`)**: 카탈로그에 **Gmail·Google캘린더·Google드라이브**(credentialKey `google` 공유·엔드포인트 `*mcp.googleapis.com/mcp/v1`·스코프 명시)·**Slack**(`mcp.slack.com/mcp`)·**PayPal**(`mcp.paypal.com/mcp`)을 available·oauth·requiresAppCredential로 추가(웹조사 실검증 2026-07-24). McpView: requiresAppCredential인데 대표 크리덴셜 미설정이면 **'관리자 설정 필요'** 표시(깨진 연결 방지)·`/api/mcp/oauth-clients`로 설정 여부 조회.
- **⚠️ 대표 액션(값 주면 배선 끝·병렬 가능)**: ①⭐구글 — Google Cloud Console(`console.cloud.google.com/apis/credentials`)에서 OAuth 동의화면 구성(스코프: gmail.readonly·gmail.compose·calendar.events.readonly·calendar.events.freebusy·drive.readonly·drive.file) + '웹 애플리케이션' OAuth 클라이언트 생성 → **리디렉션 URI 3개**(`https://complow.kr/api/mcp/oauth/google-gmail/callback`·`.../google-calendar/callback`·`.../google-drive/callback`) 등록 → 앱 '게시(프로덕션)' 전환(테스트 모드=refresh 7일 만료) → 설정 'MCP 앱 크리덴셜'에 client_id/secret 입력. ②Slack — api.slack.com 앱+리디렉션 `.../oauth/slack/callback`. ③PayPal — developer.paypal.com 앱+리디렉션 `.../oauth/paypal/callback`.
- **남긴 것(fast-follow)**: **Zapier 커스텀 URL** — URL 자체에 시크릿이 포함돼 저장 스키마(암호화·`auth_method` 제약·nullable token) 별도 조정 필요 → 준비중 유지(customUrl 타입·custom_url 컬럼은 미리 넣어둠). 구글 등 OAuth 정적경로 완결 우선.

**다음 후보**: 대표 크리덴셜 입력 후 **실연결 1회 육안 검증**(브라우저 OAuth 왕복은 대표만 가능) · Zapier 커스텀URL 마무리 · 트랙2 대화 요약 압축.

---

## 2026-07-24 · 세션37(이어서3) — 자동기억 품질 고도화 + Exa 활성화 + MCP 연결 로드맵 분석

**무엇/왜:** 대표 dogfood 연속. 마이그 불필요(106 재사용). 각 tsc0·lint29/0(신규0)·build0·main-first.

- **자동기억 품질 고도화(배포 `4e8fb6f`)**: 자동추출이 ① **중요도 자동 매김**(`memoryExtractionSchema`에 importance 1~3 추가 → 핵심 규칙=높음, insert 반영 → 중요도순 주입 즉시 반영) ② **근접중복 차단**(`dedupeCandidates`를 정확일치→`similarMemory`=포함관계+토큰 자카드≥0.6로 확장, 기존·이번 후보 양쪽 대비 → "보고서는 표로" ~ "보고서는 항상 표로 정리" 사실상 중복 안 쌓임). `clampImportance` 방어. 추출 프롬프트 중요도 규칙 추가.
- **Exa 커넥터 활성화(배포 `58b6783`)**: 웹조사 확인 — Exa 원격 MCP(`mcp.exa.ai/mcp`)가 `Authorization: Bearer <API키>` 지원 → 기존 bearer 프리셋과 일치. '인증 방식 상이'로 준비중이던 것 → **available 전환**. 직원 각자 Exa 키로 원클릭. 대표 등록 불필요.
- **MCP 연결 로드맵 분석(코드 변경 없음·조사)**: 대표 "구글 MCP 연결"·"준비중 왜 안 되나" 질문에 실제 웹조사로 답. **핵심 발견**: ① 구글은 이제 **공식 원격 MCP 있음**(내 이전 "없다" 정정) — DCR 없어 대표 OAuth 앱 등록 필요 ② 우리 OAuth가 `mcp_oauth_clients`에서 client 정보 읽어 **정적 client_id/secret 주입 시 DCR 건너뛰고 작동**(Slack·구글·PayPal 공통 경로) ③ Exa=bearer(즉시), Zapier=계정별 URL(커스텀URL 필요), Vercel=승인게이트, Figma=사실상 막힘(DCR 403·승인클라 전용). → 상세·대표 액션·개발 계획 = **HANDOFF "다음 세션 착수" 블록**.

**다음(HANDOFF 착수 블록):** 트랙1=MCP 정적 클라이언트 인프라(구글·Slack·PayPal, 대표 OAuth 앱 등록 선행) · 트랙2=대화 요약 압축. context 정리 후 다음 세션 진행.

---

## 2026-07-24 · 세션37(이어서2) — 로딩바 + 기억 정리(AI·마이그106) + 대화 히스토리 3종

**무엇/왜:** 대표 dogfood 연속 피드백. 마이그106 1개(추가형). 각 tsc0·lint29/0(신규0)·build0·main-first.

- **답변 로딩 인디케이터(배포 `a419dba`)**: 유튜브식 얇은 상단 바(`equria-loadbar`, 헤더 밑 2px 좌→우, submitted/streaming 중, 끝나면 사라짐). reduced-motion=정적 폴백. '생각 중…' 텍스트 대체.
- **기억 정리(AI·배포 `fe810cb`, 마이그106)**: 대표 지적 "기억 쌓이면 지저분(쓰레기·중복·분류 뭉개짐)". `agent_memories.importance`(1~3) 추가 + 채팅 주입을 중요도순으로. '기억 관리'에 **'AI로 정리'**(수동) → 신규 `/memory/organize`가 Sonnet으로 병합·중복제거·쓰레기제거·재분류·중요도 매김 제안(읽기전용) → **before→after 미리보기** → `/organize/apply`가 새목록 insert + 기존 soft-delete(휴지통 복구·RLS 본인만). 패널을 **종류별 그룹+중요도 배지**로 재구성. 자동추출·suggest 프롬프트에 명령문·일회성 제외 명시(쓰레기 원천 차단). ⚠️마이그106 Supabase MCP 적용·drift0.
- **대화 히스토리 3종(배포 `4e0ba45`)**: 대표 지적 "위젯 닫으면 대화 사라져 앞 내용·의도 파악 끊김". 실은 DB(conversations/messages)에 다 저장돼 있고 화면 복원만 없던 것 → 불러오기 배선(DashboardAssistant 검증 패턴 이식). ① **재오픈 복원**(열 때 이어지던 대화 메시지 하이드레이션) ② **새로고침 유지**(conversationIdByAgent 메모리→localStorage 영속) ③ **과거 대화 열람**(신규 `/agents/[id]/conversations` 목록·`/[convId]` 메시지·DELETE, 소유권 가드 + 위젯 하단 '새 대화'·'대화 목록' 버튼·목록 패널). 마이그 불필요.
- **[객관적 판단 기록]** 대표 아이디어 "대화량↑=AI 멍청 게이지"는 **반려**: 채팅 라우트가 최근 10개(`HISTORY_WINDOW`)만 보내는 슬라이딩 윈도우+1M 컨텍스트라, 게이지는 "차오름" 오해를 줌. 실제 문제는 **망각(truncation)**·불연속. 정직한 대안=히스토리 복원(이번 배포)·요약 압축(다음)·넛지. 대표 승인=히스토리 먼저.

**다음 후보**: 요약 압축(길어져도 연속성)·정직한 기억 경계 표시 · 자동기억 품질 고도화(유사 병합) · 공용비번 강화·Gmail/Drive 복구(대표) · B1-b Step1b.

---

## 2026-07-24 · 세션37(이어서) — 품질 루프 강화: 채팅 원클릭 기억 + 제작 되물음 인터뷰

**무엇/왜:** 자동기억 v2 배포 후 대표 요청 2건. ① 채팅 중 좋은 답변을 복사·붙여넣기 없이 원클릭으로 기억 저장 ② 에이전트 제작 시 더 디테일한 기획을 요구("정확한 기획 → 정확한 결과"). 계획=`~/.claude/plans/reactive-napping-wall.md`(대표 승인). 마이그 불필요(agent_memories/agent_versions 재사용), 전부 추가형. 신규 AI 라우트는 checkBudget+agent_usage+withWorkspace 기존 패턴 준수.

- **Part A — 채팅 원클릭 '기억하기'**: 답변 버블 hover에 복사 옆 '기억하기'(Brain) → **Haiku가 그 답변에서 오래 쓸 한 줄 추출**(신규 `/api/agents/[id]/memory/suggest`, `memorySuggestSchema`) → 인라인 확인·수정·kind 선택 → 기존 memory POST로 저장. 첫 답변 시 **1회성 안내**(localStorage dismiss). `Bubble`에 agentId/conversationId prop, sourceConversationId best-effort. 복사·붙여넣기 루프 제거. 위젯 '기억 관리' 패널은 무변경(자동 노출).
- **Part B — 에이전트 제작 AI 되물음 인터뷰 + 항목 강화**(전략문서 §4 온보딩 인터뷰의 첫 실체): 위저드 마지막 질문 → 생성 직전 새 phase `interview`. 신규 `/api/agents/interview`가 **Sonnet으로 빈틈**(예시없음·성공기준모호·엣지케이스·회사규칙) **2~4개 되물음**(`interviewSchema`) → 답하거나 건너뛰기 → `clarifications`를 generate-prompt에 반영(SKILL_MD_SYSTEM 규칙8=최우선 근거). **성공 기준**(`successCriteria`) 필드 신설(required)·예시 강력권장. `SKILL_MD_SYSTEM`: **'성공 정의' 섹션 추가**·측정가능 합격선 지시·**K-뷰티 하드코딩 가드레일을 업종무관으로 중립화**(브랜드 정책 정합, P2.3 일부). 인터뷰 실패/빈틈없음이면 바로 생성(막지 않음).
- **파일**: 신규 `api/agents/[id]/memory/suggest`·`api/agents/interview` · `lib/claude/schemas.ts`(memorySuggest·interview) · `lib/agentBuilder.ts`(successCriteria·메타프롬프트) · `api/agents/generate-prompt`(clarifications) · `components/agent-chat/FloatingAgentChat.tsx`(Bubble 버튼·확인행·힌트) · `components/agents/AgentWizard.tsx`(interview phase).
- **검증**: tsc0 · lint29/0(신규0) · build0 · 신규 라우트 2개 등록 확인. main-first 배포(코드 `d0e24ab`, 롤백=직전 프로덕션 `311cf4c`). **⚠️ 실사용 육안 미검증(로그인 비번 없음)=대표 dogfood.**

**다음 후보**: 위 2종 dogfood 후 고도화(추출 품질·유사기억 병합·인터뷰 질문 튜닝) · 공용비번 강화·Gmail/Drive 복구(대표) · B1-b Step1b.

---

## 2026-07-24 · 세션37 — 에이전트 자동 기억(v2) + 마이그105 적용 + Stripe 오식별 정정

**무엇/왜:** 쉬고 온 뒤 이어서. ① 세션36 "Stripe 키 폐기" 대표 액션이 실제로 유효한지 역추적 → **오식별로 판명·종결**(별도 커밋 `beaf222`, 위 정정 블록). ② 미적용이던 **마이그105 프로덕션 적용**(참고사항 메모·멤버 수정권한이 죽어 있던 것 복구). ③ 워크스페이스 고도화 첫 착수 = **에이전트 자동 기억(학습 v2)**.

- **마이그105 적용·검증(Supabase MCP)**: `projects`에 `notes`·`deleted_at` 컬럼 + `projects_update` RLS에 project_members OR 추가. 롤백 지점(035 원문=created_by/owner_id만) 사전 확보. 적용 후 컬럼·정책 재조회로 검증. 코드는 이미 배포돼 있어 재배포 불필요 — 참고사항 메모·멤버 중요도/상태 변경이 라이브에서 살아남.
- **에이전트 자동 기억 v2 (수동 '기억해두기' → 자동 추출)**: 세션35 v1은 수동이라 실사용에서 거의 안 쓰이던 문제. **대화가 쌓이면 요점을 자동 추출·저장**하게. 마이그 불필요(099 `agent_memories` 재사용).
  - **설계**: 트리거=채팅 라우트 `onFinish`(응답 끝난 뒤 백그라운드, 사용자 대기 0) · 빈도=사용자 턴 **3의 배수**마다(비용/지연 방어) · 모델=**Haiku**(`MODELS.cheap`=claude-haiku-4-5, $1/$5) · 중복방지=기존 기억을 프롬프트에 주입("겹치면 만들지 마") + 코드 정규화 비교(`normalizeMemoryContent`) **2중** · 안전=budget 이미 상단 통과·`agent_usage` 성공/실패 기록·try/catch로 채팅 절대 안 깨짐.
  - **파일**: `lib/claude/client.ts`(cheap 별칭) · `lib/claude/schemas.ts`(`memoryExtractionSchema`) · `lib/agentMemory.ts`(순수 헬퍼: `EXTRACTION_SYSTEM`·`buildExtractionPrompt`·`dedupeCandidates`·`normalizeMemoryContent`·`ExtractTurn`) · **신규 `lib/agentMemoryExtract.ts`**(generateObject→dedup→insert, 기존 기억 최근40 비교, RLS 본인만) · `api/agents/[id]/chat/route.ts`(userTurns 카운트·`turnsForExtraction` 800자컷·onFinish 배선). agent_memories는 개인용(워크스페이스 컬럼 없음)이라 withWorkspace 미사용.
  - **위젯 무변경**: '기억 관리' 패널이 agent_memories를 그대로 조회 → 자동 추출분도 자동 노출.
  - **예상이슈**: onFinish가 Haiku 호출만큼(~1-3s) 길어짐=사용자 무영향(텍스트 이미 렌더·maxDuration 60s 내) / 할루시네이션 중복=2중 방어 / 마이그 불필요.
  - **검증**: tsc0 · lint29/0(신규0·베이스라인 30에서 오히려 -1) · build0. **⚠️ 실사용 육안 미검증(로그인 비번 없음) — 대표 dogfood 필요.**
- **Stripe 키 정정(커밋 `beaf222`)**: 세션35 "Vercel WORKSPACE_PASSWORD=Stripe 라이브 키" 단정을 트랜스크립트 역추적 → 대표가 보낸 Vercel 스크린샷의 잘린 값을 읽은 **추정**이었음(당시 기록도 "값 Sensitive라 못 봄"·"앞부분만 잘려 보임"·확인은 유도질문). 실제 키값 트랜스크립트 0건 + 대표 확인 Stripe 가입 이력 없음 → **폐기 대상 없음, 종결**. 레포 clean(전수검색 0건). HANDOFF 미해결①=✅종결, 교훈=스크린샷 판독은 추정으로 표기.

**다음 후보**: 자동 기억 dogfood 후 고도화(추출 품질·병합 로직·프로젝트공유 v1.5) · 공용비번 `4321`→강한값(대표) · Gmail/Drive 복구(대표) · B1-b Step1b(나머지 ~50곳 배선).

---

## 2026-07-22 · 세션36(이어서) — B1-b 착수 + 프로젝트 협업/허브 (대표 dogfood 피드백)

**무엇/왜:** 맹점 배포 후 대표 실사용 피드백으로 연속 작업. 매 건 본보기코드+검증(tsc0·lint29~30/0·build0).

- **B1-b 쓰기격리 착수(무위험)**: `WorkspaceProvider`/`useWorkspace`(Step0, 서버레이아웃 멤버십 로드) + `lib/workspace.ts`(`getUserWorkspaceId`·`withWorkspace`) → **AI 대화·사용량 도메인 서버 22곳**에 `workspace_id` 명시(Step1a: chat·assistant·cashflow-coach·workflows/run·리서치5). 단일 테넌트엔 값==DEFAULT라 동작 변화 0. 감사 finding 1D(agent_usage 예산우회) 선제 해소. 남은 도메인(client·projects·finance 등 ~50곳)·DEFAULT 제거는 후속.
- **프로젝트 협업 개선(마이그105)**: `projects_update` RLS에 project_members OR 추가(멤버도 중요도/상태 변경) + `deleted_at`(소프트삭제) + `notes`(참고사항) + 상태 배지 **점→아이콘**(완료=CircleCheck 등) + 목록/상세 삭제 버튼(생성자). ⚠️마이그105 프로덕션 직접적용 필요.
- **프로젝트 삭제 하드전환**: 소프트삭제가 미적용 마이그105 컬럼 의존이라 안 되던 걸 **하드삭제(기존 DELETE RLS=created_by, 마이그 불필요)** 로. FK 검증 = finance/files/calendar SET NULL(보존)·members/tasks CASCADE(정상). Undo=행 재삽입.
- **프로젝트 상세 = 일정·정산 허브(죽은 요약카드 살리기)**: 요약카드 3개가 연결 UI 부재로 항상 0이던 근본원인 규명(2병렬 조사) → ① 연결된 일정 섹션(calendar_events.project_id 인라인 추가) ② 비용·매출 정산 섹션(FinanceEntryModal 재사용+projectId 주입, **통화별 합계+순익**, 통화 섞어 더하던 버그 수정=aggregateByCurrency+money) ③ 요약카드 라이브+클릭 스크롤. **마이그 불필요**(project_id 컬럼 이미 존재). 계획=`~/.claude/plans/snazzy-booping-muffin.md`.

---

## 2026-07-22 · 세션36 — 맹점 5종 수정 배포 (신뢰성 4 + 보안 SSRF 1) + 마이그104

**무엇/왜:** 대표 요청 "맹점 파악·우선순위대로 하나씩 수정". 코드 3병렬 감사(API보안·멀티테넌시 쓰기격리·AI/신뢰성)로 발견한 **실사용 버그·보안구멍**을 우선순위대로 수정. 매 수정 **본보기 코드(Before→After)** 제시. tsc0·lint30/0·build0·main-first.

- **#1 워크플로우 도구 CHECK 위반 (HIGH · 마이그104)**: `save_file`(source='workflow')·`notify`(type='workflow')가 CHECK 제약에 없어 매번 INSERT 실패 → 파일은 `files` 버킷에 **고아**로 남고 "저장됨" **거짓 보고**(save_file은 insert 에러조차 미캡처였음). 관례대로 CHECK 확장(files 004·notif 076 기준으로 'workflow' 추가) + `run/route.ts` insert 에러 캡처·실패 시 고아 파일 `remove`. UI는 이미 `lib/files.ts`에 "워크플로우 결과" 라벨 보유 → 값만 열어주면 정합. **마이그104는 이 세션 Supabase MCP/CLI 부재로 프로덕션 SQL Editor에 대표가 직접 적용 완료(Success).**
- **#2 채팅 비용 과소집계 (HIGH)**: MCP 다단계(도구) 에이전트가 `usage`(마지막 스텝만)로 과금 → `totalUsage ?? usage` 합산(`run/route.ts:274`와 동일). 예산 한도 정확도 회복.
- **#3 OAuth 토큰 저장 (MED · Gmail/Notion 끊김 유력원인)**: `google/client.ts` `auth.on("tokens", …)`가 `void admin.update()`라 **HTTP 미전송**(lazy thenable, safe-changes §5) → 회전 refresh_token 유실 → 시간 지나면 Gmail/Drive 조용히 끊김. 핸들러 async+await로 실제 저장 + 에러 로깅.
- **#4 알림 읽음 저장 (MED)**: `NotificationBell.open()`도 동일 `void update()` → 새로고침 시 배지 오표시. async+await로 수정(`markAllRead`는 이미 정상이라 불일치 해소).
- **#10 SSRF 하드닝 (MED)**: 가드(`safeHttpUrl`/`isSafeWebhookUrl`)가 **최초 URL 호스트명 문자열만** 검사 → 302 리다이렉트·DNS 리바인딩으로 내부IP(169.254.169.254 등) 우회 가능. 공용 **`safeFetch`**(`lib/safeFetch`): ① DNS 실제 IP 공인검증(v4/v6 사설·loopback·링크로컬·CGNAT·IPv4-mapped) ② 리다이렉트를 fetch에 안 맡기고 **수동 매 홉 재검증**. 웹훅=`maxRedirects:0`(리다이렉트 차단), 리서치 이미지 2곳=3홉(CDN 허용·재검증). 3 sink(webhook·research/images·image-import) 배선.

**예상이슈 체크(수행):** ① 마이그104 미적용 상태로 코드 배포해도 무해 — save_file이 이제 깔끔히 실패처리+고아정리(적용 후 정상저장). ② `open()` async화 → 호출부 `onClick={() => open(n)}`라 반환 promise 무시=안전. ③ `safeFetch`의 `redirect:"manual"`은 Node(undici) fetch에서 3xx 실제 응답+Location 반환(브라우저 opaque와 다름) — 수동 추적 성립. ④ 잔여 위험: check→connect 사이 초고속 DNS-flip 리바인딩은 IP핀 없이는 잔여(LOW·내부툴, known-issues I18). 검증 tsc0·lint30/0·build0.

**롤백:** 직전 프로덕션 **`a0e86bd`**. 마이그104 롤백=두 constraint 배열에서 'workflow'만 제거 재적용.

---

## 2026-07-16 · 세션35 — P2.2 출력형식 재설계 + 채팅 진입 하단 스크롤(4곳) + 학습/기억 기획 착수

**무엇/왜:** ① 세션34 다음 우선순위 P2.2 진행 ② 대표 지시 "채팅 들어가면 바로 최근 대화(하단)에 있어야 함" ③ 대표 신규 방향: 예시 갤러리 불필요·개인 맞춤 우선 + **작업할수록 학습/기억(많은 사용자에도 스케일)** + 결과물 저장·확인 + 기술 병목 분석 후 기획·설계.

- **P2.2 출력형식 재설계 (배포 `cf5684e`)**: `agentBuilder.ts`에 `OUTPUT_FORMATS`(SSOT) + `recommendOutputFormat(직무)`. 추상 9개 multiselect → **업무언어 6개 단일선택**(바로쓰는초안/한눈요약/정리된표/단계별안내/완성형문서/자유롭게) + 각 **한줄설명·미니예시** + step1 **직무 기반 '추천' 배지**. `WizardField.hint` 추가, 위저드에 outputFormat 전용 카드 렌더(제네릭 select 분기), '직접 입력' 이스케이프 유지. 템플릿/직접작성폼은 outputFormat 미참조 → 영향 국소.
- **채팅 진입 하단 스크롤 4곳 정합 (배포 `aed63d9`)**: 원인 갈림 —
  - **DirectChat(1:1)**: 루트 `h-full`이 세션31 리디자인 때 추가된 `PageTransition`(`animate-page-in`, auto-height) 래퍼 밑에서 **높이 사슬 끊김** → 내부 `overflow-y-auto`가 bounded 안 됨 → `<main>`이 스크롤 → 진입 시 최상단. **회귀 근본원인.** → 루트 `h-[var(--app-content-height)]`(대시보드·그룹챗 관례)로 bounded 복원.
  - **GroupChat**: bounded지만 `[roomId]` 페이지에 key 없어 방 전환 시 remount 안 됨(`didInitialScroll` ref 유지). → `key={roomId}`.
  - **DashboardAssistant·FloatingAgentChat 위젯**: 히스토리/스트리밍 모두 `smooth`만. → `jumpToBottom` ref로 진입·대화전환=즉시(`auto`), 스트리밍만 `smooth`.
- **학습/기억 기획 착수(설계 前)**: 대표 워크플로우(higgsfield+Claude 반복 학습→퀄↑, 결과물 저장·확인)를 Complow에서 쉽게. **기술 병목 집중 분석 리서치 2갈래**(① 개인 메모리 at scale ② RAG/생성 파이프라인 at scale) 병렬 → 종합 후 기획 문서화 예정. 핵심 = 파인튜닝 아님, **앱레벨 메모리(추출+검색 하이브리드)로 스케일**, 격리는 RLS가 강제. **v1 착수: `AGENTS-LEARNING-DESIGN.md` 작성 + 마이그 099(`agent_memories` 개인용·본인만 RLS) 적용·격리검증(A본인=1·B타인=0)·drift0.** 대표 결정=갤러리 인터뷰교체·학습v1 먼저·기억=사용자×에이전트(+프로젝트공유 v1.5). → ✅ **수동 기억 루프 배포(`a2d73be`·롤백 `ebd30d2`)**: `lib/agentMemory`(buildMemoryBlock)·기억 API(GET/POST/DELETE, RLS 본인만)·채팅 라우트 주입(활성 최근30, 지식파일 다음, 없으면 스킵)·위젯 `AgentMemoryPanel`('기억 관리' 토글=추가/목록/삭제·soft-delete)·types.ts agent_memories. tsc0·lint30/0·build0. **대표 방침 = 만들고 쓰면서 점검 후 고도화**(내부 dogfood). **개념 정리(대표 문답): "학습"=파인튜닝 아닌 앱레벨 기억 / 저장은 무제한(로그처럼)·주입만 소수 선별 / 로그·기억 모두 에이전트별·사용자별(conversations.agent_id+user_id, agent_memories RLS) / 프로젝트 공유는 v1.5.** 다음=자동 추출(대화 종료 시 요점)·중복병합.
- **에이전트 만들기 진입 재설계 (배포 `3395892`→`844e79f`→`d5ea4b9`, 대표 dogfood 피드백 반영)**: ① 출력형식 카드→열린 입력 전환 → ② 예시 **완전 제거** + 배경 **떠다니는 에이전트 아이콘 7개**(`animate-float` 재사용, opacity 0.16, motion-safe) → ③ **MCP 연결 스텝을 직무 다음에 추가**(`McpConnectorPicker`: `/api/mcp/user-connections`에서 내 커넥터 선택, `/mcp` 새탭 링크, 결과폼에 `mcp_connectors` 전달=세션34 바인딩 재사용). `WizardFieldType`에 `mcp` 추가·`serializeInputs`서 제외. `AGENT_TEMPLATES`/`pickTemplate` 제거. 대표 지침: "만드는 건 쉽고 잘 되게가 일"(MCP 연결≠좋은 결과, 품질은 dogfood로).
- **MCP UX·프라이버시·직접작성 제거 (배포 `369ce2c`→`f1dccea`+본커밋)**: ① **MCP 스텝 재설계**(`McpConnectorPicker`) — 연결한 것만→**사용 가능 커넥터 전체**(연결됨=선택 / 미연결='연결하면 쓸 수 있는 도구 N개' 펼침+`/mcp` 새탭+계정필요 배지). ② **도구설명 AI 한국어 요약**(`lib/mcp/summarize`, generateObject·sonnet-4-6, 테스트/연결 시 1회→`mcp_user_connections.tools`에 `summaryKo` 캐시, 표시=summaryKo||MCP_TOOL_KO||description·방어적). ③ 커넥터 **실제 로고**(McpView `ConnectorLogo` 공용 추출→위저드 MCP 스텝도 도메인 파비콘, emoji 폴백). ④ **프라이버시 3종**: 지식파일 개인전용(마이그**100** `is_personal`·ak_select 재작성·RLS시뮬 소유자2/타인1, KnowledgeFilePicker 파일별 개인전용/공유 토글) · 관리자 구성원별 사용량(마이그**101** RPC `admin_usage_by_member` **오너전용** security definer·게이팅시뮬 오너4/비오너0, SettingsView 표·**대화 내용 미노출**) · 개인 파일 '🔒 개인(나만)' 라벨(044 재사용). 합의=AI채팅·기억·개인연결·개인전용지식=본인만·관리자는 사용량만. ⑤ **직접작성(manual) 모드 완전 제거**(대표: 가이드 마법사만) — `mode`/manual블록/`PenLine`/'직접 작성으로 전환' 2곳 제거, **아이콘 선택은 결과폼 AgentBuilderForm에 그대로**, 갤러리 '이걸로 만들기'→**'다음'**(말이 이상). **Notion 연결 401**=재연결 안내(refresh는 코드상 배선됨 `McpOAuthRuntimeProvider`, 토큰·갱신토큰 무효 시 재연결 필요). 각 tsc0·lint30/0·build0. 대표 문답: 새 사용자 가입=이름+공용비번(`WORKSPACE_PASSWORD`)·AI채팅 본인만 격리 확인.
- **구성원 삭제(오너 전용, 배포별도)**: `/api/members/[id]` DELETE — 오너 검증(workspaces.owner_id) + 대상=내 워크스페이스 멤버 + 본인 아님 → `admin.auth.admin.deleteUser`. profiles=`auth.users` on delete cascade라 그 사람 **개인 데이터(대화·기억·연결)만** 연쇄삭제, **공유 자원(에이전트·워크플로우·프로젝트 created_by=set null)은 보존**(FK 확인). 설정 구성원 행에 🗑 + **2단계 확인**(오삭 방지). tsc0·lint30/0·build0.
- **⚠️ 공용비번 사건(대표 dogfood 중 발견)**: 프로덕션 Vercel `WORKSPACE_PASSWORD`가 실수로 **Stripe 라이브 시크릿 키(`sk_live_…`)** 로 설정돼 있어 신규 가입 전부 실패(기존 계정 로그인은 됨). → 값을 **4321로 교체·재배포**, `test`계정 가입 성공(DB 확인)으로 검증. **대표 액션: 그 `sk_live_`가 진짜 라이브 키면 Stripe에서 폐기(Roll) · 4321은 약하니 강한 값으로 교체 권장.**
  - **🔧 [정정 2026-07-23] 위 "Stripe 라이브 키" 단정은 오식별.** 근거를 역추적하니 **대표가 보낸 Vercel 설정 스크린샷의 잘린 값을 읽은 추정**이었음(당시 세션 기록에도 "Vercel 비번 값은 Sensitive라 못 보고"·"화면엔 앞부분만 잘려 보여서"라고 적혀 있고, 확인 방식도 "지금 값이 `sk_live_`로 시작하죠?" **유도질문**). 실제 키 값은 **트랜스크립트 어디에도 없음**(`sk_live_`+실제값 매칭 0건, 전부 서술뿐). **대표 확인 = Stripe 가입 이력 없음 → 폐기 대상 없음, 종결.** 재확인 불가(스크린샷 캐시 삭제·Vercel env 값 히스토리 없음·현재값 4321, 로컬 `.env.local`도 4321로 동기). 잔여 리스크 ≈ 0(노출은 대표 Vercel 계정 한정, **레포 clean** — git 히스토리·현재 파일·`.env.local` 전수검색 0건, public 레포라 중요). **교훈: 스크린샷 판독 결과를 문서에 "사실"로 적지 말 것 — 추정은 추정으로 표기하고 근거를 함께 남긴다.** ※ 4321 → 강한 값 교체는 여전히 유효.
- **OAuth·env 도메인 이사 대응 + 자가치유·시스템 점검 (배포 `492d9f5`·`35e3a1f`·`43f06b1`, 마이그 102·103)**: 옛 도메인(`*.vercel.app`)→`complow.kr` 이사 후유증 연쇄 해결.
  - **Notion 연결**: 401→재연결→`invalid mcp state`(쿠키)→`invalid redirect_uri`(옛 등록) → `mcp_oauth_clients`·개인연결 DB **등록 초기화(2회)** + Vercel `NEXT_PUBLIC_APP_URL`=`https://complow.kr` 교체·재배포 → **연결 성공**.
  - **MCP OAuth 자가치유(마이그102)**: `mcp_oauth_clients.redirect_uri` 저장 → `loadClientInformation`이 현재값≠저장값이면 무효 처리 → `auth()`가 새 주소로 DCR 재등록. **수동 DB 삭제 반복 근절.**
  - **카테고리 저장 버그(마이그103)**: 세션34에서 카테고리 자유입력으로 바꿨는데 `agents_category_check`(옛 8슬러그)가 남아 목록 밖 값 저장 시 위반 → **제약 제거**(더 permissive라 데이터 무영향).
  - **시스템 점검(오너 전용 `/api/health` + 설정 카드)**: 앱주소·공용비번(`sk_`/장문=키 의심)·구글콜백 호스트=앱 호스트 일치·AI/Supabase 키를 **사전 대조** → ✅/⚠️/❌ + 고치는 법. 값은 미반환·상태만. **대표 지시: "이런 거 미리 검증하는 시스템".**
  - **Gmail·Drive `invalid_grant`**(저장 토큰 죽음) = 진단만, **대표 액션 필요**: Vercel `GOOGLE_OAUTH_REDIRECT_URI`=`https://complow.kr/api/google/callback` + **Google Console '승인된 리디렉션 URI' 등록**(구글 사전등록 엄격) → 재연결. 테스트모드면 refresh 7일 만료→게시.
  - **아키텍처 문서 산출**: 이해용 HTML(artifact) + **PDF**(`~/Downloads/Complow-아키텍처.pdf`, Chrome 헤드리스 print-to-pdf). 14섹션(레이어·기능·AI파이프라인·데이터모델·보안·멀티테넌시·연동·배포·env·로드맵).
  - 각 tsc0·lint30/0·build0 · RLS/게이팅 시뮬. **다음 세션 인계 = HANDOFF 최상단 🔴 미해결 4개**(Stripe키 폐기·공용비번 강화·Gmail/Drive 구글콘솔·점검 ⚠️) 먼저 챙기고 시작.

**검증:** tsc0 · lint30/0(신규0) · build0. 커밋 2분리(P2.2/채팅). main-first 배포(`006719b`→`aed63d9`, 롤백후보 `006719b`), Vercel 프로덕션 BUILDING 확인 후 feat push. **⚠️ 채팅 스크롤·출력형식 = 대표 실기기 육안 미검증(로그인 비번 없어 자동확인 불가).**

---

## 2026-07-15 · 세션34 — 에이전트 시스템 재설계 (리서치 기반 5단계 계획 + Phase 1)

**무엇/왜:** 대표 지시 — 기본 에이전트 전부 제거·회사가 직접 만들게 + 만들기/삭제 기능 + 만들기 과정 이해하기 쉽게 + 지식파일 첨부 + **다른 AI(클로드·커서·제미나이·그록·코덱스)로 내보내기** + 출력형식 UX 개선 + 애플급 UI + **워크플로우 사람 검토·승인 게이트(파일 산출→사람 승인→다음 에이전트 인계)**.

- **리서치(6갈래 병렬 서브에이전트)**: 에이전트 CRUD/빌더 코드맵 · 가이드라인/의존성 · AI에이전트/AX 도입 트렌드(Anthropic 컨텍스트엔지니어링·OpenAI 에이전트가이드·McKinsey/BCG/MIT·한국 정부 AX) · 이식/내보내기 표준(SKILL.md·AGENTS.md) · 지식파일+출력UX(풀컨텍스트 vs RAG) · 워크플로우 HITL 패턴. → **5단계 계획** = `~/.claude/plans/stateful-zooming-quiche.md`(대표 승인).
- **Phase 1 — 클린슬레이트 + CRUD (배포 `af87697`, 롤백 `ecadc69`)**:
  - **마이그 096**: 기본 8개 `is_active=false` 소프트삭제(`created_by is null`). 복구 가능(`set is_active=true`). agent_versions/pins/usage/conversations 보존. `seed.sql` 에이전트 시드 블록 RETIRED 배너.
  - **삭제 UI**: 목록 카드(내 에이전트, hover 🗑)·상세(수정 옆) 삭제 버튼 — 소프트삭제+⌘Z 복구+`equria:agents-changed`(위젯 자동반영). RLS(036)가 소유자 강제. 빈 '기본 에이전트' 섹션 숨김.
  - 검증: tsc0·lint30/0·build0. 라이브 DB 확인(활성 0/비활성 8). ⚠️ 마이그는 원격=프로덕션 DB에 즉시 적용됨(앱이 원격 읽음).
- **리서치 핵심(다음 Phase 반영)**: 가이드=구조화 템플릿+가드레일 기본탑재(환각완화) · 출력형식=업무언어 소수+미니예시+자동추천 · 지식=풀컨텍스트(RAG 아님)+cache_control · 이식=시스템프롬프트MD(어디서나)+SKILL.md+AGENTS.md · HITL=동기→재개형 실행이 유일한 큰 작업(전자결재 RPC·알림·save_file 재사용). **🐞 발견: `save_file`(source="workflow")·`notify`(type="workflow")가 CHECK 위반으로 현재 깨짐 → Phase 5 선행 수정.**

- **StepPicker 가독성**(배포 `c4614f5`): MCP 도구를 서버별 접이식 그룹.
- **Phase 2 부분(배포 `595558a`·`9adcddd`)**: ① **예시 갤러리**(`lib/agentTemplates` 백오피스 8종): '새 에이전트'→"어떤 일을 맡길까요?"→선택 시 입력 프리필→즉시 AI 생성(빈 화면 해소). ② **카테고리·업무영역·직무 자유입력**(select→자유입력+datalist / multiselect 커스텀 태그 / select+직접입력) — 대표 "틀에 갇힘" 반복 피드백. ③ **업계특화(K-뷰티) 문구 → 업종 중립**(placeholder·시스템프롬프트 예시). ④ **위젯 빈상태 드래그 버그수정**(`EmptyAgentWidget`가 `useDragWidget` 안 써서 못 움직이던 것 — 기본 에이전트 제거로 드러남).
- **Phase 3 지식파일(배포 `9adcddd`, 마이그 097)**: `agent_knowledge`(부모 agents EXISTS 상속·기존 files 버킷 재사용). 위저드 '필요한 데이터' 스텝 + 빌더에 **파일 첨부**(AI-readable만: PDF·이미지·txt/md/csv/json). 채팅 라우트가 텍스트는 시스템에, PDF/이미지는 파일파트로 **풀컨텍스트 주입**(admin-sign, RAG 아님). 신규 `lib/agentKnowledge`·`KnowledgeFilePicker`.
- **MCP 바인딩(배포 `23cca30`, 마이그 098)**: `agent_versions.mcp_connectors`(개인 커넥터 슬러그). 빌더 '내 MCP 연결'에서 내가 연결한 개인 커넥터(Notion 등) 선택. 채팅·워크플로우 실행 모두 "전부"가 아니라 **바인딩된 커넥터만** 실행자 본인 연결로 해석(공유 에이전트도 쓰는 사람 계정 기준). ※발견: 워크플로우/채팅 모두 원래 개인연결을 전부 로드하던 것을 선택-only로 일관화.

**검증:** 각 배치 tsc0·lint30/0·build0. 마이그 096·097·098 원격 적용·drift0.

**남은 것(다음):** MCP **3b**(워크플로우에 개인 MCP 툴노드로 추가=StepPicker 개인연결 표시+실행엔진, 노드모델 변경)·**3c**(에이전트 노드의 바인딩 MCP 배지) · P2.2 출력형식 재설계(9개 추상→업무언어 소수+미니예시) · P2.3 가드레일 기본탑재 · P2.4 위저드↔직접작성 통합 · P2.5 애플UI · Phase 4 내보내기(SKILL.md·AGENTS.md·MCP스니펫) · Phase 5 워크플로우 사람검토(재개형 실행+승인RPC, +save_file/notify CHECK 버그수정). **아이콘**=가이드 결과폼 상단에 이미 있음(대표 확인 필요).

---

## 2026-07-13 · 세션33 — MCP 커넥터 대량 추가 + AI 코칭 추세 인식 + 위젯 축소

**무엇/왜:** 대표 요청 — "있으면 좋은 MCP 더 추가·다 연동" + 오늘할일 위젯 축소 + (앞서) 코칭 추세.

- **MCP 커넥터 11종 추가·2종 승격 (`lib/mcp.ts`, 커넥터별 코드 0줄)**: 연결 흐름(`connectPreset`)이 `preset.auth`로 **데이터 주도**(none 원클릭 / bearer 토큰모달 / oauth DCR 리다이렉트) + OAuth 연결 라우트 제네릭 → **카탈로그 추가만으로 자동 연동**.
  - 리서치 에이전트로 후보 20개 hosted MCP의 엔드포인트·auth·DCR **공식문서 실검증**.
  - **available(11)**: Cloudflare Docs·Globalping(무인증·회사공용) / Neon·Asana·Atlassian·Intercom·Square·Webflow·Wix·Canva·Prisma(OAuth+DCR 개방·개인). Atlassian·Canva는 기존 coming_soon→승격.
  - **coming_soon(연결 실패 방지 위해 카드만)**: Slack(DCR없음·앱필요)·Figma/Vercel(client_name 화이트리스트 게이트)·Exa(x-api-key 헤더 불일치)·Zapier(계정별 URL)·PayPal(DCR 미확인).
  - "다 연동?" = none/bearer/DCR개방은 대표 설정0으로 바로. 화이트리스트/DCR없음/인증불일치만 보류(억지 available=연결버튼 실패 방지 = "문제상황 안 만들기").
- **AI 코칭 추세 인식 (코칭 5파일)**: `cashCoachSchema.trends[]` + `CoachPayload.trend`(optional) + 프롬프트 전월대비% 사전계산(모델 산술오류 방지). `CashCoachPanel`이 `finance_entries` 6개월을 `buildMonthlyTrend` 집계→payload 포함, "최근 추세" 섹션 렌더. 스냅샷(cash_accounts)≠장부(finance_entries) 별개 참고로 명시. 추가형·읽기전용·DDL0·추세로드 실패해도 코칭 진행(방어적).
- **오늘 할 일 위젯 축소 (`TodayTasks`)**: Surface p-4→p-3, 헤더·입력 mb-2→mb-1.5(수치만).

**검증:** tsc0 · lint30/0 · build0. 3커밋 분리(mcp/ui/coaching) → **main-first 배포**(`c0aac03`, 롤백 `38242b9`). Vercel 프로덕션 BUILDING 확인 후 feat push(중복제거 회피).

**대표 확인/미검증:** 커넥터 실연결 스모크(무인증 1개)·코칭 추세 화면·위젯 크기 = 실기기/브라우저 육안 권장. 워크플로우 모바일 질문 = **"일반 모바일 흐름"으로 확정**(세션32 픽스로 해결).

- **🆕 워크플로우 사용성 개선 (배포 `34b9a61`, 롤백 `8a8d902`)** — 대표 "워크플로우 쉽게 쓰도록" 지시(스크린샷 = 툴바 4컨트롤이 복잡). ① **예시 템플릿 5종**(`lib/workflowTemplates.ts`·`NewWorkflowModal`): '새 워크플로우'→빈 것/템플릿 선택 모달, 워크스페이스 에이전트에 이름 바인딩해 단계 미리 연결(SNS→번역·문서→번역·콘텐츠→이미지프롬프트·계약검토→요약·데이터→보고서). ② **통합 '단계 추가' 피커**(`StepPicker`): 드롭다운 4개(에이전트+노드추가 | MCP서버·도구·MCP노드)→**버튼 1개 + 검색 모달**(AI 에이전트/MCP 도구 섹션·아이콘·설명). addNode/addMcpNode 파라미터 리팩터. ③ 안내문 '드래그해 점 연결'→'순서대로 자동 연결'(실제로 이미 자동 연결됨)·모순된 공유 토글 라벨 명확화. tsc0·lint30/0·build0, 2커밋 분리(템플릿/피커) main-first 배포.

---

## 2026-07-11 · 세션32 — 오늘할일 시각알림(pg_cron) + 그라데이션 완화 + 모바일 3픽스

**무엇/왜:** "바로 착수 가능한 것" 진행 + 대표 모바일 피드백 즉시 반영.
- **오늘 할 일 시각 알림(마이그 095)**: 세션30에서 분리 보류했던 2차. `personal_tasks.reminded_at`(중복방지) + `remind_due_personal_tasks()`(security definer, KST 기준 기한 판정) + **매일 09:00 KST pg_cron 잡**(006 패턴 재사용). 기한(due_date) 오늘 이하·미완료·미알림 → `notifications`(type=system) 1건 생성 → 이미 realtime이라 기존 NotificationBell이 실시간 표시. `due_date` 변경 시 트리거가 `reminded_at` 리셋(재알림). 원격 적용·크론active·멱등성·오류0 검증.
- **앰비언트 그라데이션 완화**(`.app-ambient`): 대표 "다크에서 그라데이션 심함" → 다크 alpha 0.18~0.2→0.10~0.11, 라이트 0.1→0.06(≈절반). 토큰만 수정(즉시 되돌림 가능).
- **모바일 3픽스**:
  1. **채팅 확대 버그**(가장 심각): iOS는 입력 폰트<16px면 포커스 시 자동확대 → 전송버튼이 화면 밖. root layout `viewport{maximumScale:1}`로 자동확대 전역 차단(최신 iOS 수동 핀치줌 유지) + 채팅 컴포저(Tiptap) `text-sm`→`text-base md:text-sm`(모바일 16px).
  2. **사이드바 드로어 안 됨**: iOS Safari가 transform(slide-in)된 컨테이너 안 `backdrop-filter`를 투명 렌더 → 글래스 사이드바가 비쳐 깨져 보임. 드로어에 불투명 `bg-sidebar` 배경 + 스크림 중첩 blur 제거로 원천 차단(Sidebar 무수정).
  3. 워크플로우 등 기타 화면의 작은 입력(순서배지 등) 확대도 viewport 픽스로 함께 해결.
- **검증**: tsc0 · next build 성공. **⚠️ 실기기 육안 확인 필요**(대표 폰).

**후속(같은 세션32) — 사이드바 "뒤로 빠짐" 진짜 원인 + 모바일 오버레이 하드닝:**
- **근본원인(글래스 리디자인 회귀)**: `MobileNav` 드로어가 **헤더(glass-panel=backdrop-filter) 안에서** 렌더됨. CSS에서 `backdrop-filter` 요소는 `position:fixed` 자식의 **containing block**이 되므로, 드로어의 `fixed inset-0`이 뷰포트가 아니라 **56px 헤더 기준**으로 잡혀 사이드바가 헤더에 끼여 "뒤로 빠진" 것처럼 보였음(glass 미지원 브라우저에선 헤더 solid라 정상 → 특정 상황만 깨짐). 세션32 1차의 불투명 배경은 *투명 증상*만 가림, 위치 트랩은 안 고침.
- **수정**: 드로어를 **`createPortal(document.body)`** 로 렌더해 헤더 containing block 탈출(뷰포트 기준 fixed 보장). 햄버거 버튼은 헤더 유지.
- **공용 `shared/Modal`도 동일 함정 예방**: body로 portal(glass 카드/transform 조상 안에서 열려도 위치 안 깨짐). 둘 다 `typeof document` 가드로 SSR/하이드레이션 안전(`mounted` 이펙트 대신 → lint `set-state-in-effect` 회귀 회피).
- 기타 `fixed` 오버레이(FilePreview·MailCompose 등)는 각 뷰 루트에서 렌더돼 glass 조상에 안 갇힘(구조상 헤더 안 사이드바만 문제였음).
- **검증**: tsc0 · lint 30/0(베이스라인) · build 성공.
- ⚠️ **배포 사건(교훈 재확인)**: portal 커밋(`1ae1554`)을 main→feat 연달아 push했더니 Vercel이 중복제거해 **프로덕션 승격 스킵**(prod가 `c954435`에 머묾). → 고유 SHA로 main 먼저 push하고 **프로덕션 빌드 생성 확인 후** feat push로 복구. HANDOFF §배포팁대로 *간격 두기*가 핵심.

---

## 2026-07-10 · 세션31 — 리디자인 디테일 튜닝 + 비용·매출 개선 (배포 4e501d3)

**무엇/왜:** 리디자인 첫 배포 후 대표 피드백 즉시 반영.
- **글래스/카드/호버**(`befbefc`): 글래스 강도 미세↑(블러 20/22px·채도·시트광) · **카드 칸 구분**(흰 배경서 안 보이던 흰 테두리 → 뉴트럴 하 airline + shadow-md 소폭↑) · **호버 커짐 통일**(`.hover-grow`에 `position:relative`+`z-index` → 커질 때 옆칸 **위로 떠서** 침범 방지, 프로젝트·워크플로우 카드도 통일, reduced-motion 정지).
- **비용·매출 레이아웃**(`3093590`): 요약 탭 재구성 — 월간 추세 그래프 **좌측 2/5로 축소** + 지출/매출 분류 **우측 3/5 나란히**(한눈에). fx·통화별 KPI는 상단 유지.
- **매출 분류 업종 중립**(`3093590`·`4e501d3`): '매출 채널'→'**매출 분류**'. 입력 `<select>`(고정 채널)→**자유입력+datalist**. 제안을 '이 워크스페이스 실제 사용 분류'에서 수집(kind별)+기본 제안 병합 → 업종별 커스텀 자동 축적. `REVENUE_CATEGORIES`는 제안일 뿐.
- **추세 막대 그라데이션**(`4e501d3`): TrendBars 막대 세로 그라데이션(초록 매출/빨강 지출, 위 진함→아래 연함). stop이 `--success`/`--destructive` 참조라 다크/라이트 자동.

**검증:** 각 tsc0·lint30/0·build0. 검수(대표 요청): 글래스 중첩 0·입력요소 glass 오적용 0·datalist 충돌 0·그라데이션 테마대응·카테고리 조회 RLS/null제외/언마운트가드. **미검증: 대표 3테마 육안·Safari 블러·모바일.**

---

## 2026-07-10 · 세션31 — 글래스모피즘 전면 리디자인 (Phase 1~5, 토큰 우선·구조 보존)

**무엇/왜:** 대표가 참고 이미지(ElevenLabs·프로스트 글래스 대시보드/사이드바) 기반 "미래지향+부드러운 플로우" 전면 리프레시 요청. 하드 제약 = 구조 안 깨짐+검증 반복. → **토큰 우선 리스타일**(globals.css `@theme`+`data-slot`+신규 `Surface`/`.glass`, shadcn `ui/` 무편집). 계획 = `~/.claude/plans/imperative-sprouting-crayon.md`. 조사(Explore 3)+설계(Plan 1)로 "테마가 globals.css 한 파일에 집약" 확인 후 착수. 확정 범위 = 대시보드 리스타일만(KPI 재구성 제외)·뚜렷한 프로스트(블러16~18/카드60%)·모노크롬+강조점 1개.

**단계(각 커밋 = tsc0·lint30/0·build0):**
- **P1 토큰+앰비언트**(`d4ff0e9`): 그림자 소프트닝 + `--glass-*`(:root/.dark/.force-light 3곳, force-light는 불투명 옵트아웃) + `--accent-dot` + `.app-ambient` 실크 그라데이션 배경(`(app)/layout` fixed -z-10 마운트, flex 흐름 불참).
- **P2 오버레이 글래스**(`a026319`): `.glass` @layer(+`@supports`/`prefers-reduced-transparency`/`contrast-more` 불투명 폴백) · 드롭다운 메뉴 data-slot 프로스트 · Modal 글래스.
- **P3-A 대시보드**(`aa6ce48`): `shared/Surface`(solid|glass) 신설 + 공지·오늘할일·어시스턴트 컨테이너 글래스(어시스턴트 내부는 solid).
- **P4 셸**(`f7124c5`): `.glass-panel`(셸용) + 사이드바/헤더 프로스트 + 네비 rounded-full 필 활성. MobileNav 자동 상속.
- **P3-B/C 전 섹션**(`acfec44`): `.glass` 그림자 lg→md(카드 적정), Modal은 lg 유지. 섹션 카드 관용구 일괄 스왑(projects·settings·work·approval·agents 13곳) + 캘린더 모달·워크플로우·MCP·위저드·메일 도크 5곳. 캔버스/그리드/채팅/에디터/입력은 solid.
- **P5 모션**(`4515be5`): `.animate-page-in`(fade-up 0.4s, backwards fill로 fixed 안전) + `PageTransition`(key=pathname) 라우트 진입 페이드업. reduced-motion 정지. framer-motion 미도입.

**예상이슈 체크:**
- shadcn `ui/` "수정 금지" 준수 — 전부 토큰/`data-slot`/공용 컴포넌트 경유. `.glass` box-shadow는 카드용 md(모달만 lg 명시).
- 앰비언트 fixed -z-10 → 셸 flex/overflow·`--app-content-height` 모델 무손상. `PageTransition` transform은 backwards fill이라 애니 후 미잔류 → MailCompose 등 `position:fixed` 안전.
- 3테마(light/dark/**force-light** 공개화면 불투명) 정합 — 토큰 3곳 정의. a11y = 알파 하한 0.60/0.55 + reduced-transparency/contrast 폴백.
- 클래스 스왑은 exact-idiom(`border bg-card p-N shadow-[var(--shadow-sm)]`→`glass p-N`)만, twMerge 충돌 없음. 매 배치 tsc0·lint30/0·build0.
- **미검증(대표 확인 필요):** 실제 3테마 육안·macOS Safari 블러 성능·모바일 드로어. 디테일(강도/톤/강조색)은 대표 요청대로 **전 작업 후 일괄 조정** 예정.

**배포:** feat→main-first 일괄. (SHA·롤백은 HANDOFF 갱신 참조.)

---

## 2026-07-10 · 세션31 — 프로젝트 체크리스트(세부 할 일) 배포 (글래스 리디자인 Phase 0)

**무엇/왜:** "2차" 후보였던 프로젝트 세분화 체크리스트 구현. 이어질 **글래스모피즘 전면 리디자인**과 관심사 분리를 위해 먼저 단독 배포(리디자인 Phase 0). ※ Ultraplan 클라우드가 같은 작업을 시도했으나 조직정책 403으로 push 차단 → 로컬에서 실행.

### project_tasks (마이그 094, 커밋 `c87e091`)
- **마이그 094 project_tasks**: 프로젝트별 세부 할 일. 부모 `projects`(035 워크스페이스 격리)를 **EXISTS로 상속** → 별도 `workspace_id` 비정규화·센티넬 default 안 만듦(B1-b 부채 회피). 같은 워크스페이스에서 프로젝트를 볼 수 있는 멤버=협업 CRUD. 정책 4종.
- **UI(ProjectDetail)**: 멤버 카드 아래 체크리스트 섹션 — 추가(한글 IME 이중발동 방지: `isComposing` 무시 + `submitting` ref)·완료 체크·삭제·**진행률 바(doneCount/total·%)**, 전 변경 ⌘Z Undo(FilesSection 패턴).
- **공용 `lib/tasks.ts`**: `dueBadge`·`todayStr` 추출 → `TodayTasks`가 로컬 복붙 대신 재사용(safe-changes §6 중복 제거).
- **types.ts**: project_tasks Row/Insert/Update + FK 관계 수동 반영.

**예상이슈 체크:**
- RLS 시뮬(롤백 트랜잭션): 멤버 insert 성공+select 1건 / **anon 0건** → 격리 확인. advisor(security) project_tasks 신규 경고 없음.
- wCTE 스냅샷 아티팩트(같은 statement 삽입행 비가시)로 1차 sim이 오해 소지 → insert/select **별도 statement**로 재검증(member_can_see:1).
- lint: 신규 load effect 1건이 set-state-in-effect(+1) → `TodayTasks`와 동일하게 eslint-disable로 베이스라인(30) 유지.
- tsc 0 · lint 30/0 · build 성공 · 마이그 094 원격 등록·drift 없음.

**배포:** feat→**main-first**(`d44afc1..c87e091`) → Vercel 프로덕션(icn1). 롤백 후보=`d44afc1`.

---

## 2026-07-09 · 세션30 — 1차 기능묶음(프로젝트·전자결재·오늘할일) 배포 (대표 요청 7종 중)

**무엇/왜:** 대표가 실사용 관점 7종 요청. 조사(멀티에이전트 3) 결과 대부분 기존 패턴 재사용 가능 → "가벼운 것 먼저, 무거운 것(카톡·카드 실연동) 백로그". 세션 시작 시 **전체 코드리뷰**(보안/원칙·세션29 MCP)도 수행 — 이상無(any0·키노출0·인증누락0·MCP user_id격리·OAuth PKCE·토큰암호화 정상), 마이너 몇 건은 HANDOFF 기록.

### A. 프로젝트 중요도 (`0a3aafd`, 마이그 091)
- `projects.importance int default 0`(추가형). 회의노트(070) importance 패턴 이식 — `lib/meetingMeta`의 `IMPORTANCE`/`importanceColor`/`tagBg` **그대로 재사용**(신규 RPC 불필요, projects UPDATE RLS(035)가 created_by/owner_id 허용).
- 생성폼 중요도 select·카드/상세 배지·상세 메타카드 인라인 변경(Undo 연동).

### B. 생성 시 참여 인원 (`548aac2`, 스키마 무변경)
- `CreateProjectModal`에 구성원 칩 다중선택 → insert 후 `project_members` 일괄 insert(생성자=created_by라 pm_insert(035) 통과). Undo=프로젝트 delete 시 cascade로 멤버 동반 제거.

### C. 전자결재 사용법 안내 (`73a7092`, **로직 0**)
- 대표 "쓸 줄 모르겠다" → 기능은 완성, 안내 부재가 원인. `ApprovalView` 접이식 "이렇게 써요" 3단계 배너(localStorage 유지)+`DocumentList` 빈상태 "새 기안" CTA(EmptyState action/description 활용)+`NewDocumentModal` 결재선 설명 1줄. RPC/스키마 무변경.

### D. 오늘 할 일 위젯 (`e2930ef`, 마이그 092)
- `personal_tasks`(본인전용 RLS=`mcp_user_connections` 패턴, workspace 컬럼 불필요) + `TodayTasks` 대시보드 위젯(`AnnouncementsBoard` 구조 복제 — load+realtime+run). 추가(기한 선택)·완료 토글·삭제·기한 지남 강조. dashboard/page.tsx 상단 shrink-0 카드. **시각 알림은 2차(pg_cron)로 분리**(대표는 "시각 알림까지" 원함).

### 인프라·검증·배포
- eslint `.claude/worktrees/**` globalIgnores 추가(`7917c52`) — 백그라운드 격리 워크트리가 메인 밑에 중첩돼 루트 lint가 src를 이중 스캔하던 문제 해결(30→60/90 오탐).
- 검증: tsc 0 · lint 30/0(베이스라인) · `next build` 성공 · Vercel 프리뷰+프로덕션 **READY**.
- 배포: 프리뷰(feat/toss-ui-refresh) 확인 후 대표 승인 → main-first 프로덕션 `e2930ef`(롤백 `d4f4508`). 마이그 091·092 원격 적용(추가형, 코드 전 안전).

### 후속 (같은 세션 — 대표 실사용 피드백 + 도메인)
- **오늘 할 일 중복 버그 픽스** (`3edb385`): 대표가 "추가하면 2개씩 생긴다" → DB 확인 결과 실제 중복 저장은 없고 **한글 IME Enter 이중발동**(조합 확정 Enter + 실제 Enter)으로 `add()` 2회 호출이 원인. `onKeyDown`에 `!e.nativeEvent.isComposing` + `submitting` ref 재진입 잠금.
- **대표가 구성원 부서 부여** (마이그 093, `43552ec`): department는 원래 본인만 자가입력(profiles_update=본인 RLS)이라 대표가 못 바꿨음. `set_member_department`(security definer, 오너 전용, 063 `set_member_position` 패턴 복제) 추가. 설정 "구성원 직급"→**"구성원 부서·직급"**: 각 행에 부서·직급 입력칸 2개 + 변경분만 각 RPC 저장. guard 트리거는 무변경(department 자가입력 유지 — role/position만 오너 전용).
- **도메인 complow.kr 연결 (대표 가비아 구매)**: Vercel Domains에 `complow.kr`(메인, Production)+`www.complow.kr`(→complow.kr 307 redirect) 추가. 가비아 DNS: A `@`→`216.198.79.1`(신규 IP, 옛 76.76.21.21 대체) + CNAME `www`→`cname.vercel-dns.com.`. SSL 자동. env `NEXT_PUBLIC_APP_URL`·`GOOGLE_OAUTH_REDIRECT_URI`=`https://complow.kr`로 바꾸고 빈커밋 재배포(`9152ded`, 빌드타임 env). 구글 콘솔 OAuth 클라이언트("워크스페이스 웹", 프로젝트 influencer-automation)에 JS원본·리디렉션 URI(complow.kr) 추가(대표 완료). **Vercel team/project id·프로덕션 도메인 = memory `vercel-project.md`.**
- 배포: 프리뷰→프로덕션 순으로 검증(대표 확인 후). 프로덕션 SHA `43552ec`(1차+후속 전부), 롤백 `9152ded`.

### 다음
- **2차**: 프로젝트 세분화 체크리스트(`project_tasks`, 워크스페이스 RLS) + 진행률을 실제 완료율로 승격 · 오늘할일 시각알림(`personal_tasks.remind_at` + notifications 'reminder' + pg_cron).
- **백로그(무거움)**: 회사 카드/금융 실연동(오픈뱅킹/카드사 API, "담당자만"=`064` 위임패턴) · 카톡(카카오) 연결.

---

## 2026-07-09 · 세션29(연속) — MCP UI 간소화 + 직원별 개인 연결 + OAuth 커넥터 (사용자 지적)

**무엇/왜:** 대표 지적 2건 — ① "서버 추가" 기술 모달(전송방식·URL·인증)이 GitHub 연결하려는 사람에겐 어려움 ② "다 각자 계정 써야 하는거 아님?" — GitHub·Supabase·Stripe가 회사 전체 토큰 공유 구조였는데, 개인 계정 성격이라 직원별 연결이 맞음. + "다른 MCP도 연동해줘"(Notion·Linear·Sentry 등 OAuth 커넥터).

### 간편 연결 모달 (`de038b0`→UI 부분)
- bearer 프리셋 "연결" → 전용 모달(로고+토큰 발급 링크+토큰 입력 1칸만, 이름·URL·전송방식 숨김). 기존 "서버 추가"(고급)는 그대로 유지.

### 직원별 개인 연결 — bearer(`2956bda`·`789d7c4`)
- **아키텍처**: `google_connections`(Gmail 개인별 OAuth) 선례 그대로 재사용 — `mcp_user_connections`(user_id RLS 본인만, 관리자 게이트 없음). GitHub·Supabase·Stripe를 워크스페이스 공용 `mcp_servers`에서 분리, 각자 자기 PAT로 연결(scope="user" 신설, Context7·DeepWiki·HuggingFace는 무인증이라 scope="workspace" 유지).
- API `/api/mcp/user-connections`(GET·POST) + `/[connectorId]`(DELETE) + `/test`(POST) — 본인 것만, RLS로 격리.
- McpView: "회사 전체 연결"(기존)/"내 연결"(신규) 섹션 분리 + "개인 vs 공용" 안내 문구.

### 채팅·워크플로우 자동 병합(`b090dba`)
- 에이전트 설정과 무관하게, 요청자 본인의 개인 연결 도구를 모든 채팅·워크플로우 실행에 항상 병합("내가 가져온 도구"). agent_versions 스키마 변경 없이 최소 침습으로 구현.

### OAuth(DCR) 커넥터 — Notion·Linear·Sentry(`789d7c4`)
- **조사**: `@ai-sdk/mcp` 설치 소스를 직접 읽어 확인 — `auth()`/`OAuthClientProvider`가 DCR·PKCE·401 자동 refresh를 이미 내장(추측 아닌 코드 검증). Notion·Linear·Sentry는 사전등록(개발자 포털 앱 등록) 없이 "연결" 클릭만으로 인가 가능. Slack·Figma는 대표가 직접 앱 등록/승인받아야 함(코드로 우회 불가) — coming_soon 유지. Atlassian·Canva는 문서 상충이라 재확인 필요.
- 공식 엔드포인트 웹검색 재확인(추측 금지): `mcp.notion.com/mcp` · `mcp.linear.app/mcp` · `mcp.sentry.dev/mcp`.
- `McpOAuthFlowProvider`(연결/콜백 라우트, PKCE는 httpOnly 쿠키 왕복 — Google OAuth와 동일 패턴) / `McpOAuthRuntimeProvider`(실사용, 401 시 자동 refresh, redirectToAuthorization no-op 안전성 라이브러리 소스로 확인) 2종.
- `mcp_oauth_clients`(DCR 발급 client_id, 커넥터별 앱 전체 공유, service_role 전용).

### 검증(계속 재확인)
- tsc 0 · lint 30/0 — **git stash로 진짜 베이스라인 재확인**(McpView 두 번째 useEffect 추가가 캐스케이딩 렌더 감지를 유발해 첫 번째 effect까지 새로 flag됨 → 둘 다 기존 관례대로 suppress, 30/0 복원) · build 0.
- 토큰 노출 경로 재검수(암호화·클라이언트 미노출·에러 메시지 무토큰) · 보안 어드바이저 신규 테이블 경고 0건.
- **한계**: OAuth 실제 브라우저 인가 왕복은 라이브 테스트 불가(대표가 직접 클릭해 첫 확인 필요) · 동일 커넥터 동시 첫 연결 시 DCR 등록 레이스(낮은 확률, 실패해도 재시도로 해결).

---

## 2026-07-09 · 세션29 — 모바일 반응형 1단계: 레이아웃 골격(사이드바 드로어화) (사용자 요청)

**무엇/왜:** 폰에서 앱 전체가 짜부(스샷 #47) — 근본 원인 = 사이드바 반응형 0줄 + 쉘이 항상 나란히 배치. 스펙 `docs/build/mobile-responsive.md`의 **작업 1(골격)만** 수행(화면 감사·터치 UX는 다음 세션).

**대표 확정 결정 3건(질문으로 확인):** ① dvh 전환 포함(별도 커밋·단독 롤백) ② 드로어가 채팅 FAB 위(z-[60] 신설 — 앱 최초 z-50 초과 레이어) ③ 모바일 패딩 0.75rem(CSS 변수 미디어쿼리).

### 골격 (`237ab82`)
- `(app)/layout`: `<Sidebar className="hidden md:flex" />` — 폰에서 콘텐츠 전폭. Sidebar에 `className?` prop(twMerge 병합, 호출부 무변경 시 시각 변화 0).
- **`MobileNav.tsx` 신규**: `md:hidden` 햄버거(Header 드롭다운 트리거 톤) + open 시만 마운트되는 `z-[60]` 오버레이 — 스크림(`bg-black/30 backdrop-blur-sm`, Modal 딤 패턴) 탭·링크(`closest("a[href]")`) 클릭·ESC로 닫힘, 패널은 `slide-in-from-left`(tw-animate-css) 안에 기존 `<Sidebar/>` 재사용.
- Header: 좌측 h1을 flex 래퍼로 감싸 MobileNav 삽입(데스크톱 display:none이라 gap 미발생 → 픽셀 무변화).
- globals.css: `:root` 중첩 `@media (width<768px){ --app-pad: .75rem }` — `--app-content-height` calc이 변수라 자동 정합(클래스 방식이면 대시보드 하단 데드스페이스).
- `useUnreadDms`: 채널명 고정("dm-unread-sidebar") → 드로어+사이드바 동시 마운트 시 이중 구독 → 모듈 카운터 suffix로 방어(useId는 React19 특수문자라 배제).

### dvh 전환 (`3169071`, 별도 커밋)
- 쉘 `h-screen`→`h-dvh` + calc `100vh`→`100dvh` — iOS 사파리 주소창 하단 잘림 대응. 데스크톱 픽셀 동일. 메일 쪽 100vh(MailCompose 등)는 3단계 스코프라 무수정.

### 감사A 스팟픽스 2건 (`57b6f41`) — 대표 스샷 제보 기반
- **비용·매출 헤더**: 제목+버튼 3개가 한 줄 강제 → 375px에서 제목 "비/용/·/매/출" 세로 짜부·"+직접 입력" 잘림 → `flex-wrap`+제목 `shrink-0`(PC wrap 미발동).
- **파일 관리 폴더**: PC 3열 그리드가 폰에 우겨넣어짐 → **FolderGrid(공용)에 <sm 리스트형 신설**(탭 한 번 열림·이름변경/삭제 상시 노출 — 터치엔 더블클릭/hover/DnD 없음). 회의노트 폴더도 공용이라 동일 혜택. 안내문구 기기별 분기. 대표 확정: 리스트형(미리보기 3택1) · 재무는 가로만 · **플로우 기획은 별도 세션**(헷갈리는 지점 청취 후 설계 — 화면 깨짐과 다른 층위).

### 감사A 전 페이지 코드 감사 (`ecf6eeb`·`bb5a365`) — 탐색 에이전트 3병렬(브라우저 확장 미연결이라 코드 레벨)
- **재무 요약 카드**: 금액(₩-565,380)이 3열 카드 폭(~98px) 초과해 카드 밖 넘침(대표 스샷) → `grid-cols-1 sm:grid-cols-3`(글자 축소는 백만 단위에서 재깨짐이라 스택이 유일 안전).
- **깨짐 7건 수정**: 캘린더 헤더(~416px 한 줄) flex-wrap · 구성원 긴 이메일/프로젝트 긴 파일명 `min-w-0` truncate 미발동 · 명함 헤더 wrap · 명함 이미지 `max-w-full` · 세금계산서 7열 표 `overflow-x-auto`+`min-w-[640px]` · 재무 입력 모달 날짜줄 wrap.
- **이상 없음 판정**: 대시보드·에이전트 전체·회의노트(표는 이미 overflow-x-auto)·결재·업무·설정·마이페이지·알림·배너. 3단계 잔여 = 메일/직원채팅 pane·채팅 위젯 클램프·캔버스류.

### 현금흐름 캔버스 폰 숨김 (`a8e7407`) — 대표 결정("모바일에서 확인 어려움, 표만")
- `<md`에서 CashFlowCanvas 숨김(`hidden md:contents` — PC 레이아웃 무영향) + "PC에서 볼 수 있어요" 안내. 손익 요약 칩·AI 코칭·설정·CashGrid 표(이미 overflow-x-auto+min-w-900)는 유지. 스펙 3단계 "캔버스 가로 스크롤" 계획 대체.

### 적대적 코드리뷰(high) + 픽스 (`f791056`·`305fb73`) — 대표 지시
- 8앵글 병렬 수색(라인·제거동작·크로스파일·재사용·단순화·효율·고도·컨벤션) → 후보 10 → 검증(반박 시도) → 7 확정/타당·3 기각. 치명 버그 0.
- **픽스**: ① 메일 100vh→100dvh(dvh 전환 누락, MailShell+MailCompose) ② 회의노트 "더블클릭" 문구 모바일 분기 누락 ③ 캘린더 폰=제목 **첫 단어** 표시(대표 확정 — 투명막대의 같은색 구분불가·완료취소선 비가시 동시 해소) ④ `useMediaQuery` 훅 신설 → 현금흐름 캔버스 **조건부 마운트**(숨김만으론 폰에서 편집마다 재렌더) ⑤ 사이드바 `badgeDesktopOnly`(모바일 hidden 인스턴스의 realtime 헛구독 중단) ⑥ FolderGrid 입력 4곳 → 공용 FolderNameInput.
- **기각 3**: 새폴더 입력 잔존(언마운트로 불가능) · useId 대안(특수문자가 채널명에 위험) · hidden md:* 뿌리기(코드베이스 관례 적정).
- **수용 리스크 1**: FolderGrid 이중 렌더에서 640px 경계 회전 중 이름변경 포커스 유실 — SSR 안전성(첫 페인트 무점프)과 맞바꾼 트레이드오프, 발생 조건 극히 드묾.

### 3단계 복잡 화면 (`921d7b7`) — 대표 지시(모바일 마감)
- **채팅 위젯**: PANEL_SIZE(440×620·720×720)를 `window` 크기에 `min()` 클램프 → 폰에서 화면 밖 넘침 해소, 거의 풀스크린. 내부 flex라 자동 적응(하드코딩 px 없음). SSR 안전(패널은 열렸을 때만 렌더=클라).
- **메일**: 폰 3-pane→단일 pane 스택. 폴더=가로 칩 줄(`max-md:flex-row overflow-x-auto`), `selectedId`로 목록↔상세 토글(`max-md:hidden`), 상세 헤더에 `md:hidden` 뒤로가기(setSelectedId(null)). PC `md:grid-cols-[…]` 그대로.
- **직원 채팅**: 조사 결과 이미 라우트 분리(`/chat`↔`/chat/[userId]`·group)+ArrowLeft 뒤로가기 존재 → 구조 전환 불필요. GroupChat 높이만 `max-md:--app-content-height`(8rem 오프셋이 모바일 축소 패딩과 어긋나던 것).
- 검증 tsc0·lint30/0·build0. **다음 = 4단계 터치 UX(워크플로우 캔버스 터치·히트영역 44px·hover 대체) — 후순위.**

### MCP bearer 커넥터 열기 (`de038b0`) — 대표 지시("MCP 손보자" → 토큰 커넥터 열기)
- **조사**: available 2종(Context7·DeepWiki)뿐, 11종 coming_soon. 인프라(토큰 AES 암호화·RLS 격리·SSRF·런당 캐시)는 이미 견고, TODO 0건. 막힌 이유 = 프리셋 URL 없음 + OAuth 미구현.
- **웹 검색으로 공식 원격 MCP 엔드포인트 확인**(추측 금지) → bearer 확실 3종 + 무인증 1종만 개방. 조사에서 "bearer"로 분류됐던 **Linear·Sentry·Figma는 실제 OAuth 우선이라 제외**(설명 "OAuth 필요"로 정정).
- **개방 4종**: GitHub(`api.githubcopilot.com/mcp`)·Supabase(`mcp.supabase.com/mcp`)·Stripe(`mcp.stripe.com`)=bearer, HuggingFace(`huggingface.co/mcp`)=무인증 원클릭.
- **UX**: bearer "연결" → 기존 서버 추가 모달 프리필(이름·URL·인증 bearer) 재사용, 관리자가 토큰만 붙여넣기. URL 수정 가능(스코프 파라미터). 등록 직후 자동 테스트로 토큰 유효성 즉시 피드백. 빈 추가 버튼 폼 리셋.
- 검증 tsc0·lint30/0·build0. **미배포.** 남은 = OAuth 4종(Notion·Slack·Atlassian·Canva)+Linear·Sentry·Figma = 별도 대형 작업.

### 예상이슈 체크(수행)
- twMerge flex↔hidden display 충돌 정상 해소 확인 · md 경계(`width<768px` ↔ `md:`=≥768) 정확 일치 · ESC setState는 이벤트 콜백이라 `set-state-in-effect` 린트 비대상 · 드로어 열린 채 데스크톱 폭 확장 시 오버레이 `md:hidden`으로 자동 소거.
- 검증: tsc 0 · lint 30/0(신규 0) · build 0. **375px 브라우저 실확인은 미완**(Claude Chrome 확장 미연결) — 대표 확인 필요: 크롬 디바이스 모드 375×812에서 ①드로어 열림/바깥탭/링크클릭/ESC ②FAB가 딤 아래 ③가로 스크롤 없음 ④PC 무변화.

---

## 2026-07-08 · 세션28 — MCP 커넥터 디렉터리 + MCP 토큰 DB 암호화(Phase A) + AI 비용 예산 한도·배포 (사용자 요청)

**무엇/왜:** 대표 — ① MCP를 Claude식 "커넥터 둘러보기" 디렉터리로 ② 커넥터 실연동(토큰) 준비 ③ AI 토큰 비용 무제한(H1)을 예산으로 통제.

### 커넥터 디렉터리 (`29750b2`)
- `/mcp`를 Claude 디렉터리식으로: `lib/mcp` category(6종)·featured + 커넥터 13개(Context7·DeepWiki=available, GitHub/Notion/Slack 등=coming_soon; Gmail/Drive는 네이티브라 제외). McpView 검색 + 카테고리/정렬 Select(`shared/Select`) + 추천 섹션 + 리치 카드(로고·배지·설명·액션). 검증 tsc0·lint30/0·build0.

### MCP 토큰 DB 암호화 저장 — Phase A (`08e6d30`, 배포)
- 전역 env(`MCP_<NAME>_TOKEN`) → DB 암호화. 마이그 086 `mcp_servers.encrypted_token`(원격 적용). `connect.ts` bearer 시 `decryptToken` 우선·env 폴백. servers POST/PATCH `token?`→`encryptToken` 저장(admin). 호출부(test·chat·workflow MCP노드) select에 `encrypted_token`. McpView bearer 토큰 password 입력칸. `crypto.ts`(GOOGLE_TOKEN_ENC_KEY) 재사용.

### AI 비용 예산 한도 (`4d6b215`, 배포)
- 결정(대표): 월 예산+실행당 상한·초과 시 hard block·admin 예외. 마이그 087 `workspaces.monthly_budget_usd`(null=무제한). `lib/budget.ts checkBudget`(월 SUM(cost_usd) vs 한도, admin 통과) + `PER_RUN_MAX_USD=$2`. AI 라우트 **9개**(agent chat·workflow run·assistant·cashflow-coach·meeting research 5) 프리플라이트 429. 워크플로우 노드 누적 cost>$2 중단. `/api/budget` GET/PATCH + 설정 "AI 비용 예산" 섹션. 롤백 `08e6d30`.

### 권한 픽스
- 대표(조휘원)가 워크스페이스 owner인데 `role=member`라 MCP "연결" 버튼(admin 전용) 안 보임 → **role admin 승격**(owner 본인 승인, `guard_profile_role` 통과 위해 auth 컨텍스트=owner id). 확인: 실제 연결된 MCP 서버 0개(기능만 라이브).

### A — MCP 사용 흐름 명확화 (`9af4751`, 배포)
- 대표 혼란("연결하고 뭐?") 해소: /mcp 상단 **3단계 사용법 스트립** + 연결된 서버 행 **"에이전트 만들기"**(`/agents/new?mcp=<id>`) → NewAgentPage가 searchParams로 AgentWizard→AgentBuilderForm `prefill.mcp_servers` 체인(위저드 힌트 칩 포함) · 채팅 말풍선에 **🔧 도구 사용 칩**(버려지던 tool-*/dynamic-tool parts 렌더).

### B — 워크플로우 에이전트+MCP 융합 (`75d5944`, 배포)
- **에이전트 노드 MCP 사용**: run 라우트가 agent_versions.mcp_servers 로드→`tools`+`stopWhen(5)`(채팅 동일 패턴)·비용 totalUsage 합산→per-run 상한 반영. **서버당 1회 연결 캐시**(mcp_tool 노드 재연결 제거 통합)+finally 일괄 close.
- **캔버스 MCP 노드 UI**: 툴바 MCP 서버·도구 픽커+"MCP 노드" 버튼(연결 서버 있을 때만) · mcp_tool 노드 플러그 아이콘 · 사이드패널 인자(JSON) 편집({{input}} 안내+실시간 검증, 에이전트 전용 섹션 숨김).
- **잠재버그 픽스**: 조기 return 경로 controller 더블클로즈 TypeError 가드. 적대 셀프리뷰: {{input}} JSON 이스케이프 안전·RLS 프리페치로 타 워크스페이스 서버 차단 확인.

### 후속 소작업 (`8b5bd3d`·`92a914c`)
- MCP 도구 **한국어 설명**(MCP_TOOL_KO 맵 — DeepWiki·Context7 6종, 카드형 + 원문 호버, 워크플로우 픽커 💡힌트) · /mcp 서버 행·워크플로우 패널 **모바일 스팟픽스**.

### 다음 세션 (우선순위 확정 2026-07-08)
1. 🔴 **모바일 반응형** — 실기기에서 사이드바 고정폭 때문에 전 화면 짜부(스샷 #47). 스펙 = `docs/build/mobile-responsive.md`(1차 골격=사이드바 드로어 → 2차 화면 감사 → 3차 복잡 화면 → 4차 터치). Sidebar 반응형 코드 0줄 확인됨.
2. **C — 자동 트리거**(스케줄/웹훅) = n8n식 자동화 완성 조각.
3. 개선 후보: 테스트 안 된 MCP 서버는 도구 캐시 비어 픽커에 안 뜸(테스트 1회 필요).

## 2026-07-07 · 세션27 — Google Drive 탭 + Gmail 리치 작성/AI 다듬기 + 로딩 최적화·배포 (사용자 요청)

### Google Drive (`4c5754b`)
- `drive.readonly` 스코프 · `lib/google/drive.ts`(목록·검색·폴더탐색·다운로드, 구글 문서류 export→pdf/xlsx) · `/api/google/drive/{files,download}` · FilesView **[내 파일 | Google Drive] 토글** + GoogleDriveTab(검색·브레드크럼·다운로드·미연결 시 "구글 연결하기"). E2E: 실제 연결→목록·폴더진입 200.

### Gmail 리치 작성 + AI 다듬기 (`b68cf5c`·`5eeeb38`)
- `buildRawMessage` HTML본문+첨부(multipart) · **MailCompose**(받는사람/참조/숨은참조·Tiptap 서식툴바·첨부·전송, **우측하단 도킹 + 여닫기 모션**) · **MailAiAssist** + `/api/google/gmail/assist`(**격식체·친근체·간결·번역**, 미리보기 후 적용, **AI 티 금지**).

### 로딩 최적화 (`de5c60e`·`728f8cb`)
- Drive/Mail 목록 **SWR 캐시 + 스켈레톤** · Gmail 첫 로딩 18개 · **Gmail 스레드 batch 조회로 N+1 제거**(개별 18회→배치 1회, ~1.5s→~0.5s대).

### AI 톤·배포 정리 (`79b109e`·`46cc1de`)
- 회의노트 다듬기 **이모지·줄표(—)·과한 강조 제거**(사람 문체, "AI 티 금지"). 초안 랜딩 비공개(`/`→대시보드) + 미연결 소셜로그인 UI 제거. 배포 `46cc1de`, 롤백 `676ddcd`. 문서: `docs/build/`·`docs/legal/` 추가.

## 2026-07-03 · 세션26 — 브랜드 Complow 확정 + 코드/문서 교체·배포 (사용자 요청)

**무엇/왜:** 대표 — 예명 "EQURIA 워크스페이스"를 정식 브랜드로. 도메인 조사(브랜드급 exact `.com` 전멸 확인, 60+개 RDAP 조회 전부 taken)·상표(KIPRIS/글로벌 9·42·35류) 검토 끝에 **Complow(컴플로우)** 확정. 발음 깔끔·국내 "컴플로우" 무경합(38류 COMPLOW는 "포기"건이라 무관). 도메인 = `complow.kr`(국내 B2B 메인) + 방어용 `.ai`/`.io`/복합`.com`(`complow.com`은 1999 선점 → 후순위 매입). 근거: B2B는 도메인 아닌 영업·검색으로 유입 → .kr로 즉시 런칭, 글로벌 확장 시 `.ai` 승격.

### 코드 브랜드 교체 (`21c4319`)
- 사용자 노출 브랜드 문자열 EQURIA/이큐리아 → **Complow**: 앱 제목(layout)·로그인·헤더·설정·대시보드 어시스턴트·에이전트 예시/생성템플릿 + `.env.example` APP_NAME.
- 어시스턴트/에이전트 템플릿 "K-뷰티 브랜드" 문구 → **업종무관 사내 워크스페이스로 제네릭화**(제품 = 회사별 커스터마이징 철학). 에이전트 예시 placeholder → "우리 회사의".
- **내부 식별자는 의도적 유지**: `equria:*`(이벤트/localStorage 키 35개)·`equria-*`(CSS 애니명 18개)·`equria.local`(내부 이메일 도메인 폴백) — 바꾸면 로그인·저장상태 깨짐(load-bearing).
- **검증**: tsc0 · lint30-0(신규 0) · build0.

### 문서 (`859cec9`)
- HANDOFF §제목·지금상태·합의된 정책 + CLAUDE §1 브랜드 노트를 "브랜드 미정" → **"Complow 확정"**(도메인·상표 포함)으로 현행화.

**배포:** main-first push → 프로덕션 `859cec9` **READY**. 롤백 후보 `f1199cb`. (DB/마이그 변경 0 — 문자열·문서만.)

### 로고·파비콘 (`c5c33be`)
- 사이드바 워드마크 "Workspace" → **"Complow"**.
- **파비콘 교체**: `app/icon.svg` 신규(다크 라운드 스퀘어 + 흰 C 모노그램, 모노톤 디자인시스템) → Next 자동 `/icon.svg`. 옛 `app/favicon.ico`(초기 기본) 제거. `public/equria-logo*.png`는 코드 미사용 레거시라 유지.
- 배포 `c5c33be`(롤백 후보 `bdee324`). 검증 tsc0/lint30-0/build0(/icon.svg 라우트 확인). ⚠️ 브라우저 파비콘 캐시로 옛 아이콘이 잠깐 남을 수 있음(강력 새로고침).

---

## 2026-07-02 · 세션25 — 손익 엑셀 전문가 계층표 + 계산 유형 만들기 쉽게 (사용자 요청)

**무엇/왜:** 대표 — ① 엑셀을 전문 예산/가계부 템플릿처럼 정리되게(참고 이미지 2장), ② 계산 유형을 사용자가 더 만들기 편하게 + 유형 UI 디벨롭. 각각 착수 전 방향 확정(엑셀=월별 없이·한 장 계층표 / 유형=A 템플릿 발견성+B 커스텀 단순화).

### 엑셀 재설계 (`13ff398` · xlsx.ts 재작성 + CashFlowView 호출부)
- **월별(12칸)은 불가** — cash_accounts에 date 없음(스냅샷). Explore로 확인 → "월별 없이 정리" 확정.
- **한 장 계층표**: 상단 요약박스(통화별 가용현금·순이익·총매출·총비용, graph.summary 리터럴) → **구분(매출/비용/보유금)>그룹>항목 3단계** + 그룹소계·구분소계·총계.
- **핵심 통찰**: kind 최상위 버킷팅 → 그룹 블록 내 동일 부호 → 그룹소계=단순 SUM(기존 SUMIF 부호곡예 불필요).
- **엑셀 네이티브 아웃라인 접기**(exceljs `outlineLevel`, context7로 API 확인): 항목=L2·그룹헤더/소계=L1·구분헤더/소계=L0, summaryBelow → 항목→그룹, 그룹→구분 2단계 +/−(소계 유지).
- **수식 라이브**: 항목 AST(toExcelFormula)·그룹소계 SUM·구분/총계 SUMIF(헤더·소계 행 B 비워 이중집계 방지)·가용현금=시작+순이익−보유. `downloadPnlXlsx(rows, summary)` 시그니처.
- **검증**: tsc0/lint30-0/build0 + **실제 함수 Node 실행→xlsx 되읽기**로 아웃라인 레벨·수식·총계 검산(순이익·가용현금 = summary 일치) 통과.

### 계산 유형 UX (`70b924d` · calcFormula + CalcTypeBuilder)
- 문제: 템플릿 28개가 긴 라벨 평면 스크롤 / "직접 만들기"의 수식 스텝 조립이 사실상 손으로 AST(이전스텝·(1−필드)) → 비개발자엔 어려움.
- **A 템플릿 발견성**: 검색창 + 업종 카테고리 탭(이커머스/비용/F&B/제조/마케팅/서비스/광고·금융) + 이름·수식 분리 표시. calcFormula에 `TEMPLATE_CATEGORIES`·`templateCategory`(28줄 안 건드리고 id 매핑).
- **B 커스텀 단순화**: `BUILDER_PATTERNS`(개수×단가/−차감/판매−수수료%/부가세 포함/마진×수량/금액×비율%) 칩 → 고르면 슬롯 필드 시드 + AST 자동, 칸 이름만 채우면 완성. 스텝 조립은 "직접 만들기(고급)" 칩 뒤로. 편집모드는 고급 진입. 용어 필드→칸.
- **검증**: tsc0/lint30-0/build0. DB 변경 0(cash_calc_types 그대로).

**예상이슈 점검:** 둘 다 DB/마이그/RLS 0. 관심사별 2커밋 분리. 미배포분 없음(세션25 = 이 둘). f/op/c는 calcFormula 모듈 내부 헬퍼라 패턴을 거기 정의(noUncheckedIndexedAccess 미설정 → k[0] 안전).

---

## 2026-07-01 · 세션24 — 현금흐름 계산 UX 대폭 단순화 (사용자 반복 피드백)

**무엇/왜:** 대표가 실제로 써보며 신고 — ① 캔버스 카드에서도 수량/수수료 등 설정되게(→유형 선택기), ② 표 그룹 접기, ③ 카드 계산칸 정렬 엉킴, ④ "금액 설정이 안 된다"(계산형인데 단가 0), ⑤ "유형 뭘 골라야 할지 모르겠다·너무 헷갈려·바로바로 계산되게". 핵심 = **계산 UX가 사용자에게 너무 어렵다** → 쉬운 말+즉시 계산으로.
- **캔버스 카드 유형 선택기**(CashFlowCanvas SlotCard): 표의 유형 `<select>` 미러링. 정액→수량/채널 전환 시 계산칸 등장. 구분 잠김 불일치 수정(isCustom→isOtherCustom, defaultCalcTypeId prop 전달 — 기본계산 카드도 구분 편집).
- **표 그룹 접기**(CashGrid): 그룹 헤더 쉐브론 클릭 → 접기/펼치기(로컬 state, 소계는 계속 표시).
- **카드 계산칸 정렬**: flex-wrap 겹침/잘림 → 세로 목록(라벨 왼쪽·값 오른쪽, 은은한 박스).
- **쉬운 이름**(2결정 확정): 유형 정액→"직접 입력"·수량→"개수 × 단가"·채널→"채널 판매"(ITEM_TYPES). 칸 갯수→개수·단가→개당 가격·판매수→개수·택배비→배송비(BUILTIN_FIELDS).
- **새 항목 기본 = 개수 × 단가**: addSlot을 `item_type:"qty", calc_type_id:null`로(복잡한 회사 기본계산 대신). 사용자가 유형에서 바꿀 수 있음.
- **타이핑 즉시 계산**(2결정 확정): InlineNumber/InlinePercent에 `onLive`(onChange 보고, 커밋은 blur 유지) + `cashAccounts.astOf`(슬롯→AST). 카드/표가 입력 중 로컬 override로 evalFormula 미리보기 → Enter 없이 금액 실시간.
- **배포**: 로컬 dev 검증(핫리로드) → 커밋 `9058b69` → main-first.

**예상이슈 점검:** tsc 0·lint 30/0(신규 0, 새 effect 없음)·build 0. DB/마이그/RLS 변경 0(기존 컬럼만). CashGrid는 로컬 InlineNumber/InlinePercent 별도 정의라 거기도 onLive 추가(중복=known-issues I11②). live override는 뷰 전용 미리보기(커밋=blur→DB).

---

## 2026-07-01 · 세션23 — 현금흐름 AI 코칭 (건강도·절감·이상)

**무엇/왜:** 대표 — 세션15~21로 만든 손익(P&L) 계산기 위에 **AI 코칭**을 얹음. `/finance` "AI 코칭" 버튼 → 현재 손익 스냅샷을 Claude가 분석해 **건강도·비용 절감 제안·이상 신호**를 구조화 카드로. 착수 전 설계안 리뷰 + 2결정 확정(**구조화 카드**·**현재 스냅샷만**).
- **조사(Explore 팬아웃):** 현금흐름 데이터 모델(`buildSlotGraph`→통화별 `CashSummary`+pool)·기존 AI 라우트 패턴(assistant streamText+비용추적 / ocr generateObject)·RLS(035/080)·UI 훅 지점(`CashFlowView` 헤더 버튼군) 맵.
- **설계 결정:** ① **DDL 0·RLS 변경 0·읽기 전용**(기존 데이터 분석만 = safe-changes 최상, 마이그 불필요) ② 카드형이라 스트리밍 아닌 **`generateObject` 원샷**(zod 스키마 검증) ③ 저장 안 함(즉석 생성) ④ sonnet-4-6·온도 0.3.
- **구현(잘게 순차):** ① `lib/claude/schemas` `cashCoachSchema`(health/savings/anomalies) ② `lib/cashCoach`(순수 — `buildCoachPayload` 클라·`buildCoachPrompt` 서버, 비용률·항목 비중 **사전계산**으로 모델 산술오류 방지) ③ `api/finance/cashflow-coach`(auth→generateObject→`agent_usage` 비용추적, assistant 패턴) ④ `CashCoachPanel`(자체 완결 — fetch+상태+카드, 열면 1회 자동 분석+다시 분석) ⑤ `CashFlowView` 버튼+렌더 최소 배선.
- **환각 억제:** 시스템 프롬프트에 "일반론 금지·근거(금액/비율) 필수·근거 없으면 빈 배열·건강하면 good 솔직히·통화 안 섞기" 명시.
- **배포:** 로컬 스모크(라우트 등록·미들웨어 307·dev 에러 0) → 커밋 `84b55ab` → **main-first** ff-only push → feat push. Vercel 프로덕션 배포. 롤백 후보 `9d353c3`(=dae6aae 코드 동일).

**예상이슈 점검:** tsc 0·lint 30/0(신규 0, 새 effect는 기존 disable 패턴)·build 0·새 라우트 컴파일 확인. 읽기 전용이라 RLS 시뮬/적대검증 불요. E2E(인증 세션 실제 Claude 카드)=프로덕션 확인.

---

## 2026-06-30 · 세션22 — 배포 + 적대 코드리뷰 + 문서 정리

**무엇/왜:** 세션15~21 현금흐름 손익계산기를 프로덕션 배포 → 적대 코드리뷰 → .md 중복정리(다음 세션 매끄럽게). 대표 지시.
- **배포**: feat 57커밋 → main fast-forward → push. Vercel 프로덕션 READY(`95f65f1`, 서울 icn1, 빌드 98s) → 리뷰 픽스 후 재배포 **`dae6aae`**. 마이그 078~085는 이미 DB LIVE. 라이브 https://equria-workflow-sass.vercel.app.
- **적대 코드리뷰**(워크플로 2차원×검증, 확정 12건): **진짜 3건 수정** — ① 엑셀 6칸 초과 계산필드 잘림(7번째+ 필드 colOf 누락→'A' 참조 오류) → **입력 컬럼 동적 배치**(colLetter·AMT/통화/NCOLS 동적). ② 그룹 빼기(꺼내기) 위치 `Math.round(0)||120` falsy 버그 → 그룹 오른쪽 옆 배치. ③ localPos prune effect 드래그 중 슬롯 가드. 오탐 9건(드래그아웃 localPos 유지·load기반 색·미래 멀티테넌트/다통화)은 근거와 함께 스킵.
- **문서 정리**: HANDOFF "최종 업데이트/지금 상태"를 세션16(2026-06-22)·미배포 → **세션21·배포 `dae6aae` 현행화**. 배포 SHA `3338917`→`dae6aae`. 마이그 표기 `001~068/078`→`001~085`. **세션13 장문 서술(WORKLOG 중복) 11줄→2줄 압축**. 현금흐름 손익계산기를 "라이브 기능" 단일 블록으로. CLAUDE §6 `001~075`→`001~085` + 현금흐름 5테이블. known-issues **I15**(시드 RLS·다통화 pool).

**예상이슈 점검:** 매 단계 tsc0·lint30/0·build0. 배포 main-first(HANDOFF 팁). 적대리뷰 진짜버그만 수정·재배포.

---

## 2026-06-30 · 세션21 — 계산 칸(컬럼) 직접 편집·추가 + 그룹 정렬/IME/모션 (계획 v7)

**무엇/왜:** 대표 — 표의 고정 계산 칸(판매수/단가/수수료%/택배비)을 회사가 **직접 라벨변경·칸 추가/삭제(부가세 등)**하고 표·캔버스·엑셀 다 반영. 질문 선택 "기본 칸 직접 편집·추가". 그 전 피드백 셋: ① 그룹 안 겹침 → flex 오토레이아웃, ② 한글 IME 중복입력(비용→비용용) → !isComposing 가드, ③ 그룹/카드 디자인 정리 + 그룹 진입 비눗방울 모션(cf-bubble-in).
- **핵심 설계:** 기존 커스텀 유형 인프라(cash_calc_types fields[]+AST·field_values·evalFormula/toExcelFormula·fieldsOf·CalcTypeBuilder·xlsx)를 **회사 "기본 계산 유형"**으로 승격. 표 계산 컬럼 = 그 유형 fields(동적). 캔버스·엑셀은 fieldsOf/AST라 자동 반영.
- **마이그 085:** `cashflow_settings.default_calc_type_id`. 로드 시 없으면 "기본 계산"(판매수/단가/수수료%/택배비 + CHANNEL_AST) **1회 멱등 시드**.
- **표(CashGrid):** 고정 4컬럼 → **기본 유형 fields 동적 컬럼** + **헤더 라벨 인라인 수정** + **"칸 편집" 버튼**(→빌더 편집모드). 기본유형 행=정렬 셀, 정액=대시, 타유형=클러스터. **기본 유형 행은 구분(매출/비용) 자유**(유형 flow가 구분 강제 안 함 — 같은 칸을 매출·비용 공용).
- **빌더 편집모드(CalcTypeBuilder):** 기존 유형 불러와 **update**(필드 추가/삭제/이름 + 수식 스텝 재조립, 스텝 미작성 시 기존 수식 유지). 부가세 추가 = 필드 + `×(1+부가세)` 스텝.
- **새 행:** calc_type_id = 기본 유형(칸 즉시 사용). 유형 변경/필드·수식 변경 시 해당 행 금액 재계산.

**추가 반영(피드백 연속):** ⑥ 그룹 진입 **모션 부드럽게**(easeOutExpo·드롭 옛위치 깜빡임 제거: 즉시 clear 안 하고 로드 후 그룹 localPos 정리) ⑦ **회사 가용현금 '시작 보유' 인라인 편집**(pool 카드) ⑧ **수식 빌더 편집모드**서 기존 AST를 스텝으로 분해(astToSteps)해 자동 로드 → 현재 수식 보고 바로 수정/추가, formulaToText 빈 라벨 폴백 ⑨ **구분 색 자동**(매출=초록·비용=빨강·보유=파랑, kind 변경 시 color=slotColor) + 개별 색 override 유지. 적대 리뷰(세션21 계산칸)서 진짜버그 1건 수정(표 NCOL).

**예상이슈 점검:** 적대 리뷰(세션20)서 진짜버그 2건 수정(엑셀 소계 net·onUp stale). 매 단계 tsc0·lint30/0·build0. 085 additive·시드 멱등·RLS 상속. **미배포(로컬, 마이그 078~085 DB LIVE).**

---

## 2026-06-30 · 세션20 — 캔버스 그룹(컨테이너) + 표·엑셀·CSV 그룹 섹션 (계획 v6)

**무엇/왜:** 대표 — 캔버스 박스를 **그룹으로 묶기**(피그마 오토레이아웃 느낌)·이름·바로 해제, 그게 **표·엑셀/CSV(섹션·소계·수식)**까지 반영. 계획모드 v6 + 3답변 확정(① +그룹 만들고 드래그로 넣기 ② 자동 세로 스택+접기 ③ 표/엑셀 그룹 섹션+소계). 캔버스 연결선은 그 전에 제거(의미 없음).
- **데이터(마이그 084):** 미사용 `cash_categories`(name·color)를 **그룹**으로 재활용 + `x/y/collapsed` 추가. `cash_accounts.category_id`=소속 그룹. 그룹은 **조직화 레이어 — 순이익/가용현금 계산 불변**(buildSlotGraph가 전 슬롯 합산).
- **캔버스(`CashFlowCanvas` 재작성):** slots+groups+pool 직접 렌더(절대배치). 그룹 컨테이너(⠿그립=통째 이동·이름·접기·해제·**소계**) + 자동 세로 스택. **위치 기반 드롭 판정**으로 박스를 그룹에 넣기/빼기/옮기기 한 제스처. `SlotCard` 추출. +매출/+비용/+그룹.
- **표(`CashGrid`):** category_id로 **그룹 섹션**(헤더·색칩·개수·소계행)+미그룹+총계. `renderRow` 추출(정렬/검색 유지).
- **엑셀/CSV:** xlsx 그룹 섹션(▸이름)·소계(SUM 수식)·항목 **수식 유지**·SUMIF 총계(헤더/소계는 B열 비워 제외). CSV 그룹 열.

**예상이슈 점검:** 직접 검증서 **버그 2개 수정** — pool 드래그가 화면에 안 따라옴(localPos 우선), 그룹 넣어도 안 붙음(드롭 후 localPos 제거). 매 단계 tsc0·lint30/0·build0. 084 additive·RLS 상속. **백그라운드 적대 리뷰 워크플로 진행 중**(canvas-drag/finance-export/state-data 3차원→검증). **미배포(로컬, 마이그 078~084 DB LIVE).**

---

## 2026-06-29 · 세션19 — 드래그 편집 캔버스 + 자유 맞춤 계산(업종 27종) + 엑셀 가독성 (계획 v5)

**무엇/왜:** 대표 피드백 — ① 흐름 화면 키우고 박스 드래그 이동(구조 파악) ② 박스 안 구분·이름·금액·설명 편집 ③ 회사 가용현금도 드래그 ④ 유기적 재계산 ⑤ 엑셀 정확 반영 ⑥ 엑셀 색/구분선 가독성 ⑦ 계산 유형 업종별 다양 + **템플릿 아닌 개인 자유 맞춤**. 계획모드(Plan 캔버스 아키텍처 + 리서치 25종)→승인. 캔버스+표 둘 다·큰 캔버스+줌/팬.
- **Part C 엑셀 가독성**: `downloadPnlXlsx` 구분별 정렬·행 배경색(매출 녹/비용 적/보유 청)·전체 테두리·헤더 다크 고정(frozen)·총계 굵게+상단 굵은 선. 수식 유지.
- **Part B 계산 27종 + 자유 빌더**: `CALC_TEMPLATES` 27종(이커머스 정산/변동비·도소매·할인·인건비·MM·객단가·식재료율·제조 재료/불량·화장품·인플루언서·풀필먼트·SaaS·광고 CPC/CPM·중개 GMV·이자·임대료, 리서치). `CalcTypeBuilder` **2모드**: 템플릿 + **직접 만들기**(필드 추가 + 스텝 `[좌][×÷+−][우]`, 좌/우=필드/이전스텝/숫자/(1−필드) → AST 자동, 어떤 업종 공식도). 앱=엑셀 동일.
- **Part A 드래그 캔버스**: 마이그 083(`cash_accounts.note`·`cashflow_settings.pool_pos`). 공유 `inline.tsx`·`fieldsOf`(cashAccounts)·`buildSlotGraph(…,poolPos)`. **`CashFlowCanvas` 재작성** — 카드 상단 ⠿그립으로만 드래그(입력칸 충돌 없음·이동 임계값·window 리스너), **pool도 드래그**(pool_pos 낙관적 저장), 박스 안 구분/이름/금액(또는 계산필드)/설명/삭제, +매출/+비용, ⌘휠 줌·배경 팬, 엣지 두께=금액·화살촉 없음, h-600. `CashFlowView` 배선(moveAccount=x/y 직접저장·reload 없음, movePool). **`CashFlowSummary` 삭제**(캔버스가 대체).

**예상이슈 점검:** 매 단계 tsc0·lint30/0·build0. 083 additive·RLS 상속. `setPointerCapture` 미사용(window 리스너). 라이브 재계산은 updateSlot→load→buildSlotGraph 기존 배선. **남음: Phase C(AI)**·빌더 미세조정. **미배포(로컬 45커밋, 마이그 078~083 DB LIVE).**

---

## 2026-06-27 · 세션18 — 토스식 요약 비주얼 + **커스텀 계산 유형(AST)** (Part A·B)

**무엇/왜:** 대표 피드백 — ① 엑셀 계산 항목(수수료·개수·택배비)을 회사가 직접 정의·커스터마이징(중요·기획 후 진행) ② 흐름도 화살표 의미 불명·토스/애플답지 않음. 디자인 패널(4방향) + Plan 에이전트(계산 아키텍처)로 설계→승인. 결정: 계산=풀 커스텀, 비주얼=토스식 요약.
- **Part A 토스식 요약**(`CashFlowSummary`): n8n 노드그래프 → 회사 가용현금/순이익 히어로 카드 + 매출→회사→비용 은은한 곡선(두께=금액·회색 삼각화살표 제거) + 매출/비용 항목 breakdown 막대. `CashFlowView` 기본 뷰 교체. 의존성 0.
- **Part B 커스텀 계산 유형(AST)**: 핵심 = **하나의 수식 AST에서 앱 계산(`evalFormula`)과 엑셀 수식 문자열(`toExcelFormula`)을 동시 생성** → 앱·엑셀 절대 불일치 없음.
  - **마이그 082**: `cash_calc_types`(name·flow·fields jsonb·formula jsonb, RLS=cash_categories) + `cash_accounts.calc_type_id`·`field_values jsonb`. 레거시 컬럼 유지(무회귀). 프로덕션 LIVE.
  - `calcFormula.ts`(CalcNode AST·eval·toExcel·빌트인 AST·한국어 템플릿·flowToKind·미리보기). `computeSlotAmount`/`updateSlot`: calc_type_id면 evalFormula(AST,field_values)·kind=flow(롤업 유지). `buildSlotGraph` 무변경.
  - `CashGrid`: 유형 select에 회사 커스텀 추가, 커스텀 행은 fields를 인라인 클러스터(InlineNumber/InlinePercent 재사용)·금액 자동.
  - `xlsx` AST화: 행마다 필드 D열~ 배치, 금액 셀=toExcelFormula(빌트인·커스텀 단일 경로), SUMIF 총계.
  - `CalcTypeBuilder` 모달: 템플릿 시드(채널/수량/구독/정률)+필드 이름변경+수식·샘플 미리보기. '계산 유형' 버튼.

**예상이슈 점검:** 매 단계 tsc0·lint30/0·build0. 082 additive·RLS 격리. `values` 예약어→`field_values`. **남음: Phase C(AI 명령/요약)**, 빌더 자유 조합·유형별 엑셀 시트는 후순위. **미배포(로컬 38커밋).**

---

## 2026-06-27 · 세션17 — 현금흐름 → **손익 계산기(P&L) + 함수 엑셀** (Phase A)

**무엇/왜:** 대표가 보여준 **실제 수작업 손익 스프레드시트**(채널별 판매수익·생산/마케팅/물류 비용·순수익)가 진짜 스펙. "슬롯에 금액 하나"로는 부족 → 항목마다 **함수가 들어간 계산** + **수식 살아있는 엑셀**이 핵심. 계획모드(Explore 2: exceljs·기존 계산모델)로 설계→승인. 순서=계산 엔진+엑셀 먼저(흐름도 토스/애플 미화는 Phase B), 매출=제품×채널.
- **A1 마이그 081**: `cash_accounts` += `units·unit_price·rate(수수료율0–1)·extra(택배비/부가세)·item_type(fixed/qty/channel)`. 기존=fixed 무회귀. 프로덕션 LIVE.
- **A2 `computeSlotAmount`(finance.ts)**: 채널 `판매수×(단가×(1−수수료)−택배비)` · 수량 `갯수×단가+정액` · 정액 `금액`. **핵심: 결과를 amount에 기록→`buildSlotGraph` 무변경으로 순이익 롤업·흐름도 반영.**
- **A3 CashGrid 계산기**: 유형(정액/수량/채널) 선택, 판매수·단가·수수료%·택배비 입력→금액 자동·읽기전용(FinanceEntryModal auto-fill 패턴). `updateSlot`이 어떤 칸 고쳐도 amount 재계산. 표 하단 총매출/총비용/순이익.
- **A4 함수 엑셀**: **exceljs 4.4.0**(클릭 시 `await import` lazy=SSR/번들 격리). `lib/xlsx.ts downloadPnlXlsx`: 금액 셀에 **실제 수식**(`=D*(E*(1−F)−G)`·`=D*E+G`) + 총매출/총비용/순이익 `SUMIF`·차감. 열어서 숫자 바꾸면 자동 재계산. `csv.ts` Blob/anchor 패턴 재사용. '엑셀' 버튼.

**예상이슈 점검:** 매 단계 tsc0·lint30/0·build0(exceljs lazy 빌드 클린). 081 additive·기존 RLS 상속. **남음: Phase B**(흐름도 토스/애플 재디자인 — 디자인패널 스펙 확보: 회색화살표 제거→흐르는 점선·두께=금액, 가용현금 드래그+편집, 박스 리사이즈+텍스트 스케일)·**Phase C**(AI 명령/요약). **미배포(로컬 누적 33커밋).**

---

## 2026-06-27 · 세션16 — 현금흐름 지도 **v2** (재설계: 직관적 파이프라인 + 커스터마이징 + AX)

**무엇/왜:** v1(슬롯) 써본 대표 피드백 — 화살표 의미 불명·보유현금 개념 없음(남는현금 음수 혼란)·회사별 커스터마이징/설정·AI·"AX 도입"이 목표. 계획모드(Explore 2: AI연동·설정패턴)로 설계→승인. 흐름 = 매출→회사 가용현금→비용→순이익. 보유현금 = 시작값 입력+자동계산.
- **v2-1 마이그 080**: `cash_categories`(회사별 구분, 추후 그룹핑)·`cashflow_settings`(워크스페이스 시작 보유현금 통화별·기본통화)·`cash_accounts.category_id`. RLS workspace 격리 멤버편집(로그인=합성 `@equria.local` 계정이라 owner≠사용자 → owner 게이트 보류). 프로덕션 LIVE+구조/RLS/advisor 검증.
- **v2-2 흐름도 v2**: `buildSlotGraph` 재작성 — 좌→우 파이프라인(매출 왼쪽 녹색 들어옴 → 회사 가용현금 풀 → 비용/보유 오른쪽 빨강/파랑). 가운데 카드=`시작+매출−비용−보유=가용`·`순이익` 분해. 비용 노드 호버 "이 비용 없으면 가용 ₩X". 구 계좌모델 dead code 제거.
- **v2-3 설정 패널**: 시작 보유현금(통화별)·기본통화, 입력 즉시 흐름도 반영 + `cashflow_settings` upsert.
- **v2-4 슬롯 색 커스터마이징**: 이름·구분·색·금액 전부 자유(스와치 팝오버). cash_categories 그룹핑 시스템은 보류(슬롯 단위가 더 직관적).
- **v2-5 업종 템플릿**: 이커머스/제조/서비스/일반 프리셋 슬롯, 빈 상태 "업종으로 시작".
- **v2-6 그리드 합계행**: 총매출/총비용/순이익/가용현금.

**예상이슈 점검:** 매 단계 tsc0·lint30/0·build0. 080 additive·RLS 격리. **AI(자연어 명령·요약)=다음 단계**(generateObject/generateText·schemas.ts·computeCostUsd 재사용 설계 완료 — 계획서 §2차). 제품 정체성을 **AX(AI 전환) 도입 플랫폼**으로 MD 명시. **미배포(로컬 누적).**

---

## 2026-06-26 · 세션15 — 현금흐름 지도 MVP (대형 신규·계획승인 후 단계적)

**무엇/왜:** 회사 현금흐름을 **n8n식 흐름도 ↔ 노션식 그리드** 두 뷰(같은 데이터)로 보고 경리업무를 툴에서. **계획모드**(Explore 3개 병렬 + Plan 1개)로 재사용자산(finance·WorkflowCanvas·ResearchGraph·csv/PDF·meeting_categories) 파악 후 설계→승인. 확정: **계좌/잔액 모델·SSOT 양방향·기존 /finance 위 확장·MVP먼저(급여=P2·은행연동=P3)·노션 UX**. 계획서=`~/.claude/plans/misty-crafting-lighthouse.md`.
1. **마이그 078** — `cash_accounts`(계좌/버킷·잔액·종류·색·x/y)·`cash_transfers`(내부이체)·`finance_entries.account_id`(nullable). RLS=finance(035) 패턴 복제. 프로덕션 적용+구조/RLS/advisor 검증(새 테이블 보안ERROR 0). types.ts **외과적 추가**(전체 재생성본은 기존 회의코드와 타입 충돌→미채택).
2. **순수 모델** — `cashflowGraph`(computeBalances 통화별·합산금지, buildGraph=계좌+이체+카테고리 외부노드, buildMovements)·`cashAccounts`(종류 SSOT).
3. **CashFlowView(SSOT 부모)+CashGrid(노션DB식 인라인편집)** + `/finance` "현금흐름" 탭(period 공유).
4. **CashFlowCanvas** — WorkflowCanvas 포크(노드=계좌+합성카테고리, 엣지=금액라벨·방향 화살표·종류색)+ResearchGraph 호버 neighbor 강조·⌘휠 줌·배경 팬 이식+포트드래그=이체. `CashTransferModal`.
5. **FinanceEntryModal 계좌 select** — 매출/비용→계좌 연결로 흐름도·잔액 반영.
6. **CSV/PDF export**(거래내역 CSV·잔액요약+거래 PDF, 의존성 0).

**예상이슈 점검:** 매 단계 tsc0·lint30/0, 최종 **next build 0**. 078 additive/nullable→기존 finance 무영향·RLS workspace 격리. SSOT=부모 load+파생(useMemo)+공유 mutation 핸들러(useUndo). **남음:** P2 급여엔진(4대보험·3.3%·소득세, 대표전용 RLS=attendance_viewers 패턴)·P3 정기/현금런웨이·전자결재연동·.xlsx·감사로그·오픈뱅킹(계좌모델이 seam). **미배포(로컬 21커밋, push 보류).**

---

## 2026-06-26 · 세션14 — 채팅 UX 정리(리액션·알림·미읽음)·전환속도·Opus단가 (사용자 신고/요청)

**무엇(쪼갠 내용):**
1. **CardsView 미커밋 변경 되돌림** — 직급 제거+빈줄이 의도치 않은 변경(git HEAD가 정답) → `git restore`로 직급 복원+빈줄 제거.
2. **리액션 이모지 통일**(작업#1) — DirectChat이 이모지를 lucide 아이콘으로 매핑(REACTION_ICON)해 DM=아이콘/그룹=이모지로 갈림 → renderReaction을 실제 이모지 렌더로, 미사용 lucide import 7종 제거. 대표 결정=이모지.
3. **그룹채팅 알림(마이그 076)**(작업#2·3) — 진단: DM은 트리거(on_new_dm) 정상인데 그룹은 알림 트리거 자체가 없음. + `notifications.type` CHECK에 'group' 미포함 → AFTER INSERT라 미추가 시 그룹전송 롤백(선제 차단). `handle_new_group_message` 트리거(커스텀방만, 전체방=소음제외=대표결정)·`mark_room_read`가 group 알림도 읽음정리. **롤백검증(DO+RAISE) 통과: 수신자1/발신자0/전체방0, 실데이터 영향 0.**
4. **카카오톡식 인앱 토스트**(작업#4) — NotificationBell realtime INSERT 시 sonner 토스트(DM·그룹 공통, 보고 있는 방 생략(pathname), 클릭 이동). exhaustive-deps(router) 정리.
5. **ChatList 그룹 미읽음 회귀**(작업#5) — 075가 group_read_state SELECT를 멤버공개로 확대하자 ChatList가 `.eq(user_id,me)` 없이 읽어 남의 읽은시각 집음 → 필터 추가 + realtime에 group_messages 구독 추가(미읽음 즉시 갱신).
6. **전환 버벅임**(작업#6) — 측정: loading.tsx 0개라 라우트 전환 시 블로킹 + 27개 컴포넌트가 마운트마다 auth.getUser() 왕복. → `(app)/loading.tsx` 추가(즉시 스켈레톤). getUser 왕복 제거(CurrentUserProvider)는 27파일이라 작업#7로 큐(대표 승인=점진·검증).
7. **Opus 추정단가 정정** — pricing.ts opus $15/$75(구 Opus3가)→$5/$25(현 Opus4.7). 마이페이지 법무에이전트 추정비용 3배 과대표시 해소. haiku도 $1/$5로.
8. **회의노트 정리(작업#8·9·10)** — 표 뷰 분류 색태그 필터 칩 제거(분류 컬럼·관리·정렬 유지) · 이미지 진단: 저장 이미지는 정상(DB·URL 200 검증), 깨진 건 리서치 "이미지 찾기" 후보 썸네일→`onError`로 숨김 · **꼬리물기 그래프 영구화**: 마이그 077 `meeting_notes.graph`(jsonb)→저장 시 graphData 저장, 노트 재오픈 시 독립 렌더로 인터랙티브 복원(LIVE, 노드 성장분은 v1 제외) · 인라인 코드리뷰로 "그래프 X→저장 시 삭제" 버그 잡아 **X=접기(graphCollapsed)·다시보기 버튼**으로 수정.
9. **getUser 왕복 제거(작업#7)** — `CurrentUserProvider`(서버 (app)레이아웃 user.id→client context)+`useCurrentUserId()`. 첫 적용 useUnreadDms 검증 후 인라인 9곳 + **병렬 워크플로(18에이전트, 파일당 1)** + agents 클라페이지 3곳 = 클라 컴포넌트 ~27곳 전환. 매 배치 tsc0·lint30/0, 최종 next build 0 전수검증. 남은 getUser=서버(레이아웃·proxy·서버페이지)·upload 유틸뿐(마운트 왕복 아님).

**예상이슈 점검:** 매 단계 tsc0·lint30/0 유지 · 마이그 076 RLS/CHECK 함정 선제 차단·롤백검증 · 토스트는 (app)레이아웃 Toaster 마운트 확인 · ChatList 수정은 075 RLS 확대의 회귀라 최소수정. **남음:** 작업#7 getUser 스윕. **배포:** 보류(로컬 확인 후) — 단 **마이그 076은 프로덕션 DB 적용+검증 완료(LIVE)**, 프론트는 미배포.

---

## 세션13 후반 — 그룹채팅(카카오톡식) [`141b80b`~`3338917`]
**무엇/왜:** 로드맵 ①그룹채팅. DM(`direct_*`)은 user_a/user_b 2인 고정이라 그룹 부적합 → **별도 `group_*` 테이블 병렬 구축**(Explore 에이전트가 DM RLS 5대 위험 짚음 → DM 미접촉이 가장 안전). 단일 전체방 + 카카오톡식 멤버 초대 다중방. **차곡차곡: DB→타입→UI 단계별, 매 단계 tsc/lint/build/RLS 검증.**
1. **DB 기반(마이그 071·072)** — `group_rooms·group_messages·group_message_attachments·group_message_reactions·group_read_state`. 메시지 모델 DM 동형(body_json·스레드·soft-delete). `is_room_member` 헬퍼·`mark_room_read` RPC·`touch_group_room` 트리거·realtime·기본방 시드. 072=함수 권한 하드닝(anon 제거). RLS=`is_workspace_member`.
2. **storage(073)** — 그룹 첨부 읽기 정책(ADD-only, DM 024 미접촉) — 멤버 signed URL.
3. **UI 1차(`668d687`)** — `GroupChat.tsx`(MessageBody·RichComposer·AttachmentList 재사용): 발신자 아바타·이름·직급, 날짜구분, 낙관적 전송+첨부, 실시간(room필터), 반응5종, 본인 수정/소프트삭제(Undo), 읽음. `/chat/group` + ChatList 진입.
4. **다중방(마이그 074)** — `room_members` + `is_room_member` 재작성(default=ws/커스텀=room_members). `create_group_room`/`add_room_members`/`leave_group_room` RPC. `group_rooms` SELECT=is_room_member(내 방만). GroupChat roomId prop화(`/chat/group/[roomId]`)·헤더 초대/나가기. ChatList 그룹 섹션+생성 모달(`MemberPickerModal` 공용).
5. **읽음표시(마이그 075)** — `group_read_state` SELECT 멤버공개(쓰기 본인만)+realtime. 메시지별 **안 읽은 인원 수**(카카오식, 발신자 제외·last_read_at<메시지시각) 노란 숫자.
6. **UI 정리** — 회의 '그래프'→'**꼬리물기**' 명칭 통일(`b172c37`). 그리드/표 토글 균형 세그먼트화(`3338917`).
**예상이슈 점검:** DM 4테이블 RLS 미접촉(별도 group_*)으로 5대 위험 회피 · RLS 단언 통과(비초대 차단·전체방 유지·멤버 인식) · 보안 advisor ERROR 0·anon 노출 제거 · 타입 수동 추가(드리프트 0). **롤백:** 토글전 `7d41cc6`/읽음전 `b65c30e`/다중방전 `668d687`/그룹챗전 `0030e9e`. **남음:** 답장·타이핑·사이드바 미읽음 합산.

---

## 사용자 요청 기능/수정 (마스터 체크리스트)

**수정(작은 것 먼저):**
- [x] 채팅 알림 자동삭제(채팅방 입장 시 종 배지 사라짐)
- [x] 채팅 '1'(읽음) 입장 시 사라짐 — 기존 동작 확인
- [x] 스크롤바 ↔ 채팅 겹침 — `pr-4`로 여유 확대
- [x] 파일 한번에(다중) 업로드
- [x] 파일 분류: 공개/개인/부서 (2단계)

**추가 기능(순차):**
- [x] 3단계 — 업무 통합: 근태관리 · 지출결의서 · 휴가제출 (한 곳에 배치)
- [x] 4단계 — 팀 회의 노트: 회의록 작성/수정/업로드/공유 + 옆에 AI 보조 버튼 상시
- [ ] 5단계 — 노션식 새 페이지: 블록 에디터 + `/` 슬래시 명령(전 기능) + AI 상시 (가장 큼·단독)

---

## 2026-06-24 · 세션13 — 회의노트 에디터 퀄리티 Part 1 + 메시지 즉시전송·포커스·Drive카드 (사용자 신고/요청)

**무엇(쪼갠 내용):**
1. **회의노트 에디터 퀄리티 Part 1**(`651e503`·`910b2a8`·배포) — 조사(Explore 2): Tiptap 슬래시엔진·커스텀노드·AI스트리밍은 잘 됐으나 블록편집 어포던스 전무("표면적"). 1a 표 편집(BubbleMenu 플로팅: 행/열 추가·삭제·헤더·병합/분할·삭제 + 리사이즈 그립 CSS) → 1b 선택 인라인 툴바(굵게·기울임·취소선·코드·형광펜·링크) → 1c 코드 하이라이트(CodeBlockLowlight+lowlight 8언어·NodeView 언어드롭다운·복사·미드톤테마) → 1d 이미지 정렬·alt(BubbleMenu) → 1e `/날짜`. 신규 `editor/EditorMenus.tsx`·`CodeBlockView.tsx`. 새 deps 전부 Tiptap v3 공식·소형. 매 단계 tsc0·lint30/0·build0. context7로 v3 BubbleMenu(`@tiptap/react/menus`)·table·lowlight API 확인.
2. **메시지 전송 지연**(`840aba8`) — 진단: "낙관적" 주석과 달리 컴포저가 insert 왕복 후에야 clear, 말풍선도 반환 후 표시 → 왕복만큼 느림. → 컴포저 즉시 clear(실패 복원) + send에 클라생성 id로 낙관적 말풍선(에코 dedup·실패 제거).
3. **사이드바 방향키 포커스**(`ade8d08`) — 브라우저 기본 outline이 항목(rounded-md)보다 떠보임 → `ring-inset` 으로 딱 맞게.
4. **Files Google Drive 카드**(`9f503da`) — 큰 박스 → 한 줄 컴팩트(연동 후 클릭→진입 구조).

**왜:** 회의노트가 "표면적"이라는 사용자 피드백(표 편집 안 됨 등) → 에디터 퀄리티 정밀화(과금 0, 에디터 먼저). 나머지는 사용자 신고 버그/UX.

**확정 결정(AI 검색·요금):** Tavily 보류(나중 티어드) · **AI=유료 요금제 전용**(무료판 AI 불가) · **우리 팀은 지금 사용 가능**. AI 리서치 flow(Part 2)는 설계만, 미착수.

**예상이슈 점검:** 새 deps=Tiptap 공식 소형(pdfjs류 아님, 빌드 통과) · 읽기전용 메뉴 숨김(editable 게이트) · 낙관적 전송은 클라 id 공유로 에코 중복/레이스 없음 · set-state-in-effect 베이스라인 30 불변. **롤백:** 에디터=`651e503`(1d/1e전)/`1745445`(전체전), 메시지=`ade8d08`.

**추가 — 표 노션강화 + 회의 DB (`e603f85`~`a9f19e6`):**
7. **표 강화** — 선 가시화(foreground 22%)·노션식 메뉴(행/열 전방위 삽입·헤더행/열·병합)·**셀 배경색 8종**(TableCell backgroundColor + setCellAttribute, data-bg color-mix)·**열 균등분할**(colwidth 제거 커스텀 command).
8. **회의 DB 뷰(메타데이터)** — 마이그 070: `meeting_categories`(사용자정의 분류·색·RLS 워크스페이스) + meeting_notes `category_id·importance·meeting_time` + `set_meeting_meta` RPC(멤버 누구나, 폴더 패턴). `/meetings` **표(DB) 토글** — 분류 색태그·중요도·일시 인라인 편집, 분류 관리(추가/색7/삭제), 정렬(날짜·중요도)·필터(분류). `MeetingTable.tsx`·`lib/meetingMeta`(프로젝트 재사용). 기본분류 5종 시드. 스코프=단일분류·고정중요도(사용자 확정). **타입 수동 추가**(regen 드리프트 방지). **결정 보류:** 파일컬럼·프로젝트 중요도 연동=다음.

**추가 — AI 리서치 Part 2 (`ac77c71`~`8bc6bf2`):** 회의 에디터 `리서치` 버튼 →
9. **2a 검색·신뢰도** — `/api/meeting-notes/research`: Claude + `anthropic.tools.webSearch_20250305`(maxUses5·KR) → 신뢰도 1차(관련성)·2차(권위·최신성·교차검증) 카테고리 정리 + 출처. 웹서치 실패 시 Claude 지식 폴백(최신성 한계 명시). 비용 `agent_usage`.
10. **2b 이미지** — `/research/images`(출처 og:image/twitter:image 추출·SSRF가드·HTML만) + `/research/image-import`(외부→meeting-media 다운로드·재업로드·이미지만·SVG차단·15MB) + `lib/safeFetch`. 후보 그리드 다중선택→삽입.
11. **2c 초안·검증** — `/research/draft`(보고서/기획서·자료범위 밖 날조 금지) + `/research/verify`(generateObject+Zod 적대적 팩트체크, 주장별 supported/weak/unsupported). UI: 타입토글·초안표시·검증 색배지. `mdToContent`로 마크다운→Tiptap 삽입.

**추가 — 지식 그래프 + 대화형 (`e9d14bd`~`0030e9e`):**
12. **지식 그래프** — `/research/graph`(generateObject로 개체·관계 추출) + `ResearchGraph.tsx`(d3-force 물리 + 캔버스). **플랫 단색 노드**(InfraNodus식·차수 크기·호버 발광)·인라인 패널(전체화면 토글)·⌘+휠 줌·배경 팬·노드 드래그. **리서치 시 자동 생성**(내용+망 동시).
13. **꼬리물기** — `/research/node`(노드 설명·꼬리질문·연관개념). 노드 클릭 → 옆 팝오버 카드. 칩 클릭 시 **이전 Q&A 누적 스레드**(`Card.steps[]`, 스파이더 웹)·**망 성장**(연관노드 동적 추가·중복 라벨 링크만·시뮬 재가열). 본문삽입=스레드 전체. ref 렌더접근 회피(openRef effect·wrapSize state).
14. **대화형 리서치** — `/research` prior 누적: 후속 입력창+퀵칩(더깊게·출처더·경쟁사·최신·리스크)으로 정리본 고도화, 그래프도 함께 갱신. `runResearch(followup?)` 멀티턴.
15. **이미지 크기 + PDF** — SafeImage `width` 속성 + 메뉴 프리셋(S35/M60/L85/원본·연구삽입 기본60%). PDF=새 창 인쇄식(자체 CSS, dep0, 한글 안전).
**전제:** Anthropic web search 활성(미활성=2a 폴백·2b 출처없음·그래프는 동작). 새 dep `d3-force`. `lib/safeFetch`(SSRF가드). **검증:** 매 배포 tsc0·lint30/0·build0.
**⚠️ 전제:** Anthropic 콘솔 web search 활성+결제(대표 액션) — 미활성이면 2a 폴백·2b 출처 없음. **검증:** 매 단계 tsc 0·lint 30/0·build 0. context7로 web_search API 확인.

---

## 2026-06-24 · 세션12 — A② 온도차등 + 작업 하네스(루프/하네스 엔지니어링) + 재무 UI 재구성(워크플로우)

**무엇(쪼갠 내용):**
1. **A② 에이전트 온도 차등(마이그 068·라이브)** — 8개 기본 에이전트 성격별: 정확성(번역·세금·법무)=0.3 / 균형(CS·데이터=0.5·문서=0.6) / 창의(SNS·이미지)=0.9. 067로 라이브 v2가 이미 0.7이라 마이그 068(데이터 UPDATE)로 현재버전 temperature 변경 + seed.sql 동기. A①(매뉴얼)+A②(온도)로 "똑똑한 에이전트" 완결.
2. **작업 하네스 구축(`cacf4f4`)** — 대화 중 "루프/하네스 엔지니어링" 논의 → 우리 작업방식을 점검(훅 0·하네스 문서뿐)하고 코드화. ① `.claude/settings.json` 훅: **pre-push 게이트**(`if:Bash(git push*)`로 push 때만 tsc 강제+lint 회귀차단) · **Stop 검증**(src 변경 턴 tsc 자동, 보고전용) — 스크립트 `.claude/hooks/`. ② 명령 `/deploy`(tsc→lint→build→main먼저push→feat→Vercel확인→문서)·`/verify`(tsc+lint). ③ `work-harness` 스킬(작업 SOP·멀티에이전트 기준·**진행상황 가시성 1순위**). 균형(편집마다 X)·검증게이트만(자동수정 X) = 적극+안정.
3. **재무 UI 재구성(`e1789f3`·배포)** — 962줄 단일 `FinanceView`를 **탭(요약/내역/세금계산서) + 월 기간필터 + 경량 차트**로. **멀티에이전트 워크플로우 2종**으로 진행: ⓐ 설계 판정단(3안 병렬→점수·합성, 안1 베이스+안2·3 graft) ⓑ 적대 검증(통화분리·RLS/undo·회귀·React건전성 4차원, **4/4 pass·이슈 0**). 신규 `usePeriodFilter`(기간 훅)·`financeAgg`(순수 집계, **통화분리 내장**)·`financeCharts`(TrendBadge 증감%·TrendBars 인라인SVG·BreakdownBars CSS — **npm 패키지 0**)·`FinanceEntryModal`·`TaxInvoiceModal` 분리.
4. **원화 환산 합계(`12a1453`·배포, 마이그 069)** — 요약 탭에 '원화 환산 합계' 카드(전 통화→KRW). 통화별 분리는 유지하고 환산만 별도(기준환율·날짜 명시 = 투명, 몰래합산 원칙 유지). `fx_rates` 테이블(전역 참조데이터, 쓰기=service_role) + `/api/finance/fx-rates` BFF(일별 캐시 외부≤1회/일, **ECB/Frankfurter 무키**, base=EUR 풀정밀도, 실패 시 DB 폴백). 방식A(오늘환율)·**BTC 제외**(자기 통화로 따로). 사용자 요청 "실시간 말고 일별".

**왜:** A는 로드맵 "지금 안전·고가치"(에이전트 차별화 완결). 하네스는 작업을 더 적극·안정·가시적으로(사용자 요구). 재무는 로드맵 3차 大작업 — 첫 워크플로우 실전 적용(loop/harness 엔지니어링 시연).

**예상이슈 점검:**
- 통화 합산 위반 → 적대검증 currency 차원 10지점 추적, 위반 0(KRW-only가 실제 currency===KRW만 필터, TrendBadge 동일통화 비교).
- 회귀 → 기간 기본 `'all'`(원본 전체동작=무회귀), 모달 분리 원본과 바이트 동일, set-state-in-effect 베이스라인 30 불변.
- 차트 빌드 리스크 → 새 의존성 0(CSS/SVG만, pdfjs 교훈).
- 게이트: tsc 0 · lint 30/0 · next build 0 · 적대검증 4/4.

**롤백:** A②=전부 0.7 / 재무=`fbec1a9`(직전 프로덕션).

**추가 — 성능·버그픽스 (`1745445`·배포):** 사용자 신고 "전환 느림 + 채팅 첨부 안 열림(about:blank)".
5. **페이지 전환 느림** — 진단: Vercel 함수=iad1(미국) ↔ Supabase=서울 → 매 요청 태평양 왕복(레이아웃 getUser+profiles+페이지 쿼리). **`vercel.json` `regions:["icn1"]`(서울)** co-locate → 왕복 ~200~400ms→~10ms.
6. **채팅 첨부 about:blank** — 진단(Explore 에이전트): 파일 링크 `target=_blank`+`download`+크로스오리진(Supabase)이라 빈 탭. → **target 제거 + Supabase 서명 `download` 옵션**(Content-Disposition attachment, 그 자리 다운로드). + **서명 폭풍**(매 이벤트 전체 재서명·교체→깜빡임) → **증분 서명**(`attachmentsRef` 캐시 재사용·병합). ※"받은사람 열람불가" 첫 가설은 빗나감(스토리지 정책 024로 이미 해결). 게이트 tsc0·lint30/0·build0.

---

## 2026-06-24 · 세션11 2차 — Finder 정교화·미리보기 버그픽스·근태 월별·직급 전면·설정 직급관리 (사용자 반복 피드백)

**무엇(쪼갠 내용):**
1. **파일 Finder 정교화** — 폴더 안=항상 아이콘 그리드(맥북 폴더창)·루트만 토글 / 공개범위 탭→**컴팩트 드롭다운** 분리 / 컨트롤 **조건부 노출**(공개범위 2종↑·폴더 2개↑·낱개파일 있을 때만) / 컨트롤 높이 h-8 정렬.
2. **미리보기 버그픽스(핵심)** — files 버킷 스토리지 정책(015)이 "본인 폴더만"이라 **공개 공유된 남의 파일은 클라가 서명 URL 불가**(빨간 아이콘 + "링크 생성 실패"). → 서버 BFF `/api/files/signed-url`(유저 RLS 인가→admin 서명, finance receipt 패턴). 본인·공유 파일 모두 미리보기/호버 동작. **썸네일 제거→종류 아이콘 통일**(요청), **pdfjs-dist 의존성 삭제**(빌드 리스크 제거).
3. **선택 UI** — 화면 안 밀리는 **하단 플로팅 SelectionBar** + 부드러운 원형 **SelectCheck**(쨍한 네이티브 체크 교체) + 소프트 선택 틴트 / 호버 미리보기는 **아이콘 위에서만** + **드래그 시작 시 닫힘**.
4. **드롭다운 고급화** — 공용 `Select` 메뉴 rounded-xl·여백·shadow·primary 체크. "폴더로 이동…" 체크 어색함 제거(placeholder).
5. **근태 개편** — 혼합 시간순 리스트 제거 → **인원별 마스터/디테일**(이름검색+오늘상태→선택자 상세) · **월별 보기**(`MonthStepper` ◀▶, 개인·팀) · **24시간제**(오후 중복 제거) · "0분" 숨김 · "내 근태"/"나" 표시.
6. **설정 직급관리** — 대표 전용 "구성원 직급" 섹션(설정에서 전 직원 직급 일괄 설정, set_member_position RPC 재사용).
7. **직급(position) 전 화면 반영** — 채팅(상대·연락처·최근)·전자결재(기안/결재선/참조/댓글)·회의노트 작성자·공지·명함 등록자·프로젝트·지출/휴가·마이페이지·근태. 쿼리에 position 추가+표시(있을 때만, muted). 명함 "등록자별"→"직원별" 라벨.

**왜:** 사용자 반복 UI 피드백 + "직급이 채팅 등에 안 보인다 다 되게".

**예상이슈 체크:** DB 스키마 변경 0(새 라우트=BFF, 쿼리에 position 추가만). 스토리지 미리보기는 admin 서명이라 버킷 'files' 고정·경로는 그 파일 metadata만(교차노출 없음). 직급 sweep은 탐색 에이전트로 전수 매핑 후 적용(병렬). pdfjs 제거로 빌드 단순화. tsc 0 · lint 30/0 · **next build 통과** 후 배포.

**마이그/커밋:** 마이그 없음. 커밋·배포 ↓.

---

## 2026-06-23 · 파일/회의노트 macOS Finder식 폴더 UX + 실제 썸네일 (사용자 반복 피드백)

**무엇(쪼갠 내용):**
1. **공용 `FolderGrid`** 추출 — 테두리 없는 회색 라운드 사각·중립 폴더 아이콘(파란색 아님), 더블클릭 진입, **여러 항목 묶음 드롭**, hover 이름변경/삭제. 파일·회의노트 공용. 구 `FolderSidebarItem` 제거.
2. **`FilesView` 재구성** — breadcrumb(전체 › 폴더) 진입/나가기 · 폴더 그리드 · 리스트↔아이콘 토글 · **다중선택(체크박스)+묶음 드래그+"폴더로 이동" 바** · 폴더 정렬(이름/최신/오래된/개수) · **날짜 그룹(오늘/이전7일/이전30일/월별)** · 종류별 색 아이콘 · **실제 썸네일**(이미지=`createSignedUrls` 배치, PDF=`pdfjs-dist` 1페이지 lazy 렌더) · 리스트 행 정리(액션 hover·이동 드롭다운 제거).
3. **`MeetingsView`** 동일 FolderGrid/breadcrumb/다중선택/정렬로 통일.
4. **`CardsView`** "등록자별" → "직원별" 라벨(owner=등록 직원이라 동작 동일).

**왜:** 사용자 반복 피드백 — "맥북 Finder처럼 폴더 정리·썸네일". 폴더 콘텐츠 콜라주는 시도→되돌리고 **리스트 파일 썸네일**로 정정.

**예상이슈 체크:**
- `pdfjs-dist 6.0.227` 추가 → 동적 import + **jsdelivr CDN 워커**(번들러 워커 설정 회피)로 **`next build` 통과 확인**(핵심 리스크 게이트). 워커는 인터넷 필요(사내툴 OK)·오프라인/실패 시 종류 아이콘 폴백. 썸네일 세션 캐시.
- DB 변경 없음(순수 프론트). tsc 0 · lint 30/0(신규 0).

**마이그/커밋:** 마이그 없음. 커밋·배포 ↓.

---

## 2026-06-23 · A① 기본 에이전트 8개 매뉴얼 재작성(7섹션 백본) · 라이브 버전업

**무엇(쪼갠 내용):**
1. **진단 확인** — 기본 8개 시스템 프롬프트가 ~100~300단어(296~458자)로 빈약: 예시0·절차0·엣지케이스0·고유지식0(AGENTS-MCP-STRATEGY §2). "멍청"의 원인은 모델이 아니라 매뉴얼 품질.
2. **7섹션 백본으로 재작성** — ①역할&경계 ②회사 컨텍스트(회사별 교체 영역) ③단계별 절차 ④금지선 ⑤예시 3개 ⑥엣지케이스 ⑦출력형식&성공정의. 회사 고유값(이큐리아/K-뷰티/정책)을 "회사 컨텍스트" 한 블록에 모아 둠 → 회사별 판매 시 그 블록만 교체(슬롯 주입 엔진은 아직 없어 순수 `{{ }}`는 라이브에서 글자 그대로 보임 → 현재값으로 채우되 교체점만 격리).
3. **seed.sql 재작성**(새 설치 SSOT) + **마이그 067**(라이브 업그레이드) — 8개에 version 2 추가 + is_current. `on_agent_version_created` 트리거가 v1을 자동 비활성. `on conflict(agent_id,version) do update`로 멱등.
4. **모델·max_tokens·temperature 무변**(A①=프롬프트만). 법무=opus-4-7 유지, 나머지 sonnet-4-6. temperature 0.7 유지(차등은 A② 별건).

**왜:** A①(지금 안전·리스크 0·바로 착수). 매뉴얼 품질만 올려 라이브 8개를 즉시 똑똑하게.

**예상이슈 체크(검증):**
- **라이브 적용 전 상태 확인**: 8개 전부 version 1만·created_by null(사용자 편집 없음) → version 2 추가가 안전·비클로버.
- **적용 후 검증(execute_sql)**: 8개 전부 is_current 정확히 1개(=v2), 모델 보존, 프롬프트 296~458자 → 973~1629자(3~5배).
- **되돌리기**: v1 보존 → v1을 is_current=true로 올리고 v2 삭제하면 원복(비파괴).
- **길이 판단**: 스펙의 "1000단어대"는 예시 수치 — 토큰비용 대비 가치 위해 패딩 없이 7섹션·예시3·엣지케이스를 빽빽이(≈한국어 300~450단어). 더 풍부하게는 A③(회사지식 워크샵)에서 실제 정책·사례로 슬롯 채움.
- DDL 없음(데이터 마이그) → types.ts 무영향, tsc 무관(.ts 미변경). 원격=디스크(067).

**마이그/커밋:** 067 적용(원격 등록 `067_smart_default_agent_prompts`=디스크). **커밋 대기.**

---

## 2026-06-12 · 전자결재 마무리(재상신/편집) · 드롭다운 선택 복구 · 채팅 타이핑/시간

**무엇(쪼갠 내용):**
1. **전자결재 마무리** — ① 반려 문서 **재작성**(마이그 060 `revise_document`: 반려→임시저장 + 결재선 도장 초기화, SECURITY DEFINER) → 수정 후 재상신. ② 임시저장 문서 **편집**(`NewDocumentModal` 편집 모드 — 기존 문서 UPDATE + 결재선 교체, RLS상 임시저장 소유자 허용). `DocumentDetail`에 편집/재작성 버튼.
2. **드롭다운 선택 복구(앱 전체)** — 공용 `Select`이 Base UI 메뉴에 Radix식 `onSelect`를 써서(=DOM 텍스트선택 이벤트, 클릭에 안 불림) **모든 드롭다운 선택이 안 먹던 것** → `onClick`으로 수정(한 줄). 전수조사 오용 1곳뿐.
3. **채번 버그(리뷰 HIGH)** — `submit_document`가 `개수+1`로 채번해 회수·재작성으로 비운 번호와 충돌(uq 위반)→재상신 영구 실패 → 마이그 061: **`최대번호+1`** + 동시상신 advisory lock.
4. **채팅 ① 작성 중… 인디케이터** — 기존 채널에 **broadcast 'typing'**(DB 무관 일회성), 상대 입력 시 하단 점3개 물결(`equria-typing` keyframe). `RichComposer.onTyping`(throttle 1.5s 발신). **② 시간 표시** — 카톡식(같은 사람·같은 분 연속이면 마지막에만), 말풍선 텍스트 바닥선에 정렬(`leading-5`+`mb-1.5`).
5. **채팅 key 수정(리뷰 HIGH/MED)** — `<DirectChat key={userId}>` → 대화 전환 시 remount로 상태 초기화(타이핑 잔류·이전 대화 잔상/레이스 차단). 기존 잠복 버그까지 해소.

**왜:** 사용자 요청(결재 마무리 / "왜 선택이 안돼" / 카톡식 작성중·시간). 리뷰는 적대 워크플로우 2회.

**리뷰 확정 수정:** 전자결재 채번 HIGH→061 · 채팅 typing stuck HIGH + 잔상 MED→key 한 줄. 채팅 broadcast 미게이팅은 LOW(아래 known-issues I14).

**예상이슈 체크:** 060/061 멱등(create or replace)·롤백 트랜잭션 검증(재상신 EQ-0004 충돌없음·반려→임시저장 초기화). 타이핑=broadcast라 스키마 무관. tsc 0 · lint 30/0 · build exit 0.

**마이그:** 060·061 적용(원격=디스크). **커밋·배포 대기.**

---

## 2026-06-11 · 알림 모두읽음 · 사이드바 폴더 접기 · 대표 권한부여 + 싹 리뷰

**무엇(쪼갠 내용):**
1. **알림 모두 확인** — `NotificationBell.tsx`: 벨(드롭다운) 열면 `onOpenChange`에서 `markAllRead()` 호출 → 안 읽음 배지 즉시 클리어. (리뷰 반영: 쓰기 `{ error }` 캡처 후 **성공 시에만** 낙관적 클리어 — supabase-js는 실패해도 throw 안 함, 배지 거짓 해제 방지.)
2. **사이드바 폴더 접기/펴기** — `Sidebar.tsx`: 그룹 헤더를 클릭 가능 버튼으로(ChevronDown 회전), `collapsed`(그룹 id 목록) localStorage 저장(`equria:sidebar-collapsed`), grid-rows 0fr↔1fr 트랜지션. (리뷰 반영: ① 닫힘 래퍼에 `inert` — 접힌 항목이 키보드 탭/스크린리더에 안 잡히게(a11y) ② `hasActive` — 현재 경로가 접힌 폴더 안이면 자동 펼침.)
3. **대표→구성원 관리자 권한 부여** — 마이그 **058**(`guard_profile_role` 트리거 + `set_member_role` RPC, 오너 게이트·자가상승 차단) + `MembersView.tsx`(대표만 보이는 "관리자로 지정/해제" 버튼, 대표/관리자 배지). types.ts에 `set_member_role` 추가.
4. **마이그 059(리뷰 반영·권한 범위 축소)** — `owner_can_set_role(target)` 헬퍼 신설: 전역 `profiles.role` 변경을 **"대상의 모든 소속 워크스페이스를 호출자가 소유"할 때만** 허용. 058은 "어떤 워크스페이스든 소유"라 멀티테넌트(B2 초대) 도입 시 교차테넌트 권한상승 잠재 → 좁힘. trigger·RPC 모두 헬퍼 사용.

**왜:** 사용자 요청("알림 버튼 누르면 모두 확인 / 사이드바 폴더별 정리 / 대표가 지정한 사람한테 권한"). 리뷰는 "리뷰 한번 싹 하고 배포".

**싹 리뷰(적대 워크플로우, 4차원→적대검증):** 확정 4건 전부 수정 — ① [med] 058 교차테넌트 상승(잠재)→059 ② [med] 접힌 폴더 포커스 노출→inert ③ [low] 모두읽음 실패 시 배지 거짓해제→error 캡처 ④ [low] 활성경로 접힘→hasActive. 채팅 동기화 0건(깨끗).

**예상이슈 체크:**
- 059는 `create or replace`만(테이블/컬럼 무변)→types 재생성 불필요. 단일테넌트 동작 동일(롤백 트랜잭션 검증: `same_tenant=t cross_tenant=f`).
- `inert`는 React 19 boolean prop(정상 컴파일). 닫힘 시에만 적용→펼침 애니메이션 무영향.
- 회귀: tsc 0 · lint 30/0(신규 0) · `pnpm build` exit 0. 보안 어드바이저 신규 0(SECURITY DEFINER WARN은 기존 베이스라인).

**마이그:** 058·059 적용(원격=디스크). **커밋·배포 ↓.**

---

## 2026-06-11 · 채팅 창 간 즉시 동기화(BroadcastChannel) + realtime 보강

**무엇:** 한 창에서 보낸/수정/삭제/반응한 채팅이 **다른 창/탭에 즉시** 반영되게.
- **`lib/chatBus.ts`** — BroadcastChannel("equria-chat") `emitChat()/onChat()`. 같은 브라우저 창 간 즉시 동기화(같은 창엔 echo 안 됨 → 보낸 창은 낙관적/Realtime).
- **DirectChat** — 포커스 `sync`를 `resync`(메시지·반응·읽음 재조회)로 추출, **다른 창 신호 시 같은 대화방이면 즉시 resync**. 전송/편집/삭제/반응에 `emitChat`(편집·삭제는 작성 창 낙관적 갱신도 추가). undo/redo도 emit.
- **ChatList·useUnreadDms** — `onChat`→목록/배지 즉시 reload.
- **마이그 057** — `direct_conversations`를 realtime publication에 추가(원격/타기기 방 순서·새 대화 반영). direct_messages 등은 이미 등록.

**왜:** "채팅 보내면 다른 창에서도 바로 적용". 기존 realtime+포커스resync에 BroadcastChannel을 더해 같은 브라우저 창 간 즉시성·신뢰성 보강.

**예상이슈 체크:** BroadcastChannel은 같은 출처·브라우저 한정(타기기는 realtime). 미지원 환경은 no-op(폴백=realtime/포커스). 변경 시마다 다른 창 1회 reload(가벼움). 보낸 창엔 echo 없음(낙관/Realtime). tsc 0·lint 30/0·빌드.

**마이그/커밋:** 057 적용. 커밋 ↓.

---

## 2026-06-11 · 전자결재(카카오워크식) Phase A — 기안·결재선·승인/반려

**무엇(쪼갠 내용):**
1. **사전 기획(plan mode)** — 카카오워크 전자결재/근태 웹조사(Explore 3) + Plan 에이전트 설계 → 사용자 확정(진짜 결재선·전자결재 코어 먼저·메뉴 분리·기존데이터 깔끔전환). 계획 승인.
2. **마이그 054·055** — `approval_documents`(doc_no·doc_type 5종·body jsonb·status 5종·current_step)·`approval_steps`(결재선: step_order·approver·role 결재/참조·status)·`approval_comments`. B1 RLS + `is_approval_participant`. **상신 후 변경은 RPC 전용**(클라는 임시저장만 직접 수정). RPC `submit_document`/`act_on_approval`(순차·반려 의견필수·완료/다음단계)/`recall_document`. notif type 'approval'.
3. **타입 재생성** — 3테이블 + 4함수(rpc) 동기화.
4. **UI(`src/components/approval/`)** — `/approval` 문서함(결재할문서[배지]·기안함·참조함) · `NewDocumentModal`(양식+결재선 picker, 기본 대표) · `DocumentDetail`(결재선 진행 **도장**·승인/반려[의견필수]·회수·의견 thread·초안 상신/삭제) · `DocumentList` · `templates.ts`/`status.ts`/`lib.ts`. 알림 딥링크 `/approval/<id>`.
5. **메뉴 분리** — `/work` "근태·결재" → **전자결재(/approval)** + **근태(/work)**. WorkView 근태 단독화(구 지출/휴가 단일승인 패널 dereference, 테이블 보존).

**왜:** "카카오워크 결재 시스템 카피해서 근태·결재 재작업". 단일 admin 승인 → 진짜 결재선(순차 N명).

**적대 리뷰(워크플로우 16에이전트·4차원) → 13건 중 10건 확정·핵심 수정(마이그 056):**
- 🔴 **[보안 high] self-approval** — 기안자가 자기를 결재자로 넣어 자가승인 가능(UI만 막음). **DB 3중 차단**(as_insert with check·submit·act RPC). 롤백검증: submit·act 모두 차단.
- 🟠 **[med] doc_no 중복** — 워크스페이스 유니크 인덱스(fail-fast). **[med] realtime 미등록** — publication 추가(구독 동작). **[low] 초안 프라이버시** — 임시저장은 기안자/admin만(상신 전 결재자 비공개).
- 🟡 **[low] 참조 완료알림** 추가 · **회수→임시저장**(편집·재상신) · **초안 상신/삭제 UI** · 상신실패 시 초안 이동.

**예상이슈 체크(잔여·비차단):**
- **반려 문서 재상신**: v1은 '복제 후 재기안' 미구현(회수는 임시저장 복귀로 가능). 추후 NewDocumentModal 편집모드.
- **임시저장 본문/결재선 편집**: 상세에서 상신/삭제만(필드 수정은 추후 편집모드).
- doc_no 동시 채번은 유니크로 fail-fast(재시도). workspace_id sentinel 의존(B1-b).
- tsc 0 · lint 30/0 · 빌드 성공 · 기존 디자인 톤 유지. **Phase B 근태개편·C 연차/관리자**는 로드맵.

**마이그/커밋:** 054·055·056 적용. 커밋 ↓.

---

## 2026-06-11 · 공지 전파(전체 알림+상단 배너) · 파일/영수증 호버 미리보기

**무엇(쪼갠 내용):**
1. **공지 = 대표(오너)만** — 확인: RLS는 `owner_id`로 강제(멤버 차단 검증됨), UI는 `workspaces.owner_id` 조회로 비오너면 작성버튼 숨김. (이미 그렇게 구현돼 있어 추가변경 없음.)
2. **공지→전체 벨 알림(마이그 053)** — `announcements` INSERT 트리거(SECURITY DEFINER)가 워크스페이스 전원에게 notifications 생성(작성자 제외, type='announcement' 허용 추가, link=/dashboard). 롤백검증: 오너 공지→멤버 4명 알림.
3. **상단 공지 배너** — `AnnouncementBanner`를 app 레이아웃(헤더 아래)에 추가. 모든 페이지 상단에 최신 공지, X로 닫으면 localStorage 영속. 새 공지는 실시간으로 다시 등장.
4. **파일/영수증 호버 미리보기** — `shared/HoverPreview`(300ms 딜레이·서명URL 50초 캐시·이미지/PDF 플로팅, 그 외 미표시). FilesView 파일명·FinanceView 영수증 아이콘에 래핑. URL 헬퍼(signedUrlFor/receiptUrlFor)를 호버·클릭 공용으로 추출.

**왜:** "공지는 대표만 + 모두가 쉽게 알게(알림/배너)" + "파일·영수증 호버로 미리보기".

**예상이슈 체크:**
- 알림 팬아웃: 멤버 수만큼 insert(소규모라 OK). 작성자 제외. type CHECK에 'announcement' 추가(053).
- 배너: 최신 1건만 표시(닫으면 그 id 영속). 닫은 뒤 더 오래된 미닫은 공지는 안 뜸(의도—배너는 '현재' 공지용, 전체는 대시보드/벨).
- 호버: 서명URL은 호버당 1요청(딜레이+캐시로 완화). 영수증은 서버 라우트 호출. PDF는 iframe 로드라 약간 무거움(딜레이로 오작동 hover 방지).
- tsc 0 · lint 30/0 · 기존 디자인 유지.

**마이그/커밋:** 053 적용. 커밋 ↓.

---

## 2026-06-11 · 파일 인라인 미리보기(새 탭 대신 우측 칸)

**무엇:** 파일·영수증 클릭 시 새 브라우저 탭이 아니라 **앱 안 우측 미리보기 칸**으로 띄움.
- **`components/shared/FilePreview.tsx`** — 재사용 드로어. 이미지=`<img>`, PDF=`<iframe>` 인라인, 그 외=다운로드 안내. ESC·바깥클릭 닫힘, 상단에 다운로드 버튼.
- **FilesView** — 파일 행 클릭·아이콘(Eye)→`window.open` 제거하고 `FilePreview` 칸으로(mime로 형식 판별).
- **FinanceView** — 영수증 아이콘→`window.open` 제거하고 `FilePreview` 칸으로(receipt_url 확장자로 mime 추론).

**왜:** "파일 클릭할 때 창 안 뜨고 작게 칸으로 미리보기". 컨텍스트 유지·새 탭 난립 방지.

**예상이슈 체크:** 서명 URL 60초는 로드엔 충분(로드 후 만료 무관). zip/xlsx/ppt 등 브라우저 미지원 형식은 다운로드 안내. img는 동적 서명 URL이라 next/image 대신 `<img>`(eslint-disable 1줄). 데이터 변경 없음(표시 방식만). tsc 0·lint 30/0·기존 디자인 유지.

**부수 데이터 수정:** Google Asia Pacific OCR 2건이 구버전 OCR(통화 미인식)로 KRW 저장돼 7.56이 ₩8로 표시되던 것 → **USD로 정정**(amount는 원래 정확). 통화 OCR 인식은 052에서 반영됨(배포 시 신규분 자동).

**커밋:** ↓

---

## 2026-06-11 · 비용/매출 첨부 영수증(이미지·PDF) 열람

**무엇:** finance 표에서 첨부된 영수증(OCR 업로드)을 다시 열어볼 수 있게. receipts 버킷은 비공개·본인폴더라, finance_entries(워크스페이스 공유) 가시성으로 인가 후 admin 서명 URL을 발급.
- **`/api/finance/receipt`** — user 클라이언트로 entryId RLS 조회 → admin이 receipts 버킷 60초 서명. 버킷 'receipts' 고정이라 타버킷 노출 불가, 영수증은 전부 공유 finance 자료라 교차노출 위험 없음.
- **FinanceView** — 거래처 셀에 영수증 아이콘(receipt_url 있을 때), 클릭 시 새 탭.

**예상이슈 체크:** RLS 검증(박유나가 타인 업로드 영수증 12건 조회 가능=공유). 통화 OCR 인식은 052에서 이미 반영(₩/$/¥/₿). 수동 입력 항목에 영수증 첨부는 추후(현재 OCR 업로드분만 첨부됨). tsc 0·lint 30/0.

**커밋:** ↓

---

## 2026-06-10 · 공지사항(오너 전용) · 다중 화폐 · 근태/지출 UI 개선 · 이슈체크

**무엇(쪼갠 내용):**
1. **공지사항(마이그 051)** — `announcements` 테이블 + 헬퍼 `auth_is_workspace_owner`(workspaces.owner_id 기준). RLS: SELECT=워크스페이스 전원, **INSERT/UPDATE/DELETE=오너만**. UI `AnnouncementsBoard`(대시보드 상단, 전 직원 열람·오너만 작성/고정/삭제, 공지 없고 비오너면 숨김). 대시보드 페이지를 flex-col(공지 + 어시스턴트)로.
2. **다중 화폐(마이그 052)** — `finance_entries.currency`(기본 KRW). `lib/finance` CURRENCIES(KRW/USD/EUR/JPY/CNY/BTC) + `money()` 포맷터(BTC 8자리). FinanceView: 입력 폼 통화 Select · 표 셀 통화별 표시 · **요약을 통화별로 분리**(서로 다른 통화 미합산, KRW 우선) · CSV 통화 컬럼 · **OCR 통화 인식**(receiptSchema+프롬프트, ₩/$/¥/₿ 판별).
3. **근태/지출 UI 개선** — ExpensePanel: 상태별 요약칩(대기/승인/반려 건수·금액) + 금액 실시간 ₩ 표기. AttendancePanel: **근무시간** 계산 표시(오늘 카드 '근무 중' + 최근내역 시간), `workDuration` 헬퍼.
4. **이슈체크(어드바이저 + 빌드 + 적대리뷰)** — `next build` **성공**(폰트 이슈 해소, 전 라우트 컴파일). 보안 어드바이저: meeting-media 버킷 리스팅 1건 → **마이그 050으로 broad SELECT 정책 제거**(공개 URL은 무영향). 런타임 리뷰 확정 3건 전부 low·이론적(로그아웃 배지 잔존[하드닝 반영]·editable prop 마운트후 무시[현재 무관]·pnpm store 3.24 잔재[lockfile 전부 3.26]).

**왜:** 사용자 요청 — 오너 공지칸·비용매출 다중화폐(USD/BTC) 인식·근태/지출 편의 + "지금 이슈사항 체크".

**예상이슈 체크:**
- 공지: 오너 판별은 `owner_id`(현 전원 role=member라 admin 게이트면 아무도 못 올림 — owner_id로 정확). RLS 롤백검증(멤버 차단·오너 작성). 위치=대시보드(다른 곳 원하면 이동).
- 통화: 통화별 합계는 합산 안 함(정확). 분류별 지출 차트는 원화 항목만(혼합 방지). 환율 환산은 미제공(설계상 통화별 분리 — 추후 환산 옵션 가능).
- 근무시간: 퇴근 전이면 렌더 시점 스냅샷(실시간 갱신 아님). 야간 넘어가는 근무는 단순 차이 계산.
- tsc 0 · lint 30/0 · 빌드 성공 · 기존 디자인 톤 유지.

**마이그/커밋:** 050·051·052 적용. 커밋 ↓.

---

## 2026-06-10 · 사이드바 "직원 채팅" 미읽음 빨간 배지

**무엇:** 새 DM이 오면 좌측 사이드바 `/chat` 항목에 빨간 배지(개수)를 띄움. 채팅방 입장해 읽으면 사라짐.
1. **`hooks/useUnreadDms.ts`** — 내 미읽음 DM 총개수(상대 발신·`read_at` null·`deleted_at` null, RLS=내 대화방 한정 head count) + direct_messages INSERT/UPDATE 실시간 구독(ChatList와 동일 패턴).
2. **`Sidebar.tsx`** — `/chat` 항목 라벨 옆에 `bg-destructive` 배지(>99 → "99+"), count>0일 때만.

**왜:** "채팅 알림 오면 사이드바 직원채팅에 빨간 배지". 헤더 알림종과 별개로, 사이드바에서 바로 인지.

**예상이슈 체크:**
- 실시간: INSERT(새 메시지)→증가, UPDATE(읽음 처리=`mark_dm_read`)→감소 즉시 반영. '나와의 채팅'은 sender=me라 제외(정상).
- 부하: 변경 시마다 head count 1쿼리(가벼움). 다수 동시 수신 시 버스트 가능하나 단일 카운트라 수용.
- RLS 검증: 실유저(조휘원) 임퍼소네이션 카운트 0·무에러. 필터는 ChatList 검증 쿼리와 동일.
- 편집 모드에선 Link가 opacity-0이라 배지도 가려짐(정상). tsc 0 · lint 30/0(신규 effect는 disable로 베이스라인 유지).

**커밋:** ↓

---

## 2026-06-10 · 4단계+ — 회의록을 노션식 Tiptap 블록 에디터로 전환

**무엇(쪼갠 내용):**
1. **노션 슬래시 UX 웹리서치(워크플로우 6에이전트)** — 트리거/필터/키보드/블록전환/위치 5개 facet 조사 → 구현 스펙으로 합성. 그 스펙대로 슬래시 구현.
2. **Tiptap v3.26 전환** — 코어/확장 전부 3.26 정렬(채팅 회귀 0). 확장 추가: task-list/task-item·image·table(4종)·suggestion.
3. **블록 에디터(`editor/`)** — `extensions.ts`(StarterKit h1-4 + 체크박스 + 표 + 커스텀 FileBlock/Callout + SlashCommand + Placeholder, **SafeImage**로 src http(s)만), `slashItems.ts`(블록/AI 항목, 아이콘 **lucide 통일**, 모든 command가 deleteRange로 '/쿼리' 소비), `SlashMenu.tsx`(섹션헤더·키보드 순환·scrollIntoView·IME가드), `FileBlock`/`Callout`(ReactNodeView, data-* 직렬화), `MeetingDocEditor`(useEditor, content=HTML, 이미지/파일 인라인 업로드).
4. **이미지/파일 업로드(모든 형식)** — 공개 `meeting-media` 버킷(마이그 048) + `uploadMeetingMedia`. 이미지=인라인, 파일(pdf·zip·xlsx·ppt 등)=다운로드 disposition.
5. **구분선=얇은 가로줄·빈줄 플레이스홀더 "'/'를 입력해 명령어 사용"** (요청 화면 반영) + 표/체크박스/코드 등 `.meeting-doc` CSS.
6. **정리** — 구 SlashTextarea/noteMarkdown/MeetingAiAssist/attachment 라우트 제거. AI는 `useMeetingAi` 훅으로 본문(editor.getText()) 처리, 슬래시에서도 호출.

**왜:** "회의록을 노션처럼(작성 UI) — 이미지/파일 인라인·슬래시 블록". 보내준 노션 슬래시 메뉴 캡처 기준.

**적대적 리뷰(워크플로우 20에이전트, 4차원·반증검증) → 16건 중 7건 확정·핵심 수정:**
- 🔴 **[보안 high] 저장형 XSS** — FileBlock의 `data-src`에 `javascript:`를 심으면 읽기전용에서 앵커 클릭 시 실행(공유 노트라 멤버→멤버). **수정**: FileBlock src parseHTML+렌더 http(s)만 + SafeImage 동일 가드.
- 🟠 **[보안 med] 공개버킷 SVG/HTML 실행** — `uploadMeetingMedia`에서 svg/html/xhtml MIME·확장자 차단.
- 🟡 **[보안 low] 50MB 우회** — 버킷 file_size_limit 서버강제(마이그 049).
- 🟡 **[버그 low] 교차출처 download 무시** — getPublicUrl download 옵션으로 disposition.
- 🟡 **[스펙 low] 짧은 뷰포트 메뉴 잘림** — 위치 top 클램프.

**예상이슈 체크(잔여·비차단):**
- **공개버킷 트레이드오프**: URL 알면 워크스페이스 밖 접근 가능(추측불가 uuid). 더 엄격히는 비공개+서명 후속(HANDOFF).
- **인라인 미디어 고아**: 노트 삭제 시 meeting-media 객체 미정리(스토리지 GC 후속).
- **로컬 build 미실행**(폰트) → Vercel이 실제 런타임 게이트. 슬래시/노드 런타임은 브라우저 확인 필요.
- tsc 0 · lint 30/0 · 기존 디자인 톤 유지.

**마이그/커밋:** 048·049 적용(원격52=디스크52). 커밋 ↓.

---

## 2026-06-10 · 4단계 — 팀 회의 노트 `/meetings` (+ AI 보조)

**무엇(쪼갠 내용):**
1. **사전 패턴 정독(워크플로우 6에이전트)** — AI 라우트·Claude 클라이언트·업로드·RLS·디자인 토큰·기존 인라인 AI(ComposerAiAssist) 패턴을 병렬 정독해 구현을 기존 컨벤션에 정렬.
2. **마이그 046** — `meeting_notes`(공유 회의록). 컬럼: title·content·meeting_date·attendees·attachment_path/name/size·workspace_id(sentinel)·created_at·updated_at. ★ 045(비공개)와 핵심 차이 = **SELECT 공유**(워크스페이스 멤버 전원 열람), 수정=작성자/관리자, 삭제=작성자. UPDATE에 with check로 변조 방어.
3. **AI 보조 라우트** `POST /api/meeting-notes/assist` — streamText+toTextStreamResponse, 액션 3종(요약/액션아이템/정리), MODELS.default·temp 0.3·maxOutputTokens 2000, 입력 12000자 가드. 저장 안 함(미리보기).
4. **첨부 다운로드 라우트** `POST /api/meeting-notes/attachment` — files 스토리지가 본인폴더만 읽기라, user 클라이언트로 noteId RLS 인가 후 admin 클라이언트로 60초 서명 URL 발급(BFF).
5. **types.ts** — meeting_notes Row/Insert/Update 동기화(MCP 추출 삽입).
6. **features.ts** — 네비 `/meetings`("회의 노트", NotebookPen, work 그룹).
7. **UI** — `MeetingsView`(목록↔에디터 마스터/디테일) · `MeetingEditor`(제목/날짜/참석자/본문 textarea + 첨부 + 작성자/관리자만 편집·그외 읽기전용) · `MeetingAiAssist`(본문 옆 **상시** 요약/액션아이템/정리 버튼 → 스트리밍 미리보기 → [본문에 추가]/[전체 교체]).

**왜:** "회의록 작성/수정/업로드/공유 + 작성되는 곳 옆에 AI 버튼 상시". 팀 회의 기록을 공유하고, 거친 메모를 AI로 요약·정리·액션아이템화.

**적대적 리뷰(워크플로우 20에이전트, 4차원·반증검증) → 16건 중 5건 확정·전부 수정:**
- 🔴 **[보안 high] 첨부 경로 위조(IDOR)** — 공격자가 자기 노트에 타인 폴더 경로를 심어 admin 서명으로 타인 비공개 파일 탈취 가능. **수정**: 마이그 047 CHECK(`attachment_path is null or starts_with(path, user_id||'/')`) + 라우트 서명 전 prefix 재검증(이중). 롤백 검증: 위조 차단·정상/null 통과.
- 🟠 **[UX medium] 전체 교체 파괴적** — 본문 있으면 confirm 가드 추가.
- 🟡 **[버그 low] 스트리밍 언마운트 누수** — `useEffect(()=>()=>abort,[])` cleanup.
- 🟡 **[UX low] 미저장 이탈 유실** — dirty 감지 + 목록 이탈 confirm + beforeunload.
- 🟡 **[위생 low] 첨부 고아** — 삭제 시 본인 첨부 storage.remove(best-effort).

**예상이슈 체크(잔여):**
- **workspace_id 미주입**: 046도 DB DEFAULT(sentinel) 의존 — B1-b에서 앱 주입 필요(045와 동일 추적).
- **첨부 고아 잔여**: '파일 변경'(교체) 시 이전 파일·관리자가 타인 노트 삭제 시 파일은 미정리(저장 전 제거하면 미저장 노트가 깨질 위험이 더 커서 보수적으로 둠). 비용/위생 이슈·비차단.
- **AI 비용 추적 미연동**: assist 라우트는 chat/assist처럼 agent_usage 미기록(미리보기성). 추후 onFinish 연동 검토.
- tsc 0 · lint 30/0(신규 effect는 setState 없어 규칙 비해당) · 기존 디자인 톤 유지.

**마이그/커밋:** 046·047 적용(원격50=디스크50). 커밋 ↓.

---

## 2026-06-10 · 3단계 — 업무 통합(근태·지출결의서·휴가) `/work`

**무엇(쪼갠 내용):**
1. **마이그 045** — 3테이블 신설(전부 B1 멀티테넌트 RLS·`workspace_id` 기본=equria 센티넬):
   - `attendance_records`(근태): user_id·work_date·check_in·check_out·status(정상/지각/재택/외근/출장/연차/반차/결근)·note, `unique(user_id, work_date)`.
   - `expense_reports`(지출결의서): title·amount·category(식비/교통/접대/사무용품/출장/기타)·spent_on·description·status(대기/승인/반려)·reviewed_by·reviewed_at.
   - `leave_requests`(휴가): leave_type(연차/반차/병가/경조사/공가/기타)·start_date·end_date·reason·status·reviewed_by·reviewed_at.
   - 헬퍼 `auth_is_admin()`(security definer stable). RLS: **SELECT=워크스페이스∩(본인 OR 관리자)**, INSERT=본인+워크스페이스 멤버, UPDATE=워크스페이스∩(본인 OR 관리자), DELETE=본인+워크스페이스.
2. **types.ts** — 3테이블 Row/Insert/Update를 MCP로 재생성·tsc 검증.
3. **features.ts** — 네비 항목 `/work`("근태·결재", `ClipboardList`, group=work) 추가.
4. **UI** — `app/(app)/work/page.tsx` + `components/work/`: `WorkView`(알약 탭 근태/지출/휴가) · `AttendancePanel`(출근/퇴근·상태 Select·오늘카드·최근14건) · `ExpensePanel`(제출폼·목록·관리자 승인/반려·본인 대기 취소) · `LeavePanel`(신청폼·기간·목록·승인/반려/취소) · `status.ts`(결재 배지 공용).

**왜:** "근태관리·지출결의서·휴가제출을 한 곳에 통합 배치". 흩어진 사내 행정 업무를 단일 섹션에서 처리.

**예상이슈 체크:**
- **격리 검증(롤백 트랜잭션)**: 조휘원 본인 insert 성공, 박유나(비관리자·타인)는 3테이블 모두 0건 → 본인/관리자 외 비가시 확인.
- **workspace_id 미설정(앱)**: 앱 insert는 컬럼을 안 보내고 **DB DEFAULT=equria 센티넬**에 의존. 단일 워크스페이스 단계(B1-a)에선 정상. **B1-b(DEFAULT 제거·다중 워크스페이스)** 때 앱이 명시 주입하도록 반드시 수정 — HANDOFF에 기록.
- **결재 자가승인 가능성(RLS)**: UPDATE USING이 '본인 OR 관리자'라, 본인이 자기 건 status를 이론상 바꿀 수 있음. UI는 승인/반려 버튼을 관리자에게만 노출(앱 차원 방어). 엄격화는 추후(상태전이를 컬럼 권한/트리거로 제한) — 비차단.
- **관리자 판별**: `profiles.role='admin'`. 현재 운영자 외 전원 일반 → 승인 UI 비노출(정상). admin 지정은 DB/추후 관리화면.
- **다중 클릭/경합**: `busy` 가드 + 작업 후 `load()` 재조회로 일관성 유지.
- tsc 0 · lint 30/0(새 패널 3개 load effect는 기존과 동일 `set-state-in-effect` 패턴 → `eslint-disable-next-line`으로 베이스라인 유지·신규 범주 0) · 기존 디자인(알약 탭·상태칩·카드) 톤 유지.

**마이그/커밋:** 045 적용(원격48=디스크48 예정). 커밋 ↓.

---

## 2026-06-10 · 2단계 — 파일 공개범위(개인/부서/공개)

**무엇(쪼갠 내용):**
1. **마이그 044** — `files`에 `visibility`(personal/department/public, **기본 public**)·`department` 컬럼 추가(NOT NULL DEFAULT로 기존 행 백필). 헬퍼 `auth_user_department()`(security definer stable). `files_select` RLS 재작성: `본인 OR public OR (department AND 같은 부서)`.
2. **types.ts** — files Row/Insert/Update에 visibility·department 수동 동기화.
3. **FilesView.tsx** — ① 업로드 시 공개범위 Select(공개/부서/개인, 부서는 내 부서 있을 때만)·내 부서 자동 기록 ② 분류 탭(전체/공개/부서/개인) ③ 파일별 공개범위 배지 ④ 목록 쿼리: owner_id 필터 제거→RLS 가시성 + `project_id is null`(프로젝트 파일은 프로젝트에서).

**왜:** "공개/개인/부서 파일 구분해서 보고 싶다". 개인 파일은 RLS로 진짜 비공개.

**예상이슈 체크:**
- **회귀 0(검증)**: 기존 5파일·프로젝트 첨부 = 전부 public 백필 → 워크스페이스 전체에 그대로 보임. 롤백 트랜잭션 검증: 조휘원(부서null)이 이동규의 personal·타부서 파일 안 보임(3), 부서를 마케팅으로 맞추면 부서파일 보임(4). 개인격리·부서가시성·공개회귀 모두 통과.
- **behavior 변화(의도)**: FilesView가 이제 '내 파일만'→'볼 수 있는 일반파일 전부(공개 포함)'. 프로젝트 첨부 파일은 FilesView에서 빠짐(프로젝트 상세에서 관리). 사용자 의도와 일치.
- 부서 파일: `profiles.department` 없으면 그 파일은 소유자만 봄(degenerate). 업로드 옵션에서 '부서'는 내 부서 있을 때만 노출.
- RLS dept 비교는 security-definer 헬퍼로 캐싱(성능·재귀 안전). 어드바이저 WARN 1개 추가(기존 헬퍼와 동일·무해).
- tsc 0 · lint 30/0(신규 0) · 기존 디자인 톤 유지(배지=상태칩 패턴, 탭=알약).

**마이그/커밋:** 044 적용(원격47=디스크47). 커밋 ↓.

---

## 2026-06-10 · 1단계 — 채팅/파일 사용자 편의 수정

**무엇(쪼갠 내용):**
1. **알림 자동삭제** — `NotificationBell.tsx`: 실시간 구독을 `event:"INSERT"` → `"*"`로 확장.
2. **'1' 읽음 배지** — 코드 변경 없음(입장 시 `mark_dm_read`→`read_at` 갱신→`direct_messages` UPDATE 구독으로 이미 사라짐). 동작 확인만.
3. **스크롤바 겹침** — `DirectChat.tsx` 스크롤러에 우측 패딩 `pr-2`→`pr-4`(8→16px).
4. **다중 업로드** — `FilesView.tsx`: `onFile`을 단일→다중 루프, input에 `multiple`. 20MB 초과만 제외, 메타데이터 일괄 insert.

**왜:** 사용자 편의("알림이 안 사라짐", "스크롤바에 글 겹침", "파일 하나씩만 됨"). 기존 디자인 유지.

**예상이슈 체크:**
- 알림 `*` 구독 → 읽음처리(N건 UPDATE) 시 `load()` N회 호출(버스트). 영향 미미(단일 쿼리)·수용. 추후 부하 시 디바운스.
- 다중 업로드: 순차 업로드라 파일 많으면 시간↑(진행표시 'uploading' 유지). 한 파일 실패 시 전체 catch→토스트(부분성공 미반영). 현재 규모 OK, 추후 개별 진행률 고려.
- 스크롤바: `pr-4`로도 부족하면 `scrollbar-gutter: stable` 또는 thin scrollbar 검토.
- 회귀: tsc 0 · lint 30/0(신규 0) · 기존 디자인 유지.

**커밋:** `bcf3dfb`(1~4) + 스크롤바 `pr-4` 추가분.
