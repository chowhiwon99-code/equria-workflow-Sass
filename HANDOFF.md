# HANDOFF — 회사 AX(AI 전환) 도입 플랫폼 (사내 AI 워크스페이스 · B2B 전환 중 · 브랜드 = Complow)

> **새 세션 읽기 순서:** 이 파일 → 아래 **📂 문서 지도** → `CLAUDE.md` → `.claude/skills/{safe-changes,latest-stack,known-issues}.md`
> 이 파일은 **"현재 상태 · 다음 할 일 · 합의된 정책"만** 담는다. 깊은 내용은 전용 문서(지도 참조), 과거 상세는 git 커밋 메시지에.
> 최종 업데이트: **2026-07-24 (세션 37 — 에이전트 자동 기억(v2) 배포 · 프로덕션 `47b46ea` READY(`complow.kr`) · 마이그 001~105 · 롤백=직전 프로덕션 `bc32728`)**. ① **에이전트 자동 기억 v2**(세션35 수동 '기억해두기'→**자동 추출**): 채팅 `onFinish` 백그라운드(사용자 대기 0)·사용자 턴 3의 배수마다·**Haiku**(`MODELS.cheap`)·중복 2중방어(기존기억 프롬프트주입+`normalizeMemoryContent`)·budget통과·`agent_usage`기록·try/catch로 채팅 무영향. 신규 `lib/agentMemoryExtract.ts`+`agentMemory.ts` 헬퍼+`memoryExtractionSchema`. 마이그 불필요(099 재사용). 위젯 '기억 관리'가 자동분도 노출. **⚠️ 실사용 육안 미검증(로그인 비번 없음)=대표 dogfood.** ② **마이그105 적용**(세션36에서 미적용이던 것 — `projects.notes`·`deleted_at`+멤버 수정권한 RLS, Supabase MCP로 적용·검증): 참고사항 메모·멤버 중요도/상태 변경 라이브 복구. ③ **Stripe 키 폐기건=오식별로 종결**(스크린샷 잘린값 추정이었고 대표 Stripe 가입이력 없음·레포 clean, HANDOFF 미해결①=✅). 각 tsc0·lint29/0(신규0)·build0·main-first. 세션37 상세=WORKLOG. / 이전 **2026-07-22 (세션 36 — 맹점 5종 수정 배포 · 마이그 001~104)**. 코드 3병렬 감사로 찾은 실사용 버그·보안구멍 우선순위 수정(각 tsc0·lint30/0·build0·main-first, 본보기코드 제시): ①**워크플로우 도구 CHECK 위반+고아파일**(마이그**104** `files.source`·`notifications.type`에 'workflow' 추가 · save_file insert에러 캡처·고아 remove — 배포된 기능이 실제로 안 되던 버그) ②**채팅 비용 과소집계**(MCP 다단계 `usage`→`totalUsage` 합산) ③**구글 OAuth 토큰 저장**(`google/client.ts` `void`→`await`, lazy-thenable로 회전 refresh_token 유실=Gmail/Drive 조용히 끊김 유력원인) ④**알림 읽음 저장**(`NotificationBell` `void`→`await`) ⑤**SSRF 하드닝**(공용 `safeFetch`=DNS 실제IP 공인검증+리다이렉트 매홉 재검증 / 웹훅 리다이렉트0 · 리서치이미지 2곳 3홉). **⚠️ 마이그104 프로덕션 SQL Editor로 직접 적용 완료(이 세션 Supabase MCP 부재).** **합의된 다음 큰 공사 = B1-b 쓰기격리**(다음 사용자 받기 선행 필수, ~72곳 INSERT 배선·`useWorkspace()` 신설·presence 채널 네임스페이싱). 세션36 상세=WORKLOG. / 이전 **2026-07-16~22 (세션 35 — 프로덕션 `43f06b1`(+env 재배포)·READY `complow.kr`·마이그 001~103, 롤백=직전 프로덕션 SHA·WORKLOG 참조)**. 대표 dogfood 피드백 다수 반영(각 tsc0·lint30/0·build0·main-first). **배포분:** ①P2.2 출력형식 재설계(업무언어 단일선택+미니예시+직무추천) ②채팅 진입 하단스크롤 4곳(DM 루트 `h-full`→`h-[var(--app-content-height)]`=세션31 PageTransition 높이사슬 회귀수정·그룹 `key=roomId`·어시/위젯 `auto`) ③**학습/기억 v1**(마이그**099** `agent_memories`·본인RLS·격리검증 / 위젯 '기억 관리'(추가·삭제)+채팅 주입 / **지금은 수동 '기억해두기', 다음=자동추출**) ④**만들기 진입 재설계**(예시 갤러리 **제거**→열린 입력+떠다니는 아이콘 / **MCP 연결 스텝**[직무 다음]: 사용가능 커넥터 **전체**+미연결 '연결하고 오세요'·개인계정 안내) ⑤**MCP 도구설명 AI 한국어 요약**(`lib/mcp/summarize`, 커넥터 테스트/연결 시 1회 생성·캐시) ⑥커넥터 **실제 로고**(공용 `ConnectorLogo` 파비콘) ⑦**지식파일 개인전용**(마이그**100** `agent_knowledge.is_personal`·RLS검증 소유자2/타인1 — 공유 에이전트여도 올린 본인만) ⑧**관리자 구성원별 AI 사용량**(마이그**101** RPC `admin_usage_by_member` **오너전용**·게이팅검증 오너4/비오너0·설정 표, 내용은 미노출·사용량만) ⑨개인 파일 '🔒 개인(나만)' 명확화 ⑩**직접작성(manual) 모드 완전 제거**(가이드 마법사만·아이콘은 결과폼 유지) ⑪**오너 전용 구성원 삭제**(`/api/members/[id]` DELETE, admin deleteUser·개인데이터만 cascade·공유자원 set null 보존·2단계 확인) ⑫**MCP OAuth 자가치유**(마이그**102** `mcp_oauth_clients.redirect_uri`—주소 바뀌면 자동 재등록, 'invalid redirect_uri' 수동삭제 반복 방지) ⑬**카테고리 자유입력 정합**(마이그**103** `agents_category_check` 제거—저장 막히던 버그) ⑭**시스템 점검**(오너 전용 `/api/health`+설정: 앱주소·공용비번·구글콜백·키 사전 대조 ✅/⚠️/❌). **기획문서** `AGENTS-LEARNING-DESIGN.md` · **아키텍처 PDF/HTML** 산출(`~/Downloads/Complow-아키텍처.pdf`). **⚠️ 마이그 099~103 프로덕션 DB 즉시적용 · 대표 dogfood 중(실기기 육안 미검증).**
> **🔴 미해결 = 대표 액션(다음 세션 전/중 필수):** ① ~~💳 Stripe 키 폐기~~ → **✅ 종결(2026-07-23 · 오식별로 판명)**: 세션35의 "Stripe 라이브 키" 단정은 **확인된 사실이 아니라 추정**이었음(대표가 보낸 Vercel 설정 **스크린샷의 잘린 값**을 읽은 것 — 당시 기록에도 "값은 Sensitive라 못 봄"·"앞부분만 잘려 보임"·확인은 "`sk_live_`로 시작하죠?" 유도질문). **대표 확인 = Stripe 가입 이력 없음** → 폐기할 키 자체가 없음. 재확인 불가(스크린샷 캐시 삭제·Vercel은 env 값 히스토리 없음·현재값=4321). **잔여 리스크 ≈ 0**: 노출 범위는 대표 Vercel 계정 한정, **레포는 clean**(git 히스토리·현재 파일·`.env.local` 전수검색 0건 — public 레포라 중요). ② 🔑 공용비번 **4321 → 강한 값**(여전히 유효). ③ 📧 **Gmail·Drive 복구**: Vercel `GOOGLE_OAUTH_REDIRECT_URI`=`https://complow.kr/api/google/callback` **+ Google Console '승인된 리디렉션 URI' 등록**(구글 사전등록 엄격). 앱 '테스트'모드면 refresh 7일 만료→'게시'. ④ 시스템 점검 ⚠️ 항목 정리. **[이번 세션 해결]** 공용비번 가입(4321·`test`계정 생성 검증)·Notion 연결(DB 등록초기화+`NEXT_PUBLIC_APP_URL`=complow.kr·OAuth 자가치유)·카테고리 저장. **합의**: AI 채팅·기억·개인연결·개인전용지식=**본인만**(관리자도 내용 못 봄) / 관리자는 **사용량·비용만** 열람. **다음**: 학습 **자동추출**·**프로젝트공유 기억(v1.5)**·파일 자료추천·대용량 RAG. 세션35 상세=WORKLOG. 이전 **2026-07-15 (세션 34 — **에이전트 시스템 재설계** — 리서치(6갈래) 기반 **5단계 계획** `~/.claude/plans/stateful-zooming-quiche.md`(대표 승인) + **배포됨(순차)**: Phase 1(기본 에이전트 8개 소프트삭제·마이그**096**·목록/상세 삭제UI·빈섹션 숨김·seed RETIRED) → StepPicker MCP 서버별 접이식 → Phase 2(예시 갤러리 백오피스8종·카테고리/업무영역/직무 **자유입력**·업계특화 문구 중립화·위젯 빈상태 드래그 버그수정) → Phase 3(에이전트 **지식파일 첨부** 마이그**097** `agent_knowledge`, AI-readable만[PDF·이미지·txt/md/csv/json], 채팅 풀컨텍스트 주입) → **MCP 바인딩**(마이그**098** `agent_versions.mcp_connectors`, 빌더서 내 개인 MCP 선택, 채팅·워크플로우 실행 일관). 프로덕션 **`23cca30`**·롤백 `9adcddd`·READY(`complow.kr`). **⚠️ 마이그 096~098 원격(프로덕션) DB 즉시 적용.** **남은 것**: P2.2 출력형식 재설계·P2.3 가드레일 정합·P2.4 위저드↔직접작성 통합·P2.5 애플UI · MCP **3b**(워크플로우 개인 MCP 툴노드 피커)·**3c**(에이전트 MCP 배지) · Phase 4 내보내기(SKILL.md·AGENTS.md) · Phase 5 워크플로우 사람검토 게이트(+save_file/notify CHECK 버그수정) · **아이콘**(가이드 결과폼에 이미 있음-대표 확인). 세션34 상세=WORKLOG. 이전 세션 33(2026-07-13): MCP 커넥터 11종 추가(available: Cloudflare Docs·Globalping[무인증]·Neon·Asana·Atlassian·Intercom·Square·Webflow·Wix·Canva·Prisma[OAuth+DCR 개방] / coming_soon: Slack·Figma·Vercel·Exa·Zapier·PayPal[화이트리스트·DCR없음·인증불일치]) — 카탈로그 추가만으로 원클릭 연결(연결흐름 데이터주도, 코드0줄) · AI 코칭 실장부 6개월 추세 인식(finance_entries) · 오늘할일 위젯 축소 · **워크플로우 사용성 개선**(예시 템플릿 5종·통합 '단계 추가' 피커·자동연결 명확화) · 프로덕션 `34b9a61`·롤백 `8a8d902`·READY(`complow.kr`)). 세션33 상세=WORKLOG. 이전 세션 32(2026-07-11): 오늘할일 시각알림 pg_cron(마이그 095) + 앰비언트 그라데이션 완화 + 모바일 픽스[iOS 채팅 자동확대·**사이드바 드로어 portal 탈출**(헤더 backdrop-filter가 fixed containing block 되던 회귀)·Modal body portal·viewport maximum-scale] · 프로덕션 **`0a44085`·롤백 `c954435`**·READY(`complow.kr`)).** 세션32 상세=WORKLOG. **⚠️ 실기기 육안 미검증(대표): 채팅 확대 해소·사이드바 드로어·그라데이션 톤·오늘할일 알림 도착.** 이전 **세션 31(2026-07-10)**: 프로젝트 체크리스트(마이그 **094** `project_tasks`, 부모 projects 워크스페이스 격리 EXISTS 상속·협업 CRUD) + **글래스모피즘 전면 리디자인**(P1~5, 토큰 우선 `globals.css` `--glass-*`·`.glass`/`.glass-panel`·`.app-ambient`·신규 `shared/Surface`·`PageTransition`; 캔버스·채팅·에디터·입력은 solid 유지) + 디테일(글래스 강도·카드 칸구분·호버 통일) + 비용·매출(요약 레이아웃 추세2/5+분류3/5·추세 막대 그라데이션·'매출 분류' 자유입력+자동제안). 프로덕션 `4e501d3`·롤백 `c87e091`. **미검증(대표 육안): 3테마·Safari 블러 성능.** **이전 세션(≤30) 상세 = WORKLOG.md·git 커밋**(굵직한 것만): 세션30 프로젝트 중요도(091)·오늘할일 위젯(092)·구성원 부서 부여(093) + **도메인 `complow.kr`+`www.complow.kr` LIVE**(가비아 DNS+Vercel, 프로덕션 `43552ec`) · 세션29 **MCP 개인연결 대개편**(마이그 088~090 `mcp_user_connections`+OAuth 커넥터, `AGENTS-MCP-STRATEGY.md`) + 모바일 반응형 골격(`MobileNav`·`useMediaQuery`·`h-dvh`) · 세션28 MCP 커넥터 디렉터리·bearer 토큰 암호화(086)·AI 비용 예산 한도(087) · 세션27 Drive 탭·Gmail 리치작성/AI 다듬기 · 세션26 **브랜드 EQURIA→Complow 확정**(§합의된 정책) · 세션25 손익 계층표 · 세션15~21 **현금흐름 손익계산기**(마이그 078~085, §현금흐름). **미픽스 기술부채·MCP 마이너 = `known-issues.md`(I17 등).**
> ⚙️ **작업 방식(하네스/루프):** `.claude/skills/work-harness.md`(작업 SOP·검증 게이트·멀티에이전트 기준) + `/deploy`·`/verify` 명령 + push 전 tsc/lint 훅. 매 작업 = 잘게 순차 → tsc 0·lint 30/0·build 0·(DDL이면 RLS 시뮬) → main-first 배포 → 보고.

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
| `AGENTS-LEARNING-DESIGN.md` | 🆕세션35 **학습/기억 + 생성물 파이프라인** 기획·기술병목분석(설계 前, 대표 결정 §7) |
| `.claude/skills/safe-changes.md` | 변경 안전 원칙 (모든 코드/DB 변경 전 — 최우선) |
| `.claude/skills/latest-stack.md` | AI SDK v6·Supabase 최신 패턴 |
| `.claude/skills/known-issues.md` | 비차단 기술부채·보류분 |
| `.claude/skills/work-harness.md` | **작업 방식(하네스/루프)** — 작업 SOP·검증 게이트·멀티에이전트 기준·진행 가시성 |
| `STUDY.md` | (대표용) 비개발자 학습 코스 — 시스템 이해. 온보딩 필수는 아님 |

