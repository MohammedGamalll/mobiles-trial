import { useApp } from "../context";
import { canonWarehouseName, locationLabel } from "../lib/warehouses";
import { inputCls } from "./ui";

export function LocationSelect({
  value,
  onChange,
  classic,
}: {
  value: number | "" | null;
  onChange: (id: number | "", loc?: { id: number; name: string; warehouse?: string; box?: string; rack?: string; shelf?: string; drawer?: string }) => void;
  classic?: boolean;
}) {
  const { tr, lookups } = useApp();
  const locs = [...(lookups?.locations || [])].sort((a, b) => locationLabel(a).localeCompare(locationLabel(b), "ar"));
  const select = (
    <select
      className={classic ? undefined : inputCls}
      value={value || ""}
      onChange={(e) => {
        const id = e.target.value ? Number(e.target.value) : "";
        onChange(id, id ? locs.find((l) => l.id === id) : undefined);
      }}
    >
      <option value="">-</option>
      {locs.map((l) => (
        <option key={l.id} value={l.id}>{locationLabel(l)}</option>
      ))}
    </select>
  );
  if (classic) {
    return (
      <label>
        <span>{tr("location")}</span>
        {select}
      </label>
    );
  }
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold text-slate-600">{tr("location")}</span>
      {select}
    </label>
  );
}

export function warehouseNames(locations?: { name: string; kind?: string; warehouse?: string }[]) {
  const set = new Set<string>(["المخزن الرئيسي"]);
  for (const l of locations || []) {
    if (l.kind === "warehouse" && l.name) set.add(canonWarehouseName(l.name));
    if (l.warehouse) set.add(canonWarehouseName(l.warehouse));
  }
  return [...set];
}

export function PlaceFields({
  warehouse,
  box,
  rack,
  shelf,
  drawer,
  onChange,
  classic,
}: {
  warehouse: string;
  box: string;
  rack: string;
  shelf: string;
  drawer: string;
  onChange: (next: { warehouse: string; box: string; rack: string; shelf: string; drawer: string }) => void;
  classic?: boolean;
}) {
  const { tr, lookups } = useApp();
  const names = warehouseNames(lookups?.locations);
  if (warehouse && !names.includes(warehouse)) names.unshift(warehouse);
  const bin = [rack, shelf, drawer].filter(Boolean).join("+");
  const set = (patch: Partial<{ warehouse: string; box: string; rack: string; shelf: string; drawer: string }>) =>
    onChange({ warehouse, box, rack, shelf, drawer, ...patch });

  if (classic) {
    return (
      <>
        <label>
          <span>{tr("warehouse")}</span>
          <select value={warehouse} onChange={(e) => set({ warehouse: e.target.value })}>
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>
          <span>{tr("posColPack")}</span>
          <input value={box} onChange={(e) => set({ box: e.target.value })} />
        </label>
        <label>
          <span>{tr("posColBin")}</span>
          <input value={bin} onChange={(e) => {
            const [r = "", s = "", d = ""] = e.target.value.split("+");
            set({ rack: r, shelf: s, drawer: d });
          }} />
        </label>
      </>
    );
  }

  return (
    <>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-slate-600">{tr("warehouse")}</span>
        <select className={inputCls} value={warehouse} onChange={(e) => set({ warehouse: e.target.value })}>
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-slate-600">{tr("posColPack")}</span>
        <input className={inputCls} value={box} onChange={(e) => set({ box: e.target.value })} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-slate-600">{tr("posColBin")}</span>
        <input
          className={inputCls}
          value={bin}
          onChange={(e) => {
            const [r = "", s = "", d = ""] = e.target.value.split("+");
            set({ rack: r, shelf: s, drawer: d });
          }}
        />
      </label>
    </>
  );
}
