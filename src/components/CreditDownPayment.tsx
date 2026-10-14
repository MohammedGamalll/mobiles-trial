import { useApp } from "../context";
import { money } from "../lib/format";
import { inputCls } from "./ui";

export function creditPaidInvalid(paid: number, total: number) {
  return Number(paid) < 0 || Number(paid) > Number(total) + 0.001;
}

export function CreditDownPayment({
  total,
  paid,
  onPaid,
}: {
  total: number;
  paid: number;
  onPaid: (n: number) => void;
}) {
  const { tr, lang } = useApp();
  const safePaid = Number(paid) || 0;
  const remaining = Math.max(0, Math.round((Number(total || 0) - Math.min(Math.max(0, safePaid), Number(total || 0))) * 100) / 100);
  const invalid = creditPaidInvalid(safePaid, total);
  return (
    <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
      <label className="block">
        <span className="mb-1 block text-xs font-black">{tr("paidAmount")}</span>
        <input
          className={`${inputCls} tabular-nums text-lg font-black`}
          type="number"
          min={0}
          max={total}
          step="0.01"
          inputMode="decimal"
          placeholder="0"
          value={Number.isFinite(safePaid) ? paid : 0}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              onPaid(0);
              return;
            }
            const n = Number(raw);
            onPaid(Number.isFinite(n) ? n : 0);
          }}
        />
      </label>
      {invalid ? <div className="text-xs font-bold text-rose-600">{tr("errPaidRange")}</div> : null}
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-bold text-[var(--muted)]">{tr("remainingAmount")}</span>
        <b className="tabular-nums text-lg font-black">{money(remaining, lang)}</b>
      </div>
    </div>
  );
}
