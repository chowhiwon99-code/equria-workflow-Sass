# HANDOFF — 사내 AI 워크스페이스 (B2B 전환 중 · 제품 브랜드명 미정)

> **새 세션 읽기 순서:** 이 파일 → 아래 **📂 문서 지도** → `CLAUDE.md` → `.claude/skills/{safe-changes,latest-stack,known-issues}.md`
> 이 파일은 **"현재 상태 · 다음 할 일 · 합의된 정책"만** 담는다. 깊은 내용은 전용 문서(지도 참조), 과거 상세는 git 커밋 메시지에.
> 최종 업데이트: **2026-06-24 (세션 13 — 회의노트 **에디터 퀄리티 Part 1**(표 편집·선택 툴바·코드 하이라이트·이미지 정렬·/날짜) + 성능·버그픽스(서울 리전·채팅 첨부·메시지 즉시전송·사이드바 포커스·Drive 카드) 배포 `910b2a8`)**

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
| `STUDY.md` | (대표용) 비개발자 학습 코스 — 시스템 이해. 온보딩 필수는 아님 |

> 옛 설계 문서(`PLAN`·`CHAT-HUB`·`GOOGLE-MCP` 아키텍처)는 구현 완료/대체되어 `docs/archive/`로 이동. **현재 상태=이 파일, 구현 진실=코드/마이그레이션.**

---

## 🎯 지금 상태 (2026-06-22)

- **제품**: 사내 직원용 AI 워크스페이스 → **B2B 멀티테넌트(회사별 판매) SaaS로 전환 중**.
  - ⚠️ **브랜드명 미정.** 코드에 박힌 `EQURIA`·`이큐리아`·`K-뷰티`는 판매 제품명/도메인이 아니라 **첫 번째 사내 고객(우리 회사)의 맥락이 하드코딩된 흔적**. 철학 = **"회사별 커스터마이징"**(각 회사 업무에 AI가 진짜 작동하게).
