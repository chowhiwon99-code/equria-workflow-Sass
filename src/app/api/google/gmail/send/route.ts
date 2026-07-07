import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getGmailForUser, GOOGLE_NOT_CONNECTED } from "@/lib/google/client"
import { buildRawMessage } from "@/lib/google/gmail"

export const runtime = "nodejs"
export const maxDuration = 60

/** 메일 전송/답장 — threadId 있으면 같은 스레드로(답장). */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    to?: string
    cc?: string
    bcc?: string
    subject?: string
    body?: string
    html?: string
    text?: string
    attachments?: { filename: string; mimeType: string; contentBase64: string }[]
    threadId?: string
    inReplyTo?: string
    references?: string
  }
  if (!body.to?.trim()) return NextResponse.json({ error: "받는 사람을 입력하세요." }, { status: 400 })

  try {
    const gmail = await getGmailForUser(user.id)
    const raw = buildRawMessage({
      to: body.to.trim(),
      cc: body.cc?.trim() || undefined,
      bcc: body.bcc?.trim() || undefined,
      subject: body.subject ?? "",
      html: body.html,
      text: body.text ?? body.body,
      attachments: body.attachments,
      inReplyTo: body.inReplyTo ?? null,
      references: body.references ?? null,
    })
    const sent = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, threadId: body.threadId || undefined },
    })
    return NextResponse.json({ ok: true, id: sent.data.id ?? null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gmail 오류"
    if (msg === GOOGLE_NOT_CONNECTED) return NextResponse.json({ error: msg }, { status: 412 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
