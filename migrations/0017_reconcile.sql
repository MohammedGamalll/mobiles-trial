ALTER TABLE purchase_invoices ADD COLUMN paid REAL NOT NULL DEFAULT 0;
ALTER TABLE purchase_invoices ADD COLUMN remaining REAL NOT NULL DEFAULT 0;
ALTER TABLE purchase_invoices ADD COLUMN payment_method TEXT;
ALTER TABLE sales_invoices ADD COLUMN client_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_client_token ON sales_invoices(client_token) WHERE client_token IS NOT NULL;