> 옛 설계 문서(`PLAN`·`CHAT-HUB`·`GOOGLE-MCP` 아키텍처)는 구현 완료/대체되어 `docs/archive/`로 이동. **현재 상태=이 파일, 구현 진실=코드/마이그레이션.**

---

## 🎯 지금 상태 (2026-07-13)

- **제품**: 사내 직원용 AI 워크스페이스 → **B2B 멀티테넌트(회사별 판매) SaaS로 전환 중**.
  - ✅ **브랜드 = Complow(컴플로우) 확정(세션26).** 코드 UI 브랜드 문자열 EQURIA/이큐리아 → Complow 교체 완료. 잔존 `equria:*`(이벤트/스토리지 키)·`equria-*`(CSS 애니명)·`equria.local`(내부 이메일 도메인 폴백)은 **내부 식별자라 의도적 유지**(바꾸면 로그인·상태 깨짐). `K-뷰티`는 첫 사내 고객 맥락 잔재. 철학 = **"회사별 커스터마이징"**(각 회사 업무에 AI가 진짜 작동하게).
- **배포**: 프로덕션 `main` = **세션34 에이전트 재설계(Phase1~3 + MCP 바인딩): 기본제거·삭제UI·예시갤러리·카테고리/업무영역/직무 자유입력·지식파일첨부·개인MCP바인딩**(코드 **`23cca30`**, 마이그 096·097·098, Vercel READY icn1·`complow.kr`) · Vercel 프로젝트 `complow-workflow-sass`(서울 icn1) · **롤백 후보**: **`9adcddd`**(MCP 바인딩 전) · `595558a`(지식파일 전) · `af87697`(Phase1) · `ecadc69`(세션33). *feat=main=origin 모두 `23cca30` 동기(클린).* ⚠️ 마이그 096 롤백=`update agents set is_active=true where created_by is null`. ⚠️ **배포 교훈: main·feat 같은 SHA 연달아 push 시 Vercel 중복제거 → main 먼저 push하고 프로덕션 빌드 확인 후 feat.** ⚠️ **배포 교훈(재확인): main·feat를 같은 SHA로 연달아 push하면 Vercel 중복제거로 프로덕션 승격 스킵됨 → main 먼저 push하고 프로덕션 빌드 생성 확인 후 feat push(간격 필수).**
  - ⚠️ **프로덕션 Drive/Gmail 실사용 전제(대표 액션)**: 구글 OAuth Vercel env + Google 콘솔 `drive.readonly` 스코프 + **prod redirect URI**(`https://<도메인>/api/google/callback`) 등록. 미설정 시 "구글 연결" 실패(코드는 라이브).
  - **과거 배포 상세 = git 커밋·WORKLOG.** 굵직한 묶음: **세션15~21 현금흐름 손익계산기**(마이그 078~085, 아래 §현금흐름 블록) · **세션13~14 그룹채팅**(카카오톡식 전체방+다중방·읽음, 마이그 071~076)·**회의노트 노션식 에디터 + AI 리서치/꼬리물기 지식그래프**(마이그 070·077, `d3-force`·Tiptap v3 확장·`lib/safeFetch` SSRF)·getUser 왕복 제거(`CurrentUserProvider`) · **세션10~12** 멀티에이전트 코드리뷰 픽스·캘린더 팀수정(062)·**icn1 리전 이동**(전환속도) · **세션9** 전자결재·드롭다운 복구. ⚠️ AI 리서치 실사용 전제 = Anthropic 콘솔 web search 활성+결제(대표 액션).
  - ⚠️ **배포 팁**: `main`·`feat`를 같은 SHA로 동시 push하면 Vercel이 중복제거해 프로덕션 승격을 건너뛸 때가 있음 → **`main`을 먼저 push해 프로덕션 빌드 확인 후 `feat` push**.
  - 작업 흐름: `feat`에서 작업 → 브랜치 push마다 **프리뷰 자동배포**(라이브 무영향) → `main` push만 프로덕션 배포.
  - 🆕 **작업 하네스(세션12 `cacf4f4`)**: `/deploy`(이 시퀀스 자동)·`/verify`(tsc+lint 게이트) 명령 + `.claude/settings.json` 훅(**pre-push 게이트**=push 전 tsc 강제·lint 회귀차단 / **Stop 검증**=src 변경 턴 tsc 자동) + `work-harness` 스킬(작업 SOP·멀티에이전트 기준·진행상황 가시성). ⚠️ 훅은 `/hooks` 1회 열거나 재시작해야 활성.
