// 전사 붙여넣기 파서 — 회의노트 대개편 P1 (계획: fluffy-cooking-nest).
// 클로바노트 내보내기·Zoom/Teams VTT·"이름: 발화" 반복 텍스트를 구조화한다.
// 전사는 직접 만들지 않는다(2026년 STT는 커모디티 — 클로바노트 무료가 한국 표준).
// "전사는 쓰던 거 쓰세요, 그 다음은 저희가"의 입구. 순수 함수 — 서버·클라 공용, 부작용 0.

export type TranscriptSegment = { speaker: string | null; ts: string | null; text: string }
export type ParsedTranscript = { segments: TranscriptSegment[]; source: "vtt" | "clova" | "plain" }

const MIN_SEGMENTS = 3 // 이보다 적으면 "전사"라고 부르기 어렵다 — 일반 붙여넣기를 방해하지 않기 위한 하한

/** WEBVTT 자막 — 큐 타임스탬프 + <v 화자> 태그(팀즈) 또는 "이름: 발화" 큐 텍스트(줌) 지원. */
function parseVtt(text: string): ParsedTranscript | null {
  if (!/^﻿?WEBVTT/.test(text.trimStart())) return null
  const segments: TranscriptSegment[] = []
  const blocks = text.replace(/\r\n/g, "\n").split(/\n\n+/)
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim())
    const tsIdx = lines.findIndex((l) => /-->/.test(l))
    if (tsIdx === -1) continue
    const ts = lines[tsIdx].match(/^([\d:.]+)\s*-->/)?.[1]?.replace(/\.\d+$/, "") ?? null
    const textLines = lines.slice(tsIdx + 1)
    if (textLines.length === 0) continue
    const joined = textLines.join(" ").trim()
    // <v Speaker>text</v> (Teams) 또는 "Speaker: text" (Zoom)
    const voice = joined.match(/^<v\s+([^>]+)>([\s\S]*?)(<\/v>)?$/)
    const colon = joined.match(/^([^:]{1,30}):\s+(.+)$/)
    if (voice) segments.push({ speaker: voice[1].trim(), ts, text: voice[2].trim() })
    else if (colon) segments.push({ speaker: colon[1].trim(), ts, text: colon[2].trim() })
    else segments.push({ speaker: null, ts, text: joined })
  }
  return segments.length >= MIN_SEGMENTS ? { segments, source: "vtt" } : null
}

/** 클로바노트 내보내기 — "이름 MM:SS" 헤더 줄 다음에 발화가 이어지는 형식. */
function parseClova(text: string): ParsedTranscript | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const headerRe = /^(.{1,24}?)\s+\(?(\d{1,2}:\d{2}(?::\d{2})?)\)?$/
  const segments: TranscriptSegment[] = []
  let cur: TranscriptSegment | null = null
  let headerCount = 0
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const h = line.match(headerRe)
    if (h) {
      headerCount++
      if (cur && cur.text) segments.push(cur)
      cur = { speaker: h[1].trim(), ts: h[2], text: "" }
    } else if (cur) {
      cur.text = cur.text ? `${cur.text} ${line}` : line
    }
  }
  if (cur && cur.text) segments.push(cur)
  // 헤더가 충분히 반복돼야 클로바 형식으로 판정(제목에 시간이 들어간 일반 글 오탐 방지)
  return headerCount >= MIN_SEGMENTS && segments.length >= MIN_SEGMENTS ? { segments, source: "clova" } : null
}

/** "이름: 발화"가 반복되는 평문 — 비어있지 않은 줄의 절반 이상이 매치 + 화자 2명 이상일 때만. */
function parsePlainDialogue(text: string): ParsedTranscript | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean)
  if (lines.length < MIN_SEGMENTS) return null
  const re = /^([^:：]{1,20})\s*[:：]\s+(.+)$/
  const segments: TranscriptSegment[] = []
  let matched = 0
  for (const line of lines) {
    const m = line.match(re)
    if (m && !/^https?$/.test(m[1].trim())) {
      matched++
      segments.push({ speaker: m[1].trim(), ts: null, text: m[2].trim() })
    } else if (segments.length > 0) {
      // 이어지는 줄은 직전 발화에 붙임(줄바꿈된 긴 발화)
      segments[segments.length - 1].text += ` ${line}`
    }
  }
  const speakers = new Set(segments.map((s) => s.speaker))
  if (matched / lines.length < 0.5 || matched < MIN_SEGMENTS || speakers.size < 2) return null
  return { segments, source: "plain" }
}

/**
 * 자동 감지 파서 — 형식이 확실할 때만 결과를 준다(오탐 = 일반 붙여넣기 방해 = 최악).
 * 호출부는 500자 이상일 때만 부르는 것을 권장(TranscriptPanel·에디터 handlePaste).
 */
export function detectAndParseTranscript(text: string): ParsedTranscript | null {
  if (!text || text.trim().length === 0) return null
  return parseVtt(text) ?? parseClova(text) ?? parsePlainDialogue(text)
}

/** 세그먼트 → Enhance/AI 입력용 평문("화자(시간): 발화" 줄). */
export function transcriptToText(t: ParsedTranscript, maxChars = 40000): string {
  const lines = t.segments.map((s) => {
    const head = [s.speaker, s.ts ? `(${s.ts})` : null].filter(Boolean).join(" ")
    return head ? `${head}: ${s.text}` : s.text
  })
  const joined = lines.join("\n")
  return joined.length > maxChars ? joined.slice(0, maxChars) : joined
}

/** 화자 목록(등장 순서 유지) — 화자명 일괄 치환 UI용. */
export function transcriptSpeakers(t: ParsedTranscript): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of t.segments) {
    if (s.speaker && !seen.has(s.speaker)) {
      seen.add(s.speaker)
      out.push(s.speaker)
    }
  }
  return out
}
