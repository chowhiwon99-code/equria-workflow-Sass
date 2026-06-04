# HANDOFF — EQURIA Workspace

> 다음 세션 읽기 순서: **이 파일 → `CLAUDE.md` → `.claude/skills/{safe-changes,latest-stack,known-issues}.md`**
> 이 파일은 **"현재 상태 · 다음 할 일 · 합의된 정책"만** 담는다.
> 중복 금지 — 파일구조는 `CLAUDE.md §5`, 기술부채는 `known-issues.md`, 작업규칙은 `safe-changes.md`, 과거 상세는 git 커밋 메시지에.
> 최종 업데이트: 2026-06-04 (세션 6)

---

## 🎯 지금 상태

- **운영**: `https://equria-workflow-sass.vercel.app` — 최신 커밋 `7bb1569` 배포 READY. main push → Vercel 자동배포.
- **라이브 기능**: 에이전트 허브(우하단 위젯)·에이전트 빌더·워크플로우(n8n 캔버스+순차 실행)·캘린더·프로젝트·재무·명함·파일·**메일(Gmail)**·**MCP**·**구성원 디렉터리** + **직원 채팅 허브(단계0~5)**.
  - 채팅 단계0~5: 사용자 상태표시(온·오프+수동) · 이모지 반응 · 답장/스레드 · **리치 텍스트(Tiptap 서식·맞춤법 밑줄)** · **다중 첨부**.
- **안정도(세션6 마감)**: `tsc` 0 · `next build` 0(34/34) · git clean · `any` 0 · lint 30(전부 기존 `set-state-in-effect`·`refs` 부채, **0 warnings·신규 범주 없음**) · 마이그 원격27↔디스크27 **drift 없음** · advisor 신규 이슈 0.
- 전역 ⌘Z Undo · 휴지통(soft-delete).

---

## 🔴 다음 세션 우선순위

1. **(사용자 작업) Gmail 프로덕션 연동** — Vercel 환경변수 5개 추가 후 재배포. 안 하면 메일 연결 시 `GOOGLE_OAUTH_NOT_CONFIGURED`(로컬은 정상):
   - `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `GOOGLE_TOKEN_ENC_KEY` ← 로컬 `.env.local`에서 복사
   - `GOOGLE_OAUTH_REDIRECT_URI=https://equria-workflow-sass.vercel.app/api/google/callback` (⚠️ localhost 아님)
   - `NEXT_PUBLIC_APP_URL=https://equria-workflow-sass.vercel.app`
   - Google Cloud Console OAuth 클라이언트의 승인 리디렉션 URI에 위 prod 콜백 포함 확인.
2. **채팅 단계6 — AI 보조**(다듬기·번역·요약) / **단계7 — 초대·권한**(owner 1 + admin 다수 + invites).
3. **브라우저 E2E**(로그인 필요): 리치에디터 서식 · 다중첨부 양쪽 로드 · 구성원 연락처 공개여부 · 워크플로우 실제 실행 · 다크모드 전환.
4. **(사용자 작업) service_role 키 rotation** — 레거시 키 노출분. 새 키 → `.env.local`+Vercel → redeploy → 레거시 disable. (시크릿 채팅 금지)

> 비차단 기술부채·보류분 전체는 `known-issues.md` (I1b lint · I2 워크플로 60s · I9 advisor · I11 감사보류 · I12 단계5보류 등).

---

## 🚀 환경 / 접근

- **GitHub** `chowhiwon99-code/equria-workflow-Sass` (main 단일).
- **Vercel** team `team_wcW0NMU7oiIxNndyV1afigbp` · project `prj_CcCTUr8eIYpaStaj6RNq7VoLPZG6` · 배포보호 off(앱이 자체 인증).
- **Supabase** project `dutovtfdckhayyvhtuxu` (ap-northeast-2 서울) · 마이그 001~024 적용. DDL은 MCP `apply_migration`(`project_id` 필수) **+** `supabase/migrations/` 파일 둘 다(SSOT).
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
- 세금계산서 = 작성·정리만(발행 X). 캘린더 = 네이티브 Date 자체구현. 브랜드 표기 **EQURIA / 이큐리아**.

---

## 📝 참고

- GitHub https://github.com/chowhiwon99-code/equria-workflow-Sass
- Vercel https://vercel.com/chowhiwon99-2151s-projects/equria-workflow-sass
- Supabase https://supabase.com/dashboard/project/dutovtfdckhayyvhtuxu
- 메모리: `~/.claude/projects/-Users-johwiwon-equria-workspace/memory/`
</content>
