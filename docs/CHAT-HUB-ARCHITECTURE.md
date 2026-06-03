# 직원 채팅 → "메인 + AI" 확장 설계 (실행 가능 단계별)

레포: `/Users/johwiwon/equria-workspace` · 다음 마이그 번호: **022** (live 최신 = `021_assistant_chat`) · live 검증 완료 (profiles 6컬럼 / direct_messages 9컬럼, reactions·thread·rich 전무 → **전부 additive 가능**).

---

## 0. 출발점 (검증된 사실)

- `profiles`: `id, email, name, role(admin|member), department, avatar_url, created_at, updated_at` — 상태/직급/연락처/공개여부 **전무**.
- `direct_messages`: `content, attachment_url, attachment_name, read_at, edited_at, deleted_at` — 단일 첨부·평면 구조. **reactions/parent/rich 없음**.
- 재사용 자산: `UndoProvider`(역연산 push), `notifications` 테이블(type에 `dm` 존재), 기존 AI 어시스턴트 라우트 `src/app/api/assistant/route.ts`(streamText + `MODELS.default` + AI SDK v6), `DashboardAssistant.tsx`, Realtime + `REPLICA IDENTITY FULL` 패턴(007), SECURITY DEFINER + `search_path=''` 패턴(012).
- 설치 상태: `isomorphic-dompurify@3.15` **있음**, AI SDK v6 **있음**, Tiptap **없음**(추가 필요).
- 핵심 키파일: `src/components/chat/{ChatList,DirectChat}.tsx`, `src/app/(app)/chat/{page,[userId]/page}.tsx`, `src/types/index.ts`, `src/lib/supabase/types.ts`, `src/app/(auth)/actions.ts`.

---

## 1. 목표 재정의 — "채팅을 메인 + AI"란

지금 채팅은 사이드바 한 항목인 "1:1 DM 도구"다. 목표는 두 축의 격상이다.

**(A) 메인화 = 채팅이 직원의 1차 작업 공간이 된다.**
화면/흐름으로 풀면:
- 채팅 페이지가 **3분할 셸**이 된다 — 왼쪽(대화/멤버 디렉터리 탭) · 가운데(대화 본문) · 오른쪽(스레드 패널 / 상대 정보 패널, 펼침식).
- 사이드바 아바타에 **상태 점**이 상시 노출돼, 다른 화면에 있어도 "누가 지금 온라인/휴가"인지 보인다.
- 메시지가 단순 텍스트가 아니라 **서식·체크박스·다중첨부·스레드·반응**을 가진 "작은 문서"가 된다 → 업무 논의가 메일/외부 메신저로 새지 않는다.
- "멤버" 탭에서 부서→직급 조직도로 동료를 찾고, 바로 DM을 연다 → 사내 디렉터리 역할 흡수.

**(B) AI 내장 = Claude가 채팅 안에서 동작한다.** (상세 §3)
- 대화 요약, 답장 초안/톤 보정, 인라인 번역, "@AI" 호출을 **기존 어시스턴트 인프라 재사용**으로 붙인다. 별도 봇 계정/신규 모델 배선 없음.

이 문서는 위를 **작은 것부터 하나씩** 안전하게 쌓는 순서로 정리한다(§6).

---

## 2. 5개 기능별 설계 (데이터모델 · 핵심구현 · UX · 난이도)

> 마이그는 전부 `add column if not exists` / `create table if not exists` / `drop policy if exists` 멱등. 신규 컬럼은 nullable·default → 기존 행 무손상.

### 기능 1 — 사용자 상태 (온라인/오프라인/휴가 등) · 난이도 ★★☆

**데이터모델 (마이그 022)** — 하이브리드:
- 휘발성(온라인/오프라인)은 **DB 컬럼이 아니라 Supabase Realtime Presence**(`channel.track`/`presenceState`)로. DB에 쓰면 매 탭전환마다 write 폭증 + 정확도 낮음.
- 수동 상태만 DB:
  ```sql
  alter table public.profiles
    add column if not exists status_manual text
      check (status_manual in ('active','vacation','meeting','remote','dnd'));
  -- null = 수동설정 없음(presence만 따름)
  ```

