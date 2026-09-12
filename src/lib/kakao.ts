// 카카오톡 입구 — 결정 인프라 Unit C의 개인정보 방어선.
//
// 왜 필요한가: 카톡 대화는 회의록과 성질이 다르다. 업무 얘기 사이에 전화번호·계좌·주민번호가
// 아무렇지 않게 섞여 있고, 사용자는 그걸 의식하지 못한 채 통째로 붙여넣는다.
// 우리가 지키는 3겹:
//   ① **원문을 저장하지 않는다** — 본문엔 AI 요약 3줄만 남고 원문은 버려진다(호출부 책임).
//   ② **AI에 보내기 전에 마스킹한다** — 이 파일의 maskPii(). 모델 입력·로그 어디에도 원문 PII가 안 간다.
//   ③ **범위를 좁힌다** — sliceRecent(). 3년 치 대화를 통째로 태우지 않는다.
// 추출된 결정은 `source_app='kakao'`로 표시되어 사후 일괄 삭제가 가능하다.
//
// ⚠️ 마스킹은 **과하게** 잡는 쪽으로 설계했다. 업무 대화에서 10자리 이상 연속 숫자가 의미를 갖는
// 경우는 드물고, 하나라도 새는 것보다 몇 개 더 가리는 편이 낫다.

import type { ParsedTranscript } from "./transcript"

/** 적용 순서가 중요하다 — 좁은 패턴(주민·카드·전화)이 넓은 패턴(계좌·긴 숫자)보다 먼저 와야 한다. */
const RULES: { re: RegExp; to: string }[] = [
  { re: /[\w.+-]+@[\w-]+\.[\w.]{2,}/g, to: "[이메일]" },
  { re: /\b\d{6}\s*[-–]\s*[1-4]\d{6}\b/g, to: "[주민번호]" },
  { re: /\b\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b/g, to: "[카드번호]" },
  { re: /(\+?82[-\s]?)?\b01[016-9][-\s]?\d{3,4}[-\s]?\d{4}\b/g, to: "[전화번호]" },
  { re: /\b0\d{1,2}[-\s]\d{3,4}[-\s]\d{4}\b/g, to: "[전화번호]" },
  { re: /\b\d{2,6}-\d{2,6}-\d{2,8}\b/g, to: "[계좌번호]" },
  { re: /\b\d{10,16}\b/g, to: "[번호]" },
]

/** 전화·계좌·주민·이메일·카드번호를 가린다. AI 호출 직전에 반드시 통과시킬 것. */
export function maskPii(text: string): string {
  return RULES.reduce((acc, r) => acc.replace(r.re, r.to), text)
}

export type KakaoScope = "today" | "week" | "all"

export const SCOPE_LABEL: Record<KakaoScope, string> = {
  today: "오늘",
  week: "이번 주",
  all: "전체",
}

/**
 * 범위 슬라이스 — 붙여넣은 대화 중 최근 구간만 남긴다.
 *
 * 날짜가 없는 발화(카톡 외 소스, 또는 PC판에서 날짜 구분선 이전 줄)는 `all`에서만 남긴다.
 * 날짜를 모르는 것을 "오늘"로 쳐주면 범위 약속이 거짓이 되기 때문이다.
 * @param today yyyy-mm-dd (호출부가 사용자 로컬 날짜를 넘긴다 — 서버 UTC로 하루가 밀리는 것 방지)
 */
export function sliceRecent(t: ParsedTranscript, scope: KakaoScope, today: string): ParsedTranscript {
  if (scope === "all") return t
  const from = scope === "today" ? today : shiftDays(today, -6)
  return { ...t, segments: t.segments.filter((s) => !!s.date && s.date >= from && s.date <= today) }
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString("en-CA")
}
