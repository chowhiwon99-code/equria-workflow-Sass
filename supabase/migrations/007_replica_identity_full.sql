-- ============================================================
-- Migration 007: Realtime UPDATE 이벤트 클라이언트 도달 보장
-- ------------------------------------------------------------
-- 문제: REPLICA IDENTITY DEFAULT는 변경 전 row의 PK만 WAL에 기록한다.
-- Supabase Realtime + RLS는 UPDATE 이벤트의 RLS 검증 시 변경 전 row 컬럼
-- (conversation_id, user_id 등)을 사용하므로 정보가 부족해 이벤트가
-- 클라이언트에 도달하지 않는다.
--
-- 해결: 영향받는 테이블에 REPLICA IDENTITY FULL 설정.
-- (UPDATE 전 row 전체를 WAL에 기록 → RLS 검증 + payload.old 사용 가능)
--
-- 비용: WAL 크기 약간 증가. 운영상 영향 미미.
-- ============================================================

alter table public.direct_messages replica identity full;
alter table public.notifications   replica identity full;
