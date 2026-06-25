-- 075: 그룹 읽음 표시(카카오톡식) — 방 멤버가 서로의 읽음 상태를 볼 수 있게 SELECT 확장.
-- 쓰기(insert/update/delete)는 여전히 본인만. 메시지별 '안 읽은 인원 수' 계산용.
drop policy if exists grs_all on public.group_read_state;
drop policy if exists grs_select on public.group_read_state;
drop policy if exists grs_insert on public.group_read_state;
drop policy if exists grs_update on public.group_read_state;
drop policy if exists grs_delete on public.group_read_state;

create policy grs_select on public.group_read_state for select
  using (public.is_room_member(room_id));
create policy grs_insert on public.group_read_state for insert
  with check (user_id = (select auth.uid()));
create policy grs_update on public.group_read_state for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy grs_delete on public.group_read_state for delete
  using (user_id = (select auth.uid()));

-- 읽음 변동 실시간 반영
alter publication supabase_realtime add table public.group_read_state;
