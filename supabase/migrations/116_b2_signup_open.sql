-- 116: B2 컷오버 — handle_new_user v2: equria 자동 등록 제거 (플랜 B-4 컷오버 4단계)
--
-- 배경: 043이 신규 auth 유저를 무조건 equria 워크스페이스 멤버로 등록했다(B1-a 시절
--   RLS write-gate 통과용). 가입을 개방하면 외부인이 우리 회사에 자동 진입하는 구조 →
--   워크스페이스 귀속은 이제 /onboarding(create_workspace RPC) 또는 /join(accept RPC)이 담당.
-- 선행(완료): B1-b Phase A(쓰기 격리 강제) · 마이그 113~115 · 앱 배포(9b74af8·5f430af —
--   온보딩/조인/초대 링크, 구 이메일 초대 라우트 410).
-- ⚠️ 이 마이그 이후에만 Supabase '신규 가입 허용'을 켤 것(순서 바뀌면 equria 침입).
-- 기존 멤버 무영향(트리거는 신규 가입 시에만 실행).
-- 롤백: 043 원문(equria 자동 등록 포함)으로 복원.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  -- 워크스페이스 귀속은 온보딩(create_workspace)·초대 수락(accept_workspace_invite)이 담당.
  return new;
end;
$function$;
