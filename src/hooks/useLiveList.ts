import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../context";
import { apiMessage } from "../lib/errors";

export function useLiveList(load: () => Promise<void>, deps: readonly unknown[]) {
  const { tr } = useApp();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const gen = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    const id = ++gen.current;
    setLoading(true);
    setErr("");
    try {
      await loadRef.current();
    } catch (e) {
      if (id !== gen.current) return;
      setErr(apiMessage(tr, e));
    } finally {
      if (id === gen.current) setLoading(false);
    }
  }, [tr]);

  useEffect(() => {
    void reload();
    return () => {
      gen.current += 1;
    };
    // load is read from the latest ref; deps are the list query keys
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { loading, err, reload };
}
