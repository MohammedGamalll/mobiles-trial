import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp } from "../context";
import { get } from "../lib/api";
import { money, num, statusClass } from "../lib/format";
import { EasyLauncher } from "../components/EasyLauncher";
import { PrintBtn, PrintLetterhead, Stat } from "../components/ui";
import { SmartFilter } from "../components/SmartFilter";
import { useListQuery } from "../hooks/useListQuery";

export default function Dashboard() {
  const { uiLayout } = useApp();
  if (uiLayout === "classic_easy") return <EasyLauncher />;
  return <ModernDashboard />;
}

function ModernDashboard() {
  const { tr, lang, can, uiLayout, theme } = useApp();
  const showCost = can("costs.view");
  const dark = theme === "dark";
  const f = useListQuery("dashboard", { period: "this_month" });
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    get(`/api/dashboard?${f.qs}`).then(setD).catch(() => {});
  }, [f.qs]);
  if (!d) return <div className="text-slate-400">{tr("loading")}</div>;
  function vs(curr: number, prev: number) {
    if (!prev && !curr) return "";
    const pct = prev ? Math.round(((curr - prev) / prev) * 1000) / 10 : 100;
    return `${tr("vsLastPeriod")} ${pct > 0 ? "+" : ""}${pct}%`;
  }
  const cards = [
    [tr("salesToday"), money(d.sales_today, lang), `${num(d.invoices_today, lang)} ${tr("invoicesCount")}`, "cyan"],
    [tr("collected"), money(d.collections_today, lang), tr("salesToday"), "emerald"],
    [tr("accountCredit"), money(d.credit_today, lang), tr("salesToday"), "rose"],
    [tr("expenses"), money(d.expenses_month, lang), "", "amber"],
    ...(showCost ? [[tr("totalProfit"), money(d.profit_month ?? d.profit, lang), vs(d.profit_month, d.prev_profit_month), "emerald"] as const] : []),
    [tr("cashBanks"), money(d.cash_balance, lang), "", "emerald"],
    [tr("debtors"), money(d.debtors, lang), "", "rose"],
    [tr("creditors"), money(d.creditors, lang), "", "rose"],
    [tr("stockValue"), money(d.stock_value, lang), "", "cyan"],
    [tr("lowStock"), num(d.low_count, lang), "", "amber"],
    [tr("invoicesCount"), num(d.invoices_today, lang), tr("salesToday"), "indigo"],
    [tr("presentNow"), `${num(d.present_now, lang)} / ${num(d.staff_active, lang)}`, tr("employees"), "indigo"],
    [tr("reps"), num(d.reps_count, lang), "", "cyan"],
    [tr("salesMonth"), money(d.sales_month, lang), vs(d.sales_month, d.prev_sales_month), "indigo"],
    [tr("totalPurchases"), money(d.purchases, lang), vs(d.purchases, d.prev_purchases), "amber"],
    [tr("pendingDelivery"), num(d.pending_delivery, lang), "", "amber"],
    [tr("completedOrders"), num(d.completed_delivery, lang), "", "emerald"],
    [tr("returnedOrders"), num(d.returned_orders, lang), "", "rose"],
    [tr("pendingApprovals"), num(d.pending_approvals, lang), "", "rose"],
    [tr("deadStock"), num(d.dead_stock, lang), "", "amber"],
    [tr("dueExpenses"), num(d.due_expenses, lang), tr("recurring"), "rose"],
  ];
  const links: Record<string, string> = {
    [tr("salesToday")]: "/sales",
    [tr("collected")]: "/payments",
    [tr("accountCredit")]: "/sales",
    [tr("salesMonth")]: "/reports",
    [tr("totalProfit")]: "/reports",
    [tr("totalPurchases")]: "/purchases",
    [tr("stockValue")]: "/inventory",
    [tr("debtors")]: "/customers",
    [tr("pendingDelivery")]: "/delivery",
    [tr("cashBanks")]: "/ledger/cash",
    [tr("payments")]: "/payments",
    [tr("expenses")]: "/expenses",
    [tr("creditors")]: "/suppliers",
    [tr("lowStock")]: "/products?status=low",
    [tr("invoicesCount")]: "/sales",
    [tr("reps")]: "/reps",
    [tr("pendingApprovals")]: "/audit?tab=approvals",
    [tr("presentNow")]: "/hr/attendance",
    [tr("deadStock")]: "/products?status=in",
    [tr("dueExpenses")]: "/expenses",
  };
  return (
    <div className="space-y-5">
      <PrintLetterhead title={tr("dashboard")} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="page-title text-2xl font-black">{uiLayout === "classic_easy" ? tr("dashboard") : tr("commandCenter")}</h1>
          <p className="text-sm text-[var(--muted)]">{tr("tagline")}</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <PrintBtn />
          {can("sales.create") ? (
            <Link to="/pos" className="gx-confirm rounded-xl bg-[var(--btn)] px-4 py-2 text-sm font-bold text-[var(--btn-fg)]">
              {tr("pos")}
            </Link>
          ) : null}
        </div>
      </div>
      <SmartFilter f={f} search={false} fields={[
        { key: "branch_id", label: "branch", type: "select", quick: true, lookup: "branches" },
        { key: "sales_agent_id", label: "representative", type: "select", quick: true, lookup: "delivery_agents" },
        { key: "warehouse", label: "warehouse", type: "locations" },
      ]} />
      <div className={`dash-kpis grid gap-3 ${uiLayout === "classic_easy" ? "sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6" : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}`}>
        {cards.map(([l, v, h, a]) => {
          const to = links[String(l)];
          const card = <Stat key={String(l)} label={String(l)} value={String(v)} hint={String(h || "")} accent={a as any} />;
          return to ? <Link key={String(l)} to={to} className="block hover:opacity-90">{card}</Link> : card;
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm lg:col-span-2">
          <div className="mb-3 font-bold">{tr("lastDays")}</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.chart || []}>
                <XAxis dataKey="d" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area dataKey="total" stroke={dark ? "#D8CFBC" : "#11120D"} fill={dark ? "#565449" : "#D8CFBC"} name={tr("accountSales")} />
                <Area dataKey="profit" stroke={dark ? "#FFFBF4" : "#565449"} fill={dark ? "#22231C" : "#F7F3EA"} name={tr("profit")} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="mb-3 font-bold">{tr("topProducts")}</div>
          {(d.top_products || []).map((p: any) => (
            <div key={p.sku} className="flex items-center justify-between border-b border-[var(--border)] py-2 text-sm">
              <div>
                <div className="font-semibold">{p.product_name}</div>
                <div className="text-xs text-[var(--muted)]">{p.sku}</div>
              </div>
              <div className="font-bold">{num(p.qty, lang)}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="mb-3 font-bold">{tr("lowStock")}</div>
          <div className="table-wrap">
            <table>
              <tbody>
                {(d.low_stock || []).map((p: any) => (
                  <tr key={p.id}>
                    <td>{lang === "ar" ? p.name_ar : p.name_en}</td>
                    <td>{p.sku}</td>
                    <td>
                      <span className={statusClass("low")}>{p.current_stock - p.reserved_stock}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="mb-3 font-bold">{tr("outOfStock")}</div>
          <div className="table-wrap">
            <table>
              <tbody>
                {(d.out_of_stock || []).map((p: any) => (
                  <tr key={p.id}>
                    <td>{lang === "ar" ? p.name_ar : p.name_en}</td>
                    <td>{p.sku}</td>
                    <td>
                      <span className={statusClass("out")}>{tr("stockOut")}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
