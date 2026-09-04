---
name: known-issues
description: EQURIA Workspace의 알려진 이슈·기술부채 백로그. 다음 세션에서 해결할 항목과 위험도. 새 기능 작업 전, 관련 영역의 이슈가 있는지 여기서 먼저 확인.
---

# 알려진 이슈 / 기술부채 백로그

> 지금 당장 안 깨지지만 **나중에 해결해야 하는** 것들. 위험도순. 해결하면 이 파일에서 제거.
> 최종 정리: 2026-05-31 (세션 4) · 갱신: 2026-09-04 (워크플로우 기능 삭제로 I1b 27/0 재확정, I2·I10 해소)

## 🟡 중간

### I1b. eslint 부채 27건 — 배포는 안 막지만 코드품질 부채 (세션7 갱신)
- `next build`(=Vercel 빌드)는 **exit 0 통과**. **Next 16 Turbopack 빌드는 eslint를 게이트하지 않음** → 아래 에러들은 배포를 막지 않음.
- `pnpm lint`는 **27 errors + 0 warnings**(2026-09-04 `npx eslint src --format json`으로 실측·재확정):
  `react-hooks/set-state-in-effect` ×24(전 컴포넌트 공통 `useEffect(()=>{load()},[load])` 패턴) ·
  `react-hooks/refs` ×2 · **`react-hooks/immutability` ×1(`McpView.tsx:217`)**.
  **신규 작업은 이 27/0을 절대 넘기지 말 것**(신규 범주 발견 시 중단).
  ⚠️ 종전 29/0에서 2건 줄었는데, 새로 고쳐서가 아니라 **`WorkflowsView.tsx` 삭제(워크플로우 기능 전면 제거,
  2026-09-04)로 그 파일의 set-state-in-effect 2건이 코드째 사라진 것** — 착시 주의.
- **할 일(비차단)**: set-state-in-effect 24건은 데이터 로딩 패턴이라 진짜 수정은 위험(동작 변경). 일괄 처리 시 (a) 각 effect에 `eslint-disable-next-line` 또는 (b) `load()`를 effect 밖 패턴으로 리팩터(범위 큼). 급하지 않음 — 배포 안전 확인됨.

## 🟢 낮음 / 비차단

