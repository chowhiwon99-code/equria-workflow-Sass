# 나이스페이 결제 연동 — 구독 결제 · 해지 · 법적 의무

> **이 문서는 결제 트랙의 설계·작업 순서다.** 원래 로컬 플랜 파일이었는데, 대표가 모바일·클라우드에서
> 이어 작업하기 위해 2026-08-18에 레포로 옮겼다(`~/.claude/plans/parallel-cooking-dusk.md` → 여기).
>
> **현재 상태·다음 할 일의 SSOT는 `HANDOFF.md`다.** 이 문서는 *왜 그렇게 설계했는가*를 담는다.
> 둘이 어긋나면 HANDOFF가 맞다.
>
> ⚠️ **2026-08-25 대표 결정으로 연간 결제 상품은 삭제됐다**(나이스페이 심사 미비사항 대응 — 상세는
> `HANDOFF.md` §연간 요금제 삭제). 아래 문서 곳곳의 "연간 결제 = 이번에 포함"·`priceKrwYearly` 관련
> 서술은 **그 결정 이전 설계 기록**이다. DB 제약·환불계산·자동갱신·약관 문구는 되돌리기 쉽게 그대로
> 남겨뒀을 뿐, 실제로 판매 중인 상품이 아니다.
>
> ### 진행 상황 (2026-08-19)
> | 단계 | 상태 | 커밋 |
> |---|---|---|
> | 마이그139 스키마(4테이블·RLS·좌석) | ✅ | `6df4bdd` |
> | 마이그140 처리 RPC 7개 | ✅ | `5acb250` |
> | 연간 요금·금액 산출·자동결제 약관 | ✅ | `0982585` |
> | 요금제 카드 + **24시간 해지** | ✅ | `1f80c46` |
> | 결제 시작 화면 + **자동결제 별도 동의** | ✅ | `cde652d` |
> | 결제창 연결(서명·승인·**망취소**) | ✅ | `d230d68` |
> | 자동 점검 시계(크론) · 웹훅 · 랜딩 가격 파생화 · 결제창 실제 호출 | ✅ | `c21af5b` |
> | 마이그141(승인 유실 복구 · 기간 만료 · 7일 전 고지) | ✅ | `c21af5b` |
>
> **자격증명 없이 만들 수 있는 건 다 만들었다.** 남은 것은 `computeFairRefundKrw()`와
> 취소 통보 처리(환불과 한 묶음), 그리고 실결제 왕복이다.
>
> ### 2026-08-21 추가 — 매달 자동청구 (`d21716a` · DDL 0건)
> `lib/billing/renew.ts` 신규 + `reconcile` 스윕 맨 앞에 연결. 실결제 1건으로 검증된 `provider.charge`를
> 갱신에도 **그대로** 쓴다(첫 결제와 갱신이 같은 경로 = 검증이 한 번으로 끝난다).
>
> **이 문서 §"놓치기 쉬운 함정"에 없던 진짜 함정이 하나 더 있었다**: 청구 요청이 타임아웃되면
> 승인 여부를 **모르는데**, 그 상태를 표현할 자리가 스키마에 없다. `status='ready'`로 두면
> `billing_fail_stale_checkouts`가 6시간 뒤 `failed`로 바꿔버려 "확정된 실패"와 구분이 사라지고,
> 다음날 다시 긁으면 이중 결제다. → **`refund_reason` 접두사(`renew:` = 확정 / `pending:` = 미결)를
> 판단 근거로 삼았다.** 그 함수가 `refund_reason`을 `coalesce`로 보존하는 성질에 기댄 설계이므로,
> **141의 `billing_fail_stale_checkouts`를 고칠 때 이 성질을 깨지 말 것.**
>
> 판정 기준은 상태가 아니라 **"확정 표식이 있는가"** 하나다. 표식이 없으면 무조건 미결 →
> 그 워크스페이스는 청구하지 않는다. 되살리는 유일한 길은 PG **주문번호 조회**
> (`GET /v1/payments/find/{orderId}?orderDate=YYYYMMDD`)이고, "거래 없음"은 응답코드
> (`A118·A243·A251·U107·U126`)로만 판정한다 — `2000`(DB오류)·`A299/U303`(API 지연)·`U501`은
> "결제 안 됨"이 아니라 "모르겠다"다. 이걸 실패로 굳히면 승인된 카드를 다시 긁는다.

---

## 🔴 2026-08-19 규격 확인으로 뒤집힌 가정 3개

