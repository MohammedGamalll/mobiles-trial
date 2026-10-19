import type { Msg } from "../i18n";

export type DashboardCardKey =
  | "sales_today"
  | "collections_today"
  | "credit_today"
  | "expenses_month"
  | "profit_month"
  | "cash_balance"
  | "debtors"
  | "creditors"
  | "stock_value"
  | "low_count"
  | "invoices_today"
  | "present_now"
  | "sales_month"
  | "purchases"
  | "pending_delivery"
  | "completed_delivery"
  | "returns_total"
  | "pending_approvals"
  | "dead_stock"
  | "due_expenses";

export type DashboardCardDef = {
  key: DashboardCardKey;
  label: Msg;
  costOnly?: boolean;
};

export type DashboardLayout = {
  order: DashboardCardKey[];
  hidden: DashboardCardKey[];
};

export const DASHBOARD_CARDS: DashboardCardDef[] = [
  { key: "sales_today", label: "salesToday" },
  { key: "collections_today", label: "collected" },
  { key: "credit_today", label: "accountCredit" },
  { key: "expenses_month", label: "expenses" },
  { key: "profit_month", label: "totalProfit", costOnly: true },
  { key: "cash_balance", label: "cashBanks" },
  { key: "debtors", label: "debtors" },
  { key: "creditors", label: "creditors" },
  { key: "stock_value", label: "stockValue" },
  { key: "low_count", label: "lowStock" },
  { key: "invoices_today", label: "invoicesCount" },
  { key: "present_now", label: "presentNow" },
  { key: "sales_month", label: "salesMonth" },
  { key: "purchases", label: "totalPurchases" },
  { key: "pending_delivery", label: "pendingDelivery" },
  { key: "completed_delivery", label: "completedOrders" },
  { key: "returns_total", label: "totalReturns" },
  { key: "pending_approvals", label: "pendingApprovals" },
  { key: "dead_stock", label: "deadStock" },
  { key: "due_expenses", label: "dueExpenses" },
];

const KEYS = new Set(DASHBOARD_CARDS.map((c) => c.key));

function asKey(value: unknown): DashboardCardKey | null {
  const key = String(value || "");
  return KEYS.has(key as DashboardCardKey) ? (key as DashboardCardKey) : null;
}

export function parseDashboardLayout(raw: string | null | undefined): DashboardLayout {
  try {
    const parsed = JSON.parse(String(raw || ""));
    const order = (Array.isArray(parsed?.order) ? parsed.order : []).map(asKey).filter(Boolean) as DashboardCardKey[];
    const hidden = (Array.isArray(parsed?.hidden) ? parsed.hidden : []).map(asKey).filter(Boolean) as DashboardCardKey[];
    return { order: [...new Set(order)], hidden: [...new Set(hidden)] };
  } catch {
    return { order: [], hidden: [] };
  }
}

export function stringifyDashboardLayout(layout: DashboardLayout) {
  return JSON.stringify({
    order: [...new Set(layout.order.filter((k) => KEYS.has(k)))],
    hidden: [...new Set(layout.hidden.filter((k) => KEYS.has(k)))],
  });
}

export function applyDashboardLayout(cards: DashboardCardDef[], layout: DashboardLayout, showCost: boolean) {
  const visible = cards.filter((c) => (showCost || !c.costOnly) && !layout.hidden.includes(c.key));
  const seen = new Set<DashboardCardKey>();
  const ordered: DashboardCardDef[] = [];
  for (const key of layout.order) {
    const card = visible.find((c) => c.key === key);
    if (card && !seen.has(card.key)) {
      ordered.push(card);
      seen.add(card.key);
    }
  }
  for (const card of visible) {
    if (!seen.has(card.key)) ordered.push(card);
  }
  return ordered;
}
