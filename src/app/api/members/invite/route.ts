// B2에서 은퇴 — 구 '구글 이메일 사전등록' 초대는 초대 링크(workspace_invites,
// 설정 > 구성원 초대)로 대체됐다. 마이그 116(handle_new_user v2) 이후 이 라우트로
// 계정을 만들면 워크스페이스 멤버십 없이 생성돼 온보딩으로 빠지므로 사용 금지(410).
// 복원이 필요하면 git 히스토리(35813ed) 참조.
export const runtime = "nodejs"

export async function POST() {
  return new Response("이 초대 방식은 종료됐어요. 설정 > 구성원 초대에서 '초대 링크'를 사용하세요.", {
    status: 410,
  })
}
