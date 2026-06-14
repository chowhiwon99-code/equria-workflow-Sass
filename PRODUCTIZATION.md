# PRODUCTIZATION — EQURIA Workspace를 B2B SaaS(슬랙/노션형)로

> 사내 단일 회사용 워크스페이스 → **회사별로 격리되어 판매되는 멀티테넌트 SaaS**로 전환하기 위한 감사·리스크·로드맵.
> 작성: 2026-06-09 (세션 8, 멀티에이전트 감사 6에이전트 기반 — 실제 코드/라이브 RLS/마이그 001~032 + B2B SaaS 표준 리서치).
> 관계 문서: 현재 상태=`HANDOFF.md` · 매니페스트=`CLAUDE.md`(§ 멀티테넌시는 HANDOFF) · 작업원칙=`.claude/skills/safe-changes.md`.
>
> ⚠️ **현행화(2026-06-14)**: §5 핵심 결정 **확정**(HANDOFF §멀티테넌시) · **B1-a(읽기 격리)=완료·라이브**(마이그 033~043) · 마이그 현재 **061**. 따라서 §0 "격리 0%·온보딩 동결"·§2-B1·§5 "대기"는 *B1-a 기준 일부 해소* — **남은 건 B1-b(쓰기 강제)·B2~B6.** 리스크 레지스터(B/H/M/L)는 우선순위 참고용 유지.

---

## 0. 가장 중요한 한 줄

토대(Supabase RLS + Vercel + Claude)는 **SaaS에 맞는 정석 구조**다. 멀티테넌시 **A단계(테이블에 `workspace_id` 컬럼 추가)는 완료**됐지만, **데이터를 실제로 회사별로 막아주는 RLS·앱 배선·가입/초대/과금은 0%**.
즉 남은 건 *재설계가 아니라 "배선과 정책"*이며, 첫 외부 고객까지 **약 6~10주** 분량이 명확히 보인다.

> 🔴 **지금 두 번째 회사를 받으면 데이터가 그대로 샌다.** 현재 RLS가 "로그인한 사람이면 누구나 모든 회사의 에이전트·대화·파일·재무를 SELECT 가능". **B1(테넌트 격리) 완료 전까지 두 번째 고객 온보딩 동결.** (지금 한 회사만 쓰는 동안은 안전.)

---

## 1. 한눈 요약

- **위치**: 멀티테넌시 구조(A)만 끝. 격리(RLS)·앱 컨텍스트·가입/초대/과금 미구현.
- **핵심 차단**: 두 번째 회사 받으면 즉시 데이터 유출 (판매 차단 사유).
- **인증도 B2B 부적합**: 공용 비번 1개 + 이름→가짜이메일(`@equria.local`) → 진짜 이메일·초대·복구·SSO 전부 불가.
- **돈 받을 장치 없음**: 과금/구독/사용량측정/Claude 비용한도 전무. 워크플로 1회에 수백 달러 토큰이 통제 없이 가능.
- **좋은 소식**: 토대가 올바르고 A단계가 깔려 있어 "재설계"가 아님. 6~10주면 첫 외부 고객 가능.

---

## 2. 리스크 레지스터 (severity 순)

### 🔴 BLOCKER — 두 번째 회사 받으면 당장 터지는 것

