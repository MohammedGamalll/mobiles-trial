import { Hono } from "hono";
import { audit, getSettings, notify, nowIso, round2, todayIso, type AppBindings, type AppVars } from "../lib/helpers";
import { requirePerm } from "../lib/auth";
import { accrueCommission } from "../lib/commission";
import { applyDate, applyEq, applySearch, listParams } from "../lib/filters";
import { CUSTODY_STATUSES, isCustodyStatus, normalizeOutcome, settleInvoice, type ChargeTo } from "../lib/delivery-pod";
import { pingDistanceOk } from "../lib/geo";

export const deliveryRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

deliveryRoutes.get("/orders", requirePerm("delivery.view", "sales.view", "delivery.mark"), async (c) => {
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
    .prepare(
      `SELECT si.*, c.lat AS dest_lat, c.lng AS dest_lng
       FROM sales_invoices si
       LEFT JOIN customers c ON c.id = si.customer_id
       WHERE ${where.join(" AND ")} ORDER BY si.id DESC LIMIT 200`,
    )
    .bind(...params)
    .all();
  return c.json({ data: results });
});

deliveryRoutes.post("/orders/:id/status", requirePerm("delivery.update"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ status: string; notes?: string }>();
  const allowed = ["pending_delivery", "out_for_delivery", "rescheduled", "customer_unavailable"];
  if (!allowed.includes(b.status)) return c.json({ error: "use_result_endpoint" }, 400);
  const inv = await c.env.DB
    .prepare("SELECT id, type, status, delivery_agent_id, settled_at FROM sales_invoices WHERE id = ? AND deleted_at IS NULL")
    .bind(id)
    .first<{ id: number; type: string; status: string; delivery_agent_id: number | null; settled_at: string | null }>();
  if (!inv || inv.type !== "delivery") return c.json({ error: "not_found" }, 404);
  if (inv.settled_at) return c.json({ error: "already_settled" }, 400);
  if (b.status === "out_for_delivery" && !inv.delivery_agent_id) return c.json({ error: "courier_required" }, 400);
  await c.env.DB
    .prepare("UPDATE sales_invoices SET delivery_status = ?, status = ?, notes = COALESCE(?, notes), assigned_at = CASE WHEN ? = 'out_for_delivery' THEN COALESCE(assigned_at, ?) ELSE assigned_at END WHERE id = ?")
    .bind(b.status, b.status, b.notes || null, b.status, nowIso(), id)
    .run();
  await audit(c.env.DB, c.get("user"), "delivery_status", "invoice", id, b.status);
  return c.json({ ok: true });
});

deliveryRoutes.post("/orders/:id/assign", requirePerm("delivery.update"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ delivery_agent_id?: number; courier_id?: number }>();
  const agentId = Number(b.delivery_agent_id || b.courier_id || 0);
  if (!agentId) return c.json({ error: "courier_required" }, 400);
  const inv = await c.env.DB
    .prepare("SELECT * FROM sales_invoices WHERE id = ? AND deleted_at IS NULL")
    .bind(id)
    .first<{ id: number; type: string; status: string; settled_at: string | null; number: string }>();
  if (!inv || inv.type !== "delivery") return c.json({ error: "not_found" }, 404);
  if (inv.settled_at) return c.json({ error: "already_settled" }, 400);
  if (!["pending_delivery", "rescheduled", "customer_unavailable"].includes(inv.status)) {
    return c.json({ error: "not_assignable" }, 400);
  }
  const agent = await c.env.DB
    .prepare("SELECT * FROM delivery_agents WHERE id = ? AND deleted_at IS NULL AND status = 'active'")
    .bind(agentId)
    .first<{ id: number; name: string; code: string; phone: string | null }>();
  if (!agent) return c.json({ error: "agent_not_found" }, 404);
  await c.env.DB
    .prepare(
      `UPDATE sales_invoices SET delivery_agent_id=?, delivery_agent_name=?, delivery_agent_code=?, delivery_agent_phone=?,
          status='out_for_delivery', delivery_status='out_for_delivery', assigned_at=?
       WHERE id=?`,
    )
    .bind(agent.id, agent.name, agent.code, agent.phone, nowIso(), id)
    .run();
  await audit(c.env.DB, c.get("user"), "assign_courier", "invoice", id, `${inv.number} → ${agent.code}`);
  return c.json({ ok: true, delivery_agent_id: agent.id, status: "out_for_delivery" });
});

