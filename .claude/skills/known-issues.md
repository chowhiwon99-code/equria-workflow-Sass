---
name: known-issues
description: EQURIA Workspace의 알려진 이슈·기술부채 백로그. 다음 세션에서 해결할 항목과 위험도. 새 기능 작업 전, 관련 영역의 이슈가 있는지 여기서 먼저 확인.
---

# 알려진 이슈 / 기술부채 백로그

> 지금 당장 안 깨지지만 **나중에 해결해야 하는** 것들. 위험도순. 해결하면 이 파일에서 제거.
> 최종 정리: 2026-05-31 (세션 4) · 갱신: 2026-06-05 (세션 7 — I1b 카운트·I13 신설)

## 🔴 우선 (다음 세션 후보)

### I2. 워크플로우 실행 60초 타임아웃
- `/api/workflows/[id]/run`은 노드를 **순차** generateText 호출. Vercel Hobby `maxDuration=60s` 한계.
- 방어: `MAX_RUN_NODES=6`(workflowTools.ts). 그래도 opus 노드 여럿·max_tokens 큰 경우 60초 초과 가능 → 중간 노드에서 끊김.
- **할 일**: Vercel Pro(300초)면 한도 상향 / 또는 노드별 토큰·모델 가드 / 또는 백그라운드 잡 큐로 전환(고도화).

## 🟡 중간

### I1b. eslint 부채 30건 — 배포는 안 막지만 코드품질 부채 (세션7 갱신)
- `next build`(=Vercel 빌드)는 **exit 0 통과**. **Next 16 Turbopack 빌드는 eslint를 게이트하지 않음** → 아래 에러들은 배포를 막지 않음.
- `pnpm lint`는 **30 errors + 0 warnings**(세션7 기준 베이스라인): `react-hooks/set-state-in-effect` ×28(전 컴포넌트 공통 `useEffect(()=>{load()},[load])` 패턴) · `react-hooks/refs` ×2(WorkflowCanvas·FloatingAgentChat). **신규 작업은 이 30/0을 절대 넘기지 말 것**(신규 범주 발견 시 중단).
- **할 일(비차단)**: set-state-in-effect 26건은 데이터 로딩 패턴이라 진짜 수정은 위험(동작 변경). 일괄 처리 시 (a) 각 effect에 `eslint-disable-next-line` 또는 (b) `load()`를 effect 밖 패턴으로 리팩터(범위 큼). 급하지 않음 — 배포 안전 확인됨.

### I3. 016 마이그레이션 = 죽은 정책(혼란)
- `016_workflows_team_editable`(wf_update를 누구나로 완화)을 만든 직후 사용자 의도와 반대임을 알고 `017_workflows_ownership_share`로 정정(소유자만). 원격엔 017만 유효.
- 신규 환경에서 016→017 순서 적용 시 결과 동일(017이 덮음). 단 016 파일은 의미 없음.
- **할 일**: (선택) 016 내용을 주석/no-op로 비우거나 그대로 둠(히스토리 보존). 급하지 않음.

### I4. 레거시 steps 변환이 저장 전까지 미반영
- 옛 배열형 `workflows.steps`는 편집기에서 열 때 `normalizeGraph`로 그래프 변환되지만, **저장 전까진 DB는 옛 형태**. 실행도 변환본으로 정상 동작.
- **할 일**: 없음(설계상 정상). 한 번 저장하면 `{nodes,edges}`로 영구 변환.

## 🟢 낮음 / 비차단

