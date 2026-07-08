# HANDOFF — 회사 AX(AI 전환) 도입 플랫폼 (사내 AI 워크스페이스 · B2B 전환 중 · 브랜드 = Complow)

> **새 세션 읽기 순서:** 이 파일 → 아래 **📂 문서 지도** → `CLAUDE.md` → `.claude/skills/{safe-changes,latest-stack,known-issues}.md`
> 이 파일은 **"현재 상태 · 다음 할 일 · 합의된 정책"만** 담는다. 깊은 내용은 전용 문서(지도 참조), 과거 상세는 git 커밋 메시지에.
> 최종 업데이트: **2026-07-08 (세션 28 — MCP 디렉터리·토큰 암호화·비용 예산 + MCP 사용 흐름 명확화 + 워크플로우 에이전트·MCP 융합. 배포 `75d5944`, 롤백 `9af4751`·`4d6b215`).** 세션28: /mcp Claude식 **커넥터 디렉터리**(검색·카테고리·정렬·추천·리치카드 13종) · **MCP bearer 토큰 DB 암호화 저장**(마이그 086 `mcp_servers.encrypted_token`, UI 입력·env 폴백·admin, crypto.ts 재사용) · **AI 비용 예산 한도**(마이그 087 `workspaces.monthly_budget_usd`, 월 예산+실행당 상한 $2, AI 라우트 9개 프리플라이트 429 차단·admin 예외·설정 UI) · **MCP 사용 흐름 명확화**(/mcp 3단계 안내 + "에이전트 만들기" 바로가기 → `/agents/new?mcp=` 프리필 + 채팅 🔧 도구 사용 칩) · **워크플로우 융합(B)**: 에이전트 노드가 자기 MCP 도구 사용(run 라우트, totalUsage 비용) + 캔버스 MCP 도구 노드 UI(픽커·인자 JSON 편집·플러그 아이콘) + MCP 클라이언트 런당 캐시·더블클로즈 픽스 · 대표(owner) role→admin 승격. **다음 세션 최우선 = 모바일 반응형**(`docs/build/mobile-responsive.md` — 사이드바 반응형 0줄이라 폰에서 전 화면 짜부, 스샷 확인). 이전(세션 27 — Google Drive 탭 + Gmail 리치 작성/AI 다듬기 + 로딩 최적화·배포 `46cc1de`, 롤백 `676ddcd`). 세션27: `drive.readonly` Drive 탭(목록·폴더·다운로드) · Gmail 리치 작성창(참조/숨은참조·Tiptap 서식·첨부) + **AI 다듬기(격식체·친근체·간결·번역, AI 티 금지)** + 우측하단 도킹/모션 · Drive·Mail SWR 캐시+스켈레톤·**Gmail batch N+1 제거** · 회의노트 AI 이모지/줄표 제거 · 초안 랜딩 비공개+미연결 소셜 UI 제거. ⚠️ 프로덕션 Drive/Gmail 실사용 = 구글 OAuth Vercel env+콘솔 `drive.readonly`+prod redirect URI(대표). 이전(세션26): 제품 브랜드 **EQURIA/이큐리아 → Complow(컴플로우)** 확정. 코드 UI 브랜드 문자열 전체 교체(내부 식별자 `equria:*`/`equria-*`/`equria.local`은 유지) + 어시스턴트/에이전트 템플릿 K-뷰티 문구 업종무관 제네릭화. 도메인 `complow.kr`(국내 B2B) + 방어용 `.ai`/`.io`. 상표 9/42/35류 출원 예정. 사이드바 워드마크 Complow + Complow "C" 모노그램 favicon(`app/icon.svg`, 옛 favicon.ico 제거). **코드 배포 `859cec9`(브랜드)·`c5c33be`(로고·파비콘)**. 이전(세션25): 손익 엑셀 계층표(`13ff398`)·계산유형 UX(`70b924d`). **마이그 078~085 DB LIVE.** 상세=WORKLOG 세션15~26.
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
| `.claude/skills/safe-changes.md` | 변경 안전 원칙 (모든 코드/DB 변경 전 — 최우선) |
| `.claude/skills/latest-stack.md` | AI SDK v6·Supabase 최신 패턴 |
| `.claude/skills/known-issues.md` | 비차단 기술부채·보류분 |
| `.claude/skills/work-harness.md` | **작업 방식(하네스/루프)** — 작업 SOP·검증 게이트·멀티에이전트 기준·진행 가시성 |
| `STUDY.md` | (대표용) 비개발자 학습 코스 — 시스템 이해. 온보딩 필수는 아님 |

> 옛 설계 문서(`PLAN`·`CHAT-HUB`·`GOOGLE-MCP` 아키텍처)는 구현 완료/대체되어 `docs/archive/`로 이동. **현재 상태=이 파일, 구현 진실=코드/마이그레이션.**

---

## 🎯 지금 상태 (2026-07-08)

- **제품**: 사내 직원용 AI 워크스페이스 → **B2B 멀티테넌트(회사별 판매) SaaS로 전환 중**.
  - ✅ **브랜드 = Complow(컴플로우) 확정(세션26).** 코드 UI 브랜드 문자열 EQURIA/이큐리아 → Complow 교체 완료. 잔존 `equria:*`(이벤트/스토리지 키)·`equria-*`(CSS 애니명)·`equria.local`(내부 이메일 도메인 폴백)은 **내부 식별자라 의도적 유지**(바꾸면 로그인·상태 깨짐). `K-뷰티`는 첫 사내 고객 맥락 잔재. 철학 = **"회사별 커스터마이징"**(각 회사 업무에 AI가 진짜 작동하게).
