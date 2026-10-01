import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../context";
import { get, post, put, del } from "../lib/api";
import { money, statusClass, statusLabel } from "../lib/format";
import { Btn, Field, Modal, PrintBtn, PrintLetterhead, inputCls } from "../components/ui";
import { EmptyFilterState, SmartFilter } from "../components/SmartFilter";
import { useListQuery } from "../hooks/useListQuery";
import { ActionBtns, useConfirm } from "../components/Confirm";

function Page({ title, action, children }: { title: string; action?: any; children: any }) {
  return (
    <div className="ledger-page">
      <PrintLetterhead title={title} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{title}</h1>
        <div className="no-print flex flex-wrap items-center gap-2">{action}<PrintBtn /></div>
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
          <thead><tr>{cols.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={cols.length} className="py-8 text-center text-slate-400">{tr("noData")}</td></tr>
              : rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CashAccountsPage() {
  const { tr, lang, can } = useApp();
  const f = useListQuery("cash");
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [xferOpen, setXferOpen] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [form, setForm] = useState({ id: 0, kind: "cash", name: "", account_id: 1, account_number: "", opening_balance: 0 });
  const [xfer, setXfer] = useState({ from_id: "", to_id: "", amount: 0, notes: "" });
  const { confirmDelete, dialog } = useConfirm();
  async function load() {
    setRows((await get<{ data: any[] }>(`/api/ledger/cash?${f.qs}`)).data || []);
  }
  useEffect(() => {
    load().catch(() => {});
  }, [f.qs]);
  useEffect(() => {
    get<{ data: any[] }>("/api/ledger/accounts").then((r) => setAccounts(r.data || [])).catch(() => {});
  }, []);
  return (
    <Page title={tr("cashBanks")} action={can("ledger.manage") ? (
      <div className="flex gap-2">
        <Btn kind="soft" onClick={() => setXferOpen(true)}>{tr("cashTransfer")}</Btn>
        <Btn onClick={() => setOpen(true)}>{tr("add")}</Btn>
      </div>
    ) : null}>
      <SmartFilter f={f} date={false} fields={[
        { key: "kind", label: "kind", type: "select", quick: true, options: [{ value: "cash", label: tr("cashBox") }, { value: "bank", label: tr("bank") }] },
      ]} />
      <Table
        cols={[tr("kind"), tr("name"), tr("accountCode"), tr("opening"), tr("acctBalance"), tr("status"), ""]}
        rows={rows.map((r) => [
          r.kind === "bank" ? tr("bank") : tr("cashBox"),
          r.name,
          r.account_code,
          money(r.opening_balance, lang),
          <b>{money(r.current_balance, lang)}</b>,
          <span className={statusClass(r.active ? "in" : "out")}>{r.active ? tr("active") : tr("inactive")}</span>,
          can("ledger.manage") ? (
            <ActionBtns
              canEdit
              canDelete
              onEdit={() => { setForm({ ...form, ...r }); setOpen(true); }}
              onDelete={() => confirmDelete(r.name, async () => { await del(`/api/ledger/cash/${r.id}`); load(); })}
            />
          ) : null,
        ])}
      />
      <Modal open={open} title={tr("cashBanks")} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label={tr("kind")}>
            <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="cash">{tr("cashBox")}</option>
              <option value="bank">{tr("bank")}</option>
            </select>
          </Field>
          <Field label={tr("name")}><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label={tr("chartAccounts")}>
            <select className={inputCls} value={form.account_id} onChange={(e) => setForm({ ...form, account_id: Number(e.target.value) })}>
              {accounts.filter((a) => a.type === "asset").map((a) => <option key={a.id} value={a.id}>{a.code} {lang === "ar" ? a.name_ar : a.name_en}</option>)}
            </select>
          </Field>
          <Field label={tr("accountNo")}><input className={inputCls} value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} /></Field>
          <Field label={tr("opening")}><input className={inputCls} type="number" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: Number(e.target.value) })} /></Field>
          <Btn onClick={async () => {
            if ((form as any).id) await put(`/api/ledger/cash/${(form as any).id}`, form);
            else await post("/api/ledger/cash", form);
            setOpen(false); load();
          }}>{tr("save")}</Btn>
        </div>
      </Modal>
      <Modal open={xferOpen} title={tr("cashTransfer")} onClose={() => setXferOpen(false)}>
        <div className="space-y-3">
          <Field label={tr("fromCash")}>
            <select className={inputCls} value={xfer.from_id} onChange={(e) => setXfer({ ...xfer, from_id: e.target.value })}>
              <option value="">-</option>
              {rows.map((r) => <option key={r.id} value={r.id}>{r.name} ({money(r.current_balance, lang)})</option>)}
            </select>
          </Field>
          <Field label={tr("toCash")}>
            <select className={inputCls} value={xfer.to_id} onChange={(e) => setXfer({ ...xfer, to_id: e.target.value })}>
              <option value="">-</option>
              {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <Field label={tr("amount")}><input className={inputCls} type="number" value={xfer.amount} onChange={(e) => setXfer({ ...xfer, amount: Number(e.target.value) })} /></Field>
          <Field label={tr("notes")}><input className={inputCls} value={xfer.notes} onChange={(e) => setXfer({ ...xfer, notes: e.target.value })} /></Field>
          <Btn onClick={async () => {
            await post("/api/ledger/cash-transfer", { from_id: Number(xfer.from_id), to_id: Number(xfer.to_id), amount: xfer.amount, notes: xfer.notes });
            setXferOpen(false);
            load();
          }}>{tr("save")}</Btn>
        </div>
      </Modal>
      {dialog}
    </Page>
  );
}

