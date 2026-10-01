UPDATE payments
SET voided_at = datetime('now')
WHERE notes = 'delivery collection'
  AND voided_at IS NULL
  AND id NOT IN (
    SELECT min_id FROM (
      SELECT MIN(id) AS min_id FROM payments
      WHERE notes = 'delivery collection' AND voided_at IS NULL
      GROUP BY invoice_id
    ) AS keep_first
  );

UPDATE sales_invoices
SET paid = (
      SELECT COALESCE(SUM(amount), 0) FROM payments p
      WHERE p.invoice_id = sales_invoices.id AND p.voided_at IS NULL
    ),
    remaining = GREATEST(0, total - (
      SELECT COALESCE(SUM(amount), 0) FROM payments p
      WHERE p.invoice_id = sales_invoices.id AND p.voided_at IS NULL
    ))
WHERE id IN (
  SELECT invoice_id FROM payments WHERE notes = 'delivery collection'
);
