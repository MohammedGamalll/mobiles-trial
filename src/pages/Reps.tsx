import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApp } from "../context";
import { get, post, put, del } from "../lib/api";
import { money, statusClass, statusLabel } from "../lib/format";
import { Btn, Field, FilterBar, Modal, PrintBtn, PrintLetterhead, inputCls } from "../components/ui";
import { EmptyFilterState, SmartFilter } from "../components/SmartFilter";
import { useListQuery } from "../hooks/useListQuery";
import { ActionBtns, useConfirm } from "../components/Confirm";

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
      <div className="table-wrap">
        <table>
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

function monthNow() {
  return new Date().toISOString().slice(0, 7);
}

function roleLabel(type: string, tr: (k: any) => string) {
  if (type === "sales") return tr("roleSales");
  if (type === "both") return tr("roleBoth");
  return tr("roleDelivery");
}

export function RepsPage() {
  const { tr, lang, can } = useApp();
  const f = useListQuery("reps", { month: monthNow() });
  const [rows, setRows] = useState<any[]>([]);
  async function load() {
    const r = await get<{ data: any[] }>(`/api/reps?${f.qs || `month=${monthNow()}`}`);
    setRows(r.data || []);
  }
  useEffect(() => { load().catch(() => {}); }, [f.qs]);
  return (
    <Page title={tr("reps")} action={
      <div className="flex flex-wrap gap-2">
        <Link className="rounded-xl bg-teal-50 px-3 py-2 text-sm font-bold text-teal-800" to="/reps/visits">{tr("visits")}</Link>
        {can("targets.manage") ? <Link className="rounded-xl bg-teal-50 px-3 py-2 text-sm font-bold text-teal-800" to="/reps/targets">{tr("targets")}</Link> : null}
        <Link className="rounded-xl bg-teal-50 px-3 py-2 text-sm font-bold text-teal-800" to="/reps/commissions">{tr("commissions")}</Link>
      </div>
    }>
      <SmartFilter f={f} date={false} fields={[
        { key: "month", label: "pickMonth", type: "text", quick: true },
        { key: "status", label: "status", type: "select", options: [{ value: "active", label: tr("active") }, { value: "inactive", label: tr("inactive") }] },
        { key: "area", label: "area", type: "text" },
        { key: "has_sales", label: "hasSales", type: "select", options: [{ value: "1", label: tr("hasSales") }] },
        { key: "has_collections", label: "hasCollections", type: "select", options: [{ value: "1", label: tr("hasCollections") }] },
        { key: "has_visits", label: "hasVisits", type: "select", options: [{ value: "1", label: tr("hasVisits") }] },
        { key: "target_status", label: "targetStatus", type: "select", options: [{ value: "hit", label: "OK" }, { value: "miss", label: "—" }] },
      ]} extra={<input className={`${inputCls} w-36`} type="month" value={f.values.month || monthNow()} onChange={(e) => f.set("month", e.target.value)} />} />
      <Table
        cols={[tr("code"), tr("name"), tr("roleType"), tr("area"), tr("targetAmount"), tr("achieved"), "%", tr("visits"), tr("commissions"), ""]}
        rows={rows.map((r) => {
          const target = Number(r.target_amount || 0);
          const sales = Number(r.sales_amount || 0);
          const pct = target ? Math.round((sales / target) * 100) : 0;
          return [
            r.code,
            <Link className="font-bold text-cyan-700" to={`/reps/${r.id}`}>{r.name}</Link>,
            roleLabel(r.role_type || "delivery", tr),
            r.area || "-",
            money(target, lang),
            money(sales, lang),
            `${pct}%`,
            `${r.visits_done || 0}/${r.target_visits || r.visits_total || 0}`,
            money(r.commission_amount, lang),
            r.commission_rate ? `${r.commission_rate}%` : "-",
          ];
        })}
      />
    </Page>
  );
}

