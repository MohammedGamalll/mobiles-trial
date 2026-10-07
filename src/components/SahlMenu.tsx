import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useApp } from "../context";
import type { Msg } from "../i18n";

type Item = { to: string; key: Msg; perm: string };

type Group = { key: Msg; items: Item[] };

const groups: Group[] = [
  {
    key: "easyGoods",
    items: [
      { to: "/products", key: "products", perm: "products.view" },
      { to: "/inventory", key: "inventory", perm: "inventory.view" },
      { to: "/batches", key: "batches", perm: "inventory.view" },
      { to: "/serials", key: "serials", perm: "serials.manage" },
      { to: "/brands", key: "brands", perm: "brands.manage" },
      { to: "/part-types", key: "partTypes", perm: "categories.manage" },
      { to: "/models", key: "models", perm: "models.manage" },
      { to: "/categories", key: "categories", perm: "categories.manage" },
      { to: "/locations", key: "warehouses", perm: "locations.manage" },
    ],
  },
  {
    key: "easyAccounts",
    items: [
      { to: "/customers", key: "customers", perm: "customers.view" },
      { to: "/reports/daily-movement", key: "easyDaily", perm: "reports.view" },
      { to: "/suppliers", key: "suppliers", perm: "suppliers.view" },
      { to: "/price-lists", key: "priceLists", perm: "prices.view" },
    ],
  },
  {
    key: "sahlOps",
    items: [
      { to: "/pos", key: "pos", perm: "sales.create" },
      { to: "/purchases", key: "purchases", perm: "purchases.view" },
      { to: "/transfers", key: "transfers", perm: "transfers.view" },
      { to: "/stocktake", key: "stocktake", perm: "stocktake.view" },
      { to: "/wastage", key: "wastage", perm: "stocktake.view" },
      { to: "/inventory", key: "easyAdjust", perm: "inventory.view" },
    ],
  },
  {
    key: "easyTreasury",
    items: [
      { to: "/ledger/cash", key: "cashBanks", perm: "ledger.view" },
      { to: "/ledger/vouchers", key: "vouchers", perm: "vouchers.create" },
      { to: "/payments", key: "payments", perm: "payments.view" },
      { to: "/expenses", key: "expenses", perm: "expenses.view" },
      { to: "/partners", key: "partnersEquity", perm: "partners.view" },
      { to: "/cheques", key: "cheques", perm: "cheques.manage" },
      { to: "/installments", key: "installments", perm: "installments.manage" },
    ],
  },
  {
    key: "easyInvoices",
    items: [
      { to: "/sales", key: "sales", perm: "sales.view" },
      { to: "/pos", key: "pos", perm: "sales.create" },
      { to: "/pos?mode=quote", key: "quoteMode", perm: "sales.create" },
      { to: "/purchases", key: "purchases", perm: "purchases.view" },
    ],
  },
  {
    key: "easyReports",
    items: [
      { to: "/reports", key: "reports", perm: "reports.view" },
      { to: "/reports/trial-balance", key: "trialBalance", perm: "reports.view" },
      { to: "/reports?tab=sales", key: "easySalesAnalysis", perm: "reports.view" },
      { to: "/reports?tab=expiry", key: "expiryReport", perm: "reports.view" },
    ],
  },
];

export function SahlMenu() {
  const { tr, can } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <nav className="sahl-menu no-print" onMouseLeave={() => setOpen(null)}>
      {groups.map((g) => {
        const items = g.items.filter((i) => can(i.perm));
        if (!items.length) return null;
        return (
          <div key={g.key} className="sahl-menu-item" onMouseEnter={() => setOpen(g.key)}>
            <button type="button" className={open === g.key ? "is-open" : ""} onClick={() => setOpen(open === g.key ? null : g.key)}>
              {tr(g.key)}
            </button>
            {open === g.key ? (
              <div className="sahl-menu-drop">
                {items.map((i) => (
                  <NavLink key={`${i.to}-${i.key}`} to={i.to} onClick={() => setOpen(null)}>
                    {tr(i.key)}
                  </NavLink>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
