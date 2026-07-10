export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_usage: {
        Row: {
          agent_id: string | null
          conversation_id: string | null
          cost_usd: number | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          model: string | null
          success: boolean
          tokens_input: number
          tokens_output: number
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          agent_id?: string | null
          conversation_id?: string | null
          cost_usd?: number | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          model?: string | null
          success?: boolean
          tokens_input?: number
          tokens_output?: number
          user_id?: string | null
          workspace_id?: string
        }
        Update: {
          agent_id?: string | null
          conversation_id?: string | null
          cost_usd?: number | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          model?: string | null
          success?: boolean
          tokens_input?: number
          tokens_output?: number
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_usage_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_usage_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_usage_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_versions: {
        Row: {
          agent_id: string
          created_at: string
          created_by: string | null
          id: string
          is_current: boolean
          max_tokens: number
          mcp_servers: string[]
          model: string
          system_prompt: string
          temperature: number
          tools: Json
          version: number
          workspace_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_current?: boolean
          max_tokens?: number
          mcp_servers?: string[]
          model?: string
          system_prompt: string
          temperature?: number
          tools?: Json
          version?: number
          workspace_id?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_current?: boolean
          max_tokens?: number
          mcp_servers?: string[]
          model?: string
          system_prompt?: string
          temperature?: number
          tools?: Json
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_versions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          icon: string
          id: string
          is_active: boolean
          is_public: boolean
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          is_public?: boolean
          name: string
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          is_public?: boolean
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          content: string
          created_at: string
          id: string
          pinned: boolean
          title: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_comments: {
        Row: {
          body: string
          created_at: string
          document_id: string
          id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          body: string
          created_at?: string
          document_id: string
          id?: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          document_id?: string
          id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_comments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "approval_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_documents: {
        Row: {
          attachment_name: string | null
          attachment_path: string | null
          attachment_size: number | null
          body: Json
          completed_at: string | null
          created_at: string
          current_step: number
          doc_no: string | null
          doc_type: string
          drafter_id: string
          id: string
          status: string
          submitted_at: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          body?: Json
          completed_at?: string | null
          created_at?: string
          current_step?: number
          doc_no?: string | null
          doc_type?: string
          drafter_id: string
          id?: string
          status?: string
          submitted_at?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          body?: Json
          completed_at?: string | null
          created_at?: string
          current_step?: number
          doc_no?: string | null
          doc_type?: string
          drafter_id?: string
          id?: string
          status?: string
          submitted_at?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_documents_drafter_id_fkey"
            columns: ["drafter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_steps: {
        Row: {
          acted_at: string | null
          approver_id: string
          comment: string | null
          created_at: string
          document_id: string
          id: string
          role: string
          status: string
          step_order: number
          workspace_id: string
        }
        Insert: {
          acted_at?: string | null
          approver_id: string
          comment?: string | null
          created_at?: string
          document_id: string
          id?: string
          role?: string
          status?: string
          step_order: number
          workspace_id?: string
        }
        Update: {
          acted_at?: string | null
          approver_id?: string
          comment?: string | null
          created_at?: string
          document_id?: string
          id?: string
          role?: string
          status?: string
          step_order?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_steps_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_steps_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "approval_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          workspace_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          workspace_id?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "assistant_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          check_in: string | null
          check_out: string | null
          created_at: string
          id: string
          note: string | null
          status: string
          user_id: string
          work_date: string
          workspace_id: string
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          id?: string
          note?: string | null
          status?: string
          user_id: string
          work_date?: string
          workspace_id?: string
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          id?: string
          note?: string | null
          status?: string
          user_id?: string
          work_date?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_viewers: {
        Row: {
          created_at: string
          granted_by: string | null
          viewer_user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          viewer_user_id: string
          workspace_id?: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          viewer_user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_viewers_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_viewers_viewer_user_id_fkey"
            columns: ["viewer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_viewers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      business_cards: {
        Row: {
          address: string | null
          company: string | null
          created_at: string
          deleted_at: string | null
          department: string | null
          email: string | null
          id: string
          image_url: string | null
          mobile: string | null
          name: string | null
          owner_id: string
          phone: string | null
          raw_ocr: Json
          title: string | null
          updated_at: string
          website: string | null
          workspace_id: string
        }
        Insert: {
          address?: string | null
          company?: string | null
          created_at?: string
          deleted_at?: string | null
          department?: string | null
          email?: string | null
          id?: string
          image_url?: string | null
          mobile?: string | null
          name?: string | null
          owner_id: string
          phone?: string | null
          raw_ocr?: Json
          title?: string | null
          updated_at?: string
          website?: string | null
          workspace_id?: string
        }
        Update: {
          address?: string | null
          company?: string | null
          created_at?: string
          deleted_at?: string | null
          department?: string | null
          email?: string | null
          id?: string
          image_url?: string | null
          mobile?: string | null
          name?: string | null
          owner_id?: string
          phone?: string | null
          raw_ocr?: Json
          title?: string | null
          updated_at?: string
          website?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_cards_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_cards_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
          attachments: Json
          attendees: string[]
          color: string
          created_at: string
          created_by: string
          description: string | null
          end_time: string | null
          id: string
          location: string | null
          project_id: string | null
          start_time: string
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          all_day?: boolean
          attachments?: Json
          attendees?: string[]
          color?: string
          created_at?: string
          created_by: string
          description?: string | null
          end_time?: string | null
          id?: string
          location?: string | null
          project_id?: string | null
          start_time: string
          status?: string
          title: string
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          all_day?: boolean
          attachments?: Json
          attendees?: string[]
          color?: string
          created_at?: string
          created_by?: string
          description?: string | null
          end_time?: string | null
          id?: string
          location?: string | null
          project_id?: string | null
          start_time?: string
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_accounts: {
        Row: {
          amount: number
          calc_type_id: string | null
          category_id: string | null
          color: string
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          extra: number
          field_values: Json
          id: string
          item_type: string
          kind: string
          name: string
          note: string | null
          opening_balance: number
          parent_id: string | null
          rate: number
          sort_order: number
          unit_price: number
          units: number
          updated_at: string
          workspace_id: string
          x: number | null
          y: number | null
        }
        Insert: {
          amount?: number
          calc_type_id?: string | null
          category_id?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          extra?: number
          field_values?: Json
          id?: string
          item_type?: string
          kind?: string
          name: string
          note?: string | null
          opening_balance?: number
          parent_id?: string | null
          rate?: number
          sort_order?: number
          unit_price?: number
          units?: number
          updated_at?: string
          workspace_id?: string
          x?: number | null
          y?: number | null
        }
        Update: {
          amount?: number
          calc_type_id?: string | null
          category_id?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          extra?: number
          field_values?: Json
          id?: string
          item_type?: string
          kind?: string
          name?: string
          note?: string | null
          opening_balance?: number
          parent_id?: string | null
          rate?: number
          sort_order?: number
          unit_price?: number
          units?: number
          updated_at?: string
          workspace_id?: string
          x?: number | null
          y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_accounts_calc_type_id_fkey"
            columns: ["calc_type_id"]
            isOneToOne: false
            referencedRelation: "cash_calc_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_accounts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "cash_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_calc_types: {
        Row: {
          created_at: string
          created_by: string | null
          fields: Json
          flow: string
          formula: Json
          id: string
          name: string
          sort_order: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fields?: Json
          flow?: string
          formula?: Json
          id?: string
          name: string
          sort_order?: number
          workspace_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fields?: Json
          flow?: string
          formula?: Json
          id?: string
          name?: string
          sort_order?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_calc_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_calc_types_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_categories: {
        Row: {
          collapsed: boolean
          color: string
          created_at: string
          created_by: string | null
          flow: string
          id: string
          name: string
          sort_order: number
          workspace_id: string
          x: number | null
          y: number | null
        }
        Insert: {
          collapsed?: boolean
          color?: string
          created_at?: string
          created_by?: string | null
          flow?: string
          id?: string
          name: string
          sort_order?: number
          workspace_id?: string
          x?: number | null
          y?: number | null
        }
        Update: {
          collapsed?: boolean
          color?: string
          created_at?: string
          created_by?: string | null
          flow?: string
          id?: string
          name?: string
          sort_order?: number
          workspace_id?: string
          x?: number | null
          y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_transfers: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          fee_amount: number
          from_account_id: string
          id: string
          memo: string | null
          to_account_id: string
          transfer_date: string
          workspace_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          fee_amount?: number
          from_account_id: string
          id?: string
          memo?: string | null
          to_account_id: string
          transfer_date?: string
          workspace_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          fee_amount?: number
          from_account_id?: string
          id?: string
          memo?: string | null
          to_account_id?: string
          transfer_date?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transfers_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transfers_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transfers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cashflow_settings: {
        Row: {
          default_calc_type_id: string | null
          default_currency: string
          opening_cash: Json
          pool_pos: Json | null
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          default_calc_type_id?: string | null
          default_currency?: string
          opening_cash?: Json
          pool_pos?: Json | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Update: {
          default_calc_type_id?: string | null
          default_currency?: string
          opening_cash?: Json
          pool_pos?: Json | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_settings_default_calc_type_id_fkey"
            columns: ["default_calc_type_id"]
            isOneToOne: false
            referencedRelation: "cash_calc_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          agent_id: string | null
          created_at: string
          id: string
          metadata: Json
          status: string
          title: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          status?: string
          title?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          user_a: string
          user_b: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          user_a: string
          user_b: string
          workspace_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          user_a?: string
          user_b?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_conversations_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_conversations_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_messages: {
        Row: {
          attachment_name: string | null
          attachment_url: string | null
          body_json: Json | null
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          parent_id: string | null
          read_at: string | null
          root_id: string | null
          sender_id: string
          workspace_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_url?: string | null
          body_json?: Json | null
          content: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          parent_id?: string | null
          read_at?: string | null
          root_id?: string | null
          sender_id: string
          workspace_id?: string
        }
        Update: {
          attachment_name?: string | null
          attachment_url?: string | null
          body_json?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          parent_id?: string | null
          read_at?: string | null
          root_id?: string | null
          sender_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "direct_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "direct_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_reports: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          spent_on: string
          status: string
          title: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          spent_on?: string
          status?: string
          title: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          spent_on?: string
          status?: string
          title?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      file_folders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          sort: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          sort?: number
          workspace_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          sort?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_folders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          created_at: string
          deleted_at: string | null
          department: string | null
          external_id: string | null
          folder_id: string | null
          id: string
          metadata: Json
          mime_type: string | null
          name: string
          owner_id: string | null
          project_id: string | null
          size_bytes: number | null
          source: string
          visibility: string
          web_view_link: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          department?: string | null
          external_id?: string | null
          folder_id?: string | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          name: string
          owner_id?: string | null
          project_id?: string | null
          size_bytes?: number | null
          source?: string
          visibility?: string
          web_view_link?: string | null
          workspace_id?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          department?: string | null
          external_id?: string | null
          folder_id?: string | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          name?: string
          owner_id?: string | null
          project_id?: string | null
          size_bytes?: number | null
          source?: string
          visibility?: string
          web_view_link?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "file_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_entries: {
        Row: {
          account_id: string | null
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          description: string | null
          entry_date: string
          fee_amount: number
          id: string
          kind: string
          metadata: Json
          project_id: string | null
          quantity: number | null
          receipt_url: string | null
          source: string
          status: string
          tax_amount: number
          total_amount: number
          unit_price: number | null
          updated_at: string
          vendor: string | null
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          description?: string | null
          entry_date: string
          fee_amount?: number
          id?: string
          kind: string
          metadata?: Json
          project_id?: string | null
          quantity?: number | null
          receipt_url?: string | null
          source?: string
          status?: string
          tax_amount?: number
          total_amount?: number
          unit_price?: number | null
          updated_at?: string
          vendor?: string | null
          workspace_id?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          description?: string | null
          entry_date?: string
          fee_amount?: number
          id?: string
          kind?: string
          metadata?: Json
          project_id?: string | null
          quantity?: number | null
          receipt_url?: string | null
          source?: string
          status?: string
          tax_amount?: number
          total_amount?: number
          unit_price?: number | null
          updated_at?: string
          vendor?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_entries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          as_of: string
          currency: string
          fetched_at: string
          id: string
          krw_per_unit: number
          source: string
        }
        Insert: {
          as_of: string
          currency: string
          fetched_at?: string
          id?: string
          krw_per_unit: number
          source?: string
        }
        Update: {
          as_of?: string
          currency?: string
          fetched_at?: string
          id?: string
          krw_per_unit?: number
          source?: string
        }
        Relationships: []
      }
      google_connections: {
        Row: {
          access_token: string | null
          created_at: string
          expires_at: string | null
          google_email: string | null
          id: string
          is_active: boolean
          last_history_id: string | null
          refresh_token: string | null
          scopes: string[]
          token_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          expires_at?: string | null
          google_email?: string | null
          id?: string
          is_active?: boolean
          last_history_id?: string | null
          refresh_token?: string | null
          scopes?: string[]
          token_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          expires_at?: string | null
          google_email?: string | null
          id?: string
          is_active?: boolean
          last_history_id?: string | null
          refresh_token?: string | null
          scopes?: string[]
          token_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_message_attachments: {
        Row: {
          created_at: string
          id: string
          message_id: string
          mime_type: string | null
          name: string | null
          size: number | null
          storage_path: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          mime_type?: string | null
          name?: string | null
          size?: number | null
          storage_path: string
          workspace_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          mime_type?: string | null
          name?: string | null
          size?: number | null
          storage_path?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "group_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_message_attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      group_message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "group_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_message_reactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      group_messages: {
        Row: {
          body_json: Json | null
          content: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          parent_id: string | null
          room_id: string
          root_id: string | null
          sender_id: string
          workspace_id: string
        }
        Insert: {
          body_json?: Json | null
          content: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          parent_id?: string | null
          room_id: string
          root_id?: string | null
          sender_id: string
          workspace_id?: string
        }
        Update: {
          body_json?: Json | null
          content?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          parent_id?: string | null
          room_id?: string
          root_id?: string | null
          sender_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "group_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "group_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      group_read_state: {
        Row: {
          last_read_at: string
          room_id: string
          user_id: string
        }
        Insert: {
          last_read_at?: string
          room_id: string
          user_id: string
        }
        Update: {
          last_read_at?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_read_state_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "group_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_read_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_rooms: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          last_message_at: string | null
          name: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          last_message_at?: string | null
          name?: string
          workspace_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          last_message_at?: string | null
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_rooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_rooms_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          end_date: string
          id: string
          leave_type: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          end_date?: string
          id?: string
          leave_type?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          leave_type?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_oauth_clients: {
        Row: {
          client_id: string
          client_secret: string | null
          connector_id: string
          created_at: string
        }
        Insert: {
          client_id: string
          client_secret?: string | null
          connector_id: string
          created_at?: string
        }
        Update: {
          client_id?: string
          client_secret?: string | null
          connector_id?: string
          created_at?: string
        }
        Relationships: []
      }
      mcp_servers: {
        Row: {
          args: string[] | null
          auth_type: string
          command: string | null
          created_at: string
          encrypted_token: string | null
          env_vars: Json
          id: string
          is_active: boolean
          last_test_error: string | null
          last_test_ok: boolean | null
          last_tested_at: string | null
          name: string
          type: string
          url: string | null
          workspace_id: string
        }
        Insert: {
          args?: string[] | null
          auth_type?: string
          command?: string | null
          created_at?: string
          encrypted_token?: string | null
          env_vars?: Json
          id?: string
          is_active?: boolean
          last_test_error?: string | null
          last_test_ok?: boolean | null
          last_tested_at?: string | null
          name: string
          type: string
          url?: string | null
          workspace_id?: string
        }
        Update: {
          args?: string[] | null
          auth_type?: string
          command?: string | null
          created_at?: string
          encrypted_token?: string | null
          env_vars?: Json
          id?: string
          is_active?: boolean
          last_test_error?: string | null
          last_test_ok?: boolean | null
          last_tested_at?: string | null
          name?: string
          type?: string
          url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_servers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_tools: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          input_schema: Json
          name: string
          server_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          input_schema?: Json
          name: string
          server_id: string
          workspace_id?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          input_schema?: Json
          name?: string
          server_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_tools_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "mcp_servers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcp_tools_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_user_connections: {
        Row: {
          auth_method: string
          connector_id: string
          created_at: string
          encrypted_refresh_token: string | null
          encrypted_token: string
          expires_at: string | null
          id: string
          last_test_error: string | null
          last_test_ok: boolean | null
          last_tested_at: string | null
          tools: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_method?: string
          connector_id: string
          created_at?: string
          encrypted_refresh_token?: string | null
          encrypted_token: string
          expires_at?: string | null
          id?: string
          last_test_error?: string | null
          last_test_ok?: boolean | null
          last_tested_at?: string | null
          tools?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_method?: string
          connector_id?: string
          created_at?: string
          encrypted_refresh_token?: string | null
          encrypted_token?: string
          expires_at?: string | null
          id?: string
          last_test_error?: string | null
          last_test_ok?: boolean | null
          last_tested_at?: string | null
          tools?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_user_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_categories: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          sort_order: number
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          sort_order?: number
          workspace_id?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          sort_order?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_note_folders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          sort: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          sort?: number
          workspace_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          sort?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_note_folders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_note_folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_notes: {
        Row: {
          attachment_name: string | null
          attachment_path: string | null
          attachment_size: number | null
          attendees: string | null
          category_id: string | null
          content: string
          created_at: string
          folder_id: string | null
          graph: Json | null
          id: string
          importance: number
          meeting_date: string | null
          meeting_time: string | null
          title: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          attendees?: string | null
          category_id?: string | null
          content?: string
          created_at?: string
          folder_id?: string | null
          graph?: Json | null
          id?: string
          importance?: number
          meeting_date?: string | null
          meeting_time?: string | null
          title?: string
          updated_at?: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          attendees?: string | null
          category_id?: string | null
          content?: string
          created_at?: string
          folder_id?: string | null
          graph?: Json | null
          id?: string
          importance?: number
          meeting_date?: string | null
          meeting_time?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_notes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "meeting_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_notes_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "meeting_note_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          created_at: string
          id: string
          message_id: string
          mime_type: string | null
          name: string | null
          size: number | null
          storage_path: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          mime_type?: string | null
          name?: string | null
          size?: number | null
          storage_path: string
          workspace_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          mime_type?: string | null
          name?: string | null
          size?: number | null
          storage_path?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "direct_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "direct_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          model: string | null
          role: string
          tokens_used: number | null
          workspace_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          model?: string | null
          role: string
          tokens_used?: number | null
          workspace_id?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          model?: string | null
          role?: string
          tokens_used?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          metadata: Json
          title: string
          type: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          metadata?: Json
          title: string
          type: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          metadata?: Json
          title?: string
          type?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_tasks: {
        Row: {
          created_at: string
          done: boolean
          due_date: string | null
          id: string
          sort_order: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          due_date?: string | null
          id?: string
          sort_order?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          done?: boolean
          due_date?: string | null
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tasks: {
        Row: {
          created_at: string
          created_by: string | null
          done: boolean
          due_date: string | null
          id: string
          project_id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          done?: boolean
          due_date?: string | null
          id?: string
          project_id: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          done?: boolean
          due_date?: string | null
          id?: string
          project_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          contact_privacy: Json
          created_at: string
          department: string | null
          email: string
          id: string
          mobile: string | null
          name: string
          position: string | null
          role: string
          status_manual: string | null
          updated_at: string
          work_phone: string | null
        }
        Insert: {
          avatar_url?: string | null
          contact_privacy?: Json
          created_at?: string
          department?: string | null
          email: string
          id: string
          mobile?: string | null
          name: string
          position?: string | null
          role?: string
          status_manual?: string | null
          updated_at?: string
          work_phone?: string | null
        }
        Update: {
          avatar_url?: string | null
          contact_privacy?: Json
          created_at?: string
          department?: string | null
          email?: string
          id?: string
          mobile?: string | null
          name?: string
          position?: string | null
          role?: string
          status_manual?: string | null
          updated_at?: string
          work_phone?: string | null
        }
        Relationships: []
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          project_id: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          role?: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          importance: number
          metadata: Json
          name: string
          owner_id: string | null
          start_date: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          importance?: number
          metadata?: Json
          name: string
          owner_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          importance?: number
          metadata?: Json
          name?: string
          owner_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      room_members: {
        Row: {
          joined_at: string
          role: string
          room_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          role?: string
          room_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          role?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "group_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_invoices: {
        Row: {
          buyer_biz_no: string | null
          buyer_name: string | null
          created_at: string
          created_by: string | null
          direction: string
          id: string
          issue_date: string | null
          items: Json
          source_entry_id: string | null
          status: string
          supplier_biz_no: string | null
          supplier_name: string | null
          supply_amount: number
          tax_amount: number
          total_amount: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          buyer_biz_no?: string | null
          buyer_name?: string | null
          created_at?: string
          created_by?: string | null
          direction: string
          id?: string
          issue_date?: string | null
          items?: Json
          source_entry_id?: string | null
          status?: string
          supplier_biz_no?: string | null
          supplier_name?: string | null
          supply_amount?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          buyer_biz_no?: string | null
          buyer_name?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          issue_date?: string | null
          items?: Json
          source_entry_id?: string | null
          status?: string
          supplier_biz_no?: string | null
          supplier_name?: string | null
          supply_amount?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_invoices_source_entry_id_fkey"
            columns: ["source_entry_id"]
            isOneToOne: false
            referencedRelation: "finance_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_agent_pins: {
        Row: {
          agent_id: string
          created_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_agent_pins_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_agent_pins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_agent_pins_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          created_at: string
          duration_ms: number | null
          error: string | null
          final_output: string | null
          id: string
          input: string | null
          node_count: number
          node_results: Json
          status: string
          user_id: string
          workflow_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          final_output?: string | null
          id?: string
          input?: string | null
          node_count?: number
          node_results?: Json
          status?: string
          user_id: string
          workflow_id: string
          workspace_id?: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          final_output?: string | null
          id?: string
          input?: string | null
          node_count?: number
          node_results?: Json
          status?: string
          user_id?: string
          workflow_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_public: boolean
          name: string
          run_count: number
          steps: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          name: string
          run_count?: number
          steps?: Json
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          name?: string
          run_count?: number
          steps?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflows_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          monthly_budget_usd: number | null
          name: string
          owner_id: string | null
          plan: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          monthly_budget_usd?: number | null
          name: string
          owner_id?: string | null
          plan?: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          monthly_budget_usd?: number | null
          name?: string
          owner_id?: string | null
          plan?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      act_on_approval: {
        Args: { p_action: string; p_comment?: string; p_document_id: string }
        Returns: undefined
      }
      add_room_members: {
        Args: { p_members: string[]; p_room: string }
        Returns: undefined
      }
      auth_is_admin: { Args: never; Returns: boolean }
      auth_is_workspace_owner: { Args: { ws_id: string }; Returns: boolean }
      auth_user_department: { Args: never; Returns: string }
      auth_user_workspace_ids: { Args: never; Returns: string[] }
      can_view_attendance: { Args: { ws: string }; Returns: boolean }
      create_group_room: {
        Args: { p_members: string[]; p_name: string }
        Returns: string
      }
      current_workspace_id: { Args: never; Returns: string }
      directory_contact: {
        Args: { target: string }
        Returns: {
          email: string
          mobile: string
          work_phone: string
        }[]
      }
      get_or_create_direct_conversation: {
        Args: { other_user: string }
        Returns: string
      }
      grant_attendance_viewer: { Args: { target: string }; Returns: undefined }
      is_approval_participant: { Args: { doc_id: string }; Returns: boolean }
      is_room_member: { Args: { p_room: string }; Returns: boolean }
      is_workspace_member: { Args: { ws_id: string }; Returns: boolean }
      leave_group_room: { Args: { p_room: string }; Returns: undefined }
      mark_dm_read: { Args: { conv_id: string }; Returns: number }
      mark_room_read: { Args: { p_room: string }; Returns: undefined }
      owner_can_set_role: { Args: { target: string }; Returns: boolean }
      recall_document: { Args: { doc_id: string }; Returns: undefined }
      revise_document: { Args: { doc_id: string }; Returns: undefined }
      revoke_attendance_viewer: { Args: { target: string }; Returns: undefined }
      set_file_folder: {
        Args: { p_file: string; p_folder: string }
        Returns: undefined
      }
      set_meeting_meta: {
        Args: {
          p_category: string
          p_date: string
          p_importance: number
          p_note: string
          p_time: string
        }
        Returns: undefined
      }
      set_meeting_note_folder: {
        Args: { new_folder: string; note_id: string }
        Returns: undefined
      }
      set_member_department: {
        Args: { new_department: string; target: string }
        Returns: undefined
      }
      set_member_position: {
        Args: { new_position: string; target: string }
        Returns: undefined
      }
      set_member_role: {
        Args: { new_role: string; target: string }
        Returns: undefined
      }
      shares_workspace_with: { Args: { other_user: string }; Returns: boolean }
      submit_document: { Args: { doc_id: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
