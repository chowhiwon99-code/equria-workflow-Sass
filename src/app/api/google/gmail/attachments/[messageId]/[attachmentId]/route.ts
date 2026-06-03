import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getGmailForUser, GOOGLE_NOT_CONNECTED } from "@/lib/google/client"

export const runtime = "nodejs"
export const maxDuration = 60

/** 첨부 다운로드(서버 프록시 — 토큰 클라 노출 금지). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ messageId: string; attachmentId: string }> }
) {
  const { messageId, attachmentId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const url = new URL(req.url)
  const filename = url.searchParams.get("name") || "attachment"
  const mime = url.searchParams.get("mime") || "application/octet-stream"

  try {
    const gmail = await getGmailForUser(user.id)
    const att = await gmail.users.messages.attachments.get({ userId: "me", messageId, id: attachmentId })
    const b64 = (att.data.data ?? "").replace(/-/g, "+").replace(/_/g, "/")
    const buf = Buffer.from(b64, "base64")
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gmail 오류"
    if (msg === GOOGLE_NOT_CONNECTED) return NextResponse.json({ error: msg }, { status: 412 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