아래 설계 문서는 **나이스페이 조회 API·결제통보 규격을 못 본 상태**에서 쓴 것이라,
실제 문서를 확인하니 세 군데가 틀렸다. **아래 문서 본문보다 이 절이 우선한다.**

| 이 문서의 가정 | 실제(문서 확인) | 결과 |
|---|---|---|
| 웹훅 본문의 `signature`를 재계산해 `timingSafeEqual` 비교 | **노티에 서명 필드가 없다**(manual-noti.php) | 서명검증 불가 → **"MID 일치 + TID로 조회 API 재확인"** 으로 대체(더 강한 검증) |
| `tid`로 조회해 `ready` 고아 행을 대사 | 조회 API는 **TID로만** 조회되고, `ready` 행에는 TID가 없다. 응답에 **금액(Amt)도 없다** | 고아 대사는 불가 → **노티가 TID를 물어다 주는 유일한 복구 경로**. 금액 대조는 RPC가 담당 |
| 웹훅은 **항상 200** 반환(재시도 폭주 방지) | 재전송이 **최대 10회 · 1~10분 간격**으로 명시돼 있다 | 폭주 위험이 없으므로, **판정 못 한 경우엔 일부러 OK를 안 준다**(공짜 재시도를 버릴 이유가 없다) |

**추가로 드러난 것 2개**
- 🔴 **프록시가 결제를 통째로 막고 있었다.** `proxy.ts` matcher가 `/api/*`까지 걸리는데,
  결제창이 리턴 URL로 보내는 POST는 **크로스사이트**라 Supabase 세션 쿠키(SameSite=Lax)가 안 실린다
  → 미인증 판정 → `/login` 리다이렉트 → **승인 API가 호출되지 않는다.** 실서버로 재현 확인했다.
- 🔴 **결제창이 실제로 뜨지 않았다.** `CheckoutView.start()`가 checkout API만 부르고 끝났다.
  자격증명을 넣어도 카드사 심사 스크린샷 4·5번을 못 찍는 상태였다.

**Vercel 크론 제약(확인)**: Hobby는 **하루 1회가 상한**이며 더 잦은 cron 식은 **배포가 실패**한다
(±59분 오차). Pro는 1분 단위. 현재 플랜을 API로 확인할 수 없어 **어느 쪽에서도 배포가 깨지지 않는
하루 1회**로 맞췄다. 실시간 복구는 크론이 아니라 **웹훅**이 담당한다.

## Context — 왜 지금 하는가

2026-08-18 나이스페이 전자결제 신청서 제출 + 전자서명이 완료됐다. 지금은 **임시 오픈** 상태로
**30일간만**(→ **2026-09-17**) 결제를 쓸 수 있고, 그 안에 심사가 끝나야 정상 이용된다.
**결제 연동 코드도 이 30일 안에 붙여야 실테스트가 가능하다.** 오늘 기준 결제 코드는 **0줄**이다.

동시에 결제를 받는 순간 **법적 의무가 발생**한다. 계약서 제22조 + 여신전문금융업법 시행령이
정기결제 사업자에게 4가지를 강제하는데, 그중 ①번은 위반 시 **이용자 민원·손해배상을 전부
가맹점이 부담**한다고 계약서에 박혀 있다. 나중에 붙이면 구조를 다시 손대야 하므로 처음부터 넣는다.

**전제가 하나 불확실하다.** 빌링키(자동결제)는 계약서에 특칙(제22조)이 **포함**돼 있으나
"고객사가 **별도 신청**한 경우" 제공이고, 신청 승인 여부·수수료율·전용 MID 발급 여부가
**전부 미확인**(담당자 회신 대기)이다. 따라서 **빌링키 유무 어느 쪽이든 동작하고, 나중에
빌링을 켜도 스키마·호출부를 갈아엎지 않는** 구조로 만든다.

### 대표 결정 (2026-08-18)
| 항목 | 결정 | 근거 |
|---|---|---|
| 7일 전 고지 채널 | **앱 내 알림으로 시작** | 기존 `notifications`+`pg_cron` 재사용, 추가 비용·의존성 0 |
| ↳ 단서 | **B2C로 갈 수도 있다** | B2C는 앱을 몇 주씩 안 열 수 있어 앱 알림만으로는 위태 → **발송부를 인터페이스로 감싸** 이메일 구현체를 나중에 끼운다 |
| 연간 결제 | **이번에 포함** | 빌링키가 안 나와도 연간은 일반결제 1회로 끝나 구독이 성립한다. 랜딩의 "연간 2개월 무료" 약속과도 맞는다 |

---

## 확정 사실 (조사 완료 — 재탐색 불필요)

