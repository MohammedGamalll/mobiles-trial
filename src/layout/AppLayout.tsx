import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LogOut,
  Search,
  Bell,
  Menu,
  X,
  Printer,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Star,
  Maximize2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "../context";
import { get, post } from "../lib/api";
import { PixelMark, inputCls } from "../components/ui";
import { setSoundEnabled, unlockSounds } from "../lib/sounds";
import { CommandPalette } from "../components/CommandPalette";
import { ThemeSwitcher } from "../components/ThemeSwitcher";
import { EasyHomeLink } from "../components/EasyLauncher";
import { SahlMenu } from "../components/SahlMenu";
import { ModernModules } from "../components/ModernModules";
import { isFav, loadFavs, loadRecent, pushRecent, toggleFav, type FavItem } from "../lib/shortcuts";
import { allNavItems, classicNav, matchNavTo, modernNav } from "./nav";
import { warehouseLocations } from "../lib/warehouses";
import type { Msg } from "../i18n";
import { useCourierGps } from "../hooks/useCourierGps";

export default function AppLayout() {
  const { tr, lang, setLang, theme, setTheme, uiLayout, user, logout, can, lookups, branchId, setBranchId, warehouseId, setWarehouseId, settings } = useApp();
  const groups = uiLayout === "classic_easy" ? classicNav : modernNav;
  const classic = uiLayout === "classic_easy";
  const nav = useNavigate();
  const loc = useLocation();
  const pos = loc.pathname === "/pos";
  const classicDesk = classic && (pos || loc.pathname === "/products" || loc.pathname === "/inventory");
  const [cmd, setCmd] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [noteType, setNoteType] = useState("");
  const [noteRead, setNoteRead] = useState("");
  const [bell, setBell] = useState(false);
  const [menu, setMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("motamayez_sidebar") === "1");
  const [quick, setQuick] = useState(false);
  const [favs, setFavs] = useState<FavItem[]>(() => loadFavs());
  const [recent, setRecent] = useState<FavItem[]>(() => loadRecent());
  const gps = useCourierGps();
  const unread = notes.filter((n) => !n.read_at).length;
  const shownNotes = notes.filter((n) => {
    if (noteType && n.type !== noteType) return false;
    if (noteRead === "1" && !n.read_at) return false;
    if (noteRead === "0" && n.read_at) return false;
    return true;
  });
  const navItems = allNavItems(groups);
  const activeTo = matchNavTo(loc.pathname, loc.search, navItems);
  const pageKey = (navItems.find((i) => i.to === activeTo)?.key || "dashboard") as Msg;

  useEffect(() => {
    if (loc.pathname === "/login") return;
    setRecent(pushRecent({ to: loc.pathname, key: pageKey }));
  }, [loc.pathname]);

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("motamayez_sidebar", next ? "1" : "0");
  }

  useEffect(() => {
    get<{ data: any[] }>("/api/notifications").then((r) => setNotes(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setSoundEnabled(settings.sound_enabled !== "0");
  }, [settings.sound_enabled]);

  useEffect(() => {
    const on = () => unlockSounds();
    window.addEventListener("pointerdown", on);
    window.addEventListener("keydown", on);
    return () => {
      window.removeEventListener("pointerdown", on);
      window.removeEventListener("keydown", on);
    };
  }, []);

  const Nav = ({ slim = false }: { slim?: boolean }) => (
    <nav className={`app-nav px-3 pb-8 ${classic ? "space-y-2" : "space-y-4"}`}>
      {groups.map((g) => {
        const visible = g.items.filter((i) => can(i.perm) && (!i.agentOnly || user?.delivery_agent_id || user?.role_slug === "admin"));
        if (!visible.length) return null;
        return (
          <div key={g.label}>
            {slim ? null : <div className={`mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.14em] ${classic ? "text-slate-400" : "text-slate-500"}`}>{tr(g.label)}</div>}
            <div className={classic ? "space-y-0" : "space-y-0.5"}>
              {visible.map((i) => {
                const Icon = i.icon;
                const on = i.to === activeTo;
                return (
                  <NavLink
                    key={i.to}
                    to={i.to}
                    end={i.to === "/"}
                    title={tr(i.key)}
                    onClick={() => setMenu(false)}
                    aria-current={on ? "page" : undefined}
                    className={`app-nav-link flex items-center ${slim ? "justify-center px-2" : classic ? "gap-2.5 px-3" : "gap-3 px-3"} ${
                      classic ? "rounded-md py-1.5 text-[13px]" : "rounded-xl py-2 text-sm"
                    } font-semibold ${on ? "is-active" : ""}`}
                  >
                    <Icon size={16} />
                    {slim ? null : tr(i.key)}
                  </NavLink>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className={`app-shell flex min-h-screen ${pos ? "is-pos" : ""}`}>
      <aside className={`${classic || pos ? "hidden" : "hidden md:flex md:flex-col"} app-sidebar sidebar-scroll sticky top-0 h-screen shrink-0 overflow-y-auto transition-[width] ${
        classic
          ? `border-e border-slate-200 bg-white text-slate-800 ${collapsed ? "w-[68px]" : "w-[220px]"}`
          : `bg-gradient-to-b from-[#071018] via-[#0b1f33] to-[#123047] text-white ${collapsed ? "w-[76px]" : "w-[248px]"}`
      }`}>
        <div className={`flex items-center gap-3 ${classic ? "border-b border-slate-100 py-3" : "py-5"} ${collapsed ? "justify-center px-2" : "px-5"}`}>
          <PixelMark size={collapsed ? 22 : 28} />
          {collapsed ? null : (
            <div>
              <div className={`font-black tracking-wide ${classic ? "text-base text-[#0b2a4a]" : "text-lg"}`}>{tr("app")}</div>
              {classic ? null : <div className="text-[10px] leading-4 text-slate-400">{tr("tagline")}</div>}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {!classic && !collapsed && favs.length ? (
            <div className="px-3 pb-3">
              <div className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{tr("favorites")}</div>
              {favs.map((f) => (
                <NavLink key={f.to} to={f.to} className="block rounded-xl px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5">{tr(f.key as Msg)}</NavLink>
              ))}
            </div>
          ) : null}
          {!classic && !collapsed && recent.length ? (
            <div className="px-3 pb-3">
              <div className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{tr("recentItems")}</div>
              {recent.slice(0, 4).map((f) => (
                <NavLink key={f.to} to={f.to} className="block rounded-xl px-3 py-1.5 text-sm text-slate-400 hover:bg-white/5">{tr(f.key as Msg)}</NavLink>
              ))}
            </div>
          ) : null}
          <Nav slim={collapsed} />
        </div>
        <button className={`m-3 p-2 ${classic ? "rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50" : "rounded-xl border border-white/10 text-slate-300 hover:bg-white/5"}`} title={collapsed ? tr("expand") : tr("collapse")} onClick={toggleCollapse}>
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </aside>

      {menu ? (
        <div className="sidebar-mobile fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenu(false)} />
          <aside className={`sidebar-scroll relative h-full w-[260px] overflow-y-auto ${classic ? "bg-white text-slate-800" : "bg-[#07111f] text-white"}`}>
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-2">
                <PixelMark size={22} />
                <span className="font-black">{tr("app")}</span>
              </div>
              <button onClick={() => setMenu(false)}>
                <X size={18} />
              </button>
            </div>
            <Nav />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className={`topbar sticky top-0 z-30 flex items-center gap-2 border-b px-3 md:px-4 ${
          classic ? "h-12 border-[#083056] bg-[#0b2a4a] py-0 text-white" : "border-slate-200/80 bg-white/90 py-3 text-slate-800 backdrop-blur"
        }`}>
          <button className={`${classic || pos ? "" : "md:hidden"} ${classic ? "topbar-ctrl rounded-md border p-2" : "rounded-xl border border-slate-200 p-2"}`} onClick={() => setMenu(true)}>
            <Menu size={16} />
          </button>
          {classic && loc.pathname !== "/" ? <EasyHomeLink /> : pos ? <EasyHomeLink /> : null}
          <button
            type="button"
            className={`top-search relative min-w-0 flex-1 py-2 pe-3 ps-9 text-start text-sm text-slate-400 ${classicDesk ? "hidden" : ""} ${classic ? "rounded-md border border-transparent bg-white" : "rounded-xl border border-slate-200 bg-slate-50"}`}
            onClick={() => setCmd(true)}
          >
            <Search className="pointer-events-none absolute top-2.5 start-3 text-slate-400" size={16} />
            {tr("globalSearch")}
            <kbd className="pointer-events-none absolute top-1.5 end-2 hidden rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400 sm:inline">Ctrl+K</kbd>
          </button>
          <CommandPalette open={cmd} onOpen={() => setCmd(true)} onClose={() => setCmd(false)} />
          {(lookups?.branches || []).length > 1 ? (
            <select className={`hidden max-w-[140px] px-2 py-2 text-sm sm:block ${classic ? "topbar-ctrl rounded-md border" : "rounded-xl border border-slate-200 bg-white"}`} value={branchId} onChange={(e) => setBranchId(Number(e.target.value))} title={tr("branch")}>
              {(lookups?.branches || []).map((b) => <option key={b.id} value={b.id}>{lang === "ar" ? b.name : (b.name_en || b.name)}</option>)}
            </select>
          ) : null}
          {warehouseLocations(lookups?.locations).length ? (
            <select className={`hidden max-w-[140px] px-2 py-2 text-sm sm:block ${classic ? "topbar-ctrl rounded-md border" : "rounded-xl border border-slate-200 bg-white"}`} value={warehouseId || ""} onChange={(e) => setWarehouseId(Number(e.target.value) || 0)} title={tr("warehouses")}>
              <option value="">{tr("warehouses")}</option>
              {warehouseLocations(lookups?.locations).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          ) : null}
          <div className="relative">
            <button className={classic ? "topbar-ctrl rounded-md border p-2" : "rounded-xl border border-slate-200 p-2 text-slate-600"} title={tr("quickAdd")} onClick={() => setQuick((v) => !v)}>
              <Plus size={16} />
            </button>
            {quick ? (
              <div className="topbar-menu absolute end-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                {can("sales.create") ? <button className="block w-full px-3 py-2 text-start text-sm hover:bg-slate-50" onClick={() => { setQuick(false); nav("/pos"); }}>{tr("pos")}</button> : null}
                {can("purchases.create") ? <button className="block w-full px-3 py-2 text-start text-sm hover:bg-slate-50" onClick={() => { setQuick(false); nav("/purchases"); }}>{tr("purchases")}</button> : null}
                {can("customers.create") ? <button className="block w-full px-3 py-2 text-start text-sm hover:bg-slate-50" onClick={() => { setQuick(false); nav("/customers"); }}>{tr("customers")}</button> : null}
                {can("suppliers.view") ? <button className="block w-full px-3 py-2 text-start text-sm hover:bg-slate-50" onClick={() => { setQuick(false); nav("/suppliers"); }}>{tr("suppliers")}</button> : null}
                {can("transfers.view") ? <button className="block w-full px-3 py-2 text-start text-sm hover:bg-slate-50" onClick={() => { setQuick(false); nav("/transfers"); }}>{tr("transfers")}</button> : null}
                {can("stocktake.view") ? <button className="block w-full px-3 py-2 text-start text-sm hover:bg-slate-50" onClick={() => { setQuick(false); nav("/stocktake"); }}>{tr("stocktake")}</button> : null}
                {can("hr.view") ? <button className="block w-full px-3 py-2 text-start text-sm hover:bg-slate-50" onClick={() => { setQuick(false); nav("/hr/employees"); }}>{tr("employees")}</button> : null}
                {can("expenses.create") ? <button className="block w-full px-3 py-2 text-start text-sm hover:bg-slate-50" onClick={() => { setQuick(false); nav("/expenses"); }}>{tr("expenses")}</button> : null}
                {can("vouchers.create") ? <button className="block w-full px-3 py-2 text-start text-sm hover:bg-slate-50" onClick={() => { setQuick(false); nav("/ledger/vouchers"); }}>{tr("vouchers")}</button> : null}
              </div>
            ) : null}
          </div>
          <button className={`${classic ? "topbar-ctrl rounded-md border p-2" : "rounded-xl border p-2"} ${isFav(loc.pathname) ? "border-amber-300 text-amber-500" : classic ? "" : "border-slate-200 text-slate-600"}`} title={tr("favorites")} onClick={() => setFavs(toggleFav({ to: loc.pathname, key: pageKey }))}>
            <Star size={16} fill={isFav(loc.pathname) ? "currentColor" : "none"} />
          </button>
          <button className={`hidden sm:inline-flex ${classic ? "topbar-ctrl rounded-md border p-2" : "rounded-xl border border-slate-200 p-2 text-slate-600"}`} title={tr("print")} onClick={() => window.print()}>
            <Printer size={16} />
          </button>
          <button className={`hidden sm:inline-flex ${classic ? "topbar-ctrl rounded-md border p-2" : "rounded-xl border border-slate-200 p-2 text-slate-600"}`} title={tr("fullscreen")} onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen();
            else document.documentElement.requestFullscreen().catch(() => {});
          }}>
            <Maximize2 size={16} />
          </button>
          <ThemeSwitcher />
          <button className={classic ? "topbar-ctrl rounded-md border p-2" : "rounded-xl border border-slate-200 p-2 text-slate-600"} title={theme === "dark" ? tr("lightMode") : tr("darkMode")} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className={classic ? "topbar-ctrl rounded-md border px-3 py-2 text-sm font-bold" : "rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"} onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
            {tr("language")}
          </button>
          <div className="relative">
            <button className={`relative ${classic ? "topbar-ctrl rounded-md border p-2" : "rounded-xl border border-slate-200 p-2"}`} onClick={() => setBell((v) => !v)}>
              <Bell size={16} />
              {unread ? <span className="absolute -top-1 -end-1 h-4 min-w-4 rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread}</span> : null}
            </button>
            {bell ? (
              <div className="topbar-menu absolute end-0 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between px-3 py-2 text-sm font-bold">
                  {tr("notifications")}
                  <button
                    className="text-xs text-cyan-700"
                    onClick={async () => {
                      await post("/api/notifications/read", {});
                      setNotes((n) => n.map((x) => ({ ...x, read_at: "1" })));
                    }}
                  >
                    {tr("markRead")}
                  </button>
                </div>
                <div className="flex gap-2 px-3 pb-2">
                  <select className={`${inputCls} py-1 text-xs`} value={noteType} onChange={(e) => setNoteType(e.target.value)}>
                    <option value="">{tr("all")}</option>
                    <option value="low_stock">{tr("stockLow")}</option>
                    <option value="out_of_stock">{tr("stockOut")}</option>
                  </select>
                  <select className={`${inputCls} py-1 text-xs`} value={noteRead} onChange={(e) => setNoteRead(e.target.value)}>
                    <option value="">{tr("all")}</option>
                    <option value="0">{tr("unread")}</option>
                    <option value="1">{tr("readStatus")}</option>
                  </select>
                </div>
                <div className="max-h-80 overflow-auto">
                  {shownNotes.map((n) => (
                    <div key={n.id} className={`border-t border-slate-100 px-3 py-2 text-sm ${n.read_at ? "opacity-60" : ""}`}>
                      <div className="font-bold">{lang === "ar" ? n.title_ar : n.title_en}</div>
                      <div className="text-slate-500">{lang === "ar" ? n.body_ar : n.body_en}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <div className="text-end text-sm">
              <div className="font-bold leading-5">{user?.full_name}</div>
              <div className="text-xs capitalize text-slate-400">{user?.role_slug}</div>
            </div>
            <button
              className={classic ? "topbar-ctrl rounded-md border p-2" : "rounded-xl border border-slate-200 p-2"}
              onClick={async () => {
                await logout();
                nav("/login");
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        {gps.enabled ? (
          <div className={`px-3 py-2 text-sm font-bold ${gps.status === "live" ? "bg-emerald-50 text-emerald-800" : gps.status === "denied" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>
            {gps.status === "live" ? tr("gpsLive") : gps.status === "skipped" ? tr("gpsNoOrders") : gps.status === "paused" ? tr("gpsPaused") : gps.status === "denied" ? tr("gpsNeedPermission") : tr("waitingGps")}
          </div>
        ) : null}
        {classicDesk ? null : classic ? <SahlMenu /> : <ModernModules />}
        <main className={classicDesk || pos ? "app-main sahl-pos-main" : classic && loc.pathname === "/" ? "app-main easy-main" : "app-main p-4 md:p-6"}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
