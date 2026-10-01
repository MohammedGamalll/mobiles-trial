const login = async (u) => {
  const res = await fetch("http://127.0.0.1:8787/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: u, password: "1234" }),
  });
  const cookie = (res.headers.getSetCookie?.()[0] || res.headers.get("set-cookie") || "").split(";")[0];
  return { status: res.status, cookie, json: await res.json() };
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
const old = {
  dash: (await api(h, "/api/dashboard")).status,
  products: (await api(h, "/api/products?pageSize=5")).status,
  delivery: (await api(h, "/api/delivery/orders")).status,
  live: (await api(h, "/api/delivery/live")).status,
  tree: (await api(h, "/api/inventory/locations/tree")).status,
  lists: (await api(h, "/api/price-lists")).status,
};
const reps = await api(h, "/api/reps?month=2026-09");
const visits = await api(h, "/api/visits");
const targets = await api(h, "/api/targets?month=2026-09");
const comms = await api(h, "/api/commissions?month=2026-09");
const karim = (reps.json.data || []).find((a) => a.code === "201");
const visit = await api(h, "/api/visits", {
  method: "POST",
  body: JSON.stringify({ agent_id: karim?.id, customer_name: "زيارة تجربة", purpose: "متابعة", result: "done", date: "2026-09-23" }),
});
const svc = (await api(h, "/api/products?kind=service&pageSize=5")).json.data?.[0];
const sale = await api(h, "/api/invoices", {
  method: "POST",
  body: JSON.stringify({
    type: "normal",
    sales_agent_id: karim?.id,
    items: [{ product_id: svc.id, quantity: 1, unit_price: svc.selling_price }],
  }),
});
const after = await api(h, `/api/reps/${karim?.id}?month=2026-09`);
const commAfter = (after.json.data?.commissions || []).find((c) => c.invoice_id === sale.json.data?.id);
const roles = [];
for (const u of ["admin", "sales", "warehouse", "delivery", "accountant"]) roles.push((await login(u)).status);

console.log(JSON.stringify({
  old,
  reps: { status: reps.status, count: reps.json.data?.length },
  visits: { status: visits.status, count: visits.json.data?.length },
  targets: { status: targets.status, count: targets.json.data?.length },
  commissions: { status: comms.status, count: comms.json.data?.length },
  newVisit: visit.status,
  sale: { status: sale.status, number: sale.json.data?.number, agent: sale.json.data?.sales_agent_id, err: sale.json.error },
  accrued: commAfter ? { amount: commAfter.amount, rate: commAfter.rate } : null,
  roles,
}, null, 2));
