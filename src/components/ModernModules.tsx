import { NavLink, useLocation } from "react-router-dom";
import { useApp } from "../context";
import type { Msg } from "../i18n";

const MODULES: { to: string; key: Msg; perm: string }[] = [
  { to: "/", key: "dashboard", perm: "dashboard.view" },
  { to: "/pos", key: "pos", perm: "sales.create" },
  { to: "/products", key: "products", perm: "products.view" },
  { to: "/purchases", key: "purchases", perm: "purchases.view" },
  { to: "/sales", key: "sales", perm: "sales.view" },
  { to: "/hr/employees", key: "employees", perm: "hr.view" },
  { to: "/reports", key: "reports", perm: "reports.view" },
  { to: "/customers", key: "customers", perm: "customers.view" },
];

export function ModernModules() {
  const { tr, can } = useApp();
  const loc = useLocation();
  const items = MODULES.filter((m) => can(m.perm));
  if (!items.length) return null;
  return (
    <nav className="modern-modules no-print" aria-label={tr("salesOps")}>
      {items.map((m) => {
        const on = m.to === "/" ? loc.pathname === "/" : loc.pathname === m.to || loc.pathname.startsWith(`${m.to}/`);
        const longer = MODULES.some((o) => o.to !== m.to && o.to.startsWith(`${m.to}/`) && (loc.pathname === o.to || loc.pathname.startsWith(`${o.to}/`)));
        return (
          <NavLink key={m.to} to={m.to} end={m.to === "/"} className={`modern-mod ${on && !longer ? "is-on" : ""}`}>
            {tr(m.key)}
          </NavLink>
        );
      })}
    </nav>
  );
}
