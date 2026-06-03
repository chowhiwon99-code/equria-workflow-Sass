import { generateText, type ModelMessage } from "ai"
import { anthropic } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"
import { normalizeGraph, topoOrder } from "@/lib/workflows"
import { isSafeWebhookUrl, MAX_RUN_NODES } from "@/lib/workflowTools"
import type { Json } from "@/lib/supabase/types"

export const maxDuration = 60
export const runtime = "nodejs"

/** 실행 이력(workflow_runs.node_results)에 누적하는 노드별 결과. */
type NodeResult = {
  nodeId: string
  agent_name: string
  status: "done" | "error"
  output?: string
  toolNote?: string
  error?: string
}

/**
 * 워크플로우 순차 실행 — 끈(edges) 위상정렬 순서대로 각 노드의 에이전트를 호출하고,
 * 앞 단계 출력을 뒤 단계 입력으로 전달(체이닝). 노드별 진행/결과를 NDJSON 으로 스트리밍.
 * 각 줄: {type:"start"|"node"|"done"|"error", ...}
 * 실행 이력은 workflow_runs 테이블에 영속화(시작 시 running → 종료 시 done/error).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { input?: string }
  const userInput = (body.input ?? "").trim()

  const { data: wf } = await supabase
    .from("workflows")
    .select("id, steps, is_active")
    .eq("id", id)
    .maybeSingle()
  if (!wf || wf.is_active === false) return new Response("Not found", { status: 404 })

  const graph = normalizeGraph(wf.steps)
  const topo = topoOrder(graph)
  if (!topo.ok) {
    return new Response(JSON.stringify({ error: topo.reason ?? "실행할 수 없습니다." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }
  // 타임아웃(60s) 보호 — 노드 수 제한.
  if (topo.order.length > MAX_RUN_NODES) {
    return new Response(
      JSON.stringify({
        error: `한 번에 실행할 수 있는 노드는 ${MAX_RUN_NODES}개까지입니다(현재 ${topo.order.length}개). 노드를 줄여 주세요.`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    )
  }

  // 실행 순서의 각 노드에 필요한 에이전트 버전(시스템 프롬프트/모델 등)을 미리 로드.
  const agentIds = [...new Set(topo.order.map((n) => n.agent_id))]
  const { data: versions } = await supabase
    .from("agent_versions")
    .select("agent_id, system_prompt, model, max_tokens, temperature")
    .in("agent_id", agentIds)
    .eq("is_current", true)
  const versionByAgent = new Map((versions ?? []).map((v) => [v.agent_id, v]))

  const startedAt = Date.now()
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"))
      send({ type: "start", count: topo.order.length })

      // 실행 이력 시작(running). best-effort — 실패해도 실행은 진행.
      const nodeResults: NodeResult[] = []
      let runId: string | null = null
      const { data: runRow } = await supabase
        .from("workflow_runs")
        .insert({
          workflow_id: id,
          user_id: user.id,
          input: userInput || null,
          status: "running",
          node_count: topo.order.length,
        })
        .select("id")
        .maybeSingle()
      runId = runRow?.id ?? null

      // 실행 이력 종료 기록(done/error). best-effort.
      const finalizeRun = async (
        status: "done" | "error",
        extra: { final_output?: string | null; error?: string | null }
      ) => {
        if (!runId) return
        await supabase
          .from("workflow_runs")
          .update({
            status,
            node_results: nodeResults as unknown as Json,
            duration_ms: Date.now() - startedAt,
            final_output: extra.final_output ?? null,
            error: extra.error ?? null,
          })
          .eq("id", runId)
      }

      let previousOutput = userInput
      try {
        for (let i = 0; i < topo.order.length; i++) {
          const node = topo.order[i]
          send({ type: "node", nodeId: node.id, status: "running", index: i })

          const v = versionByAgent.get(node.agent_id)
          if (!v) {
            const error = "에이전트 버전을 찾을 수 없습니다."
            nodeResults.push({ nodeId: node.id, agent_name: node.agent_name, status: "error", error })
            send({ type: "node", nodeId: node.id, status: "error", error })
            continue
          }

          // 단계 입력 = (있으면) 단계 지시 + 앞 단계 출력
          const parts: string[] = []
          if (node.note?.trim()) parts.push(`[이 단계 지시]\n${node.note.trim()}`)
          if (previousOutput) {
            parts.push(
              i === 0
                ? `[작업 입력]\n${previousOutput}`
                : `[앞 단계 결과 — 이어서 처리]\n${previousOutput}`
            )
          }
          if (parts.length === 0) parts.push("이 에이전트의 역할에 맞게 작업을 시작하세요.")

          const messages: ModelMessage[] = [{ role: "user", content: parts.join("\n\n") }]

          try {
            const { text, usage } = await generateText({
              model: anthropic(v.model),
              system: v.system_prompt,
              messages,
              maxOutputTokens: v.max_tokens,
              temperature: Number(v.temperature),
            })
            previousOutput = text

            // 도구(행동) 실행 — webhook(외부 POST) · save_file(파일 저장) · notify(내 알림).
            let toolNote: string | undefined
            const tool = node.tool
            if (tool?.type === "webhook" && tool.url) {
              const safe = isSafeWebhookUrl(tool.url)
              if (!safe.ok) {
                toolNote = `웹훅 차단됨: ${safe.reason}`
              } else {
                try {
                  const resp = await fetch(tool.url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      workflowId: id,
                      nodeId: node.id,
                      agent: node.agent_name,
                      output: text,
                    }),
                    signal: AbortSignal.timeout(15000),
                  })
                  toolNote = `웹훅 전송 → HTTP ${resp.status}`
                } catch (e) {
                  toolNote = `웹훅 전송 실패: ${e instanceof Error ? e.message : "오류"}`
                }
              }
            } else if (tool?.type === "save_file") {
              // 결과를 비공개 files 버킷({uid}/...)에 .md로 저장 + files 행 생성(파일 관리에 노출).
              try {
                const path = `${user.id}/workflow/${Date.now()}-${node.id}.md`
                const { error: upErr } = await supabase.storage
                  .from("files")
                  .upload(path, text, { contentType: "text/markdown", upsert: false })
                if (upErr) throw upErr
                await supabase.from("files").insert({
                  source: "workflow",
                  name: `${node.agent_name || "워크플로우"} 결과.md`,
                  mime_type: "text/markdown",
                  size_bytes: new TextEncoder().encode(text).length,
                  owner_id: user.id,
                  metadata: { storage_path: path },
                })
                toolNote = "파일로 저장됨 → 파일 관리"
              } catch (e) {
                toolNote = `파일 저장 실패: ${e instanceof Error ? e.message : "오류"}`
              }
            } else if (tool?.type === "notify") {
              // 결과를 실행자 본인 알림으로 전송(NotificationBell에 노출).
              try {
                const { error: notifErr } = await supabase.from("notifications").insert({
                  user_id: user.id,
                  type: "workflow",
                  title: `워크플로우 완료 — ${node.agent_name || "단계"}`,
                  body: text.slice(0, 280),
                  link: `/workflows/${id}`,
                })
                if (notifErr) throw notifErr
                toolNote = "알림 전송됨 🔔"
              } catch (e) {
                toolNote = `알림 전송 실패: ${e instanceof Error ? e.message : "오류"}`
              }
            }

            nodeResults.push({ nodeId: node.id, agent_name: node.agent_name, status: "done", output: text, toolNote })
            send({ type: "node", nodeId: node.id, status: "done", output: text, toolNote })

            // 사용량 로깅(best-effort, 실패 무시)
            await supabase.from("agent_usage").insert({
              agent_id: node.agent_id,
              user_id: user.id,
              tokens_input: usage.inputTokens ?? 0,
              tokens_output: usage.outputTokens ?? 0,
              success: true,
            })
          } catch (err) {
            const msg = err instanceof Error ? err.message : "에이전트 호출 실패"
            nodeResults.push({ nodeId: node.id, agent_name: node.agent_name, status: "error", error: msg })
            // 실패도 사용량에 기록(기존엔 성공만 기록하던 갭 해소)
            await supabase.from("agent_usage").insert({
              agent_id: node.agent_id,
              user_id: user.id,
              success: false,
              error_message: msg,
            })
            await finalizeRun("error", { error: `${node.agent_name || "단계"}에서 중단됨: ${msg}` })
            send({ type: "node", nodeId: node.id, status: "error", error: msg })
            send({ type: "error", error: `${node.agent_name || "단계"}에서 중단됨: ${msg}` })
            controller.close()
            return
          }
        }

        // run_count += 1 (best-effort)
        const { data: cur } = await supabase.from("workflows").select("run_count").eq("id", id).maybeSingle()
        await supabase
          .from("workflows")
          .update({ run_count: (cur?.run_count ?? 0) + 1 })
          .eq("id", id)

        await finalizeRun("done", { final_output: previousOutput })
        send({ type: "done", output: previousOutput })
      } catch (err) {
        const msg = err instanceof Error ? err.message : "실행 중 오류"
        await finalizeRun("error", { error: msg })
        send({ type: "error", error: msg })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  })
}
