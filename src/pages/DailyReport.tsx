import { useEffect, useMemo, useState } from "react";
import { useApp } from "../context";
import { get } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { money, num } from "../lib/format";
import { Btn, ErrorNote, ExportBtn, Field, FilterBar, PageLoading, PrintBtn, PrintLetterhead, inputCls } from "../components/ui";
import type { Msg } from "../i18n";

type SalesLine = {
  invoice_id?: number;
  date: string;
  time: string;
  sku: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
  total: number;
  discount: number;
  addition: number;
  net: number;
  cost?: number;
  profit?: number;
  customer: string;
};

type ReturnLine = Omit<SalesLine, "cost" | "profit">;

type Summary = {
  cash_sales: number;
  credit_sales: number;
  sales_returns: number;
  purchases: number;
  credit_purchases: number;
  purchase_returns: number;
  collections: number;
  expenses: number;
  vouchers_in: number;
  vouchers_out: number;
  opening_balance: number;
  net_movement: number;
  other_movement: number;
  final_balance: number;
};

type Report = {
  from: string;
  to: string;
  users: { id: number; full_name: string }[];
  summary: Summary;
  sales_lines: SalesLine[];
  return_lines: ReturnLine[];
  sales_totals: { qty: number; total: number; discount: number; net: number; cost: number; profit: number };
  return_totals: { qty: number; total: number; discount: number; net: number };
};

type Tab = "summary" | "sales" | "returns";

function localDay() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function defaultFrom() {
  return `${localDay()}T00:00`;
}

function defaultTo() {
  return `${localDay()}T23:59`;
}

function reportQuery(from: string, to: string, userId: string, treasuryId: string) {
  const p = new URLSearchParams();
  if (from) p.set("date_from", from);
  if (to) p.set("date_to", to);
  if (userId) p.set("user_id", userId);
  if (treasuryId) p.set("treasury_id", treasuryId);
  return p.toString();
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 shadow-sm">
      <div className="text-xs font-bold text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums tracking-tight text-[var(--text)]">{value}</div>
      {hint ? <div className="mt-1 text-xs tabular-nums text-[var(--muted)]" dir="ltr">{hint}</div> : null}
    </div>
  );
}