- **라이브 기능**: 에이전트 허브(우하단 위젯)·에이전트 빌더(위저드)·워크플로우(n8n 캔버스+순차실행)·캘린더·프로젝트·재무·명함·파일·**메일(Gmail)**·**MCP**·구성원 디렉터리 + **직원 채팅**(상태표시·이모지반응·답장/스레드·리치텍스트·다중첨부·**드래그앤드롭/붙여넣기**·AI보조/맞춤법) · 전역 ⌘Z Undo/휴지통.
- **🔐 멀티테넌시 B1-a (읽기 격리) = 완료** (마이그 033~043, DB 라이브·검증). 회사 간 데이터 격리 활성 → 아래 §멀티테넌시.
- **💰 비용 추적 = 켜짐** (마이그 042): Claude 호출별 모델·달러비용 기록 + 마이페이지 "추정 비용". **🆕 예산 한도(세션28, 마이그 087)**: `workspaces.monthly_budget_usd` 월 예산 + 실행당 상한($2, `PER_RUN_MAX_USD`) 초과 시 비관리자 AI 실행 **429 차단**(admin 예외) · AI 라우트 9개 프리플라이트(`lib/budget.ts checkBudget`) · 설정 "AI 비용 예산"에서 관리자 설정.
- **🆕 사내 행정 일습(✅ 라이브)**:
  - **근태·결재 `/work`**(마이그 045): 근태(출퇴근)·지출결의서·휴가 통합. 본인/관리자 비공개 RLS, 관리자 승인/반려.
  - **회의 노트 `/meetings`**(마이그 046~049): 워크스페이스 **공유** 회의록. **노션식 Tiptap 블록 에디터** — `/` 슬래시 메뉴(텍스트·제목1~4·목록3종·인용·콜아웃·코드·구분선·표 + **이미지/파일(pdf·zip·xlsx·ppt 등 모든 형식) 인라인 업로드**, lucide 아이콘 통일), 빈줄 "'/'를 입력해 명령어 사용". 본문=HTML 저장, 읽기전용은 동일 확장 렌더(=sanitize). 상시 AI 보조(요약/액션아이템/정리, `/api/meeting-notes/assist`, 슬래시에서도). 인라인 미디어=공개 `meeting-media` 버킷(048, svg/html 차단·50MB 049). 적대 리뷰 2라운드(IDOR·저장형 XSS 등) 수정 완료. **🆕 세션13 에디터 퀄리티 Part 1**(표 편집 컨트롤·선택 인라인 툴바·코드 하이라이트·이미지 정렬) — 위 배포 참조.
  - **🆕 전자결재 `/approval`**(카카오워크식, 마이그 054~056): 양식→폼→**결재선(순차 N명, 결재/참조)**→상신→순차 승인/반려(의견)→**문서함**(결재할문서·기안함·참조함)→문서상세(**결재선 도장** 진행·회수·의견). RPC `submit/act/recall`(상신 후 변경 RPC 전용). **self-approval DB 3중 차단**·realtime·초안 프라이버시. 메뉴 `/work`를 **전자결재+근태**로 분리(구 지출/휴가 단일승인 패널 제거). Phase B 근태개편·C 연차/관리자는 로드맵.
  - **공지사항**(051): 대시보드 상단 칸, 전 직원 열람·**오너(workspaces.owner_id)만 작성**(`AnnouncementsBoard`).
  - **비용/매출 다중 화폐**(052): `finance_entries.currency`(KRW/USD/EUR/JPY/CNY/BTC), 통화별 합계 분리·OCR 통화 인식. `lib/finance`의 `money()`.
  - **사이드바 "직원 채팅" 미읽음 빨간 배지**(`useUnreadDms`) · 근태/지출 UI 개선(근무시간·상태요약).
  - 작은 수정(1·2단계): 채팅 알림 자동삭제·스크롤바 간격·파일 다중업로드·파일 공개범위(공개/부서/개인, 044).
  - **다음(5단계 예정)**: 노션식 새 페이지(블록 에디터 + `/`슬래시 + AI 상시) — 가장 큼·단독.
