import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../context";
import { get } from "../lib/api";
import { money } from "../lib/format";
import { Btn, PrintLetterhead, printPage } from "../components/ui";
import { useLiveList } from "../hooks/useLiveList";
import { ListGate } from "../components/ListGate";

type Invoice = { id: number; number: string; date: string; total: number; paid: number; remaining: number };
type Row = {
  id: number;
  code: number;
  name: string;
  phone?: string;
  open_count: number;
  drawn: number;
  paid: number;
  last_payment?: string | null;
  remaining: number;
  invoices: Invoice[];
};

export default function CreditSheet({ party }: { party: "customer" | "supplier" }) {
  const { tr, lang } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const title = party === "supplier" ? tr("supplierCreditSheet") : tr("customerCreditSheet");
  const list = useLiveList(async () => {
    const r = await get<{ data: Row[]; total: number }>(`/api/reports/credit-sheet?party=${party}`);
    setRows(r.data || []);
    setTotal(Number(r.total || 0));
  }, [party]);

  return (
    <div className="space-y-4">
      <PrintLetterhead title={title} />
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{title}</h1>
        <div className="flex gap-2">
          <Link className="rounded-xl px-3 py-2 text-sm font-bold text-slate-500" to={party === "supplier" ? "/suppliers" : "/customers"}>{party === "supplier" ? tr("suppliers") : tr("customers")}</Link>
          <Btn kind="ghost" onClick={() => printPage("a4")}>{tr("print")}</Btn>
        </div>
      </div>
      <ListGate loading={list.loading} err={list.err} onRetry={list.reload} empty={!rows.length}>
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
          <div className="table-wrap">
            <table className="stack-cols w-full">
              <thead>
                <tr>
                  <th>{tr("code")}</th>
                  <th>{tr("name")}</th>
                  <th>{tr("phone")}</th>
                  <th>{tr("openInvoices")}</th>
                  <th>{tr("drawnTotal")}</th>
                  <th>{tr("paid")}</th>
                  <th>{tr("lastPayment")}</th>
                  <th>{tr("remaining")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr className="cursor-pointer" onClick={() => setOpen(open === row.id ? null : row.id)}>
                      <td>{row.code}</td>
                      <td className="font-bold">{row.name}</td>
                      <td>{row.phone || "-"}</td>
                      <td>{row.open_count}</td>
                      <td>{money(row.drawn, lang)}</td>
                      <td>{money(row.paid, lang)}</td>
                      <td>{row.last_payment || "-"}</td>
                      <td className="font-bold">{money(row.remaining, lang)}</td>
                    </tr>
                    {open === row.id ? (
                      <tr key={`${row.id}-inv`}>
                        <td colSpan={8}>
                          <table className="stack-cols w-full">
                            <thead>
                              <tr>
                                <th>{tr("invoiceNo")}</th>
                                <th>{tr("date")}</th>
                                <th>{tr("total")}</th>
                                <th>{tr("paid")}</th>
                                <th>{tr("remaining")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(row.invoices || []).map((inv) => (
                                <tr key={inv.id}>
                                  <td>{inv.number}</td>
                                  <td>{inv.date}</td>
                                  <td>{money(inv.total, lang)}</td>
                                  <td>{money(inv.paid, lang)}</td>
                                  <td>{money(inv.remaining, lang)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
                <tr>
                  <td colSpan={7} className="stack-label font-black">{tr("total")}</td>
                  <td className="font-black">{money(total, lang)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </ListGate>
    </div>
  );
}