- 결제 코드 **0줄**. `payments`/`subscriptions`/`paid_seats` 테이블 없음. PG 환경변수 없음.
- 유료 워크스페이스 **0개**(free 1 · premium 2) → 스키마 파괴 리스크 사실상 없음.
- 마이그 최대 번호 **138**(135~137 결번). 다음은 **139**.
- `workspaces` RLS는 `ws_select`(멤버 읽기)뿐 — **UPDATE 정책 없음**. `plan` 승급은 service_role
  또는 `security definer` RPC로만 가능. 그리고 **`workspaces.plan`을 쓰는 코드가 현재 0건**
  (유일한 write는 생성 시 `'free'` 하드코딩, 마이그115) → **승급 경로 자체를 새로 만들어야 한다.**
- `workspaces.owner_id`는 nullable + `on delete set null` → 결제 귀속은 **`workspace_id` 기준**.
- 크레딧 테이블 관례: RLS는 **select만** 열고 쓰기는 전부 `security definer` RPC.
  `credit_ledger.reason` CHECK에 `'topup'`이 이미 존재.
- **PG 웹훅처럼 인증 없이 외부 POST를 받는 라우트의 선례가 없다** → 서명검증·멱등성은 신규 설계.
- **시스템 이메일 발송 수단 없음**(Gmail 연동은 사용자 개인 계정 발송). Resend 등 미설치.
- **동의 체크박스 없음**. shadcn `Checkbox` 미설치. `AuthForm.tsx:143`은 "동의한 것으로 간주" 문구뿐.
- 가격이 **4중으로 흩어져 있다**: `lib/plans.ts:47` / `LandingPage.tsx:69,76,95`(하드코딩) /
  DB `plan_monthly_credits()`(138)·`plan_seat_limit()`(125).

---

## 설계

### 1. 스키마 (마이그 **139**) — 설계 검증 반영본

크레딧 테이블 관례를 그대로 따른다 — `workspace_id uuid not null`(sentinel default 금지) ·
선두 인덱스 · RLS는 **select만** 개방 · 쓰기는 `security definer` RPC · `delete` 정책 없음.

**이름은 `billing_*` 접두사로 통일한다.** 이 DB엔 이미 `finance_entries`·`cash_*`·`expense_reports`가
있어 "우리가 받는 돈"과 "고객사가 쓰는 돈"이 이름으로 구분되지 않는다. `grep billing_` 하나로
결제 코드 전부가 나오게 한다.

**`billing_subscriptions`** (워크스페이스당 1행 · PK `workspace_id`)
`plan`(check `standard|pro`) · `status`(check `pending|active|past_due|canceled|expired`) ·
`billing_cycle`(check `monthly|yearly`) · `paid_seats` int · **`amount_krw` int**(VAT 포함 총액) ·
`current_period_start`/`_end` · **`auto_renew` bool default false** · `next_charge_at`(null=자동갱신 없음) ·
`retry_count` int · `consent_auto_billing_at` · `consent_terms_version` · `last_notice_sent_at` ·
`cancel_requested_at`(24h 해지 증빙) · `cancel_effective_at` · `cancel_reason` ·
`card_brand`/`card_last4`(표시용 마스킹) · `created_at`/`updated_at`
> `premium`(자사 내부 무제한)은 **행을 만들지 않는다** — 돈을 안 받는 플랜이 갱신 크론에 잡히면 안 된다.

**`billing_payments`** (append-only)
**`order_id` text unique not null**(멱등 앵커) · **`tid` text unique**(나이스 거래번호) ·
`status`(check `ready|paid|failed|canceled|partial_canceled`) · **`amount_krw` int not null** ·
`canceled_amount_krw` · `plan` · `billing_cycle` · `seats`(결제 시점 스냅샷) · `period_start`/`_end` ·
**`pay_source`**(check `checkout|billing_key|manual`) · `method` · `approved_at` · `canceled_at` ·
`refund_reason` · `receipt_url` · **`raw` jsonb**(PG 원문 = 분쟁 시 유일한 증거)
→ 인덱스 `(workspace_id, created_at desc)`

**`billing_keys`** — 🔴 **RLS enable + 정책 0개**(service_role만 도달)
`workspace_id` · `provider` default `'nicepay'` · **`bid`**(빌링키) · `card_brand`/`card_last4` ·
`status`(check `active|revoked`) · `issued_at` · `revoked_at`
→ `unique (workspace_id) where status='active'`
> **`billing_subscriptions`에 컬럼으로 두지 않는 이유(보안):** 구독 테이블은 플랜 표시를 위해
> **멤버 SELECT를 열어야** 하는데, 같은 행에 `bid`가 있으면 브라우저로 빌링키가 나간다.
> PostgREST의 컬럼 단위 차단은 불안정하다 → 테이블을 쪼개고 전면 거부.

