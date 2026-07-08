// Gmail 헬퍼 — MIME 파싱/디코딩, DTO 매핑, 발신 메시지(RFC2822) 빌더. 서버 전용.
import type { gmail_v1 } from "googleapis"
import { randomBytes } from "node:crypto"

// ---- 우리 UX로 넘기는 DTO ----
export type MailAttachment = {
  attachmentId: string
  filename: string
  mimeType: string
  size: number
}
export type MailThreadSummary = {
  id: string
  from: string
  subject: string
  snippet: string
  date: string | null
  unread: boolean
  hasAttachment: boolean
  labelIds: string[]
}
export type MailMessage = {
  id: string
  from: string
  to: string
  cc: string
  date: string | null
  html: string | null
  text: string | null
  unread: boolean
  labelIds: string[]
  attachments: MailAttachment[]
  rfcMessageId: string | null // In-Reply-To/References 용
}
export type MailThreadDetail = {
  id: string
  subject: string
  messages: MailMessage[]
}
export type MailLabel = { id: string; name: string; type: "system" | "user" }

// ---- 헬퍼 ----
function header(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  const h = headers?.find((x) => (x.name ?? "").toLowerCase() === name.toLowerCase())
  return h?.value ?? ""
}

function decodeB64Url(data?: string | null): string {
  if (!data) return ""
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
}

type WalkAcc = { html?: string; text?: string; attachments: MailAttachment[] }
function walkParts(part: gmail_v1.Schema$MessagePart | undefined, acc: WalkAcc): void {
  if (!part) return
  const mime = part.mimeType ?? ""
  if (part.filename && part.body?.attachmentId) {
    acc.attachments.push({
      attachmentId: part.body.attachmentId,
      filename: part.filename,
      mimeType: mime,
      size: part.body.size ?? 0,
    })
  } else if (mime === "text/html" && part.body?.data) {
    acc.html = (acc.html ?? "") + decodeB64Url(part.body.data)
  } else if (mime === "text/plain" && part.body?.data) {
    acc.text = (acc.text ?? "") + decodeB64Url(part.body.data)
  }
  if (part.parts) for (const p of part.parts) walkParts(p, acc)
}

/** 단일 메시지(full) → 우리 DTO. */
export function toMailMessage(m: gmail_v1.Schema$Message): MailMessage {
  const headers = m.payload?.headers
  const acc: WalkAcc = { attachments: [] }
  walkParts(m.payload, acc)
  const labelIds = m.labelIds ?? []
  return {
    id: m.id ?? "",
    from: header(headers, "From"),
    to: header(headers, "To"),
    cc: header(headers, "Cc"),
    date: header(headers, "Date") || (m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null),
    html: acc.html ?? null,
    text: acc.text ?? null,
    unread: labelIds.includes("UNREAD"),
    labelIds,
    attachments: acc.attachments,
    rfcMessageId: header(headers, "Message-ID") || null,
  }
}

/** 스레드(metadata 메시지들) → 목록 요약(마지막 메시지 기준). */
export function toThreadSummary(t: gmail_v1.Schema$Thread): MailThreadSummary {
  const msgs = t.messages ?? []
  const last = msgs[msgs.length - 1]
  const headers = last?.payload?.headers
  const anyUnread = msgs.some((m) => (m.labelIds ?? []).includes("UNREAD"))
  const hasAttachment = msgs.some((m) =>
    (m.payload?.parts ?? []).some((p) => Boolean(p.filename))
  )
  const labelIds = Array.from(new Set(msgs.flatMap((m) => m.labelIds ?? [])))
  return {
    id: t.id ?? "",
    from: header(headers, "From"),
    subject: header(headers, "Subject") || "(제목 없음)",
    snippet: last?.snippet ?? t.snippet ?? "",
    date: header(headers, "Date") || (last?.internalDate ? new Date(Number(last.internalDate)).toISOString() : null),
    unread: anyUnread,
    hasAttachment,
    labelIds,
  }
}

/** 라벨 → DTO. 시스템/사용자 구분. */
export function toMailLabel(l: gmail_v1.Schema$Label): MailLabel {
  return {
    id: l.id ?? "",
    name: l.name ?? "",
    type: l.type === "system" ? "system" : "user",
  }
}

/**
 * 스레드 metadata 일괄 조회 — Gmail batch 엔드포인트로 N개를 단일 HTTP 요청에 묶는다(N+1 제거).
 * threads.get(format=metadata)를 하나씩 부르는 대신 multipart/mixed 배치 1회.
 * 반환은 요청한 id 순서를 유지(파싱 실패/오류 항목은 제외).
 */
