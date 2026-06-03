// Google OAuth 토큰 암복호화 — AES-256-GCM. 서버 전용(node:crypto).
// 저장형식: "ivBase64:tagBase64:cipherBase64". 키는 GOOGLE_TOKEN_ENC_KEY(32바이트 base64).
import crypto from "node:crypto"

const ALGO = "aes-256-gcm"

function key(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENC_KEY
  if (!raw) throw new Error("GOOGLE_TOKEN_ENC_KEY 가 설정되지 않았습니다.")
  const buf = Buffer.from(raw, "base64")
  if (buf.length !== 32) throw new Error("GOOGLE_TOKEN_ENC_KEY 는 32바이트 base64 여야 합니다.")
  return buf
}

export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key(), iv)
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":")
}

export function decryptToken(payload: string): string {
  const [ivB, tagB, dataB] = payload.split(":")
  if (!ivB || !tagB || !dataB) throw new Error("토큰 형식이 올바르지 않습니다.")
  const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivB, "base64"))
  decipher.setAuthTag(Buffer.from(tagB, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8")
}
