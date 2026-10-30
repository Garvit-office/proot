import { ApiRequestError, createApiClient, type MeResponse, type PetProfileInput, type PetRecord } from "@proot/shared";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";

const TOKEN_KEY = "proot.token";
const ACTIVE_PET_KEY = "proot.activePet";

// SecureStore is native-only; the Expo web build falls back to localStorage.
const storage = {
  async get(key: string) {
    if (Platform.OS === "web") {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string | null) {
    if (Platform.OS === "web") {
      try {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
      } catch {}
      return;
    }
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  },
};

export const api = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api",
  getToken: () => storage.get(TOKEN_KEY),
});

type Status = "loading" | "guest" | "ready";

type SessionValue = {
  status: Status;
  user: MeResponse | null;
  pets: PetRecord[];
  pet: PetRecord | null;
  onboarded: boolean;
  selectPet: (id: string) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  savePet: (input: PetProfileInput, id?: string) => Promise<PetRecord>;
  profileOpen: boolean;
  setProfileOpen: (open: boolean) => void;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<MeResponse | null>(null);
  const [pets, setPets] = useState<PetRecord[]>([]);
  const [activePetId, setActivePetId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const load = useCallback(async (token: string) => {
    const [me, list, active] = await Promise.all([api.me(token), api.listPets(token), storage.get(ACTIVE_PET_KEY)]);
    setUser(me);
    setPets(list);
    setActivePetId((current) => current ?? active);
    setStatus("ready");
  }, []);

  const signOut = useCallback(async () => {
    await storage.set(TOKEN_KEY, null);
    setProfileOpen(false);
    setUser(null);
    setPets([]);
    setStatus("guest");
  }, []);

  useEffect(() => {
    storage
      .get(TOKEN_KEY)
      .then((token) => {
        if (!token) return setStatus("guest");
        return load(token);
      })
      .catch((error) => {
        if (error instanceof ApiRequestError && error.status === 401) signOut();
        else setStatus("guest");
      });
  }, [load, signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { token } = await api.login({ email, password });
    await storage.set(TOKEN_KEY, token);
    await load(token);
  }, [load]);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { token } = await api.register({ name, email, password });
    await storage.set(TOKEN_KEY, token);
    await load(token);
  }, [load]);

  const selectPet = useCallback((id: string) => {
    setActivePetId(id);
    storage.set(ACTIVE_PET_KEY, id);
  }, []);

  const savePet = useCallback(async (input: PetProfileInput, id?: string) => {
    const saved = id ? await api.updatePet(id, input) : await api.createPet(input);
    setPets((list) => (id ? list.map((p) => (p.id === id ? saved : p)) : [...list, saved]));
    setUser((current) => (current ? { ...current, onboarded: true } : current));
    selectPet(saved.id);
    return saved;
  }, [selectPet]);

  const pet = pets.find((p) => p.id === activePetId) ?? pets[0] ?? null;
  const onboarded = status === "ready" && pets.length > 0;

  const value = useMemo<SessionValue>(
    () => ({ status, user, pets, pet, onboarded, selectPet, signIn, signUp, signOut, savePet, profileOpen, setProfileOpen }),
    [status, user, pets, pet, onboarded, selectPet, signIn, signUp, signOut, savePet, profileOpen],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>.");
  return value;
}
