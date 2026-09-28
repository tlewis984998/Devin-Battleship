import { io, Socket } from 'socket.io-client';
import type { ClientToServer, ServerToClient } from '@battleship/shared';

const url: string | undefined =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ??
  (import.meta.env.DEV ? 'http://localhost:3001' : undefined);

export type AppSocket = Socket<ServerToClient, ClientToServer>;
export const socket: AppSocket = url ? io(url) : io();
export const TOKEN_KEY = 'battleship-token';
