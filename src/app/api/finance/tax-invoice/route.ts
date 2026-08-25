import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserWorkspaceId } from "@/lib/workspace"

export const runtime = "nodejs"

/**
 * 선택한 finance_entries들을 묶어 세금계산서 초안(tax_invoices) 생성.
 * 합계는 결정적으로 집계(AI 불필요). 작성·정리 전용 — 실제 전자발행 아님.
 * Body: { entryIds: string[], direction?: 'sales' | 'purchase' }
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { entryIds, direction } = (await req.json()) as {
    entryIds?: string[]
    direction?: "sales" | "purchase"
  }
  if (!entryIds || entryIds.length === 0) {
    return NextResponse.json({ error: "항목을 선택해 주세요." }, { status: 400 })
  }

  // 🔴 활성 워크스페이스로 명시 스코프한다. RLS는 "내가 속한 워크스페이스 전부"를 허용하므로
  //    (여러 회사에 속한 사용자가 있다), 이걸 빼면 B사 화면에서 A사 재무 항목 id를 넣어
  //    A사 데이터로 B사 세금계산서를 만들 수 있다(2026-08-25 리뷰 발견 — IDOR).
  const wsId = await getUserWorkspaceId(supabase, user.id)
  if (!wsId) return NextResponse.json({ error: "워크스페이스를 찾을 수 없어요." }, { status: 404 })

  const { data: entries, error: selErr } = await supabase
    .from("finance_entries")
    .select("*")
    .eq("workspace_id", wsId)
    .in("id", entryIds)
    .is("deleted_at", null)
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 })
  if (!entries || entries.length === 0) {
    return NextResponse.json({ error: "선택한 항목을 찾을 수 없습니다." }, { status: 404 })
  }

  const supply = entries.reduce((s, e) => s + Number(e.amount), 0)
  const tax = entries.reduce((s, e) => s + Number(e.tax_amount), 0)
  const total = entries.reduce((s, e) => s + Number(e.total_amount), 0)
  const items = entries.map((e) => ({
    name: e.vendor || e.description || "항목",
    supply: Number(e.amount),
    tax: Number(e.tax_amount),
    total: Number(e.total_amount),
    date: e.entry_date,
  }))

  const { data: inserted, error: insErr } = await supabase
    .from("tax_invoices")
    .insert({
      workspace_id: wsId, // B1-b: 쓰기에 워크스페이스 명시(위에서 이미 조회·null 체크됨)
      direction: direction ?? "purchase",
      supplier_name: entries[0].vendor || null,
      issue_date: new Date().toISOString().slice(0, 10),
      supply_amount: supply,
      tax_amount: tax,
      total_amount: total,
      items,
      status: "draft",
      source_entry_id: entries[0].id,
      created_by: user.id,
    })
    .select()
    .single()

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  return NextResponse.json({ invoice: inserted })
}
