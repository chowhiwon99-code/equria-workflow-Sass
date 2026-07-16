# 에이전트 학습·기억 + 생성물 파이프라인 — 기획·기술 병목 분석 (설계 前)

> 상태: **기획/병목 분석 단계(구현 X).** 2026-07-16(세션35) 대표 지시로 착수. 리서치 2갈래(개인 메모리 at scale · RAG/생성 파이프라인 at scale) 종합.
> 관계 문서: `AGENTS-MCP-STRATEGY.md`(에이전트 차별화·§4 온보딩 인터뷰) · `B1-DESIGN.md`(테넌트 격리) · `HANDOFF.md`(현재 상태) · `PRODUCTIZATION.md`(로드맵).
> **핵심 명제(대표):** "계속 같으면 의미가 없다." 에이전트는 **쓸수록 그 사람에게 맞춰 좋아져야** 하고, 이게 **많은 사용자가 생겨도** 무너지면 안 된다. 결과물은 **바로 저장·확인**돼야 한다.

---

## 0. 한눈 결론

- **"학습" = 모델 재학습(파인튜닝)이 아니라, 앱 레벨 "기억"이다.** 매 작업 후 오래 쓸 사실·선호·교정을 뽑아 저장했다가 다음 요청 컨텍스트에 다시 넣는다. 이걸로 "나에게 맞춰 똑똑해지는" 체감의 ~70%를 얻는다. (한계는 §2.)
- **스케일의 진짜 병목은 저장량이 아니라 "무엇을·얼마나 컨텍스트에 넣느냐"와 "테넌트 격리"다.** 저장·임베딩 비용은 사실상 반올림 오차. 비용의 80%는 매 호출에 얹는 추가 토큰 → **프롬프트 캐싱**이 결정적 지렛대(~90% 절감).
- **격리는 앱 코드가 아니라 DB(RLS)가 강제해야 한다.** 검색 한 줄이 테넌트 필터를 빠뜨리면 회사 간 데이터 유출 = 치명. service_role로 사용자 검색 금지.
- **대표의 higgsfield 워크플로우 = "지식 주입 → 생성 → 좋으면 학습 → 반복하며 퀄↑"** 는 그대로 제품화 가능: **지식파일(있음) + 기억(신규) + 생성 잡큐 + 승인→레퍼런스 재투입**의 조합. 단 생성은 분 단위라 **비동기 잡큐**가 필수(웹 요청에서 기다리면 안 됨).
- **지금 대용량 RAG는 불필요.** 대부분 회사 자료는 ~150쪽 미만 → **통째로 넣고 캐싱**이 더 정확·단순. RAG는 자료가 창을 넘길 때 켠다.

---

## 1. 대표 워크플로우 → Complow 매핑

대표의 실제(로컬 iTerm2) 흐름과 Complow 구성요소 대응:

| 대표 로컬 단계 | Complow 구성요소 | 상태 |
|---|---|---|
| 1. higgsfield 활용법·중요 포인트 자료 주입 | **에이전트 지식파일**(`agent_knowledge`, 097) + **기억**(신규) | 지식=있음 / 기억=신규 |
| 2. 레퍼런스 사진 분석 → 이미지 생성 | **higgsfield MCP**(generate_image/video, show_reference_elements) | MCP 있음 / 잡큐 신규 |
| 3. 결과 좋으면 학습(내 컴퓨터) | **승인→레퍼런스 세트 + 기억에 "무엇이 좋았나" 축적** | 신규 |
| 4. 반복할수록 퀄↑ | **승인분을 다음 생성의 레퍼런스로 재투입 + 캐싱** | 신규 |
| (로컬 디스크에 저장·확인) | **Supabase Storage(회사별) + 리뷰/승인 UI** | 신규 |

→ "각자 최고로 맞는 커스터마이징"의 실체 = **개인×에이전트별 기억 + 승인된 결과물이 쌓여 다음 작업을 더 좋게** 만드는 루프.

---

## 2. "학습"의 정확한 정의 — 할 수 있는 것 / 없는 것

**우리가 하는 것 = 검색/기억(retrieval), 파인튜닝 아님.** 실시간·사용자별 모델 가중치 갱신은 안 한다(느리고 비싸고 개인정보 문제). 모든 "좋아짐"은 **컨텍스트 창에 무엇을 넣느냐**를 바꿔서 달성한다.

