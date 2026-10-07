import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Building2, ChevronDown, Layers3, Plus, Rows3 } from "lucide-react";
import { useApp } from "../context";
import { get, post, put, del } from "../lib/api";
import { money, num, statusClass, statusLabel } from "../lib/format";
import { Btn, ErrorNote, Field, Modal, PrintBtn, PrintLetterhead, Stat, inputCls } from "../components/ui";
import { useActionError } from "../lib/errors";
import { ListGate } from "../components/ListGate";
import { EmptyFilterState, SmartFilter } from "../components/SmartFilter";
import { useListQuery } from "../hooks/useListQuery";
import { useLiveList } from "../hooks/useLiveList";
import { Barcode } from "../components/Barcode";
import { ActionBtns, useConfirm } from "../components/Confirm";
import { playSound } from "../lib/sounds";
import { isWarehouseLocation } from "../lib/warehouses";

const KINDS = ["warehouse", "zone", "aisle", "bay", "shelf", "bin"] as const;

function productName(row: any, lang: string) {
  return (lang === "ar" ? row.name_ar : row.name_en) || row.name_ar || row.name_en || "";
}

function productType(row: any, lang: string) {
  return (lang === "ar" ? row.part_type_ar : row.part_type_en) || row.part_type_ar || row.part_type_en || "";
}

function productBrand(row: any, lang: string) {
  return (lang === "ar" ? row.brand_ar : row.brand_en) || row.brand_ar || row.brand_en || "";
}

function productCategory(row: any, lang: string) {
  return (lang === "ar" ? row.category_ar : row.category_en) || row.category_ar || row.category_en || "";
}

function lineVarianceValue(row: any) {
  if (row.counted_qty == null) return null;
  const cost = Number(row.unit_cost || 0);
  return Math.round(Math.abs(Number(row.system_qty || 0) - Number(row.counted_qty)) * cost * 100) / 100;
}

function sumStocktakeKpis(rows: any[]) {
  return rows.reduce(
    (acc, r) => {
      acc.expected_qty += Number(r.expected_qty || 0);
      acc.actual_qty += Number(r.actual_qty || 0);
      acc.shortage_qty += Number(r.shortage_qty || 0);
      acc.surplus_qty += Number(r.surplus_qty || 0);
      acc.shortage_value += Number(r.shortage_value || 0);
      acc.surplus_value += Number(r.surplus_value || 0);
      return acc;
    },
    { expected_qty: 0, actual_qty: 0, shortage_qty: 0, surplus_qty: 0, shortage_value: 0, surplus_value: 0 },
  );
}

function ReconKpis({ totals, lang, tr }: { totals: ReturnType<typeof sumStocktakeKpis>; lang: string; tr: (k: any) => string }) {
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Stat label={tr("expectedStock")} value={num(totals.expected_qty, lang)} />
      <Stat label={tr("actualStock")} value={num(totals.actual_qty, lang)} accent="indigo" />
      <Stat label={tr("shortage")} value={num(totals.shortage_qty, lang)} accent="rose" />
      <Stat label={`${tr("shortage")} · ${tr("varianceValue")}`} value={money(totals.shortage_value, lang)} accent="rose" />
      <Stat label={tr("surplus")} value={num(totals.surplus_qty, lang)} accent="emerald" />
      <Stat label={`${tr("surplus")} · ${tr("varianceValue")}`} value={money(totals.surplus_value, lang)} accent="emerald" />
    </div>
  );
}

function Page({ title, action, children }: { title: string; action?: any; children: any }) {
  return (
    <div>
      <PrintLetterhead title={title} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{title}</h1>
        <div className="no-print flex flex-wrap items-center gap-2">
          {action}
          <PrintBtn />
        </div>
      </div>
      {children}
    </div>
  );
}

