import { Hono } from "hono";
import { requirePerm } from "../lib/auth";
import { audit, paginate, type AppBindings, type AppVars } from "../lib/helpers";
import {
  closePosShift,
  drawerJournalBalance,
  findOpenShiftByUser,
  isShiftErr,
  liveShiftTotals,
  loadShift,
  openPosShift,
  shiftReport,
} from "../lib/pos-shifts";

export const shiftRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

function shiftFail(c: { json: (body: unknown, status: number) => Response }, err: unknown) {
  const code = err instanceof Error ? err.message : "error";
  if (code === "shift_required") return c.json({ error: code }, 403);
  if (code === "forbidden") return c.json({ error: code }, 403);
  if (code === "not_found") return c.json({ error: code }, 404);
  if (["shift_open", "drawer_busy", "shift_closed", "cash_missing", "invalid_amount"].includes(code)) {
    return c.json({ error: code }, 400);
  }
  throw err;
}

shiftRoutes.get("/current", requirePerm("sales.create", "sales.view", "reports.view"), async (c) => {
  const shift = await findOpenShiftByUser(c.env.DB, c.get("user").id);
  if (!shift) return c.json({ shift: null });
  const live = await liveShiftTotals(c.env.DB, shift);
  return c.json({
    shift: { ...shift, cash_in: live.cashIn, cash_out: live.cashOut, expected_cash_balance: live.expected },
  });
});

shiftRoutes.get("/opening", requirePerm("sales.create", "sales.view"), async (c) => {
  const id = Number(new URL(c.req.url).searchParams.get("cash_account_id") || 0);
  if (!id) return c.json({ error: "cash_missing" }, 400);
  const opening = await drawerJournalBalance(c.env.DB, id);
  return c.json({ cash_account_id: id, opening_cash_balance: opening });
});

shiftRoutes.get("/", requirePerm("sales.view", "reports.view", "sales.create"), async (c) => {
  const url = new URL(c.req.url);
  const { page, pageSize, offset } = paginate(url);
  const status = String(url.searchParams.get("status") || "").trim();
  const userId = Number(url.searchParams.get("user_id") || 0);
  const where = ["1=1"];
  const binds: (string | number)[] = [];
  if (status === "open" || status === "closed") {
    where.push("s.status = ?");
    binds.push(status);
  }
  if (userId) {
    where.push("s.user_id = ?");
    binds.push(userId);
  }
  const count = await c.env.DB
    .prepare(`SELECT COUNT(*) as n FROM pos_shifts s WHERE ${where.join(" AND ")}`)
    .bind(...binds)
    .first<{ n: number }>();
  const { results } = await c.env.DB
    .prepare(
      `SELECT s.*, c.name as drawer_name, c.name_en as drawer_name_en, u.full_name as user_name
       FROM pos_shifts s
       JOIN cash_accounts c ON c.id = s.cash_account_id
       JOIN users u ON u.id = s.user_id
       WHERE ${where.join(" AND ")}
       ORDER BY s.id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...binds, pageSize, offset)
    .all();
  return c.json({ data: results, total: count?.n || 0, page, pageSize });
});

shiftRoutes.get("/:id", requirePerm("sales.view", "reports.view", "sales.create"), async (c) => {
  const id = Number(c.req.param("id"));
  const report = await shiftReport(c.env.DB, id);
  if (!report) return c.json({ error: "not_found" }, 404);
  return c.json(report);
});

shiftRoutes.post("/open", requirePerm("sales.create"), async (c) => {
  const b = await c.req.json<{ cash_account_id?: number }>().catch(() => ({} as { cash_account_id?: number }));
  const cashAccountId = Number(b.cash_account_id || 0);
  if (!cashAccountId) return c.json({ error: "cash_missing" }, 400);
  try {
    const shift = await openPosShift(c.env.DB, c.get("user"), cashAccountId);
    await audit(c.env.DB, c.get("user"), "open_shift", "pos_shift", shift?.id || null, `Open drawer ${cashAccountId}`);
    return c.json({ shift }, 201);
  } catch (err) {
    if (isShiftErr(err)) return shiftFail(c, err);
    throw err;
  }
});

shiftRoutes.post("/close/:id", requirePerm("sales.create"), async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await loadShift(c.env.DB, id);
  if (!existing) return c.json({ error: "not_found" }, 404);
  const b = await c.req.json<{ actual_cash_balance?: number; main_safe_id?: number; leave_float?: number }>();
  if (b.actual_cash_balance == null || Number.isNaN(Number(b.actual_cash_balance))) {
    return c.json({ error: "invalid_amount" }, 400);
  }
  try {
    const closed = await closePosShift(c.env.DB, id, c.get("user"), {
      actual_cash_balance: Number(b.actual_cash_balance),
      main_safe_id: b.main_safe_id,
      leave_float: b.leave_float,
    });
    await audit(c.env.DB, c.get("user"), "close_shift", "pos_shift", id, `Close shift ${id}`);
    return c.json(closed);
  } catch (err) {
    if (isShiftErr(err)) return shiftFail(c, err);
    throw err;
  }
});
