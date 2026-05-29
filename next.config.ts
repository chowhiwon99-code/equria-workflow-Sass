import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // 홈 디렉토리의 무관한 lockfile 때문에 루트가 잘못 잡히는 것을 방지
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
