export type PlaceBits = {
  warehouse?: string | null;
  box?: string | null;
  rack?: string | null;
  shelf?: string | null;
  drawer?: string | null;
  location_name?: string | null;
  name?: string | null;
};

function clean(v: string | null | undefined) {
  return String(v || "").trim();
}

export function binText(p: Pick<PlaceBits, "rack" | "shelf" | "drawer">) {
  return [p.rack, p.shelf, p.drawer].map(clean).filter(Boolean).join("-");
}

export function placeLabel(p: PlaceBits) {
  const bits = [
    clean(p.warehouse),
    clean(p.box) ? `باكيه ${clean(p.box)}` : "",
    binText(p),
  ].filter(Boolean);
  if (bits.length) return bits.join(" · ");
  return clean(p.location_name || p.name);
}

export function lastSupplierName(p: { last_supplier_name?: string | null; supplier_name?: string | null }) {
  return clean(p.last_supplier_name || p.supplier_name);
}
