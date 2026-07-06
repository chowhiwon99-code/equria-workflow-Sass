import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { GOOGLE_NOT_CONNECTED } from "@/lib/google/client"
import { listDriveFiles } from "@/lib/google/drive"

export const runtime = "nodejs"
export const maxDuration = 60

/** Drive 파일/폴더 목록. parentId(폴더 안) 또는 q(검색). 목록은 metadata만 받아 가볍게. */
export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const url = new URL(req.url)
  const q = url.searchParams.get("q") || undefined
  const parentId = url.searchParams.get("parentId") || undefined
  const pageToken = url.searchParams.get("pageToken") || undefined

  try {
    const result = await listDriveFiles(user.id, { q, parentId, pageToken })
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Drive 오류"
    if (msg === GOOGLE_NOT_CONNECTED) return NextResponse.json({ error: msg }, { status: 412 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
