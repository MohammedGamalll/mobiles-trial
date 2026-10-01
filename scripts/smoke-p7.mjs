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
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 40) }; }
  return { status: res.status, json, text };
};
const page = async (path) => {
  const res = await fetch("http://127.0.0.1:8787" + path);
  return { path, status: res.status };
};

const admin = await login("admin");
const h = admin.cookie;
const dash = await api(h, "/api/dashboard");
const aging = await api(h, "/api/reports/aging");
const compare = await api(h, "/api/reports/compare?from=2026-09-01&to=2026-09-23");
const sales = await api(h, "/api/reports/sales?from=2026-08-01&to=2026-09-23&group=agent");
const search = await api(h, "/api/search?q=INV");
const exp = await api(h, "/api/reports/export?kind=invoices&from=2026-01-01&to=2026-12-31");
const old = {
  dash: dash.status,
  accounts: (await api(h, "/api/accounts")).status,
  invoices: (await api(h, "/api/invoices?status=held")).status,
  products: (await api(h, "/api/products?pageSize=5")).status,
  ledger: (await api(h, "/api/ledger/accounts")).status,
  delivery: (await api(h, "/api/delivery/live")).status,
};
const roles = [];
for (const u of ["admin", "sales", "warehouse", "delivery", "accountant"]) roles.push((await login(u)).status);
const pages = [];
for (const p of ["/", "/login", "/pos", "/sales", "/products", "/reports", "/customers"]) pages.push(await page(p));

console.log(JSON.stringify({
  login: admin.status,
  old,
  aging: { status: aging.status, rows: aging.json.data?.length, buckets: aging.json.buckets },
  compare: { status: compare.status, current: compare.json.current, previous: compare.json.previous },
  salesAgent: sales.status,
  search: { status: search.status, invoices: search.json.invoices?.length, employees: search.json.employees?.length },
  export: { status: exp.status, csv: String(exp.text || "").startsWith("\uFEFF") || String(exp.text || "").includes("number") },
  dashboardCompare: { prev_sales: dash.json.prev_sales_month, profit_month: dash.json.profit_month },
  roles,
  pages,
}, null, 2));
