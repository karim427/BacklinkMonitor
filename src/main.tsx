import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes, Link } from "react-router-dom";
import "./index.css";
import { AppShell } from "./components/AppShell";
import { EmptyState, Button } from "./components/ui/primitives";
import DashboardPage from "./pages/DashboardPage";
import ClientsPage from "./pages/ClientsPage";
import ClientTrackingPage from "./pages/ClientTrackingPage";
import TargetLinksPage from "./pages/TargetLinksPage";
import LinksPage from "./pages/LinksPage";
import TargetPagesPage from "./pages/TargetPagesPage";
import DonorsPage from "./pages/DonorsPage";
import CitationsPage from "./pages/CitationsPage";
import RechecksPage from "./pages/RechecksPage";
import ProspectsPage from "./pages/ProspectsPage";
import HaroPage from "./pages/HaroPage";
import SettingsPage from "./pages/SettingsPage";
import UsersPage from "./pages/UsersPage";
import { AuthGate } from "./components/AuthGate";

const NotFound = () => <EmptyState title="Page not found" hint="That page doesn't exist." action={<Button asChild><Link to="/">Back to dashboard</Link></Button>} />;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthGate><BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/:id" element={<ClientTrackingPage />} />
          <Route path="clients/:id/:month" element={<ClientTrackingPage />} />
          <Route path="target-links" element={<TargetLinksPage />} />
          <Route path="links" element={<LinksPage />} />
          <Route path="target-pages" element={<TargetPagesPage />} />
          <Route path="donors" element={<DonorsPage />} />
          <Route path="citations" element={<CitationsPage />} />
          <Route path="rechecks" element={<RechecksPage />} />
          <Route path="prospects" element={<ProspectsPage />} />
          <Route path="haro" element={<HaroPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter></AuthGate>
  </React.StrictMode>,
);
