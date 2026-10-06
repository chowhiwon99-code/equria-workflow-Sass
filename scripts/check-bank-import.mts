// 통장 거래내역 가져오기 회귀 검사.
//
// 실행: `node --experimental-strip-types scripts/check-bank-import.mts` (레포 루트에서)
//       종료코드 0 = 전부 통과. 의존성 없음(순수 함수만).
//
// 왜 레포에 두는가: 열 감지는 키워드 **순서**에 기대고(입출금구분이 입금/출금에 먹히면 안 됨), 틀려도
// 조용히 금액·방향이 뒤바뀐 장부가 만들어진다. bankImport.ts를 만질 때 이 파일을 먼저 돌릴 것.
// ⚠️ 아래 표는 실제 은행 파일이 아니라 흔한 양식을 흉내 낸 합성 데이터다. 실제 파일로 확인되면 케이스를 추가할 것.
import {
  detectHeader,
  parseRows,
  parseAmount,
  parseDateTime,
  fingerprintKeys,
  hashKey,
  suggestCategory,
  vendorKey,
} from "../src/lib/bankImport.ts"
import { parseCsv } from "../src/lib/bankFile.ts"

let fail = 0
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`)
  if (!cond) {
    fail++
    if (extra !== undefined) console.log("      →", JSON.stringify(extra))
  }
}

// ── 1. 위에 계좌정보가 붙고, 출금/입금 분리 + 잔액 + '보낸분/받는분'
const layoutA = [
  ["거래내역조회"],
  ["계좌번호", "123-45-678901"],
  ["조회기간", "2026.09.01 ~ 2026.09.29"],
  [],
  ["거래일시", "적요", "보낸분/받는분", "송금메모", "출금액(원)", "입금액(원)", "잔액(원)", "거래점"],
  ["2026.09.28 14:03:11", "타행이체", "네이버파이낸셜", "", "0", "1,250,000", "3,250,000", "인터넷"],
  ["2026.09.27 09:10:00", "체크카드", "CJ대한통운", "", "33,000", "0", "2,000,000", "인터넷"],
  ["", "", "", "", "", "", "", ""],
  ["합계", "", "", "", "33,000", "1,250,000", "", ""],
]
const hA = detectHeader(layoutA)
check("A 머리행 = 4", hA?.headerRow === 4, hA)
check("A 열 매핑", hA?.map.date === 0 && hA?.map.description === 2 && hA?.map.memo === 1 && hA?.map.withdraw === 4 && hA?.map.deposit === 5 && hA?.map.balance === 6, hA?.map)
const pA = parseRows(layoutA, hA!.headerRow, hA!.map)
check("A 거래 2건 · 합계행 건너뜀", pA.txns.length === 2 && pA.skipped === 1, pA)
check("A 입금 1,250,000", pA.txns[0].direction === "in" && pA.txns[0].amount === 1250000 && pA.txns[0].balance === 3250000, pA.txns[0])
check("A 시각 보존", pA.txns[0].date === "2026-09-28" && pA.txns[0].time === "14:03:11", pA.txns[0])
check("A 출금 · 거래처/적요", pA.txns[1].direction === "out" && pA.txns[1].description === "CJ대한통운" && pA.txns[1].memo === "체크카드", pA.txns[1])

// ── 2. 날짜/시간 분리 + '출금(원)/입금(원)' + 내용·적요 둘 다
const layoutB = [
  ["거래일자", "거래시간", "적요", "출금(원)", "입금(원)", "내용", "잔액(원)", "거래점"],
  ["2026-09-15", "10:22:05", "FB결제", "120,000", "", "META PLATFORMS", "880,000", "본점"],
]
const hB = detectHeader(layoutB)
check("B 매핑(내용=거래처, 적요=메모, 시간 열)", hB?.map.description === 5 && hB?.map.memo === 2 && hB?.map.time === 1, hB?.map)
const pB = parseRows(layoutB, hB!.headerRow, hB!.map)
check("B 시간 열에서 시각", pB.txns[0]?.time === "10:22:05", pB.txns[0])

// ── 3. 금액 한 열 + '구분'(입금/출금) — '입출금구분'류가 입금/출금 열을 가로채면 안 됨
const layoutC = [
  ["거래일", "입출금구분", "거래금액", "거래후잔액", "기재내용"],
  ["2026/9/3", "출금", "55,000", "445,000", "가비아"],
  ["2026/9/4", "입금", "200,000", "645,000", "쿠팡"],
]
const hC = detectHeader(layoutC)
check("C 매핑(direction/amount/balance)", hC?.map.direction === 1 && hC?.map.amount === 2 && hC?.map.balance === 3 && hC?.map.deposit == null, hC?.map)
const pC = parseRows(layoutC, hC!.headerRow, hC!.map)
check("C 방향 = 출금, 입금", pC.txns[0]?.direction === "out" && pC.txns[1]?.direction === "in", pC.txns)
check("C 날짜 한 자리 월/일", pC.txns[0]?.date === "2026-09-03", pC.txns[0])

// ── 4. 부호 있는 금액 한 열
const layoutD = [
  ["날짜", "내용", "금액", "잔액"],
  ["20260920", "월세", "-500,000", "1,000,000"],
  ["20260921", "고객 입금", "+80,000", "1,080,000"],
]
const pD = parseRows(layoutD, 0, detectHeader(layoutD)!.map)
check("D 부호로 방향", pD.txns[0]?.direction === "out" && pD.txns[0]?.amount === 500000 && pD.txns[1]?.direction === "in", pD.txns)

// ── 5. 날짜·금액 파서
check("날짜 2026.09.29 13:22", JSON.stringify(parseDateTime("2026.09.29 13:22")) === JSON.stringify({ date: "2026-09-29", time: "13:22:00" }))
check("날짜 26.09.29", parseDateTime("26.09.29")?.date === "2026-09-29")
check("날짜 2026년 9월 3일", parseDateTime("2026년 9월 3일")?.date === "2026-09-03")
check("날짜 합계 → null", parseDateTime("합계") === null)
check("날짜 13월 → null", parseDateTime("2026-13-01") === null)
check("금액 1,234원", parseAmount("1,234원") === 1234)
check("금액 (5,000) → -5000", parseAmount("(5,000)") === -5000)
check("금액 빈칸 → null", parseAmount("  ") === null)
check("금액 문자 → null", parseAmount("abc") === null)

// ── 6. 지문 — 완전 동일 거래 2건은 구분, 같은 입력은 같은 지문(재업로드 차단)
const dup = [
  ["날짜", "내용", "금액"],
  ["2026-09-01", "커피", "-4,500"],
  ["2026-09-01", "커피", "-4,500"],
]
const pDup = parseRows(dup, 0, detectHeader(dup)!.map)
const k1 = fingerprintKeys(pDup.txns)
const k2 = fingerprintKeys(parseRows(dup, 0, detectHeader(dup)!.map).txns)
check("동일 거래 2건 지문 다름", k1[0] !== k1[1], k1)
check("재파싱 지문 동일", JSON.stringify(k1) === JSON.stringify(k2))
const h = await hashKey(k1[0])
check("해시 32자 hex", /^[0-9a-f]{32}$/.test(h), h)

// ── 7. 분류 제안 — 기억 > 규칙 > 기타
const hist = new Map([[`out:${vendorKey("CJ 대한통운")}`, "생산비용"]])
check("기억이 규칙보다 우선", suggestCategory({ direction: "out", description: "CJ대한통운", memo: null }, hist) === "생산비용")
check("규칙: 택배 → 물류비용", suggestCategory({ direction: "out", description: "로젠택배", memo: null }, new Map()) === "물류비용")
check("규칙: 입금 네이버 → 네이버스마트", suggestCategory({ direction: "in", description: "네이버파이낸셜", memo: null }, new Map()) === "네이버스마트")
check("모르면 기타", suggestCategory({ direction: "out", description: "홍길동", memo: null }, new Map()) === "기타")

// ── 8. CSV — 따옴표 안 쉼표, 탭 구분
const csv = parseCsv('거래일,내용,금액\n2026-09-01,"커피, 케이크",-9000\r\n')
check("CSV 따옴표 안 쉼표", csv[1]?.[1] === "커피, 케이크" && csv[1]?.[2] === "-9000", csv)
check("TSV 탭 구분", parseCsv("a\tb\tc\n1\t2\t3")[1]?.[2] === "3")

console.log(fail === 0 ? "\n모두 통과" : `\n${fail}개 실패`)
process.exit(fail === 0 ? 0 : 1)
