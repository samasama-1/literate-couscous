-- Fix for Issue #8 using a View
-- Run this in your Supabase SQL Editor

-- 1. Create the view
-- By default in Postgres, views run with the privileges of their creator (Security Definer).
-- This means the view can securely read the `orders` table to sum quantities, 
-- even though the public cannot read the `orders` table directly.
CREATE OR REPLACE VIEW batch_progress_view AS
SELECT 
  b.id AS batch_id,
  b.product_id,
  b.status,
  b.target_capacity,
  b.deposit_amount,
  b.tier_1_price,
  b.tier_2_price,
  b.tier_3_price,
  b.closes_at,
  b.created_at,
  COALESCE(SUM(o.quantity), 0)::INTEGER AS confirmed_quantity,
  GREATEST(0, b.target_capacity - COALESCE(SUM(o.quantity), 0))::INTEGER AS remaining_capacity
FROM batches b
LEFT JOIN orders o 
  ON b.id = o.batch_id 
  AND o.payment_status = 'VERIFIED'
GROUP BY b.id;

-- 2. Grant read access to the public and authenticated users
GRANT SELECT ON batch_progress_view TO anon, authenticated, service_role;
