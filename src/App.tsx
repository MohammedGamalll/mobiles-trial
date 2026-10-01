import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppProvider, useApp } from "./context";
import AppLayout from "./layout/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import POS from "./pages/POS";
import Products, { ProductDetail } from "./pages/Products";
import Invoice from "./pages/Invoice";
import { DeliveryBoard } from "./pages/Delivery";
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

function Guard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useApp();
  if (loading) return <div className="p-10 text-slate-400">المتميز...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, tr } = useApp();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <Guard>
            <AppLayout />
          </Guard>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="pos" element={<POS />} />
        <Route path="sales" element={<SalesList />} />
        <Route path="sales/:id" element={<Invoice />} />
        <Route path="delivery" element={<DeliveryBoard />} />
        <Route path="delivery/track" element={<CourierTrack />} />
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
        <Route path="products" element={<Products />} />
        <Route path="products/:id" element={<ProductDetail />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="batches" element={<BatchesPage />} />
        <Route path="purchases" element={<PurchasesPage />} />
        <Route path="purchases/:id" element={<PurchaseDetail />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="suppliers/:id" element={<SupplierDetail />} />
        <Route path="price-lists" element={<PriceListsPage />} />
        <Route path="price-lists/:id" element={<PriceListDetail />} />
        <Route path="brands" element={<CatalogCrud table="brands" title={tr("brands")} />} />
        <Route path="part-types" element={<CatalogCrud table="part_types" title={tr("partTypes")} />} />
        <Route path="categories" element={<CatalogCrud table="categories" title={tr("categories")} />} />
        <Route path="models" element={<CatalogCrud table="models" title={tr("models")} />} />
        <Route path="locations" element={<LocationsPage />} />
        <Route path="transfers" element={<TransfersPage />} />
        <Route path="transfers/:id" element={<TransferDetail />} />
        <Route path="stocktake" element={<StocktakesPage />} />
        <Route path="stocktake/:id" element={<StocktakeDetail />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="serials" element={<SerialsPage />} />
        <Route path="cheques" element={<ChequesPage />} />
        <Route path="installments" element={<InstallmentsPage />} />
        <Route path="ledger/cash" element={<CashAccountsPage />} />
        <Route path="ledger/accounts" element={<ChartPage />} />
        <Route path="ledger/journal" element={<JournalPage />} />
        <Route path="ledger/vouchers" element={<VouchersPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
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
