import { useState } from "react";
import { useApp } from "../context";
import { get } from "../lib/api";
import { money, statusLabel } from "../lib/format";
import { ExportBtn, PrintBtn, PrintLetterhead } from "../components/ui";
import { ListGate } from "../components/ListGate";
import { EmptyFilterState, SmartFilter } from "../components/SmartFilter";
import { useListQuery } from "../hooks/useListQuery";
import { useLiveList } from "../hooks/useLiveList";

type TrialRow = {
  id: number;
  code: string;
  name_ar: string;
  name_en: string;
  type: string;
  opening_balance: number;
  total_debit: number;
  total_credit: number;
  net_balance: number;
  closing_balance: number;
};

type TrialTotals = {
  opening: number;
  debit: number;
  credit: number;
  net: number;
  closing: number;
  balanced: boolean;
};

const ACCOUNT_TYPES = [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
] as const;

function splitClosingSides(net: number) {
  if (net > 0.005) return { debit: net, credit: 0 };
  if (net < -0.005) return { debit: 0, credit: Math.abs(net) };
  return { debit: 0, credit: 0 };
}

function amountCell(n: number, lang: "ar" | "en") {
  if (Math.abs(n) < 0.005) return "—";
  return money(Math.abs(n), lang);
}

function closingCells(net: number, lang: "ar" | "en") {
  const sides = splitClosingSides(net);
  return {
    debit: sides.debit > 0.005 ? money(sides.debit, lang) : "—",
    credit: sides.credit > 0.005 ? money(sides.credit, lang) : "—",
  };
}

function groupRows(rows: TrialRow[]) {
  const known = new Set<string>(ACCOUNT_TYPES);
  const groups = ACCOUNT_TYPES.map((type) => ({
    type,
    rows: rows.filter((r) => r.type === type),
  })).filter((g) => g.rows.length);
  const extra = rows.filter((r) => !known.has(r.type));
  if (extra.length) groups.push({ type: extra[0].type, rows: extra });
  return groups;
}

function sumColumns(rows: TrialRow[]) {
  return rows.reduce(
    (acc, r) => {
      const sides = splitClosingSides(Number(r.closing_balance) || 0);
      acc.opening += Math.abs(Number(r.opening_balance) || 0);
      acc.debit += Number(r.total_debit) || 0;
      acc.credit += Number(r.total_credit) || 0;
      acc.closingDebit += sides.debit;
      acc.closingCredit += sides.credit;
      return acc;
    },
    { opening: 0, debit: 0, credit: 0, closingDebit: 0, closingCredit: 0 },
  );
}