**핵심구현:** `chat/page.tsx`(또는 셸)에서 단일 presence 채널 `channel('presence-workspace')` 구독 → `track({ user_id })` 로그인 시, `sync` 이벤트로 온라인 집합 계산. 수동 상태는 마이페이지 드롭다운에서 `profiles.status_manual` UPDATE(본인만, 기존 profiles RLS로 충분). 표시 우선순위: `status_manual`(휴가/회의 등) > presence(온라인 초록) > 오프라인(회색).

**UX:** 아바타 우하단 점(초록=online / 회색=offline / 노랑·휴가 라벨 등). ChatList·멤버 디렉터리·DirectChat 헤더에 공통 `<StatusDot>` 컴포넌트.

**주의:** 채널 cleanup(`removeChannel`)을 unmount에서 반드시. presence 누수 = Realtime 연결한도 #1 원인. ChatList가 이미 `dm-list` 채널을 쓰므로 채널명 충돌 금지.

---

### 기능 2 — 메시지 확장 (스레드 + 서식편집 + 오타밑줄 + 다양한 파일) · 난이도 ★★★★

가장 무겁다. 4개 하위로 쪼갠다.

**2a. 노션식 서식 — Tiptap v3 (JSON 저장, 이중저장)**
- 데이터모델 (마이그 022):
  ```sql
  alter table public.direct_messages
    add column if not exists body_json jsonb;   -- Tiptap JSONContent (SSOT, nullable)
  -- content(text)는 유지 = plain-text 미러 (검색·알림·레거시 폴백)
  ```
- 저장형식 결정: **JSON SSOT + plain 미러** (HTML 단독 비권장 — XSS 표면·서식손실). `content`는 NOT NULL 제약·`handle_new_dm` 알림(left(content,50)) 의존이라 **반드시 plain text 동시 저장**.
- 구현: `RichMessageEditor.tsx`('use client', `useEditor({extensions:[StarterKit, TaskList, TaskItem, Placeholder], immediatelyRender:false})`, `if(!editor) return null`). 전송 시 `getJSON()→body_json`, `getText()→content`. 렌더는 `RichMessageView.tsx`(`generateHTML`+`DOMPurify.sanitize`, 또는 editable:false). DirectChat은 `body_json` 있으면 리치뷰, 없으면 기존 텍스트 렌더 — **점진 전환·되돌림 안전**.
- 타입: `import type { JSONContent } from '@tiptap/core'` (any 금지).

**2b. 오타 빨간밑줄 — 라이브러리 0**
- 에디터 컨테이너 `spellcheck='true'`(브라우저 native). 코드블록 노드는 끔. 한국어 정밀도는 OS 사전 의존 → "best-effort"임을 명시. 정밀 교정은 §3 AI 버튼(옵션).

**2c. 다중 첨부 — 자식 테이블 신설 (기존 단일컬럼 보존)**
- 데이터모델 (마이그 022):
  ```sql
  create table if not exists public.message_attachments (
    id uuid primary key default gen_random_uuid(),
    message_id uuid not null references public.direct_messages(id) on delete cascade,
    storage_path text not null, name text, mime_type text, size bigint,
    created_at timestamptz default now());
  create index if not exists idx_msg_attach on public.message_attachments(message_id);
  ```
- RLS: select = 부모 메시지 대화 참여자, insert = 부모 sender 본인. (dm RLS의 EXISTS 서브쿼리 패턴 차용)
- 구현: 기존 `chat-files` 버킷 + `uploadFile` 재사용, `<input multiple>`. 기존 `attachment_url/name`은 레거시 호환으로 **보존**(파괴적 백필 금지).

**2d. 스레드 — self-FK (비파괴)**
- 데이터모델 (마이그 022):
  ```sql
  alter table public.direct_messages
    add column if not exists parent_id uuid references public.direct_messages(id) on delete set null,
    add column if not exists root_id  uuid;
  create index if not exists idx_dm_thread on public.direct_messages(conversation_id, root_id, created_at);
  ```
- `on delete set null`(원문 삭제돼도 답글 보존 → "원본 삭제됨" 표시). cascade 금지(대화 유실).
- 구현: insert 시 `root_id = parent.root_id ?? parent.id`. 같은 root_id 묶음을 오른쪽 패널/들여쓰기로. 평면 메시지(parent null)는 그대로.

