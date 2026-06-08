-- Idempotent migration for friendly order codes and pending-order deduplication.
-- Safe to rerun: preserves existing order_code values and only backfills null rows.

-- 1. Add the column if it does not exist yet. Keep it nullable until backfill finishes.
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS order_code VARCHAR(12);

-- 2. Backfill only rows missing an order_code (format: SAMA-XXXXXX).
UPDATE orders
SET order_code = 'SAMA-' || UPPER(SUBSTRING(MD5(id::text) FROM 1 FOR 6))
WHERE order_code IS NULL;

-- 3. Make order_code required once every row has a value.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'order_code'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE orders ALTER COLUMN order_code SET NOT NULL;
  END IF;
END $$;

-- 4. Add a unique constraint for friendly order codes if it does not exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'unique_order_code'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT unique_order_code UNIQUE (order_code);
  END IF;
END $$;

-- 5. Add the partial unique index for deduplication if it does not exist.
-- This prevents the same phone number from having multiple PENDING_PAYNOW orders in the same batch.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_order
ON orders (batch_id, lower(trim(customer_phone)))
WHERE payment_status = 'PENDING_PAYNOW';
