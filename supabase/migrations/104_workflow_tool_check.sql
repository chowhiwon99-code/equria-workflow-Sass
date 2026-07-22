-- 104: 워크플로우 도구(save_file·notify) CHECK 위반 버그 수정
-- 증상: 워크플로우 실행의 save_file/notify 도구가 files.source='workflow' / notifications.type='workflow'를
--       쓰는데 CHECK 제약에 그 값이 없어 INSERT가 매번 실패(파일은 버킷에 고아로 남고 거짓 성공 보고).
-- 방식: 추가형(additive) — 기존 허용값은 그대로 두고 'workflow'만 확장. 멱등(drop if exists → add).
--       UI는 이미 "워크플로우 결과" 라벨을 가지고 있음(src/lib/files.ts FILE_SOURCE_LABEL) → 값만 열어주면 정합.
-- 롤백: 아래 두 constraint의 배열에서 'workflow'만 제거해 재적용.

-- files.source: 'gdrive','local','link','figma' → + 'workflow' (기준: 004_files_source_link_figma.sql)
alter table public.files drop constraint if exists files_source_check;
alter table public.files add constraint files_source_check
  check (source in ('gdrive','local','link','figma','workflow'));

-- notifications.type: 076의 9종 → + 'workflow' (기준: 076_group_chat_notifications.sql)
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array['dm','event_done','event_invite','project_assigned','mail','system','announcement','approval','group','workflow']));