export default function TrialBalance() {
  const { tr, lang } = useApp();
  const f = useListQuery("trial-balance", { period: "this_month" });
  const [rows, setRows] = useState<TrialRow[]>([]);
  const [totals, setTotals] = useState<TrialTotals>({
    opening: 0,
    debit: 0,
    credit: 0,
    net: 0,
    closing: 0,
    balanced: true,
  });
  const list = useLiveList(async () => {
    const r = await get<{ data: TrialRow[]; totals: TrialTotals }>(
      `/api/reports/trial-balance?${f.qs}`,
    );
    setRows(r.data || []);
    setTotals(
      r.totals || {
        opening: 0,
        debit: 0,
        credit: 0,
        net: 0,
        closing: 0,
        balanced: true,
      },
    );
  }, [f.qs]);
  const typeOn = Boolean(f.values.type || f.values.account_type);
  const groups = groupRows(rows);
  const columnTotals = sumColumns(rows);
  return (
    <div className="text-[var(--text)]">
      <PrintLetterhead title={tr("trialBalance")} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{tr("trialBalance")}</h1>
        <div className="no-print flex flex-wrap items-center justify-end gap-2">
          <ExportBtn kind="trial-balance" query={f.qs} />
          <PrintBtn />
        </div>
      </div>
      <SmartFilter
        f={f}
        fields={[
          {
            key: "type",
            label: "kind",
            type: "select",
            quick: true,
            options: ACCOUNT_TYPES.map((t) => ({
              value: t,
              label: statusLabel(t, lang),
            })),
          },
        ]}
      />
      {typeOn ? (
        <div className="mb-3 text-xs text-[var(--muted)]">
          {tr("typeFilterHint")}
        </div>
      ) : null}
      <ListGate
        loading={list.loading}
        err={list.err}
        onRetry={list.reload}
        empty={!rows.length}
        emptyFallback={<EmptyFilterState onClear={f.clear} />}
      >
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
          <div className="table-wrap overflow-x-auto">
            <table className="min-w-[980px]">
              <thead>
                <tr className="bg-[var(--surface-2)] text-xs font-bold">
                  <th>{tr("accountCode")}</th>
                  <th>{tr("name")}</th>
                  <th>{tr("kind")}</th>
                  <th className="text-center!">{tr("opening")}</th>
                  <th className="text-center!">{tr("debitMovement")}</th>
                  <th className="text-center!">{tr("creditMovement")}</th>
                  <th className="text-center!">{tr("closingDebit")}</th>
                  <th className="text-center!">{tr("closingCredit")}</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group, gi) => {
                  const sub = sumColumns(group.rows);
                  return [
                    ...group.rows.map((r, ri) => {
                      const sides = closingCells(r.closing_balance, lang);
                      return (
                        <tr
                          key={r.id}
                          className={`border-b border-[var(--border)]${gi > 0 && ri === 0 ? " border-t border-t-[var(--border)]" : ""}`}
                        >
                          <td className="font-mono tabular-nums">{r.code}</td>
                          <td>{lang === "ar" ? r.name_ar : r.name_en}</td>
                          <td>{statusLabel(r.type, lang)}</td>
                          <td className="tabular-nums text-center">
                            {amountCell(r.opening_balance, lang)}
                          </td>
                          <td className="tabular-nums text-center">
                            {amountCell(r.total_debit, lang)}
                          </td>
                          <td className="tabular-nums text-center">
                            {amountCell(r.total_credit, lang)}
                          </td>
                          <td className="tabular-nums text-center font-bold">
                            {sides.debit}
                          </td>
                          <td className="tabular-nums text-center font-bold">
                            {sides.credit}
                          </td>
                        </tr>
                      );
                    }),
                    <tr
                      key={`sub-${group.type}`}
                      className="border-b border-[var(--border)] bg-[var(--surface-2)] font-semibold"
                    >
                      <td className="font-mono tabular-nums" />
                      <td>{statusLabel(group.type, lang)}</td>
                      <td />
                      <td className="tabular-nums text-center">
                        {amountCell(sub.opening, lang)}
                      </td>
                      <td className="tabular-nums text-center">
                        {amountCell(sub.debit, lang)}
                      </td>
                      <td className="tabular-nums text-center">
                        {amountCell(sub.credit, lang)}
                      </td>
                      <td className="tabular-nums text-center">
                        {amountCell(sub.closingDebit, lang)}
                      </td>
                      <td className="tabular-nums text-center">
                        {amountCell(sub.closingCredit, lang)}
                      </td>
                    </tr>,
                  ];
                })}
              </tbody>
              <tfoot className="sticky bottom-0 bg-[var(--surface-2)]">
                <tr className="border-t-2 border-[var(--border)] font-black">
                  <td colSpan={3}>{tr("totalMovement")}</td>
                  <td className="tabular-nums text-center">—</td>
                  <td className="tabular-nums text-center">
                    {amountCell(totals.debit, lang)}
                  </td>
                  <td className="tabular-nums text-center">
                    {amountCell(totals.credit, lang)}
                  </td>
                  <td className="tabular-nums text-center">
                    {amountCell(columnTotals.closingDebit, lang)}
                  </td>
                  <td className="tabular-nums text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span>
                        {amountCell(columnTotals.closingCredit, lang)}
                      </span>
                      <span
                        className={`badge ${totals.balanced ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}
                      >
                        {totals.balanced ? tr("balanced") : tr("unbalanced")}
                      </span>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </ListGate>
    </div>
  );
}
