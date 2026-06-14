# EQURIA 워크스페이스 — Google(Gmail·Drive) 연동 + MCP 직접 연결 아키텍처 설계

> 상태: 설계 확정안 (실행 가능). 본 문서는 감사·리서치 원본을 코드베이스 실측으로 교차검증한 결과를 반영했다.
> 검증한 사실: `google_connections.gc_select` RLS가 **토큰 컬럼까지 클라이언트에 SELECT 허용** → 보안 정정 필요 / `mcp_servers.type` CHECK = `('stdio','sse')` → `'http'` 추가 필요 / 로그인은 이름+비번(`nameToEmail`)이라 Google 연동은 로그인과 **분리된 per-user 링크 플로우** / 채팅 라우트는 이미 `runtime='nodejs'`, `maxDuration=60` 사용.

---

## 0. 핵심 결론 (한 문단)

임베드(iframe)가 아니라 **서버 BFF(Backend-for-Frontend) + 우리 컴포넌트** 패턴으로 간다. Google 기능(Gmail/Drive)은 **`googleapis` 직접 호출** 트랙, AI 에이전트가 외부 도구를 쓰는 **MCP는 `@ai-sdk/mcp`(Streamable HTTP) 런타임** 트랙 — **두 관심사를 분리**한다. 토큰/시크릿은 서버 라우트 밖으로 절대 안 나가며(CLAUDE.md 절대원칙 2/3), 모든 `/api/google/*`·MCP 라우트는 `runtime='nodejs'`. 안전변경 원칙(추가 자유 / 파괴 검증 / 되돌림 / 커밋 분리)을 Phase마다 적용한다.

---

## 1. 목표 재정의 — "우리 UX/UI로 재구성"의 화면 단위 구체화

"재구성"은 **Google UI를 가져다 붙이는 게 아니라, 우리 디자인 시스템(shadcn/lucide/다크모드/회전초밥 톤)으로 직접 그리고, 데이터만 우리 서버 라우트에서 가져오는 것**이다.

### 1-1. 메일(`/mail`) — `MailShell.tsx`의 블러 더미 게이트를 실동작 3분할로 교체
| 영역 | 우리가 직접 그리는 것 | 데이터 출처 |
|---|---|---|
| 좌측 레일 | 받은편지함/보낸편지함/임시보관/별표/휴지통 + 사용자 라벨. 시스템 라벨 = Gmail `INBOX/SENT/DRAFT/STARRED/TRASH` 매핑 | `GET /api/google/gmail/labels` |
| 중앙 리스트 | 스레드 행(보낸이·제목·스니펫·날짜·첨부아이콘·안읽음 굵게), 검색바(Gmail `q` 문법), 무한스크롤(`nextPageToken`), 다중선택 일괄(읽음/보관/라벨) | `GET /api/google/gmail/threads?label=&q=&pageToken=` |
| 우측 상세 | 스레드 내 메시지 시간순 아코디언, **DOMPurify로 새니타이즈한 HTML 본문**, 첨부 칩, 액션(답장/전체답장/전달/별표/보관/읽음토글/라벨) | `GET /api/google/gmail/threads/[id]` |
| 작성 모달 | To/Cc/Bcc 칩·제목·본문·첨부 드롭존, 답장 시 원문 인용+`Re:`+`threadId` 프리필 | `POST /api/google/gmail/send` |
| 상태칩 | "연결됨 / 연결 끊기" | 상태 뷰(아래 2-3) |

### 1-2. 파일(`/files`) — `FilesView.tsx`에 소스 탭 추가, Drive 게이트를 실동작 탭으로
- 상단 세그먼트 탭 `[내 업로드 | Google Drive]`. **로컬 업로드(Supabase Storage) 인프라는 그대로 보존**, 그 옆에 Drive 탭을 추가하는 가산적 변경.
- Drive 탭: 폴더 브레드크럼/탐색, 검색바, 리스트/그리드 토글, 행별 다운로드(서버 프록시)·미리보기(썸네일/새창)·"Drive에서 열기"(`webViewLink`), 업로드.
- **Drive 목록은 라이브 조회(캐시 안 함)** — `files` 테이블에 Drive 전체를 동기화하면 삭제/이동/권한변경과 어긋나는 "꼬임의 원천"(safe-changes). `files` 테이블의 `source='gdrive'` 행은 직원이 명시적으로 "바로가기/북마크"한 항목만 선택 저장.

