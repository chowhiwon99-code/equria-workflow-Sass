# HANDOFF — EQURIA Workspace

> 다음 세션 읽기 순서: **이 파일 → `CLAUDE.md` → `.claude/skills/{safe-changes,latest-stack,known-issues}.md`**
> 이 파일은 **"현재 상태 · 다음 할 일 · 합의된 정책"만** 담는다.
> 중복 금지 — 파일구조는 `CLAUDE.md §5`, 기술부채는 `known-issues.md`, 작업규칙은 `safe-changes.md`, 과거 상세는 git 커밋 메시지에.
> 최종 업데이트: 2026-06-08 (세션 8)

---

## 🎯 지금 상태

- **배포(main)**: `https://equria-workflow-sass.vercel.app` — main 최신 `ce88294` READY (**세션8 작업 28커밋 전체 배포 완료**, 2026-06-08, `feat/toss-ui-refresh`→main FF 머지). main push → Vercel 자동배포 · 직전 `b671ea2`는 1클릭 롤백 후보.
  - Vercel은 GitHub 연결됨 → **브랜치 push마다 프리뷰 자동배포**(`...-git-feat-...vercel.app`, 라이브 무영향). main push만 프로덕션 배포.
- **라이브 기능(배포됨)**: 에이전트 허브(우하단 위젯)·에이전트 빌더·워크플로우(n8n 캔버스+순차 실행)·캘린더·프로젝트·재무·명함·파일·**메일(Gmail)**·**MCP**·**구성원 디렉터리** + **직원 채팅 허브(단계0~5)**.
  - 채팅 단계0~5: 사용자 상태표시(온·오프+수동) · 이모지 반응 · 답장/스레드 · **리치 텍스트(Tiptap 서식·맞춤법 밑줄)** · **다중 첨부**.
- **🔧 세션7 작업(배포됨 · `feat/toss-ui-refresh` → main FF 머지·배포 `b671ea2`. 이후 수정도 feat에서 → 머지 흐름)** — 주요 변경:
  - **채팅 단계6(완료)**: AI 보조(다듬기·번역·요약) + **한국어 맞춤법 검사**(`ComposerAiAssist`·`/api/chat/assist`).
  - **토스/애플 UI 리프레시**: Pretendard 전역 · 라운드↑(`--radius:1rem`) · 부드러운 그림자 · 파스텔 기능색 · 이모지→lucide. 토큰 SSOT=`globals.css`(`[data-slot]` 오버라이드, `components/ui/` 무수정).
  - **에이전트 재설계**: 그리드 카드→상세(skill.md/시스템프롬프트)·`/agents/[id]/edit` 분리 · 아이폰식 위저드(슬라이드) · 벌집 아이콘피커(물방울 fisheye).
  - **위젯 재설계**: FAB 탭→에이전트들이 **둥근 호**로 펼쳐짐 · 발신 에이전트 표시(unread 배지) · 큰 라운드 패널 · 추가/제거/수정은 **/agents**에서(위젯 내 +/- 제거).
  - **캘린더**: 종일(날짜만·시간 입력 제거) · 색상 12종 · **일정 편집** · **파일 첨부**(마이그 026 · `calendar-files` 버킷).
  - **채팅 송수신 개선**: 첨부 Realtime publication 추가(마이그 027 — 누락 버그 수정) · **낙관적 송신**(insert 직후 즉시 표시) · 반응/답장을 버블 옆 인라인·반응칩 조건부·간격 압축(`gap-1`).
  - **채팅 입력창**: 애플식 심플(서식 툴바 숨김→`Aa` 토글·둥근 pill) + **번역 후 전송 안 됨 수정**(Tiptap v3 stale `editor.isEmpty` → onCreate/onUpdate state 동기화).
  - **재무**: 세금계산서 초안 **수정·삭제**(`TaxInvoiceModal` + 마이그 028 DELETE 정책 · Undo).
  - **위젯 morph**: 채팅 열기/닫기 CSS-FLIP(`equria-morph-in/out` · 버블↔패널, 닫힘 역재생 · morph 중 드래그·확대 잠금) · FAB 메뉴 닫힘도 역스태거(`equria-pop-out`).
  - **입력창 정렬 수정**: 메인 행 `items-center`+에디터 min-h 제거(텍스트·아이콘 어긋남 해소).
  - **알림(마이그 029)**: 제목에 보낸사람 이름(`{이름}님의 새 메시지`, 기존 73건 백필) · 클릭 즉시 이동(제어형 드롭다운+await 제거).
  - **멀티테넌시 A단계(마이그 030)**: ↓ 아래 별도 섹션 참조.
