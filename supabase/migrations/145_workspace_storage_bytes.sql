-- 145: 워크스페이스별 스토리지 총사용량 조회 함수(마케팅 개시 조건 B — 워크스페이스 총량 상한).
-- storage.objects엔 workspace_id가 없다(경로는 {user_id}/{uuid}.ext) — 대신 워크스페이스 멤버들이
-- 올린 파일을 6개 버킷에서 합산한다. auth_user_workspace_ids()와 같은 계열의 헬퍼.
-- ⚠️ 알려진 한계: 여러 워크스페이스에 속한 유저의 파일은 모든 소속 워크스페이스에 중복 집계됨
-- (경로에 workspace_id가 없어 "이 업로드가 어느 회사 것인지" 원천적으로 구분 불가 — LOW, 수용 범위,
-- known-issues.md 참고). 롤백: drop function public.workspace_storage_bytes(uuid);
create or replace function public.workspace_storage_bytes(ws_id uuid)
returns bigint
language sql
security definer
stable
set search_path = ''
as $$
  select case
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
  end
$$;

grant execute on function public.workspace_storage_bytes(uuid) to authenticated;
