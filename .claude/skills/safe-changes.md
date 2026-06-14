---
name: safe-changes
description: EQURIA Workspace의 모든 코드/DB 변경에서 "꼬임 방지(maintainability)"를 보장하는 설계 원칙. 파일을 수정·추가하거나 마이그레이션을 적용하기 전 반드시 따른다. 사용자 지정 최우선 원칙.
---

# Safe Changes — 꼬임 방지 설계 원칙 (최우선)

> 사용자 명시 원칙(2026-05-30): **"모든 작업에서 수정이 들어가도 코드가 꼬이지 않도록 설계할 것."**
> 이 파일은 기능 작성 전 `latest-stack.md`와 함께 본다. 충돌 시 이 원칙이 우선.

## 0. 한 줄 요약
**추가(additive)는 자유롭게, 파괴(destructive)는 검증 후. 모든 변경은 되돌릴 수 있고 재현 가능해야 한다.**

---

## 1. DB는 항상 SSOT (Single Source of Truth)
- **모든 DDL은 ① MCP `apply_migration`로 원격 적용 + ② 동일 SQL을 `supabase/migrations/NNN_*.sql`로 파일화**. 둘 중 하나만 하면 "꼬임"의 시작. DB-only 변경 금지.
- 마이그레이션 번호는 **순차**(현재 061까지·64파일). 새 변경 = 다음 번호.
- 스키마 변경 후 **`types.ts` 재생성**(`generate_typescript_types`) 또는 해당 타입 수동 반영 → 코드/DB 타입 불일치 방지.
- **마이그레이션은 멱등(idempotent)하게**: `create table if not exists`, `create or replace function`, `drop ... if exists`, `create policy` 전 `drop policy if exists`. 재실행해도 안전하게.

## 2. 추가 > 수정 > 삭제 (Additive-first)
- 가능하면 **기존을 건드리지 말고 더한다**: RLS는 새 permissive 정책을 OR로 추가(예: 010 `chatfiles_participant_read` — 기존 본인폴더 정책 유지), 컬럼은 **nullable로 추가**(기존 행/코드 안 깨짐), 함수는 `create or replace`.
- **DROP/DELETE/하드삭제는 "검증 후"에만**: 먼저 ① 대상을 읽고 ② `begin … rollback` 트랜잭션으로 영향 시뮬레이션 ③ 정말 안전하면 실행. (명함 삭제 트리거 사건 = 검증 없는 잔존 DROP 누락이 원인)
- 기존 동작을 바꾸는 변경이면 **모든 호출부를 먼저 확인**하고 하위호환 유지.

## 3. 사용자 데이터는 Soft-delete (휴지통) 기본
- finance_entries / business_cards / direct_messages 등 사용자 데이터 삭제 = **하드삭제 금지, `deleted_at` 마킹**. 목록은 `deleted_at is null` 필터.
- 이유: ① 실수 복구 ② Undo와 자연스럽게 맞물림(마킹 토글) ③ Storage 고아파일/직접삭제 트리거 차단 문제 회피.
- 영구삭제(purge)는 **별도 메커니즘**(Edge Function + pg_cron, N일 경과분)으로 분리. 트리거에서 `storage.objects` 직접 DELETE 절대 금지(Supabase가 차단 → 트랜잭션 전체 실패).

## 4. Undo와 정합 유지
- 모든 데이터 변경(생성/수정/삭제/상태)은 `useUndo().push({label, undo, redo})`로 **역연산 등록**. 패턴: 생성=undo가 delete(또는 deleted_at 마킹), 삭제=undo가 복구, 수정=이전값 보존.
- Soft-delete면 undo/redo는 **같은 id의 `deleted_at` 토글** — 행·Storage 경로가 그대로라 가장 안전(재insert보다 우수).

## 5. Supabase 쿼리 실행 규칙
- 쿼리 빌더는 **lazy thenable** — `await` 또는 `.then` 없으면 **HTTP 전송 자체가 안 됨**. `void supabase.from(...).update(...)` 단독 금지. (DM 읽음 버그의 원인)
- RLS로 막히면 **SECURITY DEFINER RPC** 고려. 단 SECURITY DEFINER 함수는 `set search_path=''` 고정 + 트리거 전용이면 `revoke execute from anon, authenticated`.
- 모든 테이블 접근은 RLS 통과 전제. `service_role`은 서버 전용.

## 6. 코드 일관성 (꼬임은 대개 중복에서 온다)
- **SSOT 모듈 재사용**: `lib/config/features.ts`, `lib/finance.ts`, `lib/projects.ts`, `lib/calendar.ts`, `lib/upload.ts`, `components/shared/*`, `UndoProvider`. 새 구조 남발 금지.
- 주변 코드의 네이밍/패턴/주석 밀도에 맞춘다. 컴포넌트 PascalCase / 유틸 camelCase / 상수 UPPER_SNAKE.
- 한 가지 일은 한 곳에서. 같은 로직을 두 컴포넌트에 복붙하지 말고 공용화.

## 7. 매 변경 후 검증 (생략 금지)
1. `npx tsc --noEmit` → **0 에러** (타입 any 금지).
2. DB 변경이면 `get_advisors`(security/performance)로 새 ERROR/WARN 확인.
3. RLS 변경이면 `set local role authenticated; set local request.jwt.claims=...` 트랜잭션 시뮬 후 rollback로 정책 검증.
4. dev 로그 runtime error 확인 / UI는 Dia에서 확인.

## 8. 커밋·세션 위생
- **트랙/관심사 단위로 커밋 분리**(검증/버그픽스/기능). 섞으면 롤백·리뷰 어려움.
- 푸시는 사용자 요청 시에만(main 푸시 = Vercel 자동배포). 로컬 커밋으로 트리 정리는 자유.
- 세션 끝 **HANDOFF.md 갱신 — 검증완료 / 미검증 분리 명시**. 추측을 사실로 적지 않는다.

## 9. 객관적 보고
- "수정함"과 "검증함"을 구분해 보고. DB로 확인한 것, UI로 확인한 것, 아직 안 본 것을 명확히.
- 실패/스킵은 숨기지 않고 그대로 보고.

---

### 체크리스트 (변경 직전 빠른 점검)
- [ ] 추가로 끝낼 수 있나? (DROP/하드삭제 피했나)
- [ ] DDL이면 마이그레이션 파일 + 원격 적용 둘 다 했나
- [ ] 멱등하게 작성했나 / 기존 호출부 안 깨지나
- [ ] Supabase 쿼리에 await/.then 있나
- [ ] Undo 역연산 등록했나 (데이터 변경 시)
- [ ] `tsc --noEmit` 0 에러 + (DDL 시) advisors 확인했나
