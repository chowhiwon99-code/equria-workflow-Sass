// Google OAuth2 클라이언트 팩토리 + 요청 scope. 서버 전용.
import { google } from "googleapis"

// 범위: Gmail 발송만(개인 계정 연결).
// gmail.send = 사용자 대신 메일 발송. 구글 분류 '민감(sensitive)' — 검증만 필요, CASA 없음.
//   ⚠️ 제한(restricted) 스코프는 절대 추가하지 말 것. gmail.modify·gmail.compose·gmail.readonly·
//      drive.readonly는 모두 '제한'이라 프로덕션 공개 시 CASA Tier 2 연간 보안감사(제3자 감사기관·
//      유료)가 강제된다. 2026-08-12 대표 결정 = 발송만 남기고 제한 스코프 전면 제거.
//   ※ 이미 연결된 사용자의 토큰은 부여 당시 범위를 유지한다(축소는 재동의 시점부터 적용).
//   되돌리려면 이 배열에 원래 스코프를 복원하고 콘솔 '데이터 액세스'에도 같은 범위를 선언해야 한다.
export const GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.send",
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
