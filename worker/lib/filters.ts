import { like, paginate, todayIso, type AppDb } from "./helpers";

export type ListQ = Record<string, string>;
export type Bind = string | number;

export function listParams(url: URL): ListQ {
  const o: ListQ = {};
  url.searchParams.forEach((v, k) => {
    const t = String(v || "").trim();
    if (t) o[k] = t;
  });
  return o;
}

export function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIso(s: string) {
  return new Date(`${s.slice(0, 10)}T12:00:00`);
}

export function addDays(iso: string, n: number) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function startOfWeek(iso: string) {
  const d = parseIso(iso);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return isoDate(d);
}

function lastDayOfMonth(year: number, month: number) {
  return isoDate(new Date(year, month, 0));
}

export function resolveDates(p: ListQ): { from?: string; to?: string } {
  if (p.day && /^\d{4}-\d{2}-\d{2}$/.test(p.day)) return { from: p.day, to: p.day };
  if (p.week && /^\d{4}-\d{2}-\d{2}$/.test(p.week)) {
    const from = startOfWeek(p.week);
    return { from, to: addDays(from, 6) };
  }
  if (p.month && /^\d{4}-\d{2}$/.test(p.month)) {
    const [y, m] = p.month.split("-").map(Number);
    return { from: `${p.month}-01`, to: lastDayOfMonth(y, m) };
  }
  if (p.year && /^\d{4}$/.test(p.year)) return { from: `${p.year}-01-01`, to: `${p.year}-12-31` };

  const today = todayIso();
  const period = p.period || "";
  if (period === "custom" || (!period && (p.from || p.to))) {
    return { from: p.from, to: p.to };
  }
  switch (period) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "this_week":
      return { from: startOfWeek(today), to: today };
    case "last_week": {
      const thisW = startOfWeek(today);
      return { from: addDays(thisW, -7), to: addDays(thisW, -1) };
    }
    case "last_7":
      return { from: addDays(today, -6), to: today };
    case "last_30":
      return { from: addDays(today, -29), to: today };
    case "this_month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "last_month": {
      const from = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7) + "-01";
      const to = addDays(`${today.slice(0, 7)}-01`, -1);
      return { from, to };
    }
    case "last_3_months": {
      const d = parseIso(`${today.slice(0, 7)}-01`);
      d.setMonth(d.getMonth() - 2);
      return { from: isoDate(d), to: today };
    }
    case "this_quarter": {
      const m = Number(today.slice(5, 7));
      const q = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: `${today.slice(0, 4)}-${String(q).padStart(2, "0")}-01`, to: today };
    }
    case "this_year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "last_year": {
      const y = Number(today.slice(0, 4)) - 1;
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    case "all":
      return {};
    default:
      return { from: p.from, to: p.to };
  }
}

export function applyDate(where: string[], params: Bind[], col: string, p: ListQ) {
  const { from, to } = resolveDates(p);
  if (from) {
    where.push(`date(${col}) >= date(?)`);
    params.push(from);
  }
  if (to) {
    where.push(`date(${col}) <= date(?)`);
    params.push(to);
  }
  return { from, to };
}

export function applySearch(where: string[], params: Bind[], q: string | undefined, likeCols: string[], exactCols: string[] = []) {
  const s = (q || "").trim();
  if (!s) return;
  const parts = likeCols.map((c) => `${c} LIKE ?`);
  const l = like(s);
  const binds: Bind[] = likeCols.map(() => l);
  for (const c of exactCols) {
    parts.push(`${c} = ?`);
    binds.push(s);
  }
  where.push(`(${parts.join(" OR ")})`);
  params.push(...binds);
}

export function numVal(v?: string | number | null) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function applyEq(where: string[], params: Bind[], col: string, v?: string, asNum = false) {
  if (!v) return;
  where.push(`${col} = ?`);
  params.push(asNum ? Number(v) : v);
}

export function applyRange(where: string[], params: Bind[], col: string, min?: string, max?: string) {
  const a = numVal(min);
  const b = numVal(max);
  if (a != null) {
    where.push(`${col} >= ?`);
    params.push(a);
  }
  if (b != null) {
    where.push(`${col} <= ?`);
    params.push(b);
  }
}

export function sortSql(sort: string | undefined, map: Record<string, string>, fallback: string) {
  if (sort && map[sort]) return `ORDER BY ${map[sort]}`;
  return `ORDER BY ${fallback}`;
}

