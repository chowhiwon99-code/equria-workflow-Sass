import { GroupChat } from "@/components/chat/GroupChat"

export default async function GroupRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params
  return <GroupChat roomId={roomId} />
}
