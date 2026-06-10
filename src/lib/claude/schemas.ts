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
