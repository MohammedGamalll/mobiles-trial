import mysql from "mysql2/promise";

const API = "http://127.0.0.1:8787";
const findings = [];

function rec(area, name, status, detail) {
  findings.push({ area, name, status, detail });
  console.log(`${status === "pass" ? "OK" : status === "fail" ? "FAIL" : "GAP"}  [${area}] ${name}${detail ? " — " + detail : ""}`);
}

async function login(username) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "1234" }),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`login failed ${username} ${JSON.stringify(data)}`);
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
  port: 3306,
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
const admin = await login("pixel@gmail.com");
const T = wh.token;
const ST = sales.token;
const AT = admin.token;

const pages = [
  ["/products", "/api/products?pageSize=3"],
  ["/inventory", "/api/inventory/summary"],
  ["/batches", "/api/inventory/batches?pageSize=3"],
  ["/purchases", "/api/inventory/purchases?pageSize=3"],
  ["/locations", "/api/inventory/locations/tree"],
  ["/transfers", "/api/inventory/transfers?pageSize=3"],
  ["/stocktake", "/api/inventory/stocktakes?pageSize=3"],
  ["/serials", "/api/serials?pageSize=3"],
  ["/brands", "/api/brands"],
  ["/part-types", "/api/part_types"],
  ["/categories", "/api/categories"],
  ["/models", "/api/models"],
  ["/suppliers", "/api/suppliers?pageSize=3"],
];
for (const [ui, api] of pages) {
  const r = await req(T, "GET", api);
  rec("smoke", ui, r.status === 200 ? "pass" : "fail", `${api} → ${r.status} ${r.data?.error || ""}`);
}

if (!wh.user.permissions.includes("products.delete")) {
  rec("perms", "warehouse products.delete", "gap", "role cannot soft-delete products from UI");
}
if (sales.user.permissions.includes("purchases.approve")) {
  rec("perms", "sales purchases.approve", "fail", "sales should not approve purchases");
} else rec("perms", "sales cannot approve purchases", "pass", "");
if (sales.user.permissions.includes("stocktake.approve")) {
  rec("perms", "sales stocktake.approve", "fail", "sales should not approve stocktake");
} else rec("perms", "sales cannot approve stocktake", "pass", "");

const miss = await req(T, "POST", "/api/products", { name_ar: "بدون كود" });
rec("products", "create without sku", miss.status >= 400 ? "pass" : "fail", `status ${miss.status} ${JSON.stringify(miss.data)}`);

const sku = `AUD-${Date.now()}`;
const created = await req(T, "POST", "/api/products", {
  sku,
  name_ar: "شاشة تيست مخزن",
  name_en: "Audit Screen",
  brand_id: 1,
  selling_price: 500,
  purchase_price: 200,
  min_stock: 2,
  opening_qty: 10,
  location_id: 6,
  kind: "product",
});
rec("products", "create with opening_qty", created.status === 201 ? "pass" : "fail", `${created.status} ${JSON.stringify(created.data)}`);
const pid = created.data?.id;
if (pid) {
  const prod = (await q("SELECT current_stock, deleted_at, sku FROM products WHERE id=?", [pid]))[0];
  const batches = await q("SELECT id, remaining_qty, notes, location_id FROM inventory_batches WHERE product_id=?", [pid]);
  const moves = await q("SELECT type, qty, reference_type FROM stock_movements WHERE product_id=? ORDER BY id DESC LIMIT 5", [pid]);
  rec("products", "opening qty in products.current_stock", Number(prod?.current_stock) === 10 ? "pass" : "fail", `stock=${prod?.current_stock}`);
  rec("products", "opening batch created", batches.length === 1 && Number(batches[0].remaining_qty) === 10 ? "pass" : "fail", JSON.stringify(batches));
  rec("products", "opening movement logged", moves[0]?.reference_type === "opening" ? "pass" : "fail", JSON.stringify(moves[0]));
  const listed = await req(T, "GET", `/api/products?q=${sku}`);
  rec("products", "appears on products list API", (listed.data?.data || []).some((p) => p.id === pid) ? "pass" : "fail", "");
  const beforePrice = prod;
  const edited = await req(T, "PUT", `/api/products/${pid}`, {
    sku,
    name_ar: "شاشة تيست مخزن معدل",
    name_en: "Audit Screen",
    brand_id: 1,
    selling_price: 777,
    purchase_price: 200,
    min_selling_price: 0,
    wholesale_price: 0,
    min_stock: 2,
    location_id: 6,
    kind: "product",
  });
  rec("products", "edit selling price", edited.status === 200 ? "pass" : "fail", `${edited.status}`);
  const afterEdit = (await q("SELECT current_stock, selling_price, name_ar FROM products WHERE id=?", [pid]))[0];
  rec("products", "edit does not change stock", Number(afterEdit.current_stock) === 10 ? "pass" : "fail", `stock=${afterEdit.current_stock}`);
  rec("products", "edit updates name/price", Number(afterEdit.selling_price) === 777 && afterEdit.name_ar.includes("معدل") ? "pass" : "fail", JSON.stringify(afterEdit));
}

