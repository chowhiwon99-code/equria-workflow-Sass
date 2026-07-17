import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

// 오너(대표) 전용 시스템 점검 — 이번 세션에 겪은 종류의 설정 실수를 미리 잡는다.
// (공용비번이 시크릿 키, 앱 주소/구글 콜백이 옛 도메인, 키 누락 등). 값 자체는 반환하지 않고 상태만.
type Check = { name: string; status: "ok" | "warn" | "fail"; detail: string; fix?: string }

function hostOf(u?: string): string | null {
  if (!u) return null
  try {
    return new URL(u).host
  } catch {
    return null
  }
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const admin = createAdminClient()
  const { data: owned } = await admin.from("workspaces").select("id").eq("owner_id", user.id)
  if (!owned || owned.length === 0) return new Response("관리자(대표)만 볼 수 있어요.", { status: 403 })

  const env = process.env
  const appUrl = env.NEXT_PUBLIC_APP_URL
  const appHost = hostOf(appUrl)
  const checks: Check[] = []

  // 1) 앱 주소
  if (!appUrl) {
    checks.push({ name: "앱 주소", status: "fail", detail: "NEXT_PUBLIC_APP_URL 미설정", fix: "Vercel에 https://complow.kr 설정 후 재배포" })
  } else if (!appUrl.startsWith("https://") || appHost?.includes("vercel.app") || appHost?.includes("localhost")) {
    checks.push({ name: "앱 주소", status: "warn", detail: `프로덕션 도메인이 아닐 수 있음: ${appHost}`, fix: "https://complow.kr 로 맞추고 재배포" })
  } else {
    checks.push({ name: "앱 주소", status: "ok", detail: appHost! })
  }

  // 2) 공용 비밀번호(가입)
  const pw = env.WORKSPACE_PASSWORD
  if (!pw) {
    checks.push({ name: "공용 비밀번호(가입)", status: "fail", detail: "미설정 → 신규 가입 불가", fix: "짧은 공용 비번 설정 + 재배포" })
  } else if (pw.startsWith("sk_") || pw.startsWith("sk-") || pw.length > 40) {
    checks.push({ name: "공용 비밀번호(가입)", status: "fail", detail: "시크릿 키처럼 보임 → 가입 실패 원인", fix: "짧고 알기 쉬운 값으로 교체 + 재배포" })
  } else {
    checks.push({ name: "공용 비밀번호(가입)", status: "ok", detail: "정상 형태" })
  }

  // 3) 구글 연동(Gmail·Drive) — 콜백 주소가 앱 주소와 같은 도메인이어야 함
  const gr = env.GOOGLE_OAUTH_REDIRECT_URI
  const grHost = hostOf(gr)
  const googleConfigured = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
  if (!googleConfigured) {
    checks.push({ name: "구글 연동(Gmail·Drive)", status: "warn", detail: "구글 키 미설정 → 연동 비활성", fix: "쓰려면 GOOGLE_CLIENT_ID/SECRET 등 설정" })
  } else if (!gr) {
    checks.push({ name: "구글 연동(Gmail·Drive)", status: "fail", detail: "콜백 주소(GOOGLE_OAUTH_REDIRECT_URI) 미설정", fix: `https://${appHost ?? "complow.kr"}/api/google/callback 설정 + 구글 콘솔 등록` })
  } else if (appHost && grHost && grHost !== appHost) {
    checks.push({
      name: "구글 연동(Gmail·Drive)",
      status: "fail",
      detail: `콜백 주소가 앱 주소와 다름 (${grHost} ≠ ${appHost}) → Gmail·Drive 실패`,
      fix: `https://${appHost}/api/google/callback 로 맞추고 구글 콘솔 '승인된 리디렉션 URI'에도 등록`,
    })
  } else {
    checks.push({ name: "구글 연동(Gmail·Drive)", status: "ok", detail: grHost ?? "설정됨" })
  }

  // 4) AI(Claude) 키
  const anth = env.ANTHROPIC_API_KEY
  checks.push(
    anth && anth.startsWith("sk-ant")
      ? { name: "AI(Claude) 키", status: "ok", detail: "정상" }
      : { name: "AI(Claude) 키", status: "fail", detail: "ANTHROPIC_API_KEY 미설정/형식 이상", fix: "sk-ant-… 키 설정" }
  )

  // 5) 데이터베이스(Supabase)
  const sb = env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY
  checks.push(
    sb
      ? { name: "데이터베이스(Supabase)", status: "ok", detail: "키 설정됨" }
      : { name: "데이터베이스(Supabase)", status: "fail", detail: "Supabase 키 일부 미설정" }
  )

  return Response.json({ checks })
}
