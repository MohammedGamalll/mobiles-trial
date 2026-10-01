import { Hono } from "hono";
import { audit, notify, round2, todayIso, type AppBindings, type AppVars } from "../lib/helpers";
import { requirePerm } from "../lib/auth";
import { accrueCommission } from "../lib/commission";
import { postCollectionJournal, tryLedger } from "../lib/ledger";
import { applyIssue, logMovement, maybeStockAlerts, releaseReserve } from "../lib/stock";
import { applyDate, applyEq, applySearch, listParams } from "../lib/filters";

export const deliveryRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

deliveryRoutes.get("/orders", requirePerm("delivery.view", "sales.view"), async (c) => {
  const p = listParams(new URL(c.req.url));
  const user = c.get("user");
  const where = ["si.deleted_at IS NULL", "si.type = 'delivery'"];
  const params: (string | number)[] = [];
  if (user.role_slug === "delivery" && user.delivery_agent_id && !user.permissions.includes("delivery.all")) {
    where.push("si.delivery_agent_id = ?");
    params.push(user.delivery_agent_id);
  } else {
    applyEq(where, params, "si.delivery_agent_id", p.agent_id || p.sales_agent_id, true);
  }
  applyEq(where, params, "si.delivery_status", p.status);
  if (p.area) {
    where.push("si.area LIKE ?");
    params.push(`%${p.area}%`);
  }
  applySearch(where, params, p.q, ["si.number", "si.customer_name", "si.customer_phone", "IFNULL(si.area,'')", "IFNULL(si.delivery_agent_name,'')"]);
  applyDate(where, params, "si.date", p);
  const { results } = await c.env.DB
    .prepare(`SELECT si.* FROM sales_invoices si WHERE ${where.join(" AND ")} ORDER BY si.id DESC LIMIT 200`)
    .bind(...params)
    .all();
  return c.json({ data: results });
});

deliveryRoutes.post("/orders/:id/status", requirePerm("delivery.update"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ status: string; notes?: string }>();
  const allowed = [
    "pending_delivery",
    "out_for_delivery",
    "rescheduled",
    "customer_unavailable",
    "cancelled",
  ];
  if (!allowed.includes(b.status)) return c.json({ error: "use_result_endpoint" }, 400);
  await c.env.DB.prepare("UPDATE sales_invoices SET delivery_status = ?, status = ?, notes = COALESCE(?, notes) WHERE id = ?").bind(b.status, b.status, b.notes || null, id).run();
  await audit(c.env.DB, c.get("user"), "delivery_status", "invoice", id, b.status);
  return c.json({ ok: true });
});

