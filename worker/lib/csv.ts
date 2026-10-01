export function toCsv(headers: string[], rows: unknown[][]) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n");
}

export function csvBody(headers: string[], rows: unknown[][]) {
  return `\uFEFF${toCsv(headers, rows)}`;
}
