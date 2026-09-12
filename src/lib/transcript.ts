// 전사 붙여넣기 파서 — 회의노트 대개편 P1 (계획: fluffy-cooking-nest).
// 클로바노트 내보내기·Zoom/Teams VTT·"이름: 발화" 반복 텍스트를 구조화한다.
// 전사는 직접 만들지 않는다(2026년 STT는 커모디티 — 클로바노트 무료가 한국 표준).
// "전사는 쓰던 거 쓰세요, 그 다음은 저희가"의 입구. 순수 함수 — 서버·클라 공용, 부작용 0.

export type TranscriptSegment = {
  speaker: string | null
  ts: string | null
  text: string
  /** 발화 날짜(yyyy-mm-dd). 카톡처럼 여러 날이 한 덩어리로 오는 소스에서만 채워진다 — 범위 슬라이스(오늘/이번 주)의 근거. */
  date?: string | null
}
export type ParsedTranscript = { segments: TranscriptSegment[]; source: "vtt" | "clova" | "plain" | "kakao" }

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

/**
 * 카카오톡 대화 내보내기 — 결정 인프라 Unit C.
 *
 * 🔴 이 파서는 **오식 버그 수정이기도 하다**: PC판(`[이름] [오후 2:31] 발화`)을 `parsePlainDialogue`가
 * 부분 매치해 화자를 `"[이름] [오후 2"`로, 발화를 `"31] 발화"`로 잘라 넣고 있었다.
 * 그래서 감지 순서에서 **plain보다 반드시 앞**에 와야 한다.
 *
 * 지원 3형식(실제 내보내기 기준):
 *   안드로이드  `2026년 9월 10일 오후 2:31, 홍길동 : 발화`
 *   iOS         `2026. 9. 10. 오후 2:31, 홍길동 : 발화`
 *   PC          `--------------- 2026년 9월 10일 목요일 ---------------` 다음에 `[홍길동] [오후 2:31] 발화`
 */
const KAKAO_ANDROID = /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s+(오전|오후)\s*(\d{1,2}):(\d{2}),\s*(.{1,40}?)\s*:\s*([\s\S]*)$/
const KAKAO_IOS = /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s+(오전|오후)\s*(\d{1,2}):(\d{2}),\s*(.{1,40}?)\s*:\s*([\s\S]*)$/
const KAKAO_PC_DATE = /^-{3,}\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일.*?-{3,}$/
const KAKAO_PC_MSG = /^\[(.{1,40}?)\]\s*\[(오전|오후)\s*(\d{1,2}):(\d{2})\]\s*([\s\S]*)$/
/** 대화 내용이 아닌 시스템 줄 — 결정 추출에 노이즈만 된다. */
const KAKAO_SYSTEM = /(님과 카카오톡 대화$|^저장한 날짜\s*:|님이 (들어왔|나갔)습니다\.?$|님을 초대했습니다\.?$)/

const pad2 = (n: number) => String(n).padStart(2, "0")
/** 오전/오후 12시간 → 24시간. 오전 12시=00시, 오후 12시=12시(정오). */
function to24h(ampm: string, hour: number, minute: string): string {
  const h = ampm === "오전" ? (hour === 12 ? 0 : hour) : hour === 12 ? 12 : hour + 12
  return `${pad2(h)}:${minute}`
}
const isoDate = (y: string, m: string, d: string) => `${y}-${pad2(Number(m))}-${pad2(Number(d))}`

function parseKakao(text: string): ParsedTranscript | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const segments: TranscriptSegment[] = []
  let pcDate: string | null = null // PC판은 날짜 구분선이 이후 메시지의 날짜를 정한다
  let matched = 0

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    const dateSep = line.match(KAKAO_PC_DATE)
    if (dateSep) {
      pcDate = isoDate(dateSep[1], dateSep[2], dateSep[3])
      continue
    }
    if (KAKAO_SYSTEM.test(line)) continue

    const m = line.match(KAKAO_ANDROID) ?? line.match(KAKAO_IOS)
    if (m) {
      matched++
      segments.push({
        speaker: m[7].trim(),
        ts: to24h(m[4], Number(m[5]), m[6]),
        date: isoDate(m[1], m[2], m[3]),
        text: m[8].trim(),
      })
      continue
    }

    const pc = line.match(KAKAO_PC_MSG)
    if (pc) {
      matched++
      segments.push({
        speaker: pc[1].trim(),
        ts: to24h(pc[2], Number(pc[3]), pc[4]),
        date: pcDate,
        text: pc[5].trim(),
      })
      continue
    }

    // 줄바꿈된 긴 메시지 — 직전 발화에 붙인다(첫 발화 전의 머리말은 버려진다)
    if (segments.length > 0) segments[segments.length - 1].text += ` ${line}`
  }

  if (matched < MIN_SEGMENTS) return null
  return { segments: segments.filter((s) => s.text), source: "kakao" }
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
  // ⚠️ kakao는 plain보다 **앞**이어야 한다 — plain이 카톡 PC판을 부분 오식한다(parseKakao 헤더 주석).
  return parseVtt(text) ?? parseKakao(text) ?? parseClova(text) ?? parsePlainDialogue(text)
}

/** 세그먼트 → Enhance/AI 입력용 평문("화자(시간): 발화" 줄). */
export function transcriptToText(t: ParsedTranscript, maxChars = 40000): string {
  const lines = t.segments.map((s) => {
    // 날짜는 카톡처럼 여러 날이 섞인 소스에만 있다 — "다음 주 월요일" 같은 표현을 AI가 해석하려면 필요하다.
    const when = s.date && s.ts ? `(${s.date} ${s.ts})` : s.ts ? `(${s.ts})` : s.date ? `(${s.date})` : null
    const head = [s.speaker, when].filter(Boolean).join(" ")
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
