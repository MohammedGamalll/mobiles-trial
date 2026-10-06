import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Building2, ChevronDown, Layers3, Plus, Rows3 } from "lucide-react";
import { useApp } from "../context";
import { get, post, put, del } from "../lib/api";
import { money, num, statusClass, statusLabel } from "../lib/format";
import { Btn, ErrorNote, Field, Modal, PrintBtn, PrintLetterhead, inputCls } from "../components/ui";
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
      <Modal open={open} title={tr("newTransfer")} onClose={() => { setOpen(false); act.clear(); }} wide>
        <div className="grid gap-2 md:grid-cols-2">
          <Field label={tr("fromLocation")}>
            <select className={inputCls} value={form.from_location_id} onChange={(e) => { setForm({ ...form, from_location_id: e.target.value, items: [] }); loadBatches(e.target.value); }}>
              <option value="">-</option>
              {locs.map((l) => <option key={l.id} value={l.id}>{l.label || l.path || l.name}</option>)}
            </select>
          </Field>
          <Field label={tr("toLocation")}>
            <select className={inputCls} value={form.to_location_id} onChange={(e) => setForm({ ...form, to_location_id: e.target.value })}>
              <option value="">-</option>
              {locs.map((l) => <option key={l.id} value={l.id}>{l.label || l.path || l.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="mt-3 max-h-56 overflow-auto rounded-xl border border-slate-100">
          {batchHits.map((b) => (
            <label key={b.id} className="flex items-center justify-between gap-2 border-b border-slate-50 px-3 py-2 text-sm">
              <span>{b.sku} · {b.batch_code} · {tr("available")} {b.available}</span>
              <input className={`${inputCls} w-24`} type="number" min={0} max={b.available} placeholder="0" onChange={(e) => {
                const qty = Number(e.target.value || 0);
                const items = form.items.filter((x: any) => x.batch_id !== b.id);
                if (qty > 0) items.push({ product_id: b.product_id, batch_id: b.id, qty });
                setForm({ ...form, items });
              }} />
            </label>
          ))}
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
            act.clear();
            setOpen(false);
            setForm({ from_location_id: "", to_location_id: "", notes: "", items: [] });
            list.reload();
          } catch (e) {
            act.fail(e);
          }
        }}>{tr("save")}</Btn>
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
      <Table cols={[tr("sku"), "Batch", tr("qty"), tr("cost")]} rows={(d.items || []).map((i: any) => [i.sku, i.batch_code, i.qty, money(i.unit_cost, lang)])} />
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
      <Table
        cols={[tr("invoiceNo"), tr("date"), tr("location"), tr("status"), ""]}
        rows={rows.map((r) => [
          <Link className="font-bold text-cyan-800" to={`/stocktake/${r.id}`}>{r.number}</Link>,
          r.date,
          r.location_name || tr("all"),
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
  const act = useActionError();
  async function load() {
    const r = await get<{ data: any }>(`/api/inventory/stocktakes/${id}`);
    setD(r.data);
    const next: Record<number, string> = {};
    for (const it of r.data.items || []) next[it.id] = it.counted_qty == null ? "" : String(it.counted_qty);
    setCounts(next);
  }
  useEffect(() => { load().catch(() => {}); }, [id]);
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
      <Table
        cols={[tr("sku"), tr("name"), "Batch", tr("location"), tr("systemQty"), tr("counted"), tr("variance")]}
        rows={(d.items || []).map((i: any) => [
          i.sku,
          lang === "ar" ? i.name_ar : i.name_en,
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
        ])}
      />
    </Page>
  );
}
