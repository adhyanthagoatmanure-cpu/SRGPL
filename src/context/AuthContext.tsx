import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "../db/types";
import { authenticate, clearSession, countUsers, getUser, loadSession, registerUser, saveSession, type RegisterInput } from "../services/auth";

interface AuthApi {
  user: User | null;
  /** True until the stored session has been checked. */
  loading: boolean;
  /** Number of accounts on this device (0 = first run). */
  userCount: number;
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => void;
  setUser: (u: User) => void;
  reloadCount: () => Promise<void>;
}

const Ctx = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userCount, setUserCount] = useState(0);

  const reloadCount = useCallback(async () => setUserCount(await countUsers()), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [count, id] = [await countUsers(), loadSession()];
      let u: User | undefined;
      if (id) u = await getUser(id);
      if (!alive) return;
      setUserCount(count);
      if (u && u.status === "active") setUser(u);
      else if (id) clearSession();
      setLoading(false);
    })().catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string, remember: boolean) => {
    const u = await authenticate(email, password);
    saveSession(u.id, remember);
    setUser(u);
  }, []);

  const register = useCallback(
    async (input: RegisterInput) => {
      const u = await registerUser(input);
      await reloadCount();
      return u;
    },
    [reloadCount],
  );

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo<AuthApi>(
    () => ({ user, loading, userCount, login, register, logout, setUser, reloadCount }),
    [user, loading, userCount, login, register, logout, reloadCount],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}

/** The signed-in user. Only call inside protected routes. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error("No signed-in user");
  return user;
}
