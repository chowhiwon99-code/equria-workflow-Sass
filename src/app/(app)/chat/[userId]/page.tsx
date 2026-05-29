import { DirectChat } from "@/components/chat/DirectChat"

export default async function DirectChatPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params
  return <DirectChat otherUserId={userId} />
}
