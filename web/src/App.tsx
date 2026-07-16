import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "./auth/AuthContext";
import { AppFrame } from "./components/UI";
import { LandingPage } from "./pages/Landing";
import { Dashboard, ExcelExport, Records, Reports, SchemaEditor, SettingsPage, Templates, UsersPage, ProjectsPage } from "./pages/Pages";

function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/app";

  if (user) return <Navigate to="/app" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Enter both email and password to sign in.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await login(email.trim(), password);
      navigate(from.startsWith("/app") ? from : "/app");
    } catch (err) {
      setError((err as Error).message || "Sign in failed. Check your credentials or wait for the server to wake up.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="glass login-card" onSubmit={submit}>
        <div className="brand">
          <img src="/gdrpl-logo.png" alt="" />
          GDRPL Survey
        </div>
        <h1>Welcome back</h1>
        <p>Sign in to manage survey operations.</p>
        <div className="form-row">
          <label>Email</label>
          <input className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Password</label>
          <input className="field" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <div className="notice">{error}</div>}
        <button
          className="button"
          style={{ width: "100%", marginTop: 8, opacity: busy ? 0.55 : 1 }}
          type="submit"
          onClick={(e) => {
            if (busy) {
              e.preventDefault();
              setError("Sign in is already in progress. Please wait.");
            }
          }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="muted" style={{ marginTop: 16 }}>
          <a href="/">← Back to landing page</a>
        </p>
      </form>
    </div>
  );
}

function Protected() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="login"><div className="glass panel">Loading GDRPL Survey…</div></div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return (
    <AppFrame>
      <Outlet />
    </AppFrame>
  );
}

function SuperAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "super_admin") {
    return (
      <div className="glass panel">
        <h2>Access denied</h2>
        <p className="muted">Only super admins can open this page. Your role ({user?.role?.replace("_", " ") || "unknown"}) does not include this permission.</p>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/app" element={<Protected />}>
        <Route index element={<Dashboard />} />
        <Route path="records" element={<Records />} />
        <Route path="reports" element={<Reports />} />
        <Route path="export" element={<ExcelExport />} />
        <Route path="templates" element={<SuperAdmin><Templates /></SuperAdmin>} />
        <Route path="projects" element={<SuperAdmin><ProjectsPage /></SuperAdmin>} />
        <Route path="schema" element={<SuperAdmin><SchemaEditor /></SuperAdmin>} />
        <Route path="users" element={<SuperAdmin><UsersPage /></SuperAdmin>} />
        <Route path="settings" element={<SuperAdmin><SettingsPage /></SuperAdmin>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
