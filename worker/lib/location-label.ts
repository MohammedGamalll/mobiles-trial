export type LocationLabelRow = {
  id: number;
  name: string;
  parent_id?: number | null;
  kind?: string | null;
  warehouse?: string | null;
  box?: string | null;
  rack?: string | null;
  shelf?: string | null;
  drawer?: string | null;
};

function clean(v?: string | null) {
  return String(v || "").trim();
}

function aisleSegment(row: LocationLabelRow) {
  const name = clean(row.name);
  const box = clean(row.box);
  if (/باك/i.test(name)) return name;
  if (name) return `باكية ${name}`;
  if (box) return `باكية ${box}`;
  return "";
}

function leafSegment(row: LocationLabelRow) {
  const name = clean(row.name);
  if (name) return name;
  const bin = [row.rack, row.shelf, row.drawer].map(clean).filter(Boolean).join("-");
  return bin;
}

function segmentName(row: LocationLabelRow) {
  const k = String(row.kind || "");
  if (k === "warehouse") return clean(row.name) || clean(row.warehouse);
  if (k === "aisle" || k === "bay" || k === "zone") return aisleSegment(row);
  if (k === "shelf" || k === "bin") return leafSegment(row);
  if (!row.parent_id && !clean(row.box) && !clean(row.rack) && !clean(row.shelf) && !clean(row.drawer)) {
    return clean(row.name) || clean(row.warehouse);
  }
  if (clean(row.box) && !clean(row.rack) && !clean(row.shelf) && !clean(row.drawer) && !k) return aisleSegment(row);
  return leafSegment(row);
}

export function formatLocationLabel(row: LocationLabelRow, byId: Map<number, LocationLabelRow>) {
  const parts: string[] = [];
  const seen = new Set<number>();
  let cur: LocationLabelRow | undefined = row;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    const seg = segmentName(cur);
    if (seg && seg !== parts[0]) parts.unshift(seg);
    const pid = Number(cur.parent_id || 0);
    cur = pid > 0 ? byId.get(pid) : undefined;
  }
  if (parts.length > 1) return parts.join(" - ");

  const warehouse = clean(row.warehouse);
  const box = clean(row.box);
  const bin = [row.rack, row.shelf, row.drawer].map(clean).filter(Boolean).join("-");
  const fallback = [
    warehouse,
    box ? (/باك/i.test(box) ? box : `باكية ${box}`) : "",
    bin,
  ].filter(Boolean);
  if (fallback.length) {
    const name = clean(row.name);
    if (name && !fallback.includes(name) && fallback.length < 3) fallback.push(name);
    return fallback.join(" - ");
  }
  return parts[0] || clean(row.name);
}

export function withLocationLabels<T extends LocationLabelRow>(rows: T[]): (T & { label: string })[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return rows.map((r) => ({ ...r, label: formatLocationLabel(r, byId) }));
}
