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
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          success: boolean
          tokens_input: number
          tokens_output: number
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          success?: boolean
          tokens_input?: number
          tokens_output?: number
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          success?: boolean
          tokens_input?: number
          tokens_output?: number
          user_id?: string | null
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
        }
        Relationships: [
          {
            foreignKeyName: "agents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
        }
        Relationships: [
          {
            foreignKeyName: "business_cards_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
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
        }
        Insert: {
          all_day?: boolean
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
        }
        Update: {
          all_day?: boolean
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
        ]
      }
      direct_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          user_a?: string
          user_b?: string
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
        ]
      }
      direct_messages: {
        Row: {
          attachment_name: string | null
          attachment_url: string | null
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          read_at: string | null
          sender_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_url?: string | null
          content: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          read_at?: string | null
          sender_id: string
        }
        Update: {
          attachment_name?: string | null
          attachment_url?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          read_at?: string | null
          sender_id?: string
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
            foreignKeyName: "direct_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          created_at: string
          deleted_at: string | null
          external_id: string | null
          id: string
          metadata: Json
          mime_type: string | null
          name: string
          owner_id: string | null
          project_id: string | null
          size_bytes: number | null
          source: string
          web_view_link: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          name: string
          owner_id?: string | null
          project_id?: string | null
          size_bytes?: number | null
          source?: string
          web_view_link?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          name?: string
          owner_id?: string | null
          project_id?: string | null
          size_bytes?: number | null
          source?: string
          web_view_link?: string | null
        }
        Relationships: [
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
        ]
      }
      finance_entries: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
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
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
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
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
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
        }
        Relationships: [
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
        ]
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
      mcp_servers: {
        Row: {
          args: string[] | null
          command: string | null
          created_at: string
          env_vars: Json
          id: string
          is_active: boolean
          name: string
          type: string
          url: string | null
        }
        Insert: {
          args?: string[] | null
          command?: string | null
          created_at?: string
          env_vars?: Json
          id?: string
          is_active?: boolean
          name: string
          type: string
          url?: string | null
        }
        Update: {
          args?: string[] | null
          command?: string | null
          created_at?: string
          env_vars?: Json
          id?: string
          is_active?: boolean
          name?: string
          type?: string
          url?: string | null
        }
        Relationships: []
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
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          model?: string | null
          role: string
          tokens_used?: number | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          model?: string | null
          role?: string
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
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
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department: string | null
          email: string
          id: string
          name: string
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email: string
          id: string
          name: string
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email?: string
          id?: string
          name?: string
          role?: string
          updated_at?: string
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
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          role?: string
          user_id?: string
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
        ]
      }
      projects: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          metadata: Json
          name: string
          owner_id: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          metadata?: Json
          name: string
          owner_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          metadata?: Json
          name?: string
          owner_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
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
        ]
      }
      user_agent_pins: {
        Row: {
          agent_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          user_id?: string
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
        }
        Relationships: [
          {
            foreignKeyName: "workflows_created_by_fkey"
            columns: ["created_by"]
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
      get_or_create_direct_conversation: {
        Args: { other_user: string }
        Returns: string
      }
      mark_dm_read: { Args: { conv_id: string }; Returns: number }
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
