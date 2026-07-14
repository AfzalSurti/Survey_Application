import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "./auth/AuthContext";
import { AppFrame } from "./components/UI";
import { Dashboard, ExcelExport, Records, Reports, SchemaEditor, SettingsPage, Templates, UsersPage } from "./pages/Pages";

function Login() {
  const { user, login } = useAuth(); const navigate = useNavigate(); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setError(""); try { await login(email, password); navigate("/"); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } };
  return <div className="login"><form className="glass login-card" onSubmit={submit}><div className="brand"><img src="/gdrpl-logo.png" />GDRPL Survey</div><h1>Welcome back</h1><p>Sign in to manage survey operations.</p><div className="form-row"><label>Email</label><input className="field" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></div><div className="form-row"><label>Password</label><input className="field" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></div>{error && <div className="notice">{error}</div>}<button className="button" style={{ width: "100%", marginTop: 8 }} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button></form></div>;
}
function Protected() { const { user, loading } = useAuth(); const location = useLocation(); if (loading) return <div className="login"><div className="glass panel">Loading GDRPL Survey…</div></div>; if (!user) return <Navigate to="/login" state={{ from: location }} replace />; return <AppFrame><Outlet /></AppFrame>; }
function SuperAdmin({ children }: { children: ReactNode }) { const { user } = useAuth(); return user?.role === "super_admin" ? <>{children}</> : <Navigate to="/" replace />; }
export default function App() { return <Routes><Route path="/login" element={<Login />} /><Route element={<Protected />}><Route index element={<Dashboard />} /><Route path="records" element={<Records />} /><Route path="reports" element={<Reports />} /><Route path="export" element={<ExcelExport />} /><Route path="templates" element={<Templates />} /><Route path="schema" element={<SuperAdmin><SchemaEditor /></SuperAdmin>} /><Route path="users" element={<SuperAdmin><UsersPage /></SuperAdmin>} /><Route path="settings" element={<SuperAdmin><SettingsPage /></SuperAdmin>} /></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes>; }
