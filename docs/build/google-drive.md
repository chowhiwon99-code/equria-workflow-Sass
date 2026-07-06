# 빌드 스펙 — Google Drive (Files 섹션 통합)

> 참조 전략: `GOOGLE-MCP-ARCHITECTURE.md` §Phase C. 이 문서는 그 실행판.

## 목표
`/files` 화면에 **[내 업로드 | Google Drive]** 탭을 추가 → 연동한 구글 계정의 Drive 파일을 **목록·검색·미리보기·다운로드**. (동기화 X — 실시간 조회만)

## 현재 상태
- ✅ OAuth 완비: `/api/google/{connect,callback,disconnect}`, 토큰 AES-256-GCM 암호화, 자동 갱신
- ✅ `getDriveForUser(userId)` 존재 (`src/lib/google/client.ts`) — **아직 아무도 호출 안 함**
- ✅ `files` 테이블에 `source` 컬럼(`'gdrive'` 값 지원), `fileSourceLabel()`·`formatBytes()` (`src/lib/files.ts`)
- ❌ **drive 스코프 없음** (`GOOGLE_SCOPES` = openid·email·profile·gmail.modify only)
- ❌ `src/lib/google/drive.ts` 없음 · `/api/google/drive/*` 라우트 없음
- ❌ `FilesView`에 Drive 탭 UI 없음 ("Google Drive 연동 — 곧" 비활성 placeholder)

## 결정 필요 (착수 전)
- **Drive 스코프**: `drive.file`(우리 앱이 만든/연 파일만 — 가장 안전, 심사 쉬움) vs `drive.readonly`(전체 탐색 — 심사 까다로움). **권장: `drive.file`로 시작.**
  → 스코프 바꾸면 **기존 연결 사용자 재동의 필요**(disconnect 후 reconnect).

## 작업 (순서)
1. **스코프 추가** — `src/lib/google/oauth.ts` `GOOGLE_SCOPES`에 선택한 drive 스코프 추가. (배포 후 재동의 안내)
2. **`src/lib/google/drive.ts` 신규** — `getDriveForUser` 위에서:
   - `listFiles(userId, {q, pageToken, folderId})` → files.list (필드 최소화: id,name,mimeType,size,modifiedTime,iconLink,webViewLink), 페이지네이션
   - `getFile(userId, id)` 메타 + `downloadFile(userId, id)` (Docs/Sheets는 `files.export`로 분기, 일반은 `files.get alt=media`)
   - MIME → 라벨/아이콘 매핑
3. **라우트 신규** — `src/app/api/google/drive/files/route.ts`(GET 목록·검색), `.../drive/files/[id]/route.ts`(GET 메타), `.../drive/download/[id]/route.ts`(GET 스트림). 모두 인증 확인 + `getGoogleAuthForUser` 미연결 시 412/420.
4. **`FilesView` 탭 UI** (`src/components/files/FilesView.tsx`) — [내 업로드 | Google Drive] 탭 스위처. Drive 탭: 목록(그리드/리스트)·검색·폴더 네비(breadcrumb)·미리보기(webViewLink 새 탭 or 인라인)·다운로드. **재사용**: 기존 `FolderGrid`·아이콘·`formatBytes`.
5. **연결 상태 표시** — 미연결이면 "구글 연결하기"(→ `/api/google/connect`), 연결됨이면 계정/재연결. (`google_connection_status` 뷰 활용)

## 재사용 (있는 것)
`getDriveForUser`·`getGoogleAuthForUser`(client.ts) · `fileSourceLabel`·`formatBytes`·`FILE_SOURCE_LABEL`(files.ts) · `FolderGrid`(shared) · Gmail 라우트 패턴(같은 BFF 구조).

## 🔴 블로커 / 주의
- **Vercel 60s·구글 쿼터**: 목록은 metadata 필드만(가볍게), 다운로드는 스트림. 페이지네이션 필수.
- **B1-b 무관**: Drive는 사용자 개인 연동이라 멀티테넌트 격리와 독립. 지금 착수 가능.
- 프로덕션 재동의: 스코프 추가 시 `HANDOFF §C 대표작업`의 구글 콘솔 스코프도 갱신.

## 검증 (E2E)
tsc0·lint30/0·build0 → dev에서 구글 연결 → Files의 Drive 탭에서 목록·검색·미리보기·다운로드 동작 → Docs/Sheets export 스팟체크 → 미연결 상태 안내 확인.