- **배포**: 프로덕션 `main` = **`a9f19e6`** (세션13: 에디터 Part 1 + 표 노션강화·셀색·**회의 DB 뷰**) · https://equria-workflow-sass.vercel.app · **롤백 후보 `77aadd7`**(회의 DB 전) / `910b2a8`(표 강화 전). 이전 배포분은 git 커밋·아래 로드맵 ✅ 참조.
  - **🆕 세션13 회의노트 — 표 강화 + 회의 DB [`e603f85`~`a9f19e6`]**: 표 선 가시화·노션식 메뉴(행/열 전방위·헤더·병합)·**셀 배경색 8종·열 균등분할**. **🆕 회의 DB 뷰**(마이그 070 `meeting_categories`+회의 속성 category_id/importance/meeting_time + `set_meeting_meta` RPC): `/meetings`에 **표(DB) 토글** — 분류 색태그·중요도·일시 인라인 편집, 분류 관리(사용자 정의·색7), 정렬/필터. 기본 분류 5종 시드(All-Hands 등). 단일분류·고정중요도(0~4). `lib/meetingMeta`(프로젝트 재사용). **다음:** 파일 컬럼·프로젝트(중요도) 연동.
  - **🆕 세션13 회의노트 에디터 퀄리티 Part 1 [`651e503`+`910b2a8`]**: Tiptap 에디터의 "표면적" 블록편집을 실제 기능으로 — **표**(커서 표안 플로팅 컨트롤: 행/열 추가·삭제·헤더토글·병합/분할·삭제 + 열 리사이즈 그립 CSS), **선택 인라인 툴바**(BubbleMenu: 굵게·기울임·취소선·코드·형광펜·링크), **코드 하이라이트**(CodeBlockLowlight+lowlight 8개언어·언어드롭다운·복사), **이미지 정렬/alt**(BubbleMenu), `/날짜`. 신규 컴포넌트 `editor/EditorMenus.tsx`·`CodeBlockView.tsx`. **새 deps(전부 Tiptap v3 공식·소형): `@tiptap/extension-bubble-menu`·`@tiptap/extension-code-block-lowlight`·`lowlight`·`@tiptap/extension-highlight`·`highlight.js`(언어 8개만 등록).** 프론트만(DB 무변), 읽기전용 메뉴 숨김. 무거운 항목(토글·멘션·/AI인라인·이미지 드래그리사이즈)은 패스트팔로우.
  - **🆕 세션13 성능·버그픽스 [`9f503da`~]**: ④ 메시지 전송 즉시반영(컴포저 즉시 clear + send 낙관적 말풍선=클라생성 id로 에코 dedup, 실패 시 복원) ⑤ 사이드바 방향키 포커스 ring을 항목에 딱 맞게(ring-inset) ⑥ Files의 Google Drive 카드 한 줄 컴팩트화.
  - **🆕 세션12 성능·버그픽스 [`1745445`]**: ① **페이지 전환 느림** = Vercel 함수가 iad1(미국)인데 Supabase는 서울 → 매 요청 태평양 왕복(레이아웃 getUser+profiles+페이지쿼리). **`vercel.json` `regions:["icn1"]`(서울)**으로 co-locate → 왕복 ~10ms. ② **채팅 첨부 `about:blank`** = 파일 링크 `target=_blank`+`download`+크로스오리진 → 빈 탭. **target 제거 + Supabase 서명 `download` 옵션**(그 자리 다운로드). ③ **첨부 깜빡임/지연** = `loadAttachments` 매 realtime 이벤트마다 전체 재서명·교체 → **증분 서명**(캐시 재사용·병합, `attachmentsRef`). ※받은사람 열람불가설은 빗나감(스토리지 정책 024로 이미 해결돼 있었음).
  - **세션10(2026-06-22) 배포분 [`46070b5`]**: 멀티에이전트 전체 코드리뷰(12렌즈·확정 21건) 후 고가치 5건 수정 — ① 채팅 영속성(스트림 중단/에러에도 메시지·비용 유실 방지: 유저 메시지 **스트리밍 전 선저장** + `result.consumeStream()` + `onError` 실패 usage 기록) ② MCP 서버 수정/삭제 **워크스페이스 격리**(service_role→유저 스코프 클라이언트, RLS 0행→404) ③ 어시스턴트 비용 insert `void`→`await`(미전송 버그) ④ 대화생성 실패 500. **🆕 캘린더 팀수정**(마이그 062): `cal_update/cal_delete`를 작성자 본인→**워크스페이스 멤버 전체**로 확대(남이 만든 일정도 수정/삭제 가능, 테넌트 격리 유지) + 프론트 0행 무음실패→에러 노출. 롤백 후보 **`d6f6c55`**.
  - **세션9(2026-06-12~14) 배포분**: 전자결재 재상신/편집(060)·채번버그(061)·**드롭다운 선택 복구**(Select `onClick`=Base UI 메뉴 API — 라이브 블로커였음)·채팅 **작성중 인디케이터 + 메시지 시간**(`self-center` 정렬). 마이그 043~061 프로덕션 적용 완료(프론트=DB 일치). 롤백 후보 **`1a7dec2`**(채팅 시간정렬 전), 더 이전 `16daca9`.
  - ⚠️ **배포 팁**: `main`·`feat`를 같은 SHA로 동시 push하면 Vercel이 중복제거해 프로덕션 승격을 건너뛸 때가 있음 → **`main`을 먼저 push해 프로덕션 빌드 확인 후 `feat` push**.
  - 작업 흐름: `feat`에서 작업 → 브랜치 push마다 **프리뷰 자동배포**(라이브 무영향) → `main` push만 프로덕션 배포.
  - 🆕 **작업 하네스(세션12 `cacf4f4`)**: `/deploy`(이 시퀀스 자동)·`/verify`(tsc+lint 게이트) 명령 + `.claude/settings.json` 훅(**pre-push 게이트**=push 전 tsc 강제·lint 회귀차단 / **Stop 검증**=src 변경 턴 tsc 자동) + `work-harness` 스킬(작업 SOP·멀티에이전트 기준·진행상황 가시성). ⚠️ 훅은 `/hooks` 1회 열거나 재시작해야 활성.
