import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context";
import { get, post, put, del } from "../lib/api";
import { money, num, statusClass, statusLabel } from "../lib/format";
import { Btn, ErrorNote, Field, Modal, PrintBtn, PrintLetterhead, inputCls } from "../components/ui";
import { useActionError } from "../lib/errors";
import { EmptyFilterState, SmartFilter } from "../components/SmartFilter";
import { useListQuery } from "../hooks/useListQuery";
import { Barcode } from "../components/Barcode";
import { ActionBtns, useConfirm } from "../components/Confirm";
import { playSound } from "../lib/sounds";

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

function kindLabel(kind: string, lang: "ar" | "en") {
  return statusLabel(kind, lang);
}

function nestLocations(rows: any[]) {
  const byId = new Map(rows.map((r) => [r.id, { ...r, children: [] as any[] }]));
  const roots: any[] = [];
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) byId.get(node.parent_id).children.push(node);
    else roots.push(node);
  }
  return roots;
}

function LocBox({ node, lang, onPick }: { node: any; lang: "ar" | "en"; onPick?: (n: any) => void }) {
  const tone: Record<string, string> = {
    warehouse: "border-slate-700 bg-slate-800 text-white",
    zone: "border-cyan-700 bg-cyan-700 text-white",
    aisle: "border-teal-600 bg-teal-600 text-white",
    bay: "border-sky-600 bg-sky-600 text-white",
    shelf: "border-indigo-500 bg-indigo-500 text-white",
    bin: "border-amber-200 bg-amber-50 text-amber-950",
  };
  return (
    <div className={`min-w-[120px] cursor-pointer rounded-xl border p-2 ${tone[node.kind] || "border-slate-200 bg-white"}`} onClick={(e) => { e.stopPropagation(); onPick?.(node); }}>
      <div className="text-xs font-black">{node.name}</div>
      <div className="text-[10px] opacity-80">{statusLabel(node.kind || "bin", lang)}{node.code ? ` · ${node.code}` : ""}</div>
      {Number(node.stock_value) ? <div className="mt-1 text-[10px] font-bold">{money(node.stock_value, lang)}</div> : null}
      {node.children?.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {node.children.map((c: any) => <LocBox key={c.id} node={c} lang={lang} onPick={onPick} />)}
        </div>
      ) : null}
    </div>
  );
}

function treeRows(rows: any[]) {
  const byParent = new Map<number | "root", any[]>();
  for (const r of rows) {
    const key = r.parent_id || "root";
    const list = byParent.get(key) || [];
    list.push(r);
    byParent.set(key, list);
  }
  const out: { row: any; depth: number }[] = [];
  const walk = (parent: number | "root", depth: number) => {
    for (const row of byParent.get(parent) || []) {
      out.push({ row, depth });
      walk(row.id, depth + 1);
    }
  };
  walk("root", 0);
  const hanging = rows.filter((r) => r.parent_id && !rows.some((x) => x.id === r.parent_id) && !out.some((o) => o.row.id === r.id));
  for (const row of hanging) out.push({ row, depth: 0 });
  return out;
}

