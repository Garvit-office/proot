import { io, type Socket } from "socket.io-client";
import type { Booking, ChatMessage, Match, NotificationRecord, Order, PaymentResult } from "./contracts.js";

/** Events the server pushes over Socket.IO. */
export type ServerEvents = {
  /** A new notification for the signed-in user. */
  notification: (payload: NotificationRecord & { unread: number }) => void;
  /** RSVP count or details changed for an event (broadcast). */
  "event:updated": (payload: { id: string; rsvpCount: number; deleted?: boolean }) => void;
  /** Dogs-now count changed at a park (broadcast). */
  "park:presence": (payload: { parkId: string; dogsNow: number }) => void;
  /** Stock / status changed for a listing (broadcast). */
  "product:updated": (payload: { id: string; stock: number; status: string; deleted?: boolean }) => void;
  /** One of the user's orders (as buyer or seller) changed. */
  "order:updated": (payload: Order) => void;
  /** One of the user's bookings (as customer or provider) changed. */
  "booking:updated": (payload: Booking) => void;
  /** A payment for this user was confirmed or failed. */
  "payment:updated": (payload: PaymentResult) => void;
  /** A new mutual hello. */
  "match:new": (payload: Match) => void;
  "match:removed": (payload: { id: string }) => void;
  /** A chat message in one of the user's matches (including their own, for multi-device sync). */
  "message:new": (payload: ChatMessage) => void;
  /** Cart contents changed on another device. */
  "cart:updated": (payload: { count: number }) => void;
};

export type ClientEvents = Record<string, never>;

export type RealtimeSocket = Socket<ServerEvents, ClientEvents>;

/**
 * Open an authenticated Socket.IO connection.
 * `apiBaseUrl` is the same base the REST client uses (e.g. http://localhost:4000/api); the socket
 * lives on the same host at /socket.io.
 */
export function connectRealtime(apiBaseUrl: string, getToken: () => string | null | Promise<string | null>): RealtimeSocket {
  const origin = apiBaseUrl.replace(/\/api\/?$/, "");
  return io(origin, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    auth: async (cb: (data: object) => void) => cb({ token: await getToken() }),
    reconnectionDelayMax: 10_000,
  }) as RealtimeSocket;
}
