/** 외부 URL fetch 가드 — http(s)만 허용, 사설/로컬 호스트 차단(SSRF 방어). */
export function safeHttpUrl(raw: string): URL | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  const h = url.hostname.toLowerCase()
  if (
    h === "localhost" ||
    h === "0.0.0.0" ||
    h === "[::1]" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  ) {
    return null
  }
  return url
}
