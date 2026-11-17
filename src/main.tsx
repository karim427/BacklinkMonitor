import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, Link } from "react-router-dom";
import "./index.css";
import { AppShell } from "./components/AppShell";
import { EmptyState, Button } from "./components/ui/primitives";
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ClientsPage = lazy(() => import("./pages/ClientsPage"));
const ClientTrackingPage = lazy(() => import("./pages/ClientTrackingPage"));
const LinksPage = lazy(() => import("./pages/LinksPage"));
const TargetPagesPage = lazy(() => import("./pages/TargetPagesPage"));
const DonorsPage = lazy(() => import("./pages/DonorsPage"));
const RechecksPage = lazy(() => import("./pages/RechecksPage"));
const ProspectsPage = lazy(() => import("./pages/ProspectsPage"));
const HaroPage = lazy(() => import("./pages/HaroPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const GuidePage = lazy(() => import("./pages/GuidePage"));
import { AuthGate } from "./components/AuthGate";
import { RouteBoundary } from "./components/RouteBoundary";

const NotFound = () => <EmptyState title="Page not found" hint="That page doesn't exist." action={<Button asChild><Link to="/">Back to dashboard</Link></Button>} />;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthGate><BrowserRouter>
      <RouteBoundary><Suspense fallback={null}><Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/:id" element={<ClientTrackingPage />} />
          <Route path="clients/:id/:month" element={<ClientTrackingPage />} />
          <Route path="target-links" element={<Navigate to="/links" replace />} />
          <Route path="links" element={<LinksPage />} />
          <Route path="target-pages" element={<TargetPagesPage />} />
          <Route path="donors" element={<DonorsPage />} />
          <Route path="rechecks" element={<RechecksPage />} />
          <Route path="prospects" element={<ProspectsPage />} />
          <Route path="haro" element={<HaroPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="guide" element={<GuidePage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes></Suspense></RouteBoundary>
    </BrowserRouter></AuthGate>
  </React.StrictMode>,
);
