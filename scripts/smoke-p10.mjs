const login = async (u) => {
  const res = await fetch("http://127.0.0.1:8787/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: u, password: "1234" }),
  });
  const cookie = (res.headers.getSetCookie?.()[0] || res.headers.get("set-cookie") || "").split(";")[0];
  return { status: res.status, cookie };
};
const api = async (cookie, path, init = {}) => {
  const res = await fetch("http://127.0.0.1:8787" + path, {
    ...init,
    headers: { cookie, "content-type": "application/json", ...(init.headers || {}) },
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

const admin = await login("admin");
const sales = await login("sales");
const h = admin.cookie;
const cust = (await api(h, "/api/customers?pageSize=1")).json.data?.[0];
const detail = cust ? await api(h, `/api/customers/${cust.id}`) : { status: 0, json: {} };
const prod = (await api(h, "/api/products?pageSize=1")).json.data?.[0];
const moves = prod ? await api(h, `/api/inventory/movements?product_id=${prod.id}`) : { status: 0 };
const locs = await api(h, "/api/inventory/locations/tree");
const locId = locs.json.data?.[0]?.id;
const contents = locId ? await api(h, `/api/inventory/by-location?location_id=${locId}`) : { status: 0 };
const settings = await api(h, "/api/settings");
const bak = await api(h, "/api/backup", { method: "POST" });
const noConfirm = bak.json.filename
  ? await api(h, `/api/backup/${bak.json.filename}/restore`, { method: "POST", body: JSON.stringify({}) })
  : { status: 0 };
const restored = bak.json.filename
  ? await api(h, `/api/backup/${bak.json.filename}/restore`, { method: "POST", body: JSON.stringify({ confirm: true }) })
  : { status: 0 };
const salesRestore = bak.json.filename
  ? await api(sales.cookie, `/api/backup/${bak.json.filename}/restore`, { method: "POST", body: JSON.stringify({ confirm: true }) })
  : { status: 0 };
const old = {
  dash: (await api(h, "/api/dashboard")).status,
  quote: (await api(h, "/api/invoices?status=quote")).status,
  branches: (await api(h, "/api/branches")).status,
  ledger: (await api(h, "/api/ledger/accounts")).status,
};
const roles = [];
for (const u of ["admin", "sales", "warehouse", "delivery", "accountant"]) roles.push((await login(u)).status);
const pages = [];
for (const p of ["/", "/pos", "/customers", "/locations", "/settings", "/products"]) {
  pages.push({ path: p, status: (await fetch("http://127.0.0.1:8787" + p)).status });
}

console.log(JSON.stringify({
  customerTabs: { status: detail.status, invoices: (detail.json.data?.invoices || []).length >= 0, payments: Array.isArray(detail.json.data?.payments) },
  moves: moves.status,
  contents: contents.status,
  allowNeg: settings.json.settings?.allow_negative_stock ?? "missing",
  backup: bak.status,
  restoreNoConfirm: noConfirm.status,
  restore: restored.status,
  salesRestore: salesRestore.status,
  old,
  roles,
  pages,
}, null, 2));
