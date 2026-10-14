import { useEffect, useState } from "react";
import { useApp } from "../context";
import { get, post } from "../lib/api";
import { money } from "../lib/format";
import { Btn, ErrorNote, Field, Modal, PrintLetterhead, Stat, inputCls } from "../components/ui";
import { ListGate } from "../components/ListGate";
import { EmptyFilterState, SmartFilter } from "../components/SmartFilter";
import { useListQuery } from "../hooks/useListQuery";
import { useLiveList } from "../hooks/useLiveList";
import { useConfirm } from "../components/Confirm";
import { ListPager } from "../components/TablePager";
import { applyListPaging, inferredTotal, listPageSize } from "../hooks/usePagedRows";
import { useActionError } from "../lib/errors";

export default function OtherRevenues() {
  const { tr, lang, can, lookups } = useApp();
  const f = useListQuery("revenues");
  const [rows, setRows] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>({});
  const [cats, setCats] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const cashAccounts = lookups?.cash_accounts || [];
  const [form, setForm] = useState({
    amount: 0,
    cash_account_id: cashAccounts[0]?.id || 1,
    category_id: 1,
    notes: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const { confirmDelete, dialog } = useConfirm();
  const act = useActionError();

  async function load() {
    const p = new URLSearchParams(f.qs);
    applyListPaging(p, f.page, listPageSize(f.values));
    const r = await get<{ data: any[]; totals?: any }>(`/api/revenues?${p}`);
    setRows(r.data || []);
    setTotals(r.totals || {});
    setCats((await get<{ data: any[] }>("/api/revenue-categories")).data || []);
  }
  const list = useLiveList(load, [f.qs]);
  useEffect(() => {
    if (cashAccounts.length && !cashAccounts.some((a) => a.id === form.cash_account_id)) {
      setForm((prev) => ({ ...prev, cash_account_id: cashAccounts[0].id }));
    }
  }, [cashAccounts]);

  return (
    <div>
      <PrintLetterhead title={tr("otherRevenues")} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{tr("otherRevenues")}</h1>
        {can("payments.create") ? <Btn onClick={() => { act.clear(); setOpen(true); }}>{tr("addOtherRevenue")}</Btn> : null}
      </div>
      <div className="mb-3 grid gap-3 md:grid-cols-2">
        <Stat label={tr("total")} value={money(totals.total, lang)} accent="emerald" />
        <Stat label={tr("invoicesCount")} value={String(totals.count || rows.length)} />
      </div>
      <SmartFilter f={f} fields={[]} />
      <ListGate loading={list.loading} err={list.err} onRetry={list.reload} empty={!rows.length} emptyFallback={<EmptyFilterState onClear={f.clear} />}>
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{tr("date")}</th>
                  <th>{tr("revenueType")}</th>
                  <th>{tr("cashBox")}</th>
                  <th>{tr("amount")}</th>
                  <th>{tr("notes")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>{lang === "ar" ? (r.category_ar || r.category) : (r.category_en || r.category)}</td>
                    <td>{r.cash_name}</td>
                    <td>{money(r.amount, lang)}</td>
                    <td>{r.notes || "—"}</td>
                    <td>
                      {can("payments.create") ? (
                        <button
                          className="font-bold text-rose-600"
                          onClick={() => confirmDelete(money(r.amount, lang), async () => {
                            await post(`/api/revenues/${r.id}/void`, {});
                            list.reload();
                          })}
                        >
                          {tr("delete")}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </ListGate>
      <ListPager f={f} total={inferredTotal(f.page, listPageSize(f.values), rows.length, totals.count)} disabled={list.loading} />
      <Modal open={open} title={tr("addOtherRevenue")} onClose={() => setOpen(false)}>
        <ErrorNote message={act.message} />
        <Field label={tr("amount")}>
          <input className={inputCls} type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
        </Field>
        <Field label={tr("cashBox")}>
          <select className={inputCls} value={form.cash_account_id} onChange={(e) => setForm({ ...form, cash_account_id: Number(e.target.value) })}>
            {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label={tr("revenueType")}>
          <select className={inputCls} value={form.category_id} onChange={(e) => setForm({ ...form, category_id: Number(e.target.value) })}>
            {cats.map((c) => <option key={c.id} value={c.id}>{lang === "ar" ? c.name_ar : c.name_en}</option>)}
          </select>
        </Field>
        <Field label={tr("date")}>
          <input className={inputCls} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </Field>
        <Field label={tr("notes")}>
          <input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <Btn
          className="mt-3"
          onClick={async () => {
            try {
              await post("/api/revenues", form);
              setOpen(false);
              act.clear();
              list.reload();
            } catch (e) {
              act.fail(e);
            }
          }}
        >
          {tr("save")}
        </Btn>
      </Modal>
      {dialog}
    </div>
  );
}
