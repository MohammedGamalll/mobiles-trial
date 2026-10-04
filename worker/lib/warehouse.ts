const MAIN = "المخزن الرئيسي";

export function canonWarehouseName(name: string | null | undefined) {
  const n = String(name || "").trim();
  if (!n || n === "بدون مخزن") return n || "بدون مخزن";
  const k = n.toLowerCase().replace(/[_-]+/g, " ");
  if (k === "main warehouse" || k === "main" || n === MAIN) return MAIN;
  return n;
}

export function mergeWarehouseStats<T extends { name?: string | null; stock_value?: number | string; units?: number | string }>(rows: T[]) {
  const map = new Map<string, { name: string; stock_value: number; units: number }>();
  for (const row of rows || []) {
    const name = canonWarehouseName(row.name);
    const cur = map.get(name) || { name, stock_value: 0, units: 0 };
    cur.stock_value += Number(row.stock_value || 0);
    cur.units += Number(row.units || 0);
    map.set(name, cur);
  }
  return [...map.values()];
}
