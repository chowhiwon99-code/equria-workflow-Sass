import type { Metadata } from "next"
import { LegalShell, LegalSection } from "@/components/shared/LegalShell"

// 공개 페이지(로그인 불필요) — PG(결제대행) 심사 요건. 유료 결제 도입 시 적용될 환불 기준.
export const metadata: Metadata = {
  title: "환불정책 — Complow",
  description: "컴플로우(Complow) 환불정책",
}

export default function RefundPage() {
  return (
    <LegalShell title="컴플로우(Complow) 환불정책" effective="2026-07-27">
      <p className="text-muted-foreground">
        본 환불정책은 컴플로우(Complow, 이하 &ldquo;회사&rdquo;)가 제공하는 유료 서비스의 결제 취소·환불 기준을 정합니다.
        본 정책은 「전자상거래 등에서의 소비자보호에 관한 법률」 등 관련 법령을 따르며, 이용약관의 일부를 구성합니다.
      </p>

      <LegalSection title="제1조 (청약철회)">
        <p>1. 이용자는 유료 서비스 결제일로부터 <b>7일 이내</b>에 청약철회(결제 취소)를 요청할 수 있으며, 해당 기간 내 서비스를 <b>사용하지 않은 경우 전액 환불</b>합니다.</p>
        <p>2. 결제 후 서비스를 일부 이용한 경우, 이용한 기간·사용량에 해당하는 금액을 공제한 잔액을 환불합니다.</p>
      </LegalSection>

      <LegalSection title="제2조 (구독형 서비스의 해지·환불)">
        <p>1. 월 구독: 이용자는 언제든지 해지할 수 있으며, 해지 시 <b>다음 결제일부터 결제가 중단</b>됩니다. 이미 결제된 이용 기간은 기간 만료일까지 서비스를 이용할 수 있습니다.</p>
        <p>2. 연 구독: 중도 해지 시 이용한 기간을 월 요금 기준으로 환산·공제한 잔액을 환불합니다.</p>
        <p>3. 환불 금액 산정 시 프로모션·할인 적용분은 정가 기준으로 재산정될 수 있습니다.</p>
      </LegalSection>

      <LegalSection title="제3조 (회사 귀책에 따른 환불)">
        <p>회사의 귀책 사유(서비스 중대 장애, 서비스 제공 불가 등)로 이용자가 서비스를 이용하지 못한 경우, 이용하지 못한 기간에 해당하는 금액을 환불하거나 이용 기간을 연장합니다.</p>
      </LegalSection>

      <LegalSection title="제4조 (환불 방법 및 기간)">
        <p>1. 환불은 원칙적으로 <b>결제에 사용된 수단으로</b> 처리하며, 환불 사유 확인일로부터 <b>영업일 기준 3~5일 이내</b>(카드사 사정에 따라 최대 7일)에 처리합니다.</p>
        <p>2. 결제 수단으로 환불이 불가능한 경우 이용자와 협의하여 계좌 이체 등으로 환불할 수 있습니다.</p>
      </LegalSection>

      <LegalSection title="제5조 (환불이 제한되는 경우)">
        <p>이용약관 위반으로 이용이 제한·해지된 경우, 또는 이미 소진된 사용량 기반 요금(AI 사용량 등)에 대해서는 환불이 제한될 수 있습니다. 이 경우에도 관련 법령이 정한 소비자의 권리는 제한되지 않습니다.</p>
      </LegalSection>

      <LegalSection title="제6조 (환불 신청 방법)">
        <p>환불은 서비스 내 문의 또는 이메일(complow@complow.kr)로 신청할 수 있습니다. 신청 시 결제 정보(결제일·금액·계정 이메일)를 함께 알려주시면 빠르게 처리됩니다.</p>
      </LegalSection>
    </LegalShell>
  )
}
