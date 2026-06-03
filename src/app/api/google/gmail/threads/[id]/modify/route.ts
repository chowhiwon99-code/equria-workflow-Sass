import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getGmailForUser, GOOGLE_NOT_CONNECTED } from "@/lib/google/client"

export const runtime = "nodejs"
export const maxDuration = 60

/** 스레드 라벨 변경 — 읽음(UNREAD 제거)/별표(STARRED)/보관(INBOX 제거)/휴지통(TRASH) 등. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { add?: string[]; remove?: string[] }

  try {
    const gmail = await getGmailForUser(user.id)
    await gmail.users.threads.modify({
      userId: "me",
      id,
      requestBody: { addLabelIds: body.add ?? [], removeLabelIds: body.remove ?? [] },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gmail 오류"
    if (msg === GOOGLE_NOT_CONNECTED) return NextResponse.json({ error: msg }, { status: 412 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
