/* Complow 서비스워커 — PWA 설치 요건(fetch 핸들러) 충족 + 오프라인 안내.
 *
 * ⚠️ 캐시 정책이 이 파일의 전부다. 우리는 회사별로 격리된 멀티테넌트 앱이라,
 *    응답을 함부로 캐시하면 **다른 회사/다른 계정의 데이터가 기기에 남는다**(RLS로 막은 걸 캐시가 뚫는 꼴).
 *    그래서 캐시 대상은 "내용 해시가 붙어 불변이고 비공개 데이터가 없는 빌드 산출물"로만 한정한다.
 *
 *    캐시하지 않는 것: /api/* (전부 사용자 데이터) · /auth/* (세션) · 모든 HTML 페이지
 *    (SSR이라 응답 본문에 로그인한 사람의 데이터가 들어 있다)
 */
const VERSION = "v1"
const STATIC_CACHE = `complow-static-${VERSION}`
const OFFLINE_URL = "/offline.html"

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE)
      await cache.add(OFFLINE_URL)
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 옛 버전 캐시 정리 — 배포 후 낡은 산출물이 계속 뜨는 걸 막는다.
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return

  let url
  try {
    url = new URL(req.url)
  } catch {
    return
  }
  if (url.origin !== self.location.origin) return

  // 사용자 데이터·세션은 손대지 않는다(캐시도, 가로채기도).
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return

  // 페이지 이동: 항상 네트워크에서 받는다. 오프라인일 때만 안내 화면을 보여준다.
  // (HTML을 캐시하면 로그아웃 후에도 이전 사용자의 화면이 뜰 수 있다.)
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req)
        } catch {
          const cached = await caches.match(OFFLINE_URL)
          return cached ?? Response.error()
        }
      })(),
    )
    return
  }

  // 빌드 산출물·아이콘만 캐시(경로에 내용 해시가 있어 불변이고, 누구에게나 동일한 공개 파일).
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req)
        if (cached) return cached
        const res = await fetch(req)
        if (res.ok) {
          const cache = await caches.open(STATIC_CACHE)
          cache.put(req, res.clone())
        }
        return res
      })(),
    )
  }
  // 그 외에는 respondWith를 부르지 않는다 = 브라우저 기본 동작(네트워크).
})
