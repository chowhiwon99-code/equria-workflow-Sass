import { GroupChat } from "@/components/chat/GroupChat"

export default async function GroupRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params
  // key=roomId: 방을 바꾸면 remount → didInitialScroll ref가 리셋되어 새 방도 진입 시 하단 고정.
  return <GroupChat key={roomId} roomId={roomId} />
}
