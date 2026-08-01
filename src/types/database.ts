export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          avatar_url: string | null;
          credit_balance: number;
          plan_code: string;
          free_credits_granted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          credit_balance?: number;
          plan_code?: string;
          free_credits_granted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          canvas_json: Json | null;
          canvas_width: number;
          canvas_height: number;
          background_color: string;
          thumbnail_path: string | null;
          created_at: string;
          updated_at: string;
          last_opened_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name?: string;
          canvas_json?: Json | null;
          canvas_width?: number;
          canvas_height?: number;
          background_color?: string;
          thumbnail_path?: string | null;
          created_at?: string;
          updated_at?: string;
          last_opened_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Insert"]>;
        Relationships: [];
      };
      assets: {
        Row: {
          id: string;
          user_id: string;
          project_id: string | null;
          asset_type: "upload" | "generated" | "thumbnail" | "reference";
          storage_bucket: string;
          storage_path: string;
          mime_type: string | null;
          file_size: number | null;
          width: number | null;
          height: number | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id?: string | null;
          asset_type: "upload" | "generated" | "thumbnail" | "reference";
          storage_bucket: string;
          storage_path: string;
          mime_type?: string | null;
          file_size?: number | null;
          width?: number | null;
          height?: number | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["assets"]["Insert"]>;
        Relationships: [];
      };
      ai_generations: {
        Row: {
          id: string;
          user_id: string;
          project_id: string;
          provider: string;
          model: string;
          mode: string;
          prompt: string;
          negative_prompt: string | null;
          quality: string;
          status: string;
          source_asset_id: string | null;
          output_asset_id: string | null;
          provider_request_id: string | null;
          selection_data: Json | null;
          credits_charged: number;
          idempotency_key: string;
          error_code: string | null;
          error_message: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id: string;
          provider: string;
          model: string;
          mode: string;
          prompt: string;
          negative_prompt?: string | null;
          quality: string;
          status?: string;
          source_asset_id?: string | null;
          output_asset_id?: string | null;
          provider_request_id?: string | null;
          selection_data?: Json | null;
          credits_charged?: number;
          idempotency_key: string;
          error_code?: string | null;
          error_message?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["ai_generations"]["Insert"]>;
        Relationships: [];
      };
      credit_ledger: {
        Row: {
          id: string;
          user_id: string;
          delta: number;
          balance_after: number;
          reason: string;
          generation_id: string | null;
          payment_id: string | null;
          idempotency_key: string;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          delta: number;
          balance_after: number;
          reason: string;
          generation_id?: string | null;
          payment_id?: string | null;
          idempotency_key: string;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["credit_ledger"]["Insert"]>;
        Relationships: [];
      };
      billing_variants: {
        Row: {
          id: string;
          code: string;
          name: string;
          lemon_variant_id: string;
          billing_type: string;
          credits: number;
          plan_code: string | null;
          display_price: string | null;
          price_amount_cents: number;
          currency: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          lemon_variant_id?: string | null;
          billing_type: string;
          credits: number;
          plan_code?: string | null;
          display_price?: string | null;
          price_amount_cents?: number;
          currency?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["billing_variants"]["Insert"]>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          lemon_subscription_id: string;
          lemon_customer_id: string | null;
          lemon_order_id: string | null;
          lemon_variant_id: string | null;
          status: string;
          renews_at: string | null;
          ends_at: string | null;
          trial_ends_at: string | null;
          customer_portal_url: string | null;
          update_payment_method_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          lemon_subscription_id: string;
          lemon_customer_id?: string | null;
          lemon_order_id?: string | null;
          lemon_variant_id?: string | null;
          status: string;
          renews_at?: string | null;
          ends_at?: string | null;
          trial_ends_at?: string | null;
          customer_portal_url?: string | null;
          update_payment_method_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Insert"]>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          user_id: string;
          lemon_order_id: string;
          lemon_invoice_id: string | null;
          lemon_variant_id: string | null;
          payment_type: string;
          status: string;
          amount: number;
          currency: string;
          credits_granted: number;
          test_mode: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          lemon_order_id: string;
          lemon_invoice_id?: string | null;
          lemon_variant_id?: string | null;
          payment_type: string;
          status: string;
          amount?: number;
          currency?: string;
          credits_granted?: number;
          test_mode?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
        Relationships: [];
      };
      webhook_events: {
        Row: {
          id: string;
          provider: string;
          event_name: string;
          external_id: string;
          payload: Json;
          processed: boolean;
          processing_error: string | null;
          received_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: string;
          provider: string;
          event_name: string;
          external_id: string;
          payload: Json;
          processed?: boolean;
          processing_error?: string | null;
          received_at?: string;
          processed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["webhook_events"]["Insert"]>;
        Relationships: [];
      };
      app_settings: {
        Row: {
          key: string;
          value: Json;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Json;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["app_settings"]["Insert"]>;
        Relationships: [];
      };
    };
    Functions: {
      grant_credits: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_reason: string;
          p_idempotency_key: string;
          p_generation_id?: string | null;
          p_payment_id?: string | null;
          p_metadata?: Json | null;
        };
        Returns: number;
      };
      consume_credits: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_reason: string;
          p_idempotency_key: string;
          p_generation_id?: string | null;
          p_metadata?: Json | null;
        };
        Returns: number;
      };
      refund_credits: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_reason: string;
          p_idempotency_key: string;
          p_generation_id?: string | null;
          p_payment_id?: string | null;
          p_metadata?: Json | null;
        };
        Returns: number;
      };
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type Asset = Database["public"]["Tables"]["assets"]["Row"];
export type AiGeneration = Database["public"]["Tables"]["ai_generations"]["Row"];
export type CreditLedger = Database["public"]["Tables"]["credit_ledger"]["Row"];
export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
export type Payment = Database["public"]["Tables"]["payments"]["Row"];
