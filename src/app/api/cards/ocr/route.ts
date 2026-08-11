import { NextResponse } from "next/server"
import { generateObject } from "ai"
import { createClient } from "@/lib/supabase/server"
import { getUserWorkspaceId } from "@/lib/workspace"
import { recordAiUsage, recordAiFailure } from "@/lib/aiUsage"
import { anthropic, MODELS } from "@/lib/claude/client"
import { businessCardSchema } from "@/lib/claude/schemas"
import { buildOcrFilePart } from "@/lib/storage"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * 명함 사진 → Claude Vision OCR → business_cards 자동 등록.
 * Body: { path: string }  // business-cards 버킷 내 업로드 경로 ({uid}/{file})
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { path } = (await req.json()) as { path?: string }
  if (!path) return NextResponse.json({ error: "path가 필요합니다." }, { status: 400 })
  if (!path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "잘못된 경로입니다." }, { status: 403 })
  }

  let filePart
  try {
    filePart = await buildOcrFilePart(supabase, "business-cards", path)
  } catch {
    return NextResponse.json({ error: "이미지 URL 생성 실패" }, { status: 500 })
  }

  const wsId = await getUserWorkspaceId(supabase, user.id) // B1-b: 쓰기에 워크스페이스 명시
  const startedAt = Date.now()

  let object
  try {
    const result = await generateObject({
      model: anthropic(MODELS.default),
      schema: businessCardSchema,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "이 명함에서 이름, 회사, 직책, 부서, 전화, 휴대폰, 이메일, 주소, 웹사이트를 추출해줘. 없는 항목은 빈 문자열.",
            },
            filePart,
          ],
        },
      ],
    })
    object = result.object
    // 세션44: 이 라우트는 사용량 집계에서 빠져 있었다(원가·크레딧 둘 다 누락).
    await recordAiUsage(supabase, {
      workspaceId: wsId,
      userId: user.id,
      model: MODELS.default,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      startedAt,
    })
  } catch (e) {
    await recordAiFailure(
      supabase,
      { workspaceId: wsId, userId: user.id, model: MODELS.default, startedAt },
      e
    )
    return NextResponse.json(
      { error: `OCR 실패: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 502 }
    )
  }

  const { data: inserted, error: insErr } = await supabase
    .from("business_cards")
    .insert({
      workspace_id: wsId as string,
      owner_id: user.id,
      name: object.name || null,
      company: object.company || null,
      title: object.title || null,
      department: object.department || null,
      phone: object.phone || null,
      mobile: object.mobile || null,
      email: object.email || null,
      address: object.address || null,
      website: object.website || null,
      image_url: path,
      raw_ocr: object,
    })
    .select()
    .single()

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  return NextResponse.json({ card: inserted })
}