- **라이브 기능**: 에이전트 허브(우하단 위젯)·에이전트 빌더(위저드)·워크플로우(n8n 캔버스+순차실행)·캘린더·프로젝트·재무·명함·파일·**메일(Gmail)**·**MCP**·구성원 디렉터리 + **직원 채팅**(상태표시·이모지반응·답장/스레드·리치텍스트·다중첨부·**드래그앤드롭/붙여넣기**·AI보조/맞춤법) · 전역 ⌘Z Undo/휴지통.
- **🔐 멀티테넌시 B1-a (읽기 격리) = 완료** (마이그 033~043, DB 라이브·검증). 회사 간 데이터 격리 활성 → 아래 §멀티테넌시.
- **💰 비용 추적 = 켜짐** (마이그 042): Claude 호출별 모델·달러비용 기록 + 마이페이지 "추정 비용".
- **🆕 사내 행정 일습(✅ 라이브)**:
  - **근태·결재 `/work`**(마이그 045): 근태(출퇴근)·지출결의서·휴가 통합. 본인/관리자 비공개 RLS, 관리자 승인/반려.
  - **회의 노트 `/meetings`**(마이그 046~049): 워크스페이스 **공유** 회의록. **노션식 Tiptap 블록 에디터** — `/` 슬래시 메뉴(텍스트·제목1~4·목록3종·인용·콜아웃·코드·구분선·표 + **이미지/파일(pdf·zip·xlsx·ppt 등 모든 형식) 인라인 업로드**, lucide 아이콘 통일), 빈줄 "'/'를 입력해 명령어 사용". 본문=HTML 저장, 읽기전용은 동일 확장 렌더(=sanitize). 상시 AI 보조(요약/액션아이템/정리, `/api/meeting-notes/assist`, 슬래시에서도). 인라인 미디어=공개 `meeting-media` 버킷(048, svg/html 차단·50MB 049). 적대 리뷰 2라운드(IDOR·저장형 XSS 등) 수정 완료. **🆕 세션13 에디터 퀄리티 Part 1**(표 편집 컨트롤·선택 인라인 툴바·코드 하이라이트·이미지 정렬) — 위 배포 참조.
  - **🆕 전자결재 `/approval`**(카카오워크식, 마이그 054~056): 양식→폼→**결재선(순차 N명, 결재/참조)**→상신→순차 승인/반려(의견)→**문서함**(결재할문서·기안함·참조함)→문서상세(**결재선 도장** 진행·회수·의견). RPC `submit/act/recall`(상신 후 변경 RPC 전용). **self-approval DB 3중 차단**·realtime·초안 프라이버시. 메뉴 `/work`를 **전자결재+근태**로 분리(구 지출/휴가 단일승인 패널 제거). Phase B 근태개편·C 연차/관리자는 로드맵.
  - **공지사항**(051): 대시보드 상단 칸, 전 직원 열람·**오너(workspaces.owner_id)만 작성**(`AnnouncementsBoard`).
  - **비용/매출 다중 화폐**(052): `finance_entries.currency`(KRW/USD/EUR/JPY/CNY/BTC), 통화별 합계 분리·OCR 통화 인식. `lib/finance`의 `money()`.
  - **사이드바 "직원 채팅" 미읽음 빨간 배지**(`useUnreadDms`) · 근태/지출 UI 개선(근무시간·상태요약).
  - 작은 수정(1·2단계): 채팅 알림 자동삭제·스크롤바 간격·파일 다중업로드·파일 공개범위(공개/부서/개인, 044).
  - **다음(5단계 예정)**: 노션식 새 페이지(블록 에디터 + `/`슬래시 + AI 상시) — 가장 큼·단독.
- **안정도**: `tsc` 0 · `pnpm lint` **30 errors/0 warnings**(전부 기존 `set-state-in-effect`·refs 부채, 신규 0이 베이스라인) · `any` 0 · 마이그 **001~070(73파일) 적용·drift 없음** · **`next build` 성공** → **Vercel 빌드가 실제 게이트**.

> 최근 작업 상세(세션7·8: UI 리프레시·채팅 단계0~6·에이전트/위젯 재설계·캘린더·삭제RLS버그·B1격리·비용추적 등)는 **git 커밋 메시지**에 충실히 기록됨. 여기 중복 안 함.

---

## 🔴 다음 할 일 (우선순위)

