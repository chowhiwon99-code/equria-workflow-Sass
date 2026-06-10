# HANDOFF — 사내 AI 워크스페이스 (B2B 전환 중 · 제품 브랜드명 미정)

> **새 세션 읽기 순서:** 이 파일 → 아래 **📂 문서 지도** → `CLAUDE.md` → `.claude/skills/{safe-changes,latest-stack,known-issues}.md`
> 이 파일은 **"현재 상태 · 다음 할 일 · 합의된 정책"만** 담는다. 깊은 내용은 전용 문서(지도 참조), 과거 상세는 git 커밋 메시지에.
> 최종 업데이트: **2026-06-10 (세션 8 연장)**

---

## 📂 문서 지도 (무엇을 어디서 읽나)

| 문서 | 내용 |
|------|------|
| **HANDOFF.md** (이 파일) | 현재 상태·다음 할 일·합의된 정책 (제일 먼저) |
| **WORKLOG.md** | 작업 로그(매 작업 무엇·왜·쪼갠내용·예상이슈) + 기능 마스터 체크리스트 |
| `CLAUDE.md` | 프로젝트 정체성·스택·절대원칙·파일구조·DB요약 (단, **브랜드 규칙은 아래 '합의된 정책'이 최신**) |
| `PRODUCTIZATION.md` | B2B SaaS 전체 로드맵(B1~B6)·리스크 레지스터·핵심 의사결정 |
| `B1-DESIGN.md` | 테넌트 격리(B1) 상세 설계·RLS 메커니즘 |
| `AGENTS-MCP-STRATEGY.md` | 에이전트·MCP 차별화 전략·시한폭탄(생각만/나중) |
| `.claude/skills/safe-changes.md` | 변경 안전 원칙 (모든 코드/DB 변경 전 — 최우선) |
| `.claude/skills/latest-stack.md` | AI SDK v6·Supabase 최신 패턴 |
| `.claude/skills/known-issues.md` | 비차단 기술부채·보류분 |

---

## 🎯 지금 상태 (2026-06-10)

- **제품**: 사내 직원용 AI 워크스페이스 → **B2B 멀티테넌트(회사별 판매) SaaS로 전환 중**.
  - ⚠️ **브랜드명 미정.** 코드에 박힌 `EQURIA`·`이큐리아`·`K-뷰티`는 판매 제품명/도메인이 아니라 **첫 번째 사내 고객(우리 회사)의 맥락이 하드코딩된 흔적**. 철학 = **"회사별 커스터마이징"**(각 회사 업무에 AI가 진짜 작동하게).
- **배포**: 프로덕션 `main` = `61592be` READY · https://equria-workflow-sass.vercel.app
  - **`feat/toss-ui-refresh`가 main보다 3커밋 앞섬**: `043`(신규가입 멤버등록 회귀수정 — **DB엔 이미 라이브 적용**, 파일만 미배포) + 문서 2(HANDOFF·AGENTS-MCP). **다음 코드 작업 시 함께 배포**되거나, 원하면 지금 `feat→main` FF로 동기화. 직전 `ce88294`는 1클릭 롤백 후보.
  - 작업 흐름: `feat`에서 작업 → 브랜치 push마다 **프리뷰 자동배포**(라이브 무영향) → `main` push만 프로덕션 배포.