### 1-3. MCP(`/mcp`) — `McpView.tsx` 카탈로그 셸을 실연결로
- "Google Workspace" 카드의 "연결(곧)" → `/api/google/connect` 직결(위 OAuth와 동일 백엔드, MCP 런타임 아님).
- 그 외 커넥터는 **별도 MCP 런타임 트랙**(5장)으로 실제 원격 서버 등록·테스트·도구 노출.

---

## 2. 공통 기반: Google OAuth 2.0 (멀티유저, offline)

### 2-1. 서버 라우트 흐름 (로그인과 분리된 per-user 계정 링크)
```
[연결 시작] GET /api/google/connect
  1. supabase.auth.getUser() 로그인 확인
  2. CSRF state 생성: httpOnly 쿠키에 nonce 저장 + state=서명(nonce)
  3. oauth2.generateAuthUrl({ access_type:'offline', prompt:'consent',
       include_granted_scopes:true, scope:[...], state }) → 302 redirect

[콜백] GET /api/google/callback          ← Cloud Console 등록 경로 (확정)
  1. code, state 수신 → 쿠키 nonce와 대조(CSRF) + 현재 세션 user와 대조
  2. oauth2.getToken(code) → tokens
  3. google_email = oauth2 userinfo (openid/email)
  4. refresh_token AES-256-GCM 암호화 → createAdminClient()(service_role)로
     google_connections UPSERT(onConflict user_id):
       is_active=true, scopes, expires_at, google_email
     ※ if(tokens.refresh_token) 가드 — 없으면 기존 refresh_token 보존
  5. /mail (또는 단일 온보딩 페이지)로 redirect

[연결 끊기] POST /api/google/disconnect
  oauth2.revokeToken(refresh_token) → 행 토큰 null + is_active=false
```
> **콜백 경로 확정: `/api/google/callback`** (감사에는 `/api/auth/google/callback`, `/api/google/oauth/callback` 등 혼재 — 본 설계는 `/api/google/callback`으로 통일). Cloud Console에는 localhost + Vercel prod 도메인 둘 다 등록.

### 2-2. 토큰 저장 테이블 (스키마 제안)
기존 `public.google_connections`(002) 재사용. 마이그레이션 `019_google_oauth.sql`로 **보강(가산적)**:
- `access_token` / `refresh_token` 컬럼: **평문 금지 → AES-256-GCM 암호문 문자열(`iv:tag:cipher`)** 저장 용도로 재사용(컬럼 추가 불필요).
- 신규(선택): `token_type text`, `last_history_id text`(Gmail 증분 동기화용).
- `scopes text[]`: 실제 부여된 scope 누적(incremental auth 판단).

### 2-3. RLS / 암호화 (★실측 기준 보안 정정 — 반드시)
**현재 위험:** `002_features.sql:293` `gc_select … using(auth.uid()=user_id)` 가 **클라이언트(anon 키)에게 암호화 토큰 컬럼까지 SELECT를 허용**. anon 키 유출 시 토큰 노출.
**정정안 (019에서):**
1. `drop policy "gc_select"` → **토큰 행 SELECT는 service_role 서버 전용**(정책 미부여 = anon 차단). 쓰기 정책(`gc_insert/update/delete`)도 콜백이 admin 클라이언트로 처리하므로 사용자 직접 쓰기 불필요.
2. UI 게이트용 **상태 뷰** `public.google_connection_status`(security_invoker, `is_active`/`google_email`/`scopes`만 노출, "본인 것만" select) 생성 → `MailShell`/`FilesView`/`McpView`는 이 뷰만 읽음.
3. 암호화: `src/lib/google/crypto.ts` Node `crypto` AES-256-GCM, 키 `GOOGLE_TOKEN_ENC_KEY`(32바이트 base64, 서버 전용). 키 분실 = 전 직원 재연결.

