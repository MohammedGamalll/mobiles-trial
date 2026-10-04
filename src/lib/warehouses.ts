export type LocationRow = {
  id: number;
  name: string;
  kind?: string;
  parent_id?: number | null;
  warehouse?: string;
  box?: string;
  rack?: string;
  shelf?: string;
  drawer?: string;
  path?: string;
  label?: string;
};

export function locationLabel(l?: Partial<LocationRow> | null) {
  if (!l) return "";
  return String(l.label || l.path || l.name || "").trim();
}

export function isWarehouseLocation(l: LocationRow) {
  return l.kind === "warehouse";
}

export function warehouseLocations(locations?: LocationRow[] | null) {
  return (locations || []).filter(isWarehouseLocation);
}

export function canonWarehouseName(name: string | null | undefined) {
  const n = String(name || "").trim();
  if (!n || n === "بدون مخزن") return n || "بدون مخزن";
  const k = n.toLowerCase().replace(/[_-]+/g, " ");
  if (k === "main warehouse" || k === "main" || n === "المخزن الرئيسي") return "المخزن الرئيسي";
  return n;
}

export function mergeWarehouseCards(rows?: { name?: string | null; stock_value?: number | string; units?: number | string }[]) {
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

export function appendLocationId(params: URLSearchParams, locationId?: number | string | null) {
  const id = Number(locationId || 0);
  if (id > 0) {
    params.set("location_id", String(id));
    params.delete("locations");
    params.delete("warehouse_id");
    params.delete("warehouse");
    params.delete("bay_id");
    params.delete("shelf_id");
    params.delete("bin_id");
    params.delete("fork_id");
  }
  return params;
}
