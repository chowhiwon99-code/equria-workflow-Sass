import { DocumentDetail } from "@/components/approval/DocumentDetail"

export default async function ApprovalDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <DocumentDetail docId={id} />
}
