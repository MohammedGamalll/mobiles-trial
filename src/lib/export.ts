import { authHeaders } from "./session";

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const body = `\uFEFF${[headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n")}`;
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function downloadExport(kind: string, query = "") {
  const res = await fetch(`/api/reports/export?kind=${encodeURIComponent(kind)}&${query}`, { credentials: "include", headers: authHeaders() });
  if (!res.ok) throw new Error(`export ${res.status}`);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${kind}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
