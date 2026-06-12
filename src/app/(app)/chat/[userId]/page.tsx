import { DirectChat } from "@/components/chat/DirectChat"

export default async function DirectChatPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params
  // key=userId: 대화 전환 시 새 인스턴스로 remount → 메시지·타이핑 등 상태가 새 대화로 깨끗이 초기화
  // (이전 대화 잔상·레이스, '작성 중' 인디케이터가 다른 방으로 새는 문제 방지)
  return <DirectChat key={userId} otherUserId={userId} />
}