export function LocationsPage() {
  const { tr, lang, refreshLookups } = useApp();
  const f = useListQuery("locations");
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<any>(null);
  const [contents, setContents] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ name: "", kind: "bin", code: "", parent_id: "", notes: "" });
  const { confirmDelete, dialog } = useConfirm();
  const act = useActionError();
  async function load() {
    const r = await get<{ data: any[] }>("/api/inventory/locations/tree");
    setRows(r.data);
  }
  useEffect(() => { load().catch(() => {}); }, []);
  const tree = useMemo(() => {
    const q = (f.values.q || "").toLowerCase();
    const kind = f.values.kind || "";
    const filtered = rows.filter((r) => {
      if (kind && r.kind !== kind) return false;
      if (!q) return true;
      return [r.name, r.code, r.path, r.warehouse].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
    return treeRows(filtered.length ? filtered : rows);
  }, [rows, f.values]);
  return (
    <Page title={tr("warehouses")} action={<Btn onClick={() => { act.clear(); setForm({ name: "", kind: "bin", code: "", parent_id: "", notes: "" }); setOpen(true); }}>{tr("add")}</Btn>}>
      <ErrorNote message={act.message} />
      <SmartFilter f={f} date={false} fields={[
        { key: "kind", label: "kind", type: "select", quick: true, options: KINDS.map((k) => ({ value: k, label: k })) },
        { key: "locations", label: "warehouse", type: "locations" },
      ]} />
      <div className="print-only label-sheet">
        {rows.filter((r) => r.code).map((r) => <Barcode key={r.id} value={r.code} label={r.path || r.name} />)}
      </div>
      {rows.length ? (
        <div className="mb-4 overflow-auto rounded-2xl border border-slate-100 bg-slate-50 p-4 no-print">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-bold">{tr("warehouseMap")}</div>
            <Btn kind="soft" onClick={() => window.print()}>{tr("printLabel")}</Btn>
          </div>
          <div className="flex flex-wrap gap-3">
            {nestLocations(rows).map((n) => <LocBox key={n.id} node={n} lang={lang} onPick={async (loc) => {
              setPicked(loc);
              const r = await get<{ data: any[] }>(`/api/inventory/by-location?location_id=${loc.id}`);
              setContents(r.data || []);
            }} />)}
          </div>
        </div>
      ) : null}
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
      <Table
        cols={[tr("name"), tr("locationKind"), tr("locationCode"), tr("locationPath"), tr("stockValue"), tr("status"), ""]}
        rows={tree.map(({ row, depth }) => [
          <span style={{ paddingInlineStart: depth * 18 }}>{row.name}</span>,
          statusLabel(row.kind || "bin", lang),
          row.code,
          row.path,
          money(row.stock_value, lang),
          row.active === 0 ? tr("inactive") : tr("active"),
          <ActionBtns
            canEdit
            canDelete
            onEdit={() => { act.clear(); setForm({ ...row, parent_id: row.parent_id || "" }); setOpen(true); }}
            onDelete={() => confirmDelete(row.name, async () => { await del(`/api/inventory/locations/${row.id}`); load(); refreshLookups(); })}
          />,
        ])}
      />
      <Modal open={open} title={tr("warehouses")} onClose={() => { setOpen(false); act.clear(); }}>
        <Field label={tr("name")}><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
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
        <Field label={tr("locationCode")}><input className={inputCls} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
        <Field label={tr("notes")}><input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        <ErrorNote message={act.message} />
        <Btn className="mt-3" onClick={async () => {
          if (!String(form.name || "").trim()) {
            act.fail(undefined, "errNameRequired");
            return;
          }
          try {
            const payload = { ...form, parent_id: form.parent_id ? Number(form.parent_id) : null };
            if (form.id) await put(`/api/inventory/locations/${form.id}`, payload);
            else await post("/api/inventory/locations", payload);
            act.clear();
            setOpen(false);
            setForm({ name: "", kind: "bin", code: "", parent_id: "", notes: "" });
            load();
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
  useEffect(() => { load().catch(() => {}); }, [f.qs]);
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
      {!rows.length ? <EmptyFilterState onClear={f.clear} /> : (
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
              <button className="font-bold text-cyan-700" onClick={async () => { try { act.clear(); await post(`/api/inventory/transfers/${r.id}/complete`, {}); playSound("done"); load(); } catch (e) { act.fail(e); } }}>{tr("completeTransfer")}</button>
              <button className="font-bold text-rose-600" onClick={() => confirmDelete(r.number, async () => { await post(`/api/inventory/transfers/${r.id}/cancel`, {}); load(); })}>{tr("delete")}</button>
            </span>
          ) : null,
        ])}
      />
      )}
      <Modal open={open} title={tr("newTransfer")} onClose={() => { setOpen(false); act.clear(); }} wide>
        <div className="grid gap-2 md:grid-cols-2">
          <Field label={tr("fromLocation")}>
            <select className={inputCls} value={form.from_location_id} onChange={(e) => { setForm({ ...form, from_location_id: e.target.value, items: [] }); loadBatches(e.target.value); }}>
              <option value="">-</option>
              {locs.map((l) => <option key={l.id} value={l.id}>{l.path || l.name}</option>)}
            </select>
          </Field>
          <Field label={tr("toLocation")}>
            <select className={inputCls} value={form.to_location_id} onChange={(e) => setForm({ ...form, to_location_id: e.target.value })}>
              <option value="">-</option>
              {locs.map((l) => <option key={l.id} value={l.id}>{l.path || l.name}</option>)}
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
            load();
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
  useEffect(() => { load().catch(() => {}); }, [f.qs]);
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
              <button className="font-bold text-rose-600" onClick={() => confirmDelete(r.number, async () => { await post(`/api/inventory/stocktakes/${r.id}/cancel`, {}); load(); })}>{tr("delete")}</button>
            ) : null}
          </span>,
        ])}
      />
      <Modal open={open} title={tr("newStocktake")} onClose={() => { setOpen(false); act.clear(); }}>
        <Field label={tr("location")}>
          <select className={inputCls} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">{tr("all")}</option>
            {locs.map((l) => <option key={l.id} value={l.id}>{l.path || l.name}</option>)}
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
