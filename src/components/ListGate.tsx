import type { ReactNode } from "react";
import { useApp } from "../context";
import { Btn, ErrorNote, PageLoading } from "./ui";

export function ListGate({
  loading,
  err,
  onRetry,
  empty,
  emptyFallback,
  children,
}: {
  loading: boolean;
  err: string;
  onRetry: () => void;
  empty: boolean;
  emptyFallback?: ReactNode;
  children: ReactNode;
}) {
  const { tr } = useApp();
  if (loading && empty) return <PageLoading />;
  if (err && empty) {
    return (
      <div className="rounded-2xl border border-rose-100 bg-[var(--surface)] px-4 py-8 text-center">
        <ErrorNote message={err} />
        <Btn className="mt-3" onClick={() => void onRetry()}>{tr("retry")}</Btn>
      </div>
    );
  }
  if (empty) return <>{emptyFallback ?? null}</>;
  return (
    <>
      {err ? (
        <div className="mb-3">
          <ErrorNote message={err} />
          <Btn kind="ghost" className="mt-2" onClick={() => void onRetry()}>{tr("retry")}</Btn>
        </div>
      ) : null}
      {children}
    </>
  );
}
