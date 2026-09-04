-- 147: 워크플로우(n8n식 자동화 캔버스) 기능 전면 삭제 — 대표 결정, AI 에이전트에 집중.
-- 확인된 사실(2026-09-04 조사): 다른 테이블에서 workflows·workflow_runs를 참조하는 FK 없음.
-- 실사용: workflows 8행·workflow_runs 16행, 전부 EQURIA 자체 dogfood(대부분 미명명 "새 워크플로우",
-- 방치 흔적) + 샘플컴퍼니 데모용 1개(랜딩 스크린샷용, 실행 0건). 실 고객 데이터 없음.
-- workflows_plan_gate 트리거(마이그143)는 테이블과 함께 자동 소멸 — 별도 조치 불필요.
-- 롤백: 불가(DROP). 스키마는 018_workflow_runs.sql·016~017_workflows_*.sql로 재구성 가능하나 행 데이터는 복구 안 됨.
drop table if exists public.workflow_runs;
drop table if exists public.workflows;
