"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError } from "./api";
import type { DemoUser, SessionUser } from "./types";

interface SessionContextValue {
  user: SessionUser | null;
  demoUsers: DemoUser[];
  mockMode: boolean;
  corpId: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setAuthenticatedUser: (user: SessionUser) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const [mockMode, setMockMode] = useState(false);
  const [corpId, setCorpId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const session = await api.session();
      setUser(session.user);
      setDemoUsers(session.demoUsers ?? []);
      setMockMode(Boolean(session.mockMode));
      setCorpId(session.corpId ?? null);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        setUser(null);
        setMockMode(false);
      } else {
        setError(requestError instanceof Error ? requestError.message : "会话加载失败");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      user,
      demoUsers,
      mockMode,
      corpId,
      loading,
      error,
      refresh,
      setAuthenticatedUser: setUser,
    }),
    [corpId, demoUsers, error, loading, mockMode, refresh, user],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession 必须在 SessionProvider 内使用");
  return value;
}
