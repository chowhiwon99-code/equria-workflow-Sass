import { WorkflowEditor } from "@/components/workflows/WorkflowEditor"

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <WorkflowEditor id={id} />
}
