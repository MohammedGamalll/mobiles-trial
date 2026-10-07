import { Hono } from "hono";
import { audit, round2, todayIso, type AppBindings, type AppVars } from "../lib/helpers";
import { requirePerm } from "../lib/auth";
import { postPartnerDepositJournal, postPartnerDrawJournal } from "../lib/ledger";
import { assertEquityCap, companyValuation, partnerLiveShares } from "../lib/partners";

export const partnerRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

const VALUATION_CODES = ["1100", "1110", "1200", "1300", "2100", "4100", "4200", "5100", "5200", "5300", "5400"];

type CodeBal = { code: string; n: number };

async function loadBalances(db: AppBindings["DB"]) {
  const { results } = await db
    .prepare(
      `SELECT a.code, COALESCE(SUM(CASE WHEN j.status = 'posted' THEN l.debit - l.credit ELSE 0 END), 0) as n
       FROM ledger_accounts a
       LEFT JOIN journal_lines l ON l.account_id = a.id
       LEFT JOIN journal_entries j ON j.id = l.entry_id
       WHERE a.code IN (${VALUATION_CODES.map(() => "?").join(",")})
       GROUP BY a.code`,
    )
    .bind(...VALUATION_CODES)
    .all<CodeBal>();
  const map: Record<string, number> = {};
  for (const row of results || []) map[String(row.code)] = Number(row.n) || 0;
  return companyValuation(map);
}

partnerRoutes.get("/dashboard", requirePerm("partners.view"), async (c) => {
  const dash = await loadBalances(c.env.DB);
  return c.json(dash);
});

partnerRoutes.get("/", requirePerm("partners.view"), async (c) => {
  const dash = await loadBalances(c.env.DB);
  const { results } = await c.env.DB
    .prepare(
      `SELECT p.id, p.name, p.equity_percentage, p.starting_balance, p.active, p.created_at,
              COALESCE((SELECT SUM(t.amount) FROM partner_transactions t WHERE t.partner_id = p.id AND t.type = 'withdrawal'), 0) as total_withdrawals
       FROM partners p
       WHERE p.active = 1
       ORDER BY p.id`,
    )
    .all<{
      id: number;
      name: string;
      equity_percentage: number;
      starting_balance: number;
      active: number;
      created_at: string;
      total_withdrawals: number;
    }>();
  const data = (results || []).map((p) => {
    const shares = partnerLiveShares({
      percent: Number(p.equity_percentage) || 0,
      netProfit: dash.net_profit,
      netEquity: dash.net_equity,
      withdrawals: Number(p.total_withdrawals) || 0,
    });
    return {
      ...p,
      equity_percentage: Number(p.equity_percentage) || 0,
      starting_balance: Number(p.starting_balance) || 0,
      total_withdrawals: round2(Number(p.total_withdrawals) || 0),
      ...shares,
    };
  });
  return c.json({ data, dashboard: dash });
});

partnerRoutes.post("/", requirePerm("partners.manage"), async (c) => {
  const b = await c.req.json<{
    name?: string;
    equity_percentage?: number;
    starting_balance?: number;
    cash_account_id?: number;
  }>();
  const name = String(b.name || "").trim();
  const percent = round2(Number(b.equity_percentage) || 0);
  const starting = round2(Number(b.starting_balance) || 0);
  const cashAccountId = Number(b.cash_account_id || 0);
  if (!name) return c.json({ error: "missing_fields" }, 400);
  if (starting > 0 && !cashAccountId) return c.json({ error: "missing_fields" }, 400);
  const existing = await c.env.DB
    .prepare("SELECT equity_percentage FROM partners WHERE active = 1")
    .all<{ equity_percentage: number }>();
  try {
    assertEquityCap((existing.results || []).map((r) => Number(r.equity_percentage) || 0), percent);
  } catch (e) {
    const code = (e as Error).message;
    if (code === "equity_cap" || code === "invalid_percent") return c.json({ error: code }, 400);
    throw e;
  }
  try {
    const created = await c.env.DB.transaction(async (tx) => {
      const ins = await tx
        .prepare("INSERT INTO partners (name, equity_percentage, starting_balance, active) VALUES (?, ?, ?, 1)")
        .bind(name, percent, starting)
        .run();
      const id = ins.meta.last_row_id;
      if (starting > 0) {
        const cash = await tx
          .prepare("SELECT id FROM cash_accounts WHERE id = ? AND active = 1")
          .bind(cashAccountId)
          .first<{ id: number }>();
        if (!cash) throw new Error("missing_fields");
        const txIns = await tx
          .prepare(
            "INSERT INTO partner_transactions (partner_id, type, amount, cash_account_id, date, note, created_by) VALUES (?, 'deposit', ?, ?, ?, ?, ?)",
          )
          .bind(id, starting, cashAccountId, todayIso(), "حصة رأسمال", c.get("user").id)
          .run();
        const journalId = await postPartnerDepositJournal(tx, {
          txId: txIns.meta.last_row_id,
          partnerName: name,
          amount: starting,
          date: todayIso(),
          cashAccountId,
          userId: c.get("user").id,
        });
        if (journalId) {
          await tx.prepare("UPDATE partner_transactions SET journal_id = ? WHERE id = ?").bind(journalId, txIns.meta.last_row_id).run();
        }
      }
      return id;
    });
    await audit(c.env.DB, c.get("user"), "partner_create", "partner", created, `${name} ${percent}%`);
    return c.json({ id: created }, 201);
  } catch (e) {
    const msg = (e as Error).message || "";
    if (msg === "ledger" || msg === "unbalanced_journal") return c.json({ error: "ledger" }, 400);
    if (msg === "missing_fields") return c.json({ error: "missing_fields" }, 400);
    throw e;
  }
});

