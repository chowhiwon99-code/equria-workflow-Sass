-- 072: 그룹 채팅 함수 권한 하드닝 (012 패턴) — anon 노출 제거.
-- 트리거 함수는 누구도 직접 호출 불가, RPC/헬퍼는 authenticated만.
revoke execute on function public.touch_group_room() from public, anon, authenticated;
revoke execute on function public.is_room_member(uuid) from public, anon;
revoke execute on function public.mark_room_read(uuid) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated;
grant execute on function public.mark_room_read(uuid) to authenticated;