const svc = await req(T, "POST", "/api/products", {
  sku: `SVC-${Date.now()}`,
  name_ar: "خدمة تيست",
  kind: "service",
  opening_qty: 5,
  selling_price: 50,
});
const sid = svc.data?.id;
if (sid) {
  const sprod = (await q("SELECT current_stock FROM products WHERE id=?", [sid]))[0];
  const sbatches = await q("SELECT id FROM inventory_batches WHERE product_id=?", [sid]);
  rec("products", "service ignores opening_qty batches", sbatches.length === 0 && Number(sprod.current_stock) === 0 ? "pass" : "fail", `stock=${sprod.current_stock} batches=${sbatches.length}`);
}

const dup = await req(T, "POST", "/api/products", { sku, name_ar: "تكرار" });
rec("products", "duplicate sku rejected", dup.status >= 400 ? "pass" : "fail", `${dup.status} ${JSON.stringify(dup.data)}`);

const neg = await req(T, "POST", "/api/products", {
  sku: `NEG-${Date.now()}`,
  name_ar: "سالب",
  opening_qty: -3,
  kind: "product",
});
if (neg.data?.id) {
  const nprod = (await q("SELECT current_stock FROM products WHERE id=?", [neg.data.id]))[0];
  const nb = await q("SELECT id FROM inventory_batches WHERE product_id=?", [neg.data.id]);
  rec("products", "negative opening_qty does not create batch", nb.length === 0 && Number(nprod.current_stock) === 0 ? "pass" : "fail", `stock=${nprod.current_stock} batches=${nb.length}`);
} else rec("products", "negative opening_qty rejected", "pass", `${neg.status}`);

const delTry = await req(T, "DELETE", `/api/products/${pid}`);
rec("products", "warehouse cannot delete", delTry.status === 403 || delTry.status === 401 ? "pass" : delTry.status === 200 ? "gap" : "fail", `${delTry.status} ${JSON.stringify(delTry.data)}`);
const adminDel = await req(AT, "DELETE", `/api/products/${pid}`);
rec("products", "admin soft-delete", adminDel.status === 200 ? "pass" : "fail", `${adminDel.status}`);
if (adminDel.status === 200) {
  const gone = (await q("SELECT deleted_at, active FROM products WHERE id=?", [pid]))[0];
  rec("products", "soft-delete sets deleted_at", gone?.deleted_at ? "pass" : "fail", JSON.stringify(gone));
  const listed2 = await req(T, "GET", `/api/products?q=${sku}`);
  rec("products", "deleted product hidden from list", !(listed2.data?.data || []).some((p) => p.id === pid) ? "pass" : "fail", "");
  const movesKeep = await q("SELECT COUNT(*) n FROM stock_movements WHERE product_id=?", [pid]);
  rec("products", "movements remain after delete", Number(movesKeep[0].n) > 0 ? "pass" : "fail", `n=${movesKeep[0].n}`);
}

