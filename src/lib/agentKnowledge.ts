// 에이전트 지식파일 — 첨부 스테이징/검증 순수 로직. Claude가 직접 읽을 수 있는 형식만 허용한다.
// PDF·이미지는 런타임에 "파일 파트"로, 텍스트(txt/md/csv/json 등)는 본문(extracted_text)으로 주입.
import { uploadFile } from "@/lib/upload"

/** <input accept> 값 — AI가 읽을 수 있는 형식만. */
export const KNOWLEDGE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.markdown,.csv,.tsv,.json,.log"
export const KNOWLEDGE_MAX_BYTES = 20 * 1024 * 1024 // 20MB/파일

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|log)$/i
const OK_EXT = /\.(pdf|png|jpe?g|webp|gif|txt|md|markdown|csv|tsv|json|log)$/i
const OK_MIME = /^(application\/pdf|image\/(png|jpe?g|webp|gif)|text\/|application\/json)/i

export type StagedKnowledge = {
  /** DB에서 불러온 기존 항목이면 존재(편집 시 삭제 판정용). 새로 첨부한 건 없음. */
  id?: string
  storage_path: string
  name: string
  mime_type: string
  size: number
  extracted_text: string | null
}

/** Claude가 직접 읽을 수 있는 파일인지(PDF·이미지·텍스트류). */
export function isAiReadable(file: File): boolean {
  return OK_MIME.test(file.type) || OK_EXT.test(file.name)
}

/** 텍스트류(본문을 그대로 읽어 넣을 수 있는) 파일인지. */
export function isTextKnowledge(mimeOrName: { type?: string; name: string }): boolean {
  return /^text\//i.test(mimeOrName.type ?? "") || mimeOrName.type === "application/json" || TEXT_EXT.test(mimeOrName.name)
}

/** 파일을 private 'files' 버킷에 올리고 스테이징 메타를 반환. 텍스트 파일은 본문을 extracted_text로 담는다. */
export async function stageKnowledgeFile(file: File): Promise<StagedKnowledge> {
  const up = await uploadFile("files", file)
  let extracted: string | null = null
  if (isTextKnowledge({ type: file.type, name: file.name })) {
    try {
      extracted = (await file.text()).slice(0, 200_000) // 과대 방지(약 5만 토큰 상한)
    } catch {
      extracted = null
    }
  }
  return { storage_path: up.path, name: up.name, size: up.size, mime_type: up.mimeType, extracted_text: extracted }
}
