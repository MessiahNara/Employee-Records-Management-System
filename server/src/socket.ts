import { Server as SocketIOServer } from 'socket.io';
import { Server } from 'http';
import { Server as HttpsServer } from 'https';

let io: SocketIOServer | null = null;

export const initSocket = (server: Server | HttpsServer) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
    }
  });

  io.on('connection', (socket) => {
    console.log('[socket] Client connected:', socket.id);
    socket.on('disconnect', () => {
      console.log('[socket] Client disconnected:', socket.id);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    console.warn('[socket] io not initialized yet');
    return null;
  }
  return io;
};