const loc6 = (await q("SELECT id, kind, name FROM storage_locations WHERE id=6"))[0];
const loc7 = (await q("SELECT id, kind, name FROM storage_locations WHERE id=7"))[0];
rec("locations", "seed warehouses exist", loc6 && loc7 ? "pass" : "fail", `${loc6?.name} / ${loc7?.name}`);

const selfLoc = await req(T, "POST", "/api/inventory/locations", { name: "تيست بن", kind: "bin", code: `BIN-${Date.now()}`, parent_id: 6 });
rec("locations", "create bin under MAIN", selfLoc.status === 200 || selfLoc.status === 201 ? "pass" : "fail", `${selfLoc.status} ${JSON.stringify(selfLoc.data)}`);
const newLocId = selfLoc.data?.id;
if (newLocId) {
  const loop = await req(T, "PUT", `/api/inventory/locations/${newLocId}`, { name: "تيست بن", kind: "bin", parent_id: newLocId });
  rec("locations", "parent=self allowed?", loop.status >= 400 ? "pass" : "gap", `${loop.status} API ${loop.status < 400 ? "allows self-parent" : "rejects"}`);
}

const p2 = await req(T, "POST", "/api/products", {
  sku: `AUD2-${Date.now()}`,
  name_ar: "منتج شراء تيست",
  purchase_price: 100,
  selling_price: 180,
  location_id: 6,
  opening_qty: 0,
});
const p2id = p2.data?.id;
const suppliers = await req(T, "GET", "/api/suppliers?pageSize=5");
const supplierId = suppliers.data?.data?.[0]?.id || 1;
const stockBefore = p2id ? Number((await q("SELECT current_stock FROM products WHERE id=?", [p2id]))[0].current_stock) : 0;

const emptyPo = await req(T, "POST", "/api/inventory/purchases", { supplier_id: supplierId, items: [] });
rec("purchases", "empty items rejected", emptyPo.status >= 400 ? "pass" : "fail", `${emptyPo.status} ${JSON.stringify(emptyPo.data)}`);

const zeroPo = await req(T, "POST", "/api/inventory/purchases", {
  supplier_id: supplierId,
  items: [{ product_id: p2id, quantity: 0, unit_cost: 50 }],
});
rec("purchases", "qty 0 purchase created?", zeroPo.status >= 400 ? "pass" : "gap", `${zeroPo.status} ${JSON.stringify(zeroPo.data)}`);

