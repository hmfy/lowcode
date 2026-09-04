import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '../layouts/AppLayout'
import { CustomersPage } from '../pages/customers'
import { DashboardPage } from '../pages/dashboard'
import { NotFoundPage } from '../pages/not-found'
import { WarningsPage } from '../pages/warnings'
import { ProvidersPage } from '../pages/providers'

export function AppRouter() {
  return <Routes><Route element={<AppLayout />}><Route index element={<DashboardPage />} /><Route path="customers" element={<CustomersPage />} /><Route path="warnings" element={<WarningsPage />} /><Route path="providers" element={<ProvidersPage />} /><Route path="404" element={<NotFoundPage />} /></Route><Route path="*" element={<Navigate to="/404" replace />} /></Routes>
}
