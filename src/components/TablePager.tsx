import { useApp } from "../context";
import { num } from "../lib/format";
import type { ListQuery } from "../hooks/useListQuery";
import { listPageSize, pageCount } from "../hooks/usePagedRows";
import { PAGE_SIZE_ALL, PageSizeControl } from "./PageSizeControl";

export function TablePager({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  disabled = false,
  className = "",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (n: number) => void;
  onPageSize: (n: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { tr, lang } = useApp();
  const size = pageSize >= PAGE_SIZE_ALL ? Math.max(total, 1) : Math.max(1, pageSize);
  const pages = pageCount(total, size);
  const safePage = Math.min(Math.max(1, page || 1), pages);
  const from = total === 0 ? 0 : (safePage - 1) * size + 1;
  const to = Math.min(total, safePage * size);

  return (
    <div className={`no-print flex flex-wrap items-center justify-end gap-2 text-sm font-bold ${className}`}>
      <PageSizeControl
        value={pageSize}
        onChange={(n) => onPageSize(n)}
      />
      <span className="whitespace-nowrap text-slate-500">
        {tr("showingRows")} {num(from, lang)}–{num(to, lang)} {tr("of")} {num(total, lang)}
      </span>
      <button
        type="button"
        className="rounded-xl border px-3 py-1 disabled:opacity-40"
        disabled={disabled || safePage <= 1}
        onClick={() => onPage(safePage - 1)}
      >
        {tr("prev")}
      </button>
      <span>{num(safePage, lang)} / {num(pages, lang)}</span>
      <button
        type="button"
        className="rounded-xl border px-3 py-1 disabled:opacity-40"
        disabled={disabled || safePage >= pages}
        onClick={() => onPage(safePage + 1)}
      >
        {tr("next")}
      </button>
    </div>
  );
}

export function ListPager({
  f,
  total,
  disabled = false,
  className = "",
}: {
  f: ListQuery;
  total: number;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <TablePager
      className={className}
      page={f.page}
      pageSize={listPageSize(f.values)}
      total={total}
      disabled={disabled}
      onPage={(n) => f.set("page", String(n))}
      onPageSize={(n) => f.setMany({ pageSize: String(n), page: "1" })}
    />
  );
}