**`billing_events`** (append-only 감사 로그 — 법적 의무 ①②③의 증거를 한 곳에)
`kind`(check `consent_auto_billing|consent_withdrawn|notice_upcoming|notice_price_change|
cancel_requested|cancel_revoked|cancel_effected|refund_issued|webhook_received|reconciled|renew_failed`) ·
`actor_id` · **`payload` jsonb**(ip·ua·terms_version·scheduled_at·amount·tid…) · `created_at`
→ 인덱스 `(workspace_id, created_at desc)`
> 동의/고지를 각각 테이블로 쪼개는 안을 기각한 이유: 필드 3~4개짜리 append-only 로그 두 개를
> 따로 두면 RLS·인덱스·RPC가 두 배가 되는데, 분쟁에서는 항상 "시간순 전체"를 뽑는다.

**RLS 요약** (쓰기 정책은 어디에도 만들지 않는다 — `security definer` RPC 전용)

| 테이블 | select |
|---|---|
| `billing_subscriptions` | 멤버 (`auth_user_workspace_ids()`) |
| `billing_payments` | **오너만** (`auth_is_workspace_owner`) |
| `billing_events` | **오너만** |
| `billing_keys` | **없음** |

**좌석 가산은 새 함수로** — `workspace_seat_limit(ws_id) = plan_seat_limit(plan) + coalesce(paid_seats,0)`
를 신설하고 `accept_workspace_invite`가 이걸 부르게 바꾼다. **`plan_seat_limit(text)`은 건드리지 않는다**
(`lib/plans.ts`의 `seats`와 1:1 대응하는 SSOT 짝이라 여기에 좌석을 더하면 3중 대조가 깨진다).

**상태 전이** (핵심만)
```
(없음) →checkout→ pending →승인확정→ active   [plan 승급 + 크레딧 즉시 재설정]
pending →30분 무응답→ expired
active →갱신실패→ past_due  (★plan 유지 — 즉시 강등 금지)
past_due →재시도 성공→ active  /  유예 만료→ expired [plan='free']
active →해지신청→ active + cancel_requested_at (기간 만료까지 이용)
       →cancel_effective_at 도달→ canceled [plan='free']
```
> 즉시 종료가 아니라 기간 만료 방식인 근거: `/refund` 제2조 1항이 "해지 시 **다음 결제일부터**
> 중단, 이미 결제된 기간은 만료일까지 이용"이라고 이미 공표돼 있다.

**`notifications.type` CHECK 확장** — 현재 화이트리스트(실물 확인):
`dm, event_done, event_invite, project_assigned, mail, system, announcement, approval, group, workflow`
→ `billing` 추가해 **전체 재선언**(마이그104가 선례).

### 2. 결제 성공 → 플랜 승급 (멱등·위변조 방어·복구)

**신뢰 소스 = 우리 서버가 호출한 승인 API 응답. 최종 판정자는 조회 API.**
리턴 URL과 웹훅은 둘 다 *트리거*일 뿐이다.
- 리턴 URL 신뢰 → 기각: 브라우저가 POST하는 값이라 금액·플랜 위조가 가능하고, 승인 직후 창을 닫으면 승급이 누락된다. **UX 리디렉트에만** 쓴다.
- 웹훅 단독 → 기각: 지연·유실이 있어 결제 직후 화면에 "아직 Basic"이 뜬다.

🔴 **금액 위변조 방어(한국 PG 사고 1순위)** — 결제창 파라미터의 금액은 사용자가 바꿀 수 있다.
**checkout 시점에 서버가 `billing_payments`에 `ready` 행으로 금액을 못박고**, 승인 요청·승인 응답·
웹훅·조회 API의 금액을 **전부 그 값과 대조**한다. 불일치 시 예외 → 호출부가 즉시 취소 API를 때린다.
`quoteAmountKrw()`가 `plans.ts`를 읽는 **유일한** 함수이고, 클라이언트가 보낸 금액은 **어느 경로로도
DB에 닿지 않는다.**

**멱등성 3중** — `order_id` unique + `tid` unique + RPC 안의 `select … for update`.
하나만으로는 못 막는다(뒤로가기 재결제 / 웹훅 재발송 / 승인응답·웹훅 동시 도착).