| 앱레벨 기억이 할 수 있는 것 | 파인튜닝만 할 수 있는 것 |
|---|---|
| 사용자 사실·선호·과거 결정 기억 | 모델의 근본 추론/능력 상한 올리기 |
| 교정 반영("격식체 쓰지 마", "회계연도 4월 시작") | 수천 개 예시를 싸게 내재화(기억은 매번 토큰비용) |
| 좋은 결과를 few-shot 예시로 재사용 | 글로 못 적는 암묵 패턴 학습 |
| 세션 간 맥락 이어가기 | — |

> 한 줄: **기억은 "이번 턴에 무엇을 아는지"를 바꾸고, 파인튜닝은 "무엇인지"를 바꾼다.** 우리 목표엔 기억으로 충분.

---

## 3. 아키텍처 개요 — 3개 레이어

에이전트가 컨텍스트에 넣는 것을 3층으로 분리(각각 수명·주체가 다름):

```
[정적] 지식(Knowledge)   = 에이전트가 참고할 회사 자료(파일). 에이전트 단위·잘 안 변함. → agent_knowledge(있음)
[학습] 기억(Memory)      = 이 사용자가 이 에이전트를 쓰며 쌓인 사실·선호·교정. 사용자×에이전트. → agent_memories(신규)
[실행] 생성물(Artifacts) = 작업 결과(이미지·문서 등) + 승인분이 다음 작업의 레퍼런스로 재투입. → generation_jobs+files(신규)
```

컨텍스트 조립 순서(프롬프트 캐싱 최적):
```
system(에이전트 매뉴얼) → 지식파일(에이전트 단위, 캐시) → 기억 프로필(사용자 고정분, 캐시) → [캐시 분기점] → 검색된 기억(가변) + 최근 대화
```
→ 앞쪽 고정 블록은 캐시 재사용(읽기 ~0.1×), 뒤쪽 가변만 매번 새로 계산.

---

## 4. 기술 병목 분석 (핵심)

### 4-A. 학습/기억이 많은 사용자에서 무너지는 지점

| 병목 | 왜 터지나 | 완화(설계) |
|---|---|---|
| **① 기억 무한 증식** | 매 턴 append 하면 사용자당 수천 행·대부분 중복 | 쓰기 전 **중복검출**(유사분 조회 후 add/update/skip 판정) · 주기적 **통합(consolidation)** · **감쇠**(use_count·last_used_at, N일 미사용 아카이브) · **상한**(에이전트당 활성 ≤200, 최저점수 축출) |
| **② 검색 지연·관련성** | 너무 적게 넣으면 잊고, 많이 넣으면 노이즈·토큰폭증·느림 | **항상넣는 프로필(≤~600토큰)** + **top-k 5~10 검색(≤~900토큰)**, 총 기억예산 **~1.5K토큰/호출** · pgvector HNSW로 한자리 ms · 유사도 하한(코사인 <0.3 버림) |
| **③ 틀린·낡은·상충 기억** | 추출이 환각, 사용자 마음 바뀜, 두 기억 모순 | **confidence 점수**(임계 이상만 자동주입) · **supersede**(새 기억이 상충 시 옛것 status=superseded, 감사용 보존) · **사용자 편집/삭제 UI**(신뢰·컴플라이언스 필수) · **provenance**(어느 대화에서 뽑혔는지) |
| **④ 사용자·테넌트 격리** ⚠️치명 | 검색이 테넌트 필터 빠뜨리면 회사 간 유출 | **RLS가 백스톱**: 모든 행 `company_id`+`user_id`, 정책이 매 쿼리 강제 → 버그 있어도 못 넘음 · 사용자 검색은 **RLS 스코프 연결로만**(service_role 금지) |
| **⑤ 사용자당 비용(N명 규모)** | 추가 입력토큰 + 임베딩 + 저장 | 모델(추정): 주입 ~1.5K토큰×$3/1M=**$0.0045/호출**(캐싱 시 $0.001~0.002) · 추출 Haiku 1패스/세션≈$0.0045 · 임베딩·저장=**<$0.01/유저·월**(무시) · **전부 합쳐 ~$0.5~2/활성유저·월**, 80%가 주입토큰 → **캐싱·상한이 주 지렛대** |
| **⑥ 컨텍스트 창 압박** | 기억이 대화+지식파일과 창 다툼 | **컨텍스트 예산** 강제: 지식(고정)+기억(~1.5K상한)+대화(최근10개 슬라이딩, 이미 있음). 지식파일 크면 기억은 포인터/요약층으로 |

### 4-B. RAG(대용량 지식) 임계와 격리