- **안정도**: `tsc` 0 · `pnpm lint` **30 errors/0 warnings**(전부 기존 `set-state-in-effect`·refs 부채, 신규 0이 베이스라인) · `any` 0 · 마이그 **001~098 적용·drift 없음** · **`next build` 성공** → **Vercel 빌드가 실제 게이트**.
- **🆕 세션14 (✅ 라이브)**: 그룹채팅 알림(마이그 076)·카카오톡식 인앱 토스트(NotificationBell)·ChatList 그룹 미읽음 회귀수정 · `(app)/loading.tsx`(전환 스켈레톤) · pricing Opus $5/$25 정정 · **getUser 왕복 제거**(`CurrentUserProvider` — 서버 레이아웃 user.id를 client context로, 클라 ~27곳 마운트 왕복 제거).
- **🆕 현금흐름 → 손익(P&L) 계산기 `/finance` (✅ 라이브, 세션15~21, 마이그 078~085)**: 매출·비용·보유를 **드래그 캔버스**(박스 자유 배치 + **그룹 컨테이너**(이름·접기·소계, 박스 드래그로 묶기/빼기, flex 오토레이아웃) · **회사 가용현금 pool**(시작보유 인라인 편집)) ↔ **노션DB식 표**(`CashGrid`, 그룹 섹션·소계)가 같은 데이터(SSOT). **계산 칸을 회사가 직접 편집** — 표 헤더 라벨 인라인 + "칸 편집"으로 부가세 등 칸 추가·삭제 + **수식 스텝 빌더**(기존 AST를 스텝으로 분해해 바로 수정). "회사 기본 계산 유형"(`cash_calc_types` 1개)을 표의 **동적 컬럼**으로 승격 → 캔버스·엑셀 자동 반영(구분 강제 안 함=매출·비용 공용). **함수 살아있는 엑셀/CSV**(`exceljs` lazy, 셀=AST 실수식·입력칸 동적, 그룹 섹션·소계 SUMIF, 색·테두리·헤더고정). 구분 색 자동(매출 초록/비용 빨강/보유 파랑, 개별 변경 가능). **단일 AST 엔진**(`calcFormula`: `evalFormula`=앱 · `toExcelFormula`=엑셀)으로 앱=엑셀 일치. 신규 lib: `calcFormula`·`cashflowGraph`(buildSlotGraph 롤업)·`cashAccounts`(fieldsOf·SLOT_TYPES)·`xlsx`·`inline`. 마이그 078(슬롯)·079(amount)·080(카테고리·설정)·081(item_type)·082(calc_types·field_values)·083(note·pool_pos)·084(그룹 x/y/collapsed)·085(default_calc_type_id), RLS=035/080 패턴. **남은 것:** 급여(P2 대표전용)·예측/오픈뱅킹(P3). (알려진 한계: 시드 insert RLS 멀티테넌트 견고화·다통화 pool 표시 = `known-issues`.)
  - **🆕 현금흐름 AI 코칭 `/finance` (✅ 라이브, 세션23, 배포 `84b55ab`)**: 손익 헤더 **"AI 코칭"** 버튼 → 현재 스냅샷(슬롯 + 통화별 요약 + pool)을 Claude가 분석해 **건강도 배지·절감 제안·이상 신호** 구조화 카드로. **DDL 0·RLS 변경 0·읽기 전용**(기존 데이터 분석만). `generateObject` 원샷 + `cashCoachSchema`(zod), sonnet-4-6·온도 0.3, `agent_usage` 비용추적. 신규: `lib/cashCoach`(payload/prompt 순수)·`api/finance/cashflow-coach`·`components/finance/CashCoachPanel`(자체 완결·열면 1회 자동 분석). 프롬프트가 비용률·항목비중 사전계산 → 산술오류 방지, "근거 없으면 빈 배열" 강제로 환각 억제. **다음:** 추세(finance_entries 월별)·저장/히스토리·요금제 게이팅(무료=AI 불가).

