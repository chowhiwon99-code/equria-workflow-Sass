# Phase B1 — 테넌트 격리(멀티테넌시 B단계) 설계

> 상태: **설계 확정안 · 코드 미적용.** 레드팀 1차 검토 반영본. 대표 승인 후 마이그 `033`부터 착수.
> 상위 문서: `PRODUCTIZATION.md`(전체 로드맵) · `HANDOFF.md`(현재 상태) · 근거 라이브 RLS 인벤토리(24개 테이블 전 정책, 2026-06-09 조회).
> 작성: 2026-06-09 (세션 8, 멀티에이전트 설계 3에이전트: 설계 → 적대적 레드팀 → 종합).

---

## 1. 한눈 요약

지금은 "회사(워크스페이스)" 칸막이가 DB에 **그려만 져 있고 닫혀 있지 않다.** 같은 로그인만 돼 있으면 직원 명단·일정·재무·세금·DM·에이전트가 회사 경계 없이 서로 보인다. B1은 이 칸막이를 실제로 닫는다: (1) 모든 DB 접근 규칙(RLS)을 "내가 속한 워크스페이스 데이터만"으로 재작성, (2) 새 데이터 저장 시 어느 워크스페이스 것인지 앱이 반드시 명시, (3) 실시간 접속·파일·알림 등 RLS 밖 영역까지 워크스페이스로 가름. 되돌릴 수 있는 마이그 14개(033~046)로 쪼개 순서대로 적용하고, 테스트 워크스페이스 2개로 "서로 안 보인다"를 매 단계 확인한다.

**가장 중요한 통찰:** **읽기 격리(033~041)만 먼저 켜면 누출의 ~90%가 앱 변경 없이 막힌다**(현 단일 테넌트 EQURIA엔 체감 변화 없음). 쓰기 강제(043~046, 위험구간)는 두 번째 회사가 실제로 임박할 때 켜도 된다.

---

## 2. 핵심 메커니즘 — "현재 워크스페이스"를 RLS가 아는 법

### 2.1 결정: "멤버십 헬퍼 함수(읽기) + 앱 명시(쓰기)" 하이브리드 — JWT hook 불필요

한 직원이 여러 회사에 소속될 수 있으므로(030 `workspace_members`는 다대다), JWT에 "현재 워크스페이스 1개"만 박는 방식은 읽기엔 부족하다. 역할을 나눈다:
- **읽기(SELECT) = 멤버십 헬퍼 함수.** `auth_user_workspace_ids()`가 "내가 속한 워크스페이스 전부"를 돌려주고, 모든 SELECT 정책은 `workspace_id in (select auth_user_workspace_ids())`로 격리. **JWT custom claim hook 없이 동작**(불확실성 회피).
- **쓰기(INSERT) = 앱이 명시한 `workspace_id`.** DB가 추측 안 함. 앱(WorkspaceProvider)이 현재 워크스페이스를 알고 INSERT에 직접 넣음. `with check (is_workspace_member(workspace_id))`로 남의 워크스페이스 쓰기 차단.

> **원안 대비 핵심 수정(레드팀 반영):** 원안은 INSERT를 JWT 기본값에 의존 → JWT hook이 Supabase 배포 제약으로 불확실. 그래서 **읽기는 멤버십 함수, 쓰기는 앱 명시**로 뒤집어 JWT 없이도 성립하게 함. JWT claim은 "있으면 더 빠른 최적화"로만 선택 사용.

### 2.2 sentinel DEFAULT가 격리를 우회한다 (블로커) → 처리

030이 `workspace_id NOT NULL DEFAULT 'equria'(...e1)`를 걸어 기존 코드가 안 깨졌지만, 이게 그대로면 앱이 `workspace_id` 없이 INSERT하면 전부 sentinel로 들어가 equria 멤버끼리 다 보인다. 처리:
1. 앱이 **모든 INSERT에 workspace_id 명시**하게 된 뒤,
2. 마이그에서 **DEFAULT 제거** → workspace_id 누락 INSERT는 NOT NULL 위반으로 **즉시 실패**(조용한 오염 대신 시끄러운 에러 = 안전).
3. 기존 데이터는 백필로 진짜 'equria' 워크스페이스에 귀속(현 단일 회사라 자연스러움).
> **순서가 생명:** DEFAULT 제거는 앱이 100% workspace_id를 넣게 된 **다음**. 거꾸로면 운영 정지.

