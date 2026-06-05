# HANDOFF — EQURIA Workspace

> 다음 세션 읽기 순서: **이 파일 → `CLAUDE.md` → `.claude/skills/{safe-changes,latest-stack,known-issues}.md`**
> 이 파일은 **"현재 상태 · 다음 할 일 · 합의된 정책"만** 담는다.
> 중복 금지 — 파일구조는 `CLAUDE.md §5`, 기술부채는 `known-issues.md`, 작업규칙은 `safe-changes.md`, 과거 상세는 git 커밋 메시지에.
> 최종 업데이트: 2026-06-05 (세션 7)

---

## 🎯 지금 상태

- **배포(main)**: `https://equria-workflow-sass.vercel.app` — main 최신 `3c171ba` READY. main push → Vercel 자동배포.
- **라이브 기능(배포됨)**: 에이전트 허브(우하단 위젯)·에이전트 빌더·워크플로우(n8n 캔버스+순차 실행)·캘린더·프로젝트·재무·명함·파일·**메일(Gmail)**·**MCP**·**구성원 디렉터리** + **직원 채팅 허브(단계0~5)**.
  - 채팅 단계0~5: 사용자 상태표시(온·오프+수동) · 이모지 반응 · 답장/스레드 · **리치 텍스트(Tiptap 서식·맞춤법 밑줄)** · **다중 첨부**.
- **🔧 작업 브랜치 `feat/toss-ui-refresh`(세션7 · GitHub 푸시됨 · main 미머지=미배포)** — main 대비 10커밋:
  - **채팅 단계6(완료)**: AI 보조(다듬기·번역·요약) + **한국어 맞춤법 검사**(`ComposerAiAssist`·`/api/chat/assist`).
  - **토스/애플 UI 리프레시**: Pretendard 전역 · 라운드↑(`--radius:1rem`) · 부드러운 그림자 · 파스텔 기능색 · 이모지→lucide. 토큰 SSOT=`globals.css`(`[data-slot]` 오버라이드, `components/ui/` 무수정).
  - **에이전트 재설계**: 그리드 카드→상세(skill.md/시스템프롬프트)·`/agents/[id]/edit` 분리 · 아이폰식 위저드(슬라이드) · 벌집 아이콘피커(물방울 fisheye).
  - **위젯 재설계**: FAB 탭→에이전트들이 **둥근 호**로 펼쳐짐 · 발신 에이전트 표시(unread 배지) · 큰 라운드 패널 · 추가/제거/수정은 **/agents**에서(위젯 내 +/- 제거).
  - **캘린더**: 종일(날짜만·시간 입력 제거) · 색상 12종 · **일정 편집** · **파일 첨부**(마이그 026 · `calendar-files` 버킷).
- **안정도(브랜치)**: `tsc` 0 · `pnpm lint` 30(전부 기존 `set-state-in-effect`·`refs` 부채, **0 warnings·신규 범주 없음**) · git clean · `any` 0 · 마이그 **원격29↔디스크29 drift 없음**.
  - ⚠️ 로컬 `next build` 미검증(환경상 Google Fonts 네트워크 타임아웃) → `tsc`+`lint`+dev로 대체. 머지 시 Vercel 빌드가 진짜 게이트.
  - ⚠️ **DB > 배포코드**: 마이그 `025`(에이전트 lucide 아이콘)·`026`(캘린더 첨부)은 **원격(프로덕션)에 이미 적용**됐고 사용 코드는 브랜치(미배포). 둘 다 **순수 additive**라 배포된 main 앱은 신규 컬럼/버킷을 무시(안전). main 머지 시 코드·DB 정합.
- 전역 ⌘Z Undo · 휴지통(soft-delete).

---

## 🔴 다음 세션 우선순위

1. **`feat/toss-ui-refresh` UI 수정 잔여 계속 → 완료 후 main 머지·배포**(머지 = Vercel 자동배포 + 코드/DB 정합). 사용자 의도 = "수정할 것 많다" → 브랜치에 계속 쌓고 한 번에 머지. **머지 전 `next build` Vercel에서 통과 확인**(로컬 폰트 이슈로 미검증분).
2. **(사용자 작업) Gmail 프로덕션 연동** — Vercel 환경변수 5개 추가 후 재배포. 안 하면 메일 연결 시 `GOOGLE_OAUTH_NOT_CONFIGURED`(로컬은 정상):
   - `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `GOOGLE_TOKEN_ENC_KEY` ← 로컬 `.env.local`에서 복사
   - `GOOGLE_OAUTH_REDIRECT_URI=https://equria-workflow-sass.vercel.app/api/google/callback` (⚠️ localhost 아님)
   - `NEXT_PUBLIC_APP_URL=https://equria-workflow-sass.vercel.app`
   - Google Cloud Console OAuth 클라이언트의 승인 리디렉션 URI에 위 prod 콜백 포함 확인.
