import { useMemo, useState } from "react";
import { useApp } from "../context";
import { get } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { money } from "../lib/format";
import { Btn, ErrorNote, Field, PageLoading, PrintBtn, PrintLetterhead, inputCls } from "../components/ui";
import { useLiveList } from "../hooks/useLiveList";

type TreasuryRow = {
  id: number;
  name: string;
  name_en: string;
  kind: string;
  opening: number;
  inflow: number;
  outflow: number;
  closing: number;
};

type Report = {
  from: string;
  to: string;
  treasuries: TreasuryRow[];
  totals: { opening: number; inflow: number; outflow: number; closing: number };
  inflow: Record<string, number>;
  outflow: Record<string, number>;
  expense_breakdown: { name_ar: string; name_en: string; total: number; count: number }[];
  revenue_breakdown: { key: string; name_ar: string; name_en: string; total: number }[];
};

function localDay() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function Kpi({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "emerald" | "rose" | "cyan" }) {
  const ring = {
    slate: "border-[var(--border)]",
    emerald: "border-emerald-200",
    rose: "border-rose-200",
    cyan: "border-cyan-200",
  }[tone];
  return (
    <div className={`rounded-2xl border ${ring} bg-[var(--surface)] p-4 shadow-sm`}>
      <div className="text-xs font-bold text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-2xl font-black tabular-nums">{value}</div>
    </div>
  );
}

export default function DailyFinance() {
  const { tr, lang, lookups } = useApp();
  const cashAccounts = lookups?.cash_accounts || [];
  const [from, setFrom] = useState(`${localDay()}T00:00`);
  const [to, setTo] = useState(`${localDay()}T23:59`);
  const [treasuryId, setTreasuryId] = useState("");
  const [data, setData] = useState<Report | null>(null);
  const [err, setErr] = useState("");
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("date_from", from);
    if (to) p.set("date_to", to);
    if (treasuryId) p.set("treasury_id", treasuryId);
    return p.toString();
  }, [from, to, treasuryId]);

  const list = useLiveList(async () => {
    setErr("");
    try {
      setData(await get<Report>(`/api/reports/daily-finance?${qs}`));
    } catch (e) {
      setErr(apiMessage(tr, e));
    }
  }, [qs]);

  const inflowRows = [
    ["cashSales", data?.inflow.cash_sales],
    ["collected", data?.inflow.collections],
    ["vouchers", data?.inflow.vouchers],
    ["purchaseReturns", data?.inflow.purchase_returns],
    ["otherRevenues", data?.inflow.other_revenues],
    ["shiftOverage", data?.inflow.cash_overage],
  ] as const;
  const outflowRows = [
    ["purchases", data?.outflow.purchases],
    ["expenses", data?.outflow.expenses],
    ["payroll", data?.outflow.payroll],
    ["vouchers", data?.outflow.vouchers],
    ["salesReturns", data?.outflow.sales_returns],
    ["commissions", data?.outflow.commissions],
  ] as const;

  return (
    <div>
      <PrintLetterhead title={tr("dailyFinance")} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black">{tr("dailyFinance")}</h1>
          <p className="text-sm text-[var(--muted)]">{tr("dailyFinanceHint")}</p>
        </div>
        <div className="no-print flex gap-2">
          <Btn loading={list.loading} onClick={() => void list.reload()}>{tr("refresh")}</Btn>
          <PrintBtn />
        </div>
      </div>
      <div className="no-print mb-4 grid gap-3 md:grid-cols-4">
        <Field label={tr("fromDate")}><input className={inputCls} type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={tr("toDate")}><input className={inputCls} type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label={tr("cashBox")}>
          <select className={inputCls} value={treasuryId} onChange={(e) => setTreasuryId(e.target.value)}>
            <option value="">{tr("all")}</option>
            {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
      </div>
      {err ? <ErrorNote message={err} /> : null}
      {list.loading && !data ? <PageLoading /> : null}
      {data ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label={tr("openingBalance")} value={money(data.totals.opening, lang)} />
            <Kpi label={tr("totalIn")} value={money(data.totals.inflow, lang)} tone="emerald" />
            <Kpi label={tr("totalOut")} value={money(data.totals.outflow, lang)} tone="rose" />
            <Kpi label={tr("finalBalance")} value={money(data.totals.closing, lang)} tone="cyan" />
          </div>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-black">{tr("cashBanks")}</h2>
            <div className="table-wrap overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th>{tr("cashBox")}</th>
                    <th className="text-end">{tr("openingBalance")}</th>
                    <th className="text-end">{tr("totalIn")}</th>
                    <th className="text-end">{tr("totalOut")}</th>
                    <th className="text-end">{tr("finalBalance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.treasuries.map((t) => (
                    <tr key={t.id}>
                      <td className="font-bold">{lang === "ar" ? t.name : (t.name_en || t.name)}</td>
                      <td className="text-end tabular-nums">{money(t.opening, lang)}</td>
                      <td className="text-end tabular-nums text-emerald-700">{money(t.inflow, lang)}</td>
                      <td className="text-end tabular-nums text-rose-700">{money(t.outflow, lang)}</td>
                      <td className="text-end tabular-nums font-black">{money(t.closing, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-emerald-100 bg-[var(--surface)] p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-black text-emerald-800">{tr("totalIn")}</h2>
              <div className="space-y-2">
                {inflowRows.map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <span>{tr(key)}</span>
                    <span className="font-bold tabular-nums">{money(value || 0, lang)}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-2xl border border-rose-100 bg-[var(--surface)] p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-black text-rose-800">{tr("totalOut")}</h2>
              <div className="space-y-2">
                {outflowRows.map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <span>{tr(key)}</span>
                    <span className="font-bold tabular-nums">{money(value || 0, lang)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-black">{tr("expenseBreakdown")}</h2>
              {(data.expense_breakdown || []).length ? (
                <div className="space-y-2">
                  {data.expense_breakdown.map((r, i) => (
                    <div key={`${r.name_ar}-${i}`} className="flex items-center justify-between text-sm">
                      <span>{lang === "ar" ? r.name_ar : r.name_en} <span className="text-[var(--muted)]">({r.count})</span></span>
                      <span className="font-bold tabular-nums">{money(r.total, lang)}</span>
                    </div>
                  ))}
                </div>
              ) : <div className="text-sm text-[var(--muted)]">{tr("noData")}</div>}
            </section>
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-black">{tr("revenueBreakdown")}</h2>
              {(data.revenue_breakdown || []).length ? (
                <div className="space-y-2">
                  {data.revenue_breakdown.map((r, i) => (
                    <div key={`${r.key}-${i}`} className="flex items-center justify-between text-sm">
                      <span>{lang === "ar" ? r.name_ar : r.name_en}</span>
                      <span className="font-bold tabular-nums">{money(r.total, lang)}</span>
                    </div>
                  ))}
                </div>
              ) : <div className="text-sm text-[var(--muted)]">{tr("noData")}</div>}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