**UX:** 입력창을 Tiptap 에디터 + 작은 툴바(굵게·목록·체크박스·코드)로 교체. Enter=전송/Shift+Enter=줄바꿈. 호버 액션에 "답글" 추가 → 오른쪽 스레드 패널. 클립 버튼 multiple → 칩 목록.

---

### 기능 3 — 멤버 디렉터리 (부서/직급) + 항목별 연락처 공개여부 · 난이도 ★★★

**데이터모델 (마이그 022)** — profiles에 컬럼 + jsonb 공개정책:
```sql
alter table public.profiles
  add column if not exists position text,        -- 직급(부서 department는 기존 재사용)
  add column if not exists work_phone text,       -- 유선
  add column if not exists mobile text,           -- 휴대폰
  add column if not exists contact_privacy jsonb not null
    default '{"email":"all","work_phone":"all","mobile":"private"}';
```
- 항목별 공개여부를 **컬럼 N개 대신 jsonb 1개**로 → 항목 추가 시 마이그 불필요, 꼬임 최소.

**핵심구현 — RLS로는 컬럼별 차단 불가 → SECURITY DEFINER RPC가 정석:**
- profiles SELECT는 전직원 유지(이름·부서·직급·아바타·상태는 공개). **민감 연락처(email/phone/mobile)는 profiles에서 직접 노출하지 않고** RPC로만:
  ```sql
  create or replace function public.directory_contact(target uuid)
  returns table(email text, work_phone text, mobile text)
  language sql security definer set search_path='' as $$
    select
      case when p.contact_privacy->>'email'='all'      or target=auth.uid() or public.is_admin_or_owner() then p.email      end,
      case when p.contact_privacy->>'work_phone'='all'  or target=auth.uid() or public.is_admin_or_owner() then p.work_phone end,
      case when p.contact_privacy->>'mobile'='all'      or target=auth.uid() or public.is_admin_or_owner() then p.mobile     end
    from public.profiles p where p.id = target;
  $$;
  revoke execute on function public.directory_contact(uuid) from anon;
  grant execute on function public.directory_contact(uuid) to authenticated;
  ```
  ⚠️ **컬럼을 노출하고 UI에서만 가리는 것 절대 금지** — 네트워크 응답에 값이 실려 절대원칙2 위반.

**UX:** 채팅 셸 왼쪽에 "멤버" 탭. 부서→직급 2단 그룹핑, 카드(아바타·이름·직급·상태점). 카드 펼침 시 `directory_contact` RPC 1회 호출 → 공개 항목만, 비공개는 자물쇠+"비공개". 본인 카드엔 항목별 공개/비공개 스위치(→ `contact_privacy` UPDATE, Undo 등록). DirectChat 헤더에서 "정보" 버튼 → 같은 패널.

---

### 기능 4 — 메시지 공감(이모지 반응) + 답장 · 난이도 ★★☆

**데이터모델 (마이그 022)** — 반응은 정규화 테이블(Slack/Discord 표준), 답장은 §2d의 `parent_id` 재사용:
```sql
create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.direct_messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id)        on delete cascade,
  emoji text not null, created_at timestamptz default now(),
  unique(message_id, user_id, emoji));
create index if not exists idx_reactions_msg on public.message_reactions(message_id);
alter table public.message_reactions replica identity full;          -- DELETE(반응취소) Realtime RLS용
do $$ begin alter publication supabase_realtime add table public.message_reactions;
  exception when duplicate_object then null; end $$;
```
- `UNIQUE(message_id,user_id,emoji)` → "같은 사람·같은 이모지 1번" DB 보장. 토글 = 있으면 DELETE / 없으면 INSERT.
- RLS: select=대화 참여자(direct_messages→direct_conversations EXISTS 조인), insert=`user_id=auth.uid()` and 참여자, delete=`user_id=auth.uid()`.

**핵심구현:** 집계는 클라에서 emoji별 count + 내가 눌렀는지(행 적어 충분). `message_reactions` INSERT/DELETE 구독. 답장은 §2d insert 시 `parent_id` 세팅 → `direct_messages` 기존 구독으로 자동 반영(추가 작업 0). 모든 supabase 쿼리에 `await` 보장.

