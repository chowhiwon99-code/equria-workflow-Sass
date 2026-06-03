import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getGmailForUser, GOOGLE_NOT_CONNECTED } from "@/lib/google/client"
import { toMailLabel } from "@/lib/google/gmail"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  try {
    const gmail = await getGmailForUser(user.id)
    const { data } = await gmail.users.labels.list({ userId: "me" })
    const labels = (data.labels ?? []).map(toMailLabel)
    return NextResponse.json({ labels })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gmail 오류"
    if (msg === GOOGLE_NOT_CONNECTED) return NextResponse.json({ error: msg }, { status: 412 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
