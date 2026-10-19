import assert from "node:assert/strict";
import test from "node:test";
import { applyDashboardLayout, DASHBOARD_CARDS, parseDashboardLayout, stringifyDashboardLayout } from "../src/lib/dashboard-layout.ts";

test("dashboard layout hides and reorders cards", () => {
  const layout = parseDashboardLayout(stringifyDashboardLayout({
    order: ["profit_month", "sales_today"],
    hidden: ["dead_stock"],
  }));
  const cards = applyDashboardLayout(DASHBOARD_CARDS, layout, true);
  assert.equal(cards[0].key, "profit_month");
  assert.equal(cards[1].key, "sales_today");
  assert.equal(cards.some((c) => c.key === "dead_stock"), false);
  const noCost = applyDashboardLayout(DASHBOARD_CARDS, layout, false);
  assert.equal(noCost.some((c) => c.key === "profit_month"), false);
});