> 최근 작업 상세(세션7·8: UI 리프레시·채팅 단계0~6·에이전트/위젯 재설계·캘린더·삭제RLS버그·B1격리·비용추적 등)는 **git 커밋 메시지**에 충실히 기록됨. 여기 중복 안 함.

---

## 🔴 다음 할 일 (우선순위)

### 🔥 활성 — 에이전트 시스템 재설계 (세션34~, 계획 = `~/.claude/plans/stateful-zooming-quiche.md`)
> **배포됨(LIVE, 프로덕션 `aed63d9`(세션34 코드 `23cca30`+세션35 P2.2·채팅픽스), 마이그 096~098):** 기본 에이전트 제거+삭제UI · 예시 갤러리(백오피스 8종) · 카테고리/업무영역/직무 **자유입력** · 업계특화 문구 중립화 · 위젯 드래그 버그수정 · **지식파일 첨부**(AI-readable, 채팅 주입) · **개인 MCP 커넥터 바인딩**(빌더 '내 MCP 연결', 채팅·워크플로우 일관).
> **⚠️ 동작 변경:** 에이전트는 이제 **선택한** 개인 MCP만 씀(예전엔 전부 자동). 기존 에이전트는 수정에서 재선택 필요.
> 🆕 **세션35 — 대표 dogfood 피드백으로 대거 진행(개인화·학습·프라이버시·MCP UX). 방침=만들고 쓰면서 점검 후 고도화:**
> - ✅ **① 만들기 진입 재설계** — 예시 갤러리 **제거** → 열린 "무슨 일 맡길지" 입력 + 배경 **떠다니는 에이전트 아이콘**(`animate-float`). **MCP 연결 스텝(직무 다음, `McpConnectorPicker`)** = 사용 가능한 커넥터 **전체** 표시(연결됨=선택·미연결='연결하고 오세요'·개인계정 안내) + **실제 로고**(공용 `ConnectorLogo` 파비콘). 미검증(대표): 아이콘 톤·MCP 목록 자동갱신(새 연결 후 스텝 재진입 필요).
> - ✅ **② 학습/기억 v1(수동 루프)** — 마이그099 `agent_memories`(본인RLS·격리검증) + 위젯 '기억 관리'(추가·삭제) + 채팅 주입. 설계=`AGENTS-LEARNING-DESIGN.md`(대표 결정 §9). **다음=자동추출·중복병합 / 프로젝트공유=v1.5**(에이전트↔프로젝트 연결 선행 필요).
> - ✅ **MCP 도구설명 한국어 요약**(`lib/mcp/summarize`, AI·테스트 시 1회 캐시) — 영어 원문 대신 일목요연. 하드코딩 아니라 어떤 MCP든 자동.
> - ✅ **프라이버시 3종** — 지식파일 **개인전용**(마이그100 `is_personal`, 공유 에이전트여도 올린 본인만·RLS검증) / 관리자 **구성원별 AI 사용량**(마이그101 RPC 오너전용·**내용 미노출·사용량만**·게이팅검증) / 개인 파일 '🔒 개인(나만)' 명확화. **합의**: AI채팅·기억·개인연결·개인전용지식=본인만(관리자도 내용 못 봄) / 관리자는 사용량·비용만.
> - ⏳ **③ 파일 자료 추천**(첨부 유용/중복/저품질 평가+추천, agent_knowledge 위 AI 1패스) · **④ 대용량→RAG**(<~150쪽 full-context+캐싱 / 초과 pgvector HNSW+iterative_scan) · **생성물(higgsfield) 파이프라인**(비동기 잡큐 pgmq+cron+Edge+Storage+승인→레퍼런스 재투입, Vercel 분단위 대기 금지) — **대기**.
> - ⚠️ **미해결(대표 액션)**: **Notion 연결 401(invalid_token) = 재연결** 필요(안 되면 OAuth refresh 버그 조사). 대표 dogfood 중 실기기 육안 미검증.
> **다음 할 것(기존 우선순위):**
> 1. **MCP 3b** — 워크플로우 StepPicker에 개인 MCP를 **독립 툴노드**로 추가(Notion을 에이전트 없이 워크플로우 단계로). 노드모델(mcp_tool: 회사UUID↔개인slug 구분) + 실행엔진 변경. **3c** — 워크플로우 에이전트 노드에 바인딩 MCP 배지.
> 2. ✅ **P2.2 출력형식 재설계 (세션35 완료·배포 `cf5684e`)** — 업무언어 6개 단일선택 + 미니예시 + 직무기반 추천배지(`OUTPUT_FORMATS`·`recommendOutputFormat`, `WizardField.hint`).
> 3. **P2.3 가드레일/메타프롬프트 정합** — `SKILL_MD_SYSTEM` 11↔7섹션 통일 + 가드레일 기본탑재(환각완화).
> 4. **P2.4 위저드↔직접작성 통합** — "직접 작성" 전환 시 빈 textarea 뚝 떨어짐 해소.
> 5. **Phase 4 내보내기**(SKILL.md·AGENTS.md·시스템프롬프트 복사·MCP스니펫) · **Phase 5 워크플로우 사람검토 게이트**(재개형 실행+승인RPC. ✅ 선행 `save_file`/`notify` CHECK 위반 버그 = **세션36 마이그104로 수정 완료**).
> **대표 확인 대기:** 아이콘(가이드 결과폼 상단에 이미 있음 — 별도 스텝 원하는지) · MCP 선택 UI를 "직무 다음 스텝"으로 옮길지(현재 결과 리뷰에 있음) · 세션34 전체 실사용 육안.



