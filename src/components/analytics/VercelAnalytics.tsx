"use client";

import { Analytics } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics — **마케팅 유입 측정 전용**.
 *
 * 왜 전부 추적하지 않는가:
 * 무료(Hobby) 티어는 월 이벤트 한도가 있고, 로그인 후 내부 사용(대시보드·채팅·에이전트)은
 * 페이지뷰가 압도적으로 많다. 그대로 두면 내부 사용이 한도를 먼저 태우고, 정작 보려던
 * "어디서 들어와 어디서 이탈했나"가 잘린다. 그래서 퍼널만 남기고 내부 화면은 버린다.
 *
 *   남긴다: / (랜딩) · /login · /signup · /join/[token] · /onboarding ·
 *          /terms · /terms/billing · /privacy · /refund · /download · /billing(전환 종착점)
 *   버린다: 그 외 (app) 그룹 전부 — 로그인 후 실사용 화면
 *
 * ⚠️ `/billing`은 (app) 그룹이지만 **전환 종착점**이라 예외적으로 추적한다.
 *    (가입 → 결제 화면 도달률을 못 보면 퍼널의 마지막 칸이 비어 유입 판단이 안 된다.)
 * ⚠️ 제품 사용량 분석이 필요해지면 이 목록을 푸는 게 아니라 별도 도구를 쓸 것.
 *    여기를 풀면 유입 데이터가 다시 내부 트래픽에 묻힌다.
 *
 * 대시보드에서 Web Analytics를 **활성화해야** 실제로 수집된다(코드만으론 안 켜진다).
 */

/** 로그인 후 내부 화면 — 유입 퍼널이 아니므로 버린다. `/billing`은 의도적으로 제외(= 추적함). */
const INTERNAL_PREFIXES = [
  "/dashboard",
  "/agents",
  "/approval",
  "/calendar",
  "/cards",
  "/chat",
  "/files",
  "/finance",
  "/mail",
  "/mcp",
  "/meetings",
  "/members",
  "/mypage",
  "/projects",
  "/settings",
  "/work",
];

function pathnameOf(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

export function VercelAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => {
        const path = pathnameOf(event.url);
        // 경로를 못 읽으면 버리지 않는다 — 측정 누락보다 과집계가 낫다(한도는 예외 상황에서만 소모).
        if (!path) return event;
        const isInternal = INTERNAL_PREFIXES.some(
          (prefix) => path === prefix || path.startsWith(`${prefix}/`)
        );
        return isInternal ? null : event;
      }}
    />
  );
}
