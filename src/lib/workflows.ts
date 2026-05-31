// 워크플로우 SSOT — steps(에이전트 체이닝) 타입 + 직렬화/파싱 헬퍼.
// 정의(definition)만 다룬다. 실제 실행 엔진은 고도화 단계에서 이 계약을 소비한다.

export type WorkflowStep = {
  /** 로컬 키(순서변경/렌더용) */
  id: string
  agent_id: string
  agent_name: string
  /** 이 단계의 추가 지시(선택) */
  note?: string
}

export function genStepId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `s_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

/** workflows.steps(jsonb)를 안전하게 WorkflowStep[]로 파싱(미래 형태 변화에 관대). */
export function normalizeSteps(raw: unknown): WorkflowStep[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({
      id: typeof s.id === "string" ? s.id : genStepId(),
      agent_id: typeof s.agent_id === "string" ? s.agent_id : "",
      agent_name: typeof s.agent_name === "string" ? s.agent_name : "",
      note: typeof s.note === "string" && s.note ? s.note : undefined,
    }))
    .filter((s) => s.agent_id)
}