- **I7. 기존 부채(세션3부터)**: `agent_usage` onError 누락(성공 시만 기록) · Anthropic transient 500 재시도 없음 · `.or()` 특수문자 escape 부재 · NotificationBell UPDATE 미구독 · 그룹채팅/위젯 모바일/md 다크모드 미대응 · **채팅 이모지 팝오버가 스크롤 컨테이너(`overflow-y-auto`) 상단 근처서 클리핑**(pre-existing, 최신 메시지엔 무영향 · Portal/Floating UI로 해소 가능, 세션7 검증).
- **I8. 핀 교체 비원자성**: delete→insert 사이 실패 시 빈 핀(에러표시+resync로 방어, 완전방지엔 upsert RPC).
- **I11. 코드 꼬임 감사 보류분(세션6, 전부 비차단·동작 정상)**: 전체 감사에서 나왔으나 위험/가치 대비 보류 — ① **CalendarView 자체 `ModalShell`**(620줄): 다른 5개 뷰는 공용 `components/shared/Modal` 사용, Calendar만 자체 구현(이벤트 상세 로직 얽혀 마이그레이션 신중). ② **서명URL 컴포넌트 중복**: FilesView(60s)·CardDetail(300s)·DirectChat(3600s)가 `createSignedUrl` 패턴 반복(TTL 상이, 에러처리 불일치) → `lib/storage.ts`에 `getSignedUrl(supabase,bucket,path,ttl)` 추출 후보(OCR는 세션6에 이미 `buildOcrFilePart`로 추출 완료). ③ **에러 표기 불일치**: Mail/Mcp=toast, Finance/Projects/Calendar=모달내 setError → 화면별로 다른 패턴이 계속 섞여 씀. ④ **빈/로딩 상태 UI 분산**: 6개 뷰가 제각각 → 공용 `EmptyState` 후보. ⑤ **내부전용 export 4건**: `Connector`(mcp.ts)·`WizardFieldType`(agentBuilder.ts)·`TempPreset`(agents.ts)·`toCsv`(csv.ts) — 외부 import 0, 캡슐화 위해 export 제거 가능(가치 낮음). ⑥ **pagination 패턴 중복**(Cards/Projects/Finance) → `useTablePagination` 후보(필터 구조 달라 추상화 복잡, 낮은 우선도).
- **I15. 현금흐름 손익계산기(세션21 적대리뷰 보류분, 비차단)**: ① **회사 기본 계산 유형 시드**(`cash_calc_types` insert=`is_workspace_member`)가 RLS로 막히면 조용히 null 폴백(표는 '계산' 단일컬럼) — 현재 단일 테넌트(equria 멤버)는 통과, B1-b 멀티테넌트 시 에러 노출/재시도로 견고화 필요(`CashFlowView` load 시드 블록 error 미체크). ② **pool(가용현금) 통화**는 슬롯 최빈 통화 1개로 표시 — 다통화 워크스페이스의 2차 통화는 pool 시각화 미반영(표는 통화별 분리 유지, buildSlotGraph). (7칸 초과 계산필드 엑셀 잘림은 세션21 동적컬럼으로 픽스됨.)
- **I14. 채팅 '작성 중' broadcast 미게이팅(세션9, 비차단·LOW)**: 타이핑 인디케이터는 `dm-<conversationId>` 채널의 Supabase **broadcast**로 전송하는데, broadcast/presence는 `private:true`+`realtime.messages` RLS가 있어야만 인가됨(현재 미적용). 따라서 인증된 워크스페이스 사용자가 **특정 대화 UUID를 알면** 그 채널을 구독해 ① 누가 입력 중인지(user_id) 수신 ② 가짜 '작성 중' 주입 가능. **단 위험 LOW**: 페이로드는 user_id뿐(메시지 내용 X), conversationId는 `gen_random_uuid()`+`dc_select` RLS로 **열거 불가**, 가짜 표시는 3.5s 자동소멸. **메시지 내용은 안전**(같은 채널의 postgres_changes 4종은 `038` 참여자 RLS로 서버 강제). 정식 차단=채널 `private:true`+`realtime.messages` 참여자 RLS+`setAuth`. 내부툴 수용 범위.
- **I13. 캘린더 일정 첨부(세션7, 마이그 026 · 비차단·동작 정상)**: ① 첨부 메타는 `calendar_events.attachments`(jsonb)에 이벤트와 **원자적**으로 저장(별도 테이블 아님) — message_attachments식 2단계 비원자성 없음. ② 단, 첨부를 폼에서 제거하거나 이벤트를 삭제해도 `calendar-files` 버킷의 실파일은 **남는다(orphan)** — 프로젝트의 storage cleanup 미사용 정책(마이그 008 이후)과 일관, 내부툴 수용 범위. ③ `mime_type`은 클라 제공값(신뢰도 한계). ④ Undo로 이벤트 삭제 복원 시 jsonb attachments도 함께 복원되나, orphan 정리는 없음. ⑤ 버킷 읽기 정책=인증 사용자 전체(팀 캘린더 공유 의도) — 워크스페이스 외부 비공개라 OK.
- **I12. 채팅 단계5(리치 텍스트·다중첨부) 보류분(세션6, 비차단·동작 정상)**: ① 메시지 insert→message_attachments insert가 2단계라 비원자성 — 첨부 insert 실패 시 메시지는 "파일 N개"로 남고 첨부 0(드묾, toast 알림). 완전방지엔 단일 RPC. ② body_json은 렌더가 이미 XSS-safe(JSON→React·href 화이트리스트·미지원노드 폴백)지만 insert 전 클라 검증(CHAT_EXTENSIONS 노드/마크 화이트리스트) 미적용 — 데이터 무결성 하드닝 여지. ③ CHAT_EXTENSIONS↔MessageBody 렌더러 1:1 동기화가 주석 규약뿐(유닛테스트 0) — 확장 추가 시 렌더 케이스 빠뜨리면 "보이나 저장 후 안 보임". ④ mime_type은 클라 제공값이라 이미지 판정 신뢰도 한계(확장자 폴백으로 보완). ⑤ 부분 업로드 실패 시 orphan storage 파일 가능(메시지 없음). 전부 내부툴 수용 범위.
- **I9. Supabase advisor 부채(세션5 점검, 전부 비차단)**: 보안 WARN 3(=`get_or_create_direct_conversation`·`mark_dm_read` SECURITY DEFINER 호출가능[설계상 의도] + leaked-password 보호 off[대시보드 토글]). 성능 96: `auth_rls_initplan` ×64(RLS에서 `auth.uid()`를 `(select auth.uid())`로 감싸면 해소) · `multiple_permissive_policies` ×5 · INFO(unindexed_fk ×16·unused_index ×11). 내부툴·소규모 데이터라 급하지 않음.
- **I16. 메일 첨부 3MB 한도 + 배치 파싱 엣지(세션27 적대리뷰, 비차단)**: ① Gmail 첨부를 JSON 본문(base64)으로 `/api/google/gmail/send`에 전송 → **Vercel 서버리스 요청 본문 4.5MB 제한** 때문에 base64 팽창(×1.33) 감안 **클라 가드 합계 3MB**(`MailCompose` MAX_TOTAL, 초과 시 toast). 더 큰 첨부는 Gmail 미디어 업로드(resumable) 직접 경로 필요 — 후속 개선. ② `batchGetThreadsMetadata`(스레드 목록 batch)는 파트 JSON을 첫`{`~마지막`}`로 추출·id로 순서 복원 → **파싱 실패/오류 스레드는 조용히 목록 누락**(그레이스풀이나 특이 메일에서 빠질 수 있음). ③ **수정 완료분**: 헤더 인젝션(CRLF)·첨부 파일명 따옴표·base64 비문자 = `buildRawMessage`(`oneLine`/`encodeHeaderValue`)에서 제거. Drive 다운로드=본인 OAuth 토큰이라 IDOR 없음 · Drive 쿼리=`esc()` 인젝션 방지 · 캐시=클라측(브라우저별) 교차유출 없음 — **리뷰 확인됨**.

