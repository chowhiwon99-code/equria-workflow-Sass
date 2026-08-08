import type { Metadata } from "next"
import Link from "next/link"
import { Monitor, Smartphone, Apple } from "lucide-react"
import { InstallButton } from "@/components/pwa/InstallButton"

// 공개 페이지(로그인 불필요 — proxy OPEN_PATHS). 푸터 '다운로드' 링크의 도착지.
export const metadata: Metadata = {
  title: "앱 설치 — Complow",
  description: "Complow를 데스크톱·모바일에 앱처럼 설치해서 쓰세요. 별도 다운로드 없이 바로 설치됩니다.",
}

const GUIDES = [
  {
    icon: Monitor,
    title: "Mac · Windows",
    hint: "Chrome / Edge",
    steps: [
      "주소창 오른쪽 끝의 설치 아이콘(⊕)을 누르세요.",
      "안 보이면 브라우저 메뉴(⋯) → '앱 설치' 또는 'Complow 설치'를 고르세요.",
      "설치하면 독·시작 메뉴에 아이콘이 생기고 별도 창으로 열립니다.",
    ],
  },
  {
    icon: Apple,
    title: "iPhone · iPad",
    hint: "Safari",
    steps: [
      "Safari에서 complow.kr 을 엽니다.",
      "아래쪽 공유 버튼(□↑)을 누르세요.",
      "'홈 화면에 추가'를 고르면 앱 아이콘이 생깁니다.",
    ],
  },
  {
    icon: Smartphone,
    title: "Android",
    hint: "Chrome",
    steps: [
      "Chrome에서 complow.kr 을 엽니다.",
      "'앱 설치' 안내가 뜨면 그대로 설치하세요.",
      "안 뜨면 메뉴(⋮) → '앱 설치'를 고르면 됩니다.",
    ],
  },
]

export default function DownloadPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
      <p className="text-sm font-semibold text-muted-foreground">앱 설치</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        설치 파일 없이, 바로 앱처럼
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
        Complow는 웹 표준(PWA)으로 만들어져 있어 내려받아 실행하는 설치 파일이 필요 없습니다. 브라우저에서 한 번 설치하면
        독·시작 메뉴·홈 화면에 아이콘이 생기고, 주소창 없는 독립 창으로 열립니다. 업데이트도 자동입니다.
      </p>

      <div className="mt-8">
        <InstallButton />
      </div>

      <div className="mt-14 space-y-8">
        {GUIDES.map((g) => (
          <section key={g.title} className="rounded-xl border p-6">
            <div className="flex items-center gap-3">
              <g.icon className="size-5 text-muted-foreground" />
              <h2 className="text-base font-semibold">{g.title}</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {g.hint}
              </span>
            </div>
            <ol className="mt-4 space-y-2">
              {g.steps.map((s, i) => (
                <li key={s} className="flex gap-3 text-[14px] leading-relaxed text-muted-foreground">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                    {i + 1}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <p className="mt-12 text-[13px] leading-relaxed text-muted-foreground">
        설치해도 데이터는 서버에 있고 기기에 저장되지 않습니다. 회사 데이터를 실시간으로 불러오므로 인터넷 연결이 필요합니다.{" "}
        <Link href="/" className="font-medium underline underline-offset-2 hover:text-foreground">
          홈으로
        </Link>
      </p>
    </main>
  )
}