**정산은 `security definer` RPC `billing_apply_payment(order_id, tid, amount, approved_at, raw)` 하나로.**
1. `for update` 잠금 → 2. 이미 `paid`면 **no-op 반환** → 3. **금액 불일치면 예외** →
4. `billing_payments` → `paid` → 5. `billing_subscriptions` upsert(`active`) →
6. `workspaces.plan` 승급 → 7. 🔴 **`workspace_credits`를 새 상한으로 즉시 재설정** + `credit_ledger`
`reason='adjust'` → 8. `billing_events` 기록.

> 🔴 7번이 없으면 실제 버그가 된다: `credit_sync`는 유료 플랜을 **월 경계에서만** 리셋하므로
> (`132_credits.sql`), 8/20에 승급해도 잔액은 8월 내내 free의 500 그대로다 = "돈 냈는데 그대로".
> 반대로 **다운그레이드 시엔 깎지 않는다**(이미 받은 이익 회수는 분쟁 소재).

**grant는 service_role 전용** — `revoke execute … from public, anon, authenticated`.
즉 라우트가 **admin client로** 이 RPC를 호출한다(인증은 앱, 원자성은 DB).
`credit_sync`가 `authenticated`에 열린 것과 다른 이유: 저건 자기 잔액 계산이고 이건 돈이다.

**복구** — `/api/billing/reconcile` 크론 1개가 ① 5분 넘은 `ready` 조회 API 대사
② `next_charge_at <= now()` 갱신 ③ **7일 전 고지** 발송을 한다.
⚠️ **`vercel.json`에 `crons`가 없다**(현재 `regions`만 — 실물 확인). 추가하지 않으면 아무도 안 돈다.
크론이 죽어도 견디게 결제 화면 진입 시 lazy 대사도 함께 건다(`credit_sync`가 lazy를 택한 것과 같은 이유).

**웹훅** — `/api/billing/nicepay/webhook`. 본문의 `signature`를 재계산해 `timingSafeEqual` 비교하되,
**본문 값을 신뢰하지 않고** `tid`로 조회 API를 다시 때려 확인한 뒤에야 RPC를 부른다(서명 검증은
조회 API에 대한 DoS 방어일 뿐). **항상 200 반환**(재시도 폭주 방지), 실패는 `billing_events`에 남기고 크론이 재처리.
✅ Vercel Deployment Protection은 **꺼져 있음**(실물 확인) — 웹훅 401 위험 없음.

### 3. 빌링키 추상화

**스키마는 이미 자동갱신을 담고 있다.** 빌링 미승인 상태 = `auto_renew=false` · `next_charge_at=null` ·
`billing_keys` 빈 테이블 · `pay_source='checkout'`. 승인되면 **마이그레이션 0줄**로 켜진다.

```
src/lib/billing/provider.ts   BillingProvider 타입 + capabilities
       /nicepay.ts            유일한 나이스페이 fetch·서명 위치
       /index.ts              getBillingProvider() — env 읽어 provider 반환
       /renew.ts              renewSubscription(ws) ★자동/수동 분기 단일 지점
       /orders.ts             newOrderId(), quoteAmountKrw(plan, cycle, seats) ← plans.ts SSOT
       /notice.ts             sendUpcomingChargeNotice() ← 의무②
       /refund.ts             computeFairRefundKrw()     ← 의무④
```
옵셔널 메서드(`chargeWithBillingKey?`)는 기각 — `if (provider.x)` 분기가 호출부마다 번식한다.
대신 **`capabilities.recurring: boolean`** 을 두고 미지원 시 `BillingUnsupportedError`를 던진다.
분기는 `renew.ts` **한 곳**에만 존재한다.

승인 후 켜는 절차: `NICEPAY_BILLING_ENABLED=true` + 빌링 MID/키 주입 → `capabilities.recurring`이 true.
**빌링 전용 MID가 별도로 나와도 env 쌍이 이미 분리돼 있어 대응된다. 호출부·스키마 변경 0.**

### 4. 화면·페이지

- **`/terms/billing`** (신규) — 자동결제 약관. `LegalShell`+`LegalSection` 그대로.
  ⚠️ 링크 **4곳** 동시 등록: `LegalShell.tsx:15-23` · `sitemap.ts:8-10` · `LandingFooter.tsx:106-108`
- **동의 체크박스** — `shadcn Checkbox` 설치 후 결제 화면에 **회원가입 약관과 별도로** 배치.
  동의 없이는 결제 버튼 비활성. 동의 시 `billing_consents` 기록.