export async function descendantLocationIds(db: AppDb, rootId: number): Promise<number[]> {
  const { results } = await db.prepare("SELECT id, parent_id FROM storage_locations WHERE deleted_at IS NULL").all<{
    id: number;
    parent_id: number | null;
  }>();
  const kids = new Map<number, number[]>();
  for (const r of results) {
    if (r.parent_id) {
      const list = kids.get(r.parent_id) || [];
      list.push(r.id);
      kids.set(r.parent_id, list);
    }
  }
  const out = new Set<number>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const id of kids.get(cur) || []) {
      if (!out.has(id)) {
        out.add(id);
        stack.push(id);
      }
    }
  }
  return [...out];
}

export async function locationFilterId(p: ListQ) {
  return numVal(p.bin_id || p.fork_id || p.shelf_id || p.bay_id || p.warehouse_id || p.location_id || p.locations);
}

async function warehouseTreeIds(
  db: AppDb,
  loc: { id: number; name: string; warehouse: string | null; kind: string | null },
) {
  const desc = await descendantLocationIds(db, loc.id);
  if (loc.kind !== "warehouse") return desc;
  const label = String(loc.name || loc.warehouse || "").trim();
  const extra = label
    ? await db
        .prepare(
          `SELECT id FROM storage_locations
           WHERE deleted_at IS NULL
             AND IFNULL(kind,'') != 'warehouse'
             AND (parent_id IS NULL OR parent_id = 0)
             AND (warehouse = ? OR name = ?)`,
        )
        .bind(label, label)
        .all<{ id: number }>()
    : { results: [] as { id: number }[] };
  return [...new Set([...desc, ...(extra.results || []).map((r) => r.id)])];
}

export async function stockScopeIds(db: AppDb, p: ListQ | { warehouse?: string; warehouse_id?: string | number; location_id?: string | number; locations?: string | number }): Promise<number[] | null> {
  const raw = p as ListQ;
  const name = String(raw.warehouse || "").trim();
  const namedId = /^\d+$/.test(name) ? Number(name) : null;
  const id = numVal(raw.location_id || raw.warehouse_id || raw.locations) ?? namedId;
  if (id != null) {
    const loc = await db
      .prepare("SELECT id, name, warehouse, kind FROM storage_locations WHERE id = ? AND deleted_at IS NULL")
      .bind(id)
      .first<{ id: number; name: string; warehouse: string | null; kind: string | null }>();
    if (!loc) return [id];
    return warehouseTreeIds(db, loc);
  }
  if (!name) return null;
  const root = await db
    .prepare(
      `SELECT id, name, warehouse, kind FROM storage_locations
       WHERE deleted_at IS NULL AND kind = 'warehouse' AND (name = ? OR warehouse = ?)
       ORDER BY id LIMIT 1`,
    )
    .bind(name, name)
    .first<{ id: number; name: string; warehouse: string | null; kind: string | null }>();
  if (root) return warehouseTreeIds(db, root);
  return [];
}

export async function applyLocationCol(db: AppDb, where: string[], params: Bind[], col: string, p: ListQ) {
  const id = await locationFilterId(p);
  if (id == null) return;
  const ids = await descendantLocationIds(db, id);
  if (!ids.length) {
    where.push("1=0");
    return;
  }
  where.push(`${col} IN (${ids.map(() => "?").join(",")})`);
  params.push(...ids);
}

export function paging(url: URL) {
  return paginate(url);
}

export const INVOICE_SORT: Record<string, string> = {
  newest: "si.id DESC",
  oldest: "si.id ASC",
  name_az: "si.customer_name COLLATE NOCASE ASC",
  name_za: "si.customer_name COLLATE NOCASE DESC",
  price_high: "si.total DESC",
  price_low: "si.total ASC",
  sales_high: "si.total DESC",
  sales_low: "si.total ASC",
};

export const PRODUCT_SORT: Record<string, string> = {
  newest: "p.id DESC",
  oldest: "p.id ASC",
  name_az: "p.name_ar COLLATE NOCASE ASC",
  name_za: "p.name_ar COLLATE NOCASE DESC",
  price_high: "p.selling_price DESC",
  price_low: "p.selling_price ASC",
  qty_high: "(p.current_stock - p.reserved_stock) DESC",
  qty_low: "(p.current_stock - p.reserved_stock) ASC",
};

