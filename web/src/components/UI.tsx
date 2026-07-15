import { LayoutDashboard, ClipboardList, FileText, FileSpreadsheet, Braces, Users, Settings, Layers, LogOut, FolderKanban } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { ReactNode } from "react";

export const GlassPanel = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <section className={`glass panel ${className}`}>{children}</section>
);
export const StatusBadge = ({ status }: { status: string }) => (
  <span className={`badge ${status}`}>{status.replace("_", " ")}</span>
);

const entries = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/records", label: "Records", icon: ClipboardList },
  { to: "/reports", label: "Report generation", icon: FileText },
  { to: "/export", label: "Excel export", icon: FileSpreadsheet },
  { to: "/templates", label: "Templates", icon: Layers },
];
const superAdminEntries = [
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/schema", label: "Schema editor", icon: Braces },
  { to: "/users", label: "Users", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="glass topbar">
      <NavLink className="brand" to="/">
        <img src="/gdrpl-logo.png" alt="" />
        GDRPL Survey
      </NavLink>
      <div className="identity">
        <div>
          <strong>{user?.name}</strong>
          <br />
          <span className="muted">{user?.role?.replace("_", " ")}</span>
        </div>
        <div className="avatar">{user?.name?.[0] || "G"}</div>
        <button
          className="button secondary"
          title="Sign out"
          onClick={() => {
            logout();
            navigate("/login");
          }}
        >
          <LogOut size={15} />
        </button>
      </div>
    </header>
  );
}

function Sidebar() {
  const { user } = useAuth();
  const base = user?.role === "surveyor" ? entries.slice(0, 2) : entries;
  const nav = [...base, ...(user?.role === "super_admin" ? superAdminEntries : [])];
  return (
    <aside className="glass sidebar">
      {nav.map(({ to, label, icon: Icon }) => (
        <NavLink end={to === "/"} className="nav-link" to={to} key={to}>
          <Icon size={17} />
          {label}
        </NavLink>
      ))}
    </aside>
  );
}

export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <Header />
      <div className="layout">
        <Sidebar />
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
