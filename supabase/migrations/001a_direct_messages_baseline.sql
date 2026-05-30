-- 001a_direct_messages_baseline.sql
-- [SSOT 복구] direct_conversations / direct_messages 기반 DDL.
--
-- 배경: 이 두 테이블은 원래 마이그레이션 파일 없이 MCP로 직접 적용되었음(001 이후, 002 이전).
--   002가 direct_messages 에 handle_new_dm 트리거를 만들고 direct_conversations 를 읽으므로
--   이 파일은 반드시 002보다 먼저 실행돼야 함 → `001a` 네이밍(001_initial 과 002_features 사이로 정렬).
--
-- 원칙: 여기엔 "원본(pre-002)" 상태만 둔다. 후속 마이그레이션이 델타로 얹는다:
--   - attachment_url/attachment_name 컬럼 → 005
--   - dc_ordered 제약 완화(< → <=, 셀프챗 허용) → 005
--   - get_or_create_direct_conversation RPC → 005 (그 전까지 호출하는 마이그레이션 없음)
--   - handle_new_dm 함수/트리거 → 002 (005에서 본문 교체)
--   - replica identity full → 007 / mark_dm_read RPC → 009 / attachment 인덱스 → 010
-- 모든 문장은 멱등 → 신규 환경 복구 및 재실행 안전.
-- ※ 라이브 프로젝트에는 이미 존재함(문서화·신규환경 복구 목적). 라이브 재적용 불필요.

-- ── direct_conversations ──────────────────────────────────────────────
create table if not exists public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dc_ordered check (user_a < user_b),   -- 005에서 (user_a <= user_b)로 완화(셀프챗)
  unique (user_a, user_b)
);
create index if not exists idx_dc_user_a on public.direct_conversations (user_a, last_message_at desc);
create index if not exists idx_dc_user_b on public.direct_conversations (user_b, last_message_at desc);

-- ── direct_messages ───────────────────────────────────────────────────
-- (attachment_url / attachment_name 은 005에서 추가)
create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_dm_conv on public.direct_messages (conversation_id, created_at);

-- ── RLS ───────────────────────────────────────────────────────────────
alter table public.direct_conversations enable row level security;
alter table public.direct_messages      enable row level security;

drop policy if exists dc_select on public.direct_conversations;
create policy dc_select on public.direct_conversations for select
  using (auth.uid() = user_a or auth.uid() = user_b);
drop policy if exists dc_insert on public.direct_conversations;
create policy dc_insert on public.direct_conversations for insert
  with check (auth.uid() = user_a or auth.uid() = user_b);
drop policy if exists dc_update on public.direct_conversations;
create policy dc_update on public.direct_conversations for update
  using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists dm_select on public.direct_messages;
create policy dm_select on public.direct_messages for select
  using (exists (select 1 from public.direct_conversations c
                 where c.id = direct_messages.conversation_id
                   and (c.user_a = auth.uid() or c.user_b = auth.uid())));
drop policy if exists dm_insert on public.direct_messages;
create policy dm_insert on public.direct_messages for insert
  with check (sender_id = auth.uid() and exists (
    select 1 from public.direct_conversations c
    where c.id = direct_messages.conversation_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())));
drop policy if exists dm_update on public.direct_messages;
create policy dm_update on public.direct_messages for update
  using (exists (select 1 from public.direct_conversations c
                 where c.id = direct_messages.conversation_id
                   and (c.user_a = auth.uid() or c.user_b = auth.uid())));

-- ── last_message_at 갱신 트리거 ───────────────────────────────────────
create or replace function public.touch_direct_conversation()
returns trigger language plpgsql security definer as $$
begin
  update public.direct_conversations set last_message_at = new.created_at
    where id = new.conversation_id;
  return new;
end;
$$;
drop trigger if exists on_direct_message_created on public.direct_messages;
create trigger on_direct_message_created after insert on public.direct_messages
  for each row execute function public.touch_direct_conversation();

-- ── Realtime 구독 (멱등 가드) ─────────────────────────────────────────
do $$
begin
  alter publication supabase_realtime add table public.direct_messages;
exception when duplicate_object then null;
end $$;