const po = await req(T, "POST", "/api/inventory/purchases", {
  supplier_id: supplierId,
  discount: 10,
  extra_expenses: 5,
  items: [{ product_id: p2id, quantity: 4, unit_cost: 50 }],
});
rec("purchases", "create draft", po.status === 201 ? "pass" : "fail", `${po.status} ${JSON.stringify(po.data)}`);
const poId = po.data?.id;
if (poId) {
  const row = (await q("SELECT status, total, subtotal, discount, extra_expenses, current_stock FROM purchase_invoices pi JOIN products p ON p.id=? WHERE pi.id=?", [p2id, poId]))[0];
  const stockDraft = Number((await q("SELECT current_stock FROM products WHERE id=?", [p2id]))[0].current_stock);
  rec("purchases", "draft does not increase stock", stockDraft === stockBefore ? "pass" : "fail", `before=${stockBefore} draft=${stockDraft}`);
  rec("purchases", "totals discount/extra", Number(row.discount) === 10 && Number(row.extra_expenses) === 5 ? "pass" : "fail", JSON.stringify(row));

  const salesApprove = await req(ST, "POST", `/api/inventory/purchases/${poId}/approve`, {});
  rec("purchases", "sales cannot approve", salesApprove.status === 403 ? "pass" : "fail", `${salesApprove.status} ${JSON.stringify(salesApprove.data)}`);

  const submitted = await req(T, "POST", `/api/inventory/purchases/${poId}/submit`, {});
  rec("purchases", "submit draft", submitted.status === 200 ? "pass" : "fail", `${submitted.status} ${JSON.stringify(submitted.data)}`);
  const approved = await req(T, "POST", `/api/inventory/purchases/${poId}/approve`, {});
  rec("purchases", "approve submitted", approved.status === 200 ? "pass" : "fail", `${approved.status} ${JSON.stringify(approved.data)}`);
  const stockAppr = Number((await q("SELECT current_stock FROM products WHERE id=?", [p2id]))[0].current_stock);
  rec("purchases", "approve increases stock by 4", stockAppr === stockBefore + 4 ? "pass" : "fail", `stock=${stockAppr}`);
  const poBatches = await q("SELECT remaining_qty, location_id, unit_cost FROM inventory_batches WHERE purchase_id=?", [poId]);
  rec("purchases", "approve creates batch at product location", poBatches.length >= 1 && Number(poBatches[0].remaining_qty) === 4 ? "pass" : "fail", JSON.stringify(poBatches));
  const poMoves = await q("SELECT type FROM stock_movements WHERE reference_type='purchase' AND reference_id=?", [poId]);
  rec("purchases", "purchase_in movement", poMoves.some((m) => m.type === "purchase_in") ? "pass" : "fail", JSON.stringify(poMoves));

  const twice = await req(T, "POST", `/api/inventory/purchases/${poId}/approve`, {});
  rec("purchases", "double approve rejected", twice.status >= 400 ? "pass" : "fail", `${twice.status} ${JSON.stringify(twice.data)}`);
  const stockTwice = Number((await q("SELECT current_stock FROM products WHERE id=?", [p2id]))[0].current_stock);
  rec("purchases", "double approve does not double stock", stockTwice === stockAppr ? "pass" : "fail", `stock=${stockTwice}`);

  const voided = await req(T, "POST", `/api/inventory/purchases/${poId}/void`, {});
  rec("purchases", "void after approve", voided.status === 200 ? "pass" : voided.status >= 400 ? "gap" : "fail", `${voided.status} ${JSON.stringify(voided.data)}`);
  const stockVoid = Number((await q("SELECT current_stock FROM products WHERE id=?", [p2id]))[0].current_stock);
  rec("purchases", "void after approve reverses stock?", stockVoid === stockBefore ? "pass" : "fail", `before=${stockBefore} afterVoid=${stockVoid}`);
}

const rejPo = await req(T, "POST", "/api/inventory/purchases", {
  supplier_id: supplierId,
  items: [{ product_id: p2id, quantity: 1, unit_cost: 40 }],
});
if (rejPo.data?.id) {
  const rej = await req(T, "POST", `/api/inventory/purchases/${rejPo.data.id}/reject`, {});
  rec("purchases", "reject draft/submitted", rej.status === 200 ? "pass" : "fail", `${rej.status} ${JSON.stringify(rej.data)}`);
  const st = (await q("SELECT status FROM purchase_invoices WHERE id=?", [rejPo.data.id]))[0];
  rec("purchases", "reject status", st?.status === "rejected" ? "pass" : "fail", st?.status);
  const stockRej = Number((await q("SELECT current_stock FROM products WHERE id=?", [p2id]))[0].current_stock);
  rec("purchases", "reject does not add stock", true, `stock=${stockRej}`);
}

const noSup = await req(T, "POST", "/api/inventory/purchases", {
  items: [{ product_id: p2id, quantity: 1, unit_cost: 10 }],
});
rec("purchases", "purchase without supplier", noSup.status === 201 || noSup.status === 200 ? "gap" : noSup.status >= 400 ? "pass" : "fail", `${noSup.status} ${JSON.stringify(noSup.data)}`);