### 2-4. 자동 갱신
`src/lib/google/client.ts` → `getGoogleClientForUser(userId)`:
- service_role로 행 조회 → 복호화한 `refresh_token`만 `setCredentials({ refresh_token })`.
- `oauth2.on('tokens', persist)` 등록 → 라이브러리가 만료 `access_token`을 **자동 재발급**, 새 토큰을 콜백에서 암호화 재저장(드물게 회전된 refresh_token 포함, **if-가드**).
- `google.gmail({version:'v1',auth})`, `google.drive({version:'v3',auth})` 반환. 모든 BFF 라우트가 공유.

### 2-5. 멀티유저
`google_connections.unique(user_id)` 이미 존재 → 직원별 1행, 콜백은 `upsert(onConflict:user_id)`.

---

## 3. Gmail 모듈

### 3-1. 화면 → API 매핑 (서버 라우트, 모두 `runtime='nodejs'`)
| 화면 동작 | 라우트 | Gmail API |
|---|---|---|
| 목록/검색/페이지 | `GET /api/google/gmail/threads` | `threads.list({labelIds, q, maxResults, pageToken})` |
| 스레드 상세 | `GET /api/google/gmail/threads/[id]` | `threads.get({id, format:'full'})` → `payload.parts` 재귀, base64url 디코딩 |
| 첨부 | `GET /api/google/gmail/attachments/[messageId]/[attachmentId]` | `messages.attachments.get` 스트림 |
| 전송/답장 | `POST /api/google/gmail/send` (`maxDuration=60`) | RFC2822 MIME→base64url→`messages.send({raw, threadId?})` |
| 읽음/라벨/별표/보관 | `POST /api/google/gmail/messages/[id]/modify` | `messages.modify({add/removeLabelIds})` |
| 라벨 목록 | `GET /api/google/gmail/labels` | `labels.list` |

### 3-2. Scope (최소권한)
- **권장 단일: `gmail.modify`** — 읽기+보내기+라벨/읽음/보관/별표 전부 커버, 영구삭제만 제외(안전). 단일 scope로 위 전 기능 충족.
- 더 보수적 분리: `gmail.readonly` + `gmail.send`(단, 읽음처리/라벨 변경 불가 → 결국 modify 권장).
- `gmail.*`는 **restricted scope** → External 게시 시 Google CASA 보안검증 필요 → **사내는 동의화면 Internal로 회피**(9장 열린 결정).

### 3-3. 구현 단계 / 주의
- 본문: base64url(`-_`→`+/`, 패딩 복원) → utf-8. multipart 재귀 walker(text/html 우선). **HTML은 DOMPurify 새니타이즈 + 외부 이미지 기본 차단**(XSS).
- 전송: RFC2822 + `multipart/alternative`. 한글 제목은 `=?UTF-8?B?...?=`. 손코딩 대신 `mimetext`/MailComposer 권장.
- **쿼터 방어:** 목록은 `metadata` format·필요 헤더만, `full`은 상세 진입 시 1회. 쿼터 비용 차 큼(`threads.get`=40, `send`=100). 429/403 시 지수 백오프.
- **메일 본문은 DB 캐시하지 않음**(개인정보·동기화 복잡도 회피) — 매 요청 라이브 조회.

---

## 4. Drive 모듈

### 4-1. files 섹션과의 통합 모델
- `files` 테이블(004에서 source 확장: `local/gdrive/link/figma`)을 **SSOT로 두되 "내가 저장한 항목"만**. Drive 전체 목록은 **라이브 조회**.
- `FilesView` 통합: `[내 업로드 | Google Drive]` 탭. 로컬은 Storage signed URL, Drive는 `web_view_link`/서버 프록시 다운로드로 분기.

