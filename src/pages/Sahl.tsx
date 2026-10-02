import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../context";
import { get, post, del } from "../lib/api";
import { money, statusClass, statusLabel } from "../lib/format";
import { Btn, ErrorNote, Field, FilterBar, Modal, PrintBtn, PrintLetterhead, SearchPick, inputCls } from "../components/ui";
import { useActionError } from "../lib/errors";
import { EmptyFilterState, SmartFilter } from "../components/SmartFilter";
import { useListQuery } from "../hooks/useListQuery";
import { useConfirm } from "../components/Confirm";
import { matchScanned, playSound } from "../lib/sounds";

function Page({ title, action, children }: { title: string; action?: any; children: any }) {
  return (
    <div>
      <PrintLetterhead title={title} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{title}</h1>
        <div className="no-print flex flex-wrap items-center gap-2">{action}<PrintBtn /></div>
      </div>
      {children}
    </div>
  );
}

export function SerialsPage() {
  const { tr, lang, can } = useApp();
  const f = useListQuery("serials");
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_id: "", serials: "" });
  const { confirmDelete, dialog } = useConfirm();
  const act = useActionError();
  async function load() {
    setRows((await get<{ data: any[] }>(`/api/serials?${f.qs}&pageSize=80`)).data || []);
  }
  useEffect(() => { load().catch(() => {}); }, [f.qs]);
  return (
    <Page title={tr("serials")} action={can("serials.manage") ? <Btn onClick={() => { act.clear(); setOpen(true); }}>{tr("add")}</Btn> : null}>
      <SmartFilter f={f} date={false} fields={[
        { key: "status", label: "status", type: "select", quick: true, options: ["in_stock", "reserved", "sold", "returned"].map((s) => ({ value: s, label: statusLabel(s, lang) })) },
        { key: "product_id", label: "products", type: "async", asyncPath: "/api/products", asyncLabel: (r) => `${r.sku} — ${r.name_ar}` },
      ]} />
      <table className="w-full text-sm">
        <thead><tr className="text-slate-500"><th>{tr("serial")}</th><th>{tr("sku")}</th><th>{tr("products")}</th><th>{tr("status")}</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="font-bold">{r.serial}</td>
              <td>{r.sku}</td>
              <td>{lang === "ar" ? r.name_ar : r.name_en}</td>
              <td><span className={statusClass(r.status)}>{statusLabel(r.status, lang)}</span></td>
              <td>{can("serials.manage") ? <button className="font-bold text-rose-600" onClick={() => confirmDelete(r.serial, async () => { await del(`/api/serials/${r.id}`); load(); })}>{tr("delete")}</button> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal open={open} title={tr("serials")} onClose={() => { setOpen(false); act.clear(); }}>
        <SerialProductSelect value={form.product_id} onChange={(v) => setForm({ ...form, product_id: v })} />
        <Field label={tr("serials")}><textarea className={inputCls} rows={5} value={form.serials} onChange={(e) => setForm({ ...form, serials: e.target.value })} placeholder="IMEI / serial لكل سطر" /></Field>
        <ErrorNote message={act.message} />
        <Btn className="mt-3" onClick={async () => {
          if (!form.product_id) {
            act.fail(undefined, "errProductRequired");
            return;
          }
          const list = form.serials.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
          if (!list.length) {
            act.fail(undefined, "errSerialsRequired");
            return;
          }
          try {
            await post("/api/serials", { product_id: Number(form.product_id), serials: list });
            playSound("done");
            act.clear();
            setOpen(false); load();
          } catch (e) {
            act.fail(e);
          }
        }}>{tr("save")}</Btn>
      </Modal>
      {dialog}
    </Page>
  );
}

function SerialProductSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { tr } = useApp();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [miss, setMiss] = useState("");
  useEffect(() => {
    if (!q.trim()) { setRows([]); return; }
    const t = setTimeout(() => get<{ data: any[] }>(`/api/products?q=${encodeURIComponent(q)}&pageSize=8`).then((r) => setRows(r.data || [])).catch(() => {}), 150);
    return () => clearTimeout(t);
  }, [q]);
  function pick(p: any) {
    playSound("ok");
    setMiss("");
    onChange(String(p.id));
    setQ(p.sku);
  }
  return (
    <Field label={tr("products")}>
      <input
        className={inputCls}
        value={q}
        onChange={(e) => { setQ(e.target.value); setMiss(""); }}
        placeholder={tr("searchProduct")}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const exact = matchScanned(rows, q) || (rows.length === 1 ? rows[0] : undefined);
          if (!exact) {
            playSound("err");
            setMiss(tr("errProductNotFound"));
            return;
          }
          pick(exact);
        }}
      />
      <ErrorNote message={miss} />
      {rows.map((p) => (
        <button key={p.id} className={`mt-1 block w-full rounded-xl border px-2 py-1 text-start text-sm ${value === String(p.id) ? "bg-ink text-white" : ""}`} onClick={() => pick(p)}>
          {p.sku} · {p.name_ar}
        </button>
      ))}
    </Field>
  );
}

