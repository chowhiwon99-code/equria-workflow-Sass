import { NextResponse } from "next/server"
import { generateObject } from "ai"
import { createClient } from "@/lib/supabase/server"
import { getUserWorkspaceId } from "@/lib/workspace"
import { recordAiUsage, recordAiFailure } from "@/lib/aiUsage"
import { anthropic, MODELS } from "@/lib/claude/client"
import { receiptSchema } from "@/lib/claude/schemas"
import { buildOcrFilePart } from "@/lib/storage"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * 영수증 사진 → Claude Vision OCR → finance_entries(draft) 자동 생성.
 * Body: { path: string }  // receipts 버킷 내 업로드 경로 ({uid}/{file})
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { path } = (await req.json()) as { path?: string }
  if (!path) return NextResponse.json({ error: "path가 필요합니다." }, { status: 400 })

  // 본인 폴더 검증 (RLS와 별개로 방어적)
  if (!path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "잘못된 경로입니다." }, { status: 403 })
  }

  // 모델이 접근할 수 있는 임시 서명 URL → filePart (공용 헬퍼)
  let filePart
  try {
    filePart = await buildOcrFilePart(supabase, "receipts", path)
  } catch {
    return NextResponse.json({ error: "이미지 URL 생성 실패" }, { status: 500 })
  }

  const wsId = await getUserWorkspaceId(supabase, user.id) // B1-b: 쓰기에 워크스페이스 명시
  const startedAt = Date.now()

  let object
  try {
    const result = await generateObject({
      model: anthropic(MODELS.default),
      schema: receiptSchema,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "이 영수증/세금계산서에서 거래처, 날짜, 공급가액, 부가세, 합계, 통화, 분류, 품목을 정확히 추출해줘. 금액은 숫자만(콤마 제거). 통화 기호(₩·$·€·¥·₿)로 통화 코드를 판별해줘.",
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
    .from("finance_entries")
    .insert({
      workspace_id: wsId as string,
      kind: "expense",
      entry_date: object.entry_date || new Date().toISOString().slice(0, 10),
      vendor: object.vendor || null,
      amount: object.amount,
      tax_amount: object.tax_amount,
      total_amount: object.total_amount,
      currency: object.currency || "KRW",
      category: object.category || null,
      receipt_url: path,
      source: "ocr",
      status: "draft",
      metadata: object,
      created_by: user.id,
    })
    .select()
    .single()

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  return NextResponse.json({ entry: inserted })
}