- **라이브 기능**: 에이전트 허브(우하단 위젯)·에이전트 빌더(위저드)·워크플로우(n8n 캔버스+순차실행)·캘린더·프로젝트·재무·명함·파일·**메일(Gmail)**·**MCP**·구성원 디렉터리 + **직원 채팅**(상태표시·이모지반응·답장/스레드·리치텍스트·다중첨부·**드래그앤드롭/붙여넣기**·AI보조/맞춤법) · 전역 ⌘Z Undo/휴지통.
- **🔐 멀티테넌시 B1-a (읽기 격리) = 완료** (마이그 033~043, DB 라이브·검증). 회사 간 데이터 격리 활성 → 아래 §멀티테넌시.
- **💰 비용 추적 = 켜짐** (마이그 042): Claude 호출별 모델·달러비용 기록 + 마이페이지 "추정 비용".
- **🆕 이번 세션(2026-06-10) 추가 — 사내 행정 2종(로컬 main 커밋, 프로덕션 미배포)**:
  - **근태·결재 `/work`**(마이그 045): 근태(출퇴근)·지출결의서·휴가 통합. 본인/관리자 비공개 RLS, 관리자 승인/반려.
  - **회의 노트 `/meetings`**(마이그 046~049): 워크스페이스 **공유** 회의록. **노션식 Tiptap 블록 에디터** — `/` 슬래시 메뉴(텍스트·제목1~4·목록3종·인용·콜아웃·코드·구분선·표 + **이미지/파일(pdf·zip·xlsx·ppt 등 모든 형식) 인라인 업로드**, lucide 아이콘 통일), 빈줄 "'/'를 입력해 명령어 사용". 본문=HTML 저장, 읽기전용은 동일 확장 렌더(=sanitize). 상시 AI 보조(요약/액션아이템/정리, `/api/meeting-notes/assist`, 슬래시에서도). 인라인 미디어=공개 `meeting-media` 버킷(048, svg/html 차단·50MB 049). 적대 리뷰 2라운드(IDOR·저장형 XSS 등) 수정 완료.
  - 작은 수정(1·2단계): 채팅 알림 자동삭제·스크롤바 간격·파일 다중업로드·파일 공개범위(공개/부서/개인, 044).
  - **다음(5단계 예정)**: 노션식 새 페이지(블록 에디터 + `/`슬래시 + AI 상시) — 가장 큼·단독.
- **안정도**: `tsc` 0 · `pnpm lint` **30 errors/0 warnings**(전부 기존 `set-state-in-effect`·refs 부채, 신규 0이 베이스라인) · `any` 0 · 마이그 **원격52↔디스크52 drift 없음**(044~049 추가) · 로컬 `next build`는 폰트 이슈로 미실행 → **Vercel 빌드가 실제 게이트**.

> 최근 작업 상세(세션7·8: UI 리프레시·채팅 단계0~6·에이전트/위젯 재설계·캘린더·삭제RLS버그·B1격리·비용추적 등)는 **git 커밋 메시지**에 충실히 기록됨. 여기 중복 안 함.

---

## 🔴 다음 할 일 (우선순위)

### A. 지금 안전·고가치 (멀티테넌시 무관 · 리스크 0 · 바로 착수 가능)
1. **기본(템플릿) 에이전트 똑똑하게** — 현재 8개 매뉴얼이 ~100~300단어로 빈약(예시0·절차0·고유지식0). 1000단어대 백본(역할·절차·예시3·엣지케이스·출력형식·**회사별 슬롯**)으로 재작성. **상세·예시·착수순서 = `AGENTS-MCP-STRATEGY.md` §5.**
2. **seed 온도값 채우기** — 현재 8개 전부 0.7(seed 미설정). 정확성=0.3/창의=0.8~1.0 차등. **마이그 불필요**(컬럼·코드 정상, seed.sql만 수정. DB 상한 1.0).
3. **회사 지식 수집** — 차별화 자산(정책·실제 사례·톤)을 슬롯 콘텐츠로.

### B. 두 번째 회사 받기 "전" 반드시 (멀티테넌시 본작업)
- **B1-b(쓰기 강제)**: `WorkspaceProvider`(현재 워크스페이스 컨텍스트) → 전 INSERT에 `workspace_id` 명시 → presence 채널 동적화 → service_role 라우트 가드 → sentinel 백필 → DEFAULT 제거. **앱-DB 동기 배포 필요** = 별도 승인 게이트. (설계 `B1-DESIGN.md` §6)
- **대표 결정 필요(코드보다 먼저)**: ① 프리셋 자원(기본 에이전트·MCP) 전략 = 복제/공용/하이브리드(권장 초기 복제) ② MCP 시크릿 = 전역환경변수→회사별 DB 암호화(`AGENTS-MCP-STRATEGY.md` §3·6).
- ⚠️ **B1-b 완료 전 두 번째 회사 온보딩 금지**(현재 앱이 workspace_id를 sentinel default에 의존 → DEFAULT 제거 전엔 신규 회사 데이터가 섞임).

