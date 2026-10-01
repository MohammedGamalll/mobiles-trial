import mysql from "mysql2/promise";

const API = "http://127.0.0.1:8787";
const findings = [];
function rec(name, ok, detail) {
  findings.push({ name, ok, detail });
  console.log(`${ok ? "OK" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

async function login(username) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "1234" }),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`login ${username} ${JSON.stringify(data)}`);
  return data;
}

async function req(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

const db = await mysql.createConnection({
  host: "127.0.0.1",
  user: "root",
  password: "motamayez",
  database: "motamayez",
  dateStrings: true,
});
async function q(sql, params = []) {
  const [rows] = await db.execute(sql, params);
  return rows;
}

const wh = await login("warehouse");
const sales = await login("sales");
const T = wh.token;
rec("warehouse has products.delete", wh.user.permissions.includes("products.delete"), "");

const sku = `FIX-${Date.now()}`;
const created = await req(T, "POST", "/api/products", {
  sku,
  name_ar: "منتج إصلاح مخزن",
  selling_price: 100,
  purchase_price: 40,
  opening_qty: 5,
  location_id: 6,
  kind: "product",
});
rec("create product opening", created.status === 201, `${created.status}`);
const pid = created.data?.id;
if (pid) {
  const batch = (await q("SELECT location_id, remaining_qty FROM inventory_batches WHERE product_id=?", [pid]))[0];
  rec("opening batch location_id=6", Number(batch?.location_id) === 6, JSON.stringify(batch));
}

const dup = await req(T, "POST", "/api/products", { sku, name_ar: "تكرار" });
rec("duplicate sku 400", dup.status === 400 && dup.data?.error === "duplicate_sku", `${dup.status} ${JSON.stringify(dup.data)}`);

const emptySup = await req(T, "POST", "/api/inventory/purchases", {
  items: [{ product_id: pid, quantity: 1, unit_cost: 10 }],
});
rec("purchase no supplier 400", emptySup.status === 400 && emptySup.data?.error === "supplier_required", `${emptySup.status}`);

const zeroQty = await req(T, "POST", "/api/inventory/purchases", {
  supplier_id: 1,
  items: [{ product_id: pid, quantity: 0, unit_cost: 10 }],
});
rec("qty 0 purchase 400", zeroQty.status === 400 && zeroQty.data?.error === "invalid_qty", `${zeroQty.status}`);

const po = await req(T, "POST", "/api/inventory/purchases", {
  supplier_id: 1,
  items: [{ product_id: pid, quantity: 3, unit_cost: 40 }],
});
rec("create purchase draft", po.status === 201, `${po.status}`);
const poId = po.data?.id;
if (poId) {
  await req(T, "POST", `/api/inventory/purchases/${poId}/submit`, {});
  const appr = await req(T, "POST", `/api/inventory/purchases/${poId}/approve`, {});
  rec("approve purchase", appr.status === 200, `${appr.status}`);
  const stock = Number((await q("SELECT current_stock FROM products WHERE id=?", [pid]))[0].current_stock);
  rec("stock after approve = 8", stock === 8, `stock=${stock}`);
  const v = await req(T, "POST", `/api/inventory/purchases/${poId}/void`, {});
  rec("void intact approved", v.status === 200, `${v.status} ${JSON.stringify(v.data)}`);
  const stock2 = Number((await q("SELECT current_stock FROM products WHERE id=?", [pid]))[0].current_stock);
  rec("void reversed stock to 5", stock2 === 5, `stock=${stock2}`);
}

const po2 = await req(T, "POST", "/api/inventory/purchases", {
  supplier_id: 1,
  items: [{ product_id: pid, quantity: 2, unit_cost: 40 }],
});
if (po2.data?.id) {
  await req(T, "POST", `/api/inventory/purchases/${po2.data.id}/submit`, {});
  await req(T, "POST", `/api/inventory/purchases/${po2.data.id}/approve`, {});
  const b = (await q("SELECT id, remaining_qty FROM inventory_batches WHERE purchase_id=?", [po2.data.id]))[0];
  await req(T, "POST", "/api/inventory/transfers", {
    from_location_id: 6,
    to_location_id: 7,
    items: [{ product_id: pid, batch_id: b.id, qty: 1 }],
  }).then(async (trn) => {
    if (trn.data?.id) await req(T, "POST", `/api/inventory/transfers/${trn.data.id}/complete`, {});
  });
  const v2 = await req(T, "POST", `/api/inventory/purchases/${po2.data.id}/void`, {});
  rec("void after transfer 400", v2.status === 400 && v2.data?.error === "stock_already_consumed", `${v2.status} ${JSON.stringify(v2.data)}`);
}

const adj = await req(T, "POST", "/api/inventory/adjust", { product_id: pid, qty: 2, reason: "fix-verify" });
rec("adjust +2", adj.status === 200, `${adj.status}`);
const adjB = (await q("SELECT location_id, remaining_qty, notes FROM inventory_batches WHERE product_id=? AND notes='fix-verify' ORDER BY id DESC LIMIT 1", [pid]))[0];
rec("adjust batch location_id=6", Number(adjB?.location_id) === 6, JSON.stringify(adjB));

const st = await req(T, "POST", "/api/inventory/stocktakes", { location_id: 6 });
if (st.data?.id) {
  const early = await req(T, "POST", `/api/inventory/stocktakes/${st.data.id}/approve`, {});
  rec("approve draft 400", early.status === 400 && early.data?.error === "not_submitted", `${early.status} ${JSON.stringify(early.data)}`);
  await req(T, "POST", `/api/inventory/stocktakes/${st.data.id}/submit`, {});
  const okAp = await req(T, "POST", `/api/inventory/stocktakes/${st.data.id}/approve`, {});
  rec("approve submitted", okAp.status === 200, `${okAp.status}`);
}

const self = await req(T, "PUT", "/api/inventory/locations/9", { name: "تيست بن", kind: "bin", parent_id: 9 });
rec("parent=self 400", self.status === 400 && self.data?.error === "invalid_parent", `${self.status}`);

const delMain = await req(T, "DELETE", "/api/inventory/locations/6");
rec("delete MAIN with stock 400", delMain.status === 400 && delMain.data?.error === "location_has_stock", `${delMain.status} ${JSON.stringify(delMain.data)}`);

const delP = await req(T, "DELETE", `/api/products/${pid}`);
rec("warehouse can soft-delete", delP.status === 200, `${delP.status}`);
const listed = await req(T, "GET", `/api/inventory/batches?q=${sku}`);
rec("deleted product hidden from batches", !(listed.data?.data || []).some((b) => b.product_id === pid), "");

const salesPo = await req(sales.token, "GET", "/api/inventory/purchases?pageSize=1");
rec("sales purchases 403", salesPo.status === 403, `${salesPo.status}`);

await db.end();
const fail = findings.filter((f) => !f.ok);
console.log(`\n${findings.length - fail.length}/${findings.length} passed`);
if (fail.length) process.exit(1);
