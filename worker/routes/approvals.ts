import { Hono } from "hono";
import { type AppBindings, type AppVars } from "../lib/helpers";
import { requirePerm } from "../lib/auth";

export const approvalRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

approvalRoutes.get("/", requirePerm("approvals.view", "purchases.approve", "stocktake.approve", "leaves.manage"), async (c) => {
  const user = c.get("user");
  const kind = new URL(c.req.url).searchParams.get("kind") || "";
  const allow = (...codes: string[]) => user.role_slug === "admin" || codes.some((code) => user.permissions.includes(code));
  const purchases = allow("purchases.approve") && (!kind || kind === "purchases")
    ? (await c.env.DB.prepare(
        `SELECT id, number, date, status, total, notes FROM purchase_invoices
         WHERE deleted_at IS NULL AND status IN ('submitted','draft') ORDER BY id DESC LIMIT 40`,
      ).all()).results
    : [];
  const stocktakes = allow("stocktake.approve") && (!kind || kind === "stocktakes")
    ? (await c.env.DB.prepare(
        `SELECT id, number, date, status, location_id FROM stocktakes WHERE status = 'submitted' ORDER BY id DESC LIMIT 40`,
      ).all()).results
    : [];
  const leaves = allow("leaves.manage") && (!kind || kind === "leaves")
    ? (await c.env.DB.prepare(
        `SELECT l.id, l.type, l.date_from, l.date_to, l.days, l.status, l.reason, e.name as employee_name
         FROM leave_requests l JOIN employees e ON e.id = l.employee_id
         WHERE l.status = 'pending' ORDER BY l.id DESC LIMIT 40`,
      ).all()).results
    : [];
  return c.json({
    purchases,
    stocktakes,
    leaves,
    count: (purchases?.length || 0) + (stocktakes?.length || 0) + (leaves?.length || 0),
  });
});