export const CUSTOMER_SORT: Record<string, string> = {
  newest: "id DESC",
  oldest: "id ASC",
  name_az: "name COLLATE NOCASE ASC",
  name_za: "name COLLATE NOCASE DESC",
  balance_high: "current_balance DESC",
  balance_low: "current_balance ASC",
};

export async function applyProductScope(
  db: AppDb,
  where: string[],
  params: Bind[],
  p: ListQ,
  invoiceIdCol = "si.id",
) {
  const productId = numVal(p.product_id);
  const brandId = numVal(p.brand_id);
  const modelId = numVal(p.model_id);
  const typeId = numVal(p.part_type_id);
  const locId = numVal(p.bin_id || p.fork_id || p.shelf_id || p.bay_id);
  if (!productId && !brandId && !modelId && !typeId && locId == null && !p.product_q) return;
  const inner: string[] = [`sii.invoice_id = ${invoiceIdCol}`];
  if (productId) {
    inner.push("sii.product_id = ?");
    params.push(productId);
  }
  if (p.product_q) {
    inner.push("(sii.sku LIKE ? OR sii.product_name LIKE ? OR p.barcode = ? OR p.sku LIKE ?)");
    const l = like(p.product_q);
    params.push(l, l, p.product_q, l);
  }
  if (brandId) {
    inner.push("p.brand_id = ?");
    params.push(brandId);
  }
  if (typeId) {
    inner.push("p.part_type_id = ?");
    params.push(typeId);
  }
  if (modelId) {
    inner.push("EXISTS (SELECT 1 FROM product_models pm WHERE pm.product_id = p.id AND pm.model_id = ?)");
    params.push(modelId);
  }
  if (locId != null) {
    const ids = await descendantLocationIds(db, locId);
    inner.push(`p.location_id IN (${ids.map(() => "?").join(",")})`);
    params.push(...ids);
  }
  where.push(
    `EXISTS (SELECT 1 FROM sales_invoice_items sii JOIN products p ON p.id = sii.product_id WHERE ${inner.join(" AND ")})`,
  );
}

export async function applyInvoiceListFilters(
  db: AppDb,
  where: string[],
  params: Bind[],
  p: ListQ,
  user?: { role_slug?: string; delivery_agent_id?: number | null },
) {
  if (user?.role_slug === "delivery" && user.delivery_agent_id) {
    where.push("si.delivery_agent_id = ?");
    params.push(user.delivery_agent_id);
  }
  applySearch(
    where,
    params,
    p.q,
    ["si.number", "si.customer_name", "si.customer_phone", "IFNULL(si.customer_whatsapp,'')", "si.delivery_agent_name", "IFNULL(si.notes,'')", "IFNULL(si.delivery_agent_code,'')"],
    ["si.number"],
  );
  if (p.status) {
    where.push("(si.status = ? OR si.delivery_status = ?)");
    params.push(p.status, p.status);
  }
  applyEq(where, params, "si.type", p.type);
  applyDate(where, params, "si.date", p);
  applyEq(where, params, "si.customer_id", p.customer_id, true);
  const agentId = p.sales_agent_id || p.agent_id || p.representative_id;
  if (agentId) {
    where.push("(si.sales_agent_id = ? OR si.delivery_agent_id = ?)");
    params.push(Number(agentId), Number(agentId));
  }
  applyEq(where, params, "si.branch_id", p.branch_id, true);
  applyEq(where, params, "si.payment_method", p.payment_method);
  applyEq(where, params, "si.created_by", p.created_by || p.cashier_id, true);
  if (p.pay_status === "paid") where.push("si.remaining <= 0 AND si.paid > 0");
  if (p.pay_status === "unpaid") where.push("si.paid <= 0");
  if (p.pay_status === "partial") where.push("si.paid > 0 AND si.remaining > 0");
  if (p.terms === "credit" || p.payment_terms === "credit") where.push("si.payment_method = 'credit'");
  if (p.terms === "cash" || p.payment_terms === "cash") where.push("si.payment_method != 'credit'");
  applyRange(where, params, "si.total", p.amount_min || p.total_min, p.amount_max || p.total_max);
  const saleScope = await stockScopeIds(db, p);
  if (saleScope) {
    if (!saleScope.length) where.push("1=0");
    else {
      where.push(`si.location_id IN (${saleScope.map(() => "?").join(",")})`);
      params.push(...saleScope);
    }
  }
  await applyProductScope(db, where, params, p);
}