**UX:** 버블 호버 → 이모지 피커(자주쓰는 6개+더보기), 하단 칩 `[👍 3][❤️ 1]`(내가 누른 건 강조, 클릭=토글). 답장 호버 액션 → 입력창 위 인용 미리보기, 버블 위 작은 인용 블록(클릭 시 원문 스크롤).

---

### 기능 5 — 기업별 관리자 + 초대 권한자 (§5 열린결정 핵심) · 난이도 ★★★★

> ⚠️ 현재는 **단일 테넌트**(EQURIA 한 회사). organizations 테이블 도입은 전 RLS 재작성 대공사 → **과설계, 보류**. 단일 워크스페이스 전제 최소 확장 권장.

**권장 모델 = 단일 owner + 여러 admin, 초대권은 admin 이상** (§5 옵션 B). 권한은 위→아래 단방향(admin은 동급/상위를 못 건드림).

**데이터모델 (별도 마이그 027 — Phase 5):**
```sql
-- (a) role 확장 (additive; 기존 admin/member 무손상)
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner','admin','member'));
-- (b) 헬퍼
create or replace function public.is_admin_or_owner() returns boolean
  language sql security definer set search_path='' as
  $$ select exists(select 1 from public.profiles where id=auth.uid() and role in('owner','admin')); $$;
-- (c) 초대 테이블
create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  email text, invited_role text check(invited_role in('admin','member')) default 'member',
  token text not null unique,
  status text check(status in('pending','accepted','revoked','expired')) default 'pending',
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default now()+interval '7 days',
  created_at timestamptz default now(), accepted_at timestamptz);
```
- RLS: invites select/insert/update = `is_admin_or_owner()` 게이트 + **admin은 `invited_role='member'`만**, admin 임명은 owner만. **토큰 조회는 RLS로 열지 말고** `redeem_invite(token)` SECURITY DEFINER RPC로만(enumeration 차단).
- role 변경은 RLS로 막고 `set_member_role(target,new_role)`(owner 전용), `transfer_ownership(target)`(원자적) RPC로만.
- 가입 전환: `signupAction`의 `WORKSPACE_PASSWORD`를 **레거시 폴백으로 남기고**(env 있을 때만) 기본은 토큰 필수. `redeem_invite`가 pending+미만료 검증 → `admin.createUser` → role 적용. **하드 삭제는 별도 커밋에서**.
- 회귀 보정: MCP 라우트 3곳 `prof?.role !== 'admin'` → `role in('owner','admin')`로(owner 거부 방지).

---

## 3. AI 도입 포인트 (Claude를 채팅 안에서)

**원칙: 신규 봇 계정·신규 모델 배선 0. 기존 어시스턴트 인프라 재사용.**
앵커 = `src/app/api/assistant/route.ts`(이미 `streamText` + `anthropic(MODELS.default)` + AI SDK v6 `toUIMessageStreamResponse` + onFinish 영속화 패턴 검증됨). 채팅용은 이 패턴을 복제한 **스트리밍 안 하는 단발 라우트**들로 충분(결과를 입력창/뷰에 꽂는 용도).

도입 4지점 (작은 것부터):
1. **답장/작성 보조** — 입력창 "AI 다듬기" 버튼: 초안 텍스트 → `/api/chat-ai/compose`(톤 정중/간결, 오타·맞춤법 정밀교정). native spellcheck 한계 보완. 결과는 에디터에 치환(전송 전).
2. **인라인 번역** — 메시지 호버 "번역" → `/api/chat-ai/translate`(기존 번역 에이전트 system prompt 재사용, KO↔EN↔ZH↔JA). 결과는 버블 아래 접이식.
3. **대화 요약** — 스레드/긴 대화 상단 "요약" → 최근 N개 `direct_messages.content`(plain 미러가 여기서 빛난다) → `/api/chat-ai/summarize`. 자리 비웠다 복귀 시 유용.
4. **@AI 호출** — 메시지에 `@AI` 멘션 시 어시스턴트가 그 대화 맥락으로 답(기존 `assistant_*` 대화 영속화 재사용). MVP 이후.

구현 메모: 모든 라우트 서버사이드(`ANTHROPIC_API_KEY` 노출 금지), `maxDuration=60`, `runtime='nodejs'`. 번역/요약 system prompt는 `src/lib/claude/agents/{translation,document-writing}.ts` 재사용. 토큰 절약 슬라이딩 윈도우(최근 10~12개)는 기존 패턴 그대로.

