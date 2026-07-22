"use client"

import { createContext, useCallback, useContext, useMemo, useState } from "react"

// B1-b Step 0 — "현재 워크스페이스(회사)"를 (app) 트리에 주입하는 토대.
// 서버 레이아웃이 이미 RLS로 읽은 멤버십을 client context로 내려, 이후 모든 INSERT가
// "지금 로그인한 회사"의 workspace_id를 명시할 수 있게 한다(sentinel DEFAULT 의존 제거의 선행조건).
// ⚠️ 이 파일 자체는 어떤 쓰기도 바꾸지 않는다 — 소비처(INSERT 배선)는 Step 1+에서 추가.

export type WorkspaceSummary = { id: string; name: string; slug: string }

type WorkspaceCtx = {
  /** 현재 활성 워크스페이스 id. 멤버십이 없으면 null(사실상 발생 안 함 — handle_new_user가 자동 등록). */
  currentWorkspaceId: string | null
  currentWorkspace: WorkspaceSummary | null
  /** 내가 속한 워크스페이스 전부(멤버십 순서). 단일 테넌트면 1개. */
  workspaces: WorkspaceSummary[]
  /** 워크스페이스 전환(멤버인 것만). 전환 시 데이터 캐시 무효화는 소비처 도입 때 함께. */
  switchWorkspace: (id: string) => void
}

const WorkspaceContext = createContext<WorkspaceCtx | null>(null)

export function WorkspaceProvider({
  workspaces,
  initialWorkspaceId,
  children,
}: {
  workspaces: WorkspaceSummary[]
  initialWorkspaceId: string | null
  children: React.ReactNode
}) {
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(initialWorkspaceId)

  const switchWorkspace = useCallback(
    (id: string) => {
      if (workspaces.some((w) => w.id === id)) setCurrentWorkspaceId(id)
    },
    [workspaces],
  )

  const value = useMemo<WorkspaceCtx>(
    () => ({
      currentWorkspaceId,
      currentWorkspace: workspaces.find((w) => w.id === currentWorkspaceId) ?? null,
      workspaces,
      switchWorkspace,
    }),
    [currentWorkspaceId, workspaces, switchWorkspace],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

/**
 * 현재 워크스페이스 컨텍스트. (app) 레이아웃 밖에서는 안전한 빈 기본값을 돌려준다
 * (CurrentUserProvider가 밖에서 null을 주는 것과 같은 철학 — 크래시 방지).
 */
export function useWorkspace(): WorkspaceCtx {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) {
    return { currentWorkspaceId: null, currentWorkspace: null, workspaces: [], switchWorkspace: () => {} }
  }
  return ctx
}

/** INSERT 배선용 축약 — 현재 워크스페이스 id만 필요할 때. */
export function useCurrentWorkspaceId(): string | null {
  return useWorkspace().currentWorkspaceId
}
