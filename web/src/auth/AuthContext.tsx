import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { client, type User } from "../api/client";

type Auth = { user: User | null; loading: boolean; login: (email: string, password: string) => Promise<void>; logout: () => void };
const AuthContext = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { if (!localStorage.getItem("access_token")) return void setLoading(false); client.get<User>("/auth/me").then(setUser).catch(() => localStorage.clear()).finally(() => setLoading(false)); }, []);
  const login = async (email: string, password: string) => { const data = await client.post<{ tokens: { access_token: string; refresh_token: string }; user: User }>("/auth/login", { email, password }); localStorage.setItem("access_token", data.tokens.access_token); localStorage.setItem("refresh_token", data.tokens.refresh_token); setUser(data.user); };
  const logout = () => { localStorage.clear(); setUser(null); };
  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => { const value = useContext(AuthContext); if (!value) throw new Error("AuthProvider is missing"); return value; };