---

## 4. DB 변경 요약 (멱등 · RLS 마이그 목록)

| 마이그 | 내용 | 파괴성 | RLS 신규 |
|---|---|---|---|
| **022_chat_directory_reactions.sql** | profiles +`status_manual`/`position`/`work_phone`/`mobile`/`contact_privacy`; direct_messages +`body_json`/`parent_id`/`root_id`; `message_attachments` 테이블; `message_reactions` 테이블(+publication+replica full); `directory_contact()` RPC | **0 (전부 additive)** | message_attachments(select/insert), message_reactions(select/insert/delete) |
| **027_invites_and_roles.sql** (Phase 5) | profiles.role → owner/admin/member; `is_admin_or_owner()`·`current_role()`; `workspace_invites` 테이블; `redeem_invite`·`set_member_role`·`transfer_ownership` RPC | **role check만 drop→add (사전 rollback 시뮬 필수)** | workspace_invites(select/insert/update) + RPC 게이트 |

> 022는 기능 1~4를 한 멱등 파일로 묶어도 안전(전부 additive). 단 **커밋은 관심사별 분리**: (마이그+types) / (반응·답장 UI) / (디렉터리·presence) / (에디터). 모든 SECURITY DEFINER 함수는 `search_path=''` + `revoke execute from anon`(012 패턴).

---

## 5. 열린 결정 (사용자 확인 필요)

**D1. #5 초대 권한 모델** (가장 중요)
- **옵션 A** 단일 슈퍼관리자(owner 1명만 초대): 가장 단순, RLS 한 줄. 단점 = owner 부재 시 온보딩 정지(단일 장애점). <10명 초기엔 OK.
- **옵션 B ★권장** 단일 owner + 여러 admin, 초대는 admin 이상: 초대 병목 제거 + 권한 단방향(상승공격 차단), 기존 admin 데이터·MCP RLS 호환. Slack/Notion 기본형. "누가/순서?" → owner 1명 부트스트랩 → admin 임명 → admin·owner가 멤버 초대. "한 명만?" → 최종통제(owner)는 1명, **초대권은 admin 전원**(운영 현실적).
- **옵션 C** 초대 토큰 + audit(invites 테이블): 누가/언제 완전 기록 + 외부가입 차단. → **B+C 결합 권장**.

**D2. 리치에디터 라이브러리** → **Tiptap v3 권장**(2026 컨센서스: 사내 규모엔 Tiptap 기본값, Lexical은 초대규모 전용 과함). 단 미설치 → `@tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-task-list @tiptap/extension-task-item @tiptap/extension-placeholder` 추가 필요. 저장형식은 **JSON SSOT + plain 미러**.

**D3. 상태 방식** → **하이브리드 권장**: 온라인/오프라인 = Realtime Presence(휘발성, write 폭증 회피), 휴가/회의 = `profiles.status_manual` 컬럼. (전부 컬럼 저장은 비권장.)

**D4. 공용가입 → 초대제 전환** → **점진 전환 권장**: `WORKSPACE_PASSWORD`를 env 있을 때만 동작하는 레거시 폴백으로 남기고, 기본 경로를 토큰 초대제로. 안정화 후 별도 커밋에서 폴백 제거(되돌림 가능). **즉시 하드 삭제 비권장.**

**D5. (부차) 오타 교정 정밀도** → MVP는 native spellcheck(무료·즉시), 고급은 §3 AI "다듬기" 버튼(정확하나 호출비용/지연).

---

## 6. 단계별 로드맵 (작은 것부터, 의존성순)

각 단계 = 독립 커밋 + 검증(`pnpm tsc --noEmit` 0 → `pnpm build` 0 → 변경 데이터는 `useUndo().push`). 마이그 단계는 추가로 `get_advisors(security/performance)` 신규 ERROR/WARN 0.