### 🆕 기능 로드맵 (세션10·2026-06-22 · 대표 승인 · 진행 중)
> 8영역 멀티에이전트 코드조사 기반. 순서 = 안전 win→추가형→큰작업→AI고도화. 매 단계 예상이슈+검증(tsc/빌드/RLS시뮬) 후 보고·배포.
- **1차 ✅ 완료·배포**: ⑦위젯 둥둥모션 · ②직급부여(대표만) · ④명함 그룹화(등록자/날짜/회사)
- **2차 ✅ 완료·배포**: ⑤근태 대표열람+위임(마이그 064) · ⑥회의노트 폴더(마이그 065) + **노트 드래그&드롭**
- **🆕 파일 폴더(④ 연장) ✅ 완료**: 마이그 066 `file_folders` + 폴더 사이드바·드래그&드롭(소유자·대표·관리자 이동). 공용 `FolderSidebarItem` 추출.
- **🆕 macOS Finder식 폴더 UX(세션11 ✅ 배포·프론트만)**: 사이드바→**공용 `FolderGrid`**(중립 폴더 아이콘·더블클릭 진입·breadcrumb·다중선택+묶음드래그+**플로팅 이동바**·정렬·날짜그룹·**폴더 안=항상 아이콘**·조건부 컨트롤). 파일은 **종류 아이콘 통일**(썸네일 시도→되돌림). 회의노트 통일, 명함 "직원별" 라벨. 구 `FolderSidebarItem` 삭제.
- **🆕 파일 미리보기 버그픽스(세션11)**: files 버킷이 "본인 폴더만 읽기"(015)라 공개 공유된 남의 파일은 클라가 서명 불가 → 서버 BFF **`/api/files/signed-url`**(유저 RLS 인가→admin 서명). 본인·공유 파일 모두 미리보기/호버 동작. **`pdfjs-dist` 제거**.
- **🆕 근태 개편(세션11)**: 혼합 리스트→**인원별 마스터/디테일**(이름검색+오늘상태) · **월별 보기**(공용 `MonthStepper` ◀▶, 개인·팀) · 24시간제·"0분" 숨김·"내 근태/나" 표시.
- **🆕 직급(position) 전 화면 표시(세션11)**: 채팅·전자결재(결재선)·회의노트 작성자·공지·명함 등록자·프로젝트·지출/휴가·마이페이지·근태에 직급 노출(있을 때만). **설정에 대표 전용 "구성원 직급" 일괄관리** 추가(set_member_position RPC 재사용).
- **3차**: ③재무 UI 재구성 ✅ **완료·배포(2026-06-24 `e1789f3`)** — 962줄 단일 FinanceView → **탭(요약/내역/세금계산서) + 월 기간필터(MonthStepper) + 경량 차트(npm 0, CSS/SVG)**. 신규 `usePeriodFilter`·`financeAgg`(순수 집계, 통화분리 내장)·`financeCharts`(TrendBadge 증감%·TrendBars·BreakdownBars)·모달 2종 분리. **통화합산 금지·RLS·soft-delete·useUndo 유지**. **설계 판정단→적대검증(4/4 pass) 워크플로우**로 진행. **🆕 원화 환산 합계**(마이그 069 `fx_rates` + `/api/finance/fx-rates` BFF, ECB/Frankfurter 일별·무키, 방식A=오늘환율·BTC 제외): 통화 분리는 유지하고 환산 합계만 별도(기준환율·날짜 명시). · ①그룹채팅 ⬜ **남음**(**단일 공유방** 권장 · 코어 RLS 수술 · 가장 신중)
- **4차**: ⑥회의노트 — **에디터 퀄리티 Part 1 + 표 노션강화 + 회의 DB 뷰(메타데이터: 분류·중요도·일시, 마이그 070) ✅ 완료·배포(세션13 `a9f19e6`)**. **AI 리서치 flow = 설계 확정·미착수(`/리서치` 5단계: 검색→신뢰도1·2차필터→이미지선택→초안→검증)** — `generateObject`+Zod·워크플로우 체이닝(`workflows/run`)·`meeting-media`·`agent_usage` 재사용. **착수 조건 = 아래 검색백엔드/요금 결정.** 에디터 패스트팔로우(가벼움): 토글(접기)·멘션(@직원)·이미지 드래그리사이즈·`/AI` 인라인.
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
- **Supabase**: project `dutovtfdckhayyvhtuxu` (ap-northeast-2 서울) · 마이그 **001~068(71파일)**.
- **.env.local**: ANTHROPIC · Supabase(URL·anon·service_role) · Google 4종 · `WORKSPACE_PASSWORD` 채워짐. ⚠️ **시크릿 값은 문서/채팅에 적지 말 것**(HANDOFF는 git 추적).
- **테스트 계정**: 조휘원(`c6817c63-943f-4257-8500-f9840ad39bde`)·이동규·김건 (워크스페이스 비번 로그인). 모델: 기본 `claude-sonnet-4-6` / 복잡 `claude-opus-4-7`.
- 링크: [GitHub](https://github.com/chowhiwon99-code/equria-workflow-Sass) · [Vercel](https://vercel.com/chowhiwon99-2151s-projects/equria-workflow-sass) · [Supabase](https://supabase.com/dashboard/project/dutovtfdckhayyvhtuxu) · 메모리 `~/.claude/projects/-Users-johwiwon-equria-workspace/memory/`