export function ChequesPage() {
  const { tr, lang, can } = useApp();
  const f = useListQuery("cheques");
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ number: "", direction: "in", party_type: "customer", party_id: "", party_name: "", bank: "", amount: 0, due_date: "", invoice_id: "", notes: "" });
  const { confirmDelete, dialog } = useConfirm();
  async function load() {
    setRows((await get<{ data: any[] }>(`/api/cheques?${f.qs}`)).data || []);
  }
  useEffect(() => { load().catch(() => {}); }, [f.qs]);
  return (
    <Page title={tr("cheques")} action={can("cheques.manage") ? <Btn onClick={() => setOpen(true)}>{tr("add")}</Btn> : null}>
      <SmartFilter f={f} fields={[
        { key: "status", label: "status", type: "select", quick: true, options: ["pending", "collected", "bounced"].map((s) => ({ value: s, label: statusLabel(s, lang) })) },
        { key: "direction", label: "kind", type: "select", options: [{ value: "in", label: "in" }, { value: "out", label: "out" }] },
        { key: "amount", label: "amountRange", type: "range", minKey: "amount_min", maxKey: "amount_max" },
      ]} />
      <table className="w-full text-sm">
        <thead><tr className="text-slate-500"><th>{tr("chequeNo")}</th><th>{tr("customer")}</th><th>{tr("amount")}</th><th>{tr("dueDate")}</th><th>{tr("status")}</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="font-bold">{r.number}</td>
              <td>{r.party_name} {r.invoice_id ? <Link className="text-cyan-700" to={`/sales/${r.invoice_id}`}>#{r.invoice_id}</Link> : null}</td>
              <td>{money(r.amount, lang)}</td>
              <td>{r.due_date}</td>
              <td><span className={statusClass(r.status)}>{statusLabel(r.status, lang)}</span></td>
              <td className="no-print">
                {r.status === "pending" && can("cheques.manage") ? (
                  <>
                    <button className="me-2 font-bold text-emerald-700" onClick={async () => { await post(`/api/cheques/${r.id}/collect`, {}); load(); }}>{tr("collect")}</button>
                    <button className="me-2 font-bold text-rose-600" onClick={async () => { await post(`/api/cheques/${r.id}/bounce`, {}); load(); }}>{tr("bounced")}</button>
                    <button className="font-bold text-rose-600" onClick={() => confirmDelete(r.number, async () => { await del(`/api/cheques/${r.id}`); load(); })}>{tr("delete")}</button>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal open={open} title={tr("cheques")} onClose={() => setOpen(false)}>
        <Field label={tr("chequeNo")}><input className={inputCls} value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></Field>
        <Field label={tr("kind")}>
            <select className={inputCls} value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value, party_id: "", party_name: "", party_type: e.target.value === "in" ? "customer" : "supplier" })}>
            <option value="in">{tr("receiptVoucher")}</option>
            <option value="out">{tr("paymentVoucher")}</option>
          </select>
        </Field>
        <Field label={form.direction === "in" ? tr("customer") : tr("supplier")}>
          <SearchPick
            path={form.direction === "in" ? "/api/customers" : "/api/suppliers"}
            valueId={form.party_id}
            valueLabel={form.party_name}
            placeholder={tr("searchAndPick")}
            subtitle={(r) => [r.phone, r.area, r.city].filter(Boolean).join(" · ")}
            onPick={(row, label) => setForm({
              ...form,
              party_id: row ? String(row.id) : "",
              party_type: row ? (form.direction === "in" ? "customer" : "supplier") : form.party_type,
              party_name: label,
            })}
          />
        </Field>
        <Field label={tr("bank")}><input className={inputCls} value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} /></Field>
        <Field label={tr("amount")}><input className={inputCls} type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></Field>
        <Field label={tr("dueDate")}><input className={inputCls} type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
        <Field label={tr("invoiceNo")}><input className={inputCls} value={form.invoice_id} onChange={(e) => setForm({ ...form, invoice_id: e.target.value })} placeholder="ID" /></Field>
        <Btn className="mt-3" onClick={async () => {
          await post("/api/cheques", { ...form, invoice_id: form.invoice_id ? Number(form.invoice_id) : null });
          setOpen(false); load();
        }}>{tr("save")}</Btn>
      </Modal>
      {dialog}
    </Page>
  );
}

