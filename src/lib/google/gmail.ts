// Gmail 헬퍼 — MIME 파싱/디코딩, DTO 매핑, 발신 메시지(RFC2822) 빌더. 서버 전용.
import type { gmail_v1 } from "googleapis"

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

// ---- 발신(RFC2822 → base64url) ----
function encodeHeaderValue(s: string): string {
  // 비ASCII는 RFC2047 인코딩
  if (/^[\x00-\x7F]*$/.test(s)) return s
  return `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`
}

export function buildRawMessage(opts: {
  to: string
  cc?: string
  bcc?: string
  subject: string
  body: string
  inReplyTo?: string | null
  references?: string | null
}): string {
  const lines: string[] = []
  lines.push(`To: ${opts.to}`)
  if (opts.cc) lines.push(`Cc: ${opts.cc}`)
  if (opts.bcc) lines.push(`Bcc: ${opts.bcc}`)
  lines.push(`Subject: ${encodeHeaderValue(opts.subject)}`)
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`)
  if (opts.references) lines.push(`References: ${opts.references}`)
  lines.push("MIME-Version: 1.0")
  lines.push('Content-Type: text/plain; charset="UTF-8"')
  lines.push("Content-Transfer-Encoding: base64")
  lines.push("")
  lines.push(Buffer.from(opts.body, "utf8").toString("base64"))
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url")
}
