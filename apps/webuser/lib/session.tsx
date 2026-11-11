'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ApiRequestError,
  connectRealtime,
  createApiClient,
  type MeResponse,
  type PetProfileInput,
  type PetRecord,
  type RealtimeSocket,
  type ServerEvents,
} from '@proot/shared';

const TOKEN_KEY = 'proot.token';
const ACTIVE_PET_KEY = 'proot.activePet';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';
export const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3001';

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the session simply won't survive a reload.
  }
}

/** Set by the provider so a 401 anywhere signs the user out. */
let handleUnauthorized: () => void = () => {};

export const api = createApiClient({
  baseUrl: API_BASE_URL,
  getToken: () => readStorage(TOKEN_KEY),
  onUnauthorized: () => handleUnauthorized(),
});

type Status = 'loading' | 'guest' | 'ready';

type SessionValue = {
  status: Status;
  token: string | null;
  user: MeResponse | null;
  pets: PetRecord[];
  pet: PetRecord | null;
  selectPet: (id: string) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => void;
  /** Invalidates every token for the account, then signs out here. */
  signOutEverywhere: () => Promise<void>;
  /** Changes the password and keeps this device signed in with the new token. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Replace the cached user (e.g. after a profile update). */
  setUser: (me: MeResponse) => void;
  refreshMe: () => Promise<void>;
  savePet: (input: PetProfileInput, id?: string) => Promise<PetRecord>;
  removePet: (id: string) => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [user, setUserState] = useState<MeResponse | null>(null);
  const [pets, setPets] = useState<PetRecord[]>([]);
  const [activePetId, setActivePetId] = useState<string | null>(null);

  const clear = useCallback(() => {
    writeStorage(TOKEN_KEY, null);
    setToken(null);
    setUserState(null);
    setPets([]);
    setStatus('guest');
  }, []);

  useEffect(() => {
    handleUnauthorized = clear;
    return () => {
      handleUnauthorized = () => {};
    };
  }, [clear]);

  const load = useCallback(async (next: string) => {
    const [me, list] = await Promise.all([api.me(next), api.listPets(next)]);
    setToken(next);
    setUserState(me);
    setPets(list);
    setActivePetId((current) => current ?? readStorage(ACTIVE_PET_KEY));
    setStatus('ready');
  }, []);

  useEffect(() => {
    const stored = readStorage(TOKEN_KEY);
    if (!stored) {
      setStatus('guest');
      return;
    }
    load(stored).catch((error) => {
      // Keep the token on network errors so a flaky connection doesn't sign people out.
      if (error instanceof ApiRequestError && error.status === 401) clear();
      else setStatus('guest');
    });
  }, [load, clear]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api.login({ email, password });
    writeStorage(TOKEN_KEY, res.token);
    await load(res.token);
  }, [load]);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const res = await api.register({ name, email, password });
    writeStorage(TOKEN_KEY, res.token);
    await load(res.token);
  }, [load]);

  const signOutEverywhere = useCallback(async () => {
    try {
      await api.logoutEverywhere();
    } finally {
      clear();
    }
  }, [clear]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const res = await api.changePassword({ currentPassword, newPassword });
    writeStorage(TOKEN_KEY, res.token);
    setToken(res.token); // the realtime socket reconnects with the new token
  }, []);

  const refreshMe = useCallback(async () => {
    const me = await api.me();
    setUserState(me);
  }, []);

  const selectPet = useCallback((id: string) => {
    setActivePetId(id);
    writeStorage(ACTIVE_PET_KEY, id);
  }, []);

  const savePet = useCallback(async (input: PetProfileInput, id?: string) => {
    const saved = id ? await api.updatePet(id, input) : await api.createPet(input);
    setPets((list) => (id ? list.map((p) => (p.id === id ? saved : p)) : [...list, saved]));
    setUserState((current) => (current ? { ...current, onboarded: true } : current));
    selectPet(saved.id);
    return saved;
  }, [selectPet]);

  const removePet = useCallback(async (id: string) => {
    await api.deletePet(id);
    setPets((list) => {
      const next = list.filter((p) => p.id !== id);
      setUserState((current) => (current ? { ...current, onboarded: next.length > 0 } : current));
      return next;
    });
  }, []);

  const pet = pets.find((p) => p.id === activePetId) ?? pets[0] ?? null;

  const value = useMemo<SessionValue>(
    () => ({
      status, token, user, pets, pet, selectPet, signIn, signUp, signOut: clear, signOutEverywhere,
      changePassword, setUser: setUserState, refreshMe, savePet, removePet,
    }),
    [status, token, user, pets, pet, selectPet, signIn, signUp, clear, signOutEverywhere, changePassword, refreshMe, savePet, removePet],
  );

  return (
    <SessionContext.Provider value={value}>
      <RealtimeProvider>{children}</RealtimeProvider>
    </SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>.');
  return value;
}

