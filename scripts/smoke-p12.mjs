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
const h = admin.cookie;
const prod = (await api(h, "/api/products?pageSize=20")).json.data?.find((p) => p.kind !== "service") || (await api(h, "/api/products?pageSize=1")).json.data?.[0];
const before = await api(h, `/api/products/${prod.id}`);
const stockBefore = before.json.data?.current_stock;
const order = await api(h, "/api/invoices", {
  method: "POST",
  body: JSON.stringify({
    type: "normal",
    order: true,
    branch_id: 1,
    items: [{ product_id: prod.id, quantity: 1, unit_price: prod.selling_price || 10 }],
  }),
});
const after = await api(h, `/api/products/${prod.id}`);
const orderRow = await api(h, `/api/invoices/${order.json.data?.id}`);
const listO = await api(h, "/api/invoices?status=order");
const dashMonth = await api(h, "/api/dashboard?period=month");
const dashToday = await api(h, "/api/dashboard?period=today");
const dashWeek = await api(h, "/api/dashboard?period=week");
const dashYear = await api(h, "/api/dashboard?period=year");
const y = new Date().getFullYear();
const offerPast = await api(h, "/api/offers", {
  method: "POST",
  body: JSON.stringify({
    product_id: prod.id,
    min_qty: 3,
    discount_type: "percent",
    discount_value: 8,
    name: "p12-past",
    valid_from: "2020-01-01",
    valid_to: "2020-01-31",
  }),
});
const offerNow = await api(h, "/api/offers", {
  method: "POST",
  body: JSON.stringify({
    product_id: prod.id,
    min_qty: 2,
    discount_type: "percent",
    discount_value: 4,
    name: "p12-now",
    valid_from: `${y}-01-01`,
    valid_to: `${y}-12-31`,
  }),
});
const offers = await api(h, "/api/offers");
const offerNames = (offers.json.data || []).map((o) => o.name);
const patched = await api(h, `/api/products/${prod.id}`, {
  method: "PUT",
  body: JSON.stringify({
    sku: prod.sku,
    name_ar: prod.name_ar,
    name_en: prod.name_en,
    selling_price: prod.selling_price,
    purchase_price: prod.purchase_price,
    wholesale_price: prod.wholesale_price,
    min_selling_price: prod.min_selling_price,
    min_stock: prod.min_stock,
    kind: prod.kind || "product",
    active: 1,
    unit: "علبة",
    reorder_point: 7,
  }),
});
const afterPatch = await api(h, `/api/products/${prod.id}`);
const restore = await api(h, "/api/backup/x/restore", { method: "POST", body: JSON.stringify({}) });
const old = {
  dash: dashMonth.status,
  quote: (await api(h, "/api/invoices?status=quote")).status,
  branches: (await api(h, "/api/branches")).status,
  ledger: (await api(h, "/api/ledger/accounts")).status,
  reports: (await api(h, "/api/reports/sales?from=2020-01-01&to=2030-12-31")).status,
};
const roles = [];
for (const u of ["admin", "sales", "warehouse", "delivery", "accountant"]) roles.push((await login(u)).status);
const pages = [];
for (const p of ["/", "/pos", "/sales", "/products", "/reports", "/reps/visits", "/settings"]) {
  pages.push({ path: p, status: (await fetch("http://127.0.0.1:8787" + p)).status });
}

console.log(JSON.stringify({
  order: order.status,
  orderStatus: orderRow.json.data?.status,
  orderListed: (listO.json.data || []).some((x) => x.id === order.json.data?.id),
  stockUnchanged: stockBefore === after.json.data?.current_stock,
  period: {
    month: dashMonth.json.period,
    today: dashToday.json.period,
    week: dashWeek.json.period,
    year: dashYear.json.period,
    from: dashMonth.json.period_from,
    to: dashMonth.json.period_to,
  },
  offerPast: offerPast.status,
  offerNow: offerNow.status,
  pastHidden: !offerNames.includes("p12-past"),
  nowVisible: offerNames.includes("p12-now"),
  patched: patched.status,
  unit: afterPatch.json.data?.unit,
  reorder: afterPatch.json.data?.reorder_point,
  restoreNoConfirm: restore.status,
  old,
  roles,
  pages,
}, null, 2));
