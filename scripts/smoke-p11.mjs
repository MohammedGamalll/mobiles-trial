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
const dash = await api(h, "/api/dashboard");
const prod = (await api(h, "/api/products?pageSize=1")).json.data?.[0];
const offer = await api(h, "/api/offers", {
  method: "POST",
  body: JSON.stringify({ product_id: prod.id, min_qty: 2, discount_type: "percent", discount_value: 5, name: "smoke" }),
});
const offers = await api(h, "/api/offers");
const cats = (await api(h, "/api/expense-categories")).json.data?.[0];
const exp = await api(h, "/api/expenses", {
  method: "POST",
  body: JSON.stringify({ category_id: cats?.id || 1, amount: 10, description: "p11", cost_center: "فرع عباس", recurring: 1, recur_every_days: 30 }),
});
const listExp = await api(h, "/api/expenses");
const created = (listExp.json.data || []).find((e) => e.description === "p11");
const old = {
  dash: dash.status,
  quote: (await api(h, "/api/invoices?status=quote")).status,
  branches: (await api(h, "/api/branches")).status,
  ledger: (await api(h, "/api/ledger/accounts")).status,
};
const roles = [];
for (const u of ["admin", "sales", "warehouse", "delivery", "accountant"]) roles.push((await login(u)).status);
const pages = [];
for (const p of ["/", "/pos", "/sales", "/products", "/expenses", "/settings"]) {
  pages.push({ path: p, status: (await fetch("http://127.0.0.1:8787" + p)).status });
}

console.log(JSON.stringify({
  command: {
    cash: dash.json.cash_balance != null,
    collections: dash.json.collections_today != null,
    present: dash.json.present_now != null,
    dead: dash.json.dead_stock != null,
    approvals: dash.json.pending_approvals != null,
  },
  offer: offer.status,
  offers: offers.status,
  offerCount: (offers.json.data || []).length,
  expense: exp.status,
  recurring: created?.recurring,
  costCenter: created?.cost_center,
  old,
  roles,
  pages,
}, null, 2));
