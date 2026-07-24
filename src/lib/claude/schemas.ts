import { z } from "zod"

/** 영수증 OCR 추출 결과 */
export const receiptSchema = z.object({
  vendor: z.string().describe("거래처/상호명. 없으면 빈 문자열"),
  entry_date: z.string().describe("거래 날짜 YYYY-MM-DD. 불명확하면 빈 문자열"),
  amount: z.number().describe("공급가액(부가세 제외). 불명확하면 합계와 동일하게"),
  tax_amount: z.number().describe("부가세. 없으면 0"),
  total_amount: z.number().describe("총 결제 합계"),
  currency: z.string().describe("통화 코드: ₩/원→KRW, $/USD→USD, €→EUR, ¥/엔→JPY, 元/위안→CNY, ₿/BTC→BTC. 불명확하면 KRW"),
  category: z.string().describe("분류 추정: 식비/교통/숙박/소프트웨어/사무용품/기타"),
  items: z
    .array(z.object({ name: z.string(), price: z.number() }))
    .describe("개별 품목 목록 (있으면)"),
})
export type ReceiptResult = z.infer<typeof receiptSchema>

/** 명함 OCR 추출 결과 */
export const businessCardSchema = z.object({
  name: z.string().describe("이름"),
  company: z.string().describe("회사명"),
  title: z.string().describe("직책/직위"),
  department: z.string().describe("부서"),
  phone: z.string().describe("유선 전화번호"),
  mobile: z.string().describe("휴대폰 번호"),
  email: z.string().describe("이메일"),
  address: z.string().describe("주소"),
  website: z.string().describe("웹사이트/URL"),
})
export type BusinessCardResult = z.infer<typeof businessCardSchema>

/** 현금흐름 AI 코칭 결과 — 현재 손익(P&L) 스냅샷 분석. 근거(금액·비율) 있는 것만, 없으면 빈 배열. */
export const cashCoachSchema = z.object({
  health: z.object({
    level: z.enum(["good", "caution", "warning"]).describe("전반 재무 건강도: good=양호, caution=주의, warning=경고"),
    headline: z.string().describe("한 줄 진단 (예: 흑자지만 비용 비중이 높음)"),
    summary: z.string().describe("2~3문장 종합 진단. 데이터의 실제 숫자·비율 근거로."),
  }),
  savings: z
    .array(
      z.object({
        title: z.string().describe("절감 제안 제목 (간결, 대상 항목 언급)"),
        detail: z.string().describe("구체적 실행 방안. 반드시 금액/비율 근거를 포함."),
        target: z.string().describe("대상 항목명(정확히). 특정 항목 없으면 빈 문자열"),
      })
    )
    .describe("비용 절감 기회 0~4개. 근거 있는 것만. 없으면 빈 배열."),
  anomalies: z
    .array(
      z.object({
        severity: z.enum(["info", "caution", "warning"]).describe("info=참고, caution=주의, warning=경고"),
        title: z.string().describe("이상 신호 제목"),
        detail: z.string().describe("왜 이상한지 + 권장 조치. 숫자 근거 포함."),
        target: z.string().describe("대상 항목명. 없으면 빈 문자열"),
      })
    )
    .describe("이상 신호 0~4개. 비용>매출·특정 비용 과다·순이익 마이너스·통화 편중·가용현금 부족 등. 없으면 빈 배열."),
  trends: z
    .array(
      z.object({
        direction: z.enum(["up", "down", "flat"]).describe("추세 방향: up=증가, down=감소, flat=횡보"),
        metric: z.enum(["revenue", "expense", "profit"]).describe("대상 지표: revenue=매출, expense=비용, profit=순이익"),
        title: z.string().describe("추세 요약 제목 (예: 매출 3개월 연속 감소)"),
        detail: z.string().describe("월별 수치나 전월대비 변화율 근거를 포함. 1~2문장."),
      })
    )
    .describe("실제 회계 내역(장부) 기준 최근 월별 추세에서 발견한 신호 0~3개. 추세 데이터가 없으면 빈 배열."),
})
export type CashCoachResult = z.infer<typeof cashCoachSchema>

/** 에이전트 자동 기억 추출 결과 — 대화에서 "오래 기억할 사용자 정보"만. 없으면 빈 배열. */
export const memoryExtractionSchema = z.object({
  memories: z
    .array(
      z.object({
        kind: z
          .enum(["fact", "preference", "style", "correction"])
          .describe("사실(fact)·선호(preference)·말투(style)·교정(correction) 중 하나"),
        content: z
          .string()
          .describe("오래 기억할 한 문장. 이 사용자 고유이고 앞으로도 유효한 것만. 구체적으로."),
      })
    )
    .describe("새로 기억할 항목 0~5개. 애매하거나 일회성이면 넣지 말고, 없으면 빈 배열."),
})
export type MemoryExtractionResult = z.infer<typeof memoryExtractionSchema>