- **안정도(배포본 `ce88294`)**: `tsc` 0 · `pnpm lint` 30(전부 기존 `set-state-in-effect`·`refs` 부채, **0 warnings·신규 범주 없음**) · git clean · `any` 0 · 마이그 **원격35↔디스크35 drift 없음** · **Vercel 프로덕션 빌드 READY**(로컬 `next build`는 환경상 Google Fonts 타임아웃이라 미실행 → Vercel 빌드가 실제 게이트, 이번 통과 확인).
  - **DB·코드**: 세션7~8 코드 전부 배포됨(`ce88294`). 마이그 029·030(세션7)·031·032(세션8) 모두 prod 적용·코드 정합. **전부 additive·안전**.
- **🆕 세션8 작업(배포됨 · main FF `ce88294`, 2026-06-08)** — `feat/toss-ui-refresh`에서 작업 후 main FF 머지:
  - **사이드바 편집 모션 고급화**: `+/−` 즉시숨김 → grid-rows(0fr↔1fr) 접힘 + iOS 스위치 토글(CSS 전용·새 의존성 0). `Sidebar.tsx`.
  - **채팅 파일 드래그&드롭 + 붙여넣기**(모든 형식·파일당 50MB 캡, `chat-files` 버킷 MIME/용량 무제한이라 마이그 불필요). 드롭 후 컴포저 자동 포커스 → **Enter 즉시 전송**. `DirectChat`/`RichComposer`(Tiptap `handlePaste`, 폴더 드롭 미지원 v1).
  - **채팅 스크롤**: 새로고침 시 하단 고정(첫 로드 즉시 `auto`+`ResizeObserver` 재핀 — 이미지 지연로드로 중앙에 머물던 문제 차단) · 위로 읽다 우하단 **'맨 아래로' 버튼**(atBottom 80px 임계).
  - **프로젝트 상세 리디자인**(토스/애플): 메타/요약/멤버/파일 **카드화** · 네이티브 select→커스텀 `Select` · 아바타 칩 · 멤버 추가 선택 즉시. `ProjectDetail.tsx`.
  - **🔴 삭제 RLS 버그 수정(마이그 031·032)**: 워크플로우·에이전트 **소프트삭제(is_active=false)가 소유자도 불가**했던 문제. 원인=`wf_select`/`agents_select` USING이 `is_active=true`만 허용 → 삭제 시 결과 행이 SELECT 가시성을 잃어 PostgreSQL이 42501 "new row violates RLS"로 거부. 해결=소유자는 자기 것 **활성/비활성 무관 조회** 허용(목록·에디터·실행은 이미 is_active 필터). **DB 정책만, 앱/타입 무변경** · 롤백 트랜잭션으로 삭제·복원 검증.
- 전역 ⌘Z Undo · 휴지통(soft-delete).

---

## 🔴 다음 세션 우선순위

1. **세션8 작업 배포 완료(`ce88294`) → 직원 피드백 수집 단계**. 추가 수정은 `feat/toss-ui-refresh`(현재 main과 동일)에서 작업 → 프리뷰 자동확인 → main 머지(재배포). 심각 버그 시 Vercel 1클릭 롤백(직전 `b671ea2`). 사용자 의도 = "써보게 하고 피드백 받아 또 수정". 워크플로우·에이전트 삭제는 마이그 031·032로 수정 완료(라이브).
2. **(사용자 작업) Gmail 프로덕션 연동** — Vercel 환경변수 5개 추가 후 재배포. 안 하면 메일 연결 시 `GOOGLE_OAUTH_NOT_CONFIGURED`(로컬은 정상):
   - `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `GOOGLE_TOKEN_ENC_KEY` ← 로컬 `.env.local`에서 복사
   - `GOOGLE_OAUTH_REDIRECT_URI=https://equria-workflow-sass.vercel.app/api/google/callback` (⚠️ localhost 아님)
   - `NEXT_PUBLIC_APP_URL=https://equria-workflow-sass.vercel.app`
   - Google Cloud Console OAuth 클라이언트의 승인 리디렉션 URI에 위 prod 콜백 포함 확인.
