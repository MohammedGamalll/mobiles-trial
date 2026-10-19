import { Hono } from "hono";
import { audit, round2, todayIso, type AppBindings, type AppVars } from "../lib/helpers";
import { requirePerm } from "../lib/auth";
import { postPartnerDepositJournal, postPartnerDrawJournal, postProfitWithdrawJournal } from "../lib/ledger";
import { journalDayExpr, listParams } from "../lib/filters";
import { loadTrialBalance } from "../lib/trial-balance";
import { assertCanWithdraw, assertEquityCap, availableToWithdraw, companyValuationFromTrial, ownerProfitShare, partnerLiveShares, remainingShare, withdrawCap } from "../lib/partners";
import { profitBreakdownFromTrial } from "../lib/profit-breakdown";

export const partnerRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

export type ProfitDrawRow = {
  id: number;
  date: string;
  source: string;
  amount: number;
  partner_name: string | null;
  note: string;
  user_name: string;
};

function drawNote(source: string, txNote?: string | null, description?: string | null) {
  const tx = String(txNote || "").trim();
  if (tx) return tx;
  const desc = String(description || "").trim();
  if (source === "profit_withdraw" && desc && desc !== "سحب أرباح") return desc;
  return "";
}

async function listPeriodDraws(db: AppBindings["DB"], from: string, to: string): Promise<ProfitDrawRow[]> {
  const day = journalDayExpr("j.date");
  const { results } = await db
    .prepare(
      `SELECT j.id, j.date, j.source, j.description,
              COALESCE(SUM(l.debit), 0) as amount,
              p.name as partner_name,
              t.note as tx_note,
              u.full_name as user_name
       FROM journal_entries j
       JOIN journal_lines l ON l.entry_id = j.id
       JOIN ledger_accounts a ON a.id = l.account_id AND a.code = '3100'
       LEFT JOIN partner_transactions t ON t.journal_id = j.id
       LEFT JOIN partners p ON p.id = t.partner_id
       LEFT JOIN users u ON u.id = j.created_by
       WHERE j.status = 'posted'
         AND j.source IN ('partner_draw', 'profit_withdraw')
         AND ${day} >= ? AND ${day} <= ?
       GROUP BY j.id, j.date, j.source, j.description, p.name, t.note, u.full_name
       ORDER BY j.date DESC, j.id DESC`,
    )
    .bind(from, to)
    .all<{
      id: number;
      date: string;
      source: string;
      description: string | null;
      amount: number;
      partner_name: string | null;
      tx_note: string | null;
      user_name: string | null;
    }>();
  return (results || []).map((r) => ({
    id: Number(r.id),
    date: String(r.date || "").slice(0, 10),
    source: String(r.source || ""),
    amount: round2(Number(r.amount) || 0),
    partner_name: r.partner_name || null,
    note: drawNote(String(r.source || ""), r.tx_note, r.description),
    user_name: String(r.user_name || ""),
  }));
}

async function periodDrawTotals(db: AppBindings["DB"], from: string, to: string) {
  const day = journalDayExpr("j.date");
  const [partners, owner] = await Promise.all([
    db
      .prepare(
        `SELECT partner_id, COALESCE(SUM(amount), 0) as n
         FROM partner_transactions
         WHERE type = 'withdrawal' AND date >= ? AND date <= ?
         GROUP BY partner_id`,
      )
      .bind(from, to)
      .all<{ partner_id: number; n: number }>(),
    db
      .prepare(
        `SELECT COALESCE(SUM(l.debit), 0) as n
         FROM journal_lines l
         JOIN journal_entries j ON j.id = l.entry_id AND j.status = 'posted'
         JOIN ledger_accounts a ON a.id = l.account_id AND a.code = '3100'
         WHERE j.source = 'profit_withdraw'
           AND ${day} >= ? AND ${day} <= ?`,
      )
      .bind(from, to)
      .first<{ n: number }>(),
  ]);
  const byPartner = new Map<number, number>();
  for (const row of partners.results || []) {
    byPartner.set(Number(row.partner_id), round2(Number(row.n) || 0));
  }
  return { byPartner, owner: round2(Number(owner?.n || 0)) };
}

