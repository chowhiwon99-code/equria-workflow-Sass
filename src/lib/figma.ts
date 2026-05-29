/**
 * Figma 링크 유틸 — 데스크탑 앱 딥링크 지원.
 *
 * Figma 데스크탑 앱(macOS/Windows)은 `figma://` URL 스킴을 등록한다.
 * figma.com 웹 URL의 `https://(www.)figma.com/` 부분을 `figma://`로 바꾸면
 * 데스크탑 앱이 해당 파일을 직접 연다. (앱 미설치 시 동작 안 함 → 브라우저 링크 병행 제공)
 */

export function isFigmaUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?figma\.com\//i.test(url.trim())
}

/** https://www.figma.com/design/KEY/... → figma://design/KEY/... */
export function toFigmaDesktopUrl(url: string): string {
  return url.trim().replace(/^https?:\/\/(www\.)?figma\.com\//i, "figma://")
}
