'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiRequestError, createApiClient, type MeResponse } from '@proot/shared';

const TOKEN_KEY = 'proot.admin.token';

function readToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(TOKEN_KEY);
    else window.localStorage.setItem(TOKEN_KEY, value);
  } catch {
    // Blocked storage: the session lasts until reload.
  }
}

export const api = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api',
  getToken: readToken,
});

type SessionValue = {
  status: 'loading' | 'guest' | 'ready';
  user: MeResponse | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionValue['status']>('loading');
  const [user, setUser] = useState<MeResponse | null>(null);

  const signOut = useCallback(() => {
    writeToken(null);
    setUser(null);
    setStatus('guest');
  }, []);

  useEffect(() => {
    const token = readToken();
    if (!token) return setStatus('guest');
    api.me(token)
      .then((me) => {
        setUser(me);
        setStatus('ready');
      })
      .catch((error) => {
        if (error instanceof ApiRequestError && error.status === 401) signOut();
        else setStatus('guest');
      });
  }, [signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { token } = await api.login({ email, password });
    const me = await api.me(token);
    writeToken(token);
    setUser(me);
    setStatus('ready');
  }, []);

  const value = useMemo(() => ({ status, user, signIn, signOut }), [status, user, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>.');
  return value;
}

/** Turn an API failure into a sentence; a 401 means the session expired, so sign out. */
export function useApiError() {
  const { signOut } = useSession();
  return useCallback((error: unknown) => {
    if (error instanceof ApiRequestError && error.status === 401) signOut();
    return error instanceof Error ? error.message : 'Something went wrong.';
  }, [signOut]);
}