### 4-2. API (`runtime='nodejs'`)
| 동작 | 라우트 | Drive API |
|---|---|---|
| 목록/검색/폴더 | `GET /api/google/drive/files?q=&folderId=&pageToken=` | `files.list({q, fields, pageToken})` |
| 메타 | `GET /api/google/drive/files/[id]` | `files.get` |
| 다운로드/미리보기 | `GET /api/google/drive/download/[id]` | `files.get({alt:'media'})` 스트림 / Google Docs는 `files.export` 분기 |
| 업로드 | `POST /api/google/drive/upload` | `files.create`(multipart; >5MB는 resumable) |

### 4-3. Scope (최소→점진)
- **권장: `drive.file`**(우리 앱이 만든/연 파일만 — 가장 안전, 검증 부담 최소). 기존 Drive 전체 탐색이 필요하면 `drive.readonly` 또는 `drive`(restricted).
- Gmail과 **한 동의 플로우에서 함께 요청**(`include_granted_scopes`) → 1회 연결로 Gmail+Drive.

### 4-4. 단계 / 주의
- Google Docs/Sheets/Slides는 `alt=media` 불가 → `mimeType` 보고 `files.export`(pdf/docx) 분기.
- **토큰을 브라우저에 노출 금지** → 미리보기/다운로드는 서버 프록시. 클라이언트가 Drive URL 직접 호출 금지.
- 페이지네이션 필수(`pageSize`/`pageToken`), 쿼터 초과 시 백오프.

---

## 5. MCP 직접 연결 (별도 트랙)

### 5-1. 라이브러리·런타임 위치·transport (★실측 정정)
- **`@ai-sdk/mcp`의 `createMCPClient`** 사용(AI SDK v6는 MCP를 `ai` 패키지에서 분리; 기존 `experimental_createMCPClient from 'ai'`는 v6에서 동작 안 함). `ai@^6.0.191` 설치 확인됨.
- **transport: `type:'http'`(Streamable HTTP) 1순위**, `'sse'` 레거시. **`stdio`는 Vercel 서버리스에서 자식 프로세스 불가 → UI/CHECK에서 차단.**
- 런타임 위치: 단일 서버 헬퍼 `src/lib/mcp/connect.ts`(`server-only`)에 "`mcp_servers` 행 → `createMCPClient`" 어댑터. 채팅 라우트와 워크플로우 run 라우트가 공유.
- **★실측:** `mcp_servers.type` CHECK = `('stdio','sse')`(001:166) → **`'http'`를 INSERT 못 함**. 마이그레이션으로 CHECK를 `('http','sse')`로 변경(stdio 제거) 안 하면 등록 자체가 실패.

### 5-2. 에이전트/워크플로우에 도구 노출
- **채팅** `/api/agents/[id]/chat`: `agent_mcp_servers` 조회 → 활성 서버 connect → `const tools = mergeToolSets(await Promise.all(clients.map(c=>c.tools())))` → `streamText({ ..., tools, stopWhen: stepCountIs(5), onFinish:()=>{기존 저장; closeAll}, onError: closeAll })`. `toUIMessageStreamResponse()` 그대로(useChat가 tool 파트 렌더).
- **워크플로우** `/api/workflows/[id]/run`: 노드가 MCP 사용이면 connect → `generateText({ tools, stopWhen: stepCountIs(4) })` → `finally close`. 기존 `webhook/save_file/notify` 카탈로그에 `'mcp'` 타입 추가.
- **필수 주의:** 도구를 붙였는데 `stopWhen` 미설정 → 모델이 tool-call만 하고 결과를 못 받아 답 끊김. `mcpClient.close()` 누락 → 서버리스 연결 매달림(비용/콜드스타트). `onFinish/onError` + `try/finally` 양쪽 close.
- **도구명 충돌:** 여러 서버 머지 시 동명 도구 덮어씀 → `serverName__tool` prefix.

