import type { AppDb } from "./db";
import { round2 } from "./helpers";

export async function accrueCommission(db: AppDb, invoiceId: number) {
  const inv = await db
    .prepare(
      `SELECT id, total, status, delivery_agent_id, sales_agent_id, date
       FROM sales_invoices WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(invoiceId)
    .first<{
      id: number;
      total: number;
      status: string;
      delivery_agent_id: number | null;
      sales_agent_id: number | null;
      date: string;
    }>();
  if (!inv) return;
  if (["cancelled", "held", "draft"].includes(inv.status)) return;
  const agentId = inv.sales_agent_id || inv.delivery_agent_id;
  if (!agentId) return;
  const exists = await db
    .prepare("SELECT id FROM sales_commissions WHERE invoice_id = ? AND agent_id = ?")
    .bind(invoiceId, agentId)
    .first();
  if (exists) return;
  const agent = await db
    .prepare("SELECT commission_rate FROM delivery_agents WHERE id = ? AND deleted_at IS NULL")
    .bind(agentId)
    .first<{ commission_rate: number }>();
  const rate = Number(agent?.commission_rate || 0);
  if (rate <= 0) return;
  const amount = round2((Number(inv.total) || 0) * rate / 100);
  const month = String(inv.date || "").slice(0, 7);
  await db
    .prepare(
      `INSERT INTO sales_commissions (agent_id, invoice_id, month, sale_amount, rate, amount, status)
       VALUES (?, ?, ?, ?, ?, ?, 'accrued')`,
    )
    .bind(agentId, invoiceId, month, inv.total, rate, amount)
    .run();
}
