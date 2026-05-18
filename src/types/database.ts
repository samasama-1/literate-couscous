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
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