export async function batchGetThreadsMetadata(
  accessToken: string,
  ids: string[]
): Promise<gmail_v1.Schema$Thread[]> {
  if (ids.length === 0) return []
  const boundary = "batch_" + randomBytes(8).toString("hex")
  const metaQuery = "format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date"
  const body =
    ids
      .map(
        (id, i) =>
          `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <item-${i}>\r\n\r\n` +
          `GET /gmail/v1/users/me/threads/${id}?${metaQuery}\r\n`
      )
      .join("") + `--${boundary}--`

  const res = await fetch("https://gmail.googleapis.com/batch/gmail/v1", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/mixed; boundary=${boundary}`,
    },
    body,
  })
  if (!res.ok) throw new Error(`Gmail batch 실패 (${res.status})`)

  const text = await res.text()
  const respBoundary = (res.headers.get("content-type") ?? "")
    .match(/boundary=([^;]+)/)?.[1]
    ?.replace(/"/g, "")
    .trim()
  if (!respBoundary) return []

  // 각 파트에서 JSON 본문(첫 '{' ~ 마지막 '}')만 추출. id로 매핑해 원래 순서 복원.
  const byId = new Map<string, gmail_v1.Schema$Thread>()
  for (const chunk of text.split(`--${respBoundary}`)) {
    const start = chunk.indexOf("{")
    const end = chunk.lastIndexOf("}")
    if (start === -1 || end <= start) continue
    try {
      const obj = JSON.parse(chunk.slice(start, end + 1)) as gmail_v1.Schema$Thread
      if (obj.id) byId.set(obj.id, obj)
    } catch {
      /* 파트 파싱 실패 무시 */
    }
  }
  return ids.map((id) => byId.get(id)).filter((t): t is gmail_v1.Schema$Thread => Boolean(t))
}

// ---- 발신(RFC2822 → base64url) ----
function encodeHeaderValue(s: string): string {
  const clean = s.replace(/[\r\n]+/g, " ") // 헤더 인젝션 방지: CR/LF 제거
  // 비ASCII는 RFC2047 인코딩
  if (/^[\x00-\x7F]*$/.test(clean)) return clean
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`
}

// 주소/헤더 값에서 CR·LF 제거(헤더 인젝션 방지).
function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, " ").trim()
}

export type OutgoingAttachment = { filename: string; mimeType: string; contentBase64: string }

// base64를 76자 줄바꿈(RFC 2045)로 접기.
function foldBase64(b64: string): string {
  return (b64.match(/.{1,76}/g) ?? [b64]).join("\r\n")
}
function b64utf8(s: string): string {
  return Buffer.from(s, "utf8").toString("base64")
}
// html → 단순 plain 대체(멀티파트 alternative의 텍스트 파트용).
function htmlToPlain(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** 발신 메시지(RFC2822 → base64url). HTML 본문·첨부(multipart) 지원. */
export function buildRawMessage(opts: {
  to: string
  cc?: string
  bcc?: string
  subject: string
  html?: string
  text?: string
  attachments?: OutgoingAttachment[]
  inReplyTo?: string | null
  references?: string | null
}): string {
  const { to, cc, bcc, subject, html, inReplyTo, references } = opts
  const attachments = opts.attachments ?? []
  const plain = opts.text ?? (html ? htmlToPlain(html) : "")

  const head: string[] = [`To: ${oneLine(to)}`]
  if (cc) head.push(`Cc: ${oneLine(cc)}`)
  if (bcc) head.push(`Bcc: ${oneLine(bcc)}`)
  head.push(`Subject: ${encodeHeaderValue(subject)}`)
  if (inReplyTo) head.push(`In-Reply-To: ${oneLine(inReplyTo)}`)
  if (references) head.push(`References: ${oneLine(references)}`)
  head.push("MIME-Version: 1.0")

  const altB = "alt_" + randomBytes(10).toString("hex")
  const mixB = "mix_" + randomBytes(10).toString("hex")

  // 본문 블록(자체 Content-Type 포함): html이면 text+html alternative, 아니면 text만.
  const bodyBlock: string[] = html
    ? [
        `Content-Type: multipart/alternative; boundary="${altB}"`,
        "",
        `--${altB}`,
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        "",
        foldBase64(b64utf8(plain)),
        `--${altB}`,
        'Content-Type: text/html; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        "",
        foldBase64(b64utf8(html)),
        `--${altB}--`,
      ]
    : [
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        "",
        foldBase64(b64utf8(plain)),
      ]

  let lines: string[]
  if (attachments.length > 0) {
    lines = [...head, `Content-Type: multipart/mixed; boundary="${mixB}"`, "", `--${mixB}`, ...bodyBlock]
    for (const a of attachments) {
      lines.push(
        `--${mixB}`,
        `Content-Type: ${oneLine(a.mimeType)}; name="${encodeHeaderValue(a.filename.replace(/"/g, ""))}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${encodeHeaderValue(a.filename.replace(/"/g, ""))}"`,
        "",
        foldBase64(a.contentBase64.replace(/[^A-Za-z0-9+/=]/g, "")) // base64 이외 문자 제거(주입 방지)
      )
    }
    lines.push(`--${mixB}--`)
  } else {
    lines = [...head, ...bodyBlock]
  }

  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url")
}