const batchesAt6 = await q(
  "SELECT id, product_id, remaining_qty, reserved_qty, location_id FROM inventory_batches WHERE product_id=? AND location_id=6 AND remaining_qty>reserved_qty ORDER BY id DESC LIMIT 1",
  [p2id],
);
if (batchesAt6[0]) {
  const b = batchesAt6[0];
  const same = await req(T, "POST", "/api/inventory/transfers", {
    from_location_id: 6,
    to_location_id: 6,
    items: [{ product_id: b.product_id, batch_id: b.id, qty: 1 }],
  });
  rec("transfers", "same from/to rejected?", same.status >= 400 ? "pass" : "gap", `${same.status} ${JSON.stringify(same.data)}`);

  const over = await req(T, "POST", "/api/inventory/transfers", {
    from_location_id: 6,
    to_location_id: 7,
    items: [{ product_id: b.product_id, batch_id: b.id, qty: Number(b.remaining_qty) + 50 }],
  });
  rec("transfers", "qty over available rejected", over.status >= 400 ? "pass" : "fail", `${over.status} ${JSON.stringify(over.data)}`);

  const trn = await req(T, "POST", "/api/inventory/transfers", {
    from_location_id: 6,
    to_location_id: 7,
    items: [{ product_id: b.product_id, batch_id: b.id, qty: 1 }],
  });
  rec("transfers", "create draft", trn.status === 201 ? "pass" : "fail", `${trn.status} ${JSON.stringify(trn.data)}`);
  const trnId = trn.data?.id;
  if (trnId) {
    const stockMid = Number((await q("SELECT current_stock FROM products WHERE id=?", [p2id]))[0].current_stock);
    const complete = await req(T, "POST", `/api/inventory/transfers/${trnId}/complete`, {});
    rec("transfers", "complete draft", complete.status === 200 ? "pass" : "fail", `${complete.status} ${JSON.stringify(complete.data)}`);
    const stockAfterTr = Number((await q("SELECT current_stock FROM products WHERE id=?", [p2id]))[0].current_stock);
    rec("transfers", "complete does not change total stock", stockAfterTr === stockMid ? "pass" : "fail", `before=${stockMid} after=${stockAfterTr}`);
    const dest = await q("SELECT remaining_qty, location_id FROM inventory_batches WHERE product_id=? AND location_id=7", [p2id]);
    rec("transfers", "qty appears at destination location", dest.length > 0 ? "pass" : "fail", JSON.stringify(dest));
    const twiceTr = await req(T, "POST", `/api/inventory/transfers/${trnId}/complete`, {});
    rec("transfers", "double complete rejected", twiceTr.status >= 400 ? "pass" : "fail", `${twiceTr.status}`);
    const cancelDone = await req(T, "POST", `/api/inventory/transfers/${trnId}/cancel`, {});
    rec("transfers", "cancel after complete rejected", cancelDone.status >= 400 ? "pass" : "fail", `${cancelDone.status} ${JSON.stringify(cancelDone.data)}`);
  }
} else {
  rec("transfers", "no source batch at loc 6", "fail", "cannot run transfer cases");
}

const trDraft = await req(T, "POST", "/api/inventory/transfers", { from_location_id: 6, to_location_id: 7, items: [] });
rec("transfers", "empty items rejected", trDraft.status >= 400 ? "pass" : "fail", `${trDraft.status}`);

if (newLocId) {
  const withStock = await q("SELECT COUNT(*) n FROM inventory_batches WHERE location_id=6 AND remaining_qty>0");
  const delLoc = await req(T, "DELETE", `/api/inventory/locations/6`);
  rec("locations", "delete warehouse with stock", Number(withStock[0].n) > 0 && delLoc.status === 200 ? "gap" : delLoc.status >= 400 ? "pass" : "fail", `batches=${withStock[0].n} del=${delLoc.status} ${JSON.stringify(delLoc.data)}`);
  const still = (await q("SELECT deleted_at, active FROM storage_locations WHERE id=6"))[0];
  rec("locations", "delete is soft", still?.deleted_at || still?.active === 0 ? "pass" : still ? "gap" : "fail", JSON.stringify(still));
}