- **설정 요금제 카드** (`SettingsView.tsx`에 `{isOwner && ...}` 한 줄 추가) —
  `InviteLinksCard.tsx`가 가장 가까운 모델(요금제 라벨 + 게이지 + 업그레이드 배너).
  현재 요금제 · 다음 결제일 · 결제수단 · **해지 버튼**.
- **해지** — `SettingsView.tsx:658`의 2단계 인라인 확인 패턴 재사용.
  **앱에서 24시간 언제나 가능해야 한다**(법적 의무 ③). `/refund` 제6조가 "이메일로 신청"이라
  적혀 있는데 이것만으로는 요건 미달 → 해지 버튼이 생기면 **제6조 문구도 함께 갱신**.
- **문구 제약** — 화면에 **"충전·크레딧·포인트" 금지**(PG 위험업종 분류 회피).
  상품명은 "월 정액 구독"/"연간 구독"으로만.

### 5. 가격 SSOT 정리 (이번에 같이)

연간 가격이 추가되면 4중화가 5중화된다. `lib/plans.ts`에 `priceKrwYearly`(=월×10, 2개월 무료)를
추가하고 **`LandingPage.tsx`의 로컬 하드코딩 배열을 `plans.ts`에서 파생**시킨다.
DB 함수 2개(`plan_monthly_credits`·`plan_seat_limit`)는 값 동기화 주석을 유지한다.

---

## 작업 순서 (30일 시한 기준)

---

# ▶ 이번 단계: 해지 화면 (2026-08-18~)

> 대표 지시: 나이스페이 키가 필요한 것은 **미뤄두고 가능한 것만** 개발한다. 전부 만든 뒤 수정에 들어간다.
> 해지 화면이 첫 타자인 이유 — **PG를 전혀 부르지 않고 우리 DB만으로 완결**되며, 법적 의무 중
> 가장 급한 항목(24시간 해지 채널)이다.

## 🔴 선행 블로커 (먼저 해결)

**`src/lib/supabase/types.ts`에 마이그140의 RPC 7개가 없다.** 139 적용 직후에 타입을 생성했고
140은 그 뒤에 적용했기 때문이다. 지금 상태로 `admin.rpc("billing_request_cancel", …)`를 쓰면
**타입 에러**가 난다(`createAdminClient`에 `Database` 제네릭이 걸려 RPC 이름이 검사된다).
→ **타입 재생성이 첫 작업.** MCP `generate_typescript_types` 결과가 파일로 저장되므로
컨텍스트에 싣지 않고 python으로 `types.ts`에 직접 쓴다(139 때와 동일 방법).

## 만들 것

### 1. `src/components/settings/BillingCard.tsx` (신규 · 자체 완결형)

`McpCredentialsCard`처럼 `<section className="… glass p-5">`와 제목까지 직접 렌더한다.
SettingsView 쪽은 **한 줄**만 추가한다.
- 배치: `SettingsView.tsx` **"AI 비용 예산" 카드(:588-625) 다음, "계정"(:628) 앞**
- 게이팅: `{isOwner && <BillingCard />}` — 결제·해지는 오너만
- 데이터: `useCurrentWorkspaceId()` + supabase 클라이언트로 `billing_subscriptions` 직접 조회
  (RLS가 멤버 select를 허용하므로 API 불필요). `workspaces.plan`도 함께.
- `useEffect` 위에 `// eslint-disable-next-line react-hooks/set-state-in-effect` **필수**(프로젝트 관례)

**표시 상태 7가지** — 이걸 다 처리해야 화면이 안 깨진다.

| 상황 | 화면 |
|---|---|
| `wsId` 없음 / 로딩 | 렌더 안 함 |
| `plan === 'premium'` | "협의 요금제" 안내만(내부 무제한, 해지 버튼 없음) |
| 구독 없음 + `free` | "현재 Basic(무료)" + 유료 안내(`/#pricing`) |
| `active` + 해지예약 없음 | 요금제·주기·금액·**다음 결제일** + **해지 버튼** |
| `active` + 해지예약 있음 | "N월 N일에 종료 예정" + **해지 취소 버튼** |
| `past_due` | "결제가 확인되지 않았어요 — 재시도 중" (플랜 유지 안내) |
| `canceled` / `expired` | "종료됨" + 다시 시작 안내 |

- 해지 버튼은 **2단계 인라인 확인**(`SettingsView.tsx:658`/`:698-720` 패턴 그대로).
  ⚠️ 그 원본은 성공 후 행이 사라져서 `confirming`을 되돌리지 않는다 — **여기선 성공 후 명시적으로 false로 리셋**해야 한다.
