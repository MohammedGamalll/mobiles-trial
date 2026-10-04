import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppProvider, useApp } from "./context";
import AppLayout from "./layout/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import POS from "./pages/POS";
import POSClassic from "./pages/POSClassic";
import Products, { ProductDetail } from "./pages/Products";
import ProductsClassic from "./pages/ProductsClassic";
import WarehouseReportClassic from "./pages/WarehouseReportClassic";
import Invoice from "./pages/Invoice";
import { DeliveryBoard } from "./pages/Delivery";
import DeliverySettle from "./pages/DeliverySettle";
import CourierTrack from "./pages/CourierTrack";
import { AttendancePage, EmployeesPage, PayrollPage, ShiftsPage, LeavesPage, AdvancesPage } from "./pages/HR";
import {
  AuditPage,
  BatchesPage,
  CatalogCrud,
  CustomerDetail,
  CustomersPage,
  ExpensesPage,
  InventoryPage,
  PaymentsPage,
  PurchaseDetail,
  PurchasesPage,
  ReportsPage,
  SalesList,
  SettingsPage,
  SuppliersPage,
  SupplierDetail,
  PriceListsPage,
  PriceListDetail,
  UsersPage,
} from "./pages/More";
import { LocationsPage, TransferDetail, TransfersPage, StocktakeDetail, StocktakesPage } from "./pages/Stock";
import { RepsPage, RepDetail, VisitsPage, TargetsPage, CommissionsPage } from "./pages/Reps";
import { CashAccountsPage, ChartPage, JournalPage, VouchersPage } from "./pages/Ledger";
import { SerialsPage, ChequesPage, InstallmentsPage } from "./pages/Sahl";
import CourierDashboard from "./pages/CourierDashboard";
import { homePath } from "./lib/home";

function Guard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useApp();
  if (loading) return <div className="p-10 text-slate-400">المتميز...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PermGuard({ perm, children }: { perm: string | string[]; children: React.ReactNode }) {
  const { can, user } = useApp();
  const ok = Array.isArray(perm) ? can(...perm) : can(perm);
  if (!ok) return <Navigate to={homePath(user)} replace />;
  return <>{children}</>;
}

function POSGate() {
  const { uiLayout } = useApp();
  return uiLayout === "classic_easy" ? <POSClassic /> : <POS />;
}

function ProductsGate() {
  const { uiLayout } = useApp();
  return uiLayout === "classic_easy" ? <ProductsClassic /> : <Products />;
}

function InventoryGate() {
  const { uiLayout } = useApp();
  return uiLayout === "classic_easy" ? <WarehouseReportClassic /> : <InventoryPage />;
}

function AppRoutes() {
  const { user, tr } = useApp();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={homePath(user)} replace /> : <Login />} />
      <Route
        path="/"
        element={
          <Guard>
            <AppLayout />
          </Guard>
        }
      >
        <Route index element={user?.role_slug === "delivery" ? <Navigate to="/courier" replace /> : <Dashboard />} />
        <Route path="courier" element={<PermGuard perm="delivery.mark"><CourierDashboard /></PermGuard>} />
        <Route path="pos" element={<PermGuard perm="sales.create"><POSGate /></PermGuard>} />
        <Route path="sales" element={<PermGuard perm="sales.view"><SalesList /></PermGuard>} />
        <Route path="sales/:id" element={<PermGuard perm="sales.view"><Invoice /></PermGuard>} />
        <Route path="delivery" element={<PermGuard perm="delivery.update"><DeliveryBoard /></PermGuard>} />
        <Route path="delivery/settle" element={<PermGuard perm="delivery.settle"><DeliverySettle /></PermGuard>} />
        <Route path="delivery/track" element={<PermGuard perm="delivery.mark"><CourierTrack /></PermGuard>} />
        <Route path="settings" element={<PermGuard perm="settings.edit"><SettingsPage /></PermGuard>} />
        <Route path="reps" element={<RepsPage />} />
        <Route path="reps/visits" element={<VisitsPage />} />
        <Route path="reps/targets" element={<TargetsPage />} />
        <Route path="reps/commissions" element={<CommissionsPage />} />
        <Route path="reps/:id" element={<RepDetail />} />
        <Route path="hr/employees" element={<EmployeesPage />} />
        <Route path="hr/attendance" element={<AttendancePage />} />
        <Route path="hr/shifts" element={<ShiftsPage />} />
        <Route path="hr/leaves" element={<LeavesPage />} />
        <Route path="hr/advances" element={<AdvancesPage />} />
        <Route path="hr/payroll" element={<PayrollPage />} />
        <Route path="products" element={<ProductsGate />} />
        <Route path="products/:id" element={<ProductDetail />} />
        <Route path="inventory" element={<PermGuard perm="inventory.view"><InventoryGate /></PermGuard>} />
        <Route path="batches" element={<PermGuard perm="inventory.view"><BatchesPage /></PermGuard>} />
        <Route path="purchases" element={<PermGuard perm="purchases.view"><PurchasesPage /></PermGuard>} />
        <Route path="purchases/:id" element={<PermGuard perm="purchases.view"><PurchaseDetail /></PermGuard>} />
        <Route path="customers" element={<PermGuard perm="customers.view"><CustomersPage /></PermGuard>} />
        <Route path="customers/:id" element={<PermGuard perm="customers.view"><CustomerDetail /></PermGuard>} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="suppliers/:id" element={<SupplierDetail />} />
        <Route path="price-lists" element={<PermGuard perm={["prices.view", "sales.create", "prices.manage"]}><PriceListsPage /></PermGuard>} />
        <Route path="price-lists/:id" element={<PermGuard perm={["prices.view", "sales.create", "prices.manage"]}><PriceListDetail /></PermGuard>} />
        <Route path="brands" element={<CatalogCrud table="brands" title={tr("brands")} />} />
        <Route path="part-types" element={<CatalogCrud table="part_types" title={tr("partTypes")} />} />
        <Route path="categories" element={<CatalogCrud table="categories" title={tr("categories")} />} />
        <Route path="models" element={<CatalogCrud table="models" title={tr("models")} />} />
        <Route path="locations" element={<PermGuard perm="locations.manage"><LocationsPage /></PermGuard>} />
        <Route path="transfers" element={<PermGuard perm="transfers.view"><TransfersPage /></PermGuard>} />
        <Route path="transfers/:id" element={<PermGuard perm="transfers.view"><TransferDetail /></PermGuard>} />
        <Route path="stocktake" element={<PermGuard perm="stocktake.view"><StocktakesPage /></PermGuard>} />
        <Route path="stocktake/:id" element={<PermGuard perm="stocktake.view"><StocktakeDetail /></PermGuard>} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="serials" element={<PermGuard perm="serials.manage"><SerialsPage /></PermGuard>} />
        <Route path="cheques" element={<ChequesPage />} />
        <Route path="installments" element={<InstallmentsPage />} />
        <Route path="ledger/cash" element={<CashAccountsPage />} />
        <Route path="ledger/accounts" element={<ChartPage />} />
        <Route path="ledger/journal" element={<JournalPage />} />
        <Route path="ledger/vouchers" element={<VouchersPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="audit" element={<AuditPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProvider>
  );
}
