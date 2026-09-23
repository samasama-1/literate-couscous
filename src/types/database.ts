export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      products: {
        Row: {
          id: string
          name: string
          description: string
          retail_price: number | null
          image_url: string | null
          features: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string
          retail_price?: number | null
          image_url?: string | null
          features?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string
          retail_price?: number | null
          image_url?: string | null
          features?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      batches: {
        Row: {
          id: string
          product_id: string
          status: 'OPEN' | 'CLOSED' | 'DELIVERED'
          target_capacity: number
          current_deposits: number
          deposit_amount: number
          tier_1_price: number
          tier_2_price: number | null
          tier_3_price: number | null
          closes_at: string
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          status?: 'OPEN' | 'CLOSED' | 'DELIVERED'
          target_capacity: number
          current_deposits?: number
          deposit_amount: number
          tier_1_price: number
          tier_2_price?: number | null
          tier_3_price?: number | null
          closes_at: string
          created_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          status?: 'OPEN' | 'CLOSED' | 'DELIVERED'
          target_capacity?: number
          current_deposits?: number
          deposit_amount?: number
          tier_1_price?: number
          tier_2_price?: number | null
          tier_3_price?: number | null
          closes_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          id: string
          order_code: string
          batch_id: string
          customer_name: string
          customer_phone: string
          customer_email: string | null
          quantity: number
          payment_status: 'PENDING_PAYNOW' | 'VERIFIED' | 'REFUNDED'
          payment_reference: string | null
          created_at: string
        }
        Insert: {
          id?: string
          order_code: string
          batch_id: string
          customer_name: string
          customer_phone: string
          customer_email?: string | null
          quantity?: number
          payment_status?: 'PENDING_PAYNOW' | 'VERIFIED' | 'REFUNDED'
          payment_reference?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          order_code?: string
          batch_id?: string
          customer_name?: string
          customer_phone?: string
          customer_email?: string | null
          quantity?: number
          payment_status?: 'PENDING_PAYNOW' | 'VERIFIED' | 'REFUNDED'
          payment_reference?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          id: string
          email: string
          email_normalized: string
          phone: string | null
          telegram_handle: string | null
          first_name: string | null
          marketing_consent: boolean
          marketing_consent_at: string | null
          consent_source: string | null
          privacy_policy_version: string | null
          unsubscribed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          email_normalized: string
          phone?: string | null
          telegram_handle?: string | null
          first_name?: string | null
          marketing_consent?: boolean
          marketing_consent_at?: string | null
          consent_source?: string | null
          privacy_policy_version?: string | null
          unsubscribed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          email_normalized?: string
          phone?: string | null
          telegram_handle?: string | null
          first_name?: string | null
          marketing_consent?: boolean
          marketing_consent_at?: string | null
          consent_source?: string | null
          privacy_policy_version?: string | null
          unsubscribed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          id: string
          name: string
          slug: string
          description: string | null
          headline: string | null
          subheadline: string | null
          cta_text: string
          confirmation_text: string | null
          status: 'draft' | 'active' | 'paused' | 'completed' | 'archived'
          starts_at: string | null
          ends_at: string | null
          is_test: boolean
          reservation_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          description?: string | null
          headline?: string | null
          subheadline?: string | null
          cta_text?: string
          confirmation_text?: string | null
          status?: 'draft' | 'active' | 'paused' | 'completed' | 'archived'
          starts_at?: string | null
          ends_at?: string | null
          is_test?: boolean
          reservation_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          description?: string | null
          headline?: string | null
          subheadline?: string | null
          cta_text?: string
          confirmation_text?: string | null
          status?: 'draft' | 'active' | 'paused' | 'completed' | 'archived'
          starts_at?: string | null
          ends_at?: string | null
          is_test?: boolean
          reservation_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      campaign_products: {
        Row: {
          id: string
          campaign_id: string
          product_id: string | null
          public_name: string
          public_label: string | null
          short_description: string | null
          key_benefit: string | null
          key_differentiator: string | null
          specifications: Json
          tradeoff: string | null
          estimated_price_cents: number
          currency: string
          display_order: number
          image_url: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          product_id?: string | null
          public_name: string
          public_label?: string | null
          short_description?: string | null
          key_benefit?: string | null
          key_differentiator?: string | null
          specifications?: Json
          tradeoff?: string | null
          estimated_price_cents: number
          currency?: string
          display_order?: number
          image_url?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string
          product_id?: string | null
          public_name?: string
          public_label?: string | null
          short_description?: string | null
          key_benefit?: string | null
          key_differentiator?: string | null
          specifications?: Json
          tradeoff?: string | null
          estimated_price_cents?: number
          currency?: string
          display_order?: number
          image_url?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_products_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_leads: {
        Row: {
          id: string
          campaign_id: string
          contact_id: string
          selected_campaign_product_id: string
          price_shown_cents: number
          currency: string
          purchase_intent: 'yes' | 'maybe' | 'no'
          funnel_status: 'intent_registered' | 'reservation_invited' | 'reserved' | 'group_buy_invited' | 'deposit_paid' | 'order_confirmed' | 'reservation_expired' | 'refunded' | 'not_interested' | 'unsubscribed'
          utm_source: string | null
          utm_medium: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_term: string | null
          referrer: string | null
          landing_variant: string | null
          anonymous_session_id: string | null
          first_touch_source: string | null
          latest_touch_source: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          contact_id: string
          selected_campaign_product_id: string
          price_shown_cents: number
          currency?: string
          purchase_intent: 'yes' | 'maybe' | 'no'
          funnel_status?: 'intent_registered' | 'reservation_invited' | 'reserved' | 'group_buy_invited' | 'deposit_paid' | 'order_confirmed' | 'reservation_expired' | 'refunded' | 'not_interested' | 'unsubscribed'
          utm_source?: string | null
          utm_medium?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_term?: string | null
          referrer?: string | null
          landing_variant?: string | null
          anonymous_session_id?: string | null
          first_touch_source?: string | null
          latest_touch_source?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string
          contact_id?: string
          selected_campaign_product_id?: string
          price_shown_cents?: number
          currency?: string
          purchase_intent?: 'yes' | 'maybe' | 'no'
          funnel_status?: 'intent_registered' | 'reservation_invited' | 'reserved' | 'group_buy_invited' | 'deposit_paid' | 'order_confirmed' | 'reservation_expired' | 'refunded' | 'not_interested' | 'unsubscribed'
          utm_source?: string | null
          utm_medium?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_term?: string | null
          referrer?: string | null
          landing_variant?: string | null
          anonymous_session_id?: string | null
          first_touch_source?: string | null
          latest_touch_source?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_selected_campaign_product_id_fkey"
            columns: ["selected_campaign_product_id"]
            isOneToOne: false
            referencedRelation: "campaign_products"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_events: {
        Row: {
          id: string
          campaign_id: string | null
          contact_id: string | null
          campaign_lead_id: string | null
          campaign_product_id: string | null
          anonymous_session_id: string | null
          event_type: string
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          campaign_id?: string | null
          contact_id?: string | null
          campaign_lead_id?: string | null
          campaign_product_id?: string | null
          anonymous_session_id?: string | null
          event_type: string
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string | null
          contact_id?: string | null
          campaign_lead_id?: string | null
          campaign_product_id?: string | null
          anonymous_session_id?: string | null
          event_type?: string
          metadata?: Json
          created_at?: string
        }
        Relationships: []
      }
      email_campaigns: {
        Row: {
          id: string
          campaign_id: string | null
          template_key: 'intent_confirmation' | 'campaign_update' | 'reservation_invite' | 'group_buy_invite'
          subject: string | null
          status: 'draft' | 'testing' | 'queued' | 'sending' | 'sent' | 'cancelled' | 'failed'
          segment_filters: Json
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          campaign_id?: string | null
          template_key: 'intent_confirmation' | 'campaign_update' | 'reservation_invite' | 'group_buy_invite'
          subject?: string | null
          status?: 'draft' | 'testing' | 'queued' | 'sending' | 'sent' | 'cancelled' | 'failed'
          segment_filters?: Json
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string | null
          template_key?: 'intent_confirmation' | 'campaign_update' | 'reservation_invite' | 'group_buy_invite'
          subject?: string | null
          status?: 'draft' | 'testing' | 'queued' | 'sending' | 'sent' | 'cancelled' | 'failed'
          segment_filters?: Json
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_deliveries: {
        Row: {
          id: string
          contact_id: string | null
          campaign_lead_id: string | null
          email_campaign_id: string | null
          template_key: string
          recipient_email: string
          provider: string | null
          provider_message_id: string | null
          status: 'queued' | 'sending' | 'sent' | 'failed' | 'skipped'
          sent_at: string | null
          attempted_at: string | null
          failed_at: string | null
          error_message: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          contact_id?: string | null
          campaign_lead_id?: string | null
          email_campaign_id?: string | null
          template_key: string
          recipient_email: string
          provider?: string | null
          provider_message_id?: string | null
          status?: 'queued' | 'sending' | 'sent' | 'failed' | 'skipped'
          sent_at?: string | null
          attempted_at?: string | null
          failed_at?: string | null
          error_message?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          contact_id?: string | null
          campaign_lead_id?: string | null
          email_campaign_id?: string | null
          template_key?: string
          recipient_email?: string
          provider?: string | null
          provider_message_id?: string | null
          status?: 'queued' | 'sending' | 'sent' | 'failed' | 'skipped'
          sent_at?: string | null
          attempted_at?: string | null
          failed_at?: string | null
          error_message?: string | null
          metadata?: Json
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      batch_progress_view: {
        Row: {
          batch_id: string
          product_id: string
          status: 'OPEN' | 'CLOSED' | 'DELIVERED'
          target_capacity: number
          deposit_amount: number
          tier_1_price: number
          tier_2_price: number | null
          tier_3_price: number | null
          closes_at: string
          created_at: string
          confirmed_quantity: number
          remaining_capacity: number
        }
        Relationships: []
      }
    }
    Functions: {
      campaign_rate_limit: { Args: { p_key: string; p_limit: number; p_seconds: number }; Returns: boolean }
      register_campaign_intent: { Args: { p: Json }; Returns: Json }
      record_campaign_event: { Args: { p: Json }; Returns: undefined }
      unsubscribe_campaign_contact: { Args: { p_contact_id: string }; Returns: undefined }
      save_campaign_content: { Args: { p: Json }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