- **I5. 웹훅 응답 본문 미검증**: run 라우트가 webhook POST 후 status code만 봄(외부 처리 성공 여부 모름 — 웹훅 특성상 정상).
- ~~**I6. DB drift 미확인**~~ → ✅ **세션5 해소**: `list_migrations` 대조 결과 디스크 18개 ↔ 원격 18개 **1:1 일치, drift 없음**(001~017 + 001a baseline).
- **I7. 기존 부채(세션3부터)**: `agent_usage` onError 누락(성공 시만 기록) · Anthropic transient 500 재시도 없음 · `.or()` 특수문자 escape 부재 · NotificationBell UPDATE 미구독 · 그룹채팅/위젯 모바일/md 다크모드 미대응 · **채팅 이모지 팝오버가 스크롤 컨테이너(`overflow-y-auto`) 상단 근처서 클리핑**(pre-existing, 최신 메시지엔 무영향 · Portal/Floating UI로 해소 가능, 세션7 검증).
- **I8. 핀 교체 비원자성**: delete→insert 사이 실패 시 빈 핀(에러표시+resync로 방어, 완전방지엔 upsert RPC).
- **I10. 워크플로우 노드 순서 UI 다듬기(세션5, 나중에)**: 노드 좌상단 번호를 편집 가능한 입력으로 만들어 순서 변경+끈 자동연결(`OrderBadge` 컴포넌트, `WorkflowCanvas.tsx`). 동작은 하지만 ①20px 원형 입력이 작아 클릭/타깃 작음 ②노드 1개일 땐 변경 불가(자연스러움) ③Tab `tabIndex=order`가 페이지 전역 탭순서에 영향. 후속에서 "선택 노드 사이드 패널의 큰 순서 컨트롤" 또는 "위/아래 버튼"으로 교체 고려. **코드가 `OrderBadge`로 분리돼 있어 교체 쉬움.**
- **I11. 코드 꼬임 감사 보류분(세션6, 전부 비차단·동작 정상)**: 전체 감사에서 나왔으나 위험/가치 대비 보류 — ① **CalendarView 자체 `ModalShell`**(620줄): 다른 5개 뷰는 공용 `components/shared/Modal` 사용, Calendar만 자체 구현(이벤트 상세 로직 얽혀 마이그레이션 신중). ② **서명URL 컴포넌트 중복**: FilesView(60s)·CardDetail(300s)·DirectChat(3600s)가 `createSignedUrl` 패턴 반복(TTL 상이, 에러처리 불일치) → `lib/storage.ts`에 `getSignedUrl(supabase,bucket,path,ttl)` 추출 후보(OCR는 세션6에 이미 `buildOcrFilePart`로 추출 완료). ③ **에러 표기 불일치**: Mail/Mcp=toast, Finance/Projects/Calendar=모달내 setError, WorkflowsView.create()=피드백 없음(silent) → 최소한 WorkflowsView에 toast.error 추가 권장. ④ **빈/로딩 상태 UI 분산**: 6개 뷰가 제각각 → 공용 `EmptyState` 후보. ⑤ **내부전용 export 5건**: `Connector`(mcp.ts)·`ToolCatalogItem`(workflowTools.ts)·`WizardFieldType`(agentBuilder.ts)·`TempPreset`(agents.ts)·`toCsv`(csv.ts) — 외부 import 0, 캡슐화 위해 export 제거 가능(가치 낮음). ⑥ **pagination 패턴 중복**(Cards/Projects/Finance) → `useTablePagination` 후보(필터 구조 달라 추상화 복잡, 낮은 우선도).
- **I15. 현금흐름 손익계산기(세션21 적대리뷰 보류분, 비차단)**: ① **회사 기본 계산 유형 시드**(`cash_calc_types` insert=`is_workspace_member`)가 RLS로 막히면 조용히 null 폴백(표는 '계산' 단일컬럼) — 현재 단일 테넌트(equria 멤버)는 통과, B1-b 멀티테넌트 시 에러 노출/재시도로 견고화 필요(`CashFlowView` load 시드 블록 error 미체크). ② **pool(가용현금) 통화**는 슬롯 최빈 통화 1개로 표시 — 다통화 워크스페이스의 2차 통화는 pool 시각화 미반영(표는 통화별 분리 유지, buildSlotGraph). (7칸 초과 계산필드 엑셀 잘림은 세션21 동적컬럼으로 픽스됨.)
- **I14. 채팅 '작성 중' broadcast 미게이팅(세션9, 비차단·LOW)**: 타이핑 인디케이터는 `dm-<conversationId>` 채널의 Supabase **broadcast**로 전송하는데, broadcast/presence는 `private:true`+`realtime.messages` RLS가 있어야만 인가됨(현재 미적용). 따라서 인증된 워크스페이스 사용자가 **특정 대화 UUID를 알면** 그 채널을 구독해 ① 누가 입력 중인지(user_id) 수신 ② 가짜 '작성 중' 주입 가능. **단 위험 LOW**: 페이로드는 user_id뿐(메시지 내용 X), conversationId는 `gen_random_uuid()`+`dc_select` RLS로 **열거 불가**, 가짜 표시는 3.5s 자동소멸. **메시지 내용은 안전**(같은 채널의 postgres_changes 4종은 `038` 참여자 RLS로 서버 강제). 정식 차단=채널 `private:true`+`realtime.messages` 참여자 RLS+`setAuth`. 내부툴 수용 범위.
- **I13. 캘린더 일정 첨부(세션7, 마이그 026 · 비차단·동작 정상)**: ① 첨부 메타는 `calendar_events.attachments`(jsonb)에 이벤트와 **원자적**으로 저장(별도 테이블 아님) — message_attachments식 2단계 비원자성 없음. ② 단, 첨부를 폼에서 제거하거나 이벤트를 삭제해도 `calendar-files` 버킷의 실파일은 **남는다(orphan)** — 프로젝트의 storage cleanup 미사용 정책(마이그 008 이후)과 일관, 내부툴 수용 범위. ③ `mime_type`은 클라 제공값(신뢰도 한계). ④ Undo로 이벤트 삭제 복원 시 jsonb attachments도 함께 복원되나, orphan 정리는 없음. ⑤ 버킷 읽기 정책=인증 사용자 전체(팀 캘린더 공유 의도) — 워크스페이스 외부 비공개라 OK.
- **I12. 채팅 단계5(리치 텍스트·다중첨부) 보류분(세션6, 비차단·동작 정상)**: ① 메시지 insert→message_attachments insert가 2단계라 비원자성 — 첨부 insert 실패 시 메시지는 "파일 N개"로 남고 첨부 0(드묾, toast 알림). 완전방지엔 단일 RPC. ② body_json은 렌더가 이미 XSS-safe(JSON→React·href 화이트리스트·미지원노드 폴백)지만 insert 전 클라 검증(CHAT_EXTENSIONS 노드/마크 화이트리스트) 미적용 — 데이터 무결성 하드닝 여지. ③ CHAT_EXTENSIONS↔MessageBody 렌더러 1:1 동기화가 주석 규약뿐(유닛테스트 0) — 확장 추가 시 렌더 케이스 빠뜨리면 "보이나 저장 후 안 보임". ④ mime_type은 클라 제공값이라 이미지 판정 신뢰도 한계(확장자 폴백으로 보완). ⑤ 부분 업로드 실패 시 orphan storage 파일 가능(메시지 없음). 전부 내부툴 수용 범위.
- **I9. Supabase advisor 부채(세션5 점검, 전부 비차단)**: 보안 WARN 3(=`get_or_create_direct_conversation`·`mark_dm_read` SECURITY DEFINER 호출가능[설계상 의도] + leaked-password 보호 off[대시보드 토글]). 성능 96: `auth_rls_initplan` ×64(RLS에서 `auth.uid()`를 `(select auth.uid())`로 감싸면 해소) · `multiple_permissive_policies` ×5 · INFO(unindexed_fk ×16·unused_index ×11). 내부툴·소규모 데이터라 급하지 않음.
- **I16. 메일 첨부 3MB 한도 + 배치 파싱 엣지(세션27 적대리뷰, 비차단)**: ① Gmail 첨부를 JSON 본문(base64)으로 `/api/google/gmail/send`에 전송 → **Vercel 서버리스 요청 본문 4.5MB 제한** 때문에 base64 팽창(×1.33) 감안 **클라 가드 합계 3MB**(`MailCompose` MAX_TOTAL, 초과 시 toast). 더 큰 첨부는 Gmail 미디어 업로드(resumable) 직접 경로 필요 — 후속 개선. ② `batchGetThreadsMetadata`(스레드 목록 batch)는 파트 JSON을 첫`{`~마지막`}`로 추출·id로 순서 복원 → **파싱 실패/오류 스레드는 조용히 목록 누락**(그레이스풀이나 특이 메일에서 빠질 수 있음). ③ **수정 완료분**: 헤더 인젝션(CRLF)·첨부 파일명 따옴표·base64 비문자 = `buildRawMessage`(`oneLine`/`encodeHeaderValue`)에서 제거. Drive 다운로드=본인 OAuth 토큰이라 IDOR 없음 · Drive 쿼리=`esc()` 인젝션 방지 · 캐시=클라측(브라우저별) 교차유출 없음 — **리뷰 확인됨**.

