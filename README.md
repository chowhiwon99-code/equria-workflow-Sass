# 사내 AI 워크스페이스 (B2B 전환 중)

직원 전용 AI 워크스페이스 플랫폼 — 에이전트 허브 · 팀 채팅 · 전자결재 · 회의노트 · 캘린더 · 워크플로우 · 재무/명함/파일 · Gmail·MCP 연동.
외부 SaaS 구독 대신 직접 구축해 회사별로 커스터마이징하는 사내 SaaS. (제품 브랜드명 미정 — 코드의 `EQURIA`는 첫 사내 고객 흔적)

## 문서 (읽는 순서)

1. **`HANDOFF.md`** — 현재 상태 · 다음 할 일 · 합의된 정책 (**가장 먼저, 단일 진실**)
2. **`CLAUDE.md`** — 프로젝트 정체성 · 기술 스택 · 절대 원칙 · 파일 구조 · DB 요약
3. **`.claude/skills/`** — `safe-changes`(변경 안전 원칙·최우선) · `latest-stack`(AI SDK v6·Supabase) · `known-issues`(기술부채)
4. 깊은 내용: `WORKLOG.md`(작업 로그) · `PRODUCTIZATION.md`(B2B 로드맵) · `B1-DESIGN.md`(테넌트 격리) · `AGENTS-MCP-STRATEGY.md` · `STUDY.md`(비개발자용 학습 코스)

## 스택

Next.js 16 (App Router·Turbopack) · React 19 · TypeScript strict · TailwindCSS 4 + shadcn/ui · Supabase(Auth·PostgreSQL·Realtime·Storage) · Claude API + Vercel AI SDK v6 · Vercel 배포 · pnpm.

## 개발

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

환경 변수(`.env.local`)는 `CLAUDE.md` §4 참고. DB 변경은 `supabase/migrations/`(번호 순서, SSOT) + MCP `apply_migration` 둘 다 — 상세는 `.claude/skills/safe-changes.md`.
