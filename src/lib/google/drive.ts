// Google Drive 읽기 헬퍼 — 목록/검색/폴더 탐색 + 다운로드(문서류는 export).
// 서버 전용. getDriveForUser(자동 토큰 갱신) 위에 얹는다.
import { getDriveForUser } from "./client"

export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder"

export type DriveFile = {
  id: string
  name: string
  mimeType: string
  isFolder: boolean
  size: number | null // 폴더/문서류는 null
  modifiedTime: string | null
  iconLink: string | null
  webViewLink: string | null
}

const LIST_FIELDS =
  "nextPageToken, files(id,name,mimeType,size,modifiedTime,iconLink,webViewLink)"

function toDriveFile(f: {
  id?: string | null
  name?: string | null
  mimeType?: string | null
  size?: string | null
  modifiedTime?: string | null
  iconLink?: string | null
  webViewLink?: string | null
}): DriveFile {
  const mimeType = f.mimeType ?? "application/octet-stream"
  return {
    id: f.id ?? "",
    name: f.name ?? "(이름 없음)",
    mimeType,
    isFolder: mimeType === DRIVE_FOLDER_MIME,
    size: f.size ? Number(f.size) : null,
    modifiedTime: f.modifiedTime ?? null,
    iconLink: f.iconLink ?? null,
    webViewLink: f.webViewLink ?? null,
  }
}

// Drive 쿼리 문자열 내 작은따옴표 이스케이프(인젝션 방지).
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

/** 파일/폴더 목록. parentId 폴더 안, 또는 q 검색(전체). 폴더 우선 정렬. */
export async function listDriveFiles(
  userId: string,
  opts: { q?: string; parentId?: string; pageToken?: string } = {}
): Promise<{ files: DriveFile[]; nextPageToken: string | null }> {
  const drive = await getDriveForUser(userId)
  const { q, parentId, pageToken } = opts

  let query: string
  if (q && q.trim()) {
    query = `name contains '${esc(q.trim())}' and trashed = false`
  } else {
    query = `'${esc(parentId || "root")}' in parents and trashed = false`
  }

  const res = await drive.files.list({
    q: query,
    fields: LIST_FIELDS,
    orderBy: "folder,name",
    pageSize: 50,
    pageToken,
    spaces: "drive",
    supportsAllDrives: false,
  })
  return {
    files: (res.data.files ?? []).map(toDriveFile),
    nextPageToken: res.data.nextPageToken ?? null,
  }
}

/** 단일 파일 메타. */
export async function getDriveFile(userId: string, id: string): Promise<DriveFile> {
  const drive = await getDriveForUser(userId)
  const res = await drive.files.get({
    fileId: id,
    fields: "id,name,mimeType,size,modifiedTime,iconLink,webViewLink",
  })
  return toDriveFile(res.data)
}

// Google 문서류 → 내보내기 포맷 매핑.
const EXPORT_MAP: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": {
    mime: "application/pdf",
    ext: "pdf",
  },
  "application/vnd.google-apps.spreadsheet": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: "xlsx",
  },
  "application/vnd.google-apps.presentation": {
    mime: "application/pdf",
    ext: "pdf",
  },
  "application/vnd.google-apps.drawing": { mime: "image/png", ext: "png" },
}

/** 다운로드용 바이트 + 메타. Google 문서류는 export, 그 외는 alt=media. */
export async function downloadDriveFile(
  userId: string,
  id: string
): Promise<{ data: Buffer; mimeType: string; filename: string }> {
  const drive = await getDriveForUser(userId)
  const meta = await drive.files.get({ fileId: id, fields: "name,mimeType" })
  const name = meta.data.name ?? "download"
  const srcMime = meta.data.mimeType ?? "application/octet-stream"

  const exp = EXPORT_MAP[srcMime]
  if (exp) {
    const res = await drive.files.export(
      { fileId: id, mimeType: exp.mime },
      { responseType: "arraybuffer" }
    )
    return {
      data: Buffer.from(res.data as ArrayBuffer),
      mimeType: exp.mime,
      filename: `${name}.${exp.ext}`,
    }
  }
  const res = await drive.files.get(
    { fileId: id, alt: "media" },
    { responseType: "arraybuffer" }
  )
  return {
    data: Buffer.from(res.data as ArrayBuffer),
    mimeType: srcMime,
    filename: name,
  }
}