- **I18. SSRF 잔여 위험(세션36 하드닝 후, 비차단·LOW)**: `lib/safeFetch.ts`가 문자열 검사에 더해 **DNS 실제 IP 공인검증**(v4/v6 사설·loopback·링크로컬·CGNAT·IPv4-mapped) + **리다이렉트 수동 매 홉 재검증**으로 강화됨(웹훅=`maxRedirects:0` 차단, 리서치 이미지 2곳=3홉). **잔여**: `assertPublicHost`의 검증 시점과 실제 `fetch`의 소켓 connect 사이에 DNS가 바뀌는 **초고속 리바인딩**은 검증된 IP로의 소켓 핀(undici dispatcher `connect.lookup`) 없이는 이론상 잔여. 내부툴·인증 직원 한정이라 LOW. 완전차단 원하면 undici Agent로 검증 IP 핀. (세션36 이전엔 최초 URL 호스트명 **문자열만** 검사해 리다이렉트·리바인딩 우회가 열려 있었음.)
- **✅ 세션36 해소분**: ① 워크플로우 `save_file`/`notify` CHECK 위반(마이그104) ② 채팅 비용 `usage`→`totalUsage` 과소집계 ③ 구글 OAuth 토큰 저장 `void`→`await`(lazy-thenable) ④ 알림 읽음 `void`→`await`(I7의 NotificationBell write 부분). — 상세 WORKLOG 세션36.

- **I17. 세션29 MCP 개인연결 마이너(세션30 전체 코드리뷰 발견, 비차단·미픽스)**: ① 개인 커넥터의 도구명이 다른 커넥터와 충돌하면 **조용히 덮어쓰기**(경고 없음). ② **GitHub 커넥터가 Copilot MCP 엔드포인트**라 일반 PAT로는 권한 범위 확인 필요. ③ MCP 도구 캐시 Map 키에 **프리픽스 없음**(서버 간 키 충돌 이론상 가능). 전부 비차단이나 커넥터 다중 사용 확대 시 점검.

## ✅ 세션4 신규 기능의 미검증(E2E) — 코드/빌드는 통과, 화면 동작만 미확인
- **워크플로우 실행을 실제로 한 번도 안 돌려봄**(인증 필요). 실제 Claude가 순서대로 도는지 사용자 확인 필요 = **다음 세션 최우선**.
- 6개 섹션·캔버스 드래그/끈 연결·다크모드·설정 저장·파일 업로드 = 브라우저 E2E 미확인.
- 세션3 코드리뷰 15건 E2E(계속 이월): 캘린더 멀티데이 lane·재무삭제→프로젝트합계·⌘Z연타·이모지.
