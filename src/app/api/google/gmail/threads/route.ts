import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getGmailForUser, GOOGLE_NOT_CONNECTED } from "@/lib/google/client"
import { toThreadSummary } from "@/lib/google/gmail"

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
    const gmail = await getGmailForUser(user.id)
    const list = await gmail.users.threads.list({
      userId: "me",
      labelIds: q ? undefined : [label], // 검색 시엔 라벨 제한 없이 전체 검색
      q,
      maxResults: 25,
      pageToken,
    })
    const ids = (list.data.threads ?? []).map((t) => t.id).filter((x): x is string => Boolean(x))
    const threads = await Promise.all(
      ids.map(async (id) => {
        const t = await gmail.users.threads.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        })
        return toThreadSummary(t.data)
      })
    )
    return NextResponse.json({ threads, nextPageToken: list.data.nextPageToken ?? null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gmail 오류"
    if (msg === GOOGLE_NOT_CONNECTED) return NextResponse.json({ error: msg }, { status: 412 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
