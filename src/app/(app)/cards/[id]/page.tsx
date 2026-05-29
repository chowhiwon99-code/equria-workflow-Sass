import { CardDetail } from "@/components/cards/CardDetail"

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <CardDetail cardId={id} />
}
