UPDATE customers
SET current_balance = (
      SELECT COALESCE(SUM(si.remaining), 0)
      FROM sales_invoices si
      WHERE si.customer_id = customers.id
        AND si.deleted_at IS NULL
        AND si.status NOT IN ('cancelled', 'draft', 'held', 'quote', 'order')
    ),
    updated_at = datetime('now')
WHERE ABS(
  current_balance - (
    SELECT COALESCE(SUM(si.remaining), 0)
    FROM sales_invoices si
    WHERE si.customer_id = customers.id
      AND si.deleted_at IS NULL
      AND si.status NOT IN ('cancelled', 'draft', 'held', 'quote', 'order')
  )
) > 0.02;