- **언제 통째로 넣기(full-context)를 멈추고 RAG로 가나:** 창 크기가 아니라 **비용×질의량·지연**이 벽. (Claude 최신 모델은 대부분 1M 컨텍스트, Haiku 4.5만 200K.)
  - **<~50K토큰(~75쪽): 항상 통째로.** RAG는 순오버헤드.
  - **50~200K(~75~300쪽): 통째로 + 프롬프트 캐싱.** (대부분 회사가 여기 → **RAG 불필요, 테넌트별 캐싱만**.)
  - **200K~1M: 회색지대** — 캐싱으로 버티되 지연·비용이 retrieve-then-inject 쪽으로.
  - **>1M: RAG 필수.**
- **pgvector 격리 함정(중요):** HNSW/IVFFlat는 근사검색이라 `ORDER BY embedding LIMIT k`가 **먼저 전역 ANN → 그 다음 테넌트 필터** → 글로벌 top-k가 전부 남의 테넌트면 **본인 자료 있는데도 0건**. → **pgvector iterative index scan**(Supabase 지원, `hnsw.iterative_scan`) 켜기 · 중간규모 다수 테넌트는 `tenant_id` **파티셔닝** · 거대 테넌트만 부분/별도 인덱스.
- **인덱스 RAM이 실벽:** 1536dim float32 HNSW ≈ **~7GB/100만 벡터**. 8~16GB 인스턴스 = ~1~2M 벡터. 넘으면 `halfvec`(2바이트, RAM 절반)·Matryoshka 차원축소(1536→512)·샤딩.
- **임베딩 비용은 무시 가능:** text-embedding-3-small $0.02/1M → 1000쪽 코퍼스 임베딩 ≈ **$0.012**. 모델 바꿔 재임베딩도 사실상 공짜 → 과설계 금지.

### 4-C. 생성물(higgsfield) 파이프라인

| 병목 | 왜 | 완화 |
|---|---|---|
| **긴 실행이 Vercel 함수 시간초과** | 영상/오디오 생성=분 단위, Vercel 함수 상한(Pro 800s) | **요청은 <1s에 반환**: 잡 행 insert + higgsfield 잡 제출 → job_id 반환. 실제 진행은 **오프-Vercel 워커**(Supabase Queues `pgmq` + `pg_cron` + Edge Function)가 폴링/완료처리. 웹훅 가능하면 웹훅+크론 백업 |
| **동시성·레이트리밋·비용폭주** | 생성은 비쌈, 한 테넌트가 독점/무한재시도 | enqueue에서 게이트: **테넌트별 동시 상한**(초과분 queued) · 전역 상한(higgsfield 레이트) · **크레딧**(enqueue 예약→성공 정산→실패 환불) · 재시도 상한 + **idempotency key**(더블클릭 이중과금 방지) |
| **결과 저장·확인** | 로컬 디스크 대신 웹 | **비공개 Storage 버킷 회사별 경로** + 서명URL(공개버킷 금지) · `files`↔`generation_job`↔`agent` 연결 · **리뷰 UI**(pending→approved/rejected) |
| **학습 루프(핵심가치)** | "좋으면 학습 → 반복 퀄↑" | 승인 시 **레퍼런스 세트**에 추가 → 다음 생성에 (1) higgsfield 레퍼런스/캐릭터로 조건부여 (2) "무엇이 좋았나/피할 것" 기억파일에 축적(캐싱) |
| **비개발자 UX** | 스택트레이스·폴링 금지 | **Realtime 구독**으로 잡 상태 실시간(대기→생성중+ETA→확인가능→승인) · 실패는 사람말("생성 실패 — 크레딧 미차감 [다시]") · 재시도는 조용히 |

---

## 5. 단계별 계획 (안전·추가형, 각 단계 트리거)

### 학습/기억
| 단계 | 무엇 | 다음으로 넘어가는 트리거 |
|---|---|---|
| **v1 — 초간단(추출만)** | `agent_memories` **plain table**(벡터 없음). 세션 후 Haiku 1패스로 (사용자,에이전트)당 오래쓸 사실·선호 ≤~10개 추출·중복병합. **전부** 매 호출 system에 주입(캐시 분기 뒤). **사용자용 기억 목록 + 편집/삭제** 필수. | 사용자가 활성 기억 ~20~30개 초과, 또는 다 넣으면 토큰예산 초과 |
| **v2 — 의미 검색** | pgvector 추가(embedding+HNSW). 프로필은 항상넣기 유지 + 질의 임베딩으로 **top-k 5~10** 검색. use_count/last_used_at + 야간 **감쇠·통합** 잡. | 검색품질 불만, 상충 기억, 사용자당 수백 개 |
| **v3 — 큐레이션·자가개선** | confidence 게이팅 · supersede · (k 크면) Haiku 경량 rerank · 에이전트별 "학습된 예시"(승인 결과를 few-shot) · 어느 기억이 성과를 올렸나 분석(검색→👍 상관)으로 점수 튜닝 | 규모/품질 정체 |