partnerRoutes.post("/:id/withdraw", requirePerm("partners.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ amount?: number; cash_account_id?: number; date?: string; note?: string }>();
  const amount = round2(Number(b.amount) || 0);
  const cashAccountId = Number(b.cash_account_id || 0);
  const date = String(b.date || todayIso()).slice(0, 10);
  if (!(id > 0) || !(amount > 0) || !cashAccountId) return c.json({ error: "missing_fields" }, 400);
  const partner = await c.env.DB.prepare("SELECT id, name FROM partners WHERE id = ? AND active = 1").bind(id).first<{ id: number; name: string }>();
  if (!partner) return c.json({ error: "not_found" }, 404);
  try {
    const txId = await c.env.DB.transaction(async (tx) => {
      const cash = await tx
        .prepare("SELECT id FROM cash_accounts WHERE id = ? AND active = 1")
        .bind(cashAccountId)
        .first<{ id: number }>();
      if (!cash) throw new Error("missing_fields");
      const ins = await tx
        .prepare(
          "INSERT INTO partner_transactions (partner_id, type, amount, cash_account_id, date, note, created_by) VALUES (?, 'withdrawal', ?, ?, ?, ?, ?)",
        )
        .bind(id, amount, cashAccountId, date, b.note || null, c.get("user").id)
        .run();
      const rowId = ins.meta.last_row_id;
      const journalId = await postPartnerDrawJournal(tx, {
        txId: rowId,
        partnerName: partner.name,
        amount,
        date,
        cashAccountId,
        userId: c.get("user").id,
      });
      if (journalId) {
        await tx.prepare("UPDATE partner_transactions SET journal_id = ? WHERE id = ?").bind(journalId, rowId).run();
      }
      return rowId;
    });
    await audit(c.env.DB, c.get("user"), "partner_draw", "partner", id, `${amount}`);
    return c.json({ id: txId }, 201);
  } catch (e) {
    const msg = (e as Error).message || "";
    if (msg === "ledger" || msg === "unbalanced_journal") return c.json({ error: "ledger" }, 400);
    if (msg === "missing_fields") return c.json({ error: "missing_fields" }, 400);
    throw e;
  }
});

partnerRoutes.put("/:id", requirePerm("partners.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ name?: string; equity_percentage?: number }>();
  const name = String(b.name || "").trim();
  const percent = round2(Number(b.equity_percentage) || 0);
  if (!(id > 0) || !name) return c.json({ error: "missing_fields" }, 400);
  const partner = await c.env.DB.prepare("SELECT id FROM partners WHERE id = ? AND active = 1").bind(id).first<{ id: number }>();
  if (!partner) return c.json({ error: "not_found" }, 404);
  const existing = await c.env.DB
    .prepare("SELECT equity_percentage FROM partners WHERE active = 1 AND id != ?")
    .bind(id)
    .all<{ equity_percentage: number }>();
  try {
    assertEquityCap((existing.results || []).map((r) => Number(r.equity_percentage) || 0), percent);
  } catch (e) {
    const code = (e as Error).message;
    if (code === "equity_cap" || code === "invalid_percent") return c.json({ error: code }, 400);
    throw e;
  }
  await c.env.DB.prepare("UPDATE partners SET name = ?, equity_percentage = ? WHERE id = ?").bind(name, percent, id).run();
  await audit(c.env.DB, c.get("user"), "partner_update", "partner", id, `${name} ${percent}%`);
  return c.json({ ok: true });
});

partnerRoutes.delete("/:id", requirePerm("partners.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!(id > 0)) return c.json({ error: "missing_fields" }, 400);
  const partner = await c.env.DB.prepare("SELECT id, name FROM partners WHERE id = ? AND active = 1").bind(id).first<{ id: number; name: string }>();
  if (!partner) return c.json({ error: "not_found" }, 404);
  await c.env.DB.prepare("UPDATE partners SET active = 0 WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "partner_delete", "partner", id, partner.name);
  return c.json({ ok: true });
});
