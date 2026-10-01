import type { AppDb } from "./db";
import { round2 } from "./helpers";

export type ReconRow = { module: string; expected: number; actual: number; difference: number; status: "PASS" | "FAIL"; note?: string };

function row(module: string, expected: number, actual: number, note?: string): ReconRow {
  const difference = round2(actual - expected);
  return { module, expected: round2(expected), actual: round2(actual), difference, status: Math.abs(difference) < 0.02 ? "PASS" : "FAIL", note };
}

export async function reconcile(db: AppDb): Promise<{ rows: ReconRow[]; journals_unbalanced: number; debits: number; credits: number }> {
  const q = async (sql: string) => Number((await db.prepare(sql).first<{ n: number }>())?.n || 0);

  const stockOnHand = await q("SELECT COALESCE(SUM(current_stock),0) as n FROM products WHERE deleted_at IS NULL AND COALESCE(kind,'product') != 'service'");
  const stockBatches = await q("SELECT COALESCE(SUM(remaining_qty),0) as n FROM inventory_batches");
  const customerStored = await q("SELECT COALESCE(SUM(current_balance),0) as n FROM customers WHERE deleted_at IS NULL");
  const customerFromInvoices = await q(
    `SELECT COALESCE(SUM(remaining),0) as n FROM sales_invoices WHERE deleted_at IS NULL AND customer_id IS NOT NULL AND status NOT IN ('cancelled','draft','held','quote','order')`,
  );
  const supplierStored = await q("SELECT COALESCE(SUM(balance),0) as n FROM suppliers WHERE deleted_at IS NULL");
  const supplierFromPurchases = await q(
    `SELECT COALESCE(SUM(remaining),0) as n FROM purchase_invoices WHERE deleted_at IS NULL AND status = 'approved' AND supplier_id IS NOT NULL`,
  );
  const cashStored = await q("SELECT COALESCE(SUM(current_balance),0) as n FROM cash_accounts WHERE active = 1");
  const cashFromJournals = await q(
    `SELECT COALESCE(SUM(CASE WHEN l.debit > 0 THEN l.debit ELSE -l.credit END),0) as n
     FROM journal_lines l JOIN journal_entries j ON j.id = l.entry_id AND j.status = 'posted'
     JOIN cash_accounts c ON c.account_id = l.account_id AND c.active = 1`,
  );
  const debits = await q("SELECT COALESCE(SUM(l.debit),0) as n FROM journal_lines l JOIN journal_entries j ON j.id = l.entry_id AND j.status = 'posted'");
  const credits = await q("SELECT COALESCE(SUM(l.credit),0) as n FROM journal_lines l JOIN journal_entries j ON j.id = l.entry_id AND j.status = 'posted'");
  const unbalanced = await q(
    `SELECT COUNT(*) as n FROM (
       SELECT j.id FROM journal_entries j JOIN journal_lines l ON l.entry_id = j.id
       WHERE j.status = 'posted' GROUP BY j.id HAVING ABS(SUM(l.debit) - SUM(l.credit)) > 0.02
     )`,
  );
  const invoiceGap = await q(
    `SELECT COUNT(*) as n FROM sales_invoices
     WHERE deleted_at IS NULL AND status NOT IN ('cancelled','draft','held','quote','order')
       AND ABS((paid + remaining) - total) > 0.02`,
  );
  const orphanItems = await q("SELECT COUNT(*) as n FROM sales_invoice_items i LEFT JOIN sales_invoices s ON s.id = i.invoice_id WHERE s.id IS NULL");
  const orphanMoves = await q("SELECT COUNT(*) as n FROM stock_movements m LEFT JOIN products p ON p.id = m.product_id WHERE p.id IS NULL");

  const rows: ReconRow[] = [
    row("Stock on hand vs batches", stockBatches, stockOnHand, "products.current_stock vs SUM(batch.remaining_qty)"),
    row("Customer receivables vs open invoices", customerFromInvoices, customerStored, "SUM(invoice.remaining) for named customers"),
    row("Supplier payables vs open purchases", supplierFromPurchases, supplierStored, "approved purchase remaining; historical balances may predate posting"),
    row("Treasury vs posted journals", cashFromJournals, cashStored, "cash_accounts.current_balance vs journal lines on cash/bank accounts"),
    row("Journal debits", credits, debits, "posted journal debits must equal credits"),
    row("Unbalanced journals", 0, unbalanced),
    row("Invoices paid+remaining=total", 0, invoiceGap),
    row("Orphan invoice items", 0, orphanItems),
    row("Orphan stock movements", 0, orphanMoves),
  ];
  return { rows, journals_unbalanced: unbalanced, debits, credits };
}
