-- 016: 워크플로우를 팀 공유로 — 인증된 직원이면 누구나 수정/소프트삭제 가능.
-- 기존 wf_update(auth.uid()=created_by)는 "모두 조회 가능한데 생성자만 수정"이라
-- 팀 공유 도구에 어색했다. 캘린더·재무 등 기존 팀공유 기조(authenticated)와 일치시킨다.
-- 멱등(drop policy if exists).

drop policy if exists "wf_update" on public.workflows;
create policy "wf_update" on public.workflows
  for update using (auth.uid() is not null) with check (auth.uid() is not null);
