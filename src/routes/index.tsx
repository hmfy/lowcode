import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import { DashboardPage } from "../pages/dashboard";
import { NotFoundPage } from "../pages/not-found";
import { DataShowcasePage, FeedbackShowcasePage, FormsShowcasePage, PagesShowcasePage } from "../pages/ui-showcase";
import { BestProvider } from "best-lowcode-runtime";
import { showcaseRegistry } from "../pages/ui-showcase/registry";

export function AppRouter() {
  return (
    <Routes>
      <Route element={<BestProvider registry={showcaseRegistry}><AppLayout /></BestProvider>}>
        <Route index element={<DashboardPage />} />
        <Route path="ui/data" element={<DataShowcasePage />} />
        <Route path="ui/forms" element={<FormsShowcasePage />} />
        <Route path="ui/feedback" element={<FeedbackShowcasePage />} />
        <Route path="ui/pages" element={<PagesShowcasePage />} />
        <Route path="404" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