export function RepDetail() {
  const { id } = useParams();
  const { tr, lang } = useApp();
  const [month, setMonth] = useState(monthNow());
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState<"overview" | "sales" | "visits" | "commissions">("overview");
  useEffect(() => {
    get<{ data: any }>(`/api/reps/${id}?month=${month}`).then((r) => setD(r.data)).catch(() => {});
  }, [id, month]);
  if (!d) return <div>{tr("loading")}</div>;
  const tabs = [
    ["overview", tr("overview")],
    ["sales", tr("sales")],
    ["visits", tr("visits")],
    ["commissions", tr("commissions")],
  ] as const;
  return (
    <Page title={d.name} action={<input className={`${inputCls} w-36`} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />}>
      <div className="detail-strip mb-4 grid gap-3 md:grid-cols-5">
        <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="text-xs text-slate-400">{tr("name")}</div><div className="font-bold">{d.name}</div></div>
        <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="text-xs text-slate-400">{tr("code")}</div><div className="font-bold">{d.code || d.id}</div></div>
        <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="text-xs text-slate-400">{tr("phone")}</div><div className="font-bold">{d.phone || "-"}</div></div>
        <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="text-xs text-slate-400">{tr("roleType")}</div><div className="font-bold">{roleLabel(d.role_type || "delivery", tr)}</div></div>
        <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="text-xs text-slate-400">{tr("commissionRate")}</div><div className="font-bold">{d.commission_rate || 0}%</div></div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2 page-tabs">
        {tabs.map(([k, label]) => (
          <button key={k} className={`rounded-xl px-3 py-1.5 text-sm font-bold ${tab === k ? "bg-ink text-white" : "bg-slate-100"}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "overview" ? (
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="text-xs text-slate-400">{tr("area")}</div><div className="font-bold">{d.area || "-"}</div></div>
          <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="text-xs text-slate-400">{tr("targetAmount")}</div><div className="font-bold">{money(d.target?.target_amount, lang)}</div></div>
        </div>
      ) : null}
      {tab === "sales" ? <Table cols={[tr("invoiceNo"), tr("date"), tr("customer"), tr("total"), tr("status")]} rows={(d.sales || []).map((s: any) => [
        <Link className="font-bold" to={`/sales/${s.id}`}>{s.number}</Link>, s.date, s.customer_name, money(s.total, lang), <span className={statusClass(s.status)}>{statusLabel(s.status, lang)}</span>,
      ])} /> : null}
      {tab === "visits" ? <Table cols={[tr("date"), tr("customer"), tr("visitPurpose"), tr("status")]} rows={(d.visits || []).map((v: any) => [
        `${v.date} ${v.visit_time || ""}`, v.customer_name, v.purpose, <span className={statusClass(v.result)}>{statusLabel(v.result, lang)}</span>,
      ])} /> : null}
      {tab === "commissions" ? <Table cols={[tr("invoiceNo"), tr("total"), tr("commissionRate"), tr("commissions"), tr("status")]} rows={(d.commissions || []).map((c: any) => [
        c.invoice_number, money(c.sale_amount, lang), `${c.rate}%`, money(c.amount, lang), statusLabel(c.status === "paid" ? "commission_paid" : c.status, lang),
      ])} /> : null}
    </Page>
  );
}

export function VisitsPage() {
  const { tr, lang, lookups, can, user } = useApp();
  const f = useListQuery("visits");
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ id: 0, agent_id: user?.delivery_agent_id || "", customer_id: "", customer_name: "", date: new Date().toISOString().slice(0, 10), visit_time: "", purpose: "", result: "planned", notes: "" });
  const [custQ, setCustQ] = useState("");
  const [custs, setCusts] = useState<any[]>([]);
  const { confirmDelete, dialog } = useConfirm();
  async function load() {
    setRows((await get<{ data: any[] }>(`/api/visits?${f.qs}`)).data || []);
  }
  useEffect(() => { load().catch(() => {}); }, [f.qs]);
  useEffect(() => {
    if (!custQ.trim()) { setCusts([]); return; }
    const t = setTimeout(() => {
      get<{ data: any[] }>(`/api/customers?q=${encodeURIComponent(custQ)}&pageSize=8`).then((r) => setCusts(r.data || [])).catch(() => {});
    }, 150);
    return () => clearTimeout(t);
  }, [custQ]);
  return (
    <Page title={tr("visits")} action={can("visits.own", "visits.manage") ? <Btn onClick={() => { setForm({ id: 0, agent_id: user?.delivery_agent_id || "", customer_id: "", customer_name: "", date: new Date().toISOString().slice(0, 10), visit_time: "", purpose: "", result: "planned", notes: "" }); setOpen(true); }}>{tr("newVisit")}</Btn> : null}>
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-2xl border bg-white p-3 text-sm"><div className="text-xs text-slate-400">{tr("today")}</div><div className="font-black">{rows.filter((r) => r.date === new Date().toISOString().slice(0, 10)).length}</div></div>
        <div className="rounded-2xl border bg-white p-3 text-sm"><div className="text-xs text-slate-400">{tr("planned")}</div><div className="font-black">{rows.filter((r) => r.result === "planned" && r.date === new Date().toISOString().slice(0, 10)).length}</div></div>
        {can("sales.create") ? <Link className="rounded-2xl bg-ink p-3 text-sm font-bold text-white" to="/pos">{tr("pos")}</Link> : null}
        {can("attendance.own") ? <Link className="rounded-2xl border bg-white p-3 text-sm font-bold" to="/hr/attendance">{tr("attendance")}</Link> : null}
      </div>
      <SmartFilter f={f} fields={[
        { key: "agent_id", label: "representative", type: "select", quick: true, lookup: "delivery_agents" },
        { key: "result", label: "status", type: "select", quick: true, options: ["planned", "done", "no_answer", "cancelled"].map((s) => ({ value: s, label: statusLabel(s, lang) })) },
        { key: "customer_id", label: "customers", type: "async", asyncPath: "/api/customers" },
        { key: "area", label: "area", type: "text" },
        { key: "done", label: "visitDone", type: "select", options: [{ value: "1", label: tr("visitDone") }] },
        { key: "incomplete", label: "visitIncomplete", type: "select", options: [{ value: "1", label: tr("visitIncomplete") }] },
        { key: "with_order", label: "withOrder", type: "select", options: [{ value: "1", label: tr("withOrder") }] },
        { key: "with_collection", label: "withCollection", type: "select", options: [{ value: "1", label: tr("withCollection") }] },
      ]} />
      <Table
        cols={[tr("date"), tr("agent"), tr("customer"), tr("visitPurpose"), tr("status"), ""]}
        rows={rows.map((v) => [
          `${v.date} ${v.visit_time || ""}`,
          `${v.agent_name} (${v.agent_code})`,
          v.customer_name || "-",
          v.purpose || "-",
          <span className={statusClass(v.result)}>{statusLabel(v.result, lang)}</span>,
          can("visits.own", "visits.manage") ? (
            <span className="flex flex-wrap items-center gap-2">
              {v.result === "planned" ? <button className="font-bold text-cyan-700" onClick={async () => { await put(`/api/visits/${v.id}`, { result: "done" }); load(); }}>{tr("done")}</button> : null}
              <ActionBtns
                canEdit={v.result === "planned"}
                canDelete
                onEdit={() => { setForm({ id: v.id, agent_id: v.agent_id || "", customer_id: v.customer_id || "", customer_name: v.customer_name || "", date: v.date, visit_time: v.visit_time || "", purpose: v.purpose || "", result: v.result, notes: v.notes || "" }); setOpen(true); setCustQ(""); }}
                onDelete={() => confirmDelete(v.customer_name || v.purpose || String(v.id), async () => { await del(`/api/visits/${v.id}`); load(); })}
              />
            </span>
          ) : null,
        ])}
      />
      <Modal open={open} title={form.id ? tr("edit") : tr("newVisit")} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          {can("visits.manage") ? (
            <Field label={tr("agent")}>
              <select className={inputCls} value={form.agent_id} onChange={(e) => setForm({ ...form, agent_id: e.target.value })}>
                <option value="">-</option>
                {(lookups?.delivery_agents || []).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
              </select>
            </Field>
          ) : null}
          <Field label={tr("customer")}>
            <input className={inputCls} value={custQ || form.customer_name} onChange={(e) => { setCustQ(e.target.value); setForm({ ...form, customer_name: e.target.value, customer_id: "" }); }} />
            {custs.map((c) => (
              <button key={c.id} className="mt-1 block w-full rounded-lg px-2 py-1 text-start text-sm hover:bg-slate-50" onClick={() => { setForm({ ...form, customer_id: String(c.id), customer_name: c.name }); setCustQ(""); setCusts([]); }}>{c.name}</button>
            ))}
          </Field>
          <Field label={tr("date")}><input className={inputCls} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label={tr("visitPurpose")}><input className={inputCls} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></Field>
          <Field label={tr("notes")}><input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <Btn onClick={async () => {
            if (form.id) await put(`/api/visits/${form.id}`, { purpose: form.purpose, notes: form.notes, result: form.result, visit_time: form.visit_time });
            else await post("/api/visits", { ...form, agent_id: form.agent_id || undefined, customer_id: form.customer_id ? Number(form.customer_id) : undefined });
            setOpen(false);
            load();
          }}>{tr("save")}</Btn>
        </div>
      </Modal>
      {dialog}
    </Page>
  );
}

export function TargetsPage() {
  const { tr, lang, lookups } = useApp();
  const f = useListQuery("targets", { month: monthNow() });
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ agent_id: "", target_amount: 0, target_visits: 0, notes: "" });
  const month = f.values.month || monthNow();
  const { confirmDelete, dialog } = useConfirm();
  async function load() {
    setRows((await get<{ data: any[] }>(`/api/targets?${f.qs}`)).data || []);
  }
  useEffect(() => { load().catch(() => {}); }, [f.qs]);
  return (
    <Page title={tr("targets")} action={<Btn onClick={() => setOpen(true)}>{tr("add")}</Btn>}>
      <SmartFilter f={f} date={false} fields={[
        { key: "month", label: "month", type: "text" },
        { key: "agent_id", label: "representative", type: "select", quick: true, lookup: "delivery_agents" },
      ]} />
      <Table
        cols={[tr("code"), tr("name"), tr("targetAmount"), tr("targetVisits"), tr("notes"), ""]}
        rows={rows.map((t) => [
          t.agent_code,
          t.agent_name,
          money(t.target_amount, lang),
          t.target_visits,
          t.notes || "-",
          <button className="font-bold text-rose-600" onClick={() => confirmDelete(t.agent_name, async () => { await del(`/api/targets/${t.id}`); load(); })}>{tr("delete")}</button>,
        ])}
      />
      <Modal open={open} title={tr("targets")} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label={tr("agent")}>
            <select className={inputCls} value={form.agent_id} onChange={(e) => setForm({ ...form, agent_id: e.target.value })}>
              <option value="">-</option>
              {(lookups?.delivery_agents || []).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
            </select>
          </Field>
          <Field label={tr("targetAmount")}><input className={inputCls} type="number" value={form.target_amount} onChange={(e) => setForm({ ...form, target_amount: Number(e.target.value) })} /></Field>
          <Field label={tr("targetVisits")}><input className={inputCls} type="number" value={form.target_visits} onChange={(e) => setForm({ ...form, target_visits: Number(e.target.value) })} /></Field>
          <Field label={tr("notes")}><input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <Btn onClick={async () => {
            await post("/api/targets", { ...form, agent_id: Number(form.agent_id), month });
            setOpen(false);
            load();
          }}>{tr("save")}</Btn>
        </div>
      </Modal>
      {dialog}
    </Page>
  );
}

export function CommissionsPage() {
  const { tr, lang, can } = useApp();
  const f = useListQuery("commissions", { month: monthNow() });
  const [rows, setRows] = useState<any[]>([]);
  async function load() {
    setRows((await get<{ data: any[] }>(`/api/commissions?${f.qs}`)).data || []);
  }
  useEffect(() => { load().catch(() => {}); }, [f.qs]);
  return (
    <Page title={tr("commissions")}>
      <SmartFilter f={f} date={false} fields={[
        { key: "month", label: "month", type: "text" },
        { key: "agent_id", label: "representative", type: "select", quick: true, lookup: "delivery_agents" },
        { key: "status", label: "status", type: "select", options: [{ value: "open", label: statusLabel("open", lang) }, { value: "paid", label: tr("payCommission") }] },
      ]} />
      <Table
        cols={[tr("agent"), tr("invoiceNo"), tr("customer"), tr("total"), tr("commissionRate"), tr("commissions"), tr("status"), ""]}
        rows={rows.map((c) => [
          `${c.agent_name} (${c.agent_code})`,
          c.invoice_number ? <Link className="font-bold" to={`/sales/${c.invoice_id}`}>{c.invoice_number}</Link> : c.invoice_id,
          c.customer_name || "-",
          money(c.sale_amount, lang),
          `${c.rate}%`,
          money(c.amount, lang),
          statusLabel(c.status === "paid" ? "commission_paid" : c.status, lang),
          c.status !== "paid" && can("targets.manage", "hr.payroll") ? (
            <button className="font-bold text-cyan-700" onClick={async () => { await post(`/api/commissions/${c.id}/pay`, {}); load(); }}>{tr("payCommission")}</button>
          ) : null,
        ])}
      />
    </Page>
  );
}