### ⭐ 세션31 이후 (최우선 — 대표 확인/결정 대기)
1. **리디자인 최종 디테일 튜닝** — 대표가 **3테마(라이트/다크/공개화면 force-light)·모바일** 육안 확인 후: 글래스 강도·배경 톤(`.app-ambient`)·강조색(`--accent-dot`)·비용매출 레이아웃 비율(추세 2/5 vs 분류 3/5)·추세 그라데이션 진하기 등 미세조정. 전부 `globals.css` 토큰/소수 파일로 즉시 반영. **(세션32: 대표 피드백으로 `.app-ambient` 다크 그라데이션 alpha 0.18~0.2→0.10~0.11·라이트 0.1→0.06으로 완화. 추가 조정은 언제든.)**
   - 🆕 **모바일 픽스(세션32·배포)**: ① 채팅 입력 시 iOS 자동확대(전송버튼 밀림) → root `viewport{maximumScale:1}` + 컴포저 `text-base md:text-sm`. ② **사이드바 드로어 "뒤로 빠짐" 근본원인 = 글래스 리디자인 회귀**: 드로어가 헤더(`glass-panel`=`backdrop-filter`) 안에 있어 `fixed`의 containing block이 헤더(56px)로 잡힘 → **`createPortal(document.body)`** 로 탈출(뷰포트 기준 보장). 불투명 `bg-sidebar`+스크림 blur 제거는 iOS 투명버그 보조. ③ **공용 `shared/Modal`도 body portal**(glass/transform 조상 트랩 예방). 둘 다 `typeof document` 가드(하이드레이션·lint 안전). **⚠️ 대표 실기기 재확인 필요.**
2. **비용·매출 '분류 관리' 화면 (대표 결정 대기)** — 현재는 *"쓰면 자동 제안 축적"*(자유입력+datalist, 업종무관). 원하면 설정에 **명시적 분류 추가/이름변경/삭제·저장**(DB 테이블 신설+RLS+UI, 팀 공유). → 자동방식으로 충분한지 vs 관리화면 필요한지 대표 결정.
3. **미검증 검증(대표 액션)** — macOS Safari `backdrop-filter` 블러 성능·모바일 드로어(프로스트 상속)·`prefers-reduced-transparency`/`reduced-motion` 폴백 육안.
4. ✅ **오늘 할 일 시각 알림(2차·완료·세션32, 마이그 095)** — `personal_tasks.reminded_at` + `remind_due_personal_tasks()`(security definer·KST 기준) + 매일 09:00 KST pg_cron 잡. 기한 도래 미완료 → notifications(system)·realtime로 NotificationBell 표시. due_date 변경 시 리셋 트리거. **⚠️ 실기기 알림 도착 육안 확인 권장.**
5. **백로그(대표 연동 필요)** — 회사 카드/금융 실연동(오픈뱅킹, "담당자만"=`064` 위임패턴 재사용) · 카카오(카톡) 연결. *(백로그=제품 로직은 준비됐고 대표가 외부 계정/키[오픈뱅킹 API 신청·카카오 개발자앱 등록]를 확보해야 켜지는 연동.)*
6. ✅ **워크플로우 모바일 질문 — 해결(세션33)**: 대표 확인 결과 **"일반 모바일 흐름"** 의미였음(세션32 채팅확대·사이드바 픽스로 이미 해소). n8n 드래그 캔버스 자체 재설계는 불필요. **🆕 다음 착수(세션33 대표 지시): "워크플로우 사용하기 쉽도록" 개선** — 범위(온보딩·템플릿·실행 UX·모바일 보기 등) 세션 시작 시 구체화.
7. **멀티테넌시 B1-b 착수 준비됨(대표 결정 2개 대기)** — "어떻게 시작?"에 대한 답: ⓐ 무위험 첫 단계 = `WorkspaceProvider`+`useWorkspace()`(DB 무변경, 결정 없이 착수 가능) → ⓑ 전 INSERT `workspace_id` 배선 → ⓒ service_role 라우트 가드 → ⓓ 맨 마지막 DEFAULT 제거(파괴적·별도 승인 게이트). **선행 대표 결정**: ① 프리셋 자원 복제/공용/하이브리드(권장 복제) ② MCP 시크릿 전역env→회사별 DB 암호화. 상세 = `B1-DESIGN.md §6`·§B. ⚠️ **B1-b 완료 전 두 번째 회사 온보딩 금지.**

> 아래는 이전 세션 로드맵(대부분 완료). 두 번째 회사 받기 전 필수 = **§B 멀티테넌시 B1-b**.

> **현금흐름 손익계산기(세션15~21) ✅ · 현금흐름 AI 코칭(세션23) ✅ 완료·배포.** 다음 후보: 코칭 고도화(추세 분석 — `finance_entries` 월별 연동·저장/히스토리) · 기존 색 일괄정리(구분색으로) · 급여(P2 대표전용) · 예측/오픈뱅킹(P3) · 또는 아래 **멀티테넌시 B1-b**(두 번째 회사 받기 전 필수).

