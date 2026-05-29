"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { nameToEmail } from "@/lib/auth"

export type AuthResult = { error?: string; success?: boolean }

/**
 * 가입 — 이름 + 공용 비밀번호.
 * 공용 비밀번호(WORKSPACE_PASSWORD)가 맞아야만 계정이 생성된다.
 * service_role 관리자 API로 email_confirm=true 처리해 확인 메일 단계를 건너뛴다.
 */
export async function signupAction(name: string, password: string): Promise<AuthResult> {
  const trimmedName = name.trim()
  if (!trimmedName) return { error: "이름을 입력해 주세요." }
  if (!password) return { error: "비밀번호를 입력해 주세요." }

  if (password !== process.env.WORKSPACE_PASSWORD) {
    return { error: "공용 비밀번호가 올바르지 않습니다. 관리자에게 문의하세요." }
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.createUser({
    email: nameToEmail(trimmedName),
    password,
    email_confirm: true,
    user_metadata: { name: trimmedName },
  })

  if (error) {
    if (/already|exist|registered/i.test(error.message)) {
      return { error: "이미 같은 이름으로 가입되어 있습니다. 로그인해 주세요." }
    }
    return { error: error.message }
  }

  return { success: true }
}
