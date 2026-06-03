// Google OAuth2 클라이언트 팩토리 + 요청 scope. 서버 전용.
import { google } from "googleapis"

// 현재 범위: Gmail 전용(각 직원 개인 계정 연결). Drive는 후속에서 drive.file 추가 예정.
// gmail.modify = 읽기+전송+라벨/읽음/보관/별표(영구삭제만 제외).
export const GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.modify",
]

/** 환경변수 기반 OAuth2 클라이언트. 미설정 시 명확히 throw(연결 시도 시점에 안내). */
export function oauthClient() {
  const id = process.env.GOOGLE_CLIENT_ID
  const secret = process.env.GOOGLE_CLIENT_SECRET
  const redirect = process.env.GOOGLE_OAUTH_REDIRECT_URI
  if (!id || !secret || !redirect) {
    throw new Error("GOOGLE_OAUTH_NOT_CONFIGURED")
  }
  return new google.auth.OAuth2(id, secret, redirect)
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_OAUTH_REDIRECT_URI
  )
}