### 🆕 기능 로드맵 (세션10·2026-06-22 · 대표 승인 · 진행 중)
> 8영역 멀티에이전트 코드조사 기반. 순서 = 안전 win→추가형→큰작업→AI고도화. 매 단계 예상이슈+검증(tsc/빌드/RLS시뮬) 후 보고·배포.
- **1차 ✅ 완료·배포**: ⑦위젯 둥둥모션 · ②직급부여(대표만) · ④명함 그룹화(등록자/날짜/회사)
- **2차 ✅ 완료·배포**: ⑤근태 대표열람+위임(마이그 064) · ⑥회의노트 폴더(마이그 065) + **노트 드래그&드롭**
- **🆕 파일 폴더(④ 연장) ✅ 완료**: 마이그 066 `file_folders` + 폴더 사이드바·드래그&드롭(소유자·대표·관리자 이동). 공용 `FolderSidebarItem` 추출.
- **🆕 macOS Finder식 폴더 UX(세션11 ✅ 배포·프론트만)**: 사이드바→**공용 `FolderGrid`**(중립 폴더 아이콘·더블클릭 진입·breadcrumb·다중선택+묶음드래그+**플로팅 이동바**·정렬·날짜그룹·**폴더 안=항상 아이콘**·조건부 컨트롤). 파일은 **종류 아이콘 통일**(썸네일 시도→되돌림). 회의노트 통일, 명함 "직원별" 라벨. 구 `FolderSidebarItem` 삭제.
- **🆕 파일 미리보기 버그픽스(세션11)**: files 버킷이 "본인 폴더만 읽기"(015)라 공개 공유된 남의 파일은 클라가 서명 불가 → 서버 BFF **`/api/files/signed-url`**(유저 RLS 인가→admin 서명). 본인·공유 파일 모두 미리보기/호버 동작. **`pdfjs-dist` 제거**.
- **🆕 근태 개편(세션11)**: 혼합 리스트→**인원별 마스터/디테일**(이름검색+오늘상태) · **월별 보기**(공용 `MonthStepper` ◀▶, 개인·팀) · 24시간제·"0분" 숨김·"내 근태/나" 표시.
- **🆕 직급(position) 전 화면 표시(세션11)**: 채팅·전자결재(결재선)·회의노트 작성자·공지·명함 등록자·프로젝트·지출/휴가·마이페이지·근태에 직급 노출(있을 때만). **설정에 대표 전용 "구성원 직급" 일괄관리** 추가(set_member_position RPC 재사용).
- **3차**: ③재무 UI 재구성 ✅ **완료·배포(2026-06-24 `e1789f3`)** — 962줄 단일 FinanceView → **탭(요약/내역/세금계산서) + 월 기간필터(MonthStepper) + 경량 차트(npm 0, CSS/SVG)**. 신규 `usePeriodFilter`·`financeAgg`(순수 집계, 통화분리 내장)·`financeCharts`(TrendBadge 증감%·TrendBars·BreakdownBars)·모달 2종 분리. **통화합산 금지·RLS·soft-delete·useUndo 유지**. **설계 판정단→적대검증(4/4 pass) 워크플로우**로 진행. **🆕 원화 환산 합계**(마이그 069 `fx_rates` + `/api/finance/fx-rates` BFF, ECB/Frankfurter 일별·무키, 방식A=오늘환율·BTC 제외): 통화 분리는 유지하고 환산 합계만 별도(기준환율·날짜 명시). · ①그룹채팅 ✅ **완료·배포(세션13 `7d41cc6`)** — 전체방+카카오톡식 다중방·초대·읽음표시(마이그 071~075, DM 미접촉·별도 group_* 병렬). 상세=위 배포 블록.
- **4차**: ⑥회의노트 — **에디터 Part 1 + 표 노션강화 + 회의 DB 뷰(마이그 070) + AI 리서치 Part 2(2a~2c) + 인터랙티브 지식그래프(꼬리물기·대화형·플랫노드) + 이미지크기·PDF ✅ 완료·배포(세션13 `0030e9e`)**. **⚠️ AI 리서치 실사용 전제 = Anthropic 콘솔 web search 활성+결제(대표 액션)** — 미활성이면 2a Claude 폴백·2b 출처 없음·그래프는 자료텍스트라 동작. **남은 것:** 그래프 저장(노트 영구 임베드)·Tavily 티어드·요금제 게이팅(무료=AI 불가, 유료/우리팀 enable)·회의 DB 파일컬럼·프로젝트 중요도 연동. 에디터 패스트팔로우(가벼움): 토글(접기)·멘션(@직원)·`/리서치` 슬래시화.
- **확정 결정**: ②직급=`profiles.position` 자유입력·대표(owner)만 / ⑤근태=대표+지정자만(admin 자동열람 제거) / ⑥⑦폴더=공용(멤버 생성), 회의노트 이동=멤버 누구나·파일 이동=소유자/대표/관리자.
- **확정 결정(세션13 · AI 검색백엔드·요금 모델)**: ① **Tavily/Exa는 지금 안 함** → 나중에 추가해 **티어드**(기본=Claude / 프리미엄=Tavily) 구성. ② **AI(Claude) 기능 = 유료 요금제 전용** — **무료 버전은 AI 사용 불가**, 유료만 가능. ③ **단, 우리 팀(첫 회사=현재 워크스페이스)은 지금 사용 가능**(내부 enable). → B2B 멀티테넌트(B1-b·요금제) 구축 시 plan 게이팅으로 구현. 웹서치 자체(Anthropic web_search) 활성·과금은 Part 2 착수 시 결정.
- 신규 마이그: 062(캘린더팀수정)·063(직급)·064(근태열람)·065(회의폴더)·066(파일폴더). 모두 적용·RLS 시뮬 검증.

### A. 지금 안전·고가치 (멀티테넌시 무관 · 리스크 0 · 바로 착수 가능)
1. ✅ **기본(템플릿) 에이전트 똑똑하게 (2026-06-23·완료·라이브)** — 8개 매뉴얼을 7섹션 백본(역할&경계·회사 컨텍스트(교체 블록)·절차·금지선·예시3·엣지케이스·출력형식&성공정의)으로 재작성. seed.sql 재작성 + **마이그 067**로 라이브 version 2 버전업(296~458자→973~1629자, 3~5배). 모델·온도 무변(A②=온도 별건). 롤백 후보 **`067` 직전**(v1을 is_current로). 상세 = `AGENTS-MCP-STRATEGY.md §5`.
2. ✅ **seed 온도값 차등 (2026-06-24·완료·라이브, 마이그 068)** — 정확성(번역·세금·법무)=0.3 / 균형(CS·데이터=0.5·문서=0.6) / 창의(SNS·이미지)=0.9. ※067로 라이브 v2가 이미 있어 seed만으론 라이브 반영 안 됨 → 마이그 068로 현재 버전 temperature UPDATE + seed.sql 동기. 롤백=전부 0.7.
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
- 채팅 단계7(초대·권한, B2와 합류) · 과금 자동화(Stripe) · SSO/SCIM·SOC2(엔터프라이즈) · Electron/모바일(B6) · **Google Drive 탭**(`FilesView` 미구현 — 설계 `docs/archive/GOOGLE-MCP-ARCHITECTURE.md` §4).
> 비차단 기술부채는 `known-issues.md`.

---

## 💡 합의된 정책 (코드만으론 안 보이는 결정 — 깨지 말 것)

- **🏷️ 브랜드/철학(최신 — CLAUDE.md §1 브랜딩 규칙을 대체)**: 제품 브랜드 = **Complow(컴플로우)** 확정. **도메인** = `complow.kr`(국내 B2B 메인) + 방어용 `.ai`/`.io`/복합`.com`(`complow.com`은 1999년 선점 → 후순위 매입). **상표** = 9류(소프트웨어)·42류(SaaS·AI 서비스)·35류(비즈니스)로 변리사 출원 예정(국내 "컴플로우" 무경합; 38류 COMPLOW는 "포기"건이라 무관). 코드 UI 브랜드 문자열은 Complow로 교체 완료(내부 식별자 `equria:*`/`equria-*`/`equria.local`은 유지). `K-뷰티`는 첫 사내 고객 잔재. 철학 = **회사별 커스터마이징**(도메인·브랜드는 고정값 아닌 **슬롯/설정** 지향).
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

