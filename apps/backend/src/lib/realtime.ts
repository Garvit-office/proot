import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { ServerEvents } from '@proot/shared';
import { userFromToken } from '../auth.js';
import { corsOriginCheck } from './cors.js';

let io: Server<Record<string, never>, ServerEvents> | null = null;

export function attachRealtime(server: HttpServer) {
  io = new Server(server, { path: '/socket.io', cors: { origin: corsOriginCheck, credentials: false } });

  // Every socket must carry a valid token; it joins a private room for that user.
  io.use((socket, next) => {
    const token = (socket.handshake.auth as { token?: string })?.token;
    if (!token) return next(new Error('unauthorized'));
    userFromToken(token)
      .then((user) => {
        if (!user) return next(new Error('unauthorized'));
        socket.data.userId = user.id;
        next();
      })
      .catch(() => next(new Error('unauthorized')));
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);
  });
  return io;
}

type EventName = keyof ServerEvents;
type Payload<E extends EventName> = Parameters<ServerEvents[E]>[0];

/** Send to every open connection of the given users. */
export function emitToUsers<E extends EventName>(userIds: (string | null | undefined)[], event: E, payload: Payload<E>) {
  if (!io) return;
  const rooms = [...new Set(userIds.filter(Boolean) as string[])].map((id) => `user:${id}`);
  if (rooms.length) (io.to(rooms) as any).emit(event, payload);
}

/** Send to everyone signed in (public counters: RSVPs, park presence, stock). */
export function broadcast<E extends EventName>(event: E, payload: Payload<E>) {
  (io as any)?.emit(event, payload);
}

/** Force-disconnect a user's sockets (deactivation, sign out everywhere). */
export function disconnectUser(userId: string) {
  io?.in(`user:${userId}`).disconnectSockets(true);
}
