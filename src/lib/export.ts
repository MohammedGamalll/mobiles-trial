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
  const qs = query.startsWith("?") ? query.slice(1) : query;
  const res = await fetch(`/api/reports/export?kind=${encodeURIComponent(kind)}${qs ? `&${qs}` : ""}`, { credentials: "include", headers: authHeaders() });
  if (!res.ok) throw new Error(`export ${res.status}`);
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") || "";
  const named = /filename\*?=(?:UTF-8'')?["']?([^";]+)/i.exec(cd)?.[1];
  const excel = (res.headers.get("content-type") || "").includes("spreadsheet") || /\.xlsx$/i.test(named || "");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = named ? decodeURIComponent(named) : `${kind}.${excel ? "xlsx" : "csv"}`;
  a.click();
  URL.revokeObjectURL(a.href);
}
