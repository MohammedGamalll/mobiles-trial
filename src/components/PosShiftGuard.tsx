import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../context";
import { get, post } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { money } from "../lib/format";
import type { Msg } from "../i18n";
import { Btn, Field, PageLoading, inputCls } from "./ui";

type CloseSale = {
  id: number;
  number: string;
  customer_name?: string;
  payment_method?: string;
  type?: string;
  total: number;
  paid: number;
  remaining?: number;
};
type CloseReturn = { id: number; number: string; total: number; invoice_id?: number; invoice_number?: string };
type ClosePay = { id: number; method: string; amount: number; invoice_id?: number; invoice_number?: string; notes?: string; invoice_type?: string };
type CloseVoucher = { id: number; number: string; type: string; amount: number; party_name?: string };
type CloseExpense = { id: number; amount: number; description?: string; category_ar?: string };
type CloseReport = {
  sales: CloseSale[];
  returns: CloseReturn[];
  collections: ClosePay[];
  vouchers: CloseVoucher[];
  expenses: CloseExpense[];
  totals: {
    sales: number;
    sales_paid: number;
    returns: number;
    vouchers_in: number;
    vouchers_out: number;
    expenses: number;
    collections: number;
    opening: number;
    expected: number;
  };
};

function isCreditMethod(method?: string | null) {
  return String(method || "").toLowerCase() === "credit";
}

function sumBy(rows: Array<Record<string, unknown>>, key: string) {
  return rows.reduce((s, r) => s + Number(r[key] || 0), 0);
}

export type PosShift = {
  id: number;
  user_id: number;
  cash_account_id: number;
  opened_at: string;
  opening_cash_balance: number;
  expected_cash_balance?: number | null;
  actual_cash_balance?: number | null;
  variance?: number | null;
  status: "open" | "closed";
  drawer_name?: string;
  drawer_name_en?: string;
  user_name?: string;
  cash_in?: number;
  cash_out?: number;
};

type Ctx = { shift: PosShift; reload: () => Promise<PosShift | null> };

const PosShiftCtx = createContext<Ctx | null>(null);

export function usePosShift() {
  return useContext(PosShiftCtx);
}

