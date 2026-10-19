import { useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp } from "../context";
import { get } from "../lib/api";
import { money, num, statusClass } from "../lib/format";
import { applyDashboardLayout, DASHBOARD_CARDS, parseDashboardLayout, type DashboardCardKey } from "../lib/dashboard-layout";
import { ProfitBreakdown } from "../components/ProfitBreakdown";
import { EasyLauncher } from "../components/EasyLauncher";
import { PrintBtn, PrintLetterhead, Stat } from "../components/ui";
import { ListGate } from "../components/ListGate";
import { SmartFilter } from "../components/SmartFilter";
import { useListQuery } from "../hooks/useListQuery";
import { useLiveList } from "../hooks/useLiveList";

export default function Dashboard() {
  const { uiLayout } = useApp();
  if (uiLayout === "classic_easy") return <EasyLauncher />;
  return <ModernDashboard />;
}

function ModernDashboard() {
  const { tr, lang, can, uiLayout, theme, settings } = useApp();
  const showCost = can("costs.view");
  const dark = theme === "dark";
  const f = useListQuery("dashboard", { period: "this_month" });
  const [d, setD] = useState<any>(null);
  const list = useLiveList(async () => {
    setD(await get(`/api/dashboard?${f.qs}`));
  }, [f.qs]);
  function vs(curr: number, prev: number) {
    if (!prev && !curr) return "";
    const pct = prev ? Math.round(((curr - prev) / prev) * 1000) / 10 : 100;
    return `${tr("vsLastPeriod")} ${pct > 0 ? "+" : ""}${pct}%`;
  }
  const data = d || {};
  const values: Record<DashboardCardKey, { value: string; hint: string; accent: string; to?: string }> = {
    sales_today: { value: money(data.sales_today, lang), hint: `${num(data.invoices_today, lang)} ${tr("invoicesCount")}`, accent: "cyan", to: "/sales" },
    collections_today: { value: money(data.collections_today, lang), hint: tr("salesToday"), accent: "emerald", to: "/payments" },
    credit_today: { value: money(data.credit_today, lang), hint: tr("salesToday"), accent: "rose", to: "/sales" },
    expenses_month: { value: money(data.expenses_month, lang), hint: "", accent: "amber", to: "/expenses" },
    profit_month: {
      value: money(data.profit_month ?? data.profit, lang),
      hint: `${vs(data.profit_month, data.prev_profit_month)}${data.net_profit != null ? ` · ${tr("netProfit")} ${money(data.net_profit, lang)}` : ""} · ${tr("shiftOverage")} ${money(data.shift_overage || 0, lang)} · ${tr("shiftShortage")} ${money(data.shift_shortage || 0, lang)}`,
      accent: "emerald",
      to: "/reports",
    },
    cash_balance: { value: money(data.cash_balance, lang), hint: "", accent: "emerald", to: "/ledger/cash" },
    debtors: { value: money(data.debtors, lang), hint: "", accent: "rose", to: "/customers" },
    creditors: { value: money(data.creditors, lang), hint: "", accent: "rose", to: "/suppliers" },
    stock_value: { value: money(data.stock_value, lang), hint: "", accent: "cyan", to: "/inventory" },
    low_count: { value: num(data.low_count, lang), hint: "", accent: "amber", to: "/products?status=low" },
    invoices_today: { value: num(data.invoices_today, lang), hint: tr("salesToday"), accent: "indigo", to: "/sales" },
    present_now: { value: `${num(data.present_now, lang)} / ${num(data.staff_active, lang)}`, hint: tr("employees"), accent: "indigo", to: "/hr/attendance" },
    reps_count: { value: num(data.reps_count, lang), hint: "", accent: "cyan", to: "/reps" },
    sales_month: { value: money(data.sales_month, lang), hint: vs(data.sales_month, data.prev_sales_month), accent: "indigo", to: "/reports" },
    purchases: { value: money(data.purchases, lang), hint: vs(data.purchases, data.prev_purchases), accent: "amber", to: "/purchases" },
    pending_delivery: { value: num(data.pending_delivery, lang), hint: "", accent: "amber", to: "/delivery" },
    completed_delivery: { value: num(data.completed_delivery, lang), hint: "", accent: "emerald", to: "/delivery" },
    returns_total: { value: money(data.returns_total, lang), hint: `${num(data.returns_count ?? data.returned_orders, lang)} ${tr("returns")}`, accent: "rose", to: "/reports/daily-movement" },
    pending_approvals: { value: num(data.pending_approvals, lang), hint: "", accent: "rose", to: "/audit?tab=approvals" },
    dead_stock: { value: num(data.dead_stock, lang), hint: "", accent: "amber", to: "/products?status=in" },
    due_expenses: { value: num(data.due_expenses, lang), hint: tr("recurring"), accent: "rose", to: "/expenses" },
  };
  const cards = applyDashboardLayout(DASHBOARD_CARDS, parseDashboardLayout(settings.dashboard_layout), showCost);
  return (
    <div className="space-y-5">
      <PrintLetterhead title={tr("dashboard")} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="page-title text-2xl font-black">{uiLayout === "classic_easy" ? tr("dashboard") : tr("commandCenter")}</h1>
          <p className="text-sm text-[var(--muted)]">{tr("tagline")}</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          {can("settings.edit") ? (
            <Link to="/settings" className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-bold">
              {tr("customizeDashboard")}
            </Link>
          ) : null}
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
      <ListGate loading={list.loading} err={list.err} onRetry={list.reload} empty={!d}>
      <div className={`dash-kpis grid gap-3 ${uiLayout === "classic_easy" ? "sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6" : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}`}>
        {cards.map((def) => {
          const item = values[def.key];
          const card = <Stat key={def.key} label={tr(def.label)} value={item.value} hint={item.hint || ""} accent={item.accent as any} />;
          return item.to ? <Link key={def.key} to={item.to} className="block hover:opacity-90">{card}</Link> : card;
        })}
      </div>
      {showCost && data.profit_breakdown ? <ProfitBreakdown data={data.profit_breakdown} /> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm lg:col-span-2">
          <div className="mb-3 font-bold">{tr("lastDays")}</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.chart || []}>
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
          {(data.top_products || []).map((p: any) => (
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
                {(data.low_stock || []).map((p: any) => (
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
                {(data.out_of_stock || []).map((p: any) => (
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
      </ListGate>
    </div>
  );
}
