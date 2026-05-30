"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"

/**
 * 되돌리기/다시실행 액션. 각 데이터 변경(생성/수정/삭제)은
 * 자신의 역연산(undo)과 재실행(redo)을 등록한다.
 * undo/redo 내부에서 해당 화면의 reload 를 호출해 UI를 갱신한다.
 */
export type UndoAction = {
  label: string
  undo: () => Promise<void> | void
  redo: () => Promise<void> | void
}

type UndoCtx = {
  push: (action: UndoAction) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

const UndoContext = createContext<UndoCtx | null>(null)
const MAX_HISTORY = 50

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const past = useRef<UndoAction[]>([])
  const future = useRef<UndoAction[]>([])
  // 진행 중인 작업의 promise. ⌘Z 연타 시 드롭하지 않고 직렬화한다 —
  // 각 호출은 이전 작업이 끝난 뒤 자신의 차례를 실행해 순서를 보존한다.
  const tail = useRef<Promise<void>>(Promise.resolve())
  // 스택 길이를 상태로 보관해 canUndo/canRedo 를 렌더 중 ref 접근 없이 계산
  const [counts, setCounts] = useState({ undo: 0, redo: 0 })
  const sync = useCallback(
    () => setCounts({ undo: past.current.length, redo: future.current.length }),
    []
  )

  const push = useCallback(
    (action: UndoAction) => {
      past.current.push(action)
      if (past.current.length > MAX_HISTORY) past.current.shift()
      future.current = []
      sync()
    },
    [sync]
  )

  const redo = useCallback(async () => {
    // 이전 작업이 끝난 뒤 실행되도록 큐에 이어 붙인다(직렬화).
    const run = tail.current.then(async () => {
      // 차례가 온 시점에 스택 top 을 다시 읽어 정확한 액션을 사용한다.
      const action = future.current[future.current.length - 1]
      if (!action) return
      try {
        await action.redo()
        future.current.pop()
        past.current.push(action)
        sync()
        window.dispatchEvent(new Event("equria:reload"))
      } catch {
        toast.error(`다시 실행 실패: ${action.label}`)
      }
    })
    tail.current = run
    return run
  }, [sync])

  const undo = useCallback(async () => {
    // 이전 작업이 끝난 뒤 실행되도록 큐에 이어 붙인다(직렬화).
    const run = tail.current.then(async () => {
      // 차례가 온 시점에 스택 top 을 다시 읽어 정확한 액션을 사용한다.
      const action = past.current[past.current.length - 1]
      if (!action) return
      try {
        await action.undo()
        past.current.pop()
        future.current.push(action)
        sync()
        window.dispatchEvent(new Event("equria:reload"))
      } catch {
        toast.error(`되돌리기 실패: ${action.label}`)
      }
    })
    tail.current = run
    return run
  }, [sync])

  // 전역 단축키: ⌘Z 되돌리기 / ⌘⇧Z 다시실행.
  // 텍스트 입력 중에는 브라우저 기본 undo 를 방해하지 않는다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (!meta || e.key.toLowerCase() !== "z") return
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [undo, redo])

  return (
    <UndoContext.Provider
      value={{
        push,
        undo,
        redo,
        canUndo: counts.undo > 0,
        canRedo: counts.redo > 0,
      }}
    >
      {children}
    </UndoContext.Provider>
  )
}

export function useUndo(): UndoCtx {
  const ctx = useContext(UndoContext)
  if (!ctx) throw new Error("useUndo must be used within UndoProvider")
  return ctx
}
