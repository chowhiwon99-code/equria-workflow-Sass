// 전사·카톡 파서 회귀 검사 — 결정 인프라 Unit C.
//
// 실행: `node --experimental-strip-types scripts/check-kakao-parser.mts` (레포 루트에서)
//       종료코드 0 = 전부 통과. 테스트 러너·의존성 없음(순수 함수라 Node만으로 돈다).
//
// 왜 레포에 두는가: `detectAndParseTranscript`의 **감지 순서**는 깨지기 쉽고, 깨져도 조용하다.
// kakao를 plain 앞에 넣은 게 Unit C의 버그 수정인데, 순서를 되돌리거나 새 파서를 끼워 넣으면
// 카톡 PC판이 다시 `"[홍길동] [오후 2"` 같은 화자로 오식된다. 파서를 만질 때 이 파일을 먼저 돌릴 것.
// 마스킹 규칙도 같은 이유다 — 순서가 바뀌면(전화 ↔ 계좌) PII가 새기 시작한다.
import { detectAndParseTranscript, transcriptToText } from "../src/lib/transcript.ts"
import { maskPii, sliceRecent } from "../src/lib/kakao.ts"

let fail = 0
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`)
  if (!cond) {
    fail++
    if (extra !== undefined) console.log("      →", JSON.stringify(extra))
  }
}

// ── 1. 안드로이드
const android = `홍길동님과 카카오톡 대화
저장한 날짜 : 2026-09-12 09:00:00

2026년 9월 10일 오후 2:31, 홍길동 : 리필 파우치 가격 어떻게 할까요
2026년 9월 10일 오후 2:32, 김철수 : 9900원으로 가시죠
2026년 9월 10일 오후 2:33, 홍길동 : 네 그럼 9900원으로 확정합니다
2026년 9월 12일 오전 10:05, 김철수 : 배송비는 다음에 정해요`
const a = detectAndParseTranscript(android)
check("안드로이드 = kakao", a?.source === "kakao", a?.source)
check("안드로이드 발화 4개", a?.segments.length === 4, a?.segments.length)
check("안드로이드 화자/시각/날짜", a?.segments[0].speaker === "홍길동" && a?.segments[0].ts === "14:31" && a?.segments[0].date === "2026-09-10", a?.segments[0])
check("오전 10:05 → 10:05", a?.segments[3].ts === "10:05", a?.segments[3].ts)

// ── 2. iOS
const ios = `2026. 9. 10. 오후 2:31, 홍길동 : 리필 파우치 가격 어떻게 할까요
2026. 9. 10. 오후 2:32, 김철수 : 9900원으로 가시죠
2026. 9. 10. 오후 12:00, 홍길동 : 정오 테스트
2026. 9. 10. 오전 12:15, 김철수 : 자정 테스트`
const i = detectAndParseTranscript(ios)
check("iOS = kakao", i?.source === "kakao", i?.source)
check("iOS 오후 12시 → 12:00", i?.segments[2].ts === "12:00", i?.segments[2].ts)
check("iOS 오전 12시 → 00:15", i?.segments[3].ts === "00:15", i?.segments[3].ts)

// ── 3. PC (오식 버그의 현장)
const pc = `홍길동님과 카카오톡 대화
저장한 날짜 : 2026-09-12 09:00:00