**v1부터 시작.** 벡터 인프라 없이 체감 학습의 ~70%(선호·교정·프로필) 확보, 완전 감사·편집 가능, 가장 싸게 정확히.

### 생성물 파이프라인 (독립 트랙, 병렬 가능)
- **g1**: `generation_jobs` 테이블 + enqueue 라우트(즉시 반환) + Edge Function 워커(폴링/저장) + Realtime 상태 + 리뷰 UI.
- **g2**: 크레딧/쿼터·동시성 상한·환불.
- **g3**: 승인→레퍼런스 재투입 루프(학습 v1 기억과 연결).

### 대용량(RAG) — 대기
- 지금 안 함. 트리거 = 실제로 한 테넌트 자료가 ~200쪽/창을 넘김 → 그때 pgvector + iterative_scan + 파티셔닝.

---

## 6. 스키마 스케치 (초안, RLS 필수 — B1 격리 패턴 준수)

```sql
-- 학습/기억 (사용자×에이전트, 테넌트 스코프)
create table agent_memories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,                 -- 테넌트(기존 B1 컬럼 규약)
  user_id uuid not null references profiles(id),
  agent_id uuid not null references agents(id),
  kind text not null check (kind in ('fact','preference','style','correction','episodic')),
  content text not null,                      -- 오래쓸 한 문장
  embedding vector(1536),                     -- v1=NULL, v2에서 채움
  confidence real not null default 0.6,
  source text,                                -- 뽑힌 conversation/message id
  use_count int not null default 0,
  last_used_at timestamptz,
  status text not null default 'active' check (status in ('active','superseded','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 인덱스: (workspace_id,user_id,agent_id,status) btree · v2에서 hnsw(embedding)
-- RLS: workspace_id in auth_user_workspace_ids() AND user_id = auth.uid()  (기존 헬퍼 재사용)

-- 생성물 잡 (테넌트 스코프)
create table generation_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null, user_id uuid not null, agent_id uuid,
  kind text,                                  -- image|video|audio|3d
  status text default 'queued',               -- queued|running|succeeded|failed|canceled
  provider text default 'higgsfield', provider_job_id text,
  params jsonb, progress int, result_file_id uuid, error text,
  cost_credits int, idempotency_key text, attempts int default 0,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
```
> ⚠️ DDL 규칙: MCP `apply_migration` + `supabase/migrations/NNN_*.sql` 둘 다. 격리는 **부모 EXISTS 상속**이 아니라 자체 `workspace_id`+RLS(사용자 데이터라 v1부터 명시).

---

## 7. 대표 결정 필요 (코드 前)

1. **①(갤러리 교체) 범위** — 갤러리를 **완전 제거** vs **열린 인터뷰 입구로 교체 + 예시는 작은 힌트로 축소**(권장). 어느 쪽?
2. **② 시작 지점** — 학습/기억을 **v1(plain table 추출메모리+편집UI)부터** 착수 확정?(권장) 아니면 생성물 파이프라인(g1)을 먼저?
3. **기억 주체 단위** — 기억을 **사용자×에이전트**(개인화 강함, 권장) vs **에이전트 공유**(팀이 같이 학습) vs **둘 다**?
4. **생성물 = 요금 게이팅 대상?** — 생성은 비싸므로 크레딧/쿼터 도입 시점(무료=불가 정책과 정합).
5. **멀티테넌시 선행** — 이 테이블들은 `workspace_id`를 v1부터 명시해야 함 → **B1-b(WorkspaceProvider)** 착수와 묶을지(두 번째 회사 전 필수와 겹침).

---

## 8. 다음 액션

- 대표가 §7 결정 → 이 문서를 **설계(스키마 확정·마이그·주입 파이프라인·UI)**로 확장.
- 병렬 안전 착수 후보: **학습 v1**(DDL 1개+추출패스+주입+편집UI) — 가장 큰 체감, 가장 안전.
- RAG·대용량은 트리거 전까지 대기.

---

## 9. 대표 결정(2026-07-16 확정) + v1 확정 설계

**결정:**
1. 예시 갤러리 → **열린 인터뷰 입구로 교체**(예시=작은 힌트).
2. **학습/기억 v1부터** 설계·구현.
3. 기억 단위 = **개인(사용자×에이전트) 기본** + **"같은 작업 에이전트는 프로젝트 단위 공유 가능"**(scope 2종).

