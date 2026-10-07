import { useEffect, useMemo, useState } from "react";
import { Printer, Share2 } from "lucide-react";
import { useApp } from "../context";
import { get } from "../lib/api";
import { downloadExport } from "../lib/export";
import { apiMessage } from "../lib/errors";
import { money, num } from "../lib/format";
import { ErrorNote, PrintLetterhead } from "../components/ui";
import { warehouseLocations } from "../lib/warehouses";
import type { Msg } from "../i18n";

type SalesLine = {
  invoice_id?: number;
  return_id?: number;
  date: string;
  time: string;
  sku: string;
  name: string;
  qty: number;
  price: number;
  total: number;
  discount: number;
  net: number;
  customer: string;
};

type MatrixCell = {
  count: number;
  total: number;
  cash: number;
  credit: number;
};

type Matrix = {
  sales: MatrixCell;
  sales_returns: MatrixCell;
  purchases: MatrixCell;
  purchase_returns: MatrixCell;
  receipts: MatrixCell;
  payments: MatrixCell;
  stocktake: MatrixCell;
  transfer: MatrixCell;
  settle: MatrixCell;
};

type Summary = {
  cash_sales: number;
  credit_sales?: number;
  sales_returns: number;
  purchases: number;
  credit_purchases?: number;
  purchase_returns: number;
  collections: number;
  expenses: number;
  vouchers_in: number;
  vouchers_out: number;
  opening_balance: number;
  net_movement: number;
  final_balance: number;
};

type Report = {
  summary: Summary;
  matrix?: Matrix;
  sales_lines: SalesLine[];
  return_lines: SalesLine[];
  sales_totals: { qty: number; total: number; discount: number; net: number };
  return_totals: { qty: number; total: number; discount: number; net: number };
};

type Tab = "summary" | "sales" | "returns";

function localDay() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function defaultFrom() {
  return `${localDay()}T00:00`;
}

function defaultTo() {
  return `${localDay()}T23:59`;
}

function reportQuery(
  from: string,
  to: string,
  treasuryId: string,
  locationId: string,
) {
  const p = new URLSearchParams();
  if (from) p.set("date_from", from);
  if (to) p.set("date_to", to);
  if (treasuryId) p.set("treasury_id", treasuryId);
  if (locationId) p.set("location_id", locationId);
  return p.toString();
}

function emptyCell(): MatrixCell {
  return { count: 0, total: 0, cash: 0, credit: 0 };
}

function uniqueDocCount(lines: SalesLine[]) {
  const ids = new Set<number>();
  for (const line of lines) {
    if (line.invoice_id) ids.add(line.invoice_id);
    else if (line.return_id) ids.add(line.return_id);
  }
  return ids.size || lines.length;
}

function signedCell(count: number, cash: number, credit: number): MatrixCell {
  const cashN = Number(cash) || 0;
  const creditN = Number(credit) || 0;
  return { count, total: -(cashN + creditN), cash: -cashN, credit: -creditN };
}

function unsignedCell(count: number, cash: number, credit = 0): MatrixCell {
  const cashN = Number(cash) || 0;
  const creditN = Number(credit) || 0;
  return { count, total: cashN + creditN, cash: cashN, credit: creditN };
}

function matrixHasActivity(mx?: Matrix) {
  if (!mx) return false;
  return [mx.sales, mx.sales_returns, mx.purchases, mx.purchase_returns, mx.receipts, mx.payments].some(
    (cell) => Math.abs(cell?.count || 0) > 0 || Math.abs(cell?.total || 0) > 0.005,
  );
}

function matrixFromReport(data: Report): Matrix {
  if (matrixHasActivity(data.matrix)) return data.matrix as Matrix;
  const s = data.summary;
  const receipts = (s.collections || 0) + (s.vouchers_in || 0);
  return {
    sales: unsignedCell(uniqueDocCount(data.sales_lines), s.cash_sales, s.credit_sales || 0),
    sales_returns: signedCell(uniqueDocCount(data.return_lines), s.sales_returns, 0),
    purchases: unsignedCell(0, s.purchases, s.credit_purchases || 0),
    purchase_returns: signedCell(0, s.purchase_returns, 0),
    receipts: unsignedCell(0, receipts),
    payments: unsignedCell(0, s.vouchers_out),
    stocktake: emptyCell(),
    transfer: emptyCell(),
    settle: emptyCell(),
  };
}

