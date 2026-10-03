import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { get, post, put } from "./lib/api";
import { clearSessionToken, setSessionToken } from "./lib/session";
import type { Lang } from "./i18n";
import { t, type Msg } from "./i18n";
import { loadBranch, loadWarehouse, saveBranch, saveWarehouse } from "./lib/shortcuts";
import { applyUiLayout, loadUiLayout, saveUiLayout, type UiLayout } from "./lib/ui-layout";

export type User = {
  id: number;
  username: string;
  full_name: string;
  role_id: number;
  role_slug: string;
  delivery_agent_id: number | null;
  permissions: string[];
  ui_layout?: string | null;
};

export type Lookups = {
  brands: { id: number; name_ar: string; name_en: string }[];
  part_types: { id: number; name_ar: string; name_en: string }[];
  categories: { id: number; name_ar: string; name_en: string }[];
  models: { id: number; name: string; brand_id: number; code?: string; brand_en?: string }[];
  locations: { id: number; name: string; kind?: string; parent_id?: number | null; code?: string; path?: string; label?: string; warehouse?: string; box?: string; rack?: string; shelf?: string; drawer?: string }[];
  suppliers: { id: number; name: string }[];
  payment_methods: { id: number; code: string; name_ar: string; name_en: string }[];
  delivery_agents: { id: number; name: string; code: string; phone?: string; role_type?: string; commission_rate?: number; area?: string }[];
  price_lists?: { id: number; name: string; name_en?: string; customer_type?: string }[];
  branches?: { id: number; name: string; name_en?: string; city?: string }[];
  cash_accounts?: { id: number; kind: string; name: string; name_en?: string; account_id: number; current_balance: number }[];
};

type Theme = "light" | "dark";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  uiLayout: UiLayout;
  setUiLayout: (l: UiLayout) => void;
  dir: "rtl" | "ltr";
  tr: (key: Msg) => string;
  user: User | null;
  loading: boolean;
  lookups: Lookups | null;
  refreshLookups: () => Promise<void>;
  login: (username: string, password: string, remember?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  can: (...codes: string[]) => boolean;
  settings: Record<string, string>;
  refreshSettings: () => Promise<void>;
  branchId: number;
  setBranchId: (id: number) => void;
  warehouseId: number;
  setWarehouseId: (id: number) => void;
};

const C = createContext<Ctx | null>(null);

function applyTheme(t: Theme) {
  document.documentElement.classList.toggle("dark", t === "dark");
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem("pixel_lang") as Lang) || "ar");
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = (localStorage.getItem("motamayez_theme") as Theme) || "light";
    if (typeof document !== "undefined") applyTheme(stored);
    return stored;
  });
  const [uiLayout, setUiLayoutState] = useState<UiLayout>(() => {
    const stored = loadUiLayout();
    if (typeof document !== "undefined") applyUiLayout(stored);
    return stored;
  });
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [branchId, setBranchIdState] = useState(() => loadBranch());
  const [warehouseId, setWarehouseIdState] = useState(() => loadWarehouse());

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("pixel_lang", l);
    document.documentElement.lang = l;
    document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
  };

  const setBranchId = (id: number) => {
    setBranchIdState(id);
    saveBranch(id);
  };

  const setWarehouseId = (id: number) => {
    setWarehouseIdState(id);
    saveWarehouse(id);
  };

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem("motamayez_theme", t);
    applyTheme(t);
  };

  const setUiLayout = (layout: UiLayout) => {
    setUiLayoutState(layout);
    saveUiLayout(layout);
    applyUiLayout(layout);
    put("/api/auth/prefs", { ui_layout: layout }).catch(() => {});
  };

  function hydrateLayout(user: User | null) {
    const fromUser = user?.ui_layout === "classic_easy" || user?.ui_layout === "modern" ? user.ui_layout : null;
    if (fromUser) {
      setUiLayoutState(fromUser);
      saveUiLayout(fromUser);
      applyUiLayout(fromUser);
    }
  }

  const refreshLookups = async () => {
    try {
      const data = await get<Lookups>("/api/lookups");
      setLookups(data);
      if (data.branches?.length === 1) {
        setBranchIdState(data.branches[0].id);
        saveBranch(data.branches[0].id);
      }
    } catch {
      /* ignore */
    }
  };

  const refreshSettings = async () => {
    try {
      const data = await get<{ settings: Record<string, string> }>("/api/settings");
      setSettings(data.settings || {});
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const onUnauth = () => setUser(null);
    window.addEventListener("motamayez-unauth", onUnauth);
    return () => window.removeEventListener("motamayez-unauth", onUnauth);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    const ac = new AbortController();
    (async () => {
      try {
        const me = await get<{ user: User }>("/api/auth/me", { signal: ac.signal });
        if (ac.signal.aborted) return;
        setUser(me.user);
        hydrateLayout(me.user);
        await refreshLookups();
        await refreshSettings();
      } catch {
        if (!ac.signal.aborted) setUser(null);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang,
      theme,
      setTheme,
      uiLayout,
      setUiLayout,
      dir: lang === "ar" ? "rtl" : "ltr",
      tr: (key) => t(lang, key),
      user,
      loading,
      lookups,
      refreshLookups,
      settings,
      refreshSettings,
      login: async (username, password, remember) => {
        const res = await post<{ user: User; token?: string }>("/api/auth/login", { username, password, remember: !!remember });
        if (res.token) setSessionToken(res.token, !!remember);
        if (!res.user) throw new Error("invalid_credentials");
        setUser(res.user);
        hydrateLayout(res.user);
        try {
          const me = await get<{ user: User }>("/api/auth/me");
          if (me.user) {
            setUser(me.user);
            hydrateLayout(me.user);
          }
        } catch {
          /* cookie may be blocked; bearer token is enough */
        }
        await refreshLookups();
        await refreshSettings();
      },
      logout: async () => {
        try {
          await post("/api/auth/logout");
        } finally {
          clearSessionToken();
          setUser(null);
        }
      },
      branchId,
      setBranchId,
      warehouseId,
      setWarehouseId,
      can: (...codes) => {
        if (!user) return false;
        if (user.role_slug === "admin") return true;
        return codes.some((c) => user.permissions?.includes(c));
      },
    }),
    [lang, theme, uiLayout, user, loading, lookups, settings, branchId, warehouseId],
  );

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useApp() {
  const ctx = useContext(C);
  if (!ctx) throw new Error("useApp");
  return ctx;
}
