import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import { CustomersPage } from "../pages/customers";
import { DashboardPage } from "../pages/dashboard";
import { NotFoundPage } from "../pages/not-found";
import { ProvidersPage } from "../pages/providers";
import { CustomerBalanceWarningPage } from "../pages/customer-balance-warning";

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="providers" element={<ProvidersPage />} />
        <Route path="warnings" element={<CustomerBalanceWarningPage />} />
        <Route path="404" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
