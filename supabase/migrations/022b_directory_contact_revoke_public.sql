-- 022b: directory_contact는 함수 기본 PUBLIC EXECUTE 때문에 anon(비로그인)도 호출 가능했음.
--   anon이 공개(all) 연락처를 긁는 것을 막기 위해 PUBLIC 권한 회수 → 로그인 사용자만. 멱등.
revoke execute on function public.directory_contact(uuid) from public;
revoke execute on function public.directory_contact(uuid) from anon;
grant execute on function public.directory_contact(uuid) to authenticated;
