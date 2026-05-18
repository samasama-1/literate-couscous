-- 1. Enable Row Level Security on all tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- 2. Public Read Policies
-- Anyone visiting the website can READ products and batches
DROP POLICY IF EXISTS "Allow public read access on products" ON products;
CREATE POLICY "Allow public read access on products" 
  ON products FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read access on batches" ON batches;
CREATE POLICY "Allow public read access on batches" 
  ON batches FOR SELECT USING (true);

-- 3. Anonymous Insert Policies
-- Anyone visiting the website can INSERT a new order (join the group buy)
DROP POLICY IF EXISTS "Allow public insert on orders" ON orders;
CREATE POLICY "Allow public insert on orders" 
  ON orders FOR INSERT WITH CHECK (true);

-- 4. Protect Customer Data
-- Customers CANNOT read the orders table (prevents leaking names/phone numbers)
-- There is NO SELECT policy for public on orders.

-- 5. Admin Actions (Protected by Service Role Key)
-- Your Next.js backend will use the Supabase Service Role Key for admin actions.
-- The Service Role Key bypasses all RLS policies automatically.
-- Therefore, you can manually verify PayNow deposits from a secure admin route,
-- and regular users cannot modify any payment statuses.
