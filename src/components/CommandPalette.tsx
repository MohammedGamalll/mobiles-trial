import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { useApp } from "../context";
import { get } from "../lib/api";
import type { Msg } from "../i18n";

const pages: { to: string; key: Msg; perm: string }[] = [
  { to: "/", key: "dashboard", perm: "dashboard.view" },
  { to: "/pos", key: "pos", perm: "sales.create" },
  { to: "/sales", key: "sales", perm: "sales.view" },
  { to: "/products", key: "products", perm: "products.view" },
  { to: "/customers", key: "customers", perm: "customers.view" },
  { to: "/inventory", key: "inventory", perm: "inventory.view" },
  { to: "/courier", key: "myOrders", perm: "delivery.view" },
  { to: "/delivery", key: "delivery", perm: "delivery.update" },
  { to: "/purchases", key: "purchases", perm: "purchases.view" },
  { to: "/expenses", key: "expenses", perm: "expenses.view" },
  { to: "/reports", key: "reports", perm: "reports.view" },
  { to: "/serials", key: "serials", perm: "serials.manage" },
  { to: "/cheques", key: "cheques", perm: "cheques.manage" },
  { to: "/installments", key: "installments", perm: "installments.manage" },
  { to: "/reps", key: "reps", perm: "reps.view" },
  { to: "/hr/attendance", key: "attendance", perm: "attendance.own" },
  { to: "/ledger/journal", key: "journal", perm: "ledger.view" },
  { to: "/settings", key: "settings", perm: "settings.view" },
];

const kindKey: Record<string, Msg> = {
  pages: "pages",
  invoices: "sales",
  customers: "customers",
  products: "products",
  purchases: "purchases",
  agents: "reps",
  employees: "employees",
  suppliers: "suppliers",
  vouchers: "vouchers",
};

const resultNav: Record<string, (r: any) => string> = {
  invoices: (r) => `/sales/${r.id}`,
  customers: (r) => `/customers/${r.id}`,
  products: (r) => `/products/${r.id}`,
  purchases: (r) => `/purchases/${r.id}`,
  agents: (r) => `/reps/${r.id}`,
  employees: () => "/hr/employees",
  suppliers: (r) => `/suppliers/${r.id}`,
  vouchers: () => "/ledger/vouchers",
};

export function CommandPalette({ open, onOpen, onClose }: { open: boolean; onOpen: () => void; onClose: () => void }) {
  const { tr, can, lang } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<any>({});
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setHits({});
      setActive(0);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !q.trim()) {
      setHits({});
      return;
    }
    const t = setTimeout(() => {
      get(`/api/search?q=${encodeURIComponent(q)}`).then(setHits).catch(() => {});
    }, 140);
    return () => clearTimeout(t);
  }, [q, open]);

  const pageHits = useMemo(() => {
    const nq = q.trim().toLowerCase();
    return pages.filter((p) => can(p.perm) && (!nq || tr(p.key).toLowerCase().includes(nq) || p.to.includes(nq)));
  }, [q, can, tr]);

  const items = useMemo(() => {
    const list: { kind: string; label: string; hint?: string; go: () => void }[] = pageHits.map((p) => ({
      kind: "pages",
      label: tr(p.key),
      hint: p.to,
      go: () => nav(p.to),
    }));
    for (const k of ["invoices", "customers", "products", "purchases", "agents", "employees", "suppliers", "vouchers"]) {
      for (const r of hits[k] || []) {
        list.push({
          kind: k,
          label: r.number || r.name || r.name_ar || r.sku || String(r.id),
          hint: r.customer_name || r.phone || r.code || (lang === "en" ? r.name_en : "") || "",
          go: () => nav((resultNav[k] || (() => "/"))(r)),
        });
      }
    }
    return list;
  }, [pageHits, hits, nav, tr, lang]);

  useEffect(() => {
    setActive(0);
  }, [items.length, q]);

  function choose(i: number) {
    const item = items[i];
    if (!item) return;
    item.go();
    onClose();
  }

  if (!open) return null;
  return (
    <div className="command-palette drawer-root fixed inset-0 z-[80] no-print">
      <button type="button" className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" aria-label={tr("close")} onPointerDown={onClose} />
      <div
        className="relative mx-auto mt-[8vh] w-[min(640px,calc(100%-1.5rem))] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3">
          <Search size={16} className="text-slate-400" />
          <input
            autoFocus
            className="w-full bg-transparent py-3 text-sm text-[var(--text)] outline-none"
            placeholder={tr("globalSearch")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((v) => Math.min(items.length - 1, v + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((v) => Math.max(0, v - 1));
              }
              if (e.key === "Enter") {
                e.preventDefault();
                choose(active);
              }
            }}
          />
          <button type="button" className="rounded-lg p-2 text-[var(--text)]" aria-label={tr("close")} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[50vh] overflow-auto p-2">
          {items.length === 0 ? <div className="px-3 py-8 text-center text-sm text-slate-400">{tr("noResults")}</div> : null}
          {items.map((item, i) => (
            <button
              key={`${item.kind}-${item.label}-${i}`}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-start text-sm ${i === active ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]"}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              <span className="font-semibold">{item.label}</span>
              <span className="text-xs text-slate-400">{item.hint || tr(kindKey[item.kind] || "pages")}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
