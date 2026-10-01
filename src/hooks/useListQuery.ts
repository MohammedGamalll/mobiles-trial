import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { activeFilterCount, searchFromValues, valuesFromSearch, type FilterValues } from "../lib/filter-engine";

const SESSION = "motamayez_filters";
const DEFAULTS = "motamayez_default_view";

function readStore(key: string): FilterValues | null {
  try {
    const raw = sessionStorage.getItem(`${SESSION}:${key}`) || localStorage.getItem(`${DEFAULTS}:${key}`);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

function readDefault(key: string): FilterValues | null {
  try {
    const raw = localStorage.getItem(`${DEFAULTS}:${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveDefaultView(id: string, value: FilterValues) {
  localStorage.setItem(`${DEFAULTS}:${id}`, JSON.stringify(value));
}

export function loadDefaultView(id: string) {
  return readDefault(id);
}

export function useListQuery(id: string, defaults: FilterValues = {}) {
  const loc = useLocation();
  const [sp, setSp] = useSearchParams();
  const boot = useRef(false);
  const initial = useMemo(() => {
    const url = valuesFromSearch(sp);
    if (Object.keys(url).length) return { ...defaults, ...url };
    const stored = readStore(id);
    return { ...defaults, ...(stored || {}) };
  }, [id]);
  const [values, setValues] = useState<FilterValues>(initial);
  const [draftQ, setDraftQ] = useState(initial.q || "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (boot.current) return;
    boot.current = true;
    const urlVals = valuesFromSearch(sp);
    if (!Object.keys(urlVals).length && Object.keys(values).length) {
      const next = searchFromValues(values);
      if ([...next.keys()].length) setSp(next, { replace: true });
    }
  }, []);

  const valuesRef = useRef(values);
  valuesRef.current = values;

  const persist = useCallback(
    (next: FilterValues) => {
      const clean: FilterValues = {};
      Object.entries(next).forEach(([k, v]) => {
        if (v != null && String(v).trim() !== "") clean[k] = String(v).trim();
      });
      setValues(clean);
      valuesRef.current = clean;
      sessionStorage.setItem(`${SESSION}:${id}`, JSON.stringify(clean));
      const qs = searchFromValues(clean);
      setSp(qs, { replace: true });
    },
    [id, setSp],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      const current = valuesRef.current;
      if ((current.q || "") === draftQ) return;
      persist({ ...current, q: draftQ, page: "1" });
    }, 400);
    return () => clearTimeout(t);
  }, [draftQ, persist]);

  const set = useCallback(
    (key: string, value: string) => {
      const next = { ...values, [key]: value, page: key === "page" ? value : "1" };
      if (!value) delete next[key];
      if (key === "q") setDraftQ(value);
      persist(next);
    },
    [persist, values],
  );

  const setMany = useCallback(
    (patch: FilterValues) => {
      const next: FilterValues = { ...values, ...patch, page: "1" };
      Object.entries(patch).forEach(([k, v]) => {
        if (!v) delete next[k];
      });
      if (patch.q != null) setDraftQ(patch.q);
      persist(next);
    },
    [persist, values],
  );

  const clear = useCallback(() => {
    setDraftQ("");
    persist({});
  }, [persist]);

  const qs = useMemo(() => searchFromValues(values).toString(), [values]);
  const count = activeFilterCount(values);

  return {
    id,
    values,
    q: draftQ,
    setQ: setDraftQ,
    set,
    setMany,
    clear,
    qs,
    page: Number(values.page || 1),
    sort: values.sort || "",
    count,
    loading,
    setLoading,
    path: loc.pathname,
  };
}

export type ListQuery = ReturnType<typeof useListQuery>;