### 5-3. mcp_servers 저장 (마이그레이션 `020_mcp_runtime.sql`)
- `type` CHECK → `('http','sse')`.
- `+ auth_type text default 'none' check in ('none','bearer','oauth')`, `+ owner_id uuid null`(null=글로벌/admin, 값=개인 커넥터), `+ last_tested_at`, `+ last_test_ok`.
- 신규 `mcp_tools(server_id, name, description, input_schema jsonb, enabled, unique(server_id,name))` — `tools/list` 캐시 + 화이트리스트.
- 신규 `agent_mcp_servers(agent_id, server_id, unique)` — 에이전트↔MCP 연결.
- (선택) `mcp_tool_calls` 감사로그(`agent_usage`와 짝).

### 5-4. 보안
- **SSRF:** MCP url 검증(`https` only, localhost/사설망/`169.254.169.254` 차단) — 기존 `workflowTools.isSafeWebhookUrl` 재사용·확장. `createMCPClient({ redirect:'error' })`로 1차 방어.
- **토큰 평문 저장 회피:** 글로벌 서버 공유 시크릿은 **Vercel env**(키 이름만 DB 저장), 개인 토큰은 service_role 전용 분리 또는 GET 시 마스킹.
- **권한:** admin=글로벌 서버 CRUD(기존 `mcp_admin` 정책 활용), 일반 직원=본인 `owner_id` 커넥터만. service_role로 RLS 우회 시 `user_id`/`owner_id` **명시 검증**.

---

## 6. DB 변경 요약 (멱등, RLS, 가산적)

| 마이그레이션 | 변경 | 종류 |
|---|---|---|
| `019_google_oauth.sql` | gc: 토큰 컬럼을 암호문 저장 용도로 사용(스키마 변경 없음), `+token_type?`, `+last_history_id?`. **`drop policy gc_select`** + 토큰 SELECT service_role 전용. 상태 뷰 `google_connection_status`(security_invoker) 생성. | 정정+추가 |
| `020_mcp_runtime.sql` | `mcp_servers.type` CHECK `('stdio','sse')`→`('http','sse')`. `+auth_type/+owner_id/+last_tested_at/+last_test_ok`. 신규 `mcp_tools`, `agent_mcp_servers`, (선택)`mcp_tool_calls` + RLS. | 정정+추가 |

- 모든 `create`는 `if not exists`, 정책은 `drop policy if exists` 후 재생성(멱등).
- `agent_versions.mcp_servers text[]`, `tools jsonb`는 이미 존재 → 추가 불필요.
- 적용 후 `npx supabase gen types`로 `types.ts` 재생성(수기 any 금지).

---

## 7. env / 외부 설정

### 7-1. 새 env 키 (모두 서버 전용 — `NEXT_PUBLIC_` 금지)
```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/google/callback   # prod는 도메인 버전
GOOGLE_TOKEN_ENC_KEY=...        # 32바이트 base64 (AES-256-GCM)
# MCP 글로벌 서버용(선택): MCP_<NAME>_TOKEN=...
```
`.env.example`의 주석처리된 `GOOGLE_CLIENT_*` 활성화. 패키지: `pnpm add googleapis @ai-sdk/mcp@ai-v6`, (HTML 본문) `pnpm add isomorphic-dompurify`, (선택) `mimetext`.

### 7-2. 사용자(개발자/관리자)가 직접 해야 하는 것
**A. Google Cloud (Claude가 못 함):**
1. 프로젝트 생성(사내 조직 계정 권장).
2. API 라이브러리에서 **Gmail API**, **Google Drive API** 사용 설정.
3. OAuth 동의 화면: **User type = Internal 강력 권장**(restricted scope CASA 검증 면제 + refresh_token 7일 만료 함정 회피). 앱 이름 "EQURIA 워크스페이스", 지원/개발자 이메일.
4. 스코프 등록: `gmail.modify` + `drive.file`(또는 `drive.readonly`) + `openid/email/profile`.
5. 사용자 인증 정보 → OAuth 클라이언트 ID, 유형 **Web application**.
6. **승인된 리디렉션 URI**(스킴/포트/경로/슬래시 정확 일치): `http://localhost:3000/api/google/callback` + `https://<prod도메인>/api/google/callback` (+필요시 Vercel 프리뷰).
7. Client ID/Secret 안전 전달 → `.env.local` + Vercel env.
8. (External 선택 시만) 테스트 사용자 등록 또는 게시.

