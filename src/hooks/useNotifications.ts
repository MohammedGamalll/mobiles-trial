import { useCallback, useEffect, useState } from "react";
import { get, put } from "../lib/api";

export type AppNotification = {
  id: number;
  type: string;
  title_ar: string;
  title_en: string;
  body_ar?: string | null;
  body_en?: string | null;
  read_at?: string | null;
  action_url?: string | null;
  created_at?: string;
};

export function useNotifications() {
  const [notes, setNotes] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await get<{ data: AppNotification[]; unread?: number }>("/api/notifications");
      const data = r.data || [];
      setNotes(data);
      setUnread(Number(r.unread ?? data.filter((n) => !n.read_at).length));
    } catch {
      /* keep last inbox */
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(t);
  }, [load]);

  async function markRead(id: number) {
    await put(`/api/notifications/${id}/read`, {});
    setNotes((rows) => rows.map((n) => (n.id === id ? { ...n, read_at: n.read_at || "1" } : n)));
    setUnread((n) => Math.max(0, n - 1));
  }

  async function markAllRead() {
    await put("/api/notifications/read-all", {});
    setNotes((rows) => rows.map((n) => ({ ...n, read_at: n.read_at || "1" })));
    setUnread(0);
  }

  return { notes, unread, load, markRead, markAllRead };
}
