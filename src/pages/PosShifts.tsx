import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../context";
import { get } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { money } from "../lib/format";
import { Btn, ErrorNote, Field, FilterBar, PageLoading, PrintBtn, PrintLetterhead, inputCls } from "../components/ui";

type ShiftRow = {
  id: number;
  user_name?: string;
  drawer_name?: string;
  drawer_name_en?: string;
  opened_at: string;
  closed_at?: string | null;
  opening_cash_balance: number;
  expected_cash_balance?: number | null;
  actual_cash_balance?: number | null;
  variance?: number | null;
  status: "open" | "closed";
};

type Report = {
  shift: ShiftRow & { cash_in?: number; cash_out?: number };
  sales: { id: number; number: string; date: string; customer_name?: string; total: number; paid: number; status: string }[];
  returns: { id: number; number: string; date: string; total: number; invoice_id?: number; invoice_number?: string }[];
  vouchers: { id: number; number: string; type: string; date: string; amount: number; party_name?: string }[];
  expenses: { id: number; date: string; amount: number; description?: string; category_ar?: string }[];
  collections: { id: number; date: string; method: string; amount: number; invoice_id?: number; invoice_number?: string }[];
  totals: {
    sales: number;
    sales_paid: number;
    returns: number;
    vouchers_in: number;
    vouchers_out: number;
    expenses: number;
    collections: number;
    opening: number;
    expected: number;
    actual: number | null;
    variance: number | null;
    shift_shortage?: number;
    shift_overage?: number;
  };
};

export default function PosShiftsPage() {
  const { tr, lang } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const selected = Number(params.get("id") || 0) || null;
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function loadList() {
    setLoading(true);
    setErr("");
    try {
      const q = status ? `?status=${status}` : "";
      const r = await get<{ data: ShiftRow[] }>(`/api/shifts${q}`);
      setRows(r.data || []);
    } catch (e) {
      setErr(apiMessage(tr, e));
    } finally {
      setLoading(false);
    }
  }

  async function loadReport(id: number) {
    setErr("");
    try {
      setReport(await get<Report>(`/api/shifts/${id}`));
    } catch (e) {
      setErr(apiMessage(tr, e));
    }
  }

  useEffect(() => {
    void loadList();
  }, [status]);

  useEffect(() => {
    if (selected) void loadReport(selected);
    else setReport(null);
  }, [selected]);

  const t = report?.totals;
  const variance = t?.variance;

  return (
    <div className="text-[var(--text)]">
      <PrintLetterhead title={tr("posShift")} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{report ? tr("shiftDetails") : tr("posShift")}</h1>
        <div className="no-print flex gap-2">
          {report ? <Btn kind="ghost" onClick={() => nav("/pos/shifts")}>{tr("back")}</Btn> : null}
          <PrintBtn />
        </div>
      </div>
      <ErrorNote message={err} />
      {!report ? (
        <>
          <FilterBar>
            <Field label="status">
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">{tr("all")}</option>
                <option value="open">{tr("shiftOpenStatus")}</option>
                <option value="closed">{tr("shiftClosedStatus")}</option>
              </select>
            </Field>
          </FilterBar>
          {loading ? <PageLoading /> : (
            <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
              <div className="table-wrap">
                <table className="text-sm">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{tr("user")}</th>
                      <th className="name">{tr("drawerAccount")}</th>
                      <th>{tr("openedAt")}</th>
                      <th>{tr("status")}</th>
                      <th className="num">{tr("openingDrawer")}</th>
                      <th className="num">{tr("shiftVariance")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="cursor-pointer" onClick={() => nav(`/pos/shifts?id=${r.id}`)}>
                        <td>{r.id}</td>
                        <td>{r.user_name}</td>
                        <td className="name">{lang === "ar" ? r.drawer_name : r.drawer_name_en || r.drawer_name}</td>
                        <td className="tabular-nums">{r.opened_at}</td>
                        <td>{r.status === "open" ? tr("shiftOpenStatus") : tr("shiftClosedStatus")}</td>
                        <td className="num">{money(r.opening_cash_balance, lang)}</td>
                        <td className={`num ${Number(r.variance || 0) < 0 ? "text-rose-600" : ""}`}>
                          {r.status === "closed" ? money(Number(r.variance || 0), lang) : "—"}
                        </td>
                      </tr>
                    ))}
                    {!rows.length ? <tr><td className="p-6 text-center text-[var(--muted)]" colSpan={7}>{tr("noData")}</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-5">
            <Kpi label={tr("openingDrawer")} value={money(t?.opening || 0, lang)} />
            <Kpi label={tr("expectedCash")} value={money(t?.expected || 0, lang)} />
            <Kpi label={tr("countedCash")} value={t?.actual == null ? "—" : money(t.actual, lang)} />
            <Kpi label={tr("shiftShortage")} value={money(t?.shift_shortage || (variance != null && variance < 0 ? Math.abs(variance) : 0), lang)} />
            <Kpi label={tr("shiftOverage")} value={money(t?.shift_overage || (variance != null && variance > 0 ? variance : 0), lang)} />
          </div>
          <Section title={tr("sales")} rows={report.sales.map((r) => [<InvoiceLink key={r.id} id={r.id} label={r.number} />, r.customer_name || "", money(r.total, lang)])} />
          <Section title={tr("salesReturns")} rows={report.returns.map((r) => [r.number, <InvoiceLink key={r.id} id={r.invoice_id} label={r.invoice_number} />, money(r.total, lang)])} />
          <Section title={tr("collect")} rows={report.collections.map((r) => [<InvoiceLink key={r.id} id={r.invoice_id} label={r.invoice_number} />, r.method, money(r.amount, lang)])} />
          <Section title={tr("vouchersIn")} rows={report.vouchers.filter((v) => v.type === "receipt").map((r) => [r.number, r.party_name || "", money(r.amount, lang)])} />
          <Section title={tr("vouchersOut")} rows={report.vouchers.filter((v) => v.type !== "receipt").map((r) => [r.number, r.party_name || "", money(r.amount, lang)])} />
          <Section title={tr("expenses")} rows={report.expenses.map((r) => [r.date, r.category_ar || r.description || "", money(r.amount, lang)])} />
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <div className="text-xs font-bold text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums">{value}</div>
    </div>
  );
}

function InvoiceLink({ id, label }: { id?: number | null; label?: string }) {
  if (!id) return <>{label || ""}</>;
  return (
    <Link className="font-extrabold text-cyan-800 underline underline-offset-2" to={`/sales/${id}`} onClick={(e) => e.stopPropagation()}>
      {label || id}
    </Link>
  );
}

function Section({ title, rows }: { title: string; rows: ReactNode[][] }) {
  const { tr } = useApp();
  return (
    <div>
      <h2 className="mb-2 text-lg font-black">{title}</h2>
      <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
        <div className="table-wrap">
          <table className="text-sm">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => <td key={j} className={j === r.length - 1 ? "num font-bold" : j === 0 ? "name" : ""}>{c}</td>)}
                </tr>
              ))}
              {!rows.length ? <tr><td className="p-4 text-[var(--muted)]">{tr("noData")}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