- **I18. SSRF 잔여 위험(세션36 하드닝 후, 비차단·LOW)**: `lib/safeFetch.ts`가 문자열 검사에 더해 **DNS 실제 IP 공인검증**(v4/v6 사설·loopback·링크로컬·CGNAT·IPv4-mapped) + **리다이렉트 수동 매 홉 재검증**으로 강화됨(웹훅=`maxRedirects:0` 차단, 리서치 이미지 2곳=3홉). **잔여**: `assertPublicHost`의 검증 시점과 실제 `fetch`의 소켓 connect 사이에 DNS가 바뀌는 **초고속 리바인딩**은 검증된 IP로의 소켓 핀(undici dispatcher `connect.lookup`) 없이는 이론상 잔여. 내부툴·인증 직원 한정이라 LOW. 완전차단 원하면 undici Agent로 검증 IP 핀. (세션36 이전엔 최초 URL 호스트명 **문자열만** 검사해 리다이렉트·리바인딩 우회가 열려 있었음.)
- **I17. 세션29 MCP 개인연결 마이너(세션30 전체 코드리뷰 발견, 비차단·미픽스)**: ① 개인 커넥터의 도구명이 다른 커넥터와 충돌하면 **조용히 덮어쓰기**(경고 없음). ② **GitHub 커넥터가 Copilot MCP 엔드포인트**라 일반 PAT로는 권한 범위 확인 필요. ③ MCP 도구 캐시 Map 키에 **프리픽스 없음**(서버 간 키 충돌 이론상 가능). 전부 비차단이나 커넥터 다중 사용 확대 시 점검.

