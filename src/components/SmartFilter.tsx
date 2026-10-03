import { useMemo, useState, type ReactNode } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useApp } from "../context";
import { DATE_PRESETS } from "../lib/filter-engine";
import { loadViews, removeView, saveView } from "../lib/shortcuts";
import { loadDefaultView, saveDefaultView, type ListQuery } from "../hooks/useListQuery";
import { Drawer, Field, SearchPick, inputCls } from "./ui";
import { ProductSuggestList, useProductSuggest } from "./ProductSuggest";
import { productDisplayName } from "../lib/product-suggest";
import type { Msg } from "../i18n";

export type FilterOption = { value: string; label: string };

export type FilterField = {
  key: string;
  label: Msg;
  type: "select" | "text" | "range" | "async" | "locations";
  quick?: boolean;
  options?: FilterOption[];
  lookup?: "brands" | "part_types" | "categories" | "models" | "suppliers" | "delivery_agents" | "payment_methods" | "branches" | "price_lists" | "locations";
  asyncPath?: string;
  asyncLabel?: (row: any) => string;
  minKey?: string;
  maxKey?: string;
  brandKey?: string;
};

const CHIP_PRESETS = ["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "last_3_months", "this_quarter", "this_year", "custom"] as const;

const PRESET_LABEL: Record<string, Msg> = {
  today: "today",
  yesterday: "yesterday",
  this_week: "thisWeek",
  last_week: "lastWeek",
  last_7: "last7",
  last_30: "last30",
  this_month: "thisMonth",
  last_month: "lastMonth",
  last_3_months: "last3Months",
  this_quarter: "thisQuarter",
  this_year: "thisYear",
  last_year: "lastYear",
  all: "allPeriods",
  day: "pickDay",
  week: "pickWeek",
  month: "pickMonth",
  year: "pickYear",
  custom: "customRange",
};

function locKind(kind?: string) {
  if (kind === "warehouse") return "warehouse";
  if (kind === "bay" || kind === "zone" || kind === "aisle") return "bay";
  if (kind === "shelf") return "shelf";
  if (kind === "bin" || kind === "fork" || kind === "drawer") return "bin";
  return "bin";
}

function descendants(all: any[], id: number) {
  const kids = new Map<number, number[]>();
  for (const r of all) {
    if (r.parent_id) {
      const list = kids.get(r.parent_id) || [];
      list.push(r.id);
      kids.set(r.parent_id, list);
    }
  }
  const out = new Set<number>([id]);
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of kids.get(cur) || []) {
      if (!out.has(c)) {
        out.add(c);
        stack.push(c);
      }
    }
  }
  return out;
}

export function EmptyFilterState({ onClear }: { onClear: () => void }) {
  const { tr } = useApp();
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-10 text-center">
      <div className="text-sm font-bold text-slate-500">{tr("noFilterResults")}</div>
      <button className="mt-3 rounded-xl bg-[var(--ink)] px-4 py-2 text-sm font-bold text-white" onClick={onClear}>
        {tr("clearAllFilters")}
      </button>
    </div>
  );
}