function sahlNum(n: number) {
  if (Math.abs(n) < 0.005) return "0";
  const abs = Math.abs(n).toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
  return n < 0 ? `${abs}-` : abs;
}

export default function DailyReportClassic() {
  const { tr, lang, can, lookups } = useApp();
  const cashAccounts = lookups?.cash_accounts || [];
  const warehouses = warehouseLocations(lookups?.locations);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [treasuryId, setTreasuryId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [tab, setTab] = useState<Tab>("summary");
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const qs = useMemo(
    () => reportQuery(from, to, treasuryId, locationId),
    [from, to, treasuryId, locationId],
  );

  async function load() {
    setLoading(true);
    setErr("");
    try {
      setData(await get<Report>(`/api/reports/daily-movement?${qs}`));
    } catch (e) {
      setErr(apiMessage(tr, e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const tabs: { id: Tab; key: Msg }[] = [
    { id: "summary", key: "dailySummaryTab" },
    { id: "sales", key: "dailySalesTab" },
    { id: "returns", key: "dailyReturnsTab" },
  ];
  const s = data?.summary;
  const mx = data ? matrixFromReport(data) : undefined;
  const matrixRows: { key: Msg; cell: MatrixCell }[] = [
    { key: "dailyRowSale", cell: mx?.sales || emptyCell() },
    { key: "dailyRowSaleReturn", cell: mx?.sales_returns || emptyCell() },
    { key: "dailyRowPurchase", cell: mx?.purchases || emptyCell() },
    {
      key: "dailyRowPurchaseReturn",
      cell: mx?.purchase_returns || emptyCell(),
    },
    { key: "dailyRowReceipt", cell: mx?.receipts || emptyCell() },
    { key: "dailyRowPayment", cell: mx?.payments || emptyCell() },
    { key: "dailyRowStocktake", cell: mx?.stocktake || emptyCell() },
    { key: "dailyRowTransfer", cell: mx?.transfer || emptyCell() },
    { key: "dailyRowSettle", cell: mx?.settle || emptyCell() },
  ];
  const treasuryRows: {
    key: Msg;
    value: number;
    yellow?: boolean;
    bold?: boolean;
  }[] = s
    ? [
        { key: "dailyCashSale", value: s.cash_sales },
        { key: "dailyCashSaleReturn", value: s.sales_returns },
        { key: "dailyCashPurchase", value: s.purchases },
        { key: "dailyCashPurchaseReturn", value: s.purchase_returns },
        {
          key: "dailyRowReceipt",
          value: (s.collections || 0) + (s.vouchers_in || 0),
        },
        { key: "dailyRowPayment", value: s.vouchers_out },
        { key: "dailyInvoiceExpense", value: s.expenses },
        { key: "dailyPrevBalance", value: s.opening_balance, yellow: true },
        { key: "dailyTreasuryNet", value: s.net_movement, bold: true },
        {
          key: "dailyFinalBalance",
          value: s.final_balance,
          yellow: true,
          bold: true,
        },
      ]
    : [];

  const lineCols = [
    tr("date"),
    tr("time"),
    tr("itemCode"),
    tr("itemName"),
    tr("qty"),
    tr("sellingPrice"),
    tr("total"),
    tr("discount"),
    tr("netAmount"),
    tr("account"),
  ];

  return (
    <div className="sahl-daily">
      <PrintLetterhead title={tr("dailyReportTitle")} />
      <div className="sahl-daily-toolbar no-print">
        <b className="sahl-daily-title">{tr("dailyReportTitle")}</b>
        <label className="sahl-daily-field">
          <span>{tr("fromDate")}</span>
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="sahl-daily-field">
          <span>{tr("toDateFull")}</span>
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="sahl-daily-field">
          <span>{tr("warehouse")}</span>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            <option value="">{tr("all")}</option>
            {warehouses.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="sahl-daily-field">
          <span>{tr("cashBox")}</span>
          <select
            value={treasuryId}
            onChange={(e) => setTreasuryId(e.target.value)}
          >
            <option value="">{tr("all")}</option>
            {cashAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {lang === "ar" ? a.name : a.name_en || a.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="sahl-daily-show"
          disabled={loading}
          onClick={() => void load()}
        >
          {tr("showReport")}
        </button>
        <button
          type="button"
          className="sahl-daily-icon"
          title={tr("print")}
          onClick={() => window.print()}
        >
          <Printer size={16} />
        </button>
        {can("reports.export") ? (
          <button
            type="button"
            className="sahl-daily-icon"
            title={tr("exportCsv")}
            onClick={() => downloadExport("daily-movement", qs).catch(() => {})}
          >
            <Share2 size={16} />
          </button>
        ) : null}
      </div>

      <div className="sahl-daily-tabs no-print">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "is-on" : ""}
            onClick={() => setTab(t.id)}
          >
            {tr(t.key)}
          </button>
        ))}
      </div>

      {err ? <ErrorNote message={err} /> : null}

      <div className="sahl-daily-body">
        {loading && !data ? (
          <div className="sahl-daily-wait">{tr("loading")}</div>
        ) : null}

        {data && tab === "summary" ? (
          <div className="sahl-daily-boards">
            <div className="sahl-daily-matrix">
              <table>
                <thead>
                  <tr>
                    <th />
                    <th>{tr("dailyInvoiceCount")}</th>
                    <th>{tr("total")}</th>
                    <th>{tr("dailyCashCol")}</th>
                    <th>{tr("dailyCreditCol")}</th>
                  </tr>
                </thead>
                <tbody>
                  {matrixRows.map((row) => (
                    <tr key={row.key}>
                      <td className="is-label">{tr(row.key)}</td>
                      <td>{sahlNum(row.cell.count)}</td>
                      <td>{sahlNum(row.cell.total)}</td>
                      <td>{sahlNum(row.cell.cash)}</td>
                      <td>{sahlNum(row.cell.credit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sahl-daily-treasury">
              <div className="sahl-daily-treasury-h">
                {tr("dailyTreasurySummary")}
              </div>
              <table>
                <tbody>
                  {treasuryRows.map((row) => (
                    <tr key={row.key} className={row.yellow ? "is-yellow" : ""}>
                      <td className={row.bold ? "is-bold" : ""}>
                        {tr(row.key)}
                      </td>
                      <td className={row.bold ? "is-bold" : ""}>
                        {sahlNum(row.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {data && tab === "sales" ? (
          <LineGrid
            cols={lineCols}
            rows={data.sales_lines.map((r) => [
              r.date,
              r.time || "—",
              r.sku,
              r.name,
              num(r.qty, lang),
              money(r.price, lang),
              money(r.total, lang),
              money(r.discount, lang),
              money(r.net, lang),
              r.customer || "—",
            ])}
            footer={[
              tr("total"),
              "",
              "",
              "",
              num(data.sales_totals.qty, lang),
              "",
              money(data.sales_totals.total, lang),
              money(data.sales_totals.discount, lang),
              money(data.sales_totals.net, lang),
              "",
            ]}
          />
        ) : null}

        {data && tab === "returns" ? (
          <LineGrid
            cols={lineCols}
            rows={data.return_lines.map((r) => [
              r.date,
              r.time || "—",
              r.sku,
              r.name,
              num(r.qty, lang),
              money(r.price, lang),
              money(r.total, lang),
              money(r.discount, lang),
              money(r.net, lang),
              r.customer || "—",
            ])}
            footer={[
              tr("total"),
              "",
              "",
              "",
              num(data.return_totals.qty, lang),
              "",
              money(data.return_totals.total, lang),
              money(data.return_totals.discount, lang),
              money(data.return_totals.net, lang),
              "",
            ]}
          />
        ) : null}
      </div>
    </div>
  );
}

function LineGrid({
  cols,
  rows,
  footer,
}: {
  cols: string[];
  rows: string[][];
  footer: string[];
}) {
  return (
    <div className="sahl-daily-grid">
      <div className="sahl-daily-grid-wrap">
        <table>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={j === 3 ? "is-name text-center" : "text-center"}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              {footer.map((cell, i) => (
                <td key={i} className="text-center">
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
