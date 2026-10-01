import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Warehouse,
  Truck,
  Users,
  FileText,
  Settings,
  Boxes,
  Tags,
  Smartphone,
  MapPin,
  ClipboardList,
  Wallet,
  BarChart3,
  Shield,
  ScrollText,
  Banknote,
  UserRound,
  Clock3,
  WalletCards,
  CalendarDays,
  AlarmClock,
  Radio,
  ArrowRightLeft,
  ListChecks,
  Target,
  BookOpen,
  Landmark,
  Hash,
  Receipt,
  CalendarRange,
} from "lucide-react";
import type { Msg } from "../i18n";

export type NavItem = {
  to: string;
  key: Msg;
  icon: any;
  perm: string;
  agentOnly?: boolean;
};

export type NavGroup = { label: Msg; items: NavItem[] };

export const modernNav: NavGroup[] = [
  {
    label: "salesOps",
    items: [
      { to: "/", key: "dashboard", icon: LayoutDashboard, perm: "dashboard.view" },
      { to: "/pos", key: "pos", icon: ShoppingCart, perm: "sales.create" },
      { to: "/sales", key: "sales", icon: FileText, perm: "sales.view" },
      { to: "/delivery", key: "delivery", icon: Truck, perm: "delivery.view" },
      { to: "/delivery/track", key: "liveTrack", icon: Radio, perm: "delivery.update", agentOnly: true },
      { to: "/reps", key: "reps", icon: UserRound, perm: "reps.view" },
      { to: "/reps/visits", key: "visits", icon: ClipboardList, perm: "visits.own" },
      { to: "/reps/targets", key: "targets", icon: Target, perm: "targets.manage" },
      { to: "/reps/commissions", key: "commissions", icon: Banknote, perm: "reps.view" },
      { to: "/customers", key: "customers", icon: Users, perm: "customers.view" },
      { to: "/price-lists", key: "priceLists", icon: Tags, perm: "prices.view" },
    ],
  },
  {
    label: "hrOps",
    items: [
      { to: "/hr/attendance", key: "attendance", icon: Clock3, perm: "attendance.own" },
      { to: "/hr/employees", key: "employees", icon: UserRound, perm: "hr.view" },
      { to: "/hr/shifts", key: "shifts", icon: AlarmClock, perm: "hr.manage" },
      { to: "/hr/leaves", key: "leaves", icon: CalendarDays, perm: "leaves.own" },
      { to: "/hr/advances", key: "advances", icon: Banknote, perm: "hr.payroll" },
      { to: "/hr/payroll", key: "payroll", icon: WalletCards, perm: "hr.payroll" },
    ],
  },
  {
    label: "stockOps",
    items: [
      { to: "/products", key: "products", icon: Package, perm: "products.view" },
      { to: "/inventory", key: "inventory", icon: Warehouse, perm: "inventory.view" },
      { to: "/batches", key: "batches", icon: Boxes, perm: "inventory.view" },
      { to: "/serials", key: "serials", icon: Hash, perm: "serials.manage" },
      { to: "/purchases", key: "purchases", icon: ClipboardList, perm: "purchases.view" },
      { to: "/suppliers", key: "suppliers", icon: Users, perm: "suppliers.view" },
      { to: "/brands", key: "brands", icon: Tags, perm: "brands.manage" },
      { to: "/part-types", key: "partTypes", icon: Tags, perm: "categories.manage" },
      { to: "/categories", key: "categories", icon: Tags, perm: "categories.manage" },
      { to: "/models", key: "models", icon: Smartphone, perm: "models.manage" },
      { to: "/locations", key: "warehouses", icon: MapPin, perm: "locations.manage" },
      { to: "/transfers", key: "transfers", icon: ArrowRightLeft, perm: "transfers.view" },
      { to: "/stocktake", key: "stocktake", icon: ListChecks, perm: "stocktake.view" },
    ],
  },
  {
    label: "financeOps",
    items: [
      { to: "/expenses", key: "expenses", icon: Wallet, perm: "expenses.view" },
      { to: "/cheques", key: "cheques", icon: Receipt, perm: "cheques.manage" },
      { to: "/installments", key: "installments", icon: CalendarRange, perm: "installments.manage" },
      { to: "/payments", key: "payments", icon: Banknote, perm: "payments.view" },
      { to: "/ledger/cash", key: "cashBanks", icon: Landmark, perm: "ledger.view" },
      { to: "/ledger/vouchers", key: "vouchers", icon: FileText, perm: "vouchers.create" },
      { to: "/ledger/journal", key: "journal", icon: BookOpen, perm: "ledger.view" },
      { to: "/ledger/accounts", key: "chartAccounts", icon: BookOpen, perm: "ledger.view" },
      { to: "/reports", key: "reports", icon: BarChart3, perm: "reports.view" },
    ],
  },
  {
    label: "setupOps",
    items: [
      { to: "/users", key: "users", icon: Shield, perm: "users.view" },
      { to: "/audit", key: "audit", icon: ScrollText, perm: "audit.view" },
      { to: "/audit?tab=approvals", key: "approvals", icon: ClipboardList, perm: "approvals.view" },
      { to: "/settings", key: "settings", icon: Settings, perm: "settings.view" },
    ],
  },
];