### 2.3 헬퍼 함수 3종 (마이그 033)

| 함수 | 시그니처 | 용도 |
|------|----------|------|
| `auth_user_workspace_ids()` | `returns setof uuid` **security definer stable** | 모든 SELECT 격리 |
| `is_workspace_member(ws_id uuid)` | `returns boolean` **security definer stable** | INSERT/UPDATE `with check` |
| `current_workspace_id()` | `returns uuid`(JWT 읽기, 없으면 NULL) | **선택적 최적화** — 없어도 설계 완결 |

- `stable` = PostgreSQL이 한 쿼리에서 멤버십을 **한 번만** 계산(여러 정책 반복 호출에도 비용 안 곱해짐).
- `security definer` + 내부 `where user_id = (select auth.uid())` → 권한상승 없이 본인 한정.
- 인덱스: 033에서 `(user_id, workspace_id)` 복합 인덱스 추가 → 인덱스-온리 스캔.

---

## 3. RLS 재작성 — 테이블 그룹별 패턴

**원칙: 기존 기능(가시성·소유권·소프트삭제)을 그대로 보존하고 `workspace_id` 조건을 AND로 한 겹 더 씌운다.** `is_public`은 여전히 공개지만 이제 **"내 워크스페이스 안에서만 공개"**(타 테넌트엔 절대 노출 안 됨).

- **그룹 A — 완전개방 SELECT(최우선):** `calendar_events`·`finance_entries`·`tax_invoices`·`business_cards`·`files`·`mcp_servers/tools`·`profiles`. 현재 `auth.uid() is not null` → `workspace_id in (select auth_user_workspace_ids())`. INSERT는 `is_workspace_member(workspace_id)` + 기존 소유자 조건.
- **그룹 B — 소유자/공개(소프트삭제 fix 보존):** `agents`·`workflows`·`projects`·`notifications`. `(created_by=auth.uid() and ws in (...)) or (is_active and is_public and ws in (...))`. 031·032 소프트삭제 fix 유지한 채 workspace만 합산.
- **그룹 C — 사용자별 개인:** `conversations`·`assistant_*`·`messages`·`workflow_runs`·`agent_usage`. `user_id=auth.uid() and ws in (...)`. 자식은 부모(conversation_id) EXISTS로 자동 격리.
- **그룹 D — 채팅(DM):** `direct_conversations`·`direct_messages`·`message_attachments`·`message_reactions`. `(user_a=auth.uid() or user_b=auth.uid()) and ws in (...)` + INSERT 시 **두 참여자가 같은 워크스페이스 멤버** 검증(현재는 교차회사 DM 가능 — 레드팀 5번).
- **그룹 E — 간접격리(부모 통해):** `agent_versions`·`user_agent_pins`. 자체 ws + **부모 agent EXISTS 이중검증**(system_prompt 누출 차단 — 레드팀 4번).
- **그룹 F — 글로벌 유지:** `google_connections`(개인 OAuth 토큰) = `user_id=auth.uid()`만. 변경 없음.

---

## 4. Cross-cutting — RLS만으로 안 닫히는 곳

