/**
 * Supabase 변경 쿼리를 await 하고, {error}가 있으면 throw 한다.
 *
 * supabase-js 는 실패해도 reject 하지 않고 `{ data, error }` 로 resolve 하기 때문에,
 * Undo/Redo 콜백처럼 try/catch 로 성공/실패를 가르는 곳에서는 에러가 조용히 묻힌다
 * (UndoProvider 가 "되돌리기 성공"으로 오인). 역연산 쿼리는 이 헬퍼로 감싸
 * 실패 시 UndoProvider 의 catch → toast 가 뜨고, 액션이 스택에 남도록 한다.
 *
 * 예) await mustOk(supabase.from("calendar_events").delete().eq("id", id))
 */
export async function mustOk<T extends { error: { message: string } | null }>(
  query: PromiseLike<T>
): Promise<T> {
  const res = await query
  if (res.error) throw new Error(res.error.message)
  return res
}
