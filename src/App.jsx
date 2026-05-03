import { BrowserRouter as Router, Navigate, Routes, Route } from "react-router-dom";
import LoginPage from "./components/LoginPage";
import SelectContextPage from "./components/SelectContextPage";
import Dashboard from "./components/Dashboard";
import CompanyEmployees from "./components/company/CompanyEmployees";
import EmployeeProfile from "./components/company/EmployeeProfile";
import CompanyRoles from "./components/company/CompanyRoles";
import CompanyWarehouses from "./components/company/CompanyWarehouses";
import {
  CompanyWarehouseMarkedStockPage,
  CompanyWarehouseOutgoingMarkedStockPage,
  CompanyWarehouseUnmarkedStockPage,
} from "./components/company/CompanyWarehouseStock";
import CompanySettings from "./components/company/CompanySettings";
import CompanySuppliers from "./components/company/CompanySuppliers";
import CompanyProducts from "./components/company/CompanyProducts";
import WarehouseReceipt from "./components/company/WarehouseReceipt";
import CompanyInvoices from "./components/company/CompanyInvoices";
import CompanyInvoiceDetail from "./components/company/CompanyInvoiceDetail";
import CompanyOutgoingInvoiceDetail from "./components/company/CompanyOutgoingInvoiceDetail";
import WarehouseOutgoing from "./components/company/WarehouseOutgoing";
import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import PublicRoute from "./components/PublicRoute";
import AdminLayout from "./components/admin/AdminLayout";
import AdminDashboard from "./components/admin/AdminDashboard";
import AdminCompanies from "./components/admin/AdminCompanies";
import AdminCompanySettings from "./components/admin/AdminCompanySettings";
import AdminUsers from "./components/admin/AdminUsers";
import AdminSubscriptions from "./components/admin/AdminSubscriptions";
import AdminAudit from "./components/admin/AdminAudit";
import AdminSettings from "./components/admin/AdminSettings";
import { useAuth } from "./context/AuthContext";

const RedirectByRole = () => {
  const { activeContext } = useAuth();
  if (activeContext?.type === "platform") return <Navigate to="/panel" replace />;
  if (activeContext?.type === "organization") return <Navigate to="/app" replace />;
  return <Navigate to="/select-context" replace />;
};

/** Любой неизвестный путь: неавторизован → /, иначе редирект в свою зону по активному контексту. */
const CatchAllRedirect = () => {
  const { authReady, isAuthenticated, activeContext } = useAuth();
  if (!authReady) return null;
  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (activeContext?.type === "platform") return <Navigate to="/panel" replace />;
  if (activeContext?.type === "organization") return <Navigate to="/app" replace />;
  return <Navigate to="/select-context" replace />;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/select-context"
          element={
            <ProtectedRoute>
              <SelectContextPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app"
          element={
            <ProtectedRoute requireContext="organization">
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="profile" element={<EmployeeProfile />} />
          <Route path="employees" element={<CompanyEmployees />} />
          <Route path="roles" element={<CompanyRoles />} />
          <Route path="warehouses" element={<CompanyWarehouses />} />
          <Route path="warehouses/:warehouseId/receipt" element={<WarehouseReceipt />} />
          <Route path="warehouses/:warehouseId/outgoing" element={<WarehouseOutgoing />} />
          <Route path="warehouses/:warehouseId" element={<Navigate to="marked" replace />} />
          <Route path="warehouses/:warehouseId/marked" element={<CompanyWarehouseMarkedStockPage />} />
          <Route path="warehouses/:warehouseId/outgoing-marked" element={<CompanyWarehouseOutgoingMarkedStockPage />} />
          <Route path="warehouses/:warehouseId/unmarked" element={<CompanyWarehouseUnmarkedStockPage />} />
          <Route path="invoices" element={<CompanyInvoices />} />
          <Route path="invoices/:invoiceId" element={<CompanyInvoiceDetail />} />
          <Route path="outgoing-invoices" element={<Navigate to="/app/invoices" replace />} />
          <Route path="outgoing-invoices/:outgoingInvoiceId" element={<CompanyOutgoingInvoiceDetail />} />
          <Route path="settings" element={<CompanySettings />} />
          <Route path="suppliers" element={<CompanySuppliers />} />
          <Route path="products" element={<CompanyProducts />} />
        </Route>
        <Route
          path="/panel"
          element={
            <ProtectedRoute requireContext="platform">
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="companies" element={<AdminCompanies />} />
          <Route path="companies/archive" element={<AdminCompanies />} />
          <Route path="companies/:companyId" element={<AdminCompanySettings />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="subscriptions" element={<AdminSubscriptions />} />
          <Route path="audit" element={<AdminAudit />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <RedirectByRole />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<CatchAllRedirect />} />
      </Routes>
    </Router>
  );
}

export default App;
