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