**B. MCP:** 연결할 원격 MCP 서버의 **Streamable HTTP URL + 인증방식(none/Bearer)** 확보. Bearer면 API 키 발급. (OAuth형 원격 MCP는 후속 — 1차는 none/bearer만.)

---

## 8. 단계별 로드맵 (의존성 순, 커밋 분리, 검증 포함)

> 각 Phase = 독립 커밋. 안전변경: 추가는 자유, RLS drop 같은 파괴는 검증 후, 모든 변경 되돌릴 수 있게.

**Phase A — OAuth 기반 (모든 것의 전제)**
- `019_google_oauth.sql`(RLS 정정 + 상태 뷰), `crypto.ts`/`oauth.ts`/`client.ts`, `/api/google/connect`·`/callback`·`/disconnect`, `MailShell`/`FilesView` 게이트 버튼을 `/api/google/connect`로.
- 검증: `pnpm exec tsc --noEmit` && `pnpm build` / Supabase `get_advisors`(RLS·토큰 노출 0) / **E2E:** 본인 Google 계정 connect→callback→`google_connection_status`에 is_active=true, 토큰 행이 anon으로 SELECT 안 됨 확인.

**Phase B — Gmail BFF + UI**
- `lib/google/gmail.ts`(MIME 빌더/디코더), threads/labels/send/modify/attachments 라우트, `MailShell` 3분할 + ComposeModal.
- 검증: tsc/build / **E2E:** 받은편지함 1건 조회·본문 렌더(새니타이즈)·메일 1건 발송·읽음토글.

**Phase C — Drive BFF + UI**
- `lib/google/drive.ts`, files/list·download·upload 라우트, `FilesView` 소스 탭(로컬 보존).
- 검증: tsc/build / **E2E:** Drive 파일 1건 조회·다운로드(프록시)·업로드, 로컬 업로드 회귀 없음.

**Phase D — MCP 런타임**
- `020_mcp_runtime.sql`(type CHECK·mcp_tools·agent_mcp_servers), `lib/mcp/connect.ts`(+SSRF), `/api/mcp/servers` CRUD + `/[id]/test`, `McpView` 재작성.
- 검증: tsc/build / `get_advisors` / **E2E:** 공개 Streamable HTTP 데모 서버 1개 등록→test→도구 발견.

**Phase E — MCP를 에이전트/워크플로우에 노출**
- 채팅 라우트 `tools+stopWhen+close`, 워크플로우 노드 `'mcp'` 타입, 빌더에 `agent_mcp_servers` 토글.
- 검증: tsc/build / **E2E:** MCP 도구 연결된 에이전트 채팅에서 tool-call→결과→후속답변, 워크플로우 노드 MCP 호출 1회.

---

## 9. 열린 결정 (사용자 확인 필요)

1. **Gmail scope:** 단일 `gmail.modify`(읽기+전송+라벨/읽음, 전 기능, restricted) vs 보수적 `gmail.readonly`+`gmail.send`(읽음/라벨 변경 불가)? → 권장 `gmail.modify`.
2. **Drive scope:** `drive.file`(우리가 만든/연 파일만, 최소·안전) vs `drive.readonly`/`drive`(기존 전체 탐색, restricted·검증)? → 통합 깊이 결정.
3. **Drive 통합 깊이:** 라이브 조회만(권장) vs 일부 `files` 테이블 북마크 저장 vs 전체 동기화(비권장)?
4. **OAuth 동의화면 게시:** 이큐리아가 Google Workspace 조직인가? **Internal**(검증 면제, refresh_token 안정) 가능 여부 — 일반 Gmail이면 External+게시+CASA 검증 부담.
5. **MCP 먼저 붙일 서버:** 어떤 원격 MCP(Supabase MCP / GitHub MCP / 자체 호스팅)부터? 인증은 none/Bearer 중 무엇?
6. **에이전트↔MCP 매핑 정책:** 어떤 기본 에이전트가 어떤 MCP 도구를 쓸지(예: 데이터분석↔Supabase MCP).
7. **글로벌 vs 개인 MCP 커넥터:** admin 글로벌 서비스 토큰 / 직원 개인 OAuth 커넥터 — 둘 다 지원할지.

