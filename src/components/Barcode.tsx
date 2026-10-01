import { barcodeModules, barcodeSafe, barcodeWidth } from "../lib/barcode";

export function Barcode({
  value,
  label,
  price,
  height = 46,
}: {
  value: string;
  label?: string;
  price?: string;
  height?: number;
}) {
  const unit = 1.4;
  const mods = barcodeModules(value);
  const w = barcodeWidth(value, unit);
  let x = 0;
  return (
    <div className="label-card inline-block rounded-lg border border-slate-200 bg-white p-2 text-center text-black">
      {label ? <div className="mb-1 max-w-[180px] truncate text-[11px] font-bold">{label}</div> : null}
      <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} aria-label={barcodeSafe(value)}>
        {mods.map((m, i) => {
          const nx = x;
          x += m.w * unit;
          if (!m.black) return null;
          return <rect key={i} x={nx} y={0} width={m.w * unit} height={height} fill="#111" />;
        })}
      </svg>
      <div className="mt-0.5 font-mono text-[10px] tracking-wider">{barcodeSafe(value)}</div>
      {price ? <div className="text-[11px] font-black">{price}</div> : null}
    </div>
  );
}