export const classicNav: NavGroup[] = [
  { label: "dashboard", items: [{ to: "/", key: "dashboard", icon: LayoutDashboard, perm: "dashboard.view" }] },
  {
    label: "sales",
    items: [
      { to: "/pos", key: "pos", icon: ShoppingCart, perm: "sales.create" },
      { to: "/sales", key: "sales", icon: FileText, perm: "sales.view" },
      { to: "/delivery", key: "delivery", icon: Truck, perm: "delivery.view" },
      { to: "/delivery/track", key: "liveTrack", icon: Radio, perm: "delivery.update", agentOnly: true },
    ],
  },
  { label: "purchases", items: [{ to: "/purchases", key: "purchases", icon: ClipboardList, perm: "purchases.view" }] },
  {
    label: "inventory",
    items: [
      { to: "/inventory", key: "inventory", icon: Warehouse, perm: "inventory.view" },
      { to: "/batches", key: "batches", icon: Boxes, perm: "inventory.view" },
      { to: "/serials", key: "serials", icon: Hash, perm: "serials.manage" },
      { to: "/locations", key: "warehouses", icon: MapPin, perm: "locations.manage" },
    ],
  },
  {
    label: "products",
    items: [
      { to: "/products", key: "products", icon: Package, perm: "products.view" },
      { to: "/brands", key: "brands", icon: Tags, perm: "brands.manage" },
      { to: "/part-types", key: "partTypes", icon: Tags, perm: "categories.manage" },
      { to: "/models", key: "models", icon: Smartphone, perm: "models.manage" },
      { to: "/categories", key: "categories", icon: Tags, perm: "categories.manage" },
    ],
  },
  {
    label: "customers",
    items: [
      { to: "/customers", key: "customers", icon: Users, perm: "customers.view" },
      { to: "/price-lists", key: "priceLists", icon: Tags, perm: "prices.view" },
    ],
  },
  { label: "suppliers", items: [{ to: "/suppliers", key: "suppliers", icon: Users, perm: "suppliers.view" }] },
  {
    label: "reps",
    items: [
      { to: "/reps", key: "reps", icon: UserRound, perm: "reps.view" },
      { to: "/reps/visits", key: "visits", icon: ClipboardList, perm: "visits.own" },
      { to: "/reps/targets", key: "targets", icon: Target, perm: "targets.manage" },
      { to: "/reps/commissions", key: "commissions", icon: Banknote, perm: "reps.view" },
    ],
  },
  { label: "stocktake", items: [{ to: "/stocktake", key: "stocktake", icon: ListChecks, perm: "stocktake.view" }] },
  { label: "transfers", items: [{ to: "/transfers", key: "transfers", icon: ArrowRightLeft, perm: "transfers.view" }] },
  { label: "employees", items: [{ to: "/hr/employees", key: "employees", icon: UserRound, perm: "hr.view" }] },
  {
    label: "hrOps",
    items: [
      { to: "/hr/attendance", key: "attendance", icon: Clock3, perm: "attendance.own" },
      { to: "/hr/shifts", key: "shifts", icon: AlarmClock, perm: "hr.manage" },
      { to: "/hr/leaves", key: "leaves", icon: CalendarDays, perm: "leaves.own" },
      { to: "/hr/advances", key: "advances", icon: Banknote, perm: "hr.payroll" },
    ],
  },
  { label: "payroll", items: [{ to: "/hr/payroll", key: "payroll", icon: WalletCards, perm: "hr.payroll" }] },
  {
    label: "journal",
    items: [
      { to: "/ledger/journal", key: "journal", icon: BookOpen, perm: "ledger.view" },
      { to: "/ledger/accounts", key: "chartAccounts", icon: BookOpen, perm: "ledger.view" },
      { to: "/ledger/vouchers", key: "vouchers", icon: FileText, perm: "vouchers.create" },
      { to: "/expenses", key: "expenses", icon: Wallet, perm: "expenses.view" },
      { to: "/payments", key: "payments", icon: Banknote, perm: "payments.view" },
      { to: "/cheques", key: "cheques", icon: Receipt, perm: "cheques.manage" },
      { to: "/installments", key: "installments", icon: CalendarRange, perm: "installments.manage" },
    ],
  },
  { label: "cashBanks", items: [{ to: "/ledger/cash", key: "cashBanks", icon: Landmark, perm: "ledger.view" }] },
  { label: "reports", items: [{ to: "/reports", key: "reports", icon: BarChart3, perm: "reports.view" }] },
  {
    label: "settings",
    items: [
      { to: "/users", key: "users", icon: Shield, perm: "users.view" },
      { to: "/audit", key: "audit", icon: ScrollText, perm: "audit.view" },
      { to: "/audit?tab=approvals", key: "approvals", icon: ClipboardList, perm: "approvals.view" },
      { to: "/settings", key: "settings", icon: Settings, perm: "settings.view" },
    ],
  },
];

export function allNavItems(groups: NavGroup[]) {
  return groups.flatMap((g) => g.items);
}