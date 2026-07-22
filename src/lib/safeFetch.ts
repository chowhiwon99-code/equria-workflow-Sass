import { lookup } from "node:dns/promises"

/** 외부 URL fetch 가드 — http(s)만 허용, 사설/로컬 호스트 차단(SSRF 방어, 문자열 단계). */
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

/** 리터럴 IPv4가 사설/예약 대역인지. */
function isPrivateIpv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10/8
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64/10 CGNAT
    (a === 169 && b === 254) || // link-local(클라우드 메타데이터 169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) || // 172.16/12
    (a === 192 && b === 168) // 192.168/16
  )
}

/** 해석된 IP(v4/v6)가 내부/사설/링크로컬 대역인지 — DNS 리바인딩 방어의 핵심. */
function isPrivateIp(address: string, family: number): boolean {
  if (family === 4) return isPrivateIpv4(address)
  const l = address.toLowerCase()
  if (l === "::1" || l === "::") return true // loopback / unspecified
  if (/^fe[89ab]/.test(l)) return true // fe80::/10 link-local
  if (/^f[cd]/.test(l)) return true // fc00::/7 unique-local
  const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) // IPv4-mapped IPv6
  if (mapped) return isPrivateIpv4(mapped[1])
  return false
}

/**
 * 호스트명을 실제 DNS로 해석해 모든 IP가 공인망인지 확인.
 * 문자열 가드(safeHttpUrl)만으로는 "공개 도메인이 사설 IP로 풀리는" DNS 리바인딩을 못 막으므로 필요.
 * 하나라도 사설/로컬이면 throw.
 */
async function assertPublicHost(hostname: string): Promise<void> {
  let addrs: { address: string; family: number }[]
  try {
    addrs = await lookup(hostname, { all: true })
  } catch {
    throw new Error("호스트를 확인할 수 없습니다.")
  }
  if (addrs.length === 0) throw new Error("호스트를 확인할 수 없습니다.")
  for (const a of addrs) {
    if (isPrivateIp(a.address, a.family)) {
      throw new Error("내부/사설 IP로의 연결이 차단되었습니다.")
    }
  }
}

export type SafeFetchInit = RequestInit & {
  /** 허용 리다이렉트 홉 수. 웹훅=0(차단), 이미지=3(CDN 허용·매 홉 재검증). */
  maxRedirects?: number
}

/**
 * SSRF-safe fetch. ① URL 문자열 검증 ② DNS 실제 IP 공인 검증(리바인딩 차단)
 * ③ 리다이렉트를 fetch에 맡기지 않고 수동 추적하며 매 홉을 다시 ①②로 재검증(리다이렉트 우회 차단).
 * 차단/오류 시 throw — 호출부의 try/catch에서 처리.
 * (알려진 한계: check→connect 사이 DNS가 바뀌는 초고속 리바인딩은 IP 핀 없이는 잔여 위험 — known-issues 참조.)
 */
export async function safeFetch(raw: string, init: SafeFetchInit = {}): Promise<Response> {
  const { maxRedirects = 3, ...rest } = init
  let current = raw
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = safeHttpUrl(current)
    if (!url) throw new Error("허용되지 않는 URL입니다.")
    await assertPublicHost(url.hostname)
    const res = await fetch(url.href, { ...rest, redirect: "manual" })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location")
      if (!loc) return res // Location 없는 3xx는 그대로 반환
      current = new URL(loc, url).href // 다음 홉을 다시 ①②로 재검증
      continue
    }
    return res
  }
  throw new Error("리다이렉트가 허용 한도를 초과했습니다.")
}