> 세션4 시점(2026-05-31) E2E 미검증 목록(워크플로우 실행·6개 섹션 브라우저 확인 등)은 이후 40여 세션에서
> 대부분 재검증됐다(예: I9·I15·I19). 상세는 git 이력·WORKLOG 세션4~7 참고, 여기선 압축.

## 🆕 세션41 리뷰 보류분 (2026-07-30, 비차단)
- **I19. 손익 계산 슬롯 표시(세전) vs 총계(부가세 포함) 불일치**: CashGrid 금액 열=계산값(amount), tfoot·pool=total_amount 합산 — VAT 넣은 슬롯은 행 100,000/총계 110,000. 표기 기준 통일 필요(LOW).
- **I20. 매출·비용 슬롯→보유금 전환 시 이번 달 자동 기록 유령 잔존**: kind=reserve면 sync 스킵이라 기존 귀속 기록이 미귀속 잔여로 pool에 이중 표현(LOW·엣지).
- **I21. AI 라우트 rate limit 부재 + 예산 기본 무제한**: monthly_budget_usd null=무제한, checkBudget은 커밋된 합계만(병렬 통과 가능). 완화=배포 후 예산 설정(설정→AI 비용 예산). B3 크레딧 시스템에서 정식 해결 예정(MED·수용).
- **I23. AttendanceAdmin workspaces.select limit(1) 비결정**: 멀티 멤버십 유저의 isOwner UI 오판 가능(권한은 RLS가 강제 — 표시 문제만, LOW).
- **I24. 어시스턴트/사이드바 리사이즈 핸들 4px 침범**: thin 스크롤바 위 일부를 핸들이 덮음(히트 확률 낮음, LOW).

## 🆕 세션42 HR·컴피 후속 (2026-08-01, 비차단·후속)
- **I27. 연차 이월(carryover)·월차 잔여 미반영**: `hr_settings.leave_policy.carryover`·`monthly_leave`는 설정 저장만 되고 `computeBalance` remaining은 이월 0·월차는 사용 카운트만(잔여 계산 안 함). 정확한 이월 잔여는 전년도 잔여 추적 필요(후속). 현재 잔여 = 부여 − (연차 + 반차0.5). LOW.
- **I28. 근태 잔여 셀프조회 부재**: `attendance_balances` RPC는 `can_view_attendance`(오너/위임자)만 → 일반 직원의 본인 연차 잔여 조회 경로 없음. 컴피도 오너/위임자 문맥만 답변. 셀프조회는 후속(RPC에 self 분기). LOW.
- **I29. 컴피 도구 커버리지·수집 중복**: `agentTools`는 근태·프로젝트·일정·할일 4종만(재무·회의·채팅 도구 미구현 — 같은 패턴으로 추가). `task-suggestions` 인라인 수집과 `workspaceContext` 스냅샷이 유사 로직 중복(통합 후속). LOW.
- **I30. 옛 기본 8종 기존 워크스페이스 잔존**: `created_by IS NULL` 활성 시드 16개(3워크스페이스). 신규는 마이그130 clean-slate로 미복제. 기존은 **컴피 라이브 검증 후 `is_active=false` 소프트삭제**(대표 결정). 되돌림=is_active 토글.
- **I32. 크레딧 잔액 음수 허용(by design)**: 스트리밍이라 호출 전엔 비용을 모른다 → 사전 검사는 "잔액>0"만 보고 실제 차감은 응답 완료 후. 따라서 마지막 호출 하나는 잔액을 넘길 수 있고 그다음 호출에서 차단된다. 정상 동작이며 UI는 0으로 클램프해 표시. LOW.
- **I33. CreditMeter는 마운트 시 1회만 조회**: 사용 중 잔액이 줄어도 화면 숫자는 새로고침 전까지 그대로. 소진 시 차단 자체는 서버가 하므로 기능 문제는 없으나, "썼는데 안 줄어드네" 오해 소지. 채팅 응답 후 갱신 이벤트를 붙이면 해소. LOW.
- **I34. 모델 라우팅 미적용(원가·기회)**: `MODELS.cheap`(Haiku, Sonnet의 정확히 1/3 단가)을 기억 추출에만 사용 중. 요약·분류·간단질의를 Haiku로 보내면 전체 원가 ~27% 절감 추정(대화 40% 전환 가정). 품질 민감 영역 구분이 필요해 대표 확인 후 적용. **캐싱 다음으로 가장 큰 남은 레버.**
- **⚠️ 상태**: 마이그 127~130 프로덕션 DB 적용됨 · 세션42 코드는 로컬 커밋(미푸시) — 배포 코드=`a274fab`. 컴피 라이브·HR 저장·잔여 표시 = 대표 dogfood 미검증(배포 후).