### 9-1. 스키마 (✅ 마이그 099 적용·검증 2026-07-16 — v1은 **개인용만**)
> **실제 적용(v1)** = 개인용만: `personal_tasks`(092)처럼 `user_id` "본인만" RLS. `scope`·`project_id`·`embedding vector`는 **넣지 않음** → 프로젝트 공유(v1.5)·의미검색(v2)에서 nullable 컬럼 **추가형**으로 붙임(재마이그 안전). 실제 SQL = `supabase/migrations/099_agent_memories.sql`. 아래 '풀' 스키마는 **최종 목표 참고용**.

```sql
create table public.agent_memories (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  scope text not null default 'personal' check (scope in ('personal','project')),
  user_id uuid references public.profiles(id) on delete cascade,     -- scope=personal 시 필수
  project_id uuid references public.projects(id) on delete cascade,  -- scope=project 시 필수
  kind text not null default 'preference'
       check (kind in ('fact','preference','style','correction','episodic')),
  content text not null,                 -- 오래 쓸 한 문장
  embedding vector(1536),                -- v1=NULL(플레인), v2에서 채움
  confidence real not null default 0.6,
  source_conversation_id uuid,           -- provenance(어느 대화에서 뽑혔나)
  use_count int not null default 0,
  last_used_at timestamptz,
  status text not null default 'active' check (status in ('active','superseded','archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_memories_scope_shape check (
    (scope='personal' and user_id is not null and project_id is null) or
    (scope='project'  and project_id is not null and user_id is null)
  )
);
create index idx_agent_memories_personal on public.agent_memories (user_id, agent_id, status) where scope='personal';
create index idx_agent_memories_project  on public.agent_memories (project_id, agent_id, status) where scope='project';
```

### 9-2. RLS (격리는 DB가 강제 — service_role 사용자 검색 금지)
```sql
alter table public.agent_memories enable row level security;
-- SELECT: 개인=본인 / 프로젝트=같은 워크스페이스에서 그 프로젝트를 볼 수 있는 멤버(094 상속)
create policy "amem_select" on public.agent_memories for select using (
  (scope='personal' and user_id = auth.uid()) or
  (scope='project' and exists (
     select 1 from public.projects p
     where p.id = agent_memories.project_id
       and p.workspace_id in (select public.auth_user_workspace_ids())))
);
-- INSERT/UPDATE/DELETE 동일 조건(개인=본인, 프로젝트=멤버). created_by=auth.uid() 권장.
```
> ⚠️ v2에서 pgvector 검색도 **반드시 이 RLS 스코프 연결**로(전역 ANN→필터 함정은 `hnsw.iterative_scan`으로). 추출/쓰기 잡이 service_role을 쓰면 user_id/project_id 명시 필수.

### 9-3. 파이프라인 (v1)
- **추출(쓰기):** 대화 종료/새 대화 시작 시 **Haiku 1패스**로 (사용자,에이전트) 오래쓸 사실·선호 ≤~8개 추출 → 기존 활성분과 대조해 add/update/skip(중복병합). + **명시적 "이거 기억해두기"** 어포던스(가장 고품질). `source_conversation_id` 기록.
- **주입(읽기):** 채팅 라우트에서 활성 기억을 **system 블록에 캐시 분기 앞쪽**으로 주입(지식파일 다음). 개인 기억 always. (프로젝트 기억은 9-5 참고.)
- **편집/삭제 UI(필수):** 마이페이지/에이전트별 "기억" 목록 — 사용자가 보고 편집·삭제(신뢰·컴플라이언스). soft-delete + ⌘Z.
- **비용 방어:** 활성 기억 상한(에이전트당 ~30개, v1은 전부 주입) + `agent_usage`로 추출 비용 추적.

### 9-4. v1 착수 단계 (잘게 순차)
1. ✅ 마이그 099(개인용 테이블+RLS) — advisors 신규0 + RLS 시뮬 **A본인=1 / B타인=0** 검증·drift0 완료(2026-07-16).
2. `lib/agentMemory`(순수: 추출 프롬프트·직렬화·주입 빌더) + 추출 API.
3. 채팅 라우트 주입(캐시 분기 정합) + 명시적 "기억해두기".
4. 기억 목록·편집·삭제 UI + soft-delete/Undo.

### 9-5. 프로젝트 공유 = v1.5 (스키마는 v1부터 지원, 노출은 다음)
현재 에이전트 채팅 위젯은 **프로젝트 컨텍스트가 없음**(전역). 프로젝트 기억 주입은 "이 대화가 어느 프로젝트인지" 지정이 선행 → **스키마·RLS는 v1에 넣되(재마이그 방지)**, 실제 프로젝트 기억 생성/주입 UI는 v1 personal 안정화 후 v1.5로. (권장.)
