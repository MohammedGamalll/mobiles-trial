const login = async (username) => {
  const res = await fetch("http://127.0.0.1:8787/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "1234" }),
  });
  const cookie = (res.headers.getSetCookie?.()[0] || res.headers.get("set-cookie") || "").split(";")[0];
  const body = await res.json();
  return { status: res.status, cookie, role: body.user?.role_slug, username };
};

const api = async (cookie, path, init = {}) => {
  const res = await fetch("http://127.0.0.1:8787" + path, {
    ...init,
    headers: { cookie, "content-type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json };
};

const admin = await login("admin");
const h = admin.cookie;
const old = {};
for (const [name, path] of [
  ["health", "/api/health"],
  ["dashboard", "/api/dashboard"],
  ["products", "/api/products?pageSize=5"],
  ["delivery", "/api/delivery/orders"],
  ["employees", "/api/hr/employees"],
  ["tree", "/api/inventory/locations/tree"],
  ["summary", "/api/inventory/summary"],
  ["batches", "/api/inventory/batches?pageSize=20"],
]) {
  if (name === "health") {
    const r = await fetch("http://127.0.0.1:8787" + path);
    old[name] = { status: r.status, json: await r.json() };
  } else {
    old[name] = await api(h, path);
  }
}

const tree = old.tree.json.data || [];
const warehouses = tree.filter((l) => l.kind === "warehouse");
const showBin = tree.find((l) => l.code === "SHOW-R1");
const batches = (old.batches.json.data || []).filter((b) => b.available > 0 && b.location_id);
const batch = batches[0];
const fromId = batch?.location_id;
const toId = showBin?.id;

let transfer = null;
if (batch && fromId && toId && fromId !== toId) {
  const created = await api(h, "/api/inventory/transfers", {
    method: "POST",
    body: JSON.stringify({
      from_location_id: fromId,
      to_location_id: toId,
      items: [{ product_id: batch.product_id, batch_id: batch.id, qty: 1 }],
    }),
  });
  const completed = created.json.id
    ? await api(h, `/api/inventory/transfers/${created.json.id}/complete`, { method: "POST", body: "{}" })
    : { status: 0, json: created.json };
  transfer = { created: created.status, number: created.json.number, complete: completed.status, err: created.json.error || completed.json?.error };
}

const st = await api(h, "/api/inventory/stocktakes", {
  method: "POST",
  body: JSON.stringify({ location_id: fromId || null }),
});
let stocktake = { created: st.status, number: st.json.number, err: st.json.error };
if (st.json.id) {
  const detail = await api(h, `/api/inventory/stocktakes/${st.json.id}`);
  const items = (detail.json.data?.items || []).slice(0, 2).map((it) => ({ id: it.id, counted_qty: it.system_qty }));
  if (items.length) await api(h, `/api/inventory/stocktakes/${st.json.id}/counts`, { method: "PUT", body: JSON.stringify({ items }) });
  const sub = await api(h, `/api/inventory/stocktakes/${st.json.id}/submit`, { method: "POST", body: "{}" });
  const appr = await api(h, `/api/inventory/stocktakes/${st.json.id}/approve`, { method: "POST", body: "{}" });
  stocktake = { ...stocktake, items: detail.json.data?.items?.length, submit: sub.status, approve: appr.status, approveErr: appr.json.error };
}

const roles = [];
for (const u of ["admin", "sales", "warehouse", "delivery", "accountant"]) {
  roles.push(await login(u));
}

console.log(JSON.stringify({
  health: old.health.json,
  dashboard: old.dashboard.status,
  products: old.products.status,
  delivery: old.delivery.status,
  employees: old.employees.status,
  warehouses: warehouses.map((w) => w.name),
  treeCount: tree.length,
  summaryWh: old.summary.json.by_warehouse,
  transfer,
  stocktake,
  roles: roles.map((r) => ({ u: r.username, status: r.status, role: r.role })),
}, null, 2));
