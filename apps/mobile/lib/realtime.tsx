import { connectRealtime, type RealtimeSocket, type ServerEvents } from "@proot/shared";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { api, getToken, useSession } from "@/lib/session";

type RealtimeValue = {
  socket: RealtimeSocket | null;
  connected: boolean;
  unreadNotifications: number;
  cartCount: number;
  setUnreadNotifications: (n: number) => void;
  setCartCount: (n: number) => void;
};

const RealtimeContext = createContext<RealtimeValue | null>(null);

/** Holds one Socket.IO connection while signed in, plus live badge counts. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { status, user } = useSession();
  const userId = status === "ready" ? user?.id ?? null : null;
  const [socket, setSocket] = useState<RealtimeSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [cartCount, setCartCount] = useState(0);

  // Seed the counters from /me whenever it is (re)loaded.
  useEffect(() => {
    if (!user) return;
    setUnreadNotifications(user.unreadNotifications);
    setCartCount(user.cartCount);
  }, [user]);

  useEffect(() => {
    if (!userId) return;
    const s = connectRealtime(api.baseUrl, getToken);
    setSocket(s);
    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    s.on("notification", (n) => setUnreadNotifications(n.unread));
    s.on("cart:updated", (p) => setCartCount(p.count));
    // Resync counters after reconnecting, since events may have been missed.
    s.io.on("reconnect", () => {
      api.me().then((me) => {
        setUnreadNotifications(me.unreadNotifications);
        setCartCount(me.cartCount);
      }).catch(() => {});
    });
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && !s.connected) s.connect();
    });
    return () => {
      sub.remove();
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [userId]);

  const value = useMemo(
    () => ({ socket, connected, unreadNotifications, cartCount, setUnreadNotifications, setCartCount }),
    [socket, connected, unreadNotifications, cartCount],
  );
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const value = useContext(RealtimeContext);
  if (!value) throw new Error("useRealtime must be used inside <RealtimeProvider>.");
  return value;
}

/** Subscribe to a server event for as long as the calling component is mounted. */
export function useRealtimeEvent<E extends keyof ServerEvents>(event: E, handler: ServerEvents[E]) {
  const { socket } = useRealtime();
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!socket) return;
    const listener = ((...args: unknown[]) => (ref.current as (...a: unknown[]) => void)(...args)) as ServerEvents[E];
    // socket.io's typed overloads don't narrow over a generic event name.
    (socket as unknown as { on: (e: string, l: unknown) => void }).on(event, listener);
    return () => {
      (socket as unknown as { off: (e: string, l: unknown) => void }).off(event, listener);
    };
  }, [socket, event]);
}
