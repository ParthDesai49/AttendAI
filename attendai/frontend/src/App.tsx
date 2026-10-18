import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Loading } from "./components/ui";
import { useAuth } from "./context/AuthContext";
import AttendancePage from "./pages/Attendance";
import Corrections from "./pages/Corrections";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import Leave from "./pages/Leave";
import Login from "./pages/Login";
import Organisation from "./pages/Organisation";
import Profile from "./pages/Profile";
import Reports from "./pages/Reports";

/** Where to go after signing in: the page the person was trying to open, if it is inside the app. */
function safeNext(search: string) {
  const next = new URLSearchParams(search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/";
}

// Camera, QR and face code is only downloaded when someone opens those pages.
const Face = lazy(() => import("./pages/Face"));
const Kiosk = lazy(() => import("./pages/Kiosk"));
const Scan = lazy(() => import("./pages/Scan"));
const Settings = lazy(() => import("./pages/Settings"));

export default function App() {
  const { user, loading, isApprover, isHR } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading label="Signing you in" />;
  const here = loc.pathname + loc.search;
  const toLogin = <Navigate to={here === "/" ? "/login" : `/login?next=${encodeURIComponent(here)}`} replace />;
  return (
    <Suspense fallback={<Loading />}>
    <Routes>
      <Route path="/login" element={user ? <Navigate to={safeNext(loc.search)} replace /> : <Login />} />
      <Route path="/kiosk" element={!user ? toLogin : isHR ? <Kiosk /> : <Navigate to="/" replace />} />
      <Route element={user ? <Layout /> : toLogin}>
        <Route index element={<Dashboard />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="leave" element={<Leave />} />
        <Route path="corrections" element={<Corrections />} />
        <Route path="profile" element={<Profile />} />
        <Route path="organisation" element={isHR ? <Organisation /> : <Navigate to="/" replace />} />
        <Route path="scan" element={<Scan />} />
        <Route path="face" element={<Face />} />
        <Route path="settings" element={isHR ? <Settings /> : <Navigate to="/" replace />} />
        <Route path="employees" element={isApprover ? <Employees /> : <Navigate to="/" replace />} />
        <Route path="reports" element={isApprover ? <Reports /> : <Navigate to="/" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
