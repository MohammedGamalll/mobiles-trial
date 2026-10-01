export type FilterValues = Record<string, string>;

export const DATE_PRESETS = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "last_7",
  "last_30",
  "this_month",
  "last_month",
  "last_3_months",
  "this_quarter",
  "this_year",
  "last_year",
  "all",
  "day",
  "week",
  "month",
  "year",
  "custom",
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number];

export const FILTER_SKIP = new Set([
  "page",
  "pageSize",
  "customer_name",
  "supplier_name",
  "product_name",
  "employee_name",
  "agent_name",
  "user_name",
]);

export function valuesFromSearch(sp: URLSearchParams, defaults: FilterValues = {}): FilterValues {
  const out: FilterValues = { ...defaults };
  sp.forEach((v, k) => {
    if (v) out[k] = v;
  });
  return out;
}

export function searchFromValues(values: FilterValues) {
  const p = new URLSearchParams();
  Object.entries(values).forEach(([k, v]) => {
    if (v != null && String(v).trim() !== "") p.set(k, String(v).trim());
  });
  return p;
}

export function activeFilterCount(values: FilterValues) {
  return Object.entries(values).filter(([k, v]) => v && !FILTER_SKIP.has(k) && k !== "sort").length;
}

export function isoToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
