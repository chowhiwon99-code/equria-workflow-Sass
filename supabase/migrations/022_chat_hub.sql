-- 022: 채팅 "메인 + AI" 확장 기반 — 전 기능 additive(상태/연락처/리치/스레드/첨부/반응). 멱등.
--   기존 행 무손상(신규 컬럼 nullable/default). content(plain)는 SSOT 미러로 유지.

-- [기능1] 수동 상태(온라인/오프라인은 Realtime Presence, 휴가/회의 등만 컬럼)
alter table public.profiles add column if not exists status_manual text
  check (status_manual is null or status_manual in ('active', 'vacation', 'meeting', 'remote', 'dnd'));

-- [기능3] 직급/연락처 + 항목별 공개정책(jsonb 1개)
alter table public.profiles add column if not exists position text;
alter table public.profiles add column if not exists work_phone text;
alter table public.profiles add column if not exists mobile text;
alter table public.profiles add column if not exists contact_privacy jsonb not null
  default '{"email":"all","work_phone":"all","mobile":"private"}'::jsonb;

-- [기능2] 리치 본문(JSON) + 스레드(self-FK). content(text)는 plain 미러로 유지.
alter table public.direct_messages add column if not exists body_json jsonb;
alter table public.direct_messages add column if not exists parent_id uuid
  references public.direct_messages(id) on delete set null;
alter table public.direct_messages add column if not exists root_id uuid;
create index if not exists idx_dm_thread on public.direct_messages(conversation_id, root_id, created_at);

-- [기능2c] 다중 첨부(기존 단일 attachment_url/name은 레거시 보존)
create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.direct_messages(id) on delete cascade,
  storage_path text not null,
  name text,
  mime_type text,
  size bigint,
  created_at timestamptz not null default now()
);
create index if not exists idx_msg_attach on public.message_attachments(message_id);
alter table public.message_attachments enable row level security;
drop policy if exists "ma_select" on public.message_attachments;
create policy "ma_select" on public.message_attachments for select using (
  exists (
    select 1 from public.direct_messages m
    join public.direct_conversations c on c.id = m.conversation_id
    where m.id = message_attachments.message_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
  )
);
drop policy if exists "ma_insert" on public.message_attachments;
create policy "ma_insert" on public.message_attachments for insert with check (
  exists (select 1 from public.direct_messages m where m.id = message_attachments.message_id and m.sender_id = auth.uid())
);

-- [기능4] 이모지 반응
create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.direct_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);
create index if not exists idx_reactions_msg on public.message_reactions(message_id);
alter table public.message_reactions enable row level security;
drop policy if exists "mr_select" on public.message_reactions;
create policy "mr_select" on public.message_reactions for select using (
  exists (
    select 1 from public.direct_messages m
    join public.direct_conversations c on c.id = m.conversation_id
    where m.id = message_reactions.message_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
  )
);
drop policy if exists "mr_insert" on public.message_reactions;
create policy "mr_insert" on public.message_reactions for insert with check (user_id = auth.uid());
drop policy if exists "mr_delete" on public.message_reactions;
create policy "mr_delete" on public.message_reactions for delete using (user_id = auth.uid());
-- Realtime DELETE 이벤트(반응 취소)용
alter table public.message_reactions replica identity full;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;

-- [기능3] 연락처 항목별 공개 — 컬럼별 차단은 RLS로 불가 → SECURITY DEFINER RPC(공개 항목만 반환)
create or replace function public.directory_contact(target uuid)
returns table(email text, work_phone text, mobile text)
language sql security definer set search_path = '' as $$
  select
    case when p.contact_privacy->>'email' = 'all' or target = auth.uid()
              or exists (select 1 from public.profiles a where a.id = auth.uid() and a.role = 'admin')
         then p.email end,
    case when p.contact_privacy->>'work_phone' = 'all' or target = auth.uid()
              or exists (select 1 from public.profiles a where a.id = auth.uid() and a.role = 'admin')
         then p.work_phone end,
    case when p.contact_privacy->>'mobile' = 'all' or target = auth.uid()
              or exists (select 1 from public.profiles a where a.id = auth.uid() and a.role = 'admin')
         then p.mobile end
  from public.profiles p
  where p.id = target;
$$;
revoke execute on function public.directory_contact(uuid) from anon;
grant execute on function public.directory_contact(uuid) to authenticated;
-- ※ anon 완전 차단(기본 PUBLIC EXECUTE 회수)은 022b에서 보강.