deliveryRoutes.post("/orders/:id/mark-delivered", requirePerm("delivery.mark"), async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const inv = await c.env.DB
    .prepare("SELECT id, type, status, delivery_status, delivery_agent_id, settled_at, number FROM sales_invoices WHERE id = ? AND deleted_at IS NULL")
    .bind(id)
    .first<{
      id: number;
      type: string;
      status: string;
      delivery_status: string | null;
      delivery_agent_id: number | null;
      settled_at: string | null;
      number: string;
    }>();
  if (!inv || inv.type !== "delivery") return c.json({ error: "not_found" }, 404);
  if (inv.settled_at) return c.json({ error: "already_settled" }, 400);
  if (inv.delivery_status === "pending_settlement") return c.json({ error: "already_marked" }, 400);
  if (user.role_slug === "delivery") {
    if (!user.delivery_agent_id || Number(inv.delivery_agent_id || 0) !== Number(user.delivery_agent_id)) {
      return c.json({ error: "wrong_agent" }, 403);
    }
  }
  const pendingWithAgent = !!inv.delivery_agent_id && (inv.status === "pending_delivery" || inv.delivery_status === "pending_delivery");
  if (!isCustodyStatus(inv.status) && !isCustodyStatus(inv.delivery_status || "") && !pendingWithAgent) {
    return c.json({ error: "not_in_custody" }, 400);
  }
  await c.env.DB
    .prepare("UPDATE sales_invoices SET delivery_status = 'pending_settlement' WHERE id = ?")
    .bind(id)
    .run();
  await audit(c.env.DB, user, "delivery_mark", "invoice", id, inv.number);
  return c.json({ ok: true, delivery_status: "pending_settlement" });
});

function settleHttpError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  const map: Record<string, [number, string]> = {
    not_found: [404, "not_found"],
    not_delivery: [400, "not_delivery"],
    already_settled: [400, "already_settled"],
    already_marked: [400, "already_marked"],
    not_in_custody: [400, "not_in_custody"],
    wrong_agent: [400, "wrong_agent"],
    no_courier_employee: [400, "no_courier_employee"],
    INSUFFICIENT_STOCK: [400, "insufficient_stock"],
    unbalanced_journal: [400, "ledger"],
    ledger: [400, "ledger"],
  };
  return map[msg] || [500, msg];
}

deliveryRoutes.post("/settle", requirePerm("delivery.settle"), async (c) => {
  const b = await c.req.json<{
    delivery_agent_id?: number;
    courier_id?: number;
    notes?: string;
    orders: { invoice_id: number; outcome: string; collected?: number; cash_account_id?: number; charge_to?: ChargeTo; notes?: string }[];
  }>();
  const agentId = Number(b.delivery_agent_id || b.courier_id || 0);
  const orders = Array.isArray(b.orders) ? b.orders : [];
  if (!agentId || !orders.length) return c.json({ error: "missing" }, 400);
  const agent = await c.env.DB.prepare("SELECT id FROM delivery_agents WHERE id = ? AND deleted_at IS NULL").bind(agentId).first();
  if (!agent) return c.json({ error: "agent_not_found" }, 404);
  const user = c.get("user");
  try {
    const result = await c.env.DB.transaction(async (tx) => {
      const ins = await tx
        .prepare(
          `INSERT INTO delivery_settlements (delivery_agent_id, date, status, notes, created_by)
           VALUES (?, ?, 'posted', ?, ?)`,
        )
        .bind(agentId, todayIso(), b.notes || null, user.id)
        .run();
      const settlementId = ins.meta.last_row_id;
      const lines = [];
      let collectedTotal = 0;
      let deliveredCount = 0;
      let rejectedCount = 0;
      let damagedCount = 0;
      for (const row of orders) {
        const outcome = normalizeOutcome(row.outcome);
        if (!outcome) throw new Error("bad_outcome");
        const settled = await settleInvoice(tx, {
          invoiceId: Number(row.invoice_id),
          outcome,
          collected: row.collected,
          cashAccountId: row.cash_account_id || null,
          chargeTo: row.charge_to,
          notes: row.notes || b.notes || null,
          userId: user.id,
          settlementId,
          agentId,
        });
        lines.push(settled);
        collectedTotal = round2(collectedTotal + settled.collected);
        if (outcome === "delivered") deliveredCount += 1;
        if (outcome === "rejected") rejectedCount += 1;
        if (outcome === "damaged") damagedCount += 1;
      }
      await tx
        .prepare(
          `UPDATE delivery_settlements SET collected_total=?, delivered_count=?, rejected_count=?, damaged_count=? WHERE id=?`,
        )
        .bind(collectedTotal, deliveredCount, rejectedCount, damagedCount, settlementId)
        .run();
      return { settlement_id: settlementId, collected_total: collectedTotal, delivered_count: deliveredCount, rejected_count: rejectedCount, damaged_count: damagedCount, lines };
    });
    for (const line of result.lines) {
      if (line.outcome === "delivered") await accrueCommission(c.env.DB, line.invoice_id);
    }
    await audit(c.env.DB, user, "delivery_settle", "delivery_settlement", result.settlement_id, `Settle ${orders.length} orders`);
    return c.json({ ok: true, ...result });
  } catch (err) {
    if ((err as { message?: string }).message === "bad_outcome") return c.json({ error: "bad_outcome" }, 400);
    const [status, error] = settleHttpError(err);
    return c.json({ error }, status as 400 | 404 | 500);
  }
});

