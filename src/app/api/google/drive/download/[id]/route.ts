import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { GOOGLE_NOT_CONNECTED } from "@/lib/google/client"
import { downloadDriveFile } from "@/lib/google/drive"

export const runtime = "nodejs"
export const maxDuration = 60

/** Drive 파일 다운로드(스트림). Google 문서류는 export(pdf/xlsx 등)로 변환해 내려줌. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const { id } = await params
  try {
    const { data, mimeType, filename } = await downloadDriveFile(user.id, id)
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Drive 오류"
    if (msg === GOOGLE_NOT_CONNECTED) return NextResponse.json({ error: msg }, { status: 412 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
