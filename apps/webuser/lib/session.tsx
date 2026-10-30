'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiRequestError, createApiClient, type MeResponse, type PetProfileInput, type PetRecord } from '@proot/shared';

const TOKEN_KEY = 'proot.token';
const ACTIVE_PET_KEY = 'proot.activePet';

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

export const api = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api',
  getToken: () => readStorage(TOKEN_KEY),
});

type Status = 'loading' | 'guest' | 'ready';

type SessionValue = {
  status: Status;
  user: MeResponse | null;
  pets: PetRecord[];
  pet: PetRecord | null;
  selectPet: (id: string) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => void;
  savePet: (input: PetProfileInput, id?: string) => Promise<PetRecord>;
  removePet: (id: string) => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<MeResponse | null>(null);
  const [pets, setPets] = useState<PetRecord[]>([]);
  const [activePetId, setActivePetId] = useState<string | null>(null);

  const clear = useCallback(() => {
    writeStorage(TOKEN_KEY, null);
    setUser(null);
    setPets([]);
    setStatus('guest');
  }, []);

  const load = useCallback(async (token: string) => {
    const [me, list] = await Promise.all([api.me(token), api.listPets(token)]);
    setUser(me);
    setPets(list);
    setActivePetId((current) => current ?? readStorage(ACTIVE_PET_KEY));
    setStatus('ready');
  }, []);

  useEffect(() => {
    const token = readStorage(TOKEN_KEY);
    if (!token) {
      setStatus('guest');
      return;
    }
    load(token).catch((error) => {
      // Keep the token on network errors so a flaky connection doesn't sign people out.
      if (error instanceof ApiRequestError && error.status === 401) clear();
      else setStatus('guest');
    });
  }, [load, clear]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { token } = await api.login({ email, password });
    writeStorage(TOKEN_KEY, token);
    await load(token);
  }, [load]);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { token } = await api.register({ name, email, password });
    writeStorage(TOKEN_KEY, token);
    await load(token);
  }, [load]);

  const selectPet = useCallback((id: string) => {
    setActivePetId(id);
    writeStorage(ACTIVE_PET_KEY, id);
  }, []);

  const savePet = useCallback(async (input: PetProfileInput, id?: string) => {
    const saved = id ? await api.updatePet(id, input) : await api.createPet(input);
    setPets((list) => (id ? list.map((p) => (p.id === id ? saved : p)) : [...list, saved]));
    setUser((current) => (current ? { ...current, onboarded: true } : current));
    selectPet(saved.id);
    return saved;
  }, [selectPet]);

  const removePet = useCallback(async (id: string) => {
    await api.deletePet(id);
    setPets((list) => {
      const next = list.filter((p) => p.id !== id);
      setUser((current) => (current ? { ...current, onboarded: next.length > 0 } : current));
      return next;
    });
  }, []);

  const pet = pets.find((p) => p.id === activePetId) ?? pets[0] ?? null;

  const value = useMemo<SessionValue>(
    () => ({ status, user, pets, pet, selectPet, signIn, signUp, signOut: clear, savePet, removePet }),
    [status, user, pets, pet, selectPet, signIn, signUp, clear, savePet, removePet],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>.');
  return value;
}

/** The signed-in dog's name, falling back to the demo pet for guests. */
export function usePetName(fallback: string) {
  return useSession().pet?.name ?? fallback;
}
