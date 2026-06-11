// 전자결재 양식(서식) 정의 — body(jsonb)에 저장되는 필드 스키마. 프론트 상수(마이그 불필요).

export const DOC_TYPES = ["일반기안", "지출결의서", "휴가신청서", "근태정정", "출장신청서"] as const
export type DocType = (typeof DOC_TYPES)[number]

export type Field = {
  key: string
  label: string
  type: "text" | "textarea" | "number" | "date" | "select"
  options?: readonly string[]
  placeholder?: string
}

export const DOC_FIELDS: Record<DocType, Field[]> = {
  일반기안: [{ key: "content", label: "내용", type: "textarea", placeholder: "기안 내용을 적어주세요" }],
  지출결의서: [
    { key: "amount", label: "금액(원)", type: "number", placeholder: "예: 50000" },
    { key: "category", label: "분류", type: "select", options: ["식비", "교통", "접대", "사무용품", "출장", "기타"] },
    { key: "spent_on", label: "사용일", type: "date" },
    { key: "content", label: "내용", type: "textarea", placeholder: "지출 내역" },
  ],
  휴가신청서: [
    { key: "leave_type", label: "휴가 종류", type: "select", options: ["연차", "반차", "병가", "경조사", "공가", "기타"] },
    { key: "start_date", label: "시작일", type: "date" },
    { key: "end_date", label: "종료일", type: "date" },
    { key: "content", label: "사유", type: "textarea", placeholder: "휴가 사유(선택)" },
  ],
  근태정정: [
    { key: "target_date", label: "대상일", type: "date" },
    { key: "content", label: "정정 사유", type: "textarea", placeholder: "예: 출근 체크 누락 — 09:00 정정" },
  ],
  출장신청서: [
    { key: "destination", label: "출장지", type: "text", placeholder: "예: 부산" },
    { key: "start_date", label: "시작일", type: "date" },
    { key: "end_date", label: "종료일", type: "date" },
    { key: "content", label: "목적", type: "textarea", placeholder: "출장 목적" },
  ],
}

// 목록/요약에 쓸 한 줄 요약(본문에서)
export function docSummary(docType: string, body: Record<string, unknown>): string {
  const b = body ?? {}
  if (docType === "지출결의서") return `${Number(b.amount ?? 0).toLocaleString()}원 · ${b.category ?? ""}`
  if (docType === "휴가신청서") return `${b.leave_type ?? ""} ${b.start_date ?? ""}~${b.end_date ?? ""}`
  if (docType === "출장신청서") return `${b.destination ?? ""} ${b.start_date ?? ""}~${b.end_date ?? ""}`
  if (docType === "근태정정") return `대상일 ${b.target_date ?? ""}`
  return String(b.content ?? "").slice(0, 40)
}
