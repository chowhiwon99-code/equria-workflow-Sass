import { NextResponse } from "next/server"
import { google } from "googleapis"
import { createClient } from "@/lib/supabase/server"
import { getGoogleAuthForUser, GOOGLE_NOT_CONNECTED } from "@/lib/google/client"
import { toThreadSummary, batchGetThreadsMetadata } from "@/lib/google/gmail"

export const runtime = "nodejs"
export const maxDuration = 60

/** 스레드 목록 — label/q/pageToken. 목록은 metadata만 받아 쿼터 절약(상세는 진입 시 full). */
export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const url = new URL(req.url)
  const label = url.searchParams.get("label") || "INBOX"
  const q = url.searchParams.get("q") || undefined
  const pageToken = url.searchParams.get("pageToken") || undefined

  try {
    const auth = await getGoogleAuthForUser(user.id)
    const gmail = google.gmail({ version: "v1", auth })
    const list = await gmail.users.threads.list({
      userId: "me",
      labelIds: q ? undefined : [label], // 검색 시엔 라벨 제한 없이 전체 검색
      q,
      maxResults: 18,
      pageToken,
    })
    const ids = (list.data.threads ?? []).map((t) => t.id).filter((x): x is string => Boolean(x))
    if (ids.length === 0) {
      return NextResponse.json({ threads: [], nextPageToken: list.data.nextPageToken ?? null })
    }
    // N+1 제거: threads.get 개별 호출 대신 Gmail batch 엔드포인트로 한 번에.
    const { token } = await auth.getAccessToken()
    if (!token) throw new Error("액세스 토큰을 가져오지 못했어요.")
    const threads = (await batchGetThreadsMetadata(token, ids)).map(toThreadSummary)
    return NextResponse.json({ threads, nextPageToken: list.data.nextPageToken ?? null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gmail 오류"
    if (msg === GOOGLE_NOT_CONNECTED) return NextResponse.json({ error: msg }, { status: 412 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
