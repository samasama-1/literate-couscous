-- 1. Add the column (allowing null temporarily to apply it)
ALTER TABLE orders ADD COLUMN order_code VARCHAR(12);

-- 2. Generate random codes for existing orders (format: SAMA-XXXXXX)
UPDATE orders 
SET order_code = 'SAMA-' || SUBSTRING(MD5(id::text) FROM 1 FOR 6)
WHERE order_code IS NULL;

-- 3. Make the column required and unique
ALTER TABLE orders ALTER COLUMN order_code SET NOT NULL;
ALTER TABLE orders ADD CONSTRAINT unique_order_code UNIQUE (order_code);

-- 4. Add the Partial Unique Index for deduplication
-- This prevents the same phone number from having multiple PENDING_PAYNOW orders in the same batch
CREATE UNIQUE INDEX idx_unique_pending_order 
ON orders (batch_id, lower(trim(customer_phone))) 
WHERE payment_status = 'PENDING_PAYNOW';