function Table({ cols, rows }: { cols: any[]; rows: any[][] }) {
  const { tr } = useApp();
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="table-wrap overflow-x-auto">
        <table className="min-w-[720px]">
          <thead>
            <tr>{cols.map((c, i) => <th key={i}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={cols.length} className="py-8 text-center text-slate-400">{tr("noData")}</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type LocRole = "warehouse" | "aisle" | "shelf";

type LocNode = {
  key: string;
  id: number | null;
  name: string;
  role: LocRole;
  row: any | null;
  children: LocNode[];
  box?: string;
  warehouseName?: string;
};

function locRole(row: any): LocRole {
  const k = String(row.kind || "");
  if (k === "warehouse") return "warehouse";
  if (k === "aisle" || k === "bay" || k === "zone") return "aisle";
  if (k === "shelf" || k === "bin") return "shelf";
  if (isWarehouseLocation(row)) return "warehouse";
  if (String(row.box || "").trim() && !row.rack && !row.shelf && !row.drawer) return "aisle";
  return "shelf";
}

function nodeValue(node: LocNode): number {
  const own = Number(node.row?.stock_value || 0);
  return own + node.children.reduce((s, c) => s + nodeValue(c), 0);
}

function filterForest(nodes: LocNode[], q: string, kind: string, warehouseId: number): LocNode[] {
  return nodes.flatMap((n) => {
    if (n.role === "warehouse" && warehouseId && n.id && n.id !== warehouseId) return [];
    const kids = filterForest(n.children, q, kind, warehouseId);
    const hay = [n.name, n.row?.code, n.row?.path, n.row?.warehouse, n.row?.box].filter(Boolean).join(" ").toLowerCase();
    const selfHit = !q || hay.includes(q);
    const kindHit = !kind || n.role === kind || n.row?.kind === kind || (kind === "aisle" && (n.role === "aisle" || n.row?.kind === "bay" || n.row?.kind === "zone")) || (kind === "shelf" && (n.role === "shelf" || n.row?.kind === "bin"));
    if (selfHit && kindHit) return [{ ...n, children: q ? (kids.length ? kids : n.children) : n.children }];
    if (kids.length) return [{ ...n, children: kids }];
    return [];
  });
}

function buildLocationForest(rows: any[], labels: { other: string; aisle: string }): LocNode[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const warehouses: LocNode[] = [];
  const warehouseById = new Map<number, LocNode>();
  const warehouseByName = new Map<string, LocNode>();
  const aisles = new Map<string, LocNode>();

  for (const r of rows) {
    if (locRole(r) !== "warehouse") continue;
    const node: LocNode = {
      key: `w-${r.id}`,
      id: r.id,
      name: r.name,
      role: "warehouse",
      row: r,
      children: [],
      warehouseName: r.warehouse || r.name,
    };
    warehouses.push(node);
    warehouseById.set(r.id, node);
    const nm = String(r.warehouse || r.name || "").trim();
    if (nm) warehouseByName.set(nm, node);
  }

  function warehouseOf(r: any): LocNode | null {
    let pid = r.parent_id;
    const seen = new Set<number>();
    while (pid && byId.has(pid) && !seen.has(pid)) {
      seen.add(pid);
      const p = byId.get(pid);
      if (locRole(p) === "warehouse" && warehouseById.has(p.id)) return warehouseById.get(p.id)!;
      pid = p.parent_id;
    }
    const nm = String(r.warehouse || "").trim();
    if (nm && warehouseByName.has(nm)) return warehouseByName.get(nm)!;
    return null;
  }

  function ensureAisle(wh: LocNode, box: string, row: any | null, name?: string) {
    const realId = row?.id;
    const key = realId ? `a-${realId}` : `a-virtual-${wh.id || wh.key}-${box || "other"}`;
    const existing = aisles.get(key) || (box ? aisles.get(`a-virtual-${wh.id || wh.key}-${box}`) : null);
    if (existing) return existing;
    const node: LocNode = {
      key,
      id: realId || null,
      name: name || (box ? `${labels.aisle} ${box}` : labels.other),
      role: "aisle",
      row,
      children: [],
      box,
      warehouseName: wh.warehouseName,
    };
    wh.children.push(node);
    aisles.set(key, node);
    if (box) aisles.set(`a-virtual-${wh.id || wh.key}-${box}`, node);
    return node;
  }

  for (const r of rows) {
    if (locRole(r) !== "aisle") continue;
    const wh = warehouseOf(r) || (r.parent_id && warehouseById.get(r.parent_id)) || null;
    if (!wh) {
      const orphan: LocNode = {
        key: `w-orphan-${r.id}`,
        id: null,
        name: r.warehouse || r.name,
        role: "warehouse",
        row: null,
        children: [],
        warehouseName: r.warehouse || r.name,
      };
      warehouses.push(orphan);
      ensureAisle(orphan, String(r.box || "").trim(), r, r.name);
      continue;
    }
    ensureAisle(wh, String(r.box || "").trim(), r, r.name);
  }

  for (const r of rows) {
    if (locRole(r) !== "shelf") continue;
    const parent = r.parent_id ? byId.get(r.parent_id) : null;
    const shelf: LocNode = { key: `s-${r.id}`, id: r.id, name: r.name, role: "shelf", row: r, children: [] };
    if (parent && locRole(parent) === "aisle") {
      const a = aisles.get(`a-${parent.id}`);
      if (a) {
        a.children.push(shelf);
        continue;
      }
    }
    const wh = (parent && locRole(parent) === "warehouse" && warehouseById.get(parent.id)) || warehouseOf(r);
    if (wh) {
      const box = String(r.box || parent?.box || "").trim();
      ensureAisle(wh, box, parent && locRole(parent) === "aisle" ? parent : null).children.push(shelf);
      continue;
    }
    const loose: LocNode = {
      key: `w-loose-${r.id}`,
      id: null,
      name: r.warehouse || r.name,
      role: "warehouse",
      row: null,
      children: [],
      warehouseName: r.warehouse || r.name,
    };
    warehouses.push(loose);
    ensureAisle(loose, String(r.box || "").trim(), null).children.push(shelf);
  }

  return warehouses;
}

function kindLabel(kind: string, lang: "ar" | "en") {
  return statusLabel(kind, lang);
}

export function LocationsPage() {
  const { tr, lang, refreshLookups } = useApp();
  const f = useListQuery("locations");
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<any>(null);
  const [contents, setContents] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<any>({ name: "", kind: "warehouse", code: "", parent_id: "", notes: "", warehouse: "", box: "", locked: false });
  const { confirmDelete, dialog } = useConfirm();
  const act = useActionError();

  async function load() {
    const r = await get<{ data: any[] }>("/api/inventory/locations/tree");
    setRows(r.data || []);
  }
  const list = useLiveList(load, []);

  const forest = useMemo(
    () => buildLocationForest(rows, { other: tr("otherAisle"), aisle: tr("kindBay") }),
    [rows, lang, tr],
  );
  const visible = useMemo(() => {
    const q = (f.values.q || "").toLowerCase();
    const kind = f.values.kind || "";
    const warehouseId = Number(f.values.warehouse_id || f.values.locations || 0);
    return filterForest(forest, q, kind, warehouseId);
  }, [forest, f.values]);

  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      for (const wh of forest) {
        if (next[wh.key] === undefined) next[wh.key] = true;
      }
      return next;
    });
  }, [forest]);

  function toggle(key: string) {
    setExpanded((e) => ({ ...e, [key]: !e[key] }));
  }

  async function pickNode(node: LocNode) {
    if (!node.id) return;
    setPicked(node.row || { id: node.id, name: node.name });
    const r = await get<{ data: any[] }>(`/api/inventory/by-location?location_id=${node.id}`);
    setContents(r.data || []);
  }

  function blankForm(extra: Record<string, unknown> = {}) {
    return { name: "", kind: "warehouse", code: "", parent_id: "", notes: "", warehouse: "", box: "", locked: false, ...extra };
  }

  function openCreateWarehouse() {
    act.clear();
    setForm(blankForm({ kind: "warehouse", locked: true }));
    setOpen(true);
  }

  function openCreateAisle(wh: LocNode) {
    if (!wh.id) return;
    act.clear();
    setForm(blankForm({
      kind: "aisle",
      parent_id: wh.id,
      warehouse: wh.warehouseName || wh.row?.warehouse || wh.name,
      locked: true,
    }));
    setOpen(true);
  }

  function openCreateShelf(wh: LocNode, aisle: LocNode) {
    const parentId = aisle.id || wh.id;
    if (!parentId) return;
    act.clear();
    setForm(blankForm({
      kind: "shelf",
      parent_id: parentId,
      warehouse: wh.warehouseName || aisle.warehouseName || "",
      box: aisle.box || aisle.row?.box || "",
      locked: true,
    }));
    setOpen(true);
  }

  function openEdit(row: any) {
    if (!row) return;
    act.clear();
    setForm({ ...row, parent_id: row.parent_id || "", warehouse: row.warehouse || "", box: row.box || "", locked: false });
    setOpen(true);
  }

  function removeRow(row: any) {
    if (!row?.id) return;
    confirmDelete(row.name, async () => {
      await del(`/api/inventory/locations/${row.id}`);
      if (picked?.id === row.id) {
        setPicked(null);
        setContents([]);
      }
      list.reload();
      refreshLookups();
    });
  }

  const modalTitle = form.id
    ? tr("edit")
    : form.kind === "warehouse"
      ? tr("addWarehouse")
      : form.kind === "aisle"
        ? tr("addAisle")
        : tr("addShelf");

  return (
    <Page title={tr("warehouseMap")} action={<Btn onClick={openCreateWarehouse}><span className="inline-flex items-center gap-1"><Plus size={16} />{tr("addWarehouse")}</span></Btn>}>
      <ErrorNote message={act.message} />
      <SmartFilter f={f} date={false} fields={[
        { key: "kind", label: "kind", type: "select", quick: true, options: KINDS.map((k) => ({ value: k, label: k })) },
        { key: "locations", label: "warehouse", type: "locations" },
      ]} />
      <div className="print-only label-sheet">
        {rows.filter((r) => r.code).map((r) => <Barcode key={r.id} value={r.code} label={r.path || r.name} />)}
      </div>

      <div className="mb-4 space-y-3 no-print">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-bold text-slate-600">{tr("warehouses")}</div>
          <Btn kind="soft" onClick={() => window.print()}>{tr("printLabel")}</Btn>
        </div>
        <ListGate loading={list.loading} err={list.err} onRetry={list.reload} empty={!visible.length} emptyFallback={<EmptyFilterState onClear={f.clear} />}>
        {visible.map((wh) => {
          const whOpen = expanded[wh.key] !== false;
          return (
            <section key={wh.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <header className="flex flex-wrap items-center gap-2 bg-slate-800 px-3 py-3 text-white">
                <button type="button" className="rounded-lg p-1 hover:bg-white/10" onClick={() => toggle(wh.key)} aria-expanded={whOpen}>
                  <ChevronDown size={18} className={`transition ${whOpen ? "" : "ltr:-rotate-90 rtl:rotate-90"}`} />
                </button>
                <Building2 size={20} className="shrink-0 opacity-90" />
                <button type="button" className="min-w-0 flex-1 text-start" onClick={() => pickNode(wh)}>
                  <div className="font-black">{wh.name}</div>
                  <div className="text-[11px] text-white/70">{tr("kindWarehouse")}{wh.row?.code ? ` · ${wh.row.code}` : ""}{nodeValue(wh) ? ` · ${money(nodeValue(wh), lang)}` : ""}</div>
                </button>
                {wh.id ? (
                  <button type="button" className="rounded-lg bg-white/15 px-2.5 py-1.5 text-xs font-bold hover:bg-white/25" onClick={() => openCreateAisle(wh)}>
                    <span className="inline-flex items-center gap-1"><Plus size={12} />{tr("addAisle")}</span>
                  </button>
                ) : null}
                {wh.row ? <div className="rounded-lg bg-white px-2 py-1"><ActionBtns canEdit canDelete onEdit={() => openEdit(wh.row)} onDelete={() => removeRow(wh.row)} /></div> : null}
              </header>
              {whOpen ? (
                <div className="space-y-2 bg-slate-50 p-2">
                  {!wh.children.length ? <div className="px-3 py-6 text-center text-sm text-slate-400">{tr("noData")}</div> : null}
                  {wh.children.map((aisle) => {
                    const aOpen = expanded[aisle.key] !== false;
                    return (
                      <div key={aisle.key} className="overflow-hidden rounded-xl border border-teal-100 bg-white">
                        <div className="flex flex-wrap items-center gap-2 bg-teal-50 px-3 py-2">
                          <button type="button" className="rounded-md p-1 text-teal-800 hover:bg-teal-100" onClick={() => toggle(aisle.key)}>
                            <ChevronDown size={16} className={`transition ${aOpen ? "" : "ltr:-rotate-90 rtl:rotate-90"}`} />
                          </button>
                          <Rows3 size={16} className="text-teal-700" />
                          <button type="button" className="min-w-0 flex-1 text-start" onClick={() => pickNode(aisle)}>
                            <div className="text-sm font-black text-teal-950">{aisle.name}</div>
                            <div className="text-[11px] text-teal-800/70">{tr("kindBay")}{aisle.row?.code ? ` · ${aisle.row.code}` : ""}{aisle.children.length ? ` · ${aisle.children.length}` : ""}</div>
                          </button>
                          {wh.id || aisle.id ? (
                            <button type="button" className="rounded-lg bg-teal-700 px-2.5 py-1 text-xs font-bold text-white hover:bg-teal-800" onClick={() => openCreateShelf(wh, aisle)}>
                              <span className="inline-flex items-center gap-1"><Plus size={12} />{tr("addShelf")}</span>
                            </button>
                          ) : null}
                          {aisle.row ? <ActionBtns canEdit canDelete onEdit={() => openEdit(aisle.row)} onDelete={() => removeRow(aisle.row)} /> : null}
                        </div>
                        {aOpen ? (
                          <ul>
                            {!aisle.children.length ? <li className="px-4 py-3 text-sm text-slate-400">{tr("noData")}</li> : null}
                            {aisle.children.map((shelf) => (
                              <li key={shelf.key} className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2 hover:bg-slate-50">
                                <Layers3 size={15} className="text-indigo-500" />
                                <button type="button" className="min-w-0 flex-1 text-start" onClick={() => pickNode(shelf)}>
                                  <div className="text-sm font-bold">{shelf.name}</div>
                                  <div className="text-[11px] text-slate-500">{tr("kindShelf")}{shelf.row?.code ? ` · ${shelf.row.code}` : ""}{Number(shelf.row?.stock_value) ? ` · ${money(shelf.row.stock_value, lang)}` : ""}</div>
                                </button>
                                {shelf.row ? <ActionBtns canEdit canDelete onEdit={() => openEdit(shelf.row)} onDelete={() => removeRow(shelf.row)} /> : null}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
        </ListGate>
      </div>

      {picked ? (
        <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-4 no-print">
          <div className="mb-2 font-bold">{tr("locationContents")}: {picked.path || picked.name}</div>
          <Barcode value={picked.code || String(picked.id)} label={picked.name} />
          <div className="table-wrap mt-3">
            <table>
              <thead><tr><th>{tr("sku")}</th><th>{tr("name")}</th><th>{tr("available")}</th><th>{tr("location")}</th></tr></thead>
              <tbody>
                {contents.map((c) => (
                  <tr key={c.id}>
                    <td>{c.sku}</td>
                    <td>{lang === "ar" ? c.name_ar : c.name_en}</td>
                    <td>{c.available}</td>
                    <td className="text-xs">{c.location_name}</td>
                  </tr>
                ))}
                {!contents.length ? <tr><td colSpan={4} className="py-4 text-center text-slate-400">{tr("noData")}</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <Modal open={open} title={modalTitle} onClose={() => { setOpen(false); act.clear(); }}>
        <Field label={tr("name")}><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        {form.locked && !form.id ? (
          <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {form.kind === "warehouse" ? tr("kindWarehouse") : form.kind === "aisle" ? tr("kindBay") : tr("kindShelf")}
            {form.parent_id ? ` · ${tr("parentLocation")}: ${rows.find((r) => r.id === Number(form.parent_id))?.name || form.parent_id}` : ""}
          </div>
        ) : (
          <>
            <Field label={tr("locationKind")}>
              <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {KINDS.map((k) => <option key={k} value={k}>{kindLabel(k, lang)}</option>)}
              </select>
            </Field>
            <Field label={tr("parentLocation")}>
              <select className={inputCls} value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
                <option value="">-</option>
                {rows.map((r) => r.id === form.id ? null : <option key={r.id} value={r.id}>{r.path || r.name}</option>)}
              </select>
            </Field>
          </>
        )}
        <Field label={tr("locationCode")}><input className={inputCls} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
        <Field label={tr("notes")}><input className={inputCls} value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        <ErrorNote message={act.message} />
        <Btn className="mt-3" onClick={async () => {
          if (!String(form.name || "").trim()) {
            act.fail(undefined, "errNameRequired");
            return;
          }
          try {
            const payload = {
              name: form.name,
              kind: form.kind,
              code: form.code || undefined,
              notes: form.notes || null,
              parent_id: form.parent_id ? Number(form.parent_id) : null,
              warehouse: form.warehouse || undefined,
              box: form.kind === "aisle" && !form.box ? form.name : (form.box || undefined),
            };
            if (form.id) await put(`/api/inventory/locations/${form.id}`, payload);
            else await post("/api/inventory/locations", payload);
            act.clear();
            setOpen(false);
            setForm(blankForm());
            list.reload();
            refreshLookups();
          } catch (e) {
            act.fail(e);
          }
        }}>{tr("save")}</Btn>
      </Modal>
      {dialog}
    </Page>
  );
}


export function TransfersPage() {
  const { tr, lang } = useApp();
  const f = useListQuery("transfers");
  const [rows, setRows] = useState<any[]>([]);
  const [locs, setLocs] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ from_location_id: "", to_location_id: "", notes: "", items: [] as any[] });
  const [batchHits, setBatchHits] = useState<any[]>([]);
  const [stockQ, setStockQ] = useState("");
  const { confirmDelete, dialog } = useConfirm();
  const act = useActionError();
  async function load() {
    const r = await get<{ data: any[] }>(`/api/inventory/transfers?${f.qs}`);
    setRows(r.data);
    const t = await get<{ data: any[] }>("/api/inventory/locations/tree");
    setLocs(t.data);
  }
  const list = useLiveList(load, [f.qs]);
  async function loadBatches(locationId: string) {
    if (!locationId) { setBatchHits([]); return; }
    const r = await get<{ data: any[] }>(`/api/inventory/by-location?location_id=${locationId}`);
    setBatchHits(r.data);
  }
  const filteredStock = useMemo(() => {
    const q = stockQ.trim().toLowerCase();
    if (!q) return batchHits;
    return batchHits.filter((b) =>
      [b.name_ar, b.name_en, b.sku, b.quality, b.part_type_ar, b.part_type_en, b.brand_ar, b.brand_en, b.models_label, b.batch_code]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [batchHits, stockQ]);
  function qtyFor(batchId: number) {
    const hit = form.items.find((x: any) => x.batch_id === batchId);
    return hit ? String(hit.qty) : "";
  }
  function setQty(b: any, raw: string) {
    const qty = Number(raw || 0);
    const items = form.items.filter((x: any) => x.batch_id !== b.id);
    if (qty > 0) items.push({ product_id: b.product_id, batch_id: b.id, qty });
    setForm({ ...form, items });
  }
  function closeModal() {
    setOpen(false);
    act.clear();
    setStockQ("");
    setForm({ from_location_id: "", to_location_id: "", notes: "", items: [] });
    setBatchHits([]);
  }
  return (
    <Page title={tr("transfers")} action={<Btn onClick={() => { act.clear(); setOpen(true); }}>{tr("newTransfer")}</Btn>}>
      <ErrorNote message={act.message} />
      <SmartFilter f={f} fields={[
        { key: "status", label: "status", type: "select", quick: true, options: ["draft", "completed", "cancelled"].map((s) => ({ value: s, label: statusLabel(s, lang) })) },
        { key: "from_location_id", label: "sourceWarehouse", type: "select", lookup: "locations" },
        { key: "to_location_id", label: "destWarehouse", type: "select", lookup: "locations" },
        { key: "product_id", label: "products", type: "async", asyncPath: "/api/products", asyncLabel: (r) => `${r.sku} — ${r.name_ar}` },
      ]} />
      <ListGate loading={list.loading} err={list.err} onRetry={list.reload} empty={!rows.length} emptyFallback={<EmptyFilterState onClear={f.clear} />}>
      <Table
        cols={[tr("invoiceNo"), tr("date"), tr("fromLocation"), tr("toLocation"), tr("status"), ""]}
        rows={rows.map((r) => [
          <Link className="font-bold text-cyan-800" to={`/transfers/${r.id}`}>{r.number}</Link>,
          r.date,
          r.from_name,
          r.to_name,
          <span className={statusClass(r.status)}>{statusLabel(r.status, lang)}</span>,
          r.status === "draft" ? (
            <span className="flex flex-wrap gap-2">
              <button className="font-bold text-cyan-700" onClick={async () => { try { act.clear(); await post(`/api/inventory/transfers/${r.id}/complete`, {}); playSound("done"); list.reload(); } catch (e) { act.fail(e); } }}>{tr("completeTransfer")}</button>
              <button className="font-bold text-rose-600" onClick={() => confirmDelete(r.number, async () => { await post(`/api/inventory/transfers/${r.id}/cancel`, {}); list.reload(); })}>{tr("delete")}</button>
            </span>
          ) : null,
        ])}
      />
      </ListGate>
      <Modal open={open} title={tr("newTransfer")} onClose={closeModal} full>
        <div className="grid items-end gap-3 md:grid-cols-[1fr_auto_1fr]">
          <Field label={tr("fromLocation")}>
            <select className={`${inputCls} py-3 text-base`} value={form.from_location_id} onChange={(e) => { setForm({ ...form, from_location_id: e.target.value, items: [] }); loadBatches(e.target.value); }}>
              <option value="">-</option>
              {locs.map((l) => <option key={l.id} value={l.id}>{l.label || l.path || l.name}</option>)}
            </select>
          </Field>
          <div className="hidden pb-2 text-2xl font-black text-slate-400 md:block" aria-hidden>→</div>
          <Field label={tr("toLocation")}>
            <select className={`${inputCls} py-3 text-base`} value={form.to_location_id} onChange={(e) => setForm({ ...form, to_location_id: e.target.value })}>
              <option value="">-</option>
              {locs.map((l) => <option key={l.id} value={l.id}>{l.label || l.path || l.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="mt-4">
          <input className={inputCls} value={stockQ} onChange={(e) => setStockQ(e.target.value)} placeholder={tr("search")} />
        </div>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-100">
          <div className="table-wrap max-h-[52vh] overflow-auto">
            <table className="min-w-[960px]">
              <thead>
                <tr>
                  <th>{tr("name")}</th>
                  <th>{tr("quality")}</th>
                  <th>{tr("partType")}</th>
                  <th>{tr("brand")}</th>
                  <th>{tr("models")}</th>
                  <th>Batch</th>
                  <th>{tr("available")}</th>
                  <th>{tr("qty")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredStock.length === 0 ? (
                  <tr><td colSpan={8} className="py-8 text-center text-slate-400">{tr("noData")}</td></tr>
                ) : filteredStock.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <div className="font-semibold">{productName(b, lang)}</div>
                      <div className="text-xs text-slate-400">{b.sku}</div>
                    </td>
                    <td>{b.quality || "—"}</td>
                    <td>{productType(b, lang) || "—"}</td>
                    <td>{productBrand(b, lang) || "—"}</td>
                    <td className="max-w-40 truncate">{b.models_label || "—"}</td>
                    <td>{b.batch_code}</td>
                    <td>{num(b.available, lang)}</td>
                    <td>
                      <input
                        className={`${inputCls} w-24`}
                        type="number"
                        min={0}
                        max={b.available}
                        value={qtyFor(b.id)}
                        onChange={(e) => setQty(b, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <ErrorNote message={act.message} />
        <Btn className="mt-4" onClick={async () => {
          if (!form.from_location_id || !form.to_location_id) {
            act.fail(undefined, "errLocationsRequired");
            return;
          }
          if (String(form.from_location_id) === String(form.to_location_id)) {
            act.fail(undefined, "errSameLocation");
            return;
          }
          if (!form.items?.length) {
            act.fail(undefined, "errNoItems");
            return;
          }
          try {
            await post("/api/inventory/transfers", { ...form, from_location_id: Number(form.from_location_id), to_location_id: Number(form.to_location_id) });
            playSound("done");
            closeModal();
            list.reload();
          } catch (e) {
            act.fail(e);
          }
        }}>{tr("completeTransfer")}</Btn>
      </Modal>
      {dialog}
    </Page>
  );
}

export function TransferDetail() {
  const { id } = useParams();
  const { tr, lang } = useApp();
  const [d, setD] = useState<any>(null);
  const act = useActionError();
  async function load() { setD((await get<{ data: any }>(`/api/inventory/transfers/${id}`)).data); }
  useEffect(() => { load().catch(() => {}); }, [id]);
  if (!d) return <div>{tr("loading")}</div>;
  return (
    <Page title={d.number} action={d.status === "draft" ? <Btn onClick={async () => { try { act.clear(); await post(`/api/inventory/transfers/${id}/complete`, {}); playSound("done"); load(); } catch (e) { act.fail(e); } }}>{tr("completeTransfer")}</Btn> : null}>
      <ErrorNote message={act.message} />
      <div className="mb-3 text-sm text-slate-500">{d.from_name} → {d.to_name} · {d.date} · {statusLabel(d.status, lang)}</div>
      <Table
        cols={[tr("name"), tr("quality"), tr("partType"), tr("brand"), tr("models"), "Batch", tr("qty"), tr("cost")]}
        rows={(d.items || []).map((i: any) => [
          <span><span className="font-semibold">{productName(i, lang)}</span><span className="block text-xs text-slate-400">{i.sku}</span></span>,
          i.quality || "—",
          productType(i, lang) || "—",
          productBrand(i, lang) || "—",
          i.models_label || "—",
          i.batch_code,
          num(i.qty, lang),
          money(i.unit_cost, lang),
        ])}
      />
    </Page>
  );
}

export function StocktakesPage() {
  const { tr, lang, can } = useApp();
  const nav = useNavigate();
  const f = useListQuery("stocktakes");
  const [rows, setRows] = useState<any[]>([]);
  const [locs, setLocs] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [locationId, setLocationId] = useState("");
  const { confirmDelete, dialog } = useConfirm();
  const act = useActionError();
  async function load() {
    setRows((await get<{ data: any[] }>(`/api/inventory/stocktakes?${f.qs}`)).data);
    setLocs((await get<{ data: any[] }>("/api/inventory/locations/tree")).data);
  }
  const list = useLiveList(load, [f.qs]);
  return (
    <Page title={tr("stocktake")} action={<Btn onClick={() => { act.clear(); setOpen(true); }}>{tr("newStocktake")}</Btn>}>
      <ErrorNote message={act.message} />
      <SmartFilter f={f} fields={[
        { key: "status", label: "status", type: "select", quick: true, options: ["draft", "submitted", "approved"].map((s) => ({ value: s, label: statusLabel(s, lang) })) },
        { key: "locations", label: "warehouse", type: "locations" },
        { key: "variance", label: "varianceYes", type: "select", options: [{ value: "yes", label: tr("varianceYes") }, { value: "no", label: tr("varianceNo") }] },
        { key: "shortage", label: "shortage", type: "select", options: [{ value: "1", label: tr("shortage") }] },
        { key: "surplus", label: "surplus", type: "select", options: [{ value: "1", label: tr("surplus") }] },
      ]} />
      <ListGate loading={list.loading} err={list.err} onRetry={list.reload} empty={!rows.length} emptyFallback={<EmptyFilterState onClear={f.clear} />}>
      <ReconKpis totals={sumStocktakeKpis(rows)} lang={lang} tr={tr} />
      <Table
        cols={[tr("invoiceNo"), tr("date"), tr("location"), tr("expectedStock"), tr("actualStock"), tr("shortage"), tr("surplus"), tr("status"), ""]}
        rows={rows.map((r) => [
          <Link className="font-bold text-cyan-800" to={`/stocktake/${r.id}`}>{r.number}</Link>,
          r.date,
          r.location_name || tr("all"),
          num(r.expected_qty, lang),
          num(r.actual_qty, lang),
          <span>{num(r.shortage_qty, lang)} · {money(r.shortage_value, lang)}</span>,
          <span>{num(r.surplus_qty, lang)} · {money(r.surplus_value, lang)}</span>,
          <span className={statusClass(r.status)}>{statusLabel(r.status, lang)}</span>,
          <span className="flex flex-wrap gap-2">
            <Link to={`/stocktake/${r.id}`}>{tr("view")}</Link>
            {r.status !== "approved" && r.status !== "cancelled" && can("stocktake.create") ? (
              <button className="font-bold text-rose-600" onClick={() => confirmDelete(r.number, async () => { await post(`/api/inventory/stocktakes/${r.id}/cancel`, {}); list.reload(); })}>{tr("delete")}</button>
            ) : null}
          </span>,
        ])}
      />
      </ListGate>
      <Modal open={open} title={tr("newStocktake")} onClose={() => { setOpen(false); act.clear(); }}>
        <Field label={tr("location")}>
          <select className={inputCls} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">{tr("all")}</option>
            {locs.map((l) => <option key={l.id} value={l.id}>{l.label || l.path || l.name}</option>)}
          </select>
        </Field>
        <ErrorNote message={act.message} />
        <Btn className="mt-3" onClick={async () => {
          try {
            const r = await post<{ id: number }>("/api/inventory/stocktakes", { location_id: locationId ? Number(locationId) : null });
            act.clear();
            setOpen(false);
            nav(`/stocktake/${r.id}`);
          } catch (e) {
            act.fail(e);
          }
        }}>{tr("save")}</Btn>
      </Modal>
      {dialog}
    </Page>
  );
}

export function StocktakeDetail() {
  const { id } = useParams();
  const { tr, lang, can } = useApp();
  const [d, setD] = useState<any>(null);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [q, setQ] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  const act = useActionError();
  async function load() {
    const r = await get<{ data: any }>(`/api/inventory/stocktakes/${id}`);
    setD(r.data);
    const next: Record<number, string> = {};
    for (const it of r.data.items || []) next[it.id] = it.counted_qty == null ? "" : String(it.counted_qty);
    setCounts(next);
  }
  useEffect(() => { load().catch(() => {}); }, [id]);
  const items = d?.items || [];
  const locations = useMemo(
    () => [...new Set(items.map((i: any) => String(i.item_location || "")).filter(Boolean))].sort((a, b) => a.localeCompare(b, lang === "ar" ? "ar" : "en")),
    [items, lang],
  );
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of items) {
      const key = String(i.category_id || "");
      const label = productCategory(i, lang);
      if (key && label) map.set(key, label);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], lang === "ar" ? "ar" : "en"));
  }, [items, lang]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i: any) => {
      if (location && String(i.item_location || "") !== location) return false;
      if (category && String(i.category_id || "") !== category) return false;
      if (!needle) return true;
      const hay = [i.name_ar, i.name_en, i.sku, i.barcode].map((x) => String(x || "").toLowerCase()).join(" ");
      return hay.includes(needle);
    });
  }, [items, q, location, category]);
  if (!d) return <div>{tr("loading")}</div>;
  const locked = !["draft", "submitted"].includes(d.status);
  return (
    <Page
      title={d.number}
      action={
        <>
          {d.status === "draft" ? <Btn kind="ghost" onClick={async () => { try { act.clear(); await post(`/api/inventory/stocktakes/${id}/submit`, {}); playSound("done"); load(); } catch (e) { act.fail(e); } }}>{tr("submitStocktake")}</Btn> : null}
          {d.status === "submitted" && can("stocktake.approve") ? <Btn onClick={async () => { try { act.clear(); await post(`/api/inventory/stocktakes/${id}/approve`, {}); playSound("done"); load(); } catch (e) { act.fail(e); } }}>{tr("approveStocktake")}</Btn> : null}
        </>
      }
    >
      <ErrorNote message={act.message} />
      <div className="mb-3 text-sm text-slate-500">{d.location_name || tr("all")} · {d.date} · {statusLabel(d.status, lang)}</div>
      <ReconKpis totals={d.totals || sumStocktakeKpis([])} lang={lang} tr={tr} />
      <div className="no-print mb-3 grid gap-2 sm:grid-cols-[1fr_12rem_12rem]">
        <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("search")} />
        <select className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)}>
          <option value="">{tr("location")} · {tr("all")}</option>
          {locations.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">{tr("categories")} · {tr("all")}</option>
          {categories.map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
      </div>
      <Table
        cols={[tr("name"), tr("quality"), tr("partType"), tr("models"), "Batch", tr("location"), tr("expectedStock"), tr("actualStock"), tr("varianceQty"), tr("varianceValue")]}
        rows={filtered.map((i: any) => {
          const value = lineVarianceValue(i);
          return [
          <span><span className="font-semibold">{productName(i, lang)}</span><span className="block text-xs text-slate-400">{i.sku}</span></span>,
          i.quality || "—",
          productType(i, lang) || "—",
          i.models_label || "—",
          i.batch_code,
          i.item_location,
          num(i.system_qty, lang),
          locked ? (i.counted_qty ?? "-") : (
            <input className={`${inputCls} w-24`} type="number" value={counts[i.id] ?? ""} onChange={(e) => setCounts({ ...counts, [i.id]: e.target.value })} onBlur={async () => {
              if (counts[i.id] === "") return;
              try {
                await put(`/api/inventory/stocktakes/${id}/counts`, { items: [{ id: i.id, counted_qty: Number(counts[i.id]) }] });
                playSound("ok");
                act.clear();
                load();
              } catch (e) {
                act.fail(e);
              }
            }} />
          ),
          i.variance == null ? "-" : num(i.variance, lang),
          value == null ? "-" : money(value, lang),
        ];
        })}
      />
    </Page>
  );
}

export function WastagePage() {
  const { tr, lang } = useApp();
  const f = useListQuery("wastage");
  const [rows, setRows] = useState<any[]>([]);
  const [totalLoss, setTotalLoss] = useState(0);
  async function load() {
    const r = await get<{ data: any[]; total_loss?: number }>(`/api/inventory/wastage?${f.qs}`);
    setRows(r.data || []);
    setTotalLoss(Number(r.total_loss || 0));
  }
  const list = useLiveList(load, [f.qs]);
  return (
    <Page title={tr("wastage")}>
      <SmartFilter
        f={f}
        fields={[{ key: "month", label: "month", type: "text", quick: true }]}
        extra={<input className={`${inputCls} w-40`} type="month" value={f.values.month || ""} onChange={(e) => f.set("month", e.target.value)} />}
      />
      <ListGate loading={list.loading} err={list.err} onRetry={list.reload} empty={!rows.length} emptyFallback={<EmptyFilterState onClear={f.clear} />}>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Stat label={tr("financialLoss")} value={money(totalLoss, lang)} accent="rose" />
        </div>
        <Table
          cols={[tr("month"), tr("stocktake"), tr("name"), tr("partType"), tr("models"), tr("qtyLost"), tr("cost"), tr("financialLoss")]}
          rows={rows.map((r) => [
            r.month,
            <Link className="font-bold text-cyan-800" to={`/stocktake/${r.stocktake_id}`}>{r.stocktake_number}</Link>,
            <span><span className="font-semibold">{productName(r, lang)}</span><span className="block text-xs text-slate-400">{r.sku}</span></span>,
            productType(r, lang) || "—",
            r.models_label || "—",
            num(r.qty, lang),
            money(r.resolved_cost ?? r.unit_cost, lang),
            money(r.dynamic_loss_value ?? r.loss_value, lang),
          ])}
        />
      </ListGate>
    </Page>
  );
}
