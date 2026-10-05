import { Component, lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Database, FileText, MapPin, Settings2, Shield, Store } from "lucide-react";
import { Link } from "react-router-dom";
import { useApp } from "../context";
import { get, post, put, del } from "../lib/api";
import { Btn, Field, Modal, PageLoading, PrintLetterhead, Switch, inputCls } from "../components/ui";
import { ActionBtns, useConfirm } from "../components/Confirm";
import { authHeaders } from "../lib/session";
import { parseMapsCoords, looksLikeMapsUrl, isShortMapsUrl, formatMapsCoord } from "../lib/maps";

const OsmMap = lazy(() => import("../components/OsmMap").then((m) => ({ default: m.OsmMap })));

class SettingsErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm font-bold text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
          تعذر فتح الإعدادات. حدّث الصفحة.
        </div>
      );
    }
    return this.props.children;
  }
}

const BOOL_KEYS = [
  "tax_enabled",
  "whatsapp_enabled",
  "sound_enabled",
  "allow_negative_stock",
  "use_last_customer_price",
  "auto_backup_on_login",
] as const;

const DELIVERY_PRESETS = [
  { value: "30 دقيقة", key: "delivery30m" as const },
  { value: "ساعة", key: "delivery1h" as const },
  { value: "ساعتان", key: "delivery2h" as const },
  { value: "4 ساعات", key: "delivery4h" as const },
  { value: "نفس اليوم", key: "deliverySameDay" as const },
  { value: "اليوم التالي", key: "deliveryNextDay" as const },
];

const RADIUS_PRESETS = [200, 500, 1000, 2000, 3000, 5000];

type Tab = "general" | "sales" | "location" | "data" | "account";