### C. 사용자(대표) 작업
- **첫 파일럿 고객 1곳 물색**(영업주도+수동셋업 — 제품은 충분히 동작).
- **Gmail 프로덕션 연동**: Vercel 환경변수 5개(`GOOGLE_CLIENT_ID`·`_SECRET`·`_TOKEN_ENC_KEY`·`GOOGLE_OAUTH_REDIRECT_URI=https://equria-workflow-sass.vercel.app/api/google/callback`·`NEXT_PUBLIC_APP_URL`) + Google Console 리디렉션 URI. 안 하면 메일 연결 시 `GOOGLE_OAUTH_NOT_CONFIGURED`.
- **service_role 키 rotation**(레거시 노출분) · **Supabase Auth leaked-password protection 켜기**(대시보드 토글, 무료 보안강화).

### D. 나중
- 채팅 단계7(초대·권한, B2와 합류) · 과금 자동화(Stripe) · SSO/SCIM·SOC2(엔터프라이즈) · Electron/모바일(B6).
> 비차단 기술부채는 `known-issues.md`.

---

## 💡 합의된 정책 (코드만으론 안 보이는 결정 — 깨지 말 것)

- **🏷️ 브랜드/철학(최신 — CLAUDE.md §1 브랜딩 규칙을 대체)**: 제품 브랜드명 **미정**. `EQURIA`/`이큐리아`/`K-뷰티`는 **첫 사내 고객 흔적**(제품명·도메인 아님). 철학 = **회사별 커스터마이징**. 새 에이전트/UI 작성 시 도메인·브랜드를 고정값이 아니라 **슬롯/설정**으로 빼는 방향 지향.
- **삭제 = soft-delete(휴지통)**: 목록 `deleted_at is null` 필터, Storage 파일 보존, ⌘Z Undo(무음·실패 시만 토스트).
  - **⚠️ `is_active` 소프트삭제 테이블의 SELECT 정책에 `is_active=true`를 USING에 넣지 말 것**(마이그 031·032 교훈): 삭제 시 결과 행이 SELECT 가시성을 잃어 42501로 막힘. 소유자는 활성/비활성 무관 조회 + 앱에서 `is_active=true` 필터.
- **🔐 RLS 멀티테넌시 패턴(B1)**: 모든 데이터 SELECT = `workspace_id in (select public.auth_user_workspace_ids())`, INSERT with check = `public.is_workspace_member(workspace_id)`. 헬퍼는 `security definer stable`. **신규 가입자는 `handle_new_user()`가 equria 멤버로 자동 등록(043)** — INSERT 정책 충족 위해 필수.
- **에이전트 = 우하단 위젯 only**(/agents는 빌더/관리). 내 핀 기준. 비공개 기본 + 공유(이제 "내 워크스페이스 안 공개").
- **워크플로우 = n8n 캔버스**. 비공개 기본 + `is_public`. 소유자만 수정, 끈 위상정렬 실행(노드≤6·60s).
- **채팅 SSOT**: `content`(plain)가 모든 텍스트 소비자의 단일 진실. 리치는 `body_json`(버블만). Tiptap 확장 추가 시 `MessageBody` 렌더러 케이스도 함께(`lib/tiptap.ts` 규약).
- **연락처 = `directory_contact` RPC로만**(이메일/전화 컬럼 RLS 차단, 마이그 023b·024). B1(040)에서 **같은 워크스페이스 동료만** 반환하도록 강화.
- **캘린더** = 네이티브 Date·**종일 전용**·첨부 jsonb 메타+`calendar-files` 버킷.
- **DDL 규칙(SSOT)**: MCP `apply_migration`(`project_id` 필수) **+** `supabase/migrations/` 파일 **둘 다**.

---

## 🏢 멀티테넌시 (슬랙형 — 회사별 격리, B2B 판매 대비)

