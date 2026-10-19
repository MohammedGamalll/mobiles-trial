-- Held delivery invoices used remaining=0 even when COD is still due.
UPDATE sales_invoices
SET remaining = ROUND(total - COALESCE(paid, 0), 2)
WHERE type = 'delivery'
  AND deleted_at IS NULL
  AND COALESCE(remaining, 0) = 0
  AND COALESCE(paid, 0) < total
  AND status IN (
    'held',
    'pending_settlement',
    'pending_delivery',
    'out_for_delivery',
    'rescheduled',
    'customer_unavailable'
  );
