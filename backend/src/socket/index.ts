import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { registerAuctionHandlers } from './auction';
import { registerDraftHandlers } from './draft';

export function initSocket(io: Server) {
  // Auth middleware for every socket connection
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      next(new Error('Authentication required'));
      return;
    }
    try {
      const payload = jwt.verify(token, config.jwtSecret) as { userId: string; username: string };
      (socket as unknown as Record<string, unknown>).userId = payload.userId;
      (socket as unknown as Record<string, unknown>).username = payload.username;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = (socket as unknown as { userId: string }).userId;
    const username = (socket as unknown as { username: string }).username;
    console.log(`[Socket] ${username} (${userId}) connected`);

    registerAuctionHandlers(io, socket);
    registerDraftHandlers(io, socket);

    socket.on('disconnect', () => {
      console.log(`[Socket] ${username} disconnected`);
    });
  });
}