- **단계 0 — 마이그 022 + 타입동기화** (의존성 뿌리). additive DDL 적용 → `generate_typescript_types`로 `src/lib/supabase/types.ts` 재생성 → `src/types/index.ts`에 `MessageReaction`, `MessageAttachment` 추가, `DirectMessage`에 신규 컬럼 확인. **UI 변경 0** (안전한 기반만). 검증: advisors 0.
- **단계 1 — 상태 표시 (기능1)**. presence 채널 + `<StatusDot>` + 마이페이지 수동상태 드롭다운. 가장 가시적이고 위험 낮음. (마이그는 022에 이미 포함.)
- **단계 2 — 이모지 반응 (기능4 전반)**. `MessageReactions` 컴포넌트 + 토글 + 구독. `replica identity full` 이미 022에. DELETE 이벤트 안 오면 여기서 잡힘.
- **단계 3 — 답장/스레드 (기능4 후반 + 2d)**. `parent_id` 인용 미리보기 + 버블 인용 블록 + 오른쪽 스레드 패널. 반응보다 UI 복잡.
- **단계 4 — 멤버 디렉터리 + 연락처 공개 (기능3)**. 멤버 탭 + 부서/직급 그룹핑 + `directory_contact` RPC + 본인 공개 스위치. RPC 보안검증(set local role 시뮬 → rollback).
- **단계 5 — 리치 에디터 (기능2 a/b/c)**. Tiptap 설치 → `RichMessageEditor`/`RichMessageView` → DirectChat 입력창 교체(body_json 분기, 레거시 폴백 유지) → spellcheck → 다중첨부. **가장 무거움, 끝에서 둘째.** SSR(`immediatelyRender:false`)·XSS(DOMPurify)·`content` 미러 회귀 집중 검증.
- **단계 6 — AI 보조 (§3)**. 다듬기 → 번역 → 요약 순. 기존 assistant 라우트 복제, 채팅 셸에 버튼 꽂기.
- **단계 7 — 초대/권한 (기능5, 마이그 027)**. role 확장 rollback 시뮬 → invites + RPC → 설정>멤버관리 탭 → signup 토큰 전환(폴백 유지) → MCP 라우트 owner 보정. **최대 위험·독립 페이즈**. 검증: RLS 시뮬(member/admin/owner 각 시도 → 기대대로 허용/거부) + advisors.

의존성 요약: 단계0 → (1·2·4·5 병렬 가능, 단 2→3 순서) → 6은 5 이후 권장 → 7은 독립(언제든).

---

## 7. 리스크 / 주의

- **Realtime DELETE 누락**: `message_reactions`에 `replica identity full` + publication add 없으면 반응취소가 클라에 안 옴(007과 동일 함정). 022에 필수 포함.
- **lazy thenable**: supabase 쿼리는 `await`/`then` 누락 시 HTTP 전송 자체 안 됨(과거 DM 읽음 버그). 반응 토글·답장 insert·공개토글 전부 await.
- **컬럼별 비공개는 RLS로 불가**: 연락처는 반드시 `directory_contact` RPC. 컬럼 직접 노출 + UI 가리기 = 원칙2 위반.
- **Tiptap SSR**: `immediatelyRender:false` + `'use client'` 없으면 Next16/React19 하이드레이션 미스매치. `@tiptap/pm` peer 누락 시 런타임 깨짐(세 패키지 동일 메이저).
- **content NOT NULL + 알림 트리거**: JSON만 저장하고 content 비우면 `handle_new_dm`(left content 50) 깨짐 → plain 미러 필수.
- **reply on delete set null** (cascade 금지): 원문 삭제 시 답글 유실 방지.
- **role check 확장은 엄밀히 파괴적 DDL**: 적용 전 `begin; ...; rollback`으로 기존 행이 새 제약 통과 확인. owner 부트스트랩은 트리거 말고 마이그/1회성 RPC로 명시(레이스 방지). owner 양도는 트랜잭션 원자적.
- **Realtime 채널 누수 = 연결한도 #1**: presence·reaction 구독 모두 unmount `removeChannel`. 채널명 충돌 주의(ChatList `dm-list` 기존).
- **SECURITY DEFINER 하드닝**: 모든 RPC `set search_path=''` + `revoke execute from anon`(012 패턴) 안 하면 advisor WARN 재발.
- **멀티테넌트 유혹**: "기업별 관리자" 표현에 끌려 organizations 도입 금지 — 단일 워크스페이스 전제 owner/admin/member로 충분, 외부판매 확정 시로 보류.