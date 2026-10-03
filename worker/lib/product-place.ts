import type { AppDb } from "./db";

export type PlaceInput = {
  warehouse?: string | null;
  box?: string | null;
  rack?: string | null;
  shelf?: string | null;
  drawer?: string | null;
  locationId?: number | null;
};

export function placeLabel(p: PlaceInput & { location_name?: string | null; name?: string | null }) {
  const bin = [p.rack, p.shelf, p.drawer].filter((x) => String(x || "").trim()).join("-");
  const bits = [
    String(p.warehouse || "").trim(),
    String(p.box || "").trim() ? `باكيه ${String(p.box).trim()}` : "",
    bin,
  ].filter(Boolean);
  if (bits.length) return bits.join(" · ");
  return String(p.location_name || p.name || "").trim();
}

export async function resolveProductPlace(db: AppDb, opts: PlaceInput) {
  const warehouse = String(opts.warehouse || "").trim();
  const box = String(opts.box || "").trim();
  const rack = String(opts.rack || "").trim();
  const shelf = String(opts.shelf || "").trim();
  const drawer = String(opts.drawer || "").trim();
  const locationId = Number(opts.locationId || 0) || null;
  if (locationId) return locationId;
  const hasPlace = !!(warehouse || box || rack || shelf || drawer);
  if (!hasPlace) return null;
  const wh = warehouse || "المخزن الرئيسي";
  const found = await db
    .prepare(
      `SELECT id FROM storage_locations
       WHERE deleted_at IS NULL
         AND IFNULL(warehouse,'') = ?
         AND IFNULL(box,'') = ?
         AND IFNULL(rack,'') = ?
         AND IFNULL(shelf,'') = ?
         AND IFNULL(drawer,'') = ?
       LIMIT 1`,
    )
    .bind(wh, box, rack, shelf, drawer)
    .first<{ id: number }>();
  if (found?.id) return found.id;
  const name = placeLabel({ warehouse: wh, box, rack, shelf, drawer });
  const ins = await db
    .prepare("INSERT INTO storage_locations (name, warehouse, rack, shelf, drawer, box, active) VALUES (?, ?, ?, ?, ?, ?, 1)")
    .bind(name, wh, rack || null, shelf || null, drawer || null, box || null)
    .run();
  return ins.meta.last_row_id;
}