deliveryRoutes.post("/orders/:id/result", requirePerm("delivery.settle"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{
    result_type: string;
    notes?: string;
    collected?: number;
    cash_account_id?: number;
    charge_to?: ChargeTo;
  }>();
  const outcome = normalizeOutcome(b.result_type);
  if (!outcome) return c.json({ error: "bad_outcome" }, 400);
  const inv = await c.env.DB
    .prepare("SELECT delivery_agent_id, number FROM sales_invoices WHERE id = ? AND deleted_at IS NULL")
    .bind(id)
    .first<{ delivery_agent_id: number | null; number: string }>();
  if (!inv) return c.json({ error: "not_found" }, 404);
  if (!inv.delivery_agent_id) return c.json({ error: "courier_required" }, 400);
  const user = c.get("user");
  try {
    const result = await c.env.DB.transaction(async (tx) => {
      const ins = await tx
        .prepare(`INSERT INTO delivery_settlements (delivery_agent_id, date, status, notes, created_by) VALUES (?, ?, 'posted', ?, ?)`)
        .bind(inv.delivery_agent_id, todayIso(), b.notes || null, user.id)
        .run();
      const settlementId = ins.meta.last_row_id;
      const settled = await settleInvoice(tx, {
        invoiceId: id,
        outcome,
        collected: b.collected,
        cashAccountId: b.cash_account_id || null,
        chargeTo: b.charge_to,
        notes: b.notes || null,
        userId: user.id,
        settlementId,
        agentId: inv.delivery_agent_id!,
      });
      await tx
        .prepare(`UPDATE delivery_settlements SET collected_total=?, delivered_count=?, rejected_count=?, damaged_count=? WHERE id=?`)
        .bind(
          settled.collected,
          outcome === "delivered" ? 1 : 0,
          outcome === "rejected" ? 1 : 0,
          outcome === "damaged" ? 1 : 0,
          settlementId,
        )
        .run();
      return { settlement_id: settlementId, ...settled };
    });
    if (result.outcome === "delivered") await accrueCommission(c.env.DB, id);
    await audit(c.env.DB, user, "delivery_status", "invoice", id, `${outcome} ${inv.number}`);
    const titleAr = outcome === "rejected" ? "مرتجع توصيل" : outcome === "damaged" ? "تالف توصيل" : "اكتمل التوصيل";
    await notify(c.env.DB, outcome === "delivered" ? "delivery_completed" : "delivery_returned", titleAr, "Delivery updated", `${inv.number} — ${outcome}`, `${inv.number} — ${outcome}`, "invoice", id);
    return c.json({ ok: true, ...result });
  } catch (err) {
    const [status, error] = settleHttpError(err);
    return c.json({ error }, status as 400 | 404 | 500);
  }
});

