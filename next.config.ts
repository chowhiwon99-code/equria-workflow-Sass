import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // 홈 디렉토리의 무관한 lockfile 때문에 루트가 잘못 잡히는 것을 방지
  turbopack: {
    root: path.resolve(__dirname),
  },
  // 좌하단 Next.js 개발 표시기("N") 숨김 — 개발 편의용(배포본엔 영향 없음)
  devIndicators: false,
};

export default nextConfig;
