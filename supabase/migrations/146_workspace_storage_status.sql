-- 146: 145의 workspace_storage_bytes를 요금제 인지형 workspace_storage_status로 대체.
-- 이유: premium(EQURIA·이큐리아2 등 자사 내부, lib/plans.ts 정책상 "무제한")는 상한 예외가 필요함을
-- 뒤늦게 확인 — EQURIA 실사용량이 이미 156MB로 500MB 상한의 31%까지 와 있어, 요금제 구분 없이
-- 걸면 내부 워크스페이스가 막힐 수 있었다. 145는 아직 클라이언트 어디서도 안 쓰고 있어(이번 세션 내
-- 설계 수정) 그냥 대체한다.
-- 롤백: drop function public.workspace_storage_status(uuid);
drop function if exists public.workspace_storage_bytes(uuid);

create or replace function public.workspace_storage_status(ws_id uuid)
returns table(used_bytes bigint, limit_bytes bigint)
language sql
security definer
stable
set search_path = ''
as $$
  select
    case
      when ws_id in (select public.auth_user_workspace_ids()) then
        coalesce((
          select sum((o.metadata->>'size')::bigint)
          from storage.objects o
          where o.bucket_id in ('files', 'chat-files', 'receipts', 'business-cards', 'calendar-files', 'meeting-media')
            and split_part(o.name, '/', 1) in (
              select wm.user_id::text from public.workspace_members wm where wm.workspace_id = ws_id
            )
        ), 0)
      else 0
    end as used_bytes,
    case
      when ws_id not in (select public.auth_user_workspace_ids()) then 0::bigint
      when (select w.plan from public.workspaces w where w.id = ws_id) = 'premium' then null::bigint
      else 524288000::bigint -- 500MB, free·standard·pro 공통
    end as limit_bytes
$$;

grant execute on function public.workspace_storage_status(uuid) to authenticated;