- **배포**: 프로덕션 `main` = **세션28 워크플로우 에이전트·MCP 융합 + MCP 사용 흐름 명확화**(코드 `75d5944`) · Vercel 프로젝트 `complow-workflow-sass`(서울 icn1) · **롤백 후보**: `9af4751`(융합 전) · `4d6b215`(비용 예산) · `08e6d30`(MCP 토큰).
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
- **안정도**: `tsc` 0 · `pnpm lint` **30 errors/0 warnings**(전부 기존 `set-state-in-effect`·refs 부채, 신규 0이 베이스라인) · `any` 0 · 마이그 **001~085(88파일) 적용·drift 없음** · **`next build` 성공** → **Vercel 빌드가 실제 게이트**.
- **🆕 세션14 (✅ 라이브)**: 그룹채팅 알림(마이그 076)·카카오톡식 인앱 토스트(NotificationBell)·ChatList 그룹 미읽음 회귀수정 · `(app)/loading.tsx`(전환 스켈레톤) · pricing Opus $5/$25 정정 · **getUser 왕복 제거**(`CurrentUserProvider` — 서버 레이아웃 user.id를 client context로, 클라 ~27곳 마운트 왕복 제거).
- **🆕 현금흐름 → 손익(P&L) 계산기 `/finance` (✅ 라이브, 세션15~21, 마이그 078~085)**: 매출·비용·보유를 **드래그 캔버스**(박스 자유 배치 + **그룹 컨테이너**(이름·접기·소계, 박스 드래그로 묶기/빼기, flex 오토레이아웃) · **회사 가용현금 pool**(시작보유 인라인 편집)) ↔ **노션DB식 표**(`CashGrid`, 그룹 섹션·소계)가 같은 데이터(SSOT). **계산 칸을 회사가 직접 편집** — 표 헤더 라벨 인라인 + "칸 편집"으로 부가세 등 칸 추가·삭제 + **수식 스텝 빌더**(기존 AST를 스텝으로 분해해 바로 수정). "회사 기본 계산 유형"(`cash_calc_types` 1개)을 표의 **동적 컬럼**으로 승격 → 캔버스·엑셀 자동 반영(구분 강제 안 함=매출·비용 공용). **함수 살아있는 엑셀/CSV**(`exceljs` lazy, 셀=AST 실수식·입력칸 동적, 그룹 섹션·소계 SUMIF, 색·테두리·헤더고정). 구분 색 자동(매출 초록/비용 빨강/보유 파랑, 개별 변경 가능). **단일 AST 엔진**(`calcFormula`: `evalFormula`=앱 · `toExcelFormula`=엑셀)으로 앱=엑셀 일치. 신규 lib: `calcFormula`·`cashflowGraph`(buildSlotGraph 롤업)·`cashAccounts`(fieldsOf·SLOT_TYPES)·`xlsx`·`inline`. 마이그 078(슬롯)·079(amount)·080(카테고리·설정)·081(item_type)·082(calc_types·field_values)·083(note·pool_pos)·084(그룹 x/y/collapsed)·085(default_calc_type_id), RLS=035/080 패턴. **남은 것:** 급여(P2 대표전용)·예측/오픈뱅킹(P3). (알려진 한계: 시드 insert RLS 멀티테넌트 견고화·다통화 pool 표시 = `known-issues`.)
  - **🆕 현금흐름 AI 코칭 `/finance` (✅ 라이브, 세션23, 배포 `84b55ab`)**: 손익 헤더 **"AI 코칭"** 버튼 → 현재 스냅샷(슬롯 + 통화별 요약 + pool)을 Claude가 분석해 **건강도 배지·절감 제안·이상 신호** 구조화 카드로. **DDL 0·RLS 변경 0·읽기 전용**(기존 데이터 분석만). `generateObject` 원샷 + `cashCoachSchema`(zod), sonnet-4-6·온도 0.3, `agent_usage` 비용추적. 신규: `lib/cashCoach`(payload/prompt 순수)·`api/finance/cashflow-coach`·`components/finance/CashCoachPanel`(자체 완결·열면 1회 자동 분석). 프롬프트가 비용률·항목비중 사전계산 → 산술오류 방지, "근거 없으면 빈 배열" 강제로 환각 억제. **다음:** 추세(finance_entries 월별)·저장/히스토리·요금제 게이팅(무료=AI 불가).

> 최근 작업 상세(세션7·8: UI 리프레시·채팅 단계0~6·에이전트/위젯 재설계·캘린더·삭제RLS버그·B1격리·비용추적 등)는 **git 커밋 메시지**에 충실히 기록됨. 여기 중복 안 함.

---

## 🔴 다음 할 일 (우선순위)

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
- **Supabase**: project `dutovtfdckhayyvhtuxu` (ap-northeast-2 서울) · 마이그 **001~085(88파일)**.
- **.env.local**: ANTHROPIC · Supabase(URL·anon·service_role) · Google 4종 · `WORKSPACE_PASSWORD` 채워짐. ⚠️ **시크릿 값은 문서/채팅에 적지 말 것**(HANDOFF는 git 추적).
- **테스트 계정**: 조휘원(`c6817c63-943f-4257-8500-f9840ad39bde`)·이동규·김건 (워크스페이스 비번 로그인). 모델: 기본 `claude-sonnet-4-6` / 복잡 `claude-opus-4-7`.
- 링크: [GitHub](https://github.com/chowhiwon99-code/equria-workflow-Sass) · [Vercel](https://vercel.com/chowhiwon99-2151s-projects/equria-workflow-sass) · [Supabase](https://supabase.com/dashboard/project/dutovtfdckhayyvhtuxu) · 메모리 `~/.claude/projects/-Users-johwiwon-equria-workspace/memory/`
