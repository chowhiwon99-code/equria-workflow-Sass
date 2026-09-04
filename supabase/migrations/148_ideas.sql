-- 148: 아이디어 창고(ideas) — 회의노트 대개편 P1 (계획: ~/.claude/plans/fluffy-cooking-nest.md, 세션56 승인)
--
-- 왜 별도 테이블인가(태그 방식 기각):
--   ① meeting_notes UPDATE RLS는 작성자/admin만이라 팀원이 아이디어 상태(씨앗→검토→채택)를 못 바꾼다.
--   ② P4 재부상에 last_surfaced_at·surface_count 인덱스 쿼리가 필요 — HTML 본문 속 태그로는 불가.
--   ③ 아이디어는 회의 밖에서도 생긴다 — source_note_id nullable + 원문 발췌(source_snippet)로
--      "요약→원문 근거 점프"를 유지하면서 독립 캡처 허용.
--
-- RLS: SELECT/INSERT/UPDATE = 워크스페이스 멤버 전원(상태 협업이 목적), DELETE = 작성자·오너·관리자(065 패턴).
-- 플랜 게이트: 회의노트와 동일 Standard+ (마이그143 enforce_plan_feature_gate 재사용).
-- pg_trgm: P2 검색(트라이그램 인덱스)의 선행 — 확장만 미리 켠다(무해).
--
-- 롤백:
--   drop trigger if exists ideas_plan_gate on public.ideas;
--   drop table if exists public.ideas;
--   -- pg_trgm 확장은 공용이라 롤백하지 않는다.

create extension if not exists pg_trgm;

create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null default '',
  tags text[] not null default '{}',            -- AI 자동 분류(백그라운드 갱신) — 사용자는 정리하지 않는다
  status text not null default 'seed'
    check (status in ('seed', 'review', 'adopted', 'parked')),
  source_note_id uuid references public.meeting_notes(id) on delete set null,
  source_snippet text,                          -- 원문 근거 점프용 발췌
  last_surfaced_at timestamptz,                 -- P4 재부상 커서
  surface_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ideas_ws on public.ideas (workspace_id, status, created_at desc);
create index if not exists idx_ideas_surface on public.ideas (workspace_id, status, last_surfaced_at asc nulls first);

alter table public.ideas enable row level security;

drop policy if exists "ideas_select" on public.ideas;
create policy "ideas_select" on public.ideas for select using (
  workspace_id in (select public.auth_user_workspace_ids())
);

drop policy if exists "ideas_insert" on public.ideas;
create policy "ideas_insert" on public.ideas for insert with check (
  (select auth.uid()) = created_by and public.is_workspace_member(workspace_id)
);

-- 상태·태그·본문 협업 편집 = 멤버 전원(아이디어는 팀 공유 자산). workspace_id/created_by 변조는 with check로 방어.
drop policy if exists "ideas_update" on public.ideas;
create policy "ideas_update" on public.ideas for update using (
  workspace_id in (select public.auth_user_workspace_ids())
) with check (
  workspace_id in (select public.auth_user_workspace_ids())
);

drop policy if exists "ideas_delete" on public.ideas;
create policy "ideas_delete" on public.ideas for delete using (
  workspace_id in (select public.auth_user_workspace_ids())
  and ((select auth.uid()) = created_by or public.auth_is_workspace_owner(workspace_id) or public.auth_is_admin())
);

-- 플랜 게이트 — 회의노트(Standard+)와 동일. 아이디어 캡처의 유일한 입구가 회의노트 화면이므로 일관.
drop trigger if exists ideas_plan_gate on public.ideas;
create trigger ideas_plan_gate
  before insert on public.ideas
  for each row execute function public.enforce_plan_feature_gate('standard', '아이디어 창고는 Standard 플랜부터 사용할 수 있어요.');
