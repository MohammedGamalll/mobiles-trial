import { Link } from "react-router-dom";
import {
  BarChart3,
  Calculator,
  ClipboardCheck,
  ClipboardList,
  FolderOpen,
  HandCoins,
  Landmark,
  LayoutDashboard,
  Package,
  Presentation,
  Receipt,
  ShoppingBag,
  SlidersHorizontal,
  Truck,
  Undo2,
  Users,
  Wallet,
} from "lucide-react";
import { useApp } from "../context";
import type { Msg } from "../i18n";

type Tile = {
  to: string;
  key: Msg;
  icon: typeof Package;
  color: string;
  perm: string;
  wide?: boolean;
};

const modules: Tile[] = [
  { to: "/products", key: "easyGoods", icon: Package, color: "#43a047", perm: "products.view" },
  { to: "/customers", key: "easyAccounts", icon: Users, color: "#43a047", perm: "customers.view" },
  { to: "/ledger/cash", key: "easyTreasury", icon: Landmark, color: "#43a047", perm: "ledger.view" },
  { to: "/sales", key: "easyInvoices", icon: FolderOpen, color: "#43a047", perm: "sales.view" },
  { to: "/reports", key: "easyReports", icon: BarChart3, color: "#43a047", perm: "reports.view" },
];

const start: Tile[] = [
  { to: "/", key: "easyWelcome", icon: Presentation, color: "#29b6f6", perm: "dashboard.view" },
  { to: "/settings", key: "easySetup", icon: ClipboardList, color: "#29b6f6", perm: "settings.view" },
  { to: "/products", key: "easyAddItems", icon: ClipboardList, color: "#29b6f6", perm: "products.view" },
  { to: "/customers", key: "easyAddAccounts", icon: Users, color: "#fbc02d", perm: "customers.view" },
  { to: "/sales", key: "easyDaily", icon: Receipt, color: "#1565c0", perm: "sales.view" },
  { to: "/reports", key: "easySalesAnalysis", icon: BarChart3, color: "#0d47a1", perm: "reports.view" },
];

const docs: Tile[] = [
  { to: "/pos", key: "easySell", icon: ShoppingBag, color: "#43a047", perm: "sales.create", wide: true },
  { to: "/purchases", key: "easyBuy", icon: Truck, color: "#e53935", perm: "purchases.view", wide: true },
  { to: "/expenses", key: "easyPayOut", icon: HandCoins, color: "#ec407a", perm: "expenses.view", wide: true },
  { to: "/stocktake", key: "easyStocktake", icon: ClipboardCheck, color: "#00897b", perm: "stocktake.view", wide: true },
  { to: "/sales", key: "easySaleReturn", icon: Undo2, color: "#26a69a", perm: "sales.view" },
  { to: "/pos?mode=quote", key: "easyPriceList", icon: Calculator, color: "#26a69a", perm: "sales.create" },
  { to: "/purchases", key: "easyPurchaseReturn", icon: Package, color: "#8e24aa", perm: "purchases.view" },
  { to: "/payments", key: "easyPayIn", icon: Wallet, color: "#26a69a", perm: "payments.view" },
  { to: "/transfers", key: "easyTransfer", icon: Truck, color: "#00897b", perm: "transfers.view" },
  { to: "/inventory", key: "easyAdjust", icon: SlidersHorizontal, color: "#26a69a", perm: "inventory.view" },
];

function TileBtn({ tile, size }: { tile: Tile; size: "sm" | "md" | "lg" }) {
  const { tr } = useApp();
  const Icon = tile.icon;
  const box = size === "lg" ? "h-[108px] min-w-[132px] flex-1 basis-[132px]" : size === "md" ? "h-[92px] w-[108px]" : "h-[84px] w-[96px]";
  const iconSize = size === "lg" ? 38 : size === "md" ? 30 : 26;
  return (
    <Link
      to={tile.to}
      className={`easy-tile ${box} ${tile.wide ? "sm:min-w-[160px]" : ""}`}
      style={{ background: tile.color }}
    >
      <Icon size={iconSize} strokeWidth={1.7} />
      <span>{tr(tile.key)}</span>
    </Link>
  );
}

export function EasyLauncher() {
  const { tr, can } = useApp();
  const vis = (tiles: Tile[]) => tiles.filter((t) => can(t.perm));
  return (
    <div className="easy-home">
      <div className="easy-row easy-row-top">
        <div className="easy-brand">
          <Calculator size={42} strokeWidth={1.6} />
          <div>
            <div className="easy-brand-title">{tr("app")}</div>
            <div className="easy-brand-sub">{tr("easyBrandSub")}</div>
          </div>
        </div>
        {vis(modules).map((t) => (
          <TileBtn key={t.key} tile={t} size="md" />
        ))}
      </div>

      <div className="easy-section">
        <div className="easy-section-title">{tr("easyStartTour")}</div>
        <div className="easy-row easy-row-center">
          {vis(start).map((t) => (
            <TileBtn key={t.key} tile={t} size="sm" />
          ))}
        </div>
      </div>

      <div className="easy-section">
        <div className="easy-section-title">{tr("easyDocs")}</div>
        <div className="easy-row easy-row-docs">
          {vis(docs).map((t) => (
            <TileBtn key={`${t.key}-${t.to}`} tile={t} size="lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function EasyHomeLink() {
  const { tr } = useApp();
  return (
    <Link to="/" className="easy-home-btn" title={tr("easyHome")}>
      <LayoutDashboard size={16} />
      <span>{tr("easyHome")}</span>
    </Link>
  );
}