| # | 무엇이 | 왜 위험 | 근거(파일/테이블) | 난이도 |
|---|--------|---------|-------------------|--------|
| B1 | **24개 데이터 테이블 RLS가 `workspace_id`를 안 본다** | A사 직원이 `SELECT * FROM agents`→A·B사 전부 노출. 대화·파일·재무·DM 동일 | `001_initial_schema.sql:210`(`agents_select=auth.uid() is not null`)·`002_features.sql:255`·전 테이블 정책 | L |
| B2 | **앱이 INSERT 시 `workspace_id`를 안 넣음** | 모든 신규 데이터가 equria sentinel로 박힘. RLS 고쳐도 데이터가 엉뚱한 테넌트로 | `api/workflows/[id]/run/route.ts:185~224`·`DirectChat.tsx`(direct_messages) | M |
| B3 | **앱에 "현재 워크스페이스" 개념·전환 UI 없음** | 로그인 시 equria 하드코딩. 멀티테넌트 구조적으로 불가 | `(auth)/login/page.tsx:44`·`supabase/client.ts`·`(app)/layout.tsx` | M |
| B4 | **진짜 이메일 계정 없음(이름→가짜이메일)** | 동명이인 이메일 충돌, 초대·비번재설정·SSO 전부 불가. `@equria.local`은 메일 발송 불가 | `lib/auth.ts`(`nameToEmail`)·`(auth)/actions.ts` | XL |
| B5 | **공용 WORKSPACE_PASSWORD 1개로 전원 가입** | 비번 유출=누구나 무제한 계정·equria 진입. 회사별 초대 없음 | `(auth)/actions.ts`(`password!==env.WORKSPACE_PASSWORD`)·invite 테이블 부재 | M |
| B6 | **워크스페이스 생성/초대 흐름 자체가 없음** | 두 번째 회사를 만들 방법도, 직원 추가 방법도 없음 → 온보딩 불가 | `030` 마이그(equria owner 하드코딩)·`(auth)/signup` | L |

### 🟠 HIGH — 출시 전 반드시

| # | 무엇이 | 왜 위험 | 근거 | 난이도 |
|---|--------|---------|------|--------|
| H1 | **Claude API 비용 무제한** | 토큰 비용계산·한도·레이트리밋 없음. 워크플로 1회(6노드)로 $180까지. 테넌트10=비용폭주 | `api/agents/[id]/chat/route.ts`(cost 미계산)·`agent_usage`에 cost 컬럼 없음 | M |
| H2 | **과금/구독 인프라 전무** | plans·subscriptions·invoices·Stripe 없음. `workspaces.plan='free'` 하드코딩 | `030`·billing 스키마 부재 | XL |
| H3 | **service_role 관리라우트가 workspace 검증 안 함** | RLS 우회 작업에 `.eq('workspace_id',…)` 가드 없음. A사 관리자가 B사 리소스 수정 가능 | `api/mcp/servers/[id]/route.ts`(`update().eq('id',id)` only) | M |
| H4 | **Realtime presence 채널이 전역 하드코딩** | A·B사 직원이 같은 채널 공유. presence는 RLS 우회 | `hooks/usePresence.ts:17`(`'presence-workspace'`) | M |
| H5 | **Storage 버킷 정책이 workspace 무관** | 경로가 `{user_id}/…`라 워크스페이스 검증 없음. 동일 유저가 두 회사 파일 조회 가능 | `015_files_bucket_softdelete.sql:14`·`010_chat_files_participant_read.sql:19` | M |
| H6 | **profiles 전역 노출** | `auth.uid() is not null`로 누구나 전 직원(타사 포함) 명단 조회. `directory_contact()` RPC도 워크스페이스 무관 | `001:205`·`022_chat_hub.sql` | M |
| H7 | **감사 로그(audit log) 전무** | 누가 언제 무엇을 했는지 추적 불가. SOC2/GDPR/포렌식 불가 | `audit_logs` 테이블 부재 | M |
| H8 | **레이트리밋/남용방지 없음** | 한 테넌트 폭주가 전체 성능·비용 타격(noisy neighbor). OCR=Claude Vision이라 더 비쌈 | 모든 `api/*/route.ts`에 미들웨어 부재 | M |
| H9 | **RBAC 미적용** | `workspace_members.role`(owner/admin/member) 칸은 있으나 앱이 안 씀. 누구나 동급 권한 | `030`·`api/mcp/servers` | M |
| H10 | **Google OAuth 반쪽** | UI·스키마는 있으나 콜백에 워크스페이스 컨텍스트 없음, JIT 프로비저닝 없음 | `auth/callback/route.ts`·`lib/google/oauth.ts` | M |

### 🟡 MEDIUM — 성장 단계

