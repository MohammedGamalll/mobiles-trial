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
  MoreVertical,
  ChevronDown,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../context";
import { PixelMark, inputCls } from "../components/ui";
import { setSoundEnabled, unlockSounds } from "../lib/sounds";
import { CommandPalette } from "../components/CommandPalette";
import { ThemeSwitcher } from "../components/ThemeSwitcher";
import { EasyHomeLink } from "../components/EasyLauncher";
import { SahlMenu } from "../components/SahlMenu";
import { ModernModules } from "../components/ModernModules";
import { isFav, loadFavs, loadRecent, pushRecent, toggleFav, type FavItem } from "../lib/shortcuts";
import { allNavItems, classicNav, matchNavTo, modernNav, type NavGroup } from "./nav";
import { warehouseLocations } from "../lib/warehouses";
import type { Msg } from "../i18n";
import { useCourierGps } from "../hooks/useCourierGps";
import { useNotifications } from "../hooks/useNotifications";
import { apiMessage } from "../lib/errors";

function AppNav({
  slim = false,
  classic,
  groups,
  can,
  user,
  tr,
  activeTo,
  openGroup,
  setOpenGroup,
  setCollapsed,
  closeMenu,
}: {
  slim?: boolean;
  classic: boolean;
  groups: NavGroup[];
  can: (perm: string) => boolean;
  user: { delivery_agent_id?: number | null; role_slug?: string } | null | undefined;
  tr: (k: Msg) => string;
  activeTo: string | null;
  openGroup: Msg | null;
  setOpenGroup: (v: Msg | null | ((cur: Msg | null) => Msg | null)) => void;
  setCollapsed: (v: boolean) => void;
  closeMenu: () => void;
}) {
  return (
    <nav className="app-nav space-y-2 px-3 pb-8">
      {groups.map((g) => {
        const visible = g.items.filter((i) => can(i.perm) && (!i.agentOnly || user?.delivery_agent_id || user?.role_slug === "admin"));
        if (!visible.length) return null;
        const open = openGroup === g.label;
        const GroupIcon = visible[0].icon;
        function toggleGroup() {
          if (slim) {
            setCollapsed(false);
            localStorage.setItem("motamayez_sidebar", "0");
            setOpenGroup(g.label);
            return;
          }
          setOpenGroup((cur) => (cur === g.label ? null : g.label));
        }
        return (
          <div key={g.label}>
            <button
              type="button"
              title={tr(g.label)}
              onClick={toggleGroup}
              aria-expanded={open}
              className={`mb-1 flex w-full items-center rounded-xl px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
                slim ? "justify-center" : "justify-between gap-2"
              } ${classic ? "text-slate-400 hover:bg-slate-50" : "text-[var(--muted)] hover:bg-[var(--surface-2)]"} ${
                open && !slim ? (classic ? "text-slate-700" : "text-[var(--text)]") : ""
              }`}
            >
              {slim ? <GroupIcon size={16} /> : (
                <>
                  <span className="truncate">{tr(g.label)}</span>
                  <ChevronDown size={14} className={`shrink-0 transition-transform duration-300 ease-in-out ${open ? "rotate-180" : ""}`} />
                </>
              )}
            </button>
            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${open && !slim ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
            >
              <div className={`overflow-hidden ${classic ? "space-y-0" : "space-y-0.5"}`}>
                {visible.map((i) => {
                  const Icon = i.icon;
                  const on = i.to === activeTo;
                  return (
                    <NavLink
                      key={i.to}
                      to={i.to}
                      end={i.to === "/"}
                      title={tr(i.key)}
                      onClick={closeMenu}
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
          </div>
        );
      })}
    </nav>
  );
}

export default function AppLayout() {
  const { tr, lang, setLang, theme, setTheme, uiLayout, user, logout, can, lookups, branchId, setBranchId, warehouseId, setWarehouseId, settings } = useApp();
  const groups = uiLayout === "classic_easy" ? classicNav : modernNav;
  const classic = uiLayout === "classic_easy";
  const nav = useNavigate();
  const loc = useLocation();
  const pos = loc.pathname === "/pos";
  const classicDesk = classic && (pos || loc.pathname === "/products" || loc.pathname === "/inventory");
  const [cmd, setCmd] = useState(false);
  const [noteType, setNoteType] = useState("");
  const [noteRead, setNoteRead] = useState("");
  const [bell, setBell] = useState(false);
  const inbox = useNotifications();
  const [menu, setMenu] = useState(false);
  const [menuShown, setMenuShown] = useState(false);
  const menuTimer = useRef<number>(0);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("motamayez_sidebar") === "1");
  const [openGroup, setOpenGroup] = useState<Msg | null>(null);
  const [quick, setQuick] = useState(false);
  const [wareOpen, setWareOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [favs, setFavs] = useState<FavItem[]>(() => loadFavs());
  const [recent, setRecent] = useState<FavItem[]>(() => loadRecent());
  const gps = useCourierGps();
  const unread = inbox.unread;
  const shownNotes = inbox.notes.filter((n) => {
    if (noteType && n.type !== noteType) return false;
    if (noteRead === "1" && !n.read_at) return false;
    if (noteRead === "0" && n.read_at) return false;
    return true;
  });
  const navItems = allNavItems(groups);
  const activeTo = matchNavTo(loc.pathname, loc.search, navItems);
  const pageKey = (navItems.find((i) => i.to === activeTo)?.key || "dashboard") as Msg;

  useEffect(() => {
    const g = groups.find((group) => group.items.some((i) => i.to === activeTo));
    setOpenGroup(g?.label ?? null);
  }, [activeTo, groups]);

  useEffect(() => {
    if (loc.pathname === "/login") return;
    setRecent(pushRecent({ to: loc.pathname, key: pageKey }));
    setMenu(false);
    setMenuShown(false);
    setMore(false);
    setQuick(false);
    setWareOpen(false);
    setBell(false);
  }, [loc.pathname]);

  function openMenu() {
    window.clearTimeout(menuTimer.current);
    setMenuShown(true);
    requestAnimationFrame(() => setMenu(true));
  }
  function closeMenu() {
    setMenu(false);
    window.clearTimeout(menuTimer.current);
    menuTimer.current = window.setTimeout(() => setMenuShown(false), 260);
  }

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("motamayez_sidebar", next ? "1" : "0");
  }

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

  useEffect(() => {
    document.body.style.overflow = menu || more ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menu, more]);

  const navProps = {
    classic,
    groups,
    can,
    user,
    tr,
    activeTo,
    openGroup,
    setOpenGroup,
    setCollapsed,
    closeMenu,
  };

  return (
    <div className={`app-shell flex ${pos ? "is-pos h-dvh overflow-hidden" : "min-h-screen"}`}>
      <aside className={`${classic || pos ? "hidden" : "hidden md:flex md:flex-col"} app-sidebar sidebar-scroll sticky top-0 h-screen shrink-0 overflow-y-auto overflow-x-hidden transition-[width] duration-300 ease-in-out ${
        classic
          ? `border-e border-slate-200 bg-white text-slate-800 ${collapsed ? "w-[68px]" : "w-[220px]"}`
          : `bg-[var(--surface)] text-[var(--text)] border-e border-[var(--border)] ${collapsed ? "w-[76px]" : "w-[248px]"}`
      }`}>
        <div className={`flex items-center gap-3 ${classic ? "border-b border-slate-100 py-3" : "py-5"} ${collapsed ? "justify-center px-2" : "px-5"}`}>
          <PixelMark size={collapsed ? 22 : 28} />
          {collapsed ? null : (
            <div>
              <div className={`font-black tracking-wide ${classic ? "text-base text-[#0b2a4a]" : "text-lg"}`}>{tr("app")}</div>
              {classic ? null : <div className="text-[10px] leading-4 text-[var(--muted)]">{tr("tagline")}</div>}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {!classic && !collapsed && favs.length ? (
            <div className="px-3 pb-3">
              <div className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">{tr("favorites")}</div>
              {favs.map((f) => (
                <NavLink key={f.to} to={f.to} className="block rounded-xl px-3 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--surface-2)]">{tr(f.key as Msg)}</NavLink>
              ))}
            </div>
          ) : null}
          {!classic && !collapsed && recent.length ? (
            <div className="px-3 pb-3">
              <div className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">{tr("recentItems")}</div>
              {recent.slice(0, 4).map((f) => (
                <NavLink key={f.to} to={f.to} className="block rounded-xl px-3 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--surface-2)]">{tr(f.key as Msg)}</NavLink>
              ))}
            </div>
          ) : null}
          <AppNav slim={collapsed} {...navProps} />
        </div>
        <button className={`m-3 p-2 ${classic ? "rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50" : "rounded-xl border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-2)]"}`} title={collapsed ? tr("expand") : tr("collapse")} onClick={toggleCollapse}>
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </aside>

      {menuShown ? (
        <div className={`sidebar-mobile ${menu ? "is-open" : ""} ${classic || pos ? "" : "md:hidden"}`}>
          <div className="sidebar-mobile-backdrop" onClick={closeMenu} />
          <aside className={`sidebar-mobile-panel sidebar-scroll ${classic ? "bg-white text-slate-800" : "bg-[var(--surface)] text-[var(--text)]"}`}>
            <div className="flex shrink-0 items-center justify-between px-4 py-4">
              <div className="flex min-w-0 items-center gap-2">
                <PixelMark size={22} />
                <span className="truncate font-black">{tr("app")}</span>
              </div>
              <button type="button" className="rounded-lg p-2" onClick={closeMenu} aria-label={tr("close")}>
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <AppNav {...navProps} />
            </div>
            <div className={`shrink-0 space-y-2 border-t px-4 py-3 ${classic ? "border-slate-200" : "border-[var(--border)]"}`}>
              <div className="text-sm font-bold">{user?.full_name}</div>
              <div className="text-xs capitalize text-slate-400">{user?.role_slug}</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={classic ? "rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold" : "rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold"} onClick={() => setLang(lang === "ar" ? "en" : "ar")}>{lang === "ar" ? "EN" : "ع"}</button>
                <button type="button" className={classic ? "rounded-md border border-slate-200 p-1.5" : "rounded-lg border border-[var(--border)] p-1.5"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}</button>
                <button
                  type="button"
                  className={classic ? "rounded-md border border-slate-200 p-1.5" : "rounded-lg border border-[var(--border)] p-1.5"}
                  onClick={async () => {
                    await logout();
                    nav("/login");
                  }}
                >
                  <LogOut size={14} />
                </button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${pos ? "overflow-hidden" : ""}`}>
        <header className={`topbar sticky top-0 z-30 flex items-center gap-1.5 overflow-visible border-b px-2 md:gap-2 md:px-4 ${
          classic ? "h-12 border-[#083056] bg-[#0b2a4a] py-0 text-white" : "border-[var(--border)] bg-[var(--surface)] py-3 text-[var(--text)]"
        }`}>
          <button type="button" className={`shrink-0 ${classic || pos ? "" : "md:hidden"} ${classic ? "topbar-ctrl rounded-md border p-2" : "rounded-xl border border-[var(--border)] p-2"}`} onClick={openMenu}>
            <Menu size={16} />
          </button>
          {classic && loc.pathname !== "/" ? <EasyHomeLink /> : pos ? <EasyHomeLink /> : null}
          <div className="min-w-0 flex-1 truncate px-1 text-sm font-black md:hidden">{tr(pageKey)}</div>
          <button
            type="button"
            className={`top-search relative min-w-0 py-2 pe-3 ps-9 text-start text-sm text-[var(--muted)] ${classicDesk ? "hidden" : "hidden flex-1 md:block"} ${classic ? "rounded-md border border-transparent bg-white" : "rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"}`}
            onClick={() => setCmd(true)}
          >
            <Search className="pointer-events-none absolute top-2.5 start-3 text-slate-400" size={16} />
            <span className="top-search-label">{tr("globalSearch")}</span>
            <kbd className="pointer-events-none absolute top-1.5 end-2 hidden rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400 sm:inline">Ctrl+K</kbd>
          </button>
          <button
            type="button"
            className={`shrink-0 md:hidden ${classic ? "topbar-ctrl rounded-md border p-2" : "rounded-xl border border-[var(--border)] p-2"}`}
            title={tr("globalSearch")}
            onClick={() => { setMore(false); setBell(false); setCmd(true); }}
          >
            <Search size={16} />
          </button>
          <div className={`items-center gap-2 ${pos ? "hidden" : "hidden md:flex"}`}>
          {(lookups?.branches || []).length > 1 ? (
            <select className={`max-w-[140px] px-2 py-2 text-sm ${classic ? "topbar-ctrl rounded-md border" : "rounded-xl border border-[var(--border)] bg-[var(--surface)]"}`} value={branchId} onChange={(e) => setBranchId(Number(e.target.value))} title={tr("branch")}>
              {(lookups?.branches || []).map((b) => <option key={b.id} value={b.id}>{lang === "ar" ? b.name : (b.name_en || b.name)}</option>)}
            </select>
          ) : null}
          {warehouseLocations(lookups?.locations).length ? (
            <div className="relative">
              <button
                type="button"
                className={`topbar-select max-w-[160px] truncate px-2 py-2 text-sm ${classic ? "topbar-ctrl rounded-md border" : "rounded-xl border border-[var(--border)]"}`}
                title={tr("warehouses")}
                onClick={() => { setWareOpen((v) => !v); setQuick(false); }}
              >
                {warehouseLocations(lookups?.locations).find((l) => l.id === warehouseId)?.name || tr("warehouses")}
              </button>
              {wareOpen ? (
                <div className="topbar-menu absolute end-0 z-50 mt-2 max-h-64 min-w-[200px] w-max overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-xl">
                  <button type="button" className="block w-full px-3 py-2 text-start text-sm font-bold text-slate-900 hover:bg-slate-100 dark:text-[var(--text)] dark:hover:bg-white/10" onClick={() => { setWarehouseId(0); setWareOpen(false); }}>{tr("warehouses")}</button>
                  {warehouseLocations(lookups?.locations).map((l) => (
                    <button key={l.id} type="button" className={`block w-full px-3 py-2 text-start text-sm font-bold text-slate-900 hover:bg-slate-100 dark:text-[var(--text)] dark:hover:bg-white/10 ${warehouseId === l.id ? "bg-slate-100 dark:bg-white/10" : ""}`} onClick={() => { setWarehouseId(l.id); setWareOpen(false); }}>{l.name}</button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="relative">
            <button className={classic ? "topbar-ctrl rounded-md border p-2" : "rounded-xl border border-[var(--border)] p-2 text-[var(--muted)]"} title={tr("quickAdd")} onClick={() => setQuick((v) => !v)}>
              <Plus size={16} />
            </button>
            {quick ? (
              <div className="topbar-menu absolute end-0 z-50 mt-2 min-w-[200px] w-max overflow-visible rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-xl">
                {can("sales.create") ? <button className="block w-full px-3 py-2 text-start text-sm hover:bg-slate-50" onClick={() => { setQuick(false); nav("/pos"); }}>{tr("pos")}</button> : null}
                {can("purchases.create") ? <button className="block w-full px-3 py-2 text-start text-sm hover:bg-slate-50" onClick={() => { setQuick(false); nav("/purchases/new"); }}>{tr("purchases")}</button> : null}
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
          <button className={`${classic ? "topbar-ctrl rounded-md border p-2" : "rounded-xl border p-2"} ${isFav(loc.pathname) ? "border-amber-300 text-amber-500" : classic ? "" : "border-[var(--border)] text-[var(--muted)]"}`} title={tr("favorites")} onClick={() => setFavs(toggleFav({ to: loc.pathname, key: pageKey }))}>
            <Star size={16} fill={isFav(loc.pathname) ? "currentColor" : "none"} />
          </button>
          <button className={`hidden sm:inline-flex ${classic ? "topbar-ctrl rounded-md border p-2" : "rounded-xl border border-[var(--border)] p-2 text-[var(--muted)]"}`} title={tr("print")} onClick={() => window.print()}>
            <Printer size={16} />
          </button>
          <button className={`hidden sm:inline-flex ${classic ? "topbar-ctrl rounded-md border p-2" : "rounded-xl border border-[var(--border)] p-2 text-[var(--muted)]"}`} title={tr("fullscreen")} onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen();
            else document.documentElement.requestFullscreen().catch(() => {});
          }}>
            <Maximize2 size={16} />
          </button>
          <ThemeSwitcher />
          <button className={classic ? "topbar-ctrl rounded-md border p-2" : "rounded-xl border border-[var(--border)] p-2 text-[var(--muted)]"} title={theme === "dark" ? tr("lightMode") : tr("darkMode")} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className={classic ? "topbar-ctrl rounded-md border px-3 py-2 text-sm font-bold" : "rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-bold"} onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
            {tr("language")}
          </button>
          </div>
          <div className="relative">
            <button className={`relative ${classic ? "topbar-ctrl rounded-md border p-2" : "rounded-xl border border-[var(--border)] p-2"}`} onClick={() => { setBell((v) => !v); void inbox.load(); }}>
              <Bell size={16} />
              {unread ? <span className="absolute -top-1 -end-1 h-4 min-w-4 rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread}</span> : null}
            </button>
            {bell ? (
              <div className="topbar-menu absolute end-0 z-50 mt-2 min-w-[200px] w-max overflow-visible rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-xl">
                <div className="flex items-center justify-between px-3 py-2 text-sm font-bold">
                  {tr("notifications")}
                  <button className="text-xs text-cyan-700" onClick={() => void inbox.markAllRead()}>
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
                  {!shownNotes.length ? <div className="px-3 py-6 text-center text-sm text-slate-400">{tr("noData")}</div> : null}
                  {shownNotes.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      className={`block w-full border-t border-slate-100 px-3 py-2 text-start text-sm ${n.read_at ? "opacity-60" : ""}`}
                      onClick={async () => {
                        if (!n.read_at) await inbox.markRead(n.id);
                        setBell(false);
                        if (n.action_url) nav(n.action_url);
                      }}
                    >
                      <div className="font-bold">{lang === "ar" ? n.title_ar : n.title_en}</div>
                      <div className="text-slate-500">{lang === "ar" ? n.body_ar : n.body_en}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={`relative z-40 md:hidden ${classic ? "topbar-ctrl rounded-md border p-2" : "rounded-xl border border-[var(--border)] p-2"}`}
            title={tr("more")}
            onClick={() => {
              setBell(false);
              setCmd(false);
              if (pos) {
                setMore(false);
                openMenu();
                return;
              }
              setMore((v) => !v);
            }}
          >
            <MoreVertical size={16} />
          </button>
          <div className={`items-center gap-2 ${pos ? "hidden" : "hidden md:flex"}`}>
            <div className="text-end text-sm">
              <div className="font-bold leading-5">{user?.full_name}</div>
              <div className="text-xs capitalize text-slate-400">{user?.role_slug}</div>
            </div>
            <button
              className={classic ? "topbar-ctrl rounded-md border p-2" : "rounded-xl border border-[var(--border)] p-2"}
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
          <div className={`px-3 py-2 text-sm font-bold max-md:truncate max-md:py-1.5 max-md:text-xs ${gps.status === "live" ? "bg-emerald-50 text-emerald-800" : gps.status === "denied" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>
            {gps.err ? apiMessage(tr, { message: gps.err }) : gps.status === "live" ? tr("gpsLive") : gps.status === "skipped" ? tr("gpsNoOrders") : gps.status === "paused" ? tr("gpsPaused") : gps.status === "denied" ? tr("gpsNeedPermission") : tr("waitingGps")}
          </div>
        ) : null}
        {classicDesk ? null : classic ? <SahlMenu /> : pos ? <div className="max-lg:hidden"><ModernModules /></div> : <ModernModules />}
        <main className={classicDesk || pos ? "app-main sahl-pos-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" : classic && loc.pathname === "/" ? "app-main easy-main" : "app-main p-4 md:p-6"}>
          <Outlet />
        </main>
      </div>
      <CommandPalette open={cmd} onOpen={() => setCmd(true)} onClose={() => setCmd(false)} />
      {more ? (
        <div className="fixed inset-0 z-[70] md:hidden">
          <button type="button" className="absolute inset-0 bg-black/45" aria-label={tr("close")} onPointerDown={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-[var(--surface)] p-3 pb-[max(1rem,env(safe-area-inset-bottom))] text-[var(--text)] shadow-2xl">
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="text-sm font-black">{tr("more")}</div>
              <button type="button" className="rounded-lg p-2" onClick={() => setMore(false)} aria-label={tr("close")}>
                <X size={18} />
              </button>
            </div>
            <button type="button" className="block w-full rounded-xl px-3 py-3 text-start text-sm font-bold hover:bg-slate-50" onClick={() => { setMore(false); setLang(lang === "ar" ? "en" : "ar"); }}>{tr("language")}</button>
            <button type="button" className="block w-full rounded-xl px-3 py-3 text-start text-sm font-bold hover:bg-slate-50" onClick={() => { setMore(false); setTheme(theme === "dark" ? "light" : "dark"); }}>{theme === "dark" ? tr("lightMode") : tr("darkMode")}</button>
            <button type="button" className="block w-full rounded-xl px-3 py-3 text-start text-sm font-bold hover:bg-slate-50" onClick={() => { setMore(false); setFavs(toggleFav({ to: loc.pathname, key: pageKey })); }}>{tr("favorites")}</button>
            {can("sales.create") ? <button type="button" className="block w-full rounded-xl px-3 py-3 text-start text-sm font-bold hover:bg-slate-50" onClick={() => { setMore(false); nav("/pos"); }}>{tr("pos")}</button> : null}
            <button
              type="button"
              className="block w-full rounded-xl px-3 py-3 text-start text-sm font-bold text-rose-700 hover:bg-rose-50"
              onClick={async () => {
                setMore(false);
                await logout();
                nav("/login");
              }}
            >
              {tr("logout")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
