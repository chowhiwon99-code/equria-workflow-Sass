import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

// 기억 삭제 = soft-delete(deleted_at 마킹). RLS가 "본인 것만"을 강제(남의 기억 못 지움).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; memoryId: string }> }
) {
  const { memoryId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const { error } = await supabase
    .from("agent_memories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", memoryId)
    .is("deleted_at", null)
  if (error) return new Response(error.message, { status: 500 })
  return Response.json({ ok: true })
}