export function InstallmentsPage() {
  const { tr, lang, can } = useApp();
  const f = useListQuery("installments");
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [payDue, setPayDue] = useState<any>(null);
  const [payAmt, setPayAmt] = useState("");
  const [form, setForm] = useState({ invoice_id: "", down_payment: 0, count: 3, start_date: new Date().toISOString().slice(0, 10), interval_days: 30 });
  const { confirmDelete, dialog } = useConfirm();
  const act = useActionError();
  async function load() {
    setRows((await get<{ data: any[] }>(`/api/installments?${f.qs}`)).data || []);
  }
  useEffect(() => { load().catch(() => {}); }, [f.qs]);
  async function openPlan(id: number) {
    setDetail((await get<{ data: any }>(`/api/installments/${id}`)).data);
  }
  return (
    <Page title={tr("installments")} action={can("installments.manage") ? <Btn onClick={() => setOpen(true)}>{tr("add")}</Btn> : null}>
      <SmartFilter f={f} fields={[
        { key: "status", label: "status", type: "select", quick: true, options: ["open", "paid", "overdue"].map((s) => ({ value: s, label: statusLabel(s, lang) })) },
        { key: "customer_id", label: "customers", type: "async", asyncPath: "/api/customers" },
      ]} />
      <table className="w-full text-sm">
        <thead><tr className="text-slate-500"><th>{tr("invoiceNo")}</th><th>{tr("customer")}</th><th>{tr("total")}</th><th>{tr("status")}</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td><button className="font-bold text-cyan-800" onClick={() => openPlan(r.id)}>{r.invoice_id}</button></td>
              <td>{r.customer_name}</td>
              <td>{money(r.total, lang)}</td>
              <td><span className={statusClass(r.status)}>{statusLabel(r.status, lang)}</span> · {r.open_dues}</td>
              <td>{can("installments.manage") ? <button className="font-bold text-rose-600" onClick={() => confirmDelete(String(r.invoice_id), async () => { await del(`/api/installments/${r.id}`); load(); setDetail(null); })}>{tr("delete")}</button> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {detail ? (
        <div className="mt-4 rounded-2xl border p-4">
          <div className="mb-2 font-bold">{tr("installments")} #{detail.id}</div>
          <table className="w-full text-sm">
            <thead><tr><th>{tr("dueDate")}</th><th>{tr("amount")}</th><th>{tr("paid")}</th><th></th></tr></thead>
            <tbody>
              {(detail.dues || []).map((d: any) => (
                <tr key={d.id} className="border-t">
                  <td>{d.due_date}</td>
                  <td>{money(d.amount, lang)}</td>
                  <td><span className={statusClass(d.status)}>{statusLabel(d.status, lang)}</span> {money(d.paid_amount, lang)}</td>
                  <td>{d.status !== "paid" && can("installments.manage") ? <Btn kind="soft" onClick={() => { setPayDue(d); setPayAmt(String(Math.max(0, Number(d.amount || 0) - Number(d.paid_amount || 0)))); }}>{tr("recordInstallment")}</Btn> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Modal open={open} title={tr("installments")} onClose={() => setOpen(false)}>
        <Field label={tr("invoiceNo")}><input className={inputCls} value={form.invoice_id} onChange={(e) => setForm({ ...form, invoice_id: e.target.value })} placeholder="ID" /></Field>
        <Field label={tr("paid")}><input className={inputCls} type="number" value={form.down_payment} onChange={(e) => setForm({ ...form, down_payment: Number(e.target.value) })} /></Field>
        <Field label={tr("qty")}><input className={inputCls} type="number" value={form.count} onChange={(e) => setForm({ ...form, count: Number(e.target.value) })} /></Field>
        <Field label={tr("fromDate")}><input className={inputCls} type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
        <Field label={tr("days")}><input className={inputCls} type="number" value={form.interval_days} onChange={(e) => setForm({ ...form, interval_days: Number(e.target.value) })} /></Field>
        <ErrorNote message={act.message} />
        <Btn className="mt-3" onClick={async () => {
          try {
            await post("/api/installments", { invoice_id: Number(form.invoice_id), down_payment: form.down_payment, count: form.count, start_date: form.start_date, interval_days: form.interval_days });
            setOpen(false); act.clear(); load();
          } catch (e) { act.fail(e); }
        }}>{tr("save")}</Btn>
      </Modal>
      <Modal open={!!payDue} title={tr("recordInstallment")} onClose={() => setPayDue(null)}>
        <Field label={tr("amount")}>
          <input className={inputCls} type="text" inputMode="decimal" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} />
        </Field>
        <ErrorNote message={act.message} />
        <Btn className="mt-3" onClick={async () => {
          if (!payDue || !detail) return;
          try {
            await post(`/api/installments/dues/${payDue.id}/pay`, { amount: Number(payAmt || 0) });
            setPayDue(null);
            act.clear();
            await openPlan(detail.id);
            load();
          } catch (e) { act.fail(e); }
        }}>{tr("save")}</Btn>
      </Modal>
      {dialog}
    </Page>
  );
}