// =====================================================================
// Realtime
// =====================================================================

type EventName = keyof ServerEvents;
type Payload<E extends EventName> = Parameters<ServerEvents[E]>[0];
type Listener = (payload: unknown) => void;

type RealtimeValue = {
  connected: boolean;
  unreadNotifications: number;
  cartCount: number;
  setUnreadNotifications: (count: number) => void;
  setCartCount: (count: number) => void;
  subscribe: <E extends EventName>(event: E, handler: (payload: Payload<E>) => void) => () => void;
};

const RealtimeContext = createContext<RealtimeValue | null>(null);

function RealtimeProvider({ children }: { children: ReactNode }) {
  const { status, token, user, refreshMe } = useSession();
  const [connected, setConnected] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  const listeners = useRef(new Map<string, Set<Listener>>());

  // Seed counts whenever /me is (re)loaded.
  useEffect(() => {
    setUnreadNotifications(user?.unreadNotifications ?? 0);
    setCartCount(user?.cartCount ?? 0);
  }, [user]);

  const emit = useCallback((event: string, payload: unknown) => {
    listeners.current.get(event)?.forEach((fn) => {
      try {
        fn(payload);
      } catch (error) {
        console.error(`realtime handler for ${event} failed`, error);
      }
    });
  }, []);

  useEffect(() => {
    if (status !== 'ready' || !token) {
      setConnected(false);
      return;
    }
    const socket: RealtimeSocket = connectRealtime(API_BASE_URL, () => token);
    let first = true;
    socket.on('connect', () => {
      setConnected(true);
      // After a reconnect, catch up on anything missed while offline.
      if (!first) refreshMe().catch(() => {});
      first = false;
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('notification', (n) => setUnreadNotifications(n.unread));
    socket.on('cart:updated', (c) => setCartCount(c.count));
    socket.onAny((event: string, payload: unknown) => emit(event, payload));
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [status, token, emit, refreshMe]);

  const subscribe = useCallback(<E extends EventName>(event: E, handler: (payload: Payload<E>) => void) => {
    const set = listeners.current.get(event) ?? new Set<Listener>();
    set.add(handler as Listener);
    listeners.current.set(event, set);
    return () => {
      set.delete(handler as Listener);
    };
  }, []);

  const value = useMemo<RealtimeValue>(
    () => ({ connected, unreadNotifications, cartCount, setUnreadNotifications, setCartCount, subscribe }),
    [connected, unreadNotifications, cartCount, subscribe],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const value = useContext(RealtimeContext);
  if (!value) throw new Error('useRealtime must be used inside <SessionProvider>.');
  return value;
}

/** Run `handler` for every `event` pushed by the server while the component is mounted. */
export function useSocketEvent<E extends EventName>(event: E, handler: (payload: Payload<E>) => void) {
  const { subscribe } = useRealtime();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe(event, (payload) => ref.current(payload)), [event, subscribe]);
}
