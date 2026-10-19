-- Courier "تم التوصيل" only reports delivery_status. Invoice stays held until admin settles.
UPDATE sales_invoices
SET status = 'held'
WHERE type = 'delivery'
  AND status = 'pending_settlement'
  AND settled_at IS NULL
  AND finance_committed_at IS NULL
  AND deleted_at IS NULL;