| # | 무엇이 | 근거 | 난이도 |
|---|--------|------|--------|
| M1 | sentinel UUID DEFAULT 취약(코드 누락 시 조용히 equria로 오염) | `030`(DEFAULT sentinel ×24) | S |
| M2 | 사용량 미터링·테넌트별 쿼터 없음 | `agent_usage` workspace 조회 없음 | M |
| M3 | 슈퍼어드민 콘솔 없음(테넌트10+ 시 raw SQL 운영=사고위험) | `/admin/*` 부재 | M |
| M4 | 데이터 export/삭제(GDPR) 없음 | finance만 CSV·export 엔드포인트 부재 | M |
| M5 | 알림 트리거가 workspace 무관(DM RLS 깨지면 미리보기 누출) | `002_features.sql:184`(handle_new_dm) | S |
| M6 | 비번정책·이메일인증·MFA 없음 | `(auth)/actions.ts`(length 미체크) | M |
| M7 | 교차 테넌트 FK/Join 검증 없음(conversation이 타사 agent 참조 가능) | `030`(FK만)·`018_workflow_runs.sql` | M |
| M8 | 신규 워크스페이스에 프리셋 에이전트 없음(빈 화면 시작) | `seed.sql`(equria만) | M |
| M9 | Storage 쿼터 미강제 | `lib/upload.ts` | S |
| M10 | PII 컬럼 revoke 불완전(023b 누락 의심) | `023`·`001` | S |

### ⚪ LOW
- L1 일부 라우트 CSRF state 누락(`google/connect`만 있음) · L2 OAuth state 쿠키 dev secure=false · L3 자유텍스트 길이/새니타이즈 미흡 · L4 소프트삭제 필터 일관성(031/032 회귀 이력) · L5 `agent_versions` 테넌트 무관.

---

## 3. 제품화 로드맵 (HANDOFF의 A완료/B계획과 정합 — B를 6개로 분할)

> **B1·B2가 선행 차단막**이며 나머지는 그 위에 쌓인다.

### Phase B1 — 진짜 테넌트 격리 (최우선·다른 모든 것의 선행)
- **목표**: 두 회사가 들어와도 DB가 데이터를 절대 안 섞게.
- **작업**: `033_*` 마이그로 24개 테이블 RLS를 `workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id=auth.uid())` 패턴으로 전면 재작성(SELECT/INSERT/UPDATE/DELETE) · 앱 전체 INSERT에 `workspace_id` 배선(B2) · `WorkspaceProvider` 컨텍스트+`useWorkspace()`+세션/쿠키 `currentWorkspaceId`(가능하면 Supabase Auth 커스텀 클레임으로 JWT에 임베드→자동주입) · Realtime presence를 `presence-workspace-{id}`로 스코프(H4) · Storage 경로 `{workspace_id}/{user_id}/…`+정책(H5) · service_role 라우트에 `.eq('workspace_id',…)` 가드(H3).
- **선행**: 없음(지금 착수). **단, 시작 전 "두 번째 고객 온보딩 동결" 선언.**
- **규모**: **L (2~3주)**. 검증이 핵심 — 테스트 워크스페이스 2개 + 교차 유저로 격리 통과 확인.

### Phase B2 — 가입·초대·RBAC (계정 모델 전환)
- **목표**: 회사를 만들고, 진짜 이메일로 초대하고, 역할로 권한 분리.
- **작업**: 이름→가짜이메일 폐기→**진짜 이메일+매직링크/OTP**(Supabase Auth OTP 또는 Resend)(B4) · 워크스페이스 생성 폼(회사명·slug·플랜, 생성자=owner) · `invite_tokens` 테이블+`/join?token=` 1회성 소비→`workspace_members` 추가→공용 비번 폐기(B5) · 멤버십>1이면 워크스페이스 선택+헤더 스위처 · RBAC를 `workspace_members.role` 기반 RLS+API 권한체크(H9) · 신규 워크스페이스에 프리셋 에이전트 8개 복제 RPC(M8).
- **선행**: B1.
- **규모**: **L~XL (3~4주)**.

