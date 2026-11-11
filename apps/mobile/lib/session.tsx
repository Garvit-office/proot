import { ApiRequestError, createApiClient, type MeResponse, type PetInput, type PetRecord } from "@proot/shared";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { readDeviceLocation } from "@/lib/location";

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

// The token lives in memory once loaded so every request doesn't hit the keychain.
let currentToken: string | null | undefined;
async function getToken() {
  if (currentToken === undefined) currentToken = await storage.get(TOKEN_KEY);
  return currentToken;
}
async function setToken(token: string | null) {
  currentToken = token;
  await storage.set(TOKEN_KEY, token);
}

// Set by the provider so any 401 from any screen signs the user out.
let unauthorizedHandler: (() => void) | null = null;

export const api = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api",
  getToken,
  onUnauthorized: () => unauthorizedHandler?.(),
});

export { getToken };

type Status = "loading" | "guest" | "ready";

type SessionValue = {
  status: Status;
  user: MeResponse | null;
  /** Replace the cached user (e.g. after a profile update). */
  setUser: (user: MeResponse) => void;
  refreshUser: () => Promise<void>;
  pets: PetRecord[];
  pet: PetRecord | null;
  onboarded: boolean;
  selectPet: (id: string) => void;
  reloadPets: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Store a freshly issued token (after a password change). */
  replaceToken: (token: string) => Promise<void>;
  savePet: (input: PetInput, id?: string) => Promise<PetRecord>;
  removePet: (id: string) => Promise<void>;
  /** Ask for location permission and send the device position to the API. */
  shareLocation: () => Promise<MeResponse>;
  profileOpen: boolean;
  setProfileOpen: (open: boolean) => void;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUserState] = useState<MeResponse | null>(null);
  const [pets, setPets] = useState<PetRecord[]>([]);
  const [activePetId, setActivePetId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const askedLocation = useRef(false);

  const load = useCallback(async () => {
    const [me, list, active] = await Promise.all([api.me(), api.listPets(), storage.get(ACTIVE_PET_KEY)]);
    setUserState(me);
    setPets(list);
    setActivePetId((current) => current ?? active);
    setStatus("ready");
  }, []);

  const signOut = useCallback(async () => {
    await setToken(null);
    askedLocation.current = false;
    setProfileOpen(false);
    setUserState(null);
    setPets([]);
    setActivePetId(null);
    setStatus("guest");
  }, []);

  useEffect(() => {
    unauthorizedHandler = () => {
      signOut();
    };
    return () => {
      unauthorizedHandler = null;
    };
  }, [signOut]);

  useEffect(() => {
    getToken()
      .then((token) => {
        if (!token) return setStatus("guest");
        return load();
      })
      .catch((error) => {
        if (error instanceof ApiRequestError && error.status === 401) signOut();
        else setStatus("guest");
      });
  }, [load, signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { token } = await api.login({ email, password });
    await setToken(token);
    await load();
  }, [load]);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { token } = await api.register({ name, email, password });
    await setToken(token);
    await load();
  }, [load]);

  const replaceToken = useCallback(async (token: string) => {
    await setToken(token);
  }, []);

  const refreshUser = useCallback(async () => {
    setUserState(await api.me());
  }, []);

  const reloadPets = useCallback(async () => {
    setPets(await api.listPets());
  }, []);

  const selectPet = useCallback((id: string) => {
    setActivePetId(id);
    storage.set(ACTIVE_PET_KEY, id);
  }, []);

  const savePet = useCallback(async (input: PetInput, id?: string) => {
    const saved = id ? await api.updatePet(id, input) : await api.createPet(input);
    setPets((list) => (id ? list.map((p) => (p.id === id ? saved : p)) : [...list, saved]));
    setUserState((current) => (current ? { ...current, onboarded: true } : current));
    selectPet(saved.id);
    return saved;
  }, [selectPet]);

  const removePet = useCallback(async (id: string) => {
    await api.deletePet(id);
    setPets((list) => list.filter((p) => p.id !== id));
  }, []);

  const shareLocation = useCallback(async () => {
    const position = await readDeviceLocation();
    const me = await api.updateLocation(position);
    setUserState(me);
    return me;
  }, []);

  // Once per sign-in, quietly refresh the stored location (permission is asked the first time).
  useEffect(() => {
    if (status !== "ready" || askedLocation.current) return;
    askedLocation.current = true;
    shareLocation().catch(() => {
      // Denied or unavailable: distance sorting just falls back to the saved location (or none).
    });
  }, [status, shareLocation]);

  const pet = pets.find((p) => p.id === activePetId) ?? pets[0] ?? null;
  const onboarded = status === "ready" && pets.length > 0;
  const setUser = useCallback((next: MeResponse) => setUserState(next), []);

  const value = useMemo<SessionValue>(
    () => ({
      status, user, setUser, refreshUser, pets, pet, onboarded, selectPet, reloadPets, signIn, signUp, signOut,
      replaceToken, savePet, removePet, shareLocation, profileOpen, setProfileOpen,
    }),
    [status, user, setUser, refreshUser, pets, pet, onboarded, selectPet, reloadPets, signIn, signUp, signOut, replaceToken, savePet, removePet, shareLocation, profileOpen],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>.");
  return value;
}

/** The signed-in user's coordinates, if known, for distance queries. */
export function useNear() {
  const { user } = useSession();
  const lat = user?.lat ?? null;
  const lng = user?.lng ?? null;
  return useMemo(() => (lat != null && lng != null ? { lat, lng } : undefined), [lat, lng]);
}