- **4.1 `profiles`(workspace_id 컬럼 없는 전역) — high:** "같은 워크스페이스 동료만" 보이게 `workspace_members` 이중 조인 정책. 느려지면 materialized view로 승격(초기엔 RLS로 충분). INSERT/UPDATE는 기존 `auth.uid()=id` 유지.
- **4.2 `directory_contact()` RPC(PII) — high:** target이 호출자와 같은 워크스페이스 멤버일 때만 반환하도록 함수에 가드 추가. DM "동일 워크스페이스" 검증도 동일 패턴 재사용.
- **4.3 Storage 버킷 — low~med:** RLS가 workspace_members 조인 불가. **초기안(권장):** 앱-레벨 가드(업로드 전 멤버십 검증, URL 앱에서만 생성). **강화안(후속/B2):** 경로 `{workspace_id}/{user_id}/...` + 정책.
- **4.4 Realtime presence — med:** `usePresence.ts:17` `channel("presence-workspace")` 하드코딩 → `presence-workspace-${currentWorkspaceId}`로 동적화 + 전환 시 재구독.
- **4.5 service_role API 라우트 — low:** `api/mcp/servers`·`finance/ocr`·`finance/tax-invoice`·`google/callback` 등 admin 클라이언트가 RLS 우회 INSERT → 각 라우트에서 현재 워크스페이스 추출·멤버십 검증·`workspace_id` 명시. RLS가 안 막는 만큼 앱이 100% 책임.
- **4.6 교차테넌트 FK 정합성 — med:** `agent_versions.agent_id` 등 부모-자식 workspace 불일치를 BEFORE INSERT/UPDATE 트리거로 검증(데이터 정합 보험).
- **4.7 트리거 workspace_id 전파 — med:** `handle_new_dm`·`handle_event_done`·`handle_project_assigned`가 `notifications` INSERT 시 부모 workspace_id 복사(현재 sentinel로 샘). 컬럼은 030에 이미 존재 → 함수 본문만 수정.
- **4.8 앱 WorkspaceProvider(블로커, 선행조건):** `src/`에 없음. `WorkspaceContext`/`WorkspaceProvider`(`(app)/layout.tsx` 래핑) + `useWorkspace(){currentWorkspaceId, availableWorkspaces, switchWorkspace}` + 로그인 후 멤버십 로드 + 모든 `.insert()`에 `workspace_id` + 전환 시 클라이언트 캐시 무효화.

---

## 5. 레드팀 구멍 & 반영 (severity 순)

| # | 구멍 | sev | 반영 |
|---|------|-----|------|
| 1 | INSERT가 sentinel로 샘 | **blocker** | §2.2 앱 명시 후 DEFAULT 제거 |
| 2 | WorkspaceProvider 부재 | **blocker** | §4.8 선행조건 1순위 |
| 3 | profiles 전역 PII 누출 | high | §4.1 동료 한정 + §4.2 RPC |
| 4 | agent_versions system_prompt 누출 | high | 그룹 E 부모 이중검증 |
| 5 | DM 교차회사 가능 | high | 그룹 D + §4.2 동일 ws 검증 |
| 6 | 재무/세금/일정/명함 완전개방 | high | 그룹 A workspace 필터 |
| 7 | MCP 완전개방 | high | 그룹 A + §4.5(임시 admin-only, 정식 결정 B2) |
| 8 | is_public 워크스페이스 무시 | med | 그룹 B workspace AND 상위 우선 |
| 9 | Realtime presence 하드코딩 | med | §4.4 채널 동적화 |
| 10 | 교차테넌트 FK 무검증 | med | §4.6 검증 트리거 |
| 11 | 트리거 workspace_id 미복사 | med | §4.7 부모 복제 |
| 12 | 첨부/리액션 명시 체크 없음 | low | 그룹 D 상속 |
| 13 | Storage 워크스페이스 미검증 | low | §4.3 앱 가드(초기) |

**미결(제품 결정 필요):** MCP를 회사별 격리 vs 전사 공용. B1은 임시로 **admin-only로 닫고**(현 open보다 안전), 정식 결정은 B2로.

---

## 6. 적용 순서 & 검증 (safe-changes: 추가 우선, 파괴는 검증 후, 전부 되돌릴 수 있게)

**읽기 격리 먼저(누출 즉시 차단), 쓰기 강제(DEFAULT 제거)는 앱 배선 끝난 맨 마지막.**