### Phase B3 — 과금·비용 통제
- **목표**: 돈 받고, 비용 폭주 막기.
- **작업(즉시 병행 권장)**: `agent_usage`에 `cost_cents`+토큰단가, `workspaces.monthly_token_budget`/`monthly_cost_usd`, 호출 전 잔량체크 미들웨어(H1). **이건 비용사고 방지라 B1과 병행.** 이후: Stripe Billing(`billing_plans`·`workspace_subscriptions`·`usage_meters`·`invoices`+webhook으로 active/suspended 동기화) · 레이트리밋(Upstash/Vercel, 워크스페이스당 N req/min)(H8) · 미터링→월말 집계→Stripe usage record(M2).
- **선행**: B1·B2.
- **규모**: **XL (3~4주)**.

### Phase B4 — 운영·관리콘솔·감사
- **작업**: `audit_logs`+트리거/RPC 로깅+조회 API(H7) · 슈퍼어드민 콘솔(`/admin/*` allowlist: 전체 워크스페이스·사용량·비용)(M3) · 모니터링(Sentry+토큰비용 대시보드) · 데이터 export/삭제(GDPR)(M4).
- **선행**: B1~B3. **규모**: **L (2~3주)**.

### Phase B5 — 컴플라이언스·엔터프라이즈
- **작업**: TOS/Privacy/DPA · SOC2 준비(Vanta) · SSO(OIDC→SAML)·SCIM · 비번정책·MFA · 데이터 레지던시(EU 고객 시 EU Supabase) · DB 하드닝(sentinel DEFAULT 제거·교차 FK CHECK).
- **선행**: B1~B4 안정화. **규모**: **XL (고객 요구에 따라)**. *Auth0/Clerk/WorkOS로 SSO/SCIM 외주 시 수개월→수주.*

### Phase B6 — 패키징·배포
- **작업**: Electron(electron-builder, DMG/NSIS/AppImage, 자동업데이트, 코드사이닝) · 모바일 반응형 웹 · 커스텀 도메인/화이트라벨(Vercel 미들웨어 hostname 라우팅+`workspaces.custom_domain`).
- **선행**: 웹앱 멀티테넌트 안정(B1~B3). **규모**: **L (Electron 2~4주+배포자동화 1~2주)**. *Next.js 16/Turbopack↔Electron 호환 사전확인.*

---

## 4. 지금 당장(MVP) vs 나중

**MVP(첫 외부 고객 1~2곳)에 꼭 필요:**
- ✅ **B1 전체**(격리는 협상 불가) · ✅ 진짜 이메일+매직링크(B2 핵심) · ✅ 토큰 초대+공용비번 폐기(B2) · ✅ 워크스페이스 생성/전환 UI(B2) · ✅ Claude 비용한도+기본 레이트리밋(H1·H8) · ✅ 기본 과금(처음엔 Stripe 없이 고정월정액+수동 인보이스 OK) · ✅ 기본 감사로그(append-only) · ✅ 기본 RBAC(owner/admin/member) · ✅ TOS/Privacy(한국 고객용).

**나중(성장/엔터프라이즈):**
- ⏳ Stripe 사용량 미터링 · ⏳ SSO/SCIM · ⏳ SOC2·DPA·EU 레지던시 · ⏳ 슈퍼어드민 콘솔(테넌트10 미만이면 수동) · ⏳ 커스텀 도메인/화이트라벨 · ⏳ Electron/모바일 네이티브 · ⏳ DB 멀티프로젝트(단일로 수십~수백 테넌트 가능) · ⏳ MFA·비번복잡도(권장은 빠를수록).

---

## 5. 핵심 의사결정 (대표 결정 대기 — "시작하자" 시 확정)

> 각 항목 **권장안**을 함께 적음. 결정되면 이 문서에 선택을 기록하고 진행.

