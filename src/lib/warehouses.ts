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
  if (l.kind === "warehouse") return true;
  if (Number(l.parent_id || 0)) return false;
  if (l.kind && l.kind !== "warehouse") return false;
  return !(l.box || l.rack || l.shelf || l.drawer);
}

export function warehouseLocations(locations?: LocationRow[] | null) {
  return (locations || []).filter(isWarehouseLocation);
}

export function appendLocationId(params: URLSearchParams, locationId?: number | string | null) {
  const id = Number(locationId || 0);
  if (id > 0) params.set("location_id", String(id));
  return params;
}