function auditNum(n: number) {
  return Number(n || 0).toLocaleString("en-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function signedMoney(n: number, lang: "ar" | "en") {
  const abs = money(Math.abs(n), lang);
  if (Math.abs(n) < 0.005) return money(0, lang);
  return n < 0 ? `−${abs}` : `+${abs}`;
}

export default function DailyReport() {
  const { tr, lang, can, lookups } = useApp();
  const showCost = can("costs.view");
  const cashAccounts = lookups?.cash_accounts || [];
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [userId, setUserId] = useState("");
  const [treasuryId, setTreasuryId] = useState("");
  const [tab, setTab] = useState<Tab>("summary");
  const [data, setData] = useState<Report | null>(null);
  const [users, setUsers] = useState<{ id: number; full_name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const qs = useMemo(() => reportQuery(from, to, userId, treasuryId), [from, to, userId, treasuryId]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const r = await get<Report>(`/api/reports/daily-movement?${qs}`);
      setData(r);
      if (r.users?.length) setUsers(r.users);
    } catch (e) {
      setErr(apiMessage(tr, e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const tabs: { id: Tab; key: Msg }[] = [
    { id: "summary", key: "dailySummaryTab" },
    { id: "sales", key: "dailySalesTab" },
    { id: "returns", key: "dailyReturnsTab" },
  ];
  const s = data?.summary;
  const salesTotal = (s?.cash_sales || 0) + (s?.credit_sales || 0);
  const cashRows: { key: Msg; signed: number }[] = s
    ? [
        { key: "cashSales", signed: s.cash_sales },
        { key: "collect", signed: s.collections },
        { key: "purchaseReturn", signed: s.purchase_returns },
        { key: "vouchersIn", signed: s.vouchers_in },
        { key: "salesReturns", signed: -(s.sales_returns || 0) },
        { key: "cashPurchases", signed: -(s.purchases || 0) },
        { key: "expenses", signed: -(s.expenses || 0) },
        { key: "vouchersOut", signed: -(s.vouchers_out || 0) },
        { key: "otherTreasury", signed: s.other_movement },
      ]
    : [];
  const cashIdentity = cashRows.reduce((n, r) => Math.round((n + r.signed) * 100) / 100, 0);
  const identityOk = s ? Math.abs(cashIdentity - (s.net_movement || 0)) < 0.005 : false;
  const infoRows: { key: Msg; value: number }[] = s
    ? [
        { key: "creditSales", value: s.credit_sales },
        { key: "creditPurchases", value: s.credit_purchases },
      ]
    : [];
  const balanceRows: { key: Msg; value: number }[] = s
    ? [
        { key: "opening", value: s.opening_balance },
        { key: "netMovement", value: s.net_movement },
        { key: "finalBalance", value: s.final_balance },
      ]
    : [];

  return (
    <div className="text-[var(--text)]">
      <PrintLetterhead title={tr("dailyReport")} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{tr("dailyReport")}</h1>
        <div className="no-print flex flex-wrap items-center gap-2">
          <ExportBtn kind="daily-movement" query={qs} />
          <PrintBtn />
        </div>
      </div>

      <FilterBar>
        <Field label="fromDate">
          <input className={`${inputCls} tabular-nums`} type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="toDateFull">
          <input className={`${inputCls} tabular-nums`} type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="cashBox">
          <select className={inputCls} value={treasuryId} onChange={(e) => setTreasuryId(e.target.value)}>
            <option value="">{tr("all")}</option>
            {cashAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {lang === "ar" ? a.name : a.name_en || a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="user">
          <select className={inputCls} value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">{tr("all")}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex flex-wrap items-end gap-2">
          <Btn loading={loading} onClick={() => void load()}>
            {tr("showReport")}
          </Btn>
          <ExportBtn kind="daily-movement" query={qs} />
          <PrintBtn />
        </div>
      </FilterBar>

      {err ? <ErrorNote message={err} /> : null}

      <div className="page-tabs no-print mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rounded-xl px-3 py-1.5 text-sm font-bold ${
              tab === t.id ? "bg-[var(--ink)] text-white" : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
            }`}
            onClick={() => setTab(t.id)}
          >
            {tr(t.key)}
          </button>
        ))}
      </div>

      {loading ? <PageLoading /> : null}

      {data && !loading ? (
        <>
          {tab === "summary" ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi label={tr("totalSales")} value={money(salesTotal, lang)} hint={auditNum(salesTotal)} />
                <Kpi label={tr("totalReturns")} value={money(s?.sales_returns, lang)} hint={auditNum(s?.sales_returns || 0)} />
                <Kpi label={tr("treasuryNet")} value={money(s?.net_movement, lang)} hint={auditNum(s?.net_movement || 0)} />
                <Kpi label={tr("finalBalance")} value={money(s?.final_balance, lang)} hint={auditNum(s?.final_balance || 0)} />
              </div>
              <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
                <div className="table-wrap overflow-x-auto">
                  <table className="min-w-[420px]">
                    <thead>
                      <tr>
                        <th>{tr("dailySummaryTab")}</th>
                        <th className="text-end">{tr("total")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-[var(--surface-2)]">
                        <td colSpan={2} className="text-xs font-black text-[var(--muted)]">{tr("cashDrawerSection")}</td>
                      </tr>
                      {cashRows.map((row) => (
                        <tr key={row.key}>
                          <td>{tr(row.key)}</td>
                          <td className="tabular-nums text-end font-bold">
                            <div>{signedMoney(row.signed, lang)}</div>
                            <div className="text-xs font-semibold text-[var(--muted)]" dir="ltr">{auditNum(row.signed)}</div>
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-2)]">
                        <td className="font-black">
                          {tr("cashIdentity")}
                          <div className={`text-xs font-bold ${identityOk ? "text-emerald-700" : "text-rose-700"}`}>
                            {tr(identityOk ? "identityMatches" : "identityMismatch")}
                          </div>
                        </td>
                        <td className="tabular-nums text-end font-black">
                          <div>{signedMoney(cashIdentity, lang)}</div>
                          <div className="text-xs font-semibold text-[var(--muted)]" dir="ltr">{auditNum(cashIdentity)}</div>
                        </td>
                      </tr>
                      <tr className="bg-[var(--surface-2)]">
                        <td colSpan={2} className="text-xs font-black text-[var(--muted)]">{tr("creditInfoSection")}</td>
                      </tr>
                      {infoRows.map((row) => (
                        <tr key={row.key}>
                          <td>{tr(row.key)}</td>
                          <td className="tabular-nums text-end font-bold">
                            <div>{money(row.value, lang)}</div>
                            <div className="text-xs font-semibold text-[var(--muted)]" dir="ltr">{auditNum(row.value)}</div>
                          </td>
                        </tr>
                      ))}
                      {balanceRows.map((row) => (
                        <tr key={row.key}>
                          <td>{tr(row.key)}</td>
                          <td className="tabular-nums text-end font-bold">
                            <div>{money(row.value, lang)}</div>
                            <div className="text-xs font-semibold text-[var(--muted)]" dir="ltr">{auditNum(row.value)}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "sales" ? (
            <LineTable
              cols={[
                tr("date"),
                tr("time"),
                tr("itemCode"),
                tr("itemName"),
                tr("unit"),
                tr("qty"),
                tr("sellingPrice"),
                tr("total"),
                tr("discount"),
                tr("addition"),
                tr("netAmount"),
                ...(showCost ? [tr("cost"), tr("profit")] : []),
                tr("account"),
              ]}
              rows={data.sales_lines.map((r) => [
                r.date,
                r.time || "—",
                r.sku,
                r.name,
                r.unit || "—",
                num(r.qty, lang),
                money(r.price, lang),
                money(r.total, lang),
                money(r.discount, lang),
                money(r.addition, lang),
                money(r.net, lang),
                ...(showCost ? [money(r.cost, lang), money(r.profit, lang)] : []),
                r.customer || "—",
              ])}
              footer={[
                tr("total"),
                "",
                "",
                "",
                "",
                num(data.sales_totals.qty, lang),
                "",
                money(data.sales_totals.total, lang),
                money(data.sales_totals.discount, lang),
                "",
                money(data.sales_totals.net, lang),
                ...(showCost ? [money(data.sales_totals.cost, lang), money(data.sales_totals.profit, lang)] : []),
                "",
              ]}
              minWidth={showCost ? "1280px" : "1080px"}
            />
          ) : null}

          {tab === "returns" ? (
            <LineTable
              cols={[
                tr("date"),
                tr("time"),
                tr("itemCode"),
                tr("itemName"),
                tr("unit"),
                tr("qty"),
                tr("sellingPrice"),
                tr("total"),
                tr("discount"),
                tr("addition"),
                tr("netAmount"),
                tr("account"),
              ]}
              rows={data.return_lines.map((r) => [
                r.date,
                r.time || "—",
                r.sku,
                r.name,
                r.unit || "—",
                num(r.qty, lang),
                money(r.price, lang),
                money(r.total, lang),
                money(r.discount, lang),
                money(r.addition, lang),
                money(r.net, lang),
                r.customer || "—",
              ])}
              footer={[
                tr("total"),
                "",
                "",
                "",
                "",
                num(data.return_totals.qty, lang),
                "",
                money(data.return_totals.total, lang),
                money(data.return_totals.discount, lang),
                "",
                money(data.return_totals.net, lang),
                "",
              ]}
              minWidth="1080px"
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function LineTable({
  cols,
  rows,
  footer,
  minWidth,
}: {
  cols: string[];
  rows: (string | number)[][];
  footer: (string | number)[];
  minWidth: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <div className="table-wrap overflow-x-auto">
        <table className="w-full" style={{ minWidth }}>
          <thead className="sticky top-0 z-10">
            <tr>
              {cols.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td key={j} className={j >= 5 && j < r.length - 1 ? "tabular-nums text-end" : undefined}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-[var(--surface-2)]">
            <tr className="border-t-2 border-[var(--border)] font-black">
              {footer.map((cell, j) => (
                <td key={j} className={j >= 5 && j < footer.length - 1 ? "tabular-nums text-end" : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
