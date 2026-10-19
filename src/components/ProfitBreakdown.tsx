import { useApp } from "../context";
import { money } from "../lib/format";
import type { Msg } from "../i18n";

export type ProfitBreakdownLine = {
  key: string;
  code: string;
  name_ar: string;
  name_en: string;
  amount: number;
};

export type ProfitBreakdownData = {
  lines?: ProfitBreakdownLine[];
  net_profit?: number;
};

const LINE_MSG: Record<string, Msg> = {
  sales: "sales",
  otherRevenues: "otherRevenues",
  shiftOverage: "shiftOverage",
  cogs: "cogs",
  expenses: "expenses",
  shiftShortage: "shiftShortage",
  payroll: "payroll",
  wastage: "wastage",
};

export function signedProfit(n: number, lang: "ar" | "en") {
  const abs = money(Math.abs(n), lang);
  if (Math.abs(n) < 0.005) return money(0, lang);
  return n < 0 ? `−${abs}` : `+${abs}`;
}

export function ProfitBreakdown({
  data,
  invoiceProfit,
  className = "",
}: {
  data?: ProfitBreakdownData | null;
  invoiceProfit?: number | null;
  className?: string;
}) {
  const { tr, lang } = useApp();
  const lines = data?.lines || [];
  const net = Number(data?.net_profit || 0);
  if (!data || (!lines.length && Math.abs(net) < 0.005 && invoiceProfit == null)) return null;

  function label(line: ProfitBreakdownLine) {
    const msg = LINE_MSG[line.key];
    if (msg) return tr(msg);
    return lang === "ar" ? line.name_ar || line.code : line.name_en || line.code;
  }

  return (
    <section className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm ${className}`}>
      <h2 className="mb-3 text-sm font-black">{tr("profitBreakdown")}</h2>
      {invoiceProfit != null ? (
        <div className="mb-2 flex items-center justify-between text-xs text-[var(--muted)]">
          <span>{tr("invoiceProfit")}</span>
          <span className="tabular-nums">{money(invoiceProfit, lang)}</span>
        </div>
      ) : null}
      <div className="space-y-2">
        {lines.map((line) => (
          <div key={`${line.code}-${line.key}`} className="flex items-center justify-between gap-3 text-sm">
            <span>{label(line)}</span>
            <span className={`tabular-nums font-bold ${line.amount < 0 ? "text-rose-700" : "text-emerald-700"}`}>
              {signedProfit(line.amount, lang)}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-2 text-sm font-black">
          <span>{tr("netProfit")}</span>
          <span className={`tabular-nums ${net < 0 ? "text-rose-700" : ""}`}>{money(net, lang)}</span>
        </div>
      </div>
    </section>
  );
}