export function PosShiftGuard({ children }: { children: ReactNode }) {
  const [shift, setShift] = useState<PosShift | null | undefined>(undefined);

  async function reload() {
    try {
      const r = await get<{ shift: PosShift | null }>("/api/shifts/current");
      const next = r.shift || null;
      setShift(next);
      return next;
    } catch {
      setShift(null);
      return null;
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  if (shift === undefined) return <PageLoading />;
  if (!shift) return <OpenShiftScreen onOpened={reload} />;
  return <PosShiftCtx.Provider value={{ shift, reload }}>{children}</PosShiftCtx.Provider>;
}

function OpenShiftScreen({ onOpened }: { onOpened: () => Promise<void> }) {
  const { tr, lang, lookups } = useApp();
  const drawers = (lookups?.cash_accounts || []).filter((a) => a.kind !== "bank");
  const [cashId, setCashId] = useState(String(drawers[0]?.id || ""));
  const [opening, setOpening] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!cashId) {
      setOpening(null);
      return;
    }
    get<{ opening_cash_balance: number }>(`/api/shifts/opening?cash_account_id=${cashId}`)
      .then((r) => setOpening(Number(r.opening_cash_balance || 0)))
      .catch(() => setOpening(null));
  }, [cashId]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
        <h1 className="text-2xl font-black">{tr("openShift")}</h1>
        <p className="text-sm leading-6 text-[var(--muted)]">{tr("openShiftHint")}</p>
        <Field label="drawerAccount">
          <select className={inputCls} value={cashId} onChange={(e) => setCashId(e.target.value)}>
            {drawers.map((a) => (
              <option key={a.id} value={a.id}>{lang === "ar" ? a.name : a.name_en || a.name}</option>
            ))}
          </select>
        </Field>
        <div className="rounded-2xl bg-[var(--surface-2)] p-4">
          <div className="text-xs font-bold text-[var(--muted)]">{tr("openingDrawer")}</div>
          <div className="mt-1 text-2xl font-black tabular-nums">{opening == null ? "—" : money(opening, lang)}</div>
        </div>
        {err ? <div className="text-sm font-bold text-rose-600">{err}</div> : null}
        <Btn
          className="w-full"
          disabled={busy || !cashId}
          onClick={async () => {
            setBusy(true);
            setErr("");
            try {
              await post("/api/shifts/open", { cash_account_id: Number(cashId) });
              await onOpened();
            } catch (e) {
              setErr(apiMessage(tr, e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr("confirmOpenShift")}
        </Btn>
      </div>
    </div>
  );
}

export function CloseShiftModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const ctx = usePosShift();
  const { tr, lang } = useApp();
  const navigate = useNavigate();
  const [actual, setActual] = useState("");
  const [report, setReport] = useState<CloseReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [expected, setExpected] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !ctx) return;
    if (!actual.trim()) {
      setReport(null);
      setExpected(null);
      setErr("");
      return;
    }
    let live = true;
    const timer = window.setTimeout(async () => {
      setBusy(true);
      setErr("");
      try {
        const [rep, fresh] = await Promise.all([
          get<CloseReport>(`/api/shifts/${ctx.shift.id}`),
          ctx.reload(),
        ]);
        if (!live) return;
        setReport(rep);
        setExpected(Number(rep.totals?.expected ?? fresh?.expected_cash_balance ?? 0));
      } catch (e) {
        if (!live) return;
        setErr(apiMessage(tr, e));
        setReport(null);
      } finally {
        if (live) setBusy(false);
      }
    }, 280);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [open, actual, ctx?.shift.id, tr]);

  const counted = Number(actual);
  const sales = report?.sales || [];
  const cashSales = sales.filter((s) => s.type !== "delivery" && !isCreditMethod(s.payment_method));
  const creditSales = sales.filter((s) => s.type !== "delivery" && isCreditMethod(s.payment_method));
  const cashSalesTotal = sumBy(cashSales, "total");
  const creditSalesTotal = sumBy(creditSales, "total");
  const creditRemaining = sumBy(creditSales, "remaining");
  const receipts = (report?.vouchers || []).filter((v) => v.type === "receipt");
  const paymentsOut = (report?.vouchers || []).filter((v) => v.type !== "receipt");
  const shownExpected = expected ?? Number(report?.totals.expected || ctx?.shift.expected_cash_balance || 0);
  const variance = report && Number.isFinite(counted) ? counted - shownExpected : null;

  if (!open || !ctx) return null;

  return (
    <div className="drawer-root fixed inset-0 z-50 no-print">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="drawer-panel absolute inset-y-0 end-0 flex h-full w-full max-w-xl flex-col border-s border-[var(--border)] bg-[var(--surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h3 className="text-base font-bold">{tr("closeShift")}</h3>
          <button className="rounded-lg px-2 py-1 text-[var(--muted)]" onClick={onClose}>✕</button>
        </div>
        <div className="flex-1 space-y-4 overflow-auto p-5">
          <p className="text-sm leading-6 text-[var(--muted)]">{tr("closeShiftHint")}</p>
          <Field label="countedCash">
            <input
              className={inputCls}
              type="number"
              min={0}
              autoFocus
              value={actual}
              onChange={(e) => setActual(e.target.value)}
            />
          </Field>
          {actual.trim() && busy && !report ? <PageLoading /> : null}
          {report ? (
            <div className="space-y-4">
              <div className="space-y-2 rounded-2xl bg-[var(--surface-2)] p-4 text-sm">
                <CloseStat label={tr("openingDrawer")} value={money(report.totals.opening || 0, lang)} />
                <CloseStat label={tr("cashSales")} value={money(cashSalesTotal, lang)} />
                <CloseStat label={tr("creditSales")} value={money(creditSalesTotal, lang)} />
                <CloseStat label={`${tr("creditSales")} · ${tr("remaining")}`} value={money(creditRemaining, lang)} />
                <CloseStat label={tr("collect")} value={money(report.totals.collections || 0, lang)} />
                <CloseStat label={tr("vouchersIn")} value={money(report.totals.vouchers_in || 0, lang)} />
                <CloseStat label={tr("salesReturns")} value={money(report.totals.returns || 0, lang)} />
                <CloseStat label={tr("vouchersOut")} value={money(report.totals.vouchers_out || 0, lang)} />
                <CloseStat label={tr("expenses")} value={money(report.totals.expenses || 0, lang)} />
                <div className="mt-1 flex justify-between border-t border-[var(--border)] pt-2 text-base">
                  <span className="font-black">{tr("drawerShouldHave")}</span>
                  <b className="tabular-nums">{money(shownExpected, lang)}</b>
                </div>
                <div className="flex justify-between">
                  <span>{tr("shiftVariance")}</span>
                  <b className={`tabular-nums ${variance != null && variance < 0 ? "text-rose-600" : "text-emerald-700"}`}>
                    {variance == null ? "—" : money(variance, lang)}{" "}
                    {variance != null && variance < 0 ? tr("shiftShortage") : variance != null && variance > 0 ? tr("shiftOverage") : ""}
                  </b>
                </div>
              </div>
              <CloseLines title="sales" rows={sales.map((r) => [
                <Link key={r.id} className="font-extrabold text-cyan-800 underline underline-offset-2" to={`/sales/${r.id}`}>{r.number}</Link>,
                `${r.customer_name || "—"} · ${r.type === "delivery" ? tr("delivery") : isCreditMethod(r.payment_method) ? tr("creditSales") : tr("cashSales")}`,
                money(r.total, lang),
              ])} />
              <CloseLines title="salesReturns" rows={(report.returns || []).map((r) => [
                r.number,
                r.invoice_number || "—",
                money(r.total, lang),
              ])} />
              <CloseLines title="collect" rows={(report.collections || []).map((r) => [
                r.invoice_number || "—",
                r.invoice_type === "delivery" || String(r.notes || "").includes("delivery settlement") ? tr("delivery") : r.method || "—",
                money(r.amount, lang),
              ])} />
              <CloseLines title="vouchersIn" rows={receipts.map((r) => [r.number, r.party_name || "—", money(r.amount, lang)])} />
              <CloseLines title="vouchersOut" rows={paymentsOut.map((r) => [r.number, r.party_name || "—", money(r.amount, lang)])} />
              <CloseLines title="expenses" rows={(report.expenses || []).map((r) => [r.category_ar || r.description || "—", "", money(r.amount, lang)])} />
            </div>
          ) : null}
          {err ? <div className="text-sm font-bold text-rose-600">{err}</div> : null}
          <div className="flex gap-2">
            <Btn
              className="flex-1"
              disabled={busy || !actual || !report}
              onClick={async () => {
                setBusy(true);
                setErr("");
                try {
                  await post(`/api/shifts/close/${ctx.shift.id}`, { actual_cash_balance: counted });
                  await ctx.reload();
                  onClose();
                  navigate("/pos/shifts");
                } catch (e) {
                  setErr(apiMessage(tr, e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {tr("confirmCloseShift")}
            </Btn>
            <Btn kind="ghost" onClick={onClose}>{tr("cancel")}</Btn>
          </div>
        </div>
      </aside>
    </div>
  );
}

function CloseStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <b className="tabular-nums">{value}</b>
    </div>
  );
}

function CloseLines({ title, rows }: { title: Msg; rows: ReactNode[][] }) {
  const { tr } = useApp();
  return (
    <div>
      <div className="mb-1 text-xs font-black text-[var(--muted)]">{tr(title)}</div>
      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <tbody>
            {rows.length ? rows.map((cols, i) => (
              <tr key={i}>
                {cols.map((c, j) => (
                  <td key={j} className={j === cols.length - 1 ? "num tabular-nums font-bold" : ""}>{c}</td>
                ))}
              </tr>
            )) : (
              <tr><td className="px-3 py-2 text-[var(--muted)]">{tr("noData")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EndShiftButton({ className = "" }: { className?: string }) {
  const { tr } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{tr("endShift")}</button>
      {open ? <CloseShiftModal open onClose={() => setOpen(false)} /> : null}
    </>
  );
}
