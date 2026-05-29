/**
 * 직원 이름 ↔ 내부 이메일 변환.
 *
 * 직원은 이름과 비밀번호만 입력한다. Supabase Auth는 이메일이 필요하므로
 * 이름을 결정적(deterministic)으로 ASCII 이메일로 변환해 내부적으로만 사용한다.
 * 같은 이름 → 항상 같은 이메일 → 로그인 시 재현 가능.
 *
 * 브라우저/서버 양쪽에서 동작하도록 TextEncoder를 사용한다.
 */
const DOMAIN = process.env.INTERNAL_EMAIL_DOMAIN ?? "equria.local"

export function nameToEmail(name: string): string {
  const normalized = name.trim().toLowerCase()
  const bytes = new TextEncoder().encode(normalized)
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return `u${hex}@${DOMAIN}`
}
