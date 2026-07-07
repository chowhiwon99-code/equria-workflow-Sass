# 빌드 스펙 — 메일(Gmail) 작성 UI를 Gmail 수준으로

> 참조 전략: `GOOGLE-MCP-ARCHITECTURE.md` §Phase B(Gmail). 대표 요구(2026-07): 작성창에 Gmail과 같은 기능 포함.

## 목표
`/mail`의 메일 작성을 **Gmail 작성창 수준의 기본기 + AI 차별화**로.
- **전략**: Gmail을 100% 카피(= 더 못한 Gmail)하지 않는다. **기본기는 Gmail만큼**(안 빈약하게) + **Gmail이 못하는 "회사 톤 AI"로 이긴다.**
- 핵심(받는사람/참조/숨은참조·제목·리치본문·첨부·전송) 먼저, 부가(예약·서명 등) 나중.

## 🌟 차별화 — AI 메일 에이전트 (compose 내장, Complow의 핵심 가치)
작성창 안에 **"회사 톤으로 다듬기"** 를 넣는다. 사용자가 요점만 대충 써도 → **회사 표준 메일**로 재작성.
- **회사 메일 예의 반영**: 인사말/맺음말·존댓말·격식 톤·서명 형식 등. 규칙은 **회사가 설정하는 "메일 에이전트"의 시스템 프롬프트**에 담김(회사별 커스터마이징).
- **⚠️ AI 티 절대 금지(대표 강조)**: 이모지·이모티콘·과한 마크다운 강조·줄표(—) 장식·"물론입니다!"류 군더더기 없이 → **사람이 쓴 담백한 실무 메일**처럼. (같은 규칙을 회의노트 assist에도 적용함 — `meeting-notes/assist` OUTPUT_RULE.)
- 톤 조절(격식↔친근)·번역·요약도 같은 버튼에서.
- **재사용**: 에이전트 시스템(`agent_versions`·`agentBuilder`) 그대로 — "메일 에이전트"는 그냥 에이전트 하나. `/api/chat/assist`·`meeting-notes/assist`의 **AI 다듬기 패턴(streamText 재작성)** 을 메일에 적용.
- **효과**: 신입도 회사 표준 메일을 즉시 작성 → 전사 메일 톤 일관 → **raw Gmail 대신 Complow 쓸 이유.**
- → `agents.md`와 연결(메일 에이전트 = 회사 커스터마이징 에이전트의 대표 사례).

## 현재 상태
- ✅ Gmail 라우트 존재: 스레드 목록/상세·라벨·**전송(send)**·수정·첨부 (`/api/google/gmail/*`)
- ✅ `buildRawMessage()`(RFC2822, `src/lib/google/gmail.ts`) — **CC/BCC/HTML/첨부 지원 여부 확인·확장 필요**
- ✅ **Tiptap 리치 에디터**·서식 이미 사용 중(채팅 `RichComposer`, 회의노트 `MeetingEditor`) → 재사용
- ⚠️ MailShell 3-pane(목록·상세·**작성창**) UI 미완 — 특히 리치 작성창 없음

## 작업 (순서)
### 1차 — 핵심 작성창
1. **작성 모달/패널**: 받는사람·**참조·숨은참조(토글)**·제목 필드 + 본문(Tiptap).
2. **서식 툴바**: 굵게·기울임·밑줄·글자색·정렬·번호/불릿 리스트·링크. → Tiptap 기존 확장 재사용.
3. **첨부**: 파일 업로드(`uploadFile`)·용량 표시·삭제.
4. **전송**: `buildRawMessage` 확장(To/CC/BCC·HTML 본문·multipart 첨부) → send 라우트로. 답장 시 `threadId`·`In-Reply-To`.
5. **인박스 3-pane 연결**: 목록→상세→"답장/새 메일"→작성창.

### 2차 — 부가 (Gmail 우측 아이콘들)
- 예약 발송(scheduled send) · 서명(signature, 사용자별 저장) · **Drive 첨부**(Drive 통합 재사용) · 이모지 피커 · 인라인 이미지 · 임시보관(draft 저장)

## 재사용
`RichComposer`/Tiptap 확장(chat·meetings) · `buildRawMessage`·gmail 라우트(gmail.ts) · `uploadFile`(upload.ts) · Drive 첨부는 `google/drive.ts` 재사용.

## 🔴 블로커 / 주의
- **전송 라우트 검증**: 현재 send가 CC/BCC/첨부/HTML을 지원하는지 먼저 확인 → 부족하면 `buildRawMessage`부터 확장.
- Vercel 60s·용량: 큰 첨부는 스트림/제한. Gmail API 전송은 base64url MIME.
- B1-b 무관(개인 Gmail 연동).

## 검증 (E2E)
tsc0·lint30/0·build0 → 연결된 계정으로 새 메일: 받는사람·참조·숨은참조·서식(굵게/색/리스트)·첨부 → 전송 → 실제 수신 확인 → 답장 스레드 유지 확인.