async function periodEquityDraws(db: AppBindings["DB"], from: string, to: string) {
  const day = journalDayExpr("j.date");
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(l.debit), 0) as n
       FROM journal_lines l
       JOIN journal_entries j ON j.id = l.entry_id AND j.status = 'posted'
       JOIN ledger_accounts a ON a.id = l.account_id AND a.code = '3100'
       WHERE j.source IN ('partner_draw', 'profit_withdraw')
         AND ${day} >= ? AND ${day} <= ?`,
    )
    .bind(from, to)
    .first<{ n: number }>();
  return round2(Number(row?.n || 0));
}

async function loadDashboard(db: AppBindings["DB"], url: URL) {
  const trial = await loadTrialBalance(db, listParams(url));
  const valuation = companyValuationFromTrial(trial.data);
  const [period_draws, draws] = await Promise.all([
    periodEquityDraws(db, trial.from, trial.to),
    listPeriodDraws(db, trial.from, trial.to),
  ]);
  return {
    ...valuation,
    period_draws,
    available_profit: availableToWithdraw(valuation.net_profit, period_draws),
    profit_breakdown: profitBreakdownFromTrial(trial.data),
    draws,
    from: trial.from,
    to: trial.to,
  };
}

partnerRoutes.get("/dashboard", requirePerm("partners.view"), async (c) => {
  const view = await loadPartnersView(c.env.DB, new URL(c.req.url));
  return c.json(view.dashboard);
});

async function loadPartnersView(db: AppBindings["DB"], url: URL) {
  const dash = await loadDashboard(db, url);
  const [{ results }, totals] = await Promise.all([
    db
      .prepare(
        `SELECT p.id, p.name, p.equity_percentage, p.starting_balance, p.active, p.created_at
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
      }>(),
    periodDrawTotals(db, dash.from, dash.to),
  ]);
  const allocated_percent = round2((results || []).reduce((s, p) => s + (Number(p.equity_percentage) || 0), 0));
  const owner_share = ownerProfitShare(dash.net_profit, allocated_percent);
  const owner_available = withdrawCap(remainingShare(owner_share, totals.owner), dash.available_profit);
  const data = (results || []).map((p) => {
    const withdrawn = totals.byPartner.get(Number(p.id)) || 0;
    const shares = partnerLiveShares({
      percent: Number(p.equity_percentage) || 0,
      netProfit: dash.net_profit,
      netEquity: dash.net_equity,
      withdrawals: withdrawn,
    });
    return {
      ...p,
      equity_percentage: Number(p.equity_percentage) || 0,
      starting_balance: Number(p.starting_balance) || 0,
      total_withdrawals: withdrawn,
      available: withdrawCap(shares.net_due, dash.available_profit),
      ...shares,
    };
  });
  return {
    data,
    dashboard: {
      ...dash,
      allocated_percent,
      owner_share,
      owner_withdrawn: totals.owner,
      owner_available: round2(Math.max(0, owner_available)),
    },
  };
}

partnerRoutes.get("/", requirePerm("partners.view"), async (c) => {
  return c.json(await loadPartnersView(c.env.DB, new URL(c.req.url)));
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

partnerRoutes.post("/profit-withdraw", requirePerm("partners.manage"), async (c) => {
  const url = new URL(c.req.url);
  const b = await c.req.json<{ amount?: number; cash_account_id?: number; partner_id?: number; note?: string; date?: string }>();
  const amount = round2(Number(b.amount) || 0);
  const cashAccountId = Number(b.cash_account_id || 0);
  const partnerId = Number(b.partner_id || 0) || null;
  const date = String(b.date || todayIso()).slice(0, 10);
  if (!(amount > 0) || !cashAccountId) return c.json({ error: "missing_fields" }, 400);
  const view = await loadPartnersView(c.env.DB, url);
  const dash = view.dashboard;
  const partnerRow = partnerId ? view.data.find((p) => Number(p.id) === partnerId) : null;
  if (partnerId && !partnerRow) return c.json({ error: "not_found" }, 404);
  const cap = partnerRow ? Number(partnerRow.available) : Number(dash.owner_available);
  try {
    assertCanWithdraw(amount, cap);
  } catch (e) {
    const code = (e as Error).message;
    if (code === "exceeds_available" || code === "missing_fields") return c.json({ error: code, available: cap }, 400);
    throw e;
  }
  const partnerName = partnerRow?.name || "المالك";
  try {
    const txId = await c.env.DB.transaction(async (tx) => {
      const cash = await tx
        .prepare("SELECT id FROM cash_accounts WHERE id = ? AND active = 1")
        .bind(cashAccountId)
        .first<{ id: number }>();
      if (!cash) throw new Error("missing_fields");
      if (partnerId) {
        const ins = await tx
          .prepare(
            "INSERT INTO partner_transactions (partner_id, type, amount, cash_account_id, date, note, created_by) VALUES (?, 'withdrawal', ?, ?, ?, ?, ?)",
          )
          .bind(partnerId, amount, cashAccountId, date, b.note || null, c.get("user").id)
          .run();
        const rowId = ins.meta.last_row_id;
        const journalId = await postPartnerDrawJournal(tx, {
          txId: rowId,
          partnerName,
          amount,
          date,
          cashAccountId,
          userId: c.get("user").id,
        });
        if (journalId) {
          await tx.prepare("UPDATE partner_transactions SET journal_id = ? WHERE id = ?").bind(journalId, rowId).run();
        }
        return rowId;
      }
      const sourceId = Number(String(Date.now()).slice(-9));
      await postProfitWithdrawJournal(tx, {
        txId: sourceId,
        amount,
        date,
        cashAccountId,
        description: b.note || `سحب أرباح`,
        userId: c.get("user").id,
      });
      return sourceId;
    });
    await audit(c.env.DB, c.get("user"), "profit_withdraw", "partner", partnerId, `${amount}`);
    return c.json({ id: txId, available: round2(dash.available_profit - amount) }, 201);
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
  const view = await loadPartnersView(c.env.DB, new URL(c.req.url));
  const partner = view.data.find((p) => Number(p.id) === id);
  if (!partner) return c.json({ error: "not_found" }, 404);
  const cap = Number(partner.available);
  try {
    assertCanWithdraw(amount, cap);
  } catch (e) {
    const code = (e as Error).message;
    if (code === "exceeds_available" || code === "missing_fields") return c.json({ error: code, available: cap }, 400);
    throw e;
  }
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