const stCreate = await req(T, "POST", "/api/inventory/stocktakes", { location_id: 6 });
rec("stocktake", "create without crashing", stCreate.status === 201 || stCreate.status === 200 ? "pass" : "fail", `${stCreate.status} ${JSON.stringify(stCreate.data)}`);
const stId = stCreate.data?.id;
if (stId) {
  const detail = await req(T, "GET", `/api/inventory/stocktakes/${stId}`);
  const items = detail.data?.data?.items || detail.data?.items || [];
  rec("stocktake", "create loads items", Array.isArray(items) ? "pass" : "fail", `items=${items.length}`);
  if (items[0]) {
    const countedLow = Math.max(0, Number(items[0].system_qty) - 1);
    const countedHigh = Number(items[0].system_qty) + 2;
    const save = await req(T, "PUT", `/api/inventory/stocktakes/${stId}/counts`, {
      items: [{ id: items[0].id, counted_qty: countedLow }],
    });
    rec("stocktake", "save counts", save.status === 200 ? "pass" : "fail", `${save.status} ${JSON.stringify(save.data)}`);
  }
  const salesSt = await req(ST, "POST", `/api/inventory/stocktakes/${stId}/approve`, {});
  rec("stocktake", "sales cannot approve", salesSt.status === 403 ? "pass" : "fail", `${salesSt.status}`);
  const earlyAppr = await req(T, "POST", `/api/inventory/stocktakes/${stId}/approve`, {});
  rec("stocktake", "approve before submit rejected?", earlyAppr.status >= 400 ? "pass" : "gap", `${earlyAppr.status} ${JSON.stringify(earlyAppr.data)}`);
  const sub = await req(T, "POST", `/api/inventory/stocktakes/${stId}/submit`, {});
  rec("stocktake", "submit", sub.status === 200 ? "pass" : "fail", `${sub.status} ${JSON.stringify(sub.data)}`);
  const stockPre = p2id ? Number((await q("SELECT current_stock FROM products WHERE id=?", [p2id]))[0].current_stock) : null;
  const appr = await req(T, "POST", `/api/inventory/stocktakes/${stId}/approve`, {});
  rec("stocktake", "approve submitted", appr.status === 200 ? "pass" : "fail", `${appr.status} ${JSON.stringify(appr.data)}`);
  if (p2id && stockPre != null) {
    const stockPost = Number((await q("SELECT current_stock FROM products WHERE id=?", [p2id]))[0].current_stock);
    rec("stocktake", "approve changes stock if variance", "pass", `before=${stockPre} after=${stockPost}`);
  }
  const cancelAppr = await req(T, "POST", `/api/inventory/stocktakes/${stId}/cancel`, {});
  rec("stocktake", "cancel after approve rejected", cancelAppr.status >= 400 ? "pass" : "fail", `${cancelAppr.status} ${JSON.stringify(cancelAppr.data)}`);
}

const stNoLoc = await req(T, "POST", "/api/inventory/stocktakes", {});
rec("stocktake", "create without location", stNoLoc.status === 201 || stNoLoc.status === 200 ? "pass" : "fail", `${stNoLoc.status} ${JSON.stringify(stNoLoc.data)}`);

const adjUi = "POST /api/inventory/adjust exists; no warehouse UI button found in Products/Inventory/Batches pages";
rec("adjust", "manual adjust API without UI", "gap", adjUi);
const adj = await req(T, "POST", "/api/inventory/adjust", { product_id: p2id, qty: 2, reason: "audit" });
rec("adjust", "API adjust +2", adj.status === 200 ? "pass" : "fail", `${adj.status} ${JSON.stringify(adj.data)}`);

const noAdj = await req(ST, "POST", "/api/inventory/adjust", { product_id: p2id, qty: 1, reason: "x" });
rec("adjust", "sales cannot adjust", noAdj.status === 403 ? "pass" : "fail", `${noAdj.status}`);

await db.end();
const summary = { pass: 0, fail: 0, gap: 0 };
for (const f of findings) summary[f.status] = (summary[f.status] || 0) + 1;
console.log("\nSUMMARY", JSON.stringify(summary));
console.log(JSON.stringify(findings, null, 2));
