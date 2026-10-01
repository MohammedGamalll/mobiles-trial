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
  tree: (await api(h, "/api/inventory/locations/tree")).status,
  transfers: (await api(h, "/api/inventory/transfers")).status,
};
const lists = await api(h, "/api/price-lists");
const compare = await api(h, "/api/supplier-prices");
const prods = await api(h, "/api/products?pageSize=5&price_list_id=2");
const svc = (await api(h, "/api/products?kind=service&pageSize=5")).json.data?.[0];
const hold = await api(h, "/api/invoices", {
  method: "POST",
  body: JSON.stringify({
    hold: true,
    type: "normal",
    tax_rate: 14,
    items: [{ product_id: svc.id, quantity: 1, unit_price: svc.selling_price }],
  }),
});
const sale = await api(h, "/api/invoices", {
  method: "POST",
  body: JSON.stringify({
    type: "normal",
    tax_rate: 14,
    payments: [{ method: "cash", amount: 50 }, { method: "card", amount: 30 }],
    items: [{ product_id: svc.id, quantity: 1, unit_price: svc.selling_price }],
  }),
});
const fin = hold.json.data?.id ? await api(h, `/api/invoices/${hold.json.data.id}/finalize`, { method: "POST", body: "{}" }) : { status: 0, json: hold.json };
const purch = await api(h, "/api/inventory/purchases");
const draft = (purch.json.data || []).find((p) => p.status === "draft");
let wf = null;
if (draft) {
  const sub = await api(h, `/api/inventory/purchases/${draft.id}/submit`, { method: "POST", body: "{}" });
  wf = { submit: sub.status };
}
const roles = [];
for (const u of ["admin", "sales", "warehouse", "delivery", "accountant"]) roles.push((await login(u)).status);

console.log(JSON.stringify({
  old,
  lists: lists.status,
  listCount: lists.json.data?.length,
  compare: compare.status,
  wholesalePrices: prods.status,
  hold: { status: hold.status, number: hold.json.data?.number, tax: hold.json.data?.tax_amount, err: hold.json.error },
  sale: { status: sale.status, number: sale.json.data?.number, tax: sale.json.data?.tax_amount, paid: sale.json.data?.paid, pays: sale.json.data?.payments?.length, err: sale.json.error },
  finalize: { status: fin.status, st: fin.json.data?.status, err: fin.json.error },
  purchaseWf: wf,
  roles,
}, null, 2));