1. **격리 아키텍처** — *권장: 단일 프로젝트 + RLS 유지.* A단계가 이 전제로 깔림. 단일로 수십~수백 테넌트 수용(병목: Realtime 동접 기본500·pool15·Storage5GB 모두 업그레이드 가능). DB 분리는 데이터 레지던시/초대형 고객 요구 시에만. → **B1 RLS 방향을 좌우.**
2. **인증** — *권장: MVP는 Supabase Auth + 매직링크 자체구현, 엔터프라이즈 SSO/SCIM이 실제 딜에 걸리는 시점에 WorkOS로 이전.* B2 스키마를 이전 가능하게 워크스페이스/role 깔끔히 분리. → **계정모델 전환 구현/예산 좌우.**
3. **시장 전략** — *권장: 첫 고객은 영업주도+수동 셋업(초대·수동 인보이스) → 검증되면 셀프서브.* → **B2 초대흐름·B3 과금자동화 우선순위 좌우.**
4. **과금 모델** — *권장: MVP는 시트 고정요금으로 단순 시작 + 비용추적(H1)만 먼저 켜서 마진 관찰 → 이후 하이브리드(기본+시트+토큰 초과분).* → **`cost_cents`·`usage_meters` 스키마 설계에 직접 영향.**
5. **출시 타임라인 & 동결** — *권장: 오늘 "두 번째 회사 온보딩 동결" 선언.* 현실적 타임라인 = B1(2~3주)+B2(3~4주)+비용통제/기본과금/기본감사(1~2주 병행) ≈ **6~10주**.

---

## 부록 A — B2B SaaS 표준 요구영역 (리서치, 성숙도/규모)

| 영역 | 성숙도 | 규모 |
|------|--------|------|
| 테넌트 모델·프로비저닝 | MVP | M |
| 인증·온보딩 | growth | L |
| RBAC | growth | M |
| 과금·구독 | enterprise | L |
| 슈퍼어드민·테넌트 콘솔 | growth | M |
| 옵저버빌리티·감사로그 | growth | M |
| 컴플라이언스·데이터보호 | enterprise | L |
| 레이트리밋·남용방지 | growth | M |
| 데이터 export·백업·DR | growth | M |
| SSO/SCIM·엔터프라이즈 | enterprise | XL |
| 데이터 레지던시 | growth | L |
| 패키징·배포(Electron/모바일) | growth | L |
| 커스텀 도메인·화이트라벨 | growth | M |
| 고객지원·SLA | growth | M |
| 성능·확장성 | growth | M |
| 미터링·사용량추적 | enterprise | L |
| 가격책정·플랜구조 | enterprise | M |
| 법령준수·계약 | growth | S |

## 부록 B — 레퍼런스 모델 (경쟁/유사 제품이 실제로 하는 것)

- **Slack**: shared-DB + RLS + workspace 개념 + per-seat 청구 + SSO/SCIM(Enterprise Grid) + custom domain.
- **Notion**: database-per-team + workspace switching + per-user billing + OAuth2 SSO + workspace별 API rate limit.
- **Linear**: shared-DB + team permissions + per-user billing + OAuth2 + WebSocket Realtime + audit logs.
- **Vercel(PaaS)**: Next.js 멀티테넌트 템플릿 + subdomain 라우팅 + wildcard SSL + edge middleware.
- **Auth0/Clerk/WorkOS**: B2B IAM + 네이티브 멀티테넌트 RBAC + SSO/SCIM/SAML + 위임 관리 + 토큰 캐싱.
- **Stripe Billing**: per-seat + metered usage + custom_usage_record + webhook 동기화 + invoice 커스텀.
- **Supabase**: shared PostgreSQL + RLS + Auth + Realtime (custom domain은 기본 미지원·workaround).

> **EQURIA 적합 결론**: Slack/Linear형 **shared-DB + RLS**(현재 A단계와 동일) + per-seat(시작) → 하이브리드 과금 + (엔터프라이즈 딜에서) WorkOS SSO/SCIM 외주. AWS식 schema/DB-per-tenant는 데이터 레지던시/초대형 고객 전까지 불필요.