3. **브라우저 E2E**(로그인 필요): 캘린더 종일/편집/파일첨부 · 위젯 호 펼침·관리(/agents) 링크 · 에이전트 상세/위저드/아이콘피커 · 채팅 단계6 AI보조·맞춤법 · 리치에디터 서식 · 다중첨부 양쪽 로드 · 다크모드 전환 · 워크플로우 실제 실행. **세션8 추가분**: 채팅 파일 드래그&드롭·붙여넣기·드롭후 Enter전송 · 채팅 새로고침 하단고정·맨아래로 버튼 · 워크플로우/커스텀에이전트 삭제 · 프로젝트 상세 카드 UI · 사이드바 편집 모션.
4. **(사용자 작업) service_role 키 rotation** — 레거시 키 노출분. 새 키 → `.env.local`+Vercel → redeploy → 레거시 disable. (시크릿 채팅 금지)
5. **채팅 단계7 — 초대·권한**(owner 1 + admin 다수 + invites).

> 비차단 기술부채·보류분 전체는 `known-issues.md` (I1b lint · I2 워크플로 60s · I9 advisor · I11 감사보류 · I12 단계5보류 등).

---

## 🚀 환경 / 접근

- **GitHub** `chowhiwon99-code/equria-workflow-Sass` (main 단일 + 작업브랜치 `feat/toss-ui-refresh` — 현재 main과 동일 `ce88294`, 다음 작업도 여기서).
- **Vercel** team `team_wcW0NMU7oiIxNndyV1afigbp` · project `prj_CcCTUr8eIYpaStaj6RNq7VoLPZG6` · 배포보호 off(앱이 자체 인증).
- **Supabase** project `dutovtfdckhayyvhtuxu` (ap-northeast-2 서울) · 마이그 001~032 적용(**원격35↔디스크35 drift 없음**). DDL은 MCP `apply_migration`(`project_id` 필수) **+** `supabase/migrations/` 파일 둘 다(SSOT).
- **.env.local**: ANTHROPIC · Supabase(URL·anon·service_role) · Google 4종 · `WORKSPACE_PASSWORD` 채워짐. ⚠️ **시크릿 값은 이 문서/채팅에 적지 말 것**(HANDOFF는 git 추적됨).
- **테스트 계정**: 조휘원 · 이동규 · 김건 (워크스페이스 비번으로 로그인).
- 모델: 기본 `claude-sonnet-4-6` / 복잡 `claude-opus-4-7`.

---

## 💡 합의된 정책 (코드만으론 안 보이는 결정 — 깨지 말 것)

- **삭제 = soft-delete(휴지통)**: 목록 `deleted_at is null` 필터, Storage 파일 보존. ⌘Z Undo는 데이터 기능 전반(무음, 실패 시만 토스트).
  - **⚠️ is_active 소프트삭제 테이블의 SELECT 정책에 `is_active=true`를 USING 조건으로 넣지 말 것**(마이그 031·032 교훈): 삭제(is_active=false) 시 결과 행이 SELECT 가시성을 잃어 PostgREST/Postgres가 UPDATE를 42501로 막는다. 대신 **소유자는 자기 행을 활성/비활성 무관 조회**하게 두고, 목록·상세 쿼리에서 `is_active=true`를 앱 레벨로 필터(workflows·agents가 이 패턴).
- **에이전트 = 우하단 위젯 only**(/agents는 빌더/관리). 내 핀 기준(0개=빈 위젯+CTA). 비공개 기본 + 공유 토글.
- **워크플로우 = n8n 캔버스**(원형 노드·끈). 비공개 기본 + `is_public`. 수정은 소유자만, 공유받은이는 보기/실행. 끈 위상정렬 순서로 실행(노드≤6 · 60s 가드).
- **채팅 SSOT**: `content`(plain)가 모든 텍스트 소비자의 단일 진실(미리보기·알림·답장·검색). 리치는 `body_json`(버블에서만 렌더). Tiptap은 `RichComposer`/`MessageBody`/`AttachmentList`로 격리 — **확장 추가 시 `MessageBody` 렌더러 케이스도 함께 추가**(`lib/tiptap.ts` 주석 규약). 레거시 단일첨부 경로 보존.
- **연락처 공개 = `directory_contact` RPC로만**: 이메일/전화 컬럼은 RLS 컬럼권한으로 직접 select 차단(마이그 023b·024). 본인/관리자만 전체.
- 세금계산서 = 작성·정리만(발행 X). 브랜드 표기 **EQURIA / 이큐리아**.
- **캘린더(브랜치 세션7)** = 네이티브 Date 자체구현 · **종일 전용**(날짜만, 시간 입력 없음) · 첨부는 jsonb 메타(`calendar_events.attachments`)+`calendar-files` 버킷(읽기=인증 전체·쓰기=본인 폴더, 워크스페이스 공유 정책과 일치). 상세 모달은 공용 Modal 미사용·자체 `ModalShell`(known-issues I11①).

---

