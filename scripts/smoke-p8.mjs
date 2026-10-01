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
const warehouse = await login("warehouse");
const h = admin.cookie;
const svc = (await api(h, "/api/products?kind=service&pageSize=5")).json.data?.[0];
const full = (await api(h, `/api/products/${svc.id}`)).json.data;
const edited = await api(h, `/api/products/${svc.id}`, {
  method: "PUT",
  body: JSON.stringify({
    sku: full.sku,
    barcode: full.barcode,
    part_number: full.part_number,
    name_ar: full.name_ar,
    name_en: full.name_en,
    brand_id: full.brand_id,
    part_type_id: full.part_type_id,
    category_id: full.category_id,
    location_id: full.location_id,
    supplier_id: full.supplier_id,
    purchase_price: full.purchase_price,
    selling_price: full.selling_price,
    wholesale_price: full.wholesale_price,
    min_selling_price: 999,
    min_stock: full.min_stock,
    kind: full.kind || "service",
    model_ids: (full.models || []).map((m) => m.id || m),
  }),
});
const blocked = await api(sales.cookie, "/api/invoices", {
  method: "POST",
  body: JSON.stringify({ type: "normal", items: [{ product_id: svc.id, quantity: 1, unit_price: 1 }] }),
});
await api(h, `/api/products/${svc.id}`, {
  method: "PUT",
  body: JSON.stringify({
    sku: full.sku, name_ar: full.name_ar, name_en: full.name_en,
    purchase_price: full.purchase_price, selling_price: full.selling_price,
    wholesale_price: full.wholesale_price, min_selling_price: full.min_selling_price || 0,
    min_stock: full.min_stock, kind: full.kind || "service",
    brand_id: full.brand_id, part_type_id: full.part_type_id, category_id: full.category_id,
    location_id: full.location_id, supplier_id: full.supplier_id,
  }),
});
const audit = await api(h, "/api/audit?action=edit_product");
const approvals = await api(h, "/api/approvals");
const whApprovals = await api(warehouse.cookie, "/api/approvals");
const bak = await api(h, "/api/backup", { method: "POST" });
const list = await api(h, "/api/backup");
const salesBak = await api(sales.cookie, "/api/backup");
const old = {
  dash: (await api(h, "/api/dashboard")).status,
  accounts: (await api(h, "/api/accounts")).status,
  invoices: (await api(h, "/api/invoices?status=held")).status,
  ledger: (await api(h, "/api/ledger/accounts")).status,
  delivery: (await api(h, "/api/delivery/live")).status,
  reports: (await api(h, "/api/reports/aging")).status,
};
const roles = [];
for (const u of ["admin", "sales", "warehouse", "delivery", "accountant"]) roles.push((await login(u)).status);
const pages = [];
for (const p of ["/", "/audit", "/users", "/settings", "/pos", "/sales"]) {
  pages.push({ path: p, status: (await fetch("http://127.0.0.1:8787" + p)).status });
}

console.log(JSON.stringify({
  login: admin.status,
  old,
  productEdit: edited.status,
  salesBlockedBelowMin: { status: blocked.status, error: blocked.json.error },
  auditOldNew: Boolean((audit.json.data || []).find((a) => a.old_value && a.new_value)),
  approvals: { admin: approvals.status, count: approvals.json.count, warehouse: whApprovals.status },
  backup: { create: bak.status, file: bak.json.filename, list: list.status, salesForbidden: salesBak.status },
  roles,
  pages,
}, null, 2));
