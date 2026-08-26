/**
 * MaatruMitra — useAuth hook.
 * Manages authentication state across the application.
 */

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { auth, type AuthUser } from "../lib/api";
import { useLocation } from "wouter";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [, navigate] = useLocation();

  const loadUser = useCallback(async () => {
    try {
      const u = await auth.me();
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();

    const handleUnauthorized = () => {
      setUser(null);
      navigate("/login");
    };
    window.addEventListener("maatrumitra:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("maatrumitra:unauthorized", handleUnauthorized);
  }, [loadUser, navigate]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await auth.login(username, password);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    await auth.logout();
    setUser(null);
    navigate("/login");
  }, [navigate]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
