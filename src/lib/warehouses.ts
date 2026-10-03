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
