import { useState } from "react";
import { useApp } from "../context";
import { get } from "../lib/api";
import { ListGate } from "../components/ListGate";
import { useLiveList } from "../hooks/useLiveList";
import { movementTypeLabel, STOCK_MOVEMENT_TYPES } from "../lib/format";
import { EmptyFilterState, SmartFilter } from "../components/SmartFilter";
import { useListQuery } from "../hooks/useListQuery";
import { PrintLetterhead } from "../components/ui";
import { ListPager } from "../components/TablePager";
import { applyListPaging, inferredTotal, listPageSize } from "../hooks/usePagedRows";

export function MovementsPage() {
  const { tr, lang } = useApp();
  const f = useListQuery("movements");
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);

  async function load() {
    const size = listPageSize(f.values);
    const p = applyListPaging(new URLSearchParams(f.qs), f.page, size);
    const r = await get<{ data: any[]; total?: number }>(`/api/inventory/movements?${p}`);
    setRows(r.data || []);
    setTotal(inferredTotal(f.page, size, (r.data || []).length, r.total));
  }
  const list = useLiveList(load, [f.qs]);

  return (
    <div>
      <PrintLetterhead title={tr("movements")} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{tr("movements")}</h1>
      </div>
      <SmartFilter
        f={f}
        fields={[
          {
            key: "type",
            label: "movementType",
            type: "select",
            quick: true,
            options: STOCK_MOVEMENT_TYPES.map((t) => ({ value: t, label: movementTypeLabel(t, lang) })),
          },
          { key: "brand_id", label: "brand", type: "select", lookup: "brands" },
          { key: "model_id", label: "model", type: "select", lookup: "models" },
          { key: "locations", label: "warehouse", type: "locations" },
          { key: "reference_type", label: "source", type: "text" },
        ]}
      />
      <ListGate loading={list.loading} err={list.err} onRetry={list.reload} empty={!rows.length} emptyFallback={<EmptyFilterState onClear={f.clear} />}>
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{tr("date")}</th>
                  <th>{tr("movementType")}</th>
                  <th>{tr("sku")}</th>
                  <th>Batch</th>
                  <th>{tr("qty")}</th>
                  <th>{tr("fromLocation")}</th>
                  <th>{tr("toLocation")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((mv) => (
                  <tr key={mv.id || `${mv.created_at}-${mv.sku}-${mv.qty}`}>
                    <td>{mv.created_at}</td>
                    <td>{movementTypeLabel(mv.type, lang)}</td>
                    <td>{mv.sku}</td>
                    <td>{mv.batch_code}</td>
                    <td>{mv.qty}</td>
                    <td>{mv.from_location || "-"}</td>
                    <td>{mv.to_location || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </ListGate>
      <ListPager f={f} total={total} disabled={list.loading} />
    </div>
  );
}