deliveryRoutes.post("/orders/:id/complete", requirePerm("delivery.update", "sales.edit"), async (c) => {
  const id = Number(c.req.param("id"));
  const inv = await c.env.DB
    .prepare("SELECT delivery_status, settled_at, finance_committed_at, number FROM sales_invoices WHERE id = ?")
    .bind(id)
    .first<{ delivery_status: string; settled_at: string | null; finance_committed_at: string | null; number: string }>();
  if (!inv) return c.json({ error: "not_found" }, 404);
  if (inv.settled_at || inv.finance_committed_at) return c.json({ ok: true, already_settled: true });
  return c.json({ error: "settlement_required" }, 400);
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

deliveryRoutes.post("/location", requirePerm("delivery.update", "delivery.view", "delivery.mark"), async (c) => {
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

const CUSTODY_SQL = CUSTODY_STATUSES.map(() => "?").join(",");

deliveryRoutes.post("/tracking/ping", requirePerm("delivery.update", "delivery.view", "delivery.mark"), async (c) => {
  const user = c.get("user");
  const b = await c.req.json<{ lat?: number; lng?: number; accuracy?: number; heading?: number; agent_id?: number }>();
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  let agentId = user.delivery_agent_id;
  if (user.role_slug === "admin" && b.agent_id) agentId = Number(b.agent_id);
  if (!agentId) return c.json({ error: "no_agent" }, 400);

  const open = await c.env.DB
    .prepare(
      `SELECT id FROM sales_invoices WHERE delivery_agent_id = ? AND type = 'delivery' AND deleted_at IS NULL
        AND (
          delivery_status IN (${CUSTODY_SQL})
          OR delivery_status = 'pending_delivery'
        ) LIMIT 1`,
    )
    .bind(agentId, ...CUSTODY_STATUSES)
    .first();
  if (!open) return c.json({ ok: true, skipped: "no_active_orders" });

  const settings = await getSettings(c.env.DB);
  const maxKmh = Number(settings.gps_max_speed_kmh || 120) || 120;
  const maxAcc = Number(settings.gps_max_accuracy_m || 100) || 100;
  const prev = await c.env.DB
    .prepare("SELECT lat, lng, accuracy, recorded_at FROM courier_locations WHERE agent_id = ? ORDER BY id DESC LIMIT 1")
    .bind(agentId)
    .first<{ lat: number; lng: number; accuracy: number | null; recorded_at: string }>();
  const now = nowIso();
  const check = pingDistanceOk(prev, { lat, lng, accuracy: b.accuracy }, Date.now(), maxKmh, maxAcc);
  if (!check.ok) return c.json({ error: check.code || "gps_spoof", dist: check.dist, dt_s: check.dtS }, 400);

  const speed = check.dtS && check.dist != null ? round2(check.dist / check.dtS) : null;
  await c.env.DB
    .prepare(
      "INSERT INTO courier_locations (agent_id, lat, lng, accuracy, heading, speed_mps, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(agentId, lat, lng, b.accuracy ?? null, b.heading ?? null, speed, now)
    .run();
  await c.env.DB.prepare("UPDATE delivery_agents SET lat=?, lng=?, last_seen_at=? WHERE id=?").bind(lat, lng, now, agentId).run();
  await c.env.DB.prepare("DELETE FROM courier_locations WHERE recorded_at < datetime('now','-7 days')").run();
  return c.json({ ok: true, at: now, speed_mps: speed });
});

deliveryRoutes.get("/tracking/live", requirePerm("delivery.view"), async (c) => {
  const url = new URL(c.req.url);
  const trailAgentId = Number(url.searchParams.get("trail_agent_id") || 0);
  const { results: agents } = await c.env.DB
    .prepare(
      `SELECT a.id, a.code, a.name, a.phone,
        COALESCE(a.lat, (SELECT cl.lat FROM courier_locations cl WHERE cl.agent_id = a.id ORDER BY cl.id DESC LIMIT 1)) AS lat,
        COALESCE(a.lng, (SELECT cl.lng FROM courier_locations cl WHERE cl.agent_id = a.id ORDER BY cl.id DESC LIMIT 1)) AS lng,
        COALESCE(a.last_seen_at, (SELECT cl.recorded_at FROM courier_locations cl WHERE cl.agent_id = a.id ORDER BY cl.id DESC LIMIT 1)) AS last_seen_at,
        a.status,
        (SELECT COUNT(*) FROM sales_invoices si WHERE si.delivery_agent_id = a.id AND si.type = 'delivery' AND si.deleted_at IS NULL
          AND (si.delivery_status IN (${CUSTODY_SQL}) OR si.delivery_status = 'pending_delivery')) AS open_orders
       FROM delivery_agents a WHERE a.deleted_at IS NULL AND a.status = 'active' ORDER BY a.code`,
    )
    .bind(...CUSTODY_STATUSES)
    .all<{
      id: number;
      code: string;
      name: string;
      phone: string | null;
      lat: number | null;
      lng: number | null;
      last_seen_at: string | null;
      status: string;
      open_orders: number;
    }>();
  const now = Date.now();
  const data = agents.map((a) => {
    const raw = String(a.last_seen_at || "").trim();
    const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
    const seen = raw ? Date.parse(/Z|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`) : 0;
    return { ...a, stale: !seen || now - seen > 90_000 };
  });
  let trail: { lat: number; lng: number; accuracy: number | null; recorded_at: string }[] = [];
  if (trailAgentId) {
    const r = await c.env.DB
      .prepare("SELECT lat, lng, accuracy, recorded_at FROM courier_locations WHERE agent_id = ? ORDER BY id DESC LIMIT 50")
      .bind(trailAgentId)
      .all<{ lat: number; lng: number; accuracy: number | null; recorded_at: string }>();
    trail = r.results.reverse();
  }
  return c.json({ data: { agents: data, trail } });
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
