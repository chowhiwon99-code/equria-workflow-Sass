import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getGmailForUser, GOOGLE_NOT_CONNECTED } from "@/lib/google/client"
import { toMailMessage, toThreadSummary } from "@/lib/google/gmail"

export const runtime = "nodejs"
export const maxDuration = 60

/** 스레드 상세 — 메시지 전체(full). 본문 HTML 새니타이즈는 클라이언트(DOMPurify). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  try {
    const gmail = await getGmailForUser(user.id)
    const t = await gmail.users.threads.get({ userId: "me", id, format: "full" })
    const messages = (t.data.messages ?? []).map(toMailMessage)
    const subject = toThreadSummary(t.data).subject
    return NextResponse.json({ id, subject, messages })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gmail 오류"
    if (msg === GOOGLE_NOT_CONNECTED) return NextResponse.json({ error: msg }, { status: 412 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