export function ChartPage() {
  const { tr, lang } = useApp();
  const f = useListQuery("trial", { period: "this_year" });
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { get<{ data: any[] }>(`/api/ledger/trial?${f.qs}`).then((r) => setRows(r.data || [])).catch(() => {}); }, [f.qs]);
  return (
    <Page title={tr("chartAccounts")}>
      <SmartFilter f={f} fields={[
        { key: "type", label: "kind", type: "select", quick: true, options: ["asset", "liability", "equity", "income", "expense"].map((t) => ({ value: t, label: statusLabel(t, lang) })) },
      ]} />
      <Table
        cols={[tr("accountCode"), tr("name"), tr("kind"), tr("debit"), tr("creditAmt"), tr("acctBalance")]}
        rows={rows.map((r) => {
          const bal = Number(r.debit || 0) - Number(r.credit || 0);
          return [
            r.code,
            lang === "ar" ? r.name_ar : r.name_en,
            statusLabel(r.type, lang),
            money(r.debit, lang),
            money(r.credit, lang),
            money(bal, lang),
          ];
        })}
      />
    </Page>
  );
}

export function JournalPage() {
  const { tr, lang } = useApp();
  const f = useListQuery("journal");
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  useEffect(() => { get<{ data: any[] }>(`/api/ledger/journal?${f.qs}&pageSize=80`).then((r) => setRows(r.data || [])).catch(() => {}); }, [f.qs]);
  return (
    <Page title={tr("journal")} action={<Btn kind="ghost" onClick={() => setOpen(true)}>{tr("view")}</Btn>}>
      <SmartFilter f={f} fields={[
        { key: "source", label: "source", type: "text", quick: true },
        { key: "status", label: "status", type: "select", options: [{ value: "posted", label: "posted" }, { value: "draft", label: tr("draft") }] },
        { key: "amount", label: "amountRange", type: "range", minKey: "amount_min", maxKey: "amount_max" },
        { key: "dc", label: "debit", type: "select", options: [{ value: "debit", label: tr("debit") }, { value: "credit", label: tr("creditAmt") }] },
      ]} />
      {!rows.length ? <EmptyFilterState onClear={f.clear} /> : (
      <Table
        cols={[tr("invoiceNo"), tr("date"), tr("description"), tr("source"), tr("total"), tr("status")]}
        rows={rows.map((r) => [
          <button className="font-bold text-cyan-700" onClick={async () => setDetail((await get<{ data: any }>(`/api/ledger/journal/${r.id}`)).data)}>{r.number}</button>,
          r.date,
          r.description,
          statusLabel(r.source, lang),
          money(r.total, lang),
          <span className={statusClass(r.status)}>{statusLabel(r.status, lang)}</span>,
        ])}
      />
      )}
      <Modal open={!!detail} title={detail?.number || tr("journal")} onClose={() => setDetail(null)} wide>
        {detail ? (
          <Table
            cols={[tr("accountCode"), tr("name"), tr("debit"), tr("creditAmt")]}
            rows={(detail.lines || []).map((l: any) => [l.code, lang === "ar" ? l.name_ar : l.name_en, money(l.debit, lang), money(l.credit, lang)])}
          />
        ) : null}
      </Modal>
      <Modal open={open} title={tr("journal")} onClose={() => setOpen(false)}>
        <div className="text-sm text-slate-500">{tr("autoJournalHint")}</div>
      </Modal>
    </Page>
  );
}

