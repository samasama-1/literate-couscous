-- Security and Constraints Update for Orders Table
-- Run this in your Supabase SQL Editor

-- 1. Ensure RLS is enabled (just to be safe)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- 2. Drop the previous, overly permissive insert policy
DROP POLICY IF EXISTS "Allow public insert on orders" ON orders;

-- 3. Create the secure insert policy
-- This prevents malicious users from injecting an order with payment_status = 'VERIFIED'
CREATE POLICY "Allow public insert on orders" 
  ON orders FOR INSERT 
  WITH CHECK (payment_status = 'PENDING_PAYNOW');

-- 4. Add Database Constraints for Quantity
-- This enforces that quantity must be between 1 and 10 at the database level
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_quantity_range'
  ) THEN
    ALTER TABLE orders 
      ADD CONSTRAINT check_quantity_range 
      CHECK (quantity > 0 AND quantity <= 10);
  END IF;
END $$;

-- 5. Reinforce default values (this was already in your schema, but it's good to be explicit)
ALTER TABLE orders 
  ALTER COLUMN payment_status SET DEFAULT 'PENDING_PAYNOW';

-- 6. Explicit note on Read/Update/Delete access:
-- By NOT creating any SELECT, UPDATE, or DELETE policies on the 'orders' table,
-- PostgreSQL default-denies all access.
-- - Public users CANNOT read orders (protecting customer info).
-- - Public users CANNOT update orders.
-- - Public users CANNOT delete orders.
-- Only your Next.js backend (using the Service Role key) can perform these actions.
