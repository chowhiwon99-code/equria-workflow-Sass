import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://complow.kr"),
  // 앱 화면(대시보드 등)의 기본 제목 — 설치 앱 창 제목·브라우저 탭에 그대로 뜨므로 브랜드만.
  // 랜딩(page.tsx)·법적 문서 등 공개 페이지는 각자 SEO용 제목을 따로 갖고 있어 영향 없음.
  title: "Complow",
  description: "Complow 직원 전용 워크스페이스",
  // PWA — manifest는 app/manifest.ts가 /manifest.webmanifest로 제공.
  manifest: "/manifest.webmanifest",
  // iOS는 매니페스트의 display를 안 읽는다. '홈 화면에 추가' 시 전체화면으로 뜨려면 이 메타가 필요.
  appleWebApp: {
    capable: true,
    title: "Complow",
    statusBarStyle: "default",
  },
};

// iOS Safari: 입력창 폰트가 16px 미만이면 포커스 시 화면을 자동 확대 → 전송버튼이 화면 밖으로 밀림.
// maximum-scale=1로 이 자동 확대를 막는다. 최신 iOS는 접근성상 사용자의 수동 핀치줌은 계속 허용한다.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Pretendard(가변) — 'Workspace' 워드마크 등 브랜드 타이포용. font-pretendard 유틸로 사용 */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
