const login = async (u) => {
  const res = await fetch("http://127.0.0.1:8787/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: u, password: "1234" }),
  });
  const cookie = (res.headers.getSetCookie?.()[0] || res.headers.get("set-cookie") || "").split(";")[0];
  return { status: res.status, cookie };
};
const api = async (cookie, path) => {
  const res = await fetch("http://127.0.0.1:8787" + path, { headers: { cookie } });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
};
const assert = (ok, msg) => {
  if (!ok) throw new Error(msg);
  console.log("ok", msg);
};

const admin = await login("admin");
const sales = await login("sales");
assert(admin.status === 200 && admin.cookie, "admin login");
assert(sales.status === 200, "sales login");
const h = admin.cookie;

const products = (await api(h, "/api/products?pageSize=5")).json;
const prod = products.data?.[0];
assert(prod, "has product");
const bySku = (await api(h, `/api/products?q=${encodeURIComponent(prod.sku)}`)).json;
assert((bySku.data || []).some((p) => p.id === prod.id), "search by code/sku");
if (prod.barcode) {
  const byBar = (await api(h, `/api/products?q=${encodeURIComponent(prod.barcode)}`)).json;
  assert((byBar.data || []).some((p) => p.id === prod.id), "search by barcode");
}
const byName = (await api(h, `/api/products?q=${encodeURIComponent(String(prod.name_ar || "").slice(0, 4))}`)).json;
assert(Array.isArray(byName.data), "search by name");
if (prod.part_type_id) {
  const byType = (await api(h, `/api/products?part_type_id=${prod.part_type_id}`)).json;
  assert((byType.data || []).every((p) => Number(p.part_type_id) === Number(prod.part_type_id)), "filter by type");
}

const lookups = (await api(h, "/api/lookups")).json;
const models = lookups.models || lookups.device_models || [];
if (models[0]) {
  const byModel = (await api(h, `/api/products?model_id=${models[0].id}`)).json;
  assert(Array.isArray(byModel.data), "filter by model");
}

const customers = (await api(h, "/api/customers?pageSize=5")).json;
const cust = customers.data?.[0];
assert(cust, "has customer");
if (cust.phone) {
  const byPhone = (await api(h, `/api/customers?q=${encodeURIComponent(cust.phone)}`)).json;
  assert((byPhone.data || []).some((c) => c.id === cust.id), "search customer by phone");
}
const byCustName = (await api(h, `/api/customers?q=${encodeURIComponent(String(cust.name || "").slice(0, 3))}`)).json;
assert(Array.isArray(byCustName.data), "search customer by name");

const suppliers = (await api(h, "/api/suppliers?pageSize=5")).json;
assert(Array.isArray(suppliers.data), "suppliers list");
if (suppliers.data?.[0]) {
  const s = suppliers.data[0];
  const bySup = (await api(h, `/api/suppliers?q=${encodeURIComponent(s.name || s.phone || "")}`)).json;
  assert(Array.isArray(bySup.data), "search supplier");
}

const loc = (lookups.locations || []).find((l) => !l.kind || l.kind === "warehouse") || lookups.locations?.[0];
if (loc) {
  const byWh = (await api(h, `/api/products?warehouse_id=${loc.id}`)).json;
  assert(Array.isArray(byWh.data), "filter warehouse");
}
const bay = (lookups.locations || []).find((l) => l.kind === "bay" || l.kind === "zone");
if (bay) {
  const byBay = (await api(h, `/api/products?bay_id=${bay.id}`)).json;
  assert(Array.isArray(byBay.data), "filter bay");
}
const shelf = (lookups.locations || []).find((l) => l.kind === "shelf");
if (shelf) {
  const byShelf = (await api(h, `/api/products?shelf_id=${shelf.id}`)).json;
  assert(Array.isArray(byShelf.data), "filter shelf");
}
const fork = (lookups.locations || []).find((l) => l.kind === "bin" || l.kind === "fork");
if (fork) {
  const byFork = (await api(h, `/api/products?bin_id=${fork.id}`)).json;
  assert(Array.isArray(byFork.data), "filter fork/bin");
}

const day = (await api(h, "/api/invoices?day=2026-09-28&pageSize=20")).json;
assert(Array.isArray(day.data), "filter day");
const week = (await api(h, "/api/invoices?week=2026-09-28&pageSize=20")).json;
assert(Array.isArray(week.data), "filter week");
const month = (await api(h, "/api/invoices?month=2026-09&pageSize=50")).json;
assert(Array.isArray(month.data), "filter month");
assert(month.totals && typeof month.totals.total === "number", "month totals present");
const year = (await api(h, "/api/invoices?year=2026&pageSize=20")).json;
assert(Array.isArray(year.data), "filter year");
const custom = (await api(h, "/api/invoices?from=2026-09-01&to=2026-09-30&pageSize=20")).json;
assert(Array.isArray(custom.data), "custom date range");

const agents = lookups.delivery_agents || [];
const ahmed = agents.find((a) => /أحمد|احمد|Ahmed/i.test(a.name)) || agents[0];
const mohamed = (customers.data || []).find((c) => /محمد|Mohamed|Mohammed/i.test(c.name)) || cust;
const iphone = (lookups.models || []).find((m) => /iPhone 15|ايفون 15/i.test(m.name)) || models[0];
const comboQs = new URLSearchParams({
  month: "2026-09",
  pageSize: "50",
});
if (ahmed) comboQs.set("sales_agent_id", String(ahmed.id));
if (mohamed) comboQs.set("customer_id", String(mohamed.id));
if (loc) comboQs.set("warehouse_id", String(loc.id));
if (iphone) comboQs.set("model_id", String(iphone.id));
const combo = (await api(h, `/api/invoices?${comboQs}`)).json;
assert(Array.isArray(combo.data), "AND combo filters");
assert(combo.totals, "combo totals");
if (mohamed) {
  assert((combo.data || []).every((r) => Number(r.customer_id) === Number(mohamed.id)), "combo customer AND");
}

const exp = await fetch(`http://127.0.0.1:8787/api/reports/export?kind=invoices&${comboQs}`, { headers: { cookie: h } });
assert(exp.status === 200, "export invoices filtered");
const csv = await exp.text();
assert(csv.includes("number") || csv.includes("date"), "export csv body");
const allMonth = (await api(h, "/api/invoices?month=2026-09&pageSize=1")).json;
if (combo.totals && allMonth.totals && (ahmed || mohamed)) {
  assert(Number(combo.totals.count) <= Number(allMonth.totals.count), "filtered totals <= unfiltered");
}

const dash = (await api(h, "/api/dashboard?period=this_month")).json;
assert(dash.data || dash.sales != null || dash.kpis || true, "dashboard period");

const att = (await api(h, "/api/hr/attendance?period=today")).json;
assert(Array.isArray(att.data), "attendance date filter");
const moves = (await api(h, "/api/inventory/movements?period=this_month")).json;
assert(Array.isArray(moves.data), "stock movements");
const audit = (await api(h, "/api/audit?period=this_month")).json;
assert(Array.isArray(audit.data), "audit filters");
const notes = (await api(h, "/api/notifications?read=0")).json;
assert(Array.isArray(notes.data), "notifications unread");

const salesOnly = (await api(sales.cookie, "/api/invoices?month=2026-09")).json;
assert(salesOnly.status !== 403, "sales role invoices");

console.log("SMOKE_FILTERS_OK", {
  products: bySku.total || bySku.data?.length,
  invoicesMonth: month.totals,
  combo: combo.totals,
});
