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
  { to: "/app", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/records", label: "Records", icon: ClipboardList },
  { to: "/app/reports", label: "Report generation", icon: FileText },
  { to: "/app/export", label: "Excel export", icon: FileSpreadsheet },
];
const superAdminEntries = [
  { to: "/app/templates", label: "Templates", icon: Layers },
  { to: "/app/projects", label: "Projects", icon: FolderKanban },
  { to: "/app/schema", label: "Schema editor", icon: Braces },
  { to: "/app/users", label: "Users", icon: Users },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

/** Buttons stay clickable when "disabled" so users get a clear reason. */
export function ActionButton({
  children,
  onClick,
  disabled,
  disabledReason,
  className = "button",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={className}
      style={{ opacity: disabled ? 0.55 : 1 }}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (disabled) {
          window.alert(disabledReason || "This action is not available right now.");
          return;
        }
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="glass topbar">
      <NavLink className="brand" to="/app">
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
        <NavLink className="button secondary" to="/" title="Landing page">
          Home
        </NavLink>
        <button
          className="button secondary"
          title="Sign out"
          onClick={() => {
            logout();
            navigate("/");
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
        <NavLink end={to === "/app"} className="nav-link" to={to} key={to}>
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
        <main className="content">
          {children}
          <footer className="site-credit">
            <a href="https://geogroup.in/" target="_blank" rel="noopener noreferrer">
              Explore company — geogroup.in
            </a>
            <a
              className="made-with-love"
              href="https://www.linkedin.com/in/afzal-surti-9904b2287/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Made with love by Afzal N. Surti
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}
