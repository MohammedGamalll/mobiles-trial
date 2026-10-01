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
const prod = (await api(h, "/api/products?pageSize=5")).json.data?.[0];
const serial = await api(h, "/api/serials", {
  method: "POST",
  body: JSON.stringify({ product_id: prod.id, serials: [`SN-P13-${Date.now()}`] }),
});
const listS = await api(h, `/api/serials?product_id=${prod.id}`);
const cheque = await api(h, "/api/cheques", {
  method: "POST",
  body: JSON.stringify({ number: `CH-${Date.now()}`, direction: "in", party_type: "customer", party_name: "عميل فحص", amount: 50, due_date: "2026-10-01" }),
});
const cheques = await api(h, "/api/cheques");
const daily = await api(h, "/api/reports/daily");
const expA = await api(h, "/api/reports/expenses");
const purA = await api(h, "/api/reports/purchases");
const asof = await api(h, "/api/reports/stock-asof");
const prices = await api(h, "/api/price-updates", {
  method: "POST",
  body: JSON.stringify({ items: [{ id: prod.id, selling_price: prod.selling_price }] }),
});
const notes = await api(h, "/api/invoices?q=smoke");
const old = {
  dash: (await api(h, "/api/dashboard")).status,
  quote: (await api(h, "/api/invoices?status=quote")).status,
  ledger: (await api(h, "/api/ledger/accounts")).status,
};
const roles = [];
for (const u of ["admin", "sales", "warehouse", "delivery", "accountant"]) roles.push((await login(u)).status);
const pages = [];
for (const p of ["/", "/pos", "/serials", "/cheques", "/installments", "/reports", "/sales"]) {
  pages.push({ path: p, status: (await fetch("http://127.0.0.1:8787" + p)).status });
}
const salesSerials = await api(sales.cookie, "/api/serials");

console.log(JSON.stringify({
  serial: serial.status,
  serials: listS.status,
  cheque: cheque.status,
  chequeCount: (cheques.json.data || []).length,
  daily: daily.status,
  expenses: expA.status,
  purchases: purA.status,
  asof: asof.status,
  asofValue: asof.json.value != null,
  prices: prices.status,
  notesSearch: notes.status,
  salesSerials: salesSerials.status,
  old,
  roles,
  pages,
}, null, 2));