## 🆕 세션41 /code-review 보류분 (2026-07-31, by-design/cleanup)
- **I25. 계산 슬롯 값→0 시 이번 달 장부 기록 soft-delete(Undo 없음)**: "계산값=결과값" 모델상 계산값 0=이번 달 금액 0이라 자동 휴지통 처리(recordEntry와 달리 undo push 없음). 수동 tax/memo 기록이 있으면 손실 — 휴지통에서만 복구. 모델 근본이라 by-design 수용(LOW·엣지).
- **I26. 날짜 헬퍼 중복(cleanup)**: ProjectTimeline/TaskTimeline/WorkOverview/AttendanceAdmin이 d0/fmt/shiftDate/addDays/todayStr를 각자 재구현 — `@/lib/calendar`(toDateInputValue·isSameDay 등)로 통합 후보. 동작 정상, 유지보수 부채(LOW).

## 🆕 세션55 워크스페이스 스토리지 상한 (2026-09-03, by-design/미커버 · 비차단)
- **I35. 워크스페이스 총량 상한(마이그145~146) 클라이언트 전용 강제**: `storage.objects` 경로가 `{user_id}/...`라 workspace_id가 없어, 버킷 파일당 상한(마이그144)처럼 DB 레벨로 완전히 막을 수 없다. `workspace_storage_status()` RPC를 `lib/upload.ts`가 업로드 전에 호출해 막는 방식이라 **API 직접호출로 우회 가능**(권한상승은 아님 — 본인 워크스페이스 상한만 자기 손해로 우회). 내부툴·인증 직원 한정이라 LOW.
- **I36. 여러 워크스페이스 소속 유저의 사용량 중복 집계**: `workspace_storage_status()`가 "이 업로드가 어느 회사 것인지"를 경로만으로 구분 못해, 유저가 올린 모든 파일이 그 유저가 속한 **모든** 워크스페이스 사용량에 동시 집계된다. 대부분 유저가 워크스페이스 1곳뿐이라 현재 영향 낮음(LOW·엣지). 정확히 하려면 경로에 workspace_id 포함(RLS 재작성 필요·큰 변경) 또는 업로드 시 워크스페이스별 파일 테이블에 명시 기록.
- **I37. CardsView(명함)·agentKnowledge(지식파일)는 총량 상한 미적용**: 이 두 호출부는 업로드 시점에 워크스페이스 id가 스코프에 없음(명함=서버 OCR 라우트 경유, 지식파일=에이전트 소유로 간접 격리). 실사용량 낮음(명함 6.7MB·infra-limits.md 2026-08-10 측정 기준)이라 이번 패스에서 제외. 버킷 파일당 50MB 상한(마이그144)은 이 둘도 적용됨 — 완전 무방비는 아님.