## 🏢 멀티테넌시 (슬랙형 — 회사별 워크스페이스 격리, B2B 판매 대비)

> 목표: 회사별 데이터 완전 격리. **A단계(구조)=완료**, **B단계(격리 활성화)=차후**. 캐주얼하게 깨면 회사 간 데이터 누출 = 치명적이니 B단계는 반드시 검증하며.
> 📋 **전체 제품화 감사·리스크·B1~B6 로드맵·의사결정은 `PRODUCTIZATION.md`** / **B1 상세 설계는 `B1-DESIGN.md`**(2026-06-09, 설계→레드팀→종합).
> **확정 결정(대표)**: 격리=단일프로젝트+RLS · 과금=시트 고정요금(+비용추적 병행) · 인증=Supabase Auth+매직링크(SSO는 나중 WorkOS) · 시장=영업주도+수동 셋업.
> **B1-a 읽기 격리 = 완료(마이그 033~041 적용·검증, 2026-06-09)**: 헬퍼 3종(033) + 24개 테이블 RLS를 `workspace_id in (auth_user_workspace_ids())`로 재작성(034 profiles 동료한정·035 완전개방7·036 agents/workflows·037 사용자별·038 채팅·039 MCP·040 함수/RPC/트리거·041 search_path 하드닝). **검증(롤백 트랜잭션): 멤버는 회귀 0, 비멤버는 전 테이블 0 + 연락처 PII 0.** 앱 코드 변경 없음(멤버십 함수 기반). MCP=회사별 격리 확정.
> **남은 것**: ① **B1-b(쓰기 강제)** = WorkspaceProvider 앱 컨텍스트 + 전 INSERT에 workspace_id 배선 + presence 채널 동적화 + service_role 라우트 가드 + sentinel 백필 + DEFAULT 제거 — **2번째 회사 온보딩 임박 시** 별도 승인 게이트(앱-DB 동기 필요). ② 어드바이저 WARN 잔여: SECURITY DEFINER 헬퍼의 anon/authenticated 실행가능(RLS에 필요·호출자 본인정보만 반환 → 무해, 수용) + Auth leaked-password protection(대시보드 토글, 켜기 권장).
> ⚠️ **B1 완료 전 두 번째 회사 온보딩 동결**(현 RLS는 워크스페이스 무관 → 받으면 즉시 데이터 유출).

- **A단계(완료 · 마이그 030 · 비파괴)**: `workspaces`·`workspace_members`(슬랙형 다대다) 신설 + 데이터 **24개 테이블에 `workspace_id`**(NOT NULL DEFAULT=equria, FK on delete cascade)+인덱스. 기존 전원/데이터는 기본 워크스페이스 **`equria`**(고정 sentinel UUID **`00000000-0000-0000-0000-0000000000e1`**) 귀속. 컬럼 DEFAULT 덕에 현재 RLS·앱 무변경.
  - 제외 테이블: `profiles`(=계정 자체, 전역) · `google_connections`(개인 연동). 신규 workspace엔 8개 프리셋 에이전트가 없음(현재 전부 equria 소속) → B단계 고려.
- **B단계(차후 · 신중·검증 필수)**:
  1. **RLS 격리**: 24개 테이블 정책을 `workspace_id in (select workspace_id from workspace_members where user_id=auth.uid())`로 전환(진짜 격리). 라이브 25개 정책 일괄 변경이라 Supabase 브랜치/프리뷰에서 누출 0 검증 후 적용.
  2. **앱 배선**: "현재 워크스페이스" 컨텍스트(세션/URL) → 모든 쿼리 필터 + insert 시 `workspace_id` 세팅(현재는 DEFAULT 의존).
  3. **워크스페이스 생성/초대/전환 UI** + 회사별 가입 흐름(현 `WORKSPACE_PASSWORD` 단일 공용 → 워크스페이스별 초대로 교체, 채팅 단계7과 합류).
  4. 프리셋 에이전트·MCP 등 "공용 자원"을 전역 vs 워크스페이스별로 결정.
- 향후 포장: **Electron 데스크톱 앱 + 모바일 웹앱**으로 판매 예정(현 Next.js 구조 그대로 래핑 가능).

---

## 📝 참고

- GitHub https://github.com/chowhiwon99-code/equria-workflow-Sass
- Vercel https://vercel.com/chowhiwon99-2151s-projects/equria-workflow-sass
- Supabase https://supabase.com/dashboard/project/dutovtfdckhayyvhtuxu
- 메모리: `~/.claude/projects/-Users-johwiwon-equria-workspace/memory/`
</content>
