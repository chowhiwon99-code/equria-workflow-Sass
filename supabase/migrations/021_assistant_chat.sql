-- 021: 대시보드 범용 어시스턴트 대화 영속화 (에이전트 대화와 별개).
--   대화방(assistant_conversations) + 메시지(assistant_messages). 본인 것만(RLS). 멱등.

create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assistant_conversations_user_idx
  on public.assistant_conversations (user_id, updated_at desc);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists assistant_messages_conv_idx
  on public.assistant_messages (conversation_id, created_at);

alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;

drop policy if exists "ac_all" on public.assistant_conversations;
create policy "ac_all" on public.assistant_conversations for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "am_all" on public.assistant_messages;
create policy "am_all" on public.assistant_messages for all
  using (exists (select 1 from public.assistant_conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.assistant_conversations c where c.id = conversation_id and c.user_id = auth.uid()));
