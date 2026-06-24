import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const maxDuration = 20

/**
 * 원화 환산용 환율 — 통화별 'krw_per_unit'(1 단위 = ? 원)을 일별로 반환.
 * 캐시: fx_rates에 오늘 받아온 행이 있으면 외부 호출 없이 재사용(외부 API ≤ 1회/일).
 * 외부: Frankfurter(ECB, 무키) base=KRW → 1 KRW = X통화 → 역수로 'X원/단위'. 실패 시 DB 최신값 폴백.
 * 통화별 분리는 클라가 유지하고, 이 환율은 '환산 합계'에만 쓴다(BTC 제외 — 라우트는 fiat만).
 */
const FIAT = ["USD", "EUR", "JPY", "CNY"] as const

type RateRow = { currency: string; krw_per_unit: number; as_of: string }
type FxInsert = { currency: string; krw_per_unit: number; as_of: string; source: string }

function pickLatest(rows: RateRow[]) {
  const maxAsOf = rows.reduce((m, r) => (r.as_of > m ? r.as_of : m), rows[0].as_of)
  const latest = rows.filter((r) => r.as_of === maxAsOf)
  return {
    base: "KRW" as const,
    as_of: maxAsOf,
    rates: Object.fromEntries(latest.map((r) => [r.currency, Number(r.krw_per_unit)])),
  }
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  // 오늘 이미 받아온 환율이 있으면 캐시 사용
  const { data: fresh } = await admin
    .from("fx_rates")
    .select("currency, krw_per_unit, as_of")
    .gte("fetched_at", `${today}T00:00:00Z`)
    .order("as_of", { ascending: false })
  if (fresh && fresh.length > 0) return Response.json(pickLatest(fresh))

  // 외부 환율 fetch (ECB/Frankfurter). base=EUR(기본)이 풀정밀도 → krw_per_unit = (KRW/EUR) / (통화/EUR).
  // EUR 자신은 응답에 안 담기므로(=base) KRW/EUR 값을 그대로 쓴다.
  try {
    const r = await fetch(`https://api.frankfurter.dev/v1/latest?symbols=KRW,${FIAT.join(",")}`, { cache: "no-store" })
    if (!r.ok) throw new Error("fx upstream")
    const j = (await r.json()) as { date: string; rates: Record<string, number> }
    const krwPerEur = j.rates?.KRW
    const rows = FIAT.flatMap((c): FxInsert[] => {
      if (typeof krwPerEur !== "number" || krwPerEur <= 0) return []
      if (c === "EUR") return [{ currency: c, krw_per_unit: krwPerEur, as_of: j.date, source: "frankfurter" }]
      const perEur = j.rates?.[c]
      return typeof perEur === "number" && perEur > 0
        ? [{ currency: c, krw_per_unit: krwPerEur / perEur, as_of: j.date, source: "frankfurter" }]
        : []
    })
    if (rows.length > 0) await admin.from("fx_rates").upsert(rows, { onConflict: "currency,as_of" })
    return Response.json({
      base: "KRW",
      as_of: j.date ?? null,
      rates: Object.fromEntries(rows.map((x) => [x.currency, x.krw_per_unit])),
    })
  } catch {
    // 외부 실패 → DB 최신 환율이라도 반환
    const { data: latest } = await admin
      .from("fx_rates")
      .select("currency, krw_per_unit, as_of")
      .order("as_of", { ascending: false })
      .limit(20)
    if (latest && latest.length > 0) return Response.json(pickLatest(latest))
    return Response.json({ base: "KRW", as_of: null, rates: {} as Record<string, number> })
  }
}
