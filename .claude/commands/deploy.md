---
description: 안전 배포 — tsc·lint·build 검증 → main 먼저 push → feat push → Vercel READY 확인 → 문서 갱신
---

EQURIA 프로덕션 배포를 `HANDOFF.md` 배포 규칙대로 안전하게 진행해줘. 이 명령 호출 자체가 배포 의사다.

## 1. 검증 게이트 (하나라도 실패 시 중단·보고)
- `npx tsc --noEmit` → 0 에러
- `pnpm lint` → 30 errors / 0 warnings(신규 0)
- `pnpm build` → 통과(Vercel 빌드가 실제 게이트)

## 2. 커밋
- 미커밋 변경이 있으면 **트랙(관심사) 단위로 커밋 분리**(코드/문서). 커밋 메시지 끝에 Co-Authored-By 트레일러.

## 3. 배포 (main 먼저!)
- `git checkout main`
- `git merge --ff-only <feat 브랜치>`  (현재 작업 브랜치, 보통 feat/toss-ui-refresh)
- `git push origin main`   ← **프로덕션 승격**
- `git checkout <feat 브랜치>`
- `git push origin <feat 브랜치>`
> ⚠️ main·feat를 같은 SHA로 동시에 push하면 Vercel이 중복제거해 프로덕션 승격을 건너뛸 수 있다 → **반드시 main 먼저 push**.

## 4. 확인 + 기록
- Vercel `list_deployments`로 프로덕션 배포가 BUILDING→READY 되는지 확인(production target, 새 SHA).
- **롤백 후보 = 직전 프로덕션 SHA** 기록.
- `HANDOFF.md`(최종 업데이트·마이그 카운트·배포 SHA)·`WORKLOG.md` 갱신.

## 5. 보고
배포 SHA · Vercel 상태 · 롤백 후보 · 무엇이 라이브됐는지 요약. 자동화가 진행을 숨기지 않게 각 단계 결과를 노출.

> DDL을 포함했다면 `apply_migration`(MCP) + `migrations/NNN_*.sql` 파일 둘 다 되어 있는지, drift 없는지(`list_migrations`) 먼저 확인.