export function SmartFilter({
  f,
  fields: inputFields,
  date = true,
  search = true,
  searchPlaceholder,
  sorts,
  extra,
  children,
  suggestProducts,
  suggestRows,
}: {
  f: ListQuery;
  fields: FilterField[];
  date?: boolean;
  search?: boolean;
  searchPlaceholder?: string;
  sorts?: FilterOption[];
  extra?: ReactNode;
  children?: ReactNode;
  suggestProducts?: boolean;
  suggestRows?: any[];
}) {
  const { tr, lang, lookups } = useApp();
  const fields = inputFields.filter((field) => !(field.lookup === "branches" && (lookups?.branches?.length || 0) <= 1));
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState(() => loadViews(f.id));
  const [defaultOn] = useState(() => !!loadDefaultView(f.id));
  const productSuggest = useProductSuggest(f.q, !!suggestProducts, suggestRows);

  function pickProductSuggest(p: any) {
    const label = productDisplayName(p, lang);
    f.set("q", label);
    productSuggest.setOpen(false);
  }

  function searchBox(className: string) {
    return (
      <div className={`relative ${className}`}>
        <Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          className={`${inputCls} ps-9`}
          value={f.q}
          placeholder={searchPlaceholder || tr("searchCodeOrName")}
          autoComplete="off"
          onFocus={() => { productSuggest.cancelClose(); if (suggestProducts && f.q.trim()) productSuggest.setOpen(true); }}
          onBlur={() => productSuggest.scheduleClose()}
          onChange={(e) => { f.setQ(e.target.value); if (suggestProducts) productSuggest.setOpen(true); }}
          onKeyDown={(e) => {
            if (suggestProducts) productSuggest.onKeyDown(e, pickProductSuggest);
          }}
        />
        {suggestProducts ? (
          <ProductSuggestList
            hits={productSuggest.hits}
            open={productSuggest.open}
            hi={productSuggest.hi}
            onHover={productSuggest.setHi}
            onPick={pickProductSuggest}
          />
        ) : null}
      </div>
    );
  }

  const lookupOpts = (field: FilterField): FilterOption[] => {
    if (field.options) return field.options;
    if (!field.lookup || !lookups) return [];
    const rows: any[] = (lookups as any)[field.lookup] || [];
    let list = rows;
    if (field.lookup === "models" && f.values.brand_id) {
      list = rows.filter((m) => String(m.brand_id) === f.values.brand_id);
    }
    return list.map((r) => ({
      value: String(field.lookup === "payment_methods" ? r.code || r.id : r.id),
      label:
        field.lookup === "models"
          ? `${r.name}${r.code ? ` (${r.code})` : ""}`
          : field.lookup === "delivery_agents"
            ? `${r.code} — ${r.name}`
            : field.lookup === "locations"
              ? r.label || r.path || r.name
            : field.lookup === "suppliers" || field.lookup === "price_lists" || field.lookup === "branches"
              ? r.name || r.name_ar || r.path
              : lang === "ar"
                ? r.name_ar || r.name
                : r.name_en || r.name_ar || r.name,
    }));
  };

  const chips = useMemo(() => {
    const out: { key: string; label: string }[] = [];
    const v = f.values;
    if (v.period) out.push({ key: "period", label: tr(PRESET_LABEL[v.period] || "period") });
    if (v.day) out.push({ key: "day", label: v.day });
    if (v.week) out.push({ key: "week", label: `${tr("pickWeek")} ${v.week}` });
    if (v.month) out.push({ key: "month", label: v.month });
    if (v.year) out.push({ key: "year", label: v.year });
    if (v.from || v.to) out.push({ key: "from", label: `${v.from || ""} → ${v.to || ""}` });
    if (v.q) out.push({ key: "q", label: v.q });
    for (const field of fields) {
      if (field.type === "range") {
        const a = v[field.minKey || `${field.key}_min`];
        const b = v[field.maxKey || `${field.key}_max`];
        if (a || b) out.push({ key: field.minKey || field.key, label: `${tr(field.label)} ${a || "…"}–${b || "…"}` });
        continue;
      }
      if (field.type === "locations") {
        for (const k of ["warehouse_id", "bay_id", "shelf_id", "bin_id"] as const) {
          if (v[k]) {
            const loc = lookups?.locations.find((x) => String(x.id) === v[k]);
            out.push({ key: k, label: loc?.label || loc?.name || v[k] });
          }
        }
        continue;
      }
      if (field.type === "async" && v[field.key]) {
        const nameKey = `${field.key.replace(/_id$/, "")}_name`;
        out.push({ key: field.key, label: `${tr(field.label)}: ${v[nameKey] || v[field.key]}` });
        continue;
      }
      if (v[field.key]) {
        const opt = lookupOpts(field).find((o) => o.value === v[field.key]);
        out.push({ key: field.key, label: `${tr(field.label)}: ${opt?.label || v[field.key]}` });
      }
    }
    if (v.sort) out.push({ key: "sort", label: (sorts || []).find((s) => s.value === v.sort)?.label || v.sort });
    return out;
  }, [f.values, fields, lang, lookups, sorts, tr]);

  function renderSelect(field: FilterField, cls = inputCls) {
    return (
      <select className={cls} value={f.values[field.key] || ""} onChange={(e) => f.set(field.key, e.target.value)}>
        <option value="">{tr(field.label)}</option>
        {lookupOpts(field).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  function renderField(field: FilterField, inDrawer = false) {
    if (field.type === "select") return renderSelect(field);
    if (field.type === "text") {
      return <input className={inputCls} value={f.values[field.key] || ""} placeholder={tr(field.label)} onChange={(e) => f.set(field.key, e.target.value)} />;
    }
    if (field.type === "range") {
      const minK = field.minKey || `${field.key}_min`;
      const maxK = field.maxKey || `${field.key}_max`;
      return (
        <div className="grid grid-cols-2 gap-2">
          <input className={inputCls} type="number" placeholder={tr("fromValue")} value={f.values[minK] || ""} onChange={(e) => f.set(minK, e.target.value)} />
          <input className={inputCls} type="number" placeholder={tr("toValue")} value={f.values[maxK] || ""} onChange={(e) => f.set(maxK, e.target.value)} />
        </div>
      );
    }
    if (field.type === "async") {
      const nameKey = `${field.key.replace(/_id$/, "")}_name`;
      return (
        <SearchPick
          path={field.asyncPath || "/api/customers"}
          labelOf={field.asyncLabel || ((r) => r.name || r.name_ar || r.number || String(r.id))}
          valueId={f.values[field.key] || ""}
          valueLabel={f.values[nameKey] || ""}
          placeholder={tr(field.label)}
          subtitle={field.asyncPath?.includes("/customers") ? (r) => [r.phone, r.area, r.city].filter(Boolean).join(" · ") : undefined}
          onPick={(row, label) => f.setMany({ [field.key]: row ? String(row.id) : "", [nameKey]: label })}
        />
      );
    }
    if (field.type === "locations") {
      const locs = lookups?.locations || [];
      const wh = Number(f.values.warehouse_id || 0);
      const bay = Number(f.values.bay_id || 0);
      const shelf = Number(f.values.shelf_id || 0);
      const underWh = wh ? descendants(locs, wh) : null;
      const underBay = bay ? descendants(locs, bay) : underWh;
      const underShelf = shelf ? descendants(locs, shelf) : underBay;
      const warehouses = locs.filter((l) => locKind(l.kind) === "warehouse");
      const bays = locs.filter((l) => locKind(l.kind) === "bay" && (!underWh || underWh.has(l.id)));
      const shelves = locs.filter((l) => locKind(l.kind) === "shelf" && (!underBay || underBay.has(l.id)));
      const bins = locs.filter((l) => locKind(l.kind) === "bin" && (!underShelf || underShelf.has(l.id)));
      const box = inDrawer ? "space-y-2" : "flex flex-wrap gap-2";
      return (
        <div className={box}>
          <select className={inputCls} value={f.values.warehouse_id || ""} onChange={(e) => f.setMany({ warehouse_id: e.target.value, bay_id: "", shelf_id: "", bin_id: "" })}>
            <option value="">{tr("warehouse")}</option>
            {warehouses.map((l) => <option key={l.id} value={l.id}>{l.label || l.path || l.name}</option>)}
          </select>
          <select className={inputCls} value={f.values.bay_id || ""} onChange={(e) => f.setMany({ bay_id: e.target.value, shelf_id: "", bin_id: "" })}>
            <option value="">{tr("bay")}</option>
            {bays.map((l) => <option key={l.id} value={l.id}>{l.label || l.path || l.name}</option>)}
          </select>
          <select className={inputCls} value={f.values.shelf_id || ""} onChange={(e) => f.setMany({ shelf_id: e.target.value, bin_id: "" })}>
            <option value="">{tr("shelf")}</option>
            {shelves.map((l) => <option key={l.id} value={l.id}>{l.label || l.path || l.name}</option>)}
          </select>
          <select className={inputCls} value={f.values.bin_id || ""} onChange={(e) => f.set("bin_id", e.target.value)}>
            <option value="">{tr("fork")}</option>
            {bins.map((l) => <option key={l.id} value={l.id}>{l.label || l.path || l.name}</option>)}
          </select>
        </div>
      );
    }
    return null;
  }

  const quick = fields.filter((x) => x.quick);
  const rest = fields.filter((x) => !x.quick);
  const period = f.values.period || "";

  const form = (
    <>
      {search ? searchBox("min-w-[220px] flex-1") : null}
      {date ? (
        <select className={`${inputCls} w-auto min-w-[140px]`} value={period} onChange={(e) => {
          const p = e.target.value;
          f.setMany({ period: p, day: "", week: "", month: "", year: "", from: "", to: "" });
        }}>
          <option value="">{tr("period")}</option>
          {DATE_PRESETS.map((p) => (
            <option key={p} value={p}>{tr(PRESET_LABEL[p])}</option>
          ))}
        </select>
      ) : null}
      {period === "day" ? <input className={inputCls} type="date" value={f.values.day || ""} onChange={(e) => f.set("day", e.target.value)} /> : null}
      {period === "week" ? <input className={inputCls} type="date" value={f.values.week || ""} onChange={(e) => f.set("week", e.target.value)} /> : null}
      {period === "month" ? <input className={inputCls} type="month" value={f.values.month || ""} onChange={(e) => f.set("month", e.target.value)} /> : null}
      {period === "year" ? <input className={inputCls} type="number" min={2000} max={2100} placeholder={tr("pickYear")} value={f.values.year || ""} onChange={(e) => f.set("year", e.target.value)} /> : null}
      {period === "custom" ? (
        <>
          <input className={inputCls} type="date" value={f.values.from || ""} onChange={(e) => f.set("from", e.target.value)} />
          <input className={inputCls} type="date" value={f.values.to || ""} onChange={(e) => f.set("to", e.target.value)} />
        </>
      ) : null}
      {quick.map((field) => (
        <div key={field.key} className="min-w-[140px]">{renderField(field)}</div>
      ))}
      {sorts?.length ? (
        <select className={`${inputCls} w-auto min-w-[140px]`} value={f.values.sort || ""} onChange={(e) => f.set("sort", e.target.value)}>
          <option value="">{tr("sortBy")}</option>
          {sorts.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      ) : null}
      {extra}
      {rest.length ? (
        <button type="button" className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-bold" onClick={() => setOpen(true)}>
          <SlidersHorizontal className="h-4 w-4" />
          {tr("moreFilters")}
          {f.count ? <span className="rounded-full bg-cyan-700 px-1.5 text-[10px] text-white">{f.count}</span> : null}
        </button>
      ) : null}
    </>
  );

  return (
    <div className="no-print mb-3 space-y-2">
      {date ? (
        <div className="period-chips">
          {CHIP_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className={`period-chip ${period === p ? "is-on" : ""}`}
              onClick={() => f.setMany({ period: p, day: "", week: "", month: "", year: "", from: "", to: "" })}
            >
              {tr(PRESET_LABEL[p])}
            </button>
          ))}
        </div>
      ) : null}
      <div className="filter-bar smart-filter hidden flex-wrap items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm md:flex">
        {form}
      </div>
      <div className="md:hidden">
        <div className="flex gap-2">
          {search ? searchBox("flex-1") : null}
          <button type="button" className="rounded-xl bg-[var(--ink)] px-3 py-2 text-sm font-bold text-white" onClick={() => setOpen(true)}>
            {tr("filter")}{f.count ? ` (${f.count})` : ""}
          </button>
        </div>
      </div>
      {chips.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button key={c.key} type="button" className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold dark:bg-slate-800" onClick={() => {
              if (c.key === "from") f.setMany({ from: "", to: "" });
              else if (c.key === "q") { f.setQ(""); f.set("q", ""); }
              else f.set(c.key, "");
            }}>
              {c.label} <X className="h-3 w-3" />
            </button>
          ))}
          <button type="button" className="text-xs font-bold text-rose-600" onClick={f.clear}>{tr("clearAllFilters")}</button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {views.map((v) => (
          <button key={v.name} type="button" className="rounded-full bg-teal-50 px-2 py-1 font-bold text-teal-800" onClick={() => f.setMany({ ...v.value })}>
            {v.name}
            <span className="ms-1 text-slate-400" onClick={(e) => { e.stopPropagation(); setViews(removeView(f.id, v.name)); }}>×</span>
          </button>
        ))}
        <button type="button" className="font-bold text-cyan-700" onClick={() => {
          const name = prompt(tr("saveFilter"));
          if (!name) return;
          setViews(saveView(f.id, name, f.values));
        }}>{tr("saveFilter")}</button>
        <button type="button" className="font-bold text-slate-500" onClick={() => { saveDefaultView(f.id, f.values); }}>{defaultOn ? tr("defaultView") : tr("setDefaultView")}</button>
      </div>
      {children}
      <Drawer open={open} title={tr("advancedFilters")} onClose={() => setOpen(false)} wide>
        <div className="grid gap-3 md:grid-cols-2">
          {date ? (
            <Field label={tr("period")}>
              <select className={inputCls} value={period} onChange={(e) => f.setMany({ period: e.target.value, day: "", week: "", month: "", year: "", from: "", to: "" })}>
                <option value="">{tr("period")}</option>
                {DATE_PRESETS.map((p) => <option key={p} value={p}>{tr(PRESET_LABEL[p])}</option>)}
              </select>
            </Field>
          ) : null}
          {fields.map((field) => (
            <Field key={field.key} label={tr(field.label)}>{renderField(field, true)}</Field>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" className="flex-1 rounded-xl border px-3 py-2 text-sm font-bold" onClick={() => { f.clear(); }}>{tr("clearAllFilters")}</button>
          <button type="button" className="flex-1 rounded-xl bg-[var(--ink)] px-3 py-2 text-sm font-bold text-white" onClick={() => setOpen(false)}>{tr("applyFilters")}</button>
        </div>
      </Drawer>
    </div>
  );
}
