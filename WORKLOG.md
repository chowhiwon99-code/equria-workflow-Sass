# WORKLOG — 작업 로그 (최신이 위)

> 매 작업마다 **무엇을·왜·쪼갠 내용·예상이슈 체크**를 기록한다(대표 리뷰용). 현재 상태/정책은 `HANDOFF.md`.
> 작업 방식(합의): ① 단계별로 잘게 진행(한 번에 큰 배치 금지, 코드 안 꼬이게) ② 매 작업 후 예상이슈 점검 ③ 쪼개서 설명 ④ 이 파일 갱신 ⑤ 기존 디자인 유지 · 사용자 편의 최우선.

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