- 확인 단계에 **선택 입력 사유**(짧은 input) 하나. 이탈 원인 데이터는 나중에 못 만든다.
- 문구에 **"충전·크레딧·포인트" 금지**. 해지 안내는 "다음 결제일부터 청구가 중단되고, 이미 결제한 기간은 만료일까지 그대로 쓸 수 있어요"로.

### 2. `src/app/api/billing/subscription/cancel/route.ts` (신규)

마이그140의 RPC가 **service_role 전용**이라 클라이언트에서 직접 못 부른다.
`InviteLinksCard`처럼 `supabase.rpc()`를 클라에서 호출하는 방식은 **여기선 불가**.

- `POST` = 해지 신청 → `admin.rpc("billing_request_cancel", {p_workspace_id, p_user_id, p_reason})` → `effective_at` 반환
- `DELETE` = 해지 철회 → `admin.rpc("billing_revoke_cancel", …)`
- `export const runtime = "nodejs"`
- **워크스페이스는 클라가 보낸 값을 믿지 않고 서버가 판정**한다:
  `auth.getUser()` → `workspace_members`에서 **guest 제외 + `order("created_at")` 명시**로 wsId 산출
  (비결정 `limit(1)`은 엉뚱한 워크스페이스를 건드린다 — `budget.ts:42-49` 관례) → `workspaces.owner_id === user.id` 확인, 아니면 403
- 에러는 `new Response("한국어 문구", {status})`, 성공은 `Response.json({ ok: true, … })` (`members/[id]/route.ts` 관례)

### 3. `src/app/refund/page.tsx` 제6조 개정

현재 "환불은 서비스 내 문의 또는 이메일로 신청"뿐이라 **24시간 해지 채널 요건에 미달**이다.
해지 버튼이 생겼으니 "설정 화면에서 **언제든지 직접 해지**할 수 있다"를 명시한다.

## 검증

- **DB 시뮬(프로덕션, 테스트 워크스페이스 생성→삭제)**: 해지 신청 → 플랜 유지 확인 → **해지 철회**
  → 예약 해제 확인 → 재해지 → 만료 처리 → `free` 복귀 + 사용량 미회수.
  ※ 140 시뮬에서 철회(`billing_revoke_cancel`) 경로만 아직 안 돌렸다.
- **상태 7가지 렌더 시뮬**: 각 상태의 구독 행을 DB에 만들어 카드가 안 깨지는지 확인
  (특히 `premium`·구독 없음·`past_due`).
- **권한 시뮬**: 비오너 계정으로 cancel API 호출 시 403인지.
- 게이트: `tsc` 0 · `pnpm lint` **29/0** · `next build` 성공.

---

**A. MID 없이 지금 전부 가능 (작업량의 약 85%) — 전체 로드맵**
1. ✅ **완료** 마이그 **139**(4테이블+RLS+`notifications` CHECK+`workspace_seat_limit`+초대 교체) — 커밋 `6df4bdd`
2. ✅ **완료** 마이그 **140**(RPC 7개: checkout·apply·fail·consent·cancel·revoke·expire) — 커밋 `5acb250`
   시뮬 7항목 통과. 시뮬이 잡은 버그(크레딧 장부 누락) 수정 포함.
3. ✅ **완료** `lib/plans.ts` 연간가 + `lib/billing/orders.ts` + `/terms/billing` 약관 + 링크 3곳 — 커밋 `0982585`
   시뮬 31항목 통과(월말·윤년 결제일 보정, 주문번호 중복 0).
4. ⏳ **← 지금** 설정 요금제 카드 + **24시간 해지**(법적 리스크 최대) + cancel API + `/refund` 개정
5. 자동결제 **동의 체크박스** — 회원가입 약관과 물리적으로 분리. `billing_record_consent` 호출
   (체크박스 부품이 프로젝트에 없다. `ui/checkbox`를 새로 만들기보다 기존 관례인
   `<input type="checkbox" className="size-4">` + `<label>`이 맞다 — `AgentBuilderForm.tsx:505` 등 5곳 선례)
6. `/api/billing/checkout` · `/nicepay/return` · `/nicepay/webhook` · `/reconcile`
7. **`vercel.json`에 `crons` 추가**(현재 `regions`만) + 결제 화면 진입 시 lazy 대사
8. 랜딩 가격표를 `plans.ts`에서 파생 (현재 `LandingPage.tsx:69,76,95`에 3중 하드코딩)
9. `computeFairRefundKrw()` — `/refund` 일할 계산식과 **글자 단위로 같아야** 한다

