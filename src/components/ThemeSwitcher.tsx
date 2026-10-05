import { Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../context";
import type { UiLayout } from "../lib/ui-layout";

function Preview({ kind }: { kind: UiLayout }) {
  const classic = kind === "classic_easy";
  return (
    <div className={`ui-preview overflow-hidden border ${classic ? "rounded-md" : "rounded-xl"}`} style={{ height: 72 }}>
      {classic ? (
        <div className="flex h-full flex-col bg-[#2b2b2b] p-1">
          <div className="mb-0.5 flex justify-end gap-0.5">
            <div className="h-5 w-5 rounded-sm bg-[#43a047]" />
            <div className="h-5 w-5 rounded-sm bg-[#43a047]" />
            <div className="h-5 w-5 rounded-sm bg-[#43a047]" />
            <div className="h-5 flex-1 rounded-sm bg-[#2e7d32]" />
          </div>
          <div className="flex justify-center gap-0.5">
            <div className="h-6 flex-1 rounded-sm bg-[#43a047]" />
            <div className="h-6 flex-1 rounded-sm bg-[#e53935]" />
            <div className="h-6 flex-1 rounded-sm bg-[#ec407a]" />
            <div className="h-6 flex-1 rounded-sm bg-[#00897b]" />
          </div>
        </div>
      ) : (
        <div className="flex h-full">
          <div className="h-full w-8 bg-[#071018]" />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="h-4 border-b bg-white/90" />
            <div className="flex-1 bg-[#e8eef4] p-1">
              <div className="mb-1 flex gap-0.5">
                <div className="h-3 flex-1 rounded-md bg-white" />
                <div className="h-3 flex-1 rounded-md bg-white" />
              </div>
              <div className="h-5 rounded-lg bg-white" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ThemeSwitcher() {
  const { tr, uiLayout, setUiLayout } = useApp();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (layout: UiLayout) => {
    setUiLayout(layout);
    setOpen(false);
  };

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        className="ui-icon-btn topbar-ctrl inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 py-2 text-sm font-bold text-slate-700"
        title={tr("changeDesign")}
        onClick={() => setOpen((v) => !v)}
      >
        <Palette size={16} />
        <span className="hidden lg:inline">{uiLayout === "classic_easy" ? tr("classicEasyDesign") : tr("modernDesign")}</span>
      </button>
      {open ? (
        <div className="theme-switcher-panel absolute end-0 z-40 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 shadow-xl dark:border-[var(--border)] dark:bg-[var(--surface)] dark:text-[var(--text)]">
          <div className="mb-2 text-sm font-black text-slate-900 dark:text-[var(--text)]">{tr("changeDesign")}</div>
          <div className="grid gap-2">
            {([
              ["modern", "modernDesign"],
              ["classic_easy", "classicEasyDesign"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`rounded-xl border p-2 text-start ${uiLayout === id ? "border-cyan-500 ring-2 ring-cyan-200" : "border-[var(--border)]"}`}
                onClick={() => pick(id)}
              >
                <Preview kind={id} />
                <div className="mt-2 text-sm font-bold text-slate-900 dark:text-[var(--text)]">{tr(label)}</div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}