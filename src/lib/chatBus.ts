// 같은 브라우저의 여러 창/탭 간 채팅 즉시 동기화 — BroadcastChannel.
// Supabase Realtime(원격/타기기)을 보강해, 한 창에서 보낸·수정·삭제·읽음을 다른 창에 즉시 반영한다.
// 같은 채널 인스턴스(같은 창)에는 echo되지 않으므로, 보낸 창은 자체 낙관적 갱신/Realtime으로 처리.

let ch: BroadcastChannel | null = null

function bus(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null
  if (!ch) ch = new BroadcastChannel("equria-chat")
  return ch
}

/** 채팅 변경 신호를 다른 창/탭으로 보냄. conversationId는 해당 대화방(없으면 전체). */
export function emitChat(conversationId?: string | null): void {
  bus()?.postMessage({ conversationId: conversationId ?? null })
}

/** 다른 창의 채팅 변경 신호를 구독. 반환값은 정리 함수. */
export function onChat(cb: (conversationId: string | null) => void): () => void {
  const b = bus()
  if (!b) return () => {}
  const handler = (e: MessageEvent) => cb((e.data?.conversationId as string | null) ?? null)
  b.addEventListener("message", handler)
  return () => b.removeEventListener("message", handler)
}