---

## 10. 리스크 / 주의

- **Vercel 60초 타임아웃:** MCP 도구 왕복 + 모델 멀티스텝, Gmail send/Drive 업로드가 길면 초과 → `stepCountIs(N)` 보수적, 워크플로우 노드 수 제한 유지, 업로드는 resumable.
- **쿼터:** Gmail 비용 차 큼(목록 metadata만, full은 상세 1회), Drive 페이지네이션 필수, 429/403 지수 백오프.
- **토큰 보안:** 평문 저장 금지(AES-256-GCM), `gc_select` RLS 정정(현재 anon SELECT 가능 = 실측 위험), 클라이언트로 토큰 절대 노출 금지(서버 BFF만), `GOOGLE_TOKEN_ENC_KEY` 분실=전 직원 재연결.
- **refresh_token 함정:** 최초 동의 1회만 발급 → `access_type:'offline'`+`prompt:'consent'`, 저장 시 `if(refresh_token)` 가드. 동의화면 Testing+External이면 refresh_token 7일 만료 → Internal/Published 필요.
- **서버리스 MCP 제약:** stdio 불가(http만), `mcpClient.close()` 누락 시 연결 매달림, SSRF(url 검증+`redirect:'error'`), 도구명 충돌(prefix), tools/list 페이지네이션.
- **CSRF:** connect→callback `state`(쿠키 nonce + 세션 user 대조). `state`의 user_id를 그대로 신뢰 금지.
- **런타임:** `googleapis`/Node `crypto`/MCP transport는 Edge 불가 → 모든 라우트 `export const runtime='nodejs'`.

---

### 관련 파일 경로 (절대경로)
- 수정/교체: `/Users/johwiwon/equria-workspace/src/components/mail/MailShell.tsx`, `/Users/johwiwon/equria-workspace/src/components/files/FilesView.tsx`, `/Users/johwiwon/equria-workspace/src/components/mcp/McpView.tsx`, `/Users/johwiwon/equria-workspace/src/lib/mcp.ts`, `/Users/johwiwon/equria-workspace/src/app/api/agents/[id]/chat/route.ts`, `/Users/johwiwon/equria-workspace/src/app/api/workflows/[id]/run/route.ts`
- 신규(라이브러리): `/Users/johwiwon/equria-workspace/src/lib/google/{crypto,oauth,client,gmail,drive}.ts`, `/Users/johwiwon/equria-workspace/src/lib/mcp/connect.ts`
- 신규(라우트): `/Users/johwiwon/equria-workspace/src/app/api/google/{connect,callback,disconnect}/route.ts`, `.../api/google/gmail/*`, `.../api/google/drive/*`, `.../api/mcp/servers/*`
- 신규(마이그레이션): `/Users/johwiwon/equria-workspace/supabase/migrations/019_google_oauth.sql`, `/Users/johwiwon/equria-workspace/supabase/migrations/020_mcp_runtime.sql`
- 참조(기존 정의): `/Users/johwiwon/equria-workspace/supabase/migrations/002_features.sql`(google_connections+gc RLS L293-296), `/Users/johwiwon/equria-workspace/supabase/migrations/001_initial_schema.sql`(mcp_servers type CHECK L166, mcp RLS L243-244), `/Users/johwiwon/equria-workspace/src/lib/auth.ts`(로그인 모델), `/Users/johwiwon/equria-workspace/src/lib/workflowTools.ts`(isSafeWebhookUrl)