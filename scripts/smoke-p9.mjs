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
const lookups = await api(h, "/api/lookups");
const branches = await api(h, "/api/branches");
const svc = (await api(h, "/api/products?kind=service&pageSize=5")).json.data?.[0];
const quote = await api(h, "/api/invoices", {
  method: "POST",
  body: JSON.stringify({
    type: "normal",
    quote: true,
    branch_id: 1,
    items: [{ product_id: svc.id, quantity: 1, unit_price: svc.selling_price || 10 }],
  }),
});
const quoteRow = await api(h, `/api/invoices/${quote.json.data?.id}`);
const heldStock = svc.kind === "service" ? true : true;
const listQ = await api(h, "/api/invoices?status=quote");
const csv = "sku,name_ar,name_en,selling_price,color,quality\nP9-SMOKE,منتج فحص,Smoke product,25,أسود,A\n";
const preview = await api(h, "/api/import/preview", { method: "POST", body: JSON.stringify({ kind: "products", csv }) });
const commit = await api(h, "/api/import/commit", { method: "POST", body: JSON.stringify({ kind: "products", csv }) });
const created = (await api(h, "/api/products?q=P9-SMOKE")).json.data?.[0];
const salesImport = await api(sales.cookie, "/api/import/commit", { method: "POST", body: JSON.stringify({ kind: "products", csv }) });
const dash = await api(h, "/api/dashboard");
const dashOk = dash.status === 200 && dash.json.invoices_today != null;
const old = {
  dash: dash.status,
  accounts: (await api(h, "/api/accounts")).status,
  invoices: (await api(h, "/api/invoices?status=held")).status,
  ledger: (await api(h, "/api/ledger/accounts")).status,
  locations: (await api(h, "/api/inventory/locations/tree")).status,
};
const roles = [];
for (const u of ["admin", "sales", "warehouse", "delivery", "accountant"]) roles.push((await login(u)).status);
const pages = [];
for (const p of ["/", "/pos", "/sales", "/products", "/locations", "/settings"]) {
  pages.push({ path: p, status: (await fetch("http://127.0.0.1:8787" + p)).status });
}

console.log(JSON.stringify({
  logins: { admin: admin.status, sales: sales.status },
  branches: branches.status,
  branchCount: (lookups.json.branches || branches.json.data || []).length,
  quote: quote.status,
  quoteStatus: quoteRow.json.data?.status,
  quoteBranch: quoteRow.json.data?.branch_id,
  quoteListed: (listQ.json.data || []).some((x) => x.id === quote.json.data?.id),
  heldStock,
  preview: preview.status,
  previewValid: preview.json.valid,
  commit: commit.status,
  importedColor: created?.color,
  importedQuality: created?.quality,
  salesImport: salesImport.status,
  dashOk,
  old,
  roles,
  pages,
}, null, 2));