deliveryRoutes.post("/orders/:id/result", requirePerm("delivery.update"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{
    result_type: string;
    notes?: string;
    customer_notes?: string;
    collected?: number;
    items: { invoice_item_id: number; delivered_qty: number; returned_qty: number }[];
  }>();
  const inv = await c.env.DB.prepare("SELECT * FROM sales_invoices WHERE id = ?").bind(id).first<{
    id: number;
    number: string;
    status: string;
    customer_id: number | null;
    paid: number;
    remaining: number;
    total: number;
    delivery_status: string;
  }>();
  if (!inv) return c.json({ error: "not_found" }, 404);
  if (["completed", "cancelled", "delivered", "fully_returned", "customer_refused", "partially_returned"].includes(inv.status)) return c.json({ error: "already_closed" }, 400);
  const { results: items } = await c.env.DB
    .prepare("SELECT * FROM sales_invoice_items WHERE invoice_id = ?")
    .bind(id)
    .all<{ id: number; product_id: number; quantity: number; unit_price: number; discount: number; unit_cost: number; item_kind?: string }>();
  const { results: batches } = await c.env.DB
    .prepare(
      `SELECT sib.*, sii.product_id FROM sales_item_batches sib JOIN sales_invoice_items sii ON sii.id = sib.invoice_item_id WHERE sii.invoice_id = ?`,
    )
    .bind(id)
    .all<{ invoice_item_id: number; batch_id: number; qty: number; unit_cost: number; product_id: number }>();
  const user = c.get("user");
  const resultType = b.result_type;
  let deliveredValue = 0;
  let returnedValue = 0;
  let costDelivered = 0;

  for (const item of items) {
    const line = b.items?.find((x) => x.invoice_item_id === item.id);
    let delivered = 0;
    let returned = 0;
    if (resultType === "full_delivery" || resultType === "delivered") {
      delivered = item.quantity;
      returned = 0;
    } else if (resultType === "full_return" || resultType === "refused" || resultType === "fully_returned") {
      delivered = 0;
      returned = item.quantity;
    } else {
      delivered = line?.delivered_qty ?? 0;
      returned = line?.returned_qty ?? Math.max(0, item.quantity - delivered);
    }
    if (delivered + returned > item.quantity) returned = item.quantity - delivered;
    const unitNet = item.unit_price - item.discount / Math.max(item.quantity, 1);
    deliveredValue += delivered * unitNet;
    returnedValue += returned * unitNet;
    await c.env.DB.prepare("UPDATE sales_invoice_items SET delivered_qty = ?, returned_qty = ? WHERE id = ?").bind(delivered, returned, item.id).run();
    const allocs = batches.filter((x) => x.invoice_item_id === item.id);
    if (!allocs.length) {
      costDelivered += delivered * Number(item.unit_cost || 0);
      continue;
    }
    let dLeft = delivered;
    let rLeft = returned;
    for (const a of allocs) {
      const dTake = Math.min(a.qty, dLeft);
      const rTake = Math.min(a.qty - dTake, rLeft);
      if (dTake > 0) {
        await applyIssue(c.env.DB, [{ batch_id: a.batch_id, batch_code: "", qty: dTake, unit_cost: a.unit_cost }], item.product_id, true);
        costDelivered += dTake * a.unit_cost;
        await logMovement(c.env.DB, {
          productId: item.product_id,
          batchId: a.batch_id,
          type: "out",
          qty: dTake,
          unitCost: a.unit_cost,
          referenceType: "delivery",
          referenceId: id,
          notes: `Deliver ${inv.number}`,
          userId: user.id,
        });
        dLeft -= dTake;
      }
      if (rTake > 0) {
        await releaseReserve(c.env.DB, [{ batch_id: a.batch_id, batch_code: "", qty: rTake, unit_cost: a.unit_cost }], item.product_id);
        await logMovement(c.env.DB, {
          productId: item.product_id,
          batchId: a.batch_id,
          type: "unreserve",
          qty: rTake,
          unitCost: a.unit_cost,
          referenceType: "delivery",
          referenceId: id,
          notes: `Return unused ${inv.number}`,
          userId: user.id,
        });
        rLeft -= rTake;
      }
    }
    await maybeStockAlerts(c.env.DB, item.product_id);
  }

  deliveredValue = round2(deliveredValue);
  const room = round2(Math.max(0, deliveredValue - inv.paid));
  const collected = round2(Math.min(b.collected ?? deliveredValue, room));
  const profit = round2(deliveredValue - costDelivered);
  let newStatus = "delivered";
  if (resultType === "full_return" || resultType === "refused" || resultType === "fully_returned") newStatus = resultType === "refused" ? "customer_refused" : "fully_returned";
  else if (resultType === "unavailable") newStatus = "customer_unavailable";
  else if (resultType === "rescheduled") newStatus = "rescheduled";
  else if (resultType === "partial_delivery" || resultType === "partial_return" || items.some((it) => true) && deliveredValue > 0 && returnedValue > 0) {
    const anyReturn = (b.items || []).some((x) => x.returned_qty > 0) || resultType === "partial_return" || resultType === "partial_delivery";
    const allDelivered = items.every((it) => {
      const line = b.items?.find((x) => x.invoice_item_id === it.id);
      return (line?.delivered_qty ?? it.quantity) >= it.quantity;
    });
    if (!allDelivered && anyReturn) newStatus = deliveredValue > 0 ? "partially_delivered" : "fully_returned";
    if (resultType === "partial_return") newStatus = "partially_returned";
    if (resultType === "partial_delivery") newStatus = "partially_delivered";
  }
  if (resultType === "full_delivery" || resultType === "delivered") newStatus = "delivered";

  const remaining = round2(Math.max(0, deliveredValue - (inv.paid + collected)));
  const paid = round2(inv.paid + collected);
  await c.env.DB
    .prepare(
      `UPDATE sales_invoices SET status = ?, delivery_status = ?, total = ?, paid = ?, remaining = ?, cost_total = ?, profit = ?, notes = COALESCE(?, notes)
       WHERE id = ?`,
    )
    .bind(newStatus, newStatus, deliveredValue, paid, remaining, round2(costDelivered), profit, b.notes || null, id)
    .run();
  if (collected > 0) {
    const pay = await c.env.DB
      .prepare("INSERT INTO payments (invoice_id, customer_id, method, amount, date, notes, created_by) VALUES (?, ?, 'cash', ?, ?, 'delivery collection', ?)")
      .bind(id, inv.customer_id, collected, todayIso(), user.id)
      .run();
    await tryLedger(() =>
      postCollectionJournal(c.env.DB, { paymentId: pay.meta.last_row_id, invoiceNumber: inv.number, amount: collected, method: "cash", date: todayIso(), userId: user.id }),
    );
  }
  if (inv.customer_id) {
    const delta = round2(deliveredValue - inv.total);
    if (delta !== 0) {
      await c.env.DB.prepare("UPDATE customers SET current_balance = MAX(current_balance + ?, 0) WHERE id = ?").bind(delta, inv.customer_id).run();
    }
    if (collected > 0) {
      await c.env.DB.prepare("UPDATE customers SET current_balance = MAX(current_balance - ?, 0) WHERE id = ?").bind(collected, inv.customer_id).run();
    }
  }
  await c.env.DB
    .prepare("INSERT INTO delivery_results (invoice_id, result_type, notes, customer_notes, created_by) VALUES (?, ?, ?, ?, ?)")
    .bind(id, resultType, b.notes || null, b.customer_notes || null, user.id)
    .run();
  await audit(c.env.DB, user, "delivery_status", "invoice", id, `${resultType} ${inv.number}`);
  const titleAr = newStatus.includes("return") || newStatus === "customer_refused" ? "مرتجع توصيل" : "اكتمل التوصيل";
  await notify(
    c.env.DB,
    newStatus.includes("return") ? "delivery_returned" : "delivery_completed",
    titleAr,
    "Delivery updated",
    `${inv.number} — ${newStatus}`,
    `${inv.number} — ${newStatus}`,
    "invoice",
    id,
  );
  return c.json({ ok: true, status: newStatus, total: deliveredValue });
});

