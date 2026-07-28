-- 112: B1-b A-5 — workspace_id sentinel DEFAULT 제거 (쓰기 격리 강제 ON)
--
-- 배경: 마이그 030~ 에서 45개 테넌트 테이블의 workspace_id가
--   NOT NULL DEFAULT '00000000-0000-0000-0000-0000000000e1'(equria sentinel)로 생성됨.
--   앱이 workspace_id를 명시하지 않으면 조용히 equria에 귀속되는 구조 →
--   가입 개방(B2) 시 신규 회사 데이터가 equria로 오귀속되는 시한폭탄.
-- 선행(완료): 앱 전 쓰기 경로 workspace_id 명시 배선 —
--   클라 59곳(b26fe62·5eebc56·d79462d·5bc71d2) + 서버 5곳·admin 가드 2곳·presence(3ec50d8).
--   A-4 검증: 코드 grep 감사 0건 · RPC(040/054/064/074) 명시 확인 · 본 DDL 트랜잭션 리허설 통과.
-- 효과: 이후 workspace_id 미명시 INSERT는 NOT NULL 위반으로 거부(fail-closed).
--   데이터 변경 없음(기존 행 무영향) · 멱등(남은 default만 제거).
--
-- 롤백(전체 복원):
--   do $$ declare r record; begin
--     for r in select table_name from information_schema.columns
--       where table_schema='public' and column_name='workspace_id'
--         and is_nullable='NO' and column_default is null
--     loop execute format(
--       'alter table public.%I alter column workspace_id set default ''00000000-0000-0000-0000-0000000000e1''::uuid',
--       r.table_name); end loop; end $$;
--   (특정 테이블만: alter table public.<t> alter column workspace_id set default '00000000-0000-0000-0000-0000000000e1'::uuid)

do $$
declare r record;
begin
  for r in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'workspace_id'
      and column_default is not null
  loop
    execute format('alter table public.%I alter column workspace_id drop default', r.table_name);
  end loop;
end $$;