3. **브라우저 E2E**(로그인 필요): 캘린더 종일/편집/파일첨부 · 위젯 호 펼침·관리(/agents) 링크 · 에이전트 상세/위저드/아이콘피커 · 채팅 단계6 AI보조·맞춤법 · 리치에디터 서식 · 다중첨부 양쪽 로드 · 다크모드 전환 · 워크플로우 실제 실행.
4. **(사용자 작업) service_role 키 rotation** — 레거시 키 노출분. 새 키 → `.env.local`+Vercel → redeploy → 레거시 disable. (시크릿 채팅 금지)
5. **채팅 단계7 — 초대·권한**(owner 1 + admin 다수 + invites).

> 비차단 기술부채·보류분 전체는 `known-issues.md` (I1b lint · I2 워크플로 60s · I9 advisor · I11 감사보류 · I12 단계5보류 등).

---

## 🚀 환경 / 접근

- **GitHub** `chowhiwon99-code/equria-workflow-Sass` (main 단일 + 작업브랜치 `feat/toss-ui-refresh` 푸시됨).
- **Vercel** team `team_wcW0NMU7oiIxNndyV1afigbp` · project `prj_CcCTUr8eIYpaStaj6RNq7VoLPZG6` · 배포보호 off(앱이 자체 인증).
- **Supabase** project `dutovtfdckhayyvhtuxu` (ap-northeast-2 서울) · 마이그 001~026 적용(**원격29↔디스크29 drift 없음**). DDL은 MCP `apply_migration`(`project_id` 필수) **+** `supabase/migrations/` 파일 둘 다(SSOT).
- **.env.local**: ANTHROPIC · Supabase(URL·anon·service_role) · Google 4종 · `WORKSPACE_PASSWORD` 채워짐. ⚠️ **시크릿 값은 이 문서/채팅에 적지 말 것**(HANDOFF는 git 추적됨).
- **테스트 계정**: 조휘원 · 이동규 · 김건 (워크스페이스 비번으로 로그인).
- 모델: 기본 `claude-sonnet-4-6` / 복잡 `claude-opus-4-7`.

---

## 💡 합의된 정책 (코드만으론 안 보이는 결정 — 깨지 말 것)

- **삭제 = soft-delete(휴지통)**: 목록 `deleted_at is null` 필터, Storage 파일 보존. ⌘Z Undo는 데이터 기능 전반(무음, 실패 시만 토스트).
- **에이전트 = 우하단 위젯 only**(/agents는 빌더/관리). 내 핀 기준(0개=빈 위젯+CTA). 비공개 기본 + 공유 토글.
- **워크플로우 = n8n 캔버스**(원형 노드·끈). 비공개 기본 + `is_public`. 수정은 소유자만, 공유받은이는 보기/실행. 끈 위상정렬 순서로 실행(노드≤6 · 60s 가드).
- **채팅 SSOT**: `content`(plain)가 모든 텍스트 소비자의 단일 진실(미리보기·알림·답장·검색). 리치는 `body_json`(버블에서만 렌더). Tiptap은 `RichComposer`/`MessageBody`/`AttachmentList`로 격리 — **확장 추가 시 `MessageBody` 렌더러 케이스도 함께 추가**(`lib/tiptap.ts` 주석 규약). 레거시 단일첨부 경로 보존.
- **연락처 공개 = `directory_contact` RPC로만**: 이메일/전화 컬럼은 RLS 컬럼권한으로 직접 select 차단(마이그 023b·024). 본인/관리자만 전체.
- 세금계산서 = 작성·정리만(발행 X). 브랜드 표기 **EQURIA / 이큐리아**.
- **캘린더(브랜치 세션7)** = 네이티브 Date 자체구현 · **종일 전용**(날짜만, 시간 입력 없음) · 첨부는 jsonb 메타(`calendar_events.attachments`)+`calendar-files` 버킷(읽기=인증 전체·쓰기=본인 폴더, 워크스페이스 공유 정책과 일치). 상세 모달은 공용 Modal 미사용·자체 `ModalShell`(known-issues I11①).

---

## 📝 참고

- GitHub https://github.com/chowhiwon99-code/equria-workflow-Sass
- Vercel https://vercel.com/chowhiwon99-2151s-projects/equria-workflow-sass
- Supabase https://supabase.com/dashboard/project/dutovtfdckhayyvhtuxu
- 메모리: `~/.claude/projects/-Users-johwiwon-equria-workspace/memory/`
</content>