**B. MID·상점키가 나와야 가능 (반나절)**
- 상용 결제창 실승인 1건 + 실취소(최소금액) · 나이스페이 관리자에 **웹훅/리턴 URL 도메인 등록**
- ⚠️ **테스트 상점 MID·상점키를 먼저 확보하면 A 단계에서 E2E까지 검증 가능하다.**
  나이스페이 개발문서에 `nicepay00m`이 예시로 있으나 완전한 자격증명 세트는 공개돼 있지 않다
  → **대표님이 나이스페이 관리자에서 테스트 MID·상점키를 확인**해주시면 일정이 크게 앞당겨진다.

**C. 담당자 회신 후**
- 빌링 별도 신청 · 수수료율 · 전용 MID 여부 → env 플래그만 켜면 `renew.ts`가 자동 경로로 전환

---

## 검증

- 게이트: `tsc` 0 · `pnpm lint` **29/0 베이스라인**(신규 0) · `next build` 성공.
- DDL이므로 **추가 필수**(work-harness): `get_advisors`로 RLS 경고 확인 + **RLS 롤백 시뮬**.
  결제·RLS·멀티테넌시는 "위험" 등급이라 적대 검증을 붙인다.
- **RLS 격리 시뮬**: 타 워크스페이스 멤버가 `subscriptions`/`payments`를 못 읽는지,
  비오너가 해지 RPC를 못 부르는지 SQL로 직접 확인.
- **멱등성 시뮬**: 같은 `order_id`로 `payment_settle`을 2회 호출 → 두 번째가 no-op이고
  `workspaces.plan`·`credit_ledger`가 중복 반영되지 않는지 확인.
- **상태 전이 시뮬**: 해지 예약 → 기간 만료 → `plan='free'` 복귀까지 SQL로 시간 이동 검증.
- 롤백: 마이그139 상단 주석에 `drop table ... ; drop function ...;` 그대로 기재.
  유료 워크스페이스 0개라 데이터 손실 위험 없음.

## 놓치기 쉬운 함정 (설계 검증에서 도출 — 구현 시 반드시 확인)

1. **금액 위변조** — §2의 `ready` 행 못박기 + 3중 대조가 유일한 방어. 클라 금액은 DB에 닿지 않게.
2. **7일 전 고지는 "재시도"에도 걸린다** — `past_due` 재시도(D+1/3/5)도 **결제 승인요청**이라 고지 대상.
   → 유예 재시도를 **최초 고지의 유효기간 안**(원 결제 예정일 ±7일)에 끝내도록 설계할 것.
3. **갱신 실패 시 즉시 강등 금지** — 한도초과·카드 재발급은 정상 빈도다. 즉시 `free`로 떨구면
   좌석 초과 팀이 데이터 접근을 잃는다. `past_due` 유예 **최소 3일**.
4. **크레딧은 승급 즉시 올리고, 강등 시엔 깎지 않는다** — §2 7번. 안 하면 "돈 냈는데 그대로".
5. **시간대** — `credit_sync`는 `Asia/Seoul` 기준인데 구독 기간을 UTC로 저장하면 말일 결제가
   하루 어긋난다. 1/31 결제의 다음 결제일(2/28) 처리도 명시적으로 정할 것.

## 미해결 (진행하며 확정)

- 🔴 **VAT 표기가 어디에도 없다** — 랜딩·`plans.ts` 모두 "₩29,000"이 부가세 포함인지 별도인지 미표기.
  PG 심사 단골 지적이고, B2B라 계약 후 세금계산서 요청이 온다. **`plans.ts` `priceKrw` · 랜딩 가격표 ·
  `billing_payments.amount_krw` · 환불 계산이 전부 같은 정의여야** 하고 아니면 일할 환불에서 10%가 어긋난다.
  → **일단 "VAT 포함"으로 가정하고 진행**(지금까지의 원가율 계산도 그 전제였다). 대표 확정 필요.
- **빌링키 승인 여부·수수료율·전용 MID** — 담당자 회신 대기. 회신 전까지 `auto_renew=false`로 두고
  연간/수동 경로로 동작.
- **테스트 MID·상점키** — 관리자 페이지에서 확인되면 A 단계에서 E2E까지 끝낼 수 있다.
- **B2C 전환 시 이메일 고지 필수화** — 앱 알림만으로는 도달이 약하다. `notice.ts`에 이메일 구현체를
  끼우는 시점을 그때로 잡는다.
- **정산한도 200만원**(Standard 약 69건) 도달 전에 담보 협의 — 넘으면 초과분 지급 보류.