> 목표: 회사별 데이터 완전 격리. **A단계(구조)=완료 · B1-a(읽기 격리)=완료 · B1-b(쓰기 강제)=차후.**

- **확정 결정(대표)**: 격리=단일 Supabase 프로젝트+RLS · 과금=시트 고정요금(+비용추적 병행) · 인증=Supabase Auth+매직링크(SSO는 나중 WorkOS) · 시장=영업주도+수동셋업 · MCP=회사별 격리.
- **A단계(마이그 030)**: `workspaces`·`workspace_members`(다대다) + 24개 테이블 `workspace_id`(NOT NULL DEFAULT=sentinel `00000000-0000-0000-0000-0000000000e1`=equria). 제외: `profiles`(전역)·`google_connections`(개인).
- **B1-a 읽기 격리(마이그 033~043, 2026-06-09~10, DB 라이브·검증)**:
  - 헬퍼 3종(033) + 24테이블 RLS를 workspace 멤버십 격리로 재작성(034 profiles 동료한정·035 완전개방7·036 agents/workflows·037 사용자별·038 채팅·039 MCP·040 함수/RPC/트리거·041 하드닝) + **043 신규가입자 자동 멤버등록(회귀수정)** + 042 비용추적 컬럼.
  - **검증**(롤백 트랜잭션): 멤버=회귀 0, 비멤버=전 테이블 0 + 연락처 PII 0, 신규가입=프로필+멤버십 생성·write-gate 통과. 독립 재검증(적대 9에이전트)으로 '신규가입 시한폭탄' 잡아 043으로 수정.
  - 앱 코드 변경 없음(읽기는 멤버십 함수 기반).
- **B1-b 알려진 한계(쓰기 강제 전까지)**: ① 앱이 INSERT에 workspace_id 미명시·sentinel DEFAULT 의존 → DEFAULT 제거 전 `useWorkspace()`+전 INSERT 배선 선행 필수 ② presence 채널 전역(비차단) ③ 채팅 라우트 MCP 로딩 workspace 미검증(`AGENTS-MCP-STRATEGY.md` §3) ④ 비용추적은 성공 호출 기준 추정 ⑤ 어드바이저 WARN(헬퍼 SECURITY DEFINER 실행가능=RLS 필요·무해).
- **B1-b 남은 작업 + B2~B6 로드맵**: `PRODUCTIZATION.md`·`B1-DESIGN.md` 참조. 포장(Electron/모바일)은 같은 코드 래핑으로 후순위.

---

## 🚀 환경 / 접근

- **GitHub**: `chowhiwon99-code/equria-workflow-Sass` (main=프로덕션, 작업브랜치 `feat/toss-ui-refresh`).
- **Vercel**: team `team_wcW0NMU7oiIxNndyV1afigbp` · project `prj_CcCTUr8eIYpaStaj6RNq7VoLPZG6` (`equria-workflow-sass`) · 배포보호 off.
- **Supabase**: project `dutovtfdckhayyvhtuxu` (ap-northeast-2 서울) · 마이그 001~043(**원격46↔디스크46**).
- **.env.local**: ANTHROPIC · Supabase(URL·anon·service_role) · Google 4종 · `WORKSPACE_PASSWORD` 채워짐. ⚠️ **시크릿 값은 문서/채팅에 적지 말 것**(HANDOFF는 git 추적).
- **테스트 계정**: 조휘원(`c6817c63-943f-4257-8500-f9840ad39bde`)·이동규·김건 (워크스페이스 비번 로그인). 모델: 기본 `claude-sonnet-4-6` / 복잡 `claude-opus-4-7`.
- 링크: [GitHub](https://github.com/chowhiwon99-code/equria-workflow-Sass) · [Vercel](https://vercel.com/chowhiwon99-2151s-projects/equria-workflow-sass) · [Supabase](https://supabase.com/dashboard/project/dutovtfdckhayyvhtuxu) · 메모리 `~/.claude/projects/-Users-johwiwon-equria-workspace/memory/`
