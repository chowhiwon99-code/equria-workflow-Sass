import type { MetadataRoute } from "next"

/** PWA 매니페스트 — 브라우저의 "설치" 버튼과 홈 화면 추가의 근거.
 *
 *  start_url을 "/"(랜딩)가 아니라 "/dashboard"로 두는 이유: 설치한 사람은 이미 고객이라
 *  앱을 열었을 때 마케팅 페이지가 아니라 업무 화면이 떠야 한다(미로그인이면 로그인으로 리다이렉트). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // 설치 창·앱 이름에 그대로 노출된다 → 브랜드만. 설명은 description으로 충분(노션·슬랙도 같은 방식).
    name: "Complow",
    short_name: "Complow",
    description: "회사 업무에 맞춘 AI 에이전트·프로젝트·근태·재무를 한곳에서.",
    lang: "ko",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    orientation: "any",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // maskable은 안드로이드가 원형·스퀘어클 등으로 잘라내므로 안전영역(80%)에 맞춰 여백을 준 별도 파일.
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