- **확정 결정(대표)**: 격리=단일 Supabase 프로젝트+RLS · 과금=시트 고정요금(+비용추적 병행) · 인증=Supabase Auth **소셜 로그인(구글·애플·카카오)** + 매직링크 병행(카카오=커스텀 OIDC, SSO는 나중 WorkOS) · 시장=영업주도+수동셋업 · MCP=회사별 격리.
- **A단계(마이그 030)**: `workspaces`·`workspace_members`(다대다) + 24개 테이블 `workspace_id`(NOT NULL DEFAULT=sentinel `00000000-0000-0000-0000-0000000000e1`=equria). 제외: `profiles`(전역)·`google_connections`(개인).
- **B1-a 읽기 격리(마이그 033~043, 2026-06-09~10, DB 라이브·검증)**:
  - 헬퍼 3종(033) + 24테이블 RLS를 workspace 멤버십 격리로 재작성(034 profiles 동료한정·035 완전개방7·036 agents/workflows·037 사용자별·038 채팅·039 MCP·040 함수/RPC/트리거·041 하드닝) + **043 신규가입자 자동 멤버등록(회귀수정)** + 042 비용추적 컬럼.
  - **검증**(롤백 트랜잭션): 멤버=회귀 0, 비멤버=전 테이블 0 + 연락처 PII 0, 신규가입=프로필+멤버십 생성·write-gate 통과. 독립 재검증(적대 9에이전트)으로 '신규가입 시한폭탄' 잡아 043으로 수정.
  - 앱 코드 변경 없음(읽기는 멤버십 함수 기반).
- **B1-b 알려진 한계(쓰기 강제 전까지)**: ① 앱이 INSERT에 workspace_id 미명시·sentinel DEFAULT 의존 → DEFAULT 제거 전 `useWorkspace()`+전 INSERT 배선 선행 필수 ② presence 채널 전역(비차단) ③ 채팅 라우트 MCP 로딩 workspace 미검증(`AGENTS-MCP-STRATEGY.md` §3) ④ 비용추적은 성공 호출 기준 추정 ⑤ 어드바이저 WARN(헬퍼 SECURITY DEFINER 실행가능=RLS 필요·무해).
- **B1-b 남은 작업 + B2~B6 로드맵**: `PRODUCTIZATION.md`·`B1-DESIGN.md` 참조. 포장(Electron/모바일)은 같은 코드 래핑으로 후순위.
- **🆕 세션26 정합(2026-07-06)** — *로드맵 SSOT는 PRODUCTIZATION.md, 아래는 이번 세션 결정만*:
  - **브랜드 = Complow** 확정(코드·문서·로고·파비콘 반영 완료·배포).
  - **개인정보처리방침·이용약관 초안 완료** = `docs/legal/{privacy,terms}.md` → PRODUCTIZATION §B5/MVP의 "TOS·Privacy(한국)" **착수분**. 남은 것: `[___]` 값·`/privacy`·`/terms` 페이지·가입 동의·변호사 검토·hard-delete·public 버킷 점검.
  - **인증 방식 결정** = B2를 **소셜 로그인(구글·애플·카카오)** 우선으로(카카오=커스텀 OIDC). OAuth 콜백은 **데스크톱(B6 Electron) 딥링크까지 고려**해 설계.
  - **🆕 랜딩/마케팅 페이지** = 신규 필요 트랙(공개 사이트: 소개·가격·CTA "앱 열기/데스크톱 다운로드"). **앱과 분리**(예: `complow.kr`=마케팅 / 앱=로그인 후). **멀티테넌시와 무관 → 독립 착수 가능**. 격리는 "로그인해 워크스페이스 진입 시점"부터(랜딩은 공개).
  - **착수 우선순위 권장**: B1-b(쓰기 격리·선행 차단막) → B2(소셜로그인+초대+워크스페이스 관리) → B3(과금+rate limit). 랜딩페이지·AI 고도화(에이전트/워크플로우/MCP)는 병행 가능.

---

## 🚀 환경 / 접근

- **GitHub**: `chowhiwon99-code/equria-workflow-Sass` (main=프로덕션, 작업브랜치 `feat/toss-ui-refresh`).
- **Vercel**: team `team_wcW0NMU7oiIxNndyV1afigbp` · project `prj_CcCTUr8eIYpaStaj6RNq7VoLPZG6` (`equria-workflow-sass`) · 배포보호 off.
- **Supabase**: project `dutovtfdckhayyvhtuxu` (ap-northeast-2 서울) · 마이그 **001~105**. 🆕세션37: 105=`project_collab`(세션36 작성·세션37 Supabase MCP 적용 — `projects.notes`·`deleted_at` 추가형 컬럼 + `projects_update` RLS에 project_members OR 추가·멤버도 중요도/상태 변경 / 롤백=update 정책을 035 원문 created_by·owner_id만으로). 세션36: 104=`workflow_tool_check`(추가형 — `files.source`에 'workflow', `notifications.type`에 'workflow' 추가 → 워크플로우 save_file/notify 도구 CHECK 위반 버그 수정 · 프로덕션 SQL Editor 직접적용). 세션35: 103=`agents_category_check` 제거(카테고리 자유입력 정합), 102=`mcp_oauth_clients.redirect_uri`(OAuth 자가치유·주소변경 자동 재등록), 101=`admin_usage_by_member()` RPC(오너전용 구성원별 사용량 집계·security definer·게이팅검증 오너4/비오너0), 100=`agent_knowledge.is_personal`(지식파일 개인전용 — true면 올린 본인만 열람·주입, RLS 검증 소유자2/타인1), 099=`agent_memories`(에이전트 개인 기억 v1, `user_id`+`agent_id`, 본인만 RLS·격리검증, 프로젝트공유·벡터는 v1.5·v2 추가형). 세션34: 096=`remove_default_agents`(기본 8개 소프트삭제·복구가능) · 097=`agent_knowledge`(지식파일, 부모 상속 RLS) · 098=`agent_mcp_connectors`(agent_versions.mcp_connectors 개인 커넥터 바인딩).
- **.env.local**: ANTHROPIC · Supabase(URL·anon·service_role) · Google 4종 · `WORKSPACE_PASSWORD` 채워짐. ⚠️ **시크릿 값은 문서/채팅에 적지 말 것**(HANDOFF는 git 추적).
- **테스트 계정**: 조휘원(`c6817c63-943f-4257-8500-f9840ad39bde`)·이동규·김건 (워크스페이스 비번 로그인). 모델: 기본 `claude-sonnet-4-6` / 복잡 `claude-opus-4-7`.
- 링크: [GitHub](https://github.com/chowhiwon99-code/equria-workflow-Sass) · [Vercel](https://vercel.com/chowhiwon99-2151s-projects/equria-workflow-sass) · [Supabase](https://supabase.com/dashboard/project/dutovtfdckhayyvhtuxu) · 메모리 `~/.claude/projects/-Users-johwiwon-equria-workspace/memory/`