deliveryRoutes.post("/orders/:id/complete", requirePerm("delivery.update", "sales.edit"), async (c) => {
  const id = Number(c.req.param("id"));
  const inv = await c.env.DB.prepare("SELECT * FROM sales_invoices WHERE id = ?").bind(id).first<{ delivery_status: string; number: string }>();
  if (!inv) return c.json({ error: "not_found" }, 404);
  const closable = ["delivered", "partially_delivered", "partially_returned", "fully_returned", "customer_refused"];
  if (!closable.includes(inv.delivery_status)) {
    return c.json({ error: "result_required" }, 400);
  }
  await c.env.DB.prepare("UPDATE sales_invoices SET status = 'completed', completed_at = datetime('now') WHERE id = ?").bind(id).run();
  await accrueCommission(c.env.DB, id);
  await audit(c.env.DB, c.get("user"), "complete_delivery", "invoice", id, `Complete ${inv.number}`);
  return c.json({ ok: true });
});

deliveryRoutes.get("/agents", requirePerm("delivery.view", "sales.create", "settings.view"), async (c) => {
  const { results } = await c.env.DB
    .prepare("SELECT * FROM delivery_agents WHERE deleted_at IS NULL ORDER BY code")
    .all();
  return c.json({ data: results });
});

deliveryRoutes.post("/agents", requirePerm("settings.edit", "hr.manage"), async (c) => {
  const b = await c.req.json<{ name: string; code: string; phone?: string; notes?: string; status?: string; role_type?: string; commission_rate?: number; area?: string }>();
  const r = await c.env.DB
    .prepare("INSERT INTO delivery_agents (name, code, phone, status, notes, role_type, commission_rate, area) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(b.name, b.code, b.phone || null, b.status || "active", b.notes || null, b.role_type || "delivery", b.commission_rate || 0, b.area || null)
    .run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

deliveryRoutes.put("/agents/:id", requirePerm("settings.edit", "hr.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ name: string; code: string; phone?: string; notes?: string; status?: string; role_type?: string; commission_rate?: number; area?: string }>();
  await c.env.DB
    .prepare("UPDATE delivery_agents SET name=?, code=?, phone=?, status=?, notes=?, role_type=?, commission_rate=?, area=? WHERE id=?")
    .bind(b.name, b.code, b.phone || null, b.status || "active", b.notes || null, b.role_type || "delivery", b.commission_rate || 0, b.area || null, id)
    .run();
  return c.json({ ok: true });
});

deliveryRoutes.delete("/agents/:id", requirePerm("settings.edit", "hr.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("UPDATE delivery_agents SET deleted_at = datetime('now'), status = 'inactive' WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "delete_agent", "delivery_agent", id, "Soft delete agent");
  return c.json({ ok: true });
});

deliveryRoutes.post("/location", requirePerm("delivery.update", "delivery.view"), async (c) => {
  const user = c.get("user");
  const b = await c.req.json<{ lat: number; lng: number; accuracy?: number; heading?: number; speed?: number; agent_id?: number }>();
  if (b.lat == null || b.lng == null) return c.json({ error: "gps_required" }, 400);
  let agentId = user.delivery_agent_id;
  if (user.role_slug === "admin" && b.agent_id) agentId = b.agent_id;
  if (!agentId) return c.json({ error: "no_agent" }, 400);
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  await c.env.DB
    .prepare("INSERT INTO agent_locations (agent_id, lat, lng, accuracy, heading, speed, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(agentId, b.lat, b.lng, b.accuracy ?? null, b.heading ?? null, b.speed ?? null, now)
    .run();
  await c.env.DB
    .prepare("UPDATE delivery_agents SET lat=?, lng=?, last_seen_at=? WHERE id=?")
    .bind(b.lat, b.lng, now, agentId)
    .run();
  return c.json({ ok: true, at: now });
});

deliveryRoutes.get("/live", requirePerm("delivery.view", "sales.view"), async (c) => {
  const { results: agents } = await c.env.DB
    .prepare(
      `SELECT a.*,
        (SELECT COUNT(*) FROM sales_invoices si WHERE si.delivery_agent_id = a.id AND si.type = 'delivery' AND si.deleted_at IS NULL
          AND si.delivery_status IN ('pending_delivery','out_for_delivery','rescheduled','customer_unavailable')) as open_orders
       FROM delivery_agents a WHERE a.deleted_at IS NULL ORDER BY a.code`,
    )
    .all();
  const { results: trail } = await c.env.DB
    .prepare("SELECT agent_id, lat, lng, accuracy, recorded_at FROM agent_locations WHERE recorded_at >= datetime('now','-6 hours') ORDER BY id")
    .all();
  return c.json({ data: { agents, trail } });
});

deliveryRoutes.get("/agents/:id/trail", requirePerm("delivery.view"), async (c) => {
  const id = Number(c.req.param("id"));
  const { results } = await c.env.DB
    .prepare("SELECT lat, lng, accuracy, recorded_at FROM agent_locations WHERE agent_id = ? ORDER BY id DESC LIMIT 80")
    .bind(id)
    .all();
  return c.json({ data: results.reverse() });
});

deliveryRoutes.get("/agents/:id/report", requirePerm("reports.view", "delivery.view"), async (c) => {
  const id = Number(c.req.param("id"));
  const agent = await c.env.DB.prepare("SELECT * FROM delivery_agents WHERE id = ?").bind(id).first();
  if (!agent) return c.json({ error: "not_found" }, 404);
  const stats = await c.env.DB
    .prepare(
      `SELECT
        COUNT(*) as total_orders,
        SUM(CASE WHEN delivery_status IN ('delivered','completed') OR status IN ('delivered','completed') THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN delivery_status LIKE 'partial%' THEN 1 ELSE 0 END) as partial,
        SUM(CASE WHEN delivery_status LIKE '%return%' OR delivery_status = 'customer_refused' THEN 1 ELSE 0 END) as returned,
        SUM(CASE WHEN delivery_status = 'cancelled' OR status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        COALESCE(SUM(total),0) as order_value,
        COALESCE(SUM(paid),0) as collected,
        COALESCE(SUM(CASE WHEN delivery_status LIKE '%return%' THEN total ELSE 0 END),0) as returned_amount
       FROM sales_invoices WHERE delivery_agent_id = ? AND type = 'delivery' AND deleted_at IS NULL`,
    )
    .bind(id)
    .first();
  return c.json({ data: { agent, stats } });
});
