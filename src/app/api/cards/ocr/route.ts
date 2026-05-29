import { NextResponse } from "next/server"
import { generateObject } from "ai"
import { createClient } from "@/lib/supabase/server"
import { anthropic, MODELS } from "@/lib/claude/client"
import { businessCardSchema } from "@/lib/claude/schemas"

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

  const { data: signed, error: signErr } = await supabase.storage
    .from("business-cards")
    .createSignedUrl(path, 120)
  if (signErr || !signed) {
    return NextResponse.json({ error: "이미지 URL 생성 실패" }, { status: 500 })
  }

  const isPdf = path.toLowerCase().endsWith(".pdf")
  const filePart = isPdf
    ? ({
        type: "file" as const,
        data: new URL(signed.signedUrl),
        mediaType: "application/pdf",
      })
    : ({
        type: "image" as const,
        image: new URL(signed.signedUrl),
      })

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
  } catch (e) {
    return NextResponse.json(
      { error: `OCR 실패: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 502 }
    )
  }

  const { data: inserted, error: insErr } = await supabase
    .from("business_cards")
    .insert({
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