function isOn(value: string | undefined, fallback = false) {
  if (value == null || value === "") return fallback;
  return value === "1" || value.toLowerCase() === "true" || value === "yes";
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm md:p-5">
      <h3 className="text-base font-black text-[var(--text)]">{title}</h3>
      {hint ? <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{hint}</p> : null}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function MiniTable({ cols, rows }: { cols: ReactNode[]; rows: ReactNode[][] }) {
  const { tr } = useApp();
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>{cols.map((c, i) => <th key={i}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={cols.length} className="py-8 text-center text-slate-400">{tr("noData")}</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AccountPanel() {
  const { tr, can, user } = useApp();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [accMsg, setAccMsg] = useState("");
  const [accErr, setAccErr] = useState("");
  const [form, setForm] = useState({ id: 0, username: "", full_name: "", phone: "", role_id: 2, active: 1, password: "" });
  const { confirmDelete, dialog } = useConfirm();

  async function loadAccounts() {
    if (!can("users.manage")) return;
    const [users, roleRes] = await Promise.all([
      get<{ data: any[] }>("/api/users"),
      get<{ roles: any[] }>("/api/roles"),
    ]);
    setAccounts(users.data || []);
    setRoles(roleRes.roles || []);
  }
  useEffect(() => { loadAccounts().catch(() => {}); }, []);

  return (
    <div className="space-y-4">
      {dialog}
      <Card title={tr("changePassword")}>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label={tr("currentPassword")}>
            <input className={inputCls} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label={tr("newPassword")}>
            <input className={inputCls} type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label={tr("confirmPassword")}>
            <input className={inputCls} type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        {pwErr ? <div className="text-sm text-rose-600">{pwErr}</div> : null}
        {pwMsg ? <div className="text-sm font-bold text-emerald-700">{pwMsg}</div> : null}
        <Btn onClick={async () => {
          setPwErr("");
          setPwMsg("");
          if (!current || !next) return;
          if (next !== confirmPw) { setPwErr(tr("passwordMismatch")); return; }
          try {
            await post("/api/auth/password", { current, next });
            setCurrent(""); setNext(""); setConfirmPw("");
            setPwMsg(tr("passwordChanged"));
          } catch (e) {
            setPwErr((e as Error).message === "invalid_current" ? tr("invalidCurrent") : (e as Error).message);
          }
        }}>{tr("save")}</Btn>
      </Card>

      {can("users.manage") ? (
        <Card title={tr("employeeAccounts")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link to="/users" className="text-sm font-bold text-cyan-700 hover:underline">{tr("manageUsersPage")}</Link>
            <Btn onClick={() => {
              setAccErr(""); setAccMsg("");
              setForm({ id: 0, username: "", full_name: "", phone: "", role_id: roles[0]?.id || 2, active: 1, password: "" });
              setOpen(true);
            }}>{tr("add")}</Btn>
          </div>
          {accMsg ? <div className="text-sm font-bold text-emerald-700">{accMsg}</div> : null}
          <MiniTable
            cols={[tr("username"), tr("name"), tr("phone"), tr("role"), tr("status"), ""]}
            rows={accounts.map((u) => [
              u.username,
              u.full_name,
              u.phone || "—",
              u.role_name_ar,
              u.active ? tr("active") : tr("inactive"),
              <ActionBtns
                key={u.id}
                canEdit
                canDelete={u.id !== user?.id}
                onEdit={() => {
                  setAccErr(""); setAccMsg("");
                  setForm({ id: u.id, username: u.username, full_name: u.full_name || "", phone: u.phone || "", role_id: u.role_id, active: u.active ? 1 : 0, password: "" });
                  setOpen(true);
                }}
                onDelete={() => confirmDelete(u.username, async () => { await del(`/api/users/${u.id}`); await loadAccounts(); })}
              />,
            ])}
          />
          <Modal open={open} title={form.id ? tr("edit") : tr("add")} onClose={() => setOpen(false)}>
            <div className="grid gap-3">
              <Field label={tr("username")}>
                <input className={inputCls} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </Field>
              <Field label={tr("name")}>
                <input className={inputCls} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </Field>
              <Field label={tr("phone")}>
                <input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label={tr("role")}>
                <select className={inputCls} value={form.role_id} onChange={(e) => setForm({ ...form, role_id: Number(e.target.value) })}>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name_ar}</option>)}
                </select>
              </Field>
              <Field label={tr("password")}>
                <input className={inputCls} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={form.id ? tr("leaveBlankPassword") : ""} />
              </Field>
              {form.id && form.id !== user?.id ? (
                <Switch
                  label={tr("active")}
                  checked={form.active === 1}
                  onChange={(v) => setForm({ ...form, active: v ? 1 : 0 })}
                />
              ) : null}
              {accErr ? <div className="text-sm text-rose-600">{accErr}</div> : null}
              <Btn onClick={async () => {
                setAccErr("");
                if (!form.username.trim() || !form.full_name.trim()) return;
                if (!form.id && !form.password) { setAccErr(tr("newPassword")); return; }
                try {
                  if (form.id) {
                    const body: Record<string, unknown> = { username: form.username.trim(), full_name: form.full_name.trim(), phone: form.phone, role_id: form.role_id, active: form.active };
                    if (form.password) body.password = form.password;
                    await put(`/api/users/${form.id}`, body);
                  } else {
                    await post("/api/users", { username: form.username.trim(), full_name: form.full_name.trim(), phone: form.phone, role_id: form.role_id, password: form.password });
                  }
                  setOpen(false);
                  setAccMsg(tr("accountSaved"));
                  await loadAccounts();
                } catch (e) {
                  setAccErr((e as Error).message === "username_taken" ? tr("usernameTaken") : (e as Error).message);
                }
              }}>{tr("save")}</Btn>
            </div>
          </Modal>
        </Card>
      ) : null}
    </div>
  );
}

export function SettingsPage() {
  return (
    <SettingsErrorBoundary>
      <SettingsBody />
    </SettingsErrorBoundary>
  );
}

function SettingsBody() {
  const { tr, settings, refreshSettings, refreshLookups, lang, can } = useApp();
  const [tab, setTab] = useState<Tab>("general");
  const [form, setForm] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<any[]>([]);
  const [backs, setBacks] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [demo, setDemo] = useState<{ active?: boolean; products?: number; customers?: number; invoices?: number }>({});
  const [restoreOnImport, setRestoreOnImport] = useState(true);
  const [impKind, setImpKind] = useState("products");
  const [impCsv, setImpCsv] = useState("");
  const [impPreview, setImpPreview] = useState<any>(null);
  const [impResult, setImpResult] = useState<any>(null);
  const [customDelivery, setCustomDelivery] = useState(false);
  const [customRadius, setCustomRadius] = useState(false);
  const [mapsLink, setMapsLink] = useState("");
  const [mapsZoom, setMapsZoom] = useState(17);
  const [mapsErr, setMapsErr] = useState("");
  const { confirm, dialog } = useConfirm();
  const canBackup = can("backup.manage") || can("settings.edit");
  const canEdit = can("settings.edit");

  const deliveryPreset = !customDelivery && DELIVERY_PRESETS.some((p) => p.value === (form.default_delivery_time || ""));
  const radiusValue = Number(form.geofence_meters || 1000);
  const radiusPreset = !customRadius && RADIUS_PRESETS.includes(radiusValue);

  const tabs = useMemo(() => [
    { id: "general" as const, label: tr("general"), hint: tr("settingsHintGeneral"), icon: Store },
    { id: "sales" as const, label: tr("settingsSales"), hint: tr("settingsHintSales"), icon: FileText },
    { id: "location" as const, label: tr("settingsLocation"), hint: tr("settingsHintLocation"), icon: MapPin },
    { id: "data" as const, label: tr("settingsData"), hint: tr("settingsHintData"), icon: Database },
    { id: "account" as const, label: tr("settingsAccount"), hint: tr("settingsHintAccount"), icon: Shield },
  ], [tr]);

  async function loadBackups() {
    if (!canBackup) return;
    const r = await get<{ data: any[]; files: any[] }>("/api/backup");
    setBacks(r.files || r.data || []);
  }
  async function loadDemo() {
    if (!canBackup) return;
    setDemo(await get("/api/backup/demo"));
  }
  async function downloadNamed(filename: string) {
    const res = await fetch(`/api/backup/${filename}`, { credentials: "include", headers: authHeaders() });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function setField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  function setBool(key: string, value: boolean) {
    setForm((prev) => ({ ...prev, [key]: value ? "1" : "0" }));
  }

  async function applyMapsLink(raw: string) {
    setMapsLink(raw);
    setMapsErr("");
    const text = raw.trim();
    if (!text) return;
    const short = isShortMapsUrl(text);
    if (!short) {
      const local = parseMapsCoords(text);
      if (local) {
        setForm((prev) => ({ ...prev, workplace_lat: formatMapsCoord(local.lat), workplace_lng: formatMapsCoord(local.lng) }));
        setMapsZoom(17);
        return;
      }
    }
    if (!looksLikeMapsUrl(text) && !/^https?:\/\//i.test(text)) return;
    try {
      const r = await get<{ lat: number; lng: number; error?: string }>(`/api/settings/maps-coords?url=${encodeURIComponent(text)}`);
      if (r.lat != null && r.lng != null) {
        setForm((prev) => ({ ...prev, workplace_lat: formatMapsCoord(r.lat), workplace_lng: formatMapsCoord(r.lng) }));
        setMapsZoom(17);
      } else {
        setMapsErr(tr("mapsLinkInvalid"));
      }
    } catch {
      setMapsErr(tr("mapsLinkInvalid"));
    }
  }

  async function saveSettings() {
    if (!canEdit) return;
    setSaving(true);
    setMsg("");
    try {
      const payload: Record<string, string> = { ...form };
      for (const key of BOOL_KEYS) {
        payload[key] = isOn(payload[key], key === "sound_enabled" || key === "auto_backup_on_login") ? "1" : "0";
      }
      await put("/api/settings", payload);
      refreshSettings();
      setMsg(tr("settingsSaved"));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    setForm(settings);
    setCustomDelivery(!DELIVERY_PRESETS.some((p) => p.value === (settings.default_delivery_time || "")));
    setCustomRadius(!RADIUS_PRESETS.includes(Number(settings.geofence_meters || 0)));
    get<{ templates: any[] }>("/api/settings").then((r) => setTemplates(r.templates || []));
    loadBackups().catch(() => {});
    loadDemo().catch(() => {});
  }, [settings]);

  const showSave = tab === "general" || tab === "sales" || tab === "location";

  return (
    <div>
      <PrintLetterhead title={tr("settings")} />
      {dialog}
      <div className="mb-5 flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-2xl bg-cyan-500/15 text-cyan-700">
          <Settings2 size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-[var(--text)]">{tr("settings")}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{tabs.find((t) => t.id === tab)?.hint}</p>
        </div>
      </div>

      {msg ? <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">{msg}</div> : null}

      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav className="no-print flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => { setTab(item.id); setMsg(""); }}
                className={`flex min-w-[9.5rem] items-center gap-2 rounded-2xl border px-3 py-2.5 text-start text-sm font-extrabold transition ${
                  active
                    ? "border-cyan-400 bg-cyan-50 text-cyan-800 dark:border-cyan-500/50 dark:bg-cyan-500/15 dark:text-cyan-100"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-cyan-200"
                }`}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-4 pb-24">
          {tab === "general" ? (
            <Card title={tr("general")} hint={tr("settingsHintGeneral")}>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="store_name">
                  <input className={inputCls} value={form.store_name ?? ""} onChange={(e) => setField("store_name", e.target.value)} />
                </Field>
                <Field label="store_name_ar">
                  <input className={inputCls} value={form.store_name_ar ?? ""} onChange={(e) => setField("store_name_ar", e.target.value)} />
                </Field>
                <Field label="store_phone">
                  <input className={inputCls} inputMode="tel" value={form.store_phone ?? ""} onChange={(e) => setField("store_phone", e.target.value)} />
                </Field>
                <Field label="store_address">
                  <input className={inputCls} value={form.store_address ?? ""} onChange={(e) => setField("store_address", e.target.value)} />
                </Field>
              </div>
              <Field label="storeLogo">
                <div className="flex flex-wrap items-center gap-3">
                  {form.logo_url ? <img src={form.logo_url} alt="" className="h-16 w-16 rounded-xl border border-[var(--border)] object-contain" /> : null}
                  <input
                    type="file"
                    accept="image/*"
                    className="text-sm"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      const fd = new FormData();
                      fd.append("file", file);
                      const res = await fetch("/api/uploads", { method: "POST", credentials: "include", headers: authHeaders(), body: fd });
                      const data = await res.json().catch(() => ({}));
                      if (res.ok && data.url) setField("logo_url", data.url);
                    }}
                  />
                </div>
              </Field>
              <Switch label={tr("taxEnabled")} checked={isOn(form.tax_enabled)} onChange={(v) => setBool("tax_enabled", v)} />
              {isOn(form.tax_enabled) ? (
                <Field label="taxRate">
                  <input className={inputCls} type="number" min={0} max={100} step="0.01" value={form.tax_rate ?? ""} onChange={(e) => setField("tax_rate", e.target.value)} />
                </Field>
              ) : null}
              <Switch label={tr("soundEnabled")} checked={isOn(form.sound_enabled, true)} onChange={(v) => setBool("sound_enabled", v)} />
            </Card>
          ) : null}

          {tab === "sales" ? (
            <>
              <Card title={tr("settingsSales")} hint={tr("settingsHintSales")}>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="invoice_prefix">
                    <input className={inputCls} value={form.invoice_prefix ?? ""} onChange={(e) => setField("invoice_prefix", e.target.value)} />
                  </Field>
                  <Field label="usd_egp_rate">
                    <input className={inputCls} type="number" min={0} step="0.01" value={form.usd_egp_rate ?? ""} onChange={(e) => setField("usd_egp_rate", e.target.value)} />
                  </Field>
                  <Field label="default_delivery_time">
                    <select
                      className={inputCls}
                      value={deliveryPreset ? form.default_delivery_time : "__custom__"}
                      onChange={(e) => {
                        if (e.target.value === "__custom__") {
                          setCustomDelivery(true);
                          return;
                        }
                        setCustomDelivery(false);
                        setField("default_delivery_time", e.target.value);
                      }}
                    >
                      {DELIVERY_PRESETS.map((p) => <option key={p.value} value={p.value}>{tr(p.key)}</option>)}
                      <option value="__custom__">{tr("deliveryCustom")}</option>
                    </select>
                  </Field>
                  {!deliveryPreset ? (
                    <Field label={tr("deliveryCustom")}>
                      <input className={inputCls} value={form.default_delivery_time ?? ""} onChange={(e) => setField("default_delivery_time", e.target.value)} />
                    </Field>
                  ) : null}
                </div>
                <Field label="invoice_header">
                  <textarea className={`${inputCls} min-h-24`} value={form.invoice_header ?? ""} onChange={(e) => setField("invoice_header", e.target.value)} />
                </Field>
                <Field label="invoice_footer">
                  <textarea className={`${inputCls} min-h-24`} value={form.invoice_footer ?? ""} onChange={(e) => setField("invoice_footer", e.target.value)} />
                </Field>
                <div>
                  <div className="mb-2 text-sm font-extrabold">{tr("priceAliases")}</div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label="price_2_name">
                      <input className={inputCls} value={form.price_2_name ?? ""} onChange={(e) => setField("price_2_name", e.target.value)} />
                    </Field>
                    <Field label="price_3_name">
                      <input className={inputCls} value={form.price_3_name ?? ""} onChange={(e) => setField("price_3_name", e.target.value)} />
                    </Field>
                    <Field label="price_4_name">
                      <input className={inputCls} value={form.price_4_name ?? ""} onChange={(e) => setField("price_4_name", e.target.value)} />
                    </Field>
                  </div>
                </div>
                <Switch label={tr("useLastPrice")} checked={isOn(form.use_last_customer_price)} onChange={(v) => setBool("use_last_customer_price", v)} />
                <Switch label={tr("allowNegative")} checked={isOn(form.allow_negative_stock)} onChange={(v) => setBool("allow_negative_stock", v)} />
                <Switch label={tr("whatsappEnabled")} checked={isOn(form.whatsapp_enabled)} onChange={(v) => setBool("whatsapp_enabled", v)} />
              </Card>
              <Card title={tr("waTemplates")}>
                {templates.map((t) => (
                  <div key={t.code} className="rounded-xl border border-[var(--border)] p-3">
                    <div className="font-bold">{t.code}</div>
                    <textarea
                      className={`${inputCls} mt-2 min-h-28`}
                      value={lang === "ar" ? t.body_ar : t.body_en}
                      onChange={(e) => setTemplates(templates.map((x) => x.code === t.code ? { ...x, [lang === "ar" ? "body_ar" : "body_en"]: e.target.value } : x))}
                    />
                    {canEdit ? <Btn kind="ghost" className="mt-2" onClick={async () => { await put(`/api/settings/whatsapp-templates/${t.code}`, t); setMsg(tr("saved")); }}>{tr("save")}</Btn> : null}
                  </div>
                ))}
              </Card>
            </>
          ) : null}

          {tab === "location" ? (
            <Card title={tr("settingsLocation")} hint={tr("pickOnMap")}>
              <Field label={tr("mapsLink")}>
                <input
                  className={inputCls}
                  value={mapsLink}
                  placeholder="https://maps.google.com/..."
                  onChange={(e) => applyMapsLink(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData("text");
                    if (pasted) {
                      e.preventDefault();
                      applyMapsLink(pasted);
                    }
                  }}
                />
              </Field>
              <p className="text-xs font-bold text-slate-500">{tr("mapsLinkHint")}</p>
              {mapsErr ? <p className="text-xs font-bold text-rose-600">{mapsErr}</p> : null}
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="workplace_lat">
                  <input className={inputCls} type="number" step="any" value={form.workplace_lat ?? ""} onChange={(e) => setField("workplace_lat", e.target.value)} />
                </Field>
                <Field label="workplace_lng">
                  <input className={inputCls} type="number" step="any" value={form.workplace_lng ?? ""} onChange={(e) => setField("workplace_lng", e.target.value)} />
                </Field>
                <Field label="geofence_meters">
                    <select
                    className={inputCls}
                    value={radiusPreset ? String(radiusValue) : "__custom__"}
                    onChange={(e) => {
                      if (e.target.value === "__custom__") {
                        setCustomRadius(true);
                        return;
                      }
                      setCustomRadius(false);
                      setField("geofence_meters", e.target.value);
                    }}
                  >
                    {RADIUS_PRESETS.map((n) => <option key={n} value={n}>{n} م</option>)}
                    <option value="__custom__">{tr("settingsCustom")}</option>
                  </select>
                </Field>
              </div>
              {!radiusPreset ? (
                <Field label={tr("geofence")}>
                  <input className={inputCls} type="number" min={50} step={50} value={form.geofence_meters ?? ""} onChange={(e) => setField("geofence_meters", e.target.value)} />
                </Field>
              ) : null}
              <p className="text-xs text-slate-500">{tr("geofenceHint")}</p>
              <div className="no-print overflow-hidden rounded-2xl border border-[var(--border)]">
                <Suspense fallback={<PageLoading />}>
                  <OsmMap
                    center={{ lat: Number(form.workplace_lat || 30.0566), lng: Number(form.workplace_lng || 31.33) }}
                    shop={{ lat: Number(form.workplace_lat || 30.0566), lng: Number(form.workplace_lng || 31.33) }}
                    geofence={Number(form.geofence_meters || 100)}
                    height={320}
                    zoom={mapsZoom}
                    onPick={(lat, lng) => setForm((prev) => ({ ...prev, workplace_lat: formatMapsCoord(lat), workplace_lng: formatMapsCoord(lng) }))}
                  />
                </Suspense>
              </div>
            </Card>
          ) : null}

          {tab === "data" ? (
            <>
              {can("import.manage") ? (
                <Card title={tr("importCsv")} hint={tr("importHint")}>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label={tr("importKind")}>
                      <select className={inputCls} value={impKind} onChange={(e) => { setImpKind(e.target.value); setImpPreview(null); setImpResult(null); }}>
                        <option value="products">{tr("products")}</option>
                        <option value="customers">{tr("customers")}</option>
                        <option value="suppliers">{tr("suppliers")}</option>
                      </select>
                    </Field>
                    <Field label={tr("csvFile")}>
                      <input className={inputCls} type="file" accept=".csv,text/csv" onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        f.text().then((t) => { setImpCsv(t); setImpPreview(null); setImpResult(null); });
                      }} />
                    </Field>
                  </div>
                  <textarea className={`${inputCls} min-h-32 font-mono text-xs`} value={impCsv} onChange={(e) => setImpCsv(e.target.value)} placeholder={impKind === "products" ? "sku,name_ar,name_en,selling_price,color,quality" : "name,phone,city"} />
                  <div className="flex flex-wrap gap-2">
                    <Btn kind="soft" disabled={!impCsv.trim()} onClick={async () => {
                      setImpResult(null);
                      setImpPreview(await post("/api/import/preview", { kind: impKind, csv: impCsv }));
                    }}>{tr("preview")}</Btn>
                    <Btn disabled={!impPreview || !impPreview.valid} onClick={async () => {
                      setImpResult(await post("/api/import/commit", { kind: impKind, csv: impCsv }));
                    }}>{tr("commitImport")}</Btn>
                  </div>
                  {impPreview ? (
                    <div className="text-sm">
                      {tr("csvPreview")}: {impPreview.valid}/{impPreview.total} — {tr("skipped")}: {impPreview.invalid}
                      <div className="table-wrap mt-2">
                        <table>
                          <thead><tr><th>#</th>{(impPreview.headers || []).map((h: string) => <th key={h}>{h}</th>)}<th>{tr("status")}</th></tr></thead>
                          <tbody>
                            {(impPreview.preview || []).map((r: any) => (
                              <tr key={r.line}>
                                <td>{r.line}</td>
                                {(impPreview.headers || []).map((h: string) => <td key={h}>{r.row?.[h]}</td>)}
                                <td>{r.ok ? "✓" : (r.errors || []).join(",")}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                  {impResult ? <div className="text-sm font-bold">{tr("imported")}: {impResult.inserted} · {tr("skipped")}: {impResult.skipped}</div> : null}
                </Card>
              ) : null}

              {canBackup ? (
                <>
                  <Card title={tr("demoData")} hint={tr("demoDataHint")}>
                    {demo.active ? (
                      <div className="text-sm font-bold text-amber-700">
                        {tr("demoActive")} — {tr("products")} {demo.products || 0} · {tr("customers")} {demo.customers || 0} · {tr("sales")} {demo.invoices || 0}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Btn disabled={busy} onClick={async () => {
                        setBusy(true);
                        setMsg("");
                        try {
                          const r = await post<{ already?: boolean }>("/api/backup/demo", {});
                          setMsg(r.already ? tr("demoAlready") : tr("demoAdded"));
                          await loadDemo();
                          await refreshLookups();
                        } catch (e) {
                          setMsg((e as Error).message || tr("error"));
                        } finally {
                          setBusy(false);
                        }
                      }}>{tr("addDemoData")}</Btn>
                      <Btn kind="danger" disabled={busy || !demo.active} onClick={() => confirm(tr("clearDemoData"), tr("demoClearConfirm"), async () => {
                        setBusy(true);
                        setMsg("");
                        try {
                          await post("/api/backup/demo/clear", { confirm: true });
                          setMsg(tr("demoCleared"));
                          await loadDemo();
                          await refreshLookups();
                        } finally {
                          setBusy(false);
                        }
                      })}>{tr("clearDemoData")}</Btn>
                    </div>
                  </Card>

                  <Card title={tr("backup")} hint={tr("importFileHint")}>
                    <Switch
                      label={tr("autoBackupOnLogin")}
                      checked={isOn(form.auto_backup_on_login, true)}
                      onChange={async (v) => {
                        const next = v ? "1" : "0";
                        setBool("auto_backup_on_login", v);
                        await put("/api/settings", { ...form, auto_backup_on_login: next });
                        refreshSettings();
                      }}
                    />
                    <Switch label={tr("importRestoreNow")} checked={restoreOnImport} onChange={setRestoreOnImport} />
                    <div className="flex flex-wrap gap-2">
                      <Btn disabled={busy} onClick={async () => {
                        setBusy(true);
                        setMsg("");
                        try {
                          const r = await post<{ filename: string }>("/api/backup", {});
                          await loadBackups();
                          if (r.filename) await downloadNamed(r.filename);
                          setMsg(tr("backupExported"));
                        } finally {
                          setBusy(false);
                        }
                      }}>{tr("exportBackup")}</Btn>
                      <label className="ui-btn inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm font-bold">
                        {tr("importBackup")}
                        <input
                          className="hidden"
                          type="file"
                          accept=".sql,application/sql,text/plain"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (!file) return;
                            const go = async () => {
                              setBusy(true);
                              setMsg("");
                              try {
                                const fd = new FormData();
                                fd.append("file", file);
                                fd.append("restore", restoreOnImport ? "1" : "0");
                                fd.append("confirm", restoreOnImport ? "1" : "0");
                                const res = await fetch("/api/backup/import", { method: "POST", credentials: "include", headers: authHeaders(), body: fd });
                                const data = await res.json().catch(() => ({}));
                                if (!res.ok) {
                                  setMsg(data.error === "not_sqlite" ? tr("notSqlite") : (data.error || tr("error")));
                                  return;
                                }
                                setMsg(tr("backupImported"));
                                await loadBackups();
                                await loadDemo();
                                if (data.restored) window.location.reload();
                              } finally {
                                setBusy(false);
                              }
                            };
                            if (restoreOnImport) confirm(tr("importBackup"), tr("restoreConfirm"), go);
                            else void go();
                          }}
                        />
                      </label>
                    </div>
                    <MiniTable
                      cols={[tr("name"), tr("amount"), ""]}
                      rows={backs.map((b: any) => [
                        b.filename,
                        b.size_bytes ? `${Math.round(b.size_bytes / 1024)} KB` : "",
                        <div className="flex flex-wrap gap-3">
                          <button className="font-bold text-cyan-700" onClick={() => downloadNamed(b.filename)}>{tr("downloadBackup")}</button>
                          <button className="font-bold text-rose-700" onClick={() => confirm(tr("restoreBackup"), tr("restoreConfirm"), async () => {
                            await post(`/api/backup/${b.filename}/restore`, { confirm: true });
                            window.location.reload();
                          })}>{tr("restoreBackup")}</button>
                        </div>,
                      ])}
                    />
                  </Card>
                </>
              ) : null}
            </>
          ) : null}

          {tab === "account" ? <AccountPanel /> : null}
        </div>
      </div>

      {showSave && canEdit ? (
        <div className="no-print sticky bottom-3 z-20 mt-4 flex justify-end">
          <Btn disabled={saving} onClick={saveSettings}>{saving ? tr("loading") : tr("save")}</Btn>
        </div>
      ) : null}
    </div>
  );
}
