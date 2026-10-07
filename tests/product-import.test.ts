import assert from "node:assert/strict";
import test from "node:test";
import {
  PRODUCT_IMPORT_HEADERS,
  mergeAvgCost,
  parseProductGrid,
  parseProductWorkbook,
  productToImportCells,
  productsImportWorkbook,
} from "../worker/lib/product-import.ts";

function sampleGrid() {
  return [
    ["البضاعة"],
    [],
    [...PRODUCT_IMPORT_HEADERS],
    [1, "S-1", "شاشة", 2, "قطعة", 500, 100, 180, "111", "C1", "أصلي", "LCD", "سامسونج", "مورد أ", "10", "A+B+C"],
    [2, "S-1", "شاشة", 3, "قطعة", 500, 140, 180, "111", "C1", "أصلي", "LCD", "سامسونج", "مورد أ", "11", "D+E+F"],
  ];
}

test("sheet headers capture supplier, category, and separate avg vs last buy", () => {
  const rows = parseProductGrid(sampleGrid());
  assert.equal(rows.length, 2);
  assert.equal(rows[0].supplier, "مورد أ");
  assert.equal(rows[0].quality, "أصلي");
  assert.equal(rows[0].purchase_price, 100);
  assert.equal(rows[0].last_purchase_price, 180);
  assert.notEqual(rows[0].purchase_price, rows[0].last_purchase_price);
});

test("same sku on two bins stays as two location rows", () => {
  const rows = parseProductGrid(sampleGrid());
  assert.equal(rows[0].sku, rows[1].sku);
  assert.equal(rows[0].rack, "A");
  assert.equal(rows[1].rack, "D");
  assert.equal(rows[0].qty, 2);
  assert.equal(rows[1].qty, 3);
});

test("last purchase header is not swallowed by generic purchase price", () => {
  const rows = parseProductGrid([
    ["رقم الصنف", "اسم الصنف", "متوسط سعر الشراء", "آخر سعر شراء", "المورد", "التصنيف"],
    ["X", "قطعة", 70, 90, "الوزيري", "هاي كوبي"],
  ]);
  assert.equal(rows[0].purchase_price, 70);
  assert.equal(rows[0].last_purchase_price, 90);
  assert.equal(rows[0].supplier, "الوزيري");
  assert.equal(rows[0].quality, "هاي كوبي");
});

test("weighted average cost across locations", () => {
  assert.equal(mergeAvgCost(2, 100, 3, 200), 160);
});

test("empty classification and supplier stay empty (no fill-down)", () => {
  const rows = parseProductGrid([
    [...PRODUCT_IMPORT_HEADERS],
    [1, "147", "REL", 50, "قطعة", 200, 150, 100, "", "", "HERO OR", "شاشه", "ريلمي", "الحشاش", "2", "2"],
    [2, "4741", "IP 13", 50, "قطعة", 200, 150, 100, "", "", "", "ضهر", "ايفون", "", "2", "6"],
  ]);
  assert.equal(rows[0].quality, "HERO OR");
  assert.equal(rows[0].supplier, "الحشاش");
  assert.equal(rows[1].quality, "");
  assert.equal(rows[1].supplier, "");
});

test("workbook export does not put last buy into a #2 extra price slot", () => {
  const cells = productToImportCells({
    sku: "S-1",
    name_ar: "شاشة",
    available: 2,
    selling_price: 500,
    purchase_price: 100,
    last_purchase_price: 180,
    quality: "أصلي",
    supplier_name: "مورد أ",
  });
  assert.equal(cells[5], 100);
  assert.equal(cells[6], 180);
  const buf = productsImportWorkbook([cells]);
  const parsed = parseProductWorkbook(buf, "products.xlsx");
  assert.equal(parsed[0].purchase_price, 100);
  assert.equal(parsed[0].last_purchase_price, 180);
  assert.equal(parsed[0].supplier, "مورد أ");
  assert.equal(parsed[0].quality, "أصلي");
});
