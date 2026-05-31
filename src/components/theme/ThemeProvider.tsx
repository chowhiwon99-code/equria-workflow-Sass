"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"

/**
 * next-themes 래퍼. 루트 레이아웃에서 children을 감싸 .dark 클래스를 <html>에 토글한다.
 * globals.css의 `.dark` 토큰 + 기존 `dark:` 유틸이 자동 반응한다.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
