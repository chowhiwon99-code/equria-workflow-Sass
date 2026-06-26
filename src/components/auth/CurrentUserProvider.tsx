"use client"

import { createContext, useContext } from "react"

// 현재 로그인 사용자 id를 (app) 트리에 주입한다.
// 서버 레이아웃이 이미 getUser로 검증한 user.id를 내려, 클라 컴포넌트가 마운트마다
// auth.getUser()(네트워크 왕복)를 다시 호출하지 않게 한다. 보안은 RLS가 서버에서 강제하므로
// 클라가 자기 id를 동기적으로 읽는 것은 안전하다.
const CurrentUserContext = createContext<string | null>(null)

export function CurrentUserProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  return <CurrentUserContext.Provider value={userId}>{children}</CurrentUserContext.Provider>
}

/** 현재 로그인 사용자 id. (app) 레이아웃 밖에서는 null. */
export function useCurrentUserId(): string | null {
  return useContext(CurrentUserContext)
}
