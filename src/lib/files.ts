// 파일관리 SSOT — 버킷 id, 소스 라벨, 바이트 포맷.

export const FILES_BUCKET = "files"

export const FILE_SOURCE_LABEL: Record<string, string> = {
  local: "내 업로드",
  gdrive: "Google Drive",
  link: "링크",
  figma: "Figma",
  workflow: "워크플로우 결과",
}

export function fileSourceLabel(source: string): string {
  return FILE_SOURCE_LABEL[source] ?? source
}

export function formatBytes(n: number | null): string {
  if (!n || n <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i > 0 && v < 10 ? 1 : 0)} ${units[i]}`
}