export function VouchersPage() {
  const { tr, lang, can, lookups } = useApp();
  const f = useListQuery("vouchers");
  const [rows, setRows] = useState<any[]>([]);
  const [cash, setCash] = useState<any[]>([]);
  const [custs, setCusts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: "receipt", cash_account_id: 1, party_type: "customer", party_id: "", party_name: "", amount: 0, description: "", date: new Date().toISOString().slice(0, 10) });
  const { confirmDelete, dialog } = useConfirm();
  async function load() {
    setRows((await get<{ data: any[] }>(`/api/ledger/vouchers?${f.qs}&pageSize=80`)).data || []);
  }
  useEffect(() => {
    load().catch(() => {});
    get<{ data: any[] }>("/api/ledger/cash").then((r) => setCash(r.data || [])).catch(() => {});
    get<{ data: any[] }>("/api/customers?pageSize=80").then((r) => setCusts(r.data || [])).catch(() => {});
  }, [f.qs]);
  return (
    <Page title={tr("vouchers")} action={can("vouchers.create") ? <Btn onClick={() => setOpen(true)}>{tr("newVoucher")}</Btn> : null}>
      <SmartFilter f={f} fields={[
        { key: "type", label: "kind", type: "select", quick: true, options: [{ value: "receipt", label: "receipt" }, { value: "payment", label: "payment" }] },
        { key: "cash_account_id", label: "cashBox", type: "select", options: cash.map((c) => ({ value: String(c.id), label: c.name })) },
        { key: "amount", label: "amountRange", type: "range", minKey: "amount_min", maxKey: "amount_max" },
      ]} />
      <Table
        cols={[tr("invoiceNo"), tr("kind"), tr("date"), tr("name"), tr("cashBox"), tr("amount"), ""]}
        rows={rows.map((r) => [
          r.journal_id ? <Link className="font-bold" to="/ledger/journal">{r.number}</Link> : r.number,
          r.type === "receipt" ? tr("receiptVoucher") : tr("paymentVoucher"),
          r.date,
          r.party_name || "-",
          r.cash_name,
          money(r.amount, lang),
          can("ledger.manage") && !r.voided_at ? <button className="font-bold text-rose-600" onClick={() => confirmDelete(r.number, async () => { await post(`/api/ledger/vouchers/${r.id}/void`, {}); load(); })}>{tr("delete")}</button> : null,
        ])}
      />
      <Modal open={open} title={tr("newVoucher")} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label={tr("kind")}>
            <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="receipt">{tr("receiptVoucher")}</option>
              <option value="payment">{tr("paymentVoucher")}</option>
            </select>
          </Field>
          <Field label={tr("cashBanks")}>
            <select className={inputCls} value={form.cash_account_id} onChange={(e) => setForm({ ...form, cash_account_id: Number(e.target.value) })}>
              {cash.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label={tr("customer")}>
            <select className={inputCls} value={form.party_id} onChange={(e) => {
              const id = e.target.value;
              const c = custs.find((x) => String(x.id) === id);
              setForm({ ...form, party_id: id, party_type: form.type === "receipt" ? "customer" : "supplier", party_name: c?.name || "" });
            }}>
              <option value="">-</option>
              {custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              {(lookups?.suppliers || []).map((s) => <option key={`s${s.id}`} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label={tr("name")}><input className={inputCls} value={form.party_name} onChange={(e) => setForm({ ...form, party_name: e.target.value, party_type: "other" })} /></Field>
          <Field label={tr("amount")}><input className={inputCls} type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></Field>
          <Field label={tr("date")}><input className={inputCls} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label={tr("notes")}><input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Btn onClick={async () => {
            await post("/api/ledger/vouchers", { ...form, party_id: form.party_id ? Number(form.party_id) : undefined });
            setOpen(false);
            load();
          }}>{tr("save")}</Btn>
        </div>
      </Modal>
      {dialog}
    </Page>
  );
}
