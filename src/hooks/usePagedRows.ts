import { useMemo } from "react";
import { PAGE_SIZE_ALL, parsePageSize } from "../components/PageSizeControl";

export function pageCount(total: number, pageSize: number) {
  const size = Math.max(1, pageSize || 50);
  return Math.max(1, Math.ceil(Math.max(0, total) / size) || 1);
}

export function usePagedRows<T>(rows: T[], page: number, pageSize: number) {
  return useMemo(() => {
    const size = parsePageSize(pageSize, 50);
    const total = rows.length;
    const pages = pageCount(total, size);
    const safePage = Math.min(Math.max(1, page || 1), pages);
    if (size >= PAGE_SIZE_ALL) {
      return { rows, total, page: 1, pageSize: size, pages: 1 };
    }
    const start = (safePage - 1) * size;
    return { rows: rows.slice(start, start + size), total, page: safePage, pageSize: size, pages };
  }, [rows, page, pageSize]);
}

export function listPageSize(values: { pageSize?: string } | undefined, fallback = 50) {
  return parsePageSize(values?.pageSize, fallback);
}

export function applyListPaging(params: URLSearchParams, page: number, pageSize: number) {
  params.set("pageSize", String(pageSize));
  if (!params.get("page")) params.set("page", String(page || 1));
  return params;
}

export function inferredTotal(page: number, pageSize: number, rowCount: number, serverTotal?: number) {
  const known = Number(serverTotal);
  if (Number.isFinite(known) && known > 0) return known;
  const shown = Math.max(0, (Math.max(1, page) - 1) * pageSize) + rowCount;
  return rowCount >= pageSize && pageSize < PAGE_SIZE_ALL ? shown + 1 : shown;
}