--------------- 2026년 9월 10일 목요일 ---------------
[홍길동] [오후 2:31] 리필 파우치 가격 어떻게 할까요
[김철수] [오후 2:32] 9900원으로 가시죠
[홍길동] [오후 2:33] 네 그럼 9900원으로 확정합니다
--------------- 2026년 9월 12일 토요일 ---------------
[김철수] [오전 10:05] 배송비는 다음에 정해요`
const p = detectAndParseTranscript(pc)
check("PC = kakao (plain 오식 아님)", p?.source === "kakao", p?.source)
check("PC 화자 = 홍길동 (['홍길동'] ['오후 2 아님)", p?.segments[0].speaker === "홍길동", p?.segments[0].speaker)
check("PC 발화 온전", p?.segments[0].text === "리필 파우치 가격 어떻게 할까요", p?.segments[0].text)
check("PC 날짜 구분선 반영", p?.segments[0].date === "2026-09-10" && p?.segments[3].date === "2026-09-12", p?.segments.map((s) => s.date))

// ── 4. 회귀: 기존 형식이 여전히 잡히는가 (우선순위 삽입의 유일한 리스크)
const plain = `홍길동: 이번 분기 목표를 정리해 봅시다
김철수: 매출 3억이 목표였습니다
홍길동: 마케팅 예산은 어떻게 되나요
김철수: 오천만원 잡혀 있습니다
홍길동: 좋습니다 그대로 갑시다`
check("기존 '이름: 발화' = plain 유지", detectAndParseTranscript(plain)?.source === "plain", detectAndParseTranscript(plain)?.source)

const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
<v 홍길동>가격 얘기부터 합시다

00:00:04.000 --> 00:00:08.000
<v 김철수>9900원이 적당합니다

00:00:08.000 --> 00:00:12.000
<v 홍길동>확정하겠습니다`
check("VTT 유지", detectAndParseTranscript(vtt)?.source === "vtt", detectAndParseTranscript(vtt)?.source)

const clova = `홍길동 00:01
가격 얘기부터 합시다
김철수 00:04
9900원이 적당합니다
홍길동 00:08
확정하겠습니다`
check("클로바 유지", detectAndParseTranscript(clova)?.source === "clova", detectAndParseTranscript(clova)?.source)

// ── 5. 일반 붙여넣기는 절대 전사로 오인하지 않는다
const article = `오늘 회의는 길었다. 여러 안건이 나왔고 다들 의견이 달랐다.
결국 다음 주에 다시 모이기로 했다. 자료는 각자 준비해 오기로 했다.
그리고 점심은 근처 식당에서 먹었다. 날씨가 좋았다.`
check("일반 글 → null", detectAndParseTranscript(article) === null, detectAndParseTranscript(article)?.source)

// ── 6. 마스킹
const dirty = `제 번호는 010-1234-5678이고 사무실은 02-555-1234입니다.
계좌는 국민 123456-01-789012 로 보내주세요. 카드 1234-5678-9012-3456 썼습니다.
주민번호 900101-1234567 이고 메일은 hong.gil@example.co.kr 입니다.
계좌번호 1002345678901 입니다. 가격은 29,000원으로 합니다.`
const masked = maskPii(dirty)
console.log("\n--- 마스킹 결과 ---\n" + masked + "\n")
check("전화번호 0건", !/01[016-9][-\s]?\d{3,4}[-\s]?\d{4}/.test(masked))
check("지역번호 전화 0건", !/\b0\d{1,2}[-\s]\d{3,4}[-\s]\d{4}\b/.test(masked))
check("주민번호 0건", !/\d{6}\s*-\s*[1-4]\d{6}/.test(masked))
check("카드번호 0건", !/\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}/.test(masked))
check("이메일 0건", !/@/.test(masked))
check("긴 계좌번호 0건", !/\b\d{10,16}\b/.test(masked))
check("금액(29,000원)은 보존", masked.includes("29,000원"), masked)

// ── 7. 범위 슬라이스
const today = "2026-09-12"
check("scope=today → 1건", sliceRecent(a!, "today", today).segments.length === 1, sliceRecent(a!, "today", today).segments.length)
check("scope=week → 4건(9/6~9/12)", sliceRecent(a!, "week", today).segments.length === 4, sliceRecent(a!, "week", today).segments.length)
check("scope=all → 4건", sliceRecent(a!, "all", today).segments.length === 4)
check("날짜 없는 소스는 today에서 0건", sliceRecent(detectAndParseTranscript(plain)!, "today", today).segments.length === 0)

console.log("\n--- AI 입력 미리보기(카톡) ---\n" + transcriptToText(sliceRecent(a!, "all", today)))
console.log(fail === 0 ? "\n✅ ALL PASS" : `\n❌ ${fail} FAILED`)
process.exit(fail === 0 ? 0 : 1)
