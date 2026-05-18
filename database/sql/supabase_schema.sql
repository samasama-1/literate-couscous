-- Run this entire script in your Supabase SQL Editor

-- 1. Create the products table
CREATE TABLE products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  retail_price NUMERIC,
  image_url TEXT,
  features JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Create the batches table
CREATE TABLE batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'DELIVERED')),
  target_capacity INTEGER NOT NULL,
  current_deposits INTEGER DEFAULT 0 NOT NULL,
  deposit_amount NUMERIC NOT NULL,
  tier_1_price NUMERIC NOT NULL,
  tier_2_price NUMERIC,
  tier_3_price NUMERIC,
  closes_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. Create the orders table
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  quantity INTEGER DEFAULT 1 NOT NULL,
  payment_status TEXT DEFAULT 'PENDING_PAYNOW' CHECK (payment_status IN ('PENDING_PAYNOW', 'VERIFIED', 'REFUNDED')),
  payment_reference TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Insert dummy data for testing the UI (idempotent)
INSERT INTO products (name, description, retail_price, features)
SELECT 
  'Smart Floor Washer Pro', 
  'Self-cleaning, dual-tank system. Vetted top-tier factory. Singapore plug and warranty.', 
  399.00,
  '["Self-cleaning brush roll", "Dual water tanks", "Cordless 45min battery", "Local 1-Year Warranty"]'
WHERE NOT EXISTS (
  SELECT 1 FROM products WHERE name = 'Smart Floor Washer Pro'
);

-- We need the product ID to insert the batch. This is just for demonstration.
-- In reality, you will run the above, copy the product ID, and insert it below:

/*
INSERT INTO batches (product_id, target_capacity, deposit_amount, tier_1_price, tier_2_price, tier_3_price, closes_at)
VALUES (
  '<paste-product-id-here>', 
  300, 
  50.00, 
  299.00, 
  279.00, 
  249.00, 
  now() + interval '14 days'
);
*/