| 단계 | 작업 | 성격 | 위험 |
|------|------|------|------|
| 0 | 앱: WorkspaceProvider+useWorkspace(DB 무변경) | 선행 | 낮음(플래그 off 가능) |
| 033 | 헬퍼 함수 3종 + 복합 인덱스 | additive·멱등 | **무위험** |
| 034 | profiles SELECT 동료 한정 | 정책 교체 | 낮음 |
| 035 | 완전개방 테이블 SELECT 격리 | 정책 교체 | 낮음 |
| 036 | 소유자/공개 + workspace AND | 정책 교체 | 낮음 |
| 037 | 개인대화 격리 | 정책 교체 | 낮음 |
| 038 | 간접격리(agent_versions 등) | 정책 교체 | 낮음 |
| 039 | directory_contact() 가드 | 함수 교체 | 낮음 |
| 040 | 트리거 workspace_id 전파 | 함수 교체 | 낮음 |
| 041 | MCP admin-only 임시 | 정책 교체 | 낮음 |
| 042 | (선택) 교차 FK 검증 트리거 | additive | 무위험 |
| 043 | **앱: 전 INSERT workspace_id + service_role 라우트** | 코드 | **중**(앱-DB 동기) |
| 044 | 앱: presence 채널 동적화 | 코드 | 낮음 |
| 045 | sentinel 데이터 → 실워크스페이스 백필 | 데이터 이동 | 중(백업 후) |
| 046 | **DEFAULT 제거 + NOT NULL**(쓰기 강제 켜기) | 파괴적·맨 마지막 | **중** |

- **033~041(읽기 격리)은 앱 코드 변경 없이 먼저 적용 가능** — 읽기가 닫혀도 단일 테넌트 EQURIA는 정상(체감 변화 없음). 위험은 043~046(쓰기 배선·DEFAULT 제거)뿐.
- 각 정책 교체는 `drop policy if exists`→`create policy` 멱등 + 기존 정책 원문을 마이그 주석에 보존(즉시 롤백).

**검증 — 테스트 워크스페이스 2개:** `ws_test_1`/`ws_test_2`, `user_a`(둘 다)·`user_b`(1만)·`user_c`(2만).
- 교차 READ: a@ws1→ws1만, b는 ws2 0건 · 교차 WRITE: a@ws1 INSERT→ws1, c 조회불가 · DM: a·b(ws1) 가능, a@ws2는 b 못찾음 · Presence: a@ws1은 `presence-ws_1`만 · 트리거: ws1 일정→알림 ws1 · DEFAULT 제거 후: workspace_id 누락 INSERT 즉시 에러 · 롤백 멱등 · `EXPLAIN ANALYZE`로 인덱스·함수 단일계산.

---

## 7. 규모 & 다음 액션

**규모(1인 기준):** DB 마이그 14개 ~2~3일 · 앱 배선(WorkspaceProvider+전 INSERT+service_role+presence) ~3~4일(가장 큼) · 교차 검증 ~1~2일 · **합계 ~1.5~2주.** 위험은 일정이 아니라 **순서**(DEFAULT 조기 제거 = 운영 정지).

**권장 착수 순서(승인 시):**
1. `033` 헬퍼+인덱스(무위험·멱등) → `EXPLAIN`으로 함수 단일계산 확인.
2. `034`~`035` profiles+완전개방 SELECT 격리(누출 즉시 차단, 앱 변경 불필요).
3. 병행: WorkspaceProvider 골격.
4. 2워크스페이스 교차 READ 검증 후 `036`~`041`.
5. 쓰기 강제(`043`~`046`)는 **별도 승인 게이트** — 앱 배포 동기 후 마지막.

**B1을 둘로 나눠 가기(권장):**
- **B1-a(지금·저위험·고가치):** 033~041 읽기 격리 + WorkspaceProvider 골격 → PII/재무/일정/DM 누출 즉시 차단.
- **B1-b(2번째 회사 임박 시):** 043~046 쓰기 강제(앱-DB 동기·DEFAULT 제거).
