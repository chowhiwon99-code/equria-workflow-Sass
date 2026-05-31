-- 017: 워크플로우 소유권 + 선택적 공유 (에이전트 is_public 패턴과 일치).
--  - 016에서 잠시 wf_update 를 "인증된 누구나"로 풀었던 것을 소유자 전용으로 정정.
--  - is_public 컬럼 추가(기본 비공개). 목록은 "내 것 + 공유된 것"만, 수정/삭제는 소유자만.
-- 멱등(if not exists / drop policy if exists).

alter table public.workflows add column if not exists is_public boolean not null default false;

-- 조회: 내가 만든 것 또는 공유(is_public)된 것, 그리고 활성만.
drop policy if exists "wf_select" on public.workflows;
create policy "wf_select" on public.workflows
  for select using (
    is_active = true
    and (created_by = auth.uid() or is_public = true)
  );

-- 수정: 소유자만 (공유받은 사람은 보기/실행만).
drop policy if exists "wf_update" on public.workflows;
create policy "wf_update" on public.workflows
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());

-- 생성: 인증 + 본인 명의로만.
drop policy if exists "wf_insert" on public.workflows;
create policy "wf_insert" on public.workflows
  for insert with check (auth.uid() is not null and created_by = auth.uid());
