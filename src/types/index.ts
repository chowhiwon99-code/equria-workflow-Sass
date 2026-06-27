/**
 * 공통 타입 정의.
 * DB Row 타입은 `@/lib/supabase/types`의 생성된 타입을 재사용한다.
 */
import type { Tables } from "@/lib/supabase/types"

export type Profile = Tables<"profiles">
export type Agent = Tables<"agents">
export type AgentVersion = Tables<"agent_versions">
export type Conversation = Tables<"conversations">
export type Message = Tables<"messages">
export type Workflow = Tables<"workflows">
export type CalendarEvent = Tables<"calendar_events">
export type McpServer = Tables<"mcp_servers">

// --- 신규 기능 (Phase A~F) ---
export type Project = Tables<"projects">
export type ProjectMember = Tables<"project_members">
export type Notification = Tables<"notifications">
export type FinanceEntry = Tables<"finance_entries">
export type TaxInvoice = Tables<"tax_invoices">
export type CashAccount = Tables<"cash_accounts">
export type CashTransfer = Tables<"cash_transfers">
export type CashCategory = Tables<"cash_categories">
export type CashflowSettings = Tables<"cashflow_settings">
export type BusinessCard = Tables<"business_cards">
export type GoogleConnection = Tables<"google_connections">
export type DriveFile = Tables<"files">
export type DirectConversation = Tables<"direct_conversations">
export type DirectMessage = Tables<"direct_messages">

/** projects.status 체크 제약과 일치 */
export type ProjectStatus =
  | "planned"
  | "in_progress"
  | "on_hold"
  | "done"
  | "canceled"

/** notifications.type 체크 제약과 일치 */
export type NotificationType =
  | "dm"
  | "event_done"
  | "event_invite"
  | "project_assigned"
  | "mail"
  | "system"

/** agents.category 체크 제약과 일치 */
export type AgentCategory =
  | "tax"
  | "cs"
  | "content"
  | "translation"
  | "document"
  | "analytics"
  | "legal"
  | "custom"

/** 현재 버전 정보를 합친 에이전트 (허브/채팅 화면에서 사용) */
export type AgentWithVersion = Agent & {
  current_version: AgentVersion | null
}
