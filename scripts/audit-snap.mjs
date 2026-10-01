import Database from "better-sqlite3";
const db = new Database("data/audit-test.sqlite");
const stock = db.prepare("SELECT (SELECT COALESCE(SUM(current_stock),0) FROM products WHERE deleted_at IS NULL AND COALESCE(kind,'product') != 'service') AS on_hand, (SELECT COALESCE(SUM(remaining_qty),0) FROM inventory_batches) AS batches").get();
const sup = db.prepare("SELECT (SELECT COALESCE(SUM(balance),0) FROM suppliers WHERE deleted_at IS NULL) AS stored, (SELECT COALESCE(SUM(remaining),0) FROM purchase_invoices WHERE deleted_at IS NULL AND status='approved') AS open_purchases").get();
const cust = db.prepare("SELECT (SELECT COALESCE(SUM(current_balance),0) FROM customers WHERE deleted_at IS NULL) AS stored, (SELECT COALESCE(SUM(remaining),0) FROM sales_invoices WHERE deleted_at IS NULL AND status NOT IN ('cancelled','draft','held','quote','order')) AS open_invoices").get();
const books = db.prepare("SELECT COALESCE(SUM(l.debit),0) AS debit, COALESCE(SUM(l.credit),0) AS credit FROM journal_lines l JOIN journal_entries j ON j.id=l.entry_id AND j.status='posted'").get();
const cash = db.prepare("SELECT COALESCE(SUM(current_balance),0) AS stored FROM cash_accounts WHERE active=1").get();
const gaps = db.prepare(`
  SELECT c.id, c.name, c.current_balance AS stored,
    (SELECT COALESCE(SUM(remaining),0) FROM sales_invoices si
      WHERE si.customer_id=c.id AND si.deleted_at IS NULL
        AND si.status NOT IN ('cancelled','draft','held','quote','order')) AS open_rem
  FROM customers c WHERE c.deleted_at IS NULL
`).all().filter((r) => Math.abs(r.stored - r.open_rem) > 0.02);
const named = db.prepare(`
  SELECT COALESCE(SUM(remaining),0) AS n FROM sales_invoices
  WHERE deleted_at IS NULL AND customer_id IS NOT NULL
    AND status NOT IN ('cancelled','draft','held','quote','order')
`).get();
const anon = db.prepare(`
  SELECT COALESCE(SUM(remaining),0) AS n FROM sales_invoices
  WHERE deleted_at IS NULL AND customer_id IS NULL
    AND status NOT IN ('cancelled','draft','held','quote','order')
`).get();
console.log(JSON.stringify({ gaps, named, anon, stock, sup, cust, books, cash }, null, 2));
db.close();
