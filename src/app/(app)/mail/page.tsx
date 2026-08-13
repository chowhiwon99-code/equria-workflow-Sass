import { MailSendView } from "@/components/mail/MailSendView"

// 메일 = 작성·발송 전용(2026-08-12 대표 결정 A안).
// 받은편지함 읽기(MailShell)는 gmail.readonly/modify가 구글 '제한' 스코프라 CASA 연간 보안감사를
// 부르므로 사용 중단했다. 되돌리려면 MailShell로 교체 + oauth.ts에 읽기 스코프 복원.
export default function MailPage() {
  return <MailSendView />
}
